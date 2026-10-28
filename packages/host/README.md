@oseo/host
==========

This package adapts filesystem, temporary-directory, and subprocess operations
for Node.js and Deno. Compiler-core code consumes only the host-neutral
interface. Both hosts canonicalize file module identities and share a relative
`file:` resolver, content hashing, and owned loader diagnostics.

The file loader identifies dependencies with a *.json* pathname as JSON
modules and other files as JavaScript modules. It retains their original
bytes and digest. The compiler validates static `type: "json"` requests
against that module kind before canonical identity deduplication; the host
does not parse JSON or execute dynamic import options.

Node.js and Deno adapters also normalize their runtime operating-system and
architecture spellings into an execution-host description. Unknown values stay
explicitly unknown so the composition root can reject unsupported native
execution without inheriting an ambient toolchain target.

The host also owns optional persistent compiler-cache storage. Linux uses
`XDG_CACHE_HOME`, falling back to *~/.cache*, and macOS uses
*~/Library/Caches*. Cache clients receive an existing namespaced directory,
nonempty regular-file checks, per-artifact exclusive leases, and atomic
publication. The selected root is resolved to an absolute normalized path, so
clients and toolchain subprocesses observe the same archive from different
working directories. Namespace names must be portable leaf names other than
`.` and `..`, so clients cannot escape the Oseo-owned directory. A lease
serializes the lookup-through-publication interval for concurrent cold
callers. Owner
tokens make release ownership-safe, and an
expiration time lets a later caller reclaim a lease abandoned by an
interrupted process. An active owner renews that time. Release and reclamation
atomically rename the exact observed state file, then move the complete lock
directory to a unique disposal path before deletion. An exclusive state file
also protects the interval before initial owner publication, so an earlier
owner or concurrent reclaimer cannot target a replacement lease. Renewal
overwrites only the already-claimed state file and cannot recreate it in a
replacement directory. The host selects the location and lifetime, while an
injected host may omit cache support or reject an unavailable operation and
keep the caller on its uncached path.
Content-addressed archives remain until the operating system or user removes
the Oseo cache namespace. There is no automatic age or count pruning. Removing
that namespace is safe; the next native workflow rebuilds its archive.

Toolchains declare the host variables they permit their subprocesses to
inherit. A capable host captures those variables once, and every process request
in that workflow receives the same immutable snapshot. Unlisted ambient
compiler settings cannot leak across the toolchain boundary. A Deno host
without `--allow-env` reports snapshot capture as unavailable; the caller
disables cache reuse and process requests retain ordinary child inheritance.

Node hosts may opt into `createNodeHost({ delegateSpawns: true })`. One lazy,
reusable Node process then spawns commands and collects their output. The
helper imports no compiler implementation, so repeated forks do not copy the
compiler's address space. The product CLI keeps direct spawning by default.
`await host.close()` drains accepted requests and closes the helper. Idle
helpers do not keep the parent alive, and process exit disconnects their IPC.

Delegated requests capture the caller's current environment, absolute working
directory, and umask. Output is decoded once after each pipe closes, just as in
the direct host. Signal termination retains the host's existing status mapping
(`null` becomes `1`). Spawn errors retain Node's error codes and command
metadata. Transport failure rejects outstanding and future requests; commands
are never replayed after an uncertain failure.

The helper and its commands retain the caller's process group. Existing fixture
supervisors must continue to signal that group for timeout and descendant
cleanup. The host API adds no timeout or cancellation protocol. Disconnect
cleanup kills direct commands; arbitrary helper loss alone does not guarantee
termination of descendants that outlive their direct parent.
