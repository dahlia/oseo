@oseo/parser-babel
==================

This package contains the bootstrap Babel adapter. It converts accepted M1
source immediately to Oseo-owned syntax and turns parser or profile failures
into Oseo diagnostics. Babel nodes do not cross its public boundary.
Parenthesized call targets are normalized before classification. The compiler
then resolves the `console` name lexically before admitting `console.log` as the
M1 host intrinsic.
Generic function declarations, call type arguments, optional parameters, and
TypeScript `this` parameters are rejected at this boundary instead of entering
owned syntax as supported M1 forms.
Top-level blocks and `if` statements are rejected before owned syntax. Source
positions and UTF-8 byte offsets are indexed once for linear-time conversion.
Inputs use non-strict script parsing. Import and export nodes still reach
profile validation and are rejected as `OSEO1001`. Only `/** ... */` block
comments contribute JSDoc hints; ordinary block and line comments never do.
