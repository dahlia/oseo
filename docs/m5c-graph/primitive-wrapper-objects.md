Primitive wrapper objects
=========================

This node completes non-strict call binding and the applicable ToObject
receiver boundaries. It uses the existing five wrapper representations,
constructor behavior, branded methods, String own properties, and tracing.
It adds no internal slot or runtime entry point.


ECMA-262 2025 contracts
-----------------------

 -  7.1.18 `ToObject` creates a fresh Boolean, Number, String, Symbol, or
    BigInt object containing the original primitive; an object is returned
    unchanged and a nullish input throws `TypeError`.
 -  10.2.1.2 `OrdinaryCallBindThis` preserves strict receivers and binds a
    non-strict receiver once before parameter evaluation, using the callee
    realm. The generated entry roots this identity and a suspension record
    retains it. Lexical arrows receive the enclosing bound receiver.
 -  23.1.2.1 `Array.from` first uses `GetMethod` with the original receiver.
    Its array-like branch then uses one `ToObject` result for length and
    indexed reads, including strict getters and their side effects.
 -  20.1.3.6 `Object.prototype.toString` reads `@@toStringTag` from its
    `ToObject` result. Node.js 24.21.0 and Deno 2.9.7 instead expose the
    primitive to a strict tag getter. Tests label that reference discrepancy
    separately from the normative native model.
 -  Ordinary primitive property References preserve the primitive getter
    receiver. So does the `Invoke` in 20.1.3.5
    `Object.prototype.toLocaleString`.

*runtime\_binding.c* and the generated function entry own call binding;
*runtime\_array.c* owns the `Array.from` branch;
*runtime\_object\_builtin.c* owns object tagging. The existing
*runtime\_function.c* realm switch and lexical receiver selection precede
the generated entry, and *runtime\_generator.c* traces the bound receiver
across suspension. *runtime\_memory.c* traces existing primitive wrapper
data. None of those last three interfaces changes.

The separately registered `primitive-receiver-inherited-set` node owns
ordinary primitive inherited setters, descriptor precedence, Proxy Set
dispatch, and strict/sloppy write failure. This node does not claim that
contract or transfer either of its reserved Proxy paths. Root authorized
composition with Eval, RegExp, and computed Reference after removing the
TCO implementation. The subsequent TCO source preparation restores only
that node's delta on Source4, including the exact Wrapper tail registration;
it is not a five-node publication unit or an UPDATE input. Canonical
observations and owners remain those of successful Main `de491133`, including
the later Source4 UPDATE described below. This preparation claims no
successful Main gates for the new TCO source.


Evidence and preparation boundary
---------------------------------

*tests/fixtures/primitive-wrapper-objects/owned-paths.txt* is the exact
40-path selector from the checked-in reviewed manifest. Every path initially
reports `primitive-wrapper` and belongs to this node. The four resizable
buffer locale paths postdate the historical 36-path ownership audit. The
pinned revision remains `f2d1435644797268dca1f7988cad5a4e89ccd8d2`.

*tests/primitive-wrapper-objects.test.ts* supplies fixed, differential,
structural, and focused standards evidence. Its public-runtime C fixture
sweeps every allocation attempt of warmed per-kind boxing, forces collection,
checks balanced roots after each failure, and retries the same context.
TCO source preparation restores the exact strict tail-forwarding
registration from `22a70dd9`. It checks actual tail MIR and trampoline C
before observing all five brands through ordinary, bound, and Proxy calls,
parameter defaults, and lexical captures. Every earlier fixed assertion
remains unchanged. Native execution on the composed source remains pending.
The two independently modeled domains in
*tests/property/m5-primitive-wrapper-objects.property.test.ts* reserve
`0x60008a00` and `0x60008a01`. Their aligned seed block remains unchanged;
TCO separately retains its restored `0x60008900` block. Budgets are 12
ordinary cases and 240-second interrupt limits per domain, with both native
policies, forced collection, and positive guard and generic fallback counters.

Source preparation left successful Main's canonical observations unchanged.
The complete UPDATE on clean source `6e54c5d5` then finished naturally with
exit 0 and observed all 40 owned paths as passes. The preceding focused gate
passed all eight fixed registrations, including the 40-path selector's 156
strictness/policy variants, and both unchanged 12-case property domains.
These observations do not land the node. Post-observation review and exact
candidate CI remain pending; that CI owns full TEST and EXT. Zig flags alone
are not ASan activity evidence.

On the preparation host every native compilation or execution must hold
the sole */data/oseo-heavy.lock*, check `oseo-capacity` before and after
acquiring it, and use its fresh systemd prefix, with `MISE_JOBS=1`,
`MISE_TASK_JOBS=1`, and the worktree's assigned Zig cache. Review sandboxes
may inspect the source and run pure checks; existing focused logs supply
native evidence when that resource protocol is unavailable. Full UPDATE,
TEST, and EXT are outside internal review scope.
