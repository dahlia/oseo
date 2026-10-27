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

import {
  modelMemberSubject,
  modelReferenceSubject,
  host,
  caseArbitrary,
  logReferenceDiscrepancy,
  binaryResult,
  expected,
  printCase,
  references,
  arithmeticOperators,
  memberReferenceArbitrary,
  scriptReferences,
  assertNativeMemberReference,
  assertMemberReferenceCase,
  changingKeySource,
  awaitedMemberSource,
  bigintMemberSource,
  fixtureReferenceConsolePrelude,
  referenceCaseArbitrary,
  assertReferenceCase,
  changingUpdateSource,
  changingLogicalSource,
  iteratorCloseSource,
  primitiveReceiverSource,
  nullishDiagnosticSource,
  namingCaseArbitrary,
  printNamingSubject,
  printNamingCase,
  modelNamingSubject,
  modelNamingCase,
} from "./compound-assignment-support.ts";

import type {
  MemberSubject,
  ReferenceSubject,
  NamingSubject,
} from "./compound-assignment-support.ts";

const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

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
