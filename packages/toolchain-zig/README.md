@oseo/toolchain-zig
===================

This package maps explicit Oseo targets to reproducible `zig cc` and `zig ar`
commands. It constructs native build requests without defining language
semantics.

The adapter supports `linux-x86_64-gnu`, `macos-aarch64`, and
`linux-aarch64-musl`. It maps those stable Oseo IDs to Zig's architecture-first
target strings, derives sanitizer flags from the selected target, and uses the
complete Oseo ID in intermediate artifact suffixes. Concurrent or sequential
cross-target builds therefore cannot alias one another.

The adapter can link generated C against a prebuilt runtime archive without
creating runtime objects or invoking `zig ar`. It calculates a SHA-256 reuse
key from the ordered runtime asset contents, runtime ABI, complete compile,
archive, and link invocations, complete `zig env` output, and target facts. The
adapter also owns an exact environment allowlist for every Zig subprocess and
includes that policy and the host-captured values in the key. The identity
probe and every build request receive the same immutable snapshot. Unlisted
ambient inputs such as `CPATH` and `SDKROOT` are absent from the compiler
environment. Mutable compiler-input overrides such as `ZIG_LIBC`,
`C_INCLUDE_PATH`, and Nix compiler flags are excluded rather than represented
only by mutable path strings. Stable placeholders replace temporary input and
output paths in that record. Cache placement, lifetime, and same-key
coordination remain host responsibilities. Runtime objects compile from stable
relative source and include paths after dot segments are normalized. A
file-prefix map covers compiler metadata that canonicalizes the working
directory, so sanitizer records and equivalent archives do not retain the
deleted producer directory.
