Reject escapes in the static contextual keyword
===============================================

Reject Unicode escapes in the static contextual keyword. The observed
parse-negative unexpectedly succeeds instead of reporting SyntaxError.

Focused observation on base `68b026bb8275b9b7ddd15b9bdd02ef90ef3b123f`,
native target `linux-x86_64-gnu`, found these failures. The original paths
remain unreviewed under observation-batch-23. This node registers the
repair; no product change or successful replacement is claimed.

 -  `test/language/statements/class/syntax/escaped-static.js`

Raw source hashes, runner scheduling and results are in
[Raw observations](/data/m5c-b23-b28-b29-b32-20261029/task_96812c4ba689/ctx_b3822e0f35ef/all-observations.json).
The first segment is `observations/`; the continuation is `continuation/`.
Repair and re-observe these exact originals before closing this dependency.


Implementation preparation on Main 1f3ade13
-------------------------------------------

The exact reservation is the one original path above. At this base it is
absent from the checked-in subset and result partitions, and the ledger
still records it as unreviewed under observation-batch-23. No classification,
expectation, ownership, inventory or landed state changes in this source
preparation.

Babel accepts an escaped `static` modifier and marks its class element
static. The frontend now checks the original tokens in each static
member's modifier region before converting either Script or Module source.
It reports `OSEO0001` over the escaped keyword, with UTF-8 byte offsets and
line/column locations. Earlier unsupported syntax cannot mask this error.
Escaped property names, computed keys and comment text keep their distinct
roles. Both compilation policies reject before producing HIR or MIR.

The fixed parser matrix covers each of the six letters in fixed-width and
braced Unicode escapes, declaration and expression forms, both source
goals, strict directives, ten member forms, nested classes, unsupported
syntax precedence, and accepted property-name controls.

Root's scope judgment also requires the valid ASI form: an escaped field
named `static`, a line terminator, then the next member. Babel's TypeScript
plugin instead consumes the escaped name as a modifier. A same-width
non-contextual-name probe identifies only genuine uninitialized class
fields, including line terminators in comments. The real parse makes their
semicolons explicit and restores original offsets before conversion.
Original source text, TypeScript hints, and property placement are retained;
strings, templates, comments and longer identifiers do not become fields.
The Babel AST stays inside the frontend.

The `class-static-keyword-asi` native fixture observes the instance
field, following instance and static methods, a comment-contained newline,
and numeric hints with string and fractional guard misses. The runner enables
forced collection for it under both policies and asserts positive collection
counts. The class property suite adds eight generated cases under seed
`0x60000b05`, inside its existing reserved block. Its original three domains,
seeds and case budgets remain. The new domain compares an independent
placement/addition model with Node.js, Deno and both native policies, with
forced collection on both paths. No new property file is added. The fixture
and the generated domain use JavaScript Script references with JSDoc hints.
Their opt-in wrappers indirectly evaluate the unchanged source in the
reference engines. Existing typed domains keep their original TypeScript
input route. No source evaluation capability is added to Oseo.

Early author attempts failed in reference parsing: Node's TypeScript loader
rejected the fixture's valid escaped-name ASI form, and Deno's JavaScript
loader rejected the new generated domain. Both internal reviewers reproduced
the latter failure under seed `0x60000b03`, replay `0:1:0:0:1:1:1`. Those
failed attempts do not establish passing property evidence. The repaired Script
route bypasses the reference loaders while keeping the original programs and
the independent oracle.

[Author checks and review artifacts](/data/m5c-d17-20261031/static-escape/)
retain the failed attempts and subsequent validation separately.

Root owns fresh test262 observation, admission of the original path, D3 and
publication. No runtime operation, specialization path, profile boundary or
ADR changes.


Root coordination before U2
---------------------------

Root's 2026-10-30T23:34Z ruling reserves `0x60000b05` for the ASI
property domain. Slots `0x60000b03` and `0x60000b04` belong to other class
nodes. The original author and review replay above remains historical;
the current domain uses the new slot with the same eight-case budget.

Root selected Full under D3 and authorized bootstrap admission of the one
owned original in U2, using fresh focused observations and canonical
manifest/ledger APIs. Root will run the combined Full after the semantic
bundle lands and owns R, the outer gate and publication. No UPDATE has
been run by this worker.
