Compound assignment property cost
=================================

This ready, unlanded node owns no test262 paths. Root authorized it on
2026-10-27 as a bounded prerequisite of the M5 exit audit, depending on
`unsupported-ownership-audit`.

The measured runs are `40401101765`, `40442491966` and `40454201429`.
In their Linux native support shard `2/7`, the single property file
`tests/property/m5-compound-assignment.property.test.ts` took
4,136–4,376 seconds, matching the shard wall within one second. The
Linux sanitizer property shard `2/3` took 26–36 minutes. These are
retained CI measurements, not new executions in this worktree.

| Evidence                                                 | Pointer                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| Root decision, run identities and measurements           | ~/.local/state/oseo-m5c/decisions/done/ci-capacity-macrun-and-compound.md |
| Sanitizer placement evidence referenced by that decision | ~/.local/state/oseo-m5c/decisions/done/ci-sanitizer-property-backstop.md  |

The two fixed computed-member and compound-member tests and the generated
compound-member test dominate the file. File-level partitioning cannot
split this tail. The bounded remedy is to split the fixed tests into
separately reviewed property files, with the compatibility ratchet and
language-profile records updated, or reduce their native compile cost.
Preserve every case count, seed and budget. This node changes no generator,
runner, observation, implementation or interrupt limit by itself.
