Construction contracts
======================

DS-13 bounds 57 unsupported paths at semantic bundle commit
`9529210a24be72e2b273f43f014c03a98a29069e`. Size: L. The initial scope has
zero newly established closures.

The exact selector is
[*dynamic-source-construction-contracts.paths.txt*](./dynamic-source-construction-contracts.paths.txt),
copied byte for byte from the approved proposal.

SHA256:

`dbd8987dc7547f584c51d4e5ab50e0f74fb3c865e0e79cad3468ea62d2a1716c`


Authority and ownership
-----------------------

The maintainer approved all 15 proposed IDs in
[*20261031T0935-umbrella-second-split.answer.md*](~/.local/state/oseo-m5c/decisions/done/20261031T0935-umbrella-second-split.answer.md),
answering *20261031T0935-umbrella-second-split.md* in that directory. The
source proposal is */data/m5c-d17-20261031/umbrella-split/REPORT.md*, with
per-path subjects and historical gap records in *families.json* beside it.

The 2026-10-28 decision
*~/.local/state/oseo-m5c/decisions/done/20261028-m5c-scope-big-node-split.md*,
items 1 and 2, supplies the existing accounting rules. ADR 0013/0016/0019
remain unchanged. Dependency tags and a rejected source operation do not
authorize whole-path exclusion. Keep all 41,091 inventory paths and every
original assertion; accounting never counts as a pass.

This node depends on landed `authorized-exclusion-audit` and starts
ready/unlanded. Ownership stays with `dynamic-source-coverage-remediation`
until this child lands. Each child landing reports exact newly covered and
still-uncovered subsets and moves ownership in the derived ledger. The
umbrella remains an aggregate gate until all children land and it owns zero
paths. Serialize shared audit, ledger and manifest publication; Root owns
integration and publication.


Closure route and evidence obligations
--------------------------------------

Estimated new test groups: 22–42. Audit-only candidates: 0–0. These are
planning estimates; every selected subject needs accepted evidence or a
bounded decision before closure.

### Function-constructor grammar and strictness (15)

Remaining reason: `new-evidence-or-source-only-review`.

Duplicate and reserved parameter names, local versus caller strictness and
invalid private identifiers in constructed source. Constructor-specific
parse/strictness is excluded, but corresponding ordinary static grammar can be
an uncovered non-source subject.

Review source-only construction claims first, then provide 8–15 compiler/parser
or static fixture groups for ordinary strict/sloppy grammar as needed. Related
expected-negatives need an explicit equivalence argument and reviewed
observations; the DS-5 pass-only task did not accept them by itself.

### Constructor argument conversion, order and results (35)

Remaining reason: `new-evidence`.

Function argument ToString side effects, abrupt completion and parameter/body
conversion order, plus results of dynamically constructed functions. Some rows
may prove source-only after review; conversion/order assertions cannot be
excluded merely because Function is rejected.

Budget 10–20 static/native groups covering each asserted conversion order,
thrown value, argument form and ordinary result contract. A generic ToString
test does not establish constructor ordering; retain rows requiring that
particular boundary interaction unless the maintainer accepts a narrower
accounting argument.

### Source-compiling constructor subclass instances (7)

Remaining reason: `new-evidence-or-maintainer-decision`.

Function/GeneratorFunction subclass prototype, name, length, instanceof and
super initialization. These are mixed object/subclass contracts, not just
parsing a string.

Budget 4–7 focused native/static subclass groups. If the asserted allocation or
internal-slot step cannot be reached without source compilation, keep it open
and ask for a bounded decision; do not replace a Function subclass with an
unrelated Array subclass.

For every eventual exclusion, name the exact replacement paths and reviewed
observations, refresh source and normalized observation digests, and show
that every non-source subject is covered. Keep mixed or uncovered subjects
open and ask for a bounded maintainer decision when a faithful witness is
unavailable. Preserve ADR 0016/0019 reopening triggers; an accepted ADR 0016
amendment admitting dynamic import reopens ImportCall accounting. Each child
requires normal D1/D11 review and D3/D4 publication. This metadata change
performs none of those closure or landing steps.


Bounded evidence assessment
---------------------------

The implementation assessment uses split base
`362ddb13d933600f6a0543ac332eb8479be9053f`. Its exact 57-path selector and
SHA256 above match the ledger: every selected path is
`unsupported-profile-feature` and initially belongs to
`node:dynamic-source-coverage-remediation`. All 41,091 inventory paths remain.

[*dynamic-source-construction-assessment.yaml*](./dynamic-source-construction-assessment.yaml)
records each source digest, normalized observation digest, normative subject,
replacement observation and one-line disposition reason. This node's delta is
24 paths accounted under ADR 0016 and 33 retained in umbrella remediation:

| Family                                  | Selected | ADR 0016 | Remaining |
| --------------------------------------- | -------: | -------: | --------: |
| Constructor grammar and strictness      |       15 |       15 |         0 |
| Argument conversion, order and results  |       35 |        9 |        26 |
| Source-compiling constructor subclasses |        7 |        0 |         7 |
| Total                                   |       57 |       24 |        33 |

These are exclusion-accounting changes. No path becomes a pass, no original
assertion or observation changes, and the subset, result partitions and tags
remain unchanged. The shared umbrella count and node YAML remain for Root to
reconcile at publication.

### Ordinary grammar and results

*tests/construction-static-contracts.test.ts* adds eight static negative
groups, one structural group and seven string-result mutation checks.
Complete ordinary function definitions reject strict duplicate parameters,
strict `eval`/`arguments` parameters, strict `with`, an unbound private
name, an invalid `var` binding and an invalid numeric parameter list. Both
specialization policies report owned `OSEO0001` syntax diagnostics without
MIR; the Node.js and Deno reference compilers report `SyntaxError`. These
observations cover the same ordinary FormalParameters and FunctionBody
early errors. Catching a SyntaxError object in the original is the
observer for that parse failure, rather than a separate error-object
mutation or descriptor contract.

The fixed *tests/native/fixtures/construction-static-contracts.ts* fixture
adds six observation groups: duplicate parameter bindings; sloppy `eval` and
`arguments` parameter acceptance; `arguments[0]` identity for numeric and
String inputs; `instanceof Function` and `.constructor` identity; true and
undefined return values; and the exact left-associative sums `6`, `ABBA1` and
`2ABBA`. Each of its 17 primitive observations is checked with `Object.is`
before printing, so a difference in type or value throws and fails execution.
Seven mutations substitute strings with identical printed text: one each for
duplicate bindings, named parameters, argument identity, Function predicates
and numeric sums, plus separate true and undefined return cases. Each
mutated test must throw in the reference hosts. Its native registration in
*tests/native.ts* runs both policies,
enters both forced-GC lists, checks the fixed expected output and positive
collection count, and retains the structural property guards/generic fallback
checks. No property-generator domain or compiler/runtime support is added.

The local strictness tests share ordinary strict-function grammar with these
negative witnesses. A constructed function's independence from a strict
caller is different: the constructor parses a separate body whose own
ContainsUseStrict controls that grammar. Static sloppy definitions witness
the admitted ordinary grammar; the separate-source strictness selection
remains part of the excluded CreateDynamicFunction operation. Likewise,
combining primitive String parameter arguments and choosing call versus new
are source-construction steps. The nine result closures use only primitive
String source arguments; their exact ordinary result and Function identity
assertions have static/native witnesses.

### Remaining mixed subjects

The other 26 argument rows retain remediation because their conversions feed
parameter or body parsing, or establish ordering across argument evaluation
and constructor conversion. In particular, *A3\_T1* requires parameter ToString
to throw `1` before the body conversion that would throw `"body"`; *A3\_T3*
requires parameter conversion to change `p` before the body's exact thrown
String. The *A2\_T4* through *A2\_T6* counters connect repeated conversion,
created parameter names and later call results. Calling String explicitly
would remove the constructor boundary these tests assert. Even the primitive
non-String conversion cases keep their precise unwitnessed interaction in
the table; the empty ordinary function alone does not establish it.

All seven subclass rows retain remediation. Their Function-family allocation
or internal-slot initialization cannot be reached without invoking the
excluded source-compiling constructor. Static generator name/length/prototype
checks and unrelated built-in subclasses would not witness these exact
subclass instances. *super-must-be-called.js* also asserts successful super
initialization and GeneratorFunction identity, so its ReferenceError half
cannot close the whole path. Root was asked for a bounded decision on these
unreachable mixed contracts; no broader exclusion is assumed.

### Validation and publication

The focused static tests pass on Node.js and Deno (16 each). The locked focused
native run, `node tests/native.ts --shard 23/1000`, passes the new fixture on
Linux x86-64 under both policies with forced collection, matches both
references and the fixed expectation, and cross-links Linux AArch64. Its
common runner prelude also passes. Logs are under
*/data/m5c-d17-20261031/ds13-fix/*. A native mutation converts the numeric
argument result to a string and must fail under both policies with forced
collection.

No UPDATE is needed: the subset and result observations are unchanged, and
the test262 runner cannot reach the new test-only fixture or registration.
Root must still run the exact candidate's full ordinary suites, including
`test:node`, `test:deno` and `test:native`, on the supported native hosts;
focused local evidence does not replace those publication gates. This node
sets no landed state and performs no outer review, merge, push or publication.

The dependency-tag self-audit leaves all selected rows and their tags intact.
No incidental fixture syntax, assertion plumbing or unexecuted operation is
used to retag a rejection. Audit records retain fresh original source and
normalized observation digests and bind the replacement test files. Changed
original/replacement evidence requires reassessment, as do ADR 0016's
admission and laboratory/staged-compilation/WinterTC triggers and ADR 0019's
non-source normative-dependence trigger.
