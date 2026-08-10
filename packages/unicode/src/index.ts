/**
 * Pinned Unicode tables for the Oseo compiler and runtime.
 *
 * The package owns one reviewed copy of the Unicode Character Database and
 * the generated tables derived from it. Every answer here comes from those
 * bytes: nothing consults a host locale, a `wchar_t` classification routine,
 * or a C library regular-expression facility, so two hosts running the same
 * checkout agree exactly.
 *
 * The contract is deliberately narrow. It reports code-point properties, case
 * folding, case mapping, and the ECMAScript word-character sets, and it
 * decides none of the semantics that consume them. Matching, canonicalization
 * order, and locale policy belong to the regular-expression and String units
 * that read these tables.
 *
 * A code-point set is an inversion list, so a consumer may lower one straight
 * into a generated table without reshaping it. Sets are built on first use
 * and cached, and every returned array is shared: treat it as immutable.
 */

import type { ConditionalCaseMapping, UnicodeDataInput } from "./model.ts";
import {
  assertCodePoint,
  codePointSetHas,
  codePointSetRanges,
  codePointSetSize,
  decodeCodePointMap,
  decodeCodePointPartition,
  decodeCodePointSet,
  decodeSequenceMap,
  maxCodePoint,
  partitionSet,
  partitionValueAt,
  unionCodePointSets,
} from "./set.ts";
import type {
  CodePointPartition,
  CodePointRange,
  CodePointSet,
} from "./set.ts";
import {
  binaryPropertySets,
  caseInsensitiveWordCharacters as encodedCaseInsensitiveWordCharacters,
  combiningClassPartition as encodedCombiningClassPartition,
  combiningClassValues,
  conditionalCaseMappings,
  emojiVersion,
  fullCaseFolding as encodedFullCaseFolding,
  fullLowercase as encodedFullLowercase,
  fullTitlecase as encodedFullTitlecase,
  fullUppercase as encodedFullUppercase,
  generalCategoryAliases,
  generalCategoryNames,
  generalCategoryPartition as encodedGeneralCategoryPartition,
  generalCategorySupercategories,
  propertyNameAliases,
  scriptAliases,
  scriptExtensionsGroups,
  scriptExtensionsPartition as encodedScriptExtensionsPartition,
  scriptNames,
  scriptPartition as encodedScriptPartition,
  simpleCaseFolding as encodedSimpleCaseFolding,
  simpleLowercase as encodedSimpleLowercase,
  simpleTitlecase as encodedSimpleTitlecase,
  simpleUppercase as encodedSimpleUppercase,
  unicodeDataInputs,
  unicodeDataLicense,
  unicodeVersion,
  wordCharacters as encodedWordCharacters,
} from "./tables.ts";

export type {
  CodePointPartition,
  CodePointRange,
  CodePointSet,
  ConditionalCaseMapping,
  UnicodeDataInput,
};
export {
  codePointSetHas,
  codePointSetRanges,
  codePointSetSize,
  conditionalCaseMappings,
  emojiVersion,
  maxCodePoint,
  unicodeDataInputs,
  unicodeDataLicense,
  unicodeVersion,
};

function lazy<T>(build: () => T): () => T {
  let value: T | undefined;
  return (): T => {
    if (value === undefined) value = build();
    return value;
  };
}

function lazyKeyed<T>(build: (key: string) => T): (key: string) => T {
  const cache = new Map<string, T>();
  return (key: string): T => {
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const value = build(key);
    cache.set(key, value);
    return value;
  };
}

const categoryPartition = lazy(
  (): CodePointPartition =>
    decodeCodePointPartition(
      encodedGeneralCategoryPartition,
      generalCategoryNames.length,
    ),
);
const combiningPartition = lazy(
  (): CodePointPartition =>
    decodeCodePointPartition(
      encodedCombiningClassPartition,
      combiningClassValues.length,
    ),
);
const scriptPartitionTable = lazy(
  (): CodePointPartition =>
    decodeCodePointPartition(encodedScriptPartition, scriptNames.length),
);
const scriptExtensionsPartitionTable = lazy(
  (): CodePointPartition =>
    decodeCodePointPartition(
      encodedScriptExtensionsPartition,
      scriptExtensionsGroups.length,
    ),
);
const scriptExtensionsGroupIndices = lazy((): readonly (readonly number[])[] =>
  scriptExtensionsGroups.map((group) =>
    group
      .split(" ")
      .filter((token) => token !== "")
      .map((token) => Number.parseInt(token, 36)),
  ),
);

/** Every ECMAScript binary property name, in ascending order. */
export const binaryPropertyNames: readonly string[] =
  Object.keys(binaryPropertySets).toSorted();

/** The ECMAScript properties that take a value, in ascending order. */
export const nonBinaryPropertyNames: readonly string[] = [
  "General_Category",
  "Script",
  "Script_Extensions",
];

/** Every canonical General_Category value, supercategories included. */
export const generalCategoryValues: readonly string[] = [
  ...new Set([
    ...generalCategoryNames,
    ...Object.keys(generalCategorySupercategories),
  ]),
].toSorted();

/**
 * The canonical base General_Category values, in ascending order.
 *
 * These partition the code-point range: every code point has exactly one,
 * and every other value in `generalCategoryValues` is a union of them.
 */
export const generalCategoryBaseValues: readonly string[] =
  generalCategoryNames.toSorted();

/** Every canonical Script value, in ascending order. */
export const scriptValues: readonly string[] = scriptNames.toSorted();

/** The base categories one canonical General_Category value covers. */
export function generalCategoryMembers(
  value: string,
): readonly string[] | undefined {
  if (Object.hasOwn(generalCategorySupercategories, value)) {
    return generalCategorySupercategories[value];
  }
  return generalCategoryNames.includes(value) ? [value] : undefined;
}

/**
 * The canonical name of one property spelling, or `undefined`.
 *
 * Matching is exact: ECMAScript does not apply Unicode loose matching to
 * property names, so `general_category` is not a spelling of
 * `General_Category`.
 */
export function canonicalPropertyName(name: string): string | undefined {
  return Object.hasOwn(propertyNameAliases, name)
    ? propertyNameAliases[name]
    : undefined;
}

/** The canonical value of one spelling for a property, or `undefined`. */
export function canonicalPropertyValue(
  property: string,
  value: string,
): string | undefined {
  const canonical = canonicalPropertyName(property);
  if (canonical === "General_Category") {
    return Object.hasOwn(generalCategoryAliases, value)
      ? generalCategoryAliases[value]
      : undefined;
  }
  if (canonical === "Script" || canonical === "Script_Extensions") {
    return Object.hasOwn(scriptAliases, value)
      ? scriptAliases[value]
      : undefined;
  }
  return undefined;
}

const binaryPropertySetFor = lazyKeyed(
  (name: string): CodePointSet =>
    decodeCodePointSet(binaryPropertySets[name] ?? ""),
);

/**
 * The code points of one binary property, or `undefined` when the name is
 * not an ECMAScript binary property.
 *
 * The name must already be canonical; resolve a spelling with
 * `canonicalPropertyName` first.
 */
export function binaryPropertySet(name: string): CodePointSet | undefined {
  if (!Object.hasOwn(binaryPropertySets, name)) return undefined;
  return binaryPropertySetFor(name);
}

const generalCategorySetFor = lazyKeyed((value: string): CodePointSet => {
  const members = Object.hasOwn(generalCategorySupercategories, value)
    ? (generalCategorySupercategories[value] ?? [])
    : [value];
  const selected = new Set(
    members.map((member) => generalCategoryNames.indexOf(member)),
  );
  return partitionSet(categoryPartition(), selected);
});

/**
 * The code points of one canonical General_Category value, or `undefined`.
 *
 * A supercategory such as `Letter` reports the union of its base categories.
 */
export function generalCategorySet(value: string): CodePointSet | undefined {
  if (!generalCategoryValues.includes(value)) return undefined;
  return generalCategorySetFor(value);
}

const scriptSetFor = lazyKeyed(
  (value: string): CodePointSet =>
    partitionSet(scriptPartitionTable(), new Set([scriptNames.indexOf(value)])),
);

/** The code points whose Script is one canonical value, or `undefined`. */
export function scriptSet(value: string): CodePointSet | undefined {
  if (!scriptNames.includes(value)) return undefined;
  return scriptSetFor(value);
}

const scriptExtensionsSetFor = lazyKeyed((value: string): CodePointSet => {
  const script = scriptNames.indexOf(value);
  const groups = scriptExtensionsGroupIndices();
  const selected = new Set<number>();
  for (const [index, group] of groups.entries()) {
    if (group.includes(script)) selected.add(index);
  }
  return partitionSet(scriptExtensionsPartitionTable(), selected);
});

/**
 * The code points whose Script_Extensions include one canonical value.
 *
 * A code point with no explicit Script_Extensions entry takes its Script
 * value, as *ScriptExtensions.txt* specifies.
 */
export function scriptExtensionsSet(value: string): CodePointSet | undefined {
  if (!scriptNames.includes(value)) return undefined;
  return scriptExtensionsSetFor(value);
}

/**
 * The Canonical_Combining_Class of one code point.
 *
 * Every code point has one, and it is zero unless *UnicodeData.txt* says
 * otherwise. The conditional case mappings in `conditionalCaseMappings` are
 * defined in terms of this property, so a caller that honors a context such
 * as `More_Above` resolves it from the pinned tables rather than from a host
 * Unicode implementation.
 */
export function canonicalCombiningClassOf(codePoint: number): number {
  const index = partitionValueAt(combiningPartition(), codePoint);
  return combiningClassValues[index] ?? 0;
}

/** The canonical General_Category of one code point. */
export function generalCategoryOf(codePoint: number): string {
  const index = partitionValueAt(categoryPartition(), codePoint);
  return generalCategoryNames[index] ?? "Unassigned";
}

/** The canonical Script of one code point. */
export function scriptOf(codePoint: number): string {
  const index = partitionValueAt(scriptPartitionTable(), codePoint);
  return scriptNames[index] ?? "Unknown";
}

/** The canonical Script_Extensions of one code point, in ascending order. */
export function scriptExtensionsOf(codePoint: number): readonly string[] {
  const group = partitionValueAt(scriptExtensionsPartitionTable(), codePoint);
  const indices = scriptExtensionsGroupIndices()[group] ?? [];
  return indices.map((index) => scriptNames[index] ?? "Unknown");
}

const simpleCaseFoldingTable = lazy(
  (): ReadonlyMap<number, number> =>
    decodeCodePointMap(encodedSimpleCaseFolding),
);
const fullCaseFoldingTable = lazy(
  (): ReadonlyMap<number, readonly number[]> =>
    decodeSequenceMap(encodedFullCaseFolding),
);
const simpleLowercaseTable = lazy(
  (): ReadonlyMap<number, number> => decodeCodePointMap(encodedSimpleLowercase),
);
const simpleUppercaseTable = lazy(
  (): ReadonlyMap<number, number> => decodeCodePointMap(encodedSimpleUppercase),
);
const simpleTitlecaseTable = lazy(
  (): ReadonlyMap<number, number> => decodeCodePointMap(encodedSimpleTitlecase),
);
const fullLowercaseTable = lazy(
  (): ReadonlyMap<number, readonly number[]> =>
    decodeSequenceMap(encodedFullLowercase),
);
const fullUppercaseTable = lazy(
  (): ReadonlyMap<number, readonly number[]> =>
    decodeSequenceMap(encodedFullUppercase),
);
const fullTitlecaseTable = lazy(
  (): ReadonlyMap<number, readonly number[]> =>
    decodeSequenceMap(encodedFullTitlecase),
);

/**
 * The simple case folding of one code point.
 *
 * A code point with no folding, including every unpaired surrogate and every
 * unassigned code point, folds to itself.
 */
export function simpleCaseFolding(codePoint: number): number {
  assertCodePoint(codePoint, "A folded code point");
  return simpleCaseFoldingTable().get(codePoint) ?? codePoint;
}

/**
 * The full case folding of one code point.
 *
 * The result has more than one element only where the Unicode full folding
 * lengthens, such as U+00DF folding to `ss`.
 */
export function fullCaseFolding(codePoint: number): readonly number[] {
  assertCodePoint(codePoint, "A folded code point");
  const folded = fullCaseFoldingTable().get(codePoint);
  return folded ?? [simpleCaseFolding(codePoint)];
}

/** The simple lowercase mapping of one code point. */
export function simpleLowercase(codePoint: number): number {
  assertCodePoint(codePoint, "A mapped code point");
  return simpleLowercaseTable().get(codePoint) ?? codePoint;
}

/** The simple uppercase mapping of one code point. */
export function simpleUppercase(codePoint: number): number {
  assertCodePoint(codePoint, "A mapped code point");
  return simpleUppercaseTable().get(codePoint) ?? codePoint;
}

/** The simple titlecase mapping of one code point. */
export function simpleTitlecase(codePoint: number): number {
  assertCodePoint(codePoint, "A mapped code point");
  return simpleTitlecaseTable().get(codePoint) ?? codePoint;
}

/**
 * The unconditional full lowercase mapping of one code point.
 *
 * Conditional contexts are not applied. A caller that implements Unicode
 * default case conversion consults `conditionalCaseMappings` for the
 * language-independent contexts it honors.
 */
export function fullLowercase(codePoint: number): readonly number[] {
  assertCodePoint(codePoint, "A mapped code point");
  return fullLowercaseTable().get(codePoint) ?? [simpleLowercase(codePoint)];
}

/** The unconditional full uppercase mapping of one code point. */
export function fullUppercase(codePoint: number): readonly number[] {
  assertCodePoint(codePoint, "A mapped code point");
  return fullUppercaseTable().get(codePoint) ?? [simpleUppercase(codePoint)];
}

/** The unconditional full titlecase mapping of one code point. */
export function fullTitlecase(codePoint: number): readonly number[] {
  assertCodePoint(codePoint, "A mapped code point");
  return fullTitlecaseTable().get(codePoint) ?? [simpleTitlecase(codePoint)];
}

const wordCharacterSet = lazy(
  (): CodePointSet => decodeCodePointSet(encodedWordCharacters),
);
const caseInsensitiveWordCharacterSet = lazy(
  (): CodePointSet => decodeCodePointSet(encodedCaseInsensitiveWordCharacters),
);

/** The ECMAScript word characters of a pattern without `i` and `u` or `v`. */
export function wordCharacters(): CodePointSet {
  return wordCharacterSet();
}

/**
 * The ECMAScript word characters of a pattern with `i` and `u` or `v`.
 *
 * Beyond the basic set this holds exactly the code points whose simple case
 * folding lands inside it, which is what `WordCharacters` adds when both
 * flags are present.
 */
export function caseInsensitiveUnicodeWordCharacters(): CodePointSet {
  return caseInsensitiveWordCharacterSet();
}

/** The union of two code-point sets, for composing table results. */
export function unionCodePoints(
  left: CodePointSet,
  right: CodePointSet,
): CodePointSet {
  return unionCodePointSets(left, right);
}
