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


Static import attributes and JSON modules
-----------------------------------------

The bounded M5c admission accepts static `with` clauses and JSON modules.
Dynamic import and its options remain outside this admission under ADR 0016.
The pinned prerequisite cohort has 24 static paths and 65 dynamic-boundary
observation candidates; its 89 paths do not imply dynamic semantic coverage.

Attributes are owned, source-located request metadata. The closed file host
supports the `type` key with value `json`; unsupported keys and type values
produce resolution diagnostics. Every request is validated before canonical
URL deduplication, including repeated requests and requests through aliases.
Bindings in one syntactic request share its resolution diagnostic. Distinct
source sites are validated separately even when their URLs match. A cached
loader failure is reported once per canonical module.
An empty clause and an absent clause select ordinary JavaScript. The file
host requires the JSON type for a *.json* dependency and rejects that type
for a JavaScript file. Other hosts may implement their own media policy.

Loader results and graph nodes distinguish JavaScript and JSON. Both retain
canonical URL identity and the digest of the original content. JSON files
remove leading U+FEFF characters before grammar validation, while their
digest still identifies the original file content. Interior U+FEFF data,
JavaScript files, and custom loader text remain unchanged. JSON entry
modules remain unsupported and receive an entry diagnostic. JSON nodes
have no dependencies and expose only a default export. Graph construction
validates JSON grammar before any native execution, so malformed JSON is a
resolution-time `SyntaxError`. Named JSON imports use the existing missing
export diagnostic. No parser AST crosses the compiler boundary.

The compiler converts validated JSON values to owned generic construction
operations before any JavaScript evaluator starts. Synthetic linking
initializes each default cell to `undefined`; its scheduled evaluation
publishes the prepared value. A source cycle can observe `undefined`
before that evaluation, and a suspended observer can resume after publication.
Object keys are data properties, including
`__proto__`; arrays and objects remain extensible. Construction never reads
the mutable global `JSON.parse` property. Existing traced cells, namespaces,
and generic allocation safepoints retain the value through aliases, cycles,
and collection. The backend receives ordinary MIR and needs no JSON loader,
source evaluator, or bootstrap runtime in the native artifact.

This amendment authorizes only static JSON modules. Revisit it before another
non-source kind, import phase, or runtime source-loading policy is admitted.


The import.meta object
----------------------

M5c node `import-meta` admits `import.meta` in Module code. Each module that
reads it owns one hidden cell, initialized with a new ordinary object
during graph-wide instantiation, before any module function initializer
runs. ECMA-262 2025 creates the object on the first evaluation instead, but
the closed module host defines no HostGetImportMetaProperties entries and no
HostFinalizeImportMeta step, so creation runs no code and its timing is not
observable. Creating it early keeps a hoisted function that a cyclic
dependency calls before its own module evaluates on the same object.

The object is extensible, its \[\[Prototype]] is null, and it has no own
properties. The canonical URL stays a build-time identity: Oseo does not
expose it, a file path, or a resolution function through `import.meta`,
because a native executable has no module URL that a running program could
load from. Adding a host property is a host contract change and amends this
decision.


Export forms and arbitrary names
--------------------------------

The M5c `module-export-forms` node admits `export var`, `export * as name`,
and arbitrary module namespace names. Module records keep each form
distinct: a namespace import carries an explicit marker, because the string
export name `"*"` is an ordinary name, and an `export * as` entry is its own
export kind rather than a star export. Its explicit name participates in
duplicate-export checks and shadows star exports. It resolves to the
requested module's namespace directly. That namespace has one traced cell
per module, shared by `import * as`, by re-exporting a namespace import, and
by every `export * as`. Star resolution therefore compares one binding
identity, as ECMA-262 ResolveExport does.

A module records its VarDeclaredNames. Module compilation initializes each
var cell to `undefined` while linking, with the function initializers and
before any evaluator starts, matching InitializeEnvironment. Source
initializers stay in the evaluator. A cyclic importer or a hoisted function
therefore reads `undefined` before the declaring module evaluates, while
lexical bindings keep their temporal dead zones. A namespace reached only
through `export * as` is created with the other namespace objects during
linking.
