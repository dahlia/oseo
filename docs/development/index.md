Development
===========

Clone the [Oseo repository] and install [mise]. From the repository root:

~~~~ sh
mise install
mise tasks
mise run check
mise run test
~~~~

The install sets up the toolchain and Git hooks. `mise run check` runs the
repository checks used by the pre-commit hook; `mise run test` includes
package, native, and reviewed Test262 suites. See the [contributor guide]
for test layering, package boundaries, and the checks needed for native or
compiler changes.

[Oseo repository]: https://github.com/dahlia/oseo
[mise]: https://mise.jdx.dev/
[contributor guide]: https://github.com/dahlia/oseo/blob/main/CONTRIBUTING.md


Build and check the docs
------------------------

Build the VitePress site after installing the tools and workspace
dependencies. For a fresh checkout, the following commands also work in CI
after `mise install`:

~~~~ sh
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm run docs:build
~~~~

The build fails on broken internal page links and anchors, including links
in the default theme navigation. Links to external sites such as GitHub are
not fetched during the build. The static output is in
*docs/.vitepress/dist/*. For a local development server, run
`mise exec -- pnpm run docs:dev`.

Release CI sets `OSEO_DOCS_CHANNEL` and `OSEO_DOCS_VERSION` from the release
identity. Stable builds include the version's download and install
instructions. Canary builds show their canary version and link to the
stable site. Preview builds are not indexed and do not include release
downloads; a local build with no release metadata is a preview.
