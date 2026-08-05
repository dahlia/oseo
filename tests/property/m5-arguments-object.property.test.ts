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

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

interface ArgumentsObjectCase {
  readonly arguments: readonly number[];
  readonly readIndex: number;
  readonly replacement: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const caseArbitrary: fc.Arbitrary<ArgumentsObjectCase> = fc.record({
  arguments: fc.array(fc.integer({ max: 20, min: -20 }), { maxLength: 6 }),
  readIndex: fc.integer({ max: 7, min: 0 }),
  replacement: fc.integer({ max: 20, min: -20 }),
});

function printed(value: number | undefined): string {
  return value == null ? "undefined" : String(value);
}

function printCase(testCase: ArgumentsObjectCase): string {
  return `
function inspect() {
  const first = arguments[0];
  console.log(
    arguments.length,
    arguments[${testCase.readIndex}],
    arguments.callee === inspect,
  );
  arguments[0] = ${testCase.replacement};
  console.log(first, arguments[0], arguments.length);
  return arguments;
}
const first = inspect(${testCase.arguments.join(", ")});
const second = inspect(${testCase.arguments.join(", ")});
console.log(first === second);
`;
}

function expected(testCase: ArgumentsObjectCase): string {
  const first = testCase.arguments[0];
  const observation =
    `${testCase.arguments.length} ` +
    `${printed(testCase.arguments[testCase.readIndex])} true\n` +
    `${printed(first)} ${testCase.replacement} ` +
    `${testCase.arguments.length}\n`;
  return observation + observation + "false\n";
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
    "oseo-arguments-object-property-",
  );
  const sourcePath = `${directory}/case.js`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      `new Function(${JSON.stringify(source)})();\n`,
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

test("arguments object model keeps call snapshots independent", () => {
  assert.equal(
    expected({ arguments: [1, 2], readIndex: 1, replacement: 3 }),
    "2 2 true\n1 3 2\n2 2 true\n1 3 2\nfalse\n",
  );
});

test(
  "generated arguments objects match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "arguments objects snapshot indices, length, callee, and identity",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-arguments-object.js" },
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
          "zero to six bounded integer arguments, a bounded read index, " +
          "and a bounded replacement value",
        numRuns: 10,
        profile: "M5 arguments object",
        seed: 0x6000_0300,
        sizeLimit: "six arguments and an index from zero through seven",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

/**
 * A non-strict simple parameter list now selects the mapped arguments
 * exotic object instead of the unmapped snapshot above. This domain
 * covers two-way parameter aliasing, only-supplied mapping, a
 * duplicate formal name mapping only its rightmost occurrence, and
 * every severing transition 10.4.4.2 admits: deletion, an explicit
 * non-writable redefinition, and conversion to an accessor.
 */
type SeverMode = "accessor" | "delete" | "none" | "writable-false";

interface MappedArgumentsCase {
  readonly duplicateLast: boolean;
  readonly paramCount: number;
  readonly replacement1: number;
  readonly replacement2: number;
  readonly severMode: SeverMode;
  readonly suppliedValues: readonly number[];
  readonly writeIndex: number;
}

const ACCESSOR_MARKER = 999_999;

const mappedCaseArbitrary: fc.Arbitrary<MappedArgumentsCase> = fc.record({
  duplicateLast: fc.boolean(),
  paramCount: fc.integer({ max: 3, min: 1 }),
  replacement1: fc.integer({ max: 500, min: 100 }),
  replacement2: fc.integer({ max: 999, min: 501 }),
  severMode: fc.constantFrom<SeverMode>(
    "accessor",
    "delete",
    "none",
    "writable-false",
  ),
  suppliedValues: fc.array(fc.integer({ max: 20, min: -20 }), {
    maxLength: 5,
  }),
  writeIndex: fc.integer({ max: 4, min: 0 }),
});

function isShadowedMappedParameter(
  testCase: MappedArgumentsCase,
  index: number,
): boolean {
  return testCase.duplicateLast && testCase.paramCount >= 2 && index === 0;
}

function mappedParameterName(
  testCase: MappedArgumentsCase,
  index: number,
): string {
  return isShadowedMappedParameter(testCase, index) ||
    (testCase.duplicateLast &&
      testCase.paramCount >= 2 &&
      index === testCase.paramCount - 1)
    ? "p0"
    : `p${index}`;
}

function isMappedInitially(
  testCase: MappedArgumentsCase,
  index: number,
): boolean {
  return (
    index < testCase.paramCount &&
    index < testCase.suppliedValues.length &&
    !isShadowedMappedParameter(testCase, index)
  );
}

function initialParameterValue(
  testCase: MappedArgumentsCase,
  index: number,
): number | undefined {
  const effectiveIndex = isShadowedMappedParameter(testCase, index)
    ? testCase.paramCount - 1
    : index;
  return effectiveIndex < testCase.suppliedValues.length
    ? testCase.suppliedValues[effectiveIndex]
    : undefined;
}

function severStatement(testCase: MappedArgumentsCase): string {
  switch (testCase.severMode) {
    case "accessor":
      return (
        `Object.defineProperty(arguments, ${testCase.writeIndex}, ` +
        `{ configurable: true, get() { return ${ACCESSOR_MARKER}; } });`
      );
    case "delete":
      return `delete arguments[${testCase.writeIndex}];`;
    case "writable-false":
      return (
        `Object.defineProperty(arguments, ${testCase.writeIndex}, ` +
        `{ writable: false });`
      );
    case "none":
      return "";
  }
}

function printMappedCase(testCase: MappedArgumentsCase): string {
  const parameterNames = Array.from(
    { length: testCase.paramCount },
    (_value, index) => mappedParameterName(testCase, index),
  );
  const writesParameter = testCase.writeIndex < testCase.paramCount;
  const parameterName = writesParameter
    ? mappedParameterName(testCase, testCase.writeIndex)
    : "undefined";
  return `
function inspect(${parameterNames.join(", ")}) {
  arguments[${testCase.writeIndex}] = ${testCase.replacement1};
  const paramAfterArgWrite = ${parameterName};
  ${severStatement(testCase)}
  ${writesParameter ? `${parameterName} = ${testCase.replacement2};` : ""}
  const argAfterParamWrite = arguments[${testCase.writeIndex}];
  console.log(
    paramAfterArgWrite,
    argAfterParamWrite,
    arguments.length,
    arguments.callee === inspect,
  );
}
inspect(${testCase.suppliedValues.join(", ")});
`;
}

function mappedExpected(testCase: MappedArgumentsCase): string {
  const mappedInitially = isMappedInitially(testCase, testCase.writeIndex);
  const writesParameter = testCase.writeIndex < testCase.paramCount;
  const paramAfterArgWrite = writesParameter
    ? mappedInitially
      ? testCase.replacement1
      : initialParameterValue(testCase, testCase.writeIndex)
    : undefined;
  const argAfterParamWrite = ((): number | undefined => {
    if (testCase.severMode === "delete") return undefined;
    if (testCase.severMode === "accessor") return ACCESSOR_MARKER;
    if (!writesParameter) return testCase.replacement1;
    if (testCase.severMode === "writable-false") return testCase.replacement1;
    return mappedInitially ? testCase.replacement2 : testCase.replacement1;
  })();
  return (
    `${printed(paramAfterArgWrite)} ${printed(argAfterParamWrite)} ` +
    `${testCase.suppliedValues.length} true\n`
  );
}

test(
  "mapped arguments objects alias, shadow duplicates, and sever",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "mapped arguments indices alias, and sever from, their parameters",
      fc.asyncProperty(mappedCaseArbitrary, async (testCase) => {
        const source = printMappedCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: mappedExpected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-mapped-arguments.js" },
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
          "one to three simple parameters, an optional rightmost-name " +
          "duplicate, zero to five supplied integer arguments, a " +
          "write/sever index from zero through four, and every sever " +
          "mode (none, delete, non-writable redefinition, accessor)",
        numRuns: 15,
        profile: "M5 mapped arguments object",
        seed: 0x6000_0301,
        sizeLimit:
          "three parameters, five supplied arguments, and an index " +
          "from zero through four",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

/**
 * M5a Unit 8.5h extends the implicit binding to every ECMA-262 function
 * form that owns one. This domain generates the owning form, the
 * strictness of the enclosing scope, the parameter list's simplicity,
 * and whether the reads happen inside a nested arrow, then checks the
 * one shape ECMA-262 selects: a non-strict simple list keeps the mapped
 * alias, and every other eligible form takes an unmapped snapshot whose
 * `callee` is the poisoned accessor.
 */
type OwnerForm =
  | "async-declaration"
  | "async-generator"
  | "class-constructor"
  | "class-method"
  | "declaration"
  | "generator"
  | "object-method";

type ParameterShape = "default" | "pattern" | "rest" | "simple";

interface UnmappedArgumentsCase {
  readonly form: OwnerForm;
  readonly paramCount: number;
  readonly parameterShape: ParameterShape;
  readonly readThroughArrow: boolean;
  readonly replacement1: number;
  readonly replacement2: number;
  readonly strictScope: boolean;
  readonly suppliedValues: readonly number[];
  readonly writeIndex: number;
}

const unmappedCaseArbitrary: fc.Arbitrary<UnmappedArgumentsCase> = fc.record({
  form: fc.constantFrom<OwnerForm>(
    "async-declaration",
    "async-generator",
    "class-constructor",
    "class-method",
    "declaration",
    "generator",
    "object-method",
  ),
  paramCount: fc.integer({ max: 3, min: 1 }),
  parameterShape: fc.constantFrom<ParameterShape>(
    "default",
    "pattern",
    "rest",
    "simple",
  ),
  readThroughArrow: fc.boolean(),
  replacement1: fc.integer({ max: 500, min: 100 }),
  replacement2: fc.integer({ max: 999, min: 501 }),
  strictScope: fc.boolean(),
  suppliedValues: fc.array(fc.integer({ max: 20, min: -20 }), { maxLength: 5 }),
  writeIndex: fc.integer({ max: 4, min: 0 }),
});

/** Class bodies are strict code whatever the enclosing scope is. */
function isStrictCase(testCase: UnmappedArgumentsCase): boolean {
  return (
    testCase.strictScope ||
    testCase.form === "class-constructor" ||
    testCase.form === "class-method"
  );
}

/**
 * FunctionDeclarationInstantiation reaches CreateMappedArgumentsObject
 * only from its non-strict, simple-parameter-list branch.
 */
function isMappedCase(testCase: UnmappedArgumentsCase): boolean {
  return !isStrictCase(testCase) && testCase.parameterShape === "simple";
}

/**
 * The trailing formal that makes the list non-simple. It tolerates every
 * generated argument value at its own position and beyond, and the body
 * never reads it, so only the leading simple parameters are observed.
 */
function shapeParameter(shape: ParameterShape): string {
  switch (shape) {
    case "default":
      return ", extra = 0";
    case "pattern":
      return ", { extraA } = {}";
    case "rest":
      return ", ...extra";
    case "simple":
      return "";
  }
}

function unmappedBody(testCase: UnmappedArgumentsCase): string {
  const writesParameter = testCase.writeIndex < testCase.paramCount;
  const parameterName = writesParameter ? `p${testCase.writeIndex}` : "";
  const reads = `
    arguments[${testCase.writeIndex}] = ${testCase.replacement1};
    const paramAfterArgWrite = ${writesParameter ? parameterName : "undefined"};
    ${writesParameter ? `${parameterName} = ${testCase.replacement2};` : ""}
    const argAfterParamWrite = arguments[${testCase.writeIndex}];
    const descriptor = Object.getOwnPropertyDescriptor(arguments, "callee");
    const calleeShape = "value" in descriptor
      ? "data " + (typeof descriptor.value)
      : "poison " + (descriptor.get === descriptor.set) + " " +
        descriptor.enumerable + " " + descriptor.configurable;
    let calleeRead;
    try { calleeRead = typeof arguments.callee; }
    catch (error) { calleeRead = "throws " + (error instanceof TypeError); }
    console.log(
      paramAfterArgWrite,
      argAfterParamWrite,
      arguments.length,
      calleeShape,
      calleeRead,
    );
`;
  return testCase.readThroughArrow
    ? `  (() => {${reads}  })();\n`
    : `  ${reads.trim()}\n`;
}

function printUnmappedCase(testCase: UnmappedArgumentsCase): string {
  const parameters =
    Array.from(
      { length: testCase.paramCount },
      (_value, index) => `p${index}`,
    ).join(", ") + shapeParameter(testCase.parameterShape);
  const call = testCase.suppliedValues.join(", ");
  const body = unmappedBody(testCase);
  const program = ((): string => {
    switch (testCase.form) {
      case "async-declaration":
        return (
          `async function inspect(${parameters}) {\n${body}}\n` +
          `inspect(${call});\n`
        );
      case "async-generator":
        return (
          `async function* inspect(${parameters}) {\n${body}  yield 0;\n` +
          `}\ninspect(${call}).next();\n`
        );
      case "class-constructor":
        return (
          `class Holder {\n  constructor(${parameters}) {\n${body}  }\n` +
          `}\nnew Holder(${call});\n`
        );
      case "class-method":
        return (
          `class Holder {\n  inspect(${parameters}) {\n${body}  }\n}\n` +
          `new Holder().inspect(${call});\n`
        );
      case "declaration":
        return (
          `function inspect(${parameters}) {\n${body}}\n` +
          `inspect(${call});\n`
        );
      case "generator":
        return (
          `function* inspect(${parameters}) {\n${body}  yield 0;\n}\n` +
          `inspect(${call}).next();\n`
        );
      case "object-method":
        return (
          `const holder = {\n  inspect(${parameters}) {\n${body}  },\n` +
          `};\nholder.inspect(${call});\n`
        );
    }
  })();
  return testCase.strictScope
    ? `\n(function () {\n"use strict";\n${program}})();\n`
    : `\n${program}`;
}

function unmappedExpected(testCase: UnmappedArgumentsCase): string {
  const mapped = isMappedCase(testCase);
  const writesParameter = testCase.writeIndex < testCase.paramCount;
  const supplied = testCase.writeIndex < testCase.suppliedValues.length;
  const aliased = mapped && writesParameter && supplied;
  const initial = supplied
    ? testCase.suppliedValues[testCase.writeIndex]
    : undefined;
  const paramAfterArgWrite = writesParameter
    ? aliased
      ? testCase.replacement1
      : initial
    : undefined;
  const argAfterParamWrite = aliased
    ? testCase.replacement2
    : testCase.replacement1;
  const calleeShape = mapped ? "data function" : "poison true false false";
  const calleeRead = mapped ? "function" : "throws true";
  return (
    `${printed(paramAfterArgWrite)} ${printed(argAfterParamWrite)} ` +
    `${testCase.suppliedValues.length} ${calleeShape} ${calleeRead}\n`
  );
}

/**
 * The disjoint boundary the unit deliberately keeps: an arrow declares
 * no `arguments` of its own, so one with no enclosing function form
 * leaves the name unresolved with its own source-located diagnostic
 * instead of silently reaching a Script-level binding.
 */
function assertArrowBoundary(testCase: UnmappedArgumentsCase): void {
  const source = `const read = () => arguments[${testCase.writeIndex}];\n`;
  const compiled = compileSource(babelFrontend, {
    source,
    sourceId: "generated-m5-arguments-arrow-boundary.js",
  });
  assert.equal(compiled.mir, undefined);
  assert.equal(compiled.diagnostics.length, 1);
  assert.match(
    compiled.diagnostics[0]?.message ?? "",
    /Unknown binding 'arguments'\./u,
  );
  assert.deepEqual(compiled.diagnostics[0]?.range.start, {
    column: 20,
    line: 1,
  });
}

/**
 * FunctionDeclarationInstantiation tests BoundNames of the formals, so
 * every spelling of a formal named `arguments` suppresses the implicit
 * binding, including the defaulted and destructured ones a parameter
 * environment lowers to a synthetic parameter name.
 */
const ARGUMENTS_FORMALS: readonly string[] = [
  "arguments",
  "arguments = 1",
  "{ arguments }",
  "[arguments]",
  "...arguments",
  "first, arguments = first",
];

function assertExplicitBindingBoundary(testCase: UnmappedArgumentsCase): void {
  // Every spelling runs on every generated case, so the structural
  // regression never depends on which case the generator drew.
  for (const formals of ARGUMENTS_FORMALS) {
    const source =
      `function inspect(${formals}) { return arguments; }\n` +
      `inspect(${testCase.suppliedValues.map(() => "[1]").join(", ")});\n`;
    const compiled = compileSource(babelFrontend, {
      source,
      sourceId: "generated-m5-arguments-explicit-binding.js",
    });
    assert.deepEqual(compiled.diagnostics, [], formals);
    const inspect = compiled.hir?.functions.find(
      (functionValue) => functionValue.name === "inspect",
    );
    assert.equal(inspect?.argumentsBindingId, undefined, formals);
    assert.equal(inspect?.argumentsMapped, undefined, formals);
  }
}

test(
  "every owning function form selects its ECMA-262 arguments shape",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "unmapped snapshots, poisoned callee, and arrow lexical capture",
      fc.asyncProperty(unmappedCaseArbitrary, async (testCase) => {
        assertArrowBoundary(testCase);
        assertExplicitBindingBoundary(testCase);
        const source = printUnmappedCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: unmappedExpected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-unmapped-arguments.js" },
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
          "one owning function form of seven (ordinary, object method, " +
          "class method, class constructor, generator, asynchronous " +
          "function, asynchronous generator), an optional enclosing " +
          "strict scope, one to three simple leading parameters with an " +
          "optional non-simple trailing formal (default, rest, or " +
          "binding pattern), zero to five supplied integer arguments, a " +
          "write index from zero through four, and optional reads " +
          "through a nested arrow function",
        numRuns: 12,
        profile: "M5 unmapped arguments object",
        seed: 0x6000_0302,
        sizeLimit:
          "three leading parameters, five supplied arguments, and an " +
          "index from zero through four",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);
