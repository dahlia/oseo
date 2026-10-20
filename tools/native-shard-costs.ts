/**
 * Derived seconds from summed measured case durations in CI run
 * 39070198868 at `c78d9df1`, which observed every file shard on both
 * native hosts under one set of toolchain pins. See
 * docs/evidence/u6/README.md; these weights are not job wall times.
 *
 * Each entry is that file's summed case milliseconds divided by 1,000
 * and rounded up. This table replaces a two-run maximum with a single
 * observation. The earlier weights came from runs 36243816479 and
 * 36261458909, kept the larger value per file, and had accumulated
 * local-run estimates for files that postdated both. They were stale
 * file by file: across both hosts they range from 0.26 to 3.59 times
 * the refreshed weight for the same file. One run estimates no
 * run-to-run variation, so these values are not conservative bounds.
 *
 * Two families changed after that source run. Destructuring assignment
 * uses both hosts' case sums from CI run 39473400560 at `3170ba94`.
 * Object binding uses a local Linux extended case sum and an explicitly
 * provisional macOS estimate from its 122/131 host ratio in the source
 * run. See the complete U6 provenance.
 *
 * Typed-array-feature-admission adds Float16Array to the TypedArray
 * constructor file and a shortest-decimal domain to the Number prototype
 * file. Their Linux entries use local extended whole-file case sums of
 * seven and two registrations; macOS remains an unmeasured provisional
 * estimate using each file's 298/694 and 544/936 host ratios in the source
 * run. See U6 provenance.
 *
 * The two entries in `caseShardedNativeFiles` are retained from the
 * earlier source. CI excludes them from the file shards, so this run did
 * not observe them here; they still weigh other wrapper invocations and
 * divide into the case-shard estimates below.
 */
export const nativeShardCosts = {
  "linux-x86_64-gnu": {
    "tests/property/m4-async.property.test.ts": 464,
    "tests/property/m5-aggregate-error.property.test.ts": 265,
    "tests/property/m5-annexb-legacy-lookup-boundary.property.test.ts": 318,
    "tests/property/m5-annexb-proto-boundary.property.test.ts": 309,
    "tests/property/m5-arguments-object.property.test.ts": 647,
    "tests/property/m5-array-binding.property.test.ts": 171,
    "tests/property/m5-array-buffer.property.test.ts": 551,
    "tests/property/m5-array-constructor.property.test.ts": 674,
    "tests/property/m5-array-prototype-change-by-copy.property.test.ts": 355,
    // PROVISIONAL: run 39070198868's 326 scaled by the file's local Linux
    // extended case-duration ratio after array-tolocalestring-arguments
    // added its locale tests (432.75 s / 215.55 s, October 21, 2026),
    // rounded up. Not CI evidence; refresh from the candidate run's logs.
    "tests/property/m5-array-prototype-copying.property.test.ts": 655,
    "tests/property/m5-array-prototype-index-search.property.test.ts": 267,
    "tests/property/m5-array-prototype-iterative.property.test.ts": 492,
    "tests/property/m5-array-prototype-iterators.property.test.ts": 455,
    "tests/property/m5-array-prototype-mutation.property.test.ts": 362,
    "tests/property/m5-array-prototype-predicate-search.property.test.ts": 358,
    "tests/property/m5-array-prototype-reduction.property.test.ts": 315,
    "tests/property/m5-array-prototype-sort.property.test.ts": 405,
    "tests/property/m5-array-prototype-species-mapping.property.test.ts": 670,
    "tests/property/m5-array-sort-stability.property.test.ts": 1637,
    "tests/property/m5-array-spread.property.test.ts": 242,
    "tests/property/m5-async-await.property.test.ts": 321,
    "tests/property/m5-async-generator.property.test.ts": 226,
    "tests/property/m5-atomics-and-shared-memory.property.test.ts": 588,
    "tests/property/m5-atomics-single-agent.property.test.ts": 463,
    "tests/property/m5-bigint-intrinsic.property.test.ts": 479,
    "tests/property/m5-bigint.property.test.ts": 88,
    "tests/property/m5-boolean-intrinsic.property.test.ts": 361,
    "tests/property/m5-call-spread.property.test.ts": 209,
    "tests/property/m5-catch-binding.property.test.ts": 163,
    "tests/property/m5-class-early-errors.property.test.ts": 56,
    "tests/property/m5-class.property.test.ts": 711,
    "tests/property/m5-compound-assignment.property.test.ts": 577,
    "tests/property/m5-cross-realm.property.test.ts": 186,
    "tests/property/m5-data-view.property.test.ts": 523,
    "tests/property/m5-date-family.property.test.ts": 609,
    "tests/property/m5-default-parameter.property.test.ts": 89,
    "tests/property/m5-delete-super.property.test.ts": 471,
    "tests/property/m5-delete.property.test.ts": 210,
    // CI run 39473400560 case sum: 1,219.306454043 s, rounded up.
    "tests/property/m5-destructuring-assignment.property.test.ts": 1220,
    "tests/property/m5-ephemeron-tracing.property.test.ts": 40,
    "tests/property/m5-export-default-class.property.test.ts": 44,
    "tests/property/m5-for-await-of.property.test.ts": 1333,
    "tests/property/m5-for-binding.property.test.ts": 146,
    "tests/property/m5-for-in-object-pattern.property.test.ts": 629,
    "tests/property/m5-for-in.property.test.ts": 525,
    "tests/property/m5-for-of-assignment.property.test.ts": 187,
    "tests/property/m5-for-of-binding.property.test.ts": 134,
    "tests/property/m5-for-of.property.test.ts": 179,
    "tests/property/m5-function-intrinsic-chains.property.test.ts": 642,
    "tests/property/m5-function-prototype.property.test.ts": 417,
    "tests/property/m5-generator-methods.property.test.ts": 51,
    "tests/property/m5-generator-parameter.property.test.ts": 168,
    "tests/property/m5-generator-throw.property.test.ts": 47,
    "tests/property/m5-generator.property.test.ts": 444,
    "tests/property/m5-generic-string-coercion.property.test.ts": 282,
    "tests/property/m5-global-numeric-functions.property.test.ts": 667,
    "tests/property/m5-global-object-record.property.test.ts": 343,
    "tests/property/m5-globalthis-binding.property.test.ts": 2647,
    "tests/property/m5-harness-native-function-matcher.property.test.ts": 590,
    "tests/property/m5-harness-promise-helper.property.test.ts": 578,
    "tests/property/m5-import-attributes.property.test.ts": 354,
    "tests/property/m5-intrinsic-graph-root.property.test.ts": 334,
    "tests/property/m5-iterator-helpers-eager.property.test.ts": 285,
    "tests/property/m5-iterator-helpers-lazy.property.test.ts": 265,
    "tests/property/m5-iterator-intrinsic.property.test.ts": 377,
    "tests/property/m5-json-parse.property.test.ts": 418,
    "tests/property/m5-json-stringify.property.test.ts": 289,
    "tests/property/m5-lexical-declaration-list.property.test.ts": 433,
    "tests/property/m5-lexical-super.property.test.ts": 553,
    "tests/property/m5-map-intrinsic.property.test.ts": 434,
    "tests/property/m5-math-namespace.property.test.ts": 1140,
    "tests/property/m5-module-continuation.property.test.ts": 153,
    "tests/property/m5-number-intrinsic.property.test.ts": 1050,
    "tests/property/m5-number-prototype.property.test.ts": 415,
    // Local Linux extended case sum: 234.699350840 s, rounded up.
    // October 21, 2026; not CI or file wall time. See U6 provenance.
    "tests/property/m5-object-binding.property.test.ts": 235,
    "tests/property/m5-object-constructor.property.test.ts": 1163,
    "tests/property/m5-object-create.property.test.ts": 517,
    "tests/property/m5-object-define-properties.property.test.ts": 287,
    "tests/property/m5-object-define-property.property.test.ts": 355,
    "tests/property/m5-object-descriptor-queries.property.test.ts": 438,
    "tests/property/m5-object-integrity-levels.property.test.ts": 527,
    "tests/property/m5-object-literal.property.test.ts": 616,
    // Retained; case-sharded out of the file shards.
    "tests/property/m5-object-own-keys.property.test.ts": 3327,
    "tests/property/m5-object-prototype.property.test.ts": 258,
    "tests/property/m5-object-rest.property.test.ts": 137,
    "tests/property/m5-optional-catch-binding.property.test.ts": 171,
    "tests/property/m5-optional-chaining.property.test.ts": 97,
    "tests/property/m5-optional-private.property.test.ts": 226,
    "tests/property/m5-parameter-binding.property.test.ts": 121,
    "tests/property/m5-parameter-var.property.test.ts": 146,
    "tests/property/m5-pattern-await.property.test.ts": 596,
    "tests/property/m5-promise-combine.property.test.ts": 1433,
    "tests/property/m5-promise-intrinsic.property.test.ts": 944,
    "tests/property/m5-proxy-exotic-object.property.test.ts": 1559,
    // Retained; case-sharded out of the file shards.
    "tests/property/m5-reflect-namespace.property.test.ts": 2299,
    "tests/property/m5-regexp-intrinsic.property.test.ts": 223,
    "tests/property/m5-regexp-literal-aot.property.test.ts": 438,
    "tests/property/m5-regexp-matcher.property.test.ts": 8,
    "tests/property/m5-regexp-pattern-extensions.property.test.ts": 1,
    "tests/property/m5-regexp-pattern.property.test.ts": 2,
    "tests/property/m5-regexp-prototype-and-exec.property.test.ts": 409,
    "tests/property/m5-regexp-symbol-methods.property.test.ts": 977,
    "tests/property/m5-regexp-unicode-property-escapes.property.test.ts": 2,
    "tests/property/m5-rest-parameter.property.test.ts": 110,
    "tests/property/m5-runtime-error-observation.property.test.ts": 441,
    "tests/property/m5-set-composition-methods.property.test.ts": 406,
    "tests/property/m5-set-intrinsic.property.test.ts": 223,
    "tests/property/m5-string-intrinsic.property.test.ts": 1053,
    "tests/property/m5-string-iterator.property.test.ts": 454,
    "tests/property/m5-string-prototype-access.property.test.ts": 716,
    "tests/property/m5-string-prototype-case.property.test.ts": 372,
    "tests/property/m5-string-prototype-match-and-split.property.test.ts": 1320,
    "tests/property/m5-string-prototype-pad.property.test.ts": 369,
    "tests/property/m5-string-prototype-replace.property.test.ts": 564,
    "tests/property/m5-string-prototype-search-and-slice.property.test.ts": 502,
    "tests/property/m5-super-targets.property.test.ts": 440,
    "tests/property/m5-super-without-extends.property.test.ts": 167,
    "tests/property/m5-symbol-intrinsic.property.test.ts": 365,
    "tests/property/m5-tagged-template.property.test.ts": 184,
    "tests/property/m5-top-level-this.property.test.ts": 573,
    "tests/property/m5-typed-array-constructors.property.test.ts": 658,
    "tests/property/m5-typed-array-core.property.test.ts": 494,
    "tests/property/m5-typed-array-iterative.property.test.ts": 212,
    "tests/property/m5-typed-array-mutation.property.test.ts": 401,
    "tests/property/m5-typed-array-search-and-join.property.test.ts": 286,
    "tests/property/m5-typed-array-sort.property.test.ts": 449,
    "tests/property/m5-typed-array-statics.property.test.ts": 365,
    "tests/property/m5-typeof-unresolved.property.test.ts": 396,
    "tests/property/m5-update-expression.property.test.ts": 151,
    "tests/property/m5-uri-handling-functions.property.test.ts": 921,
    "tests/property/m5-weak-collections.property.test.ts": 591,
    "tests/property/m5-well-known-symbols.property.test.ts": 592,
    "tests/property/nio-clock-wakeup.property.test.ts": 134,
    "tests/property/unicode-tables.property.test.ts": 1,
  },
  "macos-aarch64": {
    "tests/property/m4-async.property.test.ts": 266,
    "tests/property/m5-aggregate-error.property.test.ts": 183,
    "tests/property/m5-annexb-legacy-lookup-boundary.property.test.ts": 281,
    "tests/property/m5-annexb-proto-boundary.property.test.ts": 451,
    "tests/property/m5-arguments-object.property.test.ts": 436,
    "tests/property/m5-array-binding.property.test.ts": 108,
    "tests/property/m5-array-buffer.property.test.ts": 400,
    "tests/property/m5-array-constructor.property.test.ts": 543,
    "tests/property/m5-array-prototype-change-by-copy.property.test.ts": 265,
    // PROVISIONAL: run 39070198868's 339 scaled by the same local Linux
    // ratio, rounded up. UNMEASURED on macOS.
    "tests/property/m5-array-prototype-copying.property.test.ts": 681,
    "tests/property/m5-array-prototype-index-search.property.test.ts": 404,
    "tests/property/m5-array-prototype-iterative.property.test.ts": 243,
    "tests/property/m5-array-prototype-iterators.property.test.ts": 275,
    "tests/property/m5-array-prototype-mutation.property.test.ts": 215,
    "tests/property/m5-array-prototype-predicate-search.property.test.ts": 294,
    "tests/property/m5-array-prototype-reduction.property.test.ts": 221,
    "tests/property/m5-array-prototype-sort.property.test.ts": 174,
    "tests/property/m5-array-prototype-species-mapping.property.test.ts": 278,
    "tests/property/m5-array-sort-stability.property.test.ts": 575,
    "tests/property/m5-array-spread.property.test.ts": 197,
    "tests/property/m5-async-await.property.test.ts": 157,
    "tests/property/m5-async-generator.property.test.ts": 190,
    "tests/property/m5-atomics-and-shared-memory.property.test.ts": 342,
    "tests/property/m5-atomics-single-agent.property.test.ts": 391,
    "tests/property/m5-bigint-intrinsic.property.test.ts": 374,
    "tests/property/m5-bigint.property.test.ts": 98,
    "tests/property/m5-boolean-intrinsic.property.test.ts": 211,
    "tests/property/m5-call-spread.property.test.ts": 296,
    "tests/property/m5-catch-binding.property.test.ts": 197,
    "tests/property/m5-class-early-errors.property.test.ts": 45,
    "tests/property/m5-class.property.test.ts": 350,
    "tests/property/m5-compound-assignment.property.test.ts": 390,
    "tests/property/m5-cross-realm.property.test.ts": 221,
    "tests/property/m5-data-view.property.test.ts": 296,
    "tests/property/m5-date-family.property.test.ts": 423,
    "tests/property/m5-default-parameter.property.test.ts": 88,
    "tests/property/m5-delete-super.property.test.ts": 207,
    "tests/property/m5-delete.property.test.ts": 211,
    // CI run 39473400560 case sum: 605.363979249 s, rounded up.
    "tests/property/m5-destructuring-assignment.property.test.ts": 606,
    "tests/property/m5-ephemeron-tracing.property.test.ts": 20,
    "tests/property/m5-export-default-class.property.test.ts": 35,
    "tests/property/m5-for-await-of.property.test.ts": 419,
    "tests/property/m5-for-binding.property.test.ts": 314,
    "tests/property/m5-for-in-object-pattern.property.test.ts": 323,
    "tests/property/m5-for-in.property.test.ts": 557,
    "tests/property/m5-for-of-assignment.property.test.ts": 271,
    "tests/property/m5-for-of-binding.property.test.ts": 249,
    "tests/property/m5-for-of.property.test.ts": 138,
    "tests/property/m5-function-intrinsic-chains.property.test.ts": 359,
    "tests/property/m5-function-prototype.property.test.ts": 183,
    "tests/property/m5-generator-methods.property.test.ts": 64,
    "tests/property/m5-generator-parameter.property.test.ts": 138,
    "tests/property/m5-generator-throw.property.test.ts": 43,
    "tests/property/m5-generator.property.test.ts": 232,
    "tests/property/m5-generic-string-coercion.property.test.ts": 246,
    "tests/property/m5-global-numeric-functions.property.test.ts": 313,
    "tests/property/m5-global-object-record.property.test.ts": 210,
    "tests/property/m5-globalthis-binding.property.test.ts": 855,
    "tests/property/m5-harness-native-function-matcher.property.test.ts": 479,
    "tests/property/m5-harness-promise-helper.property.test.ts": 548,
    "tests/property/m5-import-attributes.property.test.ts": 131,
    "tests/property/m5-intrinsic-graph-root.property.test.ts": 162,
    "tests/property/m5-iterator-helpers-eager.property.test.ts": 340,
    "tests/property/m5-iterator-helpers-lazy.property.test.ts": 169,
    "tests/property/m5-iterator-intrinsic.property.test.ts": 181,
    "tests/property/m5-json-parse.property.test.ts": 338,
    "tests/property/m5-json-stringify.property.test.ts": 317,
    "tests/property/m5-lexical-declaration-list.property.test.ts": 469,
    "tests/property/m5-lexical-super.property.test.ts": 520,
    "tests/property/m5-map-intrinsic.property.test.ts": 198,
    "tests/property/m5-math-namespace.property.test.ts": 321,
    "tests/property/m5-module-continuation.property.test.ts": 317,
    "tests/property/m5-number-intrinsic.property.test.ts": 301,
    "tests/property/m5-number-prototype.property.test.ts": 242,
    // Provisional estimate: ceil(235 * 122/131) from this file's host
    // ratio in the source run; not a macOS observation. Refresh from CI.
    "tests/property/m5-object-binding.property.test.ts": 219,
    "tests/property/m5-object-constructor.property.test.ts": 497,
    "tests/property/m5-object-create.property.test.ts": 323,
    "tests/property/m5-object-define-properties.property.test.ts": 324,
    "tests/property/m5-object-define-property.property.test.ts": 286,
    "tests/property/m5-object-descriptor-queries.property.test.ts": 471,
    "tests/property/m5-object-integrity-levels.property.test.ts": 463,
    "tests/property/m5-object-literal.property.test.ts": 368,
    // Retained; case-sharded out of the file shards.
    "tests/property/m5-object-own-keys.property.test.ts": 3566,
    "tests/property/m5-object-prototype.property.test.ts": 404,
    "tests/property/m5-object-rest.property.test.ts": 153,
    "tests/property/m5-optional-catch-binding.property.test.ts": 132,
    "tests/property/m5-optional-chaining.property.test.ts": 133,
    "tests/property/m5-optional-private.property.test.ts": 163,
    "tests/property/m5-parameter-binding.property.test.ts": 141,
    "tests/property/m5-parameter-var.property.test.ts": 72,
    "tests/property/m5-pattern-await.property.test.ts": 341,
    "tests/property/m5-promise-combine.property.test.ts": 631,
    "tests/property/m5-promise-intrinsic.property.test.ts": 669,
    "tests/property/m5-proxy-exotic-object.property.test.ts": 441,
    // Retained; case-sharded out of the file shards.
    "tests/property/m5-reflect-namespace.property.test.ts": 2283,
    "tests/property/m5-regexp-intrinsic.property.test.ts": 185,
    "tests/property/m5-regexp-literal-aot.property.test.ts": 353,
    "tests/property/m5-regexp-matcher.property.test.ts": 4,
    "tests/property/m5-regexp-pattern-extensions.property.test.ts": 1,
    "tests/property/m5-regexp-pattern.property.test.ts": 2,
    "tests/property/m5-regexp-prototype-and-exec.property.test.ts": 429,
    "tests/property/m5-regexp-symbol-methods.property.test.ts": 481,
    "tests/property/m5-regexp-unicode-property-escapes.property.test.ts": 1,
    "tests/property/m5-rest-parameter.property.test.ts": 71,
    "tests/property/m5-runtime-error-observation.property.test.ts": 397,
    "tests/property/m5-set-composition-methods.property.test.ts": 319,
    "tests/property/m5-set-intrinsic.property.test.ts": 331,
    "tests/property/m5-string-intrinsic.property.test.ts": 323,
    "tests/property/m5-string-iterator.property.test.ts": 223,
    "tests/property/m5-string-prototype-access.property.test.ts": 494,
    "tests/property/m5-string-prototype-case.property.test.ts": 167,
    "tests/property/m5-string-prototype-match-and-split.property.test.ts": 419,
    "tests/property/m5-string-prototype-pad.property.test.ts": 283,
    "tests/property/m5-string-prototype-replace.property.test.ts": 492,
    "tests/property/m5-string-prototype-search-and-slice.property.test.ts": 563,
    "tests/property/m5-super-targets.property.test.ts": 277,
    "tests/property/m5-super-without-extends.property.test.ts": 165,
    "tests/property/m5-symbol-intrinsic.property.test.ts": 406,
    "tests/property/m5-tagged-template.property.test.ts": 158,
    "tests/property/m5-top-level-this.property.test.ts": 306,
    "tests/property/m5-typed-array-constructors.property.test.ts": 283,
    "tests/property/m5-typed-array-core.property.test.ts": 213,
    "tests/property/m5-typed-array-iterative.property.test.ts": 214,
    "tests/property/m5-typed-array-mutation.property.test.ts": 224,
    "tests/property/m5-typed-array-search-and-join.property.test.ts": 135,
    "tests/property/m5-typed-array-sort.property.test.ts": 305,
    "tests/property/m5-typed-array-statics.property.test.ts": 496,
    "tests/property/m5-typeof-unresolved.property.test.ts": 358,
    "tests/property/m5-update-expression.property.test.ts": 84,
    "tests/property/m5-uri-handling-functions.property.test.ts": 511,
    "tests/property/m5-weak-collections.property.test.ts": 261,
    "tests/property/m5-well-known-symbols.property.test.ts": 529,
    "tests/property/nio-clock-wakeup.property.test.ts": 119,
    "tests/property/unicode-tables.property.test.ts": 1,
  },
};

/**
 * Derived case-shard weights from the U6 concurrent-duration table above.
 * These are scheduling estimates, not measured case-shard job times. Each
 * case-sharded file splits its generated cases three ways, so a shard
 * carries one third of the file's weight on its host.
 */
interface CaseShardCosts {
  readonly "linux-x86_64-gnu": number;
  readonly "macos-aarch64": number;
}

/** A property file both host weight tables measure. */
type NativeShardFile = keyof (typeof nativeShardCosts)["linux-x86_64-gnu"] &
  keyof (typeof nativeShardCosts)["macos-aarch64"];

/** Derived one-third weights for dedicated case-shard job planning. */
function caseShardCosts(path: NativeShardFile): CaseShardCosts {
  return {
    "linux-x86_64-gnu": Math.ceil(
      nativeShardCosts["linux-x86_64-gnu"][path] / 3,
    ),
    "macos-aarch64": Math.ceil(nativeShardCosts["macos-aarch64"][path] / 3),
  };
}

/** Derived one-third own-key costs for dedicated case-shard job planning. */
export const ownKeyCaseShardCosts: CaseShardCosts = caseShardCosts(
  "tests/property/m5-object-own-keys.property.test.ts",
);

/**
 * Derived one-third Reflect namespace costs. U38 case-sharded this file
 * for the same reason: unsharded it set its own Linux file shard's wall,
 * which U31 showed no file partition can lower.
 */
export const reflectCaseShardCosts: CaseShardCosts = caseShardCosts(
  "tests/property/m5-reflect-namespace.property.test.ts",
);
