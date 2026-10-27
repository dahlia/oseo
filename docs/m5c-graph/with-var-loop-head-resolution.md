Resolve var loop heads through with environments
================================================

Resolves var loop heads and array-pattern identifier leaves inside with
statements through the with object environment in the order ECMA-262 specifies,
on the ordinary and host targets.

This ready, unlanded node owns no test262 path yet. It depends on
`unsupported-ownership-audit` and is an `m5-exit-audit` prerequisite.

The retained repro and raw files are external evidence from the host lane:

| Evidence                                      | Pointer                                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Repro, source diagnosis and stdout comparison | /data/m5c-host-script-bindings-20261027/claude-native/diag-with02/README.md                        |
| Raw stdout, stderr and gate metadata          | /data/m5c-host-script-bindings-20261027/claude-native/diag-with02/diag-with02.{stdout,stderr,json} |

The combined with-hit case prints `g 6 z undefined` in Node and Deno,
while both native targets print `g 6 0 string`. The all-miss host Script
repro prints `1 3` natively against Node's `3 0`. These are stdout
discrepancies, not compiler diagnostics. Preserve the ordinary and host
target contracts, including array-pattern identifier leaves.
