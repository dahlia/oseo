@oseo/unicode
=============

This package owns Oseo's Unicode data. It reports code-point and string
properties, case folding, case mapping, and the ECMAScript word-character sets
from generated tables built out of one reviewed copy of the Unicode Character
Database and emoji sequence data. No answer depends on a host locale, a
`wchar_t` classification routine, or a C library regular-expression facility,
so two hosts running the same checkout agree exactly and a cross-compiled
target agrees with the host that built it.

The contract is deliberately narrow. The package supplies tables and resolves
the exact property and value aliases ECMA-262 admits in a Unicode property
escape. It decides no matching, canonicalization, or locale behavior that
consumes a resolved set; those decisions belong to the regular-expression and
`String` units that read these tables.


Pinned inputs
-------------

*data/manifest.yaml* pins Unicode 17.0.0 and emoji data 17.0. It records every
input file's upstream URL, byte length, and SHA-256 digest, and the reviewed
copies live beside it under *data/ucd/*. Generation reads nothing else: it
never contacts the network, so `mise run check` and `mise run test` work
offline and produce the same tables on every machine.

Generation rejects an input whose byte length or digest has moved. It then
requires the structural version marker the manifest names for that file: a
`# <Name>-<version>.txt` first line for an ordinary database file, the emoji
header and its `# Version:` line for the three emoji data files, and no header
at all for *UnicodeData.txt*, which upstream ships without one. A missing or
reshaped header fails rather than being skipped, because a skipped header is
what a substituted file looks like once its digest has been updated without
its contents being reviewed. Generation also rejects a property or case
mapping context that a pinned input no longer defines.

The Unicode Character Database is distributed under the Unicode license,
retained verbatim as *UNICODE-LICENSE.txt* and identified as `Unicode-3.0`.
That license covers the pinned inputs and the tables derived from them, so
every published npm and JSR artifact ships it beside the generated module even
though it does not ship the inputs themselves. Oseo's own source, including
the generator and this package's hand-written modules, stays under the
repository license in *LICENSE*.


Regenerating
------------

~~~~ sh
mise run unicode:update       # rewrite src/tables.ts from the pinned inputs
mise run check:unicode-tables # fail when the checked-in module is stale
~~~~

*src/tables.ts* is generated. Do not edit it by hand: `mise run check` rebuilds
it in memory and fails when a single byte differs. Moving to a later Unicode
version means replacing the reviewed inputs, updating *data/manifest.yaml*, and
regenerating in the same change, so the version, the digests, and the tables
never disagree.


What the tables cover
---------------------

 -  The `General_Category`, `Script`, and `Script_Extensions` values, as total
    assignments over every code point, with every value spelling that
    *PropertyValueAliases.txt* accepts.
 -  Every binary property in table 70 of ECMA-262, including the three
    (`ASCII`, `Any`, and `Assigned`) that ECMAScript defines rather than the
    Unicode Character Database.
 -  Every ECMAScript property of strings derived from *emoji-sequences.txt*
    and *emoji-zwj-sequences.txt*, including the composed `RGI_Emoji` set.
 -  Simple and full case folding, and the simple and unconditional full
    lowercase, uppercase, and titlecase mappings.
 -  The conditional case mappings of *SpecialCasing.txt*, recorded with their
    context names and optional language subtag and applied by nobody. A caller
    implementing default case conversion honors the language-independent
    contexts; a locale-sensitive caller decides the rest.
 -  `Canonical_Combining_Class`, which is the property those contexts are
    defined over. A caller resolving `More_Above` or `After_Soft_Dotted` gets
    it from here rather than from a host Unicode implementation.
 -  The ECMAScript word characters, both the basic set and the set a pattern
    with `i` and a Unicode mode uses. The second is derived from simple case
    folding rather than listed, so it cannot drift from the folding table.

Every table covers the whole code-point range, so supplementary planes,
unpaired surrogates, noncharacters, and unassigned code points all have
defined answers. A surrogate has `General_Category=Cs` and folds and maps to
itself; an unassigned code point has `General_Category=Cn`. Passing anything
that is not a code point raises a `RangeError` rather than returning a
plausible answer.

`ecma262UnicodePropertySet` resolves the exact aliases admitted for a `p` or
`P` escape. A lone canonical name selects a binary property or a
`General_Category` value. A two-part expression selects `General_Category`,
`Script`, or `Script_Extensions`. The function performs no loose matching and
returns `undefined` for an invalid property expression, including a lone
Script value.

`ecma262UnicodeStringPropertySet` resolves an exact property-of-strings name
to its code-point sequences. It performs no alias or loose matching because
ECMA-262 admits only the canonical names in this grammar, and it returns
`undefined` for a code-point property or an unknown name.


Representation
--------------

A code-point set is an inversion list: a strictly increasing, even-length
array of boundaries where membership toggles, so `[0x41, 0x5b]` is U+0041
through U+005A. A consumer may lower one straight into a generated C table
without reshaping it. Sets are decoded on first use and cached, and every
returned array is shared, so treat what the package returns as immutable.

The generated module stores each table as text rather than as an array
literal: base-36 integers separated by whitespace, where all but the first are
increases from the value before them. That keeps the module small, keeps every
line inside the repository limit, and confines a diff to the entries that
actually moved.

A property of strings is a shared immutable list of shared immutable
code-point sequences. Each generated sequence is base-36 text decoded on the
first lookup, and the complete property is cached just like a code-point set.
