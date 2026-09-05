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
 *
 * The command line is where this belongs because it is the composition
 * root that already links the pinned tables. A literal compiled by a build
 * and one compiled by a test therefore describe the same Unicode release.
 */

import {
  canonicalPropertyValue,
  ecma262UnicodeStringPropertySet,
  ecma262UnicodePropertySet,
  fullUppercase,
  maxCodePoint,
  generalCategorySet,
  simpleCaseFolding,
} from "@oseo/unicode";
import type { CodePointSet } from "@oseo/unicode";
import type {
  RegExpMatcherUnicodeData,
  RegExpUnicodePropertyEscape,
} from "@oseo/compiler";

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
 * Every bucket is keyed by its canonical code point and seeded with it.
 * A self-canonical code point creates no bucket of its own: the builder
 * only wants classes of two or more, and a code point that canonicalizes
 * to itself joins one exactly when some other code point names it, which
 * is when that other code point seeds the bucket with both. Walking the
 * whole code-point range therefore costs one entry per class rather than
 * one per code point.
 *
 * Under `u` or `v` simple case folding usually names a later code point,
 * which makes that the ordinary order rather than an edge case: `A` seeds
 * the bucket `a` names, and `a` then adds nothing to a bucket it already
 * occupies.
 */
function buildClasses(unicodeMode: boolean): readonly (readonly number[])[] {
  const last = unicodeMode ? maxCodePoint : 0xff_ff;
  const buckets = new Map<number, number[]>();
  for (let codePoint = 0; codePoint <= last; codePoint += 1) {
    const canonical = unicodeMode
      ? simpleCaseFolding(codePoint)
      : canonicalizeCodeUnit(codePoint);
    if (canonical === codePoint) continue;
    const members = buckets.get(canonical);
    if (members == null) buckets.set(canonical, [canonical, codePoint]);
    else members.push(codePoint);
  }
  return [...buckets.values()];
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
  return ecma262UnicodePropertySet(escape.property, escape.value);
}

/**
 * Whether one lone property name is a General_Category value.
 *
 * `CompileToCharSet` asks exactly this before it decides whether to fold a
 * lone `\p{...}` escape, so the answer comes from the pinned property value
 * aliases rather than from whether some set happens to resolve.
 */
export function generalCategoryValue(name: string): boolean {
  return canonicalPropertyValue("General_Category", name) != null;
}

/** The code-point sequences one string property escape names, or undefined. */
export function stringPropertyEscapeSet(
  escape: RegExpUnicodePropertyEscape,
): readonly (readonly number[])[] | undefined {
  if (escape.value != null || escape.negated) return undefined;
  return ecma262UnicodeStringPropertySet(escape.property);
}

/** The reviewed matcher data provider over the pinned Unicode tables. */
export const unicodeMatcherData: RegExpMatcherUnicodeData = {
  caseEquivalenceClasses,
  generalCategoryValue,
  propertySet: propertyEscapeSet,
  spaceSeparators: generalCategorySet("Space_Separator") ?? [],
  stringPropertySet: stringPropertyEscapeSet,
};
