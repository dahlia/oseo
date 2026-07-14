M0-A executable probes
======================

These probes preserve the evidence behind the initial architecture decisions.
They are not production packages and do not implement JavaScript semantics.


Running the probes
------------------

From a clean checkout, run:

~~~~ sh
mise install
mise run check:probes
~~~~

The aggregate installs the locked JavaScript dependencies through aube, runs
one erasable TypeScript fixture under Node.js and Deno, compares two parser
candidates under both hosts, builds the native C boundary for x86-64 and
AArch64, checks two value layouts, and exercises the call and root protocols.
Each task prints its pinned tools and target.

`mise run check` also type-checks every TypeScript probe with pinned Deno.


Expected observations
---------------------

The host and parser JSON must match byte for byte between Node.js and Deno for
each parser candidate. The invalid corpus entry produces `OSEO0001`; the
parseable arrow function produces `OSEO1001`.

The native boundary prints `native-boundary=42` after linking the runtime from a
static archive. The AArch64 fixture compiles and links but is not executed. Both
value programs print that every correctness case passed and emit instruction
summaries for x86-64 and AArch64. The ABI and root probe reports that normal,
nested, abrupt, allocating, and forced-collection paths passed.


Ownership
---------

*parser/* converts candidate data to the small schema in *parser/schema.ts*
before comparison. *native/generated.c* represents backend output;
*native/runtime.c* is a separate runtime translation unit; *native/run.sh* owns
target selection and process execution. *value/* contains independent layout
programs. *abi-roots/* contains a test collector whose only purpose is to expose
the call and safepoint contracts.

Generated executables, archives, object files, and assembly listings live in a
temporary directory and are removed after a successful run. A task failure
prints enough context to reproduce the failing command.
