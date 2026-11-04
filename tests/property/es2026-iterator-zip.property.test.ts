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
import { iteratorZipModel } from "../native/iterator-zip-model.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type Mode = "longest" | "shortest" | "strict";

/*
 * How an input's `return` behaves: it returns an object, throws, returns
 * a primitive, or is absent. A plain array input has no `return` and
 * logs nothing.
 */
type ReturnKind = "absent" | "object" | "primitive" | "throws";

interface Input {
  readonly array: boolean;
  readonly length: number;
  readonly returnKind: ReturnKind;
  /** The `next` call, counted from zero, that throws; -1 for none. */
  readonly throwAt: number;
}

interface ZipCase {
  readonly closeEarly: boolean;
  readonly inputs: readonly Input[];
  readonly keyed: boolean;
  readonly marker: number;
  readonly mode: Mode | undefined;
  /** Padding values, or undefined for no `padding` option. */
  readonly padding: readonly string[] | undefined;
  /** How many `next` calls run before the optional `return`. */
  readonly steps: number;
}

const inputArbitrary: fc.Arbitrary<Input> = fc
  .record({
    array: fc.boolean(),
    length: fc.integer({ max: 3, min: 0 }),
    returnKind: fc.constantFrom<ReturnKind>(
      "object",
      "object",
      "absent",
      "throws",
      "primitive",
    ),
    throwAt: fc.integer({ max: 9, min: 0 }),
  })
  .map(({ array, length, returnKind, throwAt }) => ({
    array,
    length,
    returnKind: array ? "absent" : returnKind,
    throwAt: !array && throwAt < 3 ? throwAt : -1,
  }));

const caseArbitrary: fc.Arbitrary<ZipCase> = fc.record({
  closeEarly: fc.boolean(),
  inputs: fc.array(inputArbitrary, { maxLength: 4 }),
  keyed: fc.boolean(),
  marker: fc.integer({ max: 1_000, min: 1 }),
  mode: fc.constantFrom<Mode | undefined>(
    undefined,
    "shortest",
    "longest",
    "longest",
    "strict",
  ),
  padding: fc.option(
    fc.array(fc.constantFrom("p", "q", "r", "s", "t"), { maxLength: 5 }),
    { nil: undefined },
  ),
  steps: fc.integer({ max: 6, min: 0 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function printInput(input: Input, index: number): string {
  if (input.array) {
    const values = Array.from({ length: input.length }, (_, position) =>
      String(index * 10 + position),
    );
    return `[${values.join(", ")}]`;
  }
  const close =
    input.returnKind === "absent"
      ? ""
      : `
  return() {
    events.push("r${index}");
    ${input.returnKind === "throws" ? 'throw new EvalError("return");' : ""}
    return ${input.returnKind === "primitive" ? "1" : "{}"};
  },`;
  return `{
  calls: 0,
  next() {
    events.push("n${index}");
    if (this.calls === ${input.throwAt}) throw new RangeError("next");
    this.calls = this.calls + 1;
    return this.calls > ${input.length}
      ? { done: true }
      : { done: false, value: ${index * 10} + this.calls - 1 };
  },${close}
}`;
}

function printOptions(testCase: ZipCase): string {
  const fields: string[] = [];
  if (testCase.mode !== undefined) fields.push(`mode: "${testCase.mode}"`);
  if (testCase.padding !== undefined) {
    const entries = testCase.padding.map((value, index) =>
      testCase.keyed ? `k${index}: "${value}"` : `"${value}"`,
    );
    const padding = testCase.keyed
      ? `{ ${entries.join(", ")} }`
      : `[${entries.join(", ")}]`;
    fields.push(`padding: ${padding}`);
  }
  return fields.length === 0 ? "" : `, { ${fields.join(", ")} }`;
}

function printCase(testCase: ZipCase): string {
  const inputs = testCase.inputs.map((input, index) =>
    testCase.keyed
      ? `k${index}: ${printInput(input, index)}`
      : printInput(input, index),
  );
  const iterables = testCase.keyed
    ? `{\n${inputs.join(",\n")}\n}`
    : `[\n${inputs.join(",\n")}\n]`;
  const close = testCase.closeEarly
    ? 'console.log("return", show(() => iterator.return()), flush());'
    : "";
  const name = testCase.keyed ? "zipKeyed" : "zip";
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
    return result.done + ":" + JSON.stringify(result.value);
  } catch (error) {
    if (error instanceof RangeError) return "range";
    if (error instanceof EvalError) return "eval";
    return error instanceof TypeError ? "type" : "other";
  }
}
const iterator = Iterator.${name}(${iterables}${printOptions(testCase)});
console.log("created", flush());
for (let step = 0; step < ${testCase.steps}; step = step + 1) {
  console.log("step", show(() => iterator.next()), flush());
}
${close}
console.log("after", show(() => iterator.next()), flush());
let turn = 0;
while (turn < 2) {
  console.log("guard", Iterator.zip([[${testCase.marker}]]).next().value[0]);
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

/** The model's [[GeneratorState]], read and written by its step helpers. */
interface ClosureModel {
  state: "completed" | "start" | "yield";
}

/** A completion of the modeled closure: normal, or a throw of a kind. */
type Completion = "eval" | "normal" | "range" | "type";

/**
 * The independent model of the IteratorZip closure over the generated
 * inputs. It tracks each input's `next` call count and which inputs are
 * still in openIters, and applies IteratorCloseAll from the last open
 * input to the first.
 */
function expected(testCase: ZipCase): string {
  const mode = testCase.mode ?? "shortest";
  const count = testCase.inputs.length;
  const calls = testCase.inputs.map(() => 0);
  const open = testCase.inputs.map(() => true);
  // A "longest" input that is done contributes its padding from then on.
  const finished = testCase.inputs.map(() => false);
  const padding = testCase.inputs.map((_, index) =>
    mode === "longest" ? testCase.padding?.[index] : undefined,
  );
  const closure: ClosureModel = { state: "start" };
  let events: string[] = [];

  const closeAll = (completion: Completion): Completion => {
    let current = completion;
    for (let index = count - 1; index >= 0; index -= 1) {
      if (!open[index]) continue;
      open[index] = false;
      const input = testCase.inputs[index]!;
      if (input.returnKind === "absent") continue;
      events.push(`r${index}`);
      if (current !== "normal") continue;
      if (input.returnKind === "throws") current = "eval";
      if (input.returnKind === "primitive") current = "type";
    }
    return current;
  };
  // One `next` call: "throw", "done", or the value.
  const step = (index: number): number | "done" | "throw" => {
    const input = testCase.inputs[index]!;
    if (!input.array) events.push(`n${index}`);
    if (calls[index] === input.throwAt) return "throw";
    calls[index]! += 1;
    return calls[index]! > input.length
      ? "done"
      : index * 10 + calls[index]! - 1;
  };
  const finish = (completion: Completion): string => {
    closure.state = "completed";
    return completion === "normal" ? "true:undefined" : completion;
  };
  const advance = (): string => {
    if (closure.state === "completed") return "true:undefined";
    if (count === 0) return finish("normal");
    const results: unknown[] = [];
    for (let index = 0; index < count; index += 1) {
      if (finished[index]) {
        results.push(padding[index]);
        continue;
      }
      const result = step(index);
      if (result === "throw") {
        open[index] = false;
        return finish(closeAll("range"));
      }
      if (result !== "done") {
        results.push(result);
        continue;
      }
      open[index] = false;
      if (mode === "shortest") return finish(closeAll("normal"));
      if (mode === "strict") {
        if (index !== 0) return finish(closeAll("type"));
        for (let other = 1; other < count; other += 1) {
          const otherResult = step(other);
          open[other] = false;
          if (otherResult === "throw") return finish(closeAll("range"));
          if (otherResult !== "done") {
            open[other] = true;
            return finish(closeAll("type"));
          }
        }
        return finish("normal");
      }
      if (!open.includes(true)) return finish("normal");
      finished[index] = true;
      results.push(padding[index]);
    }
    closure.state = "yield";
    const row = testCase.keyed
      ? Object.fromEntries(results.map((value, index) => [`k${index}`, value]))
      : results;
    return `false:${JSON.stringify(row)}`;
  };
  const line = (label: string, text: string): string => {
    const result = `${label} ${text} ${events.join(",")}`;
    events = [];
    return result;
  };

  const lines = ["created "];
  for (let index = 0; index < testCase.steps; index += 1) {
    lines.push(line("step", advance()));
  }
  if (testCase.closeEarly) {
    const text =
      closure.state === "completed"
        ? "true:undefined"
        : finish(closeAll("normal"));
    lines.push(line("return", text));
  }
  lines.push(line("after", advance()));
  return [
    ...lines,
    `guard ${testCase.marker}`,
    `guard ${testCase.marker}`,
    `hint ${testCase.marker + 1} ${testCase.marker}1`,
    "",
  ].join("\n");
}

/*
 * Neither pinned host implements Iterator.zip, so the generated source
 * also runs on Node.js over the reference model in
 * tests/native/iterator-zip-model.ts, beside the closure model above.
 */
async function reference(source: string): Promise<{
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-iterator-zip-property-",
  );
  const sourcePath = `${directory}/case.js`;
  let succeeded = false;
  try {
    await host.writeTextFile(sourcePath, iteratorZipModel + source);
    const observation = await host.run({
      args: [sourcePath],
      command: process.execPath,
      cwd: directory,
    });
    succeeded = true;
    return observation;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test(
  "generated Iterator.zip schedules match the closure model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Iterator.zip and zipKeyed step, pad, and close like IteratorZip",
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
            { source, sourceId: "generated-es2026-iterator-zip.ts" },
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
          "Iterator.zip or zipKeyed over zero to four inputs, each a plain " +
          "array or a logged iterator of zero to three values whose next " +
          "may throw and whose return returns an object, throws, returns a " +
          "primitive, or is absent; each mode with optional padding; zero " +
          "to six next calls, an optional return, and one final next, plus " +
          "one constructor shape guard miss and one false number hint",
        numRuns: 12,
        profile: "ES2026 Iterator.zip",
        seed: 0x6000_ab00,
        sizeLimit:
          "at most four inputs of at most three values, five padding " +
          "values, seven next calls, one return, and one constructor " +
          "property write",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
