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
import { zigToolchain } from "../../packages/toolchain-zig/src/index.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type ReceiverKind = "object" | "primitive" | "wrapper";

/** The replacement-template tokens GetSubstitution distinguishes. */
const substitutionTokens = [
  "$$",
  "$&",
  "$`",
  "$'",
  "$1",
  "$12",
  "$<g>",
  "$",
  "x",
  "-",
] as const;

interface ReplaceCase {
  readonly receiver: ReceiverKind;
  readonly searchUnits: readonly number[];
  readonly subjectUnits: readonly number[];
  readonly template: readonly string[];
}

const subjectUnitArbitrary = fc.constantFrom(
  0x24,
  0x2d,
  0x61,
  0x62,
  0x2665,
  0xd800,
);

const caseArbitrary: fc.Arbitrary<ReplaceCase> = fc.record({
  receiver: fc.constantFrom<ReceiverKind>("primitive", "wrapper", "object"),
  searchUnits: fc.array(fc.constantFrom(0x2d, 0x61, 0x2665, 0xd800), {
    maxLength: 2,
  }),
  subjectUnits: fc.array(subjectUnitArbitrary, { maxLength: 7 }),
  template: fc.array(fc.constantFrom(...substitutionTokens), { maxLength: 3 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function unitsOf(text: string): readonly number[] {
  return Array.from({ length: text.length }, (_, index) =>
    text.charCodeAt(index),
  );
}

function textOf(units: readonly number[]): string {
  return units.map((unit) => String.fromCharCode(unit)).join("");
}

function render(units: readonly number[]): string {
  return units.join(".");
}

function matchesAt(
  subject: readonly number[],
  search: readonly number[],
  position: number,
): boolean {
  if (position + search.length > subject.length) return false;
  return search.every((unit, index) => subject[position + index] === unit);
}

/** StringIndexOf over UTF-16 code units, returning -1 for NOT-FOUND. */
function indexOf(
  subject: readonly number[],
  search: readonly number[],
  from: number,
): number {
  if (from > subject.length) return -1;
  for (
    let position = from;
    position <= subject.length - search.length;
    position += 1
  ) {
    if (matchesAt(subject, search, position)) return position;
  }
  return -1;
}

/**
 * GetSubstitution with an empty capture list and an undefined named-capture
 * object, which is what both callers supply. Only `$$`, `` $` ``, `$&`, and
 * `$'` substitute; every other reference copies its own text.
 */
function substitute(
  template: readonly number[],
  subject: readonly number[],
  matched: readonly number[],
  position: number,
): readonly number[] {
  const result: number[] = [];
  let index = 0;
  while (index < template.length) {
    const unit = template[index] as number;
    const next = template[index + 1];
    if (unit !== 0x24 || next == null) {
      result.push(unit);
      index += 1;
      continue;
    }
    if (next === 0x24) {
      result.push(0x24);
      index += 2;
    } else if (next === 0x26) {
      result.push(...matched);
      index += 2;
    } else if (next === 0x60) {
      result.push(...subject.slice(0, position));
      index += 2;
    } else if (next === 0x27) {
      const tail = Math.min(position + matched.length, subject.length);
      result.push(...subject.slice(tail));
      index += 2;
    } else if ((next >= 0x30 && next <= 0x39) || next === 0x3c) {
      result.push(unit, next);
      index += 2;
    } else {
      result.push(unit);
      index += 1;
    }
  }
  return result;
}

function replaceModel(
  subject: readonly number[],
  search: readonly number[],
  template: readonly number[],
  all: boolean,
): readonly number[] {
  const result: number[] = [];
  const advance = search.length === 0 ? 1 : search.length;
  let consumed = 0;
  let position = indexOf(subject, search, 0);
  if (position < 0) return subject;
  while (position >= 0) {
    result.push(...subject.slice(consumed, position));
    result.push(...substitute(template, subject, search, position));
    consumed = position + search.length;
    position = all ? indexOf(subject, search, position + advance) : -1;
  }
  result.push(...subject.slice(consumed));
  return result;
}

/** The functional-replacer call log a replaceAll pass must produce. */
function functionalModel(
  subject: readonly number[],
  search: readonly number[],
): { readonly log: string; readonly result: readonly number[] } {
  const calls: string[] = [];
  const result: number[] = [];
  const advance = search.length === 0 ? 1 : search.length;
  let consumed = 0;
  let position = indexOf(subject, search, 0);
  while (position >= 0) {
    result.push(...subject.slice(consumed, position));
    calls.push(`${render(search)}@${position}/${subject.length}`);
    result.push(...unitsOf(`<${position}>`));
    consumed = position + search.length;
    position = indexOf(subject, search, position + advance);
  }
  result.push(...subject.slice(consumed));
  return { log: calls.join(","), result };
}

function receiverExpression(kind: ReceiverKind): string {
  if (kind === "primitive") return "subject";
  if (kind === "wrapper") return "new String(subject)";
  return "({ toString() { return subject; } })";
}

function printCase(testCase: ReplaceCase): string {
  const template = unitsOf(testCase.template.join(""));
  return `
const subject = String.fromCharCode(${testCase.subjectUnits.join(", ")});
const needle = String.fromCharCode(${testCase.searchUnits.join(", ")});
const template = String.fromCharCode(${template.join(", ")});
const receiver = ${receiverExpression(testCase.receiver)};
function render(value) {
  let rendered = "";
  for (let index = 0; index < value.length; index = index + 1) {
    if (index !== 0) rendered = rendered + ".";
    rendered = rendered + value.charCodeAt(index);
  }
  return rendered;
}
console.log(
  "replace",
  render(String.prototype.replace.call(receiver, needle, template)),
);
console.log(
  "replaceAll",
  render(String.prototype.replaceAll.call(receiver, needle, template)),
);
let log = "";
const replaced = String.prototype.replaceAll.call(
  receiver,
  needle,
  function (matched, position, string) {
    if (log !== "") log = log + ",";
    log = log + render(matched) + "@" + position + "/" + string.length;
    return "<" + position + ">";
  },
);
console.log("functional", render(replaced), log);
console.log(
  "null protocol",
  render(String.prototype.replace.call(
    receiver,
    { [Symbol.replace]: null, toString() { return needle; } },
    template,
  )),
);
for (const name of ["replace", "replaceAll"]) {
  let calls = 0;
  const protocol = {
    [Symbol.replace](...args) {
      calls = calls + 1;
      return this === protocol && args[0] === receiver &&
        args[1] === template && args.length === 2;
    },
  };
  console.log(
    "protocol",
    name,
    String.prototype[name].call(receiver, protocol, template),
    calls,
  );
}

/** @param {string} value */
function hinted(value) { return value.replaceAll(needle, template); }
console.log("hint", render(hinted(subject)));
console.log("false hint", render(hinted(new String(subject))));
console.log("guard", render(hinted(subject)));
String.prototype.replacePropertyMarker = 1;
console.log("guard", render(hinted(subject)));
`;
}

function expectedObservation(testCase: ReplaceCase): {
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
} {
  const subject = testCase.subjectUnits;
  const search = testCase.searchUnits;
  const template = unitsOf(testCase.template.join(""));
  const replaced = render(replaceModel(subject, search, template, false));
  const replacedAll = render(replaceModel(subject, search, template, true));
  const functional = functionalModel(subject, search);
  return {
    exitStatus: 0,
    stderr: "",
    stdout: [
      `replace ${replaced}`,
      `replaceAll ${replacedAll}`,
      `functional ${render(functional.result)} ${functional.log}`,
      `null protocol ${replaced}`,
      "protocol replace true 1",
      "protocol replaceAll true 1",
      `hint ${replacedAll}`,
      `false hint ${replacedAll}`,
      `guard ${replacedAll}`,
      `guard ${replacedAll}`,
      "",
    ].join("\n"),
  };
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory("oseo-string-replace-");
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
    );
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

async function observeNative(
  source: string,
  sourceId: string,
  expected: {
    readonly exitStatus: number;
    readonly stderr: string;
    readonly stdout: string;
  },
  requireGuards: boolean,
): Promise<void> {
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const mir = printMir(compiled.mir);
    if (specialization === "enabled" && requireGuards) {
      assert.match(mir, /guard-object/u);
      assert.match(mir, /guard-shape/u);
      assert.match(mir, /property-get generic/u);
    } else if (specialization === "disabled") {
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
          toolchain: zigToolchain,
        },
        (native) => {
          assertMatchingObservations([expected, native]);
          assert.ok(native.counters?.collections != null);
          assert.ok(native.counters.collections > 0);
          if (specialization === "enabled" && requireGuards) {
            assert.ok(native.counters.guardMisses > 0);
          }
        },
      );
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }
}

function propertyContext(): readonly string[] {
  if (nativeTarget == null || host.executionHost == null) {
    return ["target=unsupported host=unknown"];
  }
  return [
    `target=${nativeTarget.name}`,
    `host=${host.executionHost.operatingSystem}/` +
      host.executionHost.architecture,
    `sanitizers=${nativeTarget.sanitizers.join(",")}`,
  ];
}

test(
  "generated String replacement agrees with the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "String replace and replaceAll substitution agrees",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expected = expectedObservation(testCase);
        assertMatchingObservations([expected, ...(await references(source))]);
        await observeNative(
          source,
          "generated-m5-string-replace.ts",
          expected,
          true,
        );
      }),
      {
        context: propertyContext(),
        domain:
          "zero to seven UTF-16 subject code units including a dollar sign, " +
          "a lone surrogate, and a non-ASCII unit; zero to two search code " +
          "units; zero to three replacement-template tokens drawn from " +
          "every GetSubstitution reference form; primitive, wrapper, and " +
          "generic receivers; string and functional replacers; a null " +
          "Symbol.replace method; a custom Symbol.replace method for both " +
          "names; a false hint and a shape-guard miss",
        numRuns: 12,
        profile: "M5 String prototype replacement",
        seed: 0x6000_5200,
        sizeLimit:
          "at most seven subject units, two search units, three template " +
          "tokens, one receiver, six fallback observations, two dispatch " +
          "observations, two hint classes, and one prototype shape change",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

type OperandKind =
  | "global-regexp-like"
  | "nonglobal-regexp-like"
  | "nullish-flags"
  | "plain"
  | "throwing-flags";

interface OperandCase {
  readonly all: boolean;
  readonly operand: OperandKind;
  readonly subjectUnits: readonly number[];
}

const operandArbitrary: fc.Arbitrary<OperandCase> = fc.record({
  all: fc.boolean(),
  operand: fc.constantFrom<OperandKind>(
    "global-regexp-like",
    "nonglobal-regexp-like",
    "nullish-flags",
    "plain",
    "throwing-flags",
  ),
  subjectUnits: fc.array(fc.constantFrom(0x61, 0x62, 0x2d), { maxLength: 5 }),
});

function operandExpression(operand: OperandKind): string {
  if (operand === "plain") return '{ toString() { return "b"; } }';
  if (operand === "global-regexp-like") {
    return '{ [Symbol.match]: true, flags: "g", toString() { return "b"; } }';
  }
  if (operand === "nonglobal-regexp-like") {
    return '{ [Symbol.match]: true, flags: "i", toString() { return "b"; } }';
  }
  if (operand === "nullish-flags") {
    return '{ [Symbol.match]: true, flags: null, toString() { return "b"; } }';
  }
  return (
    "{ [Symbol.match]: true, get flags() { throw new RangeError('f'); }, " +
    'toString() { return "b"; } }'
  );
}

/**
 * Only replaceAll observes IsRegExp and `flags`; replace reaches its String
 * fallback for every one of these operands.
 */
function operandThrows(testCase: OperandCase): boolean {
  return (
    testCase.all &&
    (testCase.operand === "nonglobal-regexp-like" ||
      testCase.operand === "nullish-flags" ||
      testCase.operand === "throwing-flags")
  );
}

function printOperandCase(testCase: OperandCase): string {
  return `
const subject = String.fromCharCode(${testCase.subjectUnits.join(", ")});
const operand = ${operandExpression(testCase.operand)};
const method = ${testCase.all ? '"replaceAll"' : '"replace"'};
let reads = 0;
const counted = {
  get [Symbol.match]() { reads = reads + 1; return operand[Symbol.match]; },
  get flags() { reads = reads + 1; return operand.flags; },
  toString() { return "b"; },
};
try {
  const result = String.prototype[method].call(subject, counted, "X");
  console.log("result", result, reads);
} catch (error) {
  console.log(
    "threw",
    error instanceof TypeError,
    error instanceof RangeError,
    reads,
  );
}
`;
}

function expectedOperandObservation(testCase: OperandCase): {
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
} {
  const units = testCase.subjectUnits;
  const reads = testCase.all ? (testCase.operand === "plain" ? 1 : 2) : 0;
  let stdout: string;
  if (operandThrows(testCase)) {
    const range = testCase.operand === "throwing-flags";
    stdout = `threw ${!range} ${range} ${reads}\n`;
  } else {
    const replaced = replaceModel(units, [0x62], [0x58], testCase.all);
    stdout = `result ${textOf(replaced)} ${reads}\n`;
  }
  return { exitStatus: 0, stderr: "", stdout };
}

test(
  "generated replaceAll operand observations agree with the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "replaceAll IsRegExp and flags observations agree",
      fc.asyncProperty(operandArbitrary, async (testCase) => {
        const source = printOperandCase(testCase);
        const expected = expectedOperandObservation(testCase);
        assertMatchingObservations([expected, ...(await references(source))]);
        await observeNative(
          source,
          "generated-m5-string-replace-operand.ts",
          expected,
          false,
        );
      }),
      {
        context: propertyContext(),
        domain:
          "zero to five ASCII subject code units; plain, global, " +
          "non-global, nullish-flag, and throwing-flag RegExp-like " +
          "operands; replace and replaceAll; both specialization policies " +
          "and forced collection",
        numRuns: 10,
        profile: "M5 String replaceAll operand protocol",
        seed: 0x6000_5201,
        sizeLimit:
          "at most five subject units, one of five operand shapes, one of " +
          "two method names, and one accessor-read count",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
