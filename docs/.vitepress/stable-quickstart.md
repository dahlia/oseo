Try the standalone CLI
----------------------

Download the Oseo {{VERSION}} archive for your platform into an empty
directory. Save the [numeric demo] from the same release as
*numeric-hinted.ts* in that directory.

 -  [Linux AMD64]
 -  [macOS AArch64]

From that directory, extract the archive, compile the demo, and run it:

~~~~ sh
tar -xjf oseo-{{VERSION}}-*.tar.bz2
./oseo build numeric-hinted.ts -o numeric
printf '[[20,22]]\n' | ./numeric 1
~~~~

~~~~ json
{"iterations":1,"results":[42]}
~~~~

The standalone CLI does not require a separate Node.js or Deno installation.
On the first native build, it downloads and verifies the pinned Zig toolchain.
Later builds reuse the cached toolchain and can run offline. To use an
installed Zig executable and skip downloads, pass `--zig PATH`:

~~~~ sh
./oseo build --zig /path/to/zig numeric-hinted.ts -o numeric
~~~~

The compiled demo needs neither Zig nor a JavaScript host to run.
See the [GitHub release] for release notes and the other artifacts.

[numeric demo]: https://raw.githubusercontent.com/dahlia/oseo/{{VERSION}}/examples/numeric-hinted.ts
[Linux AMD64]: https://github.com/dahlia/oseo/releases/download/{{VERSION}}/oseo-{{VERSION}}-linux-x86_64-gnu.tar.bz2
[macOS AArch64]: https://github.com/dahlia/oseo/releases/download/{{VERSION}}/oseo-{{VERSION}}-macos-aarch64.tar.bz2
[GitHub release]: https://github.com/dahlia/oseo/releases/tag/{{VERSION}}


Install from a registry
-----------------------

On Node.js 24 or later, install the CLI from npm:

~~~~ sh
npm install -g @oseo/cli@{{VERSION}}
~~~~

The [JSR packages] provide TypeScript modules for a JavaScript host such as
Deno, not standalone executables.

[JSR packages]: https://jsr.io/@oseo
