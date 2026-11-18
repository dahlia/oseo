@oseo/parser-babel
==================

`@oseo/parser-babel` parses JavaScript and erasable TypeScript for the
[Oseo compiler]. It returns Oseo syntax and source-located diagnostics, not a
Babel AST. It strips types without checking them, and Babel's ability to parse
a construct does not mean Oseo can compile it.

Install with `npm install @oseo/parser-babel` or
`deno add jsr:@oseo/parser-babel`, then import from `@oseo/parser-babel`.

[Oseo compiler]: https://github.com/dahlia/oseo/tree/main/packages/compiler


Parse a module
--------------

Use `babelModuleFrontend.parseModule()` for ECMAScript modules and
`babelFrontend.parse()` for scripts. Supply a `sourceId` so diagnostics can
identify the input.

~~~~ js
import { babelModuleFrontend } from "@oseo/parser-babel";

const { diagnostics, module } = babelModuleFrontend.parseModule({
  sourceId: "answer.ts",
  source: "export const answer: number = 42;",
});

if (module === undefined) {
  throw new Error(JSON.stringify(diagnostics));
}
console.log(module.exports[0]?.kind); // "local"
~~~~

Use `createBabelFrontend()` or `createBabelModuleFrontend()` to supply regular
expression extensions or Unicode data that the default frontends do not
provide. Both factories also let you opt into the
[static-specifier subset of `import()`]. Compiling that subset requires graph
discovery to resolve the targets.

See the [language profile] for supported syntax and the
[frontend implementation notes] for parsing and conversion details.

[static-specifier subset of `import()`]: https://github.com/dahlia/oseo/blob/main/docs/static-specifier-import-design.md
[language profile]: https://github.com/dahlia/oseo/blob/main/docs/language-profile-es2026.md
[frontend implementation notes]: https://github.com/dahlia/oseo/blob/main/docs/development/package-parser-babel.md
