import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
} from "../tools/test262.ts";
import type {
  Test262ExecutionRequest,
  Test262Executor,
} from "../tools/test262.ts";

const revision = "f2d1435644797268dca1f7988cad5a4e89ccd8d2";
const harnesses = {
  base: "function assert() {}",
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
    target: "x86_64-linux-gnu",
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
});
