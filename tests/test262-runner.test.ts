import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

import type { CliResult } from "../packages/cli/src/index.ts";
import { summarizeTest262 } from "../packages/testkit/src/index.ts";
import type { Test262Case } from "../packages/testkit/src/index.ts";
import {
  assembleTest262Source,
  createReviewedManifest,
  executeTest262Case,
  parseReviewedSubset,
  parseTest262Case,
  readSerializedManifestPartitions,
  ReviewedTest262RunError,
  selectManifestShard,
  validateReviewedResults,
} from "../tools/test262.ts";
import {
  normalizeReviewedManifestText,
  parseReviewedManifest,
  serializeTargetParity,
  serializeTest262Manifest,
  test262ManifestDigest,
  validateReviewedManifestFileSet,
} from "../tools/test262-manifest.ts";
import type {
  ReviewedTest262Entry,
  ReviewedTest262Subset,
  Test262ExecutionRequest,
  Test262Executor,
} from "../tools/test262.ts";
import type { Test262Result } from "../packages/testkit/src/index.ts";
import { isString } from "../tools/value-kinds.ts";

const revision = "f2d1435644797268dca1f7988cad5a4e89ccd8d2";
const harnesses = {
  base: "function assert() {}",
  done: "function $DONE() {}",
  includes: new Map([["propertyHelper.js", "function verifyProperty() {}"]]),
};

interface ReportedDescriptor {
  readonly configurable: boolean;
  readonly enumerable: boolean;
  readonly writable: boolean;
}

interface PropertyHelperOwner {
  readonly name?: unknown;
}

function successfulResult(): CliResult {
  return { exitStatus: 0, stderr: "", stdout: "" };
}

function propertyHelperGetter(): number {
  return 1;
}

test("parses test262 frontmatter and derives strictness", () => {
  const parsed = parseTest262Case(
    `/*---
features: [const]
includes: [propertyHelper.js]
negative:
  phase: runtime
  type: TypeError
flags: [onlyStrict]
---*/
throw 1;
`,
    "test/example.js",
    revision,
  );
  assert.deepEqual(parsed, {
    case: {
      async: false,
      expectedErrorType: "TypeError",
      expectedFailurePhase: "runtime",
      features: ["const"],
      flags: ["onlyStrict"],
      includes: ["propertyHelper.js"],
      mode: "script",
      path: "test/example.js",
      strictness: ["strict"],
      suiteRevision: revision,
    },
    flags: ["onlyStrict"],
  });
});

test("normalizes legacy test262 frontmatter line endings", () => {
  const parsed = parseTest262Case(
    "/*---\rfeatures: []\rflags: [noStrict]\rincludes: []\r---*/\r",
    "test/cr-only.js",
    revision,
  );
  assert.deepEqual(parsed.case.strictness, ["non-strict"]);
  assert.deepEqual(parsed.flags, ["noStrict"]);
});

test("rejects contradictory strictness flags", () => {
  assert.throws(
    () =>
      parseTest262Case(
        "/*---\nflags: [onlyStrict, noStrict]\n---*/\n",
        "test/invalid.js",
        revision,
      ),
    /cannot combine onlyStrict and noStrict/u,
  );
});

test("requires sorted and unique reviewed paths", () => {
  assert.throws(
    () =>
      parseReviewedSubset(
        JSON.stringify({
          suiteRevision: revision,
          supportedFeatures: [],
          tests: [
            {
              dependencies: ["functions"],
              expectedClassification: "pass",
              path: "test/z.js",
            },
            {
              dependencies: ["functions"],
              expectedClassification: "pass",
              path: "test/a.js",
            },
          ],
        }),
      ),
    /must be sorted/u,
  );
});

test("requires reviewed dependency tags from the frozen vocabulary", () => {
  assert.throws(
    () =>
      parseReviewedSubset(
        JSON.stringify({
          suiteRevision: revision,
          supportedFeatures: [],
          tests: [{ expectedClassification: "pass", path: "test/a.js" }],
        }),
      ),
    /at least one dependency tag/u,
  );
  assert.throws(
    () =>
      parseReviewedSubset(
        JSON.stringify({
          suiteRevision: revision,
          supportedFeatures: [],
          tests: [
            {
              dependencies: ["regular-expressions"],
              expectedClassification: "pass",
              path: "test/a.js",
            },
          ],
        }),
      ),
    /unreviewed dependency tag/u,
  );
  assert.throws(
    () =>
      parseReviewedSubset(
        JSON.stringify({
          suiteRevision: revision,
          supportedFeatures: [],
          tests: [
            {
              dependencies: ["functions", "functions"],
              expectedClassification: "pass",
              path: "test/a.js",
            },
          ],
        }),
      ),
    /repeats a dependency tag/u,
  );
});

function reviewedSubset(paths: readonly string[]): ReviewedTest262Subset {
  return {
    suiteRevision: revision,
    supportedFeatures: [],
    tests: paths.map(
      (path): ReviewedTest262Entry => ({
        dependencies: ["functions"],
        expectedClassification: "pass",
        path,
      }),
    ),
  };
}

function passingTest262Result(path: string): Test262Result {
  return {
    case: {
      async: false,
      features: [],
      flags: ["noStrict"],
      includes: [],
      mode: "script",
      path,
      strictness: ["non-strict"],
      suiteRevision: revision,
    },
    classification: "pass",
    dependencies: ["functions"],
    observation: { passed: true },
    unsupportedFeatures: [],
  };
}

test("validates each reviewed result path at the same index", () => {
  const subset = reviewedSubset(["test/a.js", "test/b.js"]);
  assert.throws(
    () =>
      validateReviewedResults(subset, [
        passingTest262Result("test/b.js"),
        passingTest262Result("test/a.js"),
      ]),
    /index 0.*expected path test\/a\.js.*received test\/b\.js/u,
  );
});

test("bounds reviewed workers and retains subset result order", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oseo-test262-pool-"));
  const paths = ["a.js", "b.js", "c.js"];
  let active = 0;
  let maximumActive = 0;
  let releaseFirst: (() => void) | undefined;
  const firstBlocked = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let markFirstStarted: (() => void) | undefined;
  const firstStarted = new Promise<void>((resolve) => {
    markFirstStarted = resolve;
  });
  let thirdStarted: (() => void) | undefined;
  const thirdStart = new Promise<void>((resolve) => {
    thirdStarted = resolve;
  });
  try {
    await Promise.all(
      paths.map(async (path) => {
        const sourcePath = join(directory, path);
        await writeFile(sourcePath, "/*---\nflags: [noStrict]\n---*/\n");
      }),
    );
    const calls = new Map<string, number>();
    const executor: Test262Executor = {
      async execute(request): Promise<CliResult> {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        const call = (calls.get(request.sourceId) ?? 0) + 1;
        calls.set(request.sourceId, call);
        try {
          if (request.sourceId === "a.js" && call === 1) {
            markFirstStarted?.();
            await firstBlocked;
          }
          if (request.sourceId === "c.js" && call === 1) {
            await firstStarted;
            thirdStarted?.();
          }
          return successfulResult();
        } finally {
          active -= 1;
        }
      },
    };
    const runPromise = createReviewedManifest(
      reviewedSubset(paths),
      directory,
      harnesses,
      executor,
      { poolLimit: 2 },
    );
    await thirdStart;
    releaseFirst?.();
    const run = await runPromise;
    assert.equal(maximumActive, 2);
    assert.equal(run.metadata.poolLimit, 2);
    assert.deepEqual(
      run.manifest.results.map((result) => result.case.path),
      paths,
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("retries only named temporary process exhaustion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oseo-test262-retry-"));
  const path = "retry.js";
  const sourcePath = join(directory, path);
  try {
    await writeFile(sourcePath, "/*---\nflags: [noStrict]\n---*/\n");
    let calls = 0;
    const executor: Test262Executor = {
      execute(): Promise<CliResult> {
        calls += 1;
        if (calls === 1) {
          return Promise.resolve({
            exitStatus: 1,
            stderr:
              `${path}:1:1: error[OSEO3001]: The native toolchain for ` +
              "target 'linux-x86_64-gnu' " +
              "could not be started because the host temporarily " +
              "exhausted process resources.\n",
            stdout: "",
          });
        }
        return Promise.resolve(successfulResult());
      },
    };
    const run = await createReviewedManifest(
      reviewedSubset([path]),
      directory,
      harnesses,
      executor,
      { poolLimit: 1 },
    );
    assert.equal(calls, 3);
    assert.equal(run.metadata.retries, 1);
    assert.equal(run.manifest.results[0]?.classification, "pass");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

for (const deterministicFailure of [
  "The native toolchain for target 'linux-x86_64-gnu' failed (exit 1).",
  "The native temporary directory could not be created.",
  "The native executable could not be started.",
  "The native temporary directory could not be removed.",
] as const) {
  test(`does not retry ${deterministicFailure}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "oseo-test262-no-retry-"));
    const path = "no-retry.js";
    try {
      await writeFile(
        join(directory, path),
        "/*---\nflags: [noStrict]\n---*/\n",
      );
      let calls = 0;
      const executor: Test262Executor = {
        execute(): Promise<CliResult> {
          calls += 1;
          return Promise.resolve({
            exitStatus: 1,
            stderr: `${path}:1:1: error[OSEO3001]: ${deterministicFailure}\n`,
            stdout: "",
          });
        },
      };
      await assert.rejects(
        createReviewedManifest(
          reviewedSubset([path]),
          directory,
          harnesses,
          executor,
          { poolLimit: 1 },
        ),
        (cause: unknown) => {
          assert.ok(cause instanceof ReviewedTest262RunError);
          assert.equal(cause.metadata.poolLimit, 1);
          assert.equal(cause.metadata.retries, 0);
          return true;
        },
      );
      assert.equal(calls, 1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
}

test("separates infrastructure failures from harness defects", async () => {
  const infrastructureSource = "/*---\nflags: [noStrict]\n---*/\n";
  const infrastructure = await executeTest262Case(
    infrastructureSource,
    parseTest262Case(infrastructureSource, "test/failure.js", revision),
    new Set<string>(),
    harnesses,
    respondStderr(
      "test/failure.js:1:1: error[OSEO3001]: " +
        "The native executable could not be started.\n",
    ),
  );
  assert.equal(infrastructure.classification, "infrastructure-failure");
  assert.equal(infrastructure.observation.failureKind, "infrastructure");

  const harnessSource =
    "/*---\nflags: [noStrict]\nincludes: [missing.js]\n---*/\n";
  const harness = await executeTest262Case(
    harnessSource,
    parseTest262Case(harnessSource, "test/failure.js", revision),
    new Set<string>(),
    harnesses,
    { execute: () => Promise.resolve(successfulResult()) },
  );
  assert.equal(harness.classification, "harness-failure");
  assert.equal(harness.observation.failureKind, "harness");
});

test("stops assigning reviewed work after a worker failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oseo-test262-abort-"));
  const paths = ["a.js", "b.js", "c.js"];
  try {
    await Promise.all(
      paths.slice(1).map(async (path) => {
        await writeFile(
          join(directory, path),
          "/*---\nflags: [noStrict]\n---*/\n",
        );
      }),
    );
    let calls = 0;
    const executor: Test262Executor = {
      execute(): Promise<CliResult> {
        calls += 1;
        return Promise.resolve(successfulResult());
      },
    };
    await assert.rejects(
      createReviewedManifest(
        reviewedSubset(paths),
        directory,
        harnesses,
        executor,
        { poolLimit: 1 },
      ),
      /ENOENT/u,
    );
    assert.equal(calls, 0);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("assembles strict source with reviewed includes in order", () => {
  const testCase: Test262Case = {
    async: false,
    features: [],
    flags: ["onlyStrict"],
    includes: ["propertyHelper.js"],
    mode: "script",
    path: "test/example.js",
    strictness: ["strict"],
    suiteRevision: revision,
  };
  assert.equal(
    assembleTest262Source(
      "const value = 1;",
      "strict",
      testCase,
      harnesses,
      false,
    ),
    '"use strict";\n' +
      "function assert() {}\n" +
      "function verifyProperty() {}\n" +
      "const value = 1;\n",
  );
});

test("property helper checks behavior beyond reported flags", async () => {
  const helper = await readFile(
    new URL("test262/harness/propertyHelper.js", import.meta.url),
    "utf8",
  );
  const verify = (reported: ReportedDescriptor): void => {
    const target = {};
    Object.defineProperty(target, "name", {
      configurable: true,
      enumerable: true,
      value: "fn",
      writable: true,
    });
    const harnessAssert = Object.assign(
      (value: boolean) => assert.equal(value, true),
      {
        sameValue<Actual, Expected>(actual: Actual, expected: Expected): void {
          assert.ok(Object.is(actual, expected));
        },
      },
    );
    runInNewContext(`${helper}\nverifyProperty(target, "name", reported);`, {
      assert: harnessAssert,
      Object: {
        defineProperty: Object.defineProperty,
        getOwnPropertyDescriptor(
          object: PropertyHelperOwner,
          name: PropertyKey,
        ): PropertyDescriptor | undefined {
          const actual = Object.getOwnPropertyDescriptor(object, name);
          return actual == null ? undefined : { ...reported, value: "fn" };
        },
        keys: Object.keys,
      },
      reported: { ...reported, value: "fn" },
      target,
    });
  };
  assert.throws(() =>
    verify({ configurable: true, enumerable: true, writable: false }),
  );
  assert.throws(() =>
    verify({ configurable: true, enumerable: false, writable: true }),
  );
  assert.throws(() =>
    verify({ configurable: false, enumerable: true, writable: true }),
  );
});

test("property helper exposes legacy verification APIs", async () => {
  const helper = await readFile(
    new URL("test262/harness/propertyHelper.js", import.meta.url),
    "utf8",
  );
  interface PropertyHelperTarget {
    [name: string]: number | string;
    writable: number;
  }
  const target: PropertyHelperTarget = { writable: 1 };
  Object.defineProperty(target, "fixed", {
    configurable: false,
    enumerable: false,
    value: "unlikelyValue",
    writable: false,
  });
  Object.defineProperty(target, "removable", {
    configurable: true,
    enumerable: true,
    value: 2,
  });
  const harnessAssert = Object.assign(
    (value: boolean) => assert.equal(value, true),
    {
      sameValue<Actual, Expected>(actual: Actual, expected: Expected): void {
        assert.ok(Object.is(actual, expected));
      },
    },
  );
  runInNewContext(
    `${helper}\n` +
      'verifyEqualTo(target, "writable", 1);\n' +
      'verifyWritable(target, "writable");\n' +
      'verifyNotWritable(target, "fixed");\n' +
      'verifyEnumerable(target, "removable");\n' +
      'verifyNotEnumerable(target, "fixed");\n' +
      'verifyConfigurable(target, "removable");\n' +
      'verifyNotConfigurable(target, "fixed");',
    {
      assert: harnessAssert,
      Object,
      target,
      Test262Error: Error,
    },
  );
  assert.equal(target.writable, 1);
  assert.equal(target.fixed, "unlikelyValue");
  assert.equal("removable" in target, false);
});

test("property helper verifies accessors and rejects extra keys", async () => {
  const helper = await readFile(
    new URL("test262/harness/propertyHelper.js", import.meta.url),
    "utf8",
  );
  const target = {};
  Object.defineProperty(target, "accessor", {
    configurable: true,
    get: propertyHelperGetter,
  });
  const harnessAssert = Object.assign(
    (value: boolean) => assert.equal(value, true),
    {
      sameValue<Actual, Expected>(actual: Actual, expected: Expected): void {
        assert.ok(Object.is(actual, expected));
      },
    },
  );
  const context = {
    assert: harnessAssert,
    getter: propertyHelperGetter,
    Object,
    target,
    Test262Error: Error,
  };
  runInNewContext(
    `${helper}\n` +
      'verifyProperty(target, "accessor", { get: getter, set: undefined });',
    context,
  );
  assert.throws(() =>
    runInNewContext(
      `${helper}\n` +
        'verifyProperty(target, "accessor", { unexpected: true });',
      context,
    ),
  );
  assert.throws(() =>
    runInNewContext(
      `${helper}\n` +
        'verifyProperty(target, "accessor", { get: function () {} });',
      context,
    ),
  );
});

test("leaves raw source unchanged and omits every harness", async () => {
  const source =
    "/*---\nflags: [raw]\nincludes: [missing.js]\n---*/\n" +
    "$DONOTEVALUATE();";
  const parsed = parseTest262Case(source, "test/raw.js", revision);
  const requests: Test262ExecutionRequest[] = [];
  const executor: Test262Executor = {
    execute(request: Test262ExecutionRequest): Promise<CliResult> {
      requests.push(request);
      return Promise.resolve(successfulResult());
    },
  };
  const result = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    executor,
  );
  assert.equal(result.classification, "pass");
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => request.source === source));
});

test("executes every strictness and specialization variant", async () => {
  const parsed = parseTest262Case(
    "/*---\n---*/\nconst value = 1;\n",
    "test/example.js",
    revision,
  );
  const requests: Test262ExecutionRequest[] = [];
  const executor: Test262Executor = {
    execute(request: Test262ExecutionRequest): Promise<CliResult> {
      requests.push(request);
      return Promise.resolve(successfulResult());
    },
  };
  const result = await executeTest262Case(
    "/*---\n---*/\nconst value = 1;\n",
    parsed,
    new Set<string>(),
    harnesses,
    executor,
    ["lexical-bindings"],
  );
  assert.equal(result.classification, "pass");
  assert.deepEqual(
    requests.map((request) => request.specialization),
    ["disabled", "enabled", "disabled", "enabled"],
  );
  assert.deepEqual(result.dependencies, ["lexical-bindings"]);
  assert.deepEqual(result.execution, {
    harnessIncludes: ["base.js"],
    target: "linux-x86_64-gnu",
    variants: [
      { specialization: "disabled", strictness: "non-strict" },
      { specialization: "enabled", strictness: "non-strict" },
      { specialization: "disabled", strictness: "strict" },
      { specialization: "enabled", strictness: "strict" },
    ],
  });
});

test("rejects specialization observation differences", async () => {
  const parsed = parseTest262Case(
    "/*---\nflags: [noStrict]\n---*/\n",
    "test/example.js",
    revision,
  );
  let calls = 0;
  const executor: Test262Executor = {
    execute(): Promise<CliResult> {
      calls += 1;
      return Promise.resolve({
        exitStatus: 0,
        stderr: "",
        stdout: calls === 1 ? "disabled" : "enabled",
      });
    },
  };
  const result = await executeTest262Case(
    "/*---\nflags: [noStrict]\n---*/\n",
    parsed,
    new Set<string>(),
    harnesses,
    executor,
  );
  assert.equal(result.classification, "semantic-failure");
  assert.match(
    result.observation.detail ?? "",
    /diverge between non-strict disabled and non-strict enabled/u,
  );
});

function respondStderr(stderr: string): Test262Executor {
  return {
    execute(): Promise<CliResult> {
      return Promise.resolve({ exitStatus: 1, stderr, stdout: "" });
    },
  };
}

test("executes runtime negatives and compares the thrown type", async () => {
  const source = `/*---
negative:
  phase: runtime
  type: TypeError
flags: [noStrict]
---*/
null.item;
`;
  const parsed = parseTest262Case(source, "test/runtime-negative.js", revision);
  const matched = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    respondStderr(
      "test/runtime-negative.js:8:1: error[OSEO2001]: TypeError: " +
        "Cannot read properties of a nullish value.\nOSEO_THROWN TypeError\n",
    ),
    ["error-intrinsics"],
  );
  assert.equal(matched.classification, "expected-negative");
  assert.equal(matched.observation.errorType, "TypeError");
  assert.equal(matched.observation.failedPhase, "runtime");
  assert.deepEqual(
    matched.execution?.variants.map((variant) => variant.specialization),
    ["disabled", "enabled"],
  );
  // The type comes from the stable marker, not the rendered name, so a
  // mutated empty name whose diagnostic is just the message still
  // reports the intrinsic TypeError identity.
  const mutatedName = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    respondStderr(
      "test/runtime-negative.js:8:1: error[OSEO2001]: body\n" +
        "OSEO_THROWN TypeError\n",
    ),
    ["error-intrinsics"],
  );
  assert.equal(mutatedName.classification, "expected-negative");
  assert.equal(mutatedName.observation.errorType, "TypeError");
  const mismatched = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    respondStderr(
      "test/runtime-negative.js:8:1: error[OSEO2001]: RangeError: bad.\n" +
        "OSEO_THROWN RangeError\n",
    ),
  );
  assert.equal(mismatched.classification, "semantic-failure");
  assert.equal(mismatched.observation.errorType, "RangeError");
  // A thrown message that embeds an owned diagnostic code must not be
  // mistaken for a compile-stage rejection.
  const embeddedCode = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    respondStderr(
      "test/runtime-negative.js:8:1: error[OSEO2001]: TypeError: " +
        "error[OSEO1001] in message\nOSEO_THROWN TypeError\n",
    ),
    ["error-intrinsics"],
  );
  assert.equal(embeddedCode.classification, "expected-negative");
  assert.equal(embeddedCode.observation.errorType, "TypeError");
  const unobservable = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    respondStderr(
      "test/runtime-negative.js:8:1: error[OSEO2001]: " +
        "Unhandled JavaScript throw.\n",
    ),
  );
  assert.equal(unobservable.classification, "unsupported-profile-feature");
  assert.equal(
    unobservable.observation.unsupportedCapability,
    "runtime-error-observation",
  );
  const completed = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    {
      execute(): Promise<CliResult> {
        return Promise.resolve(successfulResult());
      },
    },
  );
  assert.equal(completed.classification, "semantic-failure");
  assert.match(
    completed.observation.detail ?? "",
    /completed without the expected runtime error/u,
  );
  // A parse-phase OSEO0001 rejection is not an unhandled throw, so a
  // runtime negative rejected before execution is a phase mismatch
  // recorded as a parse phase with no execution evidence, not an
  // unsupported runtime observation.
  const parseRejected = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    respondStderr(
      "test/runtime-negative.js:8:1: error[OSEO0001]: " +
        "Unsupported syntax.\n",
    ),
  );
  assert.equal(parseRejected.classification, "semantic-failure");
  assert.equal(parseRejected.observation.failedPhase, "parse");
  assert.equal(parseRejected.observation.errorType, undefined);
  assert.equal(parseRejected.execution, undefined);
  assert.notEqual(
    parseRejected.observation.unsupportedCapability,
    "runtime-error-observation",
  );
  // A non-catchable resource diagnostic is OSEO2001 but not a thrown
  // value, so it stays a semantic failure rather than disappearing as an
  // unsupported runtime observation.
  const resourceLimit = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    respondStderr(
      "test/runtime-negative.js:8:1: error[OSEO2001]: " +
        "Maximum call depth exceeded.\n",
    ),
  );
  assert.equal(resourceLimit.classification, "semantic-failure");
  assert.equal(resourceLimit.observation.failedPhase, "runtime");
  assert.notEqual(
    resourceLimit.observation.unsupportedCapability,
    "runtime-error-observation",
  );

  const primitiveWrapper = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    respondStderr(
      "test/runtime-negative.js:8:1: error[OSEO2001]: " +
        "Primitive wrapper objects are not admitted yet.\n",
    ),
  );
  assert.equal(
    primitiveWrapper.observation.unsupportedCapability,
    "primitive-wrapper",
  );
  assert.equal(primitiveWrapper.classification, "unsupported-profile-feature");

  const deferredObjectStatic = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    respondStderr(
      "test/runtime-negative.js:8:1: error[OSEO2001]: " +
        "Object static method is not admitted in this M5b node.\n",
    ),
  );
  assert.equal(
    deferredObjectStatic.observation.unsupportedCapability,
    "object-static-method",
  );
  assert.equal(
    deferredObjectStatic.classification,
    "unsupported-profile-feature",
  );

  const deferredStringPrototype = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    respondStderr(
      "test/runtime-negative.js:8:1: error[OSEO2001]: " +
        "String prototype method is not admitted in this M5b node.\n",
    ),
  );
  assert.equal(
    deferredStringPrototype.observation.unsupportedCapability,
    "string-prototype-method",
  );
  assert.equal(
    deferredStringPrototype.classification,
    "unsupported-profile-feature",
  );

  const descriptorMap = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    respondStderr(
      "test/runtime-negative.js:8:1: error[OSEO2001]: " +
        "Object.create descriptor maps are unsupported in M3.\n",
    ),
  );
  assert.equal(
    descriptorMap.observation.unsupportedCapability,
    "object-create-descriptor-map",
  );
  assert.equal(descriptorMap.classification, "unsupported-profile-feature");
});

test("keeps user-thrown runtime-boundary text as a failure", async () => {
  const source = `/*---
---*/
throw new Error("Primitive wrapper objects are not admitted yet.");
`;
  const parsed = parseTest262Case(source, "test/user-throw.js", revision);
  const result = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    respondStderr(
      "test/user-throw.js:3:1: error[OSEO2001]: Error: " +
        "Primitive wrapper objects are not admitted yet.\n" +
        "OSEO_THROWN Error\n",
    ),
    ["error-intrinsics"],
  );
  assert.equal(result.classification, "semantic-failure");
  assert.equal(result.observation.failedPhase, "runtime");
  assert.equal(result.observation.unsupportedCapability, undefined);
});

test("classifies unsupported features without native execution", async () => {
  const parsed = parseTest262Case(
    "/*---\nfeatures: [default-parameters]\n---*/\n",
    "test/example.js",
    revision,
  );
  const executor: Test262Executor = {
    execute(): Promise<CliResult> {
      throw new Error("must not execute");
    },
  };
  const result = await executeTest262Case(
    "/*---\nfeatures: [default-parameters]\n---*/\n",
    parsed,
    new Set<string>(),
    harnesses,
    executor,
  );
  assert.equal(result.classification, "unsupported-profile-feature");
});

test("classifies reviewed missing includes as unsupported", async () => {
  await Promise.all(
    ["nativeFunctionMatcher.js", "wellKnownIntrinsicObjects.js"].map(
      async (include) => {
        const source = `/*---
includes: [${include}]
---*/
`;
        const parsed = parseTest262Case(
          source,
          "test/harness-gap.js",
          revision,
        );
        const result = await executeTest262Case(
          source,
          parsed,
          new Set(),
          harnesses,
          {
            async execute() {
              return assert.fail("unsupported harness case must not execute");
            },
          },
          ["functions"],
        );
        assert.equal(result.classification, "unsupported-profile-feature");
        assert.equal(
          result.observation.unsupportedCapability,
          "harness-include",
        );
      },
    ),
  );
});

test("recognizes strict early errors as expected parse failures", async () => {
  const source = `/*---
negative:
  phase: parse
  type: SyntaxError
flags: [onlyStrict]
---*/
(function (value, value) {});
`;
  const parsed = parseTest262Case(source, "test/negative.js", revision);
  const executor: Test262Executor = {
    execute(): Promise<CliResult> {
      throw new Error("must not execute");
    },
  };
  const result = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    executor,
  );
  assert.equal(result.classification, "expected-negative");
  assert.equal(result.observation.errorType, "SyntaxError");
});

test("serializes reviewed manifests without volatile metadata", () => {
  const serialized = serializeTest262Manifest({
    results: [],
    suiteRevision: revision,
    summary: {
      dependencies: [],
      expectedNegatives: 0,
      groups: [],
      harnessFailures: 0,
      infrastructureFailures: 0,
      passes: 0,
      semanticFailures: 0,
      unsupportedProfileFeatures: 0,
    },
  });
  assert.doesNotMatch(serialized.indexText, /timestamp|generatedAt/u);
  assert.ok(serialized.indexText.endsWith("\n"));
  assert.deepEqual(serialized.partitions, []);
  const parity = serializeTargetParity(serialized, revision);
  assert.match(parity, /canonicalDigest: >-/u);
  assert.ok(parity.split("\n").every((line) => line.length <= 80));
});

test("partitions reviewed records by deterministic group and hash", () => {
  const results = [
    passingTest262Result("test/built-ins/Object/a.js"),
    passingTest262Result("test/language/expressions/a.js"),
    passingTest262Result("test/language/expressions/b.js"),
  ];
  const manifest = {
    results,
    suiteRevision: revision,
    summary: summarizeTest262(results),
  };
  const serialized = serializeTest262Manifest(manifest);
  assert.deepEqual(
    serialized.partitions.map(({ group, key, path }) => ({
      group,
      key,
      path,
    })),
    [
      {
        group: "built-ins/Object",
        key: "de",
        path: "results/built-ins/Object/de.yaml",
      },
      {
        group: "language/expressions",
        key: "1c",
        path: "results/language/expressions/1c.yaml",
      },
      {
        group: "language/expressions",
        key: "a7",
        path: "results/language/expressions/a7.yaml",
      },
    ],
  );
  const texts = new Map(
    serialized.partitions.map((partition) => [partition.path, partition.text]),
  );
  assert.deepEqual(
    parseReviewedManifest(
      serialized.indexText,
      (path) => texts.get(path) ?? assert.fail(`missing ${path}`),
    ),
    manifest,
  );

  assert.throws(
    () =>
      serializeTest262Manifest({
        ...manifest,
        results: [results[0]!, results[0]!],
      }),
    /result paths must be unique/u,
  );
});

test("target parity covers every record partition", () => {
  const firstResult = passingTest262Result(
    "test/language/expressions/example.js",
  );
  const secondResult: Test262Result = {
    ...firstResult,
    observation: { detail: "partition changed", passed: true },
  };
  const first = serializeTest262Manifest({
    results: [firstResult],
    suiteRevision: revision,
    summary: summarizeTest262([firstResult]),
  });
  const second = serializeTest262Manifest({
    results: [secondResult],
    suiteRevision: revision,
    summary: summarizeTest262([secondResult]),
  });
  assert.equal(first.indexText, second.indexText);
  assert.notEqual(test262ManifestDigest(first), test262ManifestDigest(second));
});

test("requires the manifest index to name every partition file", () => {
  const result = passingTest262Result("test/language/expressions/example.js");
  const serialized = serializeTest262Manifest({
    results: [result],
    suiteRevision: revision,
    summary: summarizeTest262([result]),
  });
  const paths = serialized.partitions.map(({ path }) => path);
  validateReviewedManifestFileSet(serialized.indexText, paths);
  assert.throws(
    () =>
      validateReviewedManifestFileSet(serialized.indexText, [
        ...paths,
        "results/language/expressions/ff.yaml",
      ]),
    /unexpected=.*ff\.yaml/u,
  );
  assert.throws(
    () => validateReviewedManifestFileSet(serialized.indexText, []),
    /missing=.*\.yaml/u,
  );
});

test("round-trips and shards the checked-in reviewed manifest", async () => {
  const indexText = await readFile(
    new URL("test262/results.yaml", import.meta.url),
    "utf8",
  );
  const canonicalIndex = normalizeReviewedManifestText(indexText);
  let activeReads = 0;
  let peakReads = 0;
  const partitions = await readSerializedManifestPartitions(
    canonicalIndex,
    async (path) => {
      activeReads += 1;
      peakReads = Math.max(peakReads, activeReads);
      try {
        return await readFile(
          new URL(`test262/${path}`, import.meta.url),
          "utf8",
        );
      } finally {
        activeReads -= 1;
      }
    },
  );
  assert.equal(peakReads, 1);
  const partitionTexts = new Map(
    partitions.map(({ path, text }) => [path, text]),
  );
  const reparsed = parseReviewedManifest(canonicalIndex, (path) => {
    const text = partitionTexts.get(path);
    if (text == null) throw new Error(`partition ${path} was not loaded`);
    return text;
  });
  assert.equal(serializeTest262Manifest(reparsed).indexText, canonicalIndex);
  assert.deepEqual(serializeTest262Manifest(reparsed).partitions, partitions);

  const shards = [1, 2, 3].map((index) =>
    selectManifestShard(reparsed, { index, total: 3 }),
  );
  assert.deepEqual(
    shards
      .flatMap((shard) => shard.results)
      .map((result) => result.case.path)
      .toSorted(),
    reparsed.results.map((result) => result.case.path).toSorted(),
  );
  assert.equal(
    shards.reduce((total, shard) => total + shard.summary.passes, 0),
    reparsed.summary.passes,
  );
});

test("rejects malformed reviewed manifest entries", () => {
  assert.throws(
    () =>
      parseReviewedManifest(
        `partitions:
  - group: language/expressions
    key: 0a
    path: results/language/expressions/0a.yaml
suiteRevision: ${revision}
summary: {}
`,
        () => `group: language/expressions
key: 0a
results:
  - case: {}
    classification: pass
    dependencies: []
suiteRevision: ${revision}
`,
      ),
    /test262 result 0 path must be a non-empty string/u,
  );
  assert.throws(
    () =>
      parseReviewedManifest(
        `partitions:
  - group: language/expressions
    key: 0a
    path: results/language/expressions/0a.yaml
suiteRevision: ${revision}
summary: {}
`,
        () => `group: language/expressions
key: 0a
results:
  - case:
      path: test/language/expressions/example.js
    classification: pass
suiteRevision: ${revision}
`,
      ),
    /test262 result 0 dependencies must be an array/u,
  );
  assert.throws(
    () =>
      parseReviewedManifest(
        `partitions:
  - group: language/expressions
    key: 0a
    path: results/language/expressions/0a.yaml
suiteRevision: ${revision}
summary: {}
`,
        () => `group: language/expressions
key: 0a
results:
  - case:
      path: test/language/expressions/example.js
    classification: pass
    dependencies: []
    observation:
      failureKind: infrastructure
      passed: false
suiteRevision: ${revision}
`,
      ),
    /failure kind does not match/u,
  );
});

function respond(stdout: string): Test262Executor {
  return {
    execute(request: Test262ExecutionRequest): Promise<CliResult> {
      assert.ok(request.source.includes("function $DONE() {}"));
      return Promise.resolve({ exitStatus: 0, stderr: "", stdout });
    },
  };
}

test("classifies compile-stage OSEO1001 exits as unsupported", async () => {
  const source = "/*---\n---*/\nconst tagged = value?.tag;\n";
  const parsed = parseTest262Case(source, "test/unsupported.js", revision);
  const executor: Test262Executor = {
    execute(): Promise<CliResult> {
      return Promise.resolve({
        exitStatus: 1,
        stderr:
          "test/unsupported.js:1:1: error[OSEO1001]: " +
          "Optional chaining is outside the current profile.\n",
        stdout: "",
      });
    },
  };
  const result = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    executor,
    ["functions"],
  );
  assert.equal(result.classification, "unsupported-profile-feature");
  assert.equal(result.observation.unsupportedCapability, "profile-syntax");
  assert.deepEqual(result.dependencies, ["functions"]);
  assert.equal(result.execution, undefined);
});

test("requires the asynchronous completion marker", async () => {
  const source = "/*---\nflags: [async]\n---*/\n$DONE();\n";
  const parsed = parseTest262Case(source, "test/async-case.js", revision);
  const completed = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    respond("Test262:AsyncTestComplete\n"),
    ["async-functions"],
  );
  assert.equal(completed.classification, "pass");
  assert.equal(completed.execution?.scheduler, "deterministic-logical-clock");
  assert.deepEqual(completed.execution?.harnessIncludes, [
    "base.js",
    "doneprintHandle.js",
  ]);
  const silent = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    respond(""),
    ["async-functions"],
  );
  assert.equal(silent.classification, "semantic-failure");
  assert.match(silent.observation.detail ?? "", /without printing/u);
  const failed = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    respond("Test262:AsyncTestFailure:\n"),
    ["async-functions"],
  );
  assert.equal(failed.classification, "semantic-failure");
  const failedThenCompleted = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    respond("Test262:AsyncTestFailure:\nTest262:AsyncTestComplete\n"),
    ["async-functions"],
  );
  assert.equal(failedThenCompleted.classification, "semantic-failure");
  const doubleCompleted = await executeTest262Case(
    source,
    parsed,
    new Set<string>(),
    harnesses,
    respond("Test262:AsyncTestComplete\nTest262:AsyncTestComplete\n"),
    ["async-functions"],
  );
  assert.equal(doubleCompleted.classification, "semantic-failure");
});

test("executes module cases with explicit module intent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oseo-test262-module-"));
  try {
    await writeFile(
      join(directory, "dep_FIXTURE.js"),
      "export const answer = 42;\n",
    );
    const source =
      "/*---\nflags: [module]\n---*/\n" +
      'import { answer } from "./dep_FIXTURE.js";\n' +
      "assert(answer === 42);\n";
    const parsed = parseTest262Case(source, "test/module-case.js", revision);
    const requests: Test262ExecutionRequest[] = [];
    const executor: Test262Executor = {
      execute(request: Test262ExecutionRequest): Promise<CliResult> {
        requests.push(request);
        return Promise.resolve(successfulResult());
      },
    };
    const result = await executeTest262Case(
      source,
      parsed,
      new Set<string>(),
      harnesses,
      executor,
      ["module-linking"],
      {
        rootPath: directory,
        sourcePath: join(directory, "module-case.js"),
      },
    );
    assert.equal(result.classification, "pass");
    assert.deepEqual(
      requests.map((request) => request.mode),
      ["module", "module"],
    );
    assert.ok(
      requests.every(
        (request) =>
          request.sourcePath === join(directory, "module-case.js") &&
          !request.source.startsWith('"use strict";'),
      ),
    );
    assert.deepEqual(result.execution?.variants, [
      { specialization: "disabled", strictness: "strict" },
      { specialization: "enabled", strictness: "strict" },
    ]);
    assert.deepEqual(
      result.execution?.moduleGraph?.map((node) => ({
        dependencies: node.dependencies,
        id: node.id,
      })),
      [
        { dependencies: ["dep_FIXTURE.js"], id: "test/module-case.js" },
        { dependencies: [], id: "dep_FIXTURE.js" },
      ],
    );
    assert.ok(
      result.execution?.moduleGraph?.every(
        (node) => isString(node.sourceHash) && node.sourceHash !== "",
      ),
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("classifies module negatives by owned diagnostic phase", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oseo-test262-negative-"));
  try {
    await writeFile(
      join(directory, "dep_FIXTURE.js"),
      "export const present = 1;\n",
    );
    const executor: Test262Executor = {
      execute(): Promise<CliResult> {
        throw new Error("must not execute");
      },
    };
    const run = async (
      body: string,
      phase: string,
    ): Promise<ReturnType<typeof executeTest262Case>> => {
      const source =
        `/*---\nflags: [module]\nnegative:\n  phase: ${phase}\n` +
        `  type: SyntaxError\n---*/\n${body}`;
      const parsed = parseTest262Case(source, "test/negative.js", revision);
      return await executeTest262Case(
        source,
        parsed,
        new Set<string>(),
        harnesses,
        executor,
        ["module-linking"],
        {
          rootPath: directory,
          sourcePath: join(directory, "negative.js"),
        },
      );
    };
    const parse = await run("import { broken } from;\n", "parse");
    assert.equal(parse.classification, "expected-negative");
    assert.equal(parse.observation.failedPhase, "parse");
    const missingExport = await run(
      'import { missing } from "./dep_FIXTURE.js";\n',
      "resolution",
    );
    assert.equal(missingExport.classification, "expected-negative");
    assert.equal(missingExport.observation.failedPhase, "resolution");
    const missingFile = await run(
      'import { gone } from "./absent_FIXTURE.js";\n',
      "resolution",
    );
    assert.equal(missingFile.classification, "expected-negative");
    assert.equal(missingFile.observation.failedPhase, "resolution");
    const bareSpecifier = await run(
      'import { gone } from "package-name";\n',
      "resolution",
    );
    assert.equal(bareSpecifier.classification, "unsupported-profile-feature");
    assert.equal(
      bareSpecifier.observation.unsupportedCapability,
      "module-resolution-profile",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
