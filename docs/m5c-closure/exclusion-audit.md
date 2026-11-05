M5c exclusion audit procedure
=============================

[*exclusion-audit.yaml*](./exclusion-audit.yaml) binds each proposed exclusion
or dynamic-source remediation owner to a human review of the pinned upstream
source and its checked-in observation. Run `mise run check:m5c-exclusion-audit`
to validate records against the manifest and derived ledger. An accepted
record, a bounded assessment, and a matching diagnostic are all required;
dependency tags and directory names do not authorize exclusions.


Dynamic import in observation batches 30 through 32
---------------------------------------------------

The maintainer decision of 2026-10-07 (option C, interim A) leaves dynamic
import unsupported and ADR 0016 unchanged. The accounting node adds no new
paths or semantic evidence.

Its runner uses an explicit observe-only set containing just `dynamic-import`,
without adding it to the checked-in supported feature list. Cases whose only
unadmitted features are in that set reach observation; any other unadmitted
feature still blocks them. Case classifications follow the actual observation,
including pass for a feature tag unused by the source. The batches observe their
current behavior rather than infer it from this feature. Another earlier
rejection, a parse negative, or a feature that the source does not use must
retain its actual observation.

The full manifest update re-observes already-reviewed paths. The fixed inventory
has 630 paths with `dynamic-import` in frontmatter `features`, of which 629 were
unreviewed at cohort verification.

The accepted dynamic import rejection is exactly:

~~~~ text
error[OSEO1001]: ImportExpression is outside the M1 profile.
~~~~

Both script and module CLI probes produce that diagnostic. Source locations may
differ; a different message or diagnostic code is outside this addition to the
audit surface.

A tag-only case or a different diagnostic follows its actual classification
and the owner of the separate gap it exposes. The dynamic-source ownership
procedure below applies only to the accepted rejection; neither dynamic-source
owner can receive a path whose diagnostic the audit rejects. Ask for a
remediation owner if that separate gap has none, rather than inventing an audit
record or forcing the classification.

For each observed rejection, review the normative subject before choosing
ownership:

 -  A path under *test/language/expressions/dynamic-import/*, or an `esid`
    naming ImportCall, EvaluateImportCall, or ContinueDynamicImport, is a
    source-subject candidate. Confirm from its description, normative section,
    and assertions that `import()` itself is the subject and that the claimed
    exclusion covers only source evaluation. Record
    `priorCohort: source-subject`,
    `proposedOwner: adr:0016-dynamic-source-boundary`, and an assessment with
    `disposition: exclusion` and `normativeDependency: source-evaluation-only`.
    Only then use that ADR ledger owner.
 -  When `import()` is incidental scaffolding, or assertions leave another
    normative subject unresolved, use the ledger owner
    `node:dynamic-source-coverage-remediation`. Module evaluation order,
    top-level-await behavior, and JSON module identity are such subjects unless
    a bounded source-evaluation-only assessment is demonstrated. Record
    `priorCohort: incidental-scaffolding`, the same proposed ADR owner for the
    rejection, and an assessment with `disposition: remediation` and
    `normativeDependency: not-demonstrated`. A filename mentioning dynamic
    import or the frontmatter feature alone cannot close those assertions.

Both dispositions require a path record in *exclusion-audit.yaml*. Name the
normative `section` and `subject`, explain the assessment, and compute
`sourceDigest` and `observationDigest` with `exclusionAuditDigest` and
`exclusionObservationDigest` from *../../tools/m5c-exclusion-audit.ts* after
review. Keep the accepted ADR authorization and reopening evidence current. ADR
0019 requires this accepted, bounded record for every `adr:` owner.

Add the existing ADR 0013 `dynamic-source` dependency tag to reviewed subset
entries alongside other prerequisites. Set `missingDynamicTag` to false when
the observation's reviewed dependencies include it and true when they do not.
The checker rejects a debt flag that disagrees with the reviewed dependencies.
Debt neither authorizes exclusion nor changes the observed classification.

The separate `dynamic-import-staged-plan` node plans ADR 0016 alternative 3 for
build-time-resolvable imports. ADR 0016, as amended on 2026-11-03, selects
alternative 3 for the subset of the
[static-specifier import design](../static-specifier-import-design.md). The
amendment grants no exclusion. `import-admission` re-observed the
`dynamic-import` paths and reassessed the reopened exclusions. Rows that now
pass or report an expected negative keep their audit rows and assessments as
the record, with the `observation` ledger owner. The 18 rows whose fixture
calls the `Function` constructor stay ADR 0016 exclusions under
`ds12-static-module-observables`. The 87 rows that fail at build time fall on
the two surfaces of the next section.


Literal `import()` build failures
---------------------------------

ADR 0016, as amended, requires the closure of an admitted `import()` to
resolve, load, parse, and link before native generation, and makes a failure a
build diagnostic, not a language result. The runner then reports one diagnostic
line as the whole observation detail. The check accepts two classes of that
line, and only for a case that has the `dynamic-import` feature and no other
unadmitted one, and whose source passes one string literal to an `import()`
call with no options.

 -  An ADR 0016 exclusion, under the `static-specifier-import-build`
    capability: `OSEO0001` `Source could not be parsed.`, `OSEO2001`
    `Export 'x' is ambiguous.`, or `OSEO2001` `Module has no export 'x'.`
    located in the file a literal call names relative to the case, or
    `OSEO3001` `The module source could not be read.` located at the specifier
    of a literal call in the case. The 64 *catch/* rows of
    [*PLAN-LANGUAGE.md*](../../PLAN-LANGUAGE.md#static-specifier-import-units)
    are these exclusions under `ds11-static-module-goal`,
    `ds11-static-module-ambiguous`, `ds11-static-module-circular`, and
    `import-call-promise`.
 -  A *PLAN-DYN.md* deferral, under the `module-resolution-profile`
    capability: `OSEO3001` `Unsupported module specifier '…'.` located at the
    specifier of a literal call in the case whose value is the quoted text. The
    23 rows that import `''` or `'foo'` are these deferrals under
    `literal-import-resolution-deferral` and the `unresolvable-literal-import`
    family of [*deferrals.yaml*](./deferrals.yaml).

Locations are one-based, as the diagnostics print them. Any other code,
message, location, capability, or detail text is outside both surfaces. A
build failure is only an exclusion and a refused specifier only a deferral,
and a deferred path on either surface keeps its audit row.


Incidental Annex B TypedArray prototype lookup
----------------------------------------------

The classification node owns exactly
*test/built-ins/TypedArrayConstructors/ctors/no-species.js*. Its final
prototype assertion reads the excluded Annex B accessor. The required
TypedArray clone behavior does not depend normatively on that accessor.

The exact owned rejection is:

~~~~ text
error[OSEO1001]: The Object.prototype.__proto__ accessor is excluded by Annex B.
~~~~

A different diagnostic code, accessor name, or message is outside this bounded
addition. Ordinary properties named `__proto__`, null prototype objects, and
proxy traps are not Annex B accessors.

The mixed assessment originally named
`remediationOwner: node:typed-array-proto-coverage-remediation` with
`disposition: remediation` and `normativeDependency: not-demonstrated`, because
ADR 0013 authorizes the accessor rejection, not exclusion of the whole path.
The RegExp split assessment separately named its existing remediation owner.
The `annex-b-ordinary-object-prototype` assessment originally named
`node:ordinary-object-proto-coverage-remediation` for
*test/language/types/object/S8.6.2\_A8.js* with the same disposition and
normative dependency.

The checker accepts only these three bounded Annex B owners and requires each
reviewed assessment to match its ledger owner. The closure section below
supersedes those remediation dispositions.

The new assessment binds the replacement source digest in
`replacementEvidence`. The `typed-array-buffer-without-species-core` fixture in
*../../tests/native/fixtures/typed-array-constructors.ts* preserves the
original subclass, throwing constructor and species getter, TypedArray clone,
and fresh-buffer prototype and constructor assertions. It observes the
prototype through `Object.getPrototypeOf` instead of the excluded accessor and
retains the original upstream path unchanged. Existing constructor properties
supply generated constructor, clone, and buffer coverage. Replacement evidence
supports the core contract; assigning an exclusion still requires the
remediation node's maintainer accounting decision.

The ordinary-object assessment binds the
`annex-b-core-ordinary-object-set-prototype` fixture, which witnesses every
core subject of *S8.6.2\_A8.js*. The 2026-10-31 maintainer decision extends
item 3 of the 2026-10-28 decision to this path and no other, so the assessment
closes it under ADR 0013 with `disposition: exclusion` and
`normativeDependency: annex-b-only`. ADR 0013 itself is unchanged.


Dynamic import attributes and JSON identity
-------------------------------------------

The separately approved reservation in
*../m5c-graph/import-attributes-dynamic-coverage.md* contains exactly 64 pinned
paths. The actual observation for each path rejects `ImportExpression` before
option evaluation, enumeration, abrupt completion, promises, or JSON identity
assertions execute. The `import-attributes-dynamic-coverage-remediation` node
first held them as remediation; Git history keeps that assessment. The
reservation never widened the original 178-path
`dynamic-source-coverage-remediation` cohort. Observation batches 11, 12, 13,
and 05 later added 19, 23, 30, and 5 paths to that owner, whose current
contract is 255 paths.

The maintainer accounting decision of 2026-10-22 instead accounts for the 64
paths under ADR 0016. Their ledger owner is `adr:0016-dynamic-source-boundary`.
Each row keeps its original normative subject, source digest, and observation
digest. Each row uses one of three assessments with `disposition: exclusion`
and `normativeDependency: source-evaluation-only`:

 -  `import-call-attributes` covers the 60 ImportCall subjects with a
    string-literal specifier. Coverage includes grammar parameter forwarding,
    options evaluation and abrupt completions, the `with` lookup and
    enumeration, rejection of invalid options, promise settlement, and
    trailing-comma calls.
 -  `import-call-attributes-computed-specifier` covers
    *2nd-param-evaluation-sequence.js*, *2nd-param-trailing-comma-reject.js*,
    and *trailing-comma-reject.js*, whose specifiers are computed at run time.
    They stay outside even the build-time literal subset of
    *../dynamic-import-staged-plan.md*.
 -  `json-module-dynamic-site-identity` covers *json-idempotency.js*. Its
    static default imports and indirect static import do not depend on dynamic
    import. The assessment binds the static JSON identity fixtures and
    properties as `replacementEvidence` and excludes only the `import()` site.

The audit requires that bounded exclusion for every unsupported reserved path,
with the upstream `import-attributes` feature and the exact accepted
`ImportExpression` rejection. It rejects a reserved row with any other
disposition, owner, or diagnostic. It rejects any row or ledger entry that
still names `node:import-attributes-dynamic-coverage-remediation`. A reserved
path that later passes or becomes an expected negative takes the observation
owner and keeps its historical row. The check validates any assessment's
`replacementEvidence` digests, not only the TypedArray owner's.

The exclusion reopens when an accepted ADR 0016 amendment admits any form of
dynamic import, including the literal subset. A still unsupported path then
needs a fresh assessment against the amended record. The decision approves no
dynamic import implementation and no change to the staged proposal.


Incidental legacy accessor lookups
----------------------------------

ECMA-262 16th edition clause 20.1.3.9 defines
`Object.prototype.__lookupGetter__` and `Object.prototype.__lookupSetter__` as
normative optional legacy methods. ADR 0020 maps that clause onto the ADR 0013
Annex B exclusion. The exact owned rejections are each one stderr line,
wrapped here after `excluded`:

~~~~ text
error[OSEO1001]: The Object.prototype.__lookupGetter__ method is excluded
by the M5 optional legacy accessor policy.
error[OSEO1001]: The Object.prototype.__lookupSetter__ method is excluded
by the M5 optional legacy accessor policy.
~~~~

The checker accepts either one only at the end of the process stderr. It
accepts it only when the reviewed source contains a call of the named method
in call syntax (a direct, optional, or string-literal computed member call, as
for `eval`), and only with the ADR 0013 proposed owner. Outside the closure
selector below, the row also needs
`remediationOwner: node:class-private-accessor-lookup-coverage-remediation`
and `disposition: remediation`. That owner accepts no other rejection. A
different code, method name, wording, or stdout text is outside the surface.
The `__proto__` and RegExp split pairs are unchanged.

Observation batch 11 observed the class expression paths
*private-getter-is-not-a-own-property.js* and
*private-setter-is-not-a-own-property.js* under
*test/language/expressions/class/elements/* at `e6db3a1c` with exactly these
rejections. The `class-private-getter-public-absence` and
`class-private-setter-public-absence` fixtures in
*../../tests/native/fixtures/classes.ts* keep every assertion of those sources
except the lookup call.
*../../tests/class-private-accessor-coverage-native.test.ts* runs them natively
under both specialization policies with collection at every safepoint. The
2026-11-01 maintainer decision applies item 3 of the 2026-10-28 decision to
these two paths and to no other. Their rows use the
`annex-b-legacy-lookup-class-expression` assessment. It binds both evidence
files and closes the paths as ADR 0013 exclusions with
`normativeDependency: annex-b-only` and the `adr:0013-m5-edition-and-manifest`
ledger owner.

Observation batch 22b admits the class declaration paths of the same names
under *test/language/statements/class/elements/*, which differ from the
expression sources only in declaring `class C` instead of assigning a class
expression to `var C`. The 2026-11-02 maintainer decision closes these two
paths on the same conditions and no other. The
`class-declaration-private-getter-public-absence` and
`class-declaration-private-setter-public-absence` fixtures in the same file
keep every assertion of those sources except the lookup call and also check
that the declaration creates no global object property. The same native test
runs them the same way. Their rows use the
`annex-b-legacy-lookup-class-declaration` assessment, which binds the same
two evidence files and closes the paths the same way.

The checker admits an exclusion over a lookup rejection only for the exact
four-path selector `m5cAnnexLookupClosedPaths` in
*../../tools/m5c-exclusion-audit.ts*, only with bound replacement evidence and
no remediation owner, and requires all four rows. No checked-in row now uses
the remediation owner. ADR 0013 itself is unchanged.


Legacy function caller reads
----------------------------

[ADR 0028](../adr/0028-legacy-function-caller-boundary.md) authorizes an M5
exclusion for exactly the 23 paths in its Exact selector section. The
exclusion covers the optional expectation that reading a non-strict ordinary
function's `caller` completes normally. They are all the paths at the pinned
revision with the `caller` frontmatter feature. The checker parses that list
from the accepted record and pins its digest. Adding, removing, or renaming a
path therefore needs a new reviewed scope decision as well as a tool change.

The accepted rejection is the existing frontmatter check, recorded as
`unsupported-profile-feature` with exactly this observation detail:

~~~~ text
Not executed: the frontmatter needs an unsupported feature.
~~~~

`caller` must be the only entry in `unsupportedFeatures`. The case must list
`caller` in `features` and `noStrict` in `flags`. The reviewed source must read
a `caller` member in member syntax, such as `g.caller`,
`arguments.callee.caller`, or a static computed or optional form. Another
unsupported feature, an include or capability rejection, a compile or run-time
diagnostic, or text that only mentions `caller` is outside the surface.

Each selector path records `priorCohort: legacy-caller`,
`proposedOwner: adr:0028-legacy-function-caller-boundary`, and the
`legacy-caller` assessment with `disposition: exclusion` and
`normativeDependency: legacy-caller-only`. The selector is exact in both
directions. No other path can use that owner, cohort, or dependency, and no
selector path can name ADR 0013. The record has no remediation disposition.
Once a selector path is reviewed, it must keep an audit row even if its ledger
owner changes. A promotion to pass or expected negative uses the observation
owner and keeps the row's ADR 0028 owner and assessment.

[ADR 0034](../adr/0034-legacy-function-caller-contract.md) admits the `caller`
feature, so the frontmatter check no longer rejects a selector path. While ADR
0034 is accepted, the checker accepts a selector path that has not closed only
as an ADR 0016 row. It keeps `priorCohort: legacy-caller` and needs
`proposedOwner: adr:0016-dynamic-source-boundary`, an exclusion assessment with
`normativeDependency: source-evaluation-only`, and the ADR 0016 rejection of an
`eval` or `Function` call. Any other owner, dependency, or rejection fails, and
the selector digest stays pinned.

The 18 selector paths that call neither `eval` nor a `Function` constructor
pass. The other five carry the `dynamic-source` dependency tag and fail on
that call, so they are ADR 0016 rows under the `legacy-caller-dynamic-source`
assessment, which binds the `caller` fixtures as replacement evidence. The
%Function.prototype% accessors, the clause 17.1 restrictions, and the absence
of an own `caller` property on arguments objects stay inside the claim with
their own evidence or remediation owners.


Resizable buffer harness observations
-------------------------------------

The RAB harness cohort on clean source `2e3d973f` has 4 remaining rejections.
They report `primitive-wrapper` and belong to `primitive-wrapper-objects`. The 2
mixed Annex B prototype subjects remain owned by
`typed-array-proto-coverage-remediation`, with their original paths and
assertions retained. The new assessments bind their actual rejection
observations and the reviewed constructor/prototype and out-of-bounds native
replacement evidence. They authorize no exclusion. WKI paths, dynamic-source
ownership, import64, and Caller23 remain unchanged.


Observation batch 15
--------------------

The accepted Source4 R observations add 24 source-bound path assessments. The
derived owner total is 273. No tag creates an exclusion.

The 16 direct-eval subjects test eval-created variable environments, binding
conflicts, or lexical separation. They retain only the existing bounded ADR
0016 authorization. Eight object-literal tests use eval as fixture
construction. Their getter, setter, descriptor, and duplicate-property subjects
remain in-claim under dynamic-source-coverage-remediation.

Source and observation digests bind every assessment to the pinned source and
fresh canonical record. Integrated formal review remains pending.


Annex B mixed-coverage closures
-------------------------------

Under item 3 of the 2026-10-28 maintainer decision, a mixed Annex B path closes
under ADR 0013 only when reviewed replacement observations cover every core
subject and a fresh-digest record names them. Five paths meet that condition,
and their assessments change to `disposition: exclusion` with
`normativeDependency: annex-b-only`:

 -  `annex-b-typed-array-prototype`:
    *TypedArrayConstructors/ctors/no-species.js*;
 -  `annex-b-resizable-typed-array-prototype`:
    *TypedArray/prototype/resizable-and-fixed-have-same-prototype.js*;
 -  `annex-b-out-of-bounds-prototype-setup`:
    *TypedArray/out-of-bounds-behaves-like-detached.js*;
 -  `annex-b-pattern`: *String/prototype/split/separator-regexp.js*;
 -  `annex-b-ordinary-object-prototype`:
    *test/language/types/object/S8.6.2\_A8.js*.

The fourth path keeps the named backreference rejection; the other four keep
the `Object.prototype.__proto__` rejection above.

Each assessment binds *../../tests/native/fixtures/annex-b-mixed-core.ts* and
*../../tests/annex-b-mixed-core-native.test.ts*. Those files check each core
subject's value and type in the program. They prove the comparator rejects
near-miss values through an independent count, and they run natively under both
specialization policies with forced collection.

The ledger moves the five paths to `adr:0013-m5-edition-and-manifest`. The
earlier print-based replacement fixtures above stay but no longer close these
paths. The three remediation nodes own no path, and the paragraphs above that
keep remediation for these paths describe the earlier state. The class
declaration legacy accessor lookups and every other Annex B observer keep their
owners.

The per-path assertion tables are in
[*typed-array-proto-coverage-remediation.md*](../m5c-graph/typed-array-proto-coverage-remediation.md),
[*regexp-split-coverage-remediation.md*](../m5c-graph/regexp-split-coverage-remediation.md),
and
[*ordinary-object-proto-coverage-remediation.md*](../m5c-graph/ordinary-object-proto-coverage-remediation.md).

The fifth fixture in those files, `annex-b-core-ordinary-object-set-prototype`,
covers every core subject of *S8.6.2\_A8.js*. The 2026-10-31 maintainer
decision applies item 3's rule to this path and extends it to no other. The
`annex-b-ordinary-object-prototype` assessment therefore closes it as an ADR
0013 exclusion with `disposition: exclusion`,
`normativeDependency: annex-b-only`, and the `adr:0013-m5-edition-and-manifest`
ledger owner. ADR 0013 itself is unchanged.


Former ADR 0013 exclusions after ADR 0032
-----------------------------------------

[ADR 0032](../adr/0032-post-m5-edition-boundary.md) withdrew ADR 0013's Annex B
authorization, so the 11 paths that the sections above close as ADR 0013
exclusions became remediation rows. Nine of them keep the
`adr:0013-m5-edition-and-manifest` proposed owner, digests, reasons, and
replacement evidence. Each of their seven assessments changes only to
`disposition: remediation` with a `remediationOwner` naming the
[*PLAN-LANGUAGE.md*](../../PLAN-LANGUAGE.md) unit that implemented its Annex B
behavior:

 -  `unit:annexb-syntax`: *String/prototype/split/separator-regexp.js*;
 -  `unit:annexb-object-accessors`: the three TypedArray paths,
    *S8.6.2\_A8.js*, and the four class element
    *private-getter-is-not-a-own-property.js* and
    *private-setter-is-not-a-own-property.js* paths.

All nine now pass. The closure ledger gives them the `observation` owner,
which the check requires of a closed audit path, and their audit rows and
assessments stay unchanged as the record of the remediation.

*S7.8.5\_A1.4\_T2.js* and *S7.8.5\_A2.4\_T2.js* were remediation rows of
`unit:annexb-dynamic-source-accounting` and are now ADR 0016 exclusions. Their
originals accept a `SyntaxError` only for an `ID_Continue` code unit, and
Annex B's identity escape admits all 65,521 units each selects, so that
fallback is never reached. The exhaustive literal property compiles and runs
every literal natively, and only `eval` of the literal text remains. The
`ds17-exhaustive-escaped-annex-b` assessment is therefore an exclusion with
`normativeDependency: source-evaluation-only`, no `remediationOwner`, and the
same replacement evidence. Both audit rows and ledger entries name
`adr:0016-dynamic-source-boundary`.

The check rejects any ADR 0013 exclusion. It accepts a `unit:` remediation
owner only on an ADR 0013 row, and the closure ledger checks that the unit
exists. An ADR 0013 row cannot stand over an `eval` rejection. The legacy
lookup closure selector stays exact, but now requires a bound `annex-b-only`
row with a `unit:` owner instead of an exclusion. The paragraphs above that
call these paths ADR 0013 exclusions describe the M5 state, which the M5 exit
report records.

The check reads upstream sources under *test/annexB/* as well as
*test/built-ins/* and *test/language/*, still rejecting `..` segments and files
other than `.js`. *test/annexB/built-ins/RegExp/RegExp-leading-escape-BMP.js*
and *RegExp-trailing-escape-BMP.js* build the same escaped literals as
*S7.8.5\_A1.4\_T2.js* and *S7.8.5\_A2.4\_T2.js* but have no `SyntaxError`
fallback. Each is an ADR 0016 exclusion under `annexb-escaped-literal-eval`,
which binds the exhaustive literal property as replacement evidence, so only
the `eval` call remains.


Annex B dynamic-source rows
---------------------------

The 475 rows that `annexb-dynamic-source-accounting` admits are ADR 0016
exclusions: 469 under *test/annexB/language/eval-code/* report the run-time
`OSEO1001` rejection of `eval`, and the six
_test/annexB/built-ins/Function/createdynfn-\*.js_ rows report the `OSEO1001`
rejection of the `Function` constructor. Each row records
`priorCohort: source-subject` and an assessment with `disposition: exclusion`
and `normativeDependency: source-evaluation-only`.

| Assessment                                      | Rows | Non-source subject                                       |
| ----------------------------------------------- | ---: | -------------------------------------------------------- |
| `annexb-eval-func-block-functions`              |  136 | B.3.2.1 block-level functions in function code           |
| `annexb-eval-func-parameter-no-skip`            |    8 | A block-level function named like a parameter            |
| `annexb-eval-global-block-functions`            |  256 | B.3.2.2 block-level functions at global level            |
| `annexb-eval-global-init-configurable`          |   16 | The initial global binding and its attributes            |
| `annexb-eval-global-existing-property`          |   48 | A block-level function over an existing global property  |
| `annexb-eval-global-nostrict-visibility`        |    3 | The name of a Block or CaseClause function after the run |
| `annexb-eval-global-lexical-no-collision`       |    1 | A later Script's `let` over a configurable function      |
| `annexb-eval-catch-parameter-var-redeclaration` |    1 | B.3.4 `var` redeclaration of a catch parameter           |
| `annexb-function-constructor-html-comments`     |    6 | B.1.1 HTML-like comments                                 |

The eval assessments read B.3.2.3 and the B.3.4 change to
EvalDeclarationInstantiation as eval var instantiation, which
`ec-static-eval-code` leaves under ADR 0016. That reading carries four
assertions no static code can reach: parameter names being ignored,
`configurable: true` on a new global binding, a binding with no `VarNames`
entry, and var-scoped function declarations over a catch parameter.

Replacement evidence binds the `annexb-function-declarations` and
`annexb-syntax` family records, fixtures, and tests by digest. The passing
test262 analog rows are upstream files the digests cannot bind, so each reason
names them by path pattern.
*eval-code/direct/func-\<template\>-eval-func-\<case\>.js* maps to
*function-code/\<template\>-func-\<case\>.js*, and the global rows of both
*direct/* and *indirect/* map to *global-code/* the same way.
