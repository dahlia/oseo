Runtime support surface inventory
=================================

Status
------

This inventory resolves the surface-inventory question in
[ADR 0021](./adr/0021-runtime-linking-exception.md). It records the current
boundary only. ADR 0021 remains proposed, and this inventory neither selects
an exception nor changes a license.


Classification rule
-------------------

The support surface is Oseo-authored code that Oseo incorporates into a
compiled user program so that the program can run. A tracked source belongs to
the surface when its contents are copied, compiled, or linked into that
program. Compiler-only lowering, providers, tests, documentation, manifests,
and build configuration remain outside.

A mixed tracked file must not land. If a file would contain both support
surface content and compiler-only content, split it into separately tracked
files before merging the change. Review the inventory in the same change when
the split adds, removes, or reclassifies a file.


Tracked source inventory
------------------------

The backend contribution to generated programs is:

 -  *packages/backend-c/src/emitted-c.ts*

That file is data-only. It groups fixed C templates by emitted construct and
shares common forms. The template tuple shape records each interpolation site,
so TypeScript checks the number of names, values, counts, and labels supplied
by the backend. MIR lowering, validation, interpolation-value selection, and
template composition remain in *packages/backend-c/src/index.ts*, outside the
support surface.

The linked runtime contribution is:

 -  *packages/runtime-c/native/oseo\_runtime.h*
 -  *packages/runtime-c/native/runtime\_internal.h*
 -  *packages/runtime-c/native/runtime\_async\_generator.c*
 -  *packages/runtime-c/native/runtime\_binding.c*
 -  *packages/runtime-c/native/runtime\_core.c*
 -  *packages/runtime-c/native/runtime\_error.c*
 -  *packages/runtime-c/native/runtime\_event\_loop.c*
 -  *packages/runtime-c/native/runtime\_function.c*
 -  *packages/runtime-c/native/runtime\_generator.c*
 -  *packages/runtime-c/native/runtime\_iterator.c*
 -  *packages/runtime-c/native/runtime\_memory.c*
 -  *packages/runtime-c/native/runtime\_object.c*
 -  *packages/runtime-c/native/runtime\_primitive.c*
 -  *packages/runtime-c/native/runtime\_promise.c*
 -  *packages/runtime-c/native/runtime\_symbol.c*

*packages/runtime-c/src/index.ts* is a compile-time provider. It names and
orders the runtime assets but is not incorporated into a compiled user
program, so it remains outside the surface.


Generated artifact mapping
--------------------------

Generated artifacts inherit the treatment of every tracked source from which
they are built. Build output is not a second classification authority.

The unbundled backend build maps
*packages/backend-c/src/emitted-c.ts* to
*packages/backend-c/dist/emitted-c.js* and its generated declaration and
source-map companions. Those artifacts inherit the support-surface treatment.
*packages/backend-c/dist/index.js* is generated from compiler-only lowering
and retains the compiler treatment; it imports the separate fragment module
instead of bundling its text.

Published runtime native files are copied from
*packages/runtime-c/native/* and inherit their corresponding tracked source
treatment. An archive or object compiled from those files inherits the same
treatment. Generated C receives the treatment of
*packages/backend-c/src/emitted-c.ts* even though the generated file itself is
not tracked.


Package SPDX mapping
--------------------

Until ADR 0021 is accepted, every manifest remains `GPL-3.0-only`. Acceptance
replaces `<EXCEPTION-ID>` below with the selected SPDX exception identifier
and updates the npm and JSR manifests together.

| Package contents           | npm and JSR SPDX expression                           |
| -------------------------- | ----------------------------------------------------- |
| GPL-only files             | `GPL-3.0-only`                                        |
| Support-surface files only | `GPL-3.0-only WITH <EXCEPTION-ID>`                    |
| Both treatments            | `GPL-3.0-only AND (GPL-3.0-only WITH <EXCEPTION-ID>)` |

Under the current inventory, `@oseo/backend-c` and `@oseo/runtime-c` use the
mixed package expression after acceptance. Every other package remains
`GPL-3.0-only` unless a later inventory change places one of its tracked
sources in the support surface. File notices remain authoritative for which
files carry the exception.
