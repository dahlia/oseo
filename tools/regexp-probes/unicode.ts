/**
 * The Unicode-table probe.
 *
 * [*PLAN-REGEXP.md*](../../PLAN-REGEXP.md) asks this probe to compare
 * table layouts for code-point properties, the string properties Unicode
 * sets use, case folding, and word characters, and to own the question
 * of what a dynamic pattern must carry into the runtime before the
 * runtime's own property boundary can move.
 *
 * Every layout is measured from the pinned tables in `@oseo/unicode`
 * rather than estimated. The candidates are the ones a native matcher
 * could consume unchanged:
 *
 *  -  `inversion` stores every boundary as a 32-bit code point, which is
 *     the shape the artifact builder already produces;
 *  -  `inversion-varint` stores the same boundaries as base-128 deltas,
 *     which is what the checked-in module already does in base 36;
 *  -  `bitmap` stores one bit for each code point in the basic
 *     multilingual plane and an inversion list above it; and
 *  -  `trie-64` and `trie-256` store one bit for each code point in
 *     deduplicated blocks behind a 16-bit block index, which is the
 *     layout a constant-time lookup needs.
 */

import {
  binaryPropertyNames,
  binaryPropertySet,
  caseInsensitiveUnicodeWordCharacters,
  codePointSetRanges,
  ecma262UnicodeStringPropertySet,
  generalCategoryBaseValues,
  generalCategorySet,
  generalCategoryValues,
  maxCodePoint,
  scriptExtensionsSet,
  scriptSet,
  scriptValues,
  simpleCaseFolding,
  stringPropertyNames,
  wordCharacters,
} from "../../packages/unicode/src/index.ts";
import type { CodePointSet } from "../../packages/unicode/src/index.ts";

/** The layouts this probe measures. */
export type TableLayout =
  | "bitmap"
  | "inversion"
  | "inversion-varint"
  | "trie-256"
  | "trie-64";

/** The measured cost of one group of sets in every layout. */
export interface TableGroup {
  readonly boundaries: number;
  readonly bytes: ReadonlyMap<TableLayout, number>;
  readonly codePoints: number;
  readonly id: string;
  readonly largestBoundaries: number;
  readonly sets: number;
  readonly worstSearchSteps: number;
}

/** The measured cost of the properties of strings. */
export interface StringPropertyMeasurement {
  readonly bytes: number;
  readonly longest: number;
  readonly properties: number;
  readonly sequences: number;
}

/**
 * One classifier over an enumerated property.
 *
 * A per-set layout answers one membership question. An enumerated
 * property such as `General_Category` or `Script` assigns exactly one
 * value to each code point, so one shared table answers every question
 * about it at once. This is the layout that makes a constant-time lookup
 * affordable, and it is the one a per-set trie loses to.
 */
export interface ClassifierMeasurement {
  readonly blockBytes: number;
  readonly id: string;
  readonly maskBytes: number;
  readonly perSetTrieBytes: number;
  readonly queries: number;
  readonly sharedBytes: number;
  readonly uniqueBlocks: number;
  readonly values: number;
}

/** Everything the Unicode-table probe reports. */
export interface UnicodeMeasurement {
  readonly caseFolding: CaseFoldingMeasurement;
  readonly classifiers: readonly ClassifierMeasurement[];
  readonly groups: readonly TableGroup[];
  readonly stringProperties: StringPropertyMeasurement;
  /**
   * The payload one dynamic pattern compiler would carry to reach every
   * admitted property: each group as an inversion list, the case-folding
   * mapping as pairs, and the properties of strings.
   *
   * It is a payload total for one selected layout, not a floor. It
   * charges no property-name table, no per-set index, and no code the
   * lookups need, and substituting a cheaper layout for one group
   * lowers it.
   */
  readonly inversionPayloadBytes: number;
}

/** One code point above the largest one, the exclusive upper boundary. */
const codePointCeiling = maxCodePoint + 1;

function varintBytes(value: number): number {
  let remaining = value;
  let bytes = 1;
  while (remaining >= 0x80) {
    remaining = Math.floor(remaining / 0x80);
    bytes += 1;
  }
  return bytes;
}

function inversionVarintBytes(set: CodePointSet): number {
  let previous = 0;
  let bytes = 0;
  for (const boundary of set) {
    bytes += varintBytes(boundary - previous);
    previous = boundary;
  }
  return bytes;
}

/**
 * One bit for each code point of the basic multilingual plane and an
 * inversion list for what is above it, with a range that crosses the
 * plane boundary clipped rather than dropped.
 */
function bitmapBytes(set: CodePointSet): number {
  let boundaries = 0;
  for (const range of codePointSetRanges(set)) {
    if (range.end < 0x1_0000) continue;
    boundaries += 2;
  }
  return 0x1_0000 / 8 + boundaries * 4;
}

/**
 * The bytes one deduplicated block trie needs.
 *
 * Every block holds one bit for each of its code points, equal blocks are
 * stored once, and the index holds one 16-bit block number for each
 * block position. A set whose blocks do not fit a 16-bit index is
 * charged a 32-bit one instead.
 */
function trieBytes(set: CodePointSet, blockSize: number): number {
  const blockBytes = blockSize / 8;
  const blocks = Math.ceil(codePointCeiling / blockSize);
  const ranges = codePointSetRanges(set);
  const unique = new Set<string>();
  let range = 0;
  for (let block = 0; block < blocks; block += 1) {
    const start = block * blockSize;
    const end = start + blockSize;
    while (range < ranges.length && (ranges[range]?.end ?? 0) < start) {
      range += 1;
    }
    const bits = new Uint8Array(blockBytes);
    for (let scan = range; scan < ranges.length; scan += 1) {
      const current = ranges[scan];
      if (current == null || current.start >= end) break;
      const from = Math.max(current.start, start);
      const to = Math.min(current.end, end - 1);
      for (let point = from; point <= to; point += 1) {
        const offset = point - start;
        const byte = offset >> 3;
        bits[byte] = (bits[byte] ?? 0) | (1 << (offset & 7));
      }
    }
    unique.add(bits.join(","));
  }
  const indexWidth = unique.size > 0x1_0000 ? 4 : 2;
  return blocks * indexWidth + unique.size * blockBytes;
}

function searchSteps(boundaries: number): number {
  return boundaries === 0 ? 0 : Math.ceil(Math.log2(boundaries + 1));
}

function measureGroup(id: string, sets: readonly CodePointSet[]): TableGroup {
  const bytes = new Map<TableLayout, number>([
    ["bitmap", 0],
    ["inversion", 0],
    ["inversion-varint", 0],
    ["trie-256", 0],
    ["trie-64", 0],
  ]);
  let boundaries = 0;
  let codePoints = 0;
  let largest = 0;
  let worst = 0;
  for (const set of sets) {
    boundaries += set.length;
    largest = Math.max(largest, set.length);
    worst = Math.max(worst, searchSteps(set.length));
    for (const range of codePointSetRanges(set)) {
      codePoints += range.end - range.start + 1;
    }
    bytes.set("inversion", (bytes.get("inversion") ?? 0) + set.length * 4);
    bytes.set(
      "inversion-varint",
      (bytes.get("inversion-varint") ?? 0) + inversionVarintBytes(set),
    );
    bytes.set("bitmap", (bytes.get("bitmap") ?? 0) + bitmapBytes(set));
    bytes.set("trie-64", (bytes.get("trie-64") ?? 0) + trieBytes(set, 64));
    bytes.set("trie-256", (bytes.get("trie-256") ?? 0) + trieBytes(set, 256));
  }
  return {
    boundaries,
    bytes,
    codePoints,
    id,
    largestBoundaries: largest,
    sets: sets.length,
    worstSearchSteps: worst,
  };
}

function definedSets(
  names: readonly string[],
  lookup: (name: string) => CodePointSet | undefined,
): readonly CodePointSet[] {
  const sets: CodePointSet[] = [];
  for (const name of names) {
    const set = lookup(name);
    if (set != null) sets.push(set);
  }
  return sets;
}

/**
 * The measured cost of the simple case-folding table.
 *
 * Both layouts store the mapping rather than membership in it, because a
 * caller needs the folded code point and not the answer to whether one
 * exists. `pairBytes` stores two 32-bit code points for each entry.
 * `deltaBytes` stores the base-128 delta from the previous source
 * together with the zigzag-encoded signed distance to the target, so a
 * decoder recovers the direction the mapping goes.
 */
interface CaseFoldingMeasurement {
  readonly deltaBytes: number;
  readonly entries: number;
  readonly pairBytes: number;
}

/**
 * The simple case-folding table as one inversion-shaped pair list.
 *
 * A backreference under `i` is the only construct that has to fold an
 * input character while it matches, so this is the one table a matcher
 * cannot resolve while it builds an artifact.
 */
function measureCaseFolding(): CaseFoldingMeasurement {
  const sources: number[] = [];
  const targets: number[] = [];
  for (let point = 0; point < codePointCeiling; point += 1) {
    const folded = simpleCaseFolding(point);
    if (folded === point) continue;
    sources.push(point);
    targets.push(folded);
  }
  let delta = 0;
  let previous = 0;
  for (const [index, source] of sources.entries()) {
    const distance = (targets[index] ?? 0) - source;
    // Zigzag: a signed distance becomes an unsigned one that stays small
    // for a mapping in either direction.
    const zigzag = distance < 0 ? -2 * distance - 1 : 2 * distance;
    delta += varintBytes(source - previous) + varintBytes(zigzag);
    previous = source;
  }
  return {
    deltaBytes: delta,
    entries: sources.length,
    pairBytes: sources.length * 8,
  };
}

/**
 * One shared value-per-code-point table over an enumerated property,
 * stored as deduplicated blocks behind a 16-bit block index.
 *
 * The classifier is built from the property's disjoint values only, so
 * one code point has exactly one value and no later value overwrites an
 * earlier one. A query for a value that is the union of several disjoint
 * ones, such as `General_Category=L`, is answered from the same table
 * through one bit for each queryable value and each disjoint value, and
 * `maskBytes` charges that table.
 */
function measureClassifier(
  id: string,
  disjoint: readonly CodePointSet[],
  queries: number,
  blockSize: number,
  perSetTrieBytes: number,
): ClassifierMeasurement {
  const values = new Uint8Array(codePointCeiling);
  for (const [index, set] of disjoint.entries()) {
    if (index + 1 > 0xff) {
      throw new Error(`Classifier ${id} needs more than 255 value ids.`);
    }
    for (const range of codePointSetRanges(set)) {
      const claimed = values.subarray(range.start, range.end + 1);
      if (claimed.some((value) => value !== 0)) {
        throw new Error(`Classifier ${id} was given overlapping values.`);
      }
      values.fill(index + 1, range.start, range.end + 1);
    }
  }
  const blocks = Math.ceil(codePointCeiling / blockSize);
  const unique = new Set<string>();
  for (let block = 0; block < blocks; block += 1) {
    const start = block * blockSize;
    unique.add(values.subarray(start, start + blockSize).join(","));
  }
  const indexWidth = unique.size > 0x1_0000 ? 4 : 2;
  return {
    blockBytes: blockSize,
    id,
    maskBytes: queries * Math.ceil((disjoint.length + 1) / 8),
    perSetTrieBytes,
    queries,
    sharedBytes: blocks * indexWidth + unique.size * blockSize,
    uniqueBlocks: unique.size,
    values: disjoint.length,
  };
}

function measureStringProperties(): StringPropertyMeasurement {
  let sequences = 0;
  let codePoints = 0;
  let longest = 0;
  let properties = 0;
  for (const name of stringPropertyNames) {
    const set = ecma262UnicodeStringPropertySet(name);
    if (set == null) continue;
    properties += 1;
    for (const sequence of set) {
      sequences += 1;
      codePoints += sequence.length;
      longest = Math.max(longest, sequence.length);
    }
  }
  return {
    bytes: codePoints * 4 + sequences * 2,
    longest,
    properties,
    sequences,
  };
}

/** Measure every table group a dynamic pattern can reach. */
export function measureUnicodeTables(): UnicodeMeasurement {
  const folding = measureCaseFolding();
  const categories = definedSets(generalCategoryValues, generalCategorySet);
  const scripts = definedSets(scriptValues, scriptSet);
  const categoryGroup = measureGroup("general categories", categories);
  const scriptGroup = measureGroup("scripts", scripts);
  const strings = measureStringProperties();
  const groups = [
    measureGroup(
      "binary properties",
      definedSets(binaryPropertyNames, binaryPropertySet),
    ),
    categoryGroup,
    scriptGroup,
    measureGroup(
      "script extensions",
      definedSets(scriptValues, scriptExtensionsSet),
    ),
    measureGroup("word characters", [
      wordCharacters(),
      caseInsensitiveUnicodeWordCharacters(),
    ]),
  ];
  let total = folding.pairBytes + strings.bytes;
  for (const group of groups) total += group.bytes.get("inversion") ?? 0;
  return {
    caseFolding: folding,
    classifiers: [
      measureClassifier(
        "General_Category",
        definedSets(generalCategoryBaseValues, generalCategorySet),
        categories.length,
        256,
        categoryGroup.bytes.get("trie-256") ?? 0,
      ),
      measureClassifier(
        "Script",
        scripts,
        scripts.length,
        256,
        scriptGroup.bytes.get("trie-256") ?? 0,
      ),
    ],
    groups,
    stringProperties: strings,
    inversionPayloadBytes: total,
  };
}
