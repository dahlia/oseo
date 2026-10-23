Script and Module declaration grammar
=====================================

The `script-module-declaration-early-error` node repairs the Script
frontend's declaration placement check. ECMA-262 2025 A.5 and 16.1 give
ScriptBody a StatementList. ImportDeclaration and ExportDeclaration are
ModuleItems, so neither is a Script statement at any depth. The Module
frontend accepts them only in its top-level ModuleItemList. Invalid
placement reports a source-located `OSEO0001` before profile conversion,
including when earlier syntax would otherwise report `OSEO1001`.

The Script adapter keeps Babel's permissive declaration option because its
TypeScript plugin also parses extensions whose unsupported policy is
separate from ECMAScript grammar. A package-private pass over the parsed
Script finds ECMAScript imports and exports before conversion. It visits
executable children of expression extensions, but leaves TypeScript
namespace and ambient module bodies to their existing whole-declaration
`OSEO1001` rejection. It does not erase or admit those bodies.

Type-only imports and exports, import-equals, export-assignment, namespace
exports, interfaces, aliases, enums, and ambient declarations retain their
unsupported-extension diagnostics. A list containing a value specifier is
still an ECMAScript module declaration. Primitive annotations on admitted
bindings and functions remain accepted. The Module converter also rejects
`export type *` as unsupported; its star-export branch previously omitted
the type-only check that named exports and imports already performed.
Ordinary star and namespace exports keep their runtime records.

Dynamic `import()` retains ADR 0016's `OSEO1001` boundary. `import.meta`
still reports `OSEO0001` in Script and remains admitted in Module code.
Property names, comments, strings, and template text spelling `import` or
`export` are not module declarations.


Pure evidence
-------------

*packages/parser-babel/tests/script-module-declarations.test.ts* covers
static declaration productions, nested statement and function contexts,
Module controls, UTF-8 byte positions, CRLF source locations, unsupported
prefixes, TypeScript boundaries, and both compiler specialization policies.
The existing Module export and import.meta tests retain their linking and
owned-IR assertions.

*tests/property/m5-script-module-declarations.property.test.ts* prints
structured declaration productions with names, optional primitive hints,
line endings, and nested contexts. An independent V8 Script parser and
Node's Module syntax checker check the JavaScript twin without evaluating
it. The two seed slots are `0x60008b00` and `0x60008b01`, each with 64
ordinary cases. Shrinking keeps a declaration and the domain's required
nesting. The source documents size tiers, preconditions, and replay through
`OSEO_PROPERTY_SEED` and `OSEO_PROPERTY_PATH`. These are parser/compiler
properties; they compile no native artifact and claim no native weighting.


Pinned source audit and remaining gates
---------------------------------------

The static audit read all 41,091 included source files at test262 revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`. Of 1,083 sources spelling
`import` or `export`, 88 contain a declaration outside a ModuleItemList:
the two unreviewed Script subjects and 86 already-reviewed Module nesting
negatives. Twelve other candidates fail Babel parsing for malformed module
syntax before a tree is returned; their complete sources were inspected
separately. Their hashes and parser reasons are retained with the audit.

The two Script subjects are *test/language/global-code/import.js* and
*test/language/global-code/export.js*. Their complete pinned sources require
parse-phase SyntaxError. Both previously returned `OSEO1001` at line 21,
column 1. Their source hashes are respectively
`c2d97e3b564156c04b17b44553bc0d51ce5dd0ae7bf1caa358a00730647cf7f5` and
`9f9954dd3dae59f94912f29716f8b9b040cee42342eae1cdcf978519c35ae9bc`.
They remain reserved, unreviewed observation-batch-17 paths.

Source-bound probes, the static audit and the implementation report live in
*/data/m5c-script-goal-intake-20261023/implementation/*. Pure frontend probes
are not fresh test262 observations. This source preparation changes no
subset, manifest, closure ledger, exclusion audit, inventory policy, or graph
status. Full UPDATE, independent review, exact-candidate CI, and landing
remain separate coordinator-owned phases under *PLAN-M5C.md*.
