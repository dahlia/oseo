Boundary overlap review
=======================

DS-22 bounds 19 unsupported paths at semantic bundle commit
`9529210a24be72e2b273f43f014c03a98a29069e`. Size: M. The initial scope has
zero newly established closures.

The exact selector is
[*dynamic-source-boundary-overlap-review.paths.txt*](./dynamic-source-boundary-overlap-review.paths.txt),
copied byte for byte from the approved proposal.

SHA256:

`cc26e7de1b27f77cb545cf901d727d53f94ba2ad9d45bf98b46d7b7771290104`


Authority and ownership
-----------------------

The maintainer approved all 15 proposed IDs in
[*20261031T0935-umbrella-second-split.answer.md*](~/.local/state/oseo-m5c/decisions/done/20261031T0935-umbrella-second-split.answer.md),
answering *20261031T0935-umbrella-second-split.md* in that directory. The
source proposal is */data/m5c-d17-20261031/umbrella-split/REPORT.md*, with
per-path subjects and historical gap records in *families.json* beside it.

The 2026-10-28 decision
*~/.local/state/oseo-m5c/decisions/done/20261028-m5c-scope-big-node-split.md*,
items 1 and 2, supplies the existing accounting rules. ADR 0013/0016/0019
remain unchanged. Dependency tags and a rejected source operation do not
authorize whole-path exclusion. Keep all 41,091 inventory paths and every
original assertion; accounting never counts as a pass.

This node depends on landed `authorized-exclusion-audit` and starts
ready/unlanded. Ownership stays with `dynamic-source-coverage-remediation`
until this child lands. Each child landing reports exact newly covered and
still-uncovered subsets and moves ownership in the derived ledger. The
umbrella remains an aggregate gate until all children land and it owns zero
paths. Serialize shared audit, ledger and manifest publication; Root owns
integration and publication.


Closure route and evidence obligations
--------------------------------------

Estimated new test groups: 6–12. Audit-only candidates: 0–0. These are
planning estimates; every selected subject needs accepted evidence or a
bounded decision before closure.

### Annex B and legacy caller boundary overlaps (19)

Remaining reason: `maintainer-decision-if-boundary-changes`.

Nine eval probes assert an unresolvable-name `ReferenceError` after strict
block/switch function declarations. They do not assert a syntax rejection.
Ten caller probes assert `TypeError` after a strict caller or strict reader
is introduced through source evaluation. None requires the optional
normally completing read covered by ADR 0028.

First map every assertion to ADR 0013, ADR 0016 or the exact ADR 0028 selector.
Strict rejection can be mandatory core even when the optional sloppy extension
is excluded. Budget 6–12 core replacement groups if separable. Existing
boundaries plus item 1 may suffice with complete evidence; extending any exact
selector or excluding uncovered mandatory behavior requires a maintainer
decision.

For every eventual exclusion, name the exact replacement paths and reviewed
observations, refresh source and normalized observation digests, and show
that every non-source subject is covered. Keep mixed or uncovered subjects
open and ask for a bounded maintainer decision when a faithful witness is
unavailable. Preserve ADR 0016/0019 reopening triggers; an accepted ADR 0016
amendment admitting dynamic import reopens ImportCall accounting. Each child
requires normal D1/D11 review and D3/D4 publication. The split alone
performed none of those closure or landing steps.


DS-22 replacement assessment
----------------------------

This candidate supplies six new fixed fixture groups for all 19 selected
paths: 19 accounted under ADR 0016 by decision item 1, zero retained in
remediation, and zero new passes. The child delta is 19 fewer umbrella-owned
paths; Root publishes aggregate counts. All 41,091 inventory entries, original
assertions, subset entries, dependency tags, and result records remain.

The exact 19-path selector and SHA256 above match the ledger at base
`362ddb13d933600f6a0543ac332eb8479be9053f`. Every selected row was unsupported
and owned by `node:dynamic-source-coverage-remediation`. Fresh reads of the
pinned source and normalized observation reproduce each row's digests; the
audit now names the three `ds22-*-core` assessments and hashes the replacement
fixture and its focused native/structural tests.

### Assertion mapping

Caller paths below are relative to *test/built-ins/Function/*. Scope paths
are relative to *test/language/eval-code/*. Each row has one original
assertion, with the error constructor tested exactly. The descriptions in the
older proposal do not override those assertions.

| Path                                                          | Normative non-source subject                                               | Static replacement and accounting reason                                                                                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| *15.3.5.4\_2-10gs.js*                                         | TypeError from sloppy reader below strict constructed caller               | `ds22-sloppy-caller-read` preserves the exact disjunction and strict caller; only new Function source construction remains.                                    |
| *15.3.5.4\_2-11gs.js*                                         | TypeError from strict reader in strict direct eval                         | `ds22-strict-caller-read` covers a strict reader reached by a strict wrapper; only direct eval and inherited strictness remain.                                |
| *15.3.5.4\_2-13gs.js*                                         | TypeError from strict reader called by sloppy indirect eval                | `ds22-strict-caller-read` covers a strict reader reached by a sloppy wrapper; only indirect source evaluation remains.                                         |
| *15.3.5.4\_2-57gs.js*                                         | TypeError from sloppy reader below strict declaration through sloppy eval  | `ds22-sloppy-caller-read` preserves the exact expression through a sloppy wrapper and strict caller; only eval remains.                                        |
| *15.3.5.4\_2-58gs.js*                                         | TypeError from sloppy reader below strict declaration through Function     | `ds22-sloppy-caller-read` covers the same call chain and expression; only Function source construction remains.                                                |
| *15.3.5.4\_2-59gs.js*                                         | TypeError from sloppy reader below strict declaration through new Function | `ds22-sloppy-caller-read` covers the same call chain and expression; only new Function source construction remains.                                            |
| *15.3.5.4\_2-7gs.js*                                          | TypeError from strict reader called by sloppy constructed function         | `ds22-strict-caller-read` covers strict reader/sloppy wrapper; construction in strict code does not make its body strict and only source construction remains. |
| *15.3.5.4\_2-8gs.js*                                          | TypeError from sloppy reader below explicitly strict Function body         | `ds22-sloppy-caller-read` preserves the strict-to-sloppy call and expression; only Function construction and its directive remain.                             |
| *15.3.5.4\_2-95gs.js*                                         | TypeError from constructed sloppy reader below strict declaration          | `ds22-sloppy-caller-read` statically declares that reader with the same expression; only reader source construction remains.                                   |
| *15.3.5.4\_2-9gs.js*                                          | TypeError from strict reader called by sloppy new Function body            | `ds22-strict-caller-read` covers strict reader/sloppy wrapper; only new Function construction remains.                                                         |
| *direct/switch-case-decl-eval-source-is-strict-nostrict.js*   | ReferenceError from name outside strict case scope                         | `ds22-strict-case-scope` observes the inside binding, exact outside error and no global property; only eval and explicit source strictness remain.             |
| *direct/switch-case-decl-eval-source-is-strict-onlystrict.js* | ReferenceError from name outside strict case scope                         | `ds22-strict-case-scope` observes the inside binding, exact outside error and no global property; only eval and explicit source strictness remain.             |
| *direct/switch-case-decl-onlystrict.js*                       | ReferenceError from name outside strict case scope                         | `ds22-strict-case-scope` observes the inside binding, exact outside error and no global property; only eval and inherited eval strictness remain.              |
| *direct/switch-dflt-decl-eval-source-is-strict-nostrict.js*   | ReferenceError from name outside strict default scope                      | `ds22-strict-default-scope` observes the inside binding, exact outside error and no global property; only eval and explicit source strictness remain.          |
| *direct/switch-dflt-decl-eval-source-is-strict-onlystrict.js* | ReferenceError from name outside strict default scope                      | `ds22-strict-default-scope` observes the inside binding, exact outside error and no global property; only eval and explicit source strictness remain.          |
| *direct/switch-dflt-decl-onlystrict.js*                       | ReferenceError from name outside strict default scope                      | `ds22-strict-default-scope` observes the inside binding, exact outside error and no global property; only eval and inherited eval strictness remain.           |
| *indirect/block-decl-strict.js*                               | ReferenceError from name outside strict block scope                        | `ds22-strict-block-scope` observes the inside binding, exact outside error and no global property; only eval and explicit source strictness remain.            |
| *indirect/switch-case-decl-strict.js*                         | ReferenceError from name outside strict case scope                         | `ds22-strict-case-scope` observes the inside binding, exact outside error and no global property; only eval and explicit source strictness remain.             |
| *indirect/switch-dflt-decl-strict.js*                         | ReferenceError from name outside strict default scope                      | `ds22-strict-default-scope` observes the inside binding, exact outside error and no global property; only eval and explicit source strictness remain.          |

All rows use ADR 0016 and decision item 1 after replacement of the mandatory
subject. ADR 0013 excludes no strict scope assertion here. ADR 0028 owns none
of these ten caller paths: none is in its exact selector and none expects a
normally completing legacy caller read. Its selector is unchanged. The sloppy
reader expression may throw on the first inherited poison-pill read in Oseo,
or on the fallback member access when a reference host returns null; the
original asserts only `TypeError`, not a particular intermediate value or
throw site. No stack introspection is implemented or inferred.

### Evidence contract

*tests/native/fixtures/ds22-boundary-core.ts* supplies three strict scope
groups, a strict reader called directly/from sloppy/from strict wrappers, a
sloppy reader reached directly through a strict caller and through a sloppy
wrapper, and a restricted-accessor descriptor/get/set group. These static
programs contain no eval or source-compiling construction.

*tests/ds22-boundary-preparation.test.ts* checks every group under both
specialization policies. Scope MIR must read the unresolvable name without a
global declaration; all groups retain catch handling and generic property
access in MIR/C. Node.js and Deno reference harnesses select the Script goal
with indirect eval, as the existing native runner does; that harness wrapper
is not compiled into the replacement program. Descriptor getter/setter
identity is outside the original assertions and is not used as a differential
oracle.

*tests/ds22-boundary-native.test.ts* runs each group with both native policies
and forced collection, checks fixed normative stdout, zero exit status, empty
stderr, positive allocations/collections, and zero disabled-policy guards.
Every enabled group requires guard misses, and the caller groups also require
guard hits. The structural checks require the existing object/shape guards and
fixed-slot loads only under the enabled policy.
*tests/native.ts* registers the six groups in the ordinary native corpus and
both forced-collection lists, including its enabled-policy guard-miss
assertion. These groups add no new specialization feature or generated domain;
they exercise existing specialization paths and generic fallbacks. Existing
property families and their seeds and budgets are unchanged.

The original error constructors are compared by identity with `===` inside
each program. Six additional mutation variants replace the actual constructor
by `String(error.constructor)`, preserving its textual representation while
changing its type and identity. Both reference hosts and both native policies
must observe false for every mutated comparison. This catches a coercing or
text-only oracle. Unqualified-name reads remain unqualified-name reads;
the extra global-own-property check supplements them. The native matrix has
12 program variants and 24 executions under forced collection.

### Gates and remaining ownership

The local evidence packet is */data/m5c-ds22-20261101/*. Its durable report
records exact checks, native source identity, review commits and adapter
verdicts. The subset and results are unchanged, and the new tests are outside
the test262 runner's source/data closure, so no UPDATE is needed. Root still
runs the exact candidate's ordinary/full native suites on both supported
hosts, normal D1/D11 outer review and D3/D4 publication; this child changes no
landed state and performs no push or merge. ADR 0016/0019 reopening triggers
remain in force, including a change to replacement evidence or an amendment
admitting the rejected source operation.
