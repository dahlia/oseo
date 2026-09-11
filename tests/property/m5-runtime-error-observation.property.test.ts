/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { runNativeCli } from "../../packages/cli/src/index.ts";
import { targetForExecutionHost } from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/**
 * Where the identity of a thrown value comes from. Each entry names the
 * shape the generated program builds rather than the answer it produces,
 * so the oracle stays independent of the runtime's lookup order.
 */
type IdentitySource =
  | "abrupt-name"
  | "absent"
  | "allocating-name"
  | "constructor-function"
  | "holder-object"
  | "non-string-name"
  | "primitive-constructor"
  | "throwing-constructor";

/** How the generated value exposes its `message` property, if at all. */
type MessageSource =
  | "abrupt-coercion"
  | "absent"
  | "converted"
  | "empty"
  | "text"
  | "throwing";

interface ThrownCase {
  readonly identity: IdentitySource;
  readonly message: MessageSource;
  /** The `name` the reachable constructor reports, when there is one. */
  readonly name: string;
  /** The text a present, convertible `message` produces. */
  readonly text: string;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const sourceId = "generated-m5-runtime-error-observation.js";
const untypedThrow = "Unhandled JavaScript throw.";

const messageSources: readonly MessageSource[] = [
  "abrupt-coercion",
  "absent",
  "converted",
  "empty",
  "text",
  "throwing",
];

// Names are built from their two sides rather than filtered out of an
// arbitrary pool, so both sides of the marker's ASCII identifier
// boundary stay reachable at a chosen rate under a fixed seed. An
// identifier keeps a valid first unit; every other generated name leads
// with a unit that cannot start one.
const identifierHeadUnits = [..."ABZaz_$"];
const identifierTailUnits = [..."ABZaz_$09"];
const nonIdentifierHeadUnits = [..."9 .-é"];
const messageUnits = [..."abz09 :.-한"];

const identifierArbitrary: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...identifierHeadUnits),
    fc
      .array(fc.constantFrom(...identifierTailUnits), {
        maxLength: 7,
        minLength: 0,
      })
      .map((units) => units.join("")),
  )
  .map(([head, tail]) => `${head}${tail}`);

const nonIdentifierArbitrary: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc
    .tuple(fc.constantFrom(...nonIdentifierHeadUnits), identifierArbitrary)
    .map(([head, rest]) => `${head}${rest}`),
);

const nameArbitrary: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: fc.constantFrom("Test262Error", "Object", "$"), weight: 2 },
  { arbitrary: identifierArbitrary, weight: 4 },
  { arbitrary: nonIdentifierArbitrary, weight: 3 },
);

const textArbitrary: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    "value is not 1",
    "",
    "OSEO_THROWN Injected",
    "first\nOSEO_THROWN Injected",
    "한글 메시지",
  ),
  fc
    .array(fc.constantFrom(...messageUnits), { maxLength: 12, minLength: 0 })
    .map((units) => units.join("")),
);

// The identity sources that reach a name carry most of the weight, so a
// fixed-seed run keeps rendering cases and unidentified cases in the same
// sample instead of leaving either side to chance.
const identityArbitrary: fc.Arbitrary<IdentitySource> = fc.oneof(
  {
    arbitrary: fc.constant<IdentitySource>("constructor-function"),
    weight: 3,
  },
  {
    arbitrary: fc.constantFrom<IdentitySource>(
      "allocating-name",
      "holder-object",
    ),
    weight: 3,
  },
  {
    arbitrary: fc.constantFrom<IdentitySource>(
      "abrupt-name",
      "absent",
      "non-string-name",
      "primitive-constructor",
      "throwing-constructor",
    ),
    weight: 3,
  },
);

const caseArbitrary: fc.Arbitrary<ThrownCase> = fc.record({
  identity: identityArbitrary,
  message: fc.constantFrom(...messageSources),
  name: nameArbitrary,
  text: textArbitrary,
});

/** The raw constructor name an ordinary lookup reaches, or the empty text. */
function reachedName(testCase: ThrownCase): string {
  switch (testCase.identity) {
    case "allocating-name":
    case "constructor-function":
    case "holder-object": {
      return testCase.name;
    }
    case "abrupt-name":
    case "absent":
    case "non-string-name":
    case "primitive-constructor":
    case "throwing-constructor": {
      return "";
    }
  }
}

/** The text an ordinary `message` read and generic conversion produce. */
function reachedMessage(testCase: ThrownCase): string {
  switch (testCase.message) {
    case "converted":
    case "text": {
      return testCase.text;
    }
    case "abrupt-coercion":
    case "absent":
    case "empty":
    case "throwing": {
      return "";
    }
  }
}

/**
 * Whether a name can be the marker: the marker is one whitespace-free
 * token on its own line, so only an ASCII identifier fits there.
 */
function identifierName(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name);
}

/** The marker identity, or undefined when the value exposes none. */
function expectedIdentity(testCase: ThrownCase): string | undefined {
  const name = reachedName(testCase);
  return identifierName(name) ? name : undefined;
}

function constructValue(testCase: ThrownCase): readonly string[] {
  switch (testCase.identity) {
    case "abrupt-name": {
      return [
        "const oseoHolder = {};",
        'Object.defineProperty(oseoHolder, "name", {',
        '  get: function () { throw new RangeError("no name"); },',
        "});",
        "const oseoValue = Object.create({ constructor: oseoHolder });",
      ];
    }
    case "absent": {
      return ["const oseoValue = Object.create(null);"];
    }
    case "allocating-name": {
      // The constructor getter allocates the holder it returns, and that
      // holder's name getter builds its answer from two mutable bindings.
      // Neither result has a binding of its own, so each has to become
      // rooted before the next read allocates its key string.
      return [
        `let oseoHead = ${JSON.stringify(testCase.name.slice(0, 1))};`,
        `let oseoTail = ${JSON.stringify(testCase.name.slice(1))};`,
        "const oseoProto = {};",
        'Object.defineProperty(oseoProto, "constructor", {',
        "  get: function () {",
        "    const fresh = {};",
        '    Object.defineProperty(fresh, "name", {',
        "      get: function () { return oseoHead + oseoTail; },",
        "    });",
        "    return fresh;",
        "  },",
        "});",
        "const oseoValue = Object.create(oseoProto);",
      ];
    }
    case "constructor-function": {
      return ["const oseoValue = new oseoConstructor();"];
    }
    case "holder-object": {
      return [
        "const oseoValue = Object.create({",
        `  constructor: { name: ${JSON.stringify(testCase.name)} },`,
        "});",
      ];
    }
    case "non-string-name": {
      return ["const oseoValue = Object.create({ constructor: { name: 9 } });"];
    }
    case "primitive-constructor": {
      return ["const oseoValue = Object.create({ constructor: 9 });"];
    }
    case "throwing-constructor": {
      return [
        "const oseoValue = {};",
        'Object.defineProperty(oseoValue, "constructor", {',
        '  get: function () { throw new RangeError("no identity"); },',
        "});",
      ];
    }
  }
}

function installMessage(testCase: ThrownCase): readonly string[] {
  switch (testCase.message) {
    case "abrupt-coercion": {
      return [
        "oseoValue.message = {",
        '  toString: function () { throw new RangeError("no text"); },',
        "};",
      ];
    }
    case "absent": {
      return [];
    }
    case "converted": {
      return [
        "oseoValue.message = {",
        `  toString: function () { return ${JSON.stringify(testCase.text)}; },`,
        "};",
      ];
    }
    case "empty": {
      return ['oseoValue.message = "";'];
    }
    case "text": {
      return [`oseoValue.message = ${JSON.stringify(testCase.text)};`];
    }
    case "throwing": {
      return [
        'Object.defineProperty(oseoValue, "message", {',
        '  get: function () { throw new RangeError("no message"); },',
        "});",
      ];
    }
  }
}

interface PrintedCase {
  readonly source: string;
  readonly throwLine: number;
}

/**
 * The generated program prints what an ordinary lookup reaches before
 * throwing the same value, so the two reference hosts hold the identity
 * and message model while the native diagnostic holds the rendering.
 */
function printCase(testCase: ThrownCase): PrintedCase {
  const lines = [
    "function oseoIdentityText(value) {",
    "  try {",
    "    const constructorValue = value.constructor;",
    '    if (constructorValue === null) return "";',
    "    const kind = typeof constructorValue;",
    '    if (kind !== "object" && kind !== "function") return "";',
    "    const name = constructorValue.name;",
    '    return typeof name === "string" ? name : "";',
    "  } catch (failure) {",
    '    return "";',
    "  }",
    "}",
    "function oseoMessageText(value) {",
    "  try {",
    "    const message = value.message;",
    '    if (message === undefined) return "";',
    "    return String(message);",
    "  } catch (failure) {",
    '    return "";',
    "  }",
    "}",
    "const oseoConstructor = function () {};",
    'Object.defineProperty(oseoConstructor, "name", {',
    `  value: ${JSON.stringify(testCase.name)},`,
    "});",
    ...constructValue(testCase),
    ...installMessage(testCase),
    'console.log("identity[" + oseoIdentityText(oseoValue) + "]");',
    'console.log("message[" + oseoMessageText(oseoValue) + "]");',
  ];
  return {
    source: `${[...lines, "throw oseoValue;"].join("\n")}\n`,
    throwLine: lines.length + 1,
  };
}

function expectedStdout(testCase: ThrownCase): string {
  return (
    `identity[${reachedName(testCase)}]\n` +
    `message[${reachedMessage(testCase)}]\n`
  );
}

function expectedStderr(testCase: ThrownCase, throwLine: number): string {
  const identity = expectedIdentity(testCase);
  const message = reachedMessage(testCase);
  const rendered =
    identity == null
      ? untypedThrow
      : message === ""
        ? identity
        : `${identity}: ${message}`;
  return (
    `${sourceId}:${throwLine}:1: error[OSEO2001]: ${rendered}\n` +
    (identity == null ? "" : `OSEO_THROWN ${identity}\n`)
  );
}

/** One reference-host observation of the generated program. */
interface ReferenceObservation {
  readonly exitStatus: number;
  readonly stdout: string;
}

async function references(
  source: string,
): Promise<readonly ReferenceObservation[]> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-runtime-error-observation-property-",
  );
  try {
    const sourcePath = `${directory}/case.mjs`;
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

test("the marker identifier model matches the runtime's boundary", () => {
  assert.equal(identifierName("Test262Error"), true);
  assert.equal(identifierName("_$9"), true);
  assert.equal(identifierName("9lead"), false);
  assert.equal(identifierName("two up"), false);
  assert.equal(identifierName("é"), false);
  assert.equal(identifierName(""), false);
});

test(
  "generated thrown values render their identity and message",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "a thrown value renders the identity and message it exposes",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const printed = printCase(testCase);
        const stdout = expectedStdout(testCase);
        // The reference hosts cannot reproduce an owned diagnostic, so
        // they hold the identity and message the program itself reads
        // while the native observation holds the rendered diagnostic.
        for (const reference of await references(printed.source)) {
          assert.equal(reference.stdout, stdout);
          assert.notEqual(reference.exitStatus, 0);
        }
        const expected = {
          exitStatus: 1,
          stderr: expectedStderr(testCase, printed.throwLine),
          stdout,
        };
        for (const specialization of ["disabled", "enabled"] as const) {
          process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
          try {
            const native = await runNativeCli(
              {
                args: [
                  ...(specialization === "disabled"
                    ? ["--no-specialization"]
                    : []),
                  sourceId,
                ],
                source: printed.source,
                sourceId,
                version: "0.1.0",
              },
              host,
            );
            assert.deepEqual(
              {
                exitStatus: native.exitStatus,
                stderr: native.stderr,
                stdout: native.stdout,
              },
              expected,
              `${specialization} ${printed.source}`,
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
          "programs sampled from eight identity shapes crossed with six " +
          "message shapes over generated identifier and non-identifier " +
          "constructor names and generated message text, each thrown " +
          "unhandled. The sample is weighted toward a reachable identity " +
          "and does not enumerate the product; each identity and message " +
          "shape also has its own fixed case in " +
          "tests/native/scenarios/shard-1.ts",
        numRuns: 12,
        profile: "M5b runtime error observation",
        seed: 0x6000_6600,
        sizeLimit:
          "at most twelve name units and twenty-six message units per case",
        timeLimitMilliseconds: 360_000,
      },
    );
  },
);
