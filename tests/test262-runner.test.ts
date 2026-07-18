import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

import type { CliResult } from "../packages/cli/src/index.ts";
import type { Test262Case } from "../packages/testkit/src/index.ts";
import {
  assembleTest262Source,
  executeTest262Case,
  parseReviewedSubset,
  parseTest262Case,
  serializeTest262Manifest,
  serializeTargetParity,
} from "../tools/test262.ts";
import type {
  Test262ExecutionRequest,
  Test262Executor,
} from "../tools/test262.ts";

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

function successfulResult(): CliResult {
  return { exitStatus: 0, stderr: "", stdout: "" };
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
      (value: unknown) => assert.equal(value, true),
      {
        sameValue(actual: unknown, expected: unknown): void {
          assert.ok(Object.is(actual, expected));
        },
      },
    );
    runInNewContext(`${helper}\nverifyProperty(target, "name", reported);`, {
      assert: harnessAssert,
      Object: {
        defineProperty: Object.defineProperty,
        getOwnPropertyDescriptor(
          object: object,
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

test("keeps unobservable runtime-negative types unsupported", async () => {
  const source = `/*---
negative:
  phase: runtime
  type: TypeError
flags: [noStrict]
---*/
throw 1;
`;
  const parsed = parseTest262Case(source, "test/runtime-negative.js", revision);
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
  assert.equal(result.classification, "unsupported-profile-feature");
  assert.equal(result.observation.unsupportedCapability, "runtime-error-types");
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
      passes: 0,
      semanticFailures: 0,
      unsupportedProfileFeatures: 0,
    },
  });
  assert.doesNotMatch(serialized, /timestamp|generatedAt/u);
  assert.ok(serialized.endsWith("\n"));
  const parity = serializeTargetParity(serialized, revision);
  assert.match(parity, /canonicalDigest: >-/u);
  assert.ok(parity.split("\n").every((line) => line.length <= 80));
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
        (node) => typeof node.sourceHash === "string" && node.sourceHash !== "",
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
