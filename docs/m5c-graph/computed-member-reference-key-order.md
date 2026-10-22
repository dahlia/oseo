Computed member Reference key order
===================================

This record supports the graph node `computed-member-reference-key-order`.
It separates four kinds of statement: the fixed ECMA-262 2025 contract, the
actual observations that opened the node, known nonconformance on `main`
that rests on source reading only, and the evidence a future repair must
supply. It uses test262 revision `f2d1435644797268dca1f7988cad5a4e89ccd8d2`
and main `faa47159`. Nothing here is a test262 observation of the repair,
and no path is excluded, removed, or retagged.


Fixed contract
--------------

The pinned edition is ECMA-262 16th edition, ECMAScript 2025 (ADR 0013).
The rendered text at <https://262.ecma-international.org/16.0/> has SHA256
`6a28f9423133ed7b7c59a40baf620c2740f12f0bc9c251042f2a85b9cc5ed713`. Its
algorithm steps for the clauses below match the ecmarkup source of the same
edition. A computed member Reference behaves as follows:

 -  13.3.2.1, 13.3.3, 13.3.7.1, and 13.3.9.2 evaluate the base, then the key
    expression and its GetValue. They store the raw key value as
    `[[ReferencedName]]` without calling ToPropertyKey.
 -  6.2.5.5 GetValue calls ToObject on the base first (step 3.a), so a null
    or undefined base throws `TypeError`. Only then does it convert a name
    that is not yet a property key (step 3.c) and store the result in the
    Reference.
 -  6.2.5.6 PutValue also calls ToObject first (step 3.a) and converts only
    a name that is still not a property key (step 3.c). A Reference already
    read by GetValue therefore reuses its stored key.
 -  13.15.2 simple assignment evaluates the right operand before PutValue,
    so the key of `a[b] = c` is converted after `c`, as the 13.3.3 note
    states. Logical assignment calls GetValue before the right operand and
    calls PutValue only when the right operand runs. Compound assignment and
    the 13.4 update expressions call GetValue and then PutValue on the same
    Reference.
 -  An optional chain whose base is null or undefined short-circuits under
    13.3.9.1 before any key evaluation or conversion.

The landed compound repair implements the base check as an assignment-target
RequireObjectCoercible check that keeps a primitive base as the receiver,
as *PLAN-M5.md* describes. Node.js and Deno convert an arithmetic
member key a second time before the write; *PLAN-M5.md* records that as a
labeled reference divergence, not an oracle.


Actual observations
-------------------

The batch 14 focused first observation ran on 2026-10-22 at 23:27 UTC on
main `faa47159` under the repository runner's `executeTest262Case`, targeting
`linux-x86_64-gnu`. It produced four `semantic-failure` results. Each was
decided by its first scheduled variant (Script, non-strict, specialization
disabled), and no other variant of these paths ran. These four subjects
remain unreviewed under `node:observation-batch-14`, which admits them only
from its own later observation.

| Path                                                                                              | Source SHA256                                                      | Observed                                                         |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| *test/language/expressions/member-expression/computed-reference-null-or-undefined.js*             | `816dbd1ea74547f1466a70de2b611aa27a1e06f41179144e4d7c2ea722772645` | exit 1, `OSEO2001` `Test262Error` at assembled line 50, column 7 |
| *test/language/expressions/logical-assignment/lgcl-and-assignment-operator-lhs-before-rhs.js*     | `39a0a3482cca7b4605e8f691044c1e3fc6d1a87c430fc345d05025c6651ffee0` | same                                                             |
| *test/language/expressions/logical-assignment/lgcl-nullish-assignment-operator-lhs-before-rhs.js* | `08417d9b67db9872ce99247068a46f732e6f11043f3640e55afeb3533bdc17c0` | same                                                             |
| *test/language/expressions/logical-assignment/lgcl-or-assignment-operator-lhs-before-rhs.js*      | `3aedfa4fb22a5aca46fee0a691e7730b5c5d4039cf199e2769bac2e09ee74e8a` | same                                                             |

Assembled line 50 is line 50 of the reviewed
*tests/test262/harness/base.js*. That line is the `assert.throws` branch
taken when the thrown object has a different constructor than expected.
Reassembling the harness with each upstream body reproduces the recorded
assembled-source digest of each attempt. The runner does not print the
assertion message, so the observation does not identify which
`assert.throws` call failed.

 -  In the member-expression file, every callback expects `TypeError` from a
    null or undefined base whose key object has a throwing `toString`.
 -  In each logical-assignment file, the second callback expects the same
    `TypeError`, and the first expects the key expression's own error.


Known nonconformance on main
----------------------------

This section rests on source reading of
*packages/compiler/src/mir-build.ts* at `faa47159` and on *PLAN-M5.md*. No
native run tested these hypotheses.

 -  The generic computed `property-get` lowering converts the key before the
    read that applies ToObject, and inserts no base check first. This
    matches the member-expression failure. *PLAN-M5.md* did not record it
    before this node.
 -  Method lookup on a computed member converts the key before the lookup,
    in the same shape. No observed path covers it.
 -  Logical member assignment converts its key before a nullish base throws.
    That matches the three logical-assignment failures. It converts the key
    again before a taken write. *PLAN-M5.md* records both as retained
    behavior.
 -  Simple member assignment evaluates the right operand first, but then
    converts the key before PutValue's ToObject check. *PLAN-M5.md* records
    this as retained behavior.
 -  Prefix and postfix update apply the base check before conversion, but
    convert an object key twice. `super[key]` compound assignment also
    converts twice. *PLAN-M5.md* records both as retained behavior.
 -  The arithmetic compound forms repaired by
    `compound-member-assignment-key-order` follow the contract and keep
    their results.

Related pinned subjects that other batches own have unknown
classifications. Their sources make the simple assignment and update forms
part of this contract, so `observation-batch-08` and `observation-batch-16`
depend on this node. They predict no result.

| Path                                                                                 | Owner                       | Source SHA256                                                      | Source contract                                                        |
| ------------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| *test/language/expressions/assignment/target-member-computed-reference.js*           | `node:observation-batch-08` | `ca57bd69ceae22dad49e9b1f8461352003deed7635c338fa0d45b30ceea976ef` | ToPropertyKey after both sides, object base                            |
| *test/language/expressions/assignment/target-member-computed-reference-null.js*      | `node:observation-batch-08` | `b646d15689282679c2ac1846df6a1da5ac695f7a2225cbceede58eecc5e41558` | right operand before PutValue's base check, null base                  |
| *test/language/expressions/assignment/target-member-computed-reference-undefined.js* | `node:observation-batch-08` | `cf971b5b03ea2bb6bc59274564bcf1e9ee3fcbdc98ce75e0982abfe1e4a9a4d5` | right operand before PutValue's base check, undefined base             |
| *test/language/expressions/postfix-decrement/S11.3.2\_A6\_T1.js*                     | `node:observation-batch-16` | `918d5f1345a57348c8dece0fc92d27b0b44cc096a8beb5331d4ea955794f0aaf` | reference evaluated once; `TypeError` before key conversion, null base |
| *test/language/expressions/postfix-decrement/S11.3.2\_A6\_T2.js*                     | `node:observation-batch-16` | `6b692867e00ebbf090ff136e77ef6d97f12c1e06bd49fba1c3d6dc104e141dd1` | same, undefined base                                                   |
| *test/language/expressions/postfix-increment/S11.3.1\_A6\_T1.js*                     | `node:observation-batch-16` | `3331d61333f6a404a7d5a5942dd4533be67fe91b921d99dadef325d5601b4239` | same, null base                                                        |
| *test/language/expressions/postfix-increment/S11.3.1\_A6\_T2.js*                     | `node:observation-batch-16` | `6137f94c6a958a3a1acd091162da926c453859823b727e6eaea2fbd696916162` | same, undefined base                                                   |
| *test/language/expressions/prefix-decrement/S11.4.5\_A6\_T1.js*                      | `node:observation-batch-16` | `db32a70d68afd05a9bd1a4d7bae70361c06d711c777a52af0803ab621f1302e2` | same, null base                                                        |
| *test/language/expressions/prefix-decrement/S11.4.5\_A6\_T2.js*                      | `node:observation-batch-16` | `fd0b539c10674a7cda4500cc26e554bcea743a99eab51eae7ce466babccae4fd` | same, undefined base                                                   |
| *test/language/expressions/prefix-increment/S11.4.4\_A6\_T1.js*                      | `node:observation-batch-16` | `8f5ec6a522927cbf004322297a4002d7a966e74eb6fd807cfae4663b0e7f6620` | same, null base                                                        |
| *test/language/expressions/prefix-increment/S11.4.4\_A6\_T2.js*                      | `node:observation-batch-16` | `1f04b0605f9d02012dcaae990925dca80a5fcbecd61ece137719f9d7d3c9e6cd` | same, undefined base                                                   |


Required repair evidence
------------------------

The repair is one semantic unit over the computed member Reference, not a
patch for the four observed paths. It covers:

 -  plain reads and method lookup;
 -  `&&=`, `||=`, and `??=` with both short-circuit outcomes;
 -  simple assignment;
 -  prefix and postfix update;
 -  `super[key]` compound assignment and update;
 -  optional member chains, keeping their nullish short circuit.

It keeps the arithmetic compound results and the separate optional-call
receiver and eval admission work out of scope. The full *PLAN-M5.md*
evidence contract applies:

 -  focused examples over null, undefined, primitive, and object bases with
    counting, throwing, and string keys for every form;
 -  an independent generated model that extends the existing assignment
    property generators without weakening their cases, seeds, or budgets;
 -  both specialization policies, forced collection, and structural
    evidence;
 -  the labeled reference divergence;
 -  a guard miss reaching the compiled generic fallback wherever a
    specialized path or guard changes;
 -  the normative family record and profile update.

The repair regenerates the complete reviewed manifest; reviewed paths move
only toward pass. Batches 14, 08, and 16 then admit their paths from their
own observations. The four failing subjects above become a pass only
through such an observation.
