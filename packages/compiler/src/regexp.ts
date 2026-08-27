/**
 * A half-open span of UTF-16 code units inside one pattern or flag text.
 *
 * Pattern spans are relative to the pattern text rather than to any
 * enclosing source, so the same span is meaningful for a literal that a
 * frontend maps back into its source and for a string that reaches the
 * `RegExp` constructor at run time.
 */
export interface RegExpSpan {
  readonly end: number;
  readonly start: number;
}

/** One regular expression flag admitted by the candidate edition. */
export type RegExpFlag = "d" | "g" | "i" | "m" | "s" | "u" | "v" | "y";

/**
 * The validated flag set of one pattern with its original text.
 *
 * `text` retains the flags exactly as written so that a later unit can
 * implement `flags` and `toString` without reconstructing them from the
 * decoded fields.
 */
export interface RegExpFlags {
  readonly dotAll: boolean;
  readonly global: boolean;
  readonly hasIndices: boolean;
  readonly ignoreCase: boolean;
  readonly multiline: boolean;
  readonly sticky: boolean;
  readonly text: string;
  readonly unicode: boolean;
  readonly unicodeSets: boolean;
}

/** Whether a flag set selects the grammar's UnicodeMode parameter. */
export function regExpUnicodeMode(flags: RegExpFlags): boolean {
  return flags.unicode || flags.unicodeSets;
}

/** An input-position assertion that consumes nothing. */
export type RegExpAssertionKind =
  | "end"
  | "non-word-boundary"
  | "start"
  | "word-boundary";

/** One `^`, `$`, `\b`, or `\B` assertion. */
export interface RegExpEdgeAssertion {
  readonly assertion: RegExpAssertionKind;
  readonly kind: "assertion";
  readonly span: RegExpSpan;
}

/** Direction one lookaround assertion searches from the current position. */
export type RegExpLookaroundDirection = "ahead" | "behind";

/** One lookahead or lookbehind assertion with its own alternatives. */
export interface RegExpLookaround {
  readonly body: RegExpDisjunction;
  readonly direction: RegExpLookaroundDirection;
  readonly kind: "lookaround";
  readonly negated: boolean;
  readonly span: RegExpSpan;
}

/**
 * One repetition bound pair with its choice priority.
 *
 * `maximum` is `Number.POSITIVE_INFINITY` for an unbounded repetition, so
 * a consumer compares bounds without a separate presence flag. `greedy`
 * records the observable choice order rather than a matching strategy.
 */
export interface RegExpQuantifier {
  readonly greedy: boolean;
  readonly maximum: number;
  readonly minimum: number;
  readonly span: RegExpSpan;
}

/** One atom with the quantifier that repeats it. */
export interface RegExpQuantified {
  readonly atom: RegExpAtom;
  readonly kind: "quantified";
  readonly quantifier: RegExpQuantifier;
  readonly span: RegExpSpan;
}

/** One literal code point, however it was written. */
export interface RegExpCharacter {
  readonly kind: "character";
  readonly span: RegExpSpan;
  readonly value: number;
}

/** One `.` atom, whose matched set depends on the `s` flag. */
export interface RegExpDot {
  readonly kind: "dot";
  readonly span: RegExpSpan;
}

/** The three character class escapes that need no Unicode property name. */
export type RegExpClassEscapeSet = "digit" | "space" | "word";

/** One `\d`, `\D`, `\s`, `\S`, `\w`, or `\W` escape. */
export interface RegExpClassEscape {
  readonly kind: "class-escape";
  readonly negated: boolean;
  readonly set: RegExpClassEscapeSet;
  readonly span: RegExpSpan;
}

/**
 * One `\p{...}` or `\P{...}` escape.
 *
 * The parser records the written property name and optional value without
 * resolving either against Unicode data. Resolution belongs to the unit
 * that links the pinned tables, which supplies
 * {@link RegExpPatternExtensions.unicodeProperty}.
 */
export interface RegExpUnicodePropertyEscape {
  readonly kind: "unicode-property";
  readonly negated: boolean;
  readonly property: string;
  readonly span: RegExpSpan;
  readonly value?: string;
}

/** One inclusive code-point range inside a character class. */
export interface RegExpCharacterRange {
  readonly end: RegExpCharacter;
  readonly kind: "range";
  readonly span: RegExpSpan;
  readonly start: RegExpCharacter;
}

/** One member of a character class body. */
export type RegExpClassItem =
  | RegExpCharacter
  | RegExpCharacterRange
  | RegExpClassEscape
  | RegExpUnicodePropertyEscape;

/** One `[...]` or `[^...]` character class. */
export interface RegExpCharacterClass {
  readonly items: readonly RegExpClassItem[];
  readonly kind: "character-class";
  readonly negated: boolean;
  readonly span: RegExpSpan;
}

/** One capturing group with its one-based index and optional name. */
export interface RegExpCapturingGroup {
  readonly body: RegExpDisjunction;
  readonly index: number;
  readonly kind: "capturing-group";
  readonly name?: string;
  readonly span: RegExpSpan;
}

/** One `(?:...)` group, which holds alternatives without capturing. */
export interface RegExpGroup {
  readonly body: RegExpDisjunction;
  readonly kind: "group";
  readonly span: RegExpSpan;
}

/** One flag an inline modifier group may add or remove. */
export type RegExpModifierFlag = "i" | "m" | "s";

/**
 * One `(?ims-ims:...)` group.
 *
 * The group holds alternatives like `(?:...)` and changes the flags that
 * apply inside it. `enabled` and `disabled` are disjoint and at least one
 * of them is nonempty.
 */
export interface RegExpModifierGroup {
  readonly body: RegExpDisjunction;
  readonly disabled: readonly RegExpModifierFlag[];
  readonly enabled: readonly RegExpModifierFlag[];
  readonly kind: "modifier-group";
  readonly span: RegExpSpan;
}

/** One `\1`-style reference to a numbered capturing group. */
export interface RegExpBackreference {
  readonly index: number;
  readonly kind: "backreference";
  readonly span: RegExpSpan;
}

/**
 * One `\k<name>` reference.
 *
 * The candidate edition permits one name on several groups when they
 * cannot both participate in a match, so a named reference resolves to
 * every group carrying the name, in ascending index order.
 */
export interface RegExpNamedBackreference {
  readonly indices: readonly number[];
  readonly kind: "named-backreference";
  readonly name: string;
  readonly span: RegExpSpan;
}

/** One pattern element that a quantifier may repeat. */
export type RegExpAtom =
  | RegExpBackreference
  | RegExpCapturingGroup
  | RegExpCharacter
  | RegExpCharacterClass
  | RegExpClassEscape
  | RegExpDot
  | RegExpGroup
  | RegExpModifierGroup
  | RegExpNamedBackreference
  | RegExpUnicodePropertyEscape;

/** One element of an alternative, in written order. */
export type RegExpTerm =
  | RegExpAtom
  | RegExpEdgeAssertion
  | RegExpLookaround
  | RegExpQuantified;

/** One alternative: an ordered, possibly empty term sequence. */
export interface RegExpAlternative {
  readonly kind: "alternative";
  readonly span: RegExpSpan;
  readonly terms: readonly RegExpTerm[];
}

/** Ordered alternatives whose order is the observable choice priority. */
export interface RegExpDisjunction {
  readonly alternatives: readonly RegExpAlternative[];
  readonly kind: "disjunction";
  readonly span: RegExpSpan;
}

/** One capturing group recorded in ascending index order. */
export interface RegExpCapture {
  readonly index: number;
  readonly name?: string;
  readonly span: RegExpSpan;
}

/**
 * One validated pattern with the metadata a later unit needs.
 *
 * `source` and `flags.text` retain the original text, so `source`,
 * `flags`, and `toString` never reconstruct text from the tree.
 */
export interface RegExpPattern {
  readonly body: RegExpDisjunction;
  readonly captures: readonly RegExpCapture[];
  readonly flags: RegExpFlags;
  readonly groupNames: readonly string[];
  readonly kind: "pattern";
  readonly source: string;
}

/** Whether a rejected construct is invalid, unadmitted, or over a limit. */
export type RegExpErrorKind = "invalid" | "limit" | "unsupported";

/** Which text of a pattern one error span addresses. */
export type RegExpErrorSection = "flags" | "pattern";

/**
 * One rejected construct located inside the pattern or flag text.
 *
 * `kind` separates the three reasons a caller must distinguish. An
 * `invalid` construct is an ECMA-262 early error, so a literal reports it
 * as a parse rejection and a dynamic pattern throws `SyntaxError`. An
 * `unsupported` construct is valid syntax that this unit does not admit,
 * and a `limit` construct exceeds an owned resource boundary.
 */
export interface RegExpPatternError {
  readonly kind: RegExpErrorKind;
  readonly message: string;
  readonly section: RegExpErrorSection;
  readonly span: RegExpSpan;
}

/**
 * A construct this unit parses but does not admit by default.
 *
 * The parser recognizes each construct and refuses it with a located
 * `unsupported` error unless the caller admits the point. Admitting a
 * point never changes how any other construct parses. Class set notation
 * is deliberately absent: this unit has no class-set representation, so a
 * `v` flag character class is always refused, and the unit that adds that
 * representation adds the point with it.
 */
export type RegExpExtensionPoint = "modifiers" | "unicode-property-escapes";

/**
 * Capabilities a caller supplies to the pattern parser.
 *
 * The compiler core links no Unicode data, so a construct whose validity
 * depends on it is either refused or delegated here. `identifierStart`
 * and `identifierPart` classify a group-name code point outside ASCII;
 * without them such a name is refused rather than guessed.
 * `unicodeProperty` decides whether one escape names a defined property,
 * and admitting `unicode-property-escapes` without it refuses the escape
 * rather than accepting a name nothing checked.
 */
export interface RegExpPatternExtensions {
  readonly admitted: readonly RegExpExtensionPoint[];
  readonly identifierPart?: (codePoint: number) => boolean;
  readonly identifierStart?: (codePoint: number) => boolean;
  readonly unicodeProperty?: (escape: RegExpUnicodePropertyEscape) => boolean;
}

/**
 * Owned resource boundaries applied while parsing one pattern.
 *
 * ECMA-262 bounds none of these, so each limit is an implementation
 * boundary that reports a located `limit` error instead of exhausting a
 * host stack or overflowing a later matcher's capture representation.
 */
export interface RegExpPatternLimits {
  readonly capturingGroups: number;
  readonly nestingDepth: number;
  readonly quantifierBound: number;
  readonly sourceLength: number;
}

/**
 * The reviewed default limits.
 *
 * `capturingGroups` keeps a capture index inside 16 bits, `nestingDepth`
 * bounds the parser's recursion, `quantifierBound` keeps a repetition
 * count exactly representable, and `sourceLength` bounds one pattern text.
 */
export const defaultRegExpPatternLimits: RegExpPatternLimits = {
  capturingGroups: 0xffff,
  nestingDepth: 256,
  quantifierBound: Number.MAX_SAFE_INTEGER,
  sourceLength: 0x10_0000,
};

/** Optional components shared by every pattern parse entry point. */
export interface RegExpPatternOptions {
  readonly extensions?: RegExpPatternExtensions;
  readonly limits?: RegExpPatternLimits;
}

/** One pattern text and flag text presented to the parser. */
export interface RegExpPatternInput extends RegExpPatternOptions {
  readonly flags: string;
  readonly source: string;
}

/**
 * The outcome of one parse.
 *
 * `pattern` is present exactly when `parsed` is true, and `errors` is
 * nonempty exactly when it is false.
 */
export interface RegExpPatternResult {
  readonly errors: readonly RegExpPatternError[];
  readonly parsed: boolean;
  readonly pattern?: RegExpPattern;
}
