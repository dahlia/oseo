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
`dynamic-source-coverage-remediation` depends on it. This graph commit moves
no ledger owner and creates no exclusion. Root owns UPDATE, outer review,
publication, push and landing. ADR 0013, 0016, 0019 and 0029 remain
unchanged, and all 41,091 inventory paths and original assertions remain.


Closure routes
--------------

 -  Indirect eval rows: a literal `$262.evalScript` call replaces the
    indirect call at its original site, retaining every caller-local
    binding the original declares. Indirect eval ignores the caller's
    environment and strictness, so the host Script reproduces both. A row
    qualifies only when the Script's bindings, property descriptors and
    error phase equal eval's. Configurable eval-created global bindings,
    strict source that keeps its var or function local, and eval lexical
    bindings that must vanish afterward do not qualify.
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
