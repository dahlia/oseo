import assert from "node:assert/strict";
import test from "node:test";

import {
  binaryPropertyNames,
  binaryPropertySet,
  canonicalCombiningClassOf,
  canonicalPropertyName,
  canonicalPropertyValue,
  caseInsensitiveUnicodeWordCharacters,
  codePointSetHas,
  codePointSetRanges,
  codePointSetSize,
  conditionalCaseMappings,
  emojiVersion,
  fullCaseFolding,
  fullLowercase,
  fullTitlecase,
  fullUppercase,
  generalCategoryBaseValues,
  generalCategoryMembers,
  generalCategoryOf,
  generalCategorySet,
  generalCategoryValues,
  maxCodePoint,
  nonBinaryPropertyNames,
  scriptExtensionsOf,
  scriptExtensionsSet,
  scriptOf,
  scriptSet,
  scriptValues,
  simpleCaseFolding,
  simpleLowercase,
  simpleTitlecase,
  simpleUppercase,
  unicodeDataInputs,
  unicodeDataLicense,
  unicodeVersion,
  unionCodePoints,
  wordCharacters,
} from "../src/index.ts";
import {
  codePointSetFromRanges,
  complementCodePointSet,
  decodeCodePointMap,
  decodeCodePointPartition,
  decodeCodePointSet,
  decodeSequenceMap,
  encodeCodePointSet,
} from "../src/set.ts";

test("the pinned version and license are reported with their inputs", () => {
  assert.equal(unicodeVersion, "17.0.0");
  assert.equal(emojiVersion, "17.0");
  assert.equal(unicodeDataLicense, "Unicode-3.0");
  assert.ok(unicodeDataInputs.length >= 10);
  for (const input of unicodeDataInputs) {
    assert.match(input.sha256, /^[0-9a-f]{64}$/u);
    assert.ok(input.bytes > 0);
    assert.match(input.path, /^packages\/unicode\/data\/ucd\//u);
    const prefix = "https://www.unicode.org/Public/17.0.0/";
    assert.ok(input.url.startsWith(prefix), input.url);
  }
  const names = unicodeDataInputs.map(({ name }) => name);
  assert.deepEqual([...new Set(names)], names);
});

test("the vocabulary matches the ECMAScript property tables", () => {
  assert.equal(binaryPropertyNames.length, 53);
  assert.deepEqual(nonBinaryPropertyNames, [
    "General_Category",
    "Script",
    "Script_Extensions",
  ]);
  for (const name of ["ASCII", "Any", "Assigned", "Emoji", "White_Space"]) {
    assert.ok(binaryPropertyNames.includes(name), name);
  }
  assert.equal(generalCategoryBaseValues.length, 30);
  assert.equal(generalCategoryValues.length, 38);
  assert.ok(scriptValues.includes("Latin"));
  assert.ok(scriptValues.includes("Unknown"));
});

test("property and value spellings resolve without loose matching", () => {
  assert.equal(canonicalPropertyName("gc"), "General_Category");
  assert.equal(canonicalPropertyName("scx"), "Script_Extensions");
  assert.equal(canonicalPropertyName("AHex"), "ASCII_Hex_Digit");
  assert.equal(canonicalPropertyName("space"), "White_Space");
  assert.equal(canonicalPropertyName("Any"), "Any");
  assert.equal(canonicalPropertyName("general_category"), undefined);
  assert.equal(canonicalPropertyName("GC"), undefined);
  assert.equal(canonicalPropertyValue("gc", "Lu"), "Uppercase_Letter");
  assert.equal(canonicalPropertyValue("gc", "cntrl"), "Control");
  assert.equal(canonicalPropertyValue("sc", "Latn"), "Latin");
  assert.equal(canonicalPropertyValue("scx", "Grek"), "Greek");
  assert.equal(canonicalPropertyValue("gc", "Latin"), undefined);
  assert.equal(canonicalPropertyValue("Alphabetic", "Yes"), undefined);
});

test("an unknown property or value reports nothing, not an empty set", () => {
  assert.equal(binaryPropertySet("Grapheme_Cluster_Break"), undefined);
  assert.equal(generalCategorySet("Lu"), undefined);
  assert.equal(scriptSet("Latn"), undefined);
  assert.equal(scriptExtensionsSet("Nonesuch"), undefined);
  assert.equal(generalCategoryMembers("Nonesuch"), undefined);
});

test("supercategories are exactly the union of their base categories", () => {
  assert.deepEqual(generalCategoryMembers("Uppercase_Letter"), [
    "Uppercase_Letter",
  ]);
  assert.deepEqual(generalCategoryMembers("Cased_Letter"), [
    "Lowercase_Letter",
    "Titlecase_Letter",
    "Uppercase_Letter",
  ]);
  for (const value of generalCategoryValues) {
    if (generalCategoryBaseValues.includes(value)) continue;
    const members = generalCategoryMembers(value) ?? [];
    assert.ok(members.length > 1);
    let union: readonly number[] = [];
    for (const member of members) {
      union = unionCodePoints(union, generalCategorySet(member) ?? []);
    }
    assert.deepEqual(generalCategorySet(value), union);
  }
});

test("the base categories partition every code point", () => {
  const counts = new Int32Array(maxCodePoint + 1);
  for (const value of generalCategoryBaseValues) {
    for (const { end, start } of codePointSetRanges(
      generalCategorySet(value) ?? [],
    )) {
      for (let codePoint = start; codePoint <= end; codePoint += 1) {
        counts[codePoint] = (counts[codePoint] ?? 0) + 1;
      }
    }
  }
  let wrong = -1;
  for (let codePoint = 0; codePoint <= maxCodePoint; codePoint += 1) {
    if (counts[codePoint] !== 1) {
      wrong = codePoint;
      break;
    }
  }
  assert.equal(wrong, -1, `U+${Math.max(wrong, 0).toString(16)} is not once`);
});

test("supplementary planes, surrogates, and noncharacters are covered", () => {
  assert.equal(generalCategoryOf(0x41), "Uppercase_Letter");
  assert.equal(generalCategoryOf(0xd800), "Surrogate");
  assert.equal(generalCategoryOf(0xdfff), "Surrogate");
  assert.equal(generalCategoryOf(0xfffe), "Unassigned");
  assert.equal(generalCategoryOf(maxCodePoint), "Unassigned");
  assert.equal(generalCategoryOf(0x10400), "Uppercase_Letter");
  assert.equal(generalCategoryOf(0x1f600), "Other_Symbol");
  assert.equal(scriptOf(0xd800), "Unknown");
  assert.equal(scriptOf(0x10400), "Deseret");
  assert.equal(scriptOf(0x1e900), "Adlam");
  assert.deepEqual(scriptExtensionsOf(0xd800), ["Unknown"]);
  const surrogates = generalCategorySet("Surrogate") ?? [];
  assert.deepEqual(codePointSetRanges(surrogates), [
    { end: 0xdfff, start: 0xd800 },
  ]);
  const noncharacters = binaryPropertySet("Noncharacter_Code_Point") ?? [];
  assert.equal(codePointSetHas(noncharacters, 0xfffe), true);
  assert.equal(codePointSetHas(noncharacters, maxCodePoint), true);
  assert.equal(codePointSetHas(noncharacters, 0x41), false);
});

test("a value that is not a code point is refused", () => {
  const sample = generalCategorySet("Uppercase_Letter") ?? [];
  for (const invalid of [-1, maxCodePoint + 1, 1.5, Number.NaN]) {
    assert.throws(() => codePointSetHas(sample, invalid), RangeError);
    assert.throws(() => generalCategoryOf(invalid), RangeError);
    assert.throws(() => scriptOf(invalid), RangeError);
    assert.throws(() => simpleCaseFolding(invalid), RangeError);
    assert.throws(() => fullUppercase(invalid), RangeError);
  }
});

test("Script_Extensions replaces Script only where the data lists it", () => {
  // Every set agrees with the per-code-point view at both ends of each run.
  for (const value of scriptValues) {
    const extensions = scriptExtensionsSet(value) ?? [];
    for (const { end, start } of codePointSetRanges(extensions)) {
      assert.ok(scriptExtensionsOf(start).includes(value), value);
      assert.ok(scriptExtensionsOf(end).includes(value), value);
    }
  }
  // A code point with no listed entry takes its Script value.
  assert.deepEqual(scriptExtensionsOf(0x41), ["Latin"]);
  assert.deepEqual(scriptExtensionsOf(0x10400), ["Deseret"]);
  // A listed entry replaces the Script value rather than extending it, so
  // U+00B7 leaves Script_Extensions=Common even though its Script is Common.
  assert.equal(scriptOf(0xb7), "Common");
  const shared = scriptExtensionsOf(0xb7);
  assert.ok(shared.includes("Latin"));
  assert.ok(!shared.includes("Common"));
  assert.ok(shared.length > 4);
  assert.deepEqual(shared.toSorted(), [...shared]);
  assert.equal(codePointSetHas(scriptExtensionsSet("Latin") ?? [], 0xb7), true);
  assert.equal(codePointSetHas(scriptSet("Latin") ?? [], 0xb7), false);
  assert.equal(codePointSetHas(scriptSet("Common") ?? [], 0xb7), true);
  assert.equal(
    codePointSetHas(scriptExtensionsSet("Common") ?? [], 0xb7),
    false,
  );
});

test("simple and full case folding follow the pinned Unicode data", () => {
  assert.equal(simpleCaseFolding(0x41), 0x61);
  assert.equal(simpleCaseFolding(0x1e9e), 0xdf);
  assert.equal(simpleCaseFolding(0x17f), 0x73);
  assert.equal(simpleCaseFolding(0x212a), 0x6b);
  assert.equal(simpleCaseFolding(0x10400), 0x10428);
  assert.equal(simpleCaseFolding(0x1e900), 0x1e922);
  assert.equal(simpleCaseFolding(0xd800), 0xd800);
  assert.equal(simpleCaseFolding(maxCodePoint), maxCodePoint);
  assert.deepEqual(fullCaseFolding(0xdf), [0x73, 0x73]);
  assert.deepEqual(fullCaseFolding(0xfb03), [0x66, 0x66, 0x69]);
  assert.deepEqual(fullCaseFolding(0x41), [0x61]);
  assert.deepEqual(fullCaseFolding(0x10400), [0x10428]);
  // The Turkic tailoring is not mixed into the default folding.
  assert.equal(simpleCaseFolding(0x130), 0x130);
});

test("simple and full case mappings follow the pinned Unicode data", () => {
  assert.equal(simpleUppercase(0x61), 0x41);
  assert.equal(simpleLowercase(0x41), 0x61);
  assert.equal(simpleTitlecase(0x1f3), 0x1f2);
  assert.equal(simpleUppercase(0x10428), 0x10400);
  assert.equal(simpleUppercase(0xdf), 0xdf);
  assert.deepEqual(fullUppercase(0xdf), [0x53, 0x53]);
  assert.deepEqual(fullLowercase(0x130), [0x69, 0x307]);
  assert.deepEqual(fullTitlecase(0xfb03), [0x46, 0x66, 0x69]);
  assert.deepEqual(fullUppercase(0x61), [0x41]);
  assert.deepEqual(fullLowercase(0xd800), [0xd800]);
});

test("combining classes cover the conditional mapping contexts", () => {
  assert.equal(canonicalCombiningClassOf(0x41), 0);
  assert.equal(canonicalCombiningClassOf(0x334), 1);
  assert.equal(canonicalCombiningClassOf(0x93c), 7);
  assert.equal(canonicalCombiningClassOf(0x5b0), 10);
  assert.equal(canonicalCombiningClassOf(0x316), 220);
  assert.equal(canonicalCombiningClassOf(0x300), 230);
  // Supplementary planes, surrogates, and unassigned code points answer too.
  assert.equal(canonicalCombiningClassOf(0x1e944), 230);
  assert.equal(canonicalCombiningClassOf(0xd800), 0);
  assert.equal(canonicalCombiningClassOf(maxCodePoint), 0);
  assert.throws(() => canonicalCombiningClassOf(-1), RangeError);
  assert.throws(() => canonicalCombiningClassOf(maxCodePoint + 1), RangeError);
  // Every nonzero class belongs to a mark, which is what makes the property
  // usable for More_Above and After_Soft_Dotted without further data.
  const marks = generalCategorySet("Mark") ?? [];
  for (const codePoint of [0x334, 0x93c, 0x5b0, 0x316, 0x300, 0x1e944]) {
    assert.equal(codePointSetHas(marks, codePoint), true);
  }
});

test("conditional case mappings are recorded without being applied", () => {
  const sigma = conditionalCaseMappings.find(
    (mapping) => mapping.codePoint === 0x3a3 && mapping.language == null,
  );
  assert.ok(sigma != null);
  assert.deepEqual(sigma.conditions, ["Final_Sigma"]);
  assert.deepEqual(sigma.lowercase, [0x3c2]);
  // The unconditional mapping is the one the tables answer with.
  assert.deepEqual(fullLowercase(0x3a3), [0x3c3]);
  const turkic = conditionalCaseMappings.filter(
    (mapping) => mapping.language === "tr",
  );
  assert.ok(turkic.length > 0);
  const known = new Set([
    "After_I",
    "After_Soft_Dotted",
    "Before_Dot",
    "Final_Sigma",
    "More_Above",
  ]);
  for (const mapping of conditionalCaseMappings) {
    for (const condition of mapping.conditions) {
      const base = condition.startsWith("Not_")
        ? condition.slice("Not_".length)
        : condition;
      assert.ok(known.has(base), condition);
    }
  }
  for (const mapping of conditionalCaseMappings) {
    const language = mapping.language;
    assert.ok(language == null || /^[a-z]{2,3}$/u.test(language));
  }
});

test("word characters extend by simple case folding and nothing else", () => {
  const basic = wordCharacters();
  assert.deepEqual(codePointSetRanges(basic), [
    { end: 0x39, start: 0x30 },
    { end: 0x5a, start: 0x41 },
    { end: 0x5f, start: 0x5f },
    { end: 0x7a, start: 0x61 },
  ]);
  assert.equal(codePointSetSize(basic), 63);
  const extended = caseInsensitiveUnicodeWordCharacters();
  // Rebuild the extension straight from the folding table rather than from
  // the generated set, so the two cannot drift together.
  const folded = codePointSetRanges(basic).slice();
  for (let codePoint = 0; codePoint <= maxCodePoint; codePoint += 1) {
    if (codePointSetHas(basic, simpleCaseFolding(codePoint))) {
      folded.push({ end: codePoint, start: codePoint });
    }
  }
  assert.deepEqual(extended, codePointSetFromRanges(folded));
  assert.equal(codePointSetHas(extended, 0x17f), true);
  assert.equal(codePointSetHas(extended, 0x212a), true);
  assert.equal(codePointSetHas(extended, 0xc0), false);
});

test("every returned set is cached and shared", () => {
  assert.equal(generalCategorySet("Letter"), generalCategorySet("Letter"));
  assert.equal(scriptSet("Latin"), scriptSet("Latin"));
  assert.equal(binaryPropertySet("Emoji"), binaryPropertySet("Emoji"));
  assert.equal(wordCharacters(), wordCharacters());
});

test("the set codec rejects malformed table text", () => {
  assert.deepEqual(decodeCodePointSet(""), []);
  // Boundaries are base-36 integers, so U+0041 is `1t` and the width 26 of
  // U+0041 through U+005A is `q`.
  assert.deepEqual(decodeCodePointSet("1t q"), [0x41, 0x5b]);
  assert.equal(encodeCodePointSet([0x41, 0x5b]), "1t q");
  assert.equal(encodeCodePointSet(decodeCodePointSet("0 1 1 1")), "0 1 1 1");
  assert.throws(() => decodeCodePointSet("41"), /even boundary count/u);
  assert.throws(() => decodeCodePointSet("41 0"), /strictly increase/u);
  assert.throws(() => decodeCodePointSet("41 Z"), /Malformed base-36/u);
  assert.throws(() => decodeCodePointSet("0 zzzzz"), /exceeds the range/u);
  assert.throws(() => decodeCodePointMap("41"), /paired tokens/u);
  assert.throws(() => decodeSequenceMap("41 0"), /must not be empty/u);
  assert.throws(() => decodeSequenceMap("41 3 1 2"), /is truncated/u);
  assert.throws(
    () => decodeCodePointPartition("1 0", 1),
    /must start at code point zero/u,
  );
  assert.throws(() => decodeCodePointPartition("0 5", 1), /has no name/u);
  assert.throws(() => decodeCodePointPartition("", 1), /boundary pair/u);
});

test("set composition helpers agree with a direct membership scan", () => {
  const left = codePointSetFromRanges([
    { end: 0x30, start: 0x10 },
    { end: 0x50, start: 0x40 },
  ]);
  const right = codePointSetFromRanges([{ end: 0x45, start: 0x31 }]);
  const union = unionCodePoints(left, right);
  assert.deepEqual(codePointSetRanges(union), [{ end: 0x50, start: 0x10 }]);
  const complement = complementCodePointSet(union);
  for (let codePoint = 0; codePoint <= 0x60; codePoint += 1) {
    assert.equal(
      codePointSetHas(complement, codePoint),
      !codePointSetHas(union, codePoint),
    );
  }
  assert.equal(
    codePointSetSize(union) + codePointSetSize(complement),
    maxCodePoint + 1,
  );
  assert.deepEqual(
    codePointSetFromRanges([
      { end: 0x20, start: 0x20 },
      { end: 0x1f, start: 0x10 },
    ]),
    [0x10, 0x21],
  );
});
