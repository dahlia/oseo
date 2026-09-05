import {
  defaultRegExpPatternLimits,
  regExpUnicodeMode,
  type RegExpAlternative,
  type RegExpAtom,
  type RegExpCapture,
  type RegExpCharacter,
  type RegExpCharacterClass,
  type RegExpClassSetOperand,
  type RegExpClassStringDisjunction,
  type RegExpClassEscape,
  type RegExpClassEscapeSet,
  type RegExpClassItem,
  type RegExpDisjunction,
  type RegExpErrorKind,
  type RegExpErrorSection,
  type RegExpExtensionPoint,
  type RegExpFlags,
  type RegExpModifierFlag,
  type RegExpPattern,
  type RegExpPatternError,
  type RegExpPatternExtensions,
  type RegExpPatternInput,
  type RegExpPatternLimits,
  type RegExpPatternOptions,
  type RegExpPatternResult,
  type RegExpQuantifier,
  type RegExpSpan,
  type RegExpTerm,
  type RegExpUnicodePropertyEscape,
  type RegExpUnicodeClassSet,
} from "./regexp.ts";
import type { RegExpLiteralSyntax } from "./syntax.ts";

function includePropertiesWhen<const Properties extends object>(
  properties: () => Properties | undefined,
): Properties | { [Key in keyof Properties]?: never } {
  return properties() ?? {};
}

/** Characters the grammar reserves, which a pattern character excludes. */
const syntaxCharacters = new Set("^$\\.*+?()[]{}|");

/** The five ControlEscape spellings and the code points they name. */
const controlEscapes = new Map<string, number>([
  ["f", 0x0c],
  ["n", 0x0a],
  ["r", 0x0d],
  ["t", 0x09],
  ["v", 0x0b],
]);

/** Modifier flags one inline modifier group may enable or disable. */
const modifierFlags = new Set<string>(["i", "m", "s"]);

/** Binary properties of strings admitted only by positive `v` escapes. */
const unicodeStringProperties = new Set<string>([
  "Basic_Emoji",
  "Emoji_Keycap_Sequence",
  "RGI_Emoji",
  "RGI_Emoji_Flag_Sequence",
  "RGI_Emoji_Modifier_Sequence",
  "RGI_Emoji_Tag_Sequence",
  "RGI_Emoji_ZWJ_Sequence",
]);

/** Characters that must be escaped inside a Unicode class set. */
const classSetSyntaxCharacters = new Set<string>("(){}[/-|");

/** Punctuators reserved when two equal copies occur in a class set. */
const classSetReservedDoublePunctuators = new Set<string>(
  "!#$%&*+,.:;<=>?@^`~",
);

function readClassSetCharacterEscape(state: ParseState, start: number): number {
  const character = at(state, 0);
  if (
    character != null &&
    ((state.unicodeMode && character === "-") ||
      (state.flags.unicodeSets &&
        classSetReservedDoublePunctuators.has(character)))
  ) {
    state.index += 1;
    return character.codePointAt(0) ?? 0;
  }
  return readCharacterEscape(state, start);
}

const noExtensions: RegExpPatternExtensions = { admitted: [] };

/**
 * One rejected construct, thrown so a deep production reports its own
 * location without every caller forwarding a failure value.
 */
class PatternFailure extends Error {
  readonly error: RegExpPatternError;

  constructor(error: RegExpPatternError) {
    super(error.message);
    this.error = error;
  }
}

/**
 * Where one alternative sits in the enclosing disjunctions.
 *
 * Two groups with one name are admitted only when some enclosing
 * disjunction places them in different alternatives, so each named group
 * retains the alternative it was parsed in.
 */
interface AlternativePath {
  readonly alternative: number;
  readonly disjunction: number;
}

interface NamedGroupRecord {
  readonly name: string;
  readonly path: readonly AlternativePath[];
  readonly span: RegExpSpan;
}

interface BackreferenceRecord {
  readonly index: number;
  readonly span: RegExpSpan;
}

interface NamedReferenceRecord {
  readonly name: string;
  readonly span: RegExpSpan;
}

interface ParseState {
  readonly backreferences: BackreferenceRecord[];
  readonly captures: RegExpCapture[];
  readonly extensions: RegExpPatternExtensions;
  readonly flags: RegExpFlags;
  /**
   * Whether the pattern text declares a group name.
   *
   * The grammar sets its named-reference parameter exactly when the
   * pattern holds a GroupSpecifier, and Annex B reads `\k` as an identity
   * escape only without one. A reference can precede the declaration that
   * decides this, so the whole text answers it once before parsing rather
   * than each reference rescanning what it cannot see yet.
   */
  readonly groupNameDeclared: boolean;
  readonly limits: RegExpPatternLimits;
  readonly namedGroups: NamedGroupRecord[];
  /**
   * One index list per referenced name, shared by every node that names
   * it. Validation resolves each list once, so a pattern with many
   * references to one name holds one list rather than a copy per node.
   */
  readonly namedReferenceIndices: Map<string, number[]>;
  readonly namedReferences: NamedReferenceRecord[];
  readonly path: AlternativePath[];
  readonly source: string;
  readonly unicodeMode: boolean;
  depth: number;
  disjunctionCount: number;
  index: number;
}

function span(start: number, end: number): RegExpSpan {
  return { end, start };
}

function fail(
  kind: RegExpErrorKind,
  message: string,
  location: RegExpSpan,
  section: RegExpErrorSection = "pattern",
): never {
  throw new PatternFailure({ kind, message, section, span: location });
}

/**
 * Describe a construct that only Annex B admits.
 *
 * ADR 0013 places Annex B outside the candidate claim, so the construct is
 * rejected in every mode. Under `u` or `v` Annex B never applied, so the
 * rejection is the early error the edition itself requires and reports as
 * invalid text. Without them the text is one a web browser accepts, so the
 * rejection is this claim's own boundary rather than a defect, and it
 * reports the profile code instead. Measurement then records an excluded
 * optional section where it would otherwise record a parse failure.
 */
function annexBMessage(subject: string): string {
  const tail = "is admitted only by Annex B, which is outside the profile.";
  return `${subject} ${tail}`;
}

function annexBError(
  state: ParseState,
  invalidMessage: string,
  subject: string,
  location: RegExpSpan,
): RegExpPatternError {
  return state.unicodeMode
    ? {
        kind: "invalid",
        message: invalidMessage,
        section: "pattern",
        span: location,
      }
    : {
        kind: "unsupported",
        message: annexBMessage(subject),
        section: "pattern",
        span: location,
      };
}

/** Reject a construct that only Annex B admits, keeping its span. */
function refuseAnnexB(
  state: ParseState,
  invalidMessage: string,
  subject: string,
  location: RegExpSpan,
): never {
  throw new PatternFailure(
    annexBError(state, invalidMessage, subject, location),
  );
}

function admits(state: ParseState, point: RegExpExtensionPoint): boolean {
  return state.extensions.admitted.includes(point);
}

function at(state: ParseState, offset: number): string | undefined {
  return state.source[state.index + offset];
}

function done(state: ParseState): boolean {
  return state.index >= state.source.length;
}

function eat(state: ParseState, text: string): boolean {
  if (!state.source.startsWith(text, state.index)) return false;
  state.index += text.length;
  return true;
}

/**
 * Read one source character.
 *
 * A pattern is a sequence of code points under `u` or `v` and a sequence
 * of UTF-16 code units otherwise, which is the only place the flag set
 * changes how text is consumed rather than what it means.
 */
function readCharacter(state: ParseState): RegExpCharacter {
  const start = state.index;
  const unit = state.source.charCodeAt(start);
  const value = state.unicodeMode
    ? (state.source.codePointAt(start) ?? 0)
    : Number.isNaN(unit)
      ? 0
      : unit;
  state.index += value > 0xffff ? 2 : 1;
  return { kind: "character", span: span(start, state.index), value };
}

function isDecimalDigit(character: string | undefined): boolean {
  return character != null && character >= "0" && character <= "9";
}

function isHexDigit(character: string | undefined): boolean {
  if (character == null) return false;
  return (
    (character >= "0" && character <= "9") ||
    (character >= "a" && character <= "f") ||
    (character >= "A" && character <= "F")
  );
}

function readDecimalDigits(state: ParseState): string {
  const start = state.index;
  while (isDecimalDigit(at(state, 0))) state.index += 1;
  return state.source.slice(start, state.index);
}

/**
 * Whether one code point has the Unicode `ID_Start` or `ID_Continue`
 * property.
 *
 * The compiler core links no Unicode data, so ASCII is decided here and
 * anything else is delegated to the caller. Without a classifier a
 * non-ASCII code point is refused rather than guessed, which keeps an
 * unadmitted name out of the accepted grammar instead of admitting one
 * whose validity was never checked. The two properties are exactly what
 * the grammar names: the `$`, `_`, and zero-width joiner allowances of an
 * identifier belong to the caller of this predicate, not to it.
 */
function identifierProperty(
  state: ParseState,
  codePoint: number,
  position: "continue" | "start",
  subject: string,
  location: RegExpSpan,
): boolean {
  if (codePoint < 0x80) {
    const character = String.fromCharCode(codePoint);
    if (character >= "a" && character <= "z") return true;
    if (character >= "A" && character <= "Z") return true;
    if (position === "start") return false;
    return (character >= "0" && character <= "9") || character === "_";
  }
  const classify =
    position === "start"
      ? state.extensions.identifierStart
      : state.extensions.identifierPart;
  if (classify == null) {
    fail(
      "unsupported",
      `${subject} outside ASCII needs Unicode identifier data ` +
        "that is not linked.",
      location,
    );
  }
  return classify(codePoint);
}

function readHexValue(state: ParseState, digits: number): number {
  const start = state.index;
  for (let offset = 0; offset < digits; offset += 1) {
    if (!isHexDigit(at(state, offset))) return -1;
  }
  state.index += digits;
  return Number.parseInt(state.source.slice(start, state.index), 16);
}

/**
 * Read one `\u` escape after its `u`.
 *
 * `unicodeSyntax` selects the RegExpUnicodeEscapeSequence grammar
 * parameter. Only the unicode form admits a braced code point and joins a
 * lead surrogate escape to a following trail surrogate escape, which is
 * what makes an escaped supplementary code point equal to a written one.
 * Without it the same text is two independent code units. A group name
 * always uses the unicode form, whatever the flag set says.
 */
function readUnicodeEscape(
  state: ParseState,
  unicodeSyntax: boolean,
  start: number,
): number {
  if (unicodeSyntax && at(state, 0) === "{") {
    state.index += 1;
    const digitStart = state.index;
    while (isHexDigit(at(state, 0))) state.index += 1;
    if (state.index === digitStart || at(state, 0) !== "}") {
      fail("invalid", "A braced Unicode escape is incomplete.", {
        end: state.index,
        start,
      });
    }
    const value = Number.parseInt(
      state.source.slice(digitStart, state.index),
      16,
    );
    state.index += 1;
    if (value > 0x10_ffff) {
      fail("invalid", "A Unicode escape is above the code point range.", {
        end: state.index,
        start,
      });
    }
    return value;
  }
  const value = readHexValue(state, 4);
  if (value < 0) {
    // A group name always uses the unicode form, so only a character
    // escape in a pattern without `u` or `v` reaches Annex B's identity
    // escape here.
    const location = { end: state.index, start };
    const message = "A Unicode escape needs four hexadecimal digits.";
    if (unicodeSyntax) fail("invalid", message, location);
    refuseAnnexB(state, message, "An incomplete Unicode escape", location);
  }
  if (
    unicodeSyntax &&
    value >= 0xd800 &&
    value <= 0xdbff &&
    state.source.startsWith("\\u", state.index)
  ) {
    const resume = state.index;
    state.index += 2;
    const trail = readHexValue(state, 4);
    if (trail >= 0xdc00 && trail <= 0xdfff) {
      return (value - 0xd800) * 0x400 + (trail - 0xdc00) + 0x1_0000;
    }
    state.index = resume;
  }
  return value;
}

/**
 * Read one character escape after its backslash and return a code point.
 *
 * Annex B is outside the candidate claim, so a legacy octal escape and an
 * identity escape over an identifier character are rejected in every
 * mode rather than accepted for a pattern without the `u` flag.
 */
function readCharacterEscape(state: ParseState, start: number): number {
  const character = at(state, 0);
  if (character == null) {
    fail("invalid", "A pattern cannot end with a backslash.", {
      end: state.index,
      start,
    });
  }
  const control = controlEscapes.get(character);
  if (control != null) {
    state.index += 1;
    return control;
  }
  if (character === "c") {
    const letter = at(state, 1);
    if (
      letter == null ||
      !((letter >= "a" && letter <= "z") || (letter >= "A" && letter <= "Z"))
    ) {
      refuseAnnexB(
        state,
        "A control escape needs an ASCII letter.",
        "A control escape without an ASCII letter",
        { end: state.index + 1, start },
      );
    }
    state.index += 2;
    return letter.charCodeAt(0) % 32;
  }
  if (character === "0") {
    if (isDecimalDigit(at(state, 1))) {
      refuseAnnexB(
        state,
        "A legacy octal escape is outside the candidate edition.",
        "A legacy octal escape",
        { end: state.index + 2, start },
      );
    }
    state.index += 1;
    return 0;
  }
  if (character === "x") {
    state.index += 1;
    const value = readHexValue(state, 2);
    if (value < 0) {
      refuseAnnexB(
        state,
        "A hexadecimal escape needs two hexadecimal digits.",
        "An incomplete hexadecimal escape",
        { end: state.index, start },
      );
    }
    return value;
  }
  if (character === "u") {
    state.index += 1;
    return readUnicodeEscape(state, state.unicodeMode, start);
  }
  const escaped = readCharacter(state);
  if (state.unicodeMode) {
    const text = String.fromCodePoint(escaped.value);
    if (!syntaxCharacters.has(text) && text !== "/") {
      fail("invalid", "This identity escape is not allowed.", {
        end: state.index,
        start,
      });
    }
    return escaped.value;
  }
  const location = { end: state.index, start };
  if (escaped.value === 0x6b && state.groupNameDeclared) {
    fail("invalid", "This identity escape is not allowed.", location);
  }
  if (
    identifierProperty(
      state,
      escaped.value,
      "continue",
      "An identity escape",
      location,
    )
  ) {
    refuseAnnexB(
      state,
      "This identity escape is not allowed.",
      "This identity escape",
      location,
    );
  }
  return escaped.value;
}

/**
 * The six CharacterClassEscape spellings, keyed by exact letter.
 *
 * The uppercase spelling of each is its complement, and no other letter
 * names a class escape, so the table is matched literally rather than
 * through a case conversion that another letter could reach.
 */
const classEscapeSets = new Map<
  string,
  { readonly negated: boolean; readonly set: RegExpClassEscapeSet }
>([
  ["D", { negated: true, set: "digit" }],
  ["S", { negated: true, set: "space" }],
  ["W", { negated: true, set: "word" }],
  ["d", { negated: false, set: "digit" }],
  ["s", { negated: false, set: "space" }],
  ["w", { negated: false, set: "word" }],
]);

function readClassEscape(
  state: ParseState,
  start: number,
): RegExpClassEscape | undefined {
  const character = at(state, 0);
  const selected =
    character == null ? undefined : classEscapeSets.get(character);
  if (selected == null) return undefined;
  state.index += 1;
  return {
    kind: "class-escape",
    negated: selected.negated,
    set: selected.set,
    span: span(start, state.index),
  };
}

/**
 * Whether one text is a UnicodePropertyName.
 *
 * The grammar spells a name with ASCII letters and low lines and a value
 * with those and decimal digits, so a name is checked here rather than
 * left to whichever unit resolves it against Unicode data.
 */
function propertyNameCharacters(text: string): boolean {
  return text.length > 0 && /^[A-Za-z_]+$/u.test(text);
}

/** Whether one text is a UnicodePropertyValue or a lone name or value. */
function propertyValueCharacters(text: string): boolean {
  return text.length > 0 && /^[A-Za-z_0-9]+$/u.test(text);
}

/**
 * Read one `\p` or `\P` escape after its backslash.
 *
 * The escape only exists under `u` and `v`; elsewhere `p` is an
 * identifier character, so the backslash form is an invalid identity
 * escape rather than a property reference. A property name is an early
 * error unless a caller both admits the point and resolves the name, so
 * an unresolvable name is never accepted for lack of a resolver.
 */
function readUnicodePropertyEscape(
  state: ParseState,
  start: number,
): RegExpUnicodePropertyEscape | undefined {
  const character = at(state, 0);
  if (!state.unicodeMode || (character !== "p" && character !== "P")) {
    return undefined;
  }
  state.index += 1;
  if (!eat(state, "{")) {
    fail("invalid", "A Unicode property escape needs a braced name.", {
      end: state.index,
      start,
    });
  }
  const nameStart = state.index;
  while (!done(state) && at(state, 0) !== "}" && at(state, 0) !== "=") {
    state.index += 1;
  }
  const first = state.source.slice(nameStart, state.index);
  let second: string | undefined;
  if (at(state, 0) === "=") {
    state.index += 1;
    const valueStart = state.index;
    while (!done(state) && at(state, 0) !== "}") state.index += 1;
    second = state.source.slice(valueStart, state.index);
  }
  if (!eat(state, "}")) {
    fail("invalid", "A Unicode property escape is unterminated.", {
      end: state.index,
      start,
    });
  }
  const location = span(start, state.index);
  const named =
    second == null
      ? propertyValueCharacters(first)
      : propertyNameCharacters(first) && propertyValueCharacters(second);
  if (!named) {
    fail("invalid", "A Unicode property escape names nothing valid.", location);
  }
  if (!admits(state, "unicode-property-escapes")) {
    fail(
      "unsupported",
      "A Unicode property escape is not admitted yet.",
      location,
    );
  }
  const resolve = state.extensions.unicodeProperty;
  if (resolve == null) {
    fail(
      "unsupported",
      "A Unicode property escape needs property data that is not linked.",
      location,
    );
  }
  const escape: RegExpUnicodePropertyEscape = {
    kind: "unicode-property",
    negated: character === "P",
    property: first,
    span: location,
    ...includePropertiesWhen(() => {
      if (second == null) return undefined;
      return { value: second };
    }),
  };
  if (
    !state.flags.unicodeSets &&
    escape.value == null &&
    unicodeStringProperties.has(escape.property)
  ) {
    fail(
      "invalid",
      "A Unicode property of strings requires the v flag.",
      location,
    );
  }
  if (!resolve(escape)) {
    if (
      state.flags.unicodeSets &&
      !escape.negated &&
      escape.value == null &&
      unicodeStringProperties.has(escape.property)
    ) {
      fail(
        "unsupported",
        "A Unicode property of strings is not admitted yet.",
        location,
      );
    }
    fail("invalid", "This Unicode property is not defined.", location);
  }
  return escape;
}

/**
 * Whether the pattern text holds a GroupSpecifier.
 *
 * The scan skips an escape and the inside of a character class, where
 * `(?<` is ordinary text rather than an introducer, and it excludes the
 * two lookbehind introducers that share the first three characters.
 */
function scanForGroupName(source: string): boolean {
  let insideClass = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (insideClass) {
      if (character === "]") insideClass = false;
      continue;
    }
    if (character === "[") {
      insideClass = true;
      continue;
    }
    if (character !== "(") continue;
    if (source[index + 1] !== "?" || source[index + 2] !== "<") continue;
    const next = source[index + 3];
    if (next !== "=" && next !== "!") return true;
  }
  return false;
}

/**
 * Read one `<name>` group specifier after its introducer.
 *
 * Both spellings that reach this reader parse with the grammar's
 * named-reference production active: a declaration is a group specifier
 * by construction, and a `\k` reference reaches it only where the pattern
 * declares a group name or carries `u` or `v`. A malformed name is
 * therefore the edition's own early error rather than an Annex B
 * boundary.
 */
function readGroupName(state: ParseState, start: number): string {
  if (!eat(state, "<")) {
    fail("invalid", "A group name must be enclosed in angle brackets.", {
      end: state.index,
      start,
    });
  }
  let name = "";
  while (!done(state) && at(state, 0) !== ">") {
    const characterStart = state.index;
    let codePoint: number;
    if (eat(state, "\\")) {
      if (!eat(state, "u")) {
        fail("invalid", "A group name escape must be a Unicode escape.", {
          end: state.index,
          start: characterStart,
        });
      }
      codePoint = readUnicodeEscape(state, true, characterStart);
    } else {
      const start2 = state.index;
      codePoint = state.source.codePointAt(start2) ?? 0;
      state.index += codePoint > 0xffff ? 2 : 1;
    }
    const location = span(characterStart, state.index);
    const dollarOrLow = codePoint === 0x24 || codePoint === 0x5f;
    const admitted =
      name.length === 0
        ? dollarOrLow ||
          identifierProperty(
            state,
            codePoint,
            "start",
            "A group name",
            location,
          )
        : dollarOrLow ||
          codePoint === 0x200c ||
          codePoint === 0x200d ||
          identifierProperty(
            state,
            codePoint,
            "continue",
            "A group name",
            location,
          );
    if (!admitted) {
      fail(
        "invalid",
        "This character is not allowed in a group name.",
        location,
      );
    }
    name += String.fromCodePoint(codePoint);
  }
  if (name.length === 0 || !eat(state, ">")) {
    fail("invalid", "A group name is incomplete.", {
      end: state.index,
      start,
    });
  }
  return name;
}

function readModifierFlags(
  state: ParseState,
  start: number,
): RegExpModifierFlag[] {
  const selected: RegExpModifierFlag[] = [];
  while (!done(state)) {
    const character = at(state, 0);
    if (character == null || !modifierFlags.has(character)) break;
    // SAFETY: Membership in modifierFlags establishes the modifier domain.
    if (selected.includes(character as RegExpModifierFlag)) {
      fail("invalid", "A modifier group repeats a flag.", {
        end: state.index + 1,
        start,
      });
    }
    // SAFETY: Membership in modifierFlags establishes the modifier domain.
    selected.push(character as RegExpModifierFlag);
    state.index += 1;
  }
  return selected;
}

function classItemValue(item: RegExpClassItem): RegExpCharacter | undefined {
  return item.kind === "character" ? item : undefined;
}

function parseClassStringDisjunction(
  state: ParseState,
): RegExpClassStringDisjunction {
  const start = state.index;
  state.index += 3;
  const strings: RegExpCharacter[][] = [];
  let characters: RegExpCharacter[] = [];
  for (;;) {
    if (done(state)) {
      fail("invalid", "A class string disjunction is unterminated.", {
        end: state.index,
        start,
      });
    }
    if (eat(state, "|")) {
      strings.push(characters);
      characters = [];
      continue;
    }
    if (eat(state, "}")) {
      strings.push(characters);
      break;
    }
    const characterStart = state.index;
    let value: number;
    if (eat(state, "\\")) {
      if (eat(state, "b")) {
        value = 0x08;
      } else {
        value = readClassSetCharacterEscape(state, characterStart);
      }
    } else {
      validateClassSetCharacter(state);
      value = readCharacter(state).value;
    }
    characters.push({
      kind: "character",
      span: span(characterStart, state.index),
      value,
    });
  }
  return {
    kind: "class-strings",
    span: span(start, state.index),
    strings,
  };
}

function validateClassSetCharacter(state: ParseState): void {
  const firstCharacter = at(state, 0);
  if (
    firstCharacter == null ||
    firstCharacter === "]" ||
    state.source.startsWith("&&", state.index) ||
    state.source.startsWith("--", state.index)
  ) {
    fail(
      "invalid",
      "A class set operator needs an operand.",
      span(state.index, Math.min(state.index + 2, state.source.length)),
    );
  }
  if (classSetSyntaxCharacters.has(firstCharacter)) {
    fail(
      "invalid",
      "A class set syntax character must be escaped.",
      span(state.index, state.index + 1),
    );
  }
  if (
    firstCharacter === at(state, 1) &&
    classSetReservedDoublePunctuators.has(firstCharacter)
  ) {
    fail(
      "invalid",
      "A doubled class set punctuator must be escaped.",
      span(state.index, state.index + 2),
    );
  }
}

function parseClassSetOperand(state: ParseState): RegExpClassSetOperand {
  if (at(state, 0) === "[") return parseUnicodeClassSet(state);
  if (state.source.startsWith("\\q{", state.index)) {
    return parseClassStringDisjunction(state);
  }
  validateClassSetCharacter(state);
  const first = parseClassAtom(state);
  if (
    first.kind === "character" &&
    at(state, 0) === "-" &&
    at(state, 1) !== "-" &&
    at(state, 1) !== "]" &&
    at(state, 1) != null
  ) {
    state.index += 1;
    if (at(state, 0) === "[") {
      fail(
        "invalid",
        "A nested class set cannot be a range bound.",
        span(first.span.start, state.index + 1),
      );
    }
    validateClassSetCharacter(state);
    const second = parseClassAtom(state);
    if (second.kind !== "character" || first.value > second.value) {
      fail("invalid", "A character class range is invalid.", {
        end: state.index,
        start: first.span.start,
      });
    }
    return {
      end: second,
      kind: "range",
      span: span(first.span.start, state.index),
      start: first,
    };
  }
  return first;
}

function classSetOperandMayContainStrings(
  operand: RegExpClassSetOperand,
): boolean {
  if (operand.kind === "class-strings") {
    return operand.strings.some((characters) => characters.length !== 1);
  }
  if (operand.kind === "unicode-property") {
    return (
      !operand.negated &&
      operand.value == null &&
      unicodeStringProperties.has(operand.property)
    );
  }
  if (operand.kind !== "class-set") return false;
  if (operand.operation === "union") {
    return operand.operands.some(classSetOperandMayContainStrings);
  }
  if (operand.operation === "intersection") {
    return (
      operand.operands.length > 0 &&
      operand.operands.every(classSetOperandMayContainStrings)
    );
  }
  const first = operand.operands[0];
  return first != null && classSetOperandMayContainStrings(first);
}

function parseUnicodeClassSet(state: ParseState): RegExpUnicodeClassSet {
  const start = state.index;
  state.index += 1;
  const negated = eat(state, "^");
  const operands: RegExpClassSetOperand[] = [];
  if (at(state, 0) !== "]") operands.push(parseClassSetOperand(state));
  let operation: RegExpUnicodeClassSet["operation"] = "union";
  if (state.source.startsWith("&&", state.index)) {
    operation = "intersection";
  } else if (state.source.startsWith("--", state.index)) {
    operation = "subtraction";
  }
  if (operation !== "union" && operands[0]?.kind === "range") {
    fail(
      "invalid",
      "A class set range cannot be an intersection or subtraction operand.",
      operands[0].span,
    );
  }
  while (!done(state) && at(state, 0) !== "]") {
    if (operation === "intersection") {
      if (!state.source.startsWith("&&", state.index)) {
        fail("invalid", "A class set mixes its operators.", {
          end: state.index + 1,
          start: state.index,
        });
      }
      state.index += 2;
      if (at(state, 0) === "&") {
        fail(
          "invalid",
          "A class set operator needs an operand.",
          span(state.index - 2, state.index + 1),
        );
      }
    } else if (operation === "subtraction") {
      if (!state.source.startsWith("--", state.index)) {
        fail("invalid", "A class set mixes its operators.", {
          end: state.index + 1,
          start: state.index,
        });
      }
      state.index += 2;
    }
    const operand = parseClassSetOperand(state);
    if (operation !== "union" && operand.kind === "range") {
      fail(
        "invalid",
        "A class set range cannot be an intersection or subtraction " +
          "operand.",
        operand.span,
      );
    }
    operands.push(operand);
  }
  if (!eat(state, "]")) {
    fail("invalid", "A character class is unterminated.", {
      end: state.index,
      start,
    });
  }
  const classSet: RegExpUnicodeClassSet = {
    kind: "class-set",
    negated,
    operands,
    operation,
    span: span(start, state.index),
  };
  if (negated && classSetOperandMayContainStrings(classSet)) {
    fail(
      "invalid",
      "A negated character class may contain strings.",
      classSet.span,
    );
  }
  return classSet;
}

function parseCharacterClass(
  state: ParseState,
): RegExpCharacterClass | RegExpUnicodeClassSet {
  const start = state.index;
  if (state.flags.unicodeSets) {
    if (!admits(state, "class-set-notation")) {
      fail(
        "unsupported",
        "Class set notation is not admitted yet.",
        span(start, start + 1),
      );
    }
    return parseUnicodeClassSet(state);
  }
  state.index += 1;
  const negated = eat(state, "^");
  const items: RegExpClassItem[] = [];
  for (;;) {
    if (done(state)) {
      fail("invalid", "A character class is unterminated.", {
        end: state.index,
        start,
      });
    }
    if (eat(state, "]")) break;
    const first = parseClassAtom(state);
    if (at(state, 0) === "-" && at(state, 1) !== "]" && at(state, 1) != null) {
      state.index += 1;
      const second = parseClassAtom(state);
      const low = classItemValue(first);
      const high = classItemValue(second);
      if (low == null || high == null) {
        refuseAnnexB(
          state,
          "A character class range bound cannot be a class escape.",
          "A class escape as a character class range bound",
          { end: state.index, start: first.span.start },
        );
      }
      if (low.value > high.value) {
        fail("invalid", "A character class range is out of order.", {
          end: state.index,
          start: first.span.start,
        });
      }
      items.push({
        end: high,
        kind: "range",
        span: span(first.span.start, state.index),
        start: low,
      });
      continue;
    }
    items.push(first);
  }
  return {
    items,
    kind: "character-class",
    negated,
    span: span(start, state.index),
  };
}

function parseClassAtom(state: ParseState): RegExpClassItem {
  const start = state.index;
  if (!eat(state, "\\")) return readCharacter(state);
  if (at(state, 0) === "b") {
    state.index += 1;
    return { kind: "character", span: span(start, state.index), value: 8 };
  }
  const classEscape = readClassEscape(state, start);
  if (classEscape != null) return classEscape;
  const property = readUnicodePropertyEscape(state, start);
  if (property != null) return property;
  return {
    kind: "character",
    span: span(start, state.index),
    value: readClassSetCharacterEscape(state, start),
  };
}

function parseAtomEscape(state: ParseState, start: number): RegExpAtom {
  const character = at(state, 0);
  if (character != null && character >= "1" && character <= "9") {
    const digits = readDecimalDigits(state);
    const location = span(start, state.index);
    /*
     * A pattern cannot declare more groups than its own text is long, so
     * an index too large to represent exactly still names no group. The
     * approximate value is only ever compared against the capture count,
     * and validation reports the ordinary early error for it.
     */
    const index = Number(digits);
    state.backreferences.push({ index, span: location });
    return { index, kind: "backreference", span: location };
  }
  if (character === "k") {
    state.index += 1;
    /*
     * Without a group specifier and without `u` or `v` the grammar never
     * enters its named-reference production, so Annex B reads the escape
     * as an identity escape whatever follows it. Reading a group name
     * here instead would report the shape of text the grammar never
     * looked at.
     */
    if (!state.unicodeMode && !state.groupNameDeclared) {
      fail(
        "unsupported",
        annexBMessage(
          "A named backreference in a pattern that declares no group name",
        ),
        span(start, state.index),
      );
    }
    const name = readGroupName(state, start);
    const location = span(start, state.index);
    state.namedReferences.push({ name, span: location });
    const indices = state.namedReferenceIndices.get(name) ?? [];
    state.namedReferenceIndices.set(name, indices);
    return { indices, kind: "named-backreference", name, span: location };
  }
  const classEscape = readClassEscape(state, start);
  if (classEscape != null) return classEscape;
  const property = readUnicodePropertyEscape(state, start);
  if (property != null) return property;
  return {
    kind: "character",
    span: span(start, state.index),
    value: readCharacterEscape(state, start),
  };
}

function parseGroup(state: ParseState): RegExpAtom {
  const start = state.index;
  state.index += 1;
  if (eat(state, "?")) {
    if (eat(state, ":")) {
      const body = parseDisjunction(state);
      expectGroupEnd(state, start);
      return { body, kind: "group", span: span(start, state.index) };
    }
    if (at(state, 0) === "<") {
      const name = readGroupName(state, start);
      const capture = declareCapture(state, start, name);
      const body = parseDisjunction(state);
      expectGroupEnd(state, start);
      return {
        body,
        index: capture,
        kind: "capturing-group",
        name,
        span: span(start, state.index),
      };
    }
    const enabled = readModifierFlags(state, start);
    const disabled = eat(state, "-") ? readModifierFlags(state, start) : [];
    if (!eat(state, ":")) {
      fail("invalid", "This group prefix is not a valid group.", {
        end: state.index + 1,
        start,
      });
    }
    if (enabled.length === 0 && disabled.length === 0) {
      fail("invalid", "A modifier group names no flag.", {
        end: state.index,
        start,
      });
    }
    if (enabled.some((flag) => disabled.includes(flag))) {
      fail("invalid", "A modifier group both adds and removes a flag.", {
        end: state.index,
        start,
      });
    }
    if (!admits(state, "modifiers")) {
      fail("unsupported", "An inline modifier group is not admitted yet.", {
        end: state.index,
        start,
      });
    }
    const body = parseDisjunction(state);
    expectGroupEnd(state, start);
    return {
      body,
      disabled,
      enabled,
      kind: "modifier-group",
      span: span(start, state.index),
    };
  }
  const capture = declareCapture(state, start);
  const body = parseDisjunction(state);
  expectGroupEnd(state, start);
  return {
    body,
    index: capture,
    kind: "capturing-group",
    span: span(start, state.index),
  };
}

function declareCapture(
  state: ParseState,
  start: number,
  name?: string,
): number {
  if (state.captures.length >= state.limits.capturingGroups) {
    fail("limit", "A pattern declares too many capturing groups.", {
      end: state.index,
      start,
    });
  }
  const index = state.captures.length + 1;
  const location = span(start, state.index);
  state.captures.push({
    index,
    span: location,
    ...includePropertiesWhen(() => {
      if (name == null) return undefined;
      return { name };
    }),
  });
  if (name != null) {
    state.namedGroups.push({
      name,
      path: [...state.path],
      span: location,
    });
  }
  return index;
}

function expectGroupEnd(state: ParseState, start: number): void {
  if (!eat(state, ")")) {
    fail("invalid", "A group is unterminated.", { end: state.index, start });
  }
}

function parseAtom(state: ParseState): RegExpAtom {
  const start = state.index;
  const character = at(state, 0);
  if (character === ".") {
    state.index += 1;
    return { kind: "dot", span: span(start, state.index) };
  }
  if (character === "(") return parseGroup(state);
  if (character === "[") return parseCharacterClass(state);
  if (character === "\\") {
    state.index += 1;
    return parseAtomEscape(state, start);
  }
  if (character === "*" || character === "+" || character === "?") {
    fail("invalid", "A quantifier has no atom to repeat.", {
      end: start + 1,
      start,
    });
  }
  if (character === "{") {
    if (bracedQuantifierFollows(state)) {
      fail("invalid", "A quantifier has no atom to repeat.", {
        end: start + 1,
        start,
      });
    }
    refuseAnnexB(
      state,
      "An unescaped brace is not a pattern character.",
      "An unescaped brace",
      { end: start + 1, start },
    );
  }
  if (character === "]" || character === "}") {
    refuseAnnexB(
      state,
      "This character must be escaped.",
      "This unescaped character",
      { end: start + 1, start },
    );
  }
  return readCharacter(state);
}

/**
 * The bounds one braced quantifier spells, before validation.
 *
 * The digits are retained because two bounds can round to one double
 * while their written values differ, and the edition compares the exact
 * mathematical values.
 */
interface QuantifierBounds {
  readonly maximum: number;
  readonly maximumDigits?: string;
  readonly minimum: number;
  readonly minimumDigits: string;
}

/** Compare two decimal digit strings by exact mathematical value. */
function compareDecimalDigits(first: string, second: string): number {
  const left = first.replace(/^0+(?=\d)/u, "");
  const right = second.replace(/^0+(?=\d)/u, "");
  if (left.length !== right.length) return left.length - right.length;
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Read a braced quantifier body after its `{`, or return undefined when
 * the text is not one. Annex B is outside the claim, so a `{` that starts
 * no quantifier is an error at the caller rather than a literal brace.
 *
 * Recognition is separate from validation: a quantifier that no atom
 * precedes is an error whatever its bounds say, so the bound order and
 * the reviewed bound limit are checked only where a quantifier is
 * grammatically admitted.
 */
function readBracedQuantifier(state: ParseState): QuantifierBounds | undefined {
  const minimumDigits = readDecimalDigits(state);
  if (minimumDigits.length === 0) return undefined;
  const minimum = Number(minimumDigits);
  let maximum = minimum;
  let maximumDigits: string | undefined = minimumDigits;
  if (eat(state, ",")) {
    const written = readDecimalDigits(state);
    maximumDigits = written.length === 0 ? undefined : written;
    maximum =
      maximumDigits == null ? Number.POSITIVE_INFINITY : Number(written);
  }
  if (!eat(state, "}")) return undefined;
  return {
    maximum,
    ...includePropertiesWhen(() => {
      if (maximumDigits == null) return undefined;
      return {
        maximumDigits,
      };
    }),
    minimum,
    minimumDigits,
  };
}

function validateQuantifierBounds(
  state: ParseState,
  bounds: QuantifierBounds,
  start: number,
): QuantifierBounds {
  const location = { end: state.index, start };
  /*
   * The early error comes first: a quantifier whose written lower bound
   * exceeds its written upper bound is invalid at every limit, and the
   * exact digits decide it because two bounds can share one double.
   */
  if (
    bounds.maximumDigits != null &&
    compareDecimalDigits(bounds.minimumDigits, bounds.maximumDigits) > 0
  ) {
    fail(
      "invalid",
      "A quantifier's lower bound is above its upper bound.",
      location,
    );
  }
  const limit = String(state.limits.quantifierBound);
  const above = (digits: string): boolean =>
    compareDecimalDigits(digits, limit) > 0;
  if (
    above(bounds.minimumDigits) ||
    (bounds.maximumDigits != null && above(bounds.maximumDigits))
  ) {
    fail("limit", "A quantifier bound is above the reviewed limit.", location);
  }
  return bounds;
}

function parseQuantifier(state: ParseState): RegExpQuantifier | undefined {
  const start = state.index;
  const character = at(state, 0);
  let bounds:
    | { readonly maximum: number; readonly minimum: number }
    | undefined;
  if (character === "*") {
    state.index += 1;
    bounds = { maximum: Number.POSITIVE_INFINITY, minimum: 0 };
  } else if (character === "+") {
    state.index += 1;
    bounds = { maximum: Number.POSITIVE_INFINITY, minimum: 1 };
  } else if (character === "?") {
    state.index += 1;
    bounds = { maximum: 1, minimum: 0 };
  } else if (character === "{") {
    state.index += 1;
    const braced = readBracedQuantifier(state);
    if (braced == null) {
      state.index = start;
      refuseAnnexB(
        state,
        "An unescaped brace is not a pattern character.",
        "An unescaped brace",
        { end: start + 1, start },
      );
    }
    bounds = validateQuantifierBounds(state, braced, start);
  }
  if (bounds == null) return undefined;
  const greedy = !eat(state, "?");
  return {
    greedy,
    maximum: bounds.maximum,
    minimum: bounds.minimum,
    span: span(start, state.index),
  };
}

function parseLookaround(state: ParseState): RegExpTerm | undefined {
  const start = state.index;
  const behind = state.source.startsWith("(?<=", start)
    ? false
    : state.source.startsWith("(?<!", start)
      ? true
      : undefined;
  const ahead = state.source.startsWith("(?=", start)
    ? false
    : state.source.startsWith("(?!", start)
      ? true
      : undefined;
  if (behind == null && ahead == null) return undefined;
  const negated = behind ?? ahead ?? false;
  state.index += behind == null ? 3 : 4;
  const body = parseDisjunction(state);
  expectGroupEnd(state, start);
  return {
    body,
    direction: behind == null ? "ahead" : "behind",
    kind: "lookaround",
    negated,
    span: span(start, state.index),
  };
}

function parseTerm(state: ParseState): RegExpTerm {
  const start = state.index;
  const lookaround = parseLookaround(state);
  if (lookaround != null) return rejectQuantifier(state, lookaround);
  const character = at(state, 0);
  if (character === "^" || character === "$") {
    state.index += 1;
    return rejectQuantifier(state, {
      assertion: character === "^" ? "start" : "end",
      kind: "assertion",
      span: span(start, state.index),
    });
  }
  if (character === "\\" && (at(state, 1) === "b" || at(state, 1) === "B")) {
    const negated = at(state, 1) === "B";
    state.index += 2;
    return rejectQuantifier(state, {
      assertion: negated ? "non-word-boundary" : "word-boundary",
      kind: "assertion",
      span: span(start, state.index),
    });
  }
  const atom = parseAtom(state);
  const quantifier = parseQuantifier(state);
  if (quantifier == null) return atom;
  return {
    atom,
    kind: "quantified",
    quantifier,
    span: span(start, state.index),
  };
}

/**
 * Reject a quantifier applied to an assertion. The candidate edition
 * admits a quantified assertion only through Annex B, which is outside
 * the claim, so the quantifier is an error rather than a repetition.
 *
 * Annex B quantifies a lookahead alone. An edge assertion, a word
 * boundary, and a lookbehind are unquantifiable in every mode, so only a
 * lookahead reports this claim's own boundary.
 */
function rejectQuantifier(state: ParseState, term: RegExpTerm): RegExpTerm {
  const character = at(state, 0);
  const quantified =
    character === "*" ||
    character === "+" ||
    character === "?" ||
    (character === "{" && bracedQuantifierFollows(state));
  if (quantified) {
    const location = { end: state.index + 1, start: state.index };
    const message = "An assertion cannot be quantified.";
    if (term.kind !== "lookaround" || term.direction !== "ahead") {
      fail("invalid", message, location);
    }
    refuseAnnexB(state, message, "A quantified lookahead", location);
  }
  return term;
}

/**
 * Whether the `{` at the cursor starts a quantifier.
 *
 * A brace that starts no quantifier is its own early error, reported
 * where the next term reads it, so an assertion followed by one is not
 * described as a quantified assertion.
 */
function bracedQuantifierFollows(state: ParseState): boolean {
  const resume = state.index;
  try {
    state.index += 1;
    return readBracedQuantifier(state) != null;
  } finally {
    state.index = resume;
  }
}

function parseAlternative(state: ParseState): RegExpAlternative {
  const start = state.index;
  const terms: RegExpTerm[] = [];
  while (!done(state) && at(state, 0) !== "|" && at(state, 0) !== ")") {
    terms.push(parseTerm(state));
  }
  return { kind: "alternative", span: span(start, state.index), terms };
}

function parseDisjunction(state: ParseState): RegExpDisjunction {
  const start = state.index;
  state.depth += 1;
  if (state.depth > state.limits.nestingDepth) {
    fail("limit", "A pattern nests above the reviewed depth limit.", {
      end: state.index,
      start,
    });
  }
  const disjunction = state.disjunctionCount;
  state.disjunctionCount += 1;
  const alternatives: RegExpAlternative[] = [];
  for (let index = 0; ; index += 1) {
    state.path.push({ alternative: index, disjunction });
    alternatives.push(parseAlternative(state));
    state.path.pop();
    if (!eat(state, "|")) break;
  }
  state.depth -= 1;
  return {
    alternatives,
    kind: "disjunction",
    span: span(start, state.index),
  };
}

function parseFlags(text: string): RegExpFlags {
  const seen = new Set<string>();
  const admitted = "dgimsuvy";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (!admitted.includes(character)) {
      fail(
        "invalid",
        "This regular expression flag is not defined.",
        span(index, index + 1),
        "flags",
      );
    }
    if (seen.has(character)) {
      fail(
        "invalid",
        "This regular expression flag is repeated.",
        span(index, index + 1),
        "flags",
      );
    }
    seen.add(character);
  }
  if (seen.has("u") && seen.has("v")) {
    fail(
      "invalid",
      "The u and v flags cannot be combined.",
      span(0, text.length),
      "flags",
    );
  }
  return {
    dotAll: seen.has("s"),
    global: seen.has("g"),
    hasIndices: seen.has("d"),
    ignoreCase: seen.has("i"),
    multiline: seen.has("m"),
    sticky: seen.has("y"),
    text,
    unicode: seen.has("u"),
    unicodeSets: seen.has("v"),
  };
}

/**
 * Whether two groups with one name can both participate in a match.
 *
 * They cannot when some enclosing disjunction holds them in different
 * alternatives, which is the condition the candidate edition uses to
 * admit a repeated group name.
 */
function mightBothParticipate(
  first: readonly AlternativePath[],
  second: readonly AlternativePath[],
): boolean {
  const shared = Math.min(first.length, second.length);
  for (let index = 0; index < shared; index += 1) {
    const left = first[index];
    const right = second[index];
    if (left == null || right == null) break;
    if (left.disjunction !== right.disjunction) break;
    if (left.alternative !== right.alternative) return false;
  }
  return true;
}

/**
 * Order two alternative paths so that adjacent pairs decide the whole
 * set.
 *
 * Exclusivity is transitive along this order: if a sorted neighbor pair
 * diverges at a disjunction, every wider pair diverges at one too, so a
 * sorted scan replaces a comparison of every pair with every other.
 */
function comparePaths(
  first: readonly AlternativePath[],
  second: readonly AlternativePath[],
): number {
  const shared = Math.min(first.length, second.length);
  for (let index = 0; index < shared; index += 1) {
    const left = first[index];
    const right = second[index];
    if (left == null || right == null) break;
    if (left.disjunction !== right.disjunction) {
      return left.disjunction - right.disjunction;
    }
    if (left.alternative !== right.alternative) {
      return left.alternative - right.alternative;
    }
  }
  return first.length - second.length;
}

function duplicateNameErrors(
  groups: readonly NamedGroupRecord[],
): readonly RegExpPatternError[] {
  const errors: RegExpPatternError[] = [];
  const byName = new Map<string, NamedGroupRecord[]>();
  for (const group of groups) {
    const existing = byName.get(group.name) ?? [];
    existing.push(group);
    byName.set(group.name, existing);
  }
  for (const named of byName.values()) {
    if (named.length < 2) continue;
    const ordered = named.toSorted((first, second) =>
      comparePaths(first.path, second.path),
    );
    for (let index = 1; index < ordered.length; index += 1) {
      const earlier = ordered[index - 1];
      const later = ordered[index];
      if (earlier == null || later == null) continue;
      if (!mightBothParticipate(earlier.path, later.path)) continue;
      const reported = later.span.start >= earlier.span.start ? later : earlier;
      errors.push({
        kind: "invalid",
        message:
          "This group name repeats one that can participate in the " +
          "same match.",
        section: "pattern",
        span: reported.span,
      });
    }
  }
  return errors;
}

function validate(state: ParseState): readonly RegExpPatternError[] {
  const errors: RegExpPatternError[] = [];
  const total = state.captures.length;
  for (const reference of state.backreferences) {
    if (reference.index > total) {
      // Annex B reads a decimal escape past the capture count as a legacy
      // octal or identity escape rather than as a reference.
      errors.push(
        annexBError(
          state,
          "This backreference names no capturing group.",
          "A backreference that names no capturing group",
          reference.span,
        ),
      );
    }
  }
  errors.push(...duplicateNameErrors(state.namedGroups));
  const indexByName = new Map<string, number[]>();
  for (const capture of state.captures) {
    if (capture.name == null) continue;
    const indices = indexByName.get(capture.name) ?? [];
    indices.push(capture.index);
    indexByName.set(capture.name, indices);
  }
  /*
   * A reference reaches validation only where the grammar's
   * named-reference production was active, so a name it does not declare
   * is an early error a web browser reports too.
   */
  for (const reference of state.namedReferences) {
    if (indexByName.has(reference.name)) continue;
    errors.push({
      kind: "invalid",
      message: "This named backreference names no capturing group.",
      section: "pattern",
      span: reference.span,
    });
  }
  for (const [name, shared] of state.namedReferenceIndices) {
    shared.push(...(indexByName.get(name) ?? []));
  }
  errors.sort((first, second) => first.span.start - second.span.start);
  return errors;
}

/**
 * Keep one reported span inside the text it addresses.
 *
 * A production that reports the character it expected can name an offset
 * one past the end when the pattern stops early, so the reported span is
 * clamped once here rather than at every such production.
 */
function clampError(
  error: RegExpPatternError,
  input: RegExpPatternInput,
): RegExpPatternError {
  const length =
    error.section === "flags" ? input.flags.length : input.source.length;
  const start = Math.min(Math.max(error.span.start, 0), length);
  const end = Math.min(Math.max(error.span.end, start), length);
  if (start === error.span.start && end === error.span.end) return error;
  return { ...error, span: { end, start } };
}

/**
 * Parse and validate one pattern and flag text.
 *
 * The result is the owned representation of the pattern; no bootstrap
 * parser node reaches it, and no construct is admitted whose semantics
 * this unit cannot describe.
 */
export function parseRegExpPattern(
  input: RegExpPatternInput,
): RegExpPatternResult {
  const limits = input.limits ?? defaultRegExpPatternLimits;
  try {
    if (input.source.length > limits.sourceLength) {
      fail("limit", "A pattern is longer than the reviewed limit.", {
        end: input.source.length,
        start: 0,
      });
    }
    const flags = parseFlags(input.flags);
    const state: ParseState = {
      backreferences: [],
      captures: [],
      depth: 0,
      disjunctionCount: 0,
      extensions: input.extensions ?? noExtensions,
      flags,
      groupNameDeclared: scanForGroupName(input.source),
      index: 0,
      limits,
      namedGroups: [],
      namedReferenceIndices: new Map(),
      namedReferences: [],
      path: [],
      source: input.source,
      unicodeMode: regExpUnicodeMode(flags),
    };
    const body = parseDisjunction(state);
    if (!done(state)) {
      fail("invalid", "This character must be escaped.", {
        end: state.index + 1,
        start: state.index,
      });
    }
    const errors = validate(state).map((error) => clampError(error, input));
    if (errors.length > 0) return { errors, parsed: false };
    const groupNames = [
      ...new Set(
        state.captures.flatMap((capture) =>
          capture.name == null ? [] : [capture.name],
        ),
      ),
    ];
    const pattern: RegExpPattern = {
      body,
      captures: state.captures,
      flags,
      groupNames,
      kind: "pattern",
      source: input.source,
    };
    return { errors: [], parsed: true, pattern };
  } catch (error) {
    if (error instanceof PatternFailure) {
      return {
        errors: [clampError(error.error, input)],
        parsed: false,
      };
    }
    throw error;
  }
}

/**
 * Parse one regular expression literal recorded by a frontend.
 *
 * The literal already carries its own source location, so the returned
 * spans stay relative to the pattern and flag text and the frontend maps
 * them back into the source it owns.
 */
export function parseRegExpLiteral(
  literal: RegExpLiteralSyntax,
  options: RegExpPatternOptions = {},
): RegExpPatternResult {
  return parseRegExpPattern({
    flags: literal.flags,
    source: literal.pattern,
    ...options,
  });
}
