Expose harness globals to imported test modules
===============================================

Makes test262 harness bindings, which come from a global script, visible to
modules imported by a module test, so the 1 observed path whose imported module
calls assert can be observed.

The 1 paths below remain unreviewed in the closure ledger.
Root authorized this ready, unlanded owner on 2026-10-27. The saved API
observations used clean source `6aab0fc8`, tree
`d6723be80209aca0fcf0606c5c3e5959f152ad0c`.

| Owned path                                                                                                                          | Exact observed diagnostic                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Raw result                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `test/language/module-code/ambiguous-export-bindings/namespace-unambiguous-if-export-star-as-from-and-import-star-as-and-export.js` | `test/language/module-code/ambiguous-export-bindings/namespace-unambiguous-if-export-star-as-from-and-import-star-as-and-export.js strict disabled failed (1): stdout="" stderr="file:///home/dahlia/.cache/aube/virtual-store/v1/test262@url+d1a1eda3d9511414-f632e209b459265d/node_modules/test262/test/language/module-code/ambiguous-export-bindings/namespace-unambiguous-if-import-star-as-and-export.js:79:1: error[OSEO2001]: ReferenceError: assert is not defined.\nOSEO_THROWN ReferenceError\n"` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/raw/case-477-result.json` |


Cause and repair
----------------

The runner prepended the harness to the entry module's source, so `assert`
became a binding of the entry module alone. The owned case imports its
sibling test file *namespace-unambiguous-if-import-star-as-and-export.js*,
whose own top-level `assert.sameValue` call ran before the entry and found
no such name. INTERPRETING.md evaluates the harness as a global Script, so
every module in the graph must see it through the global environment.

`compileModuleGraph` now accepts a prelude Script. It is resolved after the
graph's cells and lowered ahead of every module initializer, keeping its
own strictness, GlobalDeclarationInstantiation, and source identity, so
a throw in the Script reports the Script's location. Its var, function, and
lexical bindings form an outer scope of every module, so a module's own
declarations and imports hide them. A var or function name keeps its
global-object storage. A prelude whose top-level `with` statement may
initialize a hidden fallback cell is rejected at the Script. The CLI
exposes this as `--script SCRIPT` for a module entry, with an in-memory
`scriptSource` on `CliRequest`. The test262 runner now passes a module
case's harness through it and compiles the unmodified upstream body as the
entry, in both the pre-execution graph build and native execution.


Evidence
--------

 -  Compiler: *packages/parser-babel/tests/modules.test.ts* covers outer
    resolution, module shadowing, prelude strictness, and the `with`
    rejection.
 -  CLI: *packages/cli/tests/index.test.ts* covers `--script` from a file
    and from memory, its parse diagnostic, an unreadable file, and the
    rejection of a script entry in both CLI surfaces.
 -  Runner: *tests/test262-runner.test.ts* checks that module requests carry
    the unmodified body and the harness Script.
 -  Native: the *tests/fixtures/module-prelude-script/* scenario in
    *tests/native/scenarios/shard-2.ts* matches Node.js and Deno under
    forced collection with both specialization policies, and reports a
    throw at the prelude's top level or in a prelude function at the
    Script's own location.
 -  Runner: a rejected harness Script keeps its virtual identity and is
    classified as a harness failure rather than aborting the run; a
    harness diagnostic never satisfies a module negative or reports an
    unsupported capability.
 -  Generated: *tests/property/m5-module-prelude-script.property.test.ts*
    (seed block `0x60009100`) varies the prelude declaration, the observing
    module, its shadowing binding, the operation, and its position. It
    passed at the ordinary budget and at ten times that budget on the Zig
    lane, and at the ordinary budget on the host-cc lane.

A focused observation of the owned path through `executeTest262Case` with
the runner's harness and a native CLI executor passed both specialization
variants on `linux-x86_64-gnu` with the Zig toolchain. This is a
precheck, not a reviewed manifest record.


Manifest impact
---------------

Every reviewed module record's entry `sourceHash` changes, because the
entry is now the upstream body without the harness, and the positions in
recorded module diagnostics lose the harness line offset. The change
touches *packages/* and *tools/*, so the scoped manifest update cannot
admit it; it needs `mise run test262:update`. A module case that declares
a harness name at top level no longer collides with the harness; the
update, not this note, decides each such case's classification.
