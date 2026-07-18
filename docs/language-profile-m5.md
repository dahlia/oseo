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


Admitted M5 syntax
------------------

M5 admits these forms beyond the frozen M3 and M4 profiles. Each entry names
its deliberate boundary and its evidence:

 -  The `typeof` and `void` unary operators and the `%` remainder operator.
    `typeof` distinguishes `undefined`, `null`, booleans, numbers, strings,
    callable objects, and other objects; reading a binding before
    initialization throws the same catchable completion as any other read,
    and the allocating result string is a declared MIR safepoint. `void`
    evaluates its operand and produces `undefined`. `%` applies primitive
    numeric coercion and IEEE 754 remainder semantics, including negative
    zero, infinite, and `NaN` operands; object operands keep the same
    unsupported object-to-primitive coercion boundary as the existing
    arithmetic operators until generic `ToPrimitive` lands. Native
    differential fixtures, MIR structural tests, and reviewed test262
    cases cover the three operators.
 -  `typeof` applied to a name that does not resolve to a binding is
    rejected with a source-located diagnostic instead of evaluating to
    `"undefined"`. The closed ahead-of-time profile rejects every other
    unresolved reference, and this deviation is explicit rather than a
    silent approximation. The affected test262 case remains classified
    unsupported until an owned decision admits unresolved references.


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
 -  The reviewed harness implements *base.js*, *doneprintHandle.js*,
    *compareArray.js*, and *propertyHelper.js* only. Cases that include
    *asyncHelpers.js* or *promiseHelper.js* stay out of the reviewed subset
    until those includes have reviewed implementations. Owner: the
    standards harness expansion in [*PLAN-M5.md*](../PLAN-M5.md).
 -  The native host fails an executable with an unhandled rejection, as
    the M4 event-loop profile requires, while the upstream test262 host
    contract tolerates one. Cases that deliberately leave a rejection
    unhandled stay out of the reviewed subset until a host-profile
    decision reconciles the two. Owner: the modules and asynchronous
    execution stream.
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
collection forced at every safepoint.

Linux AMD64 and macOS AArch64 execute that same reviewed subset. The canonical
manifest keeps one counted result per upstream path, while
*target-parity.yaml* pins its digest and supported execution targets. A
host-specific run normalizes only the target spelling before comparing the
complete manifest, so any semantic, harness, graph, scheduler, strictness, or
specialization disagreement fails without duplicating compatibility totals.

Module and asynchronous cases execute under the deterministic native
scheduler. Module entries compile through the explicit CLI module goal with
sibling fixtures loaded from the upstream checkout, and their linked graph
is recorded as manifest evidence. Asynchronous cases insert the reviewed
`$DONE` harness and pass only when the completion marker is the final
output line, appears exactly once, and no failure marker was printed.
Module negatives classify by the owned diagnostic phase: an entry parse
rejection is a parse failure, while dependency parse rejections and link
and loader failures are resolution failures observed before any
evaluation.

The reviewed harness deviates from the upstream test262 host contract in
two documented ways. Harness sources are assembled into the compiled
source, so in module cases they become module-scoped bindings instead of
globals; a case whose fixtures need harness globals or whose bindings
collide with harness names stays out of the reviewed subset. The reviewed
`$DONE` prints the bare failure marker because the profile has no generic
string coercion for arbitrary failure values yet.

A newly supported feature moves tests out of `unsupported-profile-feature`
only after every applicable variant executes. A changed upstream revision is
a reviewed manifest change, not an automatic percentage update.


Generated domains
-----------------

M5 measurement work reuses the M4 property infrastructure defined by
[*PLAN-PT.md*](../PLAN-PT.md). New semantic units added during M5 extend the
applicable valid and invalid generators in the same change that admits the
syntax, as required by [*CONTRIBUTING.md*](../CONTRIBUTING.md).
