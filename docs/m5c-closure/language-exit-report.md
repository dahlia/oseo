Language exit report
====================

All *PLAN-LANGUAGE.md* units are implemented and observed. The plan is
complete. This report measures
Oseo's profile under [ADR 0032](../adr/0032-post-m5-edition-boundary.md):
ECMAScript 2026 plus explicit resource management, joint iteration, and
`Atomics.pause` from ECMAScript 2027, with Annex B except `[[IsHTMLDDA]]`.
The [language profile](../language-profile-es2026.md) defines its behavior
and evidence; [*PLAN-LANGUAGE.md*](../../PLAN-LANGUAGE.md) defines its scope.

Every included path is reviewed. None is a semantic, harness, or infrastructure
failure, and no work unit or remediation owner retains a path. Measured residue
is deferred by name to *PLAN-DYN.md*. Deferred paths count neither as passing,
excluded, nor closed. This is not unqualified ECMA-262 conformance: ADR 0016
retains the dynamic-source boundary, and ADR 0019 requires a separate label
gate with an empty deferral list.


Coverage
--------

These counts come from
`mise run check:language-claim-audit --require-closed --print` on the final
implementation tree `d57e59657`. The terminal flag rejects any unreviewed or
remediation-owned path. `mise run report:language-coverage` reproduces the
coverage tables. The [M5 exit report](./m5-exit-report.md) retains the frozen
41,091-path measurement; percentages for this profile use 43,007.

All inputs use test262 revision `f2d1435644797268dca1f7988cad5a4e89ccd8d2`.

| Input                                |  Paths |
| ------------------------------------ | -----: |
| Applicable inventory, included paths | 43,007 |
| Reviewed subset                      | 43,007 |
| Reviewed manifest                    | 43,007 |

Every included path has exactly one closure ledger state:

| State                       |  Paths |
| --------------------------- | -----: |
| Pass                        | 36,408 |
| Expected negative           |  4,480 |
| Unsupported profile feature |  2,119 |
| Semantic failure            |      0 |
| Harness failure             |      0 |
| Infrastructure failure      |      0 |
| Unreviewed                  |      0 |

Every included path has exactly one disposition. The deferred paths are
counted neither as closed nor as excluded.

| Disposition                                      |  Paths |
| ------------------------------------------------ | -----: |
| Closed by a reviewed pass or expected negative   | 40,888 |
| Unsupported, covered by an authorized exclusion  |  2,062 |
| Unsupported, named in the ADR 0031 deferral list |     57 |
| Unsupported, owned by remediation                |      0 |
| Unsupported, without an owner                    |      0 |
| Unreviewed, owned by a work unit                 |      0 |

Open paths by owner:

| Owner | Unreviewed | Remediation |
| ----- | ---------: | ----------: |
| Total |          0 |           0 |

Authorized exclusions by accepted record:

| Authorizing record                                                                     | Paths |
| -------------------------------------------------------------------------------------- | ----: |
| [ADR 0016: Dynamic source evaluation boundary](../adr/0016-dynamic-source-boundary.md) | 2,062 |
| Total                                                                                  | 2,062 |

Named deferrals by family:

| Deferral family           | Inherited by                       | Paths |
| ------------------------- | ---------------------------------- | ----: |
| `run-time-source`         | [*PLAN-DYN.md*](../../PLAN-DYN.md) |    54 |
| `static-specifier-import` | [*PLAN-DYN.md*](../../PLAN-DYN.md) |     3 |
| Total                     |                                    |    57 |


Authorized exclusions
---------------------

[ADR 0016](../adr/0016-dynamic-source-boundary.md) owns all 2,062 exclusions.
The [exclusion audit](./exclusion-audit.md) binds each to its pinned source,
reviewed observation, accepted authorization, and reopening conditions.
No ADR 0013 or ADR 0028 exclusion remains. The optional legacy `caller`
contract follows [ADR 0034](../adr/0034-legacy-function-caller-contract.md).

Dynamic source remains outside the profile except for the admitted literal
`import()` subset. Its transitive closure must resolve, load, parse, link, and
compile during the build. The 64 load, parse, and link failure rows and the
23 refused literal-specifier rows are ADR 0016 exclusions. Their build
diagnostics establish no runtime promise rejection or passing assertion.
The latter assessment records the maintainer default of 2026-11-06.

The record reopens for target-package demand, an acceptable staged-compilation
probe, or a WinterTC conformance requirement. Its static-import triggers also
cover computed specifiers or attributes, asynchronous-cycle ordering, host
loading requirements, and rooting or target evidence. ADR 0019 retains the
non-source normative-dependence trigger.


Named deferrals
---------------

[*deferrals.yaml*](./deferrals.yaml) contains 57 paths, all inherited by
[*PLAN-DYN.md*](../../PLAN-DYN.md). The 54 `run-time-source` entries concern
contracts that require runtime compilation, including direct-eval declarations
and the `Function` constructor's argument conversion. The three
`static-specifier-import` entries are *usage-from-eval.js*,
*eval-rqstd-once.js*, and *update-to-dynamic-import.js*. They need `eval` or
`Function` construction before their import assertions can run.

All 57 paths belong to the 74-entry list received by the maintainer on
2026-11-02, as the M5 exit report records, with no objection within the
coordination wait period. Seventeen entries are observation-closed: 16 passes
and the expected negative in *await-dynamic-import-rejection.js*. No entry is
new, no entry is outside dynamic source, and no new notice is needed. The
three surviving import entries have updated reasons reflecting the admitted
literal-import support; their remaining dependency is still dynamic source.


Evidence and audit scope
------------------------

The terminal claim audit validates revision agreement, unique path coverage,
matching subset and manifest classifications, zero failures, accepted owners,
and agreement between the ledger, exclusion audit, and deferral list.
The ledger has 40,888 observation-owned paths and 2,119 unsupported paths,
partitioned into the exclusions and deferrals above.

All 18 non-dynamic `caller` rows pass. The five dynamic-source caller rows
remain ADR 0016 exclusions. All 34,778 passes from the M5 exit manifest at
`0423ae072a847e73a74f8dab4dcf81a2de59b38e` remain passes, by a path-by-path
comparison with the current manifest. The compatibility ratchet enforces the
same rule on every later change.

All 21 successor-family records assess the eight required evidence classes.
The evidence-lane validator checks them alongside the 149 M5 records.
Every behavior in the plan's Annex B table has fixed, differential, and
standards evidence. In particular, *tests/annexb-legacy-literals.test.ts*
compares the Script, strict, and Module boundaries with Node.js and Deno;
*tests/native/fixtures/annexb-legacy-literals.ts* supplies fixed values and
native differential cases registered in *tests/native.ts*. The
`annexb-syntax` record names their reviewed numeric and string standards rows.
Reference-host departures use the edition expectations identified in the
family records; evidence for unsupported host features uses the recorded
replacement models.


Clean-checkout gate
-------------------

`mise run check`, `mise run test`, and `mise run test:property:extended`
passed on Linux AMD64 from a clean checkout of commit
`d57e59657dd26dcf8a4e7b78f9bed294856999fc`, the last implementation landing.
This report's landing commit changes only documentation, and the candidate
and main CI runs of `d57e59657` repeat the ordinary and extended gates on
macOS AArch64 and the AArch64 Linux cross-link. The two `todo` results of the
Zig sanitizer activity test are the documented Zig 0.16 limitation in
[*sanitizer-activity.md*](../sanitizer-activity.md).

The plan's exit criteria hold.
