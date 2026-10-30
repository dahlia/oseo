Forward default derived constructor arguments directly
======================================================

Default derived constructors must forward their argument list without
consulting an overridden Array iterator. The observed runtime Test262Error
reports @@iterator invoked.

Focused observation on base `68b026bb8275b9b7ddd15b9bdd02ef90ef3b123f`,
native target `linux-x86_64-gnu`, found these failures. The original paths
remain unreviewed under observation-batch-23. This node registers the
repair. At that observation, no product change or successful replacement
was claimed.

 -  [*default-constructor-spread-override.js*]

Raw source hashes, runner scheduling and results are in
[Raw observations](/data/m5c-b23-b28-b29-b32-20261029/task_96812c4ba689/ctx_b3822e0f35ef/all-observations.json).
The first segment is `observations/`; the continuation is `continuation/`.
Repair and re-observe these exact originals before closing this dependency.

[*default-constructor-spread-override.js*]: https://github.com/tc39/test262/blob/f2d1435644797268dca1f7988cad5a4e89ccd8d2/test/language/statements/class/subclass/default-constructor-spread-override.js


Implementation on the D17 base
------------------------------

The owned original is *default-constructor-spread-override.js* under
`test/language/statements/class/subclass/`.
On base `1f3ade138ea7cbee80b2d62940e8f497db2bc1a2` it is absent from
`tests/test262/results/` and the reviewed subset. The closure ledger keeps it
unreviewed under `node:observation-batch-23`; the historical failure above is
an observation outside that manifest.

The frontend had synthesized a rest parameter and `super(...args)`.
That source-equivalent expansion incorrectly reads the Array iterator.
Default constructors now carry an internal forwarding marker through
syntax, HIR and MIR. The C backend passes the running function's incoming
argument count and values directly to super construction. Explicit source
spread retains iterator evaluation. The existing construction path keeps
parent lookup, `new.target`, derived return checks, field initialization,
and abrupt completions.

The structural regression lives in the Babel frontend tests. The
`class-default-forwarding` native fixture covers a throwing iterator
getter, a null iterator, explicit-spread control, zero and extra arguments,
object identity, subclass chains, fields and private fields, mutable
heritage, replacement objects, throwing parents, and invalid parents.
It belongs to both forced-collection lists. The existing class property
file adds seed `0x60000b04` in its reserved block: generated argument lists
with a throwing iterator getter or method compare an independent count,
sum, field and new-target model with Node.js, Deno and both native policies.
Shrinking retains the constructor chain and iterator override. Root assigned
slot 4 because the concurrent Unicode-class candidate reserves slot 3.

Root owns D3, the full UPDATE and any later admission of the original.
No subset entry, manifest result, exclusion boundary or landed state is
changed by this implementation.
