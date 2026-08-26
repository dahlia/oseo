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

/*
 * One generated conversion member. `absent` leaves the property off the
 * generated object, so the lookup either reaches the realm-owned
 * %Object.prototype% method or, under a null prototype, finds nothing.
 * The remaining kinds are own properties: a non-callable value the
 * specification skips (or, for @@toPrimitive, rejects), a method whose
 * result is an object and therefore not a primitive, a method that
 * throws, and a method returning one generated primitive.
 */
type MemberKind =
  | "absent"
  | "noncallable"
  | "object"
  | "number"
  | "string"
  | "throw";

interface Member {
  readonly kind: MemberKind;
  readonly number: number;
  readonly text: string;
}

/** @@toPrimitive additionally admits an explicit null, which is skipped. */
type ExoticKind = MemberKind | "null";

interface Exotic {
  readonly kind: ExoticKind;
  readonly number: number;
  readonly text: string;
}

type TagKind = "absent" | "number" | "string";

interface Tag {
  readonly kind: TagKind;
  readonly text: string;
}

type Hint = "default" | "number" | "string";

interface CoercionCase {
  readonly exotic: Exotic;
  readonly hint: Hint;
  readonly nullPrototype: boolean;
  readonly tag: Tag;
  readonly toStringMember: Member;
  readonly valueOfMember: Member;
}

/*
 * Generated primitive text stays a non-empty run of ASCII letters so the
 * oracle's ToNumber is always NaN: an empty string converts to +0 and a
 * digit run to its value, and neither adds a distinct conversion path
 * that this domain is measuring.
 */
const textArbitrary = fc.string({
  maxLength: 5,
  minLength: 1,
  unit: fc.constantFrom("a", "b", "z", "A", "Q"),
});

const memberArbitrary: fc.Arbitrary<Member> = fc.record({
  kind: fc.constantFrom<MemberKind>(
    "absent",
    "noncallable",
    "object",
    "number",
    "string",
    "throw",
  ),
  number: fc.integer({ max: 99, min: -99 }),
  text: textArbitrary,
});

const exoticArbitrary: fc.Arbitrary<Exotic> = fc.record({
  kind: fc.constantFrom<ExoticKind>(
    "absent",
    "absent",
    "null",
    "noncallable",
    "object",
    "number",
    "string",
    "throw",
  ),
  number: fc.integer({ max: 99, min: -99 }),
  text: textArbitrary,
});

const caseArbitrary: fc.Arbitrary<CoercionCase> = fc.record({
  exotic: exoticArbitrary,
  hint: fc.constantFrom<Hint>("default", "number", "string"),
  nullPrototype: fc.boolean(),
  tag: fc.record({
    kind: fc.constantFrom<TagKind>("absent", "number", "string"),
    text: textArbitrary,
  }),
  toStringMember: memberArbitrary,
  valueOfMember: memberArbitrary,
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/*
 * The independent oracle walks the specification text directly: GetMethod
 * on @@toPrimitive, then OrdinaryToPrimitive over the hint-ordered method
 * pair, then Object.prototype.toString's builtinTag and @@toStringTag
 * composition. It shares no code with runtime_primitive.c or
 * runtime_object_builtin.c, so a disagreement is a real divergence rather
 * than a shared helper reused on both sides.
 */
type Primitive =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "string"; readonly value: string };

type Outcome =
  | { readonly error: "range" | "type"; readonly kind: "error" }
  | { readonly kind: "value"; readonly value: Primitive };

function memberPrimitive(member: Member): Primitive {
  return member.kind === "number"
    ? { kind: "number", value: member.number }
    : { kind: "string", value: member.text };
}

/** Object.prototype.toString over an ordinary generated receiver. */
function defaultTagText(testCase: CoercionCase): string {
  const tag = testCase.tag.kind === "string" ? testCase.tag.text : "Object";
  return `[object ${tag}]`;
}

function ordinaryToPrimitive(testCase: CoercionCase, hint: Hint): Outcome {
  const toStringStep = {
    isToString: true,
    member: testCase.toStringMember,
  } as const;
  const valueOfStep = {
    isToString: false,
    member: testCase.valueOfMember,
  } as const;
  const order =
    hint === "string"
      ? ([toStringStep, valueOfStep] as const)
      : ([valueOfStep, toStringStep] as const);
  for (const { isToString, member } of order) {
    if (member.kind === "absent") {
      // A null prototype reaches no inherited method at all, and the
      // inherited valueOf returns its object receiver, which is never a
      // primitive, so both fall through to the next method.
      if (testCase.nullPrototype || !isToString) continue;
      return {
        kind: "value",
        value: { kind: "string", value: defaultTagText(testCase) },
      };
    }
    if (member.kind === "noncallable" || member.kind === "object") continue;
    if (member.kind === "throw") return { error: "range", kind: "error" };
    return { kind: "value", value: memberPrimitive(member) };
  }
  return { error: "type", kind: "error" };
}

function toPrimitive(testCase: CoercionCase): Outcome {
  const exotic = testCase.exotic;
  if (exotic.kind !== "absent" && exotic.kind !== "null") {
    if (exotic.kind === "noncallable" || exotic.kind === "object") {
      return { error: "type", kind: "error" };
    }
    if (exotic.kind === "throw") return { error: "range", kind: "error" };
    return {
      kind: "value",
      value:
        exotic.kind === "number"
          ? { kind: "number", value: exotic.number }
          : { kind: "string", value: exotic.text },
    };
  }
  return ordinaryToPrimitive(
    testCase,
    testCase.hint === "default" ? "number" : testCase.hint,
  );
}

/** ToString over the primitives this domain generates. */
function primitiveText(value: Primitive): string {
  return value.kind === "number" ? `${value.value}` : value.value;
}

/** ToNumber over the primitives this domain generates. */
function primitiveNumber(value: Primitive): string {
  return value.kind === "number" ? `${value.value}` : "NaN";
}

function memberSource(name: string, member: Member): string {
  if (member.kind === "absent") return "";
  if (member.kind === "noncallable") return `target.${name} = 1;\n`;
  if (member.kind === "object") {
    return `target.${name} = function () { return {}; };\n`;
  }
  if (member.kind === "throw") {
    return `target.${name} = function () { throw new RangeError("x"); };\n`;
  }
  const value =
    member.kind === "number" ? `${member.number}` : JSON.stringify(member.text);
  return `target.${name} = function () { return ${value}; };\n`;
}

function exoticSource(exotic: Exotic): string {
  if (exotic.kind === "absent") return "";
  if (exotic.kind === "null") return "target[Symbol.toPrimitive] = null;\n";
  if (exotic.kind === "noncallable") {
    return "target[Symbol.toPrimitive] = 1;\n";
  }
  if (exotic.kind === "object") {
    return "target[Symbol.toPrimitive] = function () { return {}; };\n";
  }
  if (exotic.kind === "throw") {
    return (
      "target[Symbol.toPrimitive] = " +
      'function () { throw new RangeError("x"); };\n'
    );
  }
  const value =
    exotic.kind === "number" ? `${exotic.number}` : JSON.stringify(exotic.text);
  return `target[Symbol.toPrimitive] = function () { return ${value}; };\n`;
}

function tagSource(tag: Tag): string {
  if (tag.kind === "absent") return "";
  const value = tag.kind === "number" ? "5" : JSON.stringify(tag.text);
  return `target[Symbol.toStringTag] = ${value};\n`;
}

function operation(hint: Hint): string {
  if (hint === "string") return "String(target)";
  if (hint === "number") return "+target";
  return 'target + ""';
}

/** typeof the toString reference the hinted specialized read observes. */
function hintedTypeof(testCase: CoercionCase): string {
  const member = testCase.toStringMember;
  if (member.kind === "noncallable") return "number";
  if (member.kind !== "absent") return "function";
  return testCase.nullPrototype ? "undefined" : "function";
}

function printCase(testCase: CoercionCase): string {
  const prototype = testCase.nullPrototype ? "null" : "Object.prototype";
  return `
const target = Object.create(${prototype});
${exoticSource(testCase.exotic)}${memberSource(
    "valueOf",
    testCase.valueOfMember,
  )}${memberSource("toString", testCase.toStringMember)}${tagSource(
    testCase.tag,
  )}try {
  console.log("value", ${operation(testCase.hint)});
} catch (error) {
  console.log(
    "value",
    "threw",
    error instanceof RangeError
      ? "range"
      : error instanceof TypeError
        ? "type"
        : "other",
  );
}
/** @param {object} value */
function hinted(value) { return typeof value.toString; }
console.log("hint", hinted(target), hinted(target), hinted({ marker: 1 }));
`;
}

interface ExpectedObservation {
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}

function expectedObservation(testCase: CoercionCase): ExpectedObservation {
  const outcome = toPrimitive(testCase);
  const rendered =
    outcome.kind === "error"
      ? `threw ${outcome.error}`
      : testCase.hint === "number"
        ? primitiveNumber(outcome.value)
        : primitiveText(outcome.value);
  const observed = hintedTypeof(testCase);
  return {
    exitStatus: 0,
    stderr: "",
    stdout: [
      `value ${rendered}`,
      `hint ${observed} ${observed} function`,
      "",
    ].join("\n"),
  };
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory(
    "oseo-generic-string-coercion-",
  );
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
  expected: ExpectedObservation,
): Promise<void> {
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "generated-m5-generic-string-coercion.ts" },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const mir = printMir(compiled.mir);
    if (specialization === "enabled") {
      assert.match(mir, /guard-object/u);
      assert.match(mir, /guard-shape/u);
      assert.match(mir, /property-get generic/u);
    } else {
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
          if (specialization === "enabled") {
            // The generated target and the plain marker object never
            // share a shape, so the specialized `toString` read always
            // reaches the compiled generic fallback at least once.
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
  "generated generic string coercion agrees with the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "ToPrimitive over generated conversion shapes agrees",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expected = expectedObservation(testCase);
        assertMatchingObservations([expected, ...(await references(source))]);
        await observeNative(source, expected);
      }),
      {
        context: propertyContext(),
        domain:
          "an ordinary or null-prototype object carrying independently " +
          "generated @@toPrimitive, valueOf, and toString members drawn " +
          "from absent, non-callable, object-returning, throwing, " +
          "number-returning, and string-returning shapes, an explicit " +
          "null @@toPrimitive, an absent, string, or non-string " +
          "@@toStringTag, and the string, number, and default hints " +
          "reached through String, unary plus, and string addition; a " +
          "hinted specialized toString read with a shape-guard miss",
        numRuns: 12,
        profile: "M5 generic string coercion",
        seed: 0x6000_5300,
        sizeLimit:
          "one prototype, three conversion members, one tag, one hint, " +
          "one conversion observation, and three hinted reads",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
