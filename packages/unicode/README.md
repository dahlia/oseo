@oseo/unicode
=============

This package owns Oseo's Unicode data. It reports code-point properties, case
folding, case mapping, and the ECMAScript word-character sets from generated
tables built out of one reviewed copy of the Unicode Character Database. No
answer depends on a host locale, a `wchar_t` classification routine, or a C
library regular-expression facility, so two hosts running the same checkout
agree exactly and a cross-compiled target agrees with the host that built it.

The contract is deliberately narrow. The package supplies tables and decides
none of the semantics that consume them. Which property escape a pattern
admits, how canonicalization orders comparisons, and which locale a `String`
method honors belong to the regular-expression and `String` units that read
these tables, not here.


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
header and its `# Version:` line for *emoji-data.txt*, and no header at all
for *UnicodeData.txt*, which upstream ships without one. A missing or
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

Properties of strings, such as `RGI_Emoji` and `Basic_Emoji`, are out of
scope. They are sequence properties rather than code-point properties, they
need the emoji sequence files that this package does not pin, and they only
matter to the `v` flag. The unit that admits `v`-mode class set notation owns
them.


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
