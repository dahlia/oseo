import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { test262Group } from "../packages/testkit/src/test262-summary.ts";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  m5cClosureLedgerPath,
  m5cUnreviewedDefaultNode,
  parseM5cClosureLedger,
  serializeM5cClosureLedger,
} from "./m5c-closure-ledger.ts";
import type { M5cClosureLedger } from "./m5c-closure-ledger.ts";
import {
  m5cInventoryPath,
  m5cWorkGraphNodeDirectory,
  parseM5cInventory,
  readCurrentM5cManifest,
} from "./m5c-graph.ts";
import type {
  StructuredDataInput,
  StructuredDataRecord,
} from "./structured-data.ts";
import { parsedObject as record } from "./structured-data.ts";
import {
  parseReviewedSubset,
  parseTest262Case,
  unresolvedReferenceNames,
} from "./test262-source.ts";
import { test262PartitionKey } from "./test262-manifest.ts";
import { isString } from "./value-kinds.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Checked-in observation batch plan, derived by this tool. */
export const m5cObservationBatchesPath =
  "docs/m5c-closure/observation-batches.yaml";

const subsetPath = "tests/test262/subset.yaml";
const resultsIndexPath = "tests/test262/results.yaml";
const reviewedHarnessDirectory = "tests/test262/harness";
const planVersion = 1;
const pathRoot = "test/";

/**
 * Prerequisite keys the planner recognizes, mapped to the M5c graph node
 * that removes each one. A key is derived from checked-in data only: a
 * frontmatter feature absent from the basis `supportedFeatures`, an include
 * with no reviewed copy in the basis harness list, a flag the runner
 * withholds execution for, or an unresolved `$262` member read in the
 * parsed source. A key missing from this table stops planning, so a
 * newly exposed prerequisite gets a planned node instead of a silent batch.
 */
export const m5cObservationPrerequisiteNodes: ReadonlyMap<string, string> =
  new Map([
    ["feature:Float32Array", "typed-array-feature-admission"],
    ["feature:Float64Array", "typed-array-feature-admission"],
    ["feature:Int16Array", "typed-array-feature-admission"],
    ["feature:Int32Array", "typed-array-feature-admission"],
    ["feature:Int8Array", "typed-array-feature-admission"],
    ["feature:Promise", "promise-feature-admission"],
    ["feature:Uint16Array", "typed-array-feature-admission"],
    ["feature:Uint32Array", "typed-array-feature-admission"],
    ["feature:Uint8Array", "typed-array-feature-admission"],
    ["feature:Uint8ClampedArray", "typed-array-feature-admission"],
    ["feature:__proto__", "minor-feature-tag-admission"],
    ["feature:arbitrary-module-namespace-names", "module-export-forms"],
    ["feature:caller", "function-caller-restrictions"],
    ["feature:cross-realm", "cross-realm-host"],
    ["feature:dynamic-import", "dynamic-import"],
    ["feature:export-star-as-namespace-from-module", "module-export-forms"],
    ["feature:hashbang", "hashbang-comments"],
    ["feature:import-attributes", "import-attributes"],
    ["feature:import.meta", "import-meta"],
    ["feature:json-modules", "import-attributes"],
    ["feature:json-superset", "minor-feature-tag-admission"],
    ["feature:proxy-missing-checks", "minor-feature-tag-admission"],
    ["feature:super", "frontmatter-feature-tags"],
    ["feature:tail-call-optimization", "proper-tail-calls"],
    ["flag:CanBlockIsFalse", "non-blocking-agent"],
    ["harness:fnGlobalObject.js", "fn-global-object-harness"],
    ["harness:resizableArrayBufferUtils.js", "resizable-array-buffer-harness"],
    ["harness:tcoHelper.js", "proper-tail-calls"],
    ["harness:wellKnownIntrinsicObjects.js", "well-known-intrinsics-harness"],
    ["host:$262.createRealm", "cross-realm-host"],
  ]);

/**
 * Global names whose unresolved reference marks a dynamic source surface.
 * They are recorded, not split out: ADR 0016 decides such a path by its
 * observed diagnostic, so the batch review applies that boundary to the
 * observation rather than predicting it from a reference.
 */
const dynamicSourceNames = ["Function", "eval"] as const;

/**
 * Prerequisite sets with fewer paths than this share one tail batch that
 * waits for all of their nodes. Each batch costs one full regeneration,
 * so a separate batch per small set would spend hours per handful of
 * paths; the tail trades waiting for the slowest prerequisite against
 * that cost.
 */
export const m5cMinimumPrerequisiteBatchPaths = 50;

/**
 * One measured full `test262:update` run. The cost model divides its wall
 * clock by the native variant executions the manifest recorded, because
 * that run regenerates every reviewed path, and one unit of native work is
 * one compiled and executed variant.
 */
export interface M5cRegenerationMeasurement {
  readonly date: string;
  readonly executedVariants: number;
  readonly host: string;
  readonly loadAverage: number;
  readonly reviewedPaths: number;
  readonly wallSeconds: number;
  readonly workers: number;
}

/**
 * The measured run this plan's costs derive from. Neither of the two full
 * runs on 2026-10-06 and 2026-10-07 had the host to itself; this is the
 * slower one, kept as the conservative figure. PLAN-M5C.md records both.
 * A new measurement replaces this record; the plan file then regenerates
 * every estimate.
 */
export const m5cRegenerationMeasurement: M5cRegenerationMeasurement = {
  date: "2026-10-07",
  executedVariants: 72749,
  host: "linux-x86_64-gnu, 16 logical cores",
  loadAverage: 31.9,
  reviewedPaths: 21383,
  wallSeconds: 3997,
  workers: 8,
};

/** Size bounds one reviewer can inspect in a single batch. */
export interface M5cObservationBatchLimits {
  /** Upper bound on selected paths. */
  readonly paths: number;
  /**
   * Upper bound on review units: each handwritten test file counts once,
   * and generated tests count their distinct generator sources (cases and
   * templates) instead of every expanded file.
   */
  readonly reviewUnits: number;
}

/**
 * Limits the checked-in plan uses. At one to two minutes per review unit,
 * 500 units is one reviewer's working day or two; the path bound keeps the
 * subset and manifest diff of one landing reviewable as well.
 */
export const m5cObservationBatchLimits: M5cObservationBatchLimits = {
  paths: 3000,
  reviewUnits: 500,
};

/**
 * Finer and coarser alternatives whose cost the plan records, so the
 * trade between reviewability and regeneration count stays visible.
 */
export const m5cAlternativeBatchLimits: readonly M5cObservationBatchLimits[] = [
  { paths: 2000, reviewUnits: 300 },
  { paths: 4000, reviewUnits: 600 },
  { paths: 8000, reviewUnits: 1200 },
];

/** Metadata-derived facts for one unreviewed path. */
export interface M5cObservationFacts {
  /** Unresolved global names that compile source text at runtime. */
  readonly dynamicSource: readonly string[];
  /**
   * Native variant executions one reviewed observation of this path
   * costs once its prerequisites have landed: two specialization policies
   * per strictness mode, or zero for a parse or resolution negative.
   */
  readonly executableVariants: number;
  readonly features: readonly string[];
  readonly flags: readonly string[];
  /** Generator case and template files, empty for a handwritten test. */
  readonly generatedFrom: readonly string[];
  readonly includes: readonly string[];
  readonly negativePhase: string | undefined;
  readonly path: string;
  /** Sorted prerequisite keys from {@link m5cObservationPrerequisiteNodes}. */
  readonly prerequisites: readonly string[];
}

/**
 * A deterministic path selector. A path's prerequisite set is its sorted
 * prerequisite node IDs joined by `+`, or the empty string when it has
 * none. The path belongs to the batch that lists that set and has the
 * longest prefix the path starts with among the batches listing it.
 */
export interface M5cObservationSelector {
  /** Graph node ID of the batch, `observation-batch-NN`. */
  readonly id: string;
  readonly prefixes: readonly string[];
  /** Listed prerequisite sets; `[""]` selects paths without one. */
  readonly prerequisiteSets: readonly string[];
}

/** Derived metadata the plan records for one batch. */
export interface M5cObservationBatch {
  readonly dynamicSource: ReadonlyMap<string, number>;
  readonly executableVariants: number;
  readonly features: ReadonlyMap<string, number>;
  readonly flags: ReadonlyMap<string, number>;
  readonly generatedPaths: number;
  readonly id: string;
  readonly includes: ReadonlyMap<string, number>;
  readonly negatives: ReadonlyMap<string, number>;
  readonly partitionFiles: number;
  readonly partitionGroups: readonly string[];
  readonly newPartitionFiles: number;
  readonly paths: number;
  readonly prerequisites: ReadonlyMap<string, number>;
  readonly reviewUnits: number;
  readonly selector: M5cObservationSelector;
}

/** Cost summary of one partition of the unreviewed paths. */
export interface M5cObservationCost {
  readonly batches: number;
  readonly largestPaths: number;
  readonly largestReviewUnits: number;
  readonly limits: M5cObservationBatchLimits;
  /**
   * What every landing would cost if each used the complete
   * `test262:update` and then the complete `test:test262` gate: two runs
   * over the whole corpus as it stands when the batch lands, in plan order.
   */
  readonly fullUpdateScheduleSeconds: number;
  /**
   * Landing cost with the scoped `test262:update:changed`, which an
   * observation batch qualifies for because it only adds subset entries:
   * the batch's own variants plus the complete `test:test262` gate, which
   * still runs the whole corpus at every landing.
   */
  readonly scheduleSeconds: number;
}

/** A complete derived plan. */
export interface M5cObservationPlan {
  readonly alternatives: readonly M5cObservationCost[];
  readonly basis: M5cObservationBasis;
  readonly batches: readonly M5cObservationBatch[];
  readonly cost: M5cObservationCost;
  readonly currentExecutedVariants: number;
  readonly finalExecutedVariants: number;
  readonly suiteRevision: string;
  readonly unreviewedPaths: number;
}

/**
 * The review state a plan was derived against. Prerequisite keys, and
 * therefore batch membership, are computed from this snapshot rather than
 * from the live subset, so a prerequisite node that admits a feature or a
 * harness does not move or orphan the paths of the batches waiting on it.
 * Only `m5c:observation-batches:plan` takes a new snapshot.
 */
export interface M5cObservationBasis {
  readonly reviewedHarnesses: readonly string[];
  readonly supportedFeatures: readonly string[];
}

/** Inputs every derivation reads. */
export interface M5cObservationInputs {
  readonly basis: M5cObservationBasis;
  readonly existingPartitions: ReadonlySet<string>;
  /** Native variant executions the current reviewed manifest records. */
  readonly executedVariants: number;
  readonly facts: readonly M5cObservationFacts[];
  readonly suiteRevision: string;
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

function sortedUnique(values: Iterable<string>): readonly string[] {
  return [...new Set(values)].toSorted(compareCodeUnits);
}

/**
 * Derive one unreviewed path's facts from its upstream source and the
 * checked-in review state. Nothing here reads the directory name: the
 * frontmatter, the generator header, and the parsed syntax decide.
 */
export function deriveM5cObservationFacts(
  path: string,
  source: string,
  suiteRevision: string,
  supportedFeatures: ReadonlySet<string>,
  reviewedHarnesses: ReadonlySet<string>,
): M5cObservationFacts {
  const parsed = parseTest262Case(source, path, suiteRevision);
  const testCase = parsed.case;
  const references = unresolvedReferenceNames(source, testCase.mode);
  const prerequisites: string[] = [];
  for (const feature of testCase.features) {
    if (!supportedFeatures.has(feature)) {
      prerequisites.push(`feature:${feature}`);
    }
  }
  if (parsed.flags.includes("CanBlockIsFalse")) {
    prerequisites.push("flag:CanBlockIsFalse");
  }
  if (!parsed.flags.includes("raw")) {
    for (const include of testCase.includes) {
      if (!reviewedHarnesses.has(include)) {
        prerequisites.push(`harness:${include}`);
      }
    }
  }
  if (references.has("$262")) {
    const members = sortedUnique(
      [...source.matchAll(/\$262\s*\.\s*([A-Za-z_$][\w$]*)/gu)]
        .map((match) => match[1] ?? "")
        .filter((member) => member !== "" && member !== "agent"),
    );
    if (members.length === 0) prerequisites.push("host:$262");
    for (const member of members) prerequisites.push(`host:$262.${member}`);
  }
  const header = source.split("/*---")[0] ?? "";
  const generatedFrom = sortedUnique(
    [...header.matchAll(/^\/\/ - (src\/\S+)$/gmu)].map(
      (match) => match[1] ?? "",
    ),
  );
  const negativePhase = testCase.expectedFailurePhase;
  // A batch runs only after its prerequisite nodes land, so its paths are
  // costed as executing; only a parse or resolution negative stops before
  // native code whatever the profile admits.
  const decidedBeforeNative =
    negativePhase === "parse" || negativePhase === "resolution";
  return {
    dynamicSource: dynamicSourceNames.filter((name) => references.has(name)),
    executableVariants: decidedBeforeNative
      ? 0
      : testCase.strictness.length * 2,
    features: testCase.features,
    flags: parsed.flags,
    generatedFrom,
    includes: testCase.includes,
    negativePhase,
    path,
    prerequisites: sortedUnique(prerequisites),
  };
}

/** The graph nodes that must land before a path can be observed. */
export function m5cPrerequisiteNodes(
  facts: M5cObservationFacts,
): readonly string[] {
  return sortedUnique(
    facts.prerequisites.map((key) => {
      const node = m5cObservationPrerequisiteNodes.get(key);
      if (node == null) {
        throw new Error(
          `${facts.path} needs prerequisite ${key}, which has no planned ` +
            "M5c node; add one before partitioning.",
        );
      }
      return node;
    }),
  );
}

function prerequisiteSet(facts: M5cObservationFacts): string {
  return m5cPrerequisiteNodes(facts).join("+");
}

/** Every node a batch must wait for: the union of its listed sets. */
export function m5cSelectorPrerequisites(
  selector: M5cObservationSelector,
): readonly string[] {
  return sortedUnique(
    selector.prerequisiteSets.flatMap((set) =>
      set === "" ? [] : set.split("+"),
    ),
  );
}

function reviewUnits(facts: readonly M5cObservationFacts[]): number {
  const units = new Set<string>();
  for (const entry of facts) {
    if (entry.generatedFrom.length === 0) {
      units.add(entry.path);
    } else {
      for (const source of entry.generatedFrom) units.add(source);
    }
  }
  return units.size;
}

function fits(
  facts: readonly M5cObservationFacts[],
  limits: M5cObservationBatchLimits,
): boolean {
  return (
    facts.length <= limits.paths && reviewUnits(facts) <= limits.reviewUnits
  );
}

/**
 * Split paths that share `prefix` at their next separator. Paths are in
 * code-unit order, so each child is one contiguous run, and no child
 * prefix is a prefix of a sibling because a separator never occurs inside
 * a token. A path with no further separator is its own exact selector.
 */
function childGroups(
  prefix: string,
  facts: readonly M5cObservationFacts[],
): readonly {
  readonly facts: readonly M5cObservationFacts[];
  readonly prefix: string;
}[] {
  const groups: {
    readonly facts: M5cObservationFacts[];
    readonly prefix: string;
  }[] = [];
  for (const entry of facts) {
    const rest = entry.path.slice(prefix.length);
    const separator = rest.search(/[-./_]/u);
    const childPrefix =
      separator < 0 || separator === rest.length - 1
        ? entry.path
        : prefix + rest.slice(0, separator + 1);
    const last = groups.at(-1);
    if (last?.prefix === childPrefix) {
      last.facts.push(entry);
    } else {
      groups.push({ facts: [entry], prefix: childPrefix });
    }
  }
  return groups;
}

interface PlannedChunk {
  readonly facts: readonly M5cObservationFacts[];
  readonly prefixes: readonly string[];
}

/**
 * Plan one class. A prefix whose paths fit stays whole; otherwise its
 * children are planned separately and adjacent results are packed back
 * together while they fit, so locality decides every boundary and the
 * number of batches stays near the minimum the limits allow.
 */
function planPrefix(
  prefix: string,
  facts: readonly M5cObservationFacts[],
  limits: M5cObservationBatchLimits,
): readonly PlannedChunk[] {
  const children = childGroups(prefix, facts);
  const only = children.length === 1 ? children[0] : undefined;
  if (only != null && only.prefix !== prefix && only.facts.length > 1) {
    return planPrefix(only.prefix, only.facts, limits);
  }
  if (fits(facts, limits)) return [{ facts, prefixes: [prefix] }];
  const packed: PlannedChunk[] = [];
  for (const child of children) {
    for (const chunk of planPrefix(child.prefix, child.facts, limits)) {
      const last = packed.at(-1);
      const merged = last == null ? undefined : [...last.facts, ...chunk.facts];
      if (last != null && merged != null && fits(merged, limits)) {
        packed[packed.length - 1] = {
          facts: merged,
          prefixes: [...last.prefixes, ...chunk.prefixes],
        };
      } else {
        packed.push(chunk);
      }
    }
  }
  return packed;
}

/**
 * Partition the unreviewed paths into selectors. The result depends only
 * on the facts, limits, and minimum: paths without prerequisites come
 * first, then each prerequisite set with at least the minimum number of
 * paths in code-unit order, then one shared tail for every smaller set.
 */
export function planM5cObservationSelectors(
  facts: readonly M5cObservationFacts[],
  limits: M5cObservationBatchLimits,
  minimumPrerequisitePaths: number = m5cMinimumPrerequisiteBatchPaths,
): readonly M5cObservationSelector[] {
  const sets = new Map<string, M5cObservationFacts[]>();
  for (const entry of [...facts].toSorted((left, right) =>
    compareCodeUnits(left.path, right.path),
  )) {
    const set = prerequisiteSet(entry);
    const members = sets.get(set) ?? [];
    members.push(entry);
    sets.set(set, members);
  }
  const groups: (readonly M5cObservationFacts[])[] = [];
  const tail: M5cObservationFacts[] = [];
  for (const set of [...sets.keys()].toSorted(compareCodeUnits)) {
    const members = sets.get(set) ?? [];
    if (set !== "" && members.length < minimumPrerequisitePaths) {
      tail.push(...members);
    } else {
      groups.push(members);
    }
  }
  if (tail.length > 0) {
    groups.push(
      tail.toSorted((left, right) => compareCodeUnits(left.path, right.path)),
    );
  }
  const selectors: M5cObservationSelector[] = [];
  for (const members of groups) {
    for (const chunk of planPrefix(pathRoot, members, limits)) {
      selectors.push({
        id: m5cObservationBatchId(selectors.length),
        prefixes: chunk.prefixes,
        prerequisiteSets: sortedUnique(chunk.facts.map(prerequisiteSet)),
      });
    }
  }
  return selectors;
}

const batchIdPattern = /^observation-batch-\d{2,}$/u;

/**
 * Assign every path to exactly one selector, rejecting a path that no
 * selector selects, a set and prefix that two selectors share, and a
 * prefix or listed set that selects nothing.
 */
export function assignM5cObservationBatches(
  selectors: readonly M5cObservationSelector[],
  facts: readonly M5cObservationFacts[],
): readonly (readonly M5cObservationFacts[])[] {
  const bySet = new Map<string, { index: number; prefix: string }[]>();
  const ids = new Set<string>();
  for (const [index, selector] of selectors.entries()) {
    const context = `Observation batch ${selector.id}`;
    if (!batchIdPattern.test(selector.id) || ids.has(selector.id)) {
      throw new Error(`${context} needs a unique observation-batch-NN ID.`);
    }
    ids.add(selector.id);
    if (selector.prefixes.length === 0) {
      throw new Error(`${context} has no prefixes.`);
    }
    if (selector.prerequisiteSets.length === 0) {
      throw new Error(`${context} lists no prerequisite set.`);
    }
    for (const set of selector.prerequisiteSets) {
      const entries = bySet.get(set) ?? [];
      for (const prefix of selector.prefixes) {
        if (!prefix.startsWith(pathRoot)) {
          throw new Error(
            `${context} prefix ${prefix} is outside ${pathRoot}.`,
          );
        }
        if (entries.some((entry) => entry.prefix === prefix)) {
          throw new Error(
            `Observation batch prefix ${prefix} repeats for prerequisite ` +
              `set "${set}".`,
          );
        }
        entries.push({ index, prefix });
      }
      bySet.set(set, entries);
    }
  }
  const assigned: M5cObservationFacts[][] = selectors.map(() => []);
  const usedPrefixes = new Set<string>();
  const usedSets = new Set<string>();
  for (const entry of facts) {
    const set = prerequisiteSet(entry);
    let best: { index: number; prefix: string } | undefined;
    for (const candidate of bySet.get(set) ?? []) {
      if (
        entry.path.startsWith(candidate.prefix) &&
        (best == null || candidate.prefix.length > best.prefix.length)
      ) {
        best = candidate;
      }
    }
    if (best == null) {
      throw new Error(
        `No observation batch selects unreviewed path ${entry.path} ` +
          `(prerequisite set "${set}").`,
      );
    }
    usedPrefixes.add(`${best.index}\0${best.prefix}`);
    usedSets.add(`${best.index}\0${set}`);
    assigned[best.index]?.push(entry);
  }
  for (const [index, selector] of selectors.entries()) {
    for (const prefix of selector.prefixes) {
      if (!usedPrefixes.has(`${index}\0${prefix}`)) {
        throw new Error(
          `Observation batch ${selector.id} prefix ${prefix} selects no ` +
            "unreviewed path.",
        );
      }
    }
    for (const set of selector.prerequisiteSets) {
      if (!usedSets.has(`${index}\0${set}`)) {
        throw new Error(
          `Observation batch ${selector.id} prerequisite set "${set}" ` +
            "selects no unreviewed path.",
        );
      }
    }
  }
  return assigned;
}

/**
 * Drop the prefixes, listed sets, and whole batches that no longer select
 * an unreviewed path, as after a batch lands. Every surviving path keeps
 * its batch, because removing an unused prefix or set cannot change the
 * longest match of a path it never selected.
 */
export function pruneM5cObservationSelectors(
  selectors: readonly M5cObservationSelector[],
  facts: readonly M5cObservationFacts[],
): readonly M5cObservationSelector[] {
  const usedPrefixes = new Set<string>();
  const usedSets = new Set<string>();
  for (const entry of facts) {
    const set = prerequisiteSet(entry);
    let best: { id: string; prefix: string } | undefined;
    for (const selector of selectors) {
      if (!selector.prerequisiteSets.includes(set)) continue;
      for (const prefix of selector.prefixes) {
        if (
          entry.path.startsWith(prefix) &&
          (best == null || prefix.length > best.prefix.length)
        ) {
          best = { id: selector.id, prefix };
        }
      }
    }
    if (best == null) continue;
    usedPrefixes.add(`${best.id}\0${best.prefix}`);
    usedSets.add(`${best.id}\0${set}`);
  }
  return selectors.flatMap((selector) => {
    const prefixes = selector.prefixes.filter((prefix) =>
      usedPrefixes.has(`${selector.id}\0${prefix}`),
    );
    const prerequisiteSets = selector.prerequisiteSets.filter((set) =>
      usedSets.has(`${selector.id}\0${set}`),
    );
    return prefixes.length === 0
      ? []
      : [{ id: selector.id, prefixes, prerequisiteSets }];
  });
}

function counts(values: Iterable<string>): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return new Map(
    [...result].toSorted(([left], [right]) => compareCodeUnits(left, right)),
  );
}

/** Graph node ID of the batch at a zero-based plan position. */
export function m5cObservationBatchId(index: number): string {
  return `observation-batch-${String(index + 1).padStart(2, "0")}`;
}

function describeBatch(
  selector: M5cObservationSelector,
  facts: readonly M5cObservationFacts[],
  existingPartitions: ReadonlySet<string>,
): M5cObservationBatch {
  const partitions = new Set(
    facts.map(
      (entry) =>
        `${test262Group(entry.path)}/${test262PartitionKey(entry.path)}`,
    ),
  );
  return {
    dynamicSource: counts(facts.flatMap((entry) => entry.dynamicSource)),
    executableVariants: facts.reduce(
      (sum, entry) => sum + entry.executableVariants,
      0,
    ),
    features: counts(facts.flatMap((entry) => entry.features)),
    flags: counts(facts.flatMap((entry) => entry.flags)),
    generatedPaths: facts.filter((entry) => entry.generatedFrom.length > 0)
      .length,
    id: selector.id,
    includes: counts(facts.flatMap((entry) => entry.includes)),
    negatives: counts(
      facts.flatMap((entry) =>
        entry.negativePhase == null ? [] : [entry.negativePhase],
      ),
    ),
    newPartitionFiles: [...partitions].filter(
      (partition) => !existingPartitions.has(partition),
    ).length,
    partitionFiles: partitions.size,
    partitionGroups: sortedUnique(
      facts.map((entry) => test262Group(entry.path)),
    ),
    paths: facts.length,
    prerequisites: counts(facts.flatMap((entry) => entry.prerequisites)),
    reviewUnits: reviewUnits(facts),
    selector,
  };
}

/** Seconds of one native variant execution in the measured run. */
export function m5cSecondsPerVariant(
  measurement: M5cRegenerationMeasurement,
): number {
  if (measurement.executedVariants <= 0) return 0;
  return measurement.wallSeconds / measurement.executedVariants;
}

function costOf(
  batches: readonly {
    readonly executableVariants: number;
    readonly paths: number;
    readonly reviewUnits: number;
  }[],
  limits: M5cObservationBatchLimits,
  currentVariants: number,
  measurement: M5cRegenerationMeasurement,
): M5cObservationCost {
  const perVariant = m5cSecondsPerVariant(measurement);
  let variants = currentVariants;
  let schedule = 0;
  let fullUpdateSchedule = 0;
  for (const batch of batches) {
    variants += batch.executableVariants;
    schedule += (batch.executableVariants + variants) * perVariant;
    fullUpdateSchedule += 2 * variants * perVariant;
  }
  return {
    batches: batches.length,
    fullUpdateScheduleSeconds: Math.round(fullUpdateSchedule),
    largestPaths: Math.max(0, ...batches.map((batch) => batch.paths)),
    largestReviewUnits: Math.max(
      0,
      ...batches.map((batch) => batch.reviewUnits),
    ),
    limits,
    scheduleSeconds: Math.round(schedule),
  };
}

/**
 * Derive the plan for fixed selectors, recomputing every count and cost.
 * The alternatives are re-partitioned from scratch with coarser limits so
 * the recorded comparison always describes the same unreviewed set.
 */
export function deriveM5cObservationPlan(
  selectors: readonly M5cObservationSelector[],
  inputs: M5cObservationInputs,
  measurement: M5cRegenerationMeasurement = m5cRegenerationMeasurement,
): M5cObservationPlan {
  const assigned = assignM5cObservationBatches(selectors, inputs.facts);
  const batches = selectors.map((selector, index) =>
    describeBatch(selector, assigned[index] ?? [], inputs.existingPartitions),
  );
  const alternatives = m5cAlternativeBatchLimits.map((limits) => {
    const alternative = planM5cObservationSelectors(inputs.facts, limits);
    const groups = assignM5cObservationBatches(alternative, inputs.facts);
    return costOf(
      groups.map((facts) => ({
        executableVariants: facts.reduce(
          (sum, entry) => sum + entry.executableVariants,
          0,
        ),
        paths: facts.length,
        reviewUnits: reviewUnits(facts),
      })),
      limits,
      inputs.executedVariants,
      measurement,
    );
  });
  return {
    alternatives,
    basis: inputs.basis,
    batches,
    cost: costOf(
      batches,
      m5cObservationBatchLimits,
      inputs.executedVariants,
      measurement,
    ),
    currentExecutedVariants: inputs.executedVariants,
    finalExecutedVariants:
      inputs.executedVariants +
      batches.reduce((sum, batch) => sum + batch.executableVariants, 0),
    suiteRevision: inputs.suiteRevision,
    unreviewedPaths: inputs.facts.length,
  };
}

function mapRecord(
  values: ReadonlyMap<string, number>,
): Readonly<Record<string, number>> {
  return Object.fromEntries(values);
}

function costRecord(cost: M5cObservationCost): StructuredDataRecord {
  return {
    batches: cost.batches,
    largestPaths: cost.largestPaths,
    largestReviewUnits: cost.largestReviewUnits,
    limits: { paths: cost.limits.paths, reviewUnits: cost.limits.reviewUnits },
    scheduleHours: Math.round(cost.scheduleSeconds / 36) / 100,
    fullUpdateScheduleHours:
      Math.round(cost.fullUpdateScheduleSeconds / 36) / 100,
  };
}

const fileHeader = [
  "# Derived M5c observation batch plan. Regenerate counts with",
  "# `mise run m5c:observation-batches:update`; PLAN-M5C.md defines the",
  "# selectors, prerequisite keys, review units, and the cost model.",
  "# Selectors change only through `mise run m5c:observation-batches:plan`.",
];

/** Serialize a plan in its canonical layout. */
export function serializeM5cObservationPlan(
  plan: M5cObservationPlan,
  measurement: M5cRegenerationMeasurement = m5cRegenerationMeasurement,
): string {
  const perVariant = m5cSecondsPerVariant(measurement);
  // The whole corpus as it stands when each batch lands, in plan order.
  const landingVariants: number[] = [];
  let variants = plan.currentExecutedVariants;
  for (const batch of plan.batches) {
    variants += batch.executableVariants;
    landingVariants.push(variants);
  }
  const document = {
    version: planVersion,
    suiteRevision: plan.suiteRevision,
    unreviewedPaths: plan.unreviewedPaths,
    basis: {
      supportedFeatures: [...plan.basis.supportedFeatures],
      reviewedHarnesses: [...plan.basis.reviewedHarnesses],
    },
    regeneration: {
      measurement: {
        date: measurement.date,
        executedVariants: measurement.executedVariants,
        host: measurement.host,
        loadAverage: measurement.loadAverage,
        reviewedPaths: measurement.reviewedPaths,
        wallSeconds: measurement.wallSeconds,
        workers: measurement.workers,
      },
      secondsPerVariant: Math.round(perVariant * 10000) / 10000,
      currentExecutedVariants: plan.currentExecutedVariants,
      currentSeconds: Math.round(plan.currentExecutedVariants * perVariant),
      finalExecutedVariants: plan.finalExecutedVariants,
      finalSeconds: Math.round(plan.finalExecutedVariants * perVariant),
      plan: costRecord(plan.cost),
      alternatives: plan.alternatives.map(costRecord),
    },
    batches: plan.batches.map((batch, index) => ({
      id: batch.id,
      selector: {
        prerequisiteSets: [...batch.selector.prerequisiteSets],
        prefixes: [...batch.selector.prefixes],
      },
      dependsOn: [
        m5cUnreviewedDefaultNode,
        ...m5cSelectorPrerequisites(batch.selector),
      ],
      paths: batch.paths,
      reviewUnits: batch.reviewUnits,
      generatedPaths: batch.generatedPaths,
      prerequisites: mapRecord(batch.prerequisites),
      dynamicSource: mapRecord(batch.dynamicSource),
      flags: mapRecord(batch.flags),
      includes: mapRecord(batch.includes),
      features: mapRecord(batch.features),
      negatives: mapRecord(batch.negatives),
      partitions: {
        groups: [...batch.partitionGroups],
        files: batch.partitionFiles,
        newFiles: batch.newPartitionFiles,
      },
      regeneration: {
        executableVariants: batch.executableVariants,
        scopedUpdateSeconds: Math.round(batch.executableVariants * perVariant),
        fullCorpusSeconds: Math.round(
          (landingVariants[index] ?? 0) * perVariant,
        ),
      },
    })),
  };
  return `${fileHeader.join("\n")}\n${stringifyYaml(document, {
    lineWidth: 0,
  })}`;
}

function stringList(value: StructuredDataInput, context: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${context} must be an array.`);
  return value.map((entry, index) => {
    if (!isString(entry)) {
      throw new Error(`${context} entry ${index} must be a string.`);
    }
    return entry;
  });
}

/** Selectors and planning basis recorded in a plan file. */
export interface M5cObservationPlanFile {
  readonly basis: M5cObservationBasis;
  readonly selectors: readonly M5cObservationSelector[];
}

function sortedList(value: StructuredDataInput, context: string): string[] {
  const values = stringList(value, context);
  if (values.some((entry, index) => entry !== sortedUnique(values)[index])) {
    throw new Error(`${context} must be sorted and unique.`);
  }
  return values;
}

/** Read the selectors, IDs, and planning basis recorded in a plan file. */
export function parseM5cObservationPlanFile(
  text: string,
): M5cObservationPlanFile {
  // SAFETY: record validates the parsed YAML tree at this boundary.
  const root = record(parseYaml(text) as StructuredDataInput, "plan");
  if (root.version !== planVersion) {
    throw new Error(`Observation batch plan version must be ${planVersion}.`);
  }
  if (!Array.isArray(root.batches)) {
    throw new Error("Observation batch plan needs a batches array.");
  }
  const basis = record(root.basis, "Observation batch plan basis");
  const selectors = root.batches.map((value, index) => {
    const context = `Observation batch ${index + 1}`;
    const batch = record(value, context);
    if (!isString(batch.id)) throw new Error(`${context} needs an ID.`);
    const selector = record(batch.selector, `${context} selector`);
    return {
      id: batch.id,
      prefixes: stringList(selector.prefixes, `${context} prefixes`),
      prerequisiteSets: stringList(
        selector.prerequisiteSets,
        `${context} prerequisite sets`,
      ),
    };
  });
  return {
    basis: {
      reviewedHarnesses: sortedList(
        basis.reviewedHarnesses,
        "Observation batch plan reviewed harnesses",
      ),
      supportedFeatures: sortedList(
        basis.supportedFeatures,
        "Observation batch plan supported features",
      ),
    },
    selectors,
  };
}

/** Count the native variant executions a reviewed manifest records. */
export function countExecutedVariants(
  results: readonly {
    readonly execution?: { readonly variants: readonly unknown[] };
  }[],
): number {
  return results.reduce(
    (sum, result) => sum + (result.execution?.variants.length ?? 0),
    0,
  );
}

/** Snapshot the checkout's reviewed features and harness files. */
export function readCurrentM5cObservationBasis(): M5cObservationBasis {
  const subset = parseReviewedSubset(
    readFileSync(join(repositoryRoot, subsetPath), "utf8"),
  );
  return {
    reviewedHarnesses: sortedUnique(
      readdirSync(join(repositoryRoot, reviewedHarnessDirectory)),
    ),
    supportedFeatures: sortedUnique(subset.supportedFeatures),
  };
}

/**
 * Read the unreviewed paths from the checkout and derive their facts
 * against `basis`, the snapshot a plan records.
 */
export function readCurrentM5cObservationInputs(
  basis: M5cObservationBasis,
): M5cObservationInputs {
  const manifest = readCurrentM5cManifest();
  const inventory = parseM5cInventory(
    readFileSync(join(repositoryRoot, m5cInventoryPath), "utf8"),
  );
  const subset = parseReviewedSubset(
    readFileSync(join(repositoryRoot, subsetPath), "utf8"),
  );
  if (
    subset.suiteRevision !== inventory.suiteRevision ||
    manifest.suiteRevision !== inventory.suiteRevision
  ) {
    throw new Error(
      "test262 subset, manifest, and inventory revisions differ.",
    );
  }
  const reviewed = new Set(manifest.results.map((result) => result.case.path));
  const supportedFeatures = new Set(basis.supportedFeatures);
  const reviewedHarnesses = new Set(basis.reviewedHarnesses);
  const suiteRoot = dirname(
    fileURLToPath(import.meta.resolve("test262/package.json")),
  );
  const facts = inventory.includedPaths
    .filter((path) => !reviewed.has(path))
    .toSorted(compareCodeUnits)
    .map((path) =>
      deriveM5cObservationFacts(
        path,
        readFileSync(join(suiteRoot, path), "utf8"),
        inventory.suiteRevision,
        supportedFeatures,
        reviewedHarnesses,
      ),
    );
  // SAFETY: record validates the parsed index tree at this boundary.
  const index = record(
    parseYaml(
      readFileSync(join(repositoryRoot, resultsIndexPath), "utf8"),
    ) as StructuredDataInput,
    "test262 results index",
  );
  const partitions = Array.isArray(index.partitions) ? index.partitions : [];
  const existingPartitions = new Set(
    partitions.map((value, position) => {
      const partition = record(value, `test262 partition ${position}`);
      if (!isString(partition.group) || !isString(partition.key)) {
        throw new Error(`test262 partition ${position} is malformed.`);
      }
      return `${partition.group}/${partition.key}`;
    }),
  );
  return {
    basis,
    executedVariants: countExecutedVariants(manifest.results),
    existingPartitions,
    facts,
    suiteRevision: inventory.suiteRevision,
  };
}

function readNodeDependencies(id: string): readonly string[] | undefined {
  let text: string;
  try {
    text = readFileSync(
      join(repositoryRoot, m5cWorkGraphNodeDirectory, `${id}.yaml`),
      "utf8",
    );
  } catch {
    return undefined;
  }
  // SAFETY: record validates the parsed node tree at this boundary.
  const node = record(parseYaml(text) as StructuredDataInput, id);
  return stringList(node.dependencies, `${id} dependencies`);
}

/**
 * Require every batch to be a graph node that depends on this planning
 * node and on each prerequisite node its selector names, and require the
 * ledger to give each unreviewed path its batch as owner.
 */
export function validateM5cObservationOwnership(
  plan: M5cObservationPlan,
  assigned: readonly (readonly M5cObservationFacts[])[],
  ledger: M5cClosureLedger,
  dependenciesOf: (id: string) => readonly string[] | undefined,
): void {
  const expectedOwner = new Map<string, string>();
  for (const [index, batch] of plan.batches.entries()) {
    const dependencies = dependenciesOf(batch.id);
    if (dependencies == null) {
      throw new Error(`Observation batch ${batch.id} has no graph node.`);
    }
    for (const required of [
      m5cUnreviewedDefaultNode,
      ...m5cSelectorPrerequisites(batch.selector),
    ]) {
      if (!dependencies.includes(required)) {
        throw new Error(
          `Observation batch node ${batch.id} must depend on ${required}.`,
        );
      }
      if (dependenciesOf(required) == null) {
        throw new Error(
          `Observation batch ${batch.id} names missing node ${required}.`,
        );
      }
    }
    for (const entry of assigned[index] ?? []) {
      expectedOwner.set(entry.path, `node:${batch.id}`);
    }
  }
  for (const entry of ledger.entries) {
    const owner = expectedOwner.get(entry.path);
    if (entry.state === "unreviewed") {
      if (owner == null) {
        throw new Error(
          `Unreviewed ledger path ${entry.path} is outside every ` +
            "observation batch.",
        );
      }
      if (entry.owner !== owner) {
        throw new Error(
          `Ledger owner of ${entry.path} is ${entry.owner}, but its ` +
            `observation batch is ${owner}.`,
        );
      }
      expectedOwner.delete(entry.path);
    } else if (owner != null) {
      throw new Error(`Observation batch selects reviewed path ${entry.path}.`);
    }
  }
  const invented = [...expectedOwner.keys()];
  if (invented.length > 0) {
    throw new Error(
      `Observation batches select ${invented.length} paths outside the ` +
        `ledger, first ${invented[0]}.`,
    );
  }
}

/** Give each unreviewed ledger path its batch as owner, with a note. */
export function assignM5cObservationOwners(
  ledger: M5cClosureLedger,
  plan: M5cObservationPlan,
  assigned: readonly (readonly M5cObservationFacts[])[],
): M5cClosureLedger {
  const owners = new Map<string, string>();
  const notes = new Map(ledger.ownerNotes);
  for (const [index, batch] of plan.batches.entries()) {
    const owner = `node:${batch.id}`;
    for (const entry of assigned[index] ?? []) owners.set(entry.path, owner);
    notes.set(
      owner,
      `Unreviewed paths that ${m5cObservationBatchesPath} selects for ` +
        `${batch.id}. The batch observes them; no classification is ` +
        "assumed before it does.",
    );
  }
  const entries = ledger.entries.map((entry) => {
    const owner = owners.get(entry.path);
    return entry.state === "unreviewed" && owner != null
      ? { ...entry, owner }
      : entry;
  });
  const used = new Set(entries.map((entry) => entry.owner));
  return {
    ...ledger,
    entries,
    ownerNotes: new Map(
      [...notes]
        .filter(([owner]) => used.has(owner))
        .toSorted(([left], [right]) => compareCodeUnits(left, right)),
    ),
  };
}

/** A derived plan with the paths each of its batches selects. */
interface AssignedObservationPlan {
  readonly assigned: readonly (readonly M5cObservationFacts[])[];
  readonly plan: M5cObservationPlan;
}

function currentPlan(
  selectors: readonly M5cObservationSelector[],
  inputs: M5cObservationInputs,
): AssignedObservationPlan {
  return {
    assigned: assignM5cObservationBatches(selectors, inputs.facts),
    plan: deriveM5cObservationPlan(selectors, inputs),
  };
}

function readLedger(): M5cClosureLedger {
  return parseM5cClosureLedger(
    readFileSync(join(repositoryRoot, m5cClosureLedgerPath), "utf8"),
  ).ledger;
}

/** Validate the checked-in plan, graph nodes, and ledger owners. */
export function validateCurrentM5cObservationPlan(): M5cObservationPlan {
  const absolute = join(repositoryRoot, m5cObservationBatchesPath);
  const text = readFileSync(absolute, "utf8");
  const recorded = parseM5cObservationPlanFile(text);
  const { assigned, plan } = currentPlan(
    recorded.selectors,
    readCurrentM5cObservationInputs(recorded.basis),
  );
  if (serializeM5cObservationPlan(plan) !== text) {
    throw new Error(
      `${m5cObservationBatchesPath} is stale or not canonical; run ` +
        "`mise run m5c:observation-batches:update`.",
    );
  }
  validateM5cObservationOwnership(
    plan,
    assigned,
    readLedger(),
    readNodeDependencies,
  );
  return plan;
}

/**
 * Write the plan for `selectors` and move unreviewed ledger owners to
 * their batches. The ledger keeps every state and prerequisite; only
 * owners and owner notes of unreviewed paths change.
 */
function writeCurrentPlan(
  selectors: readonly M5cObservationSelector[],
  inputs: M5cObservationInputs,
): M5cObservationPlan {
  const { assigned, plan } = currentPlan(selectors, inputs);
  writeFileSync(
    join(repositoryRoot, m5cObservationBatchesPath),
    serializeM5cObservationPlan(plan),
  );
  writeFileSync(
    join(repositoryRoot, m5cClosureLedgerPath),
    serializeM5cClosureLedger(
      assignM5cObservationOwners(readLedger(), plan, assigned),
    ),
  );
  return plan;
}

function hours(seconds: number): string {
  return (seconds / 3600).toFixed(1);
}

function describe(plan: M5cObservationPlan): string {
  return (
    `batches=${plan.batches.length} unreviewed=${plan.unreviewedPaths} ` +
    `largestPaths=${plan.cost.largestPaths} ` +
    `largestReviewUnits=${plan.cost.largestReviewUnits} ` +
    `scheduleHours=${hours(plan.cost.scheduleSeconds)} ` +
    `alternatives=${plan.alternatives
      .map((cost) => `${cost.batches}:${hours(cost.scheduleSeconds)}h`)
      .join(",")}`
  );
}

const entry = process.argv[1];
if (entry != null && resolve(entry) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--plan")) {
    const inputs = readCurrentM5cObservationInputs(
      readCurrentM5cObservationBasis(),
    );
    const plan = writeCurrentPlan(
      planM5cObservationSelectors(inputs.facts, m5cObservationBatchLimits),
      inputs,
    );
    console.log(`m5c-observation-batches planned ${describe(plan)}`);
  } else if (process.argv.includes("--update")) {
    const recorded = parseM5cObservationPlanFile(
      readFileSync(join(repositoryRoot, m5cObservationBatchesPath), "utf8"),
    );
    const inputs = readCurrentM5cObservationInputs(recorded.basis);
    const plan = writeCurrentPlan(
      pruneM5cObservationSelectors(recorded.selectors, inputs.facts),
      inputs,
    );
    console.log(`m5c-observation-batches updated ${describe(plan)}`);
  } else {
    const plan = validateCurrentM5cObservationPlan();
    console.log(`m5c-observation-batches passed ${describe(plan)}`);
  }
}
