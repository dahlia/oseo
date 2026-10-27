Expose harness globals to imported test modules
===============================================

Makes test262 harness bindings, which come from a global script, visible to
modules imported by a module test, so the 1 observed path whose imported module
calls assert can be observed.

The 1 paths below remain unreviewed in the closure ledger.
Root authorized this ready, unlanded owner on 2026-10-27. The saved API
observations used clean source `6aab0fc8`, tree
`d6723be80209aca0fcf0606c5c3e5959f152ad0c`; no path was re-observed here.
This node supplies no semantic repair or predicted promotion.

| Owned path                                                                                                                          | Exact observed diagnostic                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Raw result                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `test/language/module-code/ambiguous-export-bindings/namespace-unambiguous-if-export-star-as-from-and-import-star-as-and-export.js` | `test/language/module-code/ambiguous-export-bindings/namespace-unambiguous-if-export-star-as-from-and-import-star-as-and-export.js strict disabled failed (1): stdout="" stderr="file:///home/dahlia/.cache/aube/virtual-store/v1/test262@url+d1a1eda3d9511414-f632e209b459265d/node_modules/test262/test/language/module-code/ambiguous-export-bindings/namespace-unambiguous-if-import-star-as-and-export.js:79:1: error[OSEO2001]: ReferenceError: assert is not defined.\nOSEO_THROWN ReferenceError\n"` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/raw/case-477-result.json` |
