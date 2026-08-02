Release and distribution plan
=============================

Status
------

Implementation status: planned, deferred. This plan defines the distribution
channels, artifact contracts, and toolchain-acquisition behavior for future
Oseo releases. It does not select the first release moment, reserve a numbered
milestone, or change any language semantics or compatibility count.

No release exists yet, and none of the channels below is a commitment to
publish before the release gate in this plan is satisfied. Repository
development keeps using mise and the aube workspace; nothing here changes the
contributor workflow.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md), the package
manifest and lockstep-version policy in
[*CONTRIBUTING.md*](./CONTRIBUTING.md),
[ADR 0014](./docs/adr/0014-native-target-support.md), and
[ADR 0015](./docs/adr/0015-native-target-identifiers.md). Evidence that
changes one of those contracts updates the affected document in the same
change.


Goal
----

A release should let a user run the Oseo CLI with one install step per channel
and produce native executables without assembling a toolchain by hand. Before
M8 self-hosting, the distributed CLI runs on an embedded or installed
JavaScript host. Native executables produced by Oseo embed no JavaScript
runtime. Release notes and the distributed README state both facts.

Self-hosting must preserve the release contract. The transition section below
records the one step M8 replaces.


Distribution channels
---------------------

### Standalone CLI archives

GitHub Releases carries standalone CLI archives for the supported native
execution environments: `linux-x86_64-gnu` and `macos-aarch64`.
`linux-aarch64-musl` remains a compile-link and inspection target and does not
receive a CLI archive.

Before M8, `deno compile` produces the archive binary and embeds the `denort`
runtime in it. That runtime executes the compiler; it is not linked into the
native executables the CLI produces. The archive README identifies the CLI
host. `deno compile` includes only statically analyzable imports, so the CLI's
module graph must stay within that bound or list additional modules explicitly
at build time. The CLI also reads non-module assets at run time, such as the C
runtime sources and package manifests; each one must be embedded through
`--include` or a generated module. Every archive receives a smoke test that
extracts it into a clean directory and compiles a fixture without the
repository or an installed package tree present.

### npm and JSR packages

The `@oseo/*` packages keep the existing manifest policy: tsdown-built ESM
with declaration files and source maps on npm, TypeScript source on JSR, and
one lockstep version from *VERSION*. `npm install -g @oseo/cli` installs the
`oseo` command on the Node.js host, and the JSR package serves the Deno host.
The CLI is an ordinary workspace package, so this channel needs no machinery
beyond the existing packaging checks.

### Unscoped npm launcher

If the unscoped npm name `oseo` is still available at reservation time, it is
reserved to protect the `npx oseo` spelling. A reservation before the first
release publishes a minimal package whose `oseo` command reports that no
release exists yet and points at the repository; it is not an empty
placeholder, and it depends on nothing unpublished. The first release
replaces it with a launcher that depends on `@oseo/cli`, exposes the same
`oseo` binary, and follows the same lockstep version. `@oseo/cli` remains the
canonical package.


Archive contract
----------------

Each CLI archive follows one naming and layout contract:

 -  The file name is `oseo-<version>-<target>` plus the format extension,
    such as `oseo-0.1.0-linux-x86_64-gnu.tar.xz` and
    `oseo-0.1.0-macos-aarch64.tar.xz`. The version is the lockstep value
    from *VERSION*. The target is the verbatim Oseo native target ID from
    [ADR 0015](./docs/adr/0015-native-target-identifiers.md), including its
    ABI component where the ID has one. Aliases such as `x64` and `arm64`
    never appear in artifact names.
 -  Targets whose operating system is not Windows use `.tar.xz`. A future
    Windows target uses `.zip`. Windows is not in the supported target set
    today; the rule is recorded now so that admitting a Windows target later
    does not change existing names.
 -  The archive is flat. It contains no directory entries, only the `oseo`
    executable (`oseo.exe` on a future Windows target), *README.md*, and
    *LICENSE*. The *LICENSE* content is identical to the repository license.


Toolchain acquisition
---------------------

The released CLI needs `zig cc` to compile generated C11. Requiring a manual
Zig installation would undo the single-step install, so the Zig toolchain
adapter acquires the pinned Zig on first use, following the Zig project's
published protocol for third-party tooling:

 -  fetch the community mirror list from
    `https://ziglang.org/download/community-mirrors.txt`, cache it, and
    refresh the cached copy at most daily;
 -  shuffle the mirrors and try them in randomized order, identifying the
    client with a `?source=oseo` query parameter;
 -  download the tarball and its minisign signature, verify the signature
    against the published Zig public key, and check the file name in the
    signature's trusted comment against the requested tarball name;
 -  unpack into a temporary directory and rename it into a per-version,
    per-host cache directory so that installation is atomic; and
 -  perform no network access when the cached toolchain is already present.

Verification is mandatory. An unverified tarball is discarded, and the
failure diagnostic names the mirror and the step that failed. An explicit
option selects an already-installed Zig executable instead, so offline and
air-gapped environments are not forced through the download path. The pinned
Zig version has one source of truth shared with the *mise.toml* development
pin, and a repository check keeps the two equal once the downloader lands.

The downloaded Zig build matches the machine running the compiler, not the
Oseo build target: one host installation cross-compiles every supported
target, and the Oseo target ID selects only the target argument the adapter
passes to `zig cc`, following
[ADR 0015](./docs/adr/0015-native-target-identifiers.md). The Zig toolchain
adapter package owns the protocol, the cache layout, and the mapping from the
execution host to Zig tarball names; the compiler core stays unaware of all
three. Before downloading, the CLI reports the selected Zig version, host,
and mirror.


Release gate
------------

The first release has no selected date or triggering milestone. Before
publication, maintainers record explicit capability prerequisites from the
measured tracks; candidates include compatibility-laboratory scenarios that
build and run and a stable M5 checkpoint. Acceptance and implementation of
the runtime linking exception in
[ADR 0021](./docs/adr/0021-runtime-linking-exception.md), including its
required notices and artifact checks, is a mandatory first-release
prerequisite, because every release invites users to distribute executables
that link the Oseo runtime. Every release publishes exact coverage and known
gaps without the conformance label, as the M5 exit criteria already require.
Within the recorded prerequisites, selecting the actual moment remains a
maintainer judgment based on timing and surrounding conditions.

Until that gate is recorded, this plan authorizes no publication. Reserving
the unscoped npm name is the only action that may precede the gate, because
that name is claimable by anyone at any time.


Self-hosting transition
-----------------------

M8 replaces the artifact-production step only. The self-hosted native
compiler produces the CLI executable that enters the same archives, names,
channels, and toolchain-acquisition behavior, and `deno compile` leaves the
pipeline at that point. The npm and JSR packages remain host-run packages for
library and API use on Node.js and Deno, which stay supported development
hosts after M8.

Per-target binary npm packages in the style of other native tools remain a
separate decision. They add per-target manifests outside the lockstep
workspace and are considered only with post-M8 demand evidence.


Decisions recorded later
------------------------

Each of these is recorded as an architecture decision when it is made:

 -  the first release gate and its capability prerequisites;
 -  the Zig acquisition protocol as implemented, including the pinned public
    key and cache layout;
 -  artifact integrity beyond the archive itself, such as checksum files or
    release signing;
 -  publication of the unscoped `oseo` launcher; and
 -  per-target binary npm packages, if demand evidence ever supports them.


Exit criteria
-------------

This planning track has no scheduled completion milestone. Its first-release
work is complete when that release ships through the recorded gate with the
contracts above. Its self-hosting work is complete when M8 replaces the
artifact-production step without changing them. Evidence that invalidates a
contract here updates this plan in the same change.
