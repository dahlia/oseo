import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parse as parseJavaScript } from "@babel/parser";
import { parse as parseYaml } from "yaml";

import {
  parseReviewedManifest,
  validateReviewedManifestFileSet,
} from "./test262-manifest.ts";
import {
  currentEvidenceFamilyIds,
  validatedEvidenceFamilyIdsFromTree,
} from "./evidence-lanes.ts";
import {
  parsedMapping as record,
  type StructuredDataInput,
  type StructuredDataRecord,
} from "./structured-data.ts";
import { isNumber, isObject, isString } from "./value-kinds.ts";

const repositoryRoot = resolve(fileURLToPath(import.meta.url), "../..");
const subsetPath = "tests/test262/subset.yaml";
const resultsPath = "tests/test262/results.yaml";
const overridesPath = "tests/compatibility-ratchet-overrides.yaml";
const propertySeedRegistryPath = "tests/property-seeds.yaml";
const absent = "absent";
const present = "present";
const maximumFastCheckSeed = 0x7fff_ffff;
const minimumFastCheckSeed = -0x8000_0000;
const propertySeedBlockSize = 0x100;

type Classification =
  | "expected-negative"
  | "harness-failure"
  | "infrastructure-failure"
  | "pass"
  | "semantic-failure"
  | "unsupported-profile-feature";

export type RatchetInvariant =
  | "admitted-family"
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

/** Aggregate reviewed allocations validated against the seed registry. */
export interface PropertySeedRegistrySummary {
  readonly allocations: number;
  readonly families: number;
  readonly seeds: number;
}

/** Partitioned result-manifest input for one compatibility snapshot. */
export interface ResultManifestSource {
  readonly indexText: string;
  readonly partitionPaths: readonly string[];
  readPartition(path: string): string;
}

export interface GeneratedDomain {
  readonly caseBudget: number;
  readonly seeds: ReadonlySet<number>;
  readonly sources: ReadonlySet<string>;
}

export interface CompatibilitySnapshot {
  readonly admittedFamilies: ReadonlySet<string>;
  readonly classifications: ReadonlyMap<string, Classification>;
  readonly domains: ReadonlyMap<string, GeneratedDomain>;
  readonly resultPaths: ReadonlySet<string>;
  readonly subsetPaths: ReadonlySet<string>;
}

export interface RatchetCounts {
  readonly admittedFamilies: number;
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
  readonly invariant: Exclude<
    RatchetInvariant,
    "admitted-family" | "manifest-path-set"
  >;
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

function stringValue(value: StructuredDataInput, context: string): string {
  if (!isString(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty string.`);
  }
  return value;
}

function transitionValue(
  value: StructuredDataInput,
  context: string,
): number | string {
  if ((!isString(value) || value.length === 0) && !isNumber(value)) {
    throw new Error(`${context} must be a number or non-empty string.`);
  }
  if (isNumber(value) && !Number.isSafeInteger(value)) {
    throw new Error(`${context} must be a safe integer.`);
  }
  return value;
}

function requireKeys(
  value: StructuredDataRecord,
  expected: ReadonlySet<string>,
  context: string,
): void {
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      throw new Error(`${context} has unexpected field ${key}.`);
    }
  }
}

function classification(
  value: StructuredDataInput,
  context: string,
): Classification {
  switch (value) {
    case "expected-negative":
    case "harness-failure":
    case "infrastructure-failure":
    case "pass":
    case "semantic-failure":
    case "unsupported-profile-feature":
      return value;
    default:
      throw new Error(`${context} has an unknown classification.`);
  }
}

function parseSubset(text: string): ReadonlySet<string> {
  // SAFETY: parsedMapping validates the complete YAML tree at this boundary.
  const root = record(
    parseYaml(text) as StructuredDataInput,
    "reviewed subset",
  );
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

function parseResults(
  source: ResultManifestSource,
  allowLegacyGitBaseline: boolean,
): ReadonlyMap<string, Classification> {
  // SAFETY: parsedMapping validates the complete YAML tree at this boundary.
  const legacy = record(
    parseYaml(source.indexText) as StructuredDataInput,
    "result manifest",
  );
  if (Array.isArray(legacy.results)) {
    if (!allowLegacyGitBaseline) {
      throw new Error(
        "legacy result manifests are allowed only for Git baselines.",
      );
    }
    if (source.partitionPaths.length > 0) {
      throw new Error("a legacy Git baseline cannot contain partitions.");
    }
    const results = new Map<string, Classification>();
    for (const [index, value] of legacy.results.entries()) {
      const result = record(value, `result ${index}`);
      const testCase = record(result.case, `result ${index} case`);
      const path = stringValue(testCase.path, `result ${index} case path`);
      if (results.has(path)) {
        throw new Error(`result manifest repeats path ${path}.`);
      }
      results.set(
        path,
        classification(result.classification, `result ${index}`),
      );
    }
    return results;
  }
  validateReviewedManifestFileSet(source.indexText, source.partitionPaths);
  const manifest = parseReviewedManifest(
    source.indexText,
    source.readPartition,
  );
  const results = new Map<string, Classification>();
  for (const [index, result] of manifest.results.entries()) {
    const path = result.case.path;
    if (results.has(path)) {
      throw new Error(`result manifest repeats path ${path}.`);
    }
    results.set(path, classification(result.classification, `result ${index}`));
  }
  return results;
}

type AstValue =
  | AstRecord
  | readonly AstValue[]
  | boolean
  | null
  | number
  | string;

interface AstRecord {
  readonly [key: string]: AstValue | undefined;
}

type AstNode = AstRecord & { readonly type: string };

function astRecord(value: StructuredDataInput, context: string): AstRecord {
  if (!isObject(value) || Array.isArray(value)) {
    throw new Error(`${context} must be an AST record.`);
  }
  // SAFETY: AstRecord is an open record and the object check establishes it.
  return value as AstRecord;
}

function astNode(value: StructuredDataInput, context: string): AstNode {
  const node = astRecord(value, context);
  if (!isString(node.type)) {
    throw new Error(`${context} must be an AST node.`);
  }
  // SAFETY: The record and string type-tag checks establish an AST node.
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
  if (value.type === "NumericLiteral" && isNumber(value.value)) {
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

function fastCheckSeed(value: StructuredDataInput, context: string): number {
  if (
    !isNumber(value) ||
    !Number.isSafeInteger(value) ||
    value < minimumFastCheckSeed ||
    value > maximumFastCheckSeed
  ) {
    throw new Error(
      `${context} must be a signed 32-bit integer accepted by fast-check.`,
    );
  }
  return value;
}

function staticString(expression: AstNode, context: string): string {
  const value = unwrapExpression(expression);
  if (value.type === "StringLiteral" && isString(value.value)) {
    return value.value;
  }
  if (
    value.type === "TemplateLiteral" &&
    Array.isArray(value.expressions) &&
    value.expressions.length === 0 &&
    Array.isArray(value.quasis) &&
    value.quasis.length === 1
  ) {
    const quasi = astRecord(value.quasis[0], `${context} template element`);
    const templateValue = astRecord(
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
  if (name.type === "Identifier" && isString(name.name)) {
    return name.name;
  }
  if (
    (name.type === "StringLiteral" || name.type === "NumericLiteral") &&
    (isString(name.value) || isNumber(name.value))
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
  if (value.type === "Identifier" && isString(value.name)) {
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

interface PropertyAllocation {
  readonly domain: string;
  readonly path: string;
  readonly property: string;
  readonly seed: number;
  readonly numRuns: number;
}

function parsePropertyAllocations(
  sources: readonly PropertySource[],
): readonly PropertyAllocation[] {
  const allocations: PropertyAllocation[] = [];
  for (const source of sources) {
    const sourceFile = parseJavaScript(source.text, {
      plugins: ["typescript"],
      sourceFilename: source.path,
      sourceType: "module",
    });
    const declarations = new Map<string, AstNode[]>();
    const collectDeclarations = (
      value: StructuredDataInput<typeof sourceFile>,
    ): void => {
      if (Array.isArray(value)) {
        for (const item of value) collectDeclarations(item);
        return;
      }
      if (!isObject(value)) return;
      // SAFETY: Babel traversal supplies AST records after the object check.
      const node = value as AstRecord;
      if (node.type === "VariableDeclarator" && node.init != null) {
        const name = astNode(node.id, `${source.path} variable name`);
        if (name.type === "Identifier" && isString(name.name)) {
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

    const visit = (value: StructuredDataInput<typeof sourceFile>): void => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (!isObject(value)) return;
      // SAFETY: Babel traversal supplies AST records after the object check.
      const rawNode = value as AstRecord;
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
          fastCheckSeed(seed, `${context} seed`);
          allocations.push({
            domain,
            numRuns,
            path: source.path,
            property,
            seed,
          });
        }
      }
      for (const [key, child] of Object.entries(rawNode)) {
        if (key !== "loc" && key !== "extra") visit(child);
      }
    };
    visit(sourceFile);
  }
  return allocations;
}

function parseGeneratedDomains(
  sources: readonly PropertySource[],
): ReadonlyMap<string, GeneratedDomain> {
  const mutable = new Map<
    string,
    { caseBudget: number; seeds: Set<number>; sources: Set<string> }
  >();
  for (const allocation of parsePropertyAllocations(sources)) {
    const aggregate = mutable.get(allocation.domain) ?? {
      caseBudget: 0,
      seeds: new Set<number>(),
      sources: new Set<string>(),
    };
    aggregate.caseBudget += allocation.numRuns;
    if (!Number.isSafeInteger(aggregate.caseBudget)) {
      throw new Error(
        `${allocation.path} property ${JSON.stringify(allocation.property)} ` +
          "produces an unsafe case budget.",
      );
    }
    aggregate.seeds.add(allocation.seed);
    aggregate.sources.add(allocation.path);
    mutable.set(allocation.domain, aggregate);
  }
  return mutable;
}

interface PropertySeedFamily {
  readonly end: number;
  readonly family: string;
  readonly owner: string;
  readonly start: number;
}

function registryInteger(value: StructuredDataInput, context: string): number {
  if (!isNumber(value) || !Number.isSafeInteger(value)) {
    throw new Error(`${context} must be a safe integer.`);
  }
  return value;
}

function registryOwner(value: StructuredDataInput, context: string): string {
  const owner = stringValue(value, context);
  if (
    owner.startsWith("/") ||
    owner.includes("\\") ||
    owner.split("/").includes("..") ||
    !owner.endsWith(".property.test.ts")
  ) {
    throw new Error(
      `${context} must be a repository-relative property test path.`,
    );
  }
  return owner;
}

function parsePropertySeedRegistry(
  text: string,
): readonly PropertySeedFamily[] {
  // SAFETY: parsedMapping validates the complete YAML tree at this boundary.
  const root = record(
    parseYaml(text) as StructuredDataInput,
    "property seed registry",
  );
  requireKeys(root, new Set(["families", "version"]), "property seed registry");
  if (root.version !== 1) {
    throw new Error("property seed registry version must be 1.");
  }
  if (!Array.isArray(root.families)) {
    throw new Error("property seed registry families must be an array.");
  }
  const names = new Set<string>();
  const owners = new Set<string>();
  const families = root.families.map((value, index) => {
    const context = `property seed family ${index}`;
    const entry = record(value, context);
    requireKeys(entry, new Set(["end", "family", "owner", "start"]), context);
    const family = stringValue(entry.family, `${context} family`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(family)) {
      throw new Error(`${context} family must be a lowercase kebab-case ID.`);
    }
    if (names.has(family)) {
      throw new Error(`property seed registry repeats family ${family}.`);
    }
    names.add(family);
    const owner = registryOwner(entry.owner, `${context} owner`);
    if (owners.has(owner)) {
      throw new Error(`property seed registry repeats owner ${owner}.`);
    }
    owners.add(owner);
    const start = fastCheckSeed(
      registryInteger(entry.start, `${context} start`),
      `${context} start`,
    );
    const end = fastCheckSeed(
      registryInteger(entry.end, `${context} end`),
      `${context} end`,
    );
    if (
      start < 0 ||
      start % propertySeedBlockSize !== 0 ||
      end !== start + propertySeedBlockSize - 1
    ) {
      throw new Error(
        `${context} must reserve one aligned ${propertySeedBlockSize}-seed ` +
          "block.",
      );
    }
    return { end, family, owner, start };
  });
  const ordered = families.toSorted((left, right) => left.start - right.start);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous != null && current != null && current.start <= previous.end) {
      throw new Error(
        `property seed blocks overlap for ${previous.family} and ` +
          `${current.family}.`,
      );
    }
  }
  return families;
}

/** Validate reviewed property seeds against their checked-in family blocks. */
export function validatePropertySeedRegistry(
  registryText: string,
  sources: readonly PropertySource[],
): PropertySeedRegistrySummary {
  const families = parsePropertySeedRegistry(registryText);
  const allocations = parsePropertyAllocations(sources);
  const byOwner = new Map(families.map((family) => [family.owner, family]));
  const usedOwners = new Set<string>();
  for (const source of sources) {
    if (!byOwner.has(source.path)) {
      throw new Error(`property family is unregistered for ${source.path}.`);
    }
  }
  const seedOwners = new Map<
    number,
    { readonly domain: string; readonly family: string }
  >();
  for (const allocation of allocations) {
    const family = byOwner.get(allocation.path);
    if (family == null) {
      throw new Error(
        `property family is unregistered for ${allocation.path}.`,
      );
    }
    usedOwners.add(family.owner);
    if (allocation.seed < family.start || allocation.seed > family.end) {
      throw new Error(
        `${allocation.path} property ${JSON.stringify(allocation.property)} ` +
          `uses seed ${allocation.seed} outside family ${family.family} ` +
          `block ${family.start}..${family.end}.`,
      );
    }
    const prior = seedOwners.get(allocation.seed);
    if (
      prior != null &&
      (prior.family !== family.family || prior.domain !== allocation.domain)
    ) {
      throw new Error(
        `property seed ${allocation.seed} is allocated to both ` +
          `${prior.family} domain ${JSON.stringify(prior.domain)} and ` +
          `${family.family} domain ${JSON.stringify(allocation.domain)}.`,
      );
    }
    seedOwners.set(allocation.seed, {
      domain: allocation.domain,
      family: family.family,
    });
  }
  for (const family of families) {
    if (!usedOwners.has(family.owner)) {
      throw new Error(
        `property seed family ${family.family} has no reviewed property call.`,
      );
    }
  }
  return {
    allocations: allocations.length,
    families: families.length,
    seeds: seedOwners.size,
  };
}

function createCompatibilitySnapshotFromSource(
  subsetText: string,
  resultManifest: ResultManifestSource,
  propertySources: readonly PropertySource[],
  allowLegacyGitBaseline: boolean,
  admittedFamilies: readonly string[],
): CompatibilitySnapshot {
  const classifications = parseResults(resultManifest, allowLegacyGitBaseline);
  return {
    admittedFamilies: new Set(admittedFamilies),
    classifications,
    domains: parseGeneratedDomains(propertySources),
    resultPaths: new Set(classifications.keys()),
    subsetPaths: parseSubset(subsetText),
  };
}

export function createCompatibilitySnapshot(
  subsetText: string,
  resultManifest: ResultManifestSource,
  propertySources: readonly PropertySource[],
  admittedFamilies: readonly string[] = [],
): CompatibilitySnapshot {
  return createCompatibilitySnapshotFromSource(
    subsetText,
    resultManifest,
    propertySources,
    false,
    admittedFamilies,
  );
}

/** Create a compatibility snapshot from a result manifest stored in Git. */
export function createGitCompatibilitySnapshot(
  subsetText: string,
  resultManifest: ResultManifestSource,
  propertySources: readonly PropertySource[],
  admittedFamilies: readonly string[] = [],
): CompatibilitySnapshot {
  return createCompatibilitySnapshotFromSource(
    subsetText,
    resultManifest,
    propertySources,
    true,
    admittedFamilies,
  );
}

function counts(snapshot: CompatibilitySnapshot): RatchetCounts {
  const seeds = new Set<number>();
  let propertyCaseBudget = 0;
  for (const domain of snapshot.domains.values()) {
    propertyCaseBudget += domain.caseBudget;
    for (const seed of domain.seeds) seeds.add(seed);
  }
  return {
    admittedFamilies: snapshot.admittedFamilies.size,
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
  for (const family of baseline.admittedFamilies) {
    if (!current.admittedFamilies.has(family)) {
      violations.push({
        from: present,
        invariant: "admitted-family",
        scope: family,
        to: absent,
      });
    }
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
  // SAFETY: parsedMapping validates the complete YAML tree at this boundary.
  const root = record(
    parseYaml(text) as StructuredDataInput,
    "ratchet override record",
  );
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
  event: StructuredDataInput,
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
    if (eventName === "workflow_dispatch") {
      const inputs = record(payload.inputs, "workflow dispatch inputs");
      return {
        kind: "commit",
        revision: stringValue(inputs.baseline, "workflow baseline SHA"),
      };
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
      isObject(error) && "stderr" in error && isString(error.stderr)
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

/** Select every result partition present in one Git tree listing. */
export function selectGitResultPartitionPaths(
  listedText: string,
): readonly string[] {
  const prefix = "tests/test262/";
  return listedText
    .split("\n")
    .filter(
      (path) => path.startsWith(`${prefix}results/`) && path.endsWith(".yaml"),
    )
    .map((path) => path.slice(prefix.length));
}

export function compatibilitySnapshotAtRevision(
  revision: string,
): CompatibilitySnapshot {
  const commit = resolveCommit(revision);
  const listedPaths = git(["ls-tree", "-r", "--name-only", commit]).split("\n");
  const admittedFamilies = validatedEvidenceFamilyIdsFromTree(
    listedPaths,
    (path) => gitText(commit, path),
  );
  return createGitCompatibilitySnapshot(
    gitText(commit, subsetPath),
    {
      indexText: gitText(commit, resultsPath),
      partitionPaths: selectGitResultPartitionPaths(
        git([
          "ls-tree",
          "-r",
          "--name-only",
          commit,
          "--",
          "tests/test262/results",
        ]),
      ),
      readPartition(path): string {
        return gitText(commit, `tests/test262/${path}`);
      },
    },
    baselinePropertySources(commit),
    admittedFamilies,
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

function currentResultPartitionPaths(): readonly string[] {
  try {
    return readdirSync(join(repositoryRoot, "tests/test262/results"), {
      encoding: "utf8",
      recursive: true,
    })
      .filter((path) => path.endsWith(".yaml"))
      .map((path) => `results/${path.replaceAll("\\", "/")}`);
  } catch (error) {
    if (isObject(error) && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function formatCounts(label: string, value: RatchetCounts): string {
  return (
    `${label} families=${value.admittedFamilies} pass=${value.pass} ` +
    `subset=${value.subset} ` +
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
  // SAFETY: parsedMapping validates the complete GitHub event JSON tree.
  const event =
    process.env.GITHUB_ACTIONS === "true"
      ? record(
          JSON.parse(
            readFileSync(stringValue(eventPath, "GITHUB_EVENT_PATH"), "utf8"),
          ) as StructuredDataInput,
          "GitHub event",
        )
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
  const propertySources = currentPropertySources();
  const registry = validatePropertySeedRegistry(
    readFileSync(join(repositoryRoot, propertySeedRegistryPath), "utf8"),
    propertySources,
  );
  const current = createCompatibilitySnapshot(
    readFileSync(join(repositoryRoot, subsetPath), "utf8"),
    {
      indexText: readFileSync(join(repositoryRoot, resultsPath), "utf8"),
      partitionPaths: currentResultPartitionPaths(),
      readPartition(path): string {
        return readFileSync(
          join(repositoryRoot, "tests/test262", path),
          "utf8",
        );
      },
    },
    propertySources,
    currentEvidenceFamilyIds(),
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
  console.log(
    `seed-registry families=${registry.families} ` +
      `allocations=${registry.allocations} seeds=${registry.seeds}`,
  );
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
