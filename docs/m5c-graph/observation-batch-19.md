Observation batch 19: reviewed admission
========================================

From the 471 saved observations on clean source `6aab0fc8`, admit
471 paths: 166 pass, 280 expected-negative and
25 unsupported-profile-feature. Retain 0 semantic failures as
unreviewed paths with the bounded remediation responsibilities below.
No path was re-observed for this admission.

Dependency tags derive from original Module goals, source AST constructs,
frontmatter subjects and the pinned lexical or grammar contract, including
malformed sources that cannot produce an AST. A tag changes no actual
classification and authorizes no exclusion. Every expected-negative comes
from the saved phase/type-correct runner classification.

| Evidence                               | Pointer                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Raw observations, first segment        | /data/m5c-b19-b20-b30-20261027/observation-6aab/raw/observations.json                                 |
| Raw observations, continuation         | /data/m5c-b19-b20-b30-20261027/observation-6aab/continuation/raw/observations.json                    |
| Raw observations, remaining 904        | /data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/observations.json                   |
| Exact source hashes and tag derivation | /data/m5c-b19-b20-b30-20261027/task\_c268e41dfa6d/ctx\_e6fde0372f06/round6/reviewed-tag-evidence.json |

The 66 unknown-eval and 393 ImportExpression rejections across this train
belong to `dynamic-source-coverage-remediation`. The 12 await-in-top-level
pattern rejections belong to `module-top-level-await-patterns`. These are
active remediation, with no new exclusion or change to ADR 0016. The
existing owners and their prior paths remain preserved.

The admission is intermediate until the stock scoped UPDATE agrees with
the API records. Root owns candidate CI, landing state and publication.


Full dependency audit
---------------------

The full train audit recomputes all 1,409 admitted rows with the B13 r14
AST tagger; its control run matches all 757 landed B13 rows. Every raw
difference has a source-bound decision, including metadata and includes.
Only this train is retagged; existing Main rows, owners, and result
classifications remain unchanged.

A dependency tag records the test subject and semantics its evaluation
necessarily reaches. Failure-only assertion throws, harness plumbing,
uncalled bodies, and grammar contrast supply no runtime coverage. The
audit rejects 101 failure-only abrupt-completion additions. Tested
throws, specific error assertions, and try/catch/finally retain their
abrupt-completion tags. Malformed ImportCall spreads acquire no iterator;
a missing Symbol.iterator property alone observes no iterator consumer.

The source review also checks evaluated class bindings, observed import
promise chains and error names, reached specifier/namespace coercions,
object-valued await reads, and class-heritage prototype reads. Generic
syntax/runtime tags come from the primary test and its includes. Fixture
modules contribute asserted contracts or prerequisites, including module
linking, top-level await, and dynamic source. Incidental fixture binding
initialization, loops, and branches are plumbing and add no tags. The
final sweep adds module-linking to 80 namespace/evaluation subjects
separately from the AST proposals. The
synchronous Script class named await carries no top-level-await tag.

This batch changes 166 owned rows. Added tag counts:

 -  abrupt-completion: 29
 -  control-flow: 121
 -  error-intrinsics: 29
 -  expression-operators: 128
 -  functions: 50
 -  lexical-grammar: 33
 -  object-properties: 67
 -  regular-expressions: 1
 -  symbols: 19

The complete per-row decisions and full tag-change lists accompany the
current tag-evidence artifact; its directory also records the control
match, source hashes, manual supplements, and Root policy decisions.
