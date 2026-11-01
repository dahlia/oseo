Dynamic source fixture-construction evidence
============================================

This bounded child reviews exactly 15 umbrella paths at main
`bc8e3a93e`. The exact selector is
[*dynamic-source-fixture-construction-evidence.paths.txt*](./dynamic-source-fixture-construction-evidence.paths.txt).
Its SHA256 is
`7f4a31855ea4dd5704cada2f761dd83a7c78a897b4d9bfbdae745b241c20ca3a`. Every path
was owned by `dynamic-source-coverage-remediation` and audited under the
`fixture-construction` assessment. Root's classification of 2026-11-01 found no
recorded evidence attempt for them, so ADR 0031 could not defer them. This node
is that attempt.


Authority and ownership
-----------------------

The maintainer answer
*~/.local/state/oseo-m5c/decisions/answers/20261031T1409-umbrella-residual.md*
allows only evidence first for eval families and sends what evidence cannot
close to a named deferral under [ADR 0031](../adr/0031-m5-named-deferral.md).
The literal host Script track of
[ADR 0029](../adr/0029-ahead-of-time-host-script-bindings.md) and sloppy
`with` statements are both admitted inside M5.

The node starts ready/unlanded, depending on landed
`unsupported-ownership-audit`. The umbrella and `m5-exit-audit` depend on it.
Root owns UPDATE, outer review, publication, push and landing. ADR 0013,
0016, 0019, 0029 and 0031 stay unchanged, and every inventory path and
original assertion remains.


Outcome
-------

The [per-path assessment](./dynamic-source-fixture-construction-assessment.md)
records each path's contract, witness and digests.

 -  Compound assignment reference base (11): *S11.13.2\_A6.1\_T1* through
    *S11.13.2\_A6.11\_T1* close under ADR 0016 with the new
    `compound-reference-base-witness` assessment. A sloppy `with` object
    that gains `x` during the right operand replaces the eval declaration,
    and a native test checks both original assertions for every operator.
 -  Direct eval with spread arguments (3): *eval-spread.js*,
    *eval-spread-empty-leading.js* and *eval-spread-empty-trailing.js* close
    under ADR 0016 with the existing `eval-semantics` assessment, unchanged.
    Their spread iteration counts are witnessed by passing static paths.
 -  Global lexical over an eval var (1):
    *global-code/script-decl-lex-var-declared-via-eval.js* is deferred to
    *PLAN-DYN.md*. Only non-strict direct eval creates the configurable var
    and function bindings it observes; a host Script var is non-configurable
    and makes the later lexical declaration throw.

The umbrella's ownership drops by 15.


Checks and review
-----------------

The evidence commit runs the focused native test, its source test, the graph
test and capacity-wrapped `mise run check`; no full or extended gate or
UPDATE. Review uses scope `fixture-construction-evidence` with the pre-gate
and internal reviewers.
