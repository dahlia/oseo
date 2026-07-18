@oseo/host
==========

This package adapts filesystem, temporary-directory, and subprocess operations
for Node.js and Deno. Compiler-core code consumes only the host-neutral
interface. Both hosts canonicalize file module identities and share a relative
`file:` resolver, content hashing, and owned loader diagnostics.

Node.js and Deno adapters also normalize their runtime operating-system and
architecture spellings into an execution-host description. Unknown values stay
explicitly unknown so the composition root can reject unsupported native
execution without inheriting an ambient toolchain target.
