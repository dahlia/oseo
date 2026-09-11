/**
 * The resource-behavior probe.
 *
 * [*PLAN-REGEXP.md*](../../PLAN-REGEXP.md) requires the probe to record
 * compile work, match work, and temporary memory for patterns that cause
 * large backtracking trees, many captures, deep assertions, and repeated
 * empty matches, and it forbids answering a pathological pattern with a
 * clock or a wrong result.
 *
 * The peak entry counts are measured rather than estimated. The executor
 * reports which owned boundary one attempt reached, and lowering a
 * boundary can only replace an answer with that failure, so the smallest
 * backtrack-entry and trail-entry limits at which one attempt still
 * reaches its ordinary answer are its peaks. The search is over those
 * two limits with the other two left at their reviewed defaults.
 *
 * The entry counts are the measurement. The two byte figures beside them
 * are derived from those counts and from the runtime's own layout, and
 * both describe one attempt's five growing arrays and its registers
 * rather than everything a match holds. `workingBytes` is what the peaks
 * occupy packed. `reservedArrayBytes` is what the runtime requests for
 * those arrays: each is allocated at 64 entries, doubles when it fills,
 * and never shrinks within an attempt, so a peak is rounded up to 64 or
 * to the next power of two, and the register array is added.
 *
 * Neither is total memory. `reservedArrayBytes` charges no allocator
 * rounding or bookkeeping, no machine structure, and nothing the matcher
 * holds outside these arrays, so it is exact for the arrays it names and
 * a floor for one attempt's whole cost.
 */

import {
  defaultRegExpExecutionLimits,
  searchRegExpMatcher,
} from "../../packages/compiler/src/index.ts";
import type {
  RegExpExecution,
  RegExpExecutionLimits,
  RegExpMatcherProgram,
} from "../../packages/compiler/src/index.ts";

import { probeInputText } from "./corpus.ts";
import type { ProbeArtifact } from "./artifact.ts";

/**
 * The width one retained backtrack entry occupies in the runtime.
 *
 * The runtime keeps one attempt's choices in three parallel arrays: the
 * resume address and the trail height as `uint32_t`, and the input
 * position as `int64_t`. One entry is therefore 4, 8, and 4 bytes.
 */
export const backtrackEntryBytes = 16;

/**
 * The width one retained trail entry occupies in the runtime.
 *
 * A trail entry is the register index as `uint32_t` and its previous
 * value as `int64_t`, in two parallel arrays.
 */
export const trailEntryBytes = 12;

/**
 * The width one register occupies in the runtime.
 *
 * Every attempt allocates one `int64_t` for each register the program
 * declares, and that array belongs to neither growing peak.
 */
export const registerBytes = 8;

/**
 * One measured attempt and the peak entry counts it needed.
 *
 * A peak is `undefined` when the ordinary answer is that dimension's own
 * reviewed boundary. That says the peak is above the reviewed limit,
 * which is the largest value this search can ask about, rather than that
 * the attempt has no peak.
 */
export interface ResourceRow {
  readonly buildNanoseconds: number;
  readonly characters: number;
  readonly deterministic: boolean;
  readonly id: string;
  readonly inputId: string;
  readonly instructions: number;
  readonly limit: string | undefined;
  readonly outcome: string;
  readonly peakBacktrackEntries: number | undefined;
  readonly peakTrailEntries: number | undefined;
  readonly registers: number;
  readonly reservedArrayBytes: number | undefined;
  readonly steps: number;
  readonly workingBytes: number | undefined;
}

/**
 * The entries the runtime reserves once a growing array has held
 * `entries` of them.
 *
 * The array is allocated at 64 entries on the first push and doubles
 * whenever it fills, so its capacity is 64 or the next power of two.
 */
function reservedEntries(entries: number): number {
  if (entries === 0) return 0;
  let capacity = 64;
  while (capacity < entries) capacity *= 2;
  return capacity;
}

function attempt(
  program: RegExpMatcherProgram,
  text: string,
  limits: RegExpExecutionLimits,
): RegExpExecution {
  return searchRegExpMatcher({ limits, program, startIndex: 0, text });
}

/** The owned boundary one attempt reached, or `undefined`. */
function reachedLimit(execution: RegExpExecution): string | undefined {
  return execution.outcome === "limit" ? execution.limit : undefined;
}

function limitsWith(
  backtrackEntries: number,
  trailEntries: number,
): RegExpExecutionLimits {
  return {
    backtrackEntries,
    steps: defaultRegExpExecutionLimits.steps,
    trailEntries,
  };
}

/**
 * The smallest limit at which the attempt still reaches its ordinary
 * answer, found over a monotone boundary.
 *
 * `reached` names the dimension being lowered. Below the peak the
 * attempt fails on that dimension and above it the attempt answers as it
 * does at the reviewed default, so the boundary is monotone and the
 * ordinary answer may itself be a different dimension's limit.
 *
 * The search doubles from one before it bisects, rather than bisecting
 * the whole reviewed range. Both find the same peak, because both only
 * ask the monotone question, but a sufficient limit is the expensive
 * answer here: it runs the attempt to completion, while an insufficient
 * one stops at the boundary. Every peak in the corpus is small against a
 * reviewed limit of four million entries, so doubling asks that
 * expensive question a few times where bisection would ask it about
 * half of twenty-two times.
 */
function smallestSufficient(
  program: RegExpMatcherProgram,
  text: string,
  build: (value: number) => RegExpExecutionLimits,
  reached: string,
  ceiling: number,
): number {
  const insufficient = (value: number): boolean => {
    const result = attempt(program, text, build(value));
    return result.outcome === "limit" && result.limit === reached;
  };
  let low = 0;
  let high = 1;
  while (high < ceiling && insufficient(high)) {
    low = high + 1;
    high *= 2;
  }
  if (high > ceiling) high = ceiling;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (insufficient(middle)) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Measure one artifact over one input. */
function measureInput(
  artifact: ProbeArtifact,
  inputId: string,
  text: string,
  buildNanoseconds: number,
): ResourceRow {
  const program = artifact.program;
  const ordinary = attempt(program, text, defaultRegExpExecutionLimits);
  const ordinaryLimit = reachedLimit(ordinary);
  const again = attempt(program, text, defaultRegExpExecutionLimits);
  const repeats =
    again.outcome === ordinary.outcome &&
    reachedLimit(again) === ordinaryLimit &&
    again.steps === ordinary.steps;
  const base = {
    buildNanoseconds,
    characters: text.length,
    id: artifact.entry.id,
    inputId,
    instructions: artifact.instructions,
    limit: ordinaryLimit,
    outcome: ordinary.outcome,
    registers: artifact.registers,
    steps: ordinary.steps,
  };
  // The ordinary answer is whatever the reviewed defaults produce,
  // including a reached step boundary: a pattern that exhausts the step
  // limit still holds a finite stack and trail while it does, and those
  // are as much a resource observation as a completed match. A dimension
  // is left unmeasured only when the ordinary answer is that dimension's
  // own boundary, because the reviewed limit is then the largest value
  // this search can ask about and the peak is above it.
  const backtrack =
    ordinaryLimit === "backtrack-entries"
      ? undefined
      : smallestSufficient(
          program,
          text,
          (value) =>
            limitsWith(value, defaultRegExpExecutionLimits.trailEntries),
          "backtrack-entries",
          defaultRegExpExecutionLimits.backtrackEntries,
        );
  const trail =
    ordinaryLimit === "trail-entries"
      ? undefined
      : smallestSufficient(
          program,
          text,
          (value) =>
            limitsWith(defaultRegExpExecutionLimits.backtrackEntries, value),
          "trail-entries",
          defaultRegExpExecutionLimits.trailEntries,
        );
  if (backtrack == null || trail == null) {
    return {
      ...base,
      deterministic: repeats,
      peakBacktrackEntries: backtrack,
      peakTrailEntries: trail,
      reservedArrayBytes: undefined,
      workingBytes: undefined,
    };
  }
  const belowBacktrack =
    backtrack === 0
      ? undefined
      : attempt(program, text, limitsWith(backtrack - 1, trail));
  const atPeak = attempt(program, text, limitsWith(backtrack, trail));
  return {
    ...base,
    deterministic:
      repeats &&
      atPeak.outcome === ordinary.outcome &&
      reachedLimit(atPeak) === ordinaryLimit &&
      atPeak.steps === ordinary.steps &&
      (belowBacktrack == null ||
        reachedLimit(belowBacktrack) === "backtrack-entries"),
    peakBacktrackEntries: backtrack,
    peakTrailEntries: trail,
    reservedArrayBytes:
      reservedEntries(backtrack) * backtrackEntryBytes +
      reservedEntries(trail) * trailEntryBytes +
      artifact.registers * registerBytes,
    workingBytes: backtrack * backtrackEntryBytes + trail * trailEntryBytes,
  };
}

/** The number of builds timed for one compile-work observation. */
const buildSamples = 5;

/** Measure one artifact over every input its corpus entry names. */
export function measureResources(
  artifact: ProbeArtifact,
  rebuild: () => void,
): readonly ResourceRow[] {
  let best = Number.POSITIVE_INFINITY;
  for (let sample = 0; sample < buildSamples; sample += 1) {
    const started = process.hrtime.bigint();
    rebuild();
    const taken = Number(process.hrtime.bigint() - started);
    if (taken < best) best = taken;
  }
  return artifact.entry.inputs.map((input) =>
    measureInput(artifact, input.id, probeInputText(input), best),
  );
}
