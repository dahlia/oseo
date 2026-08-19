import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  parseRegExpPattern,
  printRegExpPattern,
} from "../../packages/compiler/src/index.ts";
import type {
  RegExpAlternative,
  RegExpClassItem,
  RegExpErrorKind,
  RegExpErrorSection,
  RegExpPattern,
  RegExpSpan,
  RegExpTerm,
} from "../../packages/compiler/src/index.ts";

const { assertProperty, propertySize } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/*
 * The domain is the owned pattern model, not pattern source. A case is
 * built as a structured model, normalized so every reference names a
 * group that exists, and printed only inside the predicate, so shrinking
 * keeps capture numbering, group names, assertion direction, and
 * reference validity rather than reducing text to something the grammar
 * never admits.
 *
 * Two observations are independent of the parser. The host engine
 * decides whether the printed pattern is valid at all and reports its own
 * capture count and group names, and a summary walk over the model is
 * compared with a summary walk over the parsed tree. This unit admits no
 * matching, so no observation here compares match state; that comparison
 * belongs to the generic matcher unit.
 *
 * The host is a one-directional oracle. Annex B is outside the candidate
 * claim, so a pattern without the `u` flag may be rejected here and
 * accepted by the host; the invalid domain therefore requires the host to
 * agree only under `u`, where Annex B adds nothing.
 */

const size = propertySize();
const maximumTerms = size === "large" ? 5 : 3;
const maximumAlternatives = size === "large" ? 3 : 2;
const maximumDepth = size === "large" ? 3 : 2;
const maximumClassItems = size === "large" ? 4 : 2;

type ClassSet = "digit" | "space" | "word";

type AssertionKind = "end" | "non-word-boundary" | "start" | "word-boundary";

interface CharacterModel {
  readonly kind: "char";
  readonly value: number;
}

interface RangeModel {
  readonly from: number;
  readonly kind: "range";
  readonly to: number;
}

interface ClassEscapeModel {
  readonly kind: "class-escape";
  readonly negated: boolean;
  readonly set: ClassSet;
}

type ClassItemModel = CharacterModel | ClassEscapeModel | RangeModel;

interface ClassModel {
  readonly items: readonly ClassItemModel[];
  readonly kind: "class";
  readonly negated: boolean;
}

interface DotModel {
  readonly kind: "dot";
}

interface AssertionModel {
  readonly assertion: AssertionKind;
  readonly kind: "assert";
}

interface GroupModel {
  readonly body: readonly (readonly TermModel[])[];
  readonly capturing: boolean;
  readonly kind: "group";
  readonly named: boolean;
}

interface LookaroundModel {
  readonly behind: boolean;
  readonly body: readonly (readonly TermModel[])[];
  readonly kind: "look";
  readonly negated: boolean;
}

interface RepeatModel {
  readonly atom: TermModel;
  readonly greedy: boolean;
  readonly kind: "repeat";
  readonly maximum: number;
  readonly minimum: number;
}

interface ReferenceModel {
  readonly kind: "reference";
  readonly named: boolean;
  readonly slot: number;
}

type TermModel =
  | AssertionModel
  | CharacterModel
  | ClassEscapeModel
  | ClassModel
  | DotModel
  | GroupModel
  | LookaroundModel
  | ReferenceModel
  | RepeatModel;

interface PatternModel {
  readonly body: readonly (readonly TermModel[])[];
  readonly flags: string;
}

/** One group after numbering, in ascending capture index order. */
interface ResolvedCapture {
  readonly index: number;
  readonly name?: string;
}

const bmpCharacters: readonly number[] = [
  0x00, 0x09, 0x20, 0x24, 0x28, 0x29, 0x2a, 0x2b, 0x2d, 0x2e, 0x30, 0x3f, 0x41,
  0x5a, 0x5b, 0x5c, 0x5d, 0x5e, 0x5f, 0x61, 0x7a, 0x7b, 0x7c, 0x7d, 0x7f, 0xe9,
  0x4e2d, 0xd800, 0xdfff, 0xffff,
];

const supplementaryCharacters: readonly number[] = [
  0x1_0000, 0x1_f600, 0x10_ffff,
];

function characterPool(unicode: boolean): readonly number[] {
  return unicode
    ? [...bmpCharacters, ...supplementaryCharacters]
    : bmpCharacters;
}

/**
 * The unicode-mode flag, chosen before any flag-sensitive syntax.
 *
 * `v` selects the same UnicodeMode as `u` and additionally selects class
 * set notation, which this unit refuses, so a `v` case generates no
 * character class and covers the rest of the grammar under that flag.
 */
const flagsArbitrary = fc
  .record({
    hasIndices: fc.boolean(),
    global: fc.boolean(),
    ignoreCase: fc.boolean(),
    multiline: fc.boolean(),
    dotAll: fc.boolean(),
    unicodeMode: fc.constantFrom("", "u", "v"),
    sticky: fc.boolean(),
  })
  .map((selected) =>
    [
      selected.hasIndices ? "d" : "",
      selected.global ? "g" : "",
      selected.ignoreCase ? "i" : "",
      selected.multiline ? "m" : "",
      selected.dotAll ? "s" : "",
      selected.unicodeMode,
      selected.sticky ? "y" : "",
    ].join(""),
  );

function modelArbitrary(
  unicode: boolean,
  classesAdmitted: boolean,
): fc.Arbitrary<PatternModel> {
  const pool = characterPool(unicode);
  const character = fc
    .constantFrom(...pool)
    .map((value): CharacterModel => ({ kind: "char", value }));
  const classEscape = fc
    .record({
      negated: fc.boolean(),
      set: fc.constantFrom<ClassSet>("digit", "space", "word"),
    })
    .map(
      (record): ClassEscapeModel => ({
        kind: "class-escape",
        negated: record.negated,
        set: record.set,
      }),
    );
  const range = fc
    .tuple(fc.constantFrom(...pool), fc.constantFrom(...pool))
    .map(
      ([first, second]): RangeModel => ({
        from: Math.min(first, second),
        kind: "range",
        to: Math.max(first, second),
      }),
    );
  const classModel = fc
    .record({
      items: fc.array(fc.oneof(character, classEscape, range), {
        maxLength: maximumClassItems,
      }),
      negated: fc.boolean(),
    })
    .map(
      (record): ClassModel => ({
        items: record.items,
        kind: "class",
        negated: record.negated,
      }),
    );
  const assertion = fc
    .constantFrom<AssertionKind>(
      "end",
      "non-word-boundary",
      "start",
      "word-boundary",
    )
    .map((value): AssertionModel => ({ assertion: value, kind: "assert" }));
  const reference = fc
    .record({ named: fc.boolean(), slot: fc.nat({ max: 7 }) })
    .map(
      (record): ReferenceModel => ({
        kind: "reference",
        named: record.named,
        slot: record.slot,
      }),
    );
  const { term } = fc.letrec<{
    alternatives: readonly (readonly TermModel[])[];
    atom: TermModel;
    term: TermModel;
  }>((tie) => ({
    alternatives: fc.array(fc.array(tie("term"), { maxLength: maximumTerms }), {
      maxLength: maximumAlternatives,
      minLength: 1,
    }),
    atom: fc.oneof(
      {
        depthIdentifier: "pattern",
        depthSize: "small",
        maxDepth: maximumDepth,
      },
      character,
      fc.constant<DotModel>({ kind: "dot" }),
      classEscape,
      classesAdmitted ? classModel : character,
      reference,
      fc
        .record({
          body: tie("alternatives"),
          capturing: fc.boolean(),
          named: fc.boolean(),
        })
        .map(
          (record): GroupModel => ({
            body: record.body,
            capturing: record.capturing,
            kind: "group",
            named: record.capturing && record.named,
          }),
        ),
    ),
    term: fc.oneof(
      {
        depthIdentifier: "pattern",
        depthSize: "small",
        maxDepth: maximumDepth,
      },
      tie("atom"),
      assertion,
      fc
        .record({
          behind: fc.boolean(),
          body: tie("alternatives"),
          negated: fc.boolean(),
        })
        .map(
          (record): LookaroundModel => ({
            behind: record.behind,
            body: record.body,
            kind: "look",
            negated: record.negated,
          }),
        ),
      fc
        .record({
          atom: tie("atom"),
          greedy: fc.boolean(),
          minimum: fc.nat({ max: 3 }),
          span: fc.oneof(fc.nat({ max: 3 }), fc.constant(-1)),
        })
        .map(
          (record): RepeatModel => ({
            atom: record.atom,
            greedy: record.greedy,
            kind: "repeat",
            maximum:
              record.span < 0
                ? Number.POSITIVE_INFINITY
                : record.minimum + record.span,
            minimum: record.minimum,
          }),
        ),
    ),
  }));
  return fc
    .array(fc.array(term, { maxLength: maximumTerms }), {
      maxLength: maximumAlternatives,
      minLength: 1,
    })
    .map((body): PatternModel => ({ body, flags: unicode ? "u" : "" }));
}

function unicodeMode(flags: string): boolean {
  return flags.includes("u") || flags.includes("v");
}

function patternArbitrary(): fc.Arbitrary<PatternModel> {
  return flagsArbitrary.chain((flags) =>
    modelArbitrary(unicodeMode(flags), !flags.includes("v")).map(
      (model): PatternModel => ({ body: model.body, flags }),
    ),
  );
}

/**
 * Number every capturing group and name the named ones.
 *
 * Numbering follows the opening parenthesis, which is the order the
 * candidate edition assigns, so the expected numbering is derived from
 * the model rather than read back from the parser.
 */
function numberCaptures(model: PatternModel): readonly ResolvedCapture[] {
  const captures: ResolvedCapture[] = [];
  const visitAlternatives = (
    alternatives: readonly (readonly TermModel[])[],
  ): void => {
    for (const terms of alternatives) for (const term of terms) visit(term);
  };
  const visit = (term: TermModel): void => {
    if (term.kind === "group") {
      if (term.capturing) {
        const index = captures.length + 1;
        captures.push(term.named ? { index, name: `g${index}` } : { index });
      }
      visitAlternatives(term.body);
      return;
    }
    if (term.kind === "look") {
      visitAlternatives(term.body);
      return;
    }
    if (term.kind === "repeat") visit(term.atom);
  };
  visitAlternatives(model.body);
  return captures;
}

interface PrintContext {
  readonly captures: readonly ResolvedCapture[];
  readonly names: readonly string[];
  readonly unicodeMode: boolean;
}

const syntaxCharacters = new Set("^$\\.*+?()[]{}|");

function printCharacter(
  value: number,
  context: PrintContext,
  inClass: boolean,
  digitGuard: boolean,
): string {
  const text = String.fromCodePoint(value);
  if (inClass && value === 0x2d) return "\\-";
  if (syntaxCharacters.has(text)) return `\\${text}`;
  if (value >= 0x30 && value <= 0x39 && digitGuard) {
    return context.unicodeMode
      ? `\\u{${value.toString(16)}}`
      : `\\u${value.toString(16).padStart(4, "0")}`;
  }
  if (value > 0x20 && value < 0x7f) return text;
  return context.unicodeMode
    ? `\\u{${value.toString(16)}}`
    : `\\u${value.toString(16).padStart(4, "0")}`;
}

function printClassItem(item: ClassItemModel, context: PrintContext): string {
  if (item.kind === "char") {
    return printCharacter(item.value, context, true, false);
  }
  if (item.kind === "range") {
    return (
      `${printCharacter(item.from, context, true, false)}-` +
      printCharacter(item.to, context, true, false)
    );
  }
  return `\\${item.negated ? item.set[0]?.toUpperCase() : item.set[0]}`;
}

const assertionText = new Map<AssertionKind, string>([
  ["end", "$"],
  ["non-word-boundary", "\\B"],
  ["start", "^"],
  ["word-boundary", "\\b"],
]);

function referenceTarget(
  reference: ReferenceModel,
  context: PrintContext,
): ResolvedCapture | string | undefined {
  if (reference.named) {
    if (context.names.length === 0) return undefined;
    return context.names[reference.slot % context.names.length];
  }
  if (context.captures.length === 0) return undefined;
  const capture = context.captures[reference.slot % context.captures.length];
  return capture;
}

/**
 * The number of capturing groups opened so far.
 *
 * The printer and the summary walk visit groups in the order the
 * numbering pass did, so one shared cursor gives both the capture index
 * of the group they are inside without a second traversal.
 */
interface GroupCursor {
  count: number;
}

function printTerm(
  term: TermModel,
  context: PrintContext,
  cursor: GroupCursor,
  digitGuard: boolean,
): string {
  if (term.kind === "char") {
    return printCharacter(term.value, context, false, digitGuard);
  }
  if (term.kind === "dot") return ".";
  if (term.kind === "class-escape") {
    return `\\${term.negated ? term.set[0]?.toUpperCase() : term.set[0]}`;
  }
  if (term.kind === "class") {
    return (
      `[${term.negated ? "^" : ""}` +
      `${term.items.map((item) => printClassItem(item, context)).join("")}]`
    );
  }
  if (term.kind === "assert") return assertionText.get(term.assertion) ?? "";
  if (term.kind === "look") {
    const prefix = term.behind
      ? term.negated
        ? "(?<!"
        : "(?<="
      : term.negated
        ? "(?!"
        : "(?=";
    return `${prefix}${printAlternatives(term.body, context, cursor)})`;
  }
  if (term.kind === "repeat") {
    return (
      printTerm(term.atom, context, cursor, digitGuard) +
      quantifierText(term.minimum, term.maximum) +
      (term.greedy ? "" : "?")
    );
  }
  if (term.kind === "reference") {
    const target = referenceTarget(term, context);
    if (target == null) return printCharacter(0x61, context, false, digitGuard);
    return typeof target === "string" ? `\\k<${target}>` : `\\${target.index}`;
  }
  const index = term.capturing ? cursor.count + 1 : 0;
  if (term.capturing) cursor.count += 1;
  const opening = term.capturing ? (term.named ? `(?<g${index}>` : "(") : "(?:";
  return `${opening}${printAlternatives(term.body, context, cursor)})`;
}

function quantifierText(minimum: number, maximum: number): string {
  if (minimum === 0 && maximum === Number.POSITIVE_INFINITY) return "*";
  if (minimum === 1 && maximum === Number.POSITIVE_INFINITY) return "+";
  if (minimum === 0 && maximum === 1) return "?";
  if (maximum === Number.POSITIVE_INFINITY) return `{${minimum},}`;
  if (minimum === maximum) return `{${minimum}}`;
  return `{${minimum},${maximum}}`;
}

function printAlternatives(
  alternatives: readonly (readonly TermModel[])[],
  context: PrintContext,
  cursor: GroupCursor,
): string {
  return alternatives
    .map((terms) => {
      let text = "";
      for (const term of terms) {
        text += printTerm(term, context, cursor, /\\\d+$/u.test(text));
      }
      return text;
    })
    .join("|");
}

function printModel(model: PatternModel, context: PrintContext): string {
  return printAlternatives(model.body, context, { count: 0 });
}

function summarizeModelTerm(
  term: TermModel,
  context: PrintContext,
  cursor: GroupCursor,
): string {
  if (term.kind === "char") return `char:${term.value}`;
  if (term.kind === "dot") return "dot";
  if (term.kind === "class-escape") {
    return `escape:${term.negated ? "not-" : ""}${term.set}`;
  }
  if (term.kind === "class") {
    const items = term.items.map((item) =>
      item.kind === "char"
        ? `char:${item.value}`
        : item.kind === "range"
          ? `range:${item.from}-${item.to}`
          : `escape:${item.negated ? "not-" : ""}${item.set}`,
    );
    return `class:${term.negated ? "not" : "in"}(${items.join(",")})`;
  }
  if (term.kind === "assert") return `assert:${term.assertion}`;
  if (term.kind === "look") {
    const direction = term.behind ? "behind" : "ahead";
    const polarity = term.negated ? "not" : "yes";
    return (
      `look:${direction}:${polarity}` +
      `(${summarizeModelAlternatives(term.body, context, cursor)})`
    );
  }
  if (term.kind === "repeat") {
    const maximum = Number.isFinite(term.maximum) ? term.maximum : "inf";
    return (
      `repeat:${term.minimum}-${maximum}:${term.greedy ? "greedy" : "lazy"}` +
      `(${summarizeModelTerm(term.atom, context, cursor)})`
    );
  }
  if (term.kind === "reference") {
    const target = referenceTarget(term, context);
    if (target == null) return `char:${0x61}`;
    if (typeof target === "string") {
      const indices = context.captures
        .filter((capture) => capture.name === target)
        .map((capture) => capture.index);
      return `nameref:${target}:${indices.join("+")}`;
    }
    return `backref:${target.index}`;
  }
  const index = term.capturing ? cursor.count + 1 : 0;
  if (term.capturing) cursor.count += 1;
  const name = term.named ? `g${index}` : "";
  const label = term.capturing ? `capture:${index}:${name}` : "group";
  return `${label}(${summarizeModelAlternatives(term.body, context, cursor)})`;
}

function summarizeModelAlternatives(
  alternatives: readonly (readonly TermModel[])[],
  context: PrintContext,
  cursor: GroupCursor,
): string {
  return alternatives
    .map((terms) =>
      terms.map((term) => summarizeModelTerm(term, context, cursor)).join(" "),
    )
    .join("|");
}

function summarizeModel(model: PatternModel, context: PrintContext): string {
  return summarizeModelAlternatives(model.body, context, { count: 0 });
}

function summarizeParsedClassItem(item: RegExpClassItem): string {
  if (item.kind === "character") return `char:${item.value}`;
  if (item.kind === "range") {
    return `range:${item.start.value}-${item.end.value}`;
  }
  if (item.kind === "class-escape") {
    return `escape:${item.negated ? "not-" : ""}${item.set}`;
  }
  return `property:${item.property}`;
}

function summarizeParsedTerm(term: RegExpTerm): string {
  if (term.kind === "character") return `char:${term.value}`;
  if (term.kind === "dot") return "dot";
  if (term.kind === "class-escape") {
    return `escape:${term.negated ? "not-" : ""}${term.set}`;
  }
  if (term.kind === "character-class") {
    const items = term.items.map(summarizeParsedClassItem);
    return `class:${term.negated ? "not" : "in"}(${items.join(",")})`;
  }
  if (term.kind === "assertion") return `assert:${term.assertion}`;
  if (term.kind === "lookaround") {
    const polarity = term.negated ? "not" : "yes";
    return (
      `look:${term.direction === "behind" ? "behind" : "ahead"}:${polarity}` +
      `(${summarizeParsedAlternatives(term.body.alternatives)})`
    );
  }
  if (term.kind === "quantified") {
    const maximum = Number.isFinite(term.quantifier.maximum)
      ? term.quantifier.maximum
      : "inf";
    const order = term.quantifier.greedy ? "greedy" : "lazy";
    return (
      `repeat:${term.quantifier.minimum}-${maximum}:${order}` +
      `(${summarizeParsedTerm(term.atom)})`
    );
  }
  if (term.kind === "backreference") return `backref:${term.index}`;
  if (term.kind === "named-backreference") {
    return `nameref:${term.name}:${term.indices.join("+")}`;
  }
  if (term.kind === "capturing-group") {
    return (
      `capture:${term.index}:${term.name ?? ""}` +
      `(${summarizeParsedAlternatives(term.body.alternatives)})`
    );
  }
  if (term.kind === "group") {
    return `group(${summarizeParsedAlternatives(term.body.alternatives)})`;
  }
  return `unexpected:${term.kind}`;
}

function summarizeParsedAlternatives(
  alternatives: readonly RegExpAlternative[],
): string {
  return alternatives
    .map((alternative: RegExpAlternative) =>
      alternative.terms.map(summarizeParsedTerm).join(" "),
    )
    .join("|");
}

function summarizeParsed(pattern: RegExpPattern): string {
  return summarizeParsedAlternatives(pattern.body.alternatives);
}

/**
 * Ask the host engine for its own capture count and group names.
 *
 * Adding an empty alternative makes the probe match the empty string
 * whatever the pattern does, so the result array length reports the
 * capture count without executing the generated pattern against input.
 */
function hostCaptures(source: string, flags: string) {
  const probe = new RegExp(`(?:${source})|`, flags);
  const match = probe.exec("");
  if (match == null) throw new Error("the empty alternative always matches");
  return {
    count: match.length - 1,
    names: Object.keys(match.groups ?? {}).toSorted(),
  };
}

test("generated patterns parse into the owned model", () => {
  assertProperty(
    "every generated pattern parses with the model's structure",
    fc.property(patternArbitrary(), (model) => {
      const captures = numberCaptures(model);
      const context: PrintContext = {
        captures,
        names: captures.flatMap((capture) =>
          capture.name == null ? [] : [capture.name],
        ),
        unicodeMode: unicodeMode(model.flags),
      };
      const source = printModel(model, context);
      let hostRejected: unknown;
      try {
        void new RegExp(source, model.flags);
      } catch (error) {
        hostRejected = error;
      }
      assert.equal(
        hostRejected,
        undefined,
        `host rejected /${source}/${model.flags}`,
      );
      const result = parseRegExpPattern({ flags: model.flags, source });
      assert.deepEqual(result.errors, [], `/${source}/${model.flags}`);
      const pattern = result.pattern;
      assert.ok(pattern != null);
      assert.equal(pattern.source, source);
      assert.equal(pattern.flags.text, model.flags);
      assert.deepEqual(
        pattern.captures.map((capture) => capture.index),
        captures.map((capture) => capture.index),
      );
      assert.deepEqual(
        pattern.captures.map((capture) => capture.name ?? null),
        captures.map((capture) => capture.name ?? null),
      );
      const observed = hostCaptures(source, model.flags);
      assert.equal(observed.count, captures.length);
      assert.deepEqual(observed.names, context.names.toSorted());
      assert.equal(summarizeParsed(pattern), summarizeModel(model, context));
      assert.ok(printRegExpPattern(pattern).startsWith("pattern /"));
    }),
    {
      domain:
        "one structured pattern model built from alternatives, terms, " +
        "classes, groups, lookaround, quantifiers, and references, with " +
        "flags chosen before flag-sensitive syntax",
      numRuns: 200,
      profile: "M5b owned regular expression pattern model",
      seed: 0x6000_4a00,
      sizeLimit: `terms<=${maximumTerms} depth<=${maximumDepth}`,
      timeLimitMilliseconds: 60_000,
    },
  );
});

/** What one mutation must make the parser report. */
interface MutationExpectation {
  readonly kind: RegExpErrorKind;
  readonly section: RegExpErrorSection;
  readonly span: RegExpSpan;
}

/**
 * One controlled mutation of a valid case.
 *
 * `applies` keeps every generated case productive: a mutation that only
 * makes sense for one flag set is offered only for that flag set instead
 * of discarding the run. Each mutation names the exact error it must
 * produce, so the property proves the reported phase, section, and
 * location rather than only that something was rejected.
 */
interface MutationModel {
  readonly applies?: (flags: string) => boolean;
  readonly apply: (source: string, flags: string) => readonly [string, string];
  readonly expect: (source: string, flags: string) => MutationExpectation;
  readonly label: string;
}

function patternError(
  kind: RegExpErrorKind,
  start: number,
  end: number,
): MutationExpectation {
  return { kind, section: "pattern", span: { end, start } };
}

function flagError(start: number, end: number): MutationExpectation {
  return { kind: "invalid", section: "flags", span: { end, start } };
}

function suffix(
  label: string,
  text: string,
  expect: (length: number, unicode: boolean) => MutationExpectation,
  applies?: (flags: string) => boolean,
): MutationModel {
  return {
    ...(applies == null ? {} : { applies }),
    apply: (source, flags) => [`${source}${text}`, flags],
    expect: (source, flags) => expect(source.length, unicodeMode(flags)),
    label,
  };
}

const mutations: readonly MutationModel[] = [
  {
    apply: (source, flags) => [`*${source}`, flags],
    expect: () => patternError("invalid", 0, 1),
    label: "quantifier without an atom",
  },
  suffix("unterminated group", "(", (length) =>
    patternError("invalid", length, length + 1),
  ),
  suffix("unmatched close", ")", (length) =>
    patternError("invalid", length, length + 1),
  ),
  suffix(
    "unterminated class",
    "[",
    (length) => patternError("invalid", length, length + 1),
    (flags) => !flags.includes("v"),
  ),
  suffix("trailing backslash", "\\", (length) =>
    patternError("invalid", length, length + 1),
  ),
  suffix("reversed quantifier bounds", "a{2,1}", (length) =>
    patternError("invalid", length + 1, length + 6),
  ),
  /*
   * 65,536 is above the reviewed capture limit, so the reference names no
   * group whatever the generated model captures.
   */
  suffix("unresolved backreference", "\\65536", (length) =>
    patternError("invalid", length, length + 6),
  ),
  suffix("unresolved named reference", "\\k<absent>", (length) =>
    patternError("invalid", length, length + 10),
  ),
  suffix(
    "reversed class range",
    "[z-a]",
    (length) => patternError("invalid", length + 1, length + 4),
    (flags) => !flags.includes("v"),
  ),
  suffix("invalid group name", "(?<0bad>x)", (length) =>
    patternError("invalid", length + 3, length + 4),
  ),
  suffix("unescaped close bracket", "]", (length) =>
    patternError("invalid", length, length + 1),
  ),
  suffix("code point above the range", "\\u{110000}", (length, unicode) =>
    unicode
      ? patternError("invalid", length, length + 10)
      : patternError("invalid", length, length + 2),
  ),
  suffix("unadmitted property escape", "\\p{L}", (length, unicode) =>
    unicode
      ? patternError("unsupported", length, length + 5)
      : patternError("invalid", length, length + 2),
  ),
  suffix(
    "unadmitted class set notation",
    "[a]",
    (length) => patternError("unsupported", length, length + 1),
    (flags) => flags.includes("v"),
  ),
  {
    apply: (source, flags) => [
      source,
      `${flags}${flags.length === 0 ? "gg" : (flags[0] ?? "")}`,
    ],
    expect: (_source, flags) =>
      flags.length === 0
        ? flagError(1, 2)
        : flagError(flags.length, flags.length + 1),
    label: "repeated flag",
  },
  {
    apply: (source, flags) => [source, `${flags}q`],
    expect: (_source, flags) => flagError(flags.length, flags.length + 1),
    label: "undefined flag",
  },
  {
    apply: (source, flags) => [
      source,
      `${flags}${flags.includes("u") ? "v" : flags.includes("v") ? "u" : "uv"}`,
    ],
    expect: (_source, flags) =>
      flagError(0, flags.length + (unicodeMode(flags) ? 1 : 2)),
    label: "incompatible unicode flags",
  },
];

test("one mutation of a generated pattern fails at the exact phase", () => {
  assertProperty(
    "every mutated pattern is rejected at its exact phase and location",
    fc.property(
      patternArbitrary(),
      fc.nat({ max: mutations.length - 1 }),
      (model, slot) => {
        const captures = numberCaptures(model);
        const context: PrintContext = {
          captures,
          names: captures.flatMap((capture) =>
            capture.name == null ? [] : [capture.name],
          ),
          unicodeMode: unicodeMode(model.flags),
        };
        const source = printModel(model, context);
        assert.equal(
          parseRegExpPattern({ flags: model.flags, source }).parsed,
          true,
        );
        const applicable = mutations.filter(
          (mutation) =>
            mutation.applies == null || mutation.applies(model.flags),
        );
        const mutation = applicable[slot % applicable.length];
        assert.ok(mutation != null);
        const [mutated, flags] = mutation.apply(source, model.flags);
        const expected = mutation.expect(source, model.flags);
        const label = `${mutation.label} /${mutated}/${flags}`;
        const result = parseRegExpPattern({ flags, source: mutated });
        assert.equal(result.parsed, false, label);
        const error = result.errors[0];
        assert.ok(error != null, label);
        assert.equal(error.kind, expected.kind, label);
        assert.equal(error.section, expected.section, label);
        assert.deepEqual(error.span, expected.span, label);
        /*
         * The host implements Annex B and this grammar does not, so it
         * agrees about a rejected pattern only under a unicode-mode flag.
         * It never agrees about an unadmitted construct, which is valid
         * ECMAScript that this unit refuses on purpose.
         */
        const hostAgrees =
          expected.section === "flags" ||
          (expected.kind === "invalid" && unicodeMode(flags));
        if (!hostAgrees) return;
        assert.throws(() => new RegExp(mutated, flags), SyntaxError, label);
      },
    ),
    {
      domain:
        "one valid structured pattern model with one grammar violation " +
        "appended to its pattern, prepended to it, or added to its flag " +
        "set, including an unadmitted property escape and class set",
      numRuns: 200,
      profile: "M5b owned regular expression pattern model",
      seed: 0x6000_4a01,
      sizeLimit: `terms<=${maximumTerms} depth<=${maximumDepth}`,
      timeLimitMilliseconds: 60_000,
    },
  );
});
