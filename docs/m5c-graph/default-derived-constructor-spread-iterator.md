Forward default derived constructor arguments directly
======================================================

Default derived constructors must forward their argument list without
consulting an overridden Array iterator. The observed runtime Test262Error
reports @@iterator invoked.

Focused observation on base `68b026bb8275b9b7ddd15b9bdd02ef90ef3b123f`,
native target `linux-x86_64-gnu`, found these failures. The original paths
remain unreviewed under observation-batch-23. This node registers the
repair; no product change or successful replacement is claimed.

 -  [*default-constructor-spread-override.js*]

Raw source hashes, runner scheduling and results are in
[Raw observations](/data/m5c-b23-b28-b29-b32-20261029/task_96812c4ba689/ctx_b3822e0f35ef/all-observations.json).
The first segment is `observations/`; the continuation is `continuation/`.
Repair and re-observe these exact originals before closing this dependency.

[*default-constructor-spread-override.js*]: https://github.com/tc39/test262/blob/f2d1435644797268dca1f7988cad5a4e89ccd8d2/test/language/statements/class/subclass/default-constructor-spread-override.js
