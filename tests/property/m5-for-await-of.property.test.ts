/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import { zigToolchain } from "../../packages/toolchain-zig/src/index.ts";

const { assertAsyncProperty, propertySize } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type Action = "break" | "continue" | "exhaust" | "return" | "throw";
type Head = "binding" | "const" | "let" | "property" | "var";
type ReturnBehavior = "absent" | "normal" | "promise" | "throw";
/**
 * Which iterator the generated iterable exposes. The two asynchronous
 * kinds differ in whether `next` promises its result or reports it
 * directly, and the two synchronous kinds reach the same head through
 * AsyncFromSyncIterator, with `sync-promise` making the wrapper's own
 * await of the stepped value observable.
 */
type SourceKind = "async" | "async-plain" | "sync" | "sync-promise";

interface ForAwaitCase {
  readonly action: Action;
  readonly head: Head;
  readonly returnBehavior: ReturnBehavior;
  readonly sourceKind: SourceKind;
  readonly stopRaw: number;
  readonly values: readonly number[];
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const large = propertySize() === "large";
const caseArbitrary = fc.record({
  action: fc.constantFrom<Action>(
    "break",
    "continue",
    "exhaust",
    "return",
    "throw",
  ),
  head: fc.constantFrom<Head>("binding", "const", "let", "property", "var"),
  returnBehavior: fc.constantFrom<ReturnBehavior>(
    "absent",
    "normal",
    "promise",
    "throw",
  ),
  sourceKind: fc.constantFrom<SourceKind>(
    "async",
    "async-plain",
    "sync",
    "sync-promise",
  ),
  stopRaw: fc.nat({ max: large ? 8 : 4 }),
  values: fc.array(fc.integer({ max: 20, min: -20 }), {
    maxLength: large ? 9 : 5,
  }),
});

function activeStop(testCase: ForAwaitCase): number | undefined {
  if (testCase.action === "exhaust" || testCase.values.length === 0) {
    return undefined;
  }
  return testCase.stopRaw % testCase.values.length;
}

function headSource(head: Head): {
  readonly head: string;
  readonly value: string;
} {
  if (head === "binding") return { head: "assigned", value: "assigned" };
  if (head === "property") {
    return { head: "holder.item", value: "holder.item" };
  }
  return { head: `${head} item`, value: "item" };
}

function actionSource(testCase: ForAwaitCase, value: string): string {
  const stop = activeStop(testCase);
  if (stop == null) return "";
  const action =
    testCase.action === "break"
      ? 'outcome = "break"; break;'
      : testCase.action === "continue"
        ? "continue;"
        : testCase.action === "return"
          ? `return "result return:" + ${value};`
          : 'throw new RangeError("body");';
  return `if (bodyIndex === ${stop}) { ${action} }`;
}

function returnSource(behavior: ReturnBehavior): string {
  if (behavior === "absent") return "";
  const body =
    behavior === "throw"
      ? 'throw new TypeError("close");'
      : behavior === "promise"
        ? "return Promise.resolve({});"
        : "return {};";
  return `      return: function () { closes = closes + 1; ${body} },\n`;
}

function stepSource(kind: SourceKind): string {
  const result =
    kind === "sync-promise"
      ? "{ value: done ? undefined : Promise.resolve(value), done: done }"
      : "{ value: value, done: done }";
  const wrapped = kind === "async" ? `Promise.resolve(${result})` : result;
  return `        return ${wrapped};\n`;
}

function printCase(testCase: ForAwaitCase): string {
  const target = headSource(testCase.head);
  const key =
    testCase.sourceKind === "async" || testCase.sourceKind === "async-plain"
      ? "Symbol.asyncIterator"
      : "Symbol.iterator";
  return `
let steps = 0;
let closes = 0;
let sum = 0;
let assigned = -99;
const holder = { item: -99 };
const values = [${testCase.values.join(", ")}];
const iterable = {
  [${key}]: function () {
    let index = 0;
    return {
      next: function () {
        steps = steps + 1;
        const done = index >= values.length;
        const value = done ? undefined : values[index];
        index = index + 1;
${stepSource(testCase.sourceKind)}      },
${returnSource(testCase.returnBehavior)}    };
  },
};
async function consume() {
  let outcome = "exhaust";
  let bodyIndex = 0;
  try {
    for await (${target.head} of iterable) {
      sum = sum + ${target.value};
      ${actionSource(testCase, target.value)}
      bodyIndex = bodyIndex + 1;
    }
  } catch (error) {
    return "error " + error.name + " " + error.message;
  }
  return "result " + outcome;
}
async function main() {
  const outcome = await consume();
  console.log(outcome);
  console.log("state", sum, steps, closes);
}
main();
`;
}

function expectedOutput(testCase: ForAwaitCase): string {
  const stop = activeStop(testCase);
  const early = stop != null && testCase.action !== "continue";
  const observed = early ? testCase.values.slice(0, stop + 1) : testCase.values;
  const sum = observed.reduce((total, value) => total + value, 0);
  const steps = early ? stop + 1 : testCase.values.length + 1;
  // Every abrupt body completion closes the iterator once, and an
  // exhausted head closes nothing.
  const closes = early && testCase.returnBehavior !== "absent" ? 1 : 0;
  let result = "result exhaust";
  if (early && testCase.action === "throw") {
    // The body error stays authoritative over a throwing close.
    result = "error RangeError body";
  } else if (
    early &&
    testCase.returnBehavior === "throw" &&
    (testCase.action === "break" || testCase.action === "return")
  ) {
    result = "error TypeError close";
  } else if (early && testCase.action === "break") {
    result = "result break";
  } else if (early && testCase.action === "return") {
    result = `result return:${testCase.values[stop!]}`;
  }
  return `${result}\nstate ${sum} ${steps} ${closes}\n`;
}

async function references(source: string): Promise<
  readonly [
    {
      readonly exitStatus: number;
      readonly stderr: string;
      readonly stdout: string;
    },
    {
      readonly exitStatus: number;
      readonly stderr: string;
      readonly stdout: string;
    },
  ]
> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-for-await-of-property-",
  );
  const sourcePath = `${directory}/case.js`;
  let succeeded = false;
  try {
    await host.writeTextFile(sourcePath, source);
    const observations = [
      await host.run({
        args: [sourcePath],
        command: process.execPath,
        cwd: directory,
      }),
      await host.run({
        args: ["run", "--quiet", sourcePath],
        command: "deno",
        cwd: directory,
      }),
    ] as const;
    succeeded = true;
    return observations;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test(
  "generated asynchronous iterator consumers match the M5 model",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    await assertAsyncProperty(
      "for-await-of preserves generated control and close observations",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expected = {
          exitStatus: 0,
          stderr: "",
          stdout: expectedOutput(testCase),
        };
        const referenceResults = await references(source);
        assertMatchingObservations([expected, ...referenceResults]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-for-await-of.js" },
            { specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          if (specialization === "enabled") {
            process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
          }
          try {
            await withNativeFixture(
              {
                backend: cBackend,
                host,
                input: compiled.mir,
                operation: "execute",
                runtime: cRuntimeProvider,
                target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
                toolchain: zigToolchain,
              },
              (native) => assertMatchingObservations([expected, native]),
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
          "bounded integer async iterables, iterator kinds, head forms, " +
          "transfers, and close modes",
        numRuns: 10,
        profile: "M5 asynchronous for-await-of and AsyncIteratorClose",
        seed: 0x6000_1200,
        sizeLimit: large ? "9 values and 9 transfer positions" : "5 values",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

type FrameForm = "for-await" | "for-await-generator" | "yield-star";
type FrameSource = "async" | "sync";
type Settlement = "never" | "reaction" | "timer";

interface AsyncFrameCase {
  readonly falseHint: boolean;
  readonly form: FrameForm;
  readonly settlement: Settlement;
  readonly source: FrameSource;
}

const asyncFrameArbitrary = fc.record({
  falseHint: fc.boolean(),
  form: fc.constantFrom<FrameForm>(
    "for-await",
    "for-await-generator",
    "yield-star",
  ),
  settlement: fc.constantFrom<Settlement>("never", "reaction", "timer"),
  source: fc.constantFrom<FrameSource>("async", "sync"),
});

function asyncFrameSource(testCase: AsyncFrameCase): string {
  const schedule =
    testCase.settlement === "never"
      ? ""
      : testCase.settlement === "reaction"
        ? `
    Promise.resolve().then(function () {
      console.log("settle");
      resolve(value);
    });`
        : `
    setTimeout(function () {
      console.log("settle");
      resolve(value);
    }, 1);`;
  const key =
    testCase.source === "async" ? "Symbol.asyncIterator" : "Symbol.iterator";
  const step =
    testCase.source === "async"
      ? `return done
          ? { value: value, done: true }
          : delayed({ value: value, done: false });`
      : `return {
          value: done ? 9 : delayed(value),
          done: done,
        };`;
  const body =
    testCase.form === "for-await"
      ? `
async function execute(input) {
  const guard = hintedAdd(input, 1);
  for await (const value of iterable) {
    console.log("body", value + guard);
  }
  console.log("for done");
}
async function main() {
  const task = execute(input);
  console.log("caller");
  await task;
  console.log("joined");
}`
      : testCase.form === "for-await-generator"
        ? `
async function* execute(input) {
  const guard = hintedAdd(input, 1);
  for await (const value of iterable) {
    yield value + guard;
  }
  console.log("for generator done");
}
async function main() {
  const iterator = execute(input);
  const task = iterator.next();
  console.log("caller");
  const first = await task;
  console.log("yield", first.value);
  const final = await iterator.next();
  console.log("final", final.done);
  console.log("joined");
}`
        : `
async function* execute(input) {
  const guard = hintedAdd(input, 1);
  const result = yield* iterable;
  console.log("delegate done", result, guard);
}
async function main() {
  const iterator = execute(input);
  const task = iterator.next();
  console.log("caller");
  const first = await task;
  console.log("yield", first.value);
  const final = await iterator.next();
  console.log("final", final.done);
  console.log("joined");
}`;
  const input = testCase.falseHint
    ? `{
  valueOf: function () {
    console.log("fallback");
    return 4;
  },
}`
    : "2";
  return `
/**
 * @param {number} left
 * @param {number} right
 */
function hintedAdd(left, right) {
  return left + right;
}
function delayed(value) {
  return new Promise(function (resolve) {${schedule}
  });
}
let index = 0;
const iterable = {
  [${key}]: function () {
    return {
      next: function () {
        index += 1;
        const done = index > 1;
        const value = done ? 9 : 7;
        ${step}
      },
    };
  },
};
const input = ${input};
${body}
main();
`;
}

function asyncFrameExpected(testCase: AsyncFrameCase): string {
  const lines = testCase.falseHint ? ["fallback", "caller"] : ["caller"];
  if (testCase.settlement === "never") return `${lines.join("\n")}\n`;
  lines.push("settle");
  if (testCase.form === "for-await") {
    lines.push(testCase.falseHint ? "body 12" : "body 10");
    lines.push("for done", "joined");
  } else if (testCase.form === "for-await-generator") {
    lines.push(testCase.falseHint ? "yield 12" : "yield 10");
    lines.push("for generator done", "final true", "joined");
  } else {
    lines.push("yield 7");
    lines.push(testCase.falseHint ? "delegate done 9 5" : "delegate done 9 3");
    lines.push("final true", "joined");
  }
  return `${lines.join("\n")}\n`;
}

test(
  "generated asynchronous iterator frames match the schedule model",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    await assertAsyncProperty(
      "iterator steps return before generated settlements",
      fc.asyncProperty(asyncFrameArbitrary, async (testCase) => {
        const source = asyncFrameSource(testCase);
        const expected = {
          exitStatus: 0,
          stderr: "",
          stdout: asyncFrameExpected(testCase),
        };
        const referenceResults = await references(source);
        assertMatchingObservations([expected, ...referenceResults]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-async-iterator-frame.js" },
            { specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          if (specialization === "enabled") {
            process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
          }
          try {
            await withNativeFixture(
              {
                backend: cBackend,
                host,
                input: compiled.mir,
                operation: "execute",
                runtime: cRuntimeProvider,
                target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
                toolchain: zigToolchain,
              },
              (native) => assertMatchingObservations([expected, native]),
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
          "for-await in async functions and generators, async yield-star " +
          "frames, async and wrapped sync iterators, reaction, timer, and " +
          "never settlements, and false hints",
        numRuns: 12,
        profile: "M5 Unit 7.5 asynchronous iterator frame suspension",
        seed: 0x6000_1201,
        sizeLimit: "one generated iterator value and one completion step",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

type CloseCompletion = "break" | "throw";
type CloseForm =
  | "for-await-function"
  | "for-await-generator"
  | "yield-star-missing-throw";
type CloseSettlement = "never" | "nonobject" | "reaction" | "reject" | "timer";

interface AsyncCloseFrameCase {
  readonly completion: CloseCompletion;
  readonly falseHint: boolean;
  readonly form: CloseForm;
  readonly settlement: CloseSettlement;
  readonly source: FrameSource;
}

const closeCompletionArbitrary = fc.constantFrom<CloseCompletion>(
  "break",
  "throw",
);
const closeSettlementArbitrary = fc.constantFrom<CloseSettlement>(
  "never",
  "nonobject",
  "reaction",
  "reject",
  "timer",
);
const asyncCloseFrameArbitrary = fc.oneof(
  fc.record({
    completion: closeCompletionArbitrary,
    falseHint: fc.boolean(),
    form: fc.constantFrom<CloseForm>(
      "for-await-function",
      "for-await-generator",
    ),
    settlement: closeSettlementArbitrary,
    source: fc.constantFrom<FrameSource>("async", "sync"),
  }),
  fc.record({
    completion: closeCompletionArbitrary,
    falseHint: fc.boolean(),
    form: fc.constant<CloseForm>("yield-star-missing-throw"),
    settlement: closeSettlementArbitrary,
    source: fc.constant<FrameSource>("async"),
  }),
  fc.record({
    completion: closeCompletionArbitrary,
    falseHint: fc.boolean(),
    form: fc.constant<CloseForm>("yield-star-missing-throw"),
    settlement: fc.constant<CloseSettlement>("reaction"),
    source: fc.constant<FrameSource>("sync"),
  }),
);

function asyncCloseFrameSource(testCase: AsyncCloseFrameCase): string {
  const key =
    testCase.source === "async" ? "Symbol.asyncIterator" : "Symbol.iterator";
  const next =
    testCase.source === "async"
      ? "return Promise.resolve({ value: 7, done: false });"
      : "return { value: 7, done: false };";
  const wrappedMissingThrow =
    testCase.form === "yield-star-missing-throw" && testCase.source === "sync";
  const closeResult = wrappedMissingThrow
    ? `return {
          get done() {
            console.log("unexpected done");
            return true;
          },
          get value() {
            console.log("unexpected value");
            return Promise.reject(new Error("unexpected await"));
          },
        };`
    : testCase.settlement === "nonobject"
      ? testCase.source === "async"
        ? "return delayed(7);"
        : "return 7;"
      : testCase.source === "async"
        ? "return delayed({ value: undefined, done: true });"
        : `return {
          value: delayed("closed"),
          done: true,
        };`;
  const settle =
    testCase.settlement === "never"
      ? ""
      : testCase.settlement === "timer"
        ? `
    setTimeout(function () {
      console.log("close settled");
      resolve(value);
    }, 1);`
        : testCase.settlement === "reject"
          ? `
    Promise.resolve().then(function () {
      console.log("close settled");
      reject(new TypeError("close"));
    });`
          : `
    Promise.resolve().then(function () {
      console.log("close settled");
      resolve(value);
    });`;
  const input = testCase.falseHint
    ? `{
  valueOf: function () {
    console.log("fallback");
    return 4;
  },
}`
    : "2";
  const completion =
    testCase.completion === "throw"
      ? 'throw new RangeError("body");'
      : "break;";
  const execution =
    testCase.form === "for-await-function"
      ? `
async function execute() {
  const guard = hintedAdd(input, 1);
  try {
    for await (const value of iterable) {
      console.log("body", value + guard);
      ${completion}
    }
    console.log("completed");
  } catch (error) {
    console.log("caught", error.name);
  }
}
async function main() {
  const task = execute();
  console.log("caller");
  await observe(task);
}`
      : testCase.form === "for-await-generator"
        ? `
async function* generate() {
  const guard = hintedAdd(input, 1);
  for await (const value of iterable) {
    console.log("body", value + guard);
    ${completion}
  }
  console.log("completed");
}
async function main() {
  const task = generate().next().then(
    function () { console.log("resolved"); },
    function (error) {
      console.log("caught", error.name);
    },
  );
  console.log("caller");
  await observe(task);
}`
        : `
async function* generate() {
  const guard = hintedAdd(input, 1);
  console.log("guard", guard);
  yield* iterable;
}
async function main() {
  const iterator = generate();
  console.log("first", (await iterator.next()).value);
  const task = iterator.throw(new Error("sent")).then(
    function () { console.log("resolved"); },
    function (error) { console.log("caught", error.name); },
  );
  console.log("caller");
  await observe(task);
}`;
  return `
/**
 * @param {number} left
 * @param {number} right
 */
function hintedAdd(left, right) {
  return left + right;
}
function delayed(value) {
  return new Promise(function (resolve, reject) {${settle}
  });
}
const iterable = {
  [${key}]: function () {
    return {
      next: function () { ${next} },
      return: function () {
        console.log("close called");
        ${closeResult}
      },
    };
  },
};
const input = ${input};
async function observe(task) {
  if (${JSON.stringify(testCase.settlement)} === "never") {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    console.log("pending");
  } else {
    await task;
    console.log("joined");
  }
}
${execution}
main();
`;
}

function asyncCloseFrameExpected(testCase: AsyncCloseFrameCase): string {
  const lines: string[] = [];
  if (testCase.form === "yield-star-missing-throw") {
    if (testCase.falseHint) lines.push("fallback");
    lines.push(testCase.falseHint ? "guard 5" : "guard 3", "first 7");
    lines.push("close called", "caller");
  } else {
    if (testCase.falseHint) lines.push("fallback");
    lines.push("caller", testCase.falseHint ? "body 12" : "body 10");
    lines.push("close called");
  }
  if (testCase.settlement === "never") {
    lines.push("pending");
    return `${lines.join("\n")}\n`;
  }
  const closeSettles =
    testCase.settlement !== "nonobject" || testCase.source === "async";
  if (
    closeSettles &&
    !(
      testCase.form === "yield-star-missing-throw" && testCase.source === "sync"
    )
  ) {
    lines.push("close settled");
  }
  if (testCase.form === "yield-star-missing-throw") {
    lines.push("caught TypeError");
  } else if (testCase.completion === "throw") {
    lines.push("caught RangeError");
  } else if (
    testCase.settlement === "reject" ||
    testCase.settlement === "nonobject"
  ) {
    lines.push("caught TypeError");
  } else if (testCase.form === "for-await-generator") {
    lines.push("completed", "resolved");
  } else {
    lines.push("completed");
  }
  lines.push("joined");
  return `${lines.join("\n")}\n`;
}

async function assertGeneratedNative(
  source: string,
  sourceId: string,
  stdout: string,
): Promise<void> {
  const expected = { exitStatus: 0, stderr: "", stdout };
  assertMatchingObservations([expected, ...(await references(source))]);
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId },
      { specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    if (specialization === "enabled") {
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    }
    try {
      await withNativeFixture(
        {
          backend: cBackend,
          host,
          input: compiled.mir,
          operation: "execute",
          runtime: cRuntimeProvider,
          target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
          toolchain: zigToolchain,
        },
        (native) => assertMatchingObservations([expected, native]),
      );
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }
}

test(
  "generated asynchronous close frames match the completion model",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    await assertAsyncProperty(
      "asynchronous closes suspend their owning frame",
      fc.asyncProperty(asyncCloseFrameArbitrary, async (testCase) => {
        await assertGeneratedNative(
          asyncCloseFrameSource(testCase),
          "generated-m5-async-close-frame.js",
          asyncCloseFrameExpected(testCase),
        );
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
          "async-function and async-generator for-await close frames, " +
          "native async and wrapped sync missing-throw yield-star, " +
          "completion precedence, reaction, timer, rejection, non-object, " +
          "never settlement, and false hints",
        numRuns: 12,
        profile: "M5 Unit 7.6 asynchronous close frame suspension",
        seed: 0x6000_1202,
        sizeLimit: "one iterator value and one abrupt completion",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

type RejectionForm = "for-await" | "yield-next" | "yield-throw";
type RejectionReturn = "normal" | "nonobject" | "throw";

interface AsyncFromSyncRejectionCase {
  readonly done: boolean;
  readonly falseHint: boolean;
  readonly form: RejectionForm;
  readonly returned: RejectionReturn;
}

const asyncFromSyncRejectionArbitrary = fc.record({
  done: fc.boolean(),
  falseHint: fc.boolean(),
  form: fc.constantFrom<RejectionForm>(
    "for-await",
    "yield-next",
    "yield-throw",
  ),
  returned: fc.constantFrom<RejectionReturn>("normal", "nonobject", "throw"),
});

function asyncFromSyncRejectionSource(
  testCase: AsyncFromSyncRejectionCase,
): string {
  const returnStatement =
    testCase.returned === "throw"
      ? 'throw new TypeError("close");'
      : testCase.returned === "nonobject"
        ? "return 4;"
        : "return { value: undefined, done: true };";
  const input = testCase.falseHint
    ? `{
  valueOf: function () {
    console.log("fallback");
    return 4;
  },
}`
    : "2";
  const firstStep =
    testCase.form === "yield-throw"
      ? `if (steps === 1) return { value: "open", done: false };
        return { value: undefined, done: true };`
      : `return {
          value: Promise.reject(new RangeError("step")),
          done: ${String(testCase.done)},
        };`;
  const throwMethod =
    testCase.form === "yield-throw"
      ? `
      throw: function () {
        return {
          value: Promise.reject(new RangeError("step")),
          done: ${String(testCase.done)},
        };
      },`
      : "";
  const execution =
    testCase.form === "for-await"
      ? `
async function execute() {
  const guard = hintedAdd(input, 1);
  try {
    for await (const value of iterable) console.log(value, guard);
  } catch (error) {
    console.log("caught", error.name, error.message);
  }
}`
      : `
async function* generate() {
  const guard = hintedAdd(input, 1);
  console.log("guard", guard);
  yield* iterable;
}
async function execute() {
  const iterator = generate();
  try {
    ${
      testCase.form === "yield-throw"
        ? `console.log("first", (await iterator.next()).value);
    await iterator.throw("sent");`
        : "await iterator.next();"
    }
  } catch (error) {
    console.log("caught", error.name, error.message);
  }
}`;
  return `
/** @param {number} left @param {number} right */
function hintedAdd(left, right) { return left + right; }
let closes = 0;
let steps = 0;
const iterable = {
  [Symbol.iterator]: function () {
    return {
      next: function () {
        steps += 1;
        ${firstStep}
      },${throwMethod}
      return: function () {
        closes += 1;
        console.log("close called");
        ${returnStatement}
      },
    };
  },
};
const input = ${input};
${execution}
async function main() {
  await execute();
  console.log("closes", closes);
}
main();
`;
}

function asyncFromSyncRejectionExpected(
  testCase: AsyncFromSyncRejectionCase,
): string {
  const lines: string[] = [];
  if (testCase.falseHint) lines.push("fallback");
  if (testCase.form !== "for-await") {
    lines.push(testCase.falseHint ? "guard 5" : "guard 3");
  }
  if (testCase.form === "yield-throw") lines.push("first open");
  if (!testCase.done) lines.push("close called");
  lines.push("caught RangeError step", `closes ${testCase.done ? 0 : 1}`);
  return `${lines.join("\n")}\n`;
}

test(
  "generated async-from-sync rejections match the close model",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    await assertAsyncProperty(
      "rejected stepped values close their wrapped synchronous iterator",
      fc.asyncProperty(asyncFromSyncRejectionArbitrary, async (testCase) => {
        await assertGeneratedNative(
          asyncFromSyncRejectionSource(testCase),
          "generated-m5-async-from-sync-rejection.js",
          asyncFromSyncRejectionExpected(testCase),
        );
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
          "for-await and async yield-star over wrapped sync steps, done " +
          "states, rejecting promised values, close result failures, and " +
          "false hints",
        numRuns: 10,
        profile: "M5 Unit 7.6 AsyncFromSync rejection close",
        seed: 0x6000_1203,
        sizeLimit: "one rejected step and one optional close",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
