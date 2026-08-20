/**
 * The pinned Unicode facts the generic matcher builder asks its caller for.
 *
 * The compiler core links no Unicode data, so `buildRegExpMatcher` takes the
 * raw facts it cannot derive and owns every ECMAScript decision made from
 * them. This module is the reviewed provider: it reads only `@oseo/unicode`,
 * so a matcher artifact built here describes the pinned Unicode release
 * rather than whichever tables the executing host happens to carry.
 *
 * Only the two `Canonicalize` rules and the property-escape lookup live
 * here. `WordCharacters`, the `\s` composition, class closure, and negation
 * order belong to the matcher, which is what keeps this file free of
 * regular-expression semantics.
 */

import {
  binaryPropertySet,
  canonicalPropertyName,
  canonicalPropertyValue,
  fullUppercase,
  generalCategorySet,
  maxCodePoint,
  scriptExtensionsSet,
  scriptSet,
  simpleCaseFolding,
} from "../packages/unicode/src/index.ts";
import type { CodePointSet } from "../packages/unicode/src/index.ts";
import type {
  RegExpMatcherUnicodeData,
  RegExpUnicodePropertyEscape,
} from "../packages/compiler/src/index.ts";

/**
 * `Canonicalize` for a pattern without `u` or `v`.
 *
 * The rule uppercases one code unit with the Unicode default full mapping,
 * keeps the original when that mapping is not exactly one code unit, and
 * keeps it again when uppercasing would move a non-ASCII code unit into
 * ASCII.
 */
function canonicalizeCodeUnit(unit: number): number {
  const upper = fullUppercase(unit);
  if (upper.length !== 1) return unit;
  const mapped = upper[0] ?? unit;
  if (mapped > 0xff_ff) return unit;
  if (unit >= 128 && mapped < 128) return unit;
  return mapped;
}

/**
 * Group the code points one mode canonicalizes together.
 *
 * Every bucket is keyed by its canonical code point and seeded with it, so
 * a self-canonical code point whose bucket a lower member already created
 * is present once and must not be appended again. Under `u` or `v` simple
 * case folding usually names a later code point, which makes that the
 * ordinary order rather than an edge case: `A` creates the bucket `a`
 * names, and `a` then reaches a bucket it already occupies.
 */
function buildClasses(unicodeMode: boolean): readonly (readonly number[])[] {
  const last = unicodeMode ? maxCodePoint : 0xff_ff;
  const buckets = new Map<number, number[]>();
  for (let codePoint = 0; codePoint <= last; codePoint += 1) {
    const canonical = unicodeMode
      ? simpleCaseFolding(codePoint)
      : canonicalizeCodeUnit(codePoint);
    if (canonical === codePoint) {
      if (!buckets.has(codePoint)) buckets.set(codePoint, [codePoint]);
      continue;
    }
    const members = buckets.get(canonical);
    if (members == null) buckets.set(canonical, [canonical, codePoint]);
    else members.push(codePoint);
  }
  const classes: (readonly number[])[] = [];
  for (const members of buckets.values()) {
    if (members.length > 1) classes.push(members);
  }
  return classes;
}

const cached = new Map<boolean, readonly (readonly number[])[]>();

/** Every case-equivalence class of two or more characters, cached by mode. */
export function caseEquivalenceClasses(
  unicodeMode: boolean,
): readonly (readonly number[])[] {
  const existing = cached.get(unicodeMode);
  if (existing != null) return existing;
  const classes = buildClasses(unicodeMode);
  cached.set(unicodeMode, classes);
  return classes;
}

/** The code-point set one property escape names, or undefined. */
export function propertyEscapeSet(
  escape: RegExpUnicodePropertyEscape,
): CodePointSet | undefined {
  const property = canonicalPropertyName(escape.property);
  if (property == null) {
    const category = canonicalPropertyValue(
      "General_Category",
      escape.property,
    );
    return category == null || escape.value != null
      ? undefined
      : generalCategorySet(category);
  }
  if (escape.value == null) {
    /*
     * A lone name is either a binary property name or a
     * `General_Category` value, and the edition admits no spelling that
     * is both, so trying the two in turn resolves exactly one of them.
     */
    const binary = binaryPropertySet(property);
    if (binary != null) return binary;
    const category = canonicalPropertyValue(
      "General_Category",
      escape.property,
    );
    return category == null ? undefined : generalCategorySet(category);
  }
  const value = canonicalPropertyValue(escape.property, escape.value);
  if (value == null) return undefined;
  if (property === "General_Category") return generalCategorySet(value);
  if (property === "Script") return scriptSet(value);
  if (property === "Script_Extensions") return scriptExtensionsSet(value);
  return undefined;
}

/** The reviewed matcher data provider over the pinned Unicode tables. */
export const unicodeMatcherData: RegExpMatcherUnicodeData = {
  caseEquivalenceClasses,
  propertySet: propertyEscapeSet,
  spaceSeparators: generalCategorySet("Space_Separator") ?? [],
};
