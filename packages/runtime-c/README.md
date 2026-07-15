@oseo/runtime-c
===============

This package provides versioned, reviewed C11 runtime source inputs. The M1
runtime owns opaque NaN-boxed values, UTF-16 strings, primitive semantics,
two-word call results, explicit root frames, mark-and-sweep collection, and the
deterministic `console.log` intrinsic. Native assets remain separate files and
are included in npm and JSR packages.
Lexical bindings use a private uninitialized sentinel for runtime TDZ checks.
Power-of-two radix strings are rounded once from their exact integer value into
binary64.
Numeric coercion distinguishes an ordinary `NaN` conversion from temporary
buffer allocation failure. Allocation failure propagates as an abrupt
`OSEO2001` result through arithmetic and relational operations.
String concatenation checks its combined UTF-16 length before addition or
allocation, so an unrepresentable result fails with `OSEO2001` instead of
wrapping a native allocation size.
Declared-function calls have a deterministic maximum active depth of 256. The
runtime returns an owned `OSEO2001` diagnostic before entering another C frame
when that limit is reached.
Root slot arrays are allocated independently of the process stack. Allocation
failure propagates as `OSEO2001`. The script and active declared functions also
have a deterministic aggregate limit of 32,768 root slots. Exceeding this
native-frame budget fails with `OSEO2001` before generated C is entered.
The `m1-3` context ABI carries diagnostic source identifiers with explicit byte
lengths, heap-backed root-frame ownership, and active frame-budget accounting.
Embedded null bytes are preserved during native error output.
