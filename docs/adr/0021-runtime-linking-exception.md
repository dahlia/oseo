A linking exception for the runtime surface
===========================================

Status
------

Proposed, 2026-07-28, revised 2026-11-03. Three questions remain open below,
and the maintainer decides acceptance after they are answered. This record
does not assess the legal effect of any license text.

Correspondence with the FSF licensing queue is under way. It is recorded below
as evidence of the questions in play, not as an answer to any of them.


Context
-------

Oseo compiles a program and links Oseo-authored support code into the result.
Under the current licensing, that support code reaches the user under plain
GPLv3, with no exception of any kind.

Whether that obliges the author of a compiled program is a legal question this
record cannot settle. It is the question the record exists to route. Compilers
that link a runtime into their output have generally treated the plain-GPL
arrangement as one to avoid: GCC pairs libgcc with the GCC Runtime Library
Exception, and LLVM pairs a permissive base license with an exception of its
own. Oseo has neither.

The maintainer's requirement is that copyleft continue to bind anyone who
modifies Oseo, including its runtime, while the author of a compiled program
takes on no obligation from Oseo. Those two goals are what the alternatives
below are measured against.

The size and direction of the support surface bear on the choice, so both are
measured rather than assumed.


Probe evidence
--------------

Measurements come from commit `8f2fff6`. Package licensing was read from the
eight *package.json* and eight *deno.json* manifests under *packages/* and
from each package *LICENSE*. Runtime size came from
`wc -l packages/runtime-c/native/*`, compared against the same command at
commit `4920000`. The generated C came from `runNativeCli` with `--emit-c` on
the program `const x = 1 + 1;`. Backend emission was read from
*packages/backend-c/src/index.ts*.


Observed results
----------------

All eight packages declare `GPL-3.0-only` in both manifest forms, and every
package *LICENSE* is byte-identical to the repository *LICENSE*, which is the
unmodified GPLv3 text.

The runtime under *packages/runtime-c/native/* holds 13,050 lines in 13 C
translation units and two headers. The largest are *runtime\_object.c* at
2,020 lines and *runtime\_primitive.c* at 1,678. The same directory held 8,503
lines at commit `4920000`, before the M5a work of 27 and 28 July, which
admitted object literals, generators, classes, and asynchronous iteration.

The Zig toolchain builds `liboseo_runtime-<target>.a` and passes it to the
final link. The command-line entry point reuses a cached
`liboseo-runtime-<key>.a` when one exists for the reuse key.

Generated programs contain C that Oseo authors. Some of it is fixed text, such
as the `#include "oseo_runtime.h"` at *index.ts* line 2476. Some is assembled
from fixed and interpolated fragments, such as the dispatch function around
lines 2355 to 2403. A scan for lines beginning with a string or template
literal finds 389, of which 277 precede the final boilerplate block. Not all
of those lines are emitted C, and no counting rule in this record distinguishes
them, which is why this record relies on an inventory rather than quoting a
figure.

`mise run check:packages` runs *tools/check-packages.ts* and then
`deno publish --dry-run`. The former requires each package *LICENSE* to match
the repository *LICENSE* and inspects packed npm artifacts; it does not compare
`license` fields. The Deno dry run reads the JSR manifests but does not enforce
any relationship between the two manifest forms.

The following are inferences and premises rather than observations. Plain GPL
on linked support code would deter adoption for the server workloads Oseo
targets. The
runtime grew because the admitted families of those two days need native
support, though this record does not attribute the growth to any one family.
Relicensing after outside contributions arrive would require agreement from
those contributors.


Correspondence
--------------

GNU RT ticket `#2446621` holds the exchange with the FSF Licensing and
Compliance team, from the maintainer's question on 2026-07-28 to the
maintainer's reply on 2026-11-03. The exchange is not publicly archived. The
[licensing correspondence evidence](../evidence/licensing/README.md) lists each
message, summarizes it, and explains why the originals stay outside the
repository.

Topham gave a tentative reading: if the GPLv3 compiler produces C, that C and
its binary contain parts of the original ECMAScript, and no additional nonfree
code enters compilation, then “an exception like the GCC one makes sense”.
Topham added that “we would have to do more than remove the GCC-specific
references”, that the text would need to describe what happens when the
ECMAScript executes, and that the FSF might publish a new exception alongside
the GCC and Autoconf ones. Siewicz then stated the boundary: “Unfortunately,
the FSF cannot provide legal advice.” Siewicz offered to explain how the
licenses are intended to apply and suggested consulting a lawyer. Rabkin asked
why the maintainer raised an Eligible Compilation Process and whether “the GPL
plugin mechanism” made the process ineligible.

The 2026-11-03 reply answers the eligibility question. Oseo uses no GCC
component: the
frontend is Babel's parser, the compiler is Oseo's own, and the pinned `zig cc`
driver compiles and links the result. The reply separates the four
contributions to a generated program and asks two questions about the
unmodified text. First, whether distributing generated C that includes the
runtime header and Oseo-authored helper code falls under the additional
permission even though that C still needs compilation. Second, whether runtime
code supplied as source and compiled with the user's program is treated like
a separately built library.

Neither answer has arrived. Nothing in the exchange selects an exception,
resolves whether it reaches source-supplied built-ins, or changes a license.


Alternatives considered
-----------------------

1.  **Keep plain GPL everywhere.** Rejected. It leaves the obligation on
    compiled programs unresolved, which is the problem this record opens.
2.  **License the runtime under MIT or Apache-2.0.** Rejected because the
    maintainer requires modifications to the runtime, and to any self-hosted
    built-in library, to stay under copyleft terms. A permissive runtime
    answers the user's side and gives up the other.
3.  **Draft an exception specific to Oseo.** Rejected. There is no budget for
    legal review, and unreviewed copyleft text carries more risk than either a
    standard exception or the present state.
4.  **Apply an existing, widely used linking exception to the support
    surface.** Preferred direction. It avoids project-specific text and fits
    the maintainer's two requirements better than the others. Acceptance still
    depends on choosing the text, resolving how it treats self-hosted
    built-ins, and fixing the surface inventory.


Decision
--------

This record proposes that the support surface carry GPL-3.0-only plus an
existing linking exception, while everything else stays GPL-3.0-only without
one.

The support surface is Oseo-authored code that Oseo puts into a program it
compiles so that the program can run. Today that is the sources and headers
under *packages/runtime-c/native/*, and the C that *packages/backend-c* emits
into generated programs.

Three things that a looser reading would sweep in are outside it. A program
Oseo compiles is an input, not support code, so the repository's own fixtures
and Test262 inputs stay outside; so does the native compiler that M8 produces
by compiling the compiler source, which links the runtime the way any other
program does. Code that runs only during compilation stays outside even when
it ships in the runtime package, which *packages/runtime-c/src/index.ts* does.
Documentation, tests, manifests, and build configuration are outside because
they are never incorporated into a compiled program.

If a built-in family is self-hosted in the compiled subset under the M8
strategy, and its source or compiled form is incorporated into user programs, it
joins the support surface. Neither [*ROADMAP.md*](../../ROADMAP.md) nor
[*DESIGN.md*](../../DESIGN.md#runtime-and-object-model) commits every family to
self-hosting; both say a family may weigh it. Neither records how self-hosted
built-ins would be packaged, so whether they are embedded per program or linked
from a shared artifact is undecided, and the surface cannot be sized ahead of
that decision.


Open questions
--------------

**Which exception.** The GCC Runtime Library Exception 3.1
(`GPL-3.0-only WITH GCC-exception-3.1`) has the closest precedent and was
written by the FSF for a compiler runtime. Its length comes mainly from
defining an eligible compilation process and the target code that process
produces, and the grant is conditioned on that eligibility. Whether Oseo's
pipeline satisfies the condition has to be checked rather than assumed, because
that pipeline runs a Babel frontend, an Oseo-owned backend, and a Zig-driven C
toolchain. The comparison also covers three further texts. The Classpath
Exception 2.0 is one paragraph and easier for a contributor to read, though its
customary pairing is GPLv2. The Autoconf Configure Script Exception 3.0
addresses copied generator code in output, which is closer to Oseo's emitted C
than the Classpath text is. LLVM's exception waives named Apache conditions for
embedded object-form portions, but its permissive base conflicts with the
copyleft requirement above. Topham's suggestion of a new FSF-published
exception is not alternative 3 above, because it would be drafted and reviewed
outside this project.

**Distribution of generated C.** Section 1 grants propagation of Target Code
formed by combining the Runtime Library with Independent Modules, and section 0
defines Target Code as output “in executable form or suitable for input to an
assembler, loader, linker and/or execution phase.” It then excludes data used
as a compiler intermediate representation. Generated C includes the runtime
header and Oseo-authored helper code, and it still has to be compiled, so
whether it is Target Code for this purpose is not settled. The answer decides
whether the emitted C carries the exception notice or stays under plain GPL,
and it is the first question in the 2026-11-03 reply.

**Source-supplied built-ins.** Whether an exception written for a linked native
library reaches runtime code supplied as source and compiled into the user's
program is not obvious, and it matters more here than for GCC because the M8
strategy may move built-in implementations across that line on purpose. The
maintainer's reading is that such files would join the Runtime Library rather
than act as Independent Modules, but section 0 excludes works “otherwise based
on the Runtime Library” from that role, and none of the three FSF replies
addresses how the exclusion applies when covered code and user code are
compiled together.
The 2026-11-03 reply asks this question directly.

**The surface inventory (closed).** The checked-in
[*runtime support surface inventory*](../runtime-support-surface.md) lists each
tracked file in the current surface, requires mixed files to be split before
they land, maps generated artifacts to their tracked sources, and maps
file-level treatment to npm and JSR SPDX expressions. The backend's fixed and
interpolated C fragments now live in a data-only file, separate from lowering
and composition logic.

Before acceptance, written answers to the exception, distribution, and
source-supplied built-ins questions should be on file from the FSF licensing
team or another identified source. The inventory question is settled in the
repository.


Consequences
------------

If accepted, the work is larger than a manifest edit. An exception of this
kind applies to the files that carry its notice, so every covered source and
header needs one, the exception text has to travel with both the published
packages and the compiled artifacts, and the emitted C needs one in the
generated program if the distribution question places it under the additional
permission. Package manifests gain SPDX expressions alongside that.
`mise run check:packages` would have to be extended to compare `license` fields
across both manifest forms and to check that packed and emitted files carry the
notice; it does none of that today.

Splitting the emitted C out of *packages/backend-c/src/index.ts* was a
prerequisite rather than a follow-up, because the file could not otherwise be
given one treatment. That split has landed; the
[inventory](../runtime-support-surface.md) records the data-only file.

Contributors would gain a question they do not have now, which is which side a
new file sits on. The rule above answers it for the cases named, and the
inventory is meant to answer it for the rest. A directory rule would have been
easier to apply and would have missed the C the backend emits, which is why
this record does not propose one.

Opening the repository to outside contributions is what makes this urgent.
Until outside contributions arrive, the maintainer can change the license
without anyone else's agreement.


Failure modes and replacement triggers
--------------------------------------

 -  Evidence that the selected exception does not reach self-hosted built-ins
    compiled into user programs reopens the choice of text.
 -  A compiled program that still carries an obligation to its author under the
    selected text invalidates this record.
 -  A file that the inventory and the rule together cannot classify means the
    boundary has failed, and the inventory should be replaced by a structural
    boundary.
 -  A later decision to adopt a permissive base license for the whole project
    would supersede this record rather than amend it.
 -  An answer placing generated C outside the additional permission reopens
    how the backend's emitted fragments and the generated file reach users,
    separately from how the executable does.


Links
-----

 -  [ADR 0003](./0003-c11-runtime-and-zig-boundary.md) defines the runtime and
    toolchain boundary this record licenses.
 -  [*ROADMAP.md*](../../ROADMAP.md) records the M8 self-hosting strategy that
    may move code across the proposed boundary.
 -  [*DESIGN.md*](../../DESIGN.md#runtime-and-object-model) allows a built-in
    family to be self-hosted in the compiled subset, keeping primitive
    operations native.
 -  [*CONTRIBUTING.md*](../../CONTRIBUTING.md) states the packaging rules the
    license metadata must satisfy.
 -  [*docs/runtime-support-surface.md*](../runtime-support-surface.md) is the
    checked-in support-surface inventory.
 -  The exception texts compared above are the
    [GCC Runtime Library Exception 3.1][RLE], the
    [Classpath Exception][Classpath], the
    [Autoconf Configure Script Exception][Autoconf], and the
    [LLVM license][LLVM]. The [GCC exception FAQ][FAQ] states how the FSF
    intends the GCC text to apply.

[RLE]: https://www.gnu.org/licenses/gcc-exception-3.1.html
[Classpath]: https://www.gnu.org/software/classpath/license.html
[Autoconf]: https://www.gnu.org/licenses/autoconf-exception-3.0.html
[LLVM]: https://llvm.org/LICENSE.txt
[FAQ]: https://www.gnu.org/licenses/gcc-exception-3.1-faq.html
