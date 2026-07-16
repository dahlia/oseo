@oseo/parser-babel
==================

This package contains the bootstrap Babel adapter. It converts accepted source
immediately to Oseo-owned syntax and turns parser or profile failures into Oseo
diagnostics. Babel nodes do not cross its public boundary.
Parenthesized call targets are normalized before classification. The compiler
then resolves `console` and `Object` lexically before admitting host or
reflection intrinsics. M3 function values, objects, arrays, loops, and exception
syntax enter only through owned syntax.
Call type arguments, optional parameters, TypeScript `this` parameters, and
other withheld forms are rejected at this boundary. Source positions and UTF-8
byte offsets are indexed once for linear-time conversion.
Inputs use non-strict script parsing. Import and export nodes still reach
profile validation and are rejected as `OSEO1001`. Only `/** ... */` block
comments contribute JSDoc hints; ordinary block and line comments never do.
