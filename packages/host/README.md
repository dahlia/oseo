@oseo/host
==========

`@oseo/host` supplies the [Oseo compiler] with filesystem, temporary-directory,
and subprocess operations on Node.js and Deno. Use `createNodeHost()` on
Node.js or `createDenoHost()` on Deno. If you use only the Oseo CLI, you do
not need to install this adapter separately.

Install with `npm install @oseo/host` or `deno add jsr:@oseo/host`, then
import from `@oseo/host`.

[Oseo compiler]: https://github.com/dahlia/oseo/tree/main/packages/compiler


Load a module graph
-------------------

Pair `createFileModuleLoader()` with `fileModuleResolver` to load a file
entry point and follow relative imports. The resolver does not use Node.js
or Deno package resolution. The loader classifies paths ending in `.json`
as JSON modules; the compiler checks their import attributes and contents.

Add `@oseo/compiler` and `@oseo/parser-babel` to your project to run this
example. Save it as *inspect.mjs* beside the *main.js* you want to load.
On Deno, use `createDenoHost()` and grant read access to the source files.

~~~~ js
import { buildModuleGraph } from "@oseo/compiler";
import {
  createFileModuleLoader,
  createNodeHost,
  fileModuleResolver,
} from "@oseo/host";
import { babelModuleFrontend } from "@oseo/parser-babel";

const host = createNodeHost();
const { diagnostics, graph } = await buildModuleGraph(
  babelModuleFrontend,
  createFileModuleLoader(host),
  fileModuleResolver,
  new URL("./main.js", import.meta.url).href,
);

if (graph === undefined) {
  throw new Error(JSON.stringify(diagnostics));
}
console.log(`Loaded ${graph.modules.length} modules`);
~~~~


Native builds
-------------

The adapters report normalized operating-system and architecture names
so callers can check whether a native target can run on the current host.
The optional persistent cache uses `XDG_CACHE_HOME` or *~/.cache* on Linux
and *~/Library/Caches* on macOS. Oseo does not prune cached archives. If you
remove them, the next native build recreates the archives it needs.

On Node.js, use `createNodeHost({ delegateSpawns: true })` to run subprocesses
through a reusable helper. Call `await host.close()` to drain accepted
requests and shut down the helper.


Publish an executable
---------------------

To retain a linked executable, use `createExecutablePublisher()` on either
host. Call `inspect(destination, protectedPaths)` before building, with the
entry source and graph sources in `protectedPaths`. Pass the returned
destination record to `publish(linkedPath, inspectedDestination)` after a
successful link. Publication stages the file beside its destination so
readers do not see partial bytes; it does not guarantee crash durability.
See the [publication contract] and the [host implementation notes].

[publication contract]: https://github.com/dahlia/oseo/blob/main/docs/adr/0037-retained-native-executables.md
[host implementation notes]: https://github.com/dahlia/oseo/blob/main/docs/development/package-host.md
