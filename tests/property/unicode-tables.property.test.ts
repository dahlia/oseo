import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  canonicalPropertyValue,
  codePointSetHas,
  codePointSetRanges,
  fullCaseFolding,
  generalCategoryBaseValues,
  generalCategoryMembers,
  generalCategoryOf,
  generalCategorySet,
  generalCategoryValues,
  maxCodePoint,
  scriptExtensionsOf,
  scriptExtensionsSet,
  scriptOf,
  scriptSet,
  simpleCaseFolding,
} from "../../packages/unicode/src/index.ts";
import {
  decodeCodePointMap,
  decodeCodePointSet,
  decodeSequenceMap,
  encodeCodePointMap,
  encodeCodePointSet,
  encodeSequenceMap,
} from "../../packages/unicode/src/set.ts";
import type { CodePointSet } from "../../packages/unicode/src/set.ts";

const { assertProperty, propertySize } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

const size = propertySize();
const maximumRanges = size === "large" ? 64 : 16;
const maximumEntries = size === "large" ? 64 : 16;

/**
 * Build one inversion list from generated gaps and widths.
 *
 * Generating the structure rather than filtering arbitrary arrays keeps every
 * shrunk counterexample a valid set, so a failure prints a case the decoder
 * is actually required to accept.
 */
function setFromShape(
  shape: readonly (readonly [number, number])[],
): CodePointSet {
  const boundaries: number[] = [];
  let cursor = -1;
  for (const [gap, width] of shape) {
    const start = cursor + gap + 1;
    const end = start + width;
    if (end > maxCodePoint + 1) break;
    boundaries.push(start, end);
    cursor = end;
  }
  return boundaries;
}

const setArbitrary = fc
  .array(
    fc.tuple(
      fc.integer({ max: 0x2000, min: 0 }),
      fc.integer({ max: 0x2000, min: 1 }),
    ),
    { maxLength: maximumRanges, minLength: 0 },
  )
  .map(setFromShape);

const codePointArbitrary = fc.oneof(
  fc.integer({ max: maxCodePoint, min: 0 }),
  fc.constantFrom(
    0x0,
    0x7f,
    0x80,
    0xd7ff,
    0xd800,
    0xdbff,
    0xdc00,
    0xdfff,
    0xe000,
    0xfffd,
    0xffff,
    0x10000,
    0x1f600,
    0xfffff,
    0x100000,
    maxCodePoint,
  ),
);

test("encoded code-point sets survive a round trip", () => {
  assertProperty(
    "generated inversion lists decode to themselves",
    fc.property(setArbitrary, codePointArbitrary, (set, codePoint) => {
      const decoded = decodeCodePointSet(encodeCodePointSet(set));
      assert.deepEqual(decoded, set);
      const ranges = codePointSetRanges(decoded);
      const linear = ranges.some(
        ({ end, start }) => codePoint >= start && codePoint <= end,
      );
      assert.equal(codePointSetHas(decoded, codePoint), linear);
      for (let index = 1; index < decoded.length; index += 1) {
        assert.ok((decoded[index] ?? 0) > (decoded[index - 1] ?? 0));
      }
    }),
    {
      domain:
        "one inversion list built from generated gaps and widths, and one " +
        "code point drawn from the whole range or from a plane, surrogate, " +
        "or noncharacter boundary",
      numRuns: 200,
      profile: "Pinned Unicode table encoding",
      seed: 0x6000_3b00,
      sizeLimit: `ranges<=${maximumRanges}`,
      timeLimitMilliseconds: 60_000,
    },
  );
});

test("encoded code-point maps and sequence maps survive a round trip", () => {
  const mapArbitrary = fc
    .array(
      fc.tuple(
        fc.integer({ max: 0x800, min: 1 }),
        fc.integer({ max: 0x400, min: -0x400 }),
      ),
      { maxLength: maximumEntries, minLength: 0 },
    )
    .map((pairs) => {
      const entries = new Map<number, number>();
      let source = 0x500;
      for (const [gap, offset] of pairs) {
        source += gap;
        const target = source + offset;
        if (source > maxCodePoint || target < 0 || target > maxCodePoint) break;
        entries.set(source, target);
      }
      return entries;
    });
  const sequenceArbitrary = fc
    .array(
      fc.tuple(
        fc.integer({ max: 0x800, min: 1 }),
        fc.array(fc.integer({ max: maxCodePoint, min: 0 }), {
          maxLength: 4,
          minLength: 1,
        }),
      ),
      { maxLength: maximumEntries, minLength: 0 },
    )
    .map((pairs) => {
      const entries = new Map<number, readonly number[]>();
      let source = 0x500;
      for (const [gap, sequence] of pairs) {
        source += gap;
        if (source > maxCodePoint) break;
        entries.set(source, sequence);
      }
      return entries;
    });
  assertProperty(
    "generated case tables decode to themselves",
    fc.property(mapArbitrary, sequenceArbitrary, (single, sequences) => {
      assert.deepEqual(
        [...decodeCodePointMap(encodeCodePointMap(single))],
        [...single],
      );
      assert.deepEqual(
        [...decodeSequenceMap(encodeSequenceMap(sequences))],
        [...sequences],
      );
    }),
    {
      domain:
        "one code-point map and one sequence map built from generated " +
        "source gaps, signed target offsets, and sequences of one to four " +
        "code points",
      numRuns: 200,
      profile: "Pinned Unicode table encoding",
      seed: 0x6000_3b01,
      sizeLimit: `entries<=${maximumEntries}`,
      timeLimitMilliseconds: 60_000,
    },
  );
});

test("pinned table lookups agree with their own sets", () => {
  assertProperty(
    "every code point resolves consistently across the tables",
    fc.property(codePointArbitrary, (codePoint) => {
      const category = generalCategoryOf(codePoint);
      assert.ok(generalCategoryValues.includes(category));
      // The base categories partition the code-point range, so exactly one
      // of them holds this code point and it is the reported one.
      const holding = generalCategoryBaseValues.filter((value) => {
        const set = generalCategorySet(value);
        return set != null && codePointSetHas(set, codePoint);
      });
      assert.deepEqual(holding, [category]);
      for (const value of generalCategoryValues) {
        const set = generalCategorySet(value);
        assert.ok(set != null);
        if (generalCategoryBaseValues.includes(value)) continue;
        // A supercategory holds the code point exactly when its base
        // category is one of the categories it covers.
        assert.equal(
          codePointSetHas(set, codePoint),
          (generalCategoryMembers(value) ?? []).includes(category),
        );
      }
      const script = scriptOf(codePoint);
      const scriptCodePoints = scriptSet(script);
      assert.ok(scriptCodePoints != null);
      assert.equal(codePointSetHas(scriptCodePoints, codePoint), true);
      for (const extension of scriptExtensionsOf(codePoint)) {
        const extensionSet = scriptExtensionsSet(extension);
        assert.ok(extensionSet != null);
        assert.equal(codePointSetHas(extensionSet, codePoint), true);
      }
      const folded = fullCaseFolding(codePoint);
      assert.ok(folded.length >= 1);
      if (folded.length === 1) {
        assert.equal(folded[0], simpleCaseFolding(codePoint));
      }
      const folding = simpleCaseFolding(codePoint);
      assert.equal(simpleCaseFolding(folding), folding);
      assert.equal(canonicalPropertyValue("gc", category), category);
    }),
    {
      domain:
        "one code point drawn from the whole range or from a plane, " +
        "surrogate, noncharacter, or supplementary boundary",
      numRuns: 120,
      profile: "Pinned Unicode tables",
      seed: 0x6000_3b02,
      sizeLimit: "code-points<=0x10ffff",
      timeLimitMilliseconds: 60_000,
    },
  );
});
