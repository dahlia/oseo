Regular expression inventory
============================

This record is the delivery item 1 inventory of
[*PLAN-REGEXP.md*](../PLAN-REGEXP.md). It names the candidate-edition
clauses, the applicable test262 directories, the flags, the intrinsic and
prototype surface, the well-known symbol hooks, the Unicode inputs, and the
diagnostics Oseo reports today. It records what exists, not what is
planned, and it is updated by the unit that changes one of those facts.

The M5 edition boundary is ECMAScript 2025, fixed by
[ADR 0013](./adr/0013-m5-edition-and-manifest.md), with Annex B outside it.
[ADR 0032](./adr/0032-post-m5-edition-boundary.md) brings Annex B into the
post-M5 claim, and the pattern-grammar section below records how the parser
and the runtime pattern compiler follow its grammar.


Clause inventory
----------------

| Clause | Subject                                                 | Owning M5b node                                      |
| ------ | ------------------------------------------------------- | ---------------------------------------------------- |
| 12.9.5 | `RegularExpressionLiteral` and its early errors         | `regexp-pattern-ast`                                 |
| 22.2.1 | Patterns: grammar and static semantics                  | `regexp-pattern-ast`, `regexp-pattern-extensions`    |
| 22.2.2 | Pattern semantics: matchers, choice order, captures     | `regexp-generic-matcher`                             |
| 22.2.3 | Abstract operations for regular expression objects      | `regexp-intrinsic`                                   |
| 22.2.4 | The `RegExp` constructor                                | `regexp-intrinsic`                                   |
| 22.2.5 | Properties of the `RegExp` constructor, `RegExp.escape` | `regexp-intrinsic`, `regexp-symbol-methods`          |
| 22.2.6 | Properties of `RegExp.prototype`                        | `regexp-prototype-and-exec`, `regexp-symbol-methods` |
| 22.2.7 | Abstract operations for `RegExp` instances              | `regexp-prototype-and-exec`                          |
| 22.2.8 | Properties of `RegExp` instances (`lastIndex`)          | `regexp-intrinsic`                                   |
| 22.2.9 | `RegExp` string iterator objects                        | `regexp-symbol-methods`                              |

Unicode property escapes are clause 22.2.1's `UnicodePropertyValueExpression`
productions with table 70's binary property list; they are owned by
`regexp-unicode-property-escapes`. Ahead-of-time literal compilation has no
clause of its own: it is an implementation of 12.9.5 evaluation and is owned
by `regexp-literal-aot`.


Applicable test262 directories
------------------------------

Every count below is the applicable-test inventory in
*tests/test262/inventory.tsv* at suite revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`.
[ADR 0020](./adr/0020-m5-applicable-test-inventory.md) defines that
inventory. Every one of these paths is `included`: no regular expression
path is excluded from the candidate boundary.

| Directory                                       | Included paths |
| ----------------------------------------------- | -------------- |
| *test/built-ins/RegExp/* (direct files)         | 488            |
| *test/built-ins/RegExp/property-escapes/*       | 613            |
| *test/built-ins/RegExp/prototype/*              | 487            |
| *test/built-ins/RegExp/unicodeSets/*            | 114            |
| *test/built-ins/RegExp/regexp-modifiers/*       | 70             |
| *test/built-ins/RegExp/named-groups/*           | 36             |
| *test/built-ins/RegExp/escape/*                 | 20             |
| *test/built-ins/RegExp/test/*                   | 17             |
| *test/built-ins/RegExp/lookBehind/*             | 17             |
| *test/built-ins/RegExp/match-indices/*          | 14             |
| *test/built-ins/RegExp/CharacterClassEscapes/*  | 12             |
| *test/built-ins/RegExp/Symbol.species/*         | 4              |
| *test/built-ins/RegExp/dotall/*                 | 4              |
| *test/built-ins/RegExpStringIteratorPrototype/* | 17             |
| *test/language/literals/regexp/*                | 182            |
| *test/language/literals/regexp/named-groups/*   | 56             |

That is 1,904 paths under the two `RegExp` roots plus 238 literal paths,
2,142 in total. Three further paths under
*test/built-ins/String/prototype/* and five under class syntax use a
regular expression without being owned by this family.

The Unicode property checkpoint selects all 625 paths under
*test/built-ins/RegExp/property-escapes/* and
*test/built-ins/RegExp/CharacterClassEscapes/*. Of those, 142 parse-negative
paths are expected negatives and 483 retain explicit boundaries for the
RegExp intrinsic and execution, class set notation, or other later nodes.

ADR 0013's reviewed dependency-tag vocabulary is extensible through a reviewed
amendment to that record, and one now admits `regular-expressions`. These rows
keep the existing tags they were reviewed under, because admitting a tag moves
no reviewed row. Retagging them is a separate reviewed change, and neither
change touches the classification vocabulary.


Flags
-----

| Flag | Accessor      | Effect on the pattern grammar                                                                          |
| ---- | ------------- | ------------------------------------------------------------------------------------------------------ |
| `d`  | `hasIndices`  | none; changes the match result only                                                                    |
| `g`  | `global`      | none; changes execution state only                                                                     |
| `i`  | `ignoreCase`  | none; changes matching only                                                                            |
| `m`  | `multiline`   | none; changes assertion meaning only                                                                   |
| `s`  | `dotAll`      | none; changes `.` meaning only                                                                         |
| `u`  | `unicode`     | selects `UnicodeMode`: code-point traversal, braced escapes, property escapes, strict identity escapes |
| `v`  | `unicodeSets` | selects `UnicodeMode` and `UnicodeSetsMode`: class set notation                                        |
| `y`  | `sticky`      | none; changes execution state only                                                                     |

`u` and `v` cannot be combined, and no flag may repeat. Both rules are
validated by the owned parser and reported at the offending flag.


Intrinsic, prototype, and symbol surface
----------------------------------------

The `regexp-intrinsic` node added `%RegExp%`, `%RegExp.prototype%`, the
constructor link, the `Symbol.species` accessor, and the `lastIndex` own
property, and `regexp-prototype-and-exec` added `exec`, `test`, `toString`,
the ten prototype accessors, and the deferred `@@match`, `@@matchAll`,
`@@search`, and `@@split` placeholders; `string-prototype-replace` added the
`@@replace` placeholder beside them. `string-prototype-match-and-split`
already owns `%RegExpStringIteratorPrototype%`. The rest of this surface does
not exist yet. The complete list stays here so that each later node names
what it adds:

 -  `%RegExp%`: call and construct behavior, `length`, `name`,
    `prototype`, and `RegExp.escape`, plus the `Symbol.species` accessor.
 -  `%RegExp.prototype%`: `exec`, `test`, `toString`, `constructor`, and
    the `dotAll`, `flags`, `global`, `hasIndices`, `ignoreCase`,
    `multiline`, `source`, `sticky`, `unicode`, and `unicodeSets`
    accessors.
 -  Instances: the `lastIndex` own data property, writable and neither
    enumerable nor configurable.
 -  `%RegExpStringIteratorPrototype%`: `next` and `Symbol.toStringTag`.
    Both exist. `regexp-symbol-methods` extends the object with the results
    a real `@@matchAll` yields rather than creating it.
 -  Well-known symbol hooks: `@@match`, `@@matchAll`, `@@replace`,
    `@@search`, `@@split`, and `@@species`. `%RegExp%` carries the real
    `@@species` accessor. `%RegExp.prototype%` carries the other five as
    deferred placeholder methods with their specified names, lengths, and
    descriptors: calling one reports the owned boundary that
    `regexp-symbol-methods` replaces with the real method.
    `string-prototype-match-and-split` and `string-prototype-replace`
    dispatch through all five when a receiver defines them, so a RegExp
    operand reaches that boundary through GetMethod instead of falling
    through to a String approximation.


Unicode inputs
--------------

`@oseo/unicode` pins one reviewed copy of the Unicode Character Database
for Unicode 17.0.0 and the Unicode 17.0 emoji sequence and ZWJ sequence
files. It generates `General_Category`, `Script`, `Script_Extensions`, every
binary property in table 70 of ECMA-262, the seven ECMAScript properties of
strings, simple and full case folding, the simple and unconditional full
case mappings, and both ECMAScript word-character sets. Code-point sets are
inversion lists, and string properties are ordered lists of code-point
sequences.

`ID_Start` and `ID_Continue` are generated but unreachable from the compiler
core, because
*tools/check-boundaries.ts* gives `@oseo/compiler` no package dependencies.
The pattern parser therefore decides ASCII itself and takes a classifier
from its caller for anything else, which is why a group name or a
non-unicode identity escape outside ASCII is refused rather than guessed.
Unicode property escapes follow the same boundary. `@oseo/unicode` exports
the exact ECMA-262 alias resolver, the frontend supplies it, and the compiler
accepts no property name the resolver does not map to a pinned inversion-list
set.


Diagnostics Oseo reports today
------------------------------

A regular expression literal reaches the owned parser at the frontend
boundary and, when the pattern parses, the owned matcher builder right
after it. A literal the build compiles evaluates; every other one ends in
a diagnostic that is a decided property of the pattern rather than of the
literal:

| Condition                         | Code       | Location                              |
| --------------------------------- | ---------- | ------------------------------------- |
| Invalid pattern or flag text      | `OSEO0001` | the offending text inside the literal |
| A construct a later node admits   | `OSEO1001` | the construct inside the literal      |
| An owned parser or matcher limit  | `OSEO1001` | the construct that reaches the limit  |
| A Unicode fact that is not linked | `OSEO1001` | the construct that needs it           |
| A valid, admitted pattern         | none       | it compiles ahead of time             |

Class set notation, properties of strings, inline modifiers, Unicode group
names, named groups, lookbehind, match indices, and dotAll matching are
admitted for literals. The dynamic C pattern compiler admits inline
modifiers and the code-point grammar it already owns, but it links no pinned
Unicode tables, so a dynamic property escape or class set retains its located
`OSEO2001` profile boundary rather than matching from incomplete data.

The bootstrap parser still rejects a duplicate or unknown flag before the
owned parser sees the literal, so those two produce `OSEO0001` at the
parse stage with the bootstrap message. The unlinked-Unicode row is a
composition boundary rather than a grammar one: `@oseo/compiler` links no
Unicode data, so a composition root that supplies none cannot compile an
ignore-case pattern, a `\s` escape, or a property escape.


Pattern grammar acceptance
--------------------------

The owned parser implements the main-body pattern grammar and, for a
pattern without `u` or `v`, the grammar of Annex B's Regular Expressions
Patterns section. The runtime's own validator and pattern compiler, which
serve the `RegExp` constructor, the String methods that create a RegExp, and
`compile`, follow the same grammar. Without those flags each of these is
accepted with its Annex B reading:

 -  an identity escape over any character but `c`, such as `\a`, `\_`, or
    `\é`;
 -  a legacy octal escape, such as `\01` or `\477`;
 -  a decimal escape above the pattern's capture count, read as a legacy
    octal escape or, for `\8` and `\9`, an identity escape;
 -  a control escape without an ASCII letter, read as a backslash followed
    by `c`, and `\c` with a digit or `_` inside a class;
 -  an incomplete hexadecimal or Unicode escape, such as `\x` or `\u`,
    including `\u{...}`;
 -  a quantified lookahead, such as `(?=a)*`;
 -  an unescaped `]` or `}`, and a `{` that starts no quantifier;
 -  a class escape as a range bound, such as `[\d-a]`, read as the union of
    both ends and `-`; and
 -  `\k` in a pattern that declares no group name, such as `\k<x>`, `\k`,
    or `\ka`.

Under `u` and `v` each of these stays the edition's own early error and
reports `OSEO0001`. A rejection Annex B shares is an early error in every
mode: a quantified lookbehind, edge assertion, or word boundary, an
out-of-order class range such as `[z-a]`, an unmatched `)`, a malformed
group name such as `(?<>x)`, a quantifier with nothing to repeat such as
`{1}`, a named backreference in a pattern that does declare a group name,
and `\k` inside a class when that pattern declares a group name.

`parseRegExpPattern` still takes `annexB: false` for the core grammar alone.
That mode reports each construct above as an `unsupported` error naming
Annex B when the pattern has neither flag, which the generated invalid domain
at seed `0x60004a01` uses as its oracle selector: the host and Annex B's
parse must agree with every `invalid` rejection, and both must accept every
Annex B one.

The `u-invalid-` and `unicode_restricted_` cases under *test/built-ins/*
assert the unicode-mode rejections above. The Annex B rows under
*test/annexB/built-ins/RegExp/* and *test/annexB/language/literals/regexp/*
belong to the `annexb-syntax` unit of
[*PLAN-LANGUAGE.md*](../PLAN-LANGUAGE.md).
