Dynamic source host Script evidence
===================================

This bounded child reviews exactly 99 umbrella paths at bundle 5 base
`9f21b607aef9399cc2a1f61d382f535af5161a2e`. The exact selector is
[*dynamic-source-host-script-evidence.paths.txt*](./dynamic-source-host-script-evidence.paths.txt),
copied byte for byte from */data/m5c-d17-20261101/host-script/paths.txt*. Its
SHA256 is `74e2b95e29f4f23b1f65395f687afdff1b2a71bacb0b1edafef50d052d5c1219`.
Per-path contracts originate in *rows.json* beside that file. The family
analysis is */data/m5c-d17-20261031/umbrella-residual/REPORT.md*, families 1,
2, 3 and 9.

The selection holds 98 DS-10 paths kept by
`dynamic-source-eval-contract-accounting` and one DS-16 completion path:

| Family                     | Child | Paths |
| -------------------------- | ----- | ----: |
| mixed-eval-ordinary        | DS-10 |    32 |
| eval-syntax-errors         | DS-10 |    20 |
| eval-binding-instantiation | DS-10 |    46 |
| script-completion-values   | DS-16 |     1 |


Authority and ownership
-----------------------

The maintainer answer
*~/.local/state/oseo-m5c/decisions/answers/20261031T1409-umbrella-residual.md*,
item 1, extends the DS-21 replacement evidence, a finite literal host
Script known at build time, to DS-10 and the completion-value paths. The
conditions are unchanged: the contract is independent of the caller
environment, strictness matches, and the error phase matches. A path is
accounted only after review shows every non-source subject covered. Item 3
authorizes no general eval or Function construction implementation; these
families try evidence first and otherwise keep the path for the
named-deferral route of item 4.

The DS-21 conditions are recorded in
*~/.local/state/oseo-m5c/decisions/done/observation-tag-rules-20261029.md*
and in
[*dynamic-source-completion-record-evidence.md*](./dynamic-source-completion-record-evidence.md).
[ADR 0029](../adr/0029-ahead-of-time-host-script-bindings.md) defines the host
Script route; it does not reopen ADR 0016.

The node starts ready/unlanded, depending on landed
`unsupported-ownership-audit`. The umbrella
`dynamic-source-coverage-remediation` depends on it. The graph commit
moved no ledger owner; the evidence commit moves the 44 closed owners to
ADR 0016 and adds the `ds-host-script-finite-evidence` exclusion
assessment, as described below. Root owns UPDATE, outer review,
publication, push and landing. ADR 0013, 0016, 0019 and 0029 remain
unchanged, and all 41,091 inventory paths and original assertions remain.


Closure routes
--------------

 -  Indirect eval rows: a literal `$262.evalScript` call replaces the
    indirect call at its original site, retaining every caller-local
    binding the original declares. Indirect eval ignores the caller's
    environment and strictness, so the host Script reproduces both. A row
    qualifies only when every binding, value, descriptor and error the
    original observes equals eval's, with the same error phase. A Script
    differs from eval in two attributes: a new global var or function
    binding is non-configurable rather than configurable, and a lexical
    declaration persists in the global declarative record. A row that
    asserts or depends on either difference does not qualify: asserted
    configurable descriptors, deletion, strict source that keeps its var or
    function local, and eval lexical bindings that must be absent
    afterward. Where the original never observes the attribute, as in the
    new `var` and function bindings of the `always-non-strict`,
    `var-env-func-init-multi`, `var-env-func-non-strict` and
    `var-env-var-non-strict` originals or the uninitialized lexical left by
    `lex-env-no-init`, the difference is outside its asserted contract and
    the table names it.
 -  Direct eval rows in global Script code: the caller context is the
    global context the host Script reproduces. Strictness inherited from
    the caller is reproduced by a prepended directive followed by `void 0`,
    exactly as DS-21, and only where the evaluated source reads no
    caller-local binding, `this`, `new.target`, `arguments` or function var
    environment.
 -  Direct eval rows inside a function, method or arrow: they qualify only
    when the evaluated source resolves nothing outside its own
    declarations. Rows observing caller-local bindings, a function's
    `this`/`new.target`, a home object, or a function var environment do
    not qualify by substitution.
 -  Syntax error rows: the host Script must throw the same constructor at
    the same call, after the same preceding effects. Module-caller rows do
    not qualify while test262 host builds remain Script-only.
 -  The hashbang completion row: the strict variant cannot place a
    directive before `#!`, so strictness cannot match and the path stays.

Each witness reads the pinned original, replaces only the eval call
expressions, keeps strict value and type checks in the program, and uses a
mutation verdict that does not reuse the comparator under test. Closed
owners move through the ledger parse/derive/serialize API and
`mise run m5c:closure-ledger:update`. Every kept path retains umbrella
ownership with an exact per-path reason in this note's evidence table.


Replacement evidence
--------------------

Root's ruling on the scope question of 2026-11-01 accepted the indirect
rule and the direct global-code rows, closed the global top-level direct
`new.target`, `super` and `this` rows (A) and the two strictness-inheritance
rows (B), and kept the hashbang strict variant (C). A reviewer rejection
keeps the row.

Delta: 44 paths are accounted under ADR 0016 with replacement evidence and
55 stay with the umbrella. The 44 closed are 25 indirect and 19 direct
originals; no subset row, tag, observation or pass count changes.

*tests/native/fixtures/host-script-evidence-cases.ts* names each closed
original, its pinned SHA256, caller modes and every eval call expression
with its cooked source and one mutation. The fixture builder in
*host-script-evidence.ts* beside it reads the pinned original from the
installed test262 package and replaces only those call expressions, in
source order after the frontmatter, by literal `$262.evalScript` calls.
The four indirect `global-env-rec` originals also keep their local
`_eval` binding, now initialized from `$262.evalScript`. Every other
byte, including every assertion, is retained. Strict mode prepends the
original runner's directive; a direct caller's inherited strictness adds
the DS-21 `"use strict"; void 0;` prefix to the evaluated source.

Each original runs in a fresh realm per caller mode. Values the original
consumes are first checked by `hostValue`, which requires the same value
and type. Each call site then has its own mutation realm; a mutant is
rejected only by its own realm's `Test262Error`, an `instanceof` verdict
that does not reuse the assertion comparator. For the two runtime-negative
originals, the original must throw its realm's `SyntaxError` and each
mutant must complete. Two non-extensible-global originals check that the
guarded branch ran, and the direct `var x` collision checks that the
preceding `let x` initialized before the throw. A separate oracle fixture
rejects `"true"`/`true`, `1`/`true`, a String object, a different object
and a same-text object.

*tests/host-script-evidence.test.ts* checks the 44 paths against the
selector, each SHA256, the caller modes from the frontmatter flags, the
negative and include metadata, and that every call's cooked argument
equals its recorded source. Under both policies, compilation has no
diagnostics, the only malformed host Scripts are the expected
early-error sources, and Script completion and host tables are emitted.

Node.js `vm` contexts reflect a nonstandard global object, so each program
variant also runs once as a global Script of a fresh Node.js and Deno main
realm, with its expected verdict. Two divergences are recorded rather
than hidden. V8 throws SyntaxError and keeps earlier declarations when a
global Script redeclares `NaN` as a function, against the specified
atomic TypeError, so its verdict for the eight `non-definable-function`
and `-generator` originals is the original's own Test262Error. Deno cannot
unload after a program makes its global non-extensible, so the two
`non-definable-global-var` originals use Node.js only. Native execution
supplies Oseo's observation against the original assertions.

Native tests run every fixture under both specialization policies with
collection forced at every safepoint and require positive collection
counters. They are registered only in the dedicated test, not in
*tests/native.ts*, so the ordinary native gate does not run them twice.

On this worktree, the 44 originals' structure and reference registrations
plus the oracle passed: 90 registrations, Node.js and Deno included. The
focused native command passed all 45 fixtures under both policies with
forced collection, natural exit 0 in 354.963 seconds. Raw evidence is in
*/data/m5c-ds-host-script-20261101/native/*. The subset and observations
are unchanged, so no UPDATE is needed; this change does not touch
*packages/*, the runner or *tests/test262/harness/*. Root retains full
gates, outer review, publication and landing.

### Closed paths

| Path                                                                                   | Fixture | Mapping and compared observation                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------- | ------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| *test/language/eval-code/direct/lex-env-no-init-cls.js*                                |       0 | Direct in a callback: the source reads only its own TDZ binding, nothing of the caller; strict mode adds the DS-21 directive. The Script leaves its lexical uninitialized in the global record; nothing reads it afterward. |
| *test/language/eval-code/direct/lex-env-no-init-const.js*                              |       1 | Direct in a callback: the source reads only its own TDZ binding, nothing of the caller; strict mode adds the DS-21 directive. The Script leaves its lexical uninitialized in the global record; nothing reads it afterward. |
| *test/language/eval-code/direct/lex-env-no-init-let.js*                                |       2 | Direct in a callback: the source reads only its own TDZ binding, nothing of the caller; strict mode adds the DS-21 directive. The Script leaves its lexical uninitialized in the global record; nothing reads it afterward. |
| *test/language/eval-code/direct/new.target.js*                                         |       3 | Direct at global Script top level (Root A): the caller context is the global context; realm SyntaxError identity compared.                                                                                                  |
| *test/language/eval-code/direct/non-definable-function-with-function.js*               |       4 | Direct at global top level, sloppy: global var environment; atomic CanDeclareGlobalFunction TypeError before any binding.                                                                                                   |
| *test/language/eval-code/direct/non-definable-function-with-variable.js*               |       5 | Direct at global top level, sloppy: global var environment; atomic CanDeclareGlobalFunction TypeError before any binding.                                                                                                   |
| *test/language/eval-code/direct/non-definable-global-function.js*                      |       6 | Direct at global top level, sloppy: global var environment; atomic CanDeclareGlobalFunction TypeError before any binding.                                                                                                   |
| *test/language/eval-code/direct/non-definable-global-generator.js*                     |       7 | Direct at global top level, sloppy: global var environment; atomic CanDeclareGlobalFunction TypeError before any binding.                                                                                                   |
| *test/language/eval-code/direct/non-definable-global-var.js*                           |       8 | Direct at global top level, sloppy: CanDeclareGlobalVar TypeError on the non-extensible global; `nonExtensible === true` checked after.                                                                                     |
| *test/language/eval-code/direct/strict-caller-function-context.js*                     |       9 | Direct (Root B): the function directive is the only caller input; strictness by the DS-21 directive in both modes; source reads nothing of the caller.                                                                      |
| *test/language/eval-code/direct/strict-caller-global.js*                               |      10 | Direct at global top level (Root B): strictness by the DS-21 directive; runtime SyntaxError is the program's uncaught completion.                                                                                           |
| *test/language/eval-code/direct/strictness-override.js*                                |      11 | Direct in a callback: the source's own directive makes it strict; the unresolvable name is absent from every caller record.                                                                                                 |
| *test/language/eval-code/direct/super-call.js*                                         |      12 | Direct at global Script top level (Root A): the caller context is the global context; realm SyntaxError identity compared.                                                                                                  |
| *test/language/eval-code/direct/super-prop.js*                                         |      13 | Direct at global Script top level (Root A): the caller context is the global context; realm SyntaxError identity compared.                                                                                                  |
| *test/language/eval-code/direct/this-value-global.js*                                  |      14 | Direct at global Script top level (Root A): global `this` identity compared strictly against `globalThis`.                                                                                                                  |
| *test/language/eval-code/direct/var-env-func-init-global-update-non-configurable.js*   |      15 | Direct at global top level, sloppy: global var environment; existing descriptor and hoisted value preserved as in eval.                                                                                                     |
| *test/language/eval-code/direct/var-env-func-init-multi.js*                            |      16 | Global var environment; the last duplicate declaration is the hoisted value and the later global call, both returning `"second"`. The new binding is non-configurable in a Script; no descriptor is asserted.               |
| *test/language/eval-code/direct/var-env-global-lex-non-strict.js*                      |      17 | Direct at global top level, sloppy: var/lexical collision SyntaxError at the call; the preceding `let x` is initialized afterward.                                                                                          |
| *test/language/eval-code/direct/var-env-var-init-global-exstng.js*                     |      18 | Direct at global top level, sloppy: global var environment; existing descriptor and hoisted value preserved as in eval.                                                                                                     |
| *test/language/eval-code/indirect/always-non-strict.js*                                |      19 | Indirect: caller strictness ignored; sloppy host Script runs in the onlyStrict caller; counts compared. The new `static` binding is non-configurable in a Script; no descriptor is asserted.                                |
| *test/language/eval-code/indirect/global-env-rec-catch.js*                             |      20 | Indirect: caller-local shadowing bindings retained; host Script resolves the global string; value checked strictly as `true`.                                                                                               |
| *test/language/eval-code/indirect/global-env-rec-fun.js*                               |      21 | Indirect: caller-local shadowing bindings retained; host Script resolves the global string; value checked strictly as `true`.                                                                                               |
| *test/language/eval-code/indirect/global-env-rec-with.js*                              |      22 | Indirect: caller-local shadowing bindings retained; host Script resolves the global string; value checked strictly as `true`.                                                                                               |
| *test/language/eval-code/indirect/global-env-rec.js*                                   |      23 | Indirect: caller-local shadowing bindings retained; host Script resolves the global string; value checked strictly as `true`.                                                                                               |
| *test/language/eval-code/indirect/lex-env-heritage.js*                                 |      24 | Indirect: inner block `let x` retained; both sources read the global lexical `"outside"`, checked strictly.                                                                                                                 |
| *test/language/eval-code/indirect/lex-env-no-init-cls.js*                              |      25 | Indirect: the source reads only its own TDZ binding; ReferenceError from the call. The Script leaves its lexical uninitialized in the global record; nothing reads it afterward.                                            |
| *test/language/eval-code/indirect/lex-env-no-init-const.js*                            |      26 | Indirect: the source reads only its own TDZ binding; ReferenceError from the call. The Script leaves its lexical uninitialized in the global record; nothing reads it afterward.                                            |
| *test/language/eval-code/indirect/lex-env-no-init-let.js*                              |      27 | Indirect: the source reads only its own TDZ binding; ReferenceError from the call. The Script leaves its lexical uninitialized in the global record; nothing reads it afterward.                                            |
| *test/language/eval-code/indirect/new.target.js*                                       |      28 | Indirect: global and function/method callers both give a Script-goal early error; realm SyntaxError at the call; both sites mutated.                                                                                        |
| *test/language/eval-code/indirect/non-definable-function-with-function.js*             |      29 | Indirect: global var environment; atomic CanDeclareGlobalFunction TypeError before any binding.                                                                                                                             |
| *test/language/eval-code/indirect/non-definable-function-with-variable.js*             |      30 | Indirect: global var environment; atomic CanDeclareGlobalFunction TypeError before any binding.                                                                                                                             |
| *test/language/eval-code/indirect/non-definable-global-function.js*                    |      31 | Indirect: global var environment; atomic CanDeclareGlobalFunction TypeError before any binding.                                                                                                                             |
| *test/language/eval-code/indirect/non-definable-global-generator.js*                   |      32 | Indirect: global var environment; atomic CanDeclareGlobalFunction TypeError before any binding.                                                                                                                             |
| *test/language/eval-code/indirect/non-definable-global-var.js*                         |      33 | Indirect: CanDeclareGlobalVar TypeError on the non-extensible global; `nonExtensible === true` checked after.                                                                                                               |
| *test/language/eval-code/indirect/super-call.js*                                       |      34 | Indirect: global and function/method callers both give a Script-goal early error; realm SyntaxError at the call; both sites mutated.                                                                                        |
| *test/language/eval-code/indirect/super-prop.js*                                       |      35 | Indirect: global and function/method callers both give a Script-goal early error; realm SyntaxError at the call; both sites mutated.                                                                                        |
| *test/language/eval-code/indirect/this-value-func.js*                                  |      36 | Indirect: `this` is always the global object; identity compared strictly against `globalThis`.                                                                                                                              |
| *test/language/eval-code/indirect/this-value-global.js*                                |      37 | Indirect: `this` is always the global object; identity compared strictly against `globalThis`.                                                                                                                              |
| *test/language/eval-code/indirect/var-env-func-init-global-update-non-configurable.js* |      38 | Indirect: global var environment; existing descriptor and hoisted value preserved as in eval.                                                                                                                               |
| *test/language/eval-code/indirect/var-env-func-init-multi.js*                          |      39 | Global var environment; the last duplicate declaration is the hoisted value and the later global call, both returning `"second"`. The new binding is non-configurable in a Script; no descriptor is asserted.               |
| *test/language/eval-code/indirect/var-env-func-non-strict.js*                          |      40 | Indirect: sloppy function declared on the global object, visible inside and outside the caller. Non-configurable in a Script; no descriptor is asserted.                                                                    |
| *test/language/eval-code/indirect/var-env-global-lex-non-strict.js*                    |      41 | Indirect: var/lexical collision SyntaxError at the call, constructor compared.                                                                                                                                              |
| *test/language/eval-code/indirect/var-env-var-init-global-exstng.js*                   |      42 | Indirect: global var environment; existing descriptor and hoisted value preserved as in eval.                                                                                                                               |
| *test/language/eval-code/indirect/var-env-var-non-strict.js*                           |      43 | Indirect: global `x` created while the caller-local `x` stays 0. Non-configurable in a Script; no descriptor is asserted.                                                                                                   |

### Kept paths

| Path                                                                               | Family                     | Reason kept                                                                                                                              |
| ---------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| *test/language/comments/hashbang/no-line-separator.js*                             | script-completion-values   | Strict variant: no directive can precede `#!`, so strictness cannot match (Root C). Named-deferral candidate.                            |
| *test/language/eval-code/direct/export.js*                                         | eval-syntax-errors         | Module caller: test262 host builds are Script-only, so the original caller goal cannot be reproduced.                                    |
| *test/language/eval-code/direct/global-env-rec-catch.js*                           | mixed-eval-ordinary        | Direct eval reads a caller-local binding (function, catch or with record).                                                               |
| *test/language/eval-code/direct/global-env-rec-eval.js*                            | eval-binding-instantiation | An outer direct eval introduces a caller-local var in the function var environment.                                                      |
| *test/language/eval-code/direct/global-env-rec-fun.js*                             | mixed-eval-ordinary        | Direct eval reads a caller-local binding (function, catch or with record).                                                               |
| *test/language/eval-code/direct/global-env-rec-with.js*                            | mixed-eval-ordinary        | Direct eval reads a caller-local binding (function, catch or with record).                                                               |
| *test/language/eval-code/direct/global-env-rec.js*                                 | mixed-eval-ordinary        | Direct eval reads a caller-local binding (function, catch or with record).                                                               |
| *test/language/eval-code/direct/import.js*                                         | eval-syntax-errors         | Module caller: test262 host builds are Script-only, so the original caller goal cannot be reproduced.                                    |
| *test/language/eval-code/direct/lex-env-distinct-cls.js*                           | mixed-eval-ordinary        | Eval lexical bindings must vanish afterward; a host Script persists them in the global declarative record (and `outside` would collide). |
| *test/language/eval-code/direct/lex-env-distinct-const.js*                         | mixed-eval-ordinary        | Eval lexical bindings must vanish afterward; a host Script persists them in the global declarative record (and `outside` would collide). |
| *test/language/eval-code/direct/lex-env-distinct-let.js*                           | mixed-eval-ordinary        | Eval lexical bindings must vanish afterward; a host Script persists them in the global declarative record (and `outside` would collide). |
| *test/language/eval-code/direct/lex-env-heritage.js*                               | mixed-eval-ordinary        | Direct eval reads the caller's inner block lexical `x`.                                                                                  |
| *test/language/eval-code/direct/new.target-arrow.js*                               | eval-syntax-errors         | Direct eval in an arrow: the early error depends on walking the arrow to its this environment.                                           |
| *test/language/eval-code/direct/new.target-fn.js*                                  | mixed-eval-ordinary        | Direct eval observes the function's new.target on call and construct.                                                                    |
| *test/language/eval-code/direct/super-call-arrow.js*                               | eval-syntax-errors         | Direct eval in an arrow: the early error depends on walking the arrow to its this environment.                                           |
| *test/language/eval-code/direct/super-call-fn.js*                                  | eval-syntax-errors         | Direct eval in a function or method: the early error depends on the caller's function kind and home object.                              |
| *test/language/eval-code/direct/super-call-method.js*                              | eval-syntax-errors         | Direct eval in a function or method: the early error depends on the caller's function kind and home object.                              |
| *test/language/eval-code/direct/super-prop-arrow.js*                               | eval-syntax-errors         | Direct eval in an arrow: the early error depends on walking the arrow to its this environment.                                           |
| *test/language/eval-code/direct/super-prop-dot-no-home.js*                         | eval-syntax-errors         | Direct eval in a function or method: the early error depends on the caller's function kind and home object.                              |
| *test/language/eval-code/direct/super-prop-expr-no-home-no-eval.js*                | eval-syntax-errors         | Direct eval in a function or method: the early error depends on the caller's function kind and home object.                              |
| *test/language/eval-code/direct/super-prop-expr-no-home.js*                        | eval-syntax-errors         | Direct eval in a function or method: the early error depends on the caller's function kind and home object.                              |
| *test/language/eval-code/direct/super-prop-method.js*                              | mixed-eval-ordinary        | Direct eval reads super through the method's home object.                                                                                |
| *test/language/eval-code/direct/this-value-func-non-strict.js*                     | mixed-eval-ordinary        | Direct eval observes the calling function's `this` binding.                                                                              |
| *test/language/eval-code/direct/this-value-func-strict-caller.js*                  | mixed-eval-ordinary        | Direct eval observes the calling function's `this` binding.                                                                              |
| *test/language/eval-code/direct/this-value-func-strict-source.js*                  | mixed-eval-ordinary        | Direct eval observes the calling function's `this` binding.                                                                              |
| *test/language/eval-code/direct/var-env-func-init-global-new.js*                   | eval-binding-instantiation | Asserts a configurable eval-created global binding; a Script creates it non-configurable.                                                |
| *test/language/eval-code/direct/var-env-func-init-global-update-configurable.js*   | eval-binding-instantiation | Asserts a configurable eval-created global binding; a Script creates it non-configurable.                                                |
| *test/language/eval-code/direct/var-env-func-init-local-new-delete.js*             | eval-binding-instantiation | Direct eval declares in the calling function's var environment.                                                                          |
| *test/language/eval-code/direct/var-env-func-init-local-new.js*                    | eval-binding-instantiation | Direct eval declares in the calling function's var environment.                                                                          |
| *test/language/eval-code/direct/var-env-func-init-local-update.js*                 | eval-binding-instantiation | Direct eval declares in the calling function's var environment.                                                                          |
| *test/language/eval-code/direct/var-env-func-non-strict.js*                        | eval-binding-instantiation | Direct eval declares in the calling function's var environment.                                                                          |
| *test/language/eval-code/direct/var-env-func-strict-caller-2.js*                   | eval-binding-instantiation | Strict eval keeps its var or function in a new eval environment; a strict Script declares it globally.                                   |
| *test/language/eval-code/direct/var-env-func-strict-caller.js*                     | eval-binding-instantiation | Strict eval keeps its var or function in a new eval environment; a strict Script declares it globally.                                   |
| *test/language/eval-code/direct/var-env-func-strict-source.js*                     | eval-binding-instantiation | Strict eval keeps its var or function in a new eval environment; a strict Script declares it globally.                                   |
| *test/language/eval-code/direct/var-env-lower-lex-non-strict.js*                   | eval-binding-instantiation | Direct eval collides with a caller-local block lexical `x`.                                                                              |
| *test/language/eval-code/direct/var-env-var-init-global-new.js*                    | eval-binding-instantiation | Asserts a configurable eval-created global binding; a Script creates it non-configurable.                                                |
| *test/language/eval-code/direct/var-env-var-init-local-exstng.js*                  | eval-binding-instantiation | Direct eval declares in the calling function's var environment.                                                                          |
| *test/language/eval-code/direct/var-env-var-init-local-new-delete.js*              | eval-binding-instantiation | Direct eval declares in the calling function's var environment.                                                                          |
| *test/language/eval-code/direct/var-env-var-init-local-new.js*                     | eval-binding-instantiation | Direct eval declares in the calling function's var environment.                                                                          |
| *test/language/eval-code/direct/var-env-var-non-strict.js*                         | eval-binding-instantiation | Direct eval declares in the calling function's var environment.                                                                          |
| *test/language/eval-code/direct/var-env-var-strict-caller-2.js*                    | eval-binding-instantiation | Strict eval keeps its var or function in a new eval environment; a strict Script declares it globally.                                   |
| *test/language/eval-code/direct/var-env-var-strict-caller-3.js*                    | eval-binding-instantiation | Strict eval keeps its var or function in a new eval environment; a strict Script declares it globally.                                   |
| *test/language/eval-code/direct/var-env-var-strict-caller.js*                      | eval-binding-instantiation | Strict eval keeps its var or function in a new eval environment; a strict Script declares it globally.                                   |
| *test/language/eval-code/direct/var-env-var-strict-source.js*                      | eval-binding-instantiation | Strict eval keeps its var or function in a new eval environment; a strict Script declares it globally.                                   |
| *test/language/eval-code/indirect/export.js*                                       | eval-syntax-errors         | Module caller: test262 host builds are Script-only, so the original caller goal cannot be reproduced.                                    |
| *test/language/eval-code/indirect/global-env-rec-eval.js*                          | eval-binding-instantiation | An outer direct eval introduces a caller-local var in the function var environment.                                                      |
| *test/language/eval-code/indirect/import.js*                                       | eval-syntax-errors         | Module caller: test262 host builds are Script-only, so the original caller goal cannot be reproduced.                                    |
| *test/language/eval-code/indirect/lex-env-distinct-cls.js*                         | mixed-eval-ordinary        | Eval lexical bindings must vanish afterward; a host Script persists them in the global declarative record (and `outside` would collide). |
| *test/language/eval-code/indirect/lex-env-distinct-const.js*                       | mixed-eval-ordinary        | Eval lexical bindings must vanish afterward; a host Script persists them in the global declarative record (and `outside` would collide). |
| *test/language/eval-code/indirect/lex-env-distinct-let.js*                         | mixed-eval-ordinary        | Eval lexical bindings must vanish afterward; a host Script persists them in the global declarative record (and `outside` would collide). |
| *test/language/eval-code/indirect/var-env-func-init-global-new.js*                 | eval-binding-instantiation | Asserts a configurable eval-created global binding; a Script creates it non-configurable.                                                |
| *test/language/eval-code/indirect/var-env-func-init-global-update-configurable.js* | eval-binding-instantiation | Asserts a configurable eval-created global binding; a Script creates it non-configurable.                                                |
| *test/language/eval-code/indirect/var-env-func-strict.js*                          | eval-binding-instantiation | Strict eval keeps its var or function in a new eval environment; a strict Script declares it globally.                                   |
| *test/language/eval-code/indirect/var-env-var-init-global-new.js*                  | eval-binding-instantiation | Asserts a configurable eval-created global binding; a Script creates it non-configurable.                                                |
| *test/language/eval-code/indirect/var-env-var-strict.js*                           | eval-binding-instantiation | Strict eval keeps its var or function in a new eval environment; a strict Script declares it globally.                                   |
