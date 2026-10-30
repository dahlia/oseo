Module semantics reached through import()
=========================================

This record backs the M5c graph node `dynamic-source-module-semantics`
(DS-2). The maintainer decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*) keeps module evaluation order,
top-level await, module namespace objects, and JSON module identity in
remediation (item 2) and approves this node as DS-2 of the
`dynamic-source-coverage-remediation` split (item 4). The umbrella lands
when it owns zero paths.


Selection rule
--------------

This node selects from the 393 OSEO1001 ImportExpression rejections that
`observation-batch-20` and `observation-batch-30` add to the umbrella;
*dynamic-source-importcall-accounting.md* records their path-set digest. The
umbrella owns them once both batches land. The node records both batches in
`after`; selection and publication wait for their landing without adding
dependency ancestry. The candidates are:

 -  the 61 paths under *test/language/expressions/dynamic-import/namespace/*;
 -  the 11 module code paths: 10 under
    *test/language/module-code/top-level-await/* and
    *test/language/module-code/verify-dfs.js*;
 -  other dynamic import paths, such as the directory's `reuse-namespace-*`,
    `import-errored-module`, and `imported-self-update` files, whose
    reviewed assessment finds one of the module subjects above.

Each path is assessed separately. One path has one owner: a path that
`dynamic-source-importcall-accounting` has already moved is not reselected,
and a path whose subject is neither ImportCall nor a module subject stays
with the umbrella.

The train also introduces `module-namespace-uninitialized-bindings`, whose
subject is close to this node's. It has landed on this work's base,
`74bb8e47`, without adding dependency ancestry to this node.


Evidence obligations
--------------------

 -  Review replacement fixtures that observe each module subject through
    static imports, preserving every original path and assertion.
 -  A path closes under `adr:0016-dynamic-source-boundary` only by item 1 of
    the decision, with a fresh-digest exclusion-audit record that names the
    replacement paths and observations and shows that only source
    evaluation remains. Otherwise it stays in remediation.
 -  Never count a pass, emulate dynamic import, or widen ADR 0016. ADR 0016
    and ADR 0019 remain unchanged, and all 41,091 inventory paths remain.


Assessment on 74bb8e47
----------------------

The per-path table is
[*dynamic-source-module-semantics-assessment.yaml*](./dynamic-source-module-semantics-assessment.yaml).
It lists every remaining ImportExpression rejection in the landed train: 175
paths after DS1's 218 exclusions. Of these, 108 have DS2 subjects. The 48 catch
cases concern target parsing or linking validation, and 18 usage cases concern
the Script versus Module loading goal; these 66 stay outside the four DS2
subject families. The grammar-only
*top-level-await/syntax/await-expr-dyn-import.js* stays with the umbrella for
ImportCall reassessment. The separate *dynamic-import/usage-from-eval.js*
observes an unknown-eval rejection and belongs to DS3, so it is not selected
here. No remaining train path has a JSON module identity subject; the separate
dynamic import-attributes reservation and its JSON accounting remain unchanged.

| Family                         | Assessed | ADR 0016 | Staying |
| ------------------------------ | -------: | -------: | ------: |
| Dynamic import namespace       |       61 |       47 |      14 |
| Dynamic import catch           |       48 |        0 |      48 |
| Dynamic import usage           |       36 |       18 |      18 |
| Dynamic import directory files |       19 |       11 |       8 |
| Module code, including grammar |       11 |        0 |      11 |
| Total                          |      175 |       76 |      99 |

Each closing row names an existing reviewed passing test262 counterpart;
the 18 live-default rows also need the new namespace evidence below.
Together they observe every non-source assertion through static imports. The
table records that observation's digest and result partition, and SHA256
digests of the pinned replacement sources and their static fixture graph. The
new `ds2-static-module-semantics` exclusion assessment binds the table and
those result partitions and new native sources. Original source and normalized
observation digests were recomputed and match all 175 existing audit rows. The
test262 observations are existing observations; the new native fixture
observations below do not add test262 passes.

The namespace counterparts cover the same exotic-object operations and
local, renamed, indirect and default export categories where asserted.
Literal sentinels differ in some static tests without changing the observed
operation. The named default-generator counterpart returns 88 instead of
42, retaining the initialization and inferred-name assertions. The static
default-binding counterpart calls the function returning 1 and then reads
the updated binding value 2. Direct imports alone do not observe the
namespace property's live value, so the added
*tests/fixtures/module-default-namespace-update/entry.mjs* imports a
namespace statically, calls `namespace.default()` and then reads
`namespace.default`. Its default function updates its own binding before
returning 1, so the next property read must yield 2. This preserves the
namespace assertions in all 18 usage variants. Await and then only acquire
the namespace for these assertions; only the dynamic source-evaluation site
remains after this replacement evidence.

The 32 selected module-subject paths without complete replacement evidence
retain umbrella ownership, as do the 67 candidates outside DS2. Each
staying row gives the missing observation. Static module strictness does
not cover silent sloppy assignments or deletes. Similar async fixtures do
not establish equivalence for repeated loads, cached errors, concurrent
graph settlement or delayed evaluation. The audit does not infer those
contracts from a matching filename or a general module test.

Landing after DS-3, the umbrella decreases from 536 to 460 paths and ADR
0016 increases from 508 to 584. All 41,091 inventory paths,
classifications, dependency tags, subset entries and result observations
remain unchanged. The 76 paths are
owned exclusions, never passes; an accepted ADR 0016 amendment admitting
any dynamic import reopens them. No UPDATE is needed because the subset
and results are unchanged.

One native integration test and two fixture modules were added. The focused
*tests/module-default-namespace-update-native.test.ts* run passed on Linux
AMD64: Node.js, Deno and native specialization disabled and enabled each
produced `1` and `2` on separate lines, with empty stderr and exit 0. The
table binds the three source digests and records the raw observation log.
Root must run the full `test:node` and `test:deno` lanes that discover this
test on the supported native hosts, alongside the normal CI gates; those
full suites have not run here.
