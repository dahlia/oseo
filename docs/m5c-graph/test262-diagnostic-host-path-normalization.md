Portable module runtime diagnostics
===================================

Scope
-----

This node repairs the test262 runner's recorded module source locations.
It owns exactly these two held B06 originals:

 -  *test/language/eval-code/indirect/export.js*;
 -  *test/language/eval-code/indirect/import.js*.

At base `8f4202628356e172e1b4093a371d086070619de3`, neither path occurs in
*tests/test262/subset.yaml* or the partitioned reviewed manifest. Both
ledger rows remain `unreviewed`, owned by `node:observation-batch-06`.
The raw observations and complete train scan remain linked from
[*observation-batch-06.md*](./observation-batch-06.md). They show runtime
`OSEO1001` String-eval rejections whose locations contain canonical file
URLs under the observing host's aube cache.


Implementation and evidence contract
------------------------------------

The runner retains the canonical-to-display identity map from its module
graph preparation. Each settled executor result uses that map to replace
only the source identifier of the first source-located Oseo diagnostic.
The entry uses its upstream test path; dependencies use the same
suite-relative identifiers as module-graph evidence. Exact graph
membership prevents rewriting an unrelated file with the same basename.
Virtual harness identities remain unchanged.

Normalization precedes variant comparison and classification. Diagnostic
code, line, column, message, continuation text, error-kind marker, stdout,
exit status and the executed flag keep their original values. The executor
result itself is not mutated. Script cases keep their existing behavior.
There is no truncation or line-checker relaxation.

The runner unit test covers distinct roots containing spaces and URL
metacharacters, entry and fixture locations, virtual and unknown sources,
and path-looking message, continuation and stdout data. Native integration
runs the two original pinned sources unchanged under distinct suite roots.
A dependency TypeError runtime negative exercises both specialization
policies and checks pre-error stdout and runtime-phase classification.
The temporary module trees belong to that integration test; no static
native fixture or property generator is added. Compiler lowering, runtime
semantics and normative language-profile records do not change.

ADR 0013, ADR 0016 and ADR 0019 remain unchanged. The String-eval rejection
continues to name an unsupported profile feature; this node admits no
source-evaluation capability or whole-path exclusion.


Validation and remaining gates
------------------------------

The runner suite passed 86 tests. Native portability integration passed all
three tests on Zig and again under the host C compiler's ASan/UBSan lane.
Both held originals were freshly executed from each distinct temporary
suite root; each retained its runtime String-eval rejection and one
strict, specialization-disabled variant. The dependency negative ran both
specialization policies with its TypeError identity and stdout intact.

The required fast repository run passed all 831 tests in 58 non-native
files. Its exact selection and excluded native suites are preserved with
the raw CHECK, runner and native results under
*/data/m5c-d17-20261031/hostpath/*. No UPDATE was run by this worker.

The capacity-wrapped `mise run check` passed; *check2.json* retains its
natural exit status. Internal review decisions are recorded with the run
evidence. Root owns D3, the exact-U UPDATE,
reviewed admission or reclassification, the outer gate and publication.
The two originals remain held until Root applies those decisions. This
preparation changes no subset, manifest, ledger owner or landed state.
