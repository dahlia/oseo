Reduce Array generated property native cost
===========================================

This node targets the native cost growth of the ordinary Array generated
property suite (macOS 40.3 s to 173 s against its 180 s interrupt) without
lowering cases, seeds, generator domains or the interrupt.

This ready, unlanded node owns no test262 path yet. It depends on
`unsupported-ownership-audit` and is an `m5-exit-audit` prerequisite.

| Evidence                                  | Pointer                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Root decision and measured job identities | ~/.local/state/oseo-m5c/decisions/done/20261027-array-ordinary-property-mac-budget.md |
| Raw candidate failure logs                | /data/m5c-regexp-source-finisher-20261027/candidate-ci/                               |

The ordinary property passed in 40.3 seconds before the Array node landed
and 173.0 seconds after it on hosted macOS; one candidate attempt interrupted at
180 seconds after 11 of 12 cases. The diagnostic is the property interrupt,
not a semantic counterexample. Generated C size is a lead, not established
causation. Preserve cases, seeds, generator domains and the interrupt, and
measure the remedy on the same lane. No observation or product repair is
claimed by this graph addition.


Linux compiler profile, 2026-10-31
----------------------------------

This attempt produced no accepted cost remedy. Root requested a diagnostic-only
commit and a failed worker outcome after the best bounded prototype reduced
host-cc specimen compile-link time by about seven percent. Root did not accept
that partial improvement as completion of this node. Every experiment was
reverted; the node remains ready and unlanded.

The source was `main` commit
`1f3ade138ea7cbee80b2d62940e8f497db2bc1a2`. The node YAML and work note
reserve no test262 path, and the closure ledger and result partitions contain
no assignment to this cost node. No classification changed. The original
property, its indexed-lookup and mutation generators, case budget, seed and
interrupt remained unchanged. The rejected experiments from the earlier attempt
are retained at </data/m5c-arraycost-20261030/>; this attempt did not repeat
its arbitrary block packing or 1 MiB translation-unit budget.

The new diagnostic uses the first `fc.sample` draw at seed `0x60003f00`.
It compares complete output with the generator's independent expected-output
model under both specialization policies and forced collection. It is one
specimen, not a 12-case ordinary-property gate. All completed specimen
executions matched the model and retained the original allocation, collection,
guard-hit/miss, overflow and addition counters.

Source compilation took 18.6–46.5 ms, C emission 88.1–99.6 ms, and native
execution 178.7–182.1 ms in the initial Zig profile. The enabled program's
compile-link request took 1.271 seconds with the runtime archive available.
The first disabled compile-link request took 9.266 seconds with a cold Zig
cache; it is excluded from the paired comparisons below. Initial runtime
archive compilation was separately logged and is not charged to either
compile-link request.

Clang `-ftime-trace` records put approximately 70 percent of each substantial
unit's compiler time in LLVM backend/code-generation work. Disabled body
units contained 156, 168 and 164 functions; enabled units contained 286, 341
and 435. Source parsing and emission are smaller costs in this specimen.
The runtime is also smaller than compile-link time, so this attempt did not
change runtime algorithms. These measurements locate local compiler cost;
they do not establish the cause of the hosted macOS regression.

Three bounded experiments were measured and reverted:

 -  Single-entry regions combine only blocks with a single predecessor, while
    preserving the 16 KiB executable helper limit and shared joins. They add
    no multi-entry switch, unlike the earlier rejected arbitrary-packing
    experiment. An initial prototype failed C compilation because an entry
    label was missing. The corrected prototype supplied all paired samples.
 -  A shared static inline C helper combines generic environment lookup,
    its status check and the binding-cell read. Runtime calls and source
    locations remain intact; the prototype changes no runtime ABI.
 -  A 4 KiB executable helper limit replaces 16 KiB, with the original
    256 KiB translation-unit budget retained.

Each comparison uses three alternating baseline/candidate samples on Linux
AMD64, one heavy command at a time. The table reports median compile-link
wall time; negative reduction means regression.

| Experiment           | Lane    | Disabled baseline/candidate ms | Enabled baseline/candidate ms | Disabled/enabled reduction |
| -------------------- | ------- | -----------------------------: | ----------------------------: | -------------------------: |
| Single-entry regions | Zig     |                  1355.0/1287.6 |                 1316.0/1209.1 |                  5.0%/8.1% |
| Single-entry regions | host-cc |                  2659.8/2849.1 |                 3214.6/3324.1 |                -7.1%/-3.4% |
| Shared binding read  | host-cc |                  2572.1/2386.3 |                 3086.7/2878.1 |                  7.2%/6.8% |
| 4 KiB helpers        | host-cc |                  2674.3/2708.2 |                 3183.8/3202.2 |                -1.3%/-0.6% |

The packet at </data/m5c-arraycost2-20261031/REPORT.md> records the profile,
raw command/output directories and rejected patches. Its adjacent
*measurements.json* retains every sample, and *compiler-traces/* preserves
the compiler traces. The baseline adapter copies backend modules from the
exact base, changing only import paths, so each pair uses the same compiler,
runtime, generator and toolchain. The capacity wrapper selected a private
Zig cache, and every heavy run used the shared lock through
*run-gate.py* with `--wait-lock` in a detached launcher. Samples reused runtime
archives; desktop load and compiler-cache history were not held constant.
The three Zig pairs trend faster over time for both implementations, which
limits attribution of their modest difference.

The initial region prototype passed nine focused backend registrations,
including its additional structural check, but those checks missed the entry
label error. Corrected native specimen executions supplied its final evidence.
The other prototypes were process experiments, not accepted implementations. No
ordinary-property after-gate, product U, result R, internal review or test262
UPDATE resulted. The diagnostic commit runs the repository check with normal
hooks. Root retains Full UPDATE, candidate/macOS evidence and publication
decisions.


Follow-up scopes for Root
-------------------------

Reducing generated C per Array program is a compiler/backend investigation.
The expected effect is fewer LLVM operations and less per-program code
generation, rather than fewer JavaScript observations. Start with repeated
binding and property-operation emission. The binding-read prototype measured
about seven percent benefit from one small fusion on this host. Broader fusion
has unmeasured benefit and risks changing exception order, source locations,
live roots or specialization fallbacks. Preserve the original Array generator
and measure both policies and toolchains before accepting it.

Sharing additional generic native helpers across translation units is a
backend/runtime API investigation. Moving repeated call sequences to the
reusable runtime archive could reduce work compiled for every generated
program. The expected reduction is unmeasured. The risks are added runtime
call overhead, GC rooting and lifetime mistakes, and a changed private ABI;
this must remain native operation composition, with generic semantics intact.
The static inline binding-read experiment is evidence for a small common
sequence, not proof of the benefit of archive-level sharing.

A different optimization level for generated test executables is a toolchain
policy decision for the maintainer. Optimization might reduce the native
instruction volume that remains for machine-code generation and improve
execution, but could instead add enough LLVM optimization work to increase
compile time. It also changes what the native and sanitizer lanes test,
including stack/frame behavior and diagnostic coverage. This attempt changes
no compiler flag; any proposal needs separate lane evidence and maintainer
approval before adoption.
