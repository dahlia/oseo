CI bootstrap with mise
======================

This wrapper keeps tool installation, environment export, Windows shims,
and archive signature verification in `jdx/mise-action@v4`. It adds bounded
transport retries and checks restored mise binaries before upstream setup
can execute them. It uses the same whole-data cache boundary as upstream;
there is no second binary cache.

The wrapper resolves `https://mise.jdx.dev/VERSION` once per job, then reads
`SHASUMS256.txt` and its minisign signature from that exact official GitHub
release. The checksum signature and the trusted-comment signature must verify
against mise's release key. The selected checksum entry names the exact raw
binary for the version, OS, and architecture. These static downloads make
no GitHub REST API requests.

The cache key includes the asset name and hash, runner image, configuration
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
