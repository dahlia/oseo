/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import { runNativeCli } from "../../packages/cli/src/index.ts";
import {
  compileSource,
  describeTarget,
  parseRegExpPattern,
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

interface Observation {
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}

interface ValidCase {
  readonly explicitFlags: boolean;
  readonly flags: string;
  readonly lastIndex: number;
  readonly pattern: string;
}

interface InvalidCase {
  readonly differential: boolean;
  readonly expected: "invalid" | "unsupported";
  readonly flags: string;
  readonly parserExpected?: "unsupported" | "valid";
  readonly pattern: string;
}

const classFreePatterns = [
  "",
  "a",
  ".",
  "^a$",
  "a|b",
  "a*",
  "a+?",
  "a{0,3}",
  "(?:ab)",
  "(a)(?:b)",
  "(?<name>a)\\k<name>",
  "(?=a)a",
  "(?!b)a",
  "(?<=a)b",
  "(?<!a)b",
  "\\d+\\s?\\w",
  "\\x61\\u0062",
] as const;

const generatedAtoms = fc
  .array(fc.constantFrom("a", "b", "c", "\\d", "."), {
    maxLength: 12,
  })
  .map((atoms) => atoms.join(""));

const classFreePattern = fc.oneof(
  fc.constantFrom(...classFreePatterns),
  generatedAtoms,
);

const validPattern = fc.oneof(
  classFreePattern,
  fc.constantFrom("[a-z]", "[^]", "[\\t- ]", "[\\0-\\n]"),
);

const unicodeValidPattern = fc.oneof(
  validPattern,
  fc.constantFrom(
    "[\\-]",
    "[𐀀-𐀁]",
    "\\u{0000061}",
    "[\\uD800\\uDC00-\\uD801\\uDC01]",
    "[𐀀-\\uD800\\uDC01]",
  ),
);

const validFlags = fc
  .subarray(["d", "g", "i", "m", "s", "y"], {
    maxLength: 6,
  })
  .chain((ordinary) =>
    fc
      .tuple(fc.shuffledSubarray(ordinary), fc.constantFrom("", "u", "v"))
      .map(([selected, unicode]) => selected.join("") + unicode),
  );

const validCase = fc.boolean().chain((explicitFlags) =>
  (explicitFlags ? validFlags : fc.constant("")).chain((flags) =>
    fc.record({
      explicitFlags: fc.constant(explicitFlags),
      flags: fc.constant(flags),
      lastIndex: fc.integer({ max: 10_000, min: -10_000 }),
      pattern:
        explicitFlags && flags.includes("v")
          ? classFreePattern
          : explicitFlags && flags.includes("u")
            ? unicodeValidPattern
            : validPattern,
    }),
  ),
);

const invalidCase = fc
  .oneof(
    fc.record({
      differential: fc.constant(true),
      flags: fc.constant(""),
      pattern: fc.constantFrom("[", "(", "*", "+", "?", "a{2,1}"),
    }),
    fc.record({
      differential: fc.constant(true),
      flags: fc.constantFrom("gg", "ii", "z", "uv", "vu", "ggims"),
      pattern: fc.constantFrom("", "a", "(?:ab)", "[a-z]"),
    }),
    fc.constantFrom(
      { differential: true, flags: "u", pattern: "\\u{110000}" },
      { differential: true, flags: "", pattern: "[z-a]" },
      { differential: true, flags: "u", pattern: "\\x4" },
      { differential: true, flags: "u", pattern: "\\u123" },
      { differential: true, flags: "u", pattern: "\\1" },
      { differential: true, flags: "u", pattern: "\\p" },
      { differential: true, flags: "u", pattern: "\\P" },
      { differential: true, flags: "u", pattern: "[\\B]" },
      { differential: true, flags: "u", pattern: "[\\d-a]" },
      { differential: true, flags: "u", pattern: "[a-\\w]" },
      { differential: true, flags: "u", pattern: "[\\x7a-a]" },
      { differential: false, flags: "", pattern: "[\\B]" },
      { differential: false, flags: "", pattern: "[\\d-a]" },
      { differential: true, flags: "", pattern: "(?<a>x)(?<a>y)" },
      { differential: false, flags: "", pattern: "[(?<a>]\\k<a>" },
      { differential: true, flags: "u", pattern: "(?=a)*" },
      { differential: true, flags: "", pattern: "\\b*" },
      { differential: true, flags: "", pattern: "\\B{2}" },
      { differential: true, flags: "", pattern: "[a-\\n]" },
      { differential: false, flags: "", pattern: "(a)[\\1]" },
      { differential: true, flags: "u", pattern: "(a)[\\1]" },
    ),
  )
  .map((testCase) => ({
    differential: testCase.differential,
    expected: "invalid" as const,
    flags: testCase.flags,
    pattern: testCase.pattern,
  }));

const rejectedCase: fc.Arbitrary<InvalidCase> = fc.oneof(
  invalidCase,
  fc.constantFrom(
    {
      differential: false,
      expected: "unsupported" as const,
      flags: "",
      parserExpected: "valid" as const,
      pattern: "(?<\\u0041>a)",
    },
    {
      differential: false,
      expected: "unsupported" as const,
      flags: "",
      parserExpected: "valid" as const,
      pattern: "\\k<A>(?<\\u0041>x)",
    },
    {
      differential: false,
      expected: "unsupported" as const,
      flags: "",
      parserExpected: "unsupported" as const,
      pattern: "\\k<é>(?<é>a)",
    },
  ),
);

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

async function references(source: string): Promise<readonly Observation[]> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-regexp-intrinsic-property-",
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

function validSource(testCase: ValidCase): string {
  const flagsArgument = testCase.explicitFlags
    ? `, ${JSON.stringify(testCase.flags)}`
    : "";
  const likeFlags = testCase.explicitFlags
    ? JSON.stringify(testCase.flags)
    : "";
  return `
const direct = new RegExp(${JSON.stringify(testCase.pattern)}${flagsArgument});
const descriptor = Object.getOwnPropertyDescriptor(direct, "lastIndex");
console.log(
  "state",
  direct instanceof RegExp,
  Object.prototype.toString.call(direct),
  descriptor.value,
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
);
direct.lastIndex = ${testCase.lastIndex};
console.log("write", direct.lastIndex);
console.log(
  "identity",
  RegExp(direct) === direct,
  new RegExp(direct) !== direct,
);
const order = [];
const like = {
  get [Symbol.match]() { order.push("match"); return true; },
  get source() {
    order.push("source");
    return {
      toString() {
        order.push("pattern string");
        return ${JSON.stringify(testCase.pattern)};
      },
    };
  },
  get flags() {
    order.push("flags");
    return {
      toString() {
        order.push("flags string");
        return ${JSON.stringify(likeFlags)};
      },
    };
  },
};
const fromLike = RegExp(like${flagsArgument});
console.log("like", fromLike instanceof RegExp, order.join(","));
/** @param {number} value */
function hinted(value) { return value + 1; }
console.log("hint", hinted(1), hinted("x"));
`;
}

function validExpected(testCase: ValidCase): Observation {
  const likeOrder = testCase.explicitFlags
    ? "match,source,pattern string"
    : "match,source,flags,pattern string,flags string";
  return {
    exitStatus: 0,
    stderr: "",
    stdout:
      "state true [object RegExp] 0 true false false\n" +
      `write ${testCase.lastIndex}\n` +
      "identity true true\n" +
      `like true ${likeOrder}\n` +
      "hint 2 x1\n",
  };
}

function invalidSource(testCase: InvalidCase): string {
  return `
let reached = false;
try {
  new RegExp(
    ${JSON.stringify(testCase.pattern)},
    ${JSON.stringify(testCase.flags)},
  );
  reached = true;
} catch (error) {
  console.log("error", error instanceof SyntaxError, reached);
}
console.log("after");
`;
}

const invalidExpected: Observation = {
  exitStatus: 0,
  stderr: "",
  stdout: "error true false\nafter\n",
};

async function assertNative(
  source: string,
  expected: Observation,
  differential = true,
): Promise<void> {
  if (differential) {
    assertMatchingObservations([expected, ...(await references(source))]);
  }
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "generated-m5-regexp-intrinsic.ts" },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const mir = printMir(compiled.mir);
    if (specialization === "enabled") {
      assert.match(mir, /guard-shape/u);
      assert.match(mir, /property-get generic/u);
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
          toolchain: zigToolchain,
        },
        (native) => {
          assertMatchingObservations([expected, native]);
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
}

async function assertUnsupportedNative(testCase: InvalidCase): Promise<void> {
  const pattern = JSON.stringify(testCase.pattern);
  const flags = JSON.stringify(testCase.flags);
  const source = `new RegExp(${pattern}, ${flags});`;
  const native = await runNativeCli(
    {
      args: ["generated-m5-regexp-intrinsic-boundary.ts"],
      source,
      sourceId: "generated-m5-regexp-intrinsic-boundary.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(native.exitStatus, 1);
  assert.equal(native.stdout, "");
  assert.match(
    native.stderr,
    /error\[OSEO2001\]: Regular expression pattern extension/u,
  );
}

test(
  "generated RegExp construction and lastIndex state match an oracle",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "RegExp construction, copying, conversion, and state agree",
      fc.asyncProperty(validCase, async (testCase) => {
        const parsed = parseRegExpPattern({
          flags: testCase.flags,
          source: testCase.pattern,
        });
        assert.equal(parsed.parsed, true);
        await assertNative(validSource(testCase), validExpected(testCase));
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
          "one admitted pattern, one unique admitted flag sequence, one " +
          "call or explicit-flags conversion path, one signed lastIndex " +
          "write, one false number hint, and one shape-guard miss",
        numRuns: 8,
        profile: "M5 RegExp intrinsic",
        seed: 0x6000_4f00,
        sizeLimit:
          "at most twelve generated atoms, six ordinary flags, one Unicode " +
          "mode, and one lastIndex write between -10000 and 10000",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

test(
  "generated rejected RegExp inputs match parser classifications",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "dynamic RegExp rejections match parser and boundary classifications",
      fc.asyncProperty(rejectedCase, async (testCase) => {
        const parsed = parseRegExpPattern({
          flags: testCase.flags,
          source: testCase.pattern,
        });
        if (testCase.expected === "unsupported") {
          if (testCase.parserExpected === "valid") {
            assert.equal(parsed.parsed, true);
          } else {
            assert.equal(parsed.parsed, false);
            assert.ok(
              parsed.errors.some((error) => error.kind === "unsupported"),
            );
          }
          await assertUnsupportedNative(testCase);
        } else {
          assert.equal(parsed.parsed, false);
          assert.ok(parsed.errors.some((error) => error.kind === "invalid"));
          await assertNative(
            invalidSource(testCase),
            invalidExpected,
            testCase.differential,
          );
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
          "one unmatched delimiter, leading quantifier, reversed bound, " +
          "malformed or out-of-range escape, unresolved backreference, " +
          "duplicate named capture, quantified assertion, decoded class " +
          "range bound, class backreference, Unicode group-name boundary, " +
          "duplicate flag, unknown flag, or exclusive Unicode mode pair",
        numRuns: 6,
        profile: "M5 RegExp intrinsic invalid inputs",
        seed: 0x6000_4f01,
        sizeLimit: "one pattern of at most eighteen units and one flag string",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
