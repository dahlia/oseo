@oseo/parser-babel
==================

This package contains the bootstrap Babel adapter. It converts accepted source
immediately to Oseo-owned syntax and turns parser or profile failures into Oseo
diagnostics. Babel nodes do not cross its public boundary.
Parenthesized call targets are normalized before classification. The compiler
then resolves `console` and `Object` lexically before admitting host or
reflection intrinsics. M3 function values, objects, arrays, loops, and exception
syntax enter only through owned syntax. The M4 module frontend converts static
imports, exports, top-level await, promises, async functions, and timers to the
same owned boundary. Async suspension suffixes become private continuation
functions before compiler lowering.
M5 synchronous `for-of` heads admit one identifier, array, or object
declaration, or an existing binding or member target. `for-in`,
`for-await-of`, destructuring `for-of` assignment heads, and classic `for` head
patterns remain owned profile failures. Array literals, call arguments, and
constructor
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
identifier. Member targets, pattern type annotations, function parameters, and
classic `for` head destructuring remain explicit boundaries.
Direct awaited initializers resume into predeclared lexical cells or write
hoisted `var` cells. Lexical module exports name every binding in the pattern;
`export var` remains outside the profile.
