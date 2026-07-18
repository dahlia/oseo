@oseo/toolchain-zig
===================

This package maps explicit Oseo targets to reproducible `zig cc` and `zig ar`
commands. It constructs native build requests without defining language
semantics.

The adapter supports `x86_64-linux-gnu`, `aarch64-macos`, and
`aarch64-linux-musl`. It derives sanitizer flags from the selected target and
uses the complete target name in intermediate artifact suffixes, so concurrent
or sequential cross-target builds cannot alias one another.
