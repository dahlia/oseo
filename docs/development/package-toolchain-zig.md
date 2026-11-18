Zig toolchain adapter
=====================

The adapter maps stable Oseo target IDs to Zig's architecture-first target
strings and derives sanitizer flags from the selected target. Intermediate
artifact suffixes contain the complete Oseo target ID, so concurrent or
sequential builds for different targets do not collide. Runtime object names
also carry the source's position in the ordered asset list, so sources
with the same basename receive different names.

A build that consumes a prebuilt runtime archive neither creates runtime
objects nor invokes `zig ar`. Where reuse is available, the adapter derives a
SHA-256 reuse key that covers the complete `zig env` output along with the
invocations, target, runtime inputs, and build environment. Runtime compilation
normalizes dot segments before it derives relative source paths. The
[native backend design] describes the key inputs, the shared allowlist
snapshot, the prefix map for compiler metadata, and the host's cache and
coordination responsibilities.

[native backend design]: https://github.com/dahlia/oseo/blob/main/DESIGN.md#native-backend
