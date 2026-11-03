ADR 0033: Installed package resolution and real-path module identity
====================================================================

Status
------

Proposed, 2026-11-03, for the first delivery unit of
[*PLAN-PKG.md*](../../PLAN-PKG.md). Until it is accepted, the file resolver
in *packages/host/src/index.ts* stays the only resolver, and
[ADR 0009](./0009-module-identity-and-linking.md) governs module identity
unchanged.

When accepted, this record amends ADR 0009's identity rule: the canonical
identity of a file module becomes the `file:` URL of its resolved real path.
ADR 0009's owned resolver boundary, one-instance rule, live cells, linking
order, and deterministic graph evidence stay in force, as does its treatment
of import attributes, JSON modules, `import.meta`, and export forms.
[ADR 0016](./0016-dynamic-source-boundary.md) is unchanged: nothing here
loads source after the executable starts.


Context
-------

The M4 graph builder accepts `./` and `../` specifiers and rejects every
other specifier with one diagnostic. A program cannot import a package that
npm, pnpm, or Yarn installed into *node\_modules*, even when the package is
published as ECMAScript modules and uses nothing outside the language.

On 2026-11-02 the maintainer approved a package track that makes such
packages importable before Node.js compatibility exists, and separated it
from M7. The track's plan says the architecture decision that opens it
freezes the resolution contract. This record is that decision.

Four properties of the current implementation shape it:

 -  `ModuleResolver` is synchronous, although the graph builder that calls
    it is asynchronous. A resolver that reads *package.json* files cannot
    stay synchronous without reading the whole install tree first.
 -  `canonicalizeFileModuleUrl` normalizes the spelling of a `file:` URL and
    does not resolve symbolic links. Because pnpm installs every package
    once under *node\_modules/.pnpm/* and links it into place, the same file
    would receive one identity per link, and a dependency placed beside the
    real location would not be found from the link.
 -  `Diagnostic` carries a code, a source identifier, ranges, a message, and
    free-text notes. A failure inside a dependency cannot say which package,
    version, condition path, or importer chain led to it, and the
    compatibility laboratory cannot aggregate free text.
 -  The graph builder returns no graph when any diagnostic exists. The
    modules it resolved before the failure are discarded, so a scenario
    record cannot say how far resolution reached.

The audit of 48 pinned packages in
[*docs/evidence/package-audit/README.md*](../evidence/package-audit/README.md)
found 13 whose selected ESM graph needs only a resolver, 9 that also need an
M6 web global, and 26 that reach CommonJS, `node:` modules, Node.js globals,
`eval`, or a `Function` constructor. Three defects in the first version of
that audit decide the contract below: a fixed condition preference order
instead of manifest key order selected files that Node.js would not select;
reading `type` from the package root instead of the nearest *package.json*
classified the ESM build of `yaml` as CommonJS; and a `Function` alias such as
`const F = Function` escaped the dynamic-source check in `zod` 4 and `eta`.

The reviewed static-specifier import design under
[*PLAN-DYN.md*](../../PLAN-DYN.md), now scheduled in
[*PLAN-LANGUAGE.md*](../../PLAN-LANGUAGE.md), turns a literal `import()` into
a static edge served by the same injected resolver and loader. Those edges
will carry bare specifiers as soon as this resolver exists.


Required contract
-----------------

The package track needs:

 -  one published algorithm for bare specifiers, `exports`, and `imports`,
    with every deliberate difference listed, so that a package which works
    under Node.js with the same conditions resolves to the same files;
 -  a fixed active condition set and a fixed rule for how conditions are
    matched, because the selected file decides which implementation Oseo
    compiles;
 -  a module format rule that never reports a format mismatch as a syntax
    error, so that CommonJS findings are counted as M7 work rather than as
    compiler failures;
 -  one identity per installed file under npm, pnpm, and Yarn layouts, with
    no merging of distinct installations;
 -  a resolver boundary that the Node.js and Deno compiler hosts share, that
    is testable without a file system, and that never consults the host
    runtime's own resolver;
 -  structured provenance on every resolution and package diagnostic; and
 -  a record of what resolution visited, returned whether or not a graph is
    returned, so that the laboratory can say where and how far a scenario
    failed.


Alternatives considered
-----------------------

### Resolution algorithm

1.  **Delegate to the host runtime**, through `import.meta.resolve()` under
    Node.js or the equivalent under Deno. Rejected. The host runtime's
    version would decide which file Oseo compiles, the two hosts would
    disagree, and neither exposes the condition path or the manifest it
    read.
2.  **Define an Oseo-specific convention**, such as resolving only through
    an `oseo` field. Rejected. No installed package carries it, so nothing
    would resolve on the first day, and authors would have to publish for
    Oseo specifically.
3.  **Reimplement the Node.js ECMAScript module resolution for the
    constructs Oseo admits**, with a listed set of deliberate differences.
    Selected.

### Active conditions

1.  **A priority list `oseo`, `import`, `default`.** Rejected. Node.js
    matches `exports` conditions in the manifest's key order against a set
    of active conditions. A priority list would select a different file than
    Node.js from a manifest whose `import` key precedes `oseo`, and package
    authors write manifests for the key-order rule.
2.  **Also activate `node`.** Rejected. A `node` entry promises the Node.js
    API surface, which is M7 work. Activating it because the compiler
    happens to run under Node.js would select files that fail later for a
    reason unrelated to the package.
3.  **Also activate `bun` as a fallback for TypeScript-aware entries.**
    Rejected for the same reason: a `bun` entry targets Bun's runtime, not
    a TypeScript source policy.
4.  **`oseo` and `import` active, `default` always matching, manifest key
    order.** Selected. A project may add conditions through the
    command-line surface that [*PLAN-CLI.md*](../../PLAN-CLI.md) defines.

### Module format of an ambiguous `.js` file

1.  **Adopt the syntax detection that Node.js applies** to a `.js` file in
    a scope without `type`. Deferred. The audit found no early candidate
    that needs it, and detection would make the format depend on a parse
    whose result the user cannot see in a manifest.
2.  **Classify it as CommonJS and report a package format finding.**
    Selected. The first corpus checkpoint revisits this.

### Module identity

1.  **Keep the normalized URL spelling of ADR 0009.** Rejected by the pnpm
    layout described above.
2.  **Identify a package by name and version** and merge instances.
    Rejected. Two installations of the same version may see different peer
    dependencies, and a shared instance would run the wrong one.
3.  **Identify every module by its resolved real path.** Selected. This is
    the Node.js default.

### Host boundary

1.  **Keep the synchronous resolver and build a frozen index of the whole
    install tree before resolution.** Rejected. It reads every manifest
    under *node\_modules* for every build, it cannot be implemented by an
    in-memory or remote host, and a tree that changes between the index and
    the read is not detected.
2.  **An asynchronous resolver that reads the file system directly.**
    Rejected as the only layer. The resolution rules could then be tested
    only against real directories.
3.  **An asynchronous `ModuleResolver`, a package index that reads and
    memoizes one package directory at a time, and a pure resolution core
    over that index.** Selected. The core is tested against fixture indexes
    without a file system, and the host index is tested against fixture
    trees on disk.

### Diagnostics

1.  **Render provenance into the free-text notes.** Rejected. The
    laboratory and a future multi-diagnostic printer would parse prose.
2.  **A separate diagnostic type for package failures.** Rejected. Every
    consumer of `Diagnostic` would branch on two types.
3.  **One optional structured field on `Diagnostic`,** filled by resolution
    and package diagnostics and ignored by every existing consumer.
    Selected.

### Observing a failed build

1.  **Return a partial graph beside the diagnostics.** Rejected. A partial
    graph could be compiled by mistake, and its shape would depend on the
    order in which resolution failed.
2.  **Return a resolution trace, a type distinct from the graph, whether or
    not a graph is returned.** Selected.

### Postponement

Postponing this record was rejected. Without it the first implementation
unit would fix the condition rule, the identity rule, and the `Diagnostic`
shape by code, and the corpus records would be measured against an
undocumented contract.


Decision
--------

### Specifier classes

 -  Relative and absolute `file:` specifiers keep their M4 behavior. They
    name exact files; no extension is probed and no directory index is
    assumed.
 -  A bare specifier names a package and an optional subpath. The package
    directory is the first *node\_modules/<name>* found while walking up
    from the importer's directory after symbolic links are resolved. Scoped
    names use two path segments.
 -  A specifier beginning with `#` resolves through the `imports` field of
    the importer's package scope, the nearest enclosing *package.json*. A
    root project's `imports` never applies inside a dependency.
 -  A package may import itself by name when its scope's `name` matches.
    The self-reference resolves through that scope's `exports`, never
    through an installed copy higher in the tree.
 -  `node:` specifiers are classified as a runtime API finding owned by M7,
    not as a resolution failure. `data:`, `http:`, and `https:` specifiers
    are rejected; [*PLAN-DYN.md*](../../PLAN-DYN.md) and M6 own remote
    source.

The authoritative source for the admitted constructs is the resolution
algorithm specification of the Node.js 24 `node:module` and ECMAScript
modules documentation: `PACKAGE_RESOLVE`, `PACKAGE_SELF_RESOLVE`,
`PACKAGE_EXPORTS_RESOLVE`, `PACKAGE_IMPORTS_RESOLVE`,
`PACKAGE_TARGET_RESOLVE`, and `ESM_FILE_FORMAT`. The applying change records
the exact documentation revision it implemented against.

### Conditional exports

 -  The active condition set for executable source is `oseo` and `import`.
    `default` always matches. Keys are visited in the manifest's own order
    and the first key that is active or `default` wins. Oseo does not
    reorder `oseo` ahead of `import`; an author who wants Oseo to select a
    different file writes the `oseo` key first.
 -  `types`, `node`, `browser`, `deno`, `bun`, `development`, and
    `production` are never active by default. Running the compiler under
    Node.js does not activate `node`. A project may add conditions
    through the command-line surface of [*PLAN-CLI.md*](../../PLAN-CLI.md);
    `types` is rejected there because a declaration file is not executable
    source.
 -  Subpath keys match exactly first, then by pattern with the longest
    matching prefix. A `null` target blocks the subpath. An array target is
    tried in order, and an entry is skipped only when its target is
    syntactically invalid, never because its file is missing.
 -  A target must begin with `./`, stay inside the package, and contain no
    *node\_modules* segment. A manifest that mixes subpath keys and
    condition keys at the same level is invalid and is reported as a package
    convention finding.
 -  When a package has `exports`, a subpath it does not export is a
    resolution failure. The resolver never falls back to `main` or to the
    real file path.
 -  When a package has no `exports`, the root resolves through `main` with
    the legacy probes that Node.js applies, and a deep import names an exact
    file. The non-standard `module`, `browser`, and top-level `source`
    fields are ignored.
 -  A selected target that fails to compile is reported. The resolver does
    not retry another condition, because that would compile a different
    implementation than the one the author selected.

### Module format

 -  `.mjs` is a module and `.cjs` is CommonJS. `.js` follows the `type`
    field of the nearest enclosing *package.json*; a nested manifest
    overrides the package root.
 -  A `.js` file whose scope has no `type` is CommonJS.
 -  A CommonJS entry, a CommonJS file reached by a static import, and a
    `require`-only export branch are three distinct package format
    findings. None is reported as a syntax error, and none is compiled.
 -  JSON modules keep the ADR 0009 contract: a `with { type: "json" }`
    attribute, a default export, and module-kind validation.
 -  A `.ts` or `.mts` file is admitted as source when its syntax is within
    the admitted profile. Until the TypeScript source unit of
    [*PLAN-PKG.md*](../../PLAN-PKG.md) lands, a package that selects such a
    file reports the first rejected construct with package provenance.

### Identity

 -  The canonical identity of every file module, including the entry and
    every relative import, is the `file:` URL of its resolved real path.
    Canonical identity remains a URL, so in-memory and custom loaders keep
    the ADR 0009 representation.
 -  The specifier as written and the symbolic link target are recorded in
    the resolution trace. Diagnostics show the path the user wrote.
 -  Two package instances are never merged because their name, version, or
    content match.

### Host boundary

 -  `ModuleResolver.resolve()` returns a promise. The graph builder already
    awaits each resolution.
 -  The host implementation is a package index plus a pure resolution core.
    The index reads one package directory on demand, memoizes it, and
    records the manifest digest and real path it read. The core takes the
    index and a specifier and never touches the file system. Both compiler
    hosts use the same core.
 -  The host never calls `require.resolve()`, `import.meta.resolve()`, or a
    Deno equivalent.

### Provenance and trace

 -  `Diagnostic` gains one optional field for package provenance: package
    name and version, package directory, the condition path that selected
    the file, and the importer chain from the entry. The first rendered line
    does not change; the rendered notes gain the provenance. Only resolution
    and package diagnostics fill the field at first.
 -  The graph builder returns a resolution trace whether or not it returns
    a graph: every module visited, every edge with its specifier, selected
    condition path, real path, and format, every manifest digest read, and
    every failed edge with its diagnostic. The trace is a separate type from
    the graph and cannot be compiled.
 -  The trace, the compiler version, the active conditions, the package
    instances and versions, the manifest and source digests, and the
    real-path map form the build's reproducibility record. The source hash
    in the graph is a content identity, not an integrity proof. Oseo does
    not read lockfiles; the laboratory records the install tool, its
    version, and the lockfile digest beside the trace.
 -  Printing more than the first diagnostic is a command-line change under
    [*PLAN-CLI.md*](../../PLAN-CLI.md).

### Literal `import()` requests

A literal `import()` edge that the static-specifier import design admits
resolves through this contract exactly as a static `import` declaration
does: same condition set, same identity, same provenance, same trace. The
resolver receives the same request whichever syntactic form produced the
edge, and nothing in this record admits loading after start.


Consequences
------------

A package that works under Node.js 24 with the `import` condition resolves to
the same files under Oseo unless it relies on a listed difference: an
inactive `node` condition, an ignored `module` or `browser` field, syntax
detection of an untyped `.js` file, or a `node:` specifier. Each difference
is recorded in the trace. None of them silently selects a different file.

The `oseo` condition exists from the first resolver release even though the
TypeScript source unit that makes it useful comes later. An author who adds
it before that unit lands selects a file that the frontend may reject, with
provenance that names the condition.

Every consumer of `Diagnostic` keeps working. The command line keeps
printing the first diagnostic until [*PLAN-CLI.md*](../../PLAN-CLI.md)
changes it, but the text it prints already carries the package and condition
path.

The compiler core can test package resolution against fixture indexes
without a file system, as ADR 0009 already allows for graph semantics. The
Node.js and Deno hosts must produce the same trace from the same tree, which
the plan's verification section checks.

Real-path identity changes the identity of every existing file module whose
path contains a symbolic link. Existing alias, cycle, live-binding, and JSON
tests must pass unchanged under the new rule before the first installed
package is resolved.


Revisit triggers
----------------

 -  A corpus result shows that an early package depends on Node.js syntax
    detection of an untyped `.js` file. The format section is then
    reconsidered with that record.
 -  M7 admits CommonJS. The format findings here become the input to its
    loader, and the three CommonJS classifications may need to distinguish
    more cases.
 -  A host policy, such as a remote or in-memory loader, cannot express its
    identity as a URL. ADR 0009's replacement trigger already names this
    case.
 -  The maintainer activates another condition by default or adds a project
    manifest field for conditions. That changes the condition section and
    the reproducibility record.
 -  A package manager layout that neither real paths nor the walk-up rule
    describe appears in the corpus. Yarn Plug'n'Play is the known example
    and is outside this record.
