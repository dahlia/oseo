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
assignment pattern whose leaves are existing targets. `for-in`,
`for-await-of`, and classic `for` head patterns remain owned profile failures.
Array literals, call arguments, and constructor
arguments retain spread entries at the owned syntax boundary.
Call type arguments, optional parameters, TypeScript `this` parameters, and
other withheld forms are rejected at this boundary. Source positions and UTF-8
byte offsets are indexed once for linear-time conversion.
The script frontend uses non-strict script parsing. The module frontend uses
module parsing and reports withheld module forms as `OSEO1001`. Only
`/** ... */` block comments contribute JSDoc hints; ordinary block and line
comments never do.
Standalone one-declarator `const` and `let` binding declarations and standalone
`var` declaration lists are converted into compiler-owned recursive patterns.
A `var` list may mix plain and pattern declarators; every pattern name joins the
existing function-scope hoisting and redeclaration pass. Array patterns admit
elisions, defaults without `await`, nesting, and a final identifier or nested
array rest target. Object patterns admit static and computed properties,
shorthand and renamed targets, defaults, nested object or array patterns, and a
final identifier rest target. Catch parameters and synchronous `for-of`
declarations reuse the same recursive patterns. Standalone destructuring
assignment reuses them when every leaf and rest target is an existing
identifier or a static or computed member reference. Synchronous `for-of`
assignment heads reuse that assignment target conversion. Await inside a
member target, pattern type annotations, function parameters, and classic
`for` head destructuring remain explicit boundaries.
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
