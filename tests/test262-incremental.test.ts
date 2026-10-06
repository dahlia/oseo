import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import process from "node:process";
import { dirname, join } from "node:path";
import test from "node:test";

import type { CliResult } from "../packages/cli/src/index.ts";
import { summarizeTest262 } from "../packages/testkit/src/index.ts";
import type { Test262Result } from "../packages/testkit/src/index.ts";
import {
  collectReviewedPartitionRecords,
  mergeReviewedResults,
  rejectScopedUpdateDifferences,
  requireCanonicalManifest,
  selectChangedReviewedPaths,
} from "../tools/test262-incremental.ts";
import {
  parseReviewedManifest,
  parseReviewedPartition,
  serializeTest262Manifest,
  test262ManifestDigest,
} from "../tools/test262-manifest.ts";
import type {
  ReviewedTest262Manifest,
  SerializedTest262Manifest,
} from "../tools/test262-manifest.ts";
import {
  changedPathsSince,
  createReviewedManifest,
  mergeScopedManifest,
  parseTest262Arguments,
  readSerializedManifestPartitions,
} from "../tools/test262.ts";
import type {
  ReviewedTest262Entry,
  ReviewedTest262Subset,
  Test262Executor,
} from "../tools/test262.ts";

const revision = "f2d1435644797268dca1f7988cad5a4e89ccd8d2";
const negativeSource =
  "/*---\nnegative:\n  phase: parse\n  type: SyntaxError\n---*/\nvar;\n";
const harnesses = {
  base: "function assert() {}",
  done: "function $DONE() {}",
  includes: new Map([["propertyHelper.js", "function verifyProperty() {}"]]),
};

function partitionKey(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 2);
}

/**
 * Deterministic upstream paths that exercise every partition shape the
 * scoped update must reproduce: two paths sharing one hash bucket (a kept
 * record beside a replaced one), a path alone in its bucket, and a path in
 * a group no other path uses.
 */
interface SamplePaths {
  readonly colliding: readonly [string, string];
  readonly lone: string;
  readonly otherGroup: string;
}

function samplePaths(): SamplePaths {
  const seen = new Map<string, string>();
  for (let index = 0; ; index += 1) {
    const path = `test/built-ins/Array/case-${index}.js`;
    const key = partitionKey(path);
    const previous = seen.get(key);
    if (previous != null) {
      let lone = "";
      for (let candidate = index + 1; ; candidate += 1) {
        lone = `test/built-ins/Array/case-${candidate}.js`;
        if (![...seen.keys()].includes(partitionKey(lone))) break;
      }
      return {
        colliding: [previous, path],
        lone,
        otherGroup: "test/language/statements/case-0.js",
      };
    }
    seen.set(key, path);
  }
}

const sample = samplePaths();
/** Sorted reviewed paths; the subset and the manifest both sort by path. */
const allPaths = [
  ...sample.colliding,
  sample.lone,
  sample.otherGroup,
  "test/language/statements/negative-0.js",
].toSorted();

function entry(
  path: string,
  overrides: Partial<ReviewedTest262Entry> = {},
): ReviewedTest262Entry {
  return {
    dependencies: ["functions"],
    expectedClassification: path.includes("negative")
      ? "expected-negative"
      : "pass",
    path,
    ...overrides,
  };
}

function subsetOf(
  entries: readonly ReviewedTest262Entry[],
): ReviewedTest262Subset {
  return {
    suiteRevision: revision,
    supportedFeatures: [],
    tests: entries.toSorted((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    ),
  };
}

const passingExecutor: Test262Executor = {
  async execute(): Promise<CliResult> {
    return { exitStatus: 0, stderr: "", stdout: "" };
  },
};

async function writeSources(root: string, paths: readonly string[]) {
  await Promise.all(
    paths.map(async (path) => {
      const file = join(root, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(
        file,
        path.includes("negative")
          ? negativeSource
          : "/*---\nflags: [noStrict]\n---*/\n",
      );
    }),
  );
}

async function observe(
  root: string,
  subset: ReviewedTest262Subset,
  acceptPromotions = false,
): Promise<ReviewedTest262Manifest> {
  const run = await createReviewedManifest(
    subset,
    root,
    harnesses,
    passingExecutor,
    { acceptPromotions, poolLimit: 2 },
  );
  return run.manifest;
}

async function writeManifest(
  directory: string,
  serialized: SerializedTest262Manifest,
): Promise<void> {
  await Promise.all(
    serialized.partitions.map(async (partition) => {
      const file = join(directory, partition.path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, partition.text);
    }),
  );
  await writeFile(join(directory, "results.yaml"), serialized.indexText);
}

async function readManifest(directory: string): Promise<{
  readonly onDisk: SerializedTest262Manifest;
  readonly parsed: ReviewedTest262Manifest;
}> {
  const indexText = await readFile(join(directory, "results.yaml"), "utf8");
  const partitions = await readSerializedManifestPartitions(
    indexText,
    async (path) => await readFile(join(directory, path), "utf8"),
  );
  const texts = new Map(partitions.map(({ path, text }) => [path, text]));
  const parsed = parseReviewedManifest(indexText, (path) => {
    const text = texts.get(path);
    if (text == null) throw new Error(`missing ${path}`);
    return text;
  });
  return { onDisk: { indexText, partitions }, parsed };
}

function assertSameSerialization(
  actual: SerializedTest262Manifest,
  expected: SerializedTest262Manifest,
): void {
  assert.equal(actual.indexText, expected.indexText);
  assert.deepEqual(
    actual.partitions.map(({ path }) => path),
    expected.partitions.map(({ path }) => path),
  );
  for (const [index, partition] of actual.partitions.entries()) {
    assert.equal(
      partition.text,
      expected.partitions[index]?.text,
      partition.path,
    );
  }
  assert.equal(test262ManifestDigest(actual), test262ManifestDigest(expected));
}

test("a scoped update reproduces the complete regeneration", async () => {
  const root = await mkdtemp(join(tmpdir(), "oseo-test262-scoped-"));
  try {
    await writeSources(root, allPaths);
    const promoted = sample.colliding[1];
    // The batch: one path sharing a bucket with a kept record, one path
    // alone in its bucket, one path opening a new group, one promotion
    // from unsupported to pass, and one retained path whose dependency
    // tags changed.
    const batch = new Set([
      promoted,
      sample.lone,
      sample.otherGroup,
      "test/language/statements/negative-0.js",
    ]);
    const before = subsetOf([
      entry(sample.colliding[0]),
      entry(promoted, {
        expectedClassification: "unsupported-profile-feature",
      }),
      entry("test/language/statements/negative-0.js"),
    ]);
    const after = subsetOf([
      entry(sample.colliding[0]),
      entry(promoted),
      entry(sample.lone),
      entry(sample.otherGroup),
      entry("test/language/statements/negative-0.js", {
        dependencies: ["abrupt-completion", "functions"],
      }),
    ]);
    const full = serializeTest262Manifest(await observe(root, after));

    // The baseline tree holds the records the previous full regeneration
    // wrote for the subset before the batch, including a stale record for
    // the path about to be promoted.
    const baselineManifest = await observe(root, before, true);
    const manifestDirectory = join(root, "manifest");
    await writeManifest(
      manifestDirectory,
      serializeTest262Manifest(baselineManifest),
    );
    const { onDisk, parsed } = await readManifest(manifestDirectory);
    requireCanonicalManifest(onDisk, parsed);

    const selected = new Set(selectChangedReviewedPaths(before, after));
    assert.deepEqual([...selected].toSorted(), [...batch].toSorted());
    const observed = await observe(
      root,
      {
        ...after,
        tests: after.tests.filter((item) => selected.has(item.path)),
      },
      true,
    );
    const merged = mergeScopedManifest(parsed, observed, selected, after);
    assertSameSerialization(serializeTest262Manifest(merged), full);

    // Every partition without a batch path keeps its exact text.
    const batchPartitions = new Set(
      [...batch].map(
        (path) =>
          `results/${path.split("/").slice(1, 3).join("/")}/` +
          `${partitionKey(path)}.yaml`,
      ),
    );
    const beforeTexts = new Map(
      onDisk.partitions.map(({ path, text }) => [path, text]),
    );
    let untouched = 0;
    for (const partition of full.partitions) {
      if (batchPartitions.has(partition.path)) continue;
      assert.equal(partition.text, beforeTexts.get(partition.path));
      untouched += 1;
    }
    assert.ok(untouched >= 0);
    // The colliding bucket is rewritten but still carries the kept record.
    const collidingPartition = full.partitions.find(
      (partition) =>
        partition.path.endsWith(`/${partitionKey(sample.colliding[0])}.yaml`) &&
        partition.path.includes("built-ins/Array"),
    );
    assert.ok(collidingPartition?.text.includes(sample.colliding[0]));
    assert.ok(collidingPartition?.text.includes(promoted));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("serialization does not depend on object identity or key order", () => {
  const shared = ["functions", "lexical-bindings"];
  const first: Test262Result = {
    case: {
      async: false,
      features: [],
      flags: [],
      includes: [],
      mode: "script",
      path: sample.colliding[0],
      strictness: ["non-strict", "strict"],
      suiteRevision: revision,
    },
    classification: "unsupported-profile-feature",
    dependencies: shared,
    observation: {
      detail: "Not executed.",
      unsupportedCapability: "profile-syntax",
      passed: false,
    },
    unsupportedFeatures: [],
  };
  const second: Test262Result = {
    ...first,
    case: { ...first.case, path: sample.colliding[1] },
    observation: {
      passed: false,
      unsupportedCapability: "profile-syntax",
      detail: "Not executed.",
    },
  };
  const results = [first, second].toSorted((left, right) =>
    left.case.path < right.case.path ? -1 : 1,
  );
  const manifest = {
    results,
    suiteRevision: revision,
    summary: summarizeTest262(results),
  };
  const serialized = serializeTest262Manifest(manifest);
  const text = serialized.partitions[0]?.text ?? "";
  assert.doesNotMatch(text, /&|\*/u, "no YAML anchor or alias");
  assert.equal(serialized.partitions.length, 1);
  const observations = [
    ...text.matchAll(/observation:\n((?: {6}\S.*\n)+)/gu),
  ].map((match) => match[1]);
  assert.equal(observations.length, 2);
  assert.equal(observations[0], observations[1]);
  assert.match(
    observations[0] ?? "",
    /detail:[^]*passed:[^]*unsupportedCapability:/u,
  );
  // The parsed copy reproduces the same bytes, so the text is canonical.
  const parsed = parseReviewedPartition(
    serialized.partitions[0]?.path ?? "",
    text,
    revision,
  );
  const again = serializeTest262Manifest({
    results: parsed.results,
    suiteRevision: revision,
    summary: summarizeTest262(parsed.results),
  });
  assert.equal(again.partitions[0]?.text, text);
});

test("canonicality refuses aliased or reordered records", async () => {
  const root = await mkdtemp(join(tmpdir(), "oseo-test262-canonical-"));
  try {
    await writeSources(root, sample.colliding);
    const manifest = await observe(
      root,
      subsetOf(sample.colliding.map((path) => entry(path))),
    );
    const serialized = serializeTest262Manifest(manifest);
    const directory = join(root, "manifest");
    await writeManifest(directory, serialized);
    const { onDisk, parsed } = await readManifest(directory);
    requireCanonicalManifest(onDisk, parsed);

    const partition = serialized.partitions.find((item) =>
      item.path.endsWith(`/${partitionKey(sample.colliding[0])}.yaml`),
    );
    assert.ok(partition);
    const file = join(directory, partition.path);
    // Alias the second record's dependency list to the first's. The values
    // are unchanged, so the parsed manifest is equal, but the bytes differ
    // from what a regeneration writes.
    const aliased = partition.text
      .replace(
        "dependencies:\n      - functions",
        "dependencies: &deps\n      - functions",
      )
      .replace(
        /dependencies:\n {6}- functions(?![^]*dependencies:)/u,
        "dependencies: *deps",
      );
    assert.notEqual(aliased, partition.text);
    await writeFile(file, aliased);
    const aliasedTree = await readManifest(directory);
    assert.deepEqual(aliasedTree.parsed.results, parsed.results);
    assert.throws(
      () => requireCanonicalManifest(aliasedTree.onDisk, aliasedTree.parsed),
      new RegExp(
        `not canonical \\(${partition.path.replaceAll("/", "\\/")}`,
        "u",
      ),
    );

    // Reorder two keys inside one record: still equal values, refused.
    const reordered = partition.text.replace(
      "    classification: pass\n    dependencies:\n      - functions\n",
      "    dependencies:\n      - functions\n    classification: pass\n",
    );
    assert.notEqual(reordered, partition.text);
    await writeFile(file, reordered);
    const reorderedTree = await readManifest(directory);
    assert.deepEqual(reorderedTree.parsed.results, parsed.results);
    assert.throws(
      () =>
        requireCanonicalManifest(reorderedTree.onDisk, reorderedTree.parsed),
      /not canonical/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("reindex rebuilds the index from partition files alone", async () => {
  const root = await mkdtemp(join(tmpdir(), "oseo-test262-reindex-"));
  try {
    await writeSources(root, allPaths);
    const subset = subsetOf(allPaths.map((path) => entry(path)));
    const full = serializeTest262Manifest(await observe(root, subset));
    const files = full.partitions.map(({ path, text }) => ({ path, text }));
    const reviewed = subset;
    const rebuilt = serializeTest262Manifest(
      manifestOf(collectReviewedPartitionRecords(files, reviewed)),
    );
    assertSameSerialization(rebuilt, full);

    // A duplicated path, across files or inside one, is an error, never a
    // choice between two observations.
    const [first] = full.partitions;
    assert.ok(first);
    assert.throws(
      () => collectReviewedPartitionRecords([...files, first], reviewed),
      /occurs in both/u,
    );
    const recordStart = first.text.indexOf("  - case:");
    const recordEnd = first.text.indexOf("suiteRevision:");
    const doubled = {
      path: first.path,
      text:
        first.text.slice(0, recordEnd) +
        first.text.slice(recordStart, recordEnd) +
        first.text.slice(recordEnd),
    };
    assert.throws(
      () =>
        collectReviewedPartitionRecords([doubled, ...files.slice(1)], reviewed),
      /must be unique|must be sorted/u,
    );
    // A record outside the subset and a missing reviewed path are errors.
    assert.throws(
      () =>
        collectReviewedPartitionRecords(
          files,
          subsetOf(allPaths.slice(1).map((path) => entry(path))),
        ),
      /outside the reviewed subset/u,
    );
    assert.throws(
      () =>
        collectReviewedPartitionRecords(
          files,
          subsetOf(
            [...allPaths, "test/built-ins/Array/absent.js"].map((path) =>
              entry(path),
            ),
          ),
        ),
      /has no record/u,
    );
    // A record whose tags or classification differ from its subset entry
    // is refused, so reindex cannot launder a stale record past the subset.
    assert.throws(
      () =>
        collectReviewedPartitionRecords(
          files,
          subsetOf(
            allPaths.map((path) =>
              path === allPaths[0]
                ? entry(path, { dependencies: ["lexical-bindings"] })
                : entry(path),
            ),
          ),
        ),
      /does not match its reviewed subset entry/u,
    );
    // A conflict marker is a parse error.
    assert.throws(() =>
      collectReviewedPartitionRecords(
        [
          { path: first.path, text: `<<<<<<< ours\n${first.text}` },
          ...files.slice(1),
        ],
        reviewed,
      ),
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function manifestOf(
  results: readonly Test262Result[],
): ReviewedTest262Manifest {
  return {
    results,
    suiteRevision: revision,
    summary: summarizeTest262(results),
  };
}

test("merging scoped observations enforces the selection algebra", () => {
  const records = allPaths.map((path) => passingRecord(path));
  const passEntry = (path: string): ReviewedTest262Entry =>
    entry(path, { expectedClassification: "pass" });
  const reviewed = subsetOf(allPaths.map((path) => passEntry(path)));
  const [kept, replaced] = records;
  assert.ok(kept && replaced);
  const observedReplacement = {
    ...replaced,
    classification: "unsupported-profile-feature" as const,
    observation: { passed: false },
  };
  const selection = new Set([replaced.case.path]);
  const merged = mergeReviewedResults(
    records,
    [observedReplacement],
    selection,
    reviewed,
  );
  assert.deepEqual(
    merged.map((result) => result.case.path),
    allPaths,
  );
  assert.equal(
    merged.find((result) => result.case.path === replaced.case.path)
      ?.classification,
    "unsupported-profile-feature",
  );
  assert.throws(
    () =>
      mergeReviewedResults(records, [observedReplacement], new Set(), reviewed),
    /was not selected/u,
  );
  assert.throws(
    () => mergeReviewedResults(records, [], selection, reviewed),
    /was not observed/u,
  );
  assert.throws(
    () =>
      mergeReviewedResults(
        records,
        [observedReplacement],
        selection,
        subsetOf(
          allPaths
            .filter((path) => path !== kept.case.path)
            .map((path) => passEntry(path)),
        ),
      ),
    /outside the reviewed subset/u,
  );
  assert.throws(
    () =>
      mergeReviewedResults(
        records.filter((result) => result !== kept),
        [observedReplacement],
        selection,
        reviewed,
      ),
    /has no record and was not selected/u,
  );
  // A kept record must still carry the classification its unchanged
  // subset entry expects.
  assert.throws(
    () =>
      mergeReviewedResults(
        records.map((result) =>
          result === kept
            ? { ...result, classification: "unsupported-profile-feature" }
            : result,
        ),
        [observedReplacement],
        selection,
        reviewed,
      ),
    /is unsupported-profile-feature but the reviewed subset expects pass/u,
  );
  // A kept record must also carry the dependency tags its entry lists.
  assert.throws(
    () =>
      mergeReviewedResults(
        records,
        [observedReplacement],
        selection,
        subsetOf(
          allPaths.map((path) =>
            path === kept.case.path
              ? entry(path, {
                  dependencies: ["functions", "lexical-bindings"],
                  expectedClassification: "pass",
                })
              : passEntry(path),
          ),
        ),
      ),
    /records dependencies functions but the reviewed subset lists/u,
  );
  // A failure anywhere in the union is refused, as the full update
  // refuses it, even when the subset expectation was hand-edited to match.
  for (const classification of [
    "semantic-failure",
    "harness-failure",
    "infrastructure-failure",
  ] as const) {
    const failing = { ...kept, classification };
    assert.throws(
      () =>
        mergeReviewedResults(
          records.map((result) => (result === kept ? failing : result)),
          [observedReplacement],
          selection,
          subsetOf(
            allPaths.map((path) =>
              path === kept.case.path
                ? entry(path, { expectedClassification: classification })
                : passEntry(path),
            ),
          ),
        ),
      /Reviewed failures:/u,
    );
  }
  // A new path with no existing record is selected and observed.
  const added = passingRecord("test/built-ins/Array/new.js");
  const grown = mergeReviewedResults(
    records,
    [added],
    new Set([added.case.path]),
    subsetOf([...allPaths, added.case.path].map((path) => passEntry(path))),
  );
  assert.equal(grown.length, allPaths.length + 1);
});

function passingRecord(path: string): Test262Result {
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

test("changed-path selection refuses global subset changes", () => {
  const base = subsetOf([entry(sample.lone), entry(sample.otherGroup)]);
  assert.deepEqual(
    selectChangedReviewedPaths(
      base,
      subsetOf([...base.tests, entry(sample.colliding[0])]),
    ),
    [sample.colliding[0]],
  );
  assert.deepEqual(
    selectChangedReviewedPaths(
      base,
      subsetOf([
        entry(sample.lone, { dependencies: ["functions", "lexical-bindings"] }),
        entry(sample.otherGroup),
      ]),
    ),
    [sample.lone],
  );
  assert.throws(
    () => selectChangedReviewedPaths(base, base),
    /nothing to observe/u,
  );
  assert.throws(
    () =>
      selectChangedReviewedPaths(base, {
        ...base,
        supportedFeatures: ["Symbol"],
      }),
    /supportedFeatures changed/u,
  );
  assert.throws(
    () =>
      selectChangedReviewedPaths(base, {
        ...base,
        suiteRevision: "0".repeat(40),
      }),
    /suite revision changed/u,
  );
  assert.throws(
    () => selectChangedReviewedPaths(base, subsetOf([entry(sample.lone)])),
    /was removed/u,
  );
});

test("the static guard admits only observation-neutral differences", () => {
  rejectScopedUpdateDifferences(
    [
      "CONTRIBUTING.md",
      "docs/m5c-graph/graph.yaml",
      "tests/test262/results.yaml",
      "tests/test262/results/built-ins/Array/00.yaml",
      "tests/test262/subset.yaml",
      "tests/test262/target-parity.yaml",
    ],
    "abc",
  );
  for (const path of [
    "packages/compiler/src/index.ts",
    "tools/test262.ts",
    "tests/test262/harness/base.js",
    "aube-lock.yaml",
    "package.json",
    "mise.toml",
    "tests/native-toolchain.ts",
    "tests/test262/inventory.tsv",
  ]) {
    assert.throws(
      () => rejectScopedUpdateDifferences(["docs/x.md", path], "abc"),
      new RegExp(
        `refused: ${path.replaceAll(".", "\\.")} differs from abc`,
        "u",
      ),
    );
  }
});

test("scoped and reindex arguments compose only with their modes", () => {
  assert.deepEqual(parseTest262Arguments(["--update", "--changed"]), {
    acceptPromotions: false,
    changed: true,
    help: false,
    reindex: false,
    update: true,
  });
  assert.deepEqual(
    parseTest262Arguments(["--update", "--changed", "--baseline", "main"]),
    {
      acceptPromotions: false,
      baseline: "main",
      changed: true,
      help: false,
      reindex: false,
      update: true,
    },
  );
  assert.equal(parseTest262Arguments(["--reindex"]).reindex, true);
  assert.throws(
    () => parseTest262Arguments(["--changed"]),
    /changed requires update/u,
  );
  assert.throws(
    () => parseTest262Arguments(["--update", "--baseline", "main"]),
    /baseline requires changed/u,
  );
  assert.throws(
    () => parseTest262Arguments(["--update", "--changed", "--baseline"]),
    /baseline requires a Git revision/u,
  );
  assert.throws(
    () => parseTest262Arguments(["--reindex", "--update"]),
    /reindex cannot/u,
  );
  assert.throws(
    () => parseTest262Arguments(["--reindex", "--shard", "1/2"]),
    /reindex cannot/u,
  );
  assert.throws(
    () => parseTest262Arguments(["--update", "--changed", "--changed"]),
    /only once/u,
  );
});

test("changed paths name a rename's origin and untracked files", async () => {
  const root = await mkdtemp(join(tmpdir(), "oseo-test262-guard-git-"));
  const run = (...args: readonly string[]): string =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      {
        cwd: root,
        encoding: "utf8",
        // Isolate the fixture from the caller's global hooks and identity,
        // as tests/check-commit-message.test.ts does; the function under
        // test still reads the real configuration in production.
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: join(root, "empty-gitconfig"),
          GIT_CONFIG_NOSYSTEM: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
  try {
    await writeFile(join(root, "empty-gitconfig"), "");
    run("init", "-q", "-b", "main");
    run("config", "diff.renames", "true");
    await mkdir(join(root, "packages"), { recursive: true });
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "packages/input.ts"), "export const a = 1;\n");
    await writeFile(join(root, "docs/notes.md"), "notes\n");
    run("add", "-A");
    run("commit", "-q", "-m", "baseline");
    // A source file moved into the allow-list must still name its origin,
    // so the guard sees the implementation input that disappeared.
    run("mv", "packages/input.ts", "docs/input.ts");
    // An untracked file counts as a difference too.
    await writeFile(join(root, "tests-harness-new.js"), "// new\n");
    assert.deepEqual(changedPathsSince("HEAD", root), [
      "docs/input.ts",
      "packages/input.ts",
      "tests-harness-new.js",
    ]);
    assert.throws(
      () => rejectScopedUpdateDifferences(changedPathsSince("HEAD", root), "x"),
      /refused: packages\/input\.ts differs from x/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
