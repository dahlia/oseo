/* eslint-disable no-await-in-loop -- Native observations run serially. */
/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";

import {
  processHost,
  assertMatchingObservations,
  processReferences,
  runProcessProgram,
} from "../preview-process-support.ts";

import { targetForExecutionHost } from "../../packages/compiler/src/index.ts";

const nativeTarget = targetForExecutionHost(
  processHost.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const { assertAsyncProperty, propertySize } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

const large = propertySize() === "large";
const generated = fc.record({
  input: fc.uint8Array({ maxLength: large ? 512 : 64 }),
  args: fc.array(fc.constantFrom("", "α", "한글", "💩", "--arg", "a b"), {
    maxLength: large ? 12 : 5,
  }),
  code: fc.integer({ min: -512, max: 512 }),
  numericString: fc.boolean(),
  text: fc.boolean(),
});

test(
  "process bytes, argv, and exit match independent models",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    await assertAsyncProperty(
      "ADR 0038 process byte and text boundaries",
      fc.asyncProperty(generated, async (value) => {
        const code = value.numericString
          ? JSON.stringify(String(value.code))
          : String(value.code);
        const source = `import {readFileSync} from "node:fs";
function add(a: number, b: number) { return a + b; }
console.log(add("a", 2));
console.log(JSON.stringify(process.argv.slice(2)));
const input = readFileSync(0${value.text ? ', "utf8"' : ""});
${
  value.text
    ? "console.log(JSON.stringify(input));"
    : "process.stdout.write(input);"
}
process.stderr.write("err💩\\ud800");
process.exitCode = ${code};`;
        const execution = { input: value.input, args: value.args };
        const native = await runProcessProgram(
          processHost,
          source,
          execution,
          true,
        );
        const references = await processReferences(
          processHost,
          source,
          execution,
        );
        assertMatchingObservations([...native, ...references]);
        const encoder = new TextEncoder();
        const prefix = encoder.encode(`a2\n${JSON.stringify(value.args)}\n`);
        const suffix = value.text
          ? encoder.encode(
              JSON.stringify(
                new TextDecoder("utf-8", { ignoreBOM: true }).decode(
                  value.input,
                ),
              ) + "\n",
            )
          : value.input;
        const output = new Uint8Array(prefix.length + suffix.length);
        output.set(prefix);
        output.set(suffix, prefix.length);
        for (const observed of native) {
          assert.deepEqual(observed.stdoutBytes, output);
          assert.deepEqual(observed.stderrBytes, encoder.encode("err💩\ud800"));
          assert.equal(observed.exitStatus, ((value.code % 256) + 256) % 256);
        }
      }),
      {
        profile: "Preview process input and exit",
        domain:
          "arbitrary input bytes, UTF-8 text or raw output, Unicode " +
          "and empty argv entries, signed exit codes and numeric strings",
        seed: 0x6000_b000,
        numRuns: 10,
        sizeLimit:
          "64 input bytes and five argv entries; large tier uses " +
          "512 bytes and twelve entries",
        timeLimitMilliseconds: 600_000,
        context: [
          "both specialization policies",
          "GC at every safepoint",
          "false numeric hint transfers to the generic addition path",
        ],
      },
    );
  },
);
