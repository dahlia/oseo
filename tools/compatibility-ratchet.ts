import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parse as parseJavaScript } from "@babel/parser";
import { parse as parseYaml } from "yaml";

const repositoryRoot = resolve(fileURLToPath(import.meta.url), "../..");
const subsetPath = "tests/test262/subset.yaml";
const resultsPath = "tests/test262/results.yaml";
const overridesPath = "tests/compatibility-ratchet-overrides.yaml";
const absent = "absent";
const present = "present";

type Classification =
  | "expected-negative"
  | "harness-failure"
  | "pass"
  | "semantic-failure"
  | "unsupported-profile-feature";

export type RatchetInvariant =
  | "manifest-path-set"
  | "pass-classification"
  | "pass-count"
  | "property-case-budget"
  | "property-seed"
  | "subset-path";

export interface PropertySource {
  readonly path: string;
  readonly text: string;
}

export interface GeneratedDomain {
  readonly caseBudget: number;
  readonly seeds: ReadonlySet<number>;
  readonly sources: ReadonlySet<string>;
}

export interface CompatibilitySnapshot {
  readonly classifications: ReadonlyMap<string, Classification>;
  readonly domains: ReadonlyMap<string, GeneratedDomain>;
  readonly resultPaths: ReadonlySet<string>;
  readonly subsetPaths: ReadonlySet<string>;
}

export interface RatchetCounts {
  readonly distinctPropertySeeds: number;
  readonly pass: number;
  readonly propertyCaseBudget: number;
  readonly propertyDomains: number;
  readonly results: number;
  readonly subset: number;
}

export interface RatchetViolation {
  readonly from: number | string;
  readonly invariant: RatchetInvariant;
  readonly scope: string;
  readonly to: number | string;
}

export interface RatchetOverride {
  readonly from: number | string;
  readonly invariant: Exclude<RatchetInvariant, "manifest-path-set">;
  readonly reason: string;
  readonly scope: string;
  readonly to: number | string;
}

export interface RatchetReport {
  readonly baseline: RatchetCounts;
  readonly current: RatchetCounts;
  readonly staleOverrides: readonly RatchetOverride[];
  readonly violations: readonly RatchetViolation[];
  readonly unoverriddenViolations: readonly RatchetViolation[];
}

export type BaselineIntent =
  | { readonly kind: "commit"; readonly revision: string }
  | { readonly kind: "merge-base-main" }
  | { readonly kind: "skip"; readonly reason: string };

function record(value: unknown, context: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be a mapping.`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, context: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${context} must be a non-empty string.`);
  }
  return value;
}

function transitionValue(value: unknown, context: string): number | string {
  if (
    (typeof value !== "string" || value.length === 0) &&
    typeof value !== "number"
  ) {
    throw new Error(`${context} must be a number or non-empty string.`);
  }
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new Error(`${context} must be a safe integer.`);
  }
  return value;
}

function requireKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
  context: string,
): void {
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      throw new Error(`${context} has unexpected field ${key}.`);
    }
  }
}

function classification(value: unknown, context: string): Classification {
  switch (value) {
    case "expected-negative":
    case "harness-failure":
    case "pass":
    case "semantic-failure":
    case "unsupported-profile-feature":
      return value;
    default:
      throw new Error(`${context} has an unknown classification.`);
  }
}

function parseSubset(text: string): ReadonlySet<string> {
  const root = record(parseYaml(text) as unknown, "reviewed subset");
  if (!Array.isArray(root.tests)) {
    throw new Error("reviewed subset tests must be an array.");
  }
  const paths = root.tests.map((value, index) =>
    stringValue(
      record(value, `reviewed subset test ${index}`).path,
      `reviewed subset test ${index} path`,
    ),
  );
  const unique = new Set(paths);
  if (unique.size !== paths.length) {
    throw new Error("reviewed subset paths must be unique.");
  }
  return unique;
}

function parseResults(text: string): ReadonlyMap<string, Classification> {
  const root = record(parseYaml(text) as unknown, "result manifest");
  if (!Array.isArray(root.results)) {
    throw new Error("result manifest results must be an array.");
  }
  const results = new Map<string, Classification>();
  for (const [index, value] of root.results.entries()) {
    const result = record(value, `result ${index}`);
    const testCase = record(result.case, `result ${index} case`);
    const path = stringValue(testCase.path, `result ${index} case path`);
    if (results.has(path)) {
      throw new Error(`result manifest repeats path ${path}.`);
    }
    results.set(path, classification(result.classification, `result ${index}`));
  }
  return results;
}

type AstNode = Record<string, unknown> & { readonly type: string };

function astNode(value: unknown, context: string): AstNode {
  const node = record(value, context);
  if (typeof node.type !== "string") {
    throw new Error(`${context} must be an AST node.`);
  }
  return node as AstNode;
}

function unwrapExpression(expression: AstNode): AstNode {
  let current = expression;
  while (
    current.type === "TSAsExpression" ||
    current.type === "ParenthesizedExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSTypeAssertion"
  ) {
    current = astNode(current.expression, `${current.type} expression`);
  }
  return current;
}

function numericLiteral(expression: AstNode, context: string): number {
  const value = unwrapExpression(expression);
  let parsed: number;
  if (value.type === "NumericLiteral" && typeof value.value === "number") {
    parsed = value.value;
  } else if (
    value.type === "UnaryExpression" &&
    (value.operator === "-" || value.operator === "+")
  ) {
    const operand = numericLiteral(
      astNode(value.argument, `${context} unary argument`),
      context,
    );
    parsed = value.operator === "-" ? -operand : operand;
  } else {
    throw new Error(`${context} must be a static numeric literal.`);
  }
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${context} must be a safe integer.`);
  }
  return parsed;
}

function staticString(expression: AstNode, context: string): string {
  const value = unwrapExpression(expression);
  if (value.type === "StringLiteral" && typeof value.value === "string") {
    return value.value;
  }
  if (
    value.type === "TemplateLiteral" &&
    Array.isArray(value.expressions) &&
    value.expressions.length === 0 &&
    Array.isArray(value.quasis) &&
    value.quasis.length === 1
  ) {
    const quasi = record(value.quasis[0], `${context} template element`);
    const templateValue = record(
      quasi.value,
      `${context} template element value`,
    );
    return stringValue(templateValue.cooked, context);
  }
  if (value.type === "BinaryExpression" && value.operator === "+") {
    return (
      staticString(astNode(value.left, `${context} left`), context) +
      staticString(astNode(value.right, `${context} right`), context)
    );
  }
  throw new Error(`${context} must be a static string literal.`);
}

function propertyName(name: AstNode, context: string): string {
  if (name.type === "Identifier" && typeof name.name === "string") {
    return name.name;
  }
  if (
    (name.type === "StringLiteral" || name.type === "NumericLiteral") &&
    (typeof name.value === "string" || typeof name.value === "number")
  ) {
    return `${name.value}`;
  }
  throw new Error(`${context} must use static property names.`);
}

function optionsObject(
  expression: AstNode,
  declarations: ReadonlyMap<string, readonly AstNode[]>,
  context: string,
  seen: ReadonlySet<string> = new Set(),
): ReadonlyMap<string, AstNode> {
  const value = unwrapExpression(expression);
  if (value.type === "Identifier" && typeof value.name === "string") {
    if (seen.has(value.name)) {
      throw new Error(`${context} contains a circular options declaration.`);
    }
    const matches = declarations.get(value.name);
    if (matches == null) {
      throw new Error(`${context} references unknown options ${value.name}.`);
    }
    if (matches.length !== 1) {
      throw new Error(`${context} references ambiguous options ${value.name}.`);
    }
    const declaration = matches[0];
    if (declaration == null) {
      throw new Error(`${context} references unknown options ${value.name}.`);
    }
    return optionsObject(
      declaration,
      declarations,
      context,
      new Set([...seen, value.name]),
    );
  }
  if (value.type !== "ObjectExpression" || !Array.isArray(value.properties)) {
    throw new Error(`${context} must use a static options object.`);
  }
  const properties = new Map<string, AstNode>();
  for (const [index, rawProperty] of value.properties.entries()) {
    const property = astNode(rawProperty, `${context} property ${index}`);
    if (property.type === "SpreadElement") {
      for (const [name, field] of optionsObject(
        astNode(property.argument, `${context} spread argument`),
        declarations,
        context,
        seen,
      )) {
        properties.set(name, field);
      }
      continue;
    }
    if (property.type !== "ObjectProperty") {
      throw new Error(`${context} must use property assignments.`);
    }
    properties.set(
      propertyName(astNode(property.key, `${context} property key`), context),
      astNode(property.value, `${context} property value`),
    );
  }
  return properties;
}

function requiredOption(
  options: ReadonlyMap<string, AstNode>,
  name: string,
  context: string,
): AstNode {
  const value = options.get(name);
  if (value == null) {
    throw new Error(`${context} must declare ${name}.`);
  }
  return value;
}

function parseGeneratedDomains(
  sources: readonly PropertySource[],
): ReadonlyMap<string, GeneratedDomain> {
  const mutable = new Map<
    string,
    { caseBudget: number; seeds: Set<number>; sources: Set<string> }
  >();
  for (const source of sources) {
    const sourceFile = parseJavaScript(source.text, {
      plugins: ["typescript"],
      sourceFilename: source.path,
      sourceType: "module",
    });
    const declarations = new Map<string, AstNode[]>();
    const collectDeclarations = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) collectDeclarations(item);
        return;
      }
      if (value == null || typeof value !== "object") return;
      const node = value as Record<string, unknown>;
      if (node.type === "VariableDeclarator" && node.init != null) {
        const name = astNode(node.id, `${source.path} variable name`);
        if (name.type === "Identifier" && typeof name.name === "string") {
          const matches = declarations.get(name.name) ?? [];
          matches.push(
            astNode(node.init, `${source.path} variable initializer`),
          );
          declarations.set(name.name, matches);
        }
      }
      for (const [key, child] of Object.entries(node)) {
        if (key !== "loc" && key !== "extra") collectDeclarations(child);
      }
    };
    collectDeclarations(sourceFile);

    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (value == null || typeof value !== "object") return;
      const rawNode = value as Record<string, unknown>;
      if (rawNode.type === "CallExpression") {
        const node = astNode(rawNode, `${source.path} call`);
        const target = unwrapExpression(
          astNode(node.callee, `${source.path} call target`),
        );
        if (
          target.type === "Identifier" &&
          (target.name === "assertProperty" ||
            target.name === "assertAsyncProperty")
        ) {
          if (!Array.isArray(node.arguments)) {
            throw new Error(`${source.path} property call has no arguments.`);
          }
          const nameArgument = node.arguments[0];
          const optionsArgument = node.arguments[2];
          if (nameArgument == null || optionsArgument == null) {
            throw new Error(
              `${source.path} ${target.name} must name a property and options.`,
            );
          }
          const property = staticString(
            astNode(nameArgument, `${source.path} property name`),
            `${source.path} property name`,
          );
          const context = `${source.path} property ${JSON.stringify(property)}`;
          const options = optionsObject(
            astNode(optionsArgument, `${context} options`),
            declarations,
            context,
          );
          const domain = staticString(
            requiredOption(options, "domain", context),
            `${context} domain`,
          );
          const numRuns = numericLiteral(
            requiredOption(options, "numRuns", context),
            `${context} numRuns`,
          );
          const seed = numericLiteral(
            requiredOption(options, "seed", context),
            `${context} seed`,
          );
          if (numRuns < 1) {
            throw new Error(`${context} numRuns must be positive.`);
          }
          const aggregate = mutable.get(domain) ?? {
            caseBudget: 0,
            seeds: new Set<number>(),
            sources: new Set<string>(),
          };
          aggregate.caseBudget += numRuns;
          if (!Number.isSafeInteger(aggregate.caseBudget)) {
            throw new Error(`${context} produces an unsafe case budget.`);
          }
          aggregate.seeds.add(seed);
          aggregate.sources.add(source.path);
          mutable.set(domain, aggregate);
        }
      }
      for (const [key, child] of Object.entries(rawNode)) {
        if (key !== "loc" && key !== "extra") visit(child);
      }
    };
    visit(sourceFile);
  }
  return mutable;
}

export function createCompatibilitySnapshot(
  subsetText: string,
  resultsText: string,
  propertySources: readonly PropertySource[],
): CompatibilitySnapshot {
  const classifications = parseResults(resultsText);
  return {
    classifications,
    domains: parseGeneratedDomains(propertySources),
    resultPaths: new Set(classifications.keys()),
    subsetPaths: parseSubset(subsetText),
  };
}

function counts(snapshot: CompatibilitySnapshot): RatchetCounts {
  const seeds = new Set<number>();
  let propertyCaseBudget = 0;
  for (const domain of snapshot.domains.values()) {
    propertyCaseBudget += domain.caseBudget;
    for (const seed of domain.seeds) seeds.add(seed);
  }
  return {
    distinctPropertySeeds: seeds.size,
    pass: [...snapshot.classifications.values()].filter(
      (value) => value === "pass",
    ).length,
    propertyCaseBudget,
    propertyDomains: snapshot.domains.size,
    results: snapshot.resultPaths.size,
    subset: snapshot.subsetPaths.size,
  };
}

function detectViolations(
  baseline: CompatibilitySnapshot,
  current: CompatibilitySnapshot,
): readonly RatchetViolation[] {
  const violations: RatchetViolation[] = [];
  const baselineCounts = counts(baseline);
  const currentCounts = counts(current);
  if (currentCounts.pass < baselineCounts.pass) {
    violations.push({
      from: baselineCounts.pass,
      invariant: "pass-count",
      scope: resultsPath,
      to: currentCounts.pass,
    });
  }
  for (const [path, value] of baseline.classifications) {
    if (value !== "pass") continue;
    const next = current.classifications.get(path);
    if (next !== "pass") {
      violations.push({
        from: "pass",
        invariant: "pass-classification",
        scope: path,
        to: next ?? absent,
      });
    }
  }
  for (const path of baseline.subsetPaths) {
    if (!current.subsetPaths.has(path)) {
      violations.push({
        from: present,
        invariant: "subset-path",
        scope: path,
        to: absent,
      });
    }
  }
  for (const path of current.subsetPaths) {
    if (!current.resultPaths.has(path)) {
      violations.push({
        from: present,
        invariant: "manifest-path-set",
        scope: path,
        to: "missing-from-results",
      });
    }
  }
  for (const path of current.resultPaths) {
    if (!current.subsetPaths.has(path)) {
      violations.push({
        from: present,
        invariant: "manifest-path-set",
        scope: path,
        to: "missing-from-subset",
      });
    }
  }
  for (const [name, domain] of baseline.domains) {
    const next = current.domains.get(name);
    for (const seed of domain.seeds) {
      if (next == null || !next.seeds.has(seed)) {
        violations.push({
          from: seed,
          invariant: "property-seed",
          scope: name,
          to: absent,
        });
      }
    }
    if (next == null || next.caseBudget < domain.caseBudget) {
      violations.push({
        from: domain.caseBudget,
        invariant: "property-case-budget",
        scope: name,
        to: next?.caseBudget ?? absent,
      });
    }
  }
  return violations.toSorted((left, right) =>
    `${left.invariant}\0${left.scope}\0${left.from}\0${left.to}`.localeCompare(
      `${right.invariant}\0${right.scope}\0${right.from}\0${right.to}`,
    ),
  );
}

function parseOverrides(text: string): readonly RatchetOverride[] {
  const root = record(parseYaml(text) as unknown, "ratchet override record");
  if (!Array.isArray(root.overrides)) {
    throw new Error("ratchet overrides must be an array.");
  }
  return root.overrides.map((value, index) => {
    const entry = record(value, `ratchet override ${index}`);
    const invariant = stringValue(
      entry.invariant,
      `ratchet override ${index} invariant`,
    );
    if (
      invariant !== "pass-classification" &&
      invariant !== "pass-count" &&
      invariant !== "property-case-budget" &&
      invariant !== "property-seed" &&
      invariant !== "subset-path"
    ) {
      throw new Error(`ratchet override ${index} names an invalid invariant.`);
    }
    const transition = record(
      entry.transition,
      `ratchet override ${index} transition`,
    );
    const scopeField = invariant.startsWith("property-") ? "domain" : "path";
    requireKeys(
      entry,
      new Set(["invariant", "reason", "transition", scopeField]),
      `ratchet override ${index}`,
    );
    requireKeys(
      transition,
      new Set(["from", "to"]),
      `ratchet override ${index} transition`,
    );
    const scope = stringValue(
      entry[scopeField],
      `ratchet override ${index} ${scopeField}`,
    );
    if (invariant === "pass-count" && scope !== resultsPath) {
      throw new Error(
        `ratchet override ${index} pass-count path must be ${resultsPath}.`,
      );
    }
    const reason = stringValue(
      entry.reason,
      `ratchet override ${index} reason`,
    );
    return {
      from: transitionValue(
        transition.from,
        `ratchet override ${index} transition from`,
      ),
      invariant,
      reason,
      scope,
      to: transitionValue(
        transition.to,
        `ratchet override ${index} transition to`,
      ),
    };
  });
}

function sameTransition(
  violation: RatchetViolation,
  override: RatchetOverride,
): boolean {
  return (
    violation.invariant === override.invariant &&
    violation.scope === override.scope &&
    violation.from === override.from &&
    violation.to === override.to
  );
}

function sameOverride(left: RatchetOverride, right: RatchetOverride): boolean {
  return (
    left.invariant === right.invariant &&
    left.scope === right.scope &&
    left.from === right.from &&
    left.to === right.to &&
    left.reason === right.reason
  );
}

export function compareCompatibility(
  baseline: CompatibilitySnapshot,
  current: CompatibilitySnapshot,
  currentOverridesText = "overrides: []\n",
  baselineOverridesText = "overrides: []\n",
): RatchetReport {
  const violations = detectViolations(baseline, current);
  const baselineOverrides = [...parseOverrides(baselineOverridesText)];
  const overrides = parseOverrides(currentOverridesText).filter((override) => {
    const index = baselineOverrides.findIndex((baselineOverride) =>
      sameOverride(override, baselineOverride),
    );
    if (index < 0) return true;
    baselineOverrides.splice(index, 1);
    return false;
  });
  const remaining = [...violations];
  const staleOverrides: RatchetOverride[] = [];
  for (const override of overrides) {
    const index = remaining.findIndex((violation) =>
      sameTransition(violation, override),
    );
    if (index < 0) {
      staleOverrides.push(override);
    } else {
      remaining.splice(index, 1);
    }
  }
  return {
    baseline: counts(baseline),
    current: counts(current),
    staleOverrides,
    unoverriddenViolations: remaining,
    violations,
  };
}

function zeroCommit(value: string): boolean {
  return /^0+$/u.test(value);
}

export function selectBaselineIntent(
  environment: Readonly<Record<string, string | undefined>>,
  event: unknown,
  localBranch: string | undefined,
): BaselineIntent {
  if (environment.GITHUB_ACTIONS === "true") {
    const eventName = stringValue(
      environment.GITHUB_EVENT_NAME,
      "GITHUB_EVENT_NAME",
    );
    const payload = record(event, "GitHub event");
    if (eventName === "pull_request" || eventName === "pull_request_target") {
      const pullRequest = record(payload.pull_request, "pull request event");
      const base = record(pullRequest.base, "pull request base");
      return {
        kind: "commit",
        revision: stringValue(base.sha, "pull request base SHA"),
      };
    }
    if (eventName === "push") {
      const ref = stringValue(payload.ref, "push ref");
      const refType =
        environment.GITHUB_REF_TYPE ??
        (ref.startsWith("refs/tags/") ? "tag" : "branch");
      if (refType === "tag") {
        return {
          kind: "skip",
          reason: "tag pushes are outside the compatibility ratchet scope",
        };
      }
      if (refType !== "branch") {
        throw new Error(`unsupported GitHub ref type ${refType}.`);
      }
      const before = stringValue(payload.before, "push before SHA");
      return zeroCommit(before)
        ? { kind: "merge-base-main" }
        : { kind: "commit", revision: before };
    }
    throw new Error(`unsupported GitHub event ${eventName}.`);
  }
  if (localBranch == null) {
    throw new Error("cannot select a local baseline from detached HEAD.");
  }
  return localBranch === "main"
    ? { kind: "commit", revision: "HEAD" }
    : { kind: "merge-base-main" };
}

function git(args: readonly string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const detail =
      error != null &&
      typeof error === "object" &&
      "stderr" in error &&
      typeof error.stderr === "string"
        ? error.stderr.trim()
        : `${error}`;
    throw new Error(`git ${args.join(" ")} failed: ${detail}`, {
      cause: error,
    });
  }
}

function optionalGit(args: readonly string[]): string | undefined {
  try {
    return git(args);
  } catch {
    return undefined;
  }
}

function resolveCommit(revision: string): string {
  const resolved = optionalGit([
    "rev-parse",
    "--verify",
    `${revision}^{commit}`,
  ]);
  if (resolved == null || resolved.length === 0) {
    throw new Error(`compatibility baseline ${revision} is not available.`);
  }
  return resolved;
}

function mainReference(): string {
  const candidates = [
    "refs/heads/main",
    "refs/remotes/origin/main",
    ...git(["for-each-ref", "--format=%(refname)", "refs/remotes"])
      .split("\n")
      .filter((value) => value.endsWith("/main")),
  ];
  for (const candidate of candidates) {
    if (optionalGit(["show-ref", "--verify", "--quiet", candidate]) != null) {
      return candidate;
    }
  }
  throw new Error("cannot find a local or remote main reference.");
}

function resolveBaseline(intent: BaselineIntent): string | undefined {
  if (intent.kind === "skip") return undefined;
  if (intent.kind === "commit") return resolveCommit(intent.revision);
  const reference = mainReference();
  const baseline = optionalGit(["merge-base", "HEAD", reference]);
  if (baseline == null || baseline.length === 0) {
    throw new Error(`cannot find a merge base between HEAD and ${reference}.`);
  }
  return resolveCommit(baseline);
}

function gitText(revision: string, path: string): string {
  return git(["show", `${revision}:${path}`]);
}

function optionalGitText(revision: string, path: string): string | undefined {
  return optionalGit(["show", `${revision}:${path}`]);
}

function baselinePropertySources(revision: string): readonly PropertySource[] {
  const paths = git(["ls-tree", "-r", "--name-only", revision])
    .split("\n")
    .filter((path) => path.endsWith(".property.test.ts"));
  return paths.map((path) => ({ path, text: gitText(revision, path) }));
}

export function compatibilitySnapshotAtRevision(
  revision: string,
): CompatibilitySnapshot {
  const commit = resolveCommit(revision);
  return createCompatibilitySnapshot(
    gitText(commit, subsetPath),
    gitText(commit, resultsPath),
    baselinePropertySources(commit),
  );
}

export function selectCurrentPropertyPaths(
  listedText: string,
  deletedText: string,
): readonly string[] {
  const deleted = new Set(deletedText.split("\n"));
  return listedText
    .split("\n")
    .filter((path) => path.endsWith(".property.test.ts") && !deleted.has(path));
}

function currentPropertySources(): readonly PropertySource[] {
  return selectCurrentPropertyPaths(
    git(["ls-files", "--cached", "--others", "--exclude-standard"]),
    git(["ls-files", "--deleted"]),
  ).map((path) => ({
    path,
    text: readFileSync(join(repositoryRoot, path), "utf8"),
  }));
}

function formatCounts(label: string, value: RatchetCounts): string {
  return (
    `${label} pass=${value.pass} subset=${value.subset} ` +
    `results=${value.results} property-domains=${value.propertyDomains} ` +
    `property-seeds=${value.distinctPropertySeeds} ` +
    `property-case-budget=${value.propertyCaseBudget}`
  );
}

function formatViolation(violation: RatchetViolation): string {
  return (
    `${violation.invariant} ${JSON.stringify(violation.scope)} ` +
    `${JSON.stringify(violation.from)} -> ${JSON.stringify(violation.to)}`
  );
}

async function main(): Promise<void> {
  const branch = optionalGit(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const event =
    process.env.GITHUB_ACTIONS === "true"
      ? (JSON.parse(
          readFileSync(stringValue(eventPath, "GITHUB_EVENT_PATH"), "utf8"),
        ) as unknown)
      : {};
  const intent = selectBaselineIntent(process.env, event, branch);
  if (intent.kind === "skip") {
    console.log(`compatibility-ratchet skipped: ${intent.reason}`);
    return;
  }
  const baselineRevision = resolveBaseline(intent);
  if (baselineRevision == null) {
    throw new Error("compatibility baseline selection produced no commit.");
  }
  const baseline = compatibilitySnapshotAtRevision(baselineRevision);
  const current = createCompatibilitySnapshot(
    readFileSync(join(repositoryRoot, subsetPath), "utf8"),
    readFileSync(join(repositoryRoot, resultsPath), "utf8"),
    currentPropertySources(),
  );
  const report = compareCompatibility(
    baseline,
    current,
    readFileSync(join(repositoryRoot, overridesPath), "utf8"),
    optionalGitText(baselineRevision, overridesPath) ?? "overrides: []\n",
  );
  console.log(`compatibility-ratchet baseline=${baselineRevision}`);
  console.log(formatCounts("before", report.baseline));
  console.log(formatCounts("after ", report.current));
  const failures = [
    ...report.unoverriddenViolations.map(
      (violation) => `unapproved ${formatViolation(violation)}`,
    ),
    ...report.staleOverrides.map(
      (override) =>
        `stale override ${override.invariant} ` +
        `${JSON.stringify(override.scope)} ` +
        `${JSON.stringify(override.from)} -> ${JSON.stringify(override.to)}`,
    ),
  ];
  if (failures.length > 0) {
    throw new Error(`compatibility ratchet failed:\n${failures.join("\n")}`);
  }
  const approved = report.violations.length;
  console.log(`compatibility-ratchet passed overrides=${approved}`);
}

const entry = process.argv[1];
if (entry != null && resolve(entry) === fileURLToPath(import.meta.url)) {
  await main();
}
