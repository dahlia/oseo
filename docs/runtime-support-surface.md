Runtime support surface inventory
=================================

[ADR 0021](./adr/0021-runtime-linking-exception.md) sets the repository default
at `GPL-3.0-or-later`. The MIT grant in [*MIT-LICENSE.txt*](../MIT-LICENSE.txt)
applies to the Oseo-authored contributions below. Third-party material keeps
its own terms.


What the MIT grant covers
-------------------------

The support surface is Oseo-authored material copied, compiled, or linked
into a user program so that it can run. The grant covers the material itself,
including its source templates. It does not cover the compiler-only logic
that selects and assembles it, or tools that read inputs and generate it.
Prefer separate template files. Where a file still mixes templates with
compiler logic, the grant covers the template portions identified here, not
the entire file. Update this inventory and the artifact checks whenever the
boundary changes.

`packages/backend-c/src/emitted-c.ts` is the MIT template module, including
its types and asset notice. The fixed C fragments in
`packages/backend-c/src/index.ts`, `packages/backend-c/src/bounded-body.ts`,
and `packages/backend-c/src/regexp-program.ts` that become part of generated
programs are also covered. These include ordinary, agent, outlined-body,
fragment, and launcher code and the C layout for compiled matcher data. The
lowering and composition logic in those files stays under GPL. User-derived
identifiers, values, and instructions follow the input terms, not MIT.

The following files under `packages/runtime-c/native/` are MIT:

 -  `oseo_runtime.h`
 -  `runtime_agent.c`
 -  `runtime_arguments.c`
 -  `runtime_array.c`
 -  `runtime_array_buffer.c`
 -  `runtime_async_generator.c`
 -  `runtime_atomics.c`
 -  `runtime_bigint.c`
 -  `runtime_bigint_object.c`
 -  `runtime_binding.c`
 -  `runtime_boolean.c`
 -  `runtime_clock.c`
 -  `runtime_clock_posix.c`
 -  `runtime_core.c`
 -  `runtime_data_view.c`
 -  `runtime_date.c`
 -  `runtime_descriptor.c`
 -  `runtime_disposal.c`
 -  `runtime_enumeration.c`
 -  `runtime_error.c`
 -  `runtime_event_loop.c`
 -  `runtime_function.c`
 -  `runtime_generator.c`
 -  `runtime_internal.h`
 -  `runtime_iterator.c`
 -  `runtime_json.c`
 -  `runtime_map.c`
 -  `runtime_math.c`
 -  `runtime_memory.c`
 -  `runtime_module.c`
 -  `runtime_number.c`
 -  `runtime_object.c`
 -  `runtime_object_builtin.c`
 -  `runtime_primitive.c`
 -  `runtime_process.c`
 -  `runtime_promise.c`
 -  `runtime_property.c`
 -  `runtime_proxy.c`
 -  `runtime_realm.c`
 -  `runtime_reflect.c`
 -  `runtime_regexp.c`
 -  `runtime_regexp_matcher.c`
 -  `runtime_regexp_symbol.c`
 -  `runtime_set.c`
 -  `runtime_string.c`
 -  `runtime_string_match.c`
 -  `runtime_symbol.c`
 -  `runtime_typed_array.c`
 -  `runtime_uri.c`
 -  `runtime_weak_collection.c`

`packages/runtime-c/native/runtime_unicode_tables.h` contains MIT-licensed
Oseo-authored C layout and tables derived from Unicode data under
`Unicode-3.0`. The corresponding C template and layout in
`renderRuntimeTables()` in `tools/unicode-tables.ts` are MIT; the generator
logic stays under GPL. `packages/runtime-c/src/index.ts` is a compile-time
asset provider, not support code. A future Oseo-authored self-hosted built-in
joins the MIT surface when its source or compiled form is incorporated into
user programs.

Compiler executables, including a future self-hosted Oseo, keep the GPL on the
compiler itself. Examples, tests, fixtures, and arbitrary source compiled by
Oseo are inputs, not support code. Test262 and fixtures derived from it retain
Ecma International's terms and local notices; the release packages and CLI
archives must not include those test inputs.


Output and registry notices
---------------------------

The ordinary generated C file, agent files, body-unit wrappers, and fragment
units carry the full MIT notice for the Oseo-authored support. They also carry
the Unicode notice: ahead-of-time RegExp matcher tables can contain Unicode
data even without the linked runtime. Program source and other inputs keep
their own notices and terms. When distributing an executable or archive made
with Oseo, include the MIT notice and the Unicode notice from
[*packages/runtime-c/UNICODE-LICENSE.txt*](../packages/runtime-c/UNICODE-LICENSE.txt)
with the distribution, along with any applicable notices for toolchain support
objects, libraries, and program inputs. The native linker does not retain the C
comments. Zig itself is a separate tool download, not an Oseo archive
component. Review the per-target Zig compiler-rt and C library components that
actually enter redistributed native binaries.

Both registries ship the GPL text as `LICENSE`. The checked-in manifests and
the npm packages record the full SPDX expressions. `AND` identifies terms
that apply to distinct portions of the same package. Recipients must follow
the applicable terms for each portion.

| Package                  | Source and npm SPDX expression             | Additional texts                         |
| ------------------------ | ------------------------------------------ | ---------------------------------------- |
| `@oseo/backend-c`        | `GPL-3.0-or-later AND MIT`                 | `MIT-LICENSE.txt`                        |
| `@oseo/runtime-c`        | `GPL-3.0-or-later AND MIT AND Unicode-3.0` | `MIT-LICENSE.txt`, `UNICODE-LICENSE.txt` |
| `@oseo/unicode`          | `GPL-3.0-or-later AND Unicode-3.0`         | `UNICODE-LICENSE.txt`                    |
| Other `@oseo/*` packages | `GPL-3.0-or-later`                         | See CLI build helper below.              |

JSR accepts one SPDX identifier in the published `license` field. The staged
configs for `@oseo/backend-c`, `@oseo/runtime-c`, and `@oseo/unicode` use
`GPL-3.0-or-later` for the GPL-covered code. The shipped READMEs and license
files record the terms for all parts, including the MIT-licensed support and
Unicode data where present. [JSR license requirements]

The npm `dist/emitted-c.js`, its declarations and its maps correspond to the
MIT template module. Compiler modules retain their source classification.
The runtime packages ship the native files as source; objects and archives
built from them retain the same terms. The Unicode package publishes derived
Unicode tables rather than the pinned raw UCD inputs, with the same Unicode
notice. The npm CLI includes a Rolldown-generated JavaScript helper and ships
`ROLLDOWN-LICENSE.txt` for it. The JSR CLI ships TypeScript source and does not
contain this helper. Babel and Optique remain dependencies of registry
packages rather than being copied into them.

[JSR license requirements]: https://jsr.io/docs/licenses


Standalone CLI distribution
---------------------------

The standalone executable contains Oseo itself, not just output support, so the
GPL applies to Oseo's compiler code. Stage `LICENSE`, `MIT-LICENSE.txt`, the
pinned `UNICODE-LICENSE.txt`, and the upstream notices for every redistributed
component. Inspect the actual SEA bundle and Node.js executable used for each
target: include Node.js's complete bundled license file and the notices of
bundled Babel, Optique, their transitive dependencies, and any bundler helpers
that enter the archive. Keep each notice tied to the exact version shipped.
Do not include Zig as part of this archive; check its terms separately if that
changes.

For each exact CLI binary, offer the Corresponding Source alongside the
binary download, at no additional charge. Use a release asset or documented
companion links that give the exact Oseo revision, including build and install
scripts and configuration, and the corresponding source for its bundled
components, including the exact Node.js SEA base, bundled dependencies, and
any patches. Do not substitute a moving branch or just the JavaScript bundle.
Name the source location inside the CLI archive and on the download page.
Rehearse retrieval and rebuilding before publication, and inspect the staged
archives for the required texts. The package checker does not verify future
SEA archives.
