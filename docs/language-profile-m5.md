M5 language profile and measurement boundary
============================================

Status
------

Implementation status: active. This is the living M5 profile required by
[*PLAN-M5.md*](../PLAN-M5.md). It starts from the frozen
[M3](./language-profile-m3.md) and [M4](./language-profile-m4.md) profiles
and records how each dependency-indexed capability group stands against the
claim boundary frozen in
[ADR 0013](./adr/0013-m5-edition-and-manifest.md). Every M5 checkpoint that
admits or measures behavior updates this document in the same change.

Unlike the frozen M3 and M4 profiles, this document changes throughout M5.
A group's status describes tested current behavior, never intended behavior.


Claim boundary
--------------

The conformance candidate is the ECMA-262 16th edition, ECMAScript 2025,
with the optional-section policy of ADR 0013: Annex B and ECMA-402 are
outside the claim; host hooks, realms, agents, shared memory, `eval`, the
`Function` constructor, and dynamic import are inside it and remain explicit
gaps until owned decisions land. No release uses the conformance label while
a known language gap remains inside this boundary.

The checked-in compatibility manifest under *tests/test262/* is the source
of truth for progress against this boundary. *subset.yaml* pins the suite
revision, supported features, and expected classifications; *results.yaml*
records the reviewed observations. The checked-in manifest implements the
schema frozen by ADR 0013: five classifications with `expected-negative`
covering matched negatives in every phase, execution evidence with the
executed variants and target, reviewed dependency tags, and summaries with
raw, path-group, and dependency totals. Unsupported and harness results
never increase the pass count.


Capability groups
-----------------

Groups derive deterministically from the upstream test262 path: a group is
the first two directory segments under *test/*, such as
`language/module-code` or `built-ins/Promise`. The table names the groups
the M5 measurement work tracks first and the contract that owns each; it
is not exhaustive, because admitted syntax spans further groups such as
`language/literals`. Measured coverage per group lives in the
*results.yaml* summary; a group may have an admitted subset before its
first reviewed test262 cases land.

| Group                | Status  | Owning contract      |
| -------------------- | ------- | -------------------- |
| language/expressions | partial | M3 and M4 profiles   |
| language/statements  | partial | M3 and M4 profiles   |
| language/module-code | partial | M4 profile, ADR 0009 |
| built-ins/Object     | partial | M3 profile, ADR 0008 |
| built-ins/Promise    | partial | M4 profile, ADR 0010 |

“Partial” means the admitted subset in the owning profile document, with
every other form rejected by a source-located diagnostic.


Known gaps inside the claim
---------------------------

Each gap names its owner. This list shrinks as M5 lands semantic units; it
must never shrink by reclassification alone.

 -  `var` declarations, destructuring, spread, default parameters, template
    literals, synchronous arrow functions, classes, generators, symbols,
    big integers, regular expressions, and the remaining expression grammar
    are outside the admitted syntax. Owner: the core expressions and
    bindings stream in [*PLAN-M5.md*](../PLAN-M5.md).
 -  Named error intrinsics such as `TypeError` do not exist. Runtime
    semantic errors are catchable opaque values without ECMAScript error
    identity, and only resource limits and host failures surface as owned
    `OSEO2001` and `OSEO3001` diagnostics. test262 runtime negatives that
    assert an error type are classified unsupported with the
    `runtime-error-types` capability named. Owner: the intrinsics and
    built-in objects stream.
 -  The general iterator protocol, well-known symbols, and the intrinsic
    graph behind standard constructors are unimplemented. `Promise.all` and
    `Promise.race` accept M4 arrays only. Owner: the intrinsics and
    built-in objects stream.
 -  `await` is restricted to the M4 positions; asynchronous generators,
    `for await`, and asynchronous module cycles are unsupported. Owner: the
    functions and executable syntax stream.
 -  `eval`, the `Function` constructor, and dynamic import await the
    ahead-of-time decisions required by [*PLAN-M5.md*](../PLAN-M5.md).
 -  Realm creation beyond the initial realm, agent clusters, and shared
    memory need runtime and harness capabilities that do not exist yet;
    affected tests name the missing `$262` capability.
 -  Large intrinsic tables and built-in families additionally wait for the
    runtime componentization in [*PLAN-RCR.md*](../PLAN-RCR.md) so new
    tables have an owned component to land in.


Measurement workflow
--------------------

`mise run test:test262` executes the reviewed subset and rejects any drift
from the expected classifications. `mise run test262:update` regenerates
*results.yaml* after a reviewed change. Applicable Script cases execute in
every requested strictness mode, and every executed case compares
specialization-disabled and specialization-enabled native observations with
collection forced at every safepoint. The current runner executes
synchronous Script cases only; executing module and asynchronous cases
under the deterministic native scheduler is the harness expansion named as
the second delivery item in [*PLAN-M5.md*](../PLAN-M5.md).

A newly supported feature moves tests out of `unsupported-profile-feature`
only after every applicable variant executes. A changed upstream revision is
a reviewed manifest change, not an automatic percentage update.


Generated domains
-----------------

M5 measurement work reuses the M4 property infrastructure defined by
[*PLAN-PT.md*](../PLAN-PT.md). New semantic units added during M5 extend the
applicable valid and invalid generators in the same change that admits the
syntax, as required by [*CONTRIBUTING.md*](../CONTRIBUTING.md).
