/* eslint-disable no-await-in-loop -- Native builds run serially. */
import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import fc from "fast-check";
import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
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
const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);
const skip = nativeTarget == null ? "requires a supported native host" : false;

async function observe(source: string, stdout: string): Promise<void> {
  const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
  process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
  try {
    for (const test262Host of [false, true]) {
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          { source, sourceId: "generated-with-boxing.js" },
          { specialization, test262Host, observeSpecialization: true },
        );
        assert.deepEqual(compiled.diagnostics, []);
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
            assertMatchingObservations([
              { exitStatus: 0, stderr: "", stdout },
              {
                exitStatus: native.exitStatus,
                stderr: native.stderr,
                stdout: native.stdout,
              },
            ]);
            assert.ok(native.counters!.collections > 0);
          },
        );
      }
    }
  } finally {
    if (saved == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    else process.env.OSEO_GC_EVERY_SAFEPOINT = saved;
  }
}

// Model: ToObject creates one persistent wrapper. HasBinding selects its
// inherited probe unless unscopables blocks it, then the lexical cell wins.
// A strict inherited method exposes the receiver without another boxing step.
const value = fc.oneof(
  fc.record({
    constructor: fc.constant("Number"),
    value: fc.integer({ min: -20, max: 20 }),
  }),
  fc.record({ constructor: fc.constant("Boolean"), value: fc.boolean() }),
  fc.record({
    constructor: fc.constant("String"),
    value: fc.string({ unit: "grapheme", maxLength: 5 }),
  }),
);

test("generated primitive with binding objects", { skip }, async () => {
  await assertAsyncProperty(
    "primitive with boxing",
    fc.asyncProperty(
      value,
      fc.boolean(),
      fc.integer({ min: -9, max: 9 }),
      async (testCase, blocked, probe) => {
        const literal = JSON.stringify(testCase.value);
        const constructor = testCase.constructor;
        const source = `
${constructor}.prototype.box = function () { 'use strict'; return this; };
${constructor}.prototype.probe = ${probe};
${constructor}.prototype[Symbol.unscopables] = { probe: ${blocked} };
/** @param {{probe: number}} value */
function enter(value) {
  var probe = 'lexical';
  with (value) {
    console.log(probe);
    return [function () { return box(); }, function () { return probe; }];
  }
}
var closures = enter(${literal});
var wrapper = closures[0]();
wrapper.probe = 42;
console.log(wrapper === closures[0](),
  Object.is(wrapper.valueOf(), ${literal}));
console.log(closures[1]());
`;
        await observe(
          source,
          `${blocked ? "lexical" : probe}\ntrue true\n` +
            `${blocked ? "lexical" : 42}\n`,
        );
      },
    ),
    {
      seed: 0x6000_9300,
      numRuns: 8,
      timeLimitMilliseconds: 180_000,
      domain:
        "Number/Boolean/String; inherited hit, blocked fallback; " +
        "escaped closure wrapper identity and mutation; false object hint",
      profile: "M5 ordinary and host Script; both policies; forced GC",
      sizeLimit: "integers -20..20; booleans; strings of at most 5 graphemes",
    },
  );
});
