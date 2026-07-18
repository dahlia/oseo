Initial platform and tool versions
==================================

Status
------

Accepted. The execution-target portion is superseded by
[ADR 0014](./0014-native-target-support.md).


Context
-------

M0 probes need one reproducible development environment and one native target.
The compiler must run under Node.js and Deno, while generated C must not depend
on an unrecorded system compiler or package manager.


Required contract
-----------------

The M0 workspace needs exact host and toolchain versions, an initial executable
target, and a second target that detects accidental host ABI dependencies.


Alternatives considered
-----------------------

The alternatives were floating stable releases, a Zig nightly, a system C
compiler, and postponing target selection. Each leaves clean-checkout results
dependent on the day or machine. Node.js alone would hide compiler-core host
dependencies; Deno alone would not test the bootstrap environment described in
the white paper.


Probe evidence
--------------

[*mise.toml*](../../mise.toml) pins every executable. The shared erasable
TypeScript fixture is *experiments/host/probe.ts*. The native and cross-target
fixtures are under *experiments/native/*. Run:

~~~~ sh
mise install
mise run probe:host-parser
mise run probe:native-boundary
~~~~


Observed results
----------------

Node.js 24.18.0 and Deno 2.9.2 produced byte-for-byte equal output for the host
and parser probes. Zig 0.16.0 compiled, linked, and ran the strict C11 fixture
for `x86_64-linux-gnu` with undefined-behavior sanitization. It also built and
linked a static `aarch64-linux-musl` executable without using host headers or
libraries. aube 1.26.0 installed the exact parser dependency graph from
*aube-lock.yaml*. Hongdown 0.5.1 checked the repository Markdown.


Decision
--------

Use Node.js 24.18.0 and Deno 2.9.2 as M0 development hosts. Use Zig 0.16.0 as
the C compiler, archiver, and linker driver. Use aube 1.26.0 for JavaScript
dependencies. The initial executable target is 64-bit Linux on x86-64 with the
GNU ABI, written as `x86_64-linux-gnu`. The compile-and-link portability target
is `aarch64-linux-musl`.


Consequences
------------

Probe tasks may use only tools provisioned through mise. Native target
selection is explicit even when it matches the host. The AArch64 target is a
portability check, not a supported execution target. The workspace carries
these pins until another accepted record updates them.


Failure modes and replacement triggers
--------------------------------------

Revisit a pin when its upstream release becomes unsupported, has a relevant
security defect, or cannot run the clean continuous-integration gate. Revisit
the native target if required runtime behavior cannot be implemented without
target-specific assumptions that are absent from the target description.


Links
-----

[*experiments/README.md*](../../experiments/README.md) defines the probe
commands.
[*0003-c11-runtime-and-zig-boundary.md*](./0003-c11-runtime-and-zig-boundary.md)
defines how the native tools are used.
