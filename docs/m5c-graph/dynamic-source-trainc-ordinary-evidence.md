Dynamic source train C ordinary evidence
========================================

This bounded child reviews exactly 44 paths at bundle 5 base
`9f21b607aef9399cc2a1f61d382f535af5161a2e`. The exact selector is
[*dynamic-source-trainc-ordinary-evidence.paths.txt*](./dynamic-source-trainc-ordinary-evidence.paths.txt).
Its SHA256 is
`b1b0cc065df5c15151a18d3f8d83cc6ea382570eca55c93211a6aaf6f03489e6`. Per-path
contracts, accounting routes and fallbacks originate in
*/data/m5c-d17-20261101/trainc-ordinary/rows.json*; the family analysis is
*/data/m5c-d17-20261101/trainc-packet/REPORT.md*.


Authority and ownership
-----------------------

The maintainer answer is
*~/.local/state/oseo-m5c/decisions/answers/20261031T1409-umbrella-residual.md*.
Item 3 allows only “evidence first” for eval and Function-constructor
families; item 4 sends what evidence cannot close to an explicit named
deferral, which a separate lane drafts. This node adds no deferral entry.

The node starts ready/unlanded, depending on landed
`unsupported-ownership-audit`. The umbrella and `m5-exit-audit` depend on
this child. This graph commit moves no ledger owner and creates no
exclusion. Root owns UPDATE, outer review, publication, push and landing.
ADR 0013, 0016 and 0019 remain unchanged and all inventory paths remain.


Closure routes and obligations
------------------------------

 -  Strict function restricted properties (16): *13.2-5-s* through
    *13.2-20-s*. Witness reads, assignments and `for-in` enumeration of
    `caller` and `arguments` on statically declared strict functions and
    their `this`, with exact TypeError identity, in both caller strictness
    modes, following DS-14's static strict-function evidence.
 -  Constructed function body effects (5): *13.0-12-s*, *13.0-17-s*,
    *12.2.1-6-s*, *12.2.1-17-s* and *S13.2.2\_A8\_T3*. Witness the executed
    sloppy body effects with static sloppy callables. *13.0-17-s* also needs
    a strict literal host Script for its eval wrapper under the DS-21
    conditions.
 -  Unexecuted constructor accounting (5): *12.2.1-5-s*, *12.2.1-16-s*,
    *13.0\_4-17gs*, *13.0-14-s* and *13.0-13-s*. Confirm per path that the
    whole asserted subject is CreateDynamicFunction parsing; *13.0-13-s*
    also needs a literal host Script for its eval wrapper.
 -  Caller-local eval environments (18): the 12 binding-introduction rows
    and 6 eval declaration instantiation rows. Try evidence first. A host
    Script always targets the global environment and is not a witness for
    the environment a caller's direct eval extends. Paths without complete
    evidence keep umbrella ownership with an exact per-path reason.

Evidence follows the DS-1 through DS-7 accounting records and the
*PLAN-M5.md* evidence contract: strict value and type checks inside the
program, a mutation check that does not reuse the comparator under test,
both specialization policies, and forced collection where native.
Closed paths move to ADR 0016 ownership only through the ledger
parse/derive/serialize API, with fresh source and observation digests. No
observation is promoted by accounting alone.


Checks and review
-----------------

Graph tests and capacity-wrapped `mise run check` precede the graph-only
commit. Evidence requires focused native runs through
`run-gate.py --wait-lock`, focused tests and fast non-native tests; no full or
extended gate or UPDATE. Review uses scope `trainc-ordinary-evidence` with the
pre-gate and internal reviewers; reviewers are read-only.


Evidence candidate
------------------

The per-path assessment is
[*dynamic-source-trainc-ordinary-assessment.md*](./dynamic-source-trainc-ordinary-assessment.md).
All 26 Function-constructor paths close under ADR 0016 through the
`trainc-strict-restricted-static`, `trainc-sloppy-body-static` and
`trainc-constructor-phase` assessments. The 18 caller-local paths keep umbrella
ownership with an exact per-path reason, so the umbrella owns 308 paths.
