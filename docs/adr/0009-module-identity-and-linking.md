ADR 0009: Canonical module identity and linking
===============================================

Status
------

Accepted and implemented for M4 and M5a.


Context
-------

Whole-graph compilation needs one stable module instance for every resolved
source. Path aliases, cycles, star exports, and host loading order must not make
binding identity or evaluation order accidental.


Decision
--------

Compiler core owns a host-neutral graph builder. A host loader returns source
for a canonical URL, while a resolver maps one importer URL and source
specifier to another canonical URL or an owned diagnostic. Neither interface
consults ambient process state.

The graph records canonical URL, source hash, ordered dependencies, imports,
exports, and source locations. Canonical URL is module identity. Duplicate
spellings collapse before parsing a second instance.

Linking resolves exports before code generation. Instantiation allocates traced
cells for every local export before evaluation. Imports retain cell references.
Tarjan strongly connected components make cycles inspectable. Dependencies and
members retain source order, with canonical URL as the deterministic tie break
where source order cannot distinguish them.

Each module body lowers to a private evaluator after graph-wide instantiation.
Dependency-ready evaluators start in source order. A top-level suspension
returns a promise and traced module continuation instead of blocking the next
independent sibling. An importer evaluator waits for every asynchronous
dependency. M5a Unit 7.7 admits asynchronous strongly connected components:
an evaluator waits for already-visited dependencies in its own component,
ignores a DFS back edge, and maps a dependency from outside a completed
asynchronous component to that component's cycle-root promise.


Consequences
------------

Compiler core can test graph semantics without filesystem access. Native code
receives a closed, deterministic graph. Package resolution and loading policy
remain replaceable host concerns.

Module evaluation state remains explicit even though every evaluator and live
cell is linked into one native executable. Synchronous and asynchronous cycles
retain dependency order, while an asynchronous dependency does not serialize
unrelated siblings. Every source module is still evaluated once under its
canonical identity.

Graph construction must diagnose missing, duplicate, and ambiguous exports
before native compilation. Source changes alter the recorded hash even when a
canonical URL is unchanged.


Alternatives
------------

Recursive host loading was rejected because host call order would define cycle
behavior. Normalized filesystem paths alone were rejected because they cannot
represent URL loaders or explicit in-memory graphs. Copying imported values was
rejected because it violates live binding semantics.


Replacement trigger
-------------------

Revisit the canonical URL representation if package or network resolution
proves that URL identity cannot express a required host policy. Preserve the
owned resolver boundary, one-instance rule, live cells, and deterministic graph
evidence in any replacement.

Amend or supersede this decision before admitting a non-source module such as a
static WebAssembly binary into the graph. That decision must define a
discriminated loader result and graph node while preserving canonical identity,
content digests, deterministic dependencies, and the one-instance rule across
module kinds.
