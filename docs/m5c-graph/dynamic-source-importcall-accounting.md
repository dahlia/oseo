ImportCall-subject dynamic import accounting
============================================

This record backs the M5c graph node `dynamic-source-importcall-accounting`
(DS-1). The maintainer decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*), item 2, extends the 2026-10-22
import-attributes accounting decision (option A) to dynamic import paths whose
normative subject is ImportCall itself, including EvaluateImportCall and
ContinueDynamicImport. Item 4 approves this node as DS-1 of the
`dynamic-source-coverage-remediation` split; the umbrella lands when it owns
zero paths.


Selection rule
--------------

The observation train for `observation-batch-19`, `observation-batch-20`,
and `observation-batch-30` adds 393 observed OSEO1001 ImportExpression
rejections to the umbrella: 3 from batch 20 and 390 from batch 30. Their
sorted path set, with one final newline, has SHA256
`5009fc2b4fb24aa21e174e3da6aed28219f5e78ef01a3389b0ec7ec78ac55823`. The
umbrella owns these paths once those batches land. This node does not depend on
the batches, because the umbrella shares manifest collision groups with them;
it selects nothing before they land, and its landing must follow theirs.

Of those, 382 lie under *test/language/expressions/dynamic-import/*:
*syntax/* 66, *catch/* 112, *usage/* 90, *assignment-expression/* 27,
*namespace/* 61, and 26 files directly in the directory. Candidates for this
node are the paths outside *namespace/*. A candidate is selected only when a
path-by-path reviewed assessment of its description, normative section, and
assertions confirms that ImportCall is the normative subject and bounds the
assertions to source evaluation, as the PLAN-M5C.md ImportCall rule requires.
A directory name, an `esid`, or a feature tag alone does not qualify.

A candidate whose subject is module evaluation order, top-level await, a
module namespace object, or JSON module identity belongs to
`dynamic-source-module-semantics` (DS-2). A candidate whose assessment
finds another unresolved non-source subject stays with the umbrella. The
exact selected count is not known before the assessment.


Evidence obligations
--------------------

 -  Each selected path moves to `adr:0016-dynamic-source-boundary` with a
    reviewed exclusion-audit record with fresh source and observation
    digests, as ADR 0019 and PLAN-M5C.md require.
 -  Audit records and ledger owners only; no product change.
 -  Keep all 41,091 inventory paths and count none as a pass.
 -  The exclusion reopens when an accepted ADR 0016 amendment admits any form
    of dynamic import. A later pass or expected negative takes the
    observation owner, and a still unsupported path needs a fresh assessment.
 -  This approves no dynamic import implementation. ADR 0016 and ADR 0019
    remain unchanged.
 -  Split review scopes by subdirectory: *syntax/*, *catch/*, *usage/*,
    *assignment-expression/*, and the directory's own files.
