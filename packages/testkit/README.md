@oseo/testkit
=============

This package compares reference and native observations through injected public
interfaces. It accepts generic MIR rather than a synthetic native module and
does not import private package files or concrete compiler adapters.

`withNativeFixture` keeps generated files alive until its inspection callback
completes. A build, execution, or inspection failure retains the directory and
writes *native-observation.json* with the target, emitted C, complete compiler
request sequence, and every captured process observation.
