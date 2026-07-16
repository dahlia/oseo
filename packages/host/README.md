@oseo/host
==========

This package adapts filesystem, temporary-directory, and subprocess operations
for Node.js and Deno. Compiler-core code consumes only the host-neutral
interface. Both hosts canonicalize file module identities and share a relative
`file:` resolver, content hashing, and owned loader diagnostics.
