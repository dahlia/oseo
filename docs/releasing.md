Releasing Oseo
==============

Status
------

This procedure is planned for Oseo 0.1.0. See
[*PLAN-RELEASE.md*](../PLAN-RELEASE.md) for the CI and artifact contracts and
[*PLAN-0.1.0.md*](../PLAN-0.1.0.md) for the first release gate.


Set up a new package for publishing
-----------------------------------

Configure both registries before merging a new `@oseo/*` package into a
branch that publishes automatically. Trusted publishing is configured per
package, not once for the whole scope.

1.  On npm, build and check a seed tarball for the new package. Give it the
    next release version with a `-canary.0` suffix, and check that its
    dependencies are available on npm. Publish it from a maintainer's
    terminal with `npm publish <tarball> --access public --tag canary`.
    Approve npm's browser authentication prompt if required. Do not move
    `latest` or seed existing packages again.

2.  Once npm lists the seed version, add a [trusted publisher][npm-trust]
    for the package. Set the GitHub repository to `dahlia/oseo`, the workflow
    filename to `main.yaml`, and the environment to `release-npm`. With an
    npm CLI that supports `npm trust`, use:

    ~~~~ sh
    npm trust github @oseo/example --repo dahlia/oseo --file main.yaml \
      --env release-npm --allow-publish
    ~~~~

    Replace `@oseo/example` with the new package name. In the package's
    trusted publisher settings on npmjs.com, also enable **Allow npm dist-tag**.
    The CLI command above grants publishing permission, not dist-tag access.

3.  On JSR, reserve the new package name under `@oseo`. In the package's
    settings, [link the GitHub repository][jsr-publish] `dahlia/oseo`.
    Do not upload a seed to JSR: linking the reserved package enables
    GitHub Actions OIDC before the first version is published.

[npm-trust]: https://docs.npmjs.com/trusted-publishers/
[jsr-publish]: https://jsr.io/docs/publishing-packages#publishing-from-github-actions


Cut a release
-------------

A development branch carries its next intended release version in
*changes.d/next*. A release commit closes that development cycle. The
maintainer opens the next cycle in a separate commit before pushing the
branch.

1.  From a clean worktree on the release branch, verify the package versions
    and review the Sacho preview. Run `sacho release` without `--next` to
    materialize the dated release section and close the development cycle.
2.  Commit the release. Tag that commit with the exact `x.y.z` version, without
    a `v` prefix. Do not tag the version bump commit.
3.  Run `mise run bump-version <next-version>` and commit the result separately.
    This updates *changes.d/next*, the materialized changelog, and the package
    manifests. Push the tag and branch, with the branch pointing at the bump
    commit rather than the release commit.
4.  Check the tag's *main.yaml* run and verify the registry versions, GitHub
    Release and assets, and any documentation deployment. If a publish job
    stops midway, rerun it against the original staged artifacts; do not move
    the tag or try to replace a published version.

For 0.1.0, run `mise exec -- sacho release --allow-empty` if there are no change
fragments. Do not backfill work that preceded the first release. Use a release
introduction if readers need context.


Forward-port fixes
------------------

Start a fix on the oldest supported `x.y-maintenance` branch affected by the
bug. If the bug exists only in unreleased work, fix it on the development
branch that contains it. Do not start a fix on `main` and cherry-pick it back
through released lines. Patch releases may batch several fixes.

When releasing across lines, merge each release tag into the next affected
line in ascending order. For example, release and tag `0.13.8` from
`0.13-maintenance` and merge that tag into `1.0-maintenance`. Release `1.0.5`
there and merge its tag into `1.1-maintenance`; release `1.1.2` there and
merge its tag into `main`. Forward-port from `main` to `next` when that
branch is active. Merge the released fixes and changelog history, not the
previous line's bump commit. Keep the receiving branch's next version and
manifest versions and resolve its unreleased changelog separately.

Follow [*SECURITY.md*](../SECURITY.md) for private reports and disclosure.
Keep fixes under embargo off public branches and out of public canary
artifacts until they can be released. The forward-port order does not require
publishing an older line before the coordinated security release.
