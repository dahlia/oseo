Reduce Array generated property native cost
===========================================

Removes the native cost growth of the ordinary Array generated property suite
(macOS 40.3 s to 173 s against its 180 s interrupt) without lowering cases,
seeds, generator domains or the interrupt.

This ready, unlanded node owns no test262 path yet. It depends on
`unsupported-ownership-audit` and is an `m5-exit-audit` prerequisite.

| Evidence                                  | Pointer                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Root decision and measured job identities | ~/.local/state/oseo-m5c/decisions/done/20261027-array-ordinary-property-mac-budget.md |
| Raw candidate failure logs                | /data/m5c-regexp-source-finisher-20261027/candidate-ci/                               |

The ordinary property passed in 40.3 seconds before Array and 173.0
seconds after it on hosted macOS; one candidate attempt interrupted at
180 seconds after 11 of 12 cases. The diagnostic is the property interrupt,
not a semantic counterexample. Generated C size is a lead, not established
causation. Preserve cases, seeds, generator domains and the interrupt, and
measure the remedy on the same lane. No observation or product repair is
claimed by this graph addition.
