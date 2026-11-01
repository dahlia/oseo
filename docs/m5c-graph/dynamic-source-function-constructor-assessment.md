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

Each path takes exactly one outcome, as Root ruled on 2026-11-02:

 -  Closed under ADR 0016. Either a faithful witness observes the same
    operation and compares the same values as every non-source assertion,
    or no non-source assertion remains and the path fits an existing ADR
    0016 audit surface (`eval-semantics` or `dynamic-construction`) with a
    named sibling precedent. The surface is never widened.
 -  Deferred under ADR 0031 in the `run-time-source` family, only when
    run-time source compilation alone observes the contract and no ADR
    0016 assessment already excludes it.
 -  Anything else goes back to Root before any ownership change.

[*dynamic-source-function-constructor-assessment.yaml*](./dynamic-source-function-constructor-assessment.yaml)
records each path's outcome, witness or precedent, and source and observation
digests. Deferred entries are in
[*docs/m5c-closure/deferrals.yaml*](../m5c-closure/deferrals.yaml). No subset
row, dependency tag or observation changes, and no path counts as a pass.


Result
------

| Outcome                                                        |  Paths |
| -------------------------------------------------------------- | -----: |
| Closed under ADR 0016 with a faithful witness                  |      4 |
| Closed under ADR 0016, source handling only, sibling precedent |      9 |
| Deferred: Function argument conversion                         |     25 |
| Deferred: Function and GeneratorFunction subclass construction |     10 |
| Deferred: strict no-newline hashbang                           |      1 |
| **Total**                                                      | **49** |

The four witnessed closures are *S15.3.2.1\_A2\_T6.js*, whose Function call
receives only String values, *super-prop-method.js*,
*tco-non-eval-function-dynamic.js* and *scope-var-open.js*. Three of the
witnesses are native fixtures in
*tests/native/fixtures/function-constructor-evidence.ts*. Each keeps every
byte of the pinned original after its frontmatter except the one
source-compiling call: a strict parameter-string check with a static
function, a direct `super.test262` read in the same method, or a literal
global host Script of the same eval source. Every mutation must throw the
realm's Test262Error. *tests/function-constructor-evidence.test.ts* compares
Node.js and Deno references with native execution under both specialization
policies with forced collection. The fourth witness is the passing
*tco-non-eval-function.js*, which makes the same tail call through a static
`var eval = f`.

The nine source-only closures are *built-ins/Function/instance-name.js* and
*12.10.1-5-s.js* under `dynamic-construction`, and the seven direct eval
`super` early-error rows under `eval-semantics`. The passing
*statements/function/name.js* observes the descriptor flags of
*instance-name.js*; its `'anonymous'` value is the CreateDynamicFunction
result.

The 25 conversion rows pass a non-String parameter or body to Function.
Only CreateDynamicFunction converts them, the runtime rejects Function
before any conversion, and the maintainer answer names that conversion as
a contract to evidence or defer, so the `dynamic-construction` exclusion
does not reach them. The ten subclass rows reach the source-compiling
constructor through `super()`; the ReferenceError half of the two
*super-must-be-called.js* rows is observed by the passing
*Array/super-must-be-called.js*. The strict variant of the hashbang probe
cannot be a host Script, because no directive can precede `#!`.


Ownership
---------

The node starts ready and unlanded, depending on the landed
`unsupported-ownership-audit`. The umbrella and `m5-exit-audit` depend on
it. The 49 ledger owners move with the assessment. Root owns publication, outer
review and landing. ADR 0013, 0016, 0019, 0029 and 0031 remain unchanged.
