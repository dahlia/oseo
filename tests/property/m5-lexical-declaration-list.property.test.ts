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

/**
 * What one declarator of a generated lexical declaration list binds.
 * `plain` binds one identifier from a marked value, `bare` is a `let`
 * declarator with no initializer, `array` and `object` are recursive
 * binding patterns, and `read` initializes from the name the previous
 * declarator of the same list bound.
 */
type DeclaratorKind = "array" | "bare" | "object" | "plain" | "read";

/** The statement list the generated declaration list is written in. */
type ListPosition =
  | "arrow-body"
  | "block"
  | "loop-body"
  | "static-block"
  | "try-block";

interface Declarator {
  readonly kind: DeclaratorKind;
  readonly value: number;
}

interface DeclarationListCase {
  /**
   * Index of the declarator whose initializer throws, or `-1` when the
   * list runs to completion. An abrupt declarator stops the ones after
   * it and leaves their names uninitialized in the captured scope.
   */
  readonly abruptAt: number;
  readonly declarators: readonly Declarator[];
  /**
   * Give the first declarator a `number` annotation its value falsifies,
   * so the specialized addition that reads it guards, misses, and
   * reaches the compiled generic fallback.
   */
  readonly falseHint: boolean;
  readonly kind: "const" | "let";
  readonly position: ListPosition;
  /**
   * Read the last declared name from the first initializer. The whole
   * list is created before any initializer runs, so that read is a
   * temporal dead zone error rather than an unresolved name.
   */
  readonly readsAhead: boolean;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const large = propertySize() === "large";

/**
 * Whether the case's false hint reaches source. It applies only to a
 * first declarator that binds one identifier from its own value and
 * actually runs, so the printer and the oracle decide it the same way
 * from the record rather than from the printed program.
 */
function usesFalseHint(testCase: DeclarationListCase): boolean {
  return (
    testCase.falseHint &&
    !testCase.readsAhead &&
    testCase.abruptAt !== 0 &&
    testCase.declarators[0]?.kind === "plain"
  );
}

/* The domain is generated as admitted declaration lists rather than
 * filtered from arbitrary source, so every shrink step still prints a
 * program whose declarator kinds, scope, and completion stay inside the
 * profile. */
const declarationListCaseArbitrary: fc.Arbitrary<DeclarationListCase> = fc
  .record({
    abruptChoice: fc.integer({ max: 3, min: -1 }),
    declarators: fc.array(
      fc.record({
        kind: fc.constantFrom<DeclaratorKind>(
          "array",
          "bare",
          "object",
          "plain",
          "read",
        ),
        value: fc.integer({ max: 20, min: -20 }),
      }),
      { maxLength: 4, minLength: 2 },
    ),
    falseHint: fc.boolean(),
    kind: fc.constantFrom<"const" | "let">("const", "let"),
    position: fc.constantFrom<ListPosition>(
      "arrow-body",
      "block",
      "loop-body",
      "static-block",
      "try-block",
    ),
    readsAhead: fc.boolean(),
  })
  .map((raw) => {
    /* A `const` declarator needs an initializer, so a generated `bare`
     * declarator becomes a plain one under `const` rather than being
     * filtered away, and the falsified value stays inside its own
     * declarator by keeping the next one from reading it. */
    const declarators = raw.declarators.map((declarator, index) =>
      (raw.kind === "const" && declarator.kind === "bare") ||
      (raw.falseHint && index === 1 && declarator.kind === "read")
        ? { ...declarator, kind: "plain" as const }
        : declarator,
    );
    return {
      abruptAt: raw.abruptChoice >= declarators.length ? -1 : raw.abruptChoice,
      declarators,
      falseHint: raw.falseHint,
      kind: raw.kind,
      position: raw.position,
      readsAhead: raw.readsAhead,
    };
  });

function declaredName(index: number): string {
  return `name${String(index)}`;
}

/** The source of one declarator, without the separating comma. */
function declaratorSource(
  testCase: DeclarationListCase,
  declarator: Declarator,
  index: number,
): string {
  const name = declaredName(index);
  const last = declaredName(testCase.declarators.length - 1);
  if (index === testCase.abruptAt) {
    return `${name} = boom("stop${String(index)}")`;
  }
  if (testCase.readsAhead && index === 0) {
    return declarator.kind === "array"
      ? `[${name}] = [${last}]`
      : `${name} = ${last}`;
  }
  if (declarator.kind === "bare") return name;
  const operand =
    declarator.kind === "read" && index > 0
      ? declaredName(index - 1)
      : String(declarator.value);
  if (declarator.kind === "array") {
    return (
      `[${name} = ${operand}] = ` +
      `source("s${String(index)}", [undefined, 0])`
    );
  }
  if (declarator.kind === "object") {
    return `{ slot: ${name} } = { slot: ${operand} }`;
  }
  if (usesFalseHint(testCase) && index === 0) {
    return `${name}: number = falsify(${operand})`;
  }
  return `${name} = mark("m${String(index)}", ${operand})`;
}

function listSource(testCase: DeclarationListCase): string {
  const declarators = testCase.declarators.map((declarator, index) =>
    declaratorSource(testCase, declarator, index),
  );
  return `${testCase.kind} ${declarators.join(", ")};`;
}

function printSource(testCase: DeclarationListCase): string {
  const last = declaredName(testCase.declarators.length - 1);
  const reported = testCase.declarators
    .map((_, index) => `hinted(${declaredName(index)})`)
    .join(", ");
  const body = [
    `capture = () => ${last};`,
    listSource(testCase),
    `console.log("values", ${reported});`,
  ];
  const indented = (depth: number): readonly string[] =>
    body.map((line) => `${"  ".repeat(depth)}${line}`);
  const positioned =
    testCase.position === "try-block"
      ? indented(1)
      : testCase.position === "block"
        ? ["  {", ...indented(2), "  }"]
        : testCase.position === "loop-body"
          ? [
              "  for (let step = 0; step < 1; step = step + 1) {",
              ...indented(2),
              "  }",
            ]
          : testCase.position === "arrow-body"
            ? ["  const run = () => {", ...indented(2), "  };", "  run();"]
            : [
                "  class Holder {",
                "    static {",
                ...indented(3),
                "    }",
                "  }",
              ];
  return [
    "let capture;",
    "function mark(label, value) { console.log(label); return value; }",
    "function boom(label) { throw new RangeError(label); }",
    "function hinted(value: number) { return value + 0; }",
    "function falsify(value) {",
    "  return {",
    "    valueOf: function () {",
    '      console.log("guard miss");',
    "      return value;",
    "    },",
    "  };",
    "}",
    "function source(label, values) {",
    "  return {",
    "    [Symbol.iterator]: function () {",
    "      let index = 0;",
    "      return {",
    "        next: function () {",
    "          if (index >= values.length) {",
    "            return { value: undefined, done: true };",
    "          }",
    "          const value = values[index];",
    "          index = index + 1;",
    "          return { value: value, done: false };",
    "        },",
    "        return: function () {",
    '          console.log("close", label);',
    "          return {};",
    "        },",
    "      };",
    "    },",
    "  };",
    "}",
    "try {",
    ...positioned,
    "} catch (error) {",
    "  console.log(",
    '    "caught",',
    '    error instanceof RangeError ? error.message : "tdz"',
    "  );",
    "}",
    "try {",
    "  capture();",
    '  console.log("readable");',
    "} catch (error) {",
    '  console.log("dead", error instanceof ReferenceError);',
    "}",
    "",
  ].join("\n");
}

/**
 * The independent oracle. It predicts the printed lines from the case
 * record alone, without consulting a reference host or the printed
 * program.
 */
function expectedOutput(testCase: DeclarationListCase): string {
  const lines: string[] = [];
  const values: (number | undefined)[] = [];
  let stopped: string | undefined;
  for (const [index, declarator] of testCase.declarators.entries()) {
    if (index === testCase.abruptAt) {
      stopped = `stop${String(index)}`;
      break;
    }
    if (testCase.readsAhead && index === 0) {
      // The last name exists but is uninitialized, so the read fails
      // before any effect of this declarator, including the iterator
      // acquisition an array pattern would perform.
      stopped = "tdz";
      break;
    }
    if (declarator.kind === "bare") {
      values.push(undefined);
      continue;
    }
    const operand =
      declarator.kind === "read" && index > 0
        ? values[index - 1]
        : declarator.value;
    if (declarator.kind === "array") {
      // The generated iterable yields `undefined` first, so the default
      // always applies, and the iterator is never exhausted, so this
      // declarator closes it before the next one starts.
      lines.push(`close s${String(index)}`);
      values.push(operand);
      continue;
    }
    if (declarator.kind === "object") {
      values.push(operand);
      continue;
    }
    if (usesFalseHint(testCase) && index === 0) {
      values.push(operand);
      continue;
    }
    lines.push(`m${String(index)}`);
    values.push(operand);
  }
  if (stopped != null) {
    lines.push(`caught ${stopped}`, "dead true");
    return `${lines.join("\n")}\n`;
  }
  // The report coerces every bound value through one hinted addition,
  // so a falsified first value runs its own coercion first.
  if (usesFalseHint(testCase)) lines.push("guard miss");
  lines.push(
    `values ${values
      .map((value) => (value == null ? "NaN" : String(value)))
      .join(" ")}`,
  );
  lines.push("readable");
  return `${lines.join("\n")}\n`;
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
    "oseo-declaration-list-property-",
  );
  const sourcePath = `${directory}/declaration-list.ts`;
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
  } catch (error) {
    throw new Error(
      `Reference artifacts retained at ${directory}\nsource:\n${source}`,
      { cause: error },
    );
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

// An abrupt declarator stops the list, so the names after it stay
// uninitialized and the closure that captured the last one still fails.
test("an abrupt declarator leaves the later names uninitialized", () => {
  const abrupt: DeclarationListCase = {
    abruptAt: 1,
    declarators: [
      { kind: "plain", value: 1 },
      { kind: "plain", value: 2 },
      { kind: "plain", value: 3 },
    ],
    falseHint: false,
    kind: "let",
    position: "block",
    readsAhead: false,
  };
  assert.equal(expectedOutput(abrupt), "m0\ncaught stop1\ndead true\n");
});

test(
  "generated lexical declaration lists share one scope and order",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "declaration lists retain predeclaration, order, and completion",
      fc.asyncProperty(declarationListCaseArbitrary, async (testCase) => {
        const source = printSource(testCase);
        const expected = {
          exitStatus: 0,
          stderr: "",
          stdout: expectedOutput(testCase),
        };
        assertMatchingObservations([expected, ...(await references(source))]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-declaration-list.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          /* Both policies collect at every safepoint, because every cell
           * the list creates before its first initializer runs must stay
           * reachable until the last declarator writes it. */
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
          "one const or let list of two to four declarators per case, " +
          "mixing plain, bare, array-pattern, object-pattern, and " +
          "back-reading declarators, written in try-block, block, " +
          "loop-body, arrow-body, and class static-block statement lists, " +
          "with normal completion, an abrupt declarator, a read of a " +
          "later name, and truthful or false hints",
        numRuns: 16,
        profile: "M5a lexical declaration lists",
        seed: 0x5eed_0029,
        sizeLimit: large
          ? "16 generated cases at the extended run scale"
          : "16 generated cases",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
