/* eslint-disable no-await-in-loop -- Each bounded worker sequences its case. */

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  defaultComponents,
  processResourceExhaustionDiagnosticSuffix,
  runNativeCli,
} from "../packages/cli/src/index.ts";
import type { CliResult } from "../packages/cli/src/index.ts";
import {
  buildModuleGraph,
  compileModuleGraph,
  compileSource,
  renderDiagnostic,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import type {
  Diagnostic,
  SpecializationMode,
} from "../packages/compiler/src/index.ts";
import {
  parsedObject as record,
  type StructuredDataInput,
} from "./structured-data.ts";
import { isObject, isString } from "./value-kinds.ts";
import {
  createFileModuleLoader,
  createNodeHost,
  fileModuleResolver,
  hashModuleSource,
} from "../packages/host/src/index.ts";
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
  Test262ExecutionMode,
  Test262FailurePhase,
  Test262ModuleGraphNode,
  Test262Result,
  Test262Strictness,
  Test262Variant,
} from "../packages/testkit/src/index.ts";
import { isScalar, parse as parseYaml, parseDocument } from "yaml";

import { parseTestShardArguments, selectTestShard } from "./shard.ts";
import type { TestShard, TestShardArguments } from "./shard.ts";
import {
  canonicalTest262Target,
  normalizeReviewedManifestText,
  parseReviewedManifest,
  reviewedManifestPartitionPaths,
  serializeTargetParity,
  serializeTest262Manifest,
  validateReviewedManifestFileSet,
  validateTargetParity,
} from "./test262-manifest.ts";
import type {
  ReviewedTest262Manifest,
  SerializedTest262Manifest,
  SerializedTest262Partition,
} from "./test262-manifest.ts";

function includePropertiesWhen<const Properties extends object>(
  properties: () => Properties | undefined,
): Properties | { [Key in keyof Properties]?: never } {
  return properties() ?? {};
}

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const subsetPath = join(repositoryRoot, "tests/test262/subset.yaml");
const resultPath = join(repositoryRoot, "tests/test262/results.yaml");
const parityPath = join(repositoryRoot, "tests/test262/target-parity.yaml");
const baseHarnessPath = join(repositoryRoot, "tests/test262/harness/base.js");
const doneHarnessPath = join(
  repositoryRoot,
  "tests/test262/harness/doneprintHandle.js",
);
const propertyHarnessPath = join(
  repositoryRoot,
  "tests/test262/harness/propertyHelper.js",
);
const promiseHarnessPath = join(
  repositoryRoot,
  "tests/test262/harness/promiseHelper.js",
);
const asyncHelpersHarnessPath = join(
  repositoryRoot,
  "tests/test262/harness/asyncHelpers.js",
);
const compareArrayHarnessPath = join(
  repositoryRoot,
  "tests/test262/harness/compareArray.js",
);
const byteConversionHarnessPath = join(
  repositoryRoot,
  "tests/test262/harness/byteConversionValues.js",
);
const compareIteratorHarnessPath = join(
  repositoryRoot,
  "tests/test262/harness/compareIterator.js",
);
const deepEqualHarnessPath = join(
  repositoryRoot,
  "tests/test262/harness/deepEqual.js",
);
const detachArrayBufferHarnessPath = join(
  repositoryRoot,
  "tests/test262/harness/detachArrayBuffer.js",
);
const nansHarnessPath = join(repositoryRoot, "tests/test262/harness/nans.js");
const nativeErrorsHarnessPath = join(
  repositoryRoot,
  "tests/test262/harness/nativeErrors.js",
);
const regexpUtilsHarnessPath = join(
  repositoryRoot,
  "tests/test262/harness/regExpUtils.js",
);

const classifications = new Set<Test262Classification>([
  "expected-negative",
  "harness-failure",
  "infrastructure-failure",
  "pass",
  "semantic-failure",
  "unsupported-profile-feature",
]);

const canonicalTarget = canonicalTest262Target;
const runnerHost = createNodeHost();
const executionTarget = targetForExecutionHost(
  runnerHost.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
)?.name;
const runtimeArchiveReuse =
  process.env.OSEO_RUNTIME_ARCHIVE_REUSE === "disabled"
    ? "disabled"
    : "enabled";
const measuredExecutionPoolLimit = 8;
const reviewedExecutionPoolLimit = Math.min(
  measuredExecutionPoolLimit,
  availableParallelism(),
);
const reviewedExecutionRetryLimit = 1;
const unavailableHarnessIncludes = new Set([
  // The resizable-buffer utilities build every TypedArray constructor at
  // load time, so no case that includes them can execute before a view
  // kind is admitted.
  "resizableArrayBufferUtils.js",
  "nativeFunctionMatcher.js",
  "wellKnownIntrinsicObjects.js",
]);

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
 * semantic dependency tags ADR 0013 admits.
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

/** Host-varying facts reported outside the canonical manifest. */
export interface ReviewedTest262RunMetadata {
  readonly durationMilliseconds: number;
  readonly poolLimit: number;
  readonly retries: number;
}

/** One reviewed run, its accepted promotions, and operational metadata. */
export interface ReviewedTest262Run {
  readonly manifest: ReviewedTest262Manifest;
  readonly metadata: ReviewedTest262RunMetadata;
  readonly promotedPaths: readonly string[];
}

/** Controls promotion acceptance and test-only pool and retry limits. */
export interface ReviewedTest262RunOptions {
  readonly acceptPromotions?: boolean;
  readonly poolLimit?: number;
  readonly retryLimit?: number;
}

/** Arguments owned by the reviewed test262 runner. */
export interface Test262Arguments extends TestShardArguments {
  readonly acceptPromotions: boolean;
}

/** A reviewed run failure carrying reproducible operational metadata. */
export class ReviewedTest262RunError extends Error {
  readonly metadata: ReviewedTest262RunMetadata;

  constructor(cause: unknown, metadata: ReviewedTest262RunMetadata) {
    super(errorMessage(cause), { cause });
    this.name = "ReviewedTest262RunError";
    this.metadata = metadata;
  }
}

/** Inputs passed to an injected native executor. */
export interface Test262ExecutionRequest {
  readonly mode: Test262ExecutionMode;
  readonly source: string;
  readonly sourceId: string;
  /** Absolute upstream path; module imports resolve against it. */
  readonly sourcePath?: string;
  readonly specialization: SpecializationMode;
}

/** Native execution boundary used by the repository runner and unit tests. */
export interface Test262Executor {
  readonly target?: string;
  execute(request: Test262ExecutionRequest): Promise<CliResult>;
}

/** Harness sources available to the reviewed test262 subset. */
export interface Test262Harnesses {
  readonly base: string;
  readonly done: string;
  readonly includes: ReadonlyMap<string, string>;
}

/** Marker the reviewed `$DONE` harness prints on asynchronous completion. */
export const asyncCompletionMarker = "Test262:AsyncTestComplete";

/** Prefix the reviewed `$DONE` harness prints on asynchronous failure. */
export const asyncFailureMarker = "Test262:AsyncTestFailure:";

/**
 * An asynchronous case completes only when the completion marker is the
 * final line, appears exactly once, and no failure marker was printed.
 */
export function asyncObservationCompleted(stdout: string): boolean {
  const lines = stdout.split("\n");
  return (
    stdout.endsWith(`${asyncCompletionMarker}\n`) &&
    lines.filter((line) => line === asyncCompletionMarker).length === 1 &&
    !lines.some((line) => line.startsWith(asyncFailureMarker))
  );
}

function stringValue(value: StructuredDataInput, description: string): string {
  if (!isString(value) || value.length === 0) {
    throw new Error(`${description} must be a non-empty string.`);
  }
  return value;
}

function stringArray(
  value: StructuredDataInput,
  description: string,
): readonly string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((entry) => !isString(entry))) {
    throw new Error(`${description} must be an array of strings.`);
  }
  // SAFETY: The array and element checks establish the string sequence.
  return value as readonly string[];
}

function failurePhase(value: StructuredDataInput): Test262FailurePhase {
  if (value === "parse" || value === "resolution" || value === "runtime") {
    return value;
  }
  throw new Error("test262 negative.phase is invalid.");
}

function negative(value: StructuredDataInput): FrontmatterNegative | undefined {
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
  // SAFETY: parsedObject validates the complete YAML frontmatter tree.
  const metadata = record(
    (parseYaml(match[1].replace(/\r\n?/gu, "\n")) ?? {}) as StructuredDataInput,
    `${path} frontmatter`,
  );
  const flags = stringArray(metadata.flags, `${path} flags`);
  const expected = negative(metadata.negative);
  return {
    case: {
      async: flags.includes("async"),
      ...includePropertiesWhen(() => {
        if (expected == null) return undefined;
        return {
          expectedErrorType: expected.type,
          expectedFailurePhase: expected.phase,
        };
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

function classification(value: StructuredDataInput): Test262Classification {
  // SAFETY: The membership check below validates this candidate before return.
  const candidate = value as Test262Classification;
  if (isString(value) && classifications.has(candidate)) {
    return candidate;
  }
  throw new Error("Reviewed test262 classification is invalid.");
}

/** Validate the checked-in subset shape, ordering, and uniqueness. */
export function parseReviewedSubset(text: string): ReviewedTest262Subset {
  // SAFETY: parsedObject validates the complete YAML tree at this boundary.
  const root = record(parseYaml(text) as StructuredDataInput, "test262 subset");
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

/**
 * Rewrite only accepted expected-classification scalars to `pass`.
 *
 * The source ranges come from the parsed YAML tree, so ordering, comments,
 * whitespace, and every unrelated scalar remain byte-for-byte unchanged.
 */
export function rewriteReviewedPromotions(
  text: string,
  promotedPaths: readonly string[],
): string {
  const subset = parseReviewedSubset(text);
  const promoted = new Set(promotedPaths);
  if (promoted.size !== promotedPaths.length) {
    throw new Error("Reviewed test262 promotions must be unique.");
  }
  const document = parseDocument(text);
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join("\n"));
  }
  const replacements: { readonly end: number; readonly start: number }[] = [];
  for (let index = 0; index < subset.tests.length; index += 1) {
    const entry = subset.tests[index];
    if (entry == null || !promoted.has(entry.path)) continue;
    if (entry.expectedClassification === "pass") {
      throw new Error(`${entry.path} is already expected to pass.`);
    }
    const scalar = document.getIn(
      ["tests", index, "expectedClassification"],
      true,
    );
    if (!isScalar(scalar) || scalar.range == null) {
      throw new Error(`${entry.path} has no rewritable classification.`);
    }
    replacements.push({ end: scalar.range[1], start: scalar.range[0] });
    promoted.delete(entry.path);
  }
  if (promoted.size > 0) {
    throw new Error(
      `Unknown reviewed test262 promotion: ${[...promoted].join(", ")}.`,
    );
  }
  let rewritten = text;
  for (const replacement of replacements.toSorted(
    (left, right) => right.start - left.start,
  )) {
    rewritten =
      rewritten.slice(0, replacement.start) +
      "pass" +
      rewritten.slice(replacement.end);
  }
  return rewritten;
}

/**
 * Assemble one executable input without changing the upstream test body.
 * Module sources are inherently strict, so only Script inputs receive the
 * strict-mode directive; asynchronous cases receive the reviewed `$DONE`
 * harness immediately after the base assertions, mirroring upstream
 * doneprintHandle insertion.
 */
export function assembleTest262Source(
  source: string,
  strictnessMode: Test262Strictness,
  testCase: Test262Case,
  harnesses: Test262Harnesses,
  raw: boolean,
): string {
  if (raw) return source;
  const parts: string[] = [];
  if (strictnessMode === "strict" && testCase.mode === "script") {
    parts.push('"use strict";');
  }
  parts.push(harnesses.base);
  if (testCase.async) parts.push(harnesses.done);
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

function errorMessage(cause: unknown): string {
  return cause instanceof Error
    ? `${cause.name}: ${cause.message}`
    : `${cause}`;
}

/**
 * The owned diagnostic code from the outer, source-located diagnostic
 * line, such as `OSEO2001`. Parsing the structured prefix avoids
 * matching an `error[OSEO...]` substring embedded in a thrown message.
 */
export function diagnosticCode(stderr: string): string | undefined {
  const match = /^.+?:\d+:\d+: error\[(OSEO\d{4})\]/mu.exec(stderr);
  return match?.[1];
}

function infrastructureFailure(result: CliResult): boolean {
  return diagnosticCode(result.stderr) === "OSEO3001";
}

function retryableInfrastructureFailure(result: CliResult): boolean {
  if (!infrastructureFailure(result)) return false;
  const match = /^.+?:\d+:\d+: error\[OSEO3001\]: (.+)$/mu.exec(result.stderr);
  return (
    match?.[1]?.endsWith(processResourceExhaustionDiagnosticSuffix) ?? false
  );
}

/** The exact untyped-throw diagnostic the native host renders. */
const untypedThrowMessage = "error[OSEO2001]: Unhandled JavaScript throw.";

/**
 * The intrinsic error kind of an unhandled thrown value, read from the
 * stable machine-readable marker the native host prints for an error
 * instance. This is independent of the mutable name and message the
 * human diagnostic renders. A thrown non-error value has no marker.
 */
export function unhandledErrorType(stderr: string): string | undefined {
  // The runtime appends the marker as the final line, so a marker-shaped
  // line injected earlier by a rendered message is ignored.
  const matches = [...stderr.matchAll(/^OSEO_THROWN ([A-Za-z]+)$/gmu)];
  return matches.at(-1)?.[1];
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

/** A runtime value can reach a reviewed, explicit profile boundary. */
function unsupportedRuntimeCapability(stderr: string): string | undefined {
  if (
    unhandledErrorType(stderr) != null ||
    stderr.includes(untypedThrowMessage)
  ) {
    return undefined;
  }
  const diagnostic = /^.+?:\d+:\d+: error\[OSEO2001\]: (.+)$/mu.exec(
    stderr,
  )?.[1];
  if (diagnostic === "Primitive wrapper objects are not admitted yet.") {
    return "primitive-wrapper";
  }
  if (
    diagnostic === "Primitive wrapper prototype methods are not admitted yet."
  ) {
    return "primitive-wrapper-prototype";
  }
  if (diagnostic === "Object static method is not admitted in this M5b node.") {
    return "object-static-method";
  }
  if (
    diagnostic === "Promise static method is not admitted in this M5b node."
  ) {
    return "promise-static-method";
  }
  if (
    diagnostic === "String prototype method is not admitted in this M5b node."
  ) {
    return "string-prototype-method";
  }
  if (diagnostic === "RegExp prototype execution is not admitted yet.") {
    return "regexp-prototype-execution";
  }
  if (
    diagnostic === "Regular expression pattern extension is not admitted yet."
  ) {
    return "regexp-pattern-extension";
  }
  if (
    diagnostic ===
      "Regular expression pattern exceeds the reviewed matcher limit." ||
    diagnostic ===
      "Regular expression matching exceeds the reviewed matcher limit."
  ) {
    return "regexp-matcher-limit";
  }
  if (diagnostic === "RegExp String dispatch is not admitted yet.") {
    return "regexp-string-dispatch";
  }
  if (
    diagnostic ===
    "Branded RegExp String protocol fallback is not admitted yet."
  ) {
    return "regexp-string-dispatch";
  }
  // The runtime ends a program at the first rejection checkpoint that
  // still holds an unhandled rejection. A case that needs the opposite
  // host policy names that boundary instead of reporting a semantic
  // failure, exactly as the unadmitted built-in diagnostics above do.
  if (diagnostic === "Unhandled promise rejection.") {
    return "unhandled-rejection-policy";
  }
  return diagnostic === "Number prototype methods are not admitted yet."
    ? "number-prototype"
    : undefined;
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
    const compiled = compileSource(defaultComponents.frontend, {
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
      passed: false,
    },
    supportedFeatures,
    evidence,
  );
}

function harnessIncludeNames(testCase: Test262Case): readonly string[] {
  return [
    "base.js",
    ...(testCase.async ? ["doneprintHandle.js"] : []),
    ...testCase.includes,
  ];
}

const moduleHost = runnerHost;

/** Owned module-graph evidence with host paths relativized for review. */
interface EntryGraphResult {
  readonly compileDiagnostics: readonly Diagnostic[];
  /** The entry's upstream test path, matching recorded diagnostics. */
  readonly entryDisplayId: string;
  readonly graphDiagnostics: readonly Diagnostic[];
  readonly nodes?: readonly Test262ModuleGraphNode[];
}

function relativeModuleId(
  id: string,
  entryId: string,
  entryDisplayId: string,
  rootUrl: string,
): string {
  const prefix = rootUrl.endsWith("/") ? rootUrl : `${rootUrl}/`;
  if (!id.startsWith(prefix)) {
    throw new Error(
      `Module ${id} resolved outside the suite root; the manifest must ` +
        "not record host-specific identities.",
    );
  }
  return id === entryId ? entryDisplayId : id.slice(prefix.length);
}

/**
 * Discover, link, and lower one module case without native execution. The
 * entry source is supplied in memory so harness assembly never modifies the
 * upstream checkout; sibling fixtures load from disk. Recorded identities
 * are relative to the suite root so the manifest stays host-independent.
 */
async function buildEntryGraph(
  source: string,
  sourcePath: string,
  entryDisplayId: string,
  rootPath: string,
): Promise<EntryGraphResult> {
  if (moduleHost.canonicalizeFile == null) {
    throw new Error("The module host cannot canonicalize files.");
  }
  const entryId = await moduleHost.canonicalizeFile(sourcePath);
  const rootUrl = await moduleHost.canonicalizeFile(rootPath);
  const fileLoader = createFileModuleLoader(moduleHost);
  // Recorded diagnostics use the same suite-root-relative identities as the
  // module-graph evidence so the manifest never leaks a host path.
  const displayDiagnostic = (diagnostic: Diagnostic): Diagnostic => ({
    ...diagnostic,
    sourceId: relativeModuleId(
      diagnostic.sourceId,
      entryId,
      entryDisplayId,
      rootUrl,
    ),
  });
  const result = await buildModuleGraph(
    defaultComponents.moduleFrontend,
    {
      load(canonicalId, referrer) {
        return canonicalId === entryId
          ? Promise.resolve({
              diagnostics: [],
              source: {
                source,
                sourceHash: hashModuleSource(source),
                sourceId: entryId,
              },
            })
          : fileLoader.load(canonicalId, referrer);
      },
    },
    fileModuleResolver,
    entryId,
  );
  if (result.graph == null) {
    return {
      compileDiagnostics: [],
      entryDisplayId,
      graphDiagnostics: result.diagnostics.map(displayDiagnostic),
    };
  }
  const nodes = result.graph.modules.map((module) => ({
    dependencies: module.dependencies.map((dependency) =>
      relativeModuleId(
        dependency.canonicalId,
        entryId,
        entryDisplayId,
        rootUrl,
      ),
    ),
    id: relativeModuleId(module.canonicalId, entryId, entryDisplayId, rootUrl),
    sourceHash: module.sourceHash,
  }));
  const compiled = compileModuleGraph(result.graph, {
    specialization: "disabled",
  });
  return {
    compileDiagnostics: compiled.diagnostics.map(displayDiagnostic),
    entryDisplayId,
    graphDiagnostics: result.diagnostics.map(displayDiagnostic),
    nodes,
  };
}

function diagnosticDetail(diagnostic: Diagnostic): string {
  return renderDiagnostic(diagnostic);
}

/**
 * Map an owned pre-execution diagnostic to the test262 phase it evidences.
 * An entry parse rejection is a parse failure; a parse rejection in a
 * requested dependency surfaces while resolving the graph, so the importing
 * case observes a resolution failure. Link failures (OSEO2001 at this
 * stage) occur before any evaluation and correspond to the specification's
 * resolution-phase failures. Among OSEO3001 host diagnostics, only a
 * missing module source evidences resolution semantics; an unsupported
 * specifier form is a resolution-profile gap, and any other host failure
 * stays unmapped so it can never match an expected negative. OSEO1001
 * means the body uses syntax outside the admitted profile, which is a
 * profile gap rather than an observed negative.
 */
function moduleFailurePhase(
  diagnostic: Diagnostic,
  entryId: string,
): Test262FailurePhase | undefined {
  if (diagnostic.code === "OSEO0001") {
    return diagnostic.sourceId === entryId ? "parse" : "resolution";
  }
  if (diagnostic.code === "OSEO2001") return "resolution";
  if (
    diagnostic.code === "OSEO3001" &&
    diagnostic.message === "The module source could not be read."
  ) {
    return "resolution";
  }
  return undefined;
}

/** An owned diagnostic that names a profile gap rather than a negative. */
function unsupportedModuleCapability(
  diagnostic: Diagnostic,
): string | undefined {
  if (diagnostic.code === "OSEO1001") return "profile-syntax";
  if (
    diagnostic.code === "OSEO3001" &&
    diagnostic.message.startsWith("Unsupported module specifier")
  ) {
    return "module-resolution-profile";
  }
  return undefined;
}

async function moduleNegativeResult(
  source: string,
  parsed: ParsedTest262Case,
  supportedFeatures: ReadonlySet<string>,
  evidence: Test262Evidence,
  harnesses: Test262Harnesses,
  sourcePath: string,
  rootPath: string,
): Promise<Test262Result> {
  const testCase = parsed.case;
  let assembled: string;
  try {
    assembled = assembleTest262Source(
      source,
      "strict",
      testCase,
      harnesses,
      parsed.flags.includes("raw"),
    );
  } catch (error) {
    return classifyTest262(
      testCase,
      {
        detail: errorMessage(error),
        failureKind: "harness",
        passed: false,
      },
      supportedFeatures,
      evidence,
    );
  }
  const graph = await buildEntryGraph(
    assembled,
    sourcePath,
    testCase.path,
    rootPath,
  );
  const diagnostic = graph.graphDiagnostics[0] ?? graph.compileDiagnostics[0];
  if (diagnostic == null) {
    return classifyTest262(
      testCase,
      {
        detail: "Module linking unexpectedly succeeded.",
        passed: false,
      },
      supportedFeatures,
      evidence,
    );
  }
  const unsupportedCapability = unsupportedModuleCapability(diagnostic);
  if (unsupportedCapability != null) {
    return classifyTest262(
      testCase,
      {
        detail: diagnosticDetail(diagnostic),
        passed: false,
        unsupportedCapability,
      },
      supportedFeatures,
      evidence,
    );
  }
  const failedPhase = moduleFailurePhase(diagnostic, graph.entryDisplayId);
  return classifyTest262(
    testCase,
    {
      detail: diagnosticDetail(diagnostic),
      errorType: "SyntaxError",
      ...includePropertiesWhen(() => {
        if (failedPhase == null) return undefined;
        return { failedPhase };
      }),
      passed: false,
    },
    supportedFeatures,
    evidence,
  );
}

/** One launched variant execution, settled without rejecting. */
type SettledTest262Execution =
  | { readonly observation: CliResult }
  | { readonly error: unknown };

/** One launched variant execution and the outcome it settled to. */
interface AwaitedTest262Variant {
  readonly settled: SettledTest262Execution;
  readonly variant: Test262Variant;
}

/**
 * One strictness mode's assembled source, or the assembly failure that
 * mode hit. A failure keeps its position so the scan reports it exactly
 * where a sequential scan reached it, and truncates the plan so no later
 * mode contributes a variant the scan would not reach.
 */
type PlannedTest262Strictness =
  | {
      readonly input: string;
      readonly kind: "assembled";
      readonly strictness: Test262Strictness;
    }
  | {
      readonly error: unknown;
      readonly kind: "unassembled";
      readonly strictness: Test262Strictness;
    };

/**
 * Start one variant execution and settle both a rejected promise and a
 * synchronous throw into a value, so the scan can await every outcome
 * without an unhandled rejection.
 */
async function startTest262Execution(
  executor: Test262Executor,
  request: Test262ExecutionRequest,
): Promise<SettledTest262Execution> {
  try {
    return { observation: await executor.execute(request) };
  } catch (error) {
    return { error };
  }
}

/**
 * Assemble each strictness mode's source without executing anything.
 * The plan stops after a mode that cannot assemble, because that mode
 * decides the result and no later mode is reached.
 */
function planTest262Variants(
  source: string,
  parsed: ParsedTest262Case,
  testCase: Test262Case,
  harnesses: Test262Harnesses,
): readonly PlannedTest262Strictness[] {
  const planned: PlannedTest262Strictness[] = [];
  for (const strictnessMode of testCase.strictness) {
    try {
      planned.push({
        input: assembleTest262Source(
          source,
          strictnessMode,
          testCase,
          harnesses,
          parsed.flags.includes("raw"),
        ),
        kind: "assembled",
        strictness: strictnessMode,
      });
    } catch (error) {
      planned.push({
        error,
        kind: "unassembled",
        strictness: strictnessMode,
      });
      break;
    }
  }
  return planned;
}

/**
 * Every variant the plan admits, in specification order. The first entry
 * is the probe the scan runs alone; ADR 0013 requires every executed
 * combination to be listed and compared, so the rest start only once the
 * probe has shown that the case does not stop at its first variant.
 */
function plannedTest262Variants(
  planned: readonly PlannedTest262Strictness[],
): readonly { readonly input: string; readonly variant: Test262Variant }[] {
  return planned.flatMap((plan) =>
    plan.kind === "assembled"
      ? (["disabled", "enabled"] as const).map((specialization) => ({
          input: plan.input,
          variant: { specialization, strictness: plan.strictness },
        }))
      : [],
  );
}

/**
 * Whether one variant's outcome decides the reviewed result by itself.
 * The probe gate and the recorded scan share this predicate, so a
 * variant never starts unless the scan will reach, record, and compare
 * it, and the scan never records a variant the gate would have skipped.
 */
function test262VariantDecides(
  settled: SettledTest262Execution,
  expectRuntimeNegative: boolean,
): boolean {
  if ("error" in settled) return true;
  const observation = settled.observation;
  if (observation.exitStatus === 0) return expectRuntimeNegative;
  // An unhandled throw is the expected observation for a runtime
  // negative, so it leaves the result to the remaining variants.
  const isJavaScriptThrow =
    unhandledErrorType(observation.stderr) != null ||
    observation.stderr.includes(untypedThrowMessage);
  return !(
    expectRuntimeNegative &&
    !test262CompileStage(observation) &&
    isJavaScriptThrow
  );
}

/**
 * Whether one observation is an owned compile-stage rejection. Such a
 * variant ran no native program, so it contributes no execution
 * evidence. Its outcome is still compared against the other variants,
 * because one specialization compiling while another did not is itself
 * a divergence.
 */
function test262CompileStage(observation: CliResult): boolean {
  if (observation.exitStatus === 0) return false;
  const code = diagnosticCode(observation.stderr);
  return code === "OSEO1001" || code === "OSEO0001";
}

async function executedResult(
  source: string,
  parsed: ParsedTest262Case,
  supportedFeatures: ReadonlySet<string>,
  harnesses: Test262Harnesses,
  executor: Test262Executor,
  dependencies: readonly string[],
  sourcePath?: string,
  rootPath?: string,
): Promise<Test262Result> {
  const testCase = parsed.case;
  const scheduled = testCase.mode === "module" || testCase.async;
  const expectRuntimeNegative = testCase.expectedFailurePhase === "runtime";
  const variants: Test262Variant[] = [];
  let moduleGraph: readonly Test262ModuleGraphNode[] | undefined;
  const execution = (): Test262Execution => ({
    harnessIncludes: parsed.flags.includes("raw")
      ? []
      : harnessIncludeNames(testCase),
    ...includePropertiesWhen(() => {
      if (moduleGraph == null) return undefined;
      return { moduleGraph };
    }),
    ...includePropertiesWhen(() => {
      if (!scheduled) return undefined;
      return {
        scheduler: "deterministic-logical-clock" as const,
      };
    }),
    target: executor.target ?? canonicalTarget,
    variants,
  });
  const evidence = (): Test262Evidence => ({
    dependencies,
    execution: execution(),
  });
  if (testCase.mode === "module") {
    if (sourcePath == null || rootPath == null) {
      return classifyTest262(
        testCase,
        {
          detail: "Module execution needs the upstream source path.",
          failureKind: "harness",
          passed: false,
        },
        supportedFeatures,
        { dependencies },
      );
    }
    let assembled: string;
    try {
      assembled = assembleTest262Source(
        source,
        "strict",
        testCase,
        harnesses,
        parsed.flags.includes("raw"),
      );
    } catch (error) {
      return classifyTest262(
        testCase,
        {
          detail: errorMessage(error),
          failureKind: "harness",
          passed: false,
        },
        supportedFeatures,
        { dependencies },
      );
    }
    const graph = await buildEntryGraph(
      assembled,
      sourcePath,
      testCase.path,
      rootPath,
    );
    moduleGraph = graph.nodes;
    const diagnostic = graph.graphDiagnostics[0] ?? graph.compileDiagnostics[0];
    if (diagnostic != null) {
      const unsupportedCapability = unsupportedModuleCapability(diagnostic);
      const failedPhase = moduleFailurePhase(diagnostic, graph.entryDisplayId);
      // No native variant executed, so the result carries no execution
      // evidence per the ADR 0013 schema.
      return classifyTest262(
        testCase,
        {
          detail: diagnosticDetail(diagnostic),
          ...includePropertiesWhen(() => {
            if (!(unsupportedCapability != null)) return undefined;
            return {
              unsupportedCapability,
            };
          }),
          ...includePropertiesWhen(() => {
            if (!(unsupportedCapability == null && failedPhase != null))
              return undefined;
            return { failedPhase };
          }),
          passed: false,
        },
        supportedFeatures,
        { dependencies },
      );
    }
  }
  interface VariantObservation {
    readonly observation: CliResult;
    readonly variant: Test262Variant;
  }
  const observations: VariantObservation[] = [];
  const planned = planTest262Variants(source, parsed, testCase, harnesses);
  const admitted = plannedTest262Variants(planned);
  const unassembled = planned.find((plan) => plan.kind === "unassembled");
  const request = (input: string, variant: Test262Variant) => ({
    mode: testCase.mode,
    source: input,
    sourceId: testCase.path,
    ...includePropertiesWhen(() => {
      if (sourcePath == null) return undefined;
      return {
        sourcePath,
      };
    }),
    specialization: variant.specialization,
  });
  /*
   * ADR 0013 requires every executed combination to be listed and
   * compared, so nothing starts that the scan would not record. The
   * first variant runs alone because a case that stops at it records
   * only that variant. Once it has shown that the case does not stop
   * there, every remaining variant starts together and shares the
   * reviewed execution gate, which is what keeps one long path from
   * serializing its variants behind a single worker. Every one of those
   * outcomes is then awaited, recorded, and compared, so a late
   * rejection, a late divergence, and a late failure all still decide
   * the result instead of being discarded.
   */
  const awaited: AwaitedTest262Variant[] = [];
  const probe = admitted[0];
  if (probe != null) {
    const probed = await startTest262Execution(
      executor,
      request(probe.input, probe.variant),
    );
    awaited.push({ settled: probed, variant: probe.variant });
    if (!test262VariantDecides(probed, expectRuntimeNegative)) {
      const started = admitted.slice(1).map((entry) => ({
        settled: startTest262Execution(
          executor,
          request(entry.input, entry.variant),
        ),
        variant: entry.variant,
      }));
      for (const entry of started) {
        awaited.push({
          settled: await entry.settled,
          variant: entry.variant,
        });
      }
    }
  }
  /*
   * Every executed combination is collected before any outcome decides
   * the result, so the evidence names the complete set the run
   * compared. Evidence eligibility and comparison eligibility differ: a
   * compile-stage rejection ran no native program, so it is absent from
   * the execution evidence, but its outcome still takes part in the
   * comparison below, because one specialization compiling while
   * another did not is exactly the divergence this comparison exists to
   * catch.
   */
  for (const entry of awaited) {
    if ("error" in entry.settled) continue;
    const observation = entry.settled.observation;
    if (!test262CompileStage(observation)) variants.push(entry.variant);
    observations.push({ observation, variant: entry.variant });
  }
  // A rejected execution can never be masked by another variant's
  // outcome, so it settles the result before any classification that a
  // later or earlier variant would otherwise produce.
  const rejected = awaited.find((entry) => "error" in entry.settled);
  if (rejected != null && "error" in rejected.settled) {
    return classifyTest262(
      testCase,
      {
        detail: errorMessage(rejected.settled.error),
        failureKind: "infrastructure",
        passed: false,
      },
      supportedFeatures,
      evidence(),
    );
  }
  /*
   * Classify the case from one variant's outcome. Both the
   * infrastructure scan and the deciding scan below route through this,
   * so an outcome that is reported early carries exactly the fields it
   * would have carried when the scan reached it in order.
   */
  const classifyFrom = (
    variant: Test262Variant,
    observation: CliResult,
  ): Test262Result => {
    const strictnessMode = variant.strictness;
    const specialization = variant.specialization;
    if (observation.exitStatus === 0) {
      // Only a runtime negative reaches this branch, because a clean
      // exit decides nothing for any other case.
      return classifyTest262(
        testCase,
        {
          detail:
            `${testCase.path} ${strictnessMode} ${specialization} ` +
            "completed without the expected runtime error.",
          passed: false,
        },
        supportedFeatures,
        evidence(),
      );
    }
    // The owned diagnostic code is read from the outer source-located
    // line, not any substring of a thrown message.
    const code = diagnosticCode(observation.stderr);
    const unsupportedSyntax = code === "OSEO1001";
    // A compile-stage OSEO0001 parse or early-error rejection means no
    // native program executed.
    const parseRejected = code === "OSEO0001";
    const compileStage = test262CompileStage(observation);
    const runtimeCapability = unsupportedRuntimeCapability(observation.stderr);
    // A compile-stage rejection keeps its owned diagnostic phase and
    // reports execution evidence only when some other variant did run a
    // native program.
    return classifyTest262(
      testCase,
      {
        detail: detail(testCase, strictnessMode, specialization, observation),
        ...(unsupportedSyntax
          ? { unsupportedCapability: "profile-syntax" }
          : parseRejected
            ? { failedPhase: "parse" as const }
            : runtimeCapability == null
              ? { failedPhase: "runtime" as const }
              : { unsupportedCapability: runtimeCapability }),
        ...includePropertiesWhen(() => {
          if (!(!compileStage && infrastructureFailure(observation)))
            return undefined;
          return { failureKind: "infrastructure" as const };
        }),
        passed: false,
      },
      supportedFeatures,
      compileStage && variants.length === 0 ? { dependencies } : evidence(),
    );
  };
  // A host infrastructure diagnostic is not a semantic observation, so
  // it settles the result before the comparison below could report the
  // exit-status difference it causes as a divergence.
  const infrastructural = observations.find(
    (entry) =>
      !test262CompileStage(entry.observation) &&
      infrastructureFailure(entry.observation),
  );
  if (infrastructural != null) {
    return classifyFrom(infrastructural.variant, infrastructural.observation);
  }
  const baseline = observations[0];
  // A strict variant shifts source lines by its added directive, so a
  // runtime negative compares its diagnostics without the location
  // prefix while every other case compares stderr verbatim.
  const comparableStderr = (stderr: string): string =>
    expectRuntimeNegative
      ? stderr.replace(/^(.*):\d+:\d+: error\[/gmu, "$1: error[")
      : stderr;
  const diverging =
    baseline == null
      ? undefined
      : observations.find(
          (entry) =>
            entry.observation.exitStatus !== baseline.observation.exitStatus ||
            entry.observation.stdout !== baseline.observation.stdout ||
            comparableStderr(entry.observation.stderr) !==
              comparableStderr(baseline.observation.stderr),
        );
  // Executed variants that disagree are a specialization or strictness
  // divergence, which outranks the classification any one of them would
  // carry on its own.
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
        passed: false,
      },
      supportedFeatures,
      evidence(),
    );
  }
  for (const entry of awaited) {
    const settled = entry.settled;
    if ("error" in settled) continue;
    if (!test262VariantDecides(settled, expectRuntimeNegative)) continue;
    return classifyFrom(entry.variant, settled.observation);
  }
  if (unassembled != null) {
    return classifyTest262(
      testCase,
      {
        detail: errorMessage(unassembled.error),
        failureKind: "harness",
        passed: false,
      },
      supportedFeatures,
      { dependencies },
    );
  }
  if (
    testCase.async &&
    !expectRuntimeNegative &&
    baseline != null &&
    !asyncObservationCompleted(baseline.observation.stdout)
  ) {
    return classifyTest262(
      testCase,
      {
        detail:
          `${testCase.path} finished without printing ` +
          `${asyncCompletionMarker}: ` +
          `stdout=${JSON.stringify(baseline.observation.stdout)}`,
        failedPhase: "runtime",
        passed: false,
      },
      supportedFeatures,
      evidence(),
    );
  }
  if (expectRuntimeNegative) {
    const errorType =
      baseline == null
        ? undefined
        : unhandledErrorType(baseline.observation.stderr);
    if (errorType == null) {
      return classifyTest262(
        testCase,
        {
          detail:
            "The thrown value carries no observable error identity: " +
            `stderr=${JSON.stringify(baseline?.observation.stderr ?? "")}`,
          passed: false,
          unsupportedCapability: "runtime-error-observation",
        },
        supportedFeatures,
        evidence(),
      );
    }
    return classifyTest262(
      testCase,
      {
        errorType,
        failedPhase: "runtime",
        passed: false,
      },
      supportedFeatures,
      evidence(),
    );
  }
  return classifyTest262(
    testCase,
    { passed: true },
    supportedFeatures,
    evidence(),
  );
}

/** Locations a module case needs beyond its in-memory source. */
export interface Test262CaseLocation {
  readonly rootPath: string;
  readonly sourcePath: string;
}

/** Execute and classify one parsed upstream case. */
export async function executeTest262Case(
  source: string,
  parsed: ParsedTest262Case,
  supportedFeatures: ReadonlySet<string>,
  harnesses: Test262Harnesses,
  executor: Test262Executor,
  dependencies: readonly string[] = [],
  location?: Test262CaseLocation,
): Promise<Test262Result> {
  const evidence: Test262Evidence = { dependencies };
  const unsupported = parsed.case.features.some(
    (feature) => !supportedFeatures.has(feature),
  );
  if (unsupported) {
    return unsupportedResult(parsed.case, supportedFeatures, evidence);
  }
  const unsupportedInclude = parsed.flags.includes("raw")
    ? undefined
    : parsed.case.includes.find(
        (include) =>
          unavailableHarnessIncludes.has(include) &&
          !harnesses.includes.has(include),
      );
  if (unsupportedInclude != null) {
    return classifyTest262(
      parsed.case,
      {
        detail: `Not executed: unsupported harness ${unsupportedInclude}.`,
        passed: false,
        unsupportedCapability: "harness-include",
      },
      supportedFeatures,
      evidence,
    );
  }
  if (parsed.case.mode === "module") {
    if (location == null) {
      return classifyTest262(
        parsed.case,
        {
          detail: "Module execution needs the upstream source path.",
          failureKind: "harness",
          passed: false,
        },
        supportedFeatures,
        evidence,
      );
    }
    if (
      parsed.case.expectedFailurePhase != null &&
      parsed.case.expectedFailurePhase !== "runtime"
    ) {
      return await moduleNegativeResult(
        source,
        parsed,
        supportedFeatures,
        evidence,
        harnesses,
        location.sourcePath,
        location.rootPath,
      );
    }
    return await executedResult(
      source,
      parsed,
      supportedFeatures,
      harnesses,
      executor,
      dependencies,
      location.sourcePath,
      location.rootPath,
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
  return await executedResult(
    source,
    parsed,
    supportedFeatures,
    harnesses,
    executor,
    dependencies,
    location?.sourcePath,
    location?.rootPath,
  );
}

/**
 * Validate reviewed observations and return promotions explicitly accepted by
 * the caller. Failure classifications always abort, independent of expected
 * classifications and promotion acceptance.
 */
export function validateReviewedResults(
  subset: ReviewedTest262Subset,
  results: readonly Test262Result[],
  acceptPromotions = false,
): readonly string[] {
  const failures: string[] = [];
  const promotedPaths: string[] = [];
  if (results.length !== subset.tests.length) {
    failures.push(
      `Expected ${subset.tests.length} reviewed results, received ` +
        `${results.length}.`,
    );
  }
  for (let index = 0; index < subset.tests.length; index += 1) {
    const expected = subset.tests[index];
    const actual = results[index];
    if (expected == null || actual == null) {
      failures.push(`Missing reviewed result at index ${index}.`);
    } else if (actual.case.path !== expected.path) {
      failures.push(
        `Reviewed result at index ${index} expected path ${expected.path}, ` +
          `received ${actual.case.path}.`,
      );
    } else if (
      acceptPromotions &&
      expected.expectedClassification !== "pass" &&
      actual.classification === "pass"
    ) {
      promotedPaths.push(expected.path);
    } else if (actual.classification !== expected.expectedClassification) {
      failures.push(
        `${expected.path}: expected ${expected.expectedClassification}, ` +
          `received ${actual.classification}.`,
      );
    }
  }
  const summary = summarizeTest262(results);
  if (
    summary.semanticFailures !== 0 ||
    summary.harnessFailures !== 0 ||
    summary.infrastructureFailures !== 0
  ) {
    failures.push(
      `Reviewed failures: semantic=${summary.semanticFailures} ` +
        `harness=${summary.harnessFailures} ` +
        `infrastructure=${summary.infrastructureFailures}.`,
    );
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
  return promotedPaths;
}

async function suiteRoot(revision: string): Promise<string> {
  const packagePath = fileURLToPath(
    import.meta.resolve("test262/package.json"),
  );
  const packageRoot = dirname(packagePath);
  // SAFETY: parsedObject validates the complete JSON tree at this boundary.
  const workspace = record(
    JSON.parse(
      await readFile(join(repositoryRoot, "package.json"), "utf8"),
    ) as StructuredDataInput,
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
    done: await readFile(doneHarnessPath, "utf8"),
    includes: new Map([
      ["asyncHelpers.js", await readFile(asyncHelpersHarnessPath, "utf8")],
      [
        "byteConversionValues.js",
        await readFile(byteConversionHarnessPath, "utf8"),
      ],
      ["compareArray.js", await readFile(compareArrayHarnessPath, "utf8")],
      [
        "compareIterator.js",
        await readFile(compareIteratorHarnessPath, "utf8"),
      ],
      ["deepEqual.js", await readFile(deepEqualHarnessPath, "utf8")],
      [
        "detachArrayBuffer.js",
        await readFile(detachArrayBufferHarnessPath, "utf8"),
      ],
      ["nans.js", await readFile(nansHarnessPath, "utf8")],
      ["nativeErrors.js", await readFile(nativeErrorsHarnessPath, "utf8")],
      ["propertyHelper.js", await readFile(propertyHarnessPath, "utf8")],
      ["promiseHelper.js", await readFile(promiseHarnessPath, "utf8")],
      ["regExpUtils.js", await readFile(regexpUtilsHarnessPath, "utf8")],
    ]),
  };
}

const nativeExecutor: Test262Executor = {
  ...includePropertiesWhen(() => {
    if (executionTarget == null) return undefined;
    return {
      target: executionTarget,
    };
  }),
  async execute(request: Test262ExecutionRequest): Promise<CliResult> {
    const entry =
      request.mode === "module" && request.sourcePath != null
        ? request.sourcePath
        : request.sourceId;
    const args = [
      ...(request.mode === "module" ? ["--module"] : []),
      ...(request.specialization === "disabled" ? ["--no-specialization"] : []),
      ...(runtimeArchiveReuse === "disabled"
        ? ["--no-runtime-archive-reuse"]
        : []),
      ...(executionTarget == null ? [] : ["--target", executionTarget]),
      entry,
    ];
    return await runNativeCli({
      args,
      source: request.source,
      sourceId: request.sourceId,
      version: "0.1.0",
    });
  },
};

function positiveInteger(value: number, description: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${description} must be a positive integer.`);
  }
  return value;
}

function runMetadata(
  startedAt: number,
  poolLimit: number,
  retries: number,
): ReviewedTest262RunMetadata {
  return {
    durationMilliseconds:
      Math.round((performance.now() - startedAt) * 100) / 100,
    poolLimit,
    retries,
  };
}

/**
 * A first-in, first-out gate that bounds how many reviewed executions
 * run at once. Variant-level scheduling lets one path have several
 * executions in flight, so the concurrent execution count is bounded
 * here rather than by the number of path workers. A released slot is
 * handed to the longest-waiting caller instead of being returned to the
 * counter, which keeps the bound exact when a waiter resumes.
 */
interface ReviewedExecutionGate {
  run<Value>(work: () => Promise<Value>): Promise<Value>;
}

function createReviewedExecutionGate(limit: number): ReviewedExecutionGate {
  let active = 0;
  const waiting: (() => void)[] = [];
  const acquire = async (): Promise<void> => {
    if (active < limit) {
      active += 1;
      return;
    }
    await new Promise<void>((admit) => {
      waiting.push(admit);
    });
  };
  const release = (): void => {
    const next = waiting.shift();
    if (next != null) {
      next();
      return;
    }
    active -= 1;
  };
  return {
    async run<Value>(work: () => Promise<Value>): Promise<Value> {
      await acquire();
      try {
        return await work();
      } finally {
        release();
      }
    },
  };
}

/**
 * The most variant executions one reviewed path can contribute: one per
 * strictness mode the case admits, times the two specialization
 * policies every reviewed observation compares.
 */
const reviewedVariantsPerPath = 4;

/** Run every explicitly reviewed source path at the pinned revision. */
export async function createReviewedManifest(
  subset: ReviewedTest262Subset,
  root: string,
  harnesses: Test262Harnesses,
  executor: Test262Executor = nativeExecutor,
  options: ReviewedTest262RunOptions = {},
): Promise<ReviewedTest262Run> {
  const startedAt = performance.now();
  const configuredPoolLimit = positiveInteger(
    options.poolLimit ?? reviewedExecutionPoolLimit,
    "Reviewed test262 pool limit",
  );
  const retryLimit = positiveInteger(
    options.retryLimit ?? reviewedExecutionRetryLimit,
    "Reviewed test262 retry limit",
  );
  /*
   * The pool schedules one work item per variant, and one reviewed path
   * contributes at most one item per strictness mode and specialization
   * policy. The limit therefore clamps against that work-item bound
   * rather than the path count, so a subset with fewer paths than cores
   * still runs one path's variants together. A shard large enough to
   * saturate the host keeps the configured limit unchanged.
   */
  const poolLimit = Math.min(
    configuredPoolLimit,
    subset.tests.length * reviewedVariantsPerPath,
  );
  const supportedFeatures = new Set(subset.supportedFeatures);
  const pendingResults: (Test262Result | undefined)[] = Array(
    subset.tests.length,
  );
  const failures: (unknown | undefined)[] = Array(subset.tests.length);
  let nextIndex = 0;
  let retries = 0;
  let aborted = false;
  const retryingExecutor: Test262Executor = {
    ...includePropertiesWhen(() => {
      if (executor.target == null) return undefined;
      return {
        target: executor.target,
      };
    }),
    async execute(request): Promise<CliResult> {
      let result = await executor.execute(request);
      for (
        let retry = 0;
        retry < retryLimit && retryableInfrastructureFailure(result);
        retry += 1
      ) {
        retries += 1;
        result = await executor.execute(request);
      }
      return result;
    },
  };
  const gate = createReviewedExecutionGate(Math.max(poolLimit, 1));
  const gatedExecutor: Test262Executor = {
    ...includePropertiesWhen(() => {
      if (retryingExecutor.target == null) return undefined;
      return {
        target: retryingExecutor.target,
      };
    }),
    async execute(request): Promise<CliResult> {
      return await gate.run(
        async () => await retryingExecutor.execute(request),
      );
    },
  };
  const worker = async (): Promise<void> => {
    while (true) {
      if (aborted) return;
      const index = nextIndex;
      nextIndex += 1;
      const entry = subset.tests[index];
      if (entry == null) return;
      try {
        const sourcePath = join(root, entry.path);
        const source = await readFile(sourcePath, "utf8");
        const parsed = parseTest262Case(
          source,
          entry.path,
          subset.suiteRevision,
        );
        pendingResults[index] = await executeTest262Case(
          source,
          parsed,
          supportedFeatures,
          harnesses,
          gatedExecutor,
          entry.dependencies,
          { rootPath: root, sourcePath },
        );
      } catch (error) {
        failures[index] = error;
        aborted = true;
      }
    }
  };
  try {
    await Promise.all(
      Array.from({ length: poolLimit }, async () => await worker()),
    );
    const failure = failures.find((entry) => entry != null);
    if (failure != null) throw failure;
    const results = pendingResults.map((result, index) => {
      if (result == null) {
        throw new Error(`Missing reviewed result at index ${index}.`);
      }
      return result;
    });
    const promotedPaths = validateReviewedResults(
      subset,
      results,
      options.acceptPromotions,
    );
    return {
      manifest: {
        results,
        suiteRevision: subset.suiteRevision,
        summary: summarizeTest262(results),
      },
      metadata: runMetadata(startedAt, poolLimit, retries),
      promotedPaths,
    };
  } catch (error) {
    throw new ReviewedTest262RunError(
      error,
      runMetadata(startedAt, poolLimit, retries),
    );
  }
}

function requireSupportedHost(): void {
  if (executionTarget == null) {
    throw new Error("test262 native execution requires a supported host.");
  }
}

function canonicalizeManifestTarget(
  manifest: ReviewedTest262Manifest,
): ReviewedTest262Manifest {
  return {
    ...manifest,
    results: manifest.results.map((result) => ({
      ...result,
      ...includePropertiesWhen(() => {
        if (result.execution == null) return undefined;
        return {
          execution: {
            ...result.execution,
            target: canonicalTarget,
          },
        };
      }),
    })),
  };
}

/** Select and re-summarize one deterministic result-manifest shard. */
export function selectManifestShard(
  manifest: ReviewedTest262Manifest,
  shard?: TestShard,
): ReviewedTest262Manifest {
  const results = selectTestShard(manifest.results, shard);
  if (shard == null) {
    return manifest;
  }
  return {
    results,
    suiteRevision: manifest.suiteRevision,
    summary: summarizeTest262(results),
  };
}

function serializedManifestsEqual(
  left: SerializedTest262Manifest,
  right: SerializedTest262Manifest,
): boolean {
  return (
    left.indexText === right.indexText &&
    left.partitions.length === right.partitions.length &&
    left.partitions.every((partition, index) => {
      const other = right.partitions[index];
      return (
        other != null &&
        partition.group === other.group &&
        partition.key === other.key &&
        partition.path === other.path &&
        partition.text === other.text
      );
    })
  );
}

/** Read indexed manifest partitions with at most one read in flight. */
export async function readSerializedManifestPartitions(
  indexText: string,
  readPartition: (path: string) => Promise<string>,
): Promise<readonly SerializedTest262Partition[]> {
  const partitionPaths = reviewedManifestPartitionPaths(indexText);
  const partitions: SerializedTest262Partition[] = [];
  for (const path of partitionPaths) {
    const segments = path.slice("results/".length).split("/");
    const key = segments.pop()?.replace(/\.yaml$/u, "") ?? "";
    partitions.push({
      group: segments.join("/"),
      key,
      path,
      text: normalizeReviewedManifestText(await readPartition(path)),
    });
  }
  return partitions;
}

async function readSerializedManifest(): Promise<SerializedTest262Manifest> {
  const indexText = normalizeReviewedManifestText(
    await readFile(resultPath, "utf8"),
  );
  validateReviewedManifestFileSet(indexText, await existingPartitionPaths());
  const partitions = await readSerializedManifestPartitions(
    indexText,
    async (path) => await readFile(join(dirname(resultPath), path), "utf8"),
  );
  return { indexText, partitions };
}

async function existingPartitionPaths(): Promise<readonly string[]> {
  try {
    return (
      await readdir(join(dirname(resultPath), "results"), {
        recursive: true,
      })
    )
      .filter((path) => path.endsWith(".yaml"))
      .map((path) => `results/${path.replaceAll("\\", "/")}`);
  } catch (error) {
    if (isObject(error) && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeSerializedManifest(
  manifest: SerializedTest262Manifest,
): Promise<void> {
  const resultDirectory = dirname(resultPath);
  const expected = new Set(manifest.partitions.map(({ path }) => path));
  for (const existing of await existingPartitionPaths()) {
    if (!expected.has(existing)) {
      await rm(join(resultDirectory, existing));
    }
  }
  for (const partition of manifest.partitions) {
    const path = join(resultDirectory, partition.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, partition.text);
  }
  await writeFile(resultPath, manifest.indexText);
}

/** Parse the reviewed runner's update-only promotion option. */
export function parseTest262Arguments(
  args: readonly string[],
): Test262Arguments {
  const promotionArguments = args.filter(
    (argument) => argument === "--accept-promotions",
  );
  if (promotionArguments.length > 1) {
    throw new Error("accept-promotions may be specified only once.");
  }
  const shared = parseTestShardArguments(
    args.filter((argument) => argument !== "--accept-promotions"),
    { allowUpdate: true },
  );
  const acceptPromotions = promotionArguments.length === 1;
  if (acceptPromotions && !shared.update) {
    throw new Error("accept-promotions requires update.");
  }
  return { ...shared, acceptPromotions };
}

async function main(): Promise<void> {
  const cliArguments = parseTest262Arguments(process.argv.slice(2));
  if (cliArguments.help) {
    console.log(
      "usage: node tools/test262.ts " +
        "[--shard INDEX/TOTAL | --update [--accept-promotions]]",
    );
    return;
  }
  requireSupportedHost();
  const subsetText = await readFile(subsetPath, "utf8");
  const subset = parseReviewedSubset(subsetText);
  const selectedSubset = {
    ...subset,
    tests: selectTestShard(subset.tests, cliArguments.shard),
  };
  const root = await suiteRoot(subset.suiteRevision);
  const harnesses = await readHarnesses();
  const run = await createReviewedManifest(
    selectedSubset,
    root,
    harnesses,
    nativeExecutor,
    { acceptPromotions: cliArguments.acceptPromotions },
  );
  const { manifest, metadata } = run;
  const canonicalManifest = canonicalizeManifestTarget(manifest);
  const serialized = serializeTest262Manifest(canonicalManifest);
  if (cliArguments.update) {
    const rewrittenSubset = rewriteReviewedPromotions(
      subsetText,
      run.promotedPaths,
    );
    await writeSerializedManifest(serialized);
    await writeFile(
      parityPath,
      serializeTargetParity(serialized, manifest.suiteRevision),
    );
    await writeFile(subsetPath, rewrittenSubset);
    for (const path of run.promotedPaths) {
      console.log(`promoted ${path}`);
    }
  } else {
    const expected = await readSerializedManifest();
    const partitionTexts = new Map(
      expected.partitions.map(({ path, text }) => [path, text]),
    );
    const expectedManifest = parseReviewedManifest(
      expected.indexText,
      (path) => {
        const text = partitionTexts.get(path);
        if (text == null) throw new Error(`Missing test262 partition ${path}.`);
        return text;
      },
    );
    const expectedResult =
      cliArguments.shard == null
        ? expected
        : serializeTest262Manifest(
            selectManifestShard(expectedManifest, cliArguments.shard),
          );
    if (!serializedManifestsEqual(expectedResult, serialized)) {
      throw new Error(
        "Reviewed test262 results changed; run mise run test262:update.",
      );
    }
    validateTargetParity(
      await readFile(parityPath, "utf8"),
      expected,
      manifest.suiteRevision,
      executionTarget,
    );
  }
  console.log(
    `test262 revision=${manifest.suiteRevision} target=${executionTarget} ` +
      `tests=${selectedSubset.tests.length}/${subset.tests.length} ` +
      `pass=${manifest.summary.passes} ` +
      `expected-negative=${manifest.summary.expectedNegatives} ` +
      `unsupported=${manifest.summary.unsupportedProfileFeatures} ` +
      `duration=${metadata.durationMilliseconds}ms ` +
      `pool=${metadata.poolLimit} retries=${metadata.retries}`,
  );
}

const entry = process.argv[1];
if (entry != null && resolve(entry) === fileURLToPath(import.meta.url)) {
  await main();
}
