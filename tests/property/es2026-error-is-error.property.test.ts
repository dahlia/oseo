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
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

const errorConstructors = [
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
  "AggregateError",
] as const;

/** How one subject value is produced. */
type Origin =
  | "call"
  | "construct"
  | "create"
  | "plain"
  | "primitive"
  | "reflect"
  | "subclass"
  | "thrown";

const primitiveSources = [
  "undefined",
  "null",
  "true",
  "0",
  "-0",
  "NaN",
  '"Error"',
  "1n",
  'Symbol("error")',
] as const;

const thrownSources = [
  "null.property",
  "undefinedBinding",
  "new Array(-1)",
  'decodeURIComponent("%")',
  'JSON.parse("{")',
  'Symbol() + ""',
] as const;

interface Subject {
  /** The error constructor index the origin uses. */
  readonly kind: number;
  readonly origin: Origin;
  /** Wrap the produced value in a Proxy with an empty handler. */
  readonly proxied: boolean;
  /** Replace the produced object's [[Prototype]] afterwards. */
  readonly reproto: "keep" | "null" | "object";
  /** Subclass chain depth for the `subclass` origin. */
  readonly depth: number;
  /** Index into the primitive or thrown source list. */
  readonly variant: number;
}

interface ErrorIsErrorCase {
  readonly subjects: readonly Subject[];
  readonly marker: number;
}

const subjectArbitrary: fc.Arbitrary<Subject> = fc.record({
  depth: fc.integer({ max: 3, min: 1 }),
  kind: fc.integer({ max: errorConstructors.length - 1, min: 0 }),
  origin: fc.constantFrom<Origin>(
    "call",
    "construct",
    "create",
    "plain",
    "primitive",
    "reflect",
    "subclass",
    "thrown",
  ),
  proxied: fc.boolean(),
  reproto: fc.constantFrom("keep", "null", "object"),
  variant: fc.integer({ max: 8, min: 0 }),
});

const caseArbitrary: fc.Arbitrary<ErrorIsErrorCase> = fc.record({
  marker: fc.integer({ max: 1_000, min: 1 }),
  subjects: fc.array(subjectArbitrary, { maxLength: 6, minLength: 1 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/** Whether the subject is a primitive, so no proxy or prototype applies. */
function isPrimitive(subject: Subject): boolean {
  return subject.origin === "primitive";
}

/**
 * The independent oracle. Only an error constructor's own construction
 * step creates [[ErrorData]], whether it runs through a call, `new`,
 * `super()`, or Reflect.construct, and every runtime-thrown value here
 * is such a construction. A proxy has no [[ErrorData]] of its own, and
 * replacing the prototype later never adds or removes the slot.
 */
function oracle(subject: Subject): boolean {
  if (subject.proxied && !isPrimitive(subject)) return false;
  switch (subject.origin) {
    case "call":
    case "construct":
    case "reflect":
    case "subclass":
    case "thrown":
      return true;
    case "create":
    case "plain":
    case "primitive":
      return false;
  }
}

function constructorArguments(kind: number): string {
  return errorConstructors[kind] === "AggregateError"
    ? '[], "message"'
    : '"message"';
}

function subjectExpression(subject: Subject, index: number): string {
  const name = errorConstructors[subject.kind]!;
  const args = constructorArguments(subject.kind);
  switch (subject.origin) {
    case "call":
      return `${name}(${args})`;
    case "construct":
      return `new ${name}(${args})`;
    case "create":
      return `Object.create(${name}.prototype)`;
    case "plain":
      return (
        `{ name: "${name}", message: "message", ` +
        `[Symbol.toStringTag]: "Error" }`
      );
    case "primitive":
      return primitiveSources[subject.variant % primitiveSources.length]!;
    case "reflect":
      return `Reflect.construct(${name}, [${args}], Object)`;
    case "subclass": {
      let chain: string = name;
      for (let level = 0; level < subject.depth; level += 1) {
        chain = `(class extends ${chain} {})`;
      }
      return `new ${chain}(${args})`;
    }
    case "thrown":
      return `(() => { try { ${
        thrownSources[subject.variant % thrownSources.length]
      }; } catch (error) { return error; } return "unthrown${index}"; })()`;
  }
}

function printSubject(subject: Subject, index: number): string {
  const lines = [`let subject${index} = ${subjectExpression(subject, index)};`];
  if (!isPrimitive(subject)) {
    if (subject.reproto === "null") {
      lines.push(`Object.setPrototypeOf(subject${index}, null);`);
    } else if (subject.reproto === "object") {
      lines.push(`Object.setPrototypeOf(subject${index}, {});`);
    }
    if (subject.proxied) {
      lines.push(`subject${index} = new Proxy(subject${index}, {});`);
    }
  }
  lines.push(
    `console.log("subject ${index}", Error.isError(subject${index}), ` +
      `isError(subject${index}));`,
  );
  return lines.join("\n");
}

function printCase(testCase: ErrorIsErrorCase): string {
  return `
const isError = Error.isError;
${testCase.subjects.map(printSubject).join("\n")}
let turn = 0;
while (turn < 2) {
  console.log("guard", Error.isError(new Error("turn")), Error.isError({}));
  if (turn === 0) Error.marker = ${testCase.marker};
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log(
  "hint",
  hinted(${testCase.marker}, 1),
  hinted("${testCase.marker}", 1),
);
`;
}

function expected(testCase: ErrorIsErrorCase): string {
  return [
    ...testCase.subjects.map((subject, index) => {
      const result = String(oracle(subject));
      return `subject ${index} ${result} ${result}`;
    }),
    "guard true false",
    "guard true false",
    `hint ${testCase.marker + 1} ${testCase.marker}1`,
    "",
  ].join("\n");
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
    "oseo-error-is-error-property-",
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

test(
  "generated Error.isError subjects match the [[ErrorData]] model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Error.isError answers [[ErrorData]] for generated subjects",
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
            { source, sourceId: "generated-es2026-error-is-error.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-smi/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /generic-fallback/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:smi|shape)/u);
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
                toolchain: nativeToolchain,
              },
              (native) => {
                assertMatchingObservations([expectedObservation, native]);
                assert.ok(native.counters?.collections != null);
                assert.ok(native.counters.collections > 0);
                if (specialization === "enabled") {
                  assert.ok(native.counters.guardMisses > 0);
                }
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
          "one to six subjects, each an error constructor call, " +
          "construction, Reflect.construct, one- to three-level subclass " +
          "instance, runtime-thrown error, error-prototype object, " +
          "error-shaped ordinary object, or primitive, optionally wrapped " +
          "in a proxy and given a null or ordinary replacement prototype, " +
          "plus one constructor shape guard miss and one false number hint",
        numRuns: 12,
        profile: "ES2026 Error.isError",
        seed: 0x6000_9900,
        sizeLimit:
          "at most six subjects, subclass chains of at most three levels, " +
          "one proxy per subject, and one constructor property write",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
