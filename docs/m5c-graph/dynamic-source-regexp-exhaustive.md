Exhaustive regexp literal domains
=================================

This node owns the four DS-17 paths that
[*dynamic-source-regexp-static-evidence.md*](./dynamic-source-regexp-static-evidence.md)
retained in remediation because no exhaustive literal witness covered them.
Size: M. The initial scope has zero newly established closures.

The exact selector is
[*dynamic-source-regexp-exhaustive.paths.txt*](./dynamic-source-regexp-exhaustive.paths.txt).

SHA256:

`daf3c919e5fcc0b5802ae9112c9eba9e451590fbb3d1e7df132b26bb5c8cd33d`


Authority
---------

The maintainer's 2026-11-01 answer
*~/.local/state/oseo-m5c/decisions/answers/20261031T1409-umbrella-residual.md*,
item 2, approves exhaustive coverage for these four paths. It assigns a
generated-domain budget with a seed block and CI shard weights, and requires
shard placement that keeps the new cost away from every macOS job limit.
Cases, seeds and domains are never reduced. The source packet is family 10 of
*/data/m5c-d17-20261031/umbrella-residual/REPORT.md*.

The 2026-11-01 decision
*~/.local/state/oseo-m5c/decisions/macos-native-sanitizer-timeout-20261101.md*,
item 2, splits the `host C sanitizers (macOS, native)` job into file shards
in the same tools publication. Every shard is required by the `native`
aggregate, and the shards cover the whole input set.

ADR 0013, 0016 and 0019 are unchanged. Build-time literal tests need no
ADR 0016 amendment.


Paths and contracts
-------------------

Each original loops over every BMP code unit, skips the eleven syntax
characters `* / \ + ? ( ) [ ] { }` and the four line terminators, and
evaluates one literal per remaining code unit. That selects 65,521 code
units per path.

| Path                                                | Literal spelling | Contract                                                                |
| --------------------------------------------------- | ---------------- | ----------------------------------------------------------------------- |
| *test/language/literals/regexp/S7.8.5\_A1.1\_T2.js* | `/X/`            | Every selected code unit is accepted and `source` is `X`                |
| *test/language/literals/regexp/S7.8.5\_A1.4\_T2.js* | `/\X/`           | Accepted with `source` `\X`, or SyntaxError for UnicodeIDContinue only  |
| *test/language/literals/regexp/S7.8.5\_A2.1\_T2.js* | `/nnnnX/`        | Every selected code unit is accepted and `source` is `nnnnX`            |
| *test/language/literals/regexp/S7.8.5\_A2.4\_T2.js* | `/a\X/`          | Accepted with `source` `a\X`, or SyntaxError for UnicodeIDContinue only |

The escaped paths accept a SyntaxError only when the code unit is not `$`,
ZWNJ or ZWJ and `var _X` parses, the original's UnicodeIDContinue check.
Annex B identity escapes remain separate: under ADR 0013 the build reports
an Annex-B-only escape as unsupported, which is the core grammar's
SyntaxError outcome, and the evidence must keep every core assertion.


Closure route and evidence obligations
--------------------------------------

Estimated test groups: four exhaustive domain groups plus generated native
shards. Audit-only candidates: zero.

 -  Witness every selected code unit of each original in build-time literal
    grammar, in both strictness modes the default test262 flags select.
 -  Execute every accepted literal natively and compare its `source` with
    the original's expected spelling, sharded for compile and native cost,
    with measured costs recorded.
 -  Preserve the exclusions and the escaped paths' fallback branch exactly.
    No sample and no RegExp constructor substitutes for a literal.
 -  Fix parser, escape or source handling only if the witness finds a defect.
 -  Close a path through the ledger API only when every assertion is
    witnessed; otherwise it keeps umbrella ownership.

Each closure needs normal D1/D11 review and D3/D4 publication. Root owns
integration and publication.


Implementation delta
--------------------

*tests/property/m5-regexp-literal-exhaustive.property.test.ts* reproduces
each original loop, its exclusions and its fallback condition. Build-time
tests compile every selected code unit as the literal the original evaluates,
`/` + text + `/` with no flags, in sloppy and strict scripts:

 -  An accepted literal must compile with no diagnostic to exactly one
    ahead-of-time literal whose recorded source is the original's spelling
    and whose flags are empty.
 -  A rejected literal is allowed only in the escaped domains. Every
    diagnostic must be `OSEO1001` with the Annex B message, the code unit
    must not be one the original exempts, and `var _X` must compile, which is
    the original's own UnicodeIDContinue check.
 -  Both strictness modes must agree. Independently of the parser, the
    accepted set must equal the selected code units outside `ID_Continue` of
    the pinned Unicode tables plus the core escapes
    `f n r t v d D s S w W b B 0`.

Four native properties execute all 160,516 accepted literals, each once per
run, comparing `source` in the program with the spelling the original builds
from the same code unit through `String.fromCharCode`. The reference host
runs every program from memory, the build must emit one literal descriptor
per selected code unit, and mutation controls show that a wrong prefix or a
wrong code unit fails before the success line.

No parser, escape or source defect was found, so `packages/` is unchanged.

The witness found one residue. Unicode 15.1 made ZWNJ and ZWJ
`ID_Continue`, and the pinned tables are Unicode 17. The core grammar
therefore rejects `‌` and `‍` as identity escapes, while both
escaped originals exempt exactly these two code units from their fallback
and rethrow. Only Annex B's identity escape satisfies those two assertions;
every other code unit of the four originals is witnessed.

Root's ruling of 2026-11-01 closes S7.8.5\_A1.1\_T2 and S7.8.5\_A2.1\_T2 under
ADR 0016 through the new `ds17-exhaustive-plain-literals` assessment. The
maintainer decision of 2026-11-01 applies item 3 of the 2026-10-28 decision
to S7.8.5\_A1.4\_T2 and S7.8.5\_A2.4\_T2 and to no other path: every core
subject has the replacement evidence above, so both close under ADR 0013 as
`annex-b-only` exclusions through `ds17-exhaustive-escaped-annex-b`. ADR 0013
is unchanged. Their observation is still the eval rejection, so the exclusion
audit admits an ADR 0013 row over that rejection only for these two exact
paths, only as a bound `annex-b-only` exclusion, and requires both rows. The
umbrella now owns 330 paths and this node owns none.

Cost, shard weights and CI placement are recorded in
[*exhaustive RegExp literal evidence*](../evidence/regexp-literal-exhaustive/README.md).
The macOS native sanitizer split is recorded in
[*macOS native sanitizer split*](../evidence/macos-sanitizer-split/README.md).

The subset, classifications, dependency tags and observations are unchanged,
so no test262 UPDATE is needed. The test262 runner reads none of the changed
*tools/* files.
