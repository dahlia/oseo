Static-specifier import design
==============================

This design-only node reviews the build-time-resolvable string-literal
`import()` track for exactly 20 paths at bundle 5 base
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
item 3, selects choice B: a design review of the static-specifier import
track that ADR 0016 alternative 3 and *PLAN-DYN.md* anticipate. Acceptance
requires an ADR 0016 amendment and a reviewed plan first. The same item does
not approve bounded general `eval` or `Function` construction.

Nineteen paths are DS-12 module-loading-and-promises rows. The twentieth,
*test/language/expressions/dynamic-import/usage-from-eval.js*, is a DS-8 row
whose `import()` runs inside direct eval code. It must not be swept into the
import decision without its own eval-context evidence.

The node starts ready and unlanded, depending on landed
`unsupported-ownership-audit`. The umbrella
`dynamic-source-coverage-remediation` and `m5-exit-audit` depend on it.
Every path keeps its ledger owner `node:dynamic-source-coverage-remediation`.
This node moves no ledger owner, admits no path, creates no exclusion, and
changes no compiler, runtime, runner, harness, or manifest file. Root owns
UPDATE, outer review, publication, push, and landing.


Deliverables
------------

 -  The design and per-path mapping in
    [*docs/static-specifier-import-design.md*](../static-specifier-import-design.md).
 -  A proposed ADR 0016 amendment, with status Proposed, inside that design.
    ADR 0016 itself is unchanged: the exclusion audit binds its text by
    digest, so Root applies the amendment with the audit update only after
    the maintainer accepts it.
 -  A *PLAN-M5C.md* section that schedules the track's implementation and
    admission nodes only after acceptance.

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
