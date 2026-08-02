@oseo/parser-babel
==================

This package contains the bootstrap Babel adapter. It converts accepted source
immediately to Oseo-owned syntax and turns parser or profile failures into Oseo
diagnostics. Babel nodes do not cross its public boundary.
Parenthesized call and assignment targets are normalized before classification.
The compiler then resolves `console` and `Object` lexically before admitting
host or reflection intrinsics. M3 function values, objects, arrays, loops, and
exception syntax enter only through owned syntax. The M4 module frontend
converts static imports, exports, top-level await, promises, async functions,
and timers to the same owned boundary. Async suspension suffixes become private
continuation functions before compiler lowering.
M5 synchronous `for-of` heads admit one identifier, array, or object
declaration, an existing binding or member target, or an array or object
assignment pattern whose leaves are existing targets. Classic `for`
declarations admit the same array and object binding patterns. `for-in` and
`for-await-of` remain owned profile failures.
Array literals, call arguments, and constructor
arguments retain spread entries at the owned syntax boundary.
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
Name-based JSDoc hints for pattern-bound parameters attach to the corresponding
owned binding leaf, while the hidden aggregate ABI parameter remains unhinted.
Inline object, tuple, and array TypeScript annotations map syntactically visible
primitive member types to the same leaves without invoking a type checker.
The mapping also covers standalone declarations and classic `for` declaration
heads. Optional members remain unhinted. Array element types continue through
unambiguous nested array rest targets. Direct fixed-length tuple spreads expand
before mapping, so their members and following suffix retain their syntactic
positions. Expanded members follow the ordinary primitive-hint and
unsupported-type rules. Variadic array rests and type-reference spreads remain
unhinted where their length makes a position ambiguous. Object targets inside
an array rest remain unhinted. Computed object properties remain unhinted even
when their source key is a literal. When an inline annotation gives a nested
array or object binding subtree another container shape, mapping stops only for
that subtree and leaves it unhinted without a diagnostic. Matching siblings
continue to map. Root container mismatches and type references that require
alias or interface resolution, or otherwise lack an admitted concrete syntactic
shape, remain explicit boundaries.
Asynchronous functions and arrows run non-simple parameter initialization
inside their owned asynchronous executor, so abrupt initialization rejects the
returned promise. Optional parameters, TypeScript `this` parameters, and
type references that require alias or interface resolution remain explicit
boundaries.
Call type arguments and other withheld forms are also rejected here. Source
positions and UTF-8 byte offsets are indexed once for linear-time conversion.
The script frontend uses non-strict script parsing. The module frontend uses
module parsing and reports withheld module forms as `OSEO1001`. Only
`/** ... */` block comments contribute JSDoc hints; ordinary block and line
comments never do.
Standalone one-declarator `const` and `let` binding declarations and standalone
`var` declaration lists are converted into compiler-owned recursive patterns.
A `var` list may mix plain and pattern declarators; every pattern name joins the
existing function-scope hoisting and redeclaration pass. Array patterns admit
elisions, defaults, nesting, and a final identifier or nested
array rest target. Object patterns admit static and computed properties,
shorthand and renamed targets, defaults, nested object or array patterns, and a
final identifier rest target. Catch parameters and synchronous `for-of`
declarations reuse the same recursive patterns. Standalone destructuring
assignment reuses them when every leaf and rest target is an existing
identifier or a static or computed member reference. Synchronous `for-of`
assignment heads reuse that assignment target conversion. A computed member
target, a computed property name, and a default may each contain `await`; the
frontend converts them unchanged and the compiler decides whether the enclosing
body owns a suspension frame for them. `for-await-of` heads reuse the same
declaration and assignment target conversion. Pattern type annotations on
assignment, `for-of`, and catch targets, and `for-in` heads remain explicit
boundaries.
Compound assignment converts every arithmetic, exponentiation, bitwise, shift,
and logical form into an owned identifier or member update. Await inside that
expression remains an explicit boundary until the compiler can retain its
already-read target value across suspension.
Prefix and postfix `++` and `--` convert to separate owned identifier or member
steps that retain result selection. A member step keeps its object and key
expressions so the compiler can preserve one evaluation and two observable key
conversions.
Direct awaited initializers resume into predeclared lexical cells or write
hoisted `var` cells. Lexical module exports name every binding in the pattern;
`export var` remains outside the profile.

The adapter keeps raw Babel shapes and conversion context in *babel.ts*.
*locations.ts* owns UTF-8 indexing and source diagnostics, while *hints.ts*
owns TypeScript and JSDoc hint extraction. The mutually recursive expression,
pattern, statement, function, hoisting, and asynchronous conversions remain
together in *convert.ts*. *modules.ts* owns import, export, and module-program
conversion. *index.ts* only parses through Babel and composes the two public
frontend values. These files remain package-private implementation paths.
