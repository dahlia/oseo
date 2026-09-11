/**
 * The regular expression probes reproduce what they report.
 *
 * The probes exist to produce evidence a later decision reads, so what
 * this suite owns is that the evidence is regenerable rather than
 * recalled: the reviewed corpus still builds, every pattern taken from
 * test262 still names a reviewed path, and every host-independent
 * measurement is the same on a second run. Timings are deliberately not
 * asserted; they are the part of the report that belongs to one host.
 *
 * The external-component probe is exercised over two patterns because a
 * harness that no longer compiles would otherwise be found only by
 * someone regenerating the report. A host without the candidate engine
 * reports why it was skipped, which is an answer rather than a failure.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createNodeHost } from "../packages/host/src/index.ts";
import {
  buildProbeArtifact,
  buildProbeCorpus,
} from "../tools/regexp-probes/artifact.ts";
import {
  probeInputText,
  regExpProbeCorpus,
} from "../tools/regexp-probes/corpus.ts";
import { measureExternal } from "../tools/regexp-probes/external.ts";
import {
  boundaryDiagnostic,
  sharedPatterns,
  sizePrograms,
  timedIterations,
  timedPatterns,
} from "../tools/regexp-probes/programs.ts";
import { measureResources } from "../tools/regexp-probes/resource.ts";
import {
  defaultAutomatonCaps,
  measureAutomaton,
} from "../tools/regexp-probes/strategy.ts";
import { measureUnicodeTables } from "../tools/regexp-probes/unicode.ts";

const repositoryRoot = resolve(fileURLToPath(import.meta.url), "../..");

test("every reviewed corpus pattern builds one artifact", () => {
  const built = buildProbeCorpus();
  assert.equal(built.length, regExpProbeCorpus.length);
  const identifiers = new Set<string>();
  for (const artifact of built) {
    assert.ok(!identifiers.has(artifact.entry.id), artifact.entry.id);
    identifiers.add(artifact.entry.id);
    assert.ok(artifact.instructions > 0, artifact.entry.id);
    assert.ok(artifact.entry.inputs.length > 0, artifact.entry.id);
    for (const input of artifact.entry.inputs) {
      assert.notEqual(probeInputText(input), "", artifact.entry.id);
    }
  }
});

test("every test262 pattern cites one reviewed subset path", async () => {
  const subset = await readFile(
    join(repositoryRoot, "tests", "test262", "subset.yaml"),
    "utf8",
  );
  const cited = regExpProbeCorpus.filter((entry) => entry.origin === "test262");
  assert.ok(cited.length > 0);
  for (const entry of cited) {
    assert.ok(
      subset.includes(`- path: ${entry.provenance}\n`),
      `${entry.id} cites ${entry.provenance}`,
    );
  }
});

test("the automaton measurement is stable and names its blockers", () => {
  const rows = new Map(
    buildProbeCorpus().map((artifact) => [
      artifact.entry.id,
      measureAutomaton(artifact.program, defaultAutomatonCaps),
    ]),
  );
  const backreference = rows.get("lookbehind-backreference");
  assert.deepEqual(backreference?.blockers, ["backreference", "lookaround"]);
  assert.equal(backreference?.configurations, undefined);
  const anchored = rows.get("semver");
  assert.deepEqual(anchored?.blockers, ["assertion"]);
  assert.equal(anchored?.deterministicStates, undefined);
  const bounded = rows.get("large-bounded-repetition");
  assert.deepEqual(bounded?.blockers, []);
  assert.equal(bounded?.configurations, 4001);
  assert.equal(bounded?.deterministicStates, 2003);
  const large = regExpProbeCorpus.find(
    (entry) => entry.id === "large-bounded-repetition",
  );
  if (large == null) throw new Error("the bounded-repetition case is here");
  const repeated = measureAutomaton(
    buildProbeArtifact(large).program,
    defaultAutomatonCaps,
  );
  assert.deepEqual(repeated, bounded);
});

test("a measured peak is the smallest sufficient limit", () => {
  const entry = regExpProbeCorpus.find((current) => current.id === "semver");
  if (entry == null) throw new Error("the semver case is in the corpus");
  const artifact = buildProbeArtifact(entry);
  const rows = measureResources(artifact, () => {
    buildProbeArtifact(entry);
  });
  assert.equal(rows.length, entry.inputs.length);
  for (const row of rows) {
    assert.equal(row.limit, undefined);
    assert.ok(row.deterministic, row.inputId);
    assert.ok((row.peakBacktrackEntries ?? 0) > 0, row.inputId);
    assert.ok((row.workingBytes ?? 0) > 0, row.inputId);
  }
  const again = measureResources(artifact, () => {
    buildProbeArtifact(entry);
  });
  assert.deepEqual(
    again.map((row) => [row.steps, row.peakBacktrackEntries]),
    rows.map((row) => [row.steps, row.peakBacktrackEntries]),
  );
});

test("an owned boundary is reached deterministically", () => {
  const entry = regExpProbeCorpus.find(
    (current) => current.id === "empty-repetition",
  );
  if (entry == null) throw new Error("the empty-repetition case is present");
  const rows = measureResources(buildProbeArtifact(entry), () => {
    buildProbeArtifact(entry);
  });
  const first = rows[0];
  assert.equal(first?.outcome, "limit");
  assert.equal(first?.limit, "steps");
  assert.ok(first?.deterministic);
  // An attempt that exhausts the step limit still holds a finite stack
  // and trail while it does, so the peaks are measured here too. This
  // suite would otherwise pass on a probe that reported nothing for the
  // one case the plan names for repeated empty matches.
  assert.ok((first?.peakBacktrackEntries ?? 0) > 0);
  assert.ok((first?.peakTrailEntries ?? 0) > 0);
  assert.ok((first?.workingBytes ?? 0) > 0);
  assert.ok((first?.reservedArrayBytes ?? 0) > (first?.workingBytes ?? 0));
});

test("the Unicode layouts are measured, not estimated", () => {
  const measurement = measureUnicodeTables();
  assert.ok(measurement.groups.length >= 5);
  for (const group of measurement.groups) {
    const inversion = group.bytes.get("inversion") ?? 0;
    const varint = group.bytes.get("inversion-varint") ?? 0;
    assert.equal(inversion, group.boundaries * 4, group.id);
    assert.ok(varint > 0 && varint < inversion, group.id);
    assert.ok((group.bytes.get("trie-256") ?? 0) > 0, group.id);
  }
  for (const classifier of measurement.classifiers) {
    assert.ok(
      classifier.sharedBytes < classifier.perSetTrieBytes,
      classifier.id,
    );
    assert.ok(classifier.queries >= classifier.values, classifier.id);
  }
  assert.ok(measurement.caseFolding.entries > 1000);
  assert.ok(
    measurement.caseFolding.deltaBytes < measurement.caseFolding.pairBytes,
  );
  assert.equal(measurement.stringProperties.properties, 7);
  assert.ok(measurement.inversionPayloadBytes > 0);
});

test("the generated programs partition the corpus with reasons", () => {
  const shared = sharedPatterns();
  const timed = timedPatterns();
  assert.equal(
    shared.shared.length + shared.excluded.length,
    regExpProbeCorpus.length,
  );
  for (const excluded of [...shared.excluded, ...timed.excluded]) {
    assert.notEqual(excluded.reason, "");
  }
  const timedIdentifiers = new Set(timed.timed.map((entry) => entry.id));
  for (const entry of timed.timed) {
    assert.ok(
      shared.shared.some((current) => current.id === entry.id),
      entry.id,
    );
    assert.ok(!entry.flags.includes("g") && !entry.flags.includes("y"));
  }
  const programs = sizePrograms();
  assert.deepEqual(
    programs.slice(0, 9).map((program) => program.id),
    [
      "baseline",
      "literal-one",
      "literal-all",
      "literal-control",
      "literal-shared",
      "dynamic-shared",
      "literal-match",
      "dynamic-match",
      "dynamic-construct",
    ],
  );
  for (const program of programs) {
    if (program.id === "baseline") continue;
    assert.ok(program.source.includes("console.log"), program.id);
    assert.ok(program.patterns > 0, program.id);
  }
  const timedProgram = programs.find(
    (program) => program.id === "literal-match",
  );
  assert.equal(timedProgram?.patterns, timedIdentifiers.size);
  assert.equal(timedProgram?.attempts, timedIdentifiers.size * timedIterations);
  const boundaries = programs.slice(9);
  assert.ok(boundaries.length > 0);
  for (const boundary of boundaries) {
    assert.ok(boundary.id.startsWith("literal-boundary-"), boundary.id);
    assert.equal(boundary.expectDiagnostic, boundaryDiagnostic);
    // A reached boundary ends the program, so a boundary program that
    // carried a second case would count an attempt it never made.
    assert.equal(boundary.patterns, 1, boundary.id);
    assert.equal(boundary.attempts, 1, boundary.id);
  }
});

test("a timed program answers pattern by pattern", () => {
  const { timed } = timedPatterns();
  const programs = sizePrograms().filter((program) =>
    ["dynamic-construct", "dynamic-match", "literal-match"].includes(
      program.id,
    ),
  );
  assert.equal(programs.length, 3);
  for (const program of programs) {
    // One total would let one pattern that stopped matching cancel
    // another that started, so the three timed programs are compared as
    // one count for each pattern in corpus order.
    assert.ok(!program.source.includes("let matched = 0;"), program.id);
    for (const [index] of timed.entries()) {
      assert.ok(
        program.source.includes(`let matched${index} = 0;`),
        `${program.id} counts pattern ${index}`,
      );
    }
    assert.ok(program.source.includes(`console.log([matched0, `), program.id);
  }
});

test("the external harness answers or says why it did not", async () => {
  const selected = regExpProbeCorpus.filter(
    (entry) => entry.id === "class-pair" || entry.id === "capture-reset",
  );
  const measurement = await measureExternal(
    createNodeHost(),
    selected.map(buildProbeArtifact),
  );
  if (measurement.skipped != null) {
    // Only an absent compiler or an absent component is a reason to
    // skip. A harness this repository broke throws instead, so a skip
    // can never retire the comparison quietly.
    assert.ok(
      [
        "no C compiler answered",
        "no PCRE2 16-bit headers",
        "the installed PCRE2 16-bit library did not load",
      ].some((reason) => measurement.skipped?.startsWith(reason)),
      measurement.skipped,
    );
    return;
  }
  const expected = selected.reduce(
    (total, entry) => total + entry.inputs.length,
    0,
  );
  assert.equal(measurement.rows.length, expected);
  const verdicts = new Set(measurement.rows.map((row) => row.verdict));
  for (const verdict of verdicts) {
    assert.ok(
      [
        "agreed",
        "compile-refused",
        "different-captures",
        "different-outcome",
        "match-error",
      ].includes(verdict),
      verdict,
    );
  }
});
