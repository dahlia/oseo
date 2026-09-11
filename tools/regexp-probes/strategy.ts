/**
 * The matcher-strategy probe.
 *
 * [*PLAN-REGEXP.md*](../../PLAN-REGEXP.md) names three implementation
 * shapes to compare: the compact ordered matcher that preserves the
 * edition's choice and capture behavior, an automaton path for patterns
 * proven regular, and direct generated C. This probe measures what the
 * ordered matcher does today and what an automaton path would have to
 * hold for the same pattern, and it records the exact fallback each
 * candidate needs.
 *
 * Three approximations are deliberate and reported with the results. The
 * configuration walk treats `edge` and `boundary` as passable, so its
 * count is an upper bound on the configurations a position-aware
 * simulation tracks. The subset construction excludes a program that
 * carries either assertion, because a deterministic automaton would have
 * to widen its state with the preceding character class to keep them,
 * and this probe does not measure that widening. No automaton is built or
 * run, so every automaton number here is a property of the program
 * rather than a measurement of an engine.
 */

import { searchRegExpMatcher } from "../../packages/compiler/src/index.ts";
import type {
  RegExpMatcherProgram,
  RegExpMatcherSet,
} from "../../packages/compiler/src/index.ts";

import { probeInputText } from "./corpus.ts";
import type { ProbeArtifact } from "./artifact.ts";

/** One reason a candidate cannot take one pattern. */
export type StrategyBlocker =
  | "assertion"
  | "backreference"
  | "configuration-cap"
  | "lookaround"
  | "state-cap"
  | "symbol-cap";

/** The reviewed caps this probe applies to its own analysis. */
export interface AutomatonCaps {
  readonly configurations: number;
  readonly states: number;
  readonly symbols: number;
}

/** The caps the reported measurements used. */
export const defaultAutomatonCaps: AutomatonCaps = {
  configurations: 0x1_0000,
  states: 0x1000,
  symbols: 0x800,
};

/** What an automaton path would hold for one pattern. */
export interface AutomatonMeasurement {
  readonly blockers: readonly StrategyBlocker[];
  readonly configurations: number | undefined;
  readonly deterministicStates: number | undefined;
  readonly symbols: number | undefined;
  readonly transitionBytes: number | undefined;
}

/**
 * One measured match attempt.
 *
 * `steps` is the executor's own deterministic work counter, so it is the
 * same on every host. Neither column beside it measures this executor,
 * and only one of the two is a bound:
 *
 *  -  `positionSpan` is a coordinate of the reported answer, not work
 *     any engine has to perform. It is the positions up to the end of
 *     the match when the attempt matched, and the subject's whole
 *     position count when it reported no match; an attempt that reached
 *     a reviewed boundary has no answer to describe and reports nothing
 *     here. Reading it as a cost is wrong in both directions: a sticky
 *     or an anchored failure is settled at the first position and still
 *     prints the whole subject, and a pattern such as `$` reports a
 *     match at an end that no engine has to read through to find; and
 *  -  `configurationCeiling` is the consuming configurations times one
 *     more than the subject's position count, which bounds the
 *     configuration visits a parallel simulation of the same program
 *     performs. It excludes the epsilon-closure work one visit needs, so
 *     it understates the cost of a visit while it overstates how many of
 *     them happen.
 *
 * A position is not always a code unit. In unicode mode the matcher
 * advances over a surrogate pair once, so `positions` counts code points
 * there and code units otherwise, and both columns are counted in
 * positions. `characters` stays the subject's code-unit length, which is
 * its size and the unit every capture index is measured in.
 */
export interface StrategyExecution {
  readonly characters: number;
  readonly configurationCeiling: number | undefined;
  readonly inputId: string;
  readonly nanosecondsPerAttempt: number;
  readonly outcome: string;
  readonly positionSpan: number | undefined;
  readonly positions: number;
  readonly repetitions: number;
  readonly steps: number;
}

/** One corpus entry measured for every candidate shape. */
export interface StrategyRow {
  readonly automaton: AutomatonMeasurement;
  readonly executions: readonly StrategyExecution[];
  readonly id: string;
  readonly instructions: number;
  readonly registers: number;
}

interface Counter {
  readonly domain: number;
  readonly register: number;
}

function counterDomains(program: RegExpMatcherProgram): readonly Counter[] {
  const domains = new Map<number, number>();
  for (const instruction of program.instructions) {
    if (instruction.kind !== "repeat") continue;
    const bound = Number.isFinite(instruction.maximum)
      ? instruction.maximum
      : instruction.minimum;
    const existing = domains.get(instruction.counter) ?? 0;
    domains.set(instruction.counter, Math.max(existing, bound));
  }
  return [...domains]
    .map(([register, bound]) => ({ domain: bound + 1, register }))
    .toSorted((first, second) => first.register - second.register);
}

/**
 * One configuration: an address and every repetition counter.
 *
 * A counter is clamped to its own domain, which is the pattern's bound
 * when the repetition has one and its lower bound otherwise, because
 * above that bound one more iteration changes no later decision.
 */
interface Configuration {
  readonly address: number;
  readonly counters: readonly number[];
}

function configurationKey(configuration: Configuration): string {
  return `${configuration.address}:${configuration.counters.join(",")}`;
}

function withCounter(
  counters: readonly number[],
  slot: number,
  value: number,
): readonly number[] {
  const next = [...counters];
  next[slot] = value;
  return next;
}

interface ClosureResult {
  readonly accepting: boolean;
  readonly consuming: readonly Configuration[];
}

/**
 * Every consuming configuration one configuration reaches without
 * moving the input.
 *
 * A configuration is visited once, which is also how an automaton
 * answers an empty iteration: the ordered matcher's empty-progress rule
 * compares recorded positions instead, and that difference is one of the
 * behaviors an automaton path would have to reproduce elsewhere.
 */
function closure(
  program: RegExpMatcherProgram,
  counters: readonly Counter[],
  start: Configuration,
): ClosureResult {
  const seen = new Set<string>();
  const pending: Configuration[] = [start];
  const consuming: Configuration[] = [];
  let accepting = false;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current == null) break;
    const key = configurationKey(current);
    if (seen.has(key)) continue;
    seen.add(key);
    const instruction = program.instructions[current.address];
    if (instruction == null || instruction.kind === "fail") continue;
    if (instruction.kind === "accept") {
      accepting = true;
      continue;
    }
    if (instruction.kind === "consume") {
      consuming.push(current);
      continue;
    }
    const next = (address: number): Configuration => ({
      address,
      counters: current.counters,
    });
    const slotOf = (register: number): number => {
      const slot = counters.findIndex(
        (counter) => counter.register === register,
      );
      if (slot < 0) {
        throw new Error(
          `A repetition instruction names register ${register}, which no ` +
            "repeat instruction declares.",
        );
      }
      return slot;
    };
    if (
      instruction.kind === "save" ||
      instruction.kind === "clear" ||
      instruction.kind === "edge" ||
      instruction.kind === "boundary"
    ) {
      pending.push(next(current.address + 1));
    } else if (instruction.kind === "jump") {
      pending.push(next(instruction.target));
    } else if (instruction.kind === "fork") {
      pending.push(next(instruction.preferred));
      pending.push(next(instruction.alternative));
    } else if (instruction.kind === "repeat-init") {
      const slot = slotOf(instruction.counter);
      pending.push({
        address: current.address + 1,
        counters: withCounter(current.counters, slot, 0),
      });
    } else if (instruction.kind === "repeat-enter") {
      const slot = slotOf(instruction.counter);
      const domain = counters[slot]?.domain ?? 1;
      const value = Math.min((current.counters[slot] ?? 0) + 1, domain - 1);
      pending.push({
        address: instruction.body,
        counters: withCounter(current.counters, slot, value),
      });
    } else if (instruction.kind === "repeat-end") {
      pending.push(next(instruction.head));
    } else if (instruction.kind === "repeat") {
      const slot = slotOf(instruction.counter);
      const done = current.counters[slot] ?? 0;
      if (done < instruction.minimum) pending.push(next(instruction.enter));
      else if (done >= instruction.maximum)
        pending.push(next(instruction.exit));
      else {
        pending.push(next(instruction.enter));
        pending.push(next(instruction.exit));
      }
    }
  }
  return { accepting, consuming };
}

function programBlockers(
  program: RegExpMatcherProgram,
): readonly StrategyBlocker[] {
  const blockers = new Set<StrategyBlocker>();
  for (const instruction of program.instructions) {
    if (instruction.kind === "backreference") blockers.add("backreference");
    if (instruction.kind === "look-start" || instruction.kind === "look-end") {
      blockers.add("lookaround");
    }
    if (instruction.kind === "edge" || instruction.kind === "boundary") {
      blockers.add("assertion");
    }
  }
  return [...blockers].toSorted();
}

/** One past the largest code point an inversion list can hold. */
const codePointCeiling = 0x11_0000;

/**
 * The interval alphabet the program's consuming sets induce.
 *
 * Each boundary is the representative of the interval that starts at it,
 * so the closing sentinel of an inversion list that reaches the top of
 * the code space is not a symbol: it represents an interval that holds
 * no code point. Counting it would report one alphabet column more than
 * an automaton needs and would charge its transition table for it.
 */
function symbolBoundaries(
  program: RegExpMatcherProgram,
  used: ReadonlySet<number>,
): readonly number[] {
  const boundaries = new Set<number>([0]);
  for (const index of used) {
    const set: RegExpMatcherSet = program.sets[index] ?? [];
    for (const boundary of set) {
      if (boundary < codePointCeiling) boundaries.add(boundary);
    }
  }
  return [...boundaries].toSorted((first, second) => first - second);
}

function setHas(set: RegExpMatcherSet, character: number): boolean {
  let low = 0;
  let high = set.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((set[middle] ?? 0) <= character) low = middle + 1;
    else high = middle;
  }
  return (low & 1) === 1;
}

/**
 * Measure the configuration space and, when a deterministic automaton
 * could keep the pattern's decisions, the states it would hold.
 */
export function measureAutomaton(
  program: RegExpMatcherProgram,
  caps: AutomatonCaps,
): AutomatonMeasurement {
  const blockers = new Set<StrategyBlocker>(programBlockers(program));
  if (blockers.has("backreference") || blockers.has("lookaround")) {
    return {
      blockers: [...blockers].toSorted(),
      configurations: undefined,
      deterministicStates: undefined,
      symbols: undefined,
      transitionBytes: undefined,
    };
  }
  const counters = counterDomains(program);
  const start = closure(program, counters, {
    address: 0,
    counters: counters.map(() => 0),
  });
  const configurations = new Map<string, Configuration>();
  const pending: Configuration[] = [];
  const admit = (configuration: Configuration): void => {
    const key = configurationKey(configuration);
    if (configurations.has(key)) return;
    configurations.set(key, configuration);
    pending.push(configuration);
  };
  for (const configuration of start.consuming) admit(configuration);
  let capped = false;
  while (pending.length > 0) {
    if (configurations.size > caps.configurations) {
      capped = true;
      break;
    }
    const current = pending.pop();
    if (current == null) break;
    const reached = closure(program, counters, {
      address: current.address + 1,
      counters: current.counters,
    });
    for (const configuration of reached.consuming) admit(configuration);
  }
  if (capped) {
    blockers.add("configuration-cap");
    return {
      blockers: [...blockers].toSorted(),
      configurations: undefined,
      deterministicStates: undefined,
      symbols: undefined,
      transitionBytes: undefined,
    };
  }
  const total = configurations.size;
  if (blockers.has("assertion")) {
    return {
      blockers: [...blockers].toSorted(),
      configurations: total,
      deterministicStates: undefined,
      symbols: undefined,
      transitionBytes: undefined,
    };
  }
  const used = new Set<number>();
  for (const configuration of configurations.values()) {
    const instruction = program.instructions[configuration.address];
    if (instruction?.kind === "consume") used.add(instruction.set);
  }
  const boundaries = symbolBoundaries(program, used);
  if (boundaries.length > caps.symbols) {
    blockers.add("symbol-cap");
    return {
      blockers: [...blockers].toSorted(),
      configurations: total,
      deterministicStates: undefined,
      symbols: boundaries.length,
      transitionBytes: undefined,
    };
  }
  const deterministic = measureDeterministic(
    program,
    counters,
    start,
    boundaries,
    caps,
  );
  if (deterministic == null) {
    blockers.add("state-cap");
    return {
      blockers: [...blockers].toSorted(),
      configurations: total,
      deterministicStates: undefined,
      symbols: boundaries.length,
      transitionBytes: undefined,
    };
  }
  return {
    blockers: [...blockers].toSorted(),
    configurations: total,
    deterministicStates: deterministic,
    symbols: boundaries.length,
    transitionBytes: deterministic * boundaries.length * 4,
  };
}

/**
 * Subset construction over the interval alphabet, or `undefined` when the
 * state count passes the reviewed cap.
 *
 * The construction models one anchored attempt rather than the search
 * loop, because that is the artifact the executor runs at one position.
 * A state is the set of consuming configurations together with whether
 * the closure that produced it accepted, so an accepting terminal state
 * and the dead state a failed transition leads to stay distinct, and the
 * count includes that dead state.
 *
 * The construction answers membership only. Capture positions are not
 * part of a deterministic state, which is why a pattern with captures
 * still needs a second pass over the input.
 */
function measureDeterministic(
  program: RegExpMatcherProgram,
  counters: readonly Counter[],
  start: ClosureResult,
  boundaries: readonly number[],
  caps: AutomatonCaps,
): number | undefined {
  const stateKey = (state: ClosureResult): string =>
    `${state.accepting ? "accepting" : "rejecting"}|` +
    state.consuming.map(configurationKey).toSorted().join(",");
  const states = new Map<string, ClosureResult>([[stateKey(start), start]]);
  const pending: ClosureResult[] = [start];
  while (pending.length > 0) {
    if (states.size > caps.states) return undefined;
    const current = pending.pop();
    if (current == null) break;
    for (const boundary of boundaries) {
      const consuming: Configuration[] = [];
      const seen = new Set<string>();
      let accepting = false;
      for (const configuration of current.consuming) {
        const instruction = program.instructions[configuration.address];
        if (instruction?.kind !== "consume") continue;
        const set = program.sets[instruction.set] ?? [];
        if (!setHas(set, boundary)) continue;
        const reached = closure(program, counters, {
          address: configuration.address + 1,
          counters: configuration.counters,
        });
        accepting = accepting || reached.accepting;
        for (const target of reached.consuming) {
          const key = configurationKey(target);
          if (seen.has(key)) continue;
          seen.add(key);
          consuming.push(target);
        }
      }
      const next: ClosureResult = { accepting, consuming };
      const key = stateKey(next);
      if (states.has(key)) continue;
      states.set(key, next);
      pending.push(next);
    }
  }
  return states.size;
}

/** One timed attempt loop. */
interface TimedAttempt {
  readonly nanoseconds: number;
  readonly repetitions: number;
}

/**
 * The matcher positions in the first `units` code units of `text`.
 *
 * A capture index is a code-unit index in every mode, so a position
 * count in unicode mode is the code points those units hold rather than
 * the units themselves.
 */
function positionCount(
  text: string,
  units: number,
  unicodeMode: boolean,
): number {
  if (!unicodeMode) return units;
  let positions = 0;
  for (let index = 0; index < units; index += 1) {
    const unit = text.charCodeAt(index);
    const paired =
      unit >= 0xd800 &&
      unit <= 0xdbff &&
      index + 1 < units &&
      text.charCodeAt(index + 1) >= 0xdc00 &&
      text.charCodeAt(index + 1) <= 0xdfff;
    if (paired) index += 1;
    positions += 1;
  }
  return positions;
}

/** Repeat one attempt until it has run for at least this long. */
const timingBudgetNanoseconds = 20_000_000;

/** The largest number of repetitions one timing loop performs. */
const timingRepetitionCap = 2000;

function timeAttempt(
  program: RegExpMatcherProgram,
  text: string,
): TimedAttempt {
  searchRegExpMatcher({ program, startIndex: 0, text });
  let repetitions = 0;
  let best = Number.POSITIVE_INFINITY;
  let elapsed = 0;
  while (
    elapsed < timingBudgetNanoseconds &&
    repetitions < timingRepetitionCap
  ) {
    const started = process.hrtime.bigint();
    searchRegExpMatcher({ program, startIndex: 0, text });
    const taken = Number(process.hrtime.bigint() - started);
    elapsed += taken;
    repetitions += 1;
    if (taken < best) best = taken;
  }
  return { nanoseconds: best, repetitions };
}

/** Measure one artifact for every candidate shape. */
export function measureStrategy(
  artifact: ProbeArtifact,
  caps: AutomatonCaps,
): StrategyRow {
  const automaton = measureAutomaton(artifact.program, caps);
  const executions = artifact.entry.inputs.map((input) => {
    const text = probeInputText(input);
    const attempt = searchRegExpMatcher({
      program: artifact.program,
      startIndex: 0,
      text,
    });
    const timing = timeAttempt(artifact.program, text);
    const configurations = automaton.configurations;
    const matched =
      attempt.outcome === "matched" ? attempt.captures[0] : undefined;
    const unicodeMode = artifact.program.unicodeMode;
    const positions = positionCount(text, text.length, unicodeMode);
    const end = matched?.end ?? text.length;
    const span =
      attempt.outcome === "limit"
        ? undefined
        : positionCount(text, end, unicodeMode);
    return {
      characters: text.length,
      configurationCeiling:
        configurations == null ? undefined : configurations * (positions + 1),
      inputId: input.id,
      nanosecondsPerAttempt: timing.nanoseconds,
      outcome: attempt.outcome,
      positionSpan: span,
      positions,
      repetitions: timing.repetitions,
      steps: attempt.steps,
    };
  });
  return {
    automaton,
    executions,
    id: artifact.entry.id,
    instructions: artifact.instructions,
    registers: artifact.registers,
  };
}
