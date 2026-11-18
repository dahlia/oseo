Host adapter implementation notes
=================================

For the public API, see the [`@oseo/host` README]. [ADR 0009] describes
module identity and linking; [ADR 0033] covers installed-package resolution.

The file loader identifies dependencies with a `.json` pathname suffix as JSON
modules and other files as JavaScript modules. It hashes the original source
text, then removes any leading byte order marks from JSON source. The compiler
validates static `type: "json"` requests against that module kind before
canonical identity deduplication. The host does not parse JSON or execute
dynamic import options.

[`@oseo/host` README]: https://github.com/dahlia/oseo/blob/main/packages/host/README.md
[ADR 0009]: https://github.com/dahlia/oseo/blob/main/docs/adr/0009-module-identity-and-linking.md
[ADR 0033]: https://github.com/dahlia/oseo/blob/main/docs/adr/0033-installed-package-resolution.md


Cache and subprocess environment
--------------------------------

The [runtime archive reuse checkpoint] records the cache protocol. Cache
clients receive an existing namespaced directory, nonempty regular-file
checks, per-artifact exclusive leases, and atomic publication.

The selected root is resolved to an absolute normalized path, so clients and
toolchain subprocesses observe the same archive from different working
directories. Namespace names must be portable leaf names other than `.` and
`..`, so clients cannot escape the Oseo-owned directory.

The host selects the location and lifetime. An injected host may omit cache
support or reject an unavailable operation and keep the caller on its uncached
path.

Toolchains declare the host variables they permit their subprocesses to
inherit. A capable host captures those variables once, and every process request
in that workflow receives the same immutable snapshot. Unlisted ambient
compiler settings cannot leak across the toolchain boundary. A Deno host
without `--allow-env` reports snapshot capture as unavailable; the caller
disables cache reuse and process requests retain ordinary child inheritance.

[runtime archive reuse checkpoint]: https://github.com/dahlia/oseo/blob/main/PLAN-GATE.md#runtime-archive-reuse


Delegated spawning
------------------

The helper imports no compiler implementation, so repeated forks do not copy
the compiler's address space. The CLI keeps direct spawning by default. Idle
helpers do not keep the parent alive, and process exit disconnects their IPC.

Delegated requests capture the caller's current environment and absolute working
directory. Commands inherit the umask the helper started with; reading the
umask in Node briefly sets it to zero for the whole process, which would race
with other threads. Output is decoded once after each pipe closes, just as in
the direct host. Signal termination retains the host's existing status mapping
(`null` becomes `1`). Spawn errors retain Node's error codes and command
metadata. Transport failure rejects outstanding and future requests; commands
are never replayed after an uncertain failure.

The helper and its commands retain the caller's process group. Existing fixture
supervisors must continue to signal that group for timeout and descendant
cleanup. The host API adds no timeout or cancellation protocol. Disconnect
cleanup kills direct commands; arbitrary helper loss alone does not guarantee
termination of descendants that outlive their direct parent.
