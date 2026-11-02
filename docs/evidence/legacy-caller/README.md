Legacy `caller` evidence
========================

This directory holds the evidence behind
[ADR 0033](../../adr/0033-legacy-function-caller-contract.md), the contract for
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

The probe samples built-in functions; it does not enumerate them. The
`built-in` group shows the split that ADR 0033 declines to copy, not a complete
list of V8's C++ built-ins.
