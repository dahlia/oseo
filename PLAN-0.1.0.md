Oseo 0.1.0 release preparation
==============================

Status
------

Planned. Complete and verify the public release by Friday, November 20, 2026,
Japan time, two days before [JSConf JP 2026].
Use the same release and documentation links at
[FOSS for All Conference 2026] on November 28.
November 20 is the deadline for checking the published result, not for pushing
the tag.

This plan coordinates the first release. [*PLAN-RELEASE.md*](./PLAN-RELEASE.md)
defines the distribution contract, [*CONTRIBUTING.md*](./CONTRIBUTING.md)
describes contribution and versioning, and
[*PLAN-PREVIEW.md*](./PLAN-PREVIEW.md) sets the demo and measurement criteria.
The release requires a tested TypeScript example that builds and runs, not
the full preview measurement report. This plan reserves no engine milestone.

[JSConf JP 2026]: https://jsconf.jp/2026/ja/talks/hong-minhee
[FOSS for All Conference 2026]: https://2026.fossforall.org/sessions/oseo-qgthps/


Work and dependencies
---------------------

### License and reporting

Record the `GPL-3.0-or-later` decision and the MIT boundary for Oseo-authored
support code incorporated into user programs. Update
[ADR 0021](./docs/adr/0021-runtime-linking-exception.md) and the
[*support surface inventory*](./docs/runtime-support-surface.md) before
changing manifests or packaging. Verify the
applicable notices in source, generated C, registry packages, and the CLI
archives. Check third-party terms and provide access to Corresponding Source
for the CLI distribution. Finish this work before any npm seed or public
canary. Keep a repository-wide header sweep out of the critical path and
coordinate it after the concurrent preview work lands.

Keep the public reporting policy in [*SECURITY.md*](./SECURITY.md) and link it
from the contributor guide. The maintainer verifies that private vulnerability
reporting is enabled before publication.

### Versioning and publication

Pin Sacho in mise and initialize *CHANGES.md* with `materialize = true`.
Replace *VERSION* with Sacho's *changes.d/next* for development, adapt the
existing version checks and manifest sync, and add `mise run bump-version`.
Exercise both the development and release-commit states from clean checkouts.
Do not backfill pre-0.1.0 work as changelog entries.

In parallel, build the CLI with [Node.js SEA] and add verified Zig acquisition,
stage npm
and JSR artifacts, and build the docs. The release pipeline uses the template
for *main.yaml*; coordinate edits to that template, *mise.toml*, and dependency
locks with the preview work. The versioning and license work must land before
the registry rehearsal. The Node.js SEA and Zig checks must pass before
automated canary or stable publication; the manual npm seed is only for OIDC
setup.

The maintainer publishes the initial npm seed versions if not already present,
configures npm trusted publishers and JSR repository links, and configures
GitHub Pages, Cloudflare Pages Direct Upload, and DNS. Rehearse a `main`
canary before the release tag. Verify that a registry job interrupted after a
partial publish can be rerun without overwriting a published version. Verify
that canary archives stay in Actions artifacts and that CI deploys the docs
only after both registries have the matching package versions.

[Node.js SEA]: https://nodejs.org/api/single-executable-applications.html

### First visit

Move a short, tested “Try Oseo” path above the development setup in *README.md*.
Show how to download the CLI, build a retained native executable from a small
TypeScript example, and run it on known input. Link to a checkout path for
contributors and explain which install routes need a JavaScript host.

Use *docs/* as the VitePress project with the default theme and separate
“Using Oseo” and “Development” navigation. Put installation, examples, CLI
reference, and supported features under the former, and contribution,
architecture, ADRs, and evidence under the latter. Keep existing source paths
where possible, link to repository records that do not need their own site
pages, and check links in CI. Document supported features and known gaps.
Do not claim conformance or report performance that has not been measured.


Release gate and handoff
------------------------

 -  The release candidate includes the license and reporting changes, the
    tested quickstart, and a frozen `0.1.0` Sacho section. The changelog may
    introduce the project without listing changes from an earlier release.
 -  All required CI gates pass for the release commit. The exact staged
    artifacts also pass package and archive checks. On Linux AMD64 and macOS
    AArch64, extract the CLI into a clean environment with no installed
    Node.js, package tree, or Zig on `PATH`; compile and run a demo, then
    verify cached offline compilation and the explicit Zig override.
 -  The maintainer makes the release commit, tags it `0.1.0`, makes the
    separate next-version bump commit, and pushes. CI publishes the tagged
    packages to npm and JSR and makes Oseo 0.1.0 public on GitHub Releases
    with the exact npm package tarballs and both standalone archives.
 -  Verify the public release, registry installs, and the instructions and
    downloads reachable from `oseo.dev`. Install the exact published versions
    in clean Node.js and Deno environments, as appropriate to the channel.
    Leave time for a failed job to be rerun before the deadline; do not move
    a published tag or skip failed checks to meet the schedule.

The first release does not require GCC or Clang support in the distribution
CLI, a repository-wide license header sweep, Windows or Linux AArch64 CLI
archives, maintenance-line canary publishing, hosted PR previews, or an
unscoped npm launcher. Canary hosting setup should not delay the stable site.
