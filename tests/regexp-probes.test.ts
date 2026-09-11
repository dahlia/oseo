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

import {
  defaultRegExpExecutionLimits,
  searchRegExpMatcher,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import {
  buildProbeArtifact,
  buildProbeCorpus,
} from "../tools/regexp-probes/artifact.ts";
import {
  probeInputText,
  regExpProbeCorpus,
} from "../tools/regexp-probes/corpus.ts";
import type { RegExpProbeCase } from "../tools/regexp-probes/corpus.ts";
import { measureExternal } from "../tools/regexp-probes/external.ts";
import {
  boundaryDiagnostic,
  boundaryPatterns,
  sharedPatterns,
  sizePrograms,
  stringLiteral,
  timedIterations,
  timedPatterns,
  timedSubject,
  timedSubjectLimit,
} from "../tools/regexp-probes/programs.ts";
import { measureResources } from "../tools/regexp-probes/resource.ts";
import {
  defaultAutomatonCaps,
  measureAutomaton,
  measureStrategy,
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

test("a reported span is the answer rather than mandatory work", () => {
  // A sticky pattern whose first position fails is the case the column
  // must not overstate: the attempt is settled at position 0, so no
  // engine has to read the other 511 positions, and the span the row
  // prints is the whole subject only because an unmatched attempt has
  // no match end to report. Asserting the step count against it keeps
  // the column descriptive: a reading of it as a lower bound on work
  // would have to survive 2 steps over a 512-position subject.
  const sticky: RegExpProbeCase = {
    flags: "y",
    id: "sticky-first-position",
    inputs: [
      { id: "reject", repeat: 512, unit: "b" },
      { id: "accept", repeat: 1, suffix: "b".repeat(511), unit: "a" },
    ],
    note: "A sticky pattern that fails at the first position.",
    origin: "stress",
    provenance: "tests/regexp-probes.test.ts",
    source: "a",
  };
  const row = measureStrategy(buildProbeArtifact(sticky), defaultAutomatonCaps);
  const rejected = row.executions[0];
  assert.equal(rejected?.outcome, "unmatched");
  assert.equal(rejected?.positions, 512);
  assert.equal(rejected?.positionSpan, 512);
  assert.ok((rejected?.steps ?? 0) < 512, String(rejected?.steps));
  // A matched attempt is the half that names a match end, which is the
  // only row where the column describes a prefix of the subject rather
  // than the whole of it.
  const accepted = row.executions[1];
  assert.equal(accepted?.outcome, "matched");
  assert.equal(accepted?.positions, 512);
  assert.equal(accepted?.positionSpan, 1);
  // An attempt that reaches a reviewed boundary has no answer at all,
  // so it describes none: reporting the subject there would print a
  // span for a row that never decided anything.
  const bounded = regExpProbeCorpus.find(
    (current) => current.id === "empty-repetition",
  );
  if (bounded == null) throw new Error("the empty-repetition case is present");
  const limited = measureStrategy(
    buildProbeArtifact(bounded),
    defaultAutomatonCaps,
  ).executions[0];
  assert.equal(limited?.outcome, "limit");
  assert.equal(limited?.positionSpan, undefined);
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
  // Each peak is searched with the other dimension at its reviewed
  // default, so the row's own claim is about the pair. Both are checked
  // here: with the other peak held, one entry below either reaches that
  // dimension's own boundary, and neither peak is sufficient by itself.
  for (const row of rows) {
    const backtrack = row.peakBacktrackEntries ?? 0;
    const trail = row.peakTrailEntries ?? 0;
    assert.ok(backtrack > 0 && trail > 0, row.inputId);
    const input = entry.inputs.find((current) => current.id === row.inputId);
    if (input == null) throw new Error(`the ${row.inputId} input is named`);
    const text = probeInputText(input);
    const run = (backtrackEntries: number, trailEntries: number) =>
      searchRegExpMatcher({
        limits: {
          backtrackEntries,
          steps: defaultRegExpExecutionLimits.steps,
          trailEntries,
        },
        program: artifact.program,
        startIndex: 0,
        text,
      });
    assert.equal(run(backtrack, trail).outcome, row.outcome, row.inputId);
    const belowBacktrack = run(backtrack - 1, trail);
    assert.equal(belowBacktrack.outcome, "limit", row.inputId);
    assert.equal(
      belowBacktrack.outcome === "limit" ? belowBacktrack.limit : undefined,
      "backtrack-entries",
      row.inputId,
    );
    const belowTrail = run(backtrack, trail - 1);
    assert.equal(belowTrail.outcome, "limit", row.inputId);
    assert.equal(
      belowTrail.outcome === "limit" ? belowTrail.limit : undefined,
      "trail-entries",
      row.inputId,
    );
  }
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
    programs.slice(0, 11).map((program) => program.id),
    [
      "baseline",
      "literal-one",
      "literal-all",
      "literal-control",
      "literal-control-none",
      "literal-control-one",
      "literal-shared",
      "dynamic-shared",
      "literal-match",
      "dynamic-match",
      "dynamic-construct",
    ],
  );
  for (const program of programs) {
    assert.ok(program.source.includes("console.log"), program.id);
    if (program.id === "baseline") continue;
    // Only the two programs that exist to carry no pattern may report
    // none: `baseline` links no matcher at all, and
    // `literal-control-none` keeps the statements around an evaluation
    // without making one.
    if (program.id === "literal-control-none") {
      assert.equal(program.patterns, 0, program.id);
      continue;
    }
    assert.ok(program.patterns > 0, program.id);
  }
  const timedProgram = programs.find(
    (program) => program.id === "literal-match",
  );
  assert.equal(timedProgram?.patterns, timedIdentifiers.size);
  assert.equal(timedProgram?.attempts, timedIdentifiers.size * timedIterations);
  const boundaries = programs.slice(11);
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

test("a timed subject fills the embedded-subject limit", () => {
  const { timed } = timedPatterns();
  assert.ok(timed.length > 0);
  for (const entry of timed) {
    const first = entry.inputs[0];
    assert.notEqual(first, undefined, entry.id);
    if (first == null) continue;
    const text = timedSubject(entry);
    // A corpus entry names the repetition its semantic case needs, and
    // most of them name one, so a timed subject that stopped at that
    // count would time a match over a handful of characters. It is the
    // limit rather than the entry that decides how long this subject
    // is: one more unit has to pass the limit, and the whole subject,
    // suffix included, has to stay within it.
    assert.ok(text.length <= timedSubjectLimit, `${entry.id} ${text.length}`);
    assert.ok(
      text.length + first.unit.length > timedSubjectLimit,
      `${entry.id} ${text.length}`,
    );
    assert.ok(text.length >= probeInputText({ ...first, repeat: 1 }).length);
    assert.ok(
      text.startsWith(first.unit) && text.endsWith(first.suffix ?? ""),
      entry.id,
    );
  }
  const source = sizePrograms().find(
    (program) => program.id === "literal-match",
  )?.source;
  assert.notEqual(source, undefined);
  // The subject the program embeds is the one measured above, so a
  // change that filled only the measurement would still be caught.
  for (const entry of timed) {
    assert.ok(
      source?.includes(`.test(${stringLiteral(timedSubject(entry))})`),
      entry.id,
    );
  }
});

test("each control program is paired with one measured program", () => {
  const programs = sizePrograms();
  const byId = new Map(programs.map((program) => [program.id, program]));
  // A control keeps the statements, the subjects, and the pattern count
  // of the program it is paired with and replaces only the pattern, so
  // a pair that stopped matching would silently turn a per-literal
  // figure into a difference between two different programs.
  for (const [measured, control] of [
    ["literal-all", "literal-control"],
    ["literal-one", "literal-control-one"],
  ] as const) {
    const left = byId.get(measured);
    const right = byId.get(control);
    assert.notEqual(left, undefined, measured);
    assert.notEqual(right, undefined, control);
    assert.equal(left?.patterns, right?.patterns, control);
    assert.equal(left?.attempts, right?.attempts, control);
    assert.equal(
      left?.source.split("\n").length,
      right?.source.split("\n").length,
      control,
    );
  }
  // The three controls differ only in how many evaluations they carry,
  // which is what lets the fixed cost of reaching the matcher be
  // separated from the cost of one more evaluation. The one with none
  // keeps the statements around an evaluation and links no matcher, so
  // it is the only program a fixed cost can be measured against.
  const none = byId.get("literal-control-none");
  const one = byId.get("literal-control-one");
  const all = byId.get("literal-control");
  assert.equal(none?.patterns, 0);
  assert.equal(none?.attempts, 0);
  assert.equal(one?.patterns, 1);
  assert.equal(all?.patterns, regExpProbeCorpus.length);
  assert.ok(!none?.source.includes(".test("));
  assert.ok((none?.source.length ?? 0) < (one?.source.length ?? 0));
  assert.ok((one?.source.length ?? 0) < (all?.source.length ?? 0));
  for (const line of ['let answers = "";', "console.log(answers);"]) {
    for (const control of [none, one, all]) {
      assert.ok(control?.source.includes(line), control?.id);
    }
  }
});

test("a boundary program is selected by the input it evaluates", () => {
  const boundary = boundaryPatterns();
  assert.ok(boundary.length > 0);
  const programs = sizePrograms().filter((program) =>
    program.id.startsWith("literal-boundary-"),
  );
  assert.deepEqual(
    programs.map((program) => program.id),
    boundary.map((entry) => `literal-boundary-${entry.id}`),
  );
  for (const entry of boundary) {
    const input = entry.inputs[0];
    assert.notEqual(input, undefined, entry.id);
    if (input == null) continue;
    // A boundary program evaluates the input its entry names, so that
    // input is what has to reach the boundary. Selecting on the longer
    // subject a timed program builds would produce a program that
    // printed an ordinary answer where the probe requires OSEO2001.
    const attempt = searchRegExpMatcher({
      program: buildProbeArtifact(entry).program,
      startIndex: 0,
      text: probeInputText(input),
    });
    assert.equal(attempt.outcome, "limit", entry.id);
  }
  const { excluded } = timedPatterns();
  const reached = excluded
    .filter((dropped) => dropped.reason.startsWith("reaches the"))
    .map((dropped) => dropped.id);
  // An entry whose extended timed subject reaches the boundary is not
  // automatically a boundary program, which is the difference this
  // selection exists for.
  assert.ok(
    reached.length > boundary.length,
    `${reached.join(",")} against ${boundary.length}`,
  );
});

test("the external harness answers or says why it did not", async () => {
  const refused = "class-set-difference";
  const selected = regExpProbeCorpus.filter((entry) =>
    ["capture-reset", "class-pair", refused].includes(entry.id),
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
  // Error translation is a requirement of this probe rather than a
  // convenience, so a refusal has to carry the message the component
  // itself maps its code to. A detail that stopped at the code would
  // leave the report quoting a message nothing measured.
  for (const row of measurement.rows) {
    if (row.id !== refused) continue;
    assert.equal(row.verdict, "compile-refused", row.inputId);
    assert.match(row.detail, /^PCRE2 refused the pattern: error \d+ at \d+, /u);
    assert.ok(row.detail.length > "PCRE2 refused the pattern: ".length + 12);
  }
});
