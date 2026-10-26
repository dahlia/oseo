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
import {
  annexbIntegrityExpected,
  annexbIntegrityProgram,
  annexbIntegrityScenarios,
} from "../helpers/annexb-integrity.ts";
import {
  annexbForInExpected,
  annexbForInProgram,
  annexbForInScenarios,
} from "../helpers/annexb-for-in.ts";

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
let userStore = "none";
Object.defineProperty(Object.prototype, "__proto__", {
  set: function (value) {
    "use strict";
    userStore = typeof this + ":" + value;
  },
  configurable: true,
});
(function (value) {
  "use strict";
  value.__proto__ = ${input.value + 4};
})(1);
console.log("user intrinsic", userStore);
console.log("deleted intrinsic", delete Object.prototype.__proto__,
  read({}), read(Object.prototype));
const written = {};
written.__proto__ = ${input.value + 5};
console.log("after delete own", written.__proto__,
  Object.hasOwn(written, "__proto__"));
for (const primitive of [1, true, "s", 1n, Symbol("s")]) {
  let refused = false;
  try {
    (function (value) {
      "use strict";
      value.__proto__ = ${input.value + 6};
    })(primitive);
  } catch (error) { refused = error instanceof TypeError; }
  console.log("after delete", typeof primitive, refused);
}
console.log("after delete reflect",
  Reflect.set({}, "__proto__", ${input.value + 6}, 1));
Object.defineProperty(Object.prototype, "__proto__", {
  value: ${input.value + 7}, configurable: false,
});
console.log("failed intrinsic delete",
  Reflect.deleteProperty(Object.prototype, "__proto__"),
  read(Object.prototype));
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
    `user intrinsic number:${input.value + 4}`,
    "deleted intrinsic true undefined undefined",
    `after delete own ${input.value + 5} true`,
    "after delete number true",
    "after delete boolean true",
    "after delete string true",
    "after delete bigint true",
    "after delete symbol true",
    "after delete reflect false",
    `failed intrinsic delete false ${input.value + 7}`,
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
        // The old program always executes unchanged above. A fresh program
        // avoids freezing its realm, keeps the old arbitrary/replay exact,
        // and derives a valid integrity state directly from the same integer.
        const scenario =
          annexbIntegrityScenarios[
            ((input.value % annexbIntegrityScenarios.length) +
              annexbIntegrityScenarios.length) %
              annexbIntegrityScenarios.length
          ];
        assert.ok(scenario != null);
        const integrity = { scenario, value: input.value };
        const integritySource = annexbIntegrityProgram(integrity);
        const integrityOracle = {
          exitStatus: 0,
          stderr: "",
          stdout: annexbIntegrityExpected(integrity),
        };
        const integrityDirectory = await host.makeTemporaryDirectory(
          "oseo-integrity-reference-",
        );
        try {
          const path = `${integrityDirectory}/case.js`;
          // References execute the same Script goal as the compiler. The
          // indirect eval wrapper is reference-only, never compiled by Oseo.
          await host.writeTextFile(
            path,
            `(0, eval)(${JSON.stringify(integritySource)});\n`,
          );
          assertMatchingObservations([
            integrityOracle,
            await host.run({
              command: "Deno" in globalThis ? "node" : process.execPath,
              args: [path],
              cwd: integrityDirectory,
            }),
            await host.run({
              command: "Deno" in globalThis ? process.execPath : "deno",
              args: ["run", "--quiet", path],
              cwd: integrityDirectory,
            }),
          ]);
        } finally {
          await host.remove(integrityDirectory);
        }
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            {
              source: integritySource,
              sourceId: `generated-integrity-${scenario}.js`,
            },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
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
              (observed) => {
                assertMatchingObservations([integrityOracle, observed]);
                assert.ok((observed.counters?.collections ?? 0) > 0);
              },
            );
          } finally {
            delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          }
        }
        // Keep both earlier programs and their oracles exact. This third,
        // isolated Script derives one for-in state from the same old integer.
        const forInScenario =
          annexbForInScenarios[
            ((input.value % annexbForInScenarios.length) +
              annexbForInScenarios.length) %
              annexbForInScenarios.length
          ];
        assert.ok(forInScenario != null);
        const forInInput = { scenario: forInScenario, value: input.value };
        const forInSource = annexbForInProgram(forInInput);
        const forInOracle = {
          exitStatus: 0,
          stderr: "",
          stdout: annexbForInExpected(forInInput),
        };
        const forInDirectory = await host.makeTemporaryDirectory(
          "oseo-forin-reference-",
        );
        try {
          const path = `${forInDirectory}/case.js`;
          await host.writeTextFile(
            path,
            `(0, eval)(${JSON.stringify(forInSource)});\n`,
          );
          assertMatchingObservations([
            forInOracle,
            await host.run({
              command: "Deno" in globalThis ? "node" : process.execPath,
              args: [path],
              cwd: forInDirectory,
            }),
            await host.run({
              command: "Deno" in globalThis ? process.execPath : "deno",
              args: ["run", "--quiet", path],
              cwd: forInDirectory,
            }),
          ]);
        } finally {
          await host.remove(forInDirectory);
        }
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            {
              source: forInSource,
              sourceId: `generated-for-in-${forInScenario}.js`,
            },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
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
              (observed) => {
                assertMatchingObservations([forInOracle, observed]);
                assert.ok((observed.counters?.collections ?? 0) > 0);
              },
            );
          } finally {
            if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
            else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
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
        sizeLimit:
          "original observations/deletion and integrity program, " +
          "plus one fresh for-in program",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
