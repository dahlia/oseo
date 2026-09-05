/**
 * The generic matcher over the pinned Unicode tables.
 *
 * `@oseo/compiler` links no Unicode data, so the artifact builder takes
 * the raw facts it cannot derive from its caller. This suite is that
 * caller: it wires `@oseo/unicode` into the builder and then compares the
 * executor with an independent oracle, so it proves the composition that
 * a package test cannot reach across the boundary.
 *
 * The host engine is the primary oracle. Every pattern here is one the
 * owned grammar admits, and the edition defines one matching semantics for
 * such a pattern, so a disagreement is a defect in this unit rather than
 * an Annex B difference. The pinned word-character and space tables are a
 * second, table-side oracle for the sets the matcher derives itself.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRegExpMatcher,
  compileSource,
  matchRegExpMatcher,
  parseRegExpPattern,
  printMir,
  searchRegExpMatcher,
} from "../packages/compiler/src/index.ts";
import type {
  CompilerOptions,
  RegExpMatcherProgram,
  RegExpPatternExtensions,
} from "../packages/compiler/src/index.ts";
import { defaultComponents } from "../packages/cli/src/index.ts";
import {
  caseInsensitiveUnicodeWordCharacters,
  codePointSetHas,
  simpleCaseFolding,
  wordCharacters,
} from "../packages/unicode/src/index.ts";

import {
  caseEquivalenceClasses,
  propertyEscapeSet,
  stringPropertyEscapeSet,
  unicodeMatcherData,
} from "./regexp-matcher-data.ts";

const propertyExtensions: RegExpPatternExtensions = {
  admitted: ["class-set-notation", "modifiers", "unicode-property-escapes"],
  unicodeProperty: (escape) =>
    propertyEscapeSet(escape) != null ||
    stringPropertyEscapeSet(escape) != null,
};

function artifact(source: string, flags: string): RegExpMatcherProgram {
  const parsed = parseRegExpPattern({
    extensions: propertyExtensions,
    flags,
    source,
  });
  assert.deepEqual(parsed.errors, [], `/${source}/${flags}`);
  const pattern = parsed.pattern;
  if (pattern == null) throw new Error("a parsed pattern is present");
  const result = buildRegExpMatcher(pattern, {
    unicodeData: unicodeMatcherData,
  });
  assert.deepEqual(result.errors, [], `/${source}/${flags}`);
  const program = result.program;
  if (program == null) throw new Error("a built artifact is present");
  return program;
}

/** One match state, or undefined when the search found none. */
interface MatchObservation {
  readonly captures: readonly (string | null)[];
  readonly index: number;
}

/** The match index and every capture of the first match. */
function observe(
  source: string,
  flags: string,
  text: string,
  startIndex = 0,
): MatchObservation | undefined {
  const result = searchRegExpMatcher({
    program: artifact(source, flags),
    startIndex,
    text,
  });
  if (result.outcome !== "matched") return undefined;
  const whole = result.captures[0];
  if (whole == null) throw new Error("a match records its whole span");
  return {
    captures: result.captures.map((span) =>
      span == null ? null : text.slice(span.start, span.end),
    ),
    index: whole.start,
  };
}

/** The same observation taken from the host engine. */
function hostObserve(
  source: string,
  flags: string,
  text: string,
  startIndex = 0,
): MatchObservation | undefined {
  const global = flags.includes("g") || flags.includes("y");
  const probe = new RegExp(source, global ? flags : `${flags}g`);
  probe.lastIndex = startIndex;
  const match = probe.exec(text);
  if (match == null) return undefined;
  return {
    captures: [...match].map((value) => value ?? null),
    index: match.index,
  };
}

/** Whether one index splits a surrogate pair the edition reads as one. */
function splitsPair(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return false;
  const trail = text.charCodeAt(index);
  const lead = text.charCodeAt(index - 1);
  return (
    trail >= 0xdc_00 && trail <= 0xdf_ff && lead >= 0xd8_00 && lead <= 0xdb_ff
  );
}

/** Whether one artifact matches exactly one code point. */
function matchesCodePoint(
  program: RegExpMatcherProgram,
  codePoint: number,
): boolean {
  const text = String.fromCodePoint(codePoint);
  const result = matchRegExpMatcher({ program, startIndex: 0, text });
  if (result.outcome !== "matched") return false;
  return result.captures[0]?.end === text.length;
}

test("derives WordCharacters exactly as the pinned tables record it", () => {
  const plain = artifact("^\\w$", "");
  const folded = artifact("^\\w$", "iu");
  const basic = wordCharacters();
  const extended = caseInsensitiveUnicodeWordCharacters();
  for (let codePoint = 0; codePoint <= 0xff_ff; codePoint += 1) {
    assert.equal(
      matchesCodePoint(plain, codePoint),
      codePointSetHas(basic, codePoint),
      `\\w disagrees at ${codePoint}`,
    );
    assert.equal(
      matchesCodePoint(folded, codePoint),
      codePointSetHas(extended, codePoint),
      `\\w under iu disagrees at ${codePoint}`,
    );
  }
  assert.equal(matchesCodePoint(folded, 0x01_7f), true);
  assert.equal(matchesCodePoint(folded, 0x21_2a), true);
  assert.equal(matchesCodePoint(plain, 0x01_7f), false);
});

/*
 * The sets a class escape names are derived by the matcher from raw
 * Unicode facts, so the host engine is an oracle for the derivation
 * itself. The sweep covers the whole basic plane, where the pinned release
 * and every host the repository runs on agree.
 */
test("agrees with the host on every class escape across the plane", () => {
  const probes: readonly (readonly [string, string])[] = [
    ["^\\d$", ""],
    ["^\\D$", ""],
    ["^\\s$", ""],
    ["^\\S$", ""],
    ["^\\w$", ""],
    ["^\\W$", ""],
    ["^.$", ""],
    ["^.$", "s"],
    ["^[\\s\\w]$", ""],
    ["^[^\\s]$", ""],
  ];
  for (const [source, flags] of probes) {
    const program = artifact(source, flags);
    const host = new RegExp(source, flags);
    for (let codePoint = 0; codePoint <= 0xff_ff; codePoint += 1) {
      const text = String.fromCodePoint(codePoint);
      assert.equal(
        matchesCodePoint(program, codePoint),
        host.test(text),
        `/${source}/${flags} disagrees at ${codePoint}`,
      );
    }
  }
});

test("closes an ignore-case class the way simple case folding does", () => {
  const program = artifact("^[k]$", "iu");
  for (let codePoint = 0; codePoint <= 0xff_ff; codePoint += 1) {
    assert.equal(
      matchesCodePoint(program, codePoint),
      simpleCaseFolding(codePoint) === 0x6b,
      `[k] under iu disagrees at ${codePoint}`,
    );
  }
  assert.equal(matchesCodePoint(program, 0x21_2a), true);
  assert.equal(matchesCodePoint(artifact("^[^k]$", "iu"), 0x21_2a), false);
  assert.equal(matchesCodePoint(artifact("^[k]$", "i"), 0x21_2a), false);
});

test("compares backreference characters through the artifact's table", () => {
  const program = artifact("(.)\\1", "iu");
  assert.notEqual(program.canonicalization, undefined);
  assert.deepEqual(observe("(.)\\1", "iu", "ſS"), {
    captures: ["ſS", "ſ"],
    index: 0,
  });
  assert.equal(observe("(.)\\1", "i", "ſS"), undefined);
  assert.equal(artifact("(.)\\1", "u").canonicalization, undefined);
  assert.equal(artifact(".", "iu").canonicalization, undefined);
});

/*
 * The provider groups code points into buckets keyed by their canonical
 * form, and a bucket is seeded with that key. Simple case folding usually
 * names a code point above the one it folds, so a self-canonical code
 * point ordinarily reaches a bucket a lower member already created and
 * must not be recorded twice. A duplicated member reaches the artifact as
 * a repeated `characters` entry, which breaks the strictly-increasing
 * invariant the executor's table documents and grows every ignore-case
 * backreference artifact.
 */
test("provides each case-equivalence member exactly once", () => {
  for (const unicodeMode of [false, true]) {
    for (const members of caseEquivalenceClasses(unicodeMode)) {
      assert.equal(
        new Set(members).size,
        members.length,
        `a class repeats a member under unicodeMode ${unicodeMode}: ` +
          `${members.join(",")}`,
      );
    }
  }
});

test("records a strictly increasing canonicalization table", () => {
  for (const flags of ["i", "iu", "iv"]) {
    const table = artifact("(a)\\1", flags).canonicalization;
    if (table == null) throw new Error(`/(a)\\1/${flags} records a table`);
    assert.equal(table.characters.length, table.canonical.length);
    assert.ok(table.characters.length > 0);
    for (let offset = 0; offset < table.characters.length; offset += 1) {
      const character = table.characters[offset] ?? -1;
      if (offset > 0) {
        assert.ok(
          character > (table.characters[offset - 1] ?? -1),
          `/(a)\\1/${flags} repeats or unsorts ${character}`,
        );
      }
      assert.ok((table.canonical[offset] ?? -1) < character);
    }
  }
});

test("matches class-set operations and pinned properties of strings", () => {
  for (const [source, input] of [
    ["^[[a-c]&&[b-d]]$", "b"],
    ["^[[a-c]--[b]]$", "c"],
    ["^[\\q{ab|cd}x]$", "ab"],
    ["^\\p{Emoji_Keycap_Sequence}$", "9\ufe0f\u20e3"],
    ["^\\p{RGI_Emoji}$", "👨‍👩‍👧"],
  ] as const) {
    assert.deepEqual(
      observe(source, "v", input),
      hostObserve(source, "v", input),
    );
  }
  assert.equal(observe("^[[a-c]&&[b-d]]$", "v", "a"), undefined);
  assert.equal(observe("^[[a-c]--[b]]$", "v", "b"), undefined);
  assert.equal(artifact("^\\p{RGI_Emoji}+$", "v").instructions.length, 10_173);
});

test("folds class-set operands before v-mode set operations", () => {
  for (const [source, flags, input] of [
    ["[^a]", "iv", "a"],
    ["[a&&A]", "iv", "a"],
    ["[[a-z]--A]", "iv", "a"],
    ["[\\q{AB}--\\q{ab}]", "iv", "AB"],
    ["[\\q{|a}]", "v", "a"],
    ["[\\q{a|}]", "v", "b"],
    ["[\\q{a|}]", "v", "a"],
    ["[\\q{ab|a|}]", "v", "ac"],
    ["[\\q{}]", "v", "a"],
  ] as const) {
    assert.deepEqual(
      observe(source, flags, input),
      hostObserve(source, flags, input),
      `/${source}/${flags} on ${input}`,
    );
  }
});

/*
 * An empty `ClassString` is a production of the grammar, so a `\q{}`
 * alternative that spells no character contributes the empty sequence to
 * the class rather than nothing at all. `CompileClassSetString` returns
 * "an empty sequence of characters" for it, `CompileToCharSet` unions in
 * "the CharSet containing the one string s", and `CompileAtom` appends an
 * `EmptyMatcher` when "cs contains the empty sequence of characters",
 * after the longer strings and after the single characters. So the empty
 * alternative is the class's last branch: it matches at any position, and
 * only where no other branch does.
 *
 * A trailing one is the case a parser drops most easily, because the
 * closing brace follows the separator immediately. Dropping it is not a
 * normalization: it also clears `MayContainStrings`, which turns the
 * `[^\q{a|}]` early error into a pattern that silently compiles as
 * `[^a]`. The host agrees with the edition throughout, so these stay
 * ordinary differential cases above and the early errors are pinned here.
 */
test("keeps an empty q alternative in a v-mode class", () => {
  const empty = { captures: [""], index: 0 };
  assert.deepEqual(observe("[\\q{a|}]", "v", "b"), empty);
  assert.deepEqual(observe("^[\\q{a|}]$", "v", ""), empty);
  assert.deepEqual(observe("^[\\q{a|}]+$", "v", ""), empty);
  assert.deepEqual(observe("[\\q{a|}]", "v", "a"), {
    captures: ["a"],
    index: 0,
  });
  for (const source of ["[^\\q{a|}]", "[^\\q{}]", "[^[\\q{a|}]]"]) {
    assert.equal(
      parseRegExpPattern({ extensions: propertyExtensions, flags: "v", source })
        .parsed,
      false,
      `/${source}/v names a string in a negated class`,
    );
  }
});

/*
 * A `\q{}` alternative of exactly one code point is that code point. The
 * edition says so outright: with `UnicodeSets` a CharSetElement is a
 * sequence of characters, and "an individual character is treated
 * interchangeably with a sequence of one character". `ClassSetOperand`
 * applies `MaybeSimpleCaseFolding` to a `ClassStringDisjunction` and to a
 * `ClassSetCharacter` alike, and `CompileAtom` hands every element that
 * "consists of a single character" to `CharacterSetMatcher`, which
 * canonicalizes the input against it. So under `iv` a one-code-point
 * `\q{X}` is the class `[X]`, in isolation and under every set operation.
 *
 * The spellings that hide that rule derive the same way. `ClassSetOperand
 * :: NestedClass` returns its operand unchanged, so `[[\q{a}]]` reads like
 * the bare class. `ClassIntersection` intersects CharSets and
 * `ClassSubtraction` keeps "the CharSetElements of charSet which are not
 * also CharSetElements of otherSet", and `a` and `\q{a}` are that one
 * element, so `[a&&\q{a}]` retains it while `[a--\q{a}]` is empty.
 * `CompileCharacterClass` replaces a `v`-mode inversion with
 * `CharacterComplement` over `AllCharacters`, which under `iv` holds only
 * the code points that case-fold to themselves, so `[^\q{a}]` drops `a`,
 * retains no member that canonicalizes to it, and rejects "A" as well. A
 * one-character `ClassString` leaves `MayContainStrings` false, which is
 * what admits that negated spelling at all.
 *
 * V8 answers the opposite way in each of those spellings on the input that
 * separates the two readings, and agrees on an input that is already the
 * folded case. It folds such an element but never canonicalizes an input
 * against it, which is a deliberate divergence recorded rather than
 * followed: it reports `/^[\q{A}]$/iv` matching "a" but not "A", an answer
 * the edition cannot produce, since a folded set compared against a folded
 * input can never separate the two. JavaScriptCore produces the edition's
 * answer in each case.
 * test262 pins none of this; its 33 `\q{}` files all run without `i`.
 */
test("reads a one-code-point q class string as that character", () => {
  for (const [source, flags, input, matches] of [
    ["^[\\q{a}]$", "iv", "A", true],
    ["^[\\q{A}]$", "iv", "A", true],
    ["^[\\q{A}]$", "iv", "a", true],
    ["^[\\q{k}]$", "iv", "\u212a", true],
    ["^[\\q{s}]$", "iv", "\u017f", true],
    ["^[[\\q{a}]]$", "iv", "A", true],
    ["^[a&&\\q{a}]$", "iv", "A", true],
    ["^[a&&\\q{a}]$", "iv", "a", true],
    ["^[a--\\q{a}]$", "iv", "A", false],
    ["^[a--\\q{a}]$", "iv", "a", false],
    ["^[a--\\q{A}]$", "iv", "a", false],
    ["^[A--\\q{a}]$", "iv", "A", false],
    ["^[^\\q{a}]$", "iv", "A", false],
    ["^[^\\q{a}]$", "iv", "b", true],
    ["^[\\q{a}]$", "v", "A", false],
  ] as const) {
    assert.equal(
      observe(source, flags, input) != null,
      matches,
      `/${source}/${flags} on ${JSON.stringify(input)}`,
    );
    assert.deepEqual(
      observe(source, flags, input),
      observe(source.replace(/\\q\{(.)\}/u, "$1"), flags, input),
      `/${source}/${flags} differs from its one-character class`,
    );
  }
});

/*
 * The two unicode-mode flags complement a property differently. `v` folds
 * a property before complementing it over the folded code points, so a
 * negated property under `iv` excludes every character equivalent to a
 * member, while `u` complements the unfolded property and canonicalizes
 * afterwards. The generated domain now covers cased property values, and
 * this pins the exact pair that first showed the difference.
 */
test("complements a negated property the way each flag set does", () => {
  assert.deepEqual(observe("\\P{Ll}", "iu", "a"), {
    captures: ["a"],
    index: 0,
  });
  assert.equal(observe("\\P{Ll}", "iv", "a"), undefined);
  assert.equal(observe("\\P{Ll}", "iv", "A"), undefined);
  assert.deepEqual(observe("\\P{Ll}", "u", "A"), {
    captures: ["A"],
    index: 0,
  });
  assert.deepEqual(observe("\\p{Ll}", "iv", "A"), {
    captures: ["A"],
    index: 0,
  });
  for (const [source, flags, text] of [
    ["\\P{Ll}", "iu", "a"],
    ["\\P{Ll}", "iv", "a"],
    ["\\P{Ll}", "iv", "A"],
    ["\\P{Lu}", "iv", "a"],
    ["\\p{Ll}", "iv", "A"],
    ["\\P{Ll}", "v", "A"],
  ] as const) {
    assert.deepEqual(
      observe(source, flags, text),
      hostObserve(source, flags, text),
      `/${source}/${flags} on ${text}`,
    );
  }
});

/*
 * `CompileToCharSet` returns a lone General_Category value unfolded: the
 * production reads "Return the CharSet containing all Unicode code points
 * whose character database definition includes the property
 * General_Category with value s", with no `MaybeSimpleCaseFolding` around
 * it. Its two siblings in the same production, the `\p{gc=Ll}` spelling and
 * every binary property, both end in that call, and `ClassSetOperand ::
 * NestedClass` returns its operand unchanged, so the raw set survives one
 * nesting level too.
 *
 * That only shows in `v`-mode set algebra. Folding `\p{Ll}` and `\p{Lu}`
 * before subtracting maps the uppercase letters onto the lowercase ones and
 * cancels the whole ASCII case class; keeping them exact subtracts two
 * disjoint categories and leaves Ll, which then matches either case through
 * `Canonicalize`. Both reference hosts fold here and answer the opposite
 * way, so these are recorded rather than compared against them, the way the
 * `u`-mode advance already is.
 */
test("keeps a lone category exact through v-mode set algebra", () => {
  const matches = (source: string, flags: string, text: string): boolean =>
    observe(source, flags, text) != null;
  for (const [source, text] of [
    ["^[\\p{Ll}--\\p{Lu}]$", "a"],
    ["^[\\p{Ll}--\\p{Lu}]$", "A"],
    ["^[[\\p{Ll}--\\p{Lu}]]$", "A"],
    /*
     * A nested class has to reach the outer operation still exact. These
     * two put it on the right of one, which the sole-operand spelling above
     * cannot do: there the outer union has nothing to cancel against, so it
     * answers the same either way.
     */
    ["^[\\p{Ll}--[\\p{Lu}]]$", "A"],
    ["^[\\p{Ll}--[\\p{Lu}]]$", "a"],
  ] as const) {
    assert.equal(matches(source, "iv", text), true, `/${source}/iv on ${text}`);
  }
  assert.equal(matches("^[\\p{Ll}&&\\p{Lu}]$", "iv", "a"), false);
  assert.equal(matches("^[\\p{Ll}&&[\\p{Lu}]]$", "iv", "a"), false);
  /*
   * The spellings that do fold must keep cancelling, or the exemption has
   * been applied to the wrong operand.
   */
  for (const source of [
    "^[\\p{gc=Ll}--\\p{gc=Lu}]$",
    "^[\\p{General_Category=Ll}--\\p{General_Category=Lu}]$",
    "^[\\p{Lowercase}--\\p{Uppercase}]$",
  ]) {
    for (const text of ["a", "A"]) {
      assert.equal(matches(source, "iv", text), false, `/${source}/iv ${text}`);
    }
  }
  /*
   * Negation complements over the folded code points, so a raw operand must
   * be closed before it is complemented rather than keeping its siblings.
   */
  for (const text of ["a", "A"]) {
    assert.equal(matches("^[^\\p{Ll}]$", "iv", text), false, text);
    assert.equal(matches("^\\P{Ll}$", "iv", text), false, text);
  }
  assert.equal(matches("^[^\\p{Ll}]$", "iv", "1"), true);
  /*
   * Everything the exemption does not reach still answers with the host: a
   * lone atom, a folding leaf beside a category, and plain `v`.
   */
  for (const [source, flags, text] of [
    ["^[\\p{Ll}]$", "iv", "A"],
    ["^[\\p{Lu}]$", "iv", "a"],
    ["^[\\p{Ll}--a]$", "iv", "a"],
    ["^[\\p{Ll}--a]$", "iv", "A"],
    ["^[\\p{Ll}--a]$", "iv", "b"],
    ["^[a&&\\p{Ll}]$", "iv", "A"],
    ["^[\\p{Ll}--\\p{Lu}]$", "v", "a"],
    ["^[\\p{Ll}--\\p{Lu}]$", "v", "A"],
  ] as const) {
    assert.deepEqual(
      observe(source, flags, text),
      hostObserve(source, flags, text),
      `/${source}/${flags} on ${text}`,
    );
  }
});

test("agrees with the host over the reviewed matcher corpus", () => {
  const patterns: readonly (readonly [string, string])[] = [
    ["a|ab", ""],
    ["(a)(b)?(c)?", ""],
    ["(z)((a+)?(b+)?(c))*", ""],
    ["(a*)b\\1+", ""],
    ["(?=(a+))a*b\\1", ""],
    ["(?!a)b", ""],
    ["(?<=(\\w+))\\d", ""],
    ["(?<!\\d)x", ""],
    ["^(a|b)*$", ""],
    ["[\\u{1F600}-\\u{1F60F}]+", "u"],
    ["\\p{Script=Greek}+", "u"],
    ["[\\p{L}\\p{Nd}]+", "u"],
    ["\\P{L}", "u"],
    ["\\p{Alphabetic}", "iu"],
    ["(\\p{Lu})\\1", "iu"],
    [".", "u"],
    [".", ""],
    ["^.$", "us"],
    ["\\b\\w+\\b", "iu"],
    ["[a-zé]+", "i"],
    ["İ", "iu"],
    ["ß", "iu"],
    ["k", "iu"],
    ["[^k]", "iu"],
    ["\\s+", ""],
    ["(?:a?){2,}", ""],
    ["(|a)*", ""],
    ["a{0}b", ""],
    ["x", "y"],
    ["(?<n>a)|(?<n>b)\\k<n>", "u"],
  ];
  const inputs: readonly string[] = [
    "",
    "a",
    "ab",
    "abc",
    "aabb",
    "abcabc",
    "αβγ",
    "\u{1F600}\u{1F601}",
    "\ud83d",
    "\ud83dx",
    "ſS",
    "KK",
    "İi",
    "ßß",
    "café",
    "a b",
    "a b",
    "1a2b",
    "aaab",
    "zaacbbbcac",
    "  \t\n",
  ];
  let compared = 0;
  for (const [source, flags] of patterns) {
    for (const text of inputs) {
      for (const startIndex of [0, 1, 2]) {
        if (startIndex > text.length) continue;
        assert.deepEqual(
          observe(source, flags, text, startIndex),
          hostObserve(source, flags, text, startIndex),
          `/${source}/${flags} at ${startIndex} on ${JSON.stringify(text)}`,
        );
        compared += 1;
      }
    }
  }
  assert.ok(compared > 1000, `only ${compared} comparisons ran`);
});

/*
 * The edition matches a unicode-mode pattern over a list of code points,
 * so a position that splits a surrogate pair does not exist: the search
 * advances from the pair's first code unit straight past its last, which
 * `test/built-ins/RegExp/prototype/exec/u-lastindex-adv.js` pins. A start
 * index inside a pair names the pair, and a zero-width assertion is never
 * evaluated between its two code units.
 *
 * The host disagrees about the last of these, so this records the exact
 * case rather than leaving it to the generated domain, which excludes it.
 * The assertion stays true whichever way the host behaves: it either
 * agrees, or it reports a position the edition does not have.
 */
test("keeps every position on a code-point boundary under u and v", () => {
  const pair = "\ud834\udf06";
  assert.equal(observe("\\udf06", "u", pair), undefined);
  assert.deepEqual(observe("\\udf06", "", pair), {
    captures: ["\udf06"],
    index: 1,
  });
  const deseret = "A\u{10428}";
  assert.deepEqual(observe("\\B", "u", deseret), { captures: [""], index: 3 });
  assert.deepEqual(observe("\\B", "v", deseret), { captures: [""], index: 3 });
  assert.deepEqual(observe("\\B", "", deseret), { captures: [""], index: 2 });
  assert.deepEqual(observe("(?<=A)", "uy", deseret, 2), {
    captures: [""],
    index: 1,
  });
  for (const [source, flags, text, start] of [
    ["\\B", "u", deseret, 0],
    ["(?<=A)", "uy", deseret, 2],
  ] as const) {
    const host = hostObserve(source, flags, text, start);
    const ours = observe(source, flags, text, start);
    if (host?.index === ours?.index) continue;
    assert.ok(
      splitsPair(text, host?.index ?? start),
      `/${source}/${flags} disagrees at a code-point boundary`,
    );
  }
});

/*
 * The matcher has no hint-guarded path and no MIR or backend surface, so
 * the specialization policy cannot reach it. This records that: the same
 * literal reports the same boundary under both policies, and the artifact
 * built from its retained text executes identically either way.
 */
test("keeps the matcher independent of the specialization policy", () => {
  const source = "const pattern = /(a|ab)+c/giu;\n";
  const policies: readonly CompilerOptions[] = [
    { specialization: "disabled" },
    { specialization: "enabled" },
  ];
  const rendered = policies.map((options) => {
    const result = compileSource(
      defaultComponents.frontend,
      { source, sourceId: "regexp.js" },
      options,
    );
    assert.deepEqual(result.diagnostics, []);
    const mir = result.mir;
    if (mir == null) throw new Error("an accepted source lowers to MIR");
    return printMir(mir)
      .split("\n")
      .filter((line) => line.includes("regexp literal"))
      .map((line) => line.trim());
  });
  // The literal compiles to one artifact whatever the policy selects, so
  // adding or removing a hint cannot change the pattern it matches.
  assert.deepEqual(rendered[0], rendered[1]);
  assert.equal(rendered[0]?.length, 1);
  assert.match(
    rendered[0]?.[0] ?? "",
    /regexp literal \/\(a\|ab\)\+c\/giu with \d+ instructions/u,
  );
  const first = observe("(a|ab)+c", "giu", "aababc");
  const second = observe("(a|ab)+c", "giu", "aababc");
  assert.deepEqual(first, second);
  assert.deepEqual(first, hostObserve("(a|ab)+c", "giu", "aababc"));
});
