Box primitive with binding objects
==================================

Apply ToObject when entering with over Number, Boolean, and String values
before object environment HasBinding. All three observed runtime failures
report TypeError: The in operator requires an object.

Focused observation on base `68b026bb8275b9b7ddd15b9bdd02ef90ef3b123f`,
native target `linux-x86_64-gnu`, found these failures. The original paths
remain unreviewed under observation-batch-28. This node registers the
repair; no product change or successful replacement is claimed.

 -  `test/language/statements/with/12.10-2-1.js`
 -  `test/language/statements/with/12.10-2-2.js`
 -  `test/language/statements/with/12.10-2-3.js`

Raw source hashes, runner scheduling and results are in
[Raw observations](/data/m5c-b23-b28-b29-b32-20261029/task_96812c4ba689/ctx_b3822e0f35ef/all-observations.json).
The first segment is `observations/`; the continuation is `continuation/`.
Repair and re-observe these exact originals before closing this dependency.
