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
eval call. This node does not repeat that attempt. The two assignment rows need
no host Script attempt: a Script declares globally and cannot add a binding to
a function's declarative record.


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


Evidence
--------

[*dynamic-source-eval-code-assessment.yaml*](./dynamic-source-eval-code-assessment.yaml)
records every path with its group, subject, exclusion audit assessment, source
and observation digests, and reason. G1 rows name the sibling precedent already
under `eval-semantics` or another ADR 0016 source-only assessment; G2 rows name
their replacement.

Six G2 originals use existing reviewed results. The four `export` and
`import` rows and *new.target-arrow.js* have expected-negative witnesses:
*global-code/export.js*, *global-code/import.js* and
*global-code/new.target-arrow.js* reject the same declarations at parse with
SyntaxError. The import witness differs from the eval source only in its
specifier quotes. For these five rows only eval code parsing and the
conversion of an early error into a run-time eval exception stay excluded.
*new.target/value-via-call.js* and *value-via-new.js* pass and compare
`undefined` and the function, the two values *new.target-fn.js* asserts.

Nine G2 originals, *new.target-fn.js* among them, use the inline witness in
*tests/native/fixtures/eval-code-inline-evidence.ts*. It reads each pinned
original, checks its SHA256 and flags, and replaces each direct eval call by
the parenthesized expression of its source, so the same identifier, `this`,
or `new.target` resolution runs in the caller's environment and the
original assertion compares the same value. The builder drops a leading
`"use strict"` directive of the eval source. For
*this-value-func-strict-source.js* and *lex-env-heritage.js* that directive
does not change the asserted `this` or `x`. Each call also has a mutation that
reads the wrong environment, such as the global object an indirect eval would
use; the original's own assertion must reject it with that realm's
Test262Error. *tests/eval-code-inline-evidence.test.ts* runs every original and
mutation in a fresh realm under Node.js and Deno, then natively under both
specialization policies with forced collection.

The exclusion audit gives G1 rows the `eval-semantics` assessment and G2
rows the new `ec-static-eval-code` assessment, which binds the replacement
evidence by digest. G3 rows take the `ec-declarative-lref-deferral`
assessment and named entries in
[*deferrals.yaml*](../m5c-closure/deferrals.yaml). The
`observation-train-b06-b08-b14` assessment held only these 48 rows and is
removed. Ledger owners move through the ledger API: 46 to
`adr:0016-dynamic-source-boundary` and 2 to `deferred`. The umbrella keeps
88 paths. No subset row, tag, observation, or pass count changes, so no
UPDATE is needed.

ADR 0013, 0016, 0019, 0029, and 0031 are unchanged. Root owns publication
and landing.
