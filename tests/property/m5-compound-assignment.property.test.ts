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
  | ReferenceCase
  | {
      readonly hook: string;
      readonly operator: string;
    };

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
        // ECMA-262 2025 GetValue stores the converted key in the Reference
        // and PutValue reuses it, so every member target converts its key
        // once. Before computed-member-reference-key-order, a logical
        // member target that wrote converted it again; this model expected
        // that retained count of 1 + writeCount.
        const conversionCount = memberCount;
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
 * Member writes this arithmetic domain keeps as controls with a primitive
 * string key, whose conversion cannot be observed. The computed member
 * Reference domain below generates them with observable keys.
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
 * A computed member Reference form that computed-member-reference-key-order
 * repairs, beyond the arithmetic compound forms above. `chain` reads a
 * plain link inside an optional chain, `optional` is the optional link
 * itself, and the `super` forms reference the home object's prototype.
 */
type ReferenceForm =
  | "&&="
  | "++x"
  | "--x"
  | "="
  | "??="
  | "call"
  | "chain"
  | "for-in"
  | "for-of"
  | "optional"
  | "read"
  | "super+="
  | "super++"
  | "super-read"
  | "super-array"
  | "super-object"
  | "super||="
  | "x++"
  | "x--"
  | "||=";

/** The ordinary forms, whose base is any of `baseKinds`. */
const ordinaryReferenceForms: readonly ReferenceForm[] = [
  "read",
  "call",
  "&&=",
  "||=",
  "??=",
  "=",
  "x++",
  "++x",
  "x--",
  "--x",
  "chain",
  "optional",
  "for-of",
  "for-in",
];

/** The `super` forms, whose base is a null or ordinary home prototype. */
const superReferenceForms: readonly ReferenceForm[] = [
  "super-read",
  "super-array",
  "super-object",
  "super+=",
  "super||=",
  "super++",
];

/**
 * A key whose conversion is observable, throws, or is unobservable, plus a
 * source literal that takes the literal-key lowering instead.
 */
type ReferenceKeyKind = KeyKind | "literal";

const referenceKeyKinds: readonly ReferenceKeyKind[] = [
  "counting",
  "throwing",
  "string",
  "literal",
];

/** One evaluated computed member Reference, printed as its own block. */
interface ReferenceSubject {
  readonly base: BaseKind;
  readonly form: ReferenceForm;
  readonly key: ReferenceKeyKind;
  readonly left: number | null;
  readonly right: number;
}

/** A sloppy or strict Script that evaluates every subject in order. */
interface ReferenceCase {
  readonly strict: boolean;
  readonly subjects: readonly ReferenceSubject[];
}

const referenceSubjectArbitrary: fc.Arbitrary<ReferenceSubject> = fc.oneof(
  {
    arbitrary: fc.record({
      base: fc.constantFrom(...baseKinds),
      form: fc.constantFrom(...ordinaryReferenceForms),
      key: fc.constantFrom(...referenceKeyKinds),
      left: leftArbitrary,
      right: rightArbitrary,
    }),
    weight: 3,
  },
  {
    arbitrary: fc.record({
      base: fc.constantFrom<BaseKind>("null", "object"),
      form: fc.constantFrom(...superReferenceForms),
      key: fc.constantFrom(...referenceKeyKinds),
      left: leftArbitrary,
      right: rightArbitrary,
    }),
    weight: 1,
  },
);
const referenceCaseArbitrary: fc.Arbitrary<ReferenceCase> = fc.record({
  strict: fc.boolean(),
  subjects: fc.array(referenceSubjectArbitrary, {
    maxLength: 4,
    minLength: 1,
  }),
});

function isSuperForm(form: ReferenceForm): boolean {
  return form.startsWith("super");
}

/** The source of one subject's reference expression. */
function referenceExpression(subject: ReferenceSubject): string {
  const key = subject.key === "literal" ? '"value"' : "getKey()";
  const target = `getBase()[${key}]`;
  const superTarget = `super[${key}]`;
  switch (subject.form) {
    case "read":
      return target;
    case "call":
      return `${target}()`;
    case "&&=":
    case "||=":
    case "??=":
      return `${target} ${subject.form} right()`;
    case "=":
      return `${target} = right()`;
    case "x++":
    case "x--":
      return `${target}${subject.form.slice(1)}`;
    case "++x":
    case "--x":
      return `${subject.form.slice(0, 2)}${target}`;
    case "chain":
      return `({ b: getBase() })?.b[${key}]`;
    case "optional":
      return `getBase()?.[${key}]`;
    case "for-of":
      return `(() => { for (${target} of [right()]); return "done"; })()`;
    case "for-in":
      return `(() => { for (${target} in { p: right() }); return "done"; })()`;
    case "super-array":
      return `([${superTarget}] = values)`;
    case "super-object":
      return `({ p: ${superTarget} } = values)`;
    case "super-read":
      return superTarget;
    case "super+=":
      return `${superTarget} += right()`;
    case "super||=":
      return `${superTarget} ||= right()`;
    case "super++":
      return `${superTarget}++`;
  }
}

/** The block that records one Reference subject's value or error kind. */
function printOutcome(expression: string): string {
  return `  let outcome;
  try {
    outcome = "value " + String(${expression});
  } catch (error) {
    outcome = error instanceof TypeError
      ? "TypeError"
      : error instanceof RangeError ? "RangeError" : "other";
  }`;
}

function printReferenceSubject(
  subject: ReferenceSubject,
  index: number,
): string {
  const key = {
    counting: '{ toString() { log.push("conversion"); return "value"; } }',
    literal: '"value"',
    string: '"value"',
    throwing:
      '{ toString() { log.push("conversion"); ' +
      'throw new RangeError("key"); } }',
  }[subject.key];
  const value =
    subject.form === "call"
      ? 'function () { log.push("call"); ' +
        'return this === holder ? "holder" : typeof this; }'
      : String(subject.left);
  const prelude = `  const log = [];
  const holder = { value: ${value} };
  const key = ${key};
  const getKey = () => { log.push("key"); return key; };
  const right = () => { log.push("right"); return ${subject.right}; };`;
  const destructuring =
    subject.form === "super-array"
      ? `  const values = {
    [Symbol.iterator]() {
      log.push("iterator");
      return {
        next() {
          log.push("next");
          return {
            done: false,
            get value() { log.push("value"); return ${subject.right}; },
          };
        },
        return() { log.push("close"); return {}; },
      };
    },
    toString() { return "values"; },
  };`
      : subject.form === "super-object"
        ? `  const values = {
    get p() { log.push("value"); return ${subject.right}; },
    toString() { return "values"; },
  };`
        : "";
  const stored =
    'typeof holder.value === "function" ? "fn" : String(holder.value)';
  if (isSuperForm(subject.form)) {
    const prototype = subject.base === "null" ? "null" : "holder";
    return `{
${prelude}
${destructuring}
  const home = { run() { return ${referenceExpression(subject)}; } };
  Object.setPrototypeOf(home, ${prototype});
${printOutcome("home.run()")}
  console.log(
    ${index},
    outcome,
    log.join(","),
    ${stored},
    Object.prototype.hasOwnProperty.call(home, "value")
      ? String(home.value)
      : "none",
  );
}`;
  }
  const base = {
    null: "null",
    number: "7",
    object: "holder",
    string: '"s"',
    undefined: "undefined",
  }[subject.base];
  return `{
${prelude}
  const base = ${base};
  const getBase = () => { log.push("base"); return base; };
${printOutcome(referenceExpression(subject))}
  console.log(${index}, outcome, log.join(","), ${stored});
}`;
}

function printReferenceCase(testCase: ReferenceCase): string {
  const subjects = testCase.subjects.map(printReferenceSubject);
  return `${testCase.strict ? '"use strict";\n' : ""}${subjects.join("\n")}\n`;
}

/**
 * The independent ECMA-262 2025 observation of one Reference subject.
 * 13.3.3 and 13.3.7.1 keep the key expression's raw value in the
 * Reference; GetValue and PutValue (6.2.5.5 and 6.2.5.6, step 3.a) apply
 * ToObject to the base before step 3.c converts that value, and the stored
 * key is reused by a later PutValue. A simple assignment and a for-in or
 * for-of head evaluate their value before PutValue; an optional link
 * short-circuits on a nullish base before its key expression (13.3.9.1).
 *
 * `v8` adds the two divergences both measured V8 hosts share: another
 * conversion before every taken compound, logical, or update write, and a
 * `super` key conversion before a null home prototype throws.
 */
function modelReferenceSubject(
  subject: ReferenceSubject,
  index: number,
  strict: boolean,
  v8: boolean,
): string {
  const log: string[] = [];
  const form = subject.form;
  const superForm = isSuperForm(form);
  const callForm = form === "call";
  let stored: number | string | null = callForm ? "fn" : subject.left;
  let homeValue: number | string | undefined;
  const nullish = subject.base === "null" || subject.base === "undefined";
  const keyed = subject.key !== "literal";
  const evaluateBase = () => {
    if (!superForm) log.push("base");
  };
  const evaluateKey = () => {
    if (keyed) log.push("key");
  };
  const convert = () => {
    if (subject.key !== "counting" && subject.key !== "throwing") return;
    log.push("conversion");
    if (subject.key === "throwing") throw new ModeledThrow("RangeError");
  };
  const checkBase = () => {
    if (!nullish) return;
    if (superForm && v8) convert();
    throw new ModeledThrow("TypeError");
  };
  const current = (): number | string | null | undefined => {
    if (subject.base !== "object") return undefined;
    return callForm ? "fn" : subject.left;
  };
  const getValue = () => {
    checkBase();
    convert();
    return current();
  };
  const put = (value: number | string) => {
    if (superForm) homeValue = value;
    else if (subject.base === "object") stored = value;
    else if (strict) throw new ModeledThrow("TypeError");
  };
  const putValue = (value: number | string) => {
    checkBase();
    convert();
    put(value);
  };
  const write = (value: number) => {
    if (v8) convert();
    put(value);
  };
  const evaluate = (): number | string | null | undefined => {
    if (form === "super-array" || form === "super-object") {
      const array = form === "super-array";
      if (array) log.push("iterator");
      evaluateKey();
      if (array) log.push("next");
      log.push("value");
      try {
        putValue(subject.right);
      } finally {
        if (array) log.push("close");
      }
      return "values";
    }
    if (form === "for-of" || form === "for-in") {
      log.push("right");
      evaluateBase();
      evaluateKey();
      putValue(form === "for-in" ? "p" : subject.right);
      return "done";
    }
    if (form === "optional") {
      evaluateBase();
      if (nullish) return undefined;
      evaluateKey();
      return getValue();
    }
    evaluateBase();
    evaluateKey();
    if (form === "=") {
      log.push("right");
      putValue(subject.right);
      return subject.right;
    }
    const value = getValue();
    if (form === "read" || form === "chain" || form === "super-read") {
      return value;
    }
    if (form === "call") {
      if (value !== "fn") throw new ModeledThrow("TypeError");
      log.push("call");
      return "holder";
    }
    if (
      form === "&&=" ||
      form === "||=" ||
      form === "??=" ||
      form === "super||="
    ) {
      const keep =
        form === "&&="
          ? !value
          : form === "??="
            ? value != null
            : Boolean(value);
      if (keep) return value;
      log.push("right");
      write(subject.right);
      return subject.right;
    }
    if (form === "super+=") {
      log.push("right");
      const result = binaryResult("+", Number(value), subject.right);
      write(result);
      return result;
    }
    const old = Number(value);
    const updated = form.includes("+") ? old + 1 : old - 1;
    write(updated);
    return form === "++x" || form === "--x" ? updated : old;
  };
  let outcome: string;
  try {
    outcome = `value ${String(evaluate())}`;
  } catch (error) {
    if (!(error instanceof ModeledThrow)) throw error;
    outcome = error.kind;
  }
  const line = `${index} ${outcome} ${log.join(",")} ${String(stored)}`;
  if (!superForm) return line;
  return `${line} ${homeValue === undefined ? "none" : String(homeValue)}`;
}

function modelReferenceCase(testCase: ReferenceCase, v8: boolean): string {
  return testCase.subjects
    .map(
      (subject, index) =>
        modelReferenceSubject(subject, index, testCase.strict, v8) + "\n",
    )
    .join("");
}

/**
 * Compares both references with the labeled V8 model and native output
 * with the ECMA-262 model, as `assertMemberReferenceCase` does.
 */
async function assertReferenceCase(testCase: ReferenceCase): Promise<void> {
  const source = printReferenceCase(testCase);
  const stdout = modelReferenceCase(testCase, false);
  const referenceStdout = modelReferenceCase(testCase, true);
  const observations = await scriptReferences(source);
  assertMatchingObservations([
    { exitStatus: 0, stderr: "", stdout: referenceStdout },
    ...observations,
  ]);
  if (referenceStdout !== stdout) {
    logReferenceDiscrepancy(
      "V8 converts a computed member key again before PutValue, or " +
        "converts a super key before a null home prototype throws",
      testCase,
      { exitStatus: 0, stderr: "", stdout },
      observations,
    );
  }
  await assertNativeMemberReference(
    source,
    stdout,
    "generated-m5-computed-member-reference.js",
  );
}

test("computed member Reference model orders base, key, and value", () => {
  const subject: ReferenceSubject = {
    base: "null",
    form: "read",
    key: "counting",
    left: 1,
    right: 2,
  };
  assert.equal(
    modelReferenceSubject(subject, 0, false, false),
    "0 TypeError base,key 1",
  );
  assert.equal(
    modelReferenceSubject({ ...subject, form: "=" }, 0, false, false),
    "0 TypeError base,key,right 1",
  );
  assert.equal(
    modelReferenceSubject({ ...subject, form: "optional" }, 0, false, false),
    "0 value undefined base 1",
  );
  assert.equal(
    modelReferenceSubject(
      { ...subject, base: "object", form: "x++" },
      0,
      false,
      false,
    ),
    "0 value 1 base,key,conversion 2",
  );
  assert.equal(
    modelReferenceSubject(
      { ...subject, base: "object", form: "x++" },
      0,
      false,
      true,
    ),
    "0 value 1 base,key,conversion,conversion 2",
  );
  assert.equal(
    modelReferenceSubject({ ...subject, form: "super-read" }, 0, false, false),
    "0 TypeError key 1 none",
  );
  assert.equal(
    modelReferenceSubject({ ...subject, form: "super-read" }, 0, false, true),
    "0 TypeError key,conversion 1 none",
  );
  assert.equal(
    modelReferenceSubject(
      { ...subject, base: "object", form: "super||=", left: 0 },
      0,
      false,
      false,
    ),
    "0 value 2 key,conversion,right 0 2",
  );
  for (const key of ["counting", "throwing"] as const) {
    assert.equal(
      modelReferenceSubject(
        { ...subject, form: "super-array", key },
        0,
        false,
        false,
      ),
      "0 TypeError iterator,key,next,value,close 1 none",
    );
    assert.equal(
      modelReferenceSubject(
        { ...subject, form: "super-object", key },
        0,
        false,
        false,
      ),
      "0 TypeError key,value 1 none",
    );
  }
});

/**
 * Every Reference form over every base its form admits and every key kind,
 * in sloppy and strict code. A form whose outcome depends on the current
 * value, a logical or update form, runs with a falsy, a truthy, and a null
 * one so each logical outcome is taken; every other form only prints it.
 */
function fixedReferenceCases(): readonly ReferenceCase[] {
  const valueForms: ReadonlySet<ReferenceForm> = new Set([
    "&&=",
    "||=",
    "??=",
    "x++",
    "++x",
    "x--",
    "--x",
    "super+=",
    "super||=",
    "super++",
  ]);
  const cases: ReferenceCase[] = [];
  for (const strict of [false, true]) {
    for (const form of [...ordinaryReferenceForms, ...superReferenceForms]) {
      const bases: readonly BaseKind[] = isSuperForm(form)
        ? ["null", "object"]
        : baseKinds;
      const lefts = valueForms.has(form) ? [0, 3, null] : [3];
      cases.push({
        strict,
        subjects: bases.flatMap((base) =>
          referenceKeyKinds.flatMap((key) =>
            lefts.map((left) => ({ base, form, key, left, right: 2 })),
          ),
        ),
      });
    }
  }
  return cases;
}

test(
  "fixed computed member References follow the ECMA-262 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const testCase of fixedReferenceCases()) {
      try {
        await assertReferenceCase(testCase);
      } catch (error) {
        throw new Error(
          `Fixed computed member Reference case ${JSON.stringify(
            testCase.subjects[0]?.form,
          )} strict=${String(testCase.strict)} failed.`,
          { cause: error },
        );
      }
    }
  },
);

/**
 * The changing-key update subject that tests/native/fixtures/bindings.ts
 * carried in update-expressions before this node, verbatim. ECMA-262 2025
 * converts the key once per update and reuses it for the write, so the
 * first update reads and writes "read" and the second, whose single
 * conversion is the key's second, reads and writes "write". Both measured
 * V8 hosts convert again before each write, so each update reads "read"
 * and writes "write".
 */
const changingUpdateSource = `let order = "";
let conversionCount = 0;
const holder = { read: "4", write: 99 };
const changingKey = {
  [Symbol.toPrimitive]: function () {
    conversionCount += 1;
    order += "convert ";
    if (conversionCount % 2 === 1) return "read";
    return "write";
  },
};
function target() {
  order += "object ";
  return holder;
}
function key() {
  order += "key ";
  return changingKey;
}
console.log("member-postfix", target()[key()]--, holder.write, order);
order = "";
console.log("member-prefix", ++target()[key()], holder.write, order);
console.log("conversion-count", conversionCount);
`;

/**
 * The taken logical subject that tests/native/fixtures/bindings.ts carried
 * in compound-assignments before this node, verbatim. ECMA-262 2025
 * converts the key once and writes "read"; both measured V8 hosts convert
 * again before the taken write and store to "write".
 */
const changingLogicalSource = `let logicalConversionCount = 0;
let logicalConversionOrder = "";
const logicalChangingKey = {
  [Symbol.toPrimitive]: function () {
    logicalConversionCount += 1;
    logicalConversionOrder += "key" + logicalConversionCount + " ";
    return logicalConversionCount === 1 ? "read" : "write";
  },
};
const logicalChangingHolder = { read: 0, write: 9 };
function logicalConversionRight() {
  logicalConversionOrder += "right ";
  return 2;
}
const logicalConversionResult =
  logicalChangingHolder[logicalChangingKey] ||= logicalConversionRight();
console.log(
  "logical-conversion",
  logicalConversionResult,
  logicalChangingHolder.read,
  logicalChangingHolder.write,
  logicalConversionCount,
  logicalConversionOrder,
);
`;

test(
  "fixed relocated changing-key subjects convert once against V8",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const subjects = [
      {
        hook: "Symbol.toPrimitive",
        operator: "-- and ++",
        referenceStdout:
          "member-postfix 4 3 object key convert convert \n" +
          "member-prefix 5 5 object key convert convert \n" +
          "conversion-count 4\n",
        source: changingUpdateSource,
        stdout:
          "member-postfix 4 99 object key convert \n" +
          "member-prefix 100 100 object key convert \n" +
          "conversion-count 2\n",
      },
      {
        hook: "Symbol.toPrimitive",
        operator: "||=",
        referenceStdout: "logical-conversion 2 0 2 2 key1 right key2 \n",
        source: changingLogicalSource,
        stdout: "logical-conversion 2 2 9 1 key1 right \n",
      },
    ];
    for (const subject of subjects) {
      const observations = await scriptReferences(subject.source);
      assertMatchingObservations([
        { exitStatus: 0, stderr: "", stdout: subject.referenceStdout },
        ...observations,
      ]);
      logReferenceDiscrepancy(
        "V8 converts a computed member key again before PutValue",
        { hook: subject.hook, operator: subject.operator },
        { exitStatus: 0, stderr: "", stdout: subject.stdout },
        observations,
      );
      await assertNativeMemberReference(subject.source, subject.stdout);
    }
  },
);

/**
 * ForIn/OfBodyEvaluation evaluates the head reference after each step, and
 * an abrupt reference or PutValue closes the iterator before the error
 * propagates. A nullish base throws from PutValue's base check before the
 * key is converted, and a throwing key throws from the conversion; for-in
 * has no iterator to close. ECMA-262 2025 and both V8 hosts agree here.
 */
const iteratorCloseSource = `let log = [];
const key = {
  toString() {
    log.push("conversion");
    return "value";
  },
};
const throwingKey = {
  toString() {
    log.push("conversion");
    throw new RangeError("key");
  },
};
function iterable() {
  let step = 0;
  return {
    [Symbol.iterator]() {
      return {
        next() {
          step += 1;
          log.push("next");
          return { done: step > 2, value: step };
        },
        return() {
          log.push("return");
          return {};
        },
      };
    },
  };
}
function run(label, body) {
  log = [];
  try {
    body();
    log.push("done");
  } catch (error) {
    log.push(error instanceof TypeError
      ? "TypeError"
      : error instanceof RangeError ? "RangeError" : "other");
  }
  console.log(label, log.join(","));
}
const holder = {};
const base = (value) => { log.push("base"); return value; };
const getKey = (value) => { log.push("key"); return value; };
run("of-null", () => { for (base(null)[getKey(key)] of iterable()); });
run("of-object", () => { for (base(holder)[getKey(key)] of iterable()); });
run("of-throwing", () => {
  for (base(holder)[getKey(throwingKey)] of iterable());
});
run("of-abrupt-key", () => {
  for (base(holder)[getKey(key)[Symbol.iterator]()] of iterable());
});
run("in-undefined", () => { for (base(undefined)[getKey(key)] in { p: 1 }); });
console.log("stored", holder.value);
`;

test(
  "fixed for-in and for-of member heads close before their errors",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const stdout =
      "of-null next,base,key,return,TypeError\n" +
      "of-object next,base,key,conversion," +
      "next,base,key,conversion,next,done\n" +
      "of-throwing next,base,key,conversion,return,RangeError\n" +
      "of-abrupt-key next,base,key,return,TypeError\n" +
      "in-undefined base,key,TypeError\n" +
      "stored 2\n";
    const observations = await scriptReferences(iteratorCloseSource);
    assertMatchingObservations([
      { exitStatus: 0, stderr: "", stdout },
      ...observations,
    ]);
    await assertNativeMemberReference(iteratorCloseSource, stdout);
  },
);

/**
 * GetValue keeps a primitive base as the receiver: a getter and a method
 * found on its prototype see the primitive itself in strict code, and a
 * logical member assignment whose current value is truthy writes nothing.
 * An inherited setter on a primitive's prototype chain stays outside this
 * case, because the native primitive-base store rejects before it looks
 * for one, which PLAN-M5.md records under Compound member key order.
 */
const primitiveReceiverSource = `"use strict";
const seen = [];
const key = {
  toString() {
    seen.push("conversion");
    return "probe";
  },
};
Object.defineProperty(Number.prototype, "probe", {
  configurable: true,
  get() { return typeof this; },
});
String.prototype.probe = function () { return typeof this; };
console.log("get", (7)[key]);
(7)[key] ||= 2;
console.log("call", "s"[key]());
console.log("optional", (7)?.[key]);
console.log(seen.join(","));
delete Number.prototype.probe;
delete String.prototype.probe;
`;

test(
  "fixed computed member References keep a primitive receiver",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const stdout =
      "get number\n" +
      "call string\n" +
      "optional number\n" +
      "conversion,conversion,conversion,conversion\n";
    const observations = await scriptReferences(primitiveReceiverSource);
    assertMatchingObservations([
      { exitStatus: 0, stderr: "", stdout },
      ...observations,
    ]);
    await assertNativeMemberReference(primitiveReceiverSource, stdout);
  },
);

/**
 * The diagnostic of a nullish computed member Reference. Its base check
 * reuses the assignment-target RequireObjectCoercible operation, so a key
 * other than a primitive literal reports that operation's message, while a
 * literal key keeps the property operation's own message. ECMA-262 2025
 * leaves the message implementation-defined, so this compares the native
 * output under both policies with fixed text and runs no reference host.
 */
const nullishDiagnosticSource = `const key = { toString() { return "value"; } };
function message(run) {
  try {
    run();
    return "none";
  } catch (error) {
    return error.constructor.name + ": " + error.message;
  }
}
const base = null;
const home = { read() { return super[key]; } };
Object.setPrototypeOf(home, null);
const forms = [
  ["read", () => base[key]],
  ["call", () => base[key]()],
  ["logical", () => (base[key] ||= 1)],
  ["simple", () => (base[key] = 1)],
  ["update", () => base[key]++],
  ["chain", () => ({ b: base })?.b[key]],
  ["for-of", () => { for (base[key] of [1]); }],
  ["super", () => home.read()],
  ["literal-read", () => base["value"]],
  ["literal-write", () => (base["value"] = 1)],
];
for (const [label, run] of forms) console.log(label, message(run));
`;

test(
  "fixed nullish computed member References report one diagnostic",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const checked = "TypeError: Cannot destructure a nullish value.";
    const stdout =
      ["read", "call", "logical", "simple", "update", "chain", "for-of"]
        .map((label) => `${label} ${checked}\n`)
        .join("") +
      `super ${checked}\n` +
      "literal-read TypeError: Cannot read properties of a nullish value.\n" +
      "literal-write TypeError: Cannot set properties of a nullish or " +
      "primitive value.\n";
    await assertNativeMemberReference(nullishDiagnosticSource, stdout);
  },
);

test(
  "generated computed member References check the base, then convert once",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "computed member References apply ToObject, then ToPropertyKey once",
      fc.asyncProperty(referenceCaseArbitrary, assertReferenceCase),
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
          "one to four computed member References in sloppy or strict " +
          "code: reads, method calls, logical and simple assignment, " +
          "prefix and postfix update, plain and optional chain links, and " +
          "for-of and for-in heads over null, undefined, number, string, " +
          "and object bases, plus super reads, +=, ||=, and ++ over a null " +
          "or ordinary home prototype, array and object super " +
          "destructuring with value acquisition and iterator closing, " +
          "each with counting, throwing, " +
          "string, or literal keys",
        numRuns: 20,
        profile: "M5 computed member Reference order",
        seed: 0x6000_0c03,
        sizeLimit:
          "four subjects, integers in -8..8 or null, and right operands " +
          "in -4..4",
        timeLimitMilliseconds: 240_000,
      },
    );
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
