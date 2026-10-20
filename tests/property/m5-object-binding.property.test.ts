/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
  printHir,
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

type DeclarationKind = "const" | "let" | "var";
type HintKind = "absent" | "false" | "truthful";
type BindingPatternKind =
  | "computed"
  | "computed-literal"
  | "default"
  | "nested-array"
  | "nested-object"
  | "static";
type SourceKind =
  | "missing"
  | "null"
  | "number"
  | "present"
  | "string"
  | "undefined";

interface ObjectBindingCase {
  readonly declarationKind: DeclarationKind;
  readonly fallback: number;
  readonly hintKind: HintKind;
  readonly nestedAnnotationMatches: boolean;
  readonly patternKind: BindingPatternKind;
  readonly sourceKind: SourceKind;
  readonly value: number;
}

interface ModelResult {
  readonly order: string;
  readonly result: string;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const sharedArbitraries = {
  declarationKind: fc.constantFrom<DeclarationKind>("const", "let", "var"),
  fallback: fc.integer({ max: 20, min: -20 }),
  nestedAnnotationMatches: fc.boolean(),
  sourceKind: fc.constantFrom<SourceKind>(
    "missing",
    "null",
    "number",
    "present",
    "string",
    "undefined",
  ),
  value: fc.integer({ max: 20, min: -20 }),
};
const caseArbitrary: fc.Arbitrary<ObjectBindingCase> = fc.oneof(
  {
    arbitrary: fc.record({
      ...sharedArbitraries,
      hintKind: fc.constantFrom<HintKind>("absent", "false", "truthful"),
      patternKind: fc.constantFrom<BindingPatternKind>(
        "computed",
        "computed-literal",
      ),
    }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      ...sharedArbitraries,
      hintKind: fc.constantFrom<HintKind>("absent", "false", "truthful"),
      patternKind: fc.constantFrom<BindingPatternKind>(
        "default",
        "nested-array",
        "nested-object",
        "static",
      ),
    }),
    weight: 4,
  },
);

function patternSource(testCase: ObjectBindingCase): string {
  let pattern: string;
  if (testCase.patternKind === "static") {
    pattern = "{ value: bound }";
  } else if (testCase.patternKind === "default") {
    const fallback = testCase.fallback;
    pattern = `{ value: bound = (order = order + "d", ${fallback}) }`;
  } else if (testCase.patternKind === "computed") {
    pattern =
      `{ [(order = order + "e", keyObject)]: bound = ` +
      `(order = order + "d", ${testCase.fallback}) }`;
  } else if (testCase.patternKind === "computed-literal") {
    const fallback = testCase.fallback;
    pattern = `{ ["value"]: bound = (order = order + "d", ${fallback}) }`;
  } else if (testCase.patternKind === "nested-array") {
    pattern = `{ nested: [bound = ${testCase.fallback}] = [] }`;
  } else {
    pattern = `{ nested: { value: bound = ${testCase.fallback} } = {} }`;
  }
  if (testCase.hintKind === "absent") return pattern;
  const type = testCase.hintKind === "truthful" ? "number" : "string";
  if (testCase.patternKind === "nested-array") {
    if (!testCase.nestedAnnotationMatches) {
      return `${pattern}: { nested: ${type} }`;
    }
    return `${pattern}: { nested: ${type}[] }`;
  }
  if (testCase.patternKind === "nested-object") {
    if (!testCase.nestedAnnotationMatches) {
      return `${pattern}: { nested: ${type} }`;
    }
    return `${pattern}: { nested: { value: ${type} } }`;
  }
  return `${pattern}: { value: ${type} }`;
}

function sourceValue(testCase: ObjectBindingCase): string {
  if (testCase.sourceKind === "null") return "null";
  if (testCase.sourceKind === "undefined") return "undefined";
  if (testCase.sourceKind === "number") return "1";
  if (testCase.sourceKind === "string") return '"text"';
  if (testCase.sourceKind === "missing") return "{}";
  if (testCase.patternKind === "nested-array") {
    return `{ nested: [${testCase.value}] }`;
  }
  if (testCase.patternKind === "nested-object") {
    return `{ nested: { value: ${testCase.value} } }`;
  }
  return `{ value: ${testCase.value} }`;
}

function printCase(testCase: ObjectBindingCase): string {
  return `
let order = "";
const keyObject = {
  [Symbol.toPrimitive]: function () {
    order = order + "k";
    return "value";
  },
};
function consume(input) {
  ${testCase.declarationKind} ${patternSource(testCase)} = input;
  return bound;
}
try {
  console.log("result", consume(${sourceValue(testCase)}));
} catch (error) {
  console.log("error", error.name);
}
console.log("order", order);
`;
}

function expected(testCase: ObjectBindingCase): ModelResult {
  if (testCase.sourceKind === "null" || testCase.sourceKind === "undefined") {
    return { order: "", result: "error TypeError" };
  }
  const present = testCase.sourceKind === "present";
  let order = testCase.patternKind === "computed" ? "ek" : "";
  let value: number | undefined = present ? testCase.value : undefined;
  if (value === undefined && testCase.patternKind !== "static") {
    value = testCase.fallback;
    if (
      testCase.patternKind === "computed" ||
      testCase.patternKind === "computed-literal"
    ) {
      order += "d";
    }
    if (testCase.patternKind === "default") order += "d";
  }
  return { order, result: `result ${String(value)}` };
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
    "oseo-object-binding-property-",
  );
  const sourcePath = `${directory}/case.ts`;
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

test("object binding model checks nullish inputs before computed keys", () => {
  assert.deepEqual(
    expected({
      declarationKind: "const",
      fallback: 2,
      hintKind: "absent",
      nestedAnnotationMatches: true,
      patternKind: "computed",
      sourceKind: "null",
      value: 1,
    }),
    { order: "", result: "error TypeError" },
  );
});

test(
  "generated object bindings match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "object bindings preserve generated values and property order",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const modeled = expected(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: `${modeled.result}\norder ${modeled.order}\n`,
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-object-binding.ts" },
            { specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.hir != null);
          assert.ok(compiled.mir != null);
          const hir = printHir(compiled.hir);
          if (
            testCase.hintKind === "absent" ||
            testCase.patternKind === "computed" ||
            testCase.patternKind === "computed-literal" ||
            ((testCase.patternKind === "nested-array" ||
              testCase.patternKind === "nested-object") &&
              !testCase.nestedAnnotationMatches)
          ) {
            assert.doesNotMatch(hir, /bound hints=/u);
          } else {
            const type = testCase.hintKind === "truthful" ? "number" : "string";
            assert.match(
              hir,
              new RegExp(`bound hints=\\[typescript:${type}\\]`, "u"),
            );
          }
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
          "const, let, and var object patterns with static, computed " +
          "literal, computed dynamic, defaulted, nested, primitive, and " +
          "nullish inputs plus absent, truthful, or false TypeScript hints; " +
          "computed keys and nested shape mismatches remain unhinted",
        numRuns: 10,
        profile: "M5 object binding declarations",
        seed: 0x6000_2000,
        sizeLimit: "one nested property and bounded integer values",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

type WithEnvironmentKind =
  | "blocked"
  | "has-throws"
  | "hit"
  | "miss"
  | "unscopables-throws";
type WithLeafForm = "declaration" | "sloppy-assignment" | "strict-assignment";
type WithMutation = "add" | "delete" | "none";

/**
 * One keyed object pattern identifier leaf inside a traced `with` object.
 * `form` selects the two shared callers: a sloppy `var` declaration and
 * a destructuring assignment, the latter also from a strict function
 * nested in the `with` body. `environment` fixes what ResolveBinding
 * first finds: no property, an own property, an own property that
 * `@@unscopables` blocks, or a lookup whose `has` trap or `@@unscopables`
 * getter throws. The source getter or the default initializer then adds
 * or deletes that property, which must not change the environment
 * already selected.
 */
interface WithKeyedCase {
  readonly environment: WithEnvironmentKind;
  readonly fallback: number;
  readonly form: WithLeafForm;
  readonly hasDefault: boolean;
  readonly keyKind: "computed" | "static";
  readonly mutation: WithMutation;
  readonly mutationSite: "default" | "getter";
  readonly sourcePresent: boolean;
  readonly value: number;
}

const withCaseArbitrary: fc.Arbitrary<WithKeyedCase> = fc.record({
  environment: fc.constantFrom<WithEnvironmentKind>(
    "blocked",
    "has-throws",
    "hit",
    "miss",
    "unscopables-throws",
  ),
  fallback: fc.integer({ max: 20, min: -20 }),
  form: fc.constantFrom<WithLeafForm>(
    "declaration",
    "sloppy-assignment",
    "strict-assignment",
  ),
  hasDefault: fc.boolean(),
  keyKind: fc.constantFrom("computed" as const, "static" as const),
  mutation: fc.constantFrom<WithMutation>("add", "delete", "none"),
  mutationSite: fc.constantFrom("default" as const, "getter" as const),
  sourcePresent: fc.boolean(),
  value: fc.integer({ max: 20, min: -20 }),
});

function withSetup(environment: WithEnvironmentKind): string {
  if (environment === "miss" || environment === "has-throws") return "";
  const own = 'object.target = "object";';
  if (environment === "blocked") {
    return `${own}\nobject[Symbol.unscopables] = { target: true };`;
  }
  if (environment === "unscopables-throws") {
    return (
      `${own}\nObject.defineProperty(object, Symbol.unscopables, {\n` +
      "  get() {\n" +
      '    log.push("unscopables");\n' +
      '    throw new RangeError("unscopables");\n' +
      "  },\n" +
      "});"
    );
  }
  return own;
}

function withLeafStatement(testCase: WithKeyedCase): string {
  const key = testCase.keyKind === "computed" ? "[keyObject]" : "p";
  const mutateCall = testCase.mutationSite === "default" ? "mutate(), " : "";
  const initializer = testCase.hasDefault
    ? ` = (log.push("default"), ${mutateCall}${testCase.fallback})`
    : "";
  const pattern = `{ ${key}: target${initializer} }`;
  if (testCase.form === "declaration") return `var ${pattern} = source;`;
  if (testCase.form === "sloppy-assignment") return `(${pattern} = source);`;
  return (
    '(function () {\n      "use strict";\n' +
    `      (${pattern} = source);\n    })();`
  );
}

function printWithCase(testCase: WithKeyedCase): string {
  const mutation =
    testCase.mutation === "add"
      ? 'object.target = "added";'
      : testCase.mutation === "delete"
        ? "delete object.target;"
        : "";
  const throwsOnTarget = testCase.environment === "has-throws";
  const hasThrow = 'if (key === "target") throw new RangeError("has");';
  return `
const log = [];
const object = {};
${withSetup(testCase.environment)}
const environment = new Proxy(object, {
  has(target, key) {
    log.push("has:" + String(key));
    ${throwsOnTarget ? hasThrow : ""}
    return Reflect.has(target, key);
  },
});
const keyObject = {
  toString() {
    log.push("key");
    return "p";
  },
};
function mutate() {
  log.push("mutate");
  ${mutation}
}
const source = {
  get p() {
    log.push("get");
    ${testCase.mutationSite === "getter" ? "mutate();" : ""}
    return ${testCase.sourcePresent ? String(testCase.value) : "void 0"};
  },
};
function run() {
  var target = "outer";
  try {
    with (environment) {
      ${withLeafStatement(testCase)}
    }
  } catch (error) {
    log.push(error.name);
  }
  return target;
}
const result = run();
console.log(log.join(" "));
console.log(
  "result",
  String(result),
  "target" in object ? String(object.target) : "absent",
);
`;
}

/**
 * ECMA-262 KeyedBindingInitialization and
 * KeyedDestructuringAssignmentEvaluation for the generated leaf, written
 * independently of the compiler: the source and key run first,
 * ResolveBinding then selects the environment, and only afterward do
 * GetV, the default initializer, and SetMutableBinding on the selection.
 */
function expectedWith(testCase: WithKeyedCase): string {
  const log = ["has:source"];
  let outer = "outer";
  let present =
    testCase.environment !== "miss" && testCase.environment !== "has-throws";
  let objectValue = present ? "object" : "";
  const finish = (): string =>
    `${log.join(" ")}\n` +
    `result ${outer} ${present ? objectValue : "absent"}\n`;
  if (testCase.keyKind === "computed") log.push("has:keyObject", "key");
  log.push("has:target");
  if (testCase.environment === "has-throws") {
    log.push("RangeError");
    return finish();
  }
  if (testCase.environment === "unscopables-throws") {
    log.push("unscopables", "RangeError");
    return finish();
  }
  const selectsObject = testCase.environment === "hit";
  const mutate = (): void => {
    log.push("mutate");
    if (testCase.mutation === "add") {
      present = true;
      objectValue = "added";
    } else if (testCase.mutation === "delete") {
      present = false;
    }
  };
  log.push("get");
  if (testCase.mutationSite === "getter") mutate();
  let value: number | undefined = testCase.sourcePresent
    ? testCase.value
    : undefined;
  if (value === undefined && testCase.hasDefault) {
    log.push("has:log", "default");
    if (testCase.mutationSite === "default") {
      log.push("has:mutate");
      mutate();
    }
    value = testCase.fallback;
  }
  if (!selectsObject) {
    outer = String(value);
    return finish();
  }
  // SetMutableBinding tests the property again. A strict write to a
  // deleted selection throws; a sloppy one recreates the property.
  log.push("has:target");
  if (!present && testCase.form === "strict-assignment") {
    log.push("ReferenceError");
    return finish();
  }
  present = true;
  objectValue = String(value);
  return finish();
}

test("with keyed binding model resolves before GetV and the default", () => {
  const base = {
    fallback: 3,
    hasDefault: true,
    keyKind: "computed",
    mutation: "delete",
    mutationSite: "getter",
    sourcePresent: false,
    value: 1,
  } as const;
  const deleted =
    "has:source has:keyObject key has:target get mutate has:log default " +
    "has:target";
  assert.equal(
    expectedWith({ ...base, environment: "hit", form: "declaration" }),
    `${deleted}\nresult outer 3\n`,
  );
  assert.equal(
    expectedWith({ ...base, environment: "hit", form: "strict-assignment" }),
    `${deleted} ReferenceError\nresult outer absent\n`,
  );
  assert.equal(
    expectedWith({
      ...base,
      environment: "miss",
      form: "sloppy-assignment",
      keyKind: "static",
      mutation: "add",
      mutationSite: "default",
    }),
    "has:source has:target get has:log default has:mutate mutate\n" +
      "result 3 added\n",
  );
  assert.equal(
    expectedWith({
      ...base,
      environment: "unscopables-throws",
      form: "declaration",
    }),
    "has:source has:keyObject key has:target unscopables RangeError\n" +
      "result outer object\n",
  );
});

/**
 * Compile one generated `with` keyed case under both specialization
 * policies and require the independent model's exact observation with
 * collection forced at every safepoint. Node.js and Deno (V8) resolve the
 * leaf after GetV and the default in every generated case, the order that
 * fails the reviewed test262 case, so native execution is compared with
 * the model alone. Counters need observation instrumentation in the MIR.
 */
async function assertWithNative(testCase: WithKeyedCase): Promise<void> {
  const source = printWithCase(testCase);
  const expectedObservation = {
    exitStatus: 0,
    stderr: "",
    stdout: expectedWith(testCase),
  };
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "generated-m5-object-binding-with.js" },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    // Both policies collect at every safepoint, so the retained
    // selection survives the getter's and default's allocations.
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
          if (specialization === "disabled") {
            assert.equal(native.counters.guardHits, 0);
            assert.equal(native.counters.guardMisses, 0);
          }
        },
      );
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }
}

test(
  "a minimized with keyed case reports forced collections",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    // Shrunk counterexample of seed 0x60002001, path 0:0:0:0:0:0:0. Its
    // trace matched the model, but the native run reported no counters
    // because its MIR lacked observation instrumentation.
    await assertWithNative({
      environment: "blocked",
      fallback: 0,
      form: "declaration",
      hasDefault: false,
      keyKind: "computed",
      mutation: "add",
      mutationSite: "default",
      sourcePresent: false,
      value: 0,
    });
  },
);

test(
  "generated with-scoped keyed bindings match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "with-scoped keyed leaves select their environment before GetV",
      fc.asyncProperty(withCaseArbitrary, async (testCase) => {
        await assertWithNative(testCase);
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
          "one keyed object pattern identifier leaf, as a sloppy var " +
          "declaration or a sloppy or strict destructuring assignment, " +
          "with a static or computed key inside a traced with object " +
          "that misses, holds, or unscopables-blocks the name or throws " +
          "from its has trap or unscopables getter, a present or " +
          "undefined source getter, an optional default, and an add, " +
          "delete, or no-op mutation of the binding from the getter or " +
          "the default",
        numRuns: 10,
        profile: "M5 object binding declarations",
        seed: 0x6000_2001,
        sizeLimit: "one keyed leaf, one with object, and bounded integers",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
