/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
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
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/** Every generated program retains all ordinary lookup boundary classes. */
interface ProtoCase {
  readonly hint: "absent" | "false" | "truthful";
  readonly value: number;
}

const cases: fc.Arbitrary<ProtoCase> = fc.record({
  hint: fc.constantFrom("absent", "false", "truthful"),
  value: fc.integer({ min: -20, max: 20 }),
});
const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function sourceFor(input: ProtoCase): string {
  const hint =
    input.hint === "absent"
      ? ""
      : `/** @param {${input.hint === "false" ? "number" : "object"}} value */`;
  return `
${hint}
function read(value) { return value.__proto__; }
const own = { ["__proto__"]: ${input.value} };
console.log("own", read(own));
delete own.__proto__;
Object.defineProperty(own, "__proto__", {
  get: function () { return ${input.value + 1}; }, configurable: true,
});
console.log("getter", read(own));
const parent = { ["__proto__"]: ${input.value + 2} };
console.log("inherited", read(Object.create(parent)));
console.log("null", read(Object.create(null)));
const proxy = new Proxy({}, {
  get: function (target, key) { return ${input.value + 3}; },
});
console.log("proxy", read(proxy));
console.log("near", {}.__proto, {}.__proto___);
const key = Symbol("__proto__");
console.log("symbol", {}[key]);
try { read(null); } catch (error) {
  console.log("nullish", error instanceof TypeError);
}
const abrupt = { get __proto__() { throw new RangeError("owned"); } };
try { read(abrupt); } catch (error) {
  console.log("abrupt", error instanceof RangeError, error.message);
}
`;
}

function expected(input: ProtoCase): string {
  return [
    `own ${input.value}`,
    `getter ${input.value + 1}`,
    `inherited ${input.value + 2}`,
    "null undefined",
    `proxy ${input.value + 3}`,
    "near undefined undefined",
    "symbol undefined",
    "nullish true",
    "abrupt true owned",
    "",
  ].join("\n");
}

test(
  "generated ordinary __proto__ reads preserve the core lookup model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "ordinary keys named __proto__ stay outside the Annex B rejection",
      fc.asyncProperty(cases, async (input) => {
        const source = sourceFor(input);
        const oracle = { exitStatus: 0, stderr: "", stdout: expected(input) };
        const directory = await host.makeTemporaryDirectory("oseo-proto-ref-");
        try {
          const path = `${directory}/case.js`;
          await host.writeTextFile(path, source);
          assertMatchingObservations([
            oracle,
            await host.run({
              command: process.execPath,
              args: [path],
              cwd: directory,
            }),
            await host.run({
              command: "deno",
              args: ["run", "--quiet", path],
              cwd: directory,
            }),
          ]);
        } finally {
          await host.remove(directory);
        }
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-proto.js" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /property-get generic/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:object|shape)/u);
          }
          process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
          try {
            await withNativeFixture(
              {
                backend: cBackend,
                host,
                input: compiled.mir,
                operation: "execute",
                runtime: cRuntimeProvider,
                target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
                toolchain: nativeToolchain,
              },
              (native) => {
                assertMatchingObservations([oracle, native]);
                assert.ok((native.counters?.collections ?? 0) > 0);
                if (specialization === "enabled") {
                  assert.ok((native.counters?.guardMisses ?? 0) > 0);
                }
              },
            );
          } finally {
            delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          }
        }
      }),
      {
        context: [`target=${nativeTarget?.name ?? "unsupported"}`],
        domain:
          "bounded integers and absent, truthful, or false hints; " +
          "own data/getters, inherited data, null prototypes, proxies, " +
          "near-miss keys, symbols, nullish and abrupt receivers",
        numRuns: 12,
        profile: "M5 Annex B prototype accessor boundary",
        seed: 0x6000_8500,
        sizeLimit: "one data-to-getter mutation and nine bounded observations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
