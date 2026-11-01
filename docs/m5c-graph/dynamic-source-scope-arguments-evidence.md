Dynamic source scope and eval arguments evidence
================================================

This bounded child of `dynamic-source-coverage-remediation` gives exactly 24
umbrella-owned paths one outcome each, at base
`bc8e3a93ed3b6aa8daac70d08fd146f202755f99`. The exact selector is
[*dynamic-source-scope-arguments-evidence.paths.txt*](./dynamic-source-scope-arguments-evidence.paths.txt).
Its SHA256 is
`54903b18184f53cb5b39d11a07358495b5d7c573922ed2c6e45e0107cc140b24`.

| Exclusion audit assessment        |  Paths |
| --------------------------------- | -----: |
| `observation-train-b26a-b26b-b27` |     18 |
| `ds9-eval-arguments-mixed`        |      6 |
| **Total**                         | **24** |

The 18 scope paths are every unsupported row of the
`observation-train-b26a-b26b-b27` assessment; a bundle 4 UPDATE promoted its
19th row, *function/S13.2.2\_A13.js*. They are the _scope-\*-var-open_,
_scope-\*-var-close_ and _scope-\*-var-none_ rows under *statements/for/*,
*function/*, *generators/* and *switch/*, the two *scope-body-lex-distinct*
and two *eval-var-scope-syntax-err* rows, *function/S13.2.2\_A14.js* and
*variable/12.2.1-11.js*. The six ds9 rows are the arrow cells that
[*dynamic-source-eval-arguments-assessment.md*](./dynamic-source-eval-arguments-assessment.md)
kept with the umbrella because each also asserts an ordinary body binding named
`arguments`.


Authority and ownership
-----------------------

The routes come from Root's classification of the umbrella's rows. It found
that the ds9 cells' non-source contracts are statically witnessable and that
no evidence attempt had been recorded for the scope rows. ADR 0031 therefore
did not yet admit deferring either group. This node is that evidence attempt.

The node starts ready/unlanded and depends on landed
`unsupported-ownership-audit`. The umbrella and `m5-exit-audit` depend on this
child. This graph commit moves no ledger owner and creates no exclusion or
deferral. Root owns UPDATE, outer review, publication, push and landing.
ADR 0013, 0016, 0019 and 0031 remain unchanged, and all inventory paths
remain.


Closure routes and obligations
------------------------------

 -  A path closes under ADR 0016 only when a static witness observes the same
    operation and compares the same values as its core assertion. The witness
    is an existing passing static test262 path or a new native test that runs
    under both specialization policies with forced collection and agrees with
    the Node.js and Deno Script references.
 -  A path is deferred under ADR 0031, in the `run-time-source` family with
    target *PLAN-DYN.md*, only when its asserted contract is observable solely
    through a binding that direct eval creates. The per-path reason must say
    why neither a static nor a literal host Script witness reproduces it, in
    the same terms as the three deferred *scope-head-var-none* and
    *scope-catch-param-var-none* rows.
 -  A path whose only subject is EvalDeclarationInstantiation has no
    non-source contract to witness and lies on the ADR 0016 surface. With
    Root's approval it closes there without replacement evidence, like the
    `ds9-eval-arguments-only` cells, naming the DS-9 cell it matches.
 -  A path that needs an engine fix, or whose subject may lie on the ADR 0016
    exclusion surface, goes back to Root with its evidence.

Closed paths move to `adr:0016-dynamic-source-boundary` and deferred paths
to `deferred` through the ledger parse and serialize API, with fresh source
and observation digests in *exclusion-audit.yaml* and *deferrals.yaml*. No
observation is promoted, and the subset and results do not change, so no
UPDATE is needed.


Outcomes
--------

The per-path record is
[*dynamic-source-scope-arguments-assessment.yaml*](./dynamic-source-scope-arguments-assessment.yaml),
with each path's source and observation digests.

All six ds9 arrow cells close under ADR 0016. The witness for each is a
fixture in *tests/native/fixtures/scope-arguments-evidence.ts*, run by
*tests/scope-arguments-native.test.ts*. It keeps the original arrow with a
parameter default, its function-valued, lexical or var body binding named
`arguments`, the counter and the `globalThis.arguments` check, and drops only
the eval. In the three cells that call `q()`, the value `"param"` comes from an
enclosing arrow's parameter. The eval-created binding lands in the function
environment that encloses the parameter environment, so both bindings lie
outside the parameter and body environments of `f`, and `q()` must skip the
body binding to reach either one. The test checks that every original
assertion appears in its witness, that a closure created in the body fails
the `q()` check, and that Node.js, Deno and native code under both
specialization policies with forced collection all print the same result.

Six scope rows close under ADR 0016 in the `scope-eval-declaration-only`
assessment, without replacement evidence. *variable/12.2.1-11.js* asserts only
that eval code may declare `var arguments`, and *function/S13.2.2\_A14.js*
calls only a function that eval code declared. The function and generator
*scope-body-lex-distinct.js* and *eval-var-scope-syntax-err.js* rows assert the
SyntaxError that EvalDeclarationInstantiation raises when an eval var collides
with a lexical body binding or a parameter. None has a non-source subject; each
row of the assessment names the DS-9 cell with the same shape, which ADR 0016
already owns.

The other 12 scope rows are deferred under ADR 0031. Four probe the for and
switch statements, which create no variable environment of their own, and
eight probe the parameter list, whose closures see a var that eval declares in
any initializer. Only a declaration made while the environment is live shows
either structure. A static var is hoisted at parse time into the environment
the test expects either way, or lives in a body environment that parameter
closures cannot see, and assignment creates no binding. A literal host Script
is a separate Script evaluated as a whole, so it cannot declare a binding from
inside a for head, switch expression or parameter list, even where the
statement itself runs at global top level. *docs/m5c-closure/deferrals.yaml*
gives each row's remaining contract and reason.


Checks and review
-----------------

The graph tests and the capacity-wrapped `mise run check` run before each
commit, with `mise run check:m5c-deferrals` and the focused native witness
test for the evidence commit. No full or extended gate runs. Review is
scoped to `scope-assessment`: the pre gate with `opencode-kimi` once, then
the internal gate with `codex-astra` until clean.
