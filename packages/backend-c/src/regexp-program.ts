import type {
  RegExpMatcherInstruction,
  RegExpMatcherProgram,
} from "@oseo/compiler";

/**
 * The C encoding of one ahead-of-time compiled regular expression
 * literal.
 *
 * The runtime's matcher executes a flat instruction array over a register
 * file, so this is the same program `@oseo/compiler` built, written in the
 * generated-code ABI's layout. Nothing here decides matching behavior: an
 * encoding that changed choice order, capture visibility, or set contents
 * would make the literal path disagree with the semantic authority.
 */
export interface EncodedRegExpProgram {
  readonly captures: readonly EncodedRegExpCapture[];
  readonly canonicalCharacters: readonly number[];
  readonly canonicalValues: readonly number[];
  readonly flagMask: number;
  readonly flagUnits: readonly number[];
  readonly hasGroupNames: boolean;
  readonly ignoreCase: boolean;
  readonly instructions: readonly EncodedRegExpInstruction[];
  readonly nameUnits: readonly number[];
  readonly registers: number;
  readonly repeats: readonly EncodedRegExpRepeat[];
  readonly setBoundaries: readonly number[];
  readonly setOffsets: readonly number[];
  readonly sourceUnits: readonly number[];
  readonly unicodeMode: boolean;
}

/** One encoded instruction with its four uniform operands. */
export interface EncodedRegExpInstruction {
  readonly modifiers: number;
  readonly opcode: number;
  readonly operands: readonly [number, number, number, number];
}

/** One quantifier's repetition metadata, held out of line. */
export interface EncodedRegExpRepeat {
  readonly clearFrom: number;
  readonly clearTo: number;
  /** `undefined` for an unbounded repetition, which the ABI writes as
   * the largest `uint64_t`. */
  readonly maximum: number | undefined;
  readonly minimum: number;
}

/** One capturing group's optional name, as a span of the name units. */
export interface EncodedRegExpCapture {
  readonly nameLength: number;
  readonly nameOffset: number;
  readonly named: boolean;
}

/** The opcode numbers the runtime's matcher dispatches on. */
const opcodes = {
  accept: 0,
  backreference: 14,
  boundary: 4,
  consume: 2,
  edge: 3,
  fail: 1,
  fork: 6,
  jump: 7,
  lookEnd: 13,
  lookStart: 12,
  repeat: 8,
  repeatEnd: 11,
  repeatEnter: 10,
  repeatInit: 9,
  save: 5,
} as const;

/** The per-instruction modifier bits the runtime's matcher reads. */
const modifiers = {
  backward: 0x01,
  endEdge: 0x20,
  greedy: 0x04,
  ignoreCase: 0x10,
  multiline: 0x08,
  negated: 0x02,
} as const;

/** The normalized flag bits the runtime decodes every accessor from. */
const flagBits = {
  dotAll: 1 << 4,
  global: 1 << 1,
  hasIndices: 1 << 0,
  ignoreCase: 1 << 2,
  multiline: 1 << 3,
  sticky: 1 << 7,
  unicode: 1 << 5,
  unicodeSets: 1 << 6,
} as const;

/** The mutable repetition record collected from one quantifier's triple. */
interface RepeatDraft {
  clearFrom: number;
  clearTo: number;
  maximum: number | undefined;
  minimum: number;
}

function fail(message: string): never {
  throw new Error(`A regular expression literal ${message}`);
}

/** The UTF-16 code units of one string, as the ABI stores text. */
function utf16(value: string): readonly number[] {
  const units: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    units.push(value.charCodeAt(index));
  }
  return units;
}

/**
 * How many encoded instructions one artifact instruction becomes.
 *
 * Every instruction is one instruction except a backreference to a
 * duplicated group name, which the ABI writes as one instruction per
 * candidate capture. At most one of them can have participated in the
 * match, and a slot that did not participate matches the empty string, so
 * running the candidates in order resolves the same capture the artifact
 * selects.
 */
function encodedWidth(instruction: RegExpMatcherInstruction): number {
  if (instruction.kind !== "backreference") return 1;
  if (instruction.slots.length === 0) {
    fail("holds a backreference that names no capture.");
  }
  return instruction.slots.length;
}

/** The repetition table of one artifact and the counter it indexes by. */
interface RepeatTable {
  readonly indices: ReadonlyMap<number, number>;
  readonly records: readonly RepeatDraft[];
}

/**
 * Collect one repetition record per quantifier.
 *
 * A quantifier allocates its own counter register, so the counter is what
 * identifies the `repeat`, `repeat-enter`, and `repeat-end` instructions
 * of one repetition. The bounds live on the decision instruction and the
 * capture range each iteration clears lives on the entry instruction, so
 * the record is complete only after both were seen.
 */
function collectRepeats(program: RegExpMatcherProgram): RepeatTable {
  const indices = new Map<number, number>();
  const records: RepeatDraft[] = [];
  const recordFor = (counter: number): RepeatDraft => {
    const existing = indices.get(counter);
    if (existing != null) {
      const found = records[existing];
      if (found == null) fail("numbers its repetitions inconsistently.");
      return found;
    }
    const record: RepeatDraft = {
      clearFrom: 0,
      clearTo: 0,
      maximum: 0,
      minimum: 0,
    };
    indices.set(counter, records.length);
    records.push(record);
    return record;
  };
  for (const instruction of program.instructions) {
    if (instruction.kind === "repeat") {
      const record = recordFor(instruction.counter);
      record.minimum = instruction.minimum;
      record.maximum = Number.isFinite(instruction.maximum)
        ? instruction.maximum
        : undefined;
    } else if (instruction.kind === "repeat-enter") {
      const record = recordFor(instruction.counter);
      record.clearFrom = instruction.clearFrom;
      record.clearTo = instruction.clearTo;
    } else if (
      instruction.kind === "repeat-init" ||
      instruction.kind === "repeat-end"
    ) {
      recordFor(instruction.counter);
    }
  }
  return { indices, records };
}

function repeatIndex(
  indices: ReadonlyMap<number, number>,
  counter: number,
): number {
  const index = indices.get(counter);
  if (index == null) fail("refers to a repetition it never begins.");
  return index;
}

function encodeInstruction(
  instruction: RegExpMatcherInstruction,
  addresses: readonly number[],
  repeats: ReadonlyMap<number, number>,
): readonly EncodedRegExpInstruction[] {
  const address = (target: number): number => {
    const resolved = addresses[target];
    if (resolved == null) fail("jumps outside its own instructions.");
    return resolved;
  };
  if (instruction.kind === "accept") {
    return [{ modifiers: 0, opcode: opcodes.accept, operands: [0, 0, 0, 0] }];
  }
  if (instruction.kind === "fail") {
    return [{ modifiers: 0, opcode: opcodes.fail, operands: [0, 0, 0, 0] }];
  }
  if (instruction.kind === "consume") {
    return [
      {
        modifiers: instruction.backward ? modifiers.backward : 0,
        opcode: opcodes.consume,
        operands: [instruction.set, 0, 0, 0],
      },
    ];
  }
  if (instruction.kind === "edge") {
    return [
      {
        modifiers:
          (instruction.assertion === "end" ? modifiers.endEdge : 0) |
          (instruction.multiline ? modifiers.multiline : 0),
        opcode: opcodes.edge,
        operands: [0, 0, 0, 0],
      },
    ];
  }
  if (instruction.kind === "boundary") {
    return [
      {
        modifiers: instruction.negated ? modifiers.negated : 0,
        opcode: opcodes.boundary,
        operands: [instruction.set, 0, 0, 0],
      },
    ];
  }
  if (instruction.kind === "save") {
    return [
      {
        modifiers: 0,
        opcode: opcodes.save,
        operands: [instruction.slot, 0, 0, 0],
      },
    ];
  }
  if (instruction.kind === "fork") {
    return [
      {
        modifiers: 0,
        opcode: opcodes.fork,
        operands: [
          address(instruction.preferred),
          address(instruction.alternative),
          0,
          0,
        ],
      },
    ];
  }
  if (instruction.kind === "jump") {
    return [
      {
        modifiers: 0,
        opcode: opcodes.jump,
        operands: [address(instruction.target), 0, 0, 0],
      },
    ];
  }
  if (instruction.kind === "repeat") {
    return [
      {
        modifiers: instruction.greedy ? modifiers.greedy : 0,
        opcode: opcodes.repeat,
        operands: [
          instruction.counter,
          address(instruction.enter),
          address(instruction.exit),
          repeatIndex(repeats, instruction.counter),
        ],
      },
    ];
  }
  if (instruction.kind === "repeat-init") {
    return [
      {
        modifiers: 0,
        opcode: opcodes.repeatInit,
        operands: [instruction.counter, 0, 0, 0],
      },
    ];
  }
  if (instruction.kind === "repeat-enter") {
    return [
      {
        modifiers: 0,
        opcode: opcodes.repeatEnter,
        operands: [
          instruction.counter,
          instruction.position,
          address(instruction.body),
          repeatIndex(repeats, instruction.counter),
        ],
      },
    ];
  }
  if (instruction.kind === "repeat-end") {
    return [
      {
        modifiers: 0,
        opcode: opcodes.repeatEnd,
        operands: [
          instruction.counter,
          address(instruction.head),
          instruction.position,
          repeatIndex(repeats, instruction.counter),
        ],
      },
    ];
  }
  if (instruction.kind === "look-start") {
    return [
      {
        modifiers: 0,
        opcode: opcodes.lookStart,
        operands: [
          instruction.frame,
          address(instruction.body),
          address(instruction.onFail),
          0,
        ],
      },
    ];
  }
  if (instruction.kind === "look-end") {
    return [
      {
        modifiers: instruction.negated ? modifiers.negated : 0,
        opcode: opcodes.lookEnd,
        operands: [instruction.frame, address(instruction.exit), 0, 0],
      },
    ];
  }
  if (instruction.kind === "backreference") {
    const bits =
      (instruction.backward ? modifiers.backward : 0) |
      (instruction.ignoreCase ? modifiers.ignoreCase : 0);
    return instruction.slots.map((slot) => ({
      modifiers: bits,
      opcode: opcodes.backreference,
      operands: [slot, 0, 0, 0] as const,
    }));
  }
  fail(`uses the ${instruction.kind} instruction, which has no C encoding.`);
}

/** The capture table of one artifact and the names it spans. */
interface EncodedCaptureTable {
  readonly captures: readonly EncodedRegExpCapture[];
  readonly nameUnits: readonly number[];
}

function encodeCaptures(program: RegExpMatcherProgram): EncodedCaptureTable {
  const captures: EncodedRegExpCapture[] = [];
  const nameUnits: number[] = [];
  for (let index = 0; index < program.captures.length; index += 1) {
    captures.push({ nameLength: 0, nameOffset: 0, named: false });
  }
  for (const capture of program.captures) {
    const slot = capture.index - 1;
    if (slot < 0 || slot >= captures.length) {
      fail("numbers a capturing group outside its own capture list.");
    }
    if (capture.name == null) continue;
    const units = utf16(capture.name);
    captures[slot] = {
      nameLength: units.length,
      nameOffset: nameUnits.length,
      named: true,
    };
    nameUnits.push(...units);
  }
  return { captures, nameUnits };
}

function flagMask(program: RegExpMatcherProgram): number {
  const flags = program.flags;
  return (
    (flags.hasIndices ? flagBits.hasIndices : 0) |
    (flags.global ? flagBits.global : 0) |
    (flags.ignoreCase ? flagBits.ignoreCase : 0) |
    (flags.multiline ? flagBits.multiline : 0) |
    (flags.dotAll ? flagBits.dotAll : 0) |
    (flags.unicode ? flagBits.unicode : 0) |
    (flags.unicodeSets ? flagBits.unicodeSets : 0) |
    (flags.sticky ? flagBits.sticky : 0)
  );
}

/**
 * Encode one matcher artifact in the generated-code ABI's layout.
 *
 * The artifact addresses its own instructions by position, and a
 * backreference to a duplicated group name expands to one encoded
 * instruction per candidate, so every branch target is remapped through
 * the encoded addresses rather than copied. The artifact builder charges
 * that expansion against its reviewed instruction limit, so the encoded
 * program is bounded by the same limit the artifact is.
 */
export function encodeRegExpProgram(
  program: RegExpMatcherProgram,
): EncodedRegExpProgram {
  const addresses: number[] = [];
  let next = 0;
  for (const instruction of program.instructions) {
    addresses.push(next);
    next += encodedWidth(instruction);
  }
  const repeats = collectRepeats(program);
  const instructions: EncodedRegExpInstruction[] = [];
  for (const instruction of program.instructions) {
    instructions.push(
      ...encodeInstruction(instruction, addresses, repeats.indices),
    );
  }
  const setBoundaries: number[] = [];
  const setOffsets: number[] = [];
  for (const set of program.sets) {
    setOffsets.push(setBoundaries.length);
    setBoundaries.push(...set);
  }
  setOffsets.push(setBoundaries.length);
  const { captures, nameUnits } = encodeCaptures(program);
  const table = program.canonicalization;
  return {
    canonicalCharacters: table == null ? [] : [...table.characters],
    canonicalValues: table == null ? [] : [...table.canonical],
    captures,
    flagMask: flagMask(program),
    flagUnits: utf16(program.flags.text),
    hasGroupNames: captures.some((capture) => capture.named),
    ignoreCase: program.flags.ignoreCase,
    instructions,
    nameUnits,
    registers: program.registers,
    repeats: repeats.records.map((record) => ({
      clearFrom: record.clearFrom,
      clearTo: record.clearTo,
      maximum: record.maximum,
      minimum: record.minimum,
    })),
    setBoundaries,
    setOffsets,
    sourceUnits: utf16(program.source),
    unicodeMode: program.unicodeMode,
  };
}
