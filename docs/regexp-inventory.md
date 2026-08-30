Regular expression inventory
============================

This record is the delivery item 1 inventory of
[*PLAN-REGEXP.md*](../PLAN-REGEXP.md). It names the candidate-edition
clauses, the applicable test262 directories, the flags, the intrinsic and
prototype surface, the well-known symbol hooks, the Unicode inputs, and the
diagnostics Oseo reports today. It records what exists, not what is
planned, and it is updated by the unit that changes one of those facts.

The edition boundary is ECMAScript 2025, fixed by
[ADR 0013](./adr/0013-m5-edition-and-manifest.md). Annex B is outside that
claim, which is what the pattern-grammar section below turns into a
concrete acceptance rule.


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
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`, which
[ADR 0020](./adr/0020-m5-applicable-test-inventory.md) defines. Every one
of these paths is `included`: no regular expression path is excluded from
the candidate boundary.

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
no reviewed row; retagging them is a separate reviewed change, and neither
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
| A construct only Annex B admits   | `OSEO1001` | the construct inside the literal      |
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

The owned parser implements the main-body pattern grammar. Annex B is
outside the candidate claim, so a pattern that only Annex B admits is
rejected in every mode rather than accepted without the `u` flag. That is
a deliberate, measured divergence from a web browser:

 -  an identity escape over an `ID_Continue` character, such as `\a`
    or `\_`;
 -  a legacy octal escape, such as `\01`;
 -  a control escape without an ASCII letter, such as `\c`;
 -  an incomplete hexadecimal or Unicode escape, such as `\x` or `\u`,
    including `\u{...}` without `u` or `v`;
 -  a quantified lookahead, such as `(?=a)*`;
 -  an unescaped `]` or `}`, and a `{` that starts no quantifier;
 -  a class-escape bound character class range, such as `[\d-a]`;
 -  a backreference that names no group; and
 -  a named backreference in a pattern that declares no group name, such
    as `\k<x>`, `\k`, or `\ka`.

Which diagnostic a rejection reports follows from that list. Under `u` and
`v` Annex B never applied, so the rejection is the early error the edition
itself requires and reports `OSEO0001`. Without them the text is one a web
browser accepts, so the rejection is this claim's own boundary and reports
`OSEO1001` naming Annex B. The generated invalid domain at seed
`0x60004a01` asserts that split, and it uses the reported kind to decide
when the host engines are a sound oracle: they agree with every
`OSEO0001` rejection and with none of the Annex B ones.

A rejection Annex B shares stays an early error in both modes. A
quantified lookbehind, edge assertion, or word boundary, an out-of-order
class range such as `[z-a]`, an unmatched `)`, a malformed group name such
as `(?<>x)`, a named backreference in a pattern that does declare a group
name, and `\k` inside a class when that pattern declares a group name are
all rejected by a web browser too.

The parser reports the first defect it reaches, so the split is exact for
a pattern whose only defect is the reported construct. A pattern that is
also malformed for a reason Annex B shares, such as `/a(]/`, reports the
Annex B boundary it reaches first even though a web browser rejects that
pattern for its unterminated group. The one-directional oracle condition
holds without that qualification: a sweep of 74,052 short patterns over
the grammar's own alphabet found no pattern this parser calls invalid that
a web browser accepts.

The inventory's candidate roots are *test/built-ins/* and *test/language/*,
so *test/annexB/* is outside it entirely, and the `u-invalid-` and
`unicode_restricted_` cases inside the boundary assert exactly the
rejections above. Whether an included path also requires accepting one of
these constructs without `u` is now measured for the 625 paths under
*test/built-ins/RegExp/CharacterClassEscapes/* and
*test/built-ins/RegExp/property-escapes/*. None requires that Annex B
acceptance. The next node that reviews another RegExp directory owns the
same measurement for its paths, and a path that needs Annex B acceptance
classifies as an unsupported profile feature rather than silently widening
the grammar.
