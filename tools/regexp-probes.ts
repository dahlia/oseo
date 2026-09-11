/**
 * The regular expression matcher probes.
 *
 * This command runs the matcher-strategy, external-component,
 * Unicode-table, resource, and code-size probes that
 * [*PLAN-REGEXP.md*](../PLAN-REGEXP.md) delivery item 8 requires, and
 * prints one report of what it measured. It selects no backend: the
 * decision that reads this report is delivery item 9.
 *
 * Every measurement is taken here rather than recalled, so the report
 * this prints is the evidence, and
 * [*docs/regexp-matcher-probes.md*](../docs/regexp-matcher-probes.md)
 * is one recorded run of it. Every timing depends on the host, and only
 * some are repeated: one compiler-side match, one artifact build, one
 * native program execution, and one external match are the smallest of
 * several attempts, while the archive build, one component compilation,
 * the generated C compilation, the link, and one external pattern
 * compilation are each measured once.
 *
 * Two more groups of numbers depend on the host without being timings:
 * every size and fact the external component reports belongs to the
 * PCRE2 the host has installed, and every size the code-size probe
 * reports belongs to the host's own target. What does not depend on the
 * host is the structural half: the artifact, strategy, and resource
 * counts the compiler derives from the checked-in corpus, and the
 * Unicode layouts the pinned tables derive.
 *
 * ~~~~ sh
 * mise run probe:regexp
 * mise run probe:regexp -- --json probe.json
 * ~~~~
 */

import { writeFile } from "node:fs/promises";
import process from "node:process";

import { createNodeHost } from "../packages/host/src/index.ts";

import {
  buildProbeArtifact,
  buildProbeCorpus,
} from "./regexp-probes/artifact.ts";
import type { ProbeArtifact } from "./regexp-probes/artifact.ts";
import { regExpProbeCorpus } from "./regexp-probes/corpus.ts";
import { measureExternal } from "./regexp-probes/external.ts";
import {
  sharedPatterns,
  sizePrograms,
  timedIterations,
  timedPatterns,
} from "./regexp-probes/programs.ts";
import { measureResources } from "./regexp-probes/resource.ts";
import {
  defaultAutomatonCaps,
  measureStrategy,
} from "./regexp-probes/strategy.ts";
import { measureSizes, measurementTarget } from "./regexp-probes/size.ts";
import { measureUnicodeTables } from "./regexp-probes/unicode.ts";
import type { ExternalMeasurement } from "./regexp-probes/external.ts";
import type { ResourceRow } from "./regexp-probes/resource.ts";
import type { SizeMeasurement } from "./regexp-probes/size.ts";
import type { StrategyRow } from "./regexp-probes/strategy.ts";
import type { UnicodeMeasurement } from "./regexp-probes/unicode.ts";

/** Everything one probe run measured. */
export interface ProbeReport {
  readonly artifacts: readonly ArtifactSummary[];
  readonly external: ExternalMeasurement;
  readonly resources: readonly ResourceRow[];
  readonly sizes: SizeMeasurement | undefined;
  readonly strategies: readonly StrategyRow[];
  readonly unicode: UnicodeMeasurement;
}

/**
 * What one built artifact stores.
 *
 * The report derives the cost of an ahead-of-time literal from these, so
 * they are retained beside the measurements rather than recomputed by a
 * reader from the corpus.
 */
export interface ArtifactSummary {
  readonly canonicalBytes: number;
  readonly captures: number;
  readonly groupNames: number;
  readonly id: string;
  readonly instructions: number;
  readonly registers: number;
  readonly setBoundaries: number;
  readonly setBytes: number;
  readonly sets: number;
}

function summarize(artifact: ProbeArtifact): ArtifactSummary {
  return {
    canonicalBytes: artifact.canonicalBytes,
    captures: artifact.captures,
    groupNames: artifact.groupNames,
    id: artifact.entry.id,
    instructions: artifact.instructions,
    registers: artifact.registers,
    setBoundaries: artifact.setBoundaries,
    setBytes: artifact.setBytes,
    sets: artifact.sets,
  };
}

function microseconds(nanoseconds: number): string {
  return `${(nanoseconds / 1000).toFixed(1)} us`;
}

function optional(value: number | undefined): string {
  return value == null ? "-" : String(value);
}

function row(cells: readonly string[], widths: readonly number[]): string {
  return cells
    .map((cell, index) => cell.padEnd(widths[index] ?? cell.length))
    .join("  ")
    .trimEnd();
}

function strategyReport(rows: readonly StrategyRow[]): string {
  const widths = [26, 6, 5, 8, 8, 7, 30];
  const lines = [
    "Matcher strategy",
    "----------------",
    "",
    row(
      [
        "pattern",
        "instr",
        "reg",
        "configs",
        "dfa",
        "symbols",
        "automaton blockers",
      ],
      widths,
    ),
  ];
  for (const entry of rows) {
    lines.push(
      row(
        [
          entry.id,
          String(entry.instructions),
          String(entry.registers),
          optional(entry.automaton.configurations),
          optional(entry.automaton.deterministicStates),
          optional(entry.automaton.symbols),
          entry.automaton.blockers.join(", ") || "none",
        ],
        widths,
      ),
    );
  }
  const executionWidths = [26, 12, 10, 8, 10, 10, 8, 12, 12];
  lines.push(
    "",
    row(
      [
        "pattern",
        "input",
        "outcome",
        "units",
        "positions",
        "steps",
        "span",
        "ceiling",
        "attempt",
      ],
      executionWidths,
    ),
  );
  for (const entry of rows) {
    for (const execution of entry.executions) {
      lines.push(
        row(
          [
            entry.id,
            execution.inputId,
            execution.outcome,
            String(execution.characters),
            String(execution.positions),
            String(execution.steps),
            optional(execution.positionSpan),
            optional(execution.configurationCeiling),
            microseconds(execution.nanosecondsPerAttempt),
          ],
          executionWidths,
        ),
      );
    }
  }
  return lines.join("\n");
}

function resourceReport(rows: readonly ResourceRow[]): string {
  const widths = [26, 12, 10, 12, 10, 10, 12, 12, 12, 8];
  const lines = [
    "Resource behavior",
    "-----------------",
    "",
    row(
      [
        "pattern",
        "input",
        "outcome",
        "steps",
        "backtrack",
        "trail",
        "packed",
        "arrays",
        "build",
        "stable",
      ],
      widths,
    ),
  ];
  for (const entry of rows) {
    lines.push(
      row(
        [
          entry.id,
          entry.inputId,
          entry.limit == null ? entry.outcome : `limit:${entry.limit}`,
          String(entry.steps),
          optional(entry.peakBacktrackEntries),
          optional(entry.peakTrailEntries),
          optional(entry.workingBytes),
          optional(entry.reservedArrayBytes),
          microseconds(entry.buildNanoseconds),
          String(entry.deterministic),
        ],
        widths,
      ),
    );
  }
  return lines.join("\n");
}

function unicodeReport(measurement: UnicodeMeasurement): string {
  const widths = [22, 6, 10, 12, 12, 16, 12, 12, 8];
  const lines = [
    "Unicode tables",
    "--------------",
    "",
    row(
      [
        "group",
        "sets",
        "boundaries",
        "code points",
        "inversion",
        "inversion-varint",
        "bitmap",
        "trie-256",
        "search",
      ],
      widths,
    ),
  ];
  for (const group of measurement.groups) {
    lines.push(
      row(
        [
          group.id,
          String(group.sets),
          String(group.boundaries),
          String(group.codePoints),
          String(group.bytes.get("inversion") ?? 0),
          String(group.bytes.get("inversion-varint") ?? 0),
          String(group.bytes.get("bitmap") ?? 0),
          String(group.bytes.get("trie-256") ?? 0),
          String(group.worstSearchSteps),
        ],
        widths,
      ),
    );
  }
  lines.push("");
  for (const classifier of measurement.classifiers) {
    lines.push(
      `classifier ${classifier.id}: ${classifier.values} disjoint values ` +
        `answering ${classifier.queries} queries, ` +
        `${classifier.uniqueBlocks} unique blocks of ` +
        `${classifier.blockBytes}, ${classifier.sharedBytes} shared bytes ` +
        `plus ${classifier.maskBytes} mask bytes against ` +
        `${classifier.perSetTrieBytes} bytes of separate tries`,
    );
  }
  const folding = measurement.caseFolding;
  lines.push(
    `simple case folding: ${folding.entries} entries, ` +
      `${folding.pairBytes} bytes as pairs, ` +
      `${folding.deltaBytes} bytes as zigzag deltas`,
  );
  const strings = measurement.stringProperties;
  lines.push(
    `properties of strings: ${strings.properties} properties, ` +
      `${strings.sequences} sequences, longest ${strings.longest}, ` +
      `${strings.bytes} bytes`,
    `every admitted property from a dynamic pattern: ` +
      `${measurement.inversionPayloadBytes} bytes of payload with every ` +
      `group as an inversion list, the case-folding pairs, and the ` +
      `properties of strings, and no name table or index charged`,
  );
  return lines.join("\n");
}

function sizeReport(measurement: SizeMeasurement | undefined): string {
  const lines = ["Code size", "---------", ""];
  if (measurement == null) {
    lines.push("The native build did not run on this host.");
    return lines.join("\n");
  }
  lines.push(
    `target ${measurement.target}, runtime archive ` +
      `${measurement.archiveBytes} bytes in ` +
      `${(measurement.archiveNanoseconds / 1e9).toFixed(2)} s`,
    measurement.environment
      ? "toolchain environment: the policy snapshot, as an ordinary build"
      : "toolchain environment: unavailable, so the build inherited the " +
          "ambient environment and its sizes and timings are not " +
          "comparable with a build that did not",
    "",
  );
  const componentWidths = [28, 12, 12, 10];
  lines.push(row(["component", "object", "text", "compile"], componentWidths));
  for (const component of measurement.components) {
    lines.push(
      row(
        [
          component.name,
          String(component.objectBytes),
          optional(component.textBytes),
          microseconds(component.compileNanoseconds),
        ],
        componentWidths,
      ),
    );
  }
  const programWidths = [20, 9, 12, 10, 12, 12, 12, 10, 10, 12, 26];
  lines.push(
    "",
    row(
      [
        "program",
        "patterns",
        "generated C",
        "object",
        "object text",
        "executable",
        "text",
        "compile",
        "link",
        "run",
        "printed",
      ],
      programWidths,
    ),
  );
  for (const program of measurement.programs) {
    lines.push(
      row(
        [
          program.id,
          String(program.patterns),
          String(program.generatedBytes),
          String(program.objectBytes),
          optional(program.objectTextBytes),
          String(program.executableBytes),
          optional(program.textBytes),
          `${(program.compileNanoseconds / 1e6).toFixed(0)} ms`,
          `${(program.linkNanoseconds / 1e6).toFixed(0)} ms`,
          `${(program.runNanoseconds / 1e6).toFixed(1)} ms`,
          program.output === "" ? "(none)" : program.output,
        ],
        programWidths,
      ),
    );
  }
  for (const program of measurement.programs) {
    if (program.exitStatus === 0) continue;
    lines.push(
      "",
      `${program.id} exited with ${program.exitStatus} and reported:`,
      program.stderr,
    );
  }
  const timed = measurement.programs.find(
    (program) => program.id === "literal-match",
  );
  lines.push(
    "",
    `a timed program performs ${timedIterations} rounds over ` +
      `${timed?.patterns ?? 0} patterns, which is ${timed?.attempts ?? 0} ` +
      "attempts; what it prints is how many of them matched.",
  );
  return lines.join("\n");
}

function externalReport(measurement: ExternalMeasurement): string {
  const lines = ["External component", "------------------", ""];
  lines.push(`command: ${measurement.command.join(" ")}`);
  if (measurement.skipped != null) {
    lines.push(`skipped: ${measurement.skipped}`);
    return lines.join("\n");
  }
  const facts = measurement.facts;
  if (facts != null) {
    lines.push(
      `version ${facts.version}, Unicode ${facts.unicodeVersion}, ` +
        `jit ${facts.jit}, link size ${facts.linkSize}, ` +
        `depth limit ${facts.depthLimit}`,
      `newline: built with ${facts.newline}, every corpus pattern ` +
        `compiled under ${facts.newlineOption}`,
      `library ${facts.libraryPath ?? "unknown"} ` +
        `(${optional(facts.libraryBytes)} bytes), 16-bit archives beside ` +
        `it: ${facts.staticArchives.join(", ") || "none"}`,
      `injected allocator handed the engine ` +
        `${optional(facts.allocatedBytes)} bytes`,
    );
  }
  const counts = new Map<string, number>();
  for (const entry of measurement.rows) {
    counts.set(entry.verdict, (counts.get(entry.verdict) ?? 0) + 1);
  }
  lines.push(
    "",
    `${measurement.rows.length} cases: ` +
      [...counts]
        .toSorted(([first], [second]) => first.localeCompare(second))
        .map(([verdict, count]) => `${verdict} ${count}`)
        .join(", "),
    "",
  );
  const widths = [26, 12, 20, 10, 12, 10];
  lines.push(
    row(["pattern", "input", "verdict", "match", "compile", "bytes"], widths),
  );
  for (const entry of measurement.rows) {
    lines.push(
      row(
        [
          entry.id,
          entry.inputId,
          entry.verdict,
          entry.matchNanoseconds == null ? "-" : `${entry.matchNanoseconds} ns`,
          entry.compileNanoseconds == null
            ? "-"
            : `${entry.compileNanoseconds} ns`,
          optional(entry.compiledBytes),
        ],
        widths,
      ),
    );
  }
  lines.push("");
  for (const entry of measurement.rows) {
    if (entry.detail === "") continue;
    lines.push(`${entry.id}/${entry.inputId}: ${entry.detail}`);
  }
  return lines.join("\n");
}

function artifactReport(artifacts: readonly ArtifactSummary[]): string {
  const widths = [26, 8, 6, 8, 12, 10, 10, 14];
  const lines = [
    "Artifact storage",
    "----------------",
    "",
    row(
      [
        "pattern",
        "instr",
        "reg",
        "captures",
        "group names",
        "sets",
        "set bytes",
        "canonical bytes",
      ],
      widths,
    ),
  ];
  let setBytes = 0;
  let canonicalBytes = 0;
  for (const artifact of artifacts) {
    setBytes += artifact.setBytes;
    canonicalBytes += artifact.canonicalBytes;
    lines.push(
      row(
        [
          artifact.id,
          String(artifact.instructions),
          String(artifact.registers),
          String(artifact.captures),
          String(artifact.groupNames),
          String(artifact.sets),
          String(artifact.setBytes),
          String(artifact.canonicalBytes),
        ],
        widths,
      ),
    );
  }
  lines.push(
    "",
    `${artifacts.length} artifacts carry ${setBytes} bytes of resolved ` +
      `character sets and ${canonicalBytes} bytes of canonicalization ` +
      "tables, which is what an ahead-of-time literal carries in place of " +
      "the payload a dynamic pattern needs",
  );
  return lines.join("\n");
}

function corpusReport(): string {
  const shared = sharedPatterns();
  const timed = timedPatterns();
  const widths = [26, 10, 8, 8];
  const lines = [
    "Corpus",
    "------",
    "",
    row(["pattern", "origin", "flags", "inputs"], widths),
  ];
  for (const entry of regExpProbeCorpus) {
    lines.push(
      row(
        [
          entry.id,
          entry.origin,
          entry.flags === "" ? "(none)" : entry.flags,
          String(entry.inputs.length),
        ],
        widths,
      ),
    );
  }
  lines.push(
    "",
    `${regExpProbeCorpus.length} patterns; ` +
      `${shared.shared.length} are admitted by the runtime's own pattern ` +
      "compiler and " +
      `${timed.timed.length} are repeated by a timed program.`,
  );
  for (const excluded of shared.excluded) {
    lines.push(`  dynamic excludes ${excluded.id}: ${excluded.reason}`);
  }
  for (const excluded of timed.excluded) {
    lines.push(`  timing excludes ${excluded.id}: ${excluded.reason}`);
  }
  return lines.join("\n");
}

/** Run every probe and return what each one measured. */
export async function runProbes(native: boolean): Promise<ProbeReport> {
  const artifacts = buildProbeCorpus();
  const host = createNodeHost();
  const strategies = artifacts.map((artifact) =>
    measureStrategy(artifact, defaultAutomatonCaps),
  );
  const resources = artifacts.flatMap((artifact) =>
    measureResources(artifact, () => {
      buildProbeArtifact(artifact.entry);
    }),
  );
  const unicode = measureUnicodeTables();
  const external = await measureExternal(host, artifacts);
  const target = native ? measurementTarget(host) : undefined;
  const sizes =
    target == null
      ? undefined
      : await measureSizes(host, target, sizePrograms());
  return {
    artifacts: artifacts.map(summarize),
    external,
    resources,
    sizes,
    strategies,
    unicode,
  };
}

function printReport(report: ProbeReport): void {
  process.stdout.write(
    [
      corpusReport(),
      "",
      artifactReport(report.artifacts),
      "",
      strategyReport(report.strategies),
      "",
      resourceReport(report.resources),
      "",
      unicodeReport(report.unicode),
      "",
      sizeReport(report.sizes),
      "",
      externalReport(report.external),
      "",
    ].join("\n"),
  );
}

function jsonPath(argv: readonly string[]): string | undefined {
  const index = argv.indexOf("--json");
  if (index < 0) return undefined;
  const path = argv[index + 1];
  if (path == null) throw new Error("--json needs a path.");
  return path;
}

if (import.meta.main === true) {
  const argv = process.argv.slice(2);
  const report = await runProbes(!argv.includes("--no-native"));
  printReport(report);
  const path = jsonPath(argv);
  if (path != null) {
    await writeFile(
      path,
      `${JSON.stringify(
        report,
        (_key, value) =>
          value instanceof Map ? Object.fromEntries(value) : value,
        2,
      )}\n`,
    );
  }
}
