/**
 * Linux file-shard weights: ceil(median(per-run sum(case_ms)) / 1,000).
 * All 134 included files have measurements in each of three successful runs:
 * - 40401101765 at `d4d81be9`, jobs in shard order 1 through 7:
 *   121847031054, 121847031208, 121847031011, 121847031261,
 *   121847031100, 121847030959, 121847030943.
 * - 40442491966 at `98460f7c`, jobs in shard order 1 through 7:
 *   121985959542, 121985959637, 121985959527, 121985959575,
 *   121985959675, 121985959612, 121985959670.
 * - 40454201429 at `6aab0fc8`, jobs in shard order 1 through 7:
 *   122023722631, 122023722692, 122023722851, 122023722807,
 *   122023722742, 122023722630, 122023722816.
 *
 * These are derived seconds from concurrent test-case durations, not file
 * or job wall times or CPU time. Array construction, own-key and Reflect
 * are excluded from these logs and retain their previous weights. The
 * Compound assignment's logged registrations are rebucketed into its
 * three split files. Host script bindings and proper tail calls postdate
 * these runs and retain their weights. The Linux upper-median fallback is
 * 443 seconds across 141 entries.
 * docs/evidence/u6/linux-shard-weights.tsv retains each sum and old weight;
 * linux-shards.py reproduces them and the model. See the U6 README.
 *
 * The following historical provenance still describes macOS, the three
 * retained Linux exclusions, and the two later files. New Linux file-shard
 * measurements above supersede its other Linux observations and estimates.
 *
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
 * Continuation-dispatch nesting extends three existing generator/async
 * families. Their weights provisionally use twice their source-run cost
 * on each host, pending exact-candidate CI measurements. This is a planning
 * estimate, not a measured duration or a conservative bound. See U6.
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
 * RegExp pattern extensions now include a native generated domain.
 * Its Linux entry uses a local extended three-registration case sum
 * at `ef014905`. macOS uses the Linux number only as an unmeasured
 * scheduling placeholder, not a measured host ratio. See U6 provenance.
 *
 * Proper tail calls retain historical planning weights: Linux 1726 from
 * the complete local extended run at `87aeb56b`, macOS 286 from the then
 * unknown-file fallback. The changed source is unmeasured; the old Linux
 * CI liveness timeout and partial GC sample prove no current full cost.
 * The restored source still needs complete matching-host measurements.
 *
 * Compound assignment's two fixed matrices now have separate files. Their
 * three weights per host rebucket unchanged historical CI registrations:
 * the median of three Linux runs, and one same-base macOS run. They are
 * partition estimates that omit the new pure model-property overhead,
 * pending candidate CI; they are not fresh file measurements. See U6.
 *
 * The two entries in `caseShardedNativeFiles` are retained from the
 * earlier source. CI excludes them from the file shards, so this run did
 * not observe them here; they still weigh other wrapper invocations and
 * divide into the case-shard estimates below.
 *
 * Primitive wrapper objects reserves 900 seconds on each host as an
 * unmeasured extended planning estimate. Its two local ordinary properties
 * summed to 41.508 seconds on Linux; this is not an extended measurement.
 * See U6 provenance before replacing either estimate with CI case sums.
 *
 * Script and Module declaration grammar is pure JavaScript but participates
 * in the native extended file glob. Its Linux weight is a local extended
 * two-registration case sum; its unmeasured macOS placeholder retains the
 * historical 286-second assigned cost. The combined continuation-dispatch
 * estimates gave Main upper medians of 406 Linux/296 macOS seconds.
 * Both Script entries await exact-candidate CI logs. See U6 provenance.
 *
 * F3 adds a second generator-throw domain. Retire its old 47/43 samples.
 * The 135-entry Main/F3 tables derived 406 Linux/296 macOS fallbacks.
 * Set/Annex deletion, integrity and enumeration change the workload; retire
 * its old 309/451 samples. Its remaining 134 entries derived 409/296
 * fallbacks; restoring TCO gives 135 entries with the same fallbacks.
 * Primitive Set has no explicit estimate. See U6 provenance.
 * These are unmeasured scheduling estimates, not matching-host costs.
 *
 * Host Script bindings use a complete local Linux extended two-case sum
 * at `16bb5e91`; the earlier `ce8ae0c8`, `20d6119b` and `ab8d5d5c`
 * results stay source-qualified.
 * macOS preserves its prior unknown-file assignment of 296 seconds as
 * an explicitly unmeasured placeholder. See U6 provenance.
 * All other Main entries and partition rules remain unchanged. See U6.
 */
export const nativeShardCosts = {
  "linux-x86_64-gnu": {
    "tests/property/m4-async.property.test.ts": 350,
    "tests/property/m5-aggregate-error.property.test.ts": 217,
    "tests/property/m5-annexb-legacy-lookup-boundary.property.test.ts": 615,
    "tests/property/m5-annexb-proto-boundary.property.test.ts": 1447,
    "tests/property/m5-arguments-object.property.test.ts": 679,
    "tests/property/m5-array-binding.property.test.ts": 232,
    "tests/property/m5-array-buffer.property.test.ts": 716,
    // Retained; excluded from the Linux file-shard measurements.
    "tests/property/m5-array-constructor.property.test.ts": 674,
    "tests/property/m5-array-prototype-change-by-copy.property.test.ts": 499,
    "tests/property/m5-array-prototype-copying.property.test.ts": 946,
    "tests/property/m5-array-prototype-index-search.property.test.ts": 364,
    "tests/property/m5-array-prototype-iterative.property.test.ts": 400,
    "tests/property/m5-array-prototype-iterators.property.test.ts": 340,
    "tests/property/m5-array-prototype-mutation.property.test.ts": 496,
    "tests/property/m5-array-prototype-predicate-search.property.test.ts": 491,
    "tests/property/m5-array-prototype-reduction.property.test.ts": 423,
    "tests/property/m5-array-prototype-sort.property.test.ts": 307,
    "tests/property/m5-array-prototype-species-mapping.property.test.ts": 635,
    "tests/property/m5-array-sort-stability.property.test.ts": 2121,
    "tests/property/m5-array-spread.property.test.ts": 226,
    "tests/property/m5-async-await.property.test.ts": 289,
    "tests/property/m5-async-generator.property.test.ts": 373,
    "tests/property/m5-atomics-and-shared-memory.property.test.ts": 588,
    "tests/property/m5-atomics-single-agent.property.test.ts": 349,
    "tests/property/m5-bigint-intrinsic.property.test.ts": 481,
    "tests/property/m5-bigint.property.test.ts": 59,
    "tests/property/m5-boolean-intrinsic.property.test.ts": 480,
    "tests/property/m5-call-spread.property.test.ts": 223,
    "tests/property/m5-catch-binding.property.test.ts": 168,
    "tests/property/m5-class-early-errors.property.test.ts": 58,
    "tests/property/m5-class.property.test.ts": 968,
    // Historical CI registrations rebucketed; new pure overhead omitted.
    // Median over runs 40401101765, 40442491966, 40454201429. See U6.
    "tests/property/m5-compound-assignment.property.test.ts": 2086,
    "tests/property/m5-compound-member-fixed.property.test.ts": 668,
    "tests/property/m5-computed-member-fixed.property.test.ts": 1408,
    "tests/property/m5-cross-realm.property.test.ts": 287,
    "tests/property/m5-data-view.property.test.ts": 487,
    "tests/property/m5-date-family.property.test.ts": 573,
    "tests/property/m5-default-parameter.property.test.ts": 117,
    "tests/property/m5-delete-super.property.test.ts": 355,
    "tests/property/m5-delete.property.test.ts": 285,
    "tests/property/m5-destructuring-assignment.property.test.ts": 2185,
    "tests/property/m5-ephemeron-tracing.property.test.ts": 42,
    "tests/property/m5-export-default-class.property.test.ts": 48,
    "tests/property/m5-for-await-of.property.test.ts": 1336,
    "tests/property/m5-for-binding.property.test.ts": 156,
    "tests/property/m5-for-in-object-pattern.property.test.ts": 676,
    "tests/property/m5-for-in.property.test.ts": 500,
    "tests/property/m5-for-of-assignment.property.test.ts": 200,
    "tests/property/m5-for-of-binding.property.test.ts": 177,
    "tests/property/m5-for-of.property.test.ts": 261,
    "tests/property/m5-function-intrinsic-chains.property.test.ts": 484,
    "tests/property/m5-function-prototype.property.test.ts": 434,
    "tests/property/m5-generator-methods.property.test.ts": 57,
    "tests/property/m5-generator-parameter.property.test.ts": 244,
    "tests/property/m5-generator-throw.property.test.ts": 609,
    "tests/property/m5-generator.property.test.ts": 488,
    "tests/property/m5-generic-string-coercion.property.test.ts": 288,
    "tests/property/m5-global-numeric-functions.property.test.ts": 940,
    "tests/property/m5-global-object-record.property.test.ts": 1982,
    "tests/property/m5-globalthis-binding.property.test.ts": 2673,
    "tests/property/m5-harness-native-function-matcher.property.test.ts": 1080,
    "tests/property/m5-harness-promise-helper.property.test.ts": 816,
    // Local Linux extended case sum: 595.342796227 s, rounded up.
    // October 27, 2026 on 16bb5e91; not CI or file wall time. See U6.
    "tests/property/m5-host-script-bindings.property.test.ts": 596,
    "tests/property/m5-import-attributes.property.test.ts": 474,
    "tests/property/m5-intrinsic-graph-root.property.test.ts": 392,
    "tests/property/m5-iterator-helpers-eager.property.test.ts": 290,
    "tests/property/m5-iterator-helpers-lazy.property.test.ts": 282,
    "tests/property/m5-iterator-intrinsic.property.test.ts": 321,
    "tests/property/m5-json-parse.property.test.ts": 435,
    "tests/property/m5-json-stringify.property.test.ts": 393,
    "tests/property/m5-lexical-declaration-list.property.test.ts": 686,
    "tests/property/m5-lexical-super.property.test.ts": 576,
    "tests/property/m5-map-intrinsic.property.test.ts": 493,
    "tests/property/m5-math-namespace.property.test.ts": 1053,
    "tests/property/m5-module-continuation.property.test.ts": 194,
    "tests/property/m5-number-intrinsic.property.test.ts": 966,
    "tests/property/m5-number-prototype.property.test.ts": 1292,
    "tests/property/m5-object-binding.property.test.ts": 544,
    "tests/property/m5-object-constructor.property.test.ts": 1172,
    "tests/property/m5-object-create.property.test.ts": 380,
    "tests/property/m5-object-define-properties.property.test.ts": 522,
    "tests/property/m5-object-define-property.property.test.ts": 545,
    "tests/property/m5-object-descriptor-queries.property.test.ts": 632,
    "tests/property/m5-object-integrity-levels.property.test.ts": 746,
    "tests/property/m5-object-literal.property.test.ts": 811,
    // Retained; excluded from the Linux file-shard measurements.
    "tests/property/m5-object-own-keys.property.test.ts": 3327,
    "tests/property/m5-object-prototype.property.test.ts": 276,
    "tests/property/m5-object-rest.property.test.ts": 192,
    "tests/property/m5-optional-catch-binding.property.test.ts": 177,
    "tests/property/m5-optional-chaining.property.test.ts": 171,
    "tests/property/m5-optional-private.property.test.ts": 292,
    "tests/property/m5-parameter-binding.property.test.ts": 102,
    "tests/property/m5-parameter-var.property.test.ts": 101,
    "tests/property/m5-pattern-await.property.test.ts": 417,
    "tests/property/m5-primitive-receiver-inherited-set.property.test.ts": 1614,
    "tests/property/m5-primitive-wrapper-objects.property.test.ts": 1012,
    "tests/property/m5-promise-combine.property.test.ts": 1919,
    "tests/property/m5-promise-intrinsic.property.test.ts": 1244,
    "tests/property/m5-proper-tail-calls.property.test.ts": 1726,
    "tests/property/m5-proxy-exotic-object.property.test.ts": 2058,
    // Retained; excluded from the Linux file-shard measurements.
    "tests/property/m5-reflect-namespace.property.test.ts": 2299,
    "tests/property/m5-regexp-intrinsic.property.test.ts": 344,
    "tests/property/m5-regexp-literal-aot.property.test.ts": 608,
    "tests/property/m5-regexp-matcher.property.test.ts": 7,
    "tests/property/m5-regexp-pattern-extensions.property.test.ts": 53,
    "tests/property/m5-regexp-pattern.property.test.ts": 2,
    "tests/property/m5-regexp-prototype-and-exec.property.test.ts": 552,
    "tests/property/m5-regexp-symbol-methods.property.test.ts": 667,
    "tests/property/m5-regexp-unicode-property-escapes.property.test.ts": 2,
    "tests/property/m5-rest-parameter.property.test.ts": 118,
    "tests/property/m5-runtime-error-observation.property.test.ts": 443,
    "tests/property/m5-script-module-declarations.property.test.ts": 64,
    "tests/property/m5-set-composition-methods.property.test.ts": 414,
    "tests/property/m5-set-intrinsic.property.test.ts": 327,
    "tests/property/m5-string-intrinsic.property.test.ts": 953,
    "tests/property/m5-string-iterator.property.test.ts": 339,
    "tests/property/m5-string-prototype-access.property.test.ts": 691,
    "tests/property/m5-string-prototype-case.property.test.ts": 273,
    "tests/property/m5-string-prototype-match-and-split.property.test.ts": 1319,
    "tests/property/m5-string-prototype-pad.property.test.ts": 311,
    "tests/property/m5-string-prototype-replace.property.test.ts": 1007,
    "tests/property/m5-string-prototype-search-and-slice.property.test.ts": 504,
    "tests/property/m5-super-targets.property.test.ts": 642,
    "tests/property/m5-super-without-extends.property.test.ts": 336,
    "tests/property/m5-symbol-intrinsic.property.test.ts": 488,
    "tests/property/m5-tagged-template.property.test.ts": 219,
    "tests/property/m5-top-level-this.property.test.ts": 737,
    "tests/property/m5-typed-array-constructors.property.test.ts": 2064,
    "tests/property/m5-typed-array-core.property.test.ts": 414,
    "tests/property/m5-typed-array-iterative.property.test.ts": 287,
    "tests/property/m5-typed-array-mutation.property.test.ts": 308,
    "tests/property/m5-typed-array-search-and-join.property.test.ts": 649,
    "tests/property/m5-typed-array-sort.property.test.ts": 452,
    "tests/property/m5-typed-array-statics.property.test.ts": 373,
    "tests/property/m5-typeof-unresolved.property.test.ts": 307,
    "tests/property/m5-update-expression.property.test.ts": 154,
    "tests/property/m5-uri-handling-functions.property.test.ts": 700,
    "tests/property/m5-weak-collections.property.test.ts": 429,
    "tests/property/m5-well-known-symbols.property.test.ts": 442,
    "tests/property/nio-clock-wakeup.property.test.ts": 137,
    "tests/property/unicode-tables.property.test.ts": 1,
  },
  "macos-aarch64": {
    "tests/property/m4-async.property.test.ts": 266,
    "tests/property/m5-aggregate-error.property.test.ts": 183,
    "tests/property/m5-annexb-legacy-lookup-boundary.property.test.ts": 281,
    "tests/property/m5-arguments-object.property.test.ts": 436,
    "tests/property/m5-array-binding.property.test.ts": 108,
    "tests/property/m5-array-buffer.property.test.ts": 400,
    "tests/property/m5-array-constructor.property.test.ts": 543,
    "tests/property/m5-array-prototype-change-by-copy.property.test.ts": 265,
    // Provisional estimate: ceil(333 * 339/326) from this file's host
    // ratio in run 39070198868; not a macOS observation. Refresh from CI.
    "tests/property/m5-array-prototype-copying.property.test.ts": 347,
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
    "tests/property/m5-async-await.property.test.ts": 314,
    "tests/property/m5-async-generator.property.test.ts": 380,
    "tests/property/m5-atomics-and-shared-memory.property.test.ts": 342,
    "tests/property/m5-atomics-single-agent.property.test.ts": 391,
    "tests/property/m5-bigint-intrinsic.property.test.ts": 374,
    "tests/property/m5-bigint.property.test.ts": 98,
    "tests/property/m5-boolean-intrinsic.property.test.ts": 211,
    "tests/property/m5-call-spread.property.test.ts": 296,
    "tests/property/m5-catch-binding.property.test.ts": 197,
    "tests/property/m5-class-early-errors.property.test.ts": 45,
    "tests/property/m5-class.property.test.ts": 350,
    // Run 40454201429 registrations rebucketed; new pure overhead omitted.
    // Historical partition estimates; refresh from candidate CI. See U6.
    "tests/property/m5-compound-assignment.property.test.ts": 687,
    "tests/property/m5-compound-member-fixed.property.test.ts": 109,
    "tests/property/m5-computed-member-fixed.property.test.ts": 181,
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
    "tests/property/m5-generator.property.test.ts": 464,
    "tests/property/m5-generic-string-coercion.property.test.ts": 246,
    "tests/property/m5-global-numeric-functions.property.test.ts": 313,
    // Historical-ratio model: ceil(813 * 210/343); not a macOS
    // observation. Refresh from CI.
    "tests/property/m5-global-object-record.property.test.ts": 498,
    "tests/property/m5-globalthis-binding.property.test.ts": 855,
    "tests/property/m5-harness-native-function-matcher.property.test.ts": 479,
    "tests/property/m5-harness-promise-helper.property.test.ts": 548,
    // UNMEASURED: preserve the prior unknown-file upper median, 296 s.
    // Scheduling placeholder only; no macOS observation. See U6 provenance.
    "tests/property/m5-host-script-bindings.property.test.ts": 296,
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
    // Unmeasured extended estimate; see U6 provenance.
    "tests/property/m5-primitive-wrapper-objects.property.test.ts": 900,
    "tests/property/m5-proper-tail-calls.property.test.ts": 286,
    "tests/property/m5-proxy-exotic-object.property.test.ts": 441,
    // Retained; case-sharded out of the file shards.
    "tests/property/m5-reflect-namespace.property.test.ts": 2283,
    "tests/property/m5-regexp-intrinsic.property.test.ts": 185,
    "tests/property/m5-regexp-literal-aot.property.test.ts": 353,
    "tests/property/m5-regexp-matcher.property.test.ts": 4,
    "tests/property/m5-regexp-pattern-extensions.property.test.ts": 44,
    "tests/property/m5-regexp-pattern.property.test.ts": 2,
    "tests/property/m5-regexp-prototype-and-exec.property.test.ts": 429,
    "tests/property/m5-regexp-symbol-methods.property.test.ts": 481,
    "tests/property/m5-regexp-unicode-property-escapes.property.test.ts": 1,
    "tests/property/m5-rest-parameter.property.test.ts": 71,
    "tests/property/m5-runtime-error-observation.property.test.ts": 397,
    // Unmeasured placeholder: historical Script-only upper median, 286 s.
    // Keeps this file's cost; combined unknown-file fallback is 296 s.
    // Refresh from exact-candidate CI. See U6 provenance.
    "tests/property/m5-script-module-declarations.property.test.ts": 286,
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
