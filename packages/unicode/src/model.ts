/**
 * Hand-written shapes that the generated table module fills in.
 *
 * The generated module owns data only. Every named shape lives here so that
 * regenerating tables never rewrites a declaration a consumer depends on, and
 * so that the generated module never has to import the package entry point.
 */

/** One pinned Unicode Character Database input the tables were built from. */
export interface UnicodeDataInput {
  /** Byte length of the reviewed file, as pinned in the input manifest. */
  readonly bytes: number;
  /** File name, such as `UnicodeData.txt`. */
  readonly name: string;
  /** Repository-relative path of the reviewed copy. */
  readonly path: string;
  /** Lowercase hexadecimal SHA-256 digest of the reviewed copy. */
  readonly sha256: string;
  /** Authoritative upstream location the reviewed copy was taken from. */
  readonly url: string;
}

/**
 * One conditional full case mapping from *SpecialCasing.txt*.
 *
 * The tables record these entries without applying them. A consumer decides
 * which conditions it honors: `language` is `null` for the
 * language-independent contexts that ECMAScript's default case conversion
 * uses, and a BCP 47 language subtag such as `tr` for the locale-sensitive
 * ones that it does not.
 */
export interface ConditionalCaseMapping {
  /** The code point the mapping applies to. */
  readonly codePoint: number;
  /** Context names such as `Final_Sigma`, in their upstream order. */
  readonly conditions: readonly string[];
  /** The BCP 47 language subtag the entry is restricted to, if any. */
  readonly language: string | null;
  /** The full lowercase mapping this context selects. */
  readonly lowercase: readonly number[];
  /** The full titlecase mapping this context selects. */
  readonly titlecase: readonly number[];
  /** The full uppercase mapping this context selects. */
  readonly uppercase: readonly number[];
}
