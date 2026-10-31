Dynamic source residual evidence
================================

This bounded child reviews exactly 19 paths at bundle 3 base
`c6c5390aa2cc6889bd6c7afe01e6e0af032eecf1`.
The exact selector is
[*dynamic-source-residual-evidence.paths.txt*](./dynamic-source-residual-evidence.paths.txt).
Its SHA256 is
`3e46997dd37d291fcf321aa94202d56eeb7241bed7216cbcc014f943a61a5da6`. Per-path
contracts originate in */data/m5c-d17-20261031/residual-evidence/rows.json*.


Authority and ownership
-----------------------

Root's D19 decision is
*~/.local/state/oseo-m5c/decisions/auto-decision-umbrella-residual-20261031.md*,
answering *decisions/questions/20261031T1409-umbrella-residual.md*.
The node starts ready/unlanded, depending on landed
`authorized-exclusion-audit`. The umbrella depends on this child.
This graph commit moves no ledger owner and creates no exclusion.
Root owns UPDATE, outer review, publication, push and landing.
ADR 0013/0016/0019 remain unchanged and all inventory paths remain.


Closure routes and obligations
------------------------------

 -  Script completion values (11): use only ADR 0029 finite literal host
    Scripts under DS-21 conditions. Completion must be independent of
    caller-local bindings, this, new.target, arguments and the function var
    environment, or the original call must be at global Script top level.
    Match strictness and provide separate witnesses for every other assertion.
    Observe completion itself, with strict in-program value/type checks and
    independent mutation verdicts, rather than function returns or parsing.
 -  Class/private/static effects (5): exact static/native witnesses retain
    initializer execution, public property reads, absent method errors and
    ordered static initialization. Do not invent private-brand assertions or
    arrow return observations absent from the original source.
 -  Derived constructor error realms (2): repair the observed ordinary
    Construct defect, preserving the original caller-realm errors. Require
    both policies, forced collection, structural and applicable generated
    evidence. If ABI changes, use m5-146; m5-145 belongs to non-blocking-agent.
    Product changes require Root's next bundle UPDATE.
 -  Unexecuted constructor accounting (1): inspect actual assertions and
    construction phases; do not claim that the uncalled inner constructor or
    with statement executes. Close only with faithful reviewed evidence.

Closed paths may move to bounded ADR ownership only after all non-source
assertions have reviewed evidence, with fresh source/observation digests.
Use the ledger parse/derive/serialize API with an in-memory owner map and
canonical update. Every unclosed path keeps umbrella remediation with an
exact per-path reason. No observation is promoted by accounting alone.


Checks and review
-----------------

Graph tests and capacity-wrapped check precede the graph-only commit.
Evidence requires focused native runs through run-gate.py —wait-lock,
focused tests and fast non-native tests; no full or extended gate or UPDATE.
Run m5c-precheck and the internal DeepSeek/Astra review with one stable scope.
Reviewers are read-only and must not run repository-writing tools.
