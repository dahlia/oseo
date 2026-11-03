Legacy `caller` evidence
========================

This directory holds the evidence behind
[ADR 0034](../../adr/0034-legacy-function-caller-contract.md), the contract for
the own `caller` and `arguments` properties of non-strict functions.


V8 reference observations
-------------------------

*v8-probe.cjs* observes the properties on V8. It runs every case as Script code
through `node:vm`, so no CommonJS wrapper function sits under the top level,
and it uses a second `vm` context as a second realm. Run it with the pinned
Node.js:

~~~~ sh
node docs/evidence/legacy-caller/v8-probe.cjs
~~~~

*v8-probe.txt* is its output under Node.js 24.21.0. Each line has a group, a
case, and the observed value, separated by tabs. Function values print as their
names, and an anonymous arrow prints as `<anonymous>`. The ADR cites the
groups.

The `invariant` group repeats the check of test262's
*consistent-value-function-caller.js* and
*consistent-value-function-arguments.js*: after a program redefines the
property with writable and configurable both false, a later read while the
function is active must report the same value. Node.js 24.21.0 reports a
different one for both.

The probe samples built-in functions; it does not enumerate them. The
`built-in` group shows the split that ADR 0034 declines to copy, not a complete
list of V8's C++ built-ins.


Deno
----

*deno-presence.js* checks whether Deno exposes the properties at all. Run it
with the pinned Deno:

~~~~ sh
deno run docs/evidence/legacy-caller/deno-presence.js
~~~~

*deno-presence.txt* is its output under Deno 2.9.7, which runs V8 15.0. A
non-strict function there has only `length`, `name`, and `prototype`, and
reading `caller` while it is active throws a `TypeError`. Its
%Function.prototype% getter and setter are also different functions, unlike
the single %ThrowTypeError% that ECMA-262 requires. Deno is therefore not a
reference for ADR 0034.
