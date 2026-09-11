/**
 * The JavaScript programs the code-size probe builds.
 *
 * The comparison the report needs is between one pattern compiled
 * ahead of time and the same pattern constructed at run time, so the
 * programs are generated from the same corpus rather than written by
 * hand. A dynamic program can only carry the patterns the runtime's own
 * pattern compiler admits today, and the excluded entries are reported
 * rather than quietly dropped.
 */

import { searchRegExpMatcher } from "../../packages/compiler/src/index.ts";

import { buildProbeArtifact } from "./artifact.ts";
import { probeInputText, regExpProbeCorpus } from "./corpus.ts";
import type { RegExpProbeCase } from "./corpus.ts";
import type { SizeProgram } from "./size.ts";

/** One pattern the runtime's own compiler still refuses. */
export interface ExcludedPattern {
  readonly id: string;
  readonly reason: string;
}

/**
 * Whether the runtime's pattern compiler admits one corpus entry.
 *
 * The runtime resolves an ignore-case closure over ASCII exactly and
 * keeps an `OSEO2001` boundary for a property escape, for class set
 * notation, and for a set that can meet a non-ASCII class, so a dynamic
 * program may carry only what is left. An ahead-of-time literal has no
 * such boundary because its descriptor carries the resolved sets.
 */
function runtimeBoundary(entry: RegExpProbeCase): string | undefined {
  if (entry.flags.includes("v")) return "class set notation";
  if (/\\[pP]\{/u.test(entry.source)) return "property escape";
  const nonAscii = [...entry.source].some(
    (character) => (character.codePointAt(0) ?? 0) > 0x7f,
  );
  if (entry.flags.includes("i") && nonAscii) {
    return "non-ASCII ignore-case closure";
  }
  return undefined;
}

/** The corpus split by what the runtime's own pattern compiler admits. */
export interface SharedPatterns {
  readonly excluded: readonly ExcludedPattern[];
  readonly shared: readonly RegExpProbeCase[];
}

/** The corpus entries a dynamic program may construct. */
export function sharedPatterns(): SharedPatterns {
  const excluded: ExcludedPattern[] = [];
  const shared: RegExpProbeCase[] = [];
  for (const entry of regExpProbeCorpus) {
    const reason = runtimeBoundary(entry);
    if (reason == null) shared.push(entry);
    else excluded.push({ id: entry.id, reason });
  }
  return { excluded, shared };
}

/** One JavaScript string literal holding exactly this text. */
function stringLiteral(text: string): string {
  let escaped = "";
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (character === "\\" || character === '"') escaped += `\\${character}`;
    else if (code < 0x20 || code > 0x7e) {
      escaped += `\\u{${code.toString(16)}}`;
    } else escaped += character;
  }
  return `"${escaped}"`;
}

/** One regular expression literal holding exactly this pattern. */
function regExpLiteral(entry: RegExpProbeCase): string {
  let escaped = "";
  let previous = "";
  for (const character of entry.source) {
    if (character === "/" && previous !== "\\") escaped += "\\/";
    else escaped += character;
    previous = previous === "\\" ? "" : character;
  }
  return `/${escaped}/${entry.flags}`;
}

/**
 * The subject one entry is tested against.
 *
 * The first input is used at one repetition, because the program exists
 * to make the pattern reachable rather than to time a match.
 */
function subject(entry: RegExpProbeCase): string {
  const first = entry.inputs[0];
  if (first == null) return "";
  return probeInputText({ ...first, repeat: 1 });
}

/** The largest subject a timed program embeds. */
const timedSubjectLimit = 512;

/**
 * The subject one timed program repeats.
 *
 * The first input is repeated until it reaches the embedded-subject
 * limit, so a timed program measures a match over an ordinary subject
 * rather than over one character.
 */
function timedSubject(entry: RegExpProbeCase): string {
  const first = entry.inputs[0];
  if (first == null) return "";
  const unit = first.unit === "" ? " " : first.unit;
  const repeat = Math.max(
    1,
    Math.min(first.repeat, Math.floor(timedSubjectLimit / unit.length)),
  );
  return probeInputText({ ...first, repeat });
}

/** The number of match attempts each timed program performs. */
export const timedIterations = 2000;

/**
 * The largest attempt a timed program may repeat.
 *
 * A timed program runs every pattern thousands of times, so a pattern
 * whose attempt costs orders of magnitude more than the others would
 * measure only itself. An attempt that reaches an owned boundary is
 * excluded for a stronger reason: the native runtime reports the same
 * boundary as one `OSEO2001` diagnostic rather than a value.
 */
const timedStepBudget = 100_000;

/** The corpus split by what one timed program may repeat. */
export interface TimedPatterns {
  readonly excluded: readonly ExcludedPattern[];
  readonly timed: readonly RegExpProbeCase[];
}

/** The corpus entries a timed program repeats, and the ones it drops. */
export function timedPatterns(): TimedPatterns {
  const excluded: ExcludedPattern[] = [];
  const timed: RegExpProbeCase[] = [];
  for (const entry of sharedPatterns().shared) {
    if (entry.flags.includes("g") || entry.flags.includes("y")) {
      // A timed program reuses one dynamic object across its rounds, so
      // a pattern that keeps a cursor in `lastIndex` would measure that
      // cursor rather than the match.
      excluded.push({ id: entry.id, reason: "keeps a lastIndex cursor" });
      continue;
    }
    const artifact = buildProbeArtifact(entry);
    const attempt = searchRegExpMatcher({
      program: artifact.program,
      startIndex: 0,
      text: timedSubject(entry),
    });
    if (attempt.outcome === "limit") {
      excluded.push({
        id: entry.id,
        reason: `reaches the ${attempt.limit} boundary`,
      });
    } else if (attempt.steps > timedStepBudget) {
      excluded.push({
        id: entry.id,
        reason: `needs ${attempt.steps} steps for one attempt`,
      });
    } else timed.push(entry);
  }
  return { excluded, timed };
}

/**
 * One timed program.
 *
 * `hoisted` decides where a dynamic pattern is compiled: outside the
 * loop the program measures matching alone, and inside it the program
 * measures one pattern compilation for every match.
 *
 * Each pattern keeps its own counter and the program prints them in
 * corpus order, so two timed programs are compared pattern by pattern.
 * A single total would let one pattern that stopped matching cancel
 * another that started, and the timing difference between the two runs
 * would then be read as a cost rather than as a disagreement. A separate
 * counter costs the loop exactly what one shared counter costs.
 */
function timedProgram(
  entries: readonly RegExpProbeCase[],
  construct: (entry: RegExpProbeCase, index: number) => string,
  hoisted: readonly string[],
): string {
  const lines = [...hoisted];
  for (const [index] of entries.entries()) {
    lines.push(`let matched${index} = 0;`);
  }
  lines.push(
    `for (let round = 0; round < ${timedIterations}; round = round + 1) {`,
  );
  for (const [index, entry] of entries.entries()) {
    lines.push(
      `  if (${construct(entry, index)}` +
        `.test(${stringLiteral(timedSubject(entry))})) ` +
        `matched${index} = matched${index} + 1;`,
    );
  }
  lines.push("}");
  const counts = entries.map((_entry, index) => `matched${index}`).join(", ");
  lines.push(`console.log([${counts}].join(","));`);
  return `${lines.join("\n")}\n`;
}

/**
 * The diagnostic a boundary program has to print.
 *
 * The runtime reports a reached matcher limit as one located
 * `OSEO2001`, and that is the observation the program exists for, so a
 * nonzero exit without it is a different failure rather than evidence.
 */
export const boundaryDiagnostic = "error[OSEO2001]";

/**
 * One program that reaches an owned matcher boundary.
 *
 * It uses the whole input rather than one repetition, because the
 * boundary is what the whole input reaches, and it exists to observe how
 * the runtime reports that boundary. It carries exactly one case: a
 * reached boundary is one located diagnostic that ends the program, so a
 * second case in the same program would never be attempted and would
 * still be counted.
 */
function boundaryBody(entry: RegExpProbeCase): string {
  const input = entry.inputs[0];
  if (input == null) {
    throw new Error(`The boundary case ${entry.id} names no input.`);
  }
  return (
    `const answer = ${regExpLiteral(entry)}` +
    `.test(${stringLiteral(probeInputText(input))});\n` +
    'console.log(answer ? "1" : "0");\n'
  );
}

/**
 * The literal every paired control uses in place of a corpus pattern.
 *
 * A control keeps the statements, the subjects, and the descriptor count
 * of the program it is paired with and replaces only the pattern, so the
 * difference between them is what the corpus artifacts cost above the
 * smallest artifact there is.
 */
const controlPattern: RegExpProbeCase = {
  flags: "",
  id: "control",
  inputs: [],
  note: "The smallest artifact: one character, one instruction.",
  origin: "stress",
  provenance: "Constructed paired control.",
  source: "x",
};

/**
 * One program that answers each pattern exactly once.
 *
 * It prints one digit for each pattern in corpus order rather than a
 * total, so two programs over the same patterns are compared pattern by
 * pattern instead of by a sum in which two disagreements could cancel.
 */
function programBody(
  entries: readonly RegExpProbeCase[],
  construct: (entry: RegExpProbeCase) => string,
): string {
  const lines = ['let answers = "";'];
  for (const entry of entries) {
    lines.push(
      `answers = answers + (${construct(entry)}` +
        `.test(${stringLiteral(subject(entry))}) ? "1" : "0");`,
    );
  }
  lines.push("console.log(answers);");
  return `${lines.join("\n")}\n`;
}

function dynamicConstruction(entry: RegExpProbeCase): string {
  return (
    `new RegExp(${stringLiteral(entry.source)}, ` +
    `${stringLiteral(entry.flags)})`
  );
}

/** The programs the code-size probe builds, in report order. */
export function sizePrograms(): readonly SizeProgram[] {
  const { shared } = sharedPatterns();
  const { excluded, timed } = timedPatterns();
  const boundary = regExpProbeCorpus.filter((entry) =>
    excluded.some(
      (dropped) =>
        dropped.id === entry.id && dropped.reason.startsWith("reaches the"),
    ),
  );
  const first = regExpProbeCorpus.slice(0, 1);
  const hoisted = timed.map(
    (entry, index) => `const pattern${index} = ${dynamicConstruction(entry)};`,
  );
  const timedAttempts = timed.length * timedIterations;
  return [
    { attempts: 0, id: "baseline", patterns: 0, source: "console.log(0);\n" },
    {
      attempts: first.length,
      id: "literal-one",
      patterns: first.length,
      source: programBody(first, regExpLiteral),
    },
    {
      attempts: regExpProbeCorpus.length,
      id: "literal-all",
      patterns: regExpProbeCorpus.length,
      source: programBody(regExpProbeCorpus, regExpLiteral),
    },
    {
      attempts: regExpProbeCorpus.length,
      id: "literal-control",
      patterns: regExpProbeCorpus.length,
      source: programBody(regExpProbeCorpus, () =>
        regExpLiteral(controlPattern),
      ),
    },
    {
      attempts: shared.length,
      id: "literal-shared",
      patterns: shared.length,
      source: programBody(shared, regExpLiteral),
    },
    {
      attempts: shared.length,
      id: "dynamic-shared",
      patterns: shared.length,
      source: programBody(shared, dynamicConstruction),
    },
    {
      attempts: timedAttempts,
      id: "literal-match",
      patterns: timed.length,
      source: timedProgram(timed, regExpLiteral, []),
    },
    {
      attempts: timedAttempts,
      id: "dynamic-match",
      patterns: timed.length,
      source: timedProgram(
        timed,
        (_entry, index) => `pattern${index}`,
        hoisted,
      ),
    },
    {
      attempts: timedAttempts,
      id: "dynamic-construct",
      patterns: timed.length,
      source: timedProgram(timed, dynamicConstruction, []),
    },
    ...boundary.map((entry) => ({
      attempts: 1,
      expectDiagnostic: boundaryDiagnostic,
      id: `literal-boundary-${entry.id}`,
      patterns: 1,
      source: boundaryBody(entry),
    })),
  ];
}
