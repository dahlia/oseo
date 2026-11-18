Compiler implementation notes
=============================

The [design document] maps the compiler source files to pipeline stages and
explains the HIR and MIR boundaries. The [language profile] records the
supported forms and their evaluation rules.

[design document]: https://github.com/dahlia/oseo/blob/main/DESIGN.md
[language profile]: https://github.com/dahlia/oseo/blob/main/docs/language-profile-es2026.md


Frontend contracts
------------------

Declaration binding patterns and assignment patterns have distinct syntax
contracts. Only the latter admit member targets. Lexical resolution validates
that distinction separately from the binding write mode. Binding identifier
leaves carry their own hint metadata, so a frontend can attach a name-based
hint without marking the hidden aggregate ABI parameter.

The frontend supplies a lexical declaration list as one `declaration-list`
statement. HIR construction expands its declarators into the containing
statement list so they share one scope and the same predeclaration pass. A
declaration list in a single-statement position gets a source-located diagnostic
rather than acquiring an artificial block scope.


Module requests
---------------

A frontend with `staticSpecifierImports` enabled reports literal `import()`
sites in `importCalls`. The CLI enables that option for its default frontends;
the Babel frontend factories leave it off when called without options.
`buildModuleGraph()` and `buildScriptRequests()` retain a
`ModuleRequestRecord` per resolved request, in deterministic order. Each record
has a referrer, source location, decoded specifier, canonical target, and
`evaluation` or `discovery` edge kind. A failure reached through a discovery
edge includes importer-chain notes; a static-only graph retains its existing
diagnostics.

Discovery edges do not enter a module's static dependencies. Their targets
join the linked graph after the entry's static closure and are instantiated
without adding startup evaluation. The compiler lowers each literal site to
the `module-import` call target with a constant module-table index.

A Script is a referrer with an explicit canonical identity, not a module
record. To compile a Script with literal imports, pass the canonical identity
and the closure found by `buildScriptRequests()` as the fourth argument to
`compileSource()`. The program installs the instantiated module table before
running the Script; the modules use the Script's global declarations as their
outer scope.
