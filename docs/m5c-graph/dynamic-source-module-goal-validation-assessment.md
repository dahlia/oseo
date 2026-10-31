Module goal validation per-path assessment
==========================================

DS-11 reviews the exact 66-path selector linked from the node note at base
`362ddb13d933600f6a0543ac332eb8479be9053f`. Its SHA256 is
`ead48f16bf48e038a9c7fa82936033892184087a350aa384e9bf636c9bf28214`.
Every selected ledger row is unsupported and belongs to the umbrella at
that base. All 66 source bodies, frontmatter subjects and target fixture
graphs were read individually; repeated generated contexts are not an
additional exclusion selector.

The proposed accounting is 66 ADR 0016 exclusions, zero remaining selected
paths and zero passes. The umbrella therefore retains 884 of its original
950 paths after this change. These are reviewed-evidence candidates until
internal review completes, and neither that review nor accounting lands
this node. All 41,091 inventory paths and all original assertions remain.


Authority and the remaining source contract
-------------------------------------------

Decision items 1 and 2 of the 2026-10-28 scope decision govern this table.
Root confirmed their application to this exact proposal through Orca on
2026-10-31, question `msg_201edc9164aa`, answer `msg_77b09d3f8f25`:
static witnesses may cover each exact target error, while converting that
error into a rejected import promise is the excluded ImportCall contract.
This does not authorize treating a compiler rejection as an observed promise
rejection. Error identity, repeated imports, ordering and namespace state
would need separate evidence if asserted; none of these 48 catch bodies
asserts them. Their only error observation is `error.name === SyntaxError`.
The original awaited and async-generator contexts only route that rejection.

G, A and C below distinguish target-validation stages from that ImportCall
remainder. In particular, Module parsing errors precede linking, and
ResolveExport failures occur after successful parsing and before evaluation.
The static references report SyntaxError, while Oseo retains its own located
parse/link diagnostics. Those diagnostics are not native runtime errors.
No excluded operation is implemented or emulated by these witnesses.


Replacement witnesses
---------------------

All source witnesses are in
[*module-goal-validation-source.test.ts*](../../tests/module-goal-validation-source.test.ts).
Their graphs use the same declaration and export shapes as the pinned fixtures.
File suffixes/specifiers change to `.mjs` for unambiguous static reference
loading; the asserted bindings and resolution graphs do not change.

 -  G: the same `var smoosh; function smoosh() {}` parses as sloppy and
    strict Script, fails Module parsing, and fails as a statically loaded
    dependency. Node.js and Deno both report static SyntaxError before the
    importer evaluation marker runs. Oseo reports OSEO0001 at the target.
 -  A: two distinct modules export `var x`; a star-export aggregator is
    requested by an indirect named re-export. All sources parse, then Oseo
    linking rejects the ambiguous resolution under both policies without
    producing MIR. Node.js and Deno reject it with static SyntaxError before
    the importer marker runs. A namespace-only control admits the aggregator
    and omits ambiguous `x` from its namespace.
 -  C: two indirect re-exports of `x` point only to each other. All sources
    parse, then Oseo linking rejects the unresolvable circular binding under
    both policies without producing MIR. Node.js and Deno reject it with
    static SyntaxError before the importer marker runs. A productive cycle
    with one concrete `var x` links to the same cell in both modules.
 -  U: the exact target export values are `default: 42`, `x: Test262` and
    `z: 42`. A static namespace supplies them in each of the 18 original
    usage contexts, replacing only the excluded ImportCall with
    `Promise.resolve(namespace)`. The await/return/async-generator forms and
    the generator's asserted call count of one remain. No ordering assertion
    is added: the output comparison sorts the independent context lines.
    Structural evidence checks one target instance, three namespace names,
    three export cells and successful MIR construction. A separate Script
    prelude retains the Script-valid/Module-invalid var/function collision.

The U fixture files are
[*entry.mjs*](../../tests/fixtures/module-goal-validation/entry.mjs),
[*target.mjs*](../../tests/fixtures/module-goal-validation/target.mjs) and
[*prelude.js*](../../tests/fixtures/module-goal-validation/prelude.js).
[*module-goal-validation-native.test.ts*](../../tests/module-goal-validation-native.test.ts)
checks the 18 export observations, the generator count and 18 completions
against a fixed oracle in Node.js and Deno, then executes the static graph
after the Script under both native specialization policies. The test forces
collection at every safepoint for both native executions and restores the prior
environment afterward; it owns that forced-GC registration directly. Reference
execution of the positive fixture observes the static module; Oseo additionally
executes the separate Script prelude. G independently checks the shared
declaration's Script/Module grammar distinction.

There are 12 source registrations (including the three static reference
negative groups) and one native registration containing 18 context units.
No shared property domain, seed, budget or native fixture list changes.
These focused checks do not replace Root's full Node.js, Deno and native
candidate suites or macOS execution. Subset and results stay unchanged, and
no UPDATE is needed because these additive tests do not alter the runner's
implementation or its data/import closure.


Focused observations
--------------------

The 2026-10-31 Linux focused native command was
`node --test tests/module-goal-validation-native.test.ts`, run through the
capacity wrapper and shared heavy lock. It exited naturally with zero:
one registration passed, with no failures, skips or cancellations. Its
body checked the fixed positive output in Node.js and Deno and in both
native specialization policies with forced collection. Raw stdout, stderr
and capacity/timing metadata are in
*/data/m5c-ds11-20261031/checks/native-focused.{stdout,stderr,json}*.
The run lasted 43.351 seconds, from 01:07:22 to 01:08:05 UTC. The fixture
and native-test digests bound in the exclusion audit name the inputs that
ran; no compiler or runtime product input changed. This is Linux author
evidence, without macOS or full-candidate execution.

The source suite checks the three static negative reference groups under
Node.js and Deno and the independent Oseo parser/linker assertions. Its
focused output is in
*/data/m5c-ds11-20261031/source-tests-structural.log*; the final complete
non-native run is recorded in *fast-tests-final.log* in that directory.
The first broad non-native command ran before package build and failed
only to import the unbuilt compiler package for the existing parser suite;
its 123 other registrations passed. Building the workspace and rerunning
the parser suite passed all ten of its registrations. That setup failure
is retained in *fast-tests.log*, not described as a successful full run.


Exact per-path decisions
------------------------

Paths below are relative to
*test/language/expressions/dynamic-import/*. Every row uses ADR 0016;
G/A/C leave only the ImportCall source loading/rejection contract, while U
leaves only Script-to-Module ImportCall loading and promise fulfillment.
The fresh source and normalized observation digests are recorded on each
original exclusion-audit row, with the replacement files bound by digest.

| Path                                                                                           | Normative non-source subject                                                             | Witness     | Decision and one-line reason                                                                                                  |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| *catch/nested-arrow-import-catch-eval-script-code-target.js*                                   | Script-valid var/function collision is a Module early SyntaxError                        | G           | Account: the same declaration succeeds as Script and fails as a Module dependency; only ImportCall rejection routing remains. |
| *catch/nested-arrow-import-catch-instn-iee-err-ambiguous-import.js*                            | IndirectExportEntries rejects an ambiguous star-export binding as SyntaxError            | A           | Account: the same four-module resolution graph fails statically; only ImportCall rejection routing remains.                   |
| *catch/nested-arrow-import-catch-instn-iee-err-circular.js*                                    | ResolveExport rejects a circular indirect binding with no concrete export as SyntaxError | C           | Account: the same two-module resolution cycle fails statically; only ImportCall rejection routing remains.                    |
| *catch/nested-async-arrow-function-await-eval-script-code-target.js*                           | Script-valid var/function collision is a Module early SyntaxError                        | G           | Account: the same declaration succeeds as Script and fails as a Module dependency; only ImportCall rejection routing remains. |
| *catch/nested-async-arrow-function-await-instn-iee-err-ambiguous-import.js*                    | IndirectExportEntries rejects an ambiguous star-export binding as SyntaxError            | A           | Account: the same four-module resolution graph fails statically; only ImportCall rejection routing remains.                   |
| *catch/nested-async-arrow-function-await-instn-iee-err-circular.js*                            | ResolveExport rejects a circular indirect binding with no concrete export as SyntaxError | C           | Account: the same two-module resolution cycle fails statically; only ImportCall rejection routing remains.                    |
| *catch/nested-async-arrow-function-return-await-eval-script-code-target.js*                    | Script-valid var/function collision is a Module early SyntaxError                        | G           | Account: the same declaration succeeds as Script and fails as a Module dependency; only ImportCall rejection routing remains. |
| *catch/nested-async-arrow-function-return-await-instn-iee-err-ambiguous-import.js*             | IndirectExportEntries rejects an ambiguous star-export binding as SyntaxError            | A           | Account: the same four-module resolution graph fails statically; only ImportCall rejection routing remains.                   |
| *catch/nested-async-arrow-function-return-await-instn-iee-err-circular.js*                     | ResolveExport rejects a circular indirect binding with no concrete export as SyntaxError | C           | Account: the same two-module resolution cycle fails statically; only ImportCall rejection routing remains.                    |
| *catch/nested-async-function-await-eval-script-code-target.js*                                 | Script-valid var/function collision is a Module early SyntaxError                        | G           | Account: the same declaration succeeds as Script and fails as a Module dependency; only ImportCall rejection routing remains. |
| *catch/nested-async-function-await-instn-iee-err-ambiguous-import.js*                          | IndirectExportEntries rejects an ambiguous star-export binding as SyntaxError            | A           | Account: the same four-module resolution graph fails statically; only ImportCall rejection routing remains.                   |
| *catch/nested-async-function-await-instn-iee-err-circular.js*                                  | ResolveExport rejects a circular indirect binding with no concrete export as SyntaxError | C           | Account: the same two-module resolution cycle fails statically; only ImportCall rejection routing remains.                    |
| *catch/nested-async-function-eval-script-code-target.js*                                       | Script-valid var/function collision is a Module early SyntaxError                        | G           | Account: the same declaration succeeds as Script and fails as a Module dependency; only ImportCall rejection routing remains. |
| *catch/nested-async-function-instn-iee-err-ambiguous-import.js*                                | IndirectExportEntries rejects an ambiguous star-export binding as SyntaxError            | A           | Account: the same four-module resolution graph fails statically; only ImportCall rejection routing remains.                   |
| *catch/nested-async-function-instn-iee-err-circular.js*                                        | ResolveExport rejects a circular indirect binding with no concrete export as SyntaxError | C           | Account: the same two-module resolution cycle fails statically; only ImportCall rejection routing remains.                    |
| *catch/nested-async-function-return-await-eval-script-code-target.js*                          | Script-valid var/function collision is a Module early SyntaxError                        | G           | Account: the same declaration succeeds as Script and fails as a Module dependency; only ImportCall rejection routing remains. |
| *catch/nested-async-function-return-await-instn-iee-err-ambiguous-import.js*                   | IndirectExportEntries rejects an ambiguous star-export binding as SyntaxError            | A           | Account: the same four-module resolution graph fails statically; only ImportCall rejection routing remains.                   |
| *catch/nested-async-function-return-await-instn-iee-err-circular.js*                           | ResolveExport rejects a circular indirect binding with no concrete export as SyntaxError | C           | Account: the same two-module resolution cycle fails statically; only ImportCall rejection routing remains.                    |
| *catch/nested-async-gen-await-eval-script-code-target.js*                                      | Script-valid var/function collision is a Module early SyntaxError                        | G           | Account: the same declaration succeeds as Script and fails as a Module dependency; only ImportCall rejection routing remains. |
| *catch/nested-async-gen-await-instn-iee-err-ambiguous-import.js*                               | IndirectExportEntries rejects an ambiguous star-export binding as SyntaxError            | A           | Account: the same four-module resolution graph fails statically; only ImportCall rejection routing remains.                   |
| *catch/nested-async-gen-await-instn-iee-err-circular.js*                                       | ResolveExport rejects a circular indirect binding with no concrete export as SyntaxError | C           | Account: the same two-module resolution cycle fails statically; only ImportCall rejection routing remains.                    |
| *catch/nested-async-gen-return-await-eval-script-code-target.js*                               | Script-valid var/function collision is a Module early SyntaxError                        | G           | Account: the same declaration succeeds as Script and fails as a Module dependency; only ImportCall rejection routing remains. |
| *catch/nested-async-gen-return-await-instn-iee-err-ambiguous-import.js*                        | IndirectExportEntries rejects an ambiguous star-export binding as SyntaxError            | A           | Account: the same four-module resolution graph fails statically; only ImportCall rejection routing remains.                   |
| *catch/nested-async-gen-return-await-instn-iee-err-circular.js*                                | ResolveExport rejects a circular indirect binding with no concrete export as SyntaxError | C           | Account: the same two-module resolution cycle fails statically; only ImportCall rejection routing remains.                    |
| *catch/nested-block-import-catch-eval-script-code-target.js*                                   | Script-valid var/function collision is a Module early SyntaxError                        | G           | Account: the same declaration succeeds as Script and fails as a Module dependency; only ImportCall rejection routing remains. |
| *catch/nested-block-import-catch-instn-iee-err-ambiguous-import.js*                            | IndirectExportEntries rejects an ambiguous star-export binding as SyntaxError            | A           | Account: the same four-module resolution graph fails statically; only ImportCall rejection routing remains.                   |
| *catch/nested-block-import-catch-instn-iee-err-circular.js*                                    | ResolveExport rejects a circular indirect binding with no concrete export as SyntaxError | C           | Account: the same two-module resolution cycle fails statically; only ImportCall rejection routing remains.                    |
| *catch/nested-block-labeled-eval-script-code-target.js*                                        | Script-valid var/function collision is a Module early SyntaxError                        | G           | Account: the same declaration succeeds as Script and fails as a Module dependency; only ImportCall rejection routing remains. |
| *catch/nested-block-labeled-instn-iee-err-ambiguous-import.js*                                 | IndirectExportEntries rejects an ambiguous star-export binding as SyntaxError            | A           | Account: the same four-module resolution graph fails statically; only ImportCall rejection routing remains.                   |
| *catch/nested-block-labeled-instn-iee-err-circular.js*                                         | ResolveExport rejects a circular indirect binding with no concrete export as SyntaxError | C           | Account: the same two-module resolution cycle fails statically; only ImportCall rejection routing remains.                    |
| *catch/nested-do-while-eval-script-code-target.js*                                             | Script-valid var/function collision is a Module early SyntaxError                        | G           | Account: the same declaration succeeds as Script and fails as a Module dependency; only ImportCall rejection routing remains. |
| *catch/nested-do-while-instn-iee-err-ambiguous-import.js*                                      | IndirectExportEntries rejects an ambiguous star-export binding as SyntaxError            | A           | Account: the same four-module resolution graph fails statically; only ImportCall rejection routing remains.                   |
| *catch/nested-do-while-instn-iee-err-circular.js*                                              | ResolveExport rejects a circular indirect binding with no concrete export as SyntaxError | C           | Account: the same two-module resolution cycle fails statically; only ImportCall rejection routing remains.                    |
| *catch/nested-else-import-catch-eval-script-code-target.js*                                    | Script-valid var/function collision is a Module early SyntaxError                        | G           | Account: the same declaration succeeds as Script and fails as a Module dependency; only ImportCall rejection routing remains. |
| *catch/nested-else-import-catch-instn-iee-err-ambiguous-import.js*                             | IndirectExportEntries rejects an ambiguous star-export binding as SyntaxError            | A           | Account: the same four-module resolution graph fails statically; only ImportCall rejection routing remains.                   |
| *catch/nested-else-import-catch-instn-iee-err-circular.js*                                     | ResolveExport rejects a circular indirect binding with no concrete export as SyntaxError | C           | Account: the same two-module resolution cycle fails statically; only ImportCall rejection routing remains.                    |
| *catch/nested-function-import-catch-eval-script-code-target.js*                                | Script-valid var/function collision is a Module early SyntaxError                        | G           | Account: the same declaration succeeds as Script and fails as a Module dependency; only ImportCall rejection routing remains. |
| *catch/nested-function-import-catch-instn-iee-err-ambiguous-import.js*                         | IndirectExportEntries rejects an ambiguous star-export binding as SyntaxError            | A           | Account: the same four-module resolution graph fails statically; only ImportCall rejection routing remains.                   |
| *catch/nested-function-import-catch-instn-iee-err-circular.js*                                 | ResolveExport rejects a circular indirect binding with no concrete export as SyntaxError | C           | Account: the same two-module resolution cycle fails statically; only ImportCall rejection routing remains.                    |
| *catch/nested-if-import-catch-eval-script-code-target.js*                                      | Script-valid var/function collision is a Module early SyntaxError                        | G           | Account: the same declaration succeeds as Script and fails as a Module dependency; only ImportCall rejection routing remains. |
| *catch/nested-if-import-catch-instn-iee-err-ambiguous-import.js*                               | IndirectExportEntries rejects an ambiguous star-export binding as SyntaxError            | A           | Account: the same four-module resolution graph fails statically; only ImportCall rejection routing remains.                   |
| *catch/nested-if-import-catch-instn-iee-err-circular.js*                                       | ResolveExport rejects a circular indirect binding with no concrete export as SyntaxError | C           | Account: the same two-module resolution cycle fails statically; only ImportCall rejection routing remains.                    |
| *catch/nested-while-import-catch-eval-script-code-target.js*                                   | Script-valid var/function collision is a Module early SyntaxError                        | G           | Account: the same declaration succeeds as Script and fails as a Module dependency; only ImportCall rejection routing remains. |
| *catch/nested-while-import-catch-instn-iee-err-ambiguous-import.js*                            | IndirectExportEntries rejects an ambiguous star-export binding as SyntaxError            | A           | Account: the same four-module resolution graph fails statically; only ImportCall rejection routing remains.                   |
| *catch/nested-while-import-catch-instn-iee-err-circular.js*                                    | ResolveExport rejects a circular indirect binding with no concrete export as SyntaxError | C           | Account: the same two-module resolution cycle fails statically; only ImportCall rejection routing remains.                    |
| *catch/top-level-import-catch-eval-script-code-target.js*                                      | Script-valid var/function collision is a Module early SyntaxError                        | G           | Account: the same declaration succeeds as Script and fails as a Module dependency; only ImportCall rejection routing remains. |
| *catch/top-level-import-catch-instn-iee-err-ambiguous-import.js*                               | IndirectExportEntries rejects an ambiguous star-export binding as SyntaxError            | A           | Account: the same four-module resolution graph fails statically; only ImportCall rejection routing remains.                   |
| *catch/top-level-import-catch-instn-iee-err-circular.js*                                       | ResolveExport rejects a circular indirect binding with no concrete export as SyntaxError | C           | Account: the same two-module resolution cycle fails statically; only ImportCall rejection routing remains.                    |
| *usage/nested-arrow-assignment-expression-eval-script-code-host-resolves-module-code.js*       | Script-valid caller and Module default/named/aliased export reads                        | U, usage-01 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
| *usage/nested-arrow-import-then-eval-script-code-host-resolves-module-code.js*                 | Script-valid caller and Module default/named/aliased export reads                        | U, usage-02 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
| *usage/nested-async-arrow-function-await-eval-script-code-host-resolves-module-code.js*        | Script-valid caller and Module default/named/aliased export reads                        | U, usage-03 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
| *usage/nested-async-arrow-function-return-await-eval-script-code-host-resolves-module-code.js* | Script-valid caller and Module default/named/aliased export reads                        | U, usage-04 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
| *usage/nested-async-function-await-eval-script-code-host-resolves-module-code.js*              | Script-valid caller and Module default/named/aliased export reads                        | U, usage-05 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
| *usage/nested-async-function-eval-script-code-host-resolves-module-code.js*                    | Script-valid caller and Module default/named/aliased export reads                        | U, usage-06 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
| *usage/nested-async-function-return-await-eval-script-code-host-resolves-module-code.js*       | Script-valid caller and Module default/named/aliased export reads                        | U, usage-07 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
| *usage/nested-async-gen-await-eval-script-code-host-resolves-module-code.js*                   | Script-valid caller and Module default/named/aliased export reads; callCount = 1         | U, usage-08 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
| *usage/nested-async-gen-return-await-eval-script-code-host-resolves-module-code.js*            | Script-valid caller and Module default/named/aliased export reads                        | U, usage-09 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
| *usage/nested-block-import-then-eval-script-code-host-resolves-module-code.js*                 | Script-valid caller and Module default/named/aliased export reads                        | U, usage-10 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
| *usage/nested-do-while-eval-script-code-host-resolves-module-code.js*                          | Script-valid caller and Module default/named/aliased export reads                        | U, usage-11 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
| *usage/nested-else-import-then-eval-script-code-host-resolves-module-code.js*                  | Script-valid caller and Module default/named/aliased export reads                        | U, usage-12 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
| *usage/nested-function-import-then-eval-script-code-host-resolves-module-code.js*              | Script-valid caller and Module default/named/aliased export reads                        | U, usage-13 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
| *usage/nested-if-braceless-eval-script-code-host-resolves-module-code.js*                      | Script-valid caller and Module default/named/aliased export reads                        | U, usage-14 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
| *usage/nested-if-import-then-eval-script-code-host-resolves-module-code.js*                    | Script-valid caller and Module default/named/aliased export reads                        | U, usage-15 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
| *usage/nested-while-import-then-eval-script-code-host-resolves-module-code.js*                 | Script-valid caller and Module default/named/aliased export reads                        | U, usage-16 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
| *usage/syntax-nested-block-labeled-eval-script-code-host-resolves-module-code.js*              | Script-valid caller and Module default/named/aliased export reads                        | U, usage-17 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
| *usage/top-level-import-then-eval-script-code-host-resolves-module-code.js*                    | Script-valid caller and Module default/named/aliased export reads                        | U, usage-18 | Account: static namespace reproduces all three reads in this context; G retains the caller grammar distinction.               |
