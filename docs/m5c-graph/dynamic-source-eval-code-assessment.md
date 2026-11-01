Dynamic source eval code assessment
===================================

This child of `dynamic-source-coverage-remediation` gives each of 48
umbrella paths one reviewed outcome. The paths test eval code itself: its
variable and lexical environments, `this` and `new.target`, global
environment record effects, and module declarations inside eval source.
Two assignment rows, *S11.13.1\_A6\_T1.js* and *S11.13.1\_A6\_T2.js*, use a
direct eval var declaration to add a binding while the right-hand side
runs. The exact selector is
[*dynamic-source-eval-code-assessment.paths.txt*](./dynamic-source-eval-code-assessment.paths.txt),
SHA256 `be93020453d77af5bd6e7eca8b949f344f6a29d5235e3d641ffd4d0a2b1be143`.

Every path is `unsupported-profile-feature` with the umbrella owner and the
`observation-train-b06-b08-b14` exclusion audit assessment. Forty-six of
them were already tried by
[`dynamic-source-host-script-evidence`](./dynamic-source-host-script-evidence.md),
whose kept table gives the reason a literal host Script cannot replace each
eval call. This node does not repeat that attempt.


Outcomes
--------

Root's ruling of 2026-11-02 on this node's disposition question fixes
three groups.

| Group | Paths | Outcome                                                      |
| ----- | ----: | ------------------------------------------------------------ |
| G1    |    32 | ADR 0016 `eval-semantics` exclusion, no replacement evidence |
| G2    |    14 | ADR 0016 exclusion with static replacement evidence          |
| G3    |     2 | ADR 0031 deferral, `run-time-source` family, *PLAN-DYN.md*   |

G1 paths assert only eval environment selection or eval declaration
instantiation. Their siblings, such as
*var-env-lower-lex-strict-caller.js* and the indirect
_var-env-lower-lex-\*.js_ rows, already have the `eval-semantics` owner,
and ADR 0031 admits no deferral where an accepted ADR authorizes the
exclusion. A G1 path that would need the ADR 0016 surface wording widened
goes back to Root.

G2 paths have a non-source subject that static code observes with the same
operation and the same compared values. Only eval context selection or
the conversion of an early error into a run-time eval exception remains.

G3 paths assert ordinary assignment semantics: `PutValue` writes through
the reference resolved before the right-hand side. A new binding in a
declarative environment record during that evaluation exists only through
a direct eval var declaration, which the maintainer did not approve for M5.

The per-path table, replacement evidence, and ledger moves are added with
the evidence commit. ADR 0013, 0016, 0019, 0029, and 0031 are unchanged.
Root owns the UPDATE slot, outer review, publication, and landing.
