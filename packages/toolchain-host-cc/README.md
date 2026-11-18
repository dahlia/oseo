@oseo/toolchain-host-cc
=======================

`@oseo/toolchain-host-cc` plans checked Oseo builds with AddressSanitizer
and UndefinedBehaviorSanitizer using the host's Clang or GCC. It is for Oseo's
sanitizer tests, not an alternative CLI backend. Ordinary Oseo builds use Zig.

To verify a local compiler for this test suite, run the self-check from an
[Oseo development checkout] after setup:

~~~~ sh
mise run test:sanitizer:self
~~~~

The harness selects Clang if available and otherwise selects GCC. Set
`OSEO_HOST_CC=clang` or `OSEO_HOST_CC=gcc` to require one. The selected compiler
must be able to link and run code with the sanitizer libraries. The adapter
accepts only the matching host target (`linux-x86_64-gnu` or
`macos-aarch64`), not cross-target or optimized builds.

`createHostCcToolchain()` takes compiler and archiver paths, a compiler
identity, and the target from the test harness. The caller verifies the
compiler; the adapter only plans commands. The [sanitizer activity audit]
lists the other test commands and records measured coverage by compiler and
host.

[Oseo development checkout]: https://github.com/dahlia/oseo/blob/main/docs/development/index.md
[sanitizer activity audit]: https://github.com/dahlia/oseo/blob/main/docs/sanitizer-activity.md#host-c-sanitizer-lane
