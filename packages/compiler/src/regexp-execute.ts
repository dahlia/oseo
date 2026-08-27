import { checkRegExpMatcherBound } from "./regexp-matcher.ts";
import type {
  RegExpMatcherCanonicalization,
  RegExpMatcherProgram,
  RegExpMatcherSet,
} from "./regexp-matcher.ts";
import type { RegExpSpan } from "./regexp.ts";

/** One owned resource boundary the executor can reach. */
export type RegExpExecutionLimit =
  | "backtrack-entries"
  | "steps"
  | "trail-entries";

/**
 * Owned boundaries applied while one match attempt runs.
 *
 * ECMA-262 bounds none of these. Reaching one is an owned failure that the
 * caller observes: the executor never returns a wrong match, and never
 * stops on a clock, so the same artifact, input, and limits always produce
 * the same answer on every host and target.
 */
export interface RegExpExecutionLimits {
  readonly backtrackEntries: number;
  readonly steps: number;
  readonly trailEntries: number;
}

/** The reviewed default execution limits. */
export const defaultRegExpExecutionLimits: RegExpExecutionLimits = {
  backtrackEntries: 0x40_0000,
  steps: 0x100_0000,
  trailEntries: 0x40_0000,
};

/** One match attempt over one artifact. */
export interface RegExpExecutionInput {
  readonly limits?: RegExpExecutionLimits;
  readonly program: RegExpMatcherProgram;
  readonly startIndex: number;
  readonly text: string;
}

/**
 * One successful match.
 *
 * `captures[0]` is the whole match and `captures[index]` is capturing
 * group `index`, which is undefined when the group did not participate.
 * Every span is a half-open range of UTF-16 code units into the input.
 */
export interface RegExpMatchedExecution {
  readonly captures: readonly (RegExpSpan | undefined)[];
  readonly outcome: "matched";
  readonly steps: number;
}

/** One attempt that completed with no match. */
export interface RegExpUnmatchedExecution {
  readonly outcome: "unmatched";
  readonly steps: number;
}

/** One attempt that reached an owned resource boundary. */
export interface RegExpLimitedExecution {
  readonly limit: RegExpExecutionLimit;
  readonly outcome: "limit";
  readonly steps: number;
}

/** The outcome of one match attempt. */
export type RegExpExecution =
  | RegExpLimitedExecution
  | RegExpMatchedExecution
  | RegExpUnmatchedExecution;

/** An unset capture register. */
const unset = -1;

/**
 * Reject a request a caller built wrong.
 *
 * A start position that is not a safe integer is not a position at all,
 * and a limit that is not a count would silently disable the boundary it
 * names. Both are caller defects, so both throw rather than producing a
 * match state derived from them. A start position outside the input is a
 * defined query with a defined answer and stays an ordinary outcome.
 */
function checkRequest(request: RegExpExecutionInput): RegExpExecutionLimits {
  if (!Number.isSafeInteger(request.startIndex)) {
    throw new RangeError("A start position must be a safe integer.");
  }
  const limits = request.limits ?? defaultRegExpExecutionLimits;
  checkRegExpMatcherBound(limits.backtrackEntries, "A backtrack-entry limit");
  checkRegExpMatcherBound(limits.steps, "A step limit");
  checkRegExpMatcherBound(limits.trailEntries, "A trail-entry limit");
  return limits;
}

/** Whether one inversion list holds one character. */
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

function canonicalize(
  table: RegExpMatcherCanonicalization | undefined,
  character: number,
): number {
  if (table == null) return character;
  const characters = table.characters;
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    const value = characters[middle] ?? 0;
    if (value === character) return table.canonical[middle] ?? character;
    if (value < character) low = middle + 1;
    else high = middle;
  }
  return character;
}

/**
 * One character of the input read forward from `index`.
 *
 * A pattern with `u` or `v` matches a list of code points and every other
 * pattern matches a list of UTF-16 code units, which is the only place the
 * flag set changes what one position advances by. A lone surrogate is one
 * character in both readings.
 */
function characterAt(
  text: string,
  index: number,
  unicodeMode: boolean,
): number {
  const unit = text.charCodeAt(index);
  if (!unicodeMode || unit < 0xd8_00 || unit > 0xdb_ff) return unit;
  const trail = text.charCodeAt(index + 1);
  if (Number.isNaN(trail) || trail < 0xdc_00 || trail > 0xdf_ff) return unit;
  return (unit - 0xd8_00) * 0x4_00 + (trail - 0xdc_00) + 0x1_00_00;
}

/** How many code units the character starting at `index` occupies. */
function widthAt(text: string, index: number, unicodeMode: boolean): number {
  return characterAt(text, index, unicodeMode) > 0xff_ff ? 2 : 1;
}

/** How many code units the character ending at `index` occupies. */
function widthBefore(
  text: string,
  index: number,
  unicodeMode: boolean,
): number {
  if (!unicodeMode || index < 2) return 1;
  const trail = text.charCodeAt(index - 1);
  const lead = text.charCodeAt(index - 2);
  const paired =
    trail >= 0xdc_00 && trail <= 0xdf_ff && lead >= 0xd8_00 && lead <= 0xdb_ff;
  return paired ? 2 : 1;
}

/** The character ending at `index`, or -1 at the start of the input. */
function characterBefore(
  text: string,
  index: number,
  unicodeMode: boolean,
): number {
  if (index <= 0) return -1;
  return characterAt(
    text,
    index - widthBefore(text, index, unicodeMode),
    unicodeMode,
  );
}

/**
 * The position one attempt actually starts at.
 *
 * The edition converts a string index into an index into the character
 * list it matches over, and under `u` or `v` both code units of a
 * surrogate pair belong to the one character they encode. A start index
 * that splits a pair therefore names that character, not its trailing
 * code unit, so the attempt begins at the pair.
 */
function alignedStart(
  text: string,
  index: number,
  unicodeMode: boolean,
): number {
  if (!unicodeMode || index <= 0 || index >= text.length) return index;
  const trail = text.charCodeAt(index);
  const lead = text.charCodeAt(index - 1);
  const paired =
    trail >= 0xdc_00 && trail <= 0xdf_ff && lead >= 0xd8_00 && lead <= 0xdb_ff;
  return paired ? index - 1 : index;
}

/** The four code points the LineTerminator production names. */
function isLineTerminator(character: number): boolean {
  return (
    character === 0x0a ||
    character === 0x0d ||
    character === 0x20_28 ||
    character === 0x20_29
  );
}

/**
 * The mutable state of one attempt.
 *
 * Every register write is recorded on a trail, so one backtrack entry
 * restores the whole state by truncating the trail to a recorded height
 * rather than by copying the registers. Both stacks are explicit and
 * checked, so a deeply backtracking pattern reports an owned limit instead
 * of consuming a native call stack.
 */
interface Machine {
  readonly limits: RegExpExecutionLimits;
  readonly program: RegExpMatcherProgram;
  readonly registers: number[];
  readonly stackIndex: number[];
  readonly stackProgram: number[];
  readonly stackTrail: number[];
  readonly text: string;
  readonly trailRegister: number[];
  readonly trailValue: number[];
  readonly unicodeMode: boolean;
  index: number;
  limit: RegExpExecutionLimit | undefined;
  steps: number;
}

function write(machine: Machine, register: number, value: number): boolean {
  if (machine.trailRegister.length >= machine.limits.trailEntries) {
    machine.limit = "trail-entries";
    return false;
  }
  machine.trailRegister.push(register);
  machine.trailValue.push(machine.registers[register] ?? unset);
  machine.registers[register] = value;
  return true;
}

function undoTrail(machine: Machine, height: number): void {
  while (machine.trailRegister.length > height) {
    const register = machine.trailRegister.pop() ?? 0;
    machine.registers[register] = machine.trailValue.pop() ?? unset;
  }
}

function push(machine: Machine, address: number): boolean {
  if (machine.stackProgram.length >= machine.limits.backtrackEntries) {
    machine.limit = "backtrack-entries";
    return false;
  }
  machine.stackProgram.push(address);
  machine.stackIndex.push(machine.index);
  machine.stackTrail.push(machine.trailRegister.length);
  return true;
}

/** The address one backtrack entry resumes at, or -1 when none is left. */
function pop(machine: Machine): number {
  const address = machine.stackProgram.pop();
  if (address == null) return -1;
  machine.index = machine.stackIndex.pop() ?? 0;
  undoTrail(machine, machine.stackTrail.pop() ?? 0);
  return address;
}

/**
 * The outcome of one backreference, with the steps a lowering charges.
 *
 * A lowering writes one instruction per candidate capture, so `steps` is
 * how many of those a native program executes: every candidate when the
 * reference succeeds, because a capture that did not participate matches
 * the empty string, and only the candidates up to and including the one
 * that failed otherwise. `limited` reports that the step budget ran out
 * before a candidate could run, which is where a lowered program stops.
 * Charging that here is what keeps the artifact's reviewed step limit a
 * bound on the lowered program rather than on this array's length.
 */
interface BackreferenceAttempt {
  readonly limited: boolean;
  readonly matched: boolean;
  readonly steps: number;
}

/**
 * Match one backreference, or report that the path fails.
 *
 * The candidates run one at a time, in the order a lowering writes them,
 * and `allowed` is how many of them the remaining step budget admits, so
 * a request with one step left reads one candidate rather than the whole
 * list. A candidate whose capture did not participate matches the empty
 * string; the edition lets at most one of them participate, and running
 * each in turn is what makes that a consequence rather than an
 * assumption.
 */
function matchBackreference(
  machine: Machine,
  slots: readonly number[],
  backward: boolean,
  ignoreCase: boolean,
  allowed: number,
): BackreferenceAttempt {
  const total = Math.max(slots.length, 1);
  const table = ignoreCase ? machine.program.canonicalization : undefined;
  for (let candidate = 0; candidate < total; candidate += 1) {
    if (candidate >= allowed) {
      return { limited: true, matched: false, steps: allowed };
    }
    const refused = { limited: false, matched: false, steps: candidate + 1 };
    const slot = slots[candidate];
    if (slot == null) continue;
    const start = machine.registers[slot] ?? unset;
    const end = machine.registers[slot + 1] ?? unset;
    if (start === unset || end === unset) continue;
    const length = end - start;
    const target = backward ? machine.index - length : machine.index;
    if (target < 0 || target + length > machine.text.length) return refused;
    let source = start;
    let compared = target;
    let equal = true;
    while (source < end) {
      const width = widthAt(machine.text, source, machine.unicodeMode);
      const left = characterAt(machine.text, source, machine.unicodeMode);
      const right = characterAt(machine.text, compared, machine.unicodeMode);
      if (canonicalize(table, left) !== canonicalize(table, right)) {
        equal = false;
        break;
      }
      source += width;
      compared += width;
    }
    if (!equal) return refused;
    machine.index = backward ? target : target + length;
  }
  return { limited: false, matched: true, steps: total };
}

function matchesBoundary(machine: Machine, set: RegExpMatcherSet): boolean {
  const before = characterBefore(
    machine.text,
    machine.index,
    machine.unicodeMode,
  );
  const wordBefore = before >= 0 && setHas(set, before);
  const wordAfter =
    machine.index < machine.text.length &&
    setHas(set, characterAt(machine.text, machine.index, machine.unicodeMode));
  return wordBefore !== wordAfter;
}

function matchesEdge(
  machine: Machine,
  assertion: "end" | "start",
  multiline: boolean,
): boolean {
  if (assertion === "start") {
    if (machine.index === 0) return true;
    if (!multiline) return false;
    return isLineTerminator(
      characterBefore(machine.text, machine.index, machine.unicodeMode),
    );
  }
  if (machine.index === machine.text.length) return true;
  if (!multiline) return false;
  return isLineTerminator(
    characterAt(machine.text, machine.index, machine.unicodeMode),
  );
}

function collectCaptures(
  machine: Machine,
): readonly (RegExpSpan | undefined)[] {
  const total = machine.program.captures.length + 1;
  const captures: (RegExpSpan | undefined)[] = [];
  for (let index = 0; index < total; index += 1) {
    const start = machine.registers[2 * index] ?? unset;
    const end = machine.registers[2 * index + 1] ?? unset;
    captures.push(
      start === unset || end === unset ? undefined : { end, start },
    );
  }
  return captures;
}

/**
 * Run one anchored match attempt at one position.
 *
 * The attempt starts at `startIndex` and never searches a later position;
 * `searchRegExpMatcher` owns that loop. Under `u` or `v` a start index
 * that splits a surrogate pair names the character the pair encodes, so
 * the attempt begins at the pair rather than at its trailing code unit.
 */
export function matchRegExpMatcher(
  request: RegExpExecutionInput,
): RegExpExecution {
  const { program, startIndex, text } = request;
  const limits = checkRequest(request);
  if (startIndex < 0 || startIndex > text.length) {
    return { outcome: "unmatched", steps: 0 };
  }
  const machine: Machine = {
    index: alignedStart(text, startIndex, program.unicodeMode),
    limit: undefined,
    limits,
    program,
    registers: Array.from({ length: program.registers }, () => unset),
    stackIndex: [],
    stackProgram: [],
    stackTrail: [],
    steps: 0,
    text,
    trailRegister: [],
    trailValue: [],
    unicodeMode: program.unicodeMode,
  };
  for (
    let index = 2 * (program.captures.length + 1);
    index < program.registers;
    index += 1
  ) {
    machine.registers[index] = 0;
  }
  let address = 0;
  for (;;) {
    if (machine.steps >= limits.steps) {
      return { limit: "steps", outcome: "limit", steps: machine.steps };
    }
    machine.steps += 1;
    const instruction = program.instructions[address];
    if (instruction == null) {
      return { outcome: "unmatched", steps: machine.steps };
    }
    let failed = false;
    if (instruction.kind === "accept") {
      return {
        captures: collectCaptures(machine),
        outcome: "matched",
        steps: machine.steps,
      };
    } else if (instruction.kind === "consume") {
      const width = instruction.backward
        ? widthBefore(text, machine.index, machine.unicodeMode)
        : widthAt(text, machine.index, machine.unicodeMode);
      const at = instruction.backward ? machine.index - width : machine.index;
      const next = instruction.backward ? at : machine.index + width;
      const set = program.sets[instruction.set] ?? [];
      if (
        at < 0 ||
        at >= text.length ||
        next < 0 ||
        next > text.length ||
        !setHas(set, characterAt(text, at, machine.unicodeMode))
      ) {
        failed = true;
      } else {
        machine.index = next;
        address += 1;
      }
    } else if (instruction.kind === "edge") {
      if (matchesEdge(machine, instruction.assertion, instruction.multiline)) {
        address += 1;
      } else failed = true;
    } else if (instruction.kind === "boundary") {
      const set = program.sets[instruction.set] ?? [];
      if (matchesBoundary(machine, set) !== instruction.negated) address += 1;
      else failed = true;
    } else if (instruction.kind === "save") {
      if (!write(machine, instruction.slot, machine.index)) {
        return limitReached(machine);
      }
      address += 1;
    } else if (instruction.kind === "clear") {
      for (let slot = instruction.from; slot < instruction.to; slot += 1) {
        if (!write(machine, slot, unset)) return limitReached(machine);
      }
      address += 1;
    } else if (instruction.kind === "fork") {
      if (!push(machine, instruction.alternative)) {
        return limitReached(machine);
      }
      address = instruction.preferred;
    } else if (instruction.kind === "jump") {
      address = instruction.target;
    } else if (instruction.kind === "repeat") {
      const done = machine.registers[instruction.counter] ?? 0;
      if (done < instruction.minimum) address = instruction.enter;
      else if (done >= instruction.maximum) address = instruction.exit;
      else if (instruction.greedy) {
        if (!push(machine, instruction.exit)) return limitReached(machine);
        address = instruction.enter;
      } else {
        if (!push(machine, instruction.enter)) return limitReached(machine);
        address = instruction.exit;
      }
    } else if (instruction.kind === "repeat-init") {
      if (!write(machine, instruction.counter, 0)) return limitReached(machine);
      address += 1;
    } else if (instruction.kind === "repeat-enter") {
      const done = machine.registers[instruction.counter] ?? 0;
      if (!write(machine, instruction.counter, done + 1)) {
        return limitReached(machine);
      }
      if (!write(machine, instruction.position, machine.index)) {
        return limitReached(machine);
      }
      for (
        let slot = instruction.clearFrom;
        slot < instruction.clearTo;
        slot += 1
      ) {
        if (!write(machine, slot, unset)) return limitReached(machine);
      }
      address = instruction.body;
    } else if (instruction.kind === "repeat-end") {
      const done = (machine.registers[instruction.counter] ?? 1) - 1;
      const started = machine.registers[instruction.position] ?? unset;
      if (done >= instruction.minimum && started === machine.index) {
        failed = true;
      } else address = instruction.head;
    } else if (instruction.kind === "look-start") {
      if (!push(machine, instruction.onFail)) return limitReached(machine);
      if (!write(machine, instruction.frame, machine.stackProgram.length - 1)) {
        return limitReached(machine);
      }
      address = instruction.body;
    } else if (instruction.kind === "look-end") {
      const frame = machine.registers[instruction.frame] ?? 0;
      const entryIndex = machine.stackIndex[frame] ?? 0;
      const entryTrail = machine.stackTrail[frame] ?? 0;
      machine.stackProgram.length = frame;
      machine.stackIndex.length = frame;
      machine.stackTrail.length = frame;
      machine.index = entryIndex;
      if (instruction.negated) {
        undoTrail(machine, entryTrail);
        failed = true;
      } else address = instruction.exit;
    } else if (instruction.kind === "backreference") {
      // The loop already charged the first candidate, so the budget is
      // that one plus whatever the step limit still admits.
      const attempt = matchBackreference(
        machine,
        instruction.slots,
        instruction.backward,
        instruction.ignoreCase,
        machine.limits.steps - machine.steps + 1,
      );
      machine.steps += attempt.steps - 1;
      if (attempt.limited) {
        return { limit: "steps", outcome: "limit", steps: machine.steps };
      }
      if (attempt.matched) address += 1;
      else failed = true;
    } else failed = true;
    if (failed) {
      const resumed = pop(machine);
      if (resumed < 0) return { outcome: "unmatched", steps: machine.steps };
      address = resumed;
    }
  }
}

function limitReached(machine: Machine): RegExpLimitedExecution {
  return {
    limit: machine.limit ?? "steps",
    outcome: "limit",
    steps: machine.steps,
  };
}

/**
 * Search for the first match at or after one position.
 *
 * This is the position loop of the edition's built-in execution without
 * any object state: a sticky pattern attempts only the given position, and
 * every other pattern advances by one character until the input is
 * exhausted. `lastIndex`, the result array, and `exec` dispatch belong to
 * the unit that adds the `RegExp` intrinsic.
 */
export function searchRegExpMatcher(
  request: RegExpExecutionInput,
): RegExpExecution {
  const { program, text } = request;
  const limits = checkRequest(request);
  let steps = 0;
  if (request.startIndex < 0 || request.startIndex > text.length) {
    return { outcome: "unmatched", steps: 0 };
  }
  let index = alignedStart(text, request.startIndex, program.unicodeMode);
  for (;;) {
    const attempt = matchRegExpMatcher({
      limits: {
        backtrackEntries: limits.backtrackEntries,
        steps: limits.steps - steps,
        trailEntries: limits.trailEntries,
      },
      program,
      startIndex: index,
      text,
    });
    steps += attempt.steps;
    if (attempt.outcome === "matched") {
      return { captures: attempt.captures, outcome: "matched", steps };
    }
    if (attempt.outcome === "limit") {
      return { limit: attempt.limit, outcome: "limit", steps };
    }
    if (program.flags.sticky || index >= text.length) {
      return { outcome: "unmatched", steps };
    }
    index += widthAt(text, index, program.unicodeMode);
  }
}
