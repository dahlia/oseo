Release staging
===============

On a branch or pull request, `main.yaml` builds and checks the npm package
tarballs, JSR workspace, standalone archives, and VitePress site without
registry or deployment credentials. Its release gate waits for every CI
lane. The GitHub artifact names include the attempt number; downstream
jobs use the specific producer's artifact ID and verify the source SHA and
payload manifest.

To stage packages locally from the repository root:

~~~~ sh
mise run build
mise exec -- node tools/release/stage.ts packages "$TMPDIR/oseo-packages"
~~~~

The destination must not exist. Set `TMPDIR` to a scratch directory. This
command only reads registries, installs the staged npm tarballs into a
clean scratch project, and runs `deno publish --dry-run`. It does not
change the workspace manifests or upload packages.


Maintainer opt-in
-----------------

Leave the repository variable `OSEO_ENABLE_PUBLICATION` unset until all
release prerequisites pass. The publish and deploy jobs require its
explicit `true` value and a canonical `main` or exact stable tag push.
Configure the `release-npm` environment and authorize `main.yaml` to
publish and manage dist-tags for each npm package with trusted publishing.
Link each JSR package to the repository and configure `release-jsr`.
Protect the publishing environments and stable tag namespace.

Set up the `github-pages` environment for stable deployments. For canary
docs, configure the `release-canary` environment with
`OSEO_CANARY_PAGES_PROJECT`, `CLOUDFLARE_ACCOUNT_ID`, and the environment
secret `CLOUDFLARE_PAGES_API_TOKEN`. The Pages project's production branch
must be `main`.

After a partial publication, retry the failed jobs in the original run,
not all jobs and not a new version or tag. npm skips matching tarballs;
JSR skips only versions whose file checksums and exports match the staged
workspace. If an upload fails, the GitHub Release job retains the draft
and retries only missing assets. A mismatch stops the release for review.
