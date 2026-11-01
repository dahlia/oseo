Dynamic source fixture-construction evidence
============================================

This bounded child reviews exactly 15 umbrella paths at main
`bc8e3a93e`. The exact selector is
[*dynamic-source-fixture-construction-evidence.paths.txt*](./dynamic-source-fixture-construction-evidence.paths.txt).
Its SHA256 is
`7f4a31855ea4dd5704cada2f761dd83a7c78a897b4d9bfbdae745b241c20ca3a`. Every path
is owned by `dynamic-source-coverage-remediation` and, except the 11 compound
assignment rows, audited under the `fixture-construction` assessment. Root's
classification of 2026-11-01 found no recorded evidence attempt for them, so
ADR 0031 cannot defer them yet. This node is that attempt.


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
`unsupported-ownership-audit`. The umbrella and `m5-exit-audit` depend on
it. This graph commit moves no ledger owner. Root owns UPDATE, outer review,
publication, push and landing. ADR 0013, 0016, 0019, 0029 and 0031 stay
unchanged, and every inventory path and original assertion remains.


Closure routes
--------------

 -  Compound assignment reference base (11):
    *S11.13.2\_A6.1\_T1* through *S11.13.2\_A6.11\_T1*. Each asserts that
    `x op= (eval("var x = 2;"), 4)` keeps the reference resolved before the
    right operand, so the outer `x` receives the result while the new local
    `x` holds 2. Witness the same order with a sloppy `with` object that
    gains `x` during the right operand, for every operator, and compare
    both values strictly. Closed rows move to ADR 0016 under a bound
    assessment.
 -  Global lexical over an eval var
    (*global-code/script-decl-lex-var-declared-via-eval.js*). The assertion
    depends on direct eval creating configurable global var and function
    bindings. Assess whether a host Script pair or a static configurable
    global property witnesses it; otherwise record the deferral.
 -  Direct eval with spread arguments (3): *eval-spread.js*,
    *eval-spread-empty-leading.js* and *eval-spread-empty-trailing.js*.
    Assess whether the existing `eval-semantics` assessment of ADR 0016
    covers them unchanged once the spread iteration they also count has a
    static witness. If it would need new ADR text, ask Root.


Checks and review
-----------------

Graph tests and capacity-wrapped `mise run check` precede the graph-only
commit. Evidence needs a focused native run of any new fixture, its
non-native tests, and `mise run check`; no full or extended gate or UPDATE.
Review uses scope `fixture-construction-evidence` with the pre-gate and
internal reviewers.
