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
