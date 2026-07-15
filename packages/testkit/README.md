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
