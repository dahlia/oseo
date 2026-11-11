CI bootstrap with mise
======================

This wrapper keeps tool installation, environment export, Windows shims,
and archive signature verification in `jdx/mise-action@v4`. It adds bounded
transport retries and checks restored mise binaries before upstream setup
can execute them. It uses the same whole-data cache boundary as upstream;
there is no second binary cache.

The wrapper resolves `https://mise.jdx.dev/VERSION` once per job, then restores
a separate metadata cache for that exact release and target. This cache holds
the original *SHASUMS256.txt* and its minisign signature. Every restore must
verify the checksum signature and the trusted-comment signature against mise's
release key before selecting the checksum for the exact version, OS, and
architecture. A valid exact metadata hit needs no checksum or signature HTTP
request. Latest-version discovery still requires the official VERSION endpoint;
an unavailable endpoint never selects an older release.

On a metadata miss, the wrapper downloads both files from that exact official
GitHub release with bounded retries and saves them only after verification.
The metadata cache has its own schema namespace and a fixed job-temporary path.
Non-exact restores are discarded. An exact hit with a missing counterpart,
invalid signature, or absent selected asset fails without a download fallback.
The cache service and its key supply no checksum authority. These static
downloads make no GitHub REST API requests.

The data cache key includes the asset name and hash, runner image, configuration
hash, install arguments, and `MISE_ENV`. Its path is a fixed job-temporary
directory so Actions cache versions remain reusable. The directory starts
empty. A prefix restore is discarded; an exact restore with missing or
incorrect binary bytes fails before the binary executes. The upstream cache is
disabled because the wrapper owns restore and save. As upstream does, the
wrapper saves after successful installation, before payload tests, and only
when tool installation was requested. Upstream still verifies
signed archives on misses; the `sha256` input is deliberately omitted because
it disables upstream archive signature checks.

`MISE_DATA_DIR` points subsequent job steps at the restored tools.
`CURL_HOME` applies only to upstream setup and contains no credentials.
That step also sets `TMPDIR`, `TMP`, and `TEMP` to `runner.temp`, the parent
of the installation directory. Upstream downloads and extracts under
`os.tmpdir()`, then renames the executable and Windows shim into place.
Keeping both paths on the same file system avoids `EXDEV` when the Windows
system temp directory and runner temp directory use different drives. The
three temp overrides apply only to upstream setup; later steps retain their
inherited temp environment.
Each curl transfer has two retries, a five-second delay, a ten-second
connection timeout, a thirty-second transfer timeout, and a seventy-second
retry window. Upstream also retains its five retries at two-second
intervals. Metadata has four attempts with ten-second deadlines and delays
of two, four, and eight seconds. Exhausted retries and integrity failures
fail the job; the existing job timeouts remain in force.

Checksum selection covers Linux glibc, macOS, and Windows, each on x64 or
arm64.
The workflow's existing hosted and self-hosted placement is unchanged.


Deno download routing
---------------------

Only the upstream setup step receives `MISE_URL_REPLACEMENTS`. Two anchored
regex rules route the Deno 2.9.7 macOS arm64 ZIP and its adjacent
*.sha256sum* from `dl.deno.land` to the same assets in the official
`denoland/deno` GitHub release. Both URLs must match in full, including the
version, architecture, OS, and suffix. Other requests keep their existing
routes. The setting is not exported to later steps or written to mise config.

The rules use mise's `regex:` prefix, `^` start anchor, escaped literal dots,
and Rust's `\z` end anchor. mise replaces the first regex match and stops
at the first rule that produces a different valid URL; rules do not chain.
Plain substring rules would also rewrite longer URLs and are not used here.
This behavior is documented and implemented in mise v2026.11.6; discovery
still selects the current mise release rather than pinning that version.

The published checksum bodies from both official endpoints were byte-identical
at inspection. This is metadata evidence, not proof of a complete ZIP transfer
or a successful macOS installation. Deno's existing published-checksum and
installation path still runs. The rules supply no checksum, add no exception
for missing checksums, and do not suppress verification failures. Transport
recovery remains
unverified until an authorized CI run completes setup and its required gates.

The regression fixture models these literal routing rules with JavaScript
regexes. It translates Rust's `\z` to a strict JavaScript end assertion;
it does not validate arbitrary Rust regex syntax, URL parsing, credentials,
HTTP behavior, or mise's Deno checksum implementation. Existing bootstrap
fixtures separately cover metadata signatures, binary hashes, and cache
rejection. The authoritative matching implementation is
[`apply_url_replacements()`][url-source], and the setting is described in
[the mise URL replacement documentation][url-doc].

[url-source]: https://github.com/jdx/mise/blob/v2026.11.6/crates/mise-util/src/http.rs#L3460-L3510
[url-doc]: https://github.com/jdx/mise/blob/v2026.11.6/docs/url-replacements.md


Source contract
---------------

The reviewed [action metadata] and [implementation] are from
`c2a87611a18de5b3828c5652fe268e992400cb5c`, the v4 revision in use when the
original download failures occurred. Its default cache already includes mise and
installed tools. Its unversioned cache hit skips fresh version resolution;
with an explicit version, the action executes the cached binary to inspect
its version before the optional binary checksum check. Its download loop has
five
retries at two-second intervals and exposes no retry input.

[action metadata]: https://github.com/jdx/mise-action/blob/c2a87611a18de5b3828c5652fe268e992400cb5c/action.yml
[implementation]: https://github.com/jdx/mise-action/blob/c2a87611a18de5b3828c5652fe268e992400cb5c/src/index.ts
