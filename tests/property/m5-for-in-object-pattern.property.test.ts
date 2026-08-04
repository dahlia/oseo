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

/** How the head declares or assigns the object pattern's leaves. */
type HeadKind = "assignment" | "const" | "let" | "var";

/**
 * One AssignmentProperty or BindingProperty name. A computed form
 * evaluates a logged call, so the generated observation records where
 * ForIn/OfBodyEvaluation runs the name relative to the enumeration step
 * and to the property read that follows it.
 */
type KeyForm =
  | "computed-index"
  | "computed-length"
  | "computed-missing"
  | "static-index"
  | "static-length"
  | "static-missing";

/** What the property stores into: a binding, a member, or a nested pattern. */
type LeafKind = "identifier" | "member" | "nested";

type SubjectKind =
  | "empty"
  | "null"
  | "number"
  | "pair"
  | "single"
  | "string"
  | "undefined";

interface PropertySpec {
  readonly defaulted: boolean;
  readonly key: KeyForm;
  readonly leaf: LeafKind;
}

interface PatternCase {
  readonly head: HeadKind;
  readonly properties: readonly PropertySpec[];
  readonly rest: boolean;
  readonly subject: SubjectKind;
}

/** A modeled property value: a string, a number, or absent. */
type ModelValue = number | string | undefined;

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const propertyArbitrary: fc.Arbitrary<PropertySpec> = fc.record({
  defaulted: fc.boolean(),
  key: fc.constantFrom(
    "computed-index" as const,
    "computed-length" as const,
    "computed-missing" as const,
    "static-index" as const,
    "static-length" as const,
    "static-missing" as const,
  ),
  leaf: fc.constantFrom(
    "identifier" as const,
    "member" as const,
    "nested" as const,
  ),
});

const caseArbitrary: fc.Arbitrary<PatternCase> = fc.record({
  head: fc.constantFrom(
    "assignment" as const,
    "const" as const,
    "let" as const,
    "var" as const,
  ),
  properties: fc
    .array(propertyArbitrary, { maxLength: 3, minLength: 1 })
    .map((properties) => properties as readonly PropertySpec[]),
  rest: fc.boolean(),
  subject: fc.constantFrom(
    "empty" as const,
    "null" as const,
    "number" as const,
    "pair" as const,
    "single" as const,
    "string" as const,
    "undefined" as const,
  ),
});

/** The property name a key form evaluates to. */
function keyName(form: KeyForm): string {
  if (form === "computed-index" || form === "static-index") return "0";
  if (form === "computed-length" || form === "static-length") return "length";
  return "zz";
}

function isComputed(form: KeyForm): boolean {
  return form.startsWith("computed");
}

/**
 * A member leaf is a LeftHandSideExpression, which only an
 * ObjectAssignmentPattern head admits; a declaration head binds
 * identifiers, so it takes the identifier leaf instead of losing the case.
 */
function effectiveLeaf(head: HeadKind, leaf: LeafKind): LeafKind {
  return leaf === "member" && head !== "assignment" ? "identifier" : leaf;
}

/**
 * `GetV` of the modeled value, restricted to what this realm answers for
 * a primitive: a String exotic object owns `length` and one index per
 * code unit, and no other primitive owns or inherits a property the
 * generated names can reach.
 */
function getV(value: ModelValue, name: string): ModelValue {
  if (typeof value !== "string") return undefined;
  if (name === "length") return value.length;
  if (name === "0") return value.length > 0 ? value[0] : undefined;
  return undefined;
}

function text(value: ModelValue): string {
  return value === undefined ? "undefined" : String(value);
}

/** The keys EnumerateObjectProperties reports for each generated subject. */
function enumeratedKeys(subject: SubjectKind): readonly string[] {
  if (subject === "single") return ["ab"];
  if (subject === "pair") return ["ab", "cde"];
  if (subject === "string") return ["0", "1"];
  return [];
}

function subjectSource(subject: SubjectKind): string {
  if (subject === "single") return "{ ab: 1 }";
  if (subject === "pair") return "{ ab: 1, cde: 2 }";
  if (subject === "string") return '"xy"';
  if (subject === "empty") return "{}";
  if (subject === "number") return "7";
  return subject === "null" ? "null" : "undefined";
}

/**
 * The independent oracle: ForIn/OfBodyEvaluation's per-iteration
 * destructuring applied to each enumerated key, transcribed from
 * ECMA-262 rather than from any compiler structure. Each iteration
 * requires the key to be object-coercible, evaluates every property name
 * from left to right, reads it with `GetV`, applies a default only to
 * `undefined`, and copies the remaining own enumerable index properties
 * into the rest object. An abrupt nested pattern leaves the loop through
 * the enclosing transfer, so no later key is reported.
 */
function model(testCase: PatternCase): string {
  const parts: string[] = [];
  let threw = false;
  for (const key of enumeratedKeys(testCase.subject)) {
    const excluded: string[] = [];
    const values: ModelValue[] = [];
    let abrupt = false;
    for (const property of testCase.properties) {
      const name = keyName(property.key);
      if (isComputed(property.key)) parts.push(`k:${name}`);
      excluded.push(name);
      let value = getV(key, name);
      if (value === undefined && property.defaulted) value = "D";
      if (effectiveLeaf(testCase.head, property.leaf) === "nested") {
        if (value === undefined) {
          abrupt = true;
          break;
        }
        value = getV(value, "length");
      }
      values.push(value);
    }
    if (abrupt) {
      threw = true;
      break;
    }
    parts.push("i");
    values.forEach((value, index) => parts.push(`v${index}:${text(value)}`));
    if (testCase.rest) {
      const remaining = [...key]
        .map((_, index) => String(index))
        .filter((index) => !excluded.includes(index));
      const slot = (index: string): string =>
        remaining.includes(index) ? (key[Number(index)] ?? "") : "undefined";
      parts.push(
        `r:${remaining.length}:${slot("0")},${slot("1")},${slot("2")}`,
      );
    }
  }
  parts.push(threw ? "E:true" : "done");
  return `${parts.map((part) => `${part}|`).join("")}\n`;
}

/** The pattern text and the body reads that observe each stored value. */
function patternSource(testCase: PatternCase): {
  readonly pattern: string;
  readonly reads: readonly string[];
} {
  const properties: string[] = [];
  const reads: string[] = [];
  testCase.properties.forEach((property, index) => {
    const name = keyName(property.key);
    const key = isComputed(property.key)
      ? `[key(${JSON.stringify(name)})]`
      : JSON.stringify(name);
    const leaf = effectiveLeaf(testCase.head, property.leaf);
    const target =
      leaf === "member"
        ? `holder.p${index}`
        : leaf === "nested"
          ? `{ "length": t${index} }`
          : `t${index}`;
    const initializer = property.defaulted ? ' = "D"' : "";
    properties.push(`${key}: ${target}${initializer}`);
    const read = leaf === "member" ? `holder.p${index}` : `t${index}`;
    reads.push(`note("v${index}:" + ${read});`);
  });
  if (testCase.rest) {
    properties.push("...r");
    reads.push(
      'note("r:" + Object.keys(r).length + ":" + r[0] + "," + r[1] + ' +
        '"," + r[2]);',
    );
  }
  return { pattern: `{ ${properties.join(", ")} }`, reads };
}

function printCase(testCase: PatternCase): string {
  const { pattern, reads } = patternSource(testCase);
  const declared: string[] = [];
  if (testCase.head === "assignment") {
    const names = testCase.properties
      .map((property, index) =>
        effectiveLeaf(testCase.head, property.leaf) === "member"
          ? undefined
          : `t${index}`,
      )
      .filter((name) => name != null);
    if (testCase.rest) names.push("r");
    if (names.length > 0) declared.push(`let ${names.join(", ")};`);
  }
  const head =
    testCase.head === "assignment" ? pattern : `${testCase.head} ${pattern}`;
  return `
let log = "";
function note(part) { log = log + part + "|"; }
function key(name) { note("k:" + name); return name; }
const holder = {};
${declared.join("\n")}
try {
  for (${head} in ${subjectSource(testCase.subject)}) {
    note("i");
    ${reads.join("\n    ")}
  }
  note("done");
} catch (error) {
  note("E:" + (error instanceof TypeError));
}
console.log(log);
`;
}

async function references(source: string): Promise<
  readonly {
    readonly exitStatus: number;
    readonly stderr: string;
    readonly stdout: string;
  }[]
> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-for-in-object-pattern-property-",
  );
  const sourcePath = `${directory}/case.js`;
  try {
    await host.writeTextFile(sourcePath, source);
    return [
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
    ];
  } finally {
    await host.remove(directory);
  }
}

test("the object pattern for-in model applies the specified head rules", () => {
  assert.equal(
    model({
      head: "const",
      properties: [
        { defaulted: false, key: "static-length", leaf: "identifier" },
      ],
      rest: false,
      subject: "null",
    }),
    "done|\n",
  );
  assert.equal(
    model({
      head: "const",
      properties: [
        { defaulted: false, key: "computed-index", leaf: "identifier" },
        { defaulted: true, key: "static-missing", leaf: "identifier" },
      ],
      rest: false,
      subject: "single",
    }),
    "k:0|i|v0:a|v1:D|done|\n",
  );
  assert.equal(
    model({
      head: "const",
      properties: [{ defaulted: false, key: "static-missing", leaf: "nested" }],
      rest: false,
      subject: "single",
    }),
    "E:true|\n",
  );
  assert.equal(
    model({
      head: "const",
      properties: [
        { defaulted: false, key: "static-index", leaf: "identifier" },
      ],
      rest: true,
      subject: "single",
    }),
    "i|v0:a|r:1:undefined,b,undefined|done|\n",
  );
});

test(
  "generated object pattern for-in heads match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "a for-in object pattern head destructures every enumerated key",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: model(testCase),
        };
        const referenceResults = await references(source);
        assertMatchingObservations([expectedObservation, ...referenceResults]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-for-in-object-pattern.js" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          assert.match(mir, /enumerate-get EnumerateObjectProperties/u);
          assert.match(mir, /object-coercible RequireObjectCoercible/u);
          // An object pattern head acquires no iterator, so no head or
          // body completion can close one.
          assert.doesNotMatch(mir, /iterator-close/u);
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
                assertMatchingObservations([expectedObservation, native]);
                assert.ok(native.counters != null);
                assert.ok(native.counters.collections > 0);
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
          "for-in object pattern heads of one to three properties with " +
          "static and computed present, absent, and index names, optional " +
          "defaults, identifier, member, and nested pattern leaves, and an " +
          "optional rest property, through const, let, var, and assignment " +
          "heads, over object, empty object, string, number, null, and " +
          "undefined subjects",
        numRuns: 24,
        profile: "M5 for-in object pattern head",
        seed: 0x5eed_0030,
        sizeLimit: "three properties over at most two enumerated keys",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
