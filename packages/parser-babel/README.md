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
Call type arguments, optional parameters, TypeScript `this` parameters, and
other withheld forms are rejected at this boundary. Source positions and UTF-8
byte offsets are indexed once for linear-time conversion.
The script frontend uses non-strict script parsing. The module frontend uses
module parsing and reports withheld module forms as `OSEO1001`. Only
`/** ... */` block comments contribute JSDoc hints; ordinary block and line
comments never do.
