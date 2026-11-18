@oseo/testkit
=============

`@oseo/testkit` supports Oseo's native and conformance tests. It takes
the compiler's mid-level intermediate representation (MIR) and uses
the backend, runtime, toolchain, and host you provide. It does not
select or install those adapters.

If you are building tests around the Oseo compiler, install with
`npm install @oseo/testkit` or `deno add jsr:@oseo/testkit`. To run Oseo's
own tests from a checkout, follow the [contributor guide] instead.

[contributor guide]: https://github.com/dahlia/oseo/blob/main/CONTRIBUTING.md


Native fixtures
---------------

Use `withNativeFixture()` to build a fixture and, with `operation: "execute"`,
run it. Execution requires a host that can run the requested target. The
generated files are available during the inspection callback. On success,
they are removed unless you set `keepArtifacts: true`. Failures after
temporary-directory creation retain the artifacts and attempt to write
*native-observation.json* for replay.

`assertMatchingObservations()` compares exit status and standard streams
across reference and native runs, including bytes when captured. See the
[native test driver] for how the repository supplies the adapters and
compares runs.

`classifyTest262()` and `summarizeTest262()` classify and aggregate Test262
observations; they do not run the suite. See the
[fixture and observation notes] for replay, caching, and strictness variants.

[native test driver]: https://github.com/dahlia/oseo/blob/main/tests/native.ts
[fixture and observation notes]: https://github.com/dahlia/oseo/blob/main/docs/development/package-testkit.md
