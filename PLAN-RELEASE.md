Release and distribution plan
=============================

Status
------

Implementation status: planned. This plan defines the distribution channels,
artifact contracts, and toolchain acquisition for Oseo releases.
[*PLAN-0.1.0.md*](./PLAN-0.1.0.md) sets the first release schedule and
acceptance criteria. Neither plan changes language semantics or compatibility
counts.

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

Before M8, use [Node.js SEA] (Single Executable Applications) to build the
archive binary. The archive build job pins Node.js 26 LTS separately from the
development pin and uses tsdown's `exe` support for `--build-sea`. Bundle the
CLI dependencies, embed its version metadata and the native runtime sources and
headers, and materialize the source files where Zig can read them. The archive
README identifies Node.js as the embedded compiler host; Oseo does not link it
into programs the CLI produces.

Every archive receives a smoke test that extracts it into a clean directory
and compiles a fixture without the repository or an installed package tree
present. Test execution on the named host, including macOS signing and
download behavior, rather than inferring support from cross-build success.

[Node.js SEA]: https://nodejs.org/api/single-executable-applications.html

### npm and JSR packages

The `@oseo/*` packages keep the existing manifest policy: tsdown-built ESM
with declaration files and source maps on npm, TypeScript source on JSR, and
lockstep versions as specified in [*CONTRIBUTING.md*](./CONTRIBUTING.md).
`npm install -g @oseo/cli` installs the `oseo` command on the Node.js host,
and the JSR package serves the Deno host. GitHub Releases attaches the
exact `.tgz` files published to npm, not a second set of packed files.

### Unscoped npm launcher

If the unscoped npm name `oseo` is still available at reservation time, it is
reserved to protect the `npx oseo` spelling. A reservation before the first
release publishes a minimal package whose `oseo` command reports that no
release exists yet and points at the repository; it is not an empty
placeholder, and it depends on nothing unpublished. A later release may
replace it with a launcher that depends on `@oseo/cli`, exposes the same
`oseo` binary, and follows the same lockstep version. `@oseo/cli` remains the
canonical package.


Archive contract
----------------

Each CLI archive follows one naming and layout contract:

 -  The file name is `oseo-<version>-<target>` plus the format extension,
    such as `oseo-0.1.0-linux-x86_64-gnu.tar.bz2` and
    `oseo-0.1.0-macos-aarch64.tar.bz2`. The version is the build version.
    The target is the verbatim Oseo native target ID from
    [ADR 0015](./docs/adr/0015-native-target-identifiers.md), including its
    ABI component where the ID has one. Aliases such as `x64` and `arm64`
    never appear in artifact names.
 -  Targets whose operating system is not Windows use `.tar.bz2`. A future
    Windows target uses `.zip`. Windows is not in the supported target set
    today; the rule is recorded now so that admitting a Windows target later
    does not change existing names.
 -  The archive is flat. It contains the `oseo` executable (`oseo.exe` on a
    future Windows target), *README.md*, *LICENSE*, and required license
    texts and notices, including those for the embedded Node.js and bundled
    dependencies. The README and release page identify the Corresponding
    Source for the distributed CLI.


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
Oseo build target. One host installation cross-compiles every supported
target. The Oseo target ID selects only the target argument the adapter
passes to `zig cc`, following
[ADR 0015](./docs/adr/0015-native-target-identifiers.md). The Zig toolchain
adapter package owns the protocol, the cache layout, and the mapping from the
execution host to Zig tarball names; the compiler core stays unaware of all
three. Before downloading, the CLI reports the selected Zig version, host,
and mirror.

The released CLI selects an explicit Zig path first, then the verified cache,
then first-use acquisition. It does not alter `PATH`, choose GCC or Clang
automatically, or read `CC`. Help, version information, and text-only output
such as `build --emit-c` do not acquire Zig. GCC and Clang remain experimental
via the repository's host C toolchain tests; a public compiler selection
option and the interpretation of `CC` are deferred.


Publication workflow
--------------------

Define the release jobs in *.github/workflows/main.yaml* through its source
template, *tools/main-workflow.template.yaml*. Build archives, stage packages,
and build the documentation in parallel with the full CI gates. Only publish
after the required checks and artifact smoke tests succeed for the exact
source revision and build. The publishing gate must cover all required jobs,
not just the `native` aggregate. PRs run checks and build documentation
artifacts without deployment or publishing credentials.

Allow automatic registry publishing only for trusted `main` pushes and
`x.y.z` tag pushes from the canonical repository. For a `main` push, derive
the canary version from *changes.d/next*, the workflow run number, and the short
commit ID. For example, publish `0.1.0-canary.123` with npm's `canary` dist-tag
and `0.1.0-canary.123+abcdef0` on JSR. Stage the matching internal dependency
versions for each registry. Reruns keep the same version, and an older run
must not move a dist-tag back. Keep canary CLI archives in Actions artifacts
only. Registry publishing from `next` or `x.y-maintenance`, including
per-line canary dist-tags, is deferred.

Publish npm and JSR packages with OIDC in separate GitHub-hosted jobs. Before
the first automated publish, the maintainer may seed each npm package
manually at `0.1.0-canary.0` under the `canary` dist-tag, configure the trusted
publisher with `main.yaml`, and link each JSR package to the repository.
Publish in dependency order. Reuse the staged artifacts on a retry, skip an
already published version only when it matches the expected release, and
fail on mismatches or registry errors. On npm compare `dist.integrity` to the
staged tarball. Verify that JSR's skip behavior works for a partially published
workspace. Keep retrying a failed job distinct from starting a new release.

On a stable tag, require the tag, released Sacho section, and manifest
versions to agree. Publish the tagged packages, then create the GitHub Release
with all checked assets and the body from
`sacho show <version> --no-word-wrap --skip-heading`. Resume incomplete
uploads without replacing published assets. An older maintenance release must
not replace the overall npm `latest` tag or stable documentation.

### Documentation deployment

Build VitePress exclusively in GitHub Actions and retain its output as an
artifact. Deploy it only after both registry jobs for that build succeed.
Stable docs at `oseo.dev` also wait for the GitHub Release and its assets and
deploy to GitHub Pages. The `main` canary deploys to `canary.oseo.dev` via
Cloudflare Pages Direct Upload, using an account-scoped Pages token available
only to the trusted deployment job. Cloudflare does not build the site.
Label the canary build and link to the stable site. Do not let a rerun deploy
over newer docs. Hosted PR previews are deferred; a PR build produces only a
downloadable Actions artifact.


Release gate
------------

Before any public seed, canary, or stable Oseo build, record and implement the
license terms for Oseo code and its output support surface, with the required
notices and artifact checks. For 0.1.0, the planned terms are
`GPL-3.0-or-later` for Oseo code outside the output support surface and `MIT`
for Oseo-authored runtime and emitted support code. The long-term GPL linking
exception in [ADR 0021](./docs/adr/0021-runtime-linking-exception.md) is no
longer a prerequisite; update the record before publication. A seed may
precede the stable gate only to bootstrap npm trusted publishing.

Every release publishes exact coverage and known gaps without the conformance
label until the independent conformance criteria are met. See
[*PLAN-0.1.0.md*](./PLAN-0.1.0.md#release-gate-and-handoff) for the first
release gate.


Self-hosting transition
-----------------------

M8 replaces the artifact-production step only. The self-hosted native
compiler produces the CLI executable that enters the same archives, names,
channels, and toolchain-acquisition behavior. The Node.js SEA build leaves the
pipeline at that point. The npm and JSR packages remain host-run packages for
library and API use on Node.js and Deno, which stay supported development
hosts after M8.

Per-target binary npm packages in the style of other native tools remain a
separate decision. They add per-target manifests outside the lockstep
workspace and are considered only with post-M8 demand evidence.


Decisions recorded later
------------------------

Each of these is recorded as an architecture decision when it is made:

 -  the Zig acquisition protocol as implemented, including the pinned public
    key and cache layout;
 -  artifact integrity beyond the archive itself, such as checksum files or
    release signing;
 -  publication of the unscoped `oseo` launcher; and
 -  per-target binary npm packages, if demand evidence ever supports them.


Exit criteria
-------------

The first-release work is complete when 0.1.0 ships through its gate with the
contracts above. Its self-hosting work is complete when M8 replaces the
artifact-production step without changing them. Evidence that invalidates a
contract here updates this plan in the same change.
