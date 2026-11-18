Native fixtures and Test262 observations
========================================

For the public API, see the [`@oseo/testkit` README]. The
[gate optimization plan] records the cache and runner design, and the
[Test262 runner notes] cover offloading in the repository runner.

`withNativeFixture()` records the target, emitted C, compiler requests, and
captured process observations in *native-observation.json* when it retains
artifacts after a build, execution, or inspection failure. Failures before
temporary-directory creation, including execution-host validation, have no
artifact directory to retain.

Retained observations and property failures include both normalized host and
target identities so a replay does not silently change environments.

When both injected adapters support it, fixtures share the same host-cached
runtime archive as CLI execution. `runtimeArchiveReuse: "disabled"` retains a
direct rebuild path for a replay that suspects stale cache state. Same-key cold
fixtures serialize archive publication, and an unavailable cache operation
falls back to a temporary rebuild. Failed toolchain identity observations are
not retained, so a recovered toolchain can rejoin archive reuse.

Each fixture uses one captured compiler environment for its identity, key, and
build requests. A fixture whose host cannot capture that environment rebuilds
without archive reuse.

When compiler observation is enabled, the harness removes the runtime's private
counter record from stderr and exposes typed guard, overflow, generic-addition,
allocation, and collection counts beside the ordinary process observation.
Reference comparison therefore remains limited to JavaScript-visible output,
status, and errors.

Test262 observations retain the declared `parse`, `resolution`, or `runtime`
failure phase. The `parse` phase includes static-semantics early errors.
An unavailable observation capability is recorded explicitly and classifies
the case as unsupported rather than manufacturing an expected observation.

One reviewed result aggregates every strictness mode requested by the upstream
case. A positive case passes only when specialization-disabled and
specialization-enabled native execution both succeed with identical output in
every mode.

Cross-package M4 properties use the same retained native-fixture protocol for
generated asynchronous schedules. The repository property runner records an
explicit seed, replay path, size tier, run scale, profile, and domain. Its
asynchronous entry point waits for shrinking and native inspection to finish,
and an interrupted budget is a failure rather than a shortened pass.

[`@oseo/testkit` README]: https://github.com/dahlia/oseo/blob/main/packages/testkit/README.md
[gate optimization plan]: https://github.com/dahlia/oseo/blob/main/PLAN-GATE.md
[Test262 runner notes]: https://github.com/dahlia/oseo/blob/main/docs/test262-runner-offload.md
