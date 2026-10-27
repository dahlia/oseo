/* eslint-disable no-await-in-loop -- Native observations are isolated. */
import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  printMir,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import { hostScriptReferences } from "../native/host-script-reference.ts";
import { nativeToolchain } from "../native-toolchain.ts";
import { hostScriptModel as expected } from "../native/host-script-model.ts";
import type { ScriptCommand as Command } from "../native/host-script-model.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

const command: fc.Arbitrary<Command> = fc.record({
  kind: fc.constantFrom(
    "const",
    "delete",
    "function",
    "let",
    "read",
    "throw",
    "var",
    "write",
  ),
  name: fc.constantFrom("a", "b"),
  realm: fc.constantFrom(0, 1),
  value: fc.integer({ min: -20, max: 20 }),
});

function script(entry: Command): string {
  const { name, value } = entry;
  switch (entry.kind) {
    case "function":
      return `function ${name}(){ return ${value}; }`;
    case "write":
      return `${name} = ${value};`;
    case "delete":
      return `delete ${name};`;
    case "read":
      return `${name};`;
    case "throw":
      return `let ${name} = ${value}; throw ${value};`;
    default:
      return `${entry.kind} ${name} = ${value};`;
  }
}

function print(commands: readonly Command[]): string {
  return (
    `const other = $262.createRealm();\n` +
    commands
      .map(
        (entry) => `
try {
  const value = ${entry.realm === 0 ? "$262" : "other"}.evalScript(
    ${JSON.stringify(script(entry))});
  console.log(typeof value === 'function' ? 'function:' + value() : value);
} catch (error) {
  console.log(typeof error === 'number' ? 'thrown:' + error :
    'error:' + error.name);
}
`,
      )
      .join("") +
    `
/** @param {number} left @param {number} right */
function add(left, right) { return left + right; }
console.log(add('x', 'y'));
`
  );
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);
const skip = nativeTarget == null ? "requires a supported native host" : false;

async function observe(
  source: string,
  stdout: string,
  denoStdout = stdout,
): Promise<void> {
  const observation = { exitStatus: 0, stdout, stderr: "" };
  const references = await hostScriptReferences(host, source);
  assertMatchingObservations([observation, references[0]!]);
  // Deno vm still rejects a lexical shadow of an explicit var name even
  // when that existing property is configurable. Native uses the 16th-
  // edition model; only this reference observer uses the legacy check.
  assertMatchingObservations([
    { ...observation, stdout: denoStdout },
    references[1]!,
  ]);
  const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
  process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
  try {
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source, sourceId: "generated-host-script.js" },
        { specialization, test262Host: true, observeSpecialization: true },
      );
      assert.deepEqual(compiled.diagnostics, []);
      if (specialization === "enabled")
        assert.match(printMir(compiled.mir!), /guard-smi/u);
      await withNativeFixture(
        {
          backend: cBackend,
          host,
          input: compiled.mir!,
          operation: "execute",
          runtime: cRuntimeProvider,
          target: nativeTarget!,
          toolchain: nativeToolchain,
        },
        (native) => {
          assertMatchingObservations([observation, native]);
          assert.ok(native.counters!.collections > 0);
          if (specialization === "enabled")
            assert.ok(native.counters!.guardMisses > 0);
        },
      );
    }
  } finally {
    if (saved == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    else process.env.OSEO_GC_EVERY_SAFEPOINT = saved;
  }
}

test(
  "generated successive Scripts match a two-realm declaration model",
  { skip },
  async () => {
    await assertAsyncProperty(
      "persistent declarations and references",
      fc.asyncProperty(
        fc.array(command, { minLength: 1, maxLength: 10 }),
        async (commands) =>
          await observe(
            print(commands),
            expected(commands),
            expected(commands, true),
          ),
      ),
      {
        seed: 0x6000_8d00,
        numRuns: 12,
        timeLimitMilliseconds: 240_000,
        domain:
          "two realms; let/const/var/function, read/write/delete and " +
          "throwing bodies over two names; lexical/property collisions",
        profile: "M5 ahead-of-time host Scripts",
        sizeLimit: "one to ten commands, integer values -20 through 20",
      },
    );
  },
);

test(
  "generated malformed Scripts throw at invocation in their own realm",
  { skip },
  async () => {
    await assertAsyncProperty(
      "malformed Script parse errors",
      fc.asyncProperty(
        fc.constantFrom(
          "let x = ;",
          "const x;",
          "function () {}",
          "return 1;",
          '"use strict"; var eval;',
        ),
        fc.boolean(),
        async (source, foreign) => {
          const program = `
const other = $262.createRealm();
try { ${foreign ? "other" : "$262"}.evalScript(${JSON.stringify(source)}); }
catch (error) { console.log(error instanceof
  ${foreign ? "other.global." : ""}SyntaxError); }
/** @param {number} left @param {number} right */
function add(left, right) { return left + right; }
console.log(add('x', 'y'));
`;
          await observe(program, "true\nxy\n");
        },
      ),
      {
        seed: 0x6000_8d01,
        numRuns: 12,
        timeLimitMilliseconds: 240_000,
        domain: "five malformed Script grammar classes in either realm",
        profile: "M5 ahead-of-time host Scripts",
        sizeLimit: "one malformed literal Script, one created realm",
      },
    );
  },
);
