Function constructor and train coverage assessment
==================================================

This bounded child of `dynamic-source-coverage-remediation` gives each of
exactly 49 umbrella paths one reviewed outcome. The selector is
[*dynamic-source-function-constructor-assessment.paths.txt*](./dynamic-source-function-constructor-assessment.paths.txt).
Its SHA256 is
`e405ad5a032f4727d404aa5ec09b54d5878148b088f0f303f4c5bbe286433523`.

| Exclusion audit assessment           |  Paths |
| ------------------------------------ | -----: |
| `observation-b01-b18-dynamic-source` |     27 |
| `observation-train-dynamic-coverage` |     22 |
| **Total**                            | **49** |

The first group is the 26 S15.3.2.1 rows of *built-ins/Function/* still
with the umbrella and *built-ins/Function/instance-name.js*. The second holds
the direct eval `super` rows, the Function and GeneratorFunction subclass
rows, a tail call through a binding that direct eval creates, two `with`
probes and the no-newline hashbang probe.


Authority
---------

The maintainer answer
*~/.local/state/oseo-m5c/decisions/answers/20261031T1409-umbrella-residual.md*
approves the literal host Script track (item 1) and declines general eval
and Function construction (item 3). Item 3 names Function argument
conversion among the contracts that try evidence first and are otherwise
deferred under item 4, which [ADR 0031](../adr/0031-m5-named-deferral.md)
implements. The 2026-10-28 decision, item 1, accounts a path under
[ADR 0016](../adr/0016-dynamic-source-boundary.md) only when reviewed
evidence covers every non-source subject.

Several of these paths were examined before without a recorded outcome:
the S15.3.2.1 conversion rows by `dynamic-source-construction-contracts`,
the subclass rows by `dynamic-source-callable-object-evidence`, the eval
`super` rows by `dynamic-source-eval-contract-accounting` and
`dynamic-source-host-script-evidence`, and the hashbang and
*12.10.1-5-s.js* probes by `dynamic-source-residual-evidence`. This node
records the outcome those attempts left open.


Outcomes
--------

Each path takes exactly one outcome:

 -  Closed under ADR 0016. Either a faithful witness observes the same
    operation and compares the same values as every non-source assertion,
    or no non-source assertion remains and the path fits an existing ADR
    0016 audit surface (`eval-semantics` or `dynamic-construction`) with a
    named sibling precedent. The surface is never widened.
 -  Deferred under ADR 0031 in the `run-time-source` family, only when
    run-time source compilation alone observes the contract and no ADR
    0016 assessment already excludes it.
 -  Anything else goes back to Root before any ownership change.

The per-path outcome, witness and digests are recorded in the assessment
beside this note. Ledger owners move only with that reviewed assessment,
through the ledger tool. No subset row, dependency tag or observation
changes, and no path counts as a pass.


Ownership
---------

The node starts ready and unlanded, depending on the landed
`unsupported-ownership-audit`. The umbrella and `m5-exit-audit` depend on
it. This graph change moves no ledger owner. Root owns publication, outer
review and landing. ADR 0013, 0016, 0019, 0029 and 0031 remain unchanged.
