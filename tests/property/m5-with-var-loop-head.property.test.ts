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
          { source, sourceId: "generated-with-head.js" },
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

type ModelValue = string | number | boolean | null | undefined;

function encode(item: ModelValue): string {
  return item === undefined ? "undefined" : String(item);
}

// Model: the innermost present, unblocked property selects the destination;
// otherwise the function var cell does. Each iteration resolves anew.
const value = fc.oneof(
  fc.integer({ min: -8, max: 8 }),
  fc.constantFrom("text", null, true),
);
test(
  "generated var heads select the first unblocked environment",
  { skip },
  async () => {
    await assertAsyncProperty(
      "with loop destinations",
      fc.asyncProperty(
        fc.array(value, { minLength: 1, maxLength: 3 }),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom("of", "in", "classic"),
        async (values, outerHit, innerHit, blocked, remove, kind) => {
          let cell: ModelValue = "cell";
          let outer: ModelValue = outerHit ? "outer" : undefined;
          let inner: ModelValue = innerHit ? "inner" : undefined;
          let hasInner = innerHit;
          const iterations = kind === "classic" ? values.slice(0, 1) : values;
          for (const [i, item] of iterations.entries()) {
            const assigned = kind === "in" ? `k${String(i)}` : item;
            if (hasInner && !blocked) inner = assigned;
            else if (outerHit) outer = assigned;
            else cell = assigned;
            if (remove && kind !== "classic") {
              hasInner = false;
              inner = undefined;
            }
          }
          const subject =
            kind === "in"
              ? `{${values.map((_, i) => `k${String(i)}:0`).join(",")}}`
              : JSON.stringify(values);
          const loop =
            kind === "classic"
              ? `for (var x = ${JSON.stringify(values[0])}; false;) {}`
              : `for (var x ${kind} ${subject}) {
                  ${remove ? "delete inner.x;" : ""}
                }`;
          const source = `
function run() {
  var x = 'cell';
  const outer = ${outerHit ? "{x:'outer'}" : "{}"};
  const inner = ${innerHit ? "{x:'inner'}" : "{}"};
  inner[Symbol.unscopables] = { x: ${String(blocked)} };
  with (outer) { with (inner) { ${loop} } }
  console.log(x, outer.x, inner.x);
}
run();`;
          await observe(
            source,
            `${encode(cell)} ${encode(outer)} ${encode(inner)}\n`,
          );
        },
      ),
      {
        seed: 0x6000_9200,
        numRuns: 8,
        timeLimitMilliseconds: 180_000,
        domain:
          "nested with hit/miss/unscopables; var in/of/classic heads; " +
          "deletion between iterations; primitive values",
        profile: "M5 ordinary and host Script; both policies; forced GC",
        sizeLimit:
          "one to three iterations, integers -8 through 8 or text/null/true",
      },
    );
  },
);

// Independent order model: ResolveBinding chooses the initial destination;
// later next/default mutations cannot change that reference's base.
test(
  "generated array leaves retain the destination before iterator effects",
  { skip },
  async () => {
    await assertAsyncProperty(
      "array with reference order",
      fc.asyncProperty(
        value,
        fc.boolean(),
        fc.constantFrom("element", "rest", "default", "assignment", "loop"),
        async (item, hit, form) => {
          const printed = form === "rest" && item === null ? "" : String(item);
          const expectedCell = hit ? "cell" : printed;
          const expectedObject = hit ? printed : "changed";
          const pattern =
            form === "rest"
              ? "[...x]"
              : form === "default"
                ? `[x = (mutate(), ${JSON.stringify(item)})]`
                : "[x]";
          const statement =
            form === "loop"
              ? `for (var ${pattern} of [iterable]) {}`
              : form === "assignment"
                ? `(${pattern} = iterable);`
                : `var ${pattern} =
                    ${form === "default" ? "[]" : "iterable"};`;
          const source = `
function run() {
  var x = 'cell';
  const object = ${hit ? "{ x: 'object' }" : "{}"};
  function mutate() {
    if (${String(hit)}) delete object.x;
    else object.x = 'changed';
  }
  const iterable = {
    [Symbol.iterator]() {
      let done = false;
      return {
        next() {
          if (done) return { done: true };
          done = true; mutate();
          return { done: false, value: ${JSON.stringify(item)} };
        },
        return() { return {}; },
      };
    },
  };
  with (object) { ${statement} }
  console.log(Array.isArray(x) ? x.join('/') : x,
    Array.isArray(object.x) ? object.x.join('/') : object.x);
}
run();`;
          // Sloppy SetMutableBinding recreates a deleted selected property
          // on the originally selected object.
          await observe(source, `${expectedCell} ${expectedObject}\n`);
        },
      ),
      {
        seed: 0x6000_9201,
        numRuns: 8,
        timeLimitMilliseconds: 180_000,
        domain:
          "array binding, assignment, rest, default and var loop leaves; " +
          "next/default adds or deletes a property",
        profile: "M5 ordinary and host Script; both policies; forced GC",
        sizeLimit:
          "one yielded primitive, integer -8 through 8 or text/null/true",
      },
    );
  },
);
