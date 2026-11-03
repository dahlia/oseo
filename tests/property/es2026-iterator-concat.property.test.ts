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

/*
 * An item is a plain array, whose iterator has no `return` method, or a
 * logged iterable that records when it is opened, stepped, and closed,
 * and whose open may throw.
 */
interface Item {
  readonly logged: boolean;
  readonly openThrows: boolean;
  readonly values: readonly number[];
}

interface ConcatCase {
  readonly items: readonly Item[];
  /** How many `next` calls run before the optional `return`. */
  readonly steps: number;
  readonly closeEarly: boolean;
  readonly marker: number;
}

const itemArbitrary: fc.Arbitrary<Item> = fc
  .record({
    logged: fc.boolean(),
    openThrows: fc.integer({ max: 9, min: 0 }),
    values: fc.array(fc.integer({ max: 99, min: 0 }), { maxLength: 3 }),
  })
  .map(({ logged, openThrows, values }) => ({
    logged,
    openThrows: logged && openThrows === 0,
    values,
  }));

const caseArbitrary: fc.Arbitrary<ConcatCase> = fc.record({
  closeEarly: fc.boolean(),
  items: fc.array(itemArbitrary, { maxLength: 5 }),
  marker: fc.integer({ max: 1_000, min: 1 }),
  steps: fc.integer({ max: 10, min: 0 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function printItem(item: Item, index: number): string {
  const values = `[${item.values.join(", ")}]`;
  if (!item.logged) return values;
  return `{
  [Symbol.iterator]() {
    events.push("open ${index}");
    ${item.openThrows ? 'throw new RangeError("open");' : ""}
    const values = ${values};
    let position = 0;
    return {
      next() {
        events.push("next ${index}");
        position = position + 1;
        return position > values.length
          ? { done: true }
          : { done: false, value: values[position - 1] };
      },
      return() {
        events.push("return ${index}");
        return {};
      },
    };
  },
}`;
}

function printCase(testCase: ConcatCase): string {
  const items = testCase.items.map(printItem).join(",\n");
  const close = testCase.closeEarly
    ? 'console.log("return", show(() => iterator.return()), flush());'
    : "";
  return `
const events = [];
function flush() {
  const text = events.join(",");
  events.length = 0;
  return text;
}
function show(step) {
  try {
    const result = step();
    return result.done + ":" + result.value;
  } catch (error) {
    return error instanceof RangeError ? "range" : "other";
  }
}
const iterator = Iterator.concat(
${items}
);
console.log("created", flush());
for (let step = 0; step < ${testCase.steps}; step = step + 1) {
  console.log("step", show(() => iterator.next()), flush());
}
${close}
console.log("after", show(() => iterator.next()), flush());
let turn = 0;
while (turn < 2) {
  console.log("guard", Iterator.concat([${testCase.marker}]).next().value);
  if (turn === 0) Iterator.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log(
  "hint",
  hinted(${testCase.marker}, 1),
  hinted("${testCase.marker}", 1),
);
`;
}

/** The model's [[GeneratorState]], read and written by its step helper. */
interface ClosureModel {
  state: "completed" | "start" | "yield";
}

/**
 * The independent model of the concat closure: items open in order only
 * when the previous one is done, every inner `next` result is forwarded,
 * an abrupt open completes the iterator, and `return` closes only the
 * inner iterator suspended at a yield.
 */
function expected(testCase: ConcatCase): string {
  const lines = ["created "];
  let item = 0;
  let position = 0;
  let open = false;
  const closure: ClosureModel = { state: "start" };
  const next = (): string => {
    const events: string[] = [];
    if (closure.state === "completed") return "true:undefined ";
    while (true) {
      const current = testCase.items[item];
      if (current == null) {
        closure.state = "completed";
        return `true:undefined ${events.join(",")}`;
      }
      if (!open) {
        if (current.logged) events.push(`open ${item}`);
        if (current.openThrows) {
          closure.state = "completed";
          return `range ${events.join(",")}`;
        }
        open = true;
        position = 0;
      }
      if (current.logged) events.push(`next ${item}`);
      if (position < current.values.length) {
        position += 1;
        closure.state = "yield";
        return `false:${current.values[position - 1]} ${events.join(",")}`;
      }
      open = false;
      item += 1;
    }
  };
  for (let step = 0; step < testCase.steps; step += 1) {
    lines.push(`step ${next()}`);
  }
  if (testCase.closeEarly) {
    const events: string[] = [];
    if (closure.state === "yield" && testCase.items[item]!.logged) {
      events.push(`return ${item}`);
    }
    closure.state = "completed";
    lines.push(`return true:undefined ${events.join(",")}`);
  }
  lines.push(`after ${next()}`);
  return [
    ...lines,
    `guard ${testCase.marker}`,
    `guard ${testCase.marker}`,
    `hint ${testCase.marker + 1} ${testCase.marker}1`,
    "",
  ].join("\n");
}

/*
 * The pinned Node.js lacks Iterator.concat, so Deno is the single
 * reference host beside the model.
 */
async function reference(source: string): Promise<{
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-iterator-concat-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
    );
    const observation = await host.run({
      args: ["run", "--quiet", sourcePath],
      command: "deno",
      cwd: directory,
    });
    succeeded = true;
    return observation;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test(
  "generated Iterator.concat schedules match the closure model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Iterator.concat opens lazily, forwards, and closes the active inner",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          await reference(source),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-es2026-iterator-concat.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-smi/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /generic-fallback/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:smi|shape)/u);
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
                assertMatchingObservations([expectedObservation, native]);
                assert.ok(native.counters?.collections != null);
                assert.ok(native.counters.collections > 0);
                if (specialization === "enabled") {
                  assert.ok(native.counters.guardMisses > 0);
                }
              },
            );
          } finally {
            delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          }
        }
      }),
      {
        context:
          nativeTarget == null || host.executionHost == null
            ? ["target=unsupported host=unknown"]
            : [
                `target=${nativeTarget.name}`,
                `host=${host.executionHost.operatingSystem}/` +
                  host.executionHost.architecture,
                `sanitizers=${nativeTarget.sanitizers.join(",")}`,
              ],
        domain:
          "zero to five items, each a plain array or a logged iterable of " +
          "zero to three values whose open may throw, consumed by zero to " +
          "ten next calls, an optional return, and one final next, plus " +
          "one constructor shape guard miss and one false number hint",
        numRuns: 12,
        profile: "ES2026 Iterator.concat",
        seed: 0x6000_9c00,
        sizeLimit:
          "at most five items of at most three values, eleven next calls, " +
          "one return, and one constructor property write",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
