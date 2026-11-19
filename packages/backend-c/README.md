`@oseo/backend-c`
=================

`@oseo/backend-c` emits deterministic C11 from Oseo's mid-level intermediate
representation (MIR). It does not parse JavaScript, choose runtime inputs, or
invoke a C compiler. If you only want to inspect the C for a JavaScript or
TypeScript file, run `oseo build FILE --emit-c` with the [Oseo CLI].

[Oseo CLI]: https://github.com/dahlia/oseo/blob/main/docs/using/cli.md


Emit C from MIR
---------------

If you already have a `MirProgram` from [`@oseo/compiler`], install the
backend:

~~~~ sh
npm install @oseo/backend-c
~~~~

Or, in a Deno project:

~~~~ sh
deno add jsr:@oseo/backend-c
~~~~

~~~~ js
import { cBackend } from "@oseo/backend-c";

const output = cBackend.emit(mir);
console.log(output.source);
~~~~

`output.source` is the standalone C translation unit. To build an executable,
compile the generated C and link it with the matching [Oseo C runtime]. If
`output.compilationUnits` is present, compile those files instead of the
standalone file and keep it beside them under `output.sourceName` for their
includes.
The [Oseo CLI] handles these steps for you. See the
[backend implementation notes] for how the emitter bounds native stack and
compiler memory use.

[`@oseo/compiler`]: https://github.com/dahlia/oseo/tree/main/packages/compiler
[Oseo C runtime]: https://github.com/dahlia/oseo/tree/main/packages/runtime-c
[backend implementation notes]: https://github.com/dahlia/oseo/blob/main/docs/development/package-backend-c.md


License
-------

The backend logic is licensed under GPL-3.0-or-later. The Oseo-authored C
templates and support that the backend contributes to its output are
[MIT-licensed]. The output includes the applicable notices; it does not put
your program under either license. See the [runtime linking decision] for
the separate terms that apply when the Oseo runtime is linked in.

[MIT-licensed]: https://github.com/dahlia/oseo/blob/main/packages/backend-c/MIT-LICENSE.txt
[runtime linking decision]: https://github.com/dahlia/oseo/blob/main/docs/adr/0021-runtime-linking-exception.md
