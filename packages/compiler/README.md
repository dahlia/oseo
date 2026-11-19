`@oseo/compiler`
================

`@oseo/compiler` is the host-independent core of Oseo, an ahead-of-time
compiler for JavaScript and TypeScript. It resolves bindings and module
graphs, lowers programs to Oseo's intermediate representations, and applies
guarded optimizations. It defines the interfaces for frontends, backends,
runtimes, and toolchains but does not ship those adapters. To compile and run
a file from the shell, use the [Oseo CLI].

[Oseo CLI]: https://github.com/dahlia/oseo/blob/main/docs/using/cli.md


Compile a script to MIR
-----------------------

With Node.js 24 or later, add the compiler and the Babel frontend to your
project:

~~~~ sh
npm install @oseo/compiler @oseo/parser-babel
~~~~

Or, with Deno 2.9 or later:

~~~~ sh
deno add jsr:@oseo/compiler jsr:@oseo/parser-babel
~~~~

Save this example as *compile.mjs*:

~~~~ js
import { compileSource, printMir, renderDiagnostic } from "@oseo/compiler";
import { createBabelFrontend } from "@oseo/parser-babel";

const result = compileSource(createBabelFrontend(), {
  sourceId: "answer.js",
  source: "console.log(6 * 7);",
});

if (result.mir == null) {
  throw new Error(result.diagnostics.map(renderDiagnostic).join("\n"));
}
console.log(printMir(result.mir));
~~~~

Run `node compile.mjs` or `deno run compile.mjs`. This prints Oseo's mid-level
intermediate representation (MIR) without running the script or invoking a
native toolchain. For a module entry, use
`buildModuleGraph()` with a module frontend, loader, and resolver, then
`compileModuleGraph()` to lower the graph. Use [the C backend] to emit C11
from the resulting MIR.

Import from `@oseo/compiler` rather than from internal files. See the
[design document] for the compiler stages and the
[compiler implementation notes] for binding and module discovery details.

[the C backend]: https://github.com/dahlia/oseo/tree/main/packages/backend-c
[design document]: https://github.com/dahlia/oseo/blob/main/DESIGN.md
[compiler implementation notes]: https://github.com/dahlia/oseo/blob/main/docs/development/package-compiler.md
