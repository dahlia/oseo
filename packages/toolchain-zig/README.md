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
