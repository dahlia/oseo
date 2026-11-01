Static-specifier import design
==============================

This design-only node records the reviewed post-M5 design of the
build-time-resolvable string-literal `import()` track for exactly 20 paths
at bundle 5 base
`9f21b607aef9399cc2a1f61d382f535af5161a2e`.
The exact selector is
[*static-specifier-import-design.paths.txt*](./static-specifier-import-design.paths.txt).
Its SHA256 is
`85319c5bc53b962c8bddc38546f008c41ea2a3c1d94169009acf1870b2242679`. Per-path
contracts originate in */data/m5c-d17-20261101/static-import/rows.json*; the
family summary is family 8 of
*/data/m5c-d17-20261031/umbrella-residual/REPORT.md*.


Authority and ownership
-----------------------

The maintainer answer
*~/.local/state/oseo-m5c/decisions/answers/20261031T1409-umbrella-residual.md*,
item 3, approved a design review of the static-specifier import track that
ADR 0016 alternative 3 and *PLAN-DYN.md* anticipate. After that review, item
2 of *20261101-remaining-node-decisions.answer.md* in
*~/.local/state/oseo-m5c/decisions/done/* keeps the design and does not
implement the track in M5. Bounded general `eval` or `Function` construction is
approved by neither.

The design is the reviewed post-M5 plan, linked from *PLAN-DYN.md*. Its
ADR 0016 amendment stays Proposed inside the design and is not applied to
ADR 0016, so the DS-1 reopening condition of the 2026-10-28 decision does
not fire and no exclusion audit digest changes. The 20 rows go to
[ADR 0031](../adr/0031-m5-named-deferral.md) deferral with *PLAN-DYN.md* as
`targetMilestone`. Whether the M5 announcement needs a demonstration is
decided separately at the D8 review on 2026-11-10.

Nineteen paths are DS-12 module-loading-and-promises rows. The twentieth,
*test/language/expressions/dynamic-import/usage-from-eval.js*, is a DS-8 row
whose `import()` runs inside direct eval code. It must not be swept into the
import decision without its own eval-context evidence.

The baselines differ. The 19 DS-12 rows record the parse-time `OSEO1001`
rejection `ImportExpression is outside the M1 profile.` The DS-8 row records
the run-time `OSEO1001` rejection of its direct eval call,
`eval compiles source text at run time, which is outside the admitted profile.`,
in *tests/test262/results/language/expressions/67.yaml*. The build never sees
its ImportCall.

The node depends on landed `unsupported-ownership-audit`. The umbrella
`dynamic-source-coverage-remediation` and `m5-exit-audit` depend on it.
Every path keeps its ledger owner `node:dynamic-source-coverage-remediation`
until an ADR 0031 entry defers it, which needs `m5c-deferral-ledger-checker`
first.
This node moves no ledger owner, admits no path, creates no exclusion, and
changes no compiler, runtime, runner, harness, or manifest file. Root owns
UPDATE, outer review, publication, push, and landing.


Deliverables
------------

 -  The design and per-path mapping in
    [*docs/static-specifier-import-design.md*](../static-specifier-import-design.md),
    marked as the reviewed post-M5 plan.
 -  A link from [*PLAN-DYN.md*](../../PLAN-DYN.md) to that plan.
 -  The Proposed ADR 0016 amendment inside the design, unapplied. ADR 0016
    itself is unchanged.
 -  A *PLAN-M5C.md* section stating that the track is deferred and that its
    20 rows go to ADR 0031 deferral.

The earlier [proposal](../dynamic-import-staged-plan.md) of the landed
`dynamic-import-staged-plan` node remains the capability-level plan. This
node refines it for the 20 rows and records where the rows need more than
that proposal.


Checks and review
-----------------

Documentation and graph checks only: `mise run check` behind the capacity
prefix, the graph tests, and the fast non-native repository tests. No native,
full, extended, or test262 gate runs, because nothing that executes changes.
Reviews use the stable scope `static-import-design`: the pre gate with
`opencode-kimi`, then the internal gate with `codex-astra`.
