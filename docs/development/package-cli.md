CLI implementation notes
========================

The [command-line guide] covers the public command grammar, native build
configurations, target selection, and diagnostics. The [design document]
describes the runtime archive cache and its fallback paths.

[command-line guide]: ../using/cli.md
[design document]: https://github.com/dahlia/oseo/blob/main/DESIGN.md


Command registry
----------------

Typed modules under *packages/cli/src/commands/* share parsers and a
host-injected handler. The checked-in *packages/cli/src/commands.generated.ts*
contains static imports for package and standalone builds. Startup does not
scan directories. Run `mise run generate:commands` after changing the command
inventory and `mise run check:commands` to verify the generated registry.
[Optique] derives help, usage, version, parse errors, and completion from the
command grammar.

[Optique]: https://optique.dev/


Composition and cleanup
-----------------------

The CLI supplies the pinned ECMAScript Unicode property resolver from
`@oseo/unicode` to the default Babel frontends. The Babel adapter and compiler
core do not depend on the pinned tables.

The CLI stages generated files and runtime assets in order, awaiting each
read or write before starting the next. Once a native temporary directory
exists, the workflow attempts its removal on success and on failure. Staging
and cleanup failures report `OSEO3001`; if cleanup fails after another
diagnostic, the CLI appends the cleanup diagnostic instead of hiding the
original. Archive cache failures fall back to compiling without the cache.

In a script request, `sourceId` can override the diagnostic identifier without
changing the positional path used to read the script.
