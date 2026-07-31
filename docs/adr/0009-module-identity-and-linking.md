ADR 0009: Canonical module identity and linking
===============================================

Status
------

Accepted and implemented for M4.


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
returns a promise and generated continuation instead of blocking the next
independent sibling. An importer evaluator waits for every asynchronous
dependency. Asynchronous cycles remain outside M4 and receive an owned
diagnostic.


Consequences
------------

Compiler core can test graph semantics without filesystem access. Native code
receives a closed, deterministic graph. Package resolution and loading policy
remain replaceable host concerns.

Module evaluation state remains explicit even though every evaluator and live
cell is linked into one native executable. Synchronous cycles retain their
source order, while an asynchronous dependency does not serialize unrelated
siblings.

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
