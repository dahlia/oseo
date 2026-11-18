@oseo/unicode
=============

`@oseo/unicode` provides the Unicode data used by Oseo: code-point
properties, emoji string properties, case mappings, case folding, and
ECMAScript word-character sets. Results come from pinned Unicode 17.0.0
and Emoji 17.0 tables, not the host's Unicode implementation or locale.
The package does not match regular expressions or apply locale rules.

Install with `npm install @oseo/unicode` or `deno add jsr:@oseo/unicode`,
then import from `@oseo/unicode`.


Look up a property escape
-------------------------

Pass the property and value separately for an escape such as
`\p{Script=Greek}`. The lookup accepts only the names and aliases allowed
by [ECMA-262]; an invalid spelling returns `undefined`.

~~~~ js
import { codePointSetHas, ecma262UnicodePropertySet } from "@oseo/unicode";

const greek = ecma262UnicodePropertySet("Script", "Greek");
if (greek === undefined) {
  throw new Error("Unknown Unicode property");
}
console.log(codePointSetHas(greek, 0x03b1)); // true: Greek small letter alpha
console.log(codePointSetHas(greek, 0x0061)); // false: Latin small letter a
~~~~

Use `ecma262UnicodeStringPropertySet()` for properties of strings such as
`RGI_Emoji`. Code-point sets are inversion lists: each pair of boundaries
gives an inclusive start and exclusive end. String properties are lists of
code-point sequences. Treat returned arrays as immutable because the package
shares them across calls.

[ECMA-262]: https://tc39.es/ecma262/#sec-runtime-semantics-unicodematchproperty-p


Regeneration and licensing
--------------------------

From a repository checkout, run `mise run unicode:update` to regenerate the
tables from the pinned inputs. See [maintaining Oseo's Unicode tables] for
input verification and version updates.

The Unicode data and generated tables are licensed under `Unicode-3.0`.
The published package includes [*UNICODE-LICENSE.txt*]. Oseo's handwritten
code remains under the [repository license].

[maintaining Oseo's Unicode tables]: https://github.com/dahlia/oseo/blob/main/docs/development/package-unicode.md
[*UNICODE-LICENSE.txt*]: https://github.com/dahlia/oseo/blob/main/packages/unicode/UNICODE-LICENSE.txt
[repository license]: https://github.com/dahlia/oseo/blob/main/LICENSE
