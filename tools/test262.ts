/* eslint-disable no-await-in-loop -- Reviewed native cases run in order. */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { runNativeCli } from "../packages/cli/src/index.ts";
import type { CliResult } from "../packages/cli/src/index.ts";
import { compileSource } from "../packages/compiler/src/index.ts";
import type { SpecializationMode } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import {
  classifyTest262,
  summarizeTest262,
  test262DependencyVocabulary,
} from "../packages/testkit/src/index.ts";
import type {
  Test262Case,
  Test262Classification,
  Test262Evidence,
  Test262Execution,
  Test262FailurePhase,
  Test262Result,
  Test262Strictness,
  Test262Summary,
  Test262Variant,
} from "../packages/testkit/src/index.ts";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const subsetPath = join(repositoryRoot, "tests/test262/subset.yaml");
const resultPath = join(repositoryRoot, "tests/test262/results.yaml");
const baseHarnessPath = join(repositoryRoot, "tests/test262/harness/base.js");
const propertyHarnessPath = join(
  repositoryRoot,
  "tests/test262/harness/propertyHelper.js",
);

const classifications = new Set<Test262Classification>([
  "expected-negative",
  "harness-failure",
  "pass",
  "semantic-failure",
  "unsupported-profile-feature",
]);

/** The one native target the reviewed manifest currently executes on. */
const executionTarget = "x86_64-linux-gnu";

interface FrontmatterNegative {
  readonly phase: Test262FailurePhase;
  readonly type: string;
}

/** Parsed metadata and derived strictness for one upstream test. */
export interface ParsedTest262Case {
  readonly case: Test262Case;
  readonly flags: readonly string[];
}

/**
 * One reviewed path, the classification it must retain, and the reviewed
 * semantic dependency tags frozen by ADR 0013.
 */
export interface ReviewedTest262Entry {
  readonly dependencies: readonly string[];
  readonly expectedClassification: Test262Classification;
  readonly path: string;
}

/** Pinned test262 revision and explicitly reviewed source paths. */
export interface ReviewedTest262Subset {
  readonly suiteRevision: string;
  readonly supportedFeatures: readonly string[];
  readonly tests: readonly ReviewedTest262Entry[];
}

/** Deterministic checked-in observation of the reviewed subset. */
export interface ReviewedTest262Manifest {
  readonly results: readonly Test262Result[];
  readonly suiteRevision: string;
  readonly summary: Test262Summary;
}

/** Inputs passed to an injected native executor. */
export interface Test262ExecutionRequest {
  readonly source: string;
  readonly sourceId: string;
  readonly specialization: SpecializationMode;
}

/** Native execution boundary used by the repository runner and unit tests. */
export interface Test262Executor {
  execute(request: Test262ExecutionRequest): Promise<CliResult>;
}

/** Harness sources available to the reviewed test262 subset. */
export interface Test262Harnesses {
  readonly base: string;
  readonly includes: ReadonlyMap<string, string>;
}

function record(value: unknown, description: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${description} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, description: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${description} must be a non-empty string.`);
  }
  return value;
}

function stringArray(value: unknown, description: string): readonly string[] {
  if (value == null) return [];
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`${description} must be an array of strings.`);
  }
  return value as readonly string[];
}

function failurePhase(value: unknown): Test262FailurePhase {
  if (value === "parse" || value === "resolution" || value === "runtime") {
    return value;
  }
  throw new Error("test262 negative.phase is invalid.");
}

function negative(value: unknown): FrontmatterNegative | undefined {
  if (value == null) return undefined;
  const item = record(value, "test262 negative metadata");
  return {
    phase: failurePhase(item.phase),
    type: stringValue(item.type, "test262 negative.type"),
  };
}

function strictness(flags: readonly string[]): readonly Test262Strictness[] {
  const onlyStrict = flags.includes("onlyStrict");
  const noStrict = flags.includes("noStrict");
  if (onlyStrict && noStrict) {
    throw new Error("test262 flags cannot combine onlyStrict and noStrict.");
  }
  if (flags.includes("module") || onlyStrict) return ["strict"];
  if (flags.includes("raw") || noStrict) return ["non-strict"];
  return ["non-strict", "strict"];
}

/** Parse the YAML frontmatter needed to reproduce one reviewed test. */
export function parseTest262Case(
  source: string,
  path: string,
  suiteRevision: string,
): ParsedTest262Case {
  const match = source.match(/\/\*---([\s\S]*?)---\*\//u);
  if (match?.[1] == null) {
    throw new Error(`${path} does not contain test262 frontmatter.`);
  }
  const metadata = record(
    (parseYaml(match[1]) ?? {}) as unknown,
    `${path} frontmatter`,
  );
  const flags = stringArray(metadata.flags, `${path} flags`);
  const expected = negative(metadata.negative);
  return {
    case: {
      async: flags.includes("async"),
      ...(expected == null
        ? {}
        : {
            expectedErrorType: expected.type,
            expectedFailurePhase: expected.phase,
          }),
      features: stringArray(metadata.features, `${path} features`),
      flags,
      includes: stringArray(metadata.includes, `${path} includes`),
      mode: flags.includes("module") ? "module" : "script",
      path,
      strictness: strictness(flags),
      suiteRevision,
    },
    flags,
  };
}

function classification(value: unknown): Test262Classification {
  const candidate = value as Test262Classification;
  if (typeof value === "string" && classifications.has(candidate)) {
    return candidate;
  }
  throw new Error("Reviewed test262 classification is invalid.");
}

/** Validate the checked-in subset shape, ordering, and uniqueness. */
export function parseReviewedSubset(text: string): ReviewedTest262Subset {
  const root = record(parseYaml(text) as unknown, "test262 subset");
  const rawTests = root.tests;
  if (!Array.isArray(rawTests)) {
    throw new Error("test262 subset tests must be an array.");
  }
  const tests = rawTests.map((value, index) => {
    const item = record(value, `test262 subset test ${index}`);
    const dependencies = stringArray(
      item.dependencies,
      `test262 subset test ${index} dependencies`,
    );
    if (dependencies.length === 0) {
      throw new Error(
        `test262 subset test ${index} needs at least one dependency tag.`,
      );
    }
    if (new Set(dependencies).size !== dependencies.length) {
      throw new Error(`test262 subset test ${index} repeats a dependency tag.`);
    }
    for (const dependency of dependencies) {
      if (!test262DependencyVocabulary.has(dependency)) {
        throw new Error(
          `test262 subset test ${index} has unreviewed dependency tag ` +
            `${dependency}.`,
        );
      }
    }
    return {
      dependencies,
      expectedClassification: classification(item.expectedClassification),
      path: stringValue(item.path, `test262 subset test ${index} path`),
    };
  });
  const paths = tests.map((test) => test.path);
  const sortedPaths = paths.toSorted();
  if (paths.some((path, index) => path !== sortedPaths[index])) {
    throw new Error("Reviewed test262 paths must be sorted.");
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error("Reviewed test262 paths must be unique.");
  }
  return {
    suiteRevision: stringValue(root.suiteRevision, "test262 suiteRevision"),
    supportedFeatures: stringArray(
      root.supportedFeatures,
      "test262 supportedFeatures",
    ),
    tests,
  };
}

/** Assemble one Script input without changing the upstream test body. */
export function assembleTest262Source(
  source: string,
  strictnessMode: Test262Strictness,
  testCase: Test262Case,
  harnesses: Test262Harnesses,
  raw: boolean,
): string {
  if (raw) return source;
  const parts: string[] = [];
  if (strictnessMode === "strict") parts.push('"use strict";');
  parts.push(harnesses.base);
  for (const include of testCase.includes) {
    const harness = harnesses.includes.get(include);
    if (harness == null) {
      throw new Error(`${testCase.path} requires unsupported ${include}.`);
    }
    parts.push(harness);
  }
  parts.push(source);
  return `${parts.join("\n")}\n`;
}

function parseInputSource(
  source: string,
  strictnessMode: Test262Strictness,
): string {
  if (strictnessMode === "strict") return `"use strict";\n${source}`;
  return source;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : `${error}`;
}

function infrastructureFailure(result: CliResult): boolean {
  return result.stderr.includes("error[OSEO3001]");
}

function detail(
  testCase: Test262Case,
  strictnessMode: Test262Strictness,
  specialization: SpecializationMode,
  result: CliResult,
): string {
  return (
    `${testCase.path} ${strictnessMode} ${specialization} ` +
    `failed (${result.exitStatus}): stdout=${JSON.stringify(result.stdout)} ` +
    `stderr=${JSON.stringify(result.stderr)}`
  );
}

function unsupportedResult(
  testCase: Test262Case,
  supportedFeatures: ReadonlySet<string>,
  evidence: Test262Evidence,
): Test262Result {
  return classifyTest262(
    testCase,
    {
      detail: "Not executed: the frontmatter needs an unsupported feature.",
      harnessFailed: false,
      passed: false,
    },
    supportedFeatures,
    evidence,
  );
}

function parseNegativeResult(
  source: string,
  testCase: Test262Case,
  supportedFeatures: ReadonlySet<string>,
  evidence: Test262Evidence,
): Test262Result {
  for (const strictnessMode of testCase.strictness) {
    const compiled = compileSource(babelFrontend, {
      source: parseInputSource(source, strictnessMode),
      sourceId: testCase.path,
    });
    const diagnostic = compiled.diagnostics[0];
    if (diagnostic?.code !== "OSEO0001") {
      return classifyTest262(
        testCase,
        {
          detail:
            diagnostic == null
              ? `${strictnessMode} parsing unexpectedly succeeded.`
              : `${strictnessMode} produced ${diagnostic.code}.`,
          harnessFailed: false,
          passed: diagnostic == null,
        },
        supportedFeatures,
        evidence,
      );
    }
  }
  return classifyTest262(
    testCase,
    {
      errorType: "SyntaxError",
      failedPhase: "parse",
      harnessFailed: false,
      passed: false,
    },
    supportedFeatures,
    evidence,
  );
}

function harnessIncludeNames(testCase: Test262Case): readonly string[] {
  return ["base.js", ...testCase.includes];
}

async function executedResult(
  source: string,
  parsed: ParsedTest262Case,
  supportedFeatures: ReadonlySet<string>,
  harnesses: Test262Harnesses,
  executor: Test262Executor,
  dependencies: readonly string[],
): Promise<Test262Result> {
  const testCase = parsed.case;
  const variants: Test262Variant[] = [];
  const execution = (): Test262Execution => ({
    harnessIncludes: parsed.flags.includes("raw")
      ? []
      : harnessIncludeNames(testCase),
    target: executionTarget,
    variants,
  });
  const evidence = (): Test262Evidence => ({
    dependencies,
    execution: execution(),
  });
  interface VariantObservation {
    readonly observation: CliResult;
    readonly variant: Test262Variant;
  }
  const observations: VariantObservation[] = [];
  for (const strictnessMode of testCase.strictness) {
    let input: string;
    try {
      input = assembleTest262Source(
        source,
        strictnessMode,
        testCase,
        harnesses,
        parsed.flags.includes("raw"),
      );
    } catch (error) {
      return classifyTest262(
        testCase,
        {
          detail: errorMessage(error),
          harnessFailed: true,
          passed: false,
        },
        supportedFeatures,
        { dependencies },
      );
    }
    for (const specialization of ["disabled", "enabled"] as const) {
      const variant: Test262Variant = {
        specialization,
        strictness: strictnessMode,
      };
      let observation: CliResult;
      try {
        observation = await executor.execute({
          source: input,
          sourceId: testCase.path,
          specialization,
        });
      } catch (error) {
        return classifyTest262(
          testCase,
          {
            detail: errorMessage(error),
            harnessFailed: true,
            passed: false,
          },
          supportedFeatures,
          evidence(),
        );
      }
      variants.push(variant);
      observations.push({ observation, variant });
      if (observation.exitStatus !== 0) {
        return classifyTest262(
          testCase,
          {
            detail: detail(
              testCase,
              strictnessMode,
              specialization,
              observation,
            ),
            failedPhase: "runtime",
            harnessFailed: infrastructureFailure(observation),
            passed: false,
          },
          supportedFeatures,
          evidence(),
        );
      }
    }
  }
  const baseline = observations[0];
  const diverging =
    baseline == null
      ? undefined
      : observations.find(
          (entry) =>
            entry.observation.exitStatus !== baseline.observation.exitStatus ||
            entry.observation.stdout !== baseline.observation.stdout ||
            entry.observation.stderr !== baseline.observation.stderr,
        );
  if (baseline != null && diverging != null) {
    return classifyTest262(
      testCase,
      {
        detail:
          `${testCase.path} observations diverge between ` +
          `${baseline.variant.strictness} ${baseline.variant.specialization} ` +
          `and ${diverging.variant.strictness} ` +
          `${diverging.variant.specialization}.`,
        failedPhase: "runtime",
        harnessFailed: false,
        passed: false,
      },
      supportedFeatures,
      evidence(),
    );
  }
  return classifyTest262(
    testCase,
    { harnessFailed: false, passed: true },
    supportedFeatures,
    evidence(),
  );
}

/** Execute and classify one parsed upstream case. */
export async function executeTest262Case(
  source: string,
  parsed: ParsedTest262Case,
  supportedFeatures: ReadonlySet<string>,
  harnesses: Test262Harnesses,
  executor: Test262Executor,
  dependencies: readonly string[] = [],
): Promise<Test262Result> {
  const evidence: Test262Evidence = { dependencies };
  const unsupported = parsed.case.features.some(
    (feature) => !supportedFeatures.has(feature),
  );
  if (unsupported) {
    return unsupportedResult(parsed.case, supportedFeatures, evidence);
  }
  if (parsed.flags.includes("module") || parsed.flags.includes("async")) {
    return classifyTest262(
      parsed.case,
      {
        detail: "The runner supports synchronous Script cases only.",
        harnessFailed: true,
        passed: false,
      },
      supportedFeatures,
      evidence,
    );
  }
  if (parsed.case.expectedFailurePhase === "parse") {
    return parseNegativeResult(
      source,
      parsed.case,
      supportedFeatures,
      evidence,
    );
  }
  if (parsed.case.expectedFailurePhase === "runtime") {
    return classifyTest262(
      parsed.case,
      {
        detail:
          "The runner cannot observe the type of an unhandled JavaScript " +
          "throw.",
        harnessFailed: false,
        passed: false,
        unsupportedCapability: "runtime-error-types",
      },
      supportedFeatures,
      evidence,
    );
  }
  return await executedResult(
    source,
    parsed,
    supportedFeatures,
    harnesses,
    executor,
    dependencies,
  );
}

/** Serialize a reviewed result without timestamps or host-specific metadata. */
export function serializeTest262Manifest(
  manifest: ReviewedTest262Manifest,
): string {
  return stringifyYaml(manifest, { lineWidth: 80 });
}

function validateReviewedResults(
  subset: ReviewedTest262Subset,
  results: readonly Test262Result[],
): void {
  const failures: string[] = [];
  for (let index = 0; index < subset.tests.length; index += 1) {
    const expected = subset.tests[index];
    const actual = results[index];
    if (expected == null || actual == null) {
      failures.push(`Missing reviewed result at index ${index}.`);
    } else if (actual.classification !== expected.expectedClassification) {
      failures.push(
        `${expected.path}: expected ${expected.expectedClassification}, ` +
          `received ${actual.classification}.`,
      );
    }
  }
  const summary = summarizeTest262(results);
  if (summary.semanticFailures !== 0 || summary.harnessFailures !== 0) {
    failures.push(
      `Reviewed failures: semantic=${summary.semanticFailures} ` +
        `harness=${summary.harnessFailures}.`,
    );
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
}

async function suiteRoot(revision: string): Promise<string> {
  const packagePath = fileURLToPath(
    import.meta.resolve("test262/package.json"),
  );
  const packageRoot = dirname(packagePath);
  const workspace = record(
    JSON.parse(
      await readFile(join(repositoryRoot, "package.json"), "utf8"),
    ) as unknown,
    "workspace package.json",
  );
  const dependencies = record(
    workspace.devDependencies,
    "workspace devDependencies",
  );
  const expected = `github:tc39/test262#${revision}`;
  if (dependencies.test262 !== expected) {
    throw new Error(`test262 must be pinned as ${expected}.`);
  }
  return packageRoot;
}

async function readHarnesses(): Promise<Test262Harnesses> {
  return {
    base: await readFile(baseHarnessPath, "utf8"),
    includes: new Map([
      ["propertyHelper.js", await readFile(propertyHarnessPath, "utf8")],
    ]),
  };
}

const nativeExecutor: Test262Executor = {
  async execute(request: Test262ExecutionRequest): Promise<CliResult> {
    const args =
      request.specialization === "disabled"
        ? ["--no-specialization", request.sourceId]
        : [request.sourceId];
    return await runNativeCli({
      args,
      source: request.source,
      sourceId: request.sourceId,
      version: "0.1.0",
    });
  },
};

/** Run every explicitly reviewed source path at the pinned revision. */
export async function createReviewedManifest(
  subset: ReviewedTest262Subset,
  root: string,
  harnesses: Test262Harnesses,
  executor: Test262Executor = nativeExecutor,
): Promise<ReviewedTest262Manifest> {
  const supportedFeatures = new Set(subset.supportedFeatures);
  const results: Test262Result[] = [];
  for (const entry of subset.tests) {
    const source = await readFile(join(root, entry.path), "utf8");
    const parsed = parseTest262Case(source, entry.path, subset.suiteRevision);
    results.push(
      await executeTest262Case(
        source,
        parsed,
        supportedFeatures,
        harnesses,
        executor,
        entry.dependencies,
      ),
    );
  }
  validateReviewedResults(subset, results);
  return {
    results,
    suiteRevision: subset.suiteRevision,
    summary: summarizeTest262(results),
  };
}

function requireSupportedHost(): void {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error("test262 native execution requires x86-64 Linux.");
  }
}

async function main(): Promise<void> {
  const update = process.argv.slice(2);
  if (update.length > 1 || (update[0] != null && update[0] !== "--update")) {
    throw new Error("usage: node tools/test262.ts [--update]");
  }
  requireSupportedHost();
  const subset = parseReviewedSubset(await readFile(subsetPath, "utf8"));
  const root = await suiteRoot(subset.suiteRevision);
  const harnesses = await readHarnesses();
  const previousGc = process.env.OSEO_GC_EVERY_SAFEPOINT;
  process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
  let manifest: ReviewedTest262Manifest;
  try {
    manifest = await createReviewedManifest(subset, root, harnesses);
  } finally {
    if (previousGc == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    else process.env.OSEO_GC_EVERY_SAFEPOINT = previousGc;
  }
  const serialized = serializeTest262Manifest(manifest);
  if (update[0] === "--update") {
    await writeFile(resultPath, serialized);
  } else {
    const expected = await readFile(resultPath, "utf8");
    if (expected !== serialized) {
      throw new Error(
        "Reviewed test262 results changed; run mise run test262:update.",
      );
    }
  }
  console.log(
    `test262 revision=${manifest.suiteRevision} ` +
      `pass=${manifest.summary.passes} ` +
      `expected-negative=${manifest.summary.expectedNegatives} ` +
      `unsupported=${manifest.summary.unsupportedProfileFeatures}`,
  );
}

const entry = process.argv[1];
if (entry != null && resolve(entry) === fileURLToPath(import.meta.url)) {
  await main();
}
