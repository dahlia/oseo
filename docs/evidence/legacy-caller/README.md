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

*deno-presence.js* checks how Deno exposes the properties. `deno run`
evaluates the file as a module, so the probe builds its functions with
`new Function` to keep them non-strict. Run it with the pinned Deno:

~~~~ sh
deno run docs/evidence/legacy-caller/deno-presence.js
~~~~

*deno-presence.txt* is its output under Deno 2.9.7, which runs V8 15.0. A
non-strict function there has only `length`, `name`, and `prototype` as own
keys, but reading `caller` or `arguments` still works: the getters on
%Function.prototype% answer for a non-strict function, reporting the same
caller and the same received arguments as Node.js, and they throw a
`TypeError` for a strict one. These are no longer the single %ThrowTypeError%
that ECMA-262 installs there; the getter and setter are different functions.

Deno is therefore a reference for the values ADR 0034 reports, but not for
own keys, descriptors, definition, or deletion, which Node.js alone shows.


Per-call cost
-------------

ADR 0034 caps activation tracking at no allocation per call and at most 5
percent of a call-heavy benchmark's median run time. *cost/* holds the
measurement. Each of the three programs makes 20 million calls: direct calls
of a non-strict function, the same loop in strict code, and
`Array.prototype.forEach` callbacks, which add a built-in activation per
callback.

*cost/build.sh* builds each program twice with `zig cc -O2` and no
sanitizers: once against the runtime of the base commit, once against the
working tree. *cost/time.py* runs the builds in alternating order and reports
medians. *cost/results.json* is the output of 11 rounds on Linux AMD64 (AMD
Ryzen 7 7700X, Zig 0.16.0, load average below 3 on 16 threads), against base
`528688879`:

| Program                | Base median, s | Current median, s | Change |
| ---------------------- | -------------: | ----------------: | -----: |
| *sloppy-calls.js*      |          7.385 |             7.360 | −0.3 % |
| *strict-calls.js*      |          9.569 |             9.545 | −0.3 % |
| *builtin-callbacks.js* |          6.617 |             6.815 | +3.0 % |

All three stay inside the ceiling. The two direct-call programs differ by less
than their round-to-round spread, so they show no measurable cost; the
callback program pays for the extra built-in record. One host and one session
estimate no variation across machines. *tests/legacy-caller.test.ts* checks
the allocation half: a program's allocation count is the same for 10 and
10,000 rounds of non-strict and built-in calls.
