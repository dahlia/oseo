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
  searchRegExpMatcher,
} from "../packages/compiler/src/index.ts";
import type {
  CompilerOptions,
  RegExpMatcherProgram,
  RegExpPatternExtensions,
} from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import {
  caseInsensitiveUnicodeWordCharacters,
  codePointSetHas,
  simpleCaseFolding,
  wordCharacters,
} from "../packages/unicode/src/index.ts";

import {
  caseEquivalenceClasses,
  propertyEscapeSet,
  unicodeMatcherData,
} from "./regexp-matcher-data.ts";

const propertyExtensions: RegExpPatternExtensions = {
  admitted: ["unicode-property-escapes"],
  unicodeProperty: (escape) => propertyEscapeSet(escape) != null,
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
      babelFrontend,
      { source, sourceId: "regexp.js" },
      options,
    );
    return result.diagnostics.map(
      (diagnostic) => `${diagnostic.code} ${diagnostic.message}`,
    );
  });
  assert.deepEqual(rendered[0], rendered[1]);
  assert.deepEqual(rendered[0], [
    "OSEO1001 Regular expression evaluation is outside the M5 profile.",
  ]);
  const first = observe("(a|ab)+c", "giu", "aababc");
  const second = observe("(a|ab)+c", "giu", "aababc");
  assert.deepEqual(first, second);
  assert.deepEqual(first, hostObserve("(a|ab)+c", "giu", "aababc"));
});
