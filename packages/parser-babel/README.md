@oseo/parser-babel
==================

This package contains the bootstrap Babel adapter. It converts accepted source
immediately to Oseo-owned syntax and turns parser or profile failures into Oseo
diagnostics. Babel nodes do not cross its public boundary.

Class declarations and expressions reject a second non-static constructor with
a source-located `OSEO0001` early-error diagnostic, even when an earlier
member, the first constructor body or the heritage uses unsupported syntax.
Class type parameters and type-only modifiers erase before conversion.
Decorators retain source-located `OSEO0001` parser rejection. Static methods
and computed members named `constructor` keep their permitted class roles.
Unsupported runtime syntax retains its `OSEO1001` diagnostic.

The Script frontend rejects ECMAScript static imports and exports at any
statement depth with source-located `OSEO0001`, before conversion of an
earlier unsupported construct. Module code still admits them only in its
top-level ModuleItemList. The permissive Babel option preserves parsing of
TypeScript extensions; an owned adapter check enforces Script placement.

Whole type-only imports and exports, including star exports, erase along with
their module requests. Ambient module and namespace declarations erase;
non-ambient namespaces erase only when they contain types alone. Type-only
import aliases erase at the top level or inside ambient namespace bodies;
nested statement positions remain grammar errors. Top-level value import
aliases and export assignment retain their `OSEO1001` boundaries. Primitive and
destructuring hint mapping remains unchanged.

Dynamic `import()` keeps its `OSEO1001` rejection; `import.meta` remains an
early error in Script and is admitted in Module code.

Both factories also accept `staticSpecifierImports`. When it is true, an
`import()` whose only argument is one string literal, optionally parenthesized
and with the grammar's trailing comma, converts to an owned `import-call` node,
and the Script or module lists every such node in `importCalls` in source
order. An options argument, a phase form, and every other argument keep the
exact `ImportExpression is outside the M1 profile.` diagnostic. The default
frontends leave the option off, and the compiler still rejects each
`import-call` node, as the
[static-specifier import design](../../docs/static-specifier-import-design.md)
requires until admission.

Parenthesized call and assignment targets are normalized before
classification. The compiler then resolves `console` and `Object` lexically
before admitting host or reflection intrinsics.

M3 function values, objects, arrays, loops, and exception syntax enter only
through owned syntax. The M4 module frontend converts static imports, exports,
top-level await, promises, async functions, and timers to the same owned
boundary. Async suspension suffixes become private continuation functions
before compiler lowering.

M5 synchronous `for-of` heads admit one identifier, array, or object
declaration, an existing binding or member target, or an array or object
assignment pattern whose leaves are existing targets. Classic `for`
declarations admit the same array and object binding patterns. `for-in` heads
convert the same declaration and target forms. `for-await-of` heads occur only
inside an async function or a module body and use the `for-of` head
conversion. In these `for-of`, `for-in`, and `for-await-of` heads, a
declaration initializer or a second declarator remains rejected.

Array literals, call arguments, and constructor arguments retain spread
entries at the owned syntax boundary.

Functions, constructors, and arrows admit recursive array and object
binding-pattern parameters plus top-level default and rest parameters.

The adapter gives the compiler plain hidden ABI parameters for patterns, then
emits owned binding initialization before a private lexical body block. Rest
parameters retain an owned marker so the backend collects the unbound argument
suffix into a fresh array. This preserves the separate parameter environment,
left-to-right temporal dead zones, ordinary-function receivers, lexical arrow
receivers, and function `length` independently from the ABI parameter count.

When a parameter list contains an expression, a same-name body `var` receives
a separate cell initialized from the parameter binding. A list without
parameter expressions reuses the parameter cell. A same-name top-level
function declaration owns the body binding when `var` also redeclares it.

Name-based JSDoc hints for pattern-bound parameters attach to the
corresponding owned binding leaf, while the hidden aggregate ABI parameter
remains unhinted.

Inline object, tuple, and array TypeScript annotations map syntactically
visible primitive member types to the same leaves without invoking a type
checker.

The mapping also covers standalone declarations and classic `for` declaration
heads. Optional members remain unhinted.

Array element types continue through unambiguous nested array rest targets.
Direct fixed-length tuple spreads expand before mapping, so their members and
following suffix retain their syntactic positions. Expanded members follow the
ordinary primitive-hint rules; other member types remain unhinted.

Variadic array rests and type-reference spreads remain unhinted where their
length makes a position ambiguous. Object targets inside an array rest remain
unhinted. Computed object properties remain unhinted even when their source
key is a literal.

Annotations of any form erase at every admitted JavaScript position. The
adapter accepts interfaces, type aliases, `as`, `satisfies`, non-null
assertions, generic parameters and arguments, ambient declarations, overload
signatures, optional and `this` parameters, and class type modifiers. It erases
namespaces that contain only types. Enums, namespaces with runtime statements,
parameter properties, value import aliases, angle-bracket assertions and export
assignment remain `OSEO1001` diagnostics. Decorators retain parser rejection.
This follows the [Node.js type-stripping boundary] without expanding the
admitted runtime JavaScript profile.

Annotations requiring resolution erase without hints. Mapping leaves no hints
for root or nested container mismatches; matching siblings continue to map. The
hint vocabulary stays `any`, `bigint`, `boolean`, `null`, `number`, `string`,
`undefined` and `unknown`; no type checker runs.

Whole `import type` and `export type` declarations disappear, including their
module requests. Inline type specifiers disappear individually, so
`import { type T } from "m"` retains an empty import and evaluates `m`.
Value imports are retained even if they occur only in annotations. Whole
type-only declarations neither resolve a module nor create a runtime binding.

Erased spans become whitespace with line endings preserved, retaining the
semicolons needed at TypeScript statement and class-field boundaries. The
adapter reparses that source so directive prologues and early errors follow the
stripped JavaScript, then restores annotation hints by source position.
Function source text follows Node.js stripping; Deno reformats TypeScript
functions, so only Node.js is the reference for exact function text.
Diagnostics retain the original source coordinates.

Asynchronous functions and arrows run non-simple parameter initialization
inside their owned asynchronous executor, so abrupt initialization rejects
the returned promise. Source positions and UTF-8 byte offsets are indexed once
for linear-time conversion.

The script frontend uses non-strict script parsing. The module frontend uses
module parsing and reports withheld module forms as `OSEO1001`. Only
`/** ... */` block comments contribute JSDoc hints; ordinary block and line
comments never do.

`createBabelFrontend` and `createBabelModuleFrontend` accept the same optional
regular expression extension record. The adapter forwards it to the owned
pattern parser without importing a concrete Unicode table package. The default
frontend values configure no extension, so a composition root must supply the
resolver for every property name it admits.

Standalone `const`, `let`, and `var` declaration lists are converted into
compiler-owned recursive patterns. A `const` or `let` list with more than one
declarator becomes one owned `declaration-list` statement whose members are
the same declarator shapes a one-declarator list produces, so the compiler
decides the scope the declarators join. Any list may mix plain and pattern
declarators; every `var` pattern name joins the existing function-scope
hoisting and redeclaration pass.

Array patterns admit elisions, defaults, nesting, and a final identifier or
nested array rest target. Object patterns admit static and computed
properties, shorthand and renamed targets, defaults, nested object or array
patterns, and a final identifier rest target.

Catch parameters and synchronous `for-of` declarations reuse the same
recursive patterns. A catch clause may omit its parameter entirely; the owned
handler then records the absent pattern explicitly and its range covers the
clause. A simple catch parameter may share a name with a var-scoped
declaration: the var name is still hoisted, while an initializer inside the
clause resolves to the catch cell. Recursive catch patterns keep their
redeclaration restriction.

A block-level function declaration may also share its name with a var declared
outside that block. The var-scoped hoisting pass only rejects a var that
lexically shares the block declaring the function, because ECMA-262's Block
early errors reject only that overlap. It no longer treats the function name
as reserved across the whole enclosing var scope.

A switch clause may declare a function the same way. The frontend admits a
function declaration in a switch case's body alongside ordinary statements.
The existing var-scoped hoisting pass already treats a switch's case bodies as
one lexical frame that includes function names, so the same
disjoint-coexistence rule applies.

Non-strict code also gets the Annex B forms. Before conversion,
*annexb-functions.ts* wraps an `if` clause's function declaration in a Block
and replaces a labelled function declaration with the declaration itself.
When a block-level function would raise no early error as a `var` of its
name, is not a parameter, and is not the `arguments` of a function that needs
its arguments object, the body's hoisted bindings gain that name and the
declaration is followed by an `annexb-function-copy` statement. A Script adds
such a name to its global object entries as `annexb`. A
`for (var x = init in obj)` initializer becomes an assignment ahead of the
loop, and a call used as an assignment target becomes an
`invalid-assignment-target` expression that throws after the call. The
[ECMAScript 2026 profile](../../docs/language-profile-es2026.md#annex-b-language-semantics)
gives the rules.

Standalone destructuring assignment reuses them when every leaf and rest
target is an existing identifier or a static or computed member reference.
Synchronous `for-of` assignment heads reuse that assignment target
conversion. A computed member target, a computed property name, and a default
may each contain `await`. The frontend converts them unchanged and the
compiler decides whether the enclosing body owns a suspension frame for them.
`for-await-of` heads reuse the same declaration and assignment target
conversion. Annotations follow the Node.js stripping boundary; annotations on
`for-in` and `for-of` declaration heads remain parser errors.

Compound assignment converts every arithmetic, exponentiation, bitwise, shift,
and logical form into an owned identifier or member update. Await inside that
expression remains an explicit boundary until the compiler can retain its
already-read target value across suspension.

Prefix and postfix `++` and `--` convert to separate owned identifier or
member steps that retain result selection. A member step keeps its object and
key expressions so the compiler can preserve one evaluation and two observable
key conversions.

Direct awaited initializers resume into predeclared lexical cells or write
hoisted `var` cells. Lexical module exports name every binding in the
pattern; `export var` exports every name its declarators bind, including a
declarator without an initializer and every binding-pattern leaf.

The adapter keeps raw Babel shapes and conversion context in *babel.ts*.
*locations.ts* owns UTF-8 indexing and source diagnostics, while *hints.ts*
owns TypeScript and JSDoc hint extraction. The mutually recursive expression,
pattern, statement, function, hoisting, and asynchronous conversions remain
together in *convert.ts*. *modules.ts* owns import, export, and module-program
conversion. *script-goal.ts* checks ECMAScript declaration placement while
preserving TypeScript extension boundaries. *index.ts* parses through Babel and
exposes the two frontend factories and their unconfigured default values. These
files remain package-private implementation paths.

[Node.js type-stripping boundary]: https://nodejs.org/docs/latest-v24.x/api/typescript.html#type-stripping
