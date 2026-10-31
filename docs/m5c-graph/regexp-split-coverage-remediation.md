RegExp split Annex B closure
============================

Scope and accounting
--------------------

Item 3 of the 2026-10-28 *m5c-scope-big-node-split* maintainer decision
closes a mixed Annex B path under ADR 0013's optional Annex B boundary only
when reviewed replacement observations cover every core subject and a
fresh-digest audit record names them. Otherwise the path stays here.

This node owned one path, *test/built-ins/String/prototype/split/
separator-regexp.js*. Its observation is the build-time `OSEO1001`
rejection of `/\k<x>/`, so none of its 37 assertions ran. The path now
closes: four of its patterns are Annex B only, and the other 33 assertions
have fixed native evidence. ADR 0013, ADR 0016, ADR 0019, the subset, the
original source and assertions, and the recorded unsupported result are
unchanged. The path is not counted as a pass.


Per-path assertions
-------------------

Every assertion is `assert.compareArray("x".split(pattern), expected)`, which
calls `RegExp.prototype[%Symbol.split%]` through `String.prototype.split`.
Section names are ECMA-262 16th edition clause ids.

| Patterns                                                                                                  | Kind    | Section                                           |
| --------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------- |
| `^` `$` `.?` `.*` `.+` `.*?` `.{1}` `.{1,}` `.{1,2}` `()` `.` `(?:)` `(...)` `(\|)`                       | core    | sec-patterns, sec-string.prototype.split          |
| `[]` `[^]` `[.-.]` `\0` `\b` `\B` `\d` `\D` `\n` `\r` `\s` `\S` `\v` `\w` `\W` `\xA0` `\ddd` `\cY` `[\b]` | core    | sec-patterns, sec-regexp.prototype-%symbol.split% |
| `\k<x>` with no group name                                                                                | Annex B | sec-regular-expressions-patterns                  |
| `\XA0` and `\X`, identity escapes of ID\_Continue letters                                                 | Annex B | sec-regular-expressions-patterns                  |
| `\x` without two hexadecimal digits                                                                       | Annex B | sec-regular-expressions-patterns                  |

The core grammar has no production for the four Annex B forms: `\k` needs a
GroupName the pattern declares, IdentityEscape excludes ID\_Continue code
points without the u flag, and `\x` needs HexEscapeSequence. The profile
reports each with its own `OSEO1001` message. `\ddd` is the
CharacterClassEscape `\d` followed by two `d` atoms, and `\0` is not
followed by a digit, so both stay core.


Replacement evidence
--------------------

The `annex-b-core-string-split-regexp` fixture in
*tests/native/fixtures/annex-b-mixed-core.ts* splits `"x"` with all 33 core
literals and the upstream expected arrays. For each result it checks
`Array.isArray`, the `Array.prototype` prototype, the length, and each own
element with `Object.is`. It also checks each literal's `lastIndex` stays
0 and counts 33 splits. The shared comparator self-check and its
independent verdict are described in the
[TypedArray note](./typed-array-proto-coverage-remediation.md#replacement-evidence).

*tests/annex-b-mixed-core-native.test.ts* runs the oracle and comparator
mutants and the native lanes described there. It compiles through the
command-line frontend, which links the Unicode data `\s` and `\S` need.
It also compiles `"x".split(/…/)` for each Annex B form in both strictness
modes and requires only `OSEO1001` diagnostics, with the form's own message
and no MIR.


Audit record
------------

*docs/m5c-closure/exclusion-audit.yaml* keeps the path row, with current
source and observation digests, and changes `annex-b-pattern` to
`disposition: exclusion` and `normativeDependency: annex-b-only`. It binds
the digests of both evidence files. The ledger moves the path to
`adr:0013-m5-edition-and-manifest` through the ledger API and
`mise run m5c:closure-ledger:update`. This node then owns no path.

| Path                                         | Outcome  | Assessment        |
| -------------------------------------------- | -------- | ----------------- |
| *String/prototype/split/separator-regexp.js* | excluded | `annex-b-pattern` |

The exclusion reopens on changed source, observation, or replacement
evidence, on an amendment of ADR 0013's optional Annex B policy, or on an
ADR 0019 reopening trigger.

Root owns D3, any UPDATE, outer review, publication, merge, and landed state.
