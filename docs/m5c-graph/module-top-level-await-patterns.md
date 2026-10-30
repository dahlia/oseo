Module top-level await patterns
===============================

Source preparation on Main 8f420262
-----------------------------------

The checked-in ledger owns thirteen reviewed unsupported paths under
`node:module-top-level-await-patterns`. The original node YAML named only
one; observation batches 19, 20 and 30 recorded the twelve additional
export-var pattern rejections. All thirteen retain their original
`unsupported-profile-feature` observations and subset expectations during
source preparation. None is an ADR 0016 exclusion.

The common prefix is
`test/language/module-code/top-level-await/syntax/`:

 -  `catch-parameter.js`
 -  `export-var-await-expr-array-literal.js`
 -  `export-var-await-expr-func-expression.js`
 -  `export-var-await-expr-identifier.js`
 -  `export-var-await-expr-literal-number.js`
 -  `export-var-await-expr-literal-string.js`
 -  `export-var-await-expr-nested.js`
 -  `export-var-await-expr-new-expr.js`
 -  `export-var-await-expr-null.js`
 -  `export-var-await-expr-obj-literal.js`
 -  `export-var-await-expr-regexp.js`
 -  `export-var-await-expr-template-literal.js`
 -  `export-var-await-expr-this.js`

The source diagnostic was OSEO1001: await inside a module top-level binding
or assignment pattern is unsupported. Grep and compile checks found an
obsolete guard before the module's existing traced async evaluator. Removing
that guard admits the same pattern machinery already used by asynchronous
functions. A classic for declaration also needs its pattern examined when
choosing an asynchronous evaluator, even if its initializer has no await.
No backend or runtime operation, ABI, dynamic-source boundary or optimization
policy changes.

Patterns retain their ordinary order, lazy defaults, binding cell identity,
iterator cleanup, finally precedence and rooted values across suspension.
The package tests replace the old rejection assertions with admission and
traced-frame assertions, including a classic for initializer. Existing
unsupported grammar and source-evaluation diagnostics remain in their owning
layers. ADRs 0013, 0016 and 0019 are unchanged.


Evidence
--------

The fixed module graph at *tests/fixtures/module-pattern-await/importer.mjs* and
*tests/module-pattern-await-native.test.ts* exercise export defaults, nested
patterns, keys and coercion, assignment results and rest targets, catch
fulfillment and rejection, iterator closing, finally, lexical loop cells,
for-of and object-pattern for-in heads, nested expressions, and an importer
waiting for the exported default. This is a
CLI module fixture: it directly enables forced collection for both policies;
it does not use the Script-only fixture registry in *tests/native.ts*.

The existing
*tests/property/m5-module-continuation.property.test.ts* keeps its original
schedule domain and adds a pattern domain at unused slot `0x60001f01` of its
registered block. Six draws cover supplied and missing primitive and object
values across six pattern contexts, with a false number hint reaching the
generic addition result. Both domains retain shrinking, replay, both policies,
forced collection and their independent expected-output models. The new domain
also checks Node.js and Deno references. No seed block, file or existing
budget changes; the new domain has six cases and a 180-second deadline.

Raw commands, intake and outputs are under
*/data/m5c-d17-20261031/tla/*. The intake records the exact thirteen paths,
prior classifications, dependency tags and successful compilation under both
policies. It is compilation evidence, not a test262 observation or promotion.
The final serial Zig and host-cc commands each passed three registrations:
the fixed importer graph and both property domains. Both lanes used the heavy
lock and the normal sanitizer selection; host-cc selected Clang 22.1.8.
The unchanged compiler/parser package suites passed 636 registrations.
The fast repository run passed 833 registrations across 59 root test files;
the native-host-guard analyzer selected the non-native files, with its skip
recognition disabled to identify guarded native suites for exclusion. Its
explicit file lists are retained in *non-native-files.json*. The capacity-
wrapped `mise run check` passed, including the compatibility ratchet with
zero overrides. Logs retain earlier dependency setup, the real for-pattern
compile failure, and formatting/type corrections separately.

The review adapter records internal review under this node's name. Root owns
D3, actual full UPDATE observations, candidate/Main gates and publication.
No checked-in subset, result, parity, ledger or landed-state field changes
in this source preparation.
