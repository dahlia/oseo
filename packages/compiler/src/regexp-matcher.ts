import {
  regExpUnicodeMode,
  type RegExpAlternative,
  type RegExpAtom,
  type RegExpCapture,
  type RegExpCharacterClass,
  type RegExpClassEscapeSet,
  type RegExpClassItem,
  type RegExpDisjunction,
  type RegExpEdgeAssertion,
  type RegExpFlags,
  type RegExpLookaround,
  type RegExpPattern,
  type RegExpPatternError,
  type RegExpQuantified,
  type RegExpSpan,
  type RegExpTerm,
  type RegExpUnicodePropertyEscape,
} from "./regexp.ts";

function includePropertiesWhen<const Properties extends object>(
  properties: () => Properties | undefined,
): Properties | { [Key in keyof Properties]?: never } {
  return properties() ?? {};
}

/** The largest Unicode code point. */
const maximumCodePoint = 0x10_ffff;

/** One past the largest code point, the only non-code-point boundary. */
const codePointLimit = maximumCodePoint + 1;

/**
 * One immutable character set as an inversion list.
 *
 * The list is a strictly increasing, even-length array of boundaries where
 * membership toggles, so `[0x41, 0x5b]` is U+0041 through U+005A. A closing
 * boundary may equal one past the largest code point, which is the only
 * value the list may hold that is not itself a code point.
 *
 * `@oseo/unicode` publishes its tables in exactly this shape, so a table
 * reaches an artifact without being reshaped. The compiler core links no
 * Unicode data, so the few set operations the builder needs are implemented
 * here rather than imported: the dependency direction, not the duplication,
 * is what the package boundary protects.
 */
export type RegExpMatcherSet = readonly number[];

/** Whether one inversion list holds one code point. */
function setHas(set: RegExpMatcherSet, codePoint: number): boolean {
  let low = 0;
  let high = set.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((set[middle] ?? 0) <= codePoint) low = middle + 1;
    else high = middle;
  }
  return (low & 1) === 1;
}

/** One inclusive code-point range as an inversion list. */
function setOfRange(start: number, end: number): RegExpMatcherSet {
  return start > end ? [] : [start, end + 1];
}

/** The union of two inversion lists. */
function setUnion(
  left: RegExpMatcherSet,
  right: RegExpMatcherSet,
): RegExpMatcherSet {
  const boundaries: number[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  let depth = 0;
  while (leftIndex < left.length || rightIndex < right.length) {
    const leftValue = left[leftIndex] ?? codePointLimit + 1;
    const rightValue = right[rightIndex] ?? codePointLimit + 1;
    const value = Math.min(leftValue, rightValue);
    let opening = 0;
    if (leftValue === value) {
      opening += (leftIndex & 1) === 0 ? 1 : -1;
      leftIndex += 1;
    }
    if (rightValue === value) {
      opening += (rightIndex & 1) === 0 ? 1 : -1;
      rightIndex += 1;
    }
    const previous = depth;
    depth += opening;
    if (previous === 0 && depth > 0) boundaries.push(value);
    else if (previous > 0 && depth === 0) boundaries.push(value);
  }
  return boundaries;
}

/** The complement of one inversion list over the whole code-point range. */
function setComplement(set: RegExpMatcherSet): RegExpMatcherSet {
  const boundaries: number[] = [];
  let position = 0;
  for (let index = 0; index + 1 < set.length; index += 2) {
    const start = set[index] ?? 0;
    if (start > position) boundaries.push(position, start);
    position = set[index + 1] ?? 0;
  }
  if (position < codePointLimit) boundaries.push(position, codePointLimit);
  return boundaries;
}

/** Build a normalized inversion list from unsorted inclusive ranges. */
function setOfRanges(
  ranges: readonly (readonly [number, number])[],
): RegExpMatcherSet {
  const sorted = ranges
    .filter(([start, end]) => start <= end)
    .toSorted((first, second) => first[0] - second[0]);
  const boundaries: number[] = [];
  for (const [start, end] of sorted) {
    const last = boundaries.length - 1;
    const previousEnd = boundaries[last];
    if (previousEnd != null && start <= previousEnd) {
      if (end + 1 > previousEnd) boundaries[last] = end + 1;
      continue;
    }
    boundaries.push(start, end + 1);
  }
  return boundaries;
}

/** The four code points the LineTerminator production names. */
const lineTerminators: RegExpMatcherSet = setOfRanges([
  [0x0a, 0x0a],
  [0x0d, 0x0d],
  [0x20_28, 0x20_29],
]);

/** The sixty-three characters `WordCharacters` calls basic. */
const basicWordCharacters: RegExpMatcherSet = setOfRanges([
  [0x30, 0x39],
  [0x41, 0x5a],
  [0x5f, 0x5f],
  [0x61, 0x7a],
]);

/** The decimal digits `\d` names. */
const decimalDigits: RegExpMatcherSet = setOfRange(0x30, 0x39);

/** The whitespace `\s` names apart from `General_Category=Space_Separator`. */
const namedWhiteSpace: RegExpMatcherSet = setOfRanges([
  [0x09, 0x09],
  [0x0b, 0x0c],
  [0xfe_ff, 0xfe_ff],
]);

/**
 * One code point that canonicalizes to another, recorded for execution.
 *
 * `characters` is strictly increasing and `canonical` holds the canonical
 * form of the character at the same offset. A character the table omits
 * canonicalizes to itself. The executor needs this only where a
 * backreference compares two input characters under `i`; every other
 * ignore-case decision is folded into a set while the artifact is built.
 */
export interface RegExpMatcherCanonicalization {
  readonly canonical: readonly number[];
  readonly characters: readonly number[];
}

/** Consume one character of the input in the instruction's direction. */
export interface RegExpMatcherConsume {
  readonly backward: boolean;
  readonly kind: "consume";
  readonly set: number;
}

/** Assert `^` or `$` at the current position. */
export interface RegExpMatcherEdge {
  readonly assertion: "end" | "start";
  readonly kind: "edge";
  readonly multiline: boolean;
}

/** Assert `\b` or `\B` at the current position. */
export interface RegExpMatcherBoundary {
  readonly kind: "boundary";
  readonly negated: boolean;
  readonly set: number;
}

/** Record the current position in one capture register. */
export interface RegExpMatcherSave {
  readonly kind: "save";
  readonly slot: number;
}

/** Reset a contiguous capture register range to unset. */
export interface RegExpMatcherClear {
  readonly from: number;
  readonly kind: "clear";
  readonly to: number;
}

/** Try one continuation first and keep the other for backtracking. */
export interface RegExpMatcherFork {
  readonly alternative: number;
  readonly kind: "fork";
  readonly preferred: number;
}

/** Continue at one address. */
export interface RegExpMatcherJump {
  readonly kind: "jump";
  readonly target: number;
}

/**
 * Decide whether one repetition iterates again.
 *
 * Below `minimum` the iteration is forced, at `maximum` the repetition
 * exits, and between them `greedy` orders the two continuations. The
 * decision never inspects the input, so a repetition is one loop in the
 * artifact whatever its bounds say.
 */
export interface RegExpMatcherRepeat {
  readonly counter: number;
  readonly enter: number;
  readonly exit: number;
  readonly greedy: boolean;
  readonly kind: "repeat";
  readonly maximum: number;
  readonly minimum: number;
}

/**
 * Begin one repetition, discarding the count of any earlier entry.
 *
 * The edition gives every entry into a quantified atom a fresh repetition
 * state, so a repetition nested in another one starts over each time the
 * outer body runs rather than resuming the count it left behind.
 */
export interface RegExpMatcherRepeatInit {
  readonly counter: number;
  readonly kind: "repeat-init";
}

/** Start one repetition iteration, clearing the captures it may set. */
export interface RegExpMatcherRepeatEnter {
  readonly body: number;
  readonly clearFrom: number;
  readonly clearTo: number;
  readonly counter: number;
  readonly kind: "repeat-enter";
  readonly position: number;
}

/**
 * Finish one repetition iteration.
 *
 * An iteration that consumed nothing fails once the repetition has met its
 * lower bound, which is what stops an empty body from repeating forever
 * while still letting the bound itself be satisfied by empty iterations.
 */
export interface RegExpMatcherRepeatEnd {
  readonly counter: number;
  readonly head: number;
  readonly kind: "repeat-end";
  readonly minimum: number;
  readonly position: number;
}

/**
 * Enter one lookaround body.
 *
 * The instruction records the backtrack height its body may not unwind
 * past, so the body's own choices are discarded when it finishes.
 * `onFail` is where the assertion continues once its body has no match
 * left: the shared failure instruction for a positive assertion, and the
 * instruction after the assertion for a negative one, which is the only
 * way a negative assertion succeeds.
 */
export interface RegExpMatcherLookStart {
  readonly body: number;
  readonly frame: number;
  readonly kind: "look-start";
  readonly negated: boolean;
  readonly onFail: number;
}

/**
 * Leave one lookaround body that matched.
 *
 * A positive assertion restores the entry position, keeps the captures the
 * body set, and discards the body's remaining choices. A negative
 * assertion undoes both and fails.
 */
export interface RegExpMatcherLookEnd {
  readonly exit: number;
  readonly frame: number;
  readonly kind: "look-end";
  readonly negated: boolean;
}

/**
 * Match the text one earlier capture holds.
 *
 * `slots` names every capture a group name resolves to, in ascending
 * index order. At most one of them can have participated in the match, and
 * a reference to a capture that did not participate matches the empty
 * string rather than failing.
 */
export interface RegExpMatcherBackreference {
  readonly backward: boolean;
  readonly ignoreCase: boolean;
  readonly kind: "backreference";
  readonly slots: readonly number[];
}

/** Report the whole pattern as matched. */
export interface RegExpMatcherAccept {
  readonly kind: "accept";
}

/** Abandon the current path and backtrack. */
export interface RegExpMatcherFail {
  readonly kind: "fail";
}

/** One instruction of a matcher artifact. */
export type RegExpMatcherInstruction =
  | RegExpMatcherAccept
  | RegExpMatcherBackreference
  | RegExpMatcherBoundary
  | RegExpMatcherClear
  | RegExpMatcherConsume
  | RegExpMatcherEdge
  | RegExpMatcherFail
  | RegExpMatcherFork
  | RegExpMatcherJump
  | RegExpMatcherLookEnd
  | RegExpMatcherLookStart
  | RegExpMatcherRepeat
  | RegExpMatcherRepeatEnd
  | RegExpMatcherRepeatEnter
  | RegExpMatcherRepeatInit
  | RegExpMatcherSave;

/**
 * One immutable matcher artifact.
 *
 * The artifact is the semantic authority for one pattern: an ahead-of-time
 * lowering and any later fast path must produce the match state this
 * program produces. It holds no mutable field and no reference to a
 * regular expression object, so equal artifacts may be shared while every
 * evaluation still owns its own object identity and `lastIndex`.
 *
 * Register 0 and 1 hold the whole match, and registers `2 * index` and
 * `2 * index + 1` hold capturing group `index`. The remaining registers
 * are repetition counters, repetition positions, and lookaround frames.
 */
export interface RegExpMatcherProgram {
  readonly canonicalization?: RegExpMatcherCanonicalization;
  readonly captures: readonly RegExpCapture[];
  readonly flags: RegExpFlags;
  readonly groupNames: readonly string[];
  readonly instructions: readonly RegExpMatcherInstruction[];
  readonly kind: "matcher";
  readonly registers: number;
  readonly sets: readonly RegExpMatcherSet[];
  readonly source: string;
  readonly unicodeMode: boolean;
}

/**
 * Unicode facts the builder cannot derive on its own.
 *
 * The compiler core links no Unicode data, so a caller that owns the
 * pinned tables supplies the raw facts and the builder owns every
 * ECMAScript decision made from them. A pattern whose grammar needs a fact
 * the caller did not supply is refused with a located error rather than
 * matched against a guess.
 *
 * `caseEquivalenceClasses` returns every class of two or more characters
 * that `Canonicalize` maps together for the given mode, which is simple
 * case folding under `u` or `v` and the single-code-unit uppercase rule
 * otherwise. Classes of one character are omitted because they change
 * nothing.
 */
export interface RegExpMatcherUnicodeData {
  readonly caseEquivalenceClasses?: (
    unicodeMode: boolean,
  ) => readonly (readonly number[])[];
  readonly propertySet?: (
    escape: RegExpUnicodePropertyEscape,
  ) => RegExpMatcherSet | undefined;
  readonly spaceSeparators?: RegExpMatcherSet;
}

/**
 * Owned boundaries applied while one artifact is built.
 *
 * A pattern the parser already accepted stays within these for any
 * ordinary source, so reaching one reports a located `limit` error rather
 * than producing an artifact whose storage a later native lowering could
 * not describe.
 */
export interface RegExpMatcherLimits {
  /**
   * The lowered instruction count, which charges a backreference to a
   * duplicated group name once per candidate capture because that is
   * what a native encoding writes for it.
   */
  readonly instructions: number;
  readonly registers: number;
}

/** The reviewed default artifact limits. */
export const defaultRegExpMatcherLimits: RegExpMatcherLimits = {
  instructions: 0x10_0000,
  registers: 0x4_0000,
};

/** Optional components of one artifact build. */
export interface RegExpMatcherOptions {
  readonly limits?: RegExpMatcherLimits;
  readonly unicodeData?: RegExpMatcherUnicodeData;
}

/**
 * The outcome of one build.
 *
 * `program` is present exactly when `built` is true, and `errors` is
 * nonempty exactly when it is false.
 */
export interface RegExpMatcherResult {
  readonly built: boolean;
  readonly errors: readonly RegExpPatternError[];
  readonly program?: RegExpMatcherProgram;
}

/**
 * Reject a boundary a caller supplied that is not a count.
 *
 * A limit that is not a nonnegative safe integer would silently disable
 * the boundary it names, because every comparison against it is false.
 * That is a caller defect rather than a pattern the unit cannot describe,
 * so it throws instead of reporting a located pattern error.
 */
export function checkRegExpMatcherBound(value: number, subject: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${subject} must be a nonnegative safe integer.`);
  }
}

/** One rejected construct, thrown so a deep production keeps its span. */
class MatcherFailure extends Error {
  readonly error: RegExpPatternError;

  constructor(error: RegExpPatternError) {
    super(error.message);
    this.error = error;
  }
}

function refuse(
  kind: "limit" | "unsupported",
  message: string,
  span: RegExpSpan,
): never {
  throw new MatcherFailure({ kind, message, section: "pattern", span });
}

/** The address a label holds until it is placed. */
const unplacedLabel = -1;

/**
 * The emitter state of one build.
 *
 * A target field holds a label while instructions are emitted and the
 * address the label was placed at afterwards, so a forward branch never
 * needs a mutable instruction.
 */
interface Builder {
  readonly addresses: number[];
  readonly dotAll: boolean;
  readonly failLabel: number;
  readonly ignoreCase: boolean;
  readonly instructions: RegExpMatcherInstruction[];
  readonly limits: RegExpMatcherLimits;
  readonly multiline: boolean;
  readonly setIndices: Map<string, number>;
  readonly sets: RegExpMatcherSet[];
  readonly unicodeData: RegExpMatcherUnicodeData;
  readonly unicodeMode: boolean;
  readonly unicodeSets: boolean;
  classes: readonly (readonly number[])[] | undefined;
  /**
   * How many instructions a native encoding of this artifact needs.
   *
   * Every instruction is one except a backreference to a duplicated group
   * name, which a lowering writes as one instruction per candidate
   * capture because at most one of them can have participated. Charging
   * that expansion here is what keeps the reviewed instruction limit a
   * bound on the storage a later native lowering has to describe rather
   * than on this array's length alone.
   */
  lowered: number;
  registers: number;
  wordSet: number | undefined;
}

function newLabel(builder: Builder): number {
  builder.addresses.push(unplacedLabel);
  return builder.addresses.length - 1;
}

function placeLabel(builder: Builder, label: number): void {
  builder.addresses[label] = builder.instructions.length;
}

function emit(
  builder: Builder,
  instruction: RegExpMatcherInstruction,
  span: RegExpSpan,
): void {
  const cost =
    instruction.kind === "backreference"
      ? Math.max(instruction.slots.length, 1)
      : 1;
  if (builder.lowered + cost > builder.limits.instructions) {
    refuse(
      "limit",
      "A pattern needs more matcher instructions than the reviewed limit.",
      span,
    );
  }
  builder.lowered += cost;
  builder.instructions.push(instruction);
}

function allocateRegisters(
  builder: Builder,
  count: number,
  span: RegExpSpan,
): number {
  if (builder.registers + count > builder.limits.registers) {
    refuse(
      "limit",
      "A pattern needs more matcher registers than the reviewed limit.",
      span,
    );
  }
  const base = builder.registers;
  builder.registers += count;
  return base;
}

/**
 * Intern one set, so equal sets share one artifact entry.
 *
 * The stored list is a frozen copy. A set may have arrived from the
 * caller's Unicode tables, and an artifact must neither freeze a table the
 * caller still owns nor keep a list the caller could rewrite later.
 */
function internSet(builder: Builder, set: RegExpMatcherSet): number {
  const key = set.join(",");
  const existing = builder.setIndices.get(key);
  if (existing != null) return existing;
  const index = builder.sets.length;
  builder.sets.push(Object.freeze([...set]));
  builder.setIndices.set(key, index);
  return index;
}

function caseClasses(
  builder: Builder,
  span: RegExpSpan,
): readonly (readonly number[])[] {
  const cached = builder.classes;
  if (cached != null) return cached;
  const provide = builder.unicodeData.caseEquivalenceClasses;
  if (provide == null) {
    refuse(
      "unsupported",
      "An ignore-case pattern needs case folding data that is not linked.",
      span,
    );
  }
  const classes = provide(builder.unicodeMode);
  builder.classes = classes;
  return classes;
}

/**
 * Close one set under the pattern's canonicalization.
 *
 * `CharacterSetMatcher` compares the canonical form of the input character
 * with the canonical form of every set member, so a set matches exactly
 * the characters whose equivalence class meets it. Only a character with a
 * case sibling can join a set it was not already in, so closing walks the
 * equivalence classes rather than the whole code-point range.
 */
function closeSet(
  builder: Builder,
  set: RegExpMatcherSet,
  span: RegExpSpan,
): RegExpMatcherSet {
  if (!builder.ignoreCase) return set;
  const added: (readonly [number, number])[] = [];
  for (const members of caseClasses(builder, span)) {
    if (!members.some((member) => setHas(set, member))) continue;
    for (const member of members) {
      if (!setHas(set, member)) added.push([member, member]);
    }
  }
  return added.length === 0 ? set : setUnion(set, setOfRanges(added));
}

/**
 * The `WordCharacters` of this pattern.
 *
 * The edition adds a character outside the basic sixty-three only when
 * both `i` and a unicode-mode flag are set, and closing the basic set
 * under the non-unicode case rule adds nothing, so one expression covers
 * every flag combination.
 */
function wordCharacters(builder: Builder, span: RegExpSpan): RegExpMatcherSet {
  return closeSet(builder, basicWordCharacters, span);
}

function spaceCharacters(builder: Builder, span: RegExpSpan): RegExpMatcherSet {
  const separators = builder.unicodeData.spaceSeparators;
  if (separators == null) {
    refuse(
      "unsupported",
      "A whitespace class escape needs Unicode category data that is not " +
        "linked.",
      span,
    );
  }
  return setUnion(setUnion(namedWhiteSpace, separators), lineTerminators);
}

/** The raw set one `\d`, `\s`, or `\w` escape names, before closing. */
function classEscapeSet(
  builder: Builder,
  set: RegExpClassEscapeSet,
  span: RegExpSpan,
): RegExpMatcherSet {
  if (set === "digit") return decimalDigits;
  if (set === "space") return spaceCharacters(builder, span);
  return wordCharacters(builder, span);
}

function propertyEscapeSet(
  builder: Builder,
  escape: RegExpUnicodePropertyEscape,
): RegExpMatcherSet {
  const resolve = builder.unicodeData.propertySet;
  if (resolve == null) {
    refuse(
      "unsupported",
      "A Unicode property escape needs property data that is not linked.",
      escape.span,
    );
  }
  const resolved = resolve(escape);
  if (resolved == null) {
    refuse(
      "unsupported",
      "This Unicode property names no code-point set.",
      escape.span,
    );
  }
  if (!escape.negated) return resolved;
  /*
   * The two unicode-mode flags complement a property differently. `v`
   * folds the property first and complements it over the folded code
   * points, so `\P{Ll}` under `iv` excludes every character equivalent to
   * a lowercase letter. `u` complements the unfolded property instead and
   * lets `CharacterSetMatcher` close the result afterwards, so the same
   * escape under `iu` accepts them. Closing a complemented closed set adds
   * nothing, so the outer closing stays a no-op here.
   */
  if (builder.unicodeSets && builder.ignoreCase) {
    return setComplement(closeSet(builder, resolved, escape.span));
  }
  return setComplement(resolved);
}

/** The raw set one class member names, before the class is closed. */
function classItemSet(
  builder: Builder,
  item: RegExpClassItem,
): RegExpMatcherSet {
  if (item.kind === "character") return setOfRange(item.value, item.value);
  if (item.kind === "range") {
    return setOfRange(item.start.value, item.end.value);
  }
  if (item.kind === "class-escape") {
    const named = classEscapeSet(builder, item.set, item.span);
    return item.negated ? setComplement(named) : named;
  }
  return propertyEscapeSet(builder, item);
}

function characterClassSet(
  builder: Builder,
  node: RegExpCharacterClass,
): RegExpMatcherSet {
  let union: RegExpMatcherSet = [];
  for (const item of node.items) {
    union = setUnion(union, classItemSet(builder, item));
  }
  return union;
}

/**
 * The set one consuming atom matches, or undefined for another atom.
 *
 * Closing comes before negation because `CharacterSetMatcher` inverts a
 * class after canonicalizing its members: `[^a]` under `i` rejects `A`,
 * while closing the complement instead would accept it.
 */
function characterAtomSet(
  builder: Builder,
  atom: RegExpAtom,
): RegExpMatcherSet | undefined {
  if (atom.kind === "character") {
    return closeSet(builder, setOfRange(atom.value, atom.value), atom.span);
  }
  if (atom.kind === "dot") {
    const dot = builder.dotAll
      ? setOfRange(0, maximumCodePoint)
      : setComplement(lineTerminators);
    return closeSet(builder, dot, atom.span);
  }
  if (atom.kind === "class-escape") {
    const named = classEscapeSet(builder, atom.set, atom.span);
    return closeSet(
      builder,
      atom.negated ? setComplement(named) : named,
      atom.span,
    );
  }
  if (atom.kind === "unicode-property") {
    return closeSet(builder, propertyEscapeSet(builder, atom), atom.span);
  }
  if (atom.kind !== "character-class") return undefined;
  const closed = closeSet(builder, characterClassSet(builder, atom), atom.span);
  return atom.negated ? setComplement(closed) : closed;
}

/** The lowest and highest capture index one atom encloses. */
function captureBounds(
  atom: RegExpAtom,
): readonly [number, number] | undefined {
  let first: number | undefined;
  let last: number | undefined;
  const note = (index: number): void => {
    first = first == null ? index : Math.min(first, index);
    last = last == null ? index : Math.max(last, index);
  };
  const visitDisjunction = (node: RegExpDisjunction): void => {
    for (const alternative of node.alternatives) {
      for (const term of alternative.terms) visitTerm(term);
    }
  };
  const visitAtom = (node: RegExpAtom): void => {
    if (node.kind === "capturing-group") {
      note(node.index);
      visitDisjunction(node.body);
      return;
    }
    if (node.kind === "group" || node.kind === "modifier-group") {
      visitDisjunction(node.body);
    }
  };
  const visitTerm = (term: RegExpTerm): void => {
    if (term.kind === "assertion") return;
    if (term.kind === "lookaround") {
      visitDisjunction(term.body);
      return;
    }
    visitAtom(term.kind === "quantified" ? term.atom : term);
  };
  visitAtom(atom);
  if (first == null || last == null) return undefined;
  return [first, last];
}

function buildAtom(
  builder: Builder,
  atom: RegExpAtom,
  backward: boolean,
): void {
  const set = characterAtomSet(builder, atom);
  if (set != null) {
    emit(
      builder,
      { backward, kind: "consume", set: internSet(builder, set) },
      atom.span,
    );
    return;
  }
  if (atom.kind === "capturing-group") {
    const start = 2 * atom.index;
    const end = start + 1;
    emit(builder, { kind: "save", slot: backward ? end : start }, atom.span);
    buildDisjunction(builder, atom.body, backward);
    emit(builder, { kind: "save", slot: backward ? start : end }, atom.span);
    return;
  }
  if (atom.kind === "group") {
    buildDisjunction(builder, atom.body, backward);
    return;
  }
  if (atom.kind === "modifier-group") {
    refuse(
      "unsupported",
      "An inline modifier group has no matcher lowering yet.",
      atom.span,
    );
  }
  if (atom.kind === "backreference" || atom.kind === "named-backreference") {
    const slots =
      atom.kind === "backreference"
        ? [2 * atom.index]
        : atom.indices.map((index: number) => 2 * index);
    emit(
      builder,
      {
        backward,
        ignoreCase: builder.ignoreCase,
        kind: "backreference",
        slots,
      },
      atom.span,
    );
    return;
  }
  refuse(
    "unsupported",
    "This pattern atom has no matcher lowering yet.",
    atom.span,
  );
}

function buildQuantified(
  builder: Builder,
  term: RegExpQuantified,
  backward: boolean,
): void {
  const counter = allocateRegisters(builder, 2, term.span);
  const position = counter + 1;
  const bounds = captureBounds(term.atom);
  const head = newLabel(builder);
  const enter = newLabel(builder);
  const body = newLabel(builder);
  const exit = newLabel(builder);
  emit(builder, { counter, kind: "repeat-init" }, term.span);
  placeLabel(builder, head);
  emit(
    builder,
    {
      counter,
      enter,
      exit,
      greedy: term.quantifier.greedy,
      kind: "repeat",
      maximum: term.quantifier.maximum,
      minimum: term.quantifier.minimum,
    },
    term.span,
  );
  placeLabel(builder, enter);
  emit(
    builder,
    {
      body,
      clearFrom: bounds == null ? 0 : 2 * bounds[0],
      clearTo: bounds == null ? 0 : 2 * bounds[1] + 2,
      counter,
      kind: "repeat-enter",
      position,
    },
    term.span,
  );
  placeLabel(builder, body);
  buildAtom(builder, term.atom, backward);
  emit(
    builder,
    {
      counter,
      head,
      kind: "repeat-end",
      minimum: term.quantifier.minimum,
      position,
    },
    term.span,
  );
  placeLabel(builder, exit);
}

function buildAssertion(builder: Builder, term: RegExpEdgeAssertion): void {
  if (term.assertion === "start" || term.assertion === "end") {
    emit(
      builder,
      { assertion: term.assertion, kind: "edge", multiline: builder.multiline },
      term.span,
    );
    return;
  }
  const set =
    builder.wordSet ?? internSet(builder, wordCharacters(builder, term.span));
  builder.wordSet = set;
  emit(
    builder,
    {
      kind: "boundary",
      negated: term.assertion === "non-word-boundary",
      set,
    },
    term.span,
  );
}

function buildLookaround(builder: Builder, term: RegExpLookaround): void {
  const frame = allocateRegisters(builder, 1, term.span);
  const body = newLabel(builder);
  const exit = newLabel(builder);
  emit(
    builder,
    {
      body,
      frame,
      kind: "look-start",
      negated: term.negated,
      onFail: term.negated ? exit : builder.failLabel,
    },
    term.span,
  );
  placeLabel(builder, body);
  buildDisjunction(builder, term.body, term.direction === "behind");
  emit(
    builder,
    { exit, frame, kind: "look-end", negated: term.negated },
    term.span,
  );
  placeLabel(builder, exit);
}

function buildTerm(
  builder: Builder,
  term: RegExpTerm,
  backward: boolean,
): void {
  if (term.kind === "assertion") {
    buildAssertion(builder, term);
    return;
  }
  if (term.kind === "lookaround") {
    buildLookaround(builder, term);
    return;
  }
  if (term.kind === "quantified") {
    buildQuantified(builder, term, backward);
    return;
  }
  buildAtom(builder, term, backward);
}

/**
 * Emit one alternative in evaluation order.
 *
 * A backward alternative evaluates its rightmost term first, which is what
 * makes a lookbehind body read toward the start of the input.
 */
function buildAlternative(
  builder: Builder,
  alternative: RegExpAlternative,
  backward: boolean,
): void {
  const terms = backward ? alternative.terms.toReversed() : alternative.terms;
  for (const term of terms) buildTerm(builder, term, backward);
}

function buildDisjunction(
  builder: Builder,
  disjunction: RegExpDisjunction,
  backward: boolean,
): void {
  const alternatives = disjunction.alternatives;
  const last = alternatives.length - 1;
  if (last === 0) {
    const only = alternatives[0];
    if (only != null) buildAlternative(builder, only, backward);
    return;
  }
  const end = newLabel(builder);
  for (const [index, alternative] of alternatives.entries()) {
    if (index === last) {
      buildAlternative(builder, alternative, backward);
      break;
    }
    const preferred = newLabel(builder);
    const next = newLabel(builder);
    emit(
      builder,
      { alternative: next, kind: "fork", preferred },
      alternative.span,
    );
    placeLabel(builder, preferred);
    buildAlternative(builder, alternative, backward);
    emit(builder, { kind: "jump", target: end }, alternative.span);
    placeLabel(builder, next);
  }
  placeLabel(builder, end);
}

/** Rewrite every label reference into the address it was placed at. */
function resolveTargets(
  instruction: RegExpMatcherInstruction,
  addresses: readonly number[],
): RegExpMatcherInstruction {
  const address = (label: number): number => addresses[label] ?? 0;
  if (instruction.kind === "fork") {
    return {
      alternative: address(instruction.alternative),
      kind: "fork",
      preferred: address(instruction.preferred),
    };
  }
  if (instruction.kind === "jump") {
    return { kind: "jump", target: address(instruction.target) };
  }
  if (instruction.kind === "repeat") {
    return {
      ...instruction,
      enter: address(instruction.enter),
      exit: address(instruction.exit),
    };
  }
  if (instruction.kind === "repeat-enter") {
    return { ...instruction, body: address(instruction.body) };
  }
  if (instruction.kind === "repeat-end") {
    return { ...instruction, head: address(instruction.head) };
  }
  if (instruction.kind === "look-start") {
    return {
      ...instruction,
      body: address(instruction.body),
      onFail: address(instruction.onFail),
    };
  }
  if (instruction.kind === "look-end") {
    return { ...instruction, exit: address(instruction.exit) };
  }
  return instruction;
}

/** Record every character whose canonical form is another character. */
function canonicalizationTable(
  classes: readonly (readonly number[])[],
): RegExpMatcherCanonicalization {
  const pairs: (readonly [number, number])[] = [];
  for (const members of classes) {
    if (members.length < 2) continue;
    const representative = members.reduce(
      (lowest, member) => Math.min(lowest, member),
      members[0] ?? 0,
    );
    for (const member of members) {
      if (member !== representative) pairs.push([member, representative]);
    }
  }
  const sorted = pairs.toSorted((first, second) => first[0] - second[0]);
  return {
    canonical: sorted.map(([, canonical]) => canonical),
    characters: sorted.map(([character]) => character),
  };
}

/** Whether one artifact compares two input characters under `i`. */
function comparesCharacters(
  instructions: readonly RegExpMatcherInstruction[],
): boolean {
  return instructions.some(
    (instruction) =>
      instruction.kind === "backreference" && instruction.ignoreCase,
  );
}

/**
 * Copy the pattern metadata one artifact keeps.
 *
 * An artifact must not alias a value its caller still owns. Freezing the
 * caller's arrays would change the pattern the caller passed in, and
 * sharing them would let a later write to that pattern change how the
 * artifact matches, which is the whole of the immutability contract.
 */
function ownedFlags(flags: RegExpFlags): RegExpFlags {
  return Object.freeze({
    dotAll: flags.dotAll,
    global: flags.global,
    hasIndices: flags.hasIndices,
    ignoreCase: flags.ignoreCase,
    multiline: flags.multiline,
    sticky: flags.sticky,
    text: flags.text,
    unicode: flags.unicode,
    unicodeSets: flags.unicodeSets,
  });
}

function ownedCaptures(
  captures: readonly RegExpCapture[],
): readonly RegExpCapture[] {
  return Object.freeze(
    captures.map((capture) =>
      Object.freeze({
        index: capture.index,
        span: Object.freeze({
          end: capture.span.end,
          start: capture.span.start,
        }),
        ...includePropertiesWhen(() => {
          if (capture.name == null) return undefined;
          return { name: capture.name };
        }),
      }),
    ),
  );
}

function freezeProgram(program: RegExpMatcherProgram): RegExpMatcherProgram {
  for (const instruction of program.instructions) {
    if (instruction.kind === "backreference") Object.freeze(instruction.slots);
    Object.freeze(instruction);
  }
  Object.freeze(program.sets);
  Object.freeze(program.instructions);
  const table = program.canonicalization;
  if (table != null) {
    Object.freeze(table.canonical);
    Object.freeze(table.characters);
    Object.freeze(table);
  }
  return Object.freeze(program);
}

/**
 * Build the generic matcher artifact of one validated pattern.
 *
 * Every construct the pattern parser admits either compiles to defined
 * behavior here or is refused with a located error. Nothing is
 * approximated: a construct whose matcher semantics this unit does not own
 * and a Unicode fact its caller did not supply both stop the build rather
 * than producing an artifact that matches something else.
 */
export function buildRegExpMatcher(
  pattern: RegExpPattern,
  options: RegExpMatcherOptions = {},
): RegExpMatcherResult {
  const limits = options.limits ?? defaultRegExpMatcherLimits;
  checkRegExpMatcherBound(limits.instructions, "An instruction limit");
  checkRegExpMatcherBound(limits.registers, "A register limit");
  const flags = pattern.flags;
  const builder: Builder = {
    addresses: [unplacedLabel],
    classes: undefined,
    dotAll: flags.dotAll,
    failLabel: 0,
    ignoreCase: flags.ignoreCase,
    instructions: [],
    limits,
    lowered: 0,
    multiline: flags.multiline,
    registers: 2 * (pattern.captures.length + 1),
    setIndices: new Map(),
    sets: [],
    unicodeData: options.unicodeData ?? {},
    unicodeMode: regExpUnicodeMode(flags),
    unicodeSets: flags.unicodeSets,
    wordSet: undefined,
  };
  const whole: RegExpSpan = { end: pattern.source.length, start: 0 };
  try {
    if (builder.registers > limits.registers) {
      refuse(
        "limit",
        "A pattern needs more matcher registers than the reviewed limit.",
        whole,
      );
    }
    emit(builder, { kind: "save", slot: 0 }, whole);
    buildDisjunction(builder, pattern.body, false);
    emit(builder, { kind: "save", slot: 1 }, whole);
    emit(builder, { kind: "accept" }, whole);
    placeLabel(builder, builder.failLabel);
    emit(builder, { kind: "fail" }, whole);
    const instructions = builder.instructions.map((instruction) =>
      resolveTargets(instruction, builder.addresses),
    );
    const program: RegExpMatcherProgram = {
      captures: ownedCaptures(pattern.captures),
      flags: ownedFlags(flags),
      groupNames: Object.freeze([...pattern.groupNames]),
      instructions,
      kind: "matcher",
      registers: builder.registers,
      sets: builder.sets,
      source: pattern.source,
      unicodeMode: builder.unicodeMode,
      ...includePropertiesWhen(() => {
        if (!comparesCharacters(instructions)) return undefined;
        return {
          canonicalization: canonicalizationTable(caseClasses(builder, whole)),
        };
      }),
    };
    return { built: true, errors: [], program: freezeProgram(program) };
  } catch (error) {
    if (error instanceof MatcherFailure) {
      return { built: false, errors: [error.error] };
    }
    throw error;
  }
}
