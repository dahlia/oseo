ADR 0029: Ahead-of-time host Script bindings
============================================

Status
------

Accepted architecture for M5c node `test262-host-script-bindings`. Root
initially reserved runtime ABI `m5-138` and property block `0x60008d00` through
`0x60008dff`. This record authorizes no exclusion and does not reopen
[ADR 0016](./0016-dynamic-source-boundary.md). Runtime validation and fresh
standards observations are separate gates from source preparation.
For the later composition on TCO/Reg source `beea6880`, Root reserved
ABI `m5-140` for Host layout together with the final environment bitmap.
The bitmap environment APIs retain their existing implementation; Host
lexical cells use those APIs and remain rooted by their realm. Source-bound
`918a6d93` fixed-suite passes do not validate this composition.


Context
-------

The fourteen original host-binding observations cover thirteen global-code
subjects and one RegExp subject that reads `print`. Their actual contracts
include persistent lexical declarations, atomic declaration permissions,
function redeclaration, and global descriptors. One global-code subject also
calls ordinary `eval(String)` twice and therefore retains that separate
ADR 0016 boundary after host admission. Filenames do not determine admission
or authorize excluding its unobserved non-source assertions.

ADR 0026 demonstrates compiling known host source ahead of time. Extending
that approach to Scripts requires a persistent declarative record in each
realm, independent source strictness, completion values, retained closures,
and one dispatcher that can call functions from every compiled Script.


Decision
--------

An explicit test262-host build collects literal strings and concatenations
of string literals passed at `evalScript` property call sites. This includes
computed literal property keys and calls through a created realm's host.
It also recognizes a simple lexical `const` declarator initialized by an
`evalScript` property read, and chains of such immutable aliases. Calls through
that binding may contribute the same literal arguments. The resolver records
binding identities before resolving hoisted functions, so closures can capture
those aliases; an inner lexical binding, parameter, or intervening `with`
record prevents an outer alias from being assumed. Mutable `let`/`var`,
destructuring, returned/bound callables, and indirect `.call`/`.apply` forms
do not discover new sources. TDZ and writes to `const` still follow the normal
runtime binding rules; conservative discovery executes neither operation.
Collection repeats over parsed members of that finite set. It is conservative
about call targets: a shadowed method can contribute an unused source, but
collecting it executes nothing and its invalid or unsupported contents cannot
reject the enclosing program. Arbitrary computed sources, interpolation, and
unproven aliases do not discover sources. Unrelated ordinary or dynamic calls
contribute no candidates. A runtime call may reuse any exact source already
in the set, including through an otherwise unproven alias.

The compiler parses and lowers each member before native emission, assigning
unique binding and function identities in the main program's dispatcher.
Runtime selection compares exact UTF-16 source text against the immutable
linked table. A matched malformed source throws the first parse error as a
`SyntaxError` in the host function's realm at invocation. A matched unsupported
profile construct reports its owned diagnostic at invocation. An unmatched
String reports `OSEO1001`; a non-String argument throws `TypeError`. Nothing
parses, compiles, loads code, or runs a bootstrap runtime inside the executable.

Each compiled evaluator allocates a fresh Script environment and uses the
existing global declaration permission checks. Those checks now reject a
lexical name already in the realm's declarative record and var/function names
colliding with that record, before creating any binding or executing any
statement. The validated lexical cells become persistent realm roots and
remain absent from the reflected global object. Their mutability and temporal
dead zones survive across Scripts and abrupt bodies. Global var/function
storage keeps the existing property-backed cell contract and descriptors.

A host identifier reference resolves the persistent Global Environment
Record before evaluating its right operand. GetBindingValue and
SetMutableBinding select that record's current lexical or object storage;
a lexical declaration introduced by the right operand is therefore visible
to an already resolved reference. An initially unresolvable sloppy write
still creates a global-object property. Explicit `this` and
`globalThis` still expose the actual global object. Function and block-local
bindings keep their existing lexical resolution. The Script completion
accumulator preserves StatementList values, UpdateEmpty(undefined) for
compound statements, and the protected completion through a normal finally;
an abrupt completion propagates through existing compiled cleanup paths.

Existing private runtime call targets `console.log`, `setTimeout`, and
`clearTimeout` consult current Script global and with records in a host
build. A supplied binding selects its callable and receiver before arguments
are evaluated. Only an initial binding miss uses the unchanged private
intrinsic; noncallable values, lost bindings and abrupt accessors never do.
This installs no public intrinsic global, changes no timer behavior, and
leaves ordinary builds' private targets and rejected value forms unchanged.

The `$262.evalScript` function belongs to its host object's realm and is
non-constructible with length 1. Calling a foreign host function enters its
realm, independent of the receiver supplied by the caller. Its evaluator and
new closures therefore use that realm's globals, lexicals, intrinsics and
literal caches; ordinary call unwinding restores the caller's realm. The
created realm's global object receives its own `$262` and `print` bindings.

`print` is a non-constructible host function of length 1. It converts its
first argument through ToString, prints that string followed by a newline,
ignores further arguments, and returns undefined. Conversion effects and
throws remain observable. Global host properties are writable, configurable
and non-enumerable. An ordinary build installs neither binding.


Evidence and limits
-------------------

*packages/cli/tests/host-scripts.test.ts* checks source discovery, deferred
errors, unique identities and emitted structure without a native build.
*tests/native/fixtures/host-script-bindings.ts* fixes declaration, completion,
realm, abrupt and print cases. *tests/host-script-bindings.test.ts* also runs
the unchanged original subjects through the reviewed runner.
*tests/property/m5-host-script-bindings.property.test.ts* compares generated
commands against an independent two-record Global Environment model and
Node.js/Deno Script execution, and generates malformed Scripts separately.
Both native policies retain false hints, guard misses and forced collection.

Initial source preparation recorded no executed native success or fresh
manifest classification. On source `24213167`, the separately scoped runtime-C
fixture passed, while the first whole host Node suite reported ten passes and
two failures. One was the missing const-alias discovery form above; the other
was the reviewed property helper unconditionally restoring a deleted property
on a non-extensible global. The source correction matches the pinned helper's
default versus explicit `options.restore` behavior without changing runtime
global-declaration or non-extensibility rules. Requested restoration and its
errors remain observable, including through primordial and callable wrappers.
The original fourteen subjects, fixtures and oracles remain unchanged. Those
source-bound failed results do not validate later corrections. The whole
host suites subsequently passed twelve registrations per framework on
`a93871cc`; ordinary properties passed both domains per framework on
`ab8d5d5c`, whose extended Node run passed 120 cases per domain. A later
compiler repair addresses runtime-owned call targets across Scripts. The
composed-source native validation below is complete; affected review and
shared-harness Full evidence remain pending.

The actual `ab8d5d5c` extended run supplies a 510-second Linux scheduling
weight in *docs/evidence/u6/README.md*. macOS is unmeasured and retains the
296-second fallback. This is source-qualified historical evidence, not a
measurement of the later runtime-owned-call repair. The composed-source
`20d6119b` run below supplies the later 607-second Linux weight. Existing seeds,
case counts, limits, classifications, owners and subset paths are preserved.

Composed source `20d6119bac41c5a6c819a268476dec017a2475d6` (tree
`fbb16dadcaee5047ac692200d28efbc5ca56bd71`, ABI `m5-140`) completed the
handwritten runtime-C fixture, both new eight-case Node/Deno suites, both
original twelve-registration Host suites, ordinary twelve-case generated
domains under both frameworks, and the existing extended 120-case domains.
The whole Host suites preserve all fourteen subjects, including the separate
ordinary-eval unsupported boundary. Policies, false hints, guard misses,
forced collection, original domains, seeds, budgets and deadlines remain.
Root accepted all eight natural successful commands with original raw output,
three exact source snapshots and two actual empty drains for each. The
extended leaf sum is 606.907057926 seconds: Linux weight 607, macOS still
unmeasured at 296. See *docs/evidence/u6/README.md* for source-bound provenance.
These observations do not establish Full/classification, affected internal
or outer reviews, admission, candidate/Main gates or later-source execution.

The literal source set cannot admit runtime-created source. Agents retain
ADR 0026's separate precompiled source tables and contexts; this change does
not transfer values or dispatchers across agent boundaries. Any future source
admission, asynchronous host Script integration, or incremental code lifetime
requires its own contract and evidence rather than widening this table by
assumption.


Reference observer distinction
------------------------------

[PutValue, 6.2.5.6]
keeps an initially unresolvable sloppy Reference targeting the global object
even if its right operand introduces a same-name lexical binding. The Node.js
and Deno `node:vm` observer instead wrote that new lexical binding in the
source-stage reference probe. The focused native suite keeps the normative
`7 9` expectation separately; it does not normalize it to the observer's
`9 undefined`. Ordinary resolved global references use
[SetMutableBinding, 9.1.1.4.5]
and do select a newly introduced lexical binding. The fixed differential
fixture retains that distinct case.

The configurable-property var/lexical shadow probe has a second reference
limit. Node.js permits it as
[GlobalDeclarationInstantiation, 16.1.7]
requires; the pinned Deno `node:vm` rejects it despite reporting that property
as configurable before and after `var`. The bounded observer model describes
that rejection with the earlier HasVarDeclaration rule; it does not claim to
identify Deno's internal cause. Fixed tests retain an explicit Deno observer
expectation, and the generated state model records that legacy check only for
the Deno observation. Native results are compared with the 16th-edition model
and Node.js. No generated command, assertion, seed or case budget is removed.

[PutValue, 6.2.5.6]: https://262.ecma-international.org/16.0/#sec-putvalue
[SetMutableBinding, 9.1.1.4.5]: https://262.ecma-international.org/16.0/#sec-global-environment-records-setmutablebinding-n-v-s
[GlobalDeclarationInstantiation, 16.1.7]: https://262.ecma-international.org/16.0/#sec-globaldeclarationinstantiation
