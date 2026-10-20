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
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type InputKind = "missing" | "null" | "present";
type PatternKind = "array" | "object";
type TargetKind = "identifier" | "member" | "parenthesized-member";

interface DestructuringAssignmentCase {
  readonly fallback: number;
  readonly inputKind: InputKind;
  readonly patternKind: PatternKind;
  readonly targetKind: TargetKind;
  readonly value: number;
}

interface ModelResult {
  readonly assigned?: number;
  readonly rest?: number;
}

type NextKind =
  | "absent"
  | "undefined"
  | "null"
  | "number"
  | "object"
  | "class"
  | "getter-throw"
  | "call-throw"
  | "callable";
type CloseKind =
  | "absent"
  | "null-method"
  | "noncallable"
  | "getter-throw"
  | "call-throw"
  | "null-result"
  | "primitive"
  | "object";
type ResumeKind = "next" | "return" | "throw";

/** A record stays structured through shrinking and source printing. */
interface IteratorTimingCase {
  readonly closeKind: CloseKind;
  readonly hint: "absent" | "truthful" | "false";
  readonly nextKind: NextKind;
  readonly rest: boolean;
  readonly resumeKind: ResumeKind;
  readonly value: number;
}

const nextKinds: readonly NextKind[] = [
  "absent",
  "undefined",
  "null",
  "number",
  "object",
  "class",
  "getter-throw",
  "call-throw",
  "callable",
];
const closeKinds: readonly CloseKind[] = [
  "absent",
  "null-method",
  "noncallable",
  "getter-throw",
  "call-throw",
  "null-result",
  "primitive",
  "object",
];

const timingFields = {
  hint: fc.constantFrom<IteratorTimingCase["hint"]>(
    "absent",
    "truthful",
    "false",
  ),
  rest: fc.boolean(),
  value: fc.integer({ max: 20, min: -20 }),
};
const stepTimingArbitrary: fc.Arbitrary<IteratorTimingCase> = fc.record({
  ...timingFields,
  closeKind: fc.constantFrom(...closeKinds),
  nextKind: fc.constantFrom(...nextKinds),
  resumeKind: fc.constant<ResumeKind>("next"),
});
const closeTimingArbitrary: fc.Arbitrary<IteratorTimingCase> = fc.record({
  ...timingFields,
  closeKind: fc.constantFrom(...closeKinds),
  nextKind: fc.constantFrom(...nextKinds),
  resumeKind: fc.constantFrom<ResumeKind>("return", "throw"),
});

function printIteratorTiming(testCase: IteratorTimingCase): string {
  const hint =
    testCase.hint === "absent"
      ? ""
      : testCase.hint === "truthful"
        ? "/** @param {number} marker */"
        : "/** @param {string} marker */";
  const captured = {
    absent: "undefined",
    callable: "captured",
    "call-throw": "captured",
    class: "class {}",
    "getter-throw": "undefined",
    null: "null",
    number: "1",
    object: "{}",
    undefined: "undefined",
  }[testCase.nextKind];
  const nextProperty =
    testCase.nextKind === "absent"
      ? ""
      : `Object.defineProperty(iterator, "next", {
  configurable: true,
  get() {
    log += "n;";
    if (${testCase.nextKind === "getter-throw"}) throw new RangeError();
    // This fresh closure has no surviving owner outside the record.
    const held = { value: ${testCase.value} };
    function captured() {
      log += "s;";
      calls++;
      if (this !== iterator || arguments.length !== 0) throw new Error();
      if (${testCase.nextKind === "call-throw"}) throw new RangeError();
      return { done: calls > 1, value: held };
    }
    return ${captured};
  },
});`;
  const closeMethod = {
    absent: "undefined",
    "call-throw": "close",
    "getter-throw": "undefined",
    noncallable: "1",
    "null-method": "null",
    "null-result": "close",
    object: "close",
    primitive: "close",
  }[testCase.closeKind];
  return `
let log = "";
let calls = 0;
const target = {};
const iterator = {
  get return() {
    log += "r;";
    if (${testCase.closeKind === "getter-throw"}) throw new RangeError();
    function close() {
      log += "c;";
      if (this !== iterator || arguments.length !== 0) throw new Error();
      if (${testCase.closeKind === "call-throw"}) throw new RangeError();
      if (${testCase.closeKind === "null-result"}) return null;
      if (${testCase.closeKind === "primitive"}) return 1;
      return {
        get done() { throw new Error(); },
        get value() { throw new Error(); },
      };
    }
    return ${closeMethod};
  },
};
${nextProperty}
const input = {
  [Symbol.iterator]() { log += "i;"; return iterator; },
};
${hint}
function* assign(input, marker) {
  try {
    [${testCase.rest ? "..." : ""}target[yield marker]] = input;
    log += "a;";
  } finally { log += "f;"; }
}
const generator = assign(input, ${testCase.value});
try {
  const first = generator.next();
  console.log("first", first.value, first.done, log);
  Object.defineProperty(iterator, "next", {
    configurable: true,
    get() { throw new Error("reread next"); },
  });
  let pressure = {};
  for (let index = 0; index < 4; index++) {
    pressure = { previous: pressure, index };
  }
  const last = generator.${testCase.resumeKind}(${
    testCase.resumeKind === "throw"
      ? "new SyntaxError()"
      : testCase.resumeKind === "return"
        ? '"requested"'
        : '"key"'
  });
  console.log("last", last.value, last.done);
} catch (error) { console.log("error", error.name); }
console.log("end", calls, log, generator.next().done);
if (target.key !== undefined) {
  console.log("held", ${testCase.rest ? "target.key[0]" : "target.key"}.value);
}
`;
}

/** Transcribe ECMA-262 2025 iterator completion rules, without execution. */
function expectedIteratorTiming(testCase: IteratorTimingCase): string {
  const lines: string[] = [];
  let log = "i;";
  let calls = 0;
  let error: string | undefined;
  let assigned = false;
  if (testCase.nextKind !== "absent") log += "n;";
  if (testCase.nextKind === "getter-throw") {
    error = "RangeError";
  } else {
    lines.push(`first ${testCase.value} false ${log}`);
    let close = testCase.resumeKind !== "next";
    if (testCase.resumeKind === "next") {
      if (testCase.nextKind === "callable") {
        calls = testCase.rest ? 2 : 1;
        log += testCase.rest ? "s;s;" : "s;";
        close = !testCase.rest;
        assigned = true;
      } else if (testCase.nextKind === "call-throw") {
        calls = 1;
        log += "s;";
        error = "RangeError";
      } else {
        error = "TypeError";
      }
    }
    if (close) {
      log += "r;";
      if (testCase.closeKind === "getter-throw") error = "RangeError";
      else if (testCase.closeKind === "noncallable") error = "TypeError";
      else if (
        testCase.closeKind !== "absent" &&
        testCase.closeKind !== "null-method"
      ) {
        log += "c;";
        if (testCase.closeKind === "call-throw") error = "RangeError";
        else if (testCase.closeKind !== "object") error = "TypeError";
      }
    }
    if (testCase.resumeKind === "throw") error = "SyntaxError";
    if (testCase.resumeKind === "next" && error == null) {
      log += "a;";
    }
  }
  log += "f;";
  if (error != null) lines.push(`error ${error}`);
  else {
    lines.push(
      testCase.resumeKind === "return"
        ? "last requested true"
        : "last undefined true",
    );
  }
  lines.push(`end ${calls} ${log} true`);
  if (assigned) lines.push(`held ${testCase.value}`);
  lines.push("");
  return lines.join("\n");
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<DestructuringAssignmentCase> = fc.record({
  fallback: fc.integer({ max: 20, min: -20 }),
  inputKind: fc.constantFrom<InputKind>("missing", "null", "present"),
  patternKind: fc.constantFrom<PatternKind>("array", "object"),
  targetKind: fc.constantFrom<TargetKind>(
    "identifier",
    "member",
    "parenthesized-member",
  ),
  value: fc.integer({ max: 20, min: -20 }),
});

function patternSource(testCase: DestructuringAssignmentCase): string {
  const memberTarget = testCase.targetKind !== "identifier";
  let assigned = memberTarget ? "target.assigned" : "assigned";
  let rest = memberTarget ? "target.rest" : "rest";
  if (testCase.targetKind === "parenthesized-member") {
    assigned = `(${assigned})`;
    rest = `(${rest})`;
  }
  if (testCase.patternKind === "array") {
    return `[${assigned} = ${testCase.fallback}, ...${rest}]`;
  }
  return `{ value: ${assigned} = ${testCase.fallback}, ...${rest} }`;
}

function inputSource(testCase: DestructuringAssignmentCase): string {
  if (testCase.inputKind === "null") return "null";
  if (testCase.patternKind === "array") {
    const value =
      testCase.inputKind === "present" ? String(testCase.value) : "undefined";
    return `[${value}, 7]`;
  }
  const value =
    testCase.inputKind === "present" ? `value: ${testCase.value}, ` : "";
  return `{ ${value}extra: 7 }`;
}

function printCase(testCase: DestructuringAssignmentCase): string {
  const memberTarget = testCase.targetKind !== "identifier";
  const assignedValue = memberTarget ? "target.assigned" : "assigned";
  const restValue = memberTarget
    ? testCase.patternKind === "array"
      ? "target.rest[0]"
      : "target.rest.extra"
    : testCase.patternKind === "array"
      ? "rest[0]"
      : "rest.extra";
  return `
let assigned = 99;
let rest;
const target = { assigned: 99, rest: undefined };
const input = ${inputSource(testCase)};
try {
  const result = (${patternSource(testCase)} = input);
  console.log("result", ${assignedValue}, ${restValue}, result === input);
} catch (error) {
  console.log("error", error.name, ${assignedValue});
}
`;
}

function expected(testCase: DestructuringAssignmentCase): ModelResult {
  if (testCase.inputKind === "null") return {};
  return {
    assigned:
      testCase.inputKind === "present" ? testCase.value : testCase.fallback,
    rest: 7,
  };
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
    "oseo-destructuring-assignment-property-",
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

const nullishModelTest =
  "destructuring assignment leaves targets unchanged on nullish input";

test(nullishModelTest, () => {
  assert.deepEqual(
    expected({
      fallback: 2,
      inputKind: "null",
      patternKind: "object",
      targetKind: "identifier",
      value: 1,
    }),
    {},
  );
});

async function observeIteratorTiming(testCase: IteratorTimingCase) {
  const source = printIteratorTiming(testCase);
  const observation = {
    exitStatus: 0,
    stderr: "",
    stdout: expectedIteratorTiming(testCase),
  };
  assertMatchingObservations([observation, ...(await references(source))]);
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "generated-iterator-next-callability.js" },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    // Both policies must preserve the sole owner of the captured closure
    // across a suspension and collections during iterator replacement.
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
          assertMatchingObservations([observation, native]);
          assert.ok((native.counters?.collections ?? 0) > 0);
        },
      );
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }
}

const iteratorTimingOracleTest =
  "iterator timing oracle matches the fixed ECMA-262 state space";
test(iteratorTimingOracleTest, async () => {
  const sources: string[] = [];
  const expectedLines: string[] = [];
  for (const nextKind of nextKinds) {
    for (const closeKind of closeKinds) {
      for (const resumeKind of ["next", "return", "throw"] as const) {
        for (const rest of [false, true]) {
          const testCase: IteratorTimingCase = {
            closeKind,
            hint: "absent",
            nextKind,
            rest,
            resumeKind,
            value: 17,
          };
          sources.push(`{\n${printIteratorTiming(testCase)}\n}`);
          expectedLines.push(expectedIteratorTiming(testCase));
        }
      }
    }
  }
  assertMatchingObservations([
    { exitStatus: 0, stderr: "", stdout: expectedLines.join("") },
    ...(await references(sources.join("\n"))),
  ]);
});

const iteratorTimingContext =
  nativeTarget == null || host.executionHost == null
    ? ["target=unsupported host=unknown"]
    : [
        `target=${nativeTarget.name}`,
        `host=${host.executionHost.operatingSystem}/` +
          host.executionHost.architecture,
        `sanitizers=${nativeTarget.sanitizers.join(",")}`,
      ];

test(
  "captured iterator next closures survive suspension and collection",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const rest of [false, true]) {
      for (const hint of ["absent", "truthful", "false"] as const) {
        await observeIteratorTiming({
          closeKind: "object",
          hint,
          nextKind: "callable",
          rest,
          resumeKind: "next",
          value: 17,
        });
      }
    }
  },
);

test(
  "generated iterator acquisition and first steps match ECMA-262 2025",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "iterator next acquisition and first-step callability",
      fc.asyncProperty(stepTimingArbitrary, observeIteratorTiming),
      {
        context: iteratorTimingContext,
        domain:
          "element and rest targets yield before stepping, absent and " +
          "noncallable next, getter and call errors, a captured heap " +
          "closure surviving replacement, and absent, truthful, or false hints",
        numRuns: 16,
        profile: "M5 synchronous iterator acquisition and stepping",
        seed: 0x6000_1001,
        sizeLimit:
          "at most one yielded target, at most two iterator steps, " +
          "four pressure objects, and a bounded integer payload",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

test(
  "generated unstepped iterator closes match ECMA-262 2025",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "iterator close before the first step preserves completion precedence",
      fc.asyncProperty(closeTimingArbitrary, observeIteratorTiming),
      {
        context: iteratorTimingContext,
        domain:
          "element and rest targets, absent next, next getter errors at " +
          "acquisition, captured callable and noncallable next, generator " +
          "return and throw before stepping, return getter and call " +
          "failures, nullish methods, nonobject results, and absent, " +
          "truthful, or false hints",
        numRuns: 16,
        profile: "M5 synchronous iterator close before stepping",
        seed: 0x6000_1002,
        sizeLimit:
          "at most one yielded target, zero iterator steps, zero or one " +
          "close, four pressure objects, and a bounded integer payload",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

test(
  "generated destructuring assignments match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "destructuring assignments preserve values, rest, and result identity",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const modeled = expected(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout:
            modeled.assigned == null
              ? "error TypeError 99\n"
              : `result ${modeled.assigned} ${modeled.rest} true\n`,
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-destructuring-assignment.js" },
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
                toolchain: nativeToolchain,
              },
              (native) =>
                assertMatchingObservations([expectedObservation, native]),
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
          "identifier, member, and parenthesized-member array and object " +
          "assignments with defaults, rest, present, missing, and nullish " +
          "inputs",
        numRuns: 10,
        profile: "M5 destructuring assignment",
        seed: 0x6000_1000,
        sizeLimit: "one target, one rest value, and bounded integers",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
