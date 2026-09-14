Regular expression matcher backend selection
============================================

Status
------

Accepted for M5b.


Context
-------

Oseo already owns the regular expression pattern representation, ordered
matcher artifact, and executors on both sides of the compiler/runtime
boundary. That ordered matcher covers the complete admitted grammar and
defines choice order, captures, Unicode behavior, and resource failures.
Literal patterns are compiled into serialized matcher data during the build,
while dynamic patterns are compiled into the same artifact shape at run time.

The matcher probes compare that implementation with an automaton model and
PCRE2, and bound the size a direct generated-C path would have to fit. M5b
needs a backend decision before specialized matcher work becomes a dependency,
but the decision must not turn an unimplemented or unmeasured candidate into a
current fact.


Required contract
-----------------

The selected backend must preserve the owned ordered matcher as the semantic
authority for the whole admitted grammar. Any narrower path needs a proved
applicability boundary, the same match state and failure behavior, and a
fallback chosen before it can expose partial matcher state. State growth must
be bounded, and crossing that bound must select the fallback rather than
truncate behavior or exhaust the compiler.

Static and dynamic pattern compilation continue to produce an owned,
backend-neutral artifact. Dynamic construction cannot require executable
memory generation. Pattern text, flags, captures, Unicode inputs, resource
limits, and source locations remain Oseo-owned regardless of the execution
strategy selected for an artifact or region.


Alternatives considered
-----------------------

### Option A: owned ordered matcher only

Keep serialized instructions and the ordered executor as the only backend.
This has complete admitted coverage and the smallest architectural change, but
retains millions of ordered steps on regular adversarial patterns for which
the automaton model has a small configuration ceiling.

### Option B: external primary backend

Put PCRE2 behind an Oseo adapter and own its mismatches at that boundary. The
probe found grammar, capture-reset, character-class, flag, and newline
differences that no option mapping closes. It also left source-build evidence
for targets, sanitizers, Unicode pinning, licensing, and static linking open.
Choosing this option would still require substantial owned matching behavior.

### Option C: composed owned backend

Retain the ordered matcher for semantic authority and complete fallback, and
add an owned automaton path for patterns or regions proven regular. This aims
the narrower strategy at the measured worst cases without delegating
ECMAScript semantics or losing coverage.

### Option D: direct generated C as the primary backend

Lower matcher artifacts to generated C control flow as the primary static
path, with an owned fallback for dynamic patterns and cases outside the
lowering. This matches Oseo's closed-program direction, but no direct-C matcher
lowering exists and the probe therefore measured no implementation.

Postponing the choice would keep later optimization work behind the ordered
matcher boundary. It would also leave M5b without a selected strategy despite
the measured automaton opportunity and the maintainer decision this record is
intended to preserve.


Probe evidence
--------------

[*docs/regexp-matcher-probes.md*](../regexp-matcher-probes.md) records one run
of `mise run probe:regexp` over the reviewed 29-pattern corpus. It identifies
the host, tool versions, repetition counts, raw observations, derived values,
and the limits of that run. The checked-in corpus and probe implementation live
under *tools/regexp-probes/*, and *tests/regexp-probes.test.ts* keeps the
host-independent analysis reproducible in the ordinary gate.


Observed results
----------------

The ordered matcher accepts all 29 patterns. The modeled automaton path needs
the ordered fallback for four patterns containing a backreference or
lookaround. On `nested-quantifier`, the ordered matcher took 1,834,918 steps
where the simulation's configuration ceiling was 18; on `choice-graph`, it
took only 40 steps over 3,072 code units, so a second strategy has little to
remove from that ordinary case. A counted repetition also showed the state
growth that requires a compile-time size bound.

PCRE2 agreed with the owned matcher on 38 of 52 corpus cases, refused eight,
produced different captures on four, and a different outcome on two. Some of
those mismatches are ECMAScript grammar or semantic rules rather than tuning,
and PCRE2 reproduced the ordered engine's exponential growth on the nested
quantifier even while outperforming the owned matcher on other cases.

The code-size probe measured 1,149 bytes of executable per existing literal
site. That is a budget for a future direct-C path, not a direct-C result. No
automaton or direct-C lowering was built or executed. Native stack use,
failure cleanup, the owned cost of closing external mismatches, the CRLF
boundary, and source-built PCRE2 target and policy facts also remain
unmeasured.


Decision
--------

Select option C, the composed owned backend, for M5b. The existing ordered
matcher remains the semantic authority and complete fallback. A later M5b
implementation may select an owned automaton path only for a pattern or region
whose regularity and bounded state space it proves before execution; all other
work continues through the ordered artifact and executor.

This decision records the backend composition and does not implement the
automaton. At this record's acceptance, serialized instructions interpreted by
the ordered executor remain the only executable matcher path. No external
engine is selected or linked.

After M5b, option D is the preferred long-term direction: direct generated C
should become the primary backend for static matcher artifacts when a reviewed
lowering and measurements justify it. That preference is not the M5b backend,
does not authorize direct-C work in this node, and does not change the owned
fallback required for dynamic patterns or unsupported lowering cases.


Consequences
------------

The matcher artifact stays owned and backend-neutral. Future composed-backend
work adds an explicit strategy choice and structural evidence for its
regularity proof, state bound, and ordered fallback. Generated, differential,
forced-collection, and standards evidence compare every selected automaton
path with the ordered authority before it is admitted.

This decision changes no RegExp semantics, runtime ABI, component, generated
code entry point, test262 row, evidence record, or property seed. Delivery item
8 remains open for the measurements its probe report names. The missing
external-component evidence does not become optional, and the absent direct-C
measurement is why option D remains a post-M5b direction rather than a current
backend.


Failure modes and replacement triggers
--------------------------------------

Revisit the M5b composition if an automaton applicability proof cannot preserve
choice, captures, Unicode behavior, resource failure, or a bounded build. Fall
back to the ordered matcher whenever a pattern or region cannot meet that
proof. Revisit the external-component alternative only with exact semantic
coverage and the source-built target, sanitizer, Unicode, license, thread,
locale, and static-link evidence the probe report leaves open.

After M5b, a measured direct-C implementation may supersede the primary
strategy. It must stay within the recorded compilation and code-size budgets,
preserve the backend-neutral artifact boundary, compare with the ordered
authority, and retain an owned fallback for dynamic patterns and unsupported
lowering cases.


Links
-----

[*PLAN-REGEXP.md*](../../PLAN-REGEXP.md) owns matcher representation,
evidence, and delivery order. [*PLAN-BACKEND.md*](../../PLAN-BACKEND.md) owns
the program code-generation decision.
[*docs/regexp-matcher-probes.md*](../regexp-matcher-probes.md) is the
measurement record this decision reads.
