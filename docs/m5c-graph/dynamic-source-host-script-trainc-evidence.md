Dynamic source host Script train C evidence
===========================================

This bounded child reviews exactly 98 train C paths at bundle 5 base
`9f21b607aef9399cc2a1f61d382f535af5161a2e`. The exact selector is
[*dynamic-source-host-script-trainc-evidence.paths.txt*](./dynamic-source-host-script-trainc-evidence.paths.txt).
Its SHA256 is
`44886cc71f1d4a93786ae64b35842fad68ef24fb75dbfe7d0db21c466215a387`.

Per-path contracts originate in
*/data/m5c-d17-20261101/host-script-trainc/rows.json*; the routing analysis is
*/data/m5c-d17-20261101/trainc-packet/REPORT.md*.

| Family                                |  Paths |
| ------------------------------------- | -----: |
| `script-completion-values`            |     62 |
| `eval-syntax-errors`                  |     34 |
| `binding-introduction-and-references` |      1 |
| `eval-binding-instantiation`          |      1 |
| **Total**                             | **98** |


Authority and ownership
-----------------------

The maintainer decision is
*~/.local/state/oseo-m5c/decisions/answers/20261031T1409-umbrella-residual.md*.
Item 1 extends the DS-21 finite literal host Script replacement evidence under
the same conditions: the result is independent of the caller environment,
strictness matches and the error phase matches. A path is accounted only after
review shows that every non-source subject is covered. Item 3 approves no
general eval or Function construction.

The node starts ready/unlanded, depending on landed
`unsupported-ownership-audit`. The umbrella and `m5-exit-audit` depend on this
child. This graph commit moves no ledger owner and creates no exclusion. Root
owns UPDATE, outer review, publication, push and landing. ADR 0013, 0016, 0019
and 0029 remain unchanged and all inventory paths remain.


Closure routes and obligations
------------------------------

 -  Every eval call site is replaced by a literal ADR 0029 host Script known at
    build time, keeping every original consumer of its result.
 -  Direct eval closes only in these cases. First, the call is at global Script
    top level, so the caller context is the global one. Second, strictness is
    reproduced by a prepended directive as in DS-21, and the eval source reads
    no caller-local binding, `this`, `new.target`, `arguments` or function var
    environment. A hashbang row whose strict variant cannot carry a directive
    stays with the umbrella. Module-caller and arrow/function/method-context
    direct rows stay.
 -  Script completion values (62): observe completion itself with strict
    in-program value and type checks, under both caller strictness variants the
    test runs. Nested evals keep both literal calls. Strict host Script
    declarations that persist globally where strict eval would not are recorded
    as unobserved and isolated in fresh realms.
 -  Eval syntax errors (34): each early error must be raised before declaration
    instantiation, with exact SyntaxError identity in the caller's realm and
    proof that the statement after the eval was skipped. Function-caller rows
    need a per-row statement that no caller-local state is reachable.
    Acceptance rows prove the source completes.
 -  The global binding row (*S12.2\_A5*) and the escaped global function name
    row (*S13\_A14\_T1*) are global Script top-level calls.

Every witness runs under both specialization policies with forced collection.
Each has a mutation whose verdict does not reuse the comparator under test.
Closed paths move to `adr:0016-dynamic-source-boundary` only through the ledger
parse/derive/serialize API with fresh source and observation digests. Every
unclosed path keeps umbrella remediation with an exact per-path reason. No
observation is promoted by accounting alone.


Checks and review
-----------------

Graph tests and the capacity-wrapped check run before the graph-only commit.
Evidence requires focused native runs through *run-gate.py* `--wait-lock`,
focused tests and fast non-native tests; no full or extended gate or UPDATE.
Review is scoped to `host-script-trainc`. It uses the D25 pre gate with
`opencode-kimi`, then the internal gate with `codex-astra`. Reviewers are
read-only.


Evidence candidate
------------------

The per-path assessment
[*dynamic-source-host-script-trainc-evidence.assessment.md*](./dynamic-source-host-script-trainc-evidence.assessment.md)
proposes 98 bounded ADR 0016 closures under the exclusion audit assessment
`host-script-trainc-completion`: 62 completion paths, 34 eval syntax error
paths, *variable/S12.2\_A5.js*, and *function/S13\_A14\_T1.js*. No path of this
selector stays with the umbrella.

All 98 source and normalized observation digests match fresh inputs. No subset
row, tag, observed classification, or pass count changes.

The fixtures read each pinned original and replace only its literal eval call
expressions. The source test re-derives those offsets with Babel. Each original
therefore keeps every assertion.

Mutations select a wrong completion or remove an early error at run time, so
each original variant compiles to one finite literal program. Groups of three
originals bound persistent realm roots under forced collection.

The candidate adds tests and fixtures only. It changes no product package,
runtime ABI, ADR, or harness file. *tests/native.ts* is unchanged, because the
four *tests/host-script-trainc-evidence-N.test.ts* pieces already run every
fixture once under both policies with forced collection.

Raw checks and review packets are retained under
*/data/m5c-d17-20261101/host-script-trainc/run/*. These focused witnesses do
not regenerate the original unsupported observations.

The tag self-audit found no dependency tag changes. Every original rejected
source keeps its `dynamic-source` prerequisite, and no outside-scope
observation moves.
