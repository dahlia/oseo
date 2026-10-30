Unhandled rejection observation: proposed host policy
=====================================================

This node is held for a maintainer decision. Root directed a design-only
commit on 2026-10-31 after the worker identified the reserved host-profile
decision in the M5 language profile. No runtime behavior, host capability,
ADR, subset entry, result record, or classification changes here.

The pending
[maintainer question](/home/dahlia/.local/state/oseo-m5c/decisions/questions/20261031T0850-unhandled-rejection-host-policy.md)
records the requested choice. Root owns the decision response, implementation
restart, D3, UPDATE, outer review, candidate gates, and publication.


Current evidence
----------------

At base `1f3ade138ea7cbee80b2d62940e8f497db2bc1a2`, the closure ledger
assigns exactly 26 reviewed paths to this node. Every corresponding
checked-in result is `unsupported-profile-feature` with capability
`unhandled-rejection-policy`. The path-by-path partition audit is saved at
*/data/m5c-d17-20261031/unhandled-rejection-observation/ownership-audit.json*.
These are checked-in observations; no fresh native execution or test262
UPDATE has been run for this design-only change.

Source inspection confirms the boundary. In
*packages/runtime-c/native/runtime\_promise.c*,
`oseo_rejection_checkpoint` drains the pending-report list, marks rejected
unhandled promises reported, increments `unhandled_rejection_count`, and
returns the first reason as a throw with its original source location.
*tools/test262.ts* maps its exact diagnostic to the named unsupported
capability. This is an implemented fatal policy, not a missing Promise
operation inferred from a path name.

[ADR 0010](../adr/0010-promise-jobs.md) defines runtime-owned rejection
tracking after queue drainage. [ADR 0012](../adr/0012-native-event-loop.md)
defines the host reporting boundary. The M5 language profile's standards
harness gaps explicitly reserve reconciling the fatal native policy with
the tolerant test262 host contract for a separate host-profile decision.
[ADR 0026](../adr/0026-agent-clusters-and-shared-memory.md) defines the
agent host; its thread, liveness, and source-template rules stay intact.
The claim, source-compilation, and exclusion boundaries of ADRs
[0013](../adr/0013-m5-edition-and-manifest.md),
[0016](../adr/0016-dynamic-source-boundary.md), and
[0019](../adr/0019-m5-claim-closure.md) stay intact.


Proposed policy boundary
------------------------

Prefer an explicit test262 rejection policy, selected by the reviewed
runner and carried through compilation to each execution context. The
exact option name and ABI field need approval before implementation. The
default is the current fatal policy. The observation policy acknowledges
unhandled rejections at the same checkpoints and permits execution to
continue after those reports.

Keep this choice independent of `--test262-host`. Today that flag installs
`$262` capabilities and enables ahead-of-time agent and host-script
compilation. `needsTest262Host` selects it only for sources that require
those capabilities, and the runner uses that selection to distinguish
agent-host execution from deterministic scheduling. Requiring every case
to use the flag merely to tolerate rejections would install unrelated
bindings and change scheduler selection. A separate policy can cover
ordinary Script cases, modules, fragment execution, and actual agent-host
cases without broadening their host bindings or source admission.

The alternative is to extend `--test262-host` with the tolerant policy.
That would still need an independent way to preserve ordinary test262
binding availability and scheduler metadata. Root and the maintainer must
choose between these boundaries; this note authorizes neither.

Ordinary executables retain fatal unhandled-rejection reporting, including
the current source location, diagnostic, reason identity, and nonzero
exit. Uncaught synchronous throws, thrown timer and finalization
callbacks, host diagnostics, and rejected module entry evaluation remain
failures under both policies. Tolerating a promise report must not convert
a runtime negative into an expected negative: it is not an uncaught
JavaScript throw. Missing or failed `$DONE` completion remains a harness
failure. Parse and resolution diagnostics retain their classifications.

Preserve pending-report, reported, and handled state transitions, the
rejection counts, late-handler accounting, FIFO promise jobs, and rooted
pending lists. Do not bypass queue drainage or skip the checkpoint.
Apply tolerance at the host report decision, without changing an internal
await's existing throw-completion behavior. Audit every checkpoint caller
before implementation so a policy cannot swallow a callback throw or an
iterator operation's abrupt completion. Agent contexts must receive the
selected policy without transferring heap values between agents.

No optimization depends on this choice. Both specialization policies must
observe the same Promise settlements, handler order, completion markers,
and program output. Observation does not make outstanding rejected
promises keep the event loop alive.


Owned classification proposals
------------------------------

All rows below currently have `unsupported-profile-feature` with
`unhandled-rejection-policy`. The proposed classification for each is
`pass` *if* execution under an approved observation policy completes its
assertions and completion contract in every required variant. These are
target classifications, not fresh observations or authorized manifest
edits. A later assertion failure, missing completion, or another unsupported
capability must retain the classification the runner actually observes.
Root's full UPDATE determines every resulting record.

| Exact owned upstream path                                                               | Proposed classification, unobserved    |
| --------------------------------------------------------------------------------------- | -------------------------------------- |
| `test/built-ins/Promise/all/capability-resolve-throws-no-close.js`                      | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/all/invoke-resolve-error-close.js`                              | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/all/invoke-resolve-get-once-multiple-calls.js`                  | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/all/invoke-then-error-close.js`                                 | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/all/invoke-then-get-error-close.js`                             | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/all/iter-next-val-err-no-close.js`                              | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/all/iter-step-err-no-close.js`                                  | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/allSettled/capability-resolve-throws-no-close.js`               | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/allSettled/invoke-resolve-error-close.js`                       | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/allSettled/invoke-then-error-close.js`                          | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/allSettled/invoke-then-get-error-close.js`                      | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/allSettled/iter-next-val-err-no-close.js`                       | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/allSettled/iter-step-err-no-close.js`                           | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/any/ctx-ctor.js`                                                | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/any/returns-promise.js`                                         | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/prototype/finally/subclass-species-constructor-reject-count.js` | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/prototype/then/rxn-handler-fulfilled-next-abrupt.js`            | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/prototype/then/rxn-handler-rejected-next-abrupt.js`             | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/race/invoke-resolve-error-close.js`                             | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/race/invoke-then-error-close.js`                                | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/race/invoke-then-get-error-close.js`                            | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/race/iter-next-val-err-no-close.js`                             | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/race/iter-step-err-no-close.js`                                 | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/reject/ctx-ctor.js`                                             | `pass`, conditional on fresh execution |
| `test/built-ins/Promise/resolve/arg-uniq-ctor.js`                                       | `pass`, conditional on fresh execution |
| `test/language/expressions/optional-chaining/member-expression-async-identifier.js`     | `pass`, conditional on fresh execution |


Acceptance after a decision
---------------------------

Add small runtime tests for multiple unhandled reasons, primitive and
object reasons, same-checkpoint handling, late handling, reporting only
once, and forced collection. Exercise an unhandled rejection followed by
a later timer and a later handled rejection. Native cases must also prove
that ordinary executables still fail and that tolerant execution still
reports callback throws and rejected entry modules. Run both
specialization policies on Zig and host-cc, including forced collection.
Reserve a property seed block or obtain Root's slot before adding any
generated domain; generate schedules against an independent tracking and
completion model. No seed or generator is changed by this note.

Cover runner policy forwarding through direct CLI and fragment execution,
module and async scheduling, strictness variants, negative results, and
`$DONE` failures. Keep the named unsupported diagnostic until approved
observations justify changing it. Run local check, focused package,
native and property checks, fast non-native repository tests, and the
required precheck and internal review before requesting D3 at the exact
implementation commit. Root runs UPDATE and handles all changed rows.
The current design-only hold has no implementation U or result R and
claims no completed semantic or review gate.
