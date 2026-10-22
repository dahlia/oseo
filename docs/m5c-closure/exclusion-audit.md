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
paths or semantic evidence. Its runner uses an explicit observe-only set
containing just `dynamic-import`, without adding it to the checked-in supported
feature list. Cases whose only unadmitted features are in that set reach
observation; any other unadmitted feature still blocks them. Their
classifications follow the actual observation, including pass for a feature tag
unused by the source. The full manifest update re-observes already-reviewed
paths. The fixed inventory has 630 paths with `dynamic-import` in frontmatter
`features`, of which 629 were unreviewed at cohort verification. The batches
observe their current behavior rather than infer it from this feature: another
earlier rejection, a parse negative, or a feature that the source does not use
must retain its actual observation.

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
    `disposition: exclusion` and `normativeDependency: source-evaluation-only`;
    only then use that ADR ledger owner.
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
The checker rejects a debt flag that disagrees with the reviewed dependencies;
debt neither authorizes exclusion nor changes the observed classification.

The separate `dynamic-import-staged-plan` node plans ADR 0016 alternative 3 for
build-time-resolvable imports. Until a maintainer accepts a later decision, it
supplies no admission or changed exclusion authority.


Incidental Annex B TypedArray prototype lookup
----------------------------------------------

The classification node owns exactly
*test/built-ins/TypedArrayConstructors/ctors/no-species.js*. Its final
prototype assertion reads the excluded Annex B accessor; the required
TypedArray clone behavior does not depend normatively on that accessor.
The exact owned rejection is:

~~~~ text
error[OSEO1001]: The Object.prototype.__proto__ accessor is excluded by Annex B.
~~~~

A different diagnostic code, accessor name, or message is outside this
bounded addition. Ordinary properties named `__proto__`, null prototype
objects, and proxy traps are not Annex B accessors.

The mixed assessment names
`remediationOwner: node:typed-array-proto-coverage-remediation` and keeps
`disposition: remediation` with `normativeDependency: not-demonstrated`.
ADR 0013 authorizes the accessor rejection, not exclusion of the whole path.
The RegExp split assessment separately names its existing remediation owner.
The checker accepts only these bounded Annex B owners and requires each
ledger owner to have a reviewed assessment.

The new assessment binds the replacement source digest in
`replacementEvidence`. The `typed-array-buffer-without-species-core` fixture
in *../../tests/native/fixtures/typed-array-constructors.ts* preserves the
original subclass, throwing constructor and species getter, TypedArray clone,
and fresh-buffer prototype and constructor assertions. It observes the
prototype through `Object.getPrototypeOf` instead of the excluded accessor
and retains the original upstream path unchanged. Existing constructor
properties supply generated constructor, clone, and buffer coverage.
Replacement evidence supports the core contract; assigning an exclusion still
requires the remediation node's maintainer accounting decision.


Dynamic import attributes and JSON identity
-------------------------------------------

The separately approved reservation in
*../m5c-graph/import-attributes-dynamic-coverage.md* contains exactly 64
pinned paths whose actual observation rejects `ImportExpression` before
option evaluation, enumeration, abrupt completion, promises, or JSON
identity assertions execute. The
`import-attributes-dynamic-coverage-remediation` node first held them as
remediation; Git history keeps that assessment. The reservation never widened
the original 178-path `dynamic-source-coverage-remediation` cohort. Observation
batches 11, 12, 13, and 05 later added 19, 23, 30, and 5 paths to that owner,
whose current contract is 255 paths.

The maintainer accounting decision of 2026-10-22 accounts for the 64 paths
under ADR 0016 instead. Their ledger owner is
`adr:0016-dynamic-source-boundary`. Each row keeps its original normative
subject, source digest, and observation digest, and uses one of three
assessments with `disposition: exclusion` and
`normativeDependency: source-evaluation-only`:

 -  `import-call-attributes` covers the 60 ImportCall subjects with a
    string-literal specifier: grammar parameter forwarding, options
    evaluation and abrupt completions, the `with` lookup and enumeration,
    rejection of invalid options, promise settlement, and trailing-comma
    calls.
 -  `import-call-attributes-computed-specifier` covers
    *2nd-param-evaluation-sequence.js*, *2nd-param-trailing-comma-reject.js*,
    and *trailing-comma-reject.js*, whose specifiers are computed at run
    time. They stay outside even the build-time literal subset of
    *../dynamic-import-staged-plan.md*.
 -  `json-module-dynamic-site-identity` covers *json-idempotency.js*. Its
    static default imports and indirect static import do not depend on
    dynamic import. The assessment binds the static JSON identity fixtures
    and properties as `replacementEvidence` and excludes only the `import()`
    site.

The audit requires that bounded exclusion for every unsupported reserved
path, with the upstream `import-attributes` feature and the exact accepted
`ImportExpression` rejection. It rejects a reserved row with any other
disposition, owner, or diagnostic, and it rejects any row or ledger entry
that still names `node:import-attributes-dynamic-coverage-remediation`. A
reserved path that later passes or becomes an expected negative takes the
observation owner and keeps its historical row. The check validates any
assessment's `replacementEvidence` digests, not only the TypedArray owner's.

The exclusion reopens when an accepted ADR 0016 amendment admits any form of
dynamic import, including the literal subset; a still unsupported path then
needs a fresh assessment against the amended record. The decision approves
no dynamic import implementation and no change to the staged proposal.


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

The checker accepts either one only at the end of the process stderr, only
when the reviewed source contains a call of the named method in call syntax
(a direct, optional, or string-literal computed member call, as for `eval`),
and only with
`remediationOwner: node:class-private-accessor-lookup-coverage-remediation`,
`disposition: remediation`, and the ADR 0013 proposed owner. That owner
accepts no other rejection. A different code, method name, wording, or stdout
text is outside the surface. The `__proto__` and RegExp split pairs are
unchanged.

Observation batch 11 observed both paths at `e6db3a1c` with exactly these
rejections and records them under the `annex-b-legacy-lookup` assessment, with
`priorCohort: annex-b` and the remediation owner above. Their private getter
and setter assertions are not excluded, and replacement evidence and the
maintainer accounting decision belong to the coverage remediation node.


Legacy function caller reads
----------------------------

[ADR 0028](../adr/0028-legacy-function-caller-boundary.md) authorizes an M5
exclusion of the optional expectation that reading a non-strict ordinary
function's `caller` completes normally, for exactly the 23 paths in its
Exact selector section. Those are all the paths at the pinned revision with
the `caller` frontmatter feature. The checker parses that list from the
accepted record and pins its digest, so adding, removing, or renaming a path
needs a new reviewed scope decision as well as a tool change.

The accepted rejection is the existing frontmatter check, recorded as
`unsupported-profile-feature` with exactly this observation detail:

~~~~ text
Not executed: the frontmatter needs an unsupported feature.
~~~~

`caller` must be the only entry in `unsupportedFeatures`, the case must list
`caller` in `features` and `noStrict` in `flags`, and the reviewed source must
read a `caller` member in member syntax (`g.caller`,
`arguments.callee.caller`, or a static computed or optional form). Another
unsupported feature, an include or capability rejection, a compile or run-time
diagnostic, or text that only mentions `caller` is outside the surface.

Each selector path records `priorCohort: legacy-caller`,
`proposedOwner: adr:0028-legacy-function-caller-boundary`, and the
`legacy-caller` assessment with `disposition: exclusion` and
`normativeDependency: legacy-caller-only`. The selector is exact in both
directions: no other path can use that owner, cohort, or dependency, and no
selector path can name ADR 0016 or ADR 0013. The record has no remediation
disposition. Once a selector path is reviewed it must keep an audit row,
even if its ledger owner changes, and a promotion to pass or expected
negative uses the observation owner.

The five paths that also call `eval` or a source-compiling `Function` form
carry the `dynamic-source` dependency tag. ADR 0016 remains in force for
those calls but owns none of these paths, and its audit surface is unchanged.
Their `missingDynamicTag` is false, because the dynamic-source tag debt
applies only to ADR 0016 rows. The %Function.prototype% accessors, the
clause 17.1 restrictions, and the absence of an own `caller` property on
arguments objects stay inside the claim with their own evidence or
remediation owners.
