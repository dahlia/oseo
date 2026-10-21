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

type Operator =
  | "%"
  | "&"
  | "&&"
  | "*"
  | "**"
  | "+"
  | "-"
  | "/"
  | "<<"
  | ">>"
  | ">>>"
  | "??"
  | "^"
  | "|"
  | "||";
type TargetKind = "identifier" | "member";

interface CompoundAssignmentCase {
  readonly left: number;
  readonly nullish: boolean;
  readonly operator: Operator;
  readonly right: number;
  readonly targetKind: TargetKind;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<CompoundAssignmentCase> = fc.record({
  left: fc.integer({ max: 8, min: -8 }),
  nullish: fc.boolean(),
  operator: fc.constantFrom<Operator>(
    "%",
    "&",
    "&&",
    "*",
    "**",
    "+",
    "-",
    "/",
    "<<",
    ">>",
    ">>>",
    "??",
    "^",
    "|",
    "||",
  ),
  right: fc.oneof(
    fc.integer({ max: -1, min: -4 }),
    fc.integer({ max: 4, min: 1 }),
  ),
  targetKind: fc.constantFrom<TargetKind>("identifier", "member"),
});

/** One process result compared by `assertMatchingObservations`. */
interface ProcessObservation {
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}

/** The generated or fixed input a discrepancy record identifies. */
type DiscrepancySubject =
  | CompoundAssignmentCase
  | MemberReferenceCase
  | {
      readonly hook: string;
      readonly operator: string;
    };

function isLogicalOperator(operator: Operator): boolean {
  return operator === "&&" || operator === "??" || operator === "||";
}

/**
 * Records a measured reference discrepancy next to the normative native
 * expectation. The caller has already required the references to match
 * the labeled V8 observation exactly, so this only preserves evidence.
 */
function logReferenceDiscrepancy(
  discrepancy: string,
  testCase: DiscrepancySubject,
  expectedObservation: ProcessObservation,
  observations: readonly ProcessObservation[],
): void {
  for (const [index, actual] of observations.entries()) {
    process.stdout.write(
      JSON.stringify({
        actual,
        discrepancy,
        expected: expectedObservation,
        host: index === 0 ? "Node.js" : "Deno",
        kind: "reference-discrepancy-evidence",
        testCase,
      }) + "\n",
    );
  }
}

function initialValue(testCase: CompoundAssignmentCase): number | null {
  return testCase.operator === "??" && testCase.nullish ? null : testCase.left;
}

function binaryResult(
  operator: Exclude<Operator, "&&" | "??" | "||">,
  left: number,
  right: number,
): number {
  if (operator === "%") return left % right;
  if (operator === "&") return left & right;
  if (operator === "*") return left * right;
  if (operator === "**") return left ** right;
  if (operator === "+") return left + right;
  if (operator === "-") return left - right;
  if (operator === "/") return left / right;
  if (operator === "<<") return left << right;
  if (operator === ">>") return left >> right;
  if (operator === ">>>") return left >>> right;
  if (operator === "^") return left ^ right;
  return left | right;
}

function expected(testCase: CompoundAssignmentCase) {
  const left = initialValue(testCase);
  if (testCase.operator === "&&") {
    return {
      result: left === 0 ? left : testCase.right,
      rightCount: left === 0 ? 0 : 1,
      writeCount: left === 0 ? 0 : 1,
    };
  }
  if (testCase.operator === "||") {
    return {
      result: left === 0 ? testCase.right : left,
      rightCount: left === 0 ? 1 : 0,
      writeCount: left === 0 ? 1 : 0,
    };
  }
  if (testCase.operator === "??") {
    return {
      result: left == null ? testCase.right : left,
      rightCount: left == null ? 1 : 0,
      writeCount: left == null ? 1 : 0,
    };
  }
  return {
    result: binaryResult(testCase.operator, testCase.left, testCase.right),
    rightCount: 1,
    writeCount: 1,
  };
}

function printCase(testCase: CompoundAssignmentCase): string {
  const initial = initialValue(testCase);
  const target =
    testCase.targetKind === "member" ? "object()[key()]" : "target";
  return `
let objectCount = 0;
let keyCount = 0;
let conversionCount = 0;
let rightCount = 0;
const holder = { value: ${String(initial)} };
const propertyKey = {
  [Symbol.toPrimitive]: function () {
    conversionCount += 1;
    return "value";
  },
};
let target = ${String(initial)};
function object() {
  objectCount += 1;
  return holder;
}
function key() {
  keyCount += 1;
  return propertyKey;
}
function right() {
  rightCount += 1;
  return ${testCase.right};
}
const result = ${target} ${testCase.operator}= right();
console.log(
  "" + result,
  "" + ${testCase.targetKind === "member" ? "holder.value" : "target"},
  objectCount,
  keyCount,
  conversionCount,
  rightCount,
);
`;
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
    "oseo-compound-assignment-property-",
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

test("compound assignment model keeps short-circuit writes conditional", () => {
  assert.deepEqual(
    expected({
      left: 1,
      nullish: false,
      operator: "||",
      right: 2,
      targetKind: "identifier",
    }),
    { result: 1, rightCount: 0, writeCount: 0 },
  );
});

test(
  "generated compound assignments match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "compound assignments preserve reference and short-circuit behavior",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const modeled = expected(testCase);
        const memberCount = testCase.targetKind === "member" ? 1 : 0;
        const logical = isLogicalOperator(testCase.operator);
        // ECMA-262 2025 GetValue stores the converted key in the Reference
        // and PutValue reuses it, so an arithmetic member target converts
        // its key once. A logical member target that writes still converts
        // it again: that pre-repair behavior is retained, not conforming,
        // until its own node repairs logical assignment.
        const conversionCount =
          memberCount * (logical ? 1 + modeled.writeCount : 1);
        // Both measured V8 hosts convert again before every taken write.
        const referenceConversionCount = memberCount * (1 + modeled.writeCount);
        const result = String(modeled.result);
        const observed = (conversions: number) => ({
          exitStatus: 0,
          stderr: "",
          stdout:
            `${result} ${result} ${memberCount} ${memberCount} ` +
            `${conversions} ${modeled.rightCount}\n`,
        });
        const expectedObservation = observed(conversionCount);
        const referenceObservation = observed(referenceConversionCount);
        const referenceObservations = await references(source);
        assertMatchingObservations([
          referenceObservation,
          ...referenceObservations,
        ]);
        if (referenceConversionCount !== conversionCount) {
          logReferenceDiscrepancy(
            "V8 converts a compound member key again before PutValue",
            testCase,
            expectedObservation,
            referenceObservations,
          );
        }
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-compound-assignment.js" },
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
          "all compound operators over identifier and computed member " +
          "targets with observable property-key conversion, bounded " +
          "integers, and direct nullish cases",
        numRuns: 10,
        profile: "M5 compound assignment",
        seed: 0x6000_0c00,
        sizeLimit: "one target, one right operand, and bounded integers",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

/** The arithmetic compound operators this reference-order domain repairs. */
type ArithmeticOperator = Exclude<Operator, "&&" | "??" | "||">;

/**
 * Member writes whose current native behavior already matches ECMA-262
 * 2025 when the key is a primitive string, so its conversion cannot be
 * observed. They stay controls for the arithmetic repair.
 */
type ControlForm = "&&" | "++x" | "--x" | "=" | "??" | "x++" | "x--" | "||";

/** A base whose GetValue or PutValue applies ToObject. */
type BaseKind = "null" | "number" | "object" | "string" | "undefined";

/**
 * A key that is converted observably and succeeds, converted observably
 * and throws a `RangeError`, or is already a primitive string.
 */
type KeyKind = "counting" | "string" | "throwing";

/** One evaluated member assignment or update, `base()[key()] op right()`. */
interface MemberSubject {
  readonly base: BaseKind;
  readonly form: ArithmeticOperator | ControlForm;
  readonly key: KeyKind;
  readonly left: number | null;
  readonly right: number;
}

/** A sloppy or strict Script that evaluates every subject in order. */
interface MemberReferenceCase {
  readonly strict: boolean;
  readonly subjects: readonly MemberSubject[];
}

const arithmeticOperators: readonly ArithmeticOperator[] = [
  "*",
  "/",
  "%",
  "+",
  "-",
  "<<",
  ">>",
  ">>>",
  "&",
  "^",
  "|",
  "**",
];
const controlForms: readonly ControlForm[] = [
  "&&",
  "||",
  "??",
  "=",
  "x++",
  "++x",
  "x--",
  "--x",
];
const baseKinds: readonly BaseKind[] = [
  "null",
  "undefined",
  "number",
  "string",
  "object",
];
const leftArbitrary = fc.oneof(
  fc.integer({ max: 8, min: -8 }),
  fc.constant(null),
);
const rightArbitrary = fc.integer({ max: 4, min: -4 });
const memberSubjectArbitrary: fc.Arbitrary<MemberSubject> = fc.oneof(
  {
    arbitrary: fc.record({
      base: fc.constantFrom(...baseKinds),
      form: fc.constantFrom(...arithmeticOperators),
      key: fc.constantFrom<KeyKind>("counting", "string", "throwing"),
      left: leftArbitrary,
      right: rightArbitrary,
    }),
    weight: 3,
  },
  {
    arbitrary: fc.record({
      base: fc.constantFrom(...baseKinds),
      form: fc.constantFrom(...controlForms),
      key: fc.constant<KeyKind>("string"),
      left: leftArbitrary,
      right: rightArbitrary,
    }),
    weight: 1,
  },
);
const memberReferenceArbitrary: fc.Arbitrary<MemberReferenceCase> = fc.record({
  strict: fc.boolean(),
  subjects: fc.array(memberSubjectArbitrary, { maxLength: 4, minLength: 1 }),
});

function memberExpression(form: MemberSubject["form"]): string {
  const target = "getBase()[getKey()]";
  if (form === "x++" || form === "x--") return `${target}${form.slice(1)}`;
  if (form === "++x" || form === "--x") return `${form.slice(0, 2)}${target}`;
  if (form === "=") return `${target} = right()`;
  return `${target} ${form}= right()`;
}

function printMemberReferenceCase(testCase: MemberReferenceCase): string {
  const subjects = testCase.subjects.map((subject, index) => {
    const base = {
      null: "null",
      number: "7",
      object: "holder",
      string: '"s"',
      undefined: "undefined",
    }[subject.base];
    const key = {
      counting: '{ toString() { log.push("conversion"); return "value"; } }',
      string: '"value"',
      throwing:
        '{ toString() { log.push("conversion"); ' +
        'throw new RangeError("key"); } }',
    }[subject.key];
    return `{
  const log = [];
  const holder = { value: ${String(subject.left)} };
  const base = ${base};
  const key = ${key};
  const getBase = () => { log.push("base"); return base; };
  const getKey = () => { log.push("key"); return key; };
  const right = () => { log.push("right"); return ${subject.right}; };
  let outcome;
  try {
    outcome = "value " + String(${memberExpression(subject.form)});
  } catch (error) {
    outcome = error instanceof TypeError
      ? "TypeError"
      : error instanceof RangeError ? "RangeError" : "other";
  }
  console.log(${index}, outcome, log.join(","), String(holder.value));
}`;
  });
  return `${testCase.strict ? '"use strict";\n' : ""}${subjects.join("\n")}\n`;
}

/** Thrown by the model where the program throws; carries the error kind. */
class ModeledThrow {
  readonly kind: "RangeError" | "TypeError";

  constructor(kind: "RangeError" | "TypeError") {
    this.kind = kind;
  }
}

/**
 * The independent ECMA-262 2025 observation of one subject. GetValue
 * (6.2.5.5) applies ToObject to the base before ToPropertyKey, so a
 * nullish base throws TypeError with no conversion, and the converted key
 * stays in the Reference for PutValue (6.2.5.6). `v8` adds the second
 * conversion both measured V8 hosts perform before an arithmetic write.
 */
function modelMemberSubject(
  subject: MemberSubject,
  index: number,
  strict: boolean,
  v8: boolean,
): string {
  const log = ["base", "key"];
  let stored: number | null = subject.left;
  const nullish = subject.base === "null" || subject.base === "undefined";
  const convert = () => {
    if (subject.key === "string") return;
    log.push("conversion");
    if (subject.key === "throwing") throw new ModeledThrow("RangeError");
  };
  const put = (value: number) => {
    if (subject.base === "object") stored = value;
    else if (strict) throw new ModeledThrow("TypeError");
  };
  const evaluate = (): number | null | undefined => {
    if (subject.form === "=") {
      log.push("right");
      if (nullish) throw new ModeledThrow("TypeError");
      convert();
      put(subject.right);
      return subject.right;
    }
    if (nullish) throw new ModeledThrow("TypeError");
    convert();
    const current = subject.base === "object" ? subject.left : undefined;
    const form = subject.form;
    if (form === "&&" || form === "||" || form === "??") {
      const keep =
        form === "&&"
          ? !current
          : form === "||"
            ? Boolean(current)
            : current != null;
      if (keep) return current;
      log.push("right");
      put(subject.right);
      return subject.right;
    }
    if (form === "x++" || form === "x--" || form === "++x" || form === "--x") {
      const old = Number(current);
      const updated = form.includes("+") ? old + 1 : old - 1;
      put(updated);
      return form.startsWith("x") ? old : updated;
    }
    log.push("right");
    const value = binaryResult(form, Number(current), subject.right);
    if (v8) convert();
    put(value);
    return value;
  };
  let outcome: string;
  try {
    const value = evaluate();
    outcome = `value ${String(value)}`;
  } catch (error) {
    if (!(error instanceof ModeledThrow)) throw error;
    outcome = error.kind;
  }
  return `${index} ${outcome} ${log.join(",")} ${String(stored)}`;
}

function modelMemberReferenceCase(
  testCase: MemberReferenceCase,
  v8: boolean,
): string {
  return testCase.subjects
    .map(
      (subject, index) =>
        modelMemberSubject(subject, index, testCase.strict, v8) + "\n",
    )
    .join("");
}

/**
 * Runs the exact source bytes as a global Script through indirect eval in
 * both reference hosts. Running the file directly would make Deno load it
 * as a strict module and change primitive-base writes.
 */
async function scriptReferences(source: string) {
  return await references(`(0, eval)(${JSON.stringify(source)});\n`);
}

/** Both specialization policies, each with collection at every safepoint. */
async function assertNativeMemberReference(
  source: string,
  stdout: string,
  sourceId = "generated-m5-compound-member-reference.js",
): Promise<void> {
  const expectedObservation = { exitStatus: 0, stderr: "", stdout };
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId },
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
        (native) => {
          assertMatchingObservations([expectedObservation, native]);
          assert.ok((native.counters?.collections ?? 0) > 0);
          if (specialization === "disabled") {
            assert.equal(native.counters?.guardHits, 0);
            assert.equal(native.counters?.guardMisses, 0);
          }
        },
      );
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }
}

/**
 * Compares both references with the labeled V8 model and native output
 * with the ECMA-262 model. Outside the measured double-conversion class
 * the two models are identical, so the references then check the model.
 */
async function assertMemberReferenceCase(
  testCase: MemberReferenceCase,
): Promise<void> {
  const source = printMemberReferenceCase(testCase);
  const stdout = modelMemberReferenceCase(testCase, false);
  const referenceStdout = modelMemberReferenceCase(testCase, true);
  const observations = await scriptReferences(source);
  assertMatchingObservations([
    { exitStatus: 0, stderr: "", stdout: referenceStdout },
    ...observations,
  ]);
  if (referenceStdout !== stdout) {
    logReferenceDiscrepancy(
      "V8 converts an arithmetic compound member key again before PutValue",
      testCase,
      { exitStatus: 0, stderr: "", stdout },
      observations,
    );
  }
  await assertNativeMemberReference(source, stdout);
}

test("member reference model throws before a nullish base key", () => {
  const subject: MemberSubject = {
    base: "null",
    form: "*",
    key: "throwing",
    left: 1,
    right: 2,
  };
  assert.equal(
    modelMemberSubject(subject, 0, false, false),
    "0 TypeError base,key 1",
  );
  assert.equal(
    modelMemberSubject(
      { ...subject, base: "object", key: "counting" },
      0,
      false,
      false,
    ),
    "0 value 2 base,key,conversion,right 2",
  );
  assert.equal(
    modelMemberSubject(
      { ...subject, base: "object", key: "counting" },
      0,
      false,
      true,
    ),
    "0 value 2 base,key,conversion,right,conversion 2",
  );
});

/**
 * Every arithmetic operator over every base and key kind in sloppy and
 * strict code, then every control form over every base with a string
 * key. The references must equal the labeled V8 model, which differs only
 * by the second conversion of a counting key on a non-nullish base.
 */
function fixedMemberReferenceCases(): readonly MemberReferenceCase[] {
  const cases: MemberReferenceCase[] = [];
  for (const strict of [false, true]) {
    for (const form of arithmeticOperators) {
      cases.push({
        strict,
        subjects: baseKinds.flatMap((base) =>
          (["counting", "string", "throwing"] as const).map((key) => ({
            base,
            form,
            key,
            left: 3,
            right: 2,
          })),
        ),
      });
    }
    cases.push({
      strict,
      subjects: controlForms.flatMap((form) =>
        baseKinds.flatMap((base) =>
          [0, 3, null].map((left) => ({
            base,
            form,
            key: "string" as const,
            left,
            right: 2,
          })),
        ),
      ),
    });
  }
  return cases;
}

test(
  "fixed compound member references follow the ECMA-262 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const testCase of fixedMemberReferenceCases()) {
      try {
        await assertMemberReferenceCase(testCase);
      } catch (error) {
        throw new Error(
          `Fixed member reference case ${JSON.stringify(testCase)} failed.`,
          { cause: error },
        );
      }
    }
  },
);

/**
 * S11.13.2_A7.*_T4 shape: a key whose conversion names a different
 * property each time. ECMA-262 2025 converts once, so the read and the
 * write both use "read". Both measured V8 hosts write "write" instead.
 * Operators alternate between the `toString` and `Symbol.toPrimitive`
 * conversion hooks.
 */
function changingKeySource(
  operator: ArithmeticOperator,
  hook: "Symbol.toPrimitive" | "toString",
): string {
  const method = hook === "toString" ? "toString" : "[Symbol.toPrimitive]";
  return `let conversions = 0;
const order = [];
const key = {
  ${method}() {
    conversions += 1;
    order.push("key" + conversions);
    return conversions === 1 ? "read" : "write";
  },
};
const holder = { read: 6, write: 9 };
const right = () => { order.push("right"); return 2; };
const result = holder[key] ${operator}= right();
console.log(
  String(result),
  holder.read,
  holder.write,
  conversions,
  order.join(","),
);
`;
}

test(
  "fixed changing-key compound members convert once against V8",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const [index, operator] of arithmeticOperators.entries()) {
      const hook = index % 2 === 0 ? "toString" : "Symbol.toPrimitive";
      const source = changingKeySource(operator, hook);
      const model = binaryResult(operator, 6, 2);
      const stdout = `${String(model)} ${String(model)} 9 1 key1,right\n`;
      const value = String(model);
      const referenceStdout = `${value} 6 ${value} 2 key1,right,key2\n`;
      const observations = await scriptReferences(source);
      assertMatchingObservations([
        { exitStatus: 0, stderr: "", stdout: referenceStdout },
        ...observations,
      ]);
      logReferenceDiscrepancy(
        "V8 converts an arithmetic compound member key again before PutValue",
        { hook, operator },
        { exitStatus: 0, stderr: "", stdout },
        observations,
      );
      await assertNativeMemberReference(source, stdout);
    }
  },
);

test(
  "generated compound member references convert their key once",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "compound member references apply ToObject, then ToPropertyKey once",
      fc.asyncProperty(memberReferenceArbitrary, assertMemberReferenceCase),
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
          "one to four computed member subjects in sloppy or strict code: " +
          "every arithmetic compound operator over null, undefined, " +
          "number, string, and object bases with counting, throwing, or " +
          "string keys, plus logical, simple, and update controls with " +
          "string keys",
        numRuns: 20,
        profile: "M5 compound member reference order",
        seed: 0x6000_0c01,
        sizeLimit:
          "four subjects, integers in -8..8 or null, and right operands " +
          "in -4..4",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);

/**
 * An asynchronous function suspends between the read and the write, so
 * the converted key and the checked base must survive the await while
 * collection runs at every safepoint. A nullish base still throws before
 * the right operand, and therefore before the await.
 */
const awaitedMemberSource = `const log = [];
const key = {
  toString() {
    log.push("conversion");
    return "value";
  },
};
const holder = { value: 1 };
async function run(base) {
  try {
    const result = base[key] += await (log.push("right"), Promise.resolve(2));
    log.push("value " + result);
  } catch (error) {
    log.push(error instanceof TypeError ? "TypeError" : "other");
  }
}
run(null)
  .then(() => run(undefined))
  .then(() => run(holder))
  .then(() => console.log(log.join(","), holder.value));
`;

test(
  "fixed awaited compound member keeps one converted key",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const stdout = "TypeError,TypeError,conversion,right,value 3 3\n";
    const referenceStdout =
      "TypeError,TypeError,conversion,right,conversion,value 3 3\n";
    const observations = await scriptReferences(awaitedMemberSource);
    assertMatchingObservations([
      { exitStatus: 0, stderr: "", stdout: referenceStdout },
      ...observations,
    ]);
    logReferenceDiscrepancy(
      "V8 converts an arithmetic compound member key again before PutValue",
      { hook: "toString", operator: "+ await" },
      { exitStatus: 0, stderr: "", stdout },
      observations,
    );
    await assertNativeMemberReference(awaitedMemberSource, stdout);
  },
);

/**
 * The BigInt compound member subject that tests/native/fixtures/bigint.ts
 * carried before this node, verbatim. Its key's Symbol.toPrimitive runs
 * once under ECMA-262 2025, so the trace ends "right"; both measured V8
 * hosts convert again before the write and append "key". The first
 * conversion already sees "object " in the trace, so both select "second".
 */
const bigintMemberSource = `let order = "";
const holder = { first: 4n, second: 100n };
const key = {
  [Symbol.toPrimitive]() {
    order += "key ";
    return order === "key " ? "first" : "second";
  },
};
function object() { order += "object "; return holder; }
function right() { order += "right "; return 3n; }
console.log(object()[key] += right(), holder.second, order);
`;

/**
 * tests/native.ts runs every fixture reference after a console prelude that
 * prints each value through the captured `String`, so this subject's BigInts
 * printed as `103` there. The relocated subject keeps that original
 * reference contract; the bare host console would print `103n`. Only the
 * references see the prelude; native compiles the verbatim subject.
 */
const fixtureReferenceConsolePrelude = `const oseoReferenceConsole = console;
const oseoReferenceString = String;
Object.defineProperty(globalThis, "console", {
  value: {
    log(...values) {
      oseoReferenceConsole.log(values.map(oseoReferenceString).join(" "));
    },
  },
});
`;

test(
  "fixed BigInt compound member keeps one converted key",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const stdout = "103 103 object key right \n";
    const referenceStdout = "103 103 object key right key \n";
    const observations = await references(
      fixtureReferenceConsolePrelude +
        `(0, eval)(${JSON.stringify(bigintMemberSource)});\n`,
    );
    assertMatchingObservations([
      { exitStatus: 0, stderr: "", stdout: referenceStdout },
      ...observations,
    ]);
    logReferenceDiscrepancy(
      "V8 converts an arithmetic compound member key again before PutValue",
      { hook: "Symbol.toPrimitive", operator: "+ bigint" },
      { exitStatus: 0, stderr: "", stdout },
      observations,
    );
    await assertNativeMemberReference(bigintMemberSource, stdout);
  },
);

/**
 * An assignment form whose target decides NamedEvaluation: simple and
 * logical assignment (ECMA-262 2025 13.15.2) and an array or object
 * destructuring AssignmentElement with an initializer (13.15.5.5).
 */
type NamingForm = "&&=" | "=" | "??=" | "[=]" | "{=}" | "||=";

/** The stored value: three anonymous definitions or a named function. */
type NamingValue = "arrow" | "class" | "function" | "own";

/** Where the target binding lives; `with` resolves through a fallback. */
type NamingScope = "let" | "var" | "with";

/** One assignment to a fresh binding whose stored value prints its name. */
interface NamingSubject {
  readonly form: NamingForm;
  /** Zero for a bare IdentifierReference, else nested parentheses. */
  readonly parentheses: 0 | 1 | 2;
  readonly scope: NamingScope;
  readonly value: NamingValue;
}

/** A sloppy or strict Script; strict code has no `with` scope. */
interface NamingCase {
  readonly strict: boolean;
  readonly subjects: readonly NamingSubject[];
}

const namingForms: readonly NamingForm[] = [
  "=",
  "&&=",
  "||=",
  "??=",
  "[=]",
  "{=}",
];

function namingSubjectArbitrary(
  scopes: readonly NamingScope[],
): fc.Arbitrary<NamingSubject> {
  return fc.record({
    form: fc.constantFrom(...namingForms),
    parentheses: fc.constantFrom<0 | 1 | 2>(0, 1, 2),
    scope: fc.constantFrom(...scopes),
    value: fc.constantFrom<NamingValue>("function", "arrow", "class", "own"),
  });
}

const namingCaseArbitrary: fc.Arbitrary<NamingCase> = fc.oneof(
  fc.record({
    strict: fc.constant(false),
    subjects: fc.array(namingSubjectArbitrary(["let", "var", "with"]), {
      maxLength: 4,
      minLength: 1,
    }),
  }),
  fc.record({
    strict: fc.constant(true),
    subjects: fc.array(namingSubjectArbitrary(["let", "var"]), {
      maxLength: 4,
      minLength: 1,
    }),
  }),
);

/** The initial value that makes each logical form take its write. */
function namingInitialValue(form: NamingForm): string {
  if (form === "&&=") return "1";
  if (form === "||=") return "0";
  if (form === "??=") return "null";
  return "undefined";
}

function printNamingSubject(subject: NamingSubject, index: number): string {
  const name = `t${index}`;
  const target =
    "(".repeat(subject.parentheses) + name + ")".repeat(subject.parentheses);
  const value = {
    arrow: "() => 0",
    class: "class {}",
    function: "function () {}",
    own: "function own() {}",
  }[subject.value];
  const assignment =
    subject.form === "[=]"
      ? `[${target} = ${value}] = [];`
      : subject.form === "{=}"
        ? `({ key: ${target} = ${value} } = {});`
        : `${target} ${subject.form} ${value};`;
  const declaration =
    `${subject.scope === "let" ? "let" : "var"} ${name} = ` +
    `${namingInitialValue(subject.form)};`;
  const statement =
    subject.scope === "with" ? `with ({}) { ${assignment} }` : assignment;
  return `${declaration}
${statement}
console.log(${index}, "[" + ${name}.name + "]");`;
}

function printNamingCase(testCase: NamingCase): string {
  const subjects = testCase.subjects.map(printNamingSubject);
  return `${testCase.strict ? '"use strict";\n' : ""}${subjects.join("\n")}\n`;
}

/**
 * The independent observation of one subject. IsIdentifierRef is true
 * only for a bare IdentifierReference, never for a ParenthesizedExpression,
 * and NamedEvaluation applies only to an anonymous function or class.
 */
function modelNamingSubject(subject: NamingSubject, index: number): string {
  const name =
    subject.value === "own"
      ? "own"
      : subject.parentheses === 0
        ? `t${index}`
        : "";
  return `${index} [${name}]\n`;
}

function modelNamingCase(testCase: NamingCase): string {
  return testCase.subjects.map(modelNamingSubject).join("");
}

test("assignment naming model names only bare identifier targets", () => {
  const subject: NamingSubject = {
    form: "??=",
    parentheses: 0,
    scope: "let",
    value: "class",
  };
  assert.equal(modelNamingSubject(subject, 3), "3 [t3]\n");
  assert.equal(modelNamingSubject({ ...subject, parentheses: 2 }, 3), "3 []\n");
  assert.equal(
    modelNamingSubject({ ...subject, parentheses: 1, value: "own" }, 3),
    "3 [own]\n",
  );
  assert.equal(
    printNamingSubject({ ...subject, form: "{=}", parentheses: 1 }, 0),
    "let t0 = undefined;\n" +
      "({ key: (t0) = class {} } = {});\n" +
      'console.log(0, "[" + t0.name + "]");',
  );
});

test(
  "generated parenthesized assignment targets leave values unnamed",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "only a bare identifier target names an anonymous assigned value",
      fc.asyncProperty(namingCaseArbitrary, async (testCase) => {
        const source = printNamingCase(testCase);
        const stdout = modelNamingCase(testCase);
        assertMatchingObservations([
          { exitStatus: 0, stderr: "", stdout },
          ...(await scriptReferences(source)),
        ]);
        await assertNativeMemberReference(
          source,
          stdout,
          "generated-m5-assignment-naming.js",
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
          "one to four simple, logical, or array or object destructuring " +
          "assignments in sloppy or strict code to let, var, or with " +
          "fallback bindings through zero, one, or two parentheses, " +
          "storing an anonymous function, arrow, or class or a named " +
          "function",
        numRuns: 10,
        profile: "M5 parenthesized assignment naming",
        seed: 0x6000_0c02,
        sizeLimit: "four subjects and two nested parentheses",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
