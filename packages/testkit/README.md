@oseo/testkit
=============

This package compares reference and native observations through injected public
interfaces. It accepts MIR rather than a synthetic native module and
does not import private package files or concrete compiler adapters.

`withNativeFixture` keeps generated files alive until its inspection callback
completes. A build, execution, or inspection failure retains the directory and
writes *native-observation.json* with the target, emitted C, complete compiler
request sequence, and every captured process observation.

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
