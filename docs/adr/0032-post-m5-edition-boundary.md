ADR 0032: Post-M5 edition and optional-section boundary
=======================================================

Status
------

Accepted by the maintainer on 2026-11-03 and applied by the `claim-boundary`
unit of [*PLAN-LANGUAGE.md*](../../PLAN-LANGUAGE.md). The checked-in
inventory follows this record and has 43,007 included paths. The rule of
[ADR 0013](./0013-m5-edition-and-manifest.md) and
[ADR 0020](./0020-m5-applicable-test-inventory.md) stays frozen in
*tests/test262/inventory-policy-m5.yaml*; the inventory tool classifies every
candidate under both rules and lists the added paths in
*tests/test262/inventory-m5-additions.txt*, so the 41,091-path M5 inventory
and the closed M5 records stay checkable.

Following Closure accounting, the 11 Annex B rows that ADR 0013 owned are
remediation rows owned by the *PLAN-LANGUAGE.md* units that implement their
behavior, and the language claim audit rejects any ADR 0013 exclusion.

Amendment proposed 2026-11-03, pending maintainer acceptance: replace the
Consequences sentences about the runner gate with this rule. The 1,916 new
paths enter the inventory as unreviewed closure-ledger rows, each owned by its
*PLAN-LANGUAGE.md* unit, and stay out of the reviewed subset and the manifest
until that unit admits them with reviewed dependency tags. No row runs before
its unit admits it, so no runner gate records unadmitted Annex B rows. The
checked-in application follows this proposed rule; if the maintainer rejects
it, the runner gate that Consequences describes replaces it.

This record supersedes ADR 0013's candidate-edition and
optional-section sections and replaces ADR 0020's edition map and Annex B path
rules. ADR 0013's manifest schema, classification values, and dependency-tag
vocabulary rule stay in force. So do ADR 0020's inventory artifact, its
separation from the result manifest, and its rejection rules.


Context
-------

M5 closed against the ECMA-262 16th edition, ECMAScript 2025. The
[*M5 exit report*](../m5c-closure/m5-exit-report.md) records 34,778 passes,
4,401 expected negatives, and 1,912 owned unsupported results in the fixed
41,091-path inventory at test262 revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`.

ADR 0013 kept the claim at the 16th edition because its feature
classifications were made against that clause set. That reason no longer
holds once every one of those paths is reviewed. ADR 0013 also excluded
Annex B because ECMA-262 requires it only of web browsers.

On 2026-11-02 the maintainer approved implementing the seven ECMAScript 2026
features, three ECMAScript 2027 features other than Temporal, and Annex B
except `document.all`. Their test262 paths lie outside the current inventory.
The rows cannot enter the reviewed subset, so the implementations would have no
standards evidence and the coverage report would not show them.

Server code reaches Annex B more often than ADR 0013 assumed. Packages call
`substr`, read and write `__proto__`, and use legacy RegExp escapes. Node.js
24.21.0 and Deno 2.9.7 both expose `escape`, `substr`, `getYear`,
`RegExp.prototype.compile`, and `__defineGetter__`, and both parse
HTML-like comments in Script code. `[[IsHTMLDDA]]` is different. It exists so a
browser's `document.all` can act like `undefined`, and test262 reaches it only
through the host-created `$262.IsHTMLDDA` object. A server runtime has no
object that needs it.


Required contract
-----------------

The post-M5 track needs:

 -  one published edition plus an exact, named list of later features inside
    the claim, with an authoritative source for each;
 -  an explicit Annex B scope, including what stays out;
 -  a deterministic inventory rule that a regeneration check can enforce;
 -  the M5 result kept as a record of the 16th-edition measurement;
 -  the ADR 0019 closure rules applied to the new paths without silent
    exclusions; and
 -  an unchanged test262 revision, so the 41,091 existing rows keep their
    reviewed observations.


Alternatives considered
-----------------------

### Edition

1.  **Stay at the 16th edition and treat the new features as extensions.**
    Rejected. The paths would stay outside the inventory, so the work would
    have no denominator and no reviewed rows.
2.  **Adopt the 17th edition only.** Rejected. The maintainer scheduled
    explicit resource management, joint iteration, and `Atomics.pause` now.
    TC39 has finished them for ECMAScript 2027, and the pinned test262
    revision already carries their tests.
3.  **Adopt the ECMAScript 2027 draft as a whole.** Rejected. It includes
    Temporal, 4,611 paths with their own data and host questions, and it is
    not a published edition.
4.  **Adopt the 17th edition plus three named ECMAScript 2027 features.**
    Selected.

### Annex B

1.  **Keep Annex B excluded.** Rejected by the maintainer decision and by the
    package and reference-host evidence above.
2.  **Include all of Annex B.** Rejected. `[[IsHTMLDDA]]` needs a host object
    that behaves like `undefined` under `typeof`, ToBoolean, and loose
    equality. That would add a special case to every one of those operations
    for an object no Oseo host creates.
3.  **Include Annex B except `[[IsHTMLDDA]]`.** Selected.

### Test262 revision

Re-pinning test262 in the same change was rejected. It would re-review every
added, removed, and changed path among the 41,091, which is unrelated to moving
the boundary. A later re-pin remains a separate reviewed change under ADR 0013.

### Postponement

Postponing was rejected. Without this record no post-M5 language unit can admit
a standards row.


Probe evidence
--------------

The ECMAScript 2026 and 2027 counts come from the checked-in
*tests/test262/inventory.tsv* at the pinned revision. A path counts as entering
only when its sole exclusion reason is one of the features this record admits.
Two `uint8array-base64` paths also carry `proposal:immutable-arraybuffer` and
stay excluded. Ten Temporal paths also carry `proposal:Intl.Era-monthcode`.

The *test/annexB/* counts come from a frontmatter scan of the pinned `test262`
package. No Annex B file carries a post-2025 feature flag. The scan treated a
file as dynamic source when its body names `eval` or calls a `Function`
constructor. That is a planning estimate; the reviewed observations decide each
row.

The reference-host claims come from presence checks under the pinned Node.js
and Deno versions. They are not conformance results.


Observed results
----------------

| Inventory input                                          | Paths |
| -------------------------------------------------------- | ----: |
| ECMAScript 2026 feature paths entering                   |   310 |
| ECMAScript 2027 named-feature paths entering             |   511 |
| Normative-optional paths under *test/built-ins/*         |    70 |
| *test/annexB/* files                                     | 1,086 |
| *test/annexB/* files needing IsHTMLDDA                   |    35 |
| *test/annexB/* files with `legacy-regexp`                |    26 |
| *test/annexB/* files entering                            | 1,025 |
| Entering *test/annexB/* files using `eval` or `Function` |   477 |

The ECMAScript 2026 paths are `Array.fromAsync` 95, `upsert` 72,
`uint8array-base64` 68, `iterator-sequencing` 32, `json-parse-with-source` 21,
`Error.isError` 12, and `Math.sumPrecise` 10. The ECMAScript 2027 paths are
`explicit-resource-management` 424, `joint-iteration` 82, and `Atomics.pause` 5.

The expected inventory after this record:

| Count           | ADR 0020 | This record |
| --------------- | -------: | ----------: |
| Candidate files |   47,381 |      48,467 |
| Included        |   41,091 |      43,007 |
| Excluded        |    6,290 |       5,460 |

The 5,460 exclusions are 4,611 Temporal paths, 788 paths whose only reasons are
proposals, 35 IsHTMLDDA paths, and 26 `legacy-regexp` paths.


Decision
--------

### Edition

The claim is the ECMA-262 17th edition, ECMAScript 2026, plus three features
finished for ECMAScript 2027: explicit resource management, joint iteration,
and `Atomics.pause`. The authoritative source for the edition is the `es2026`
tag of tc39/ecma262. For the three features, it is the ecma262 draft at the
first commit that contains all three merged. The applying change records both
commits in the inventory policy.

The test262 revision stays `f2d1435644797268dca1f7988cad5a4e89ccd8d2`. The
TC39 finished-proposals revision stays
`1eb7ced36bcb794e75af0b0a24c8199fba6bc6f3`. ADR 0020 already uses it, and it
assigns 2026 or 2027 to every feature flag named here.

### Optional sections and adjacent specifications

 -  Annex B is inside the claim, except `[[IsHTMLDDA]]` and every test whose
    frontmatter lists `IsHTMLDDA`.
 -  The main-body clauses the edition marks normative optional are inside the
    claim: `Object.prototype.__proto__`, the four legacy accessor methods, and
    `WeakRef.prototype.constructor`.
 -  Annex B's alternative host-hook behavior for web browsers is not adopted.
    Oseo keeps the default behavior of those hooks, which the edition permits
    for a host that is not a browser.
 -  ECMA-402 and *test/intl402/* stay outside.
    [*PLAN-INTL.md*](../../PLAN-INTL.md) owns that track.
 -  Temporal stays outside. [*PLAN-TEMPORAL.md*](../../PLAN-TEMPORAL.md)
    owns it, and a later record moves it inside.
 -  Proposal-stage features stay outside.
 -  `eval`, the `Function` constructor family, and dynamic import stay inside
    the claim. [ADR 0016](./0016-dynamic-source-boundary.md) still decides
    their support, and Annex B paths that need them become ADR 0016 results.
 -  *staging/* and *sm/* never enter the inventory.
 -  Realms, agents, shared memory, and host hooks keep ADR 0013's treatment.

### Inventory rule

These steps replace ADR 0020's classifier steps:

1.  Enumerate sorted non-fixture *.js* paths under *test/annexB/*,
    *test/built-ins/*, and *test/language/*.
2.  Exclude a path whose features include `IsHTMLDDA`. Record
    `optional-section:annex-b-ishtmldda`.
3.  Exclude a path whose features include a proposal from the pinned
    *features.txt*. Record `proposal:<feature>` for each.
4.  Exclude a path whose features include a post-edition feature that this
    record does not name. Record `edition-<year>:<feature>`. At the pinned
    revision this rule matches only `Temporal`.
5.  Include a path whose remaining post-edition features are all named in this
    record. Record `edition-2027:<feature>` for each.
6.  Include every *test/annexB/* path left after steps 2 through 5 and record
    `edition-2026:annex-b`. Include the reviewed normative-optional paths and
    prefixes under *test/built-ins/* with `edition-2026:normative-optional`.
7.  Include every other path. A tagged path records `edition-2026`; a path
    with no feature flag records `edition-2026:unflagged-core`.
8.  Reject an unknown feature flag, malformed frontmatter, a duplicate path, a
    policy mismatch, or a reviewed subset path outside the boundary.

The ECMAScript 2026 entries leave the post-edition map. The map keeps the four
2027 features and gains a list of the three this record names. The inventory
header records edition 17 and edition year 2026. The format version increases
if the basis vocabulary needs a parser change.

`included` still means only that a path is in the denominator.

### M5 record

The M5 exit report stays the record of the 16th-edition measurement, and
41,091 stays the M5 denominator. The applying change freezes the report's
generated coverage section at its text in the commit where M5 closed. It
replaces `check:m5-exit-audit` with an equivalent audit over the expanded
inventory. M5's inputs remain reproducible from that commit.

### Closure accounting

The ADR 0019 completion rules apply to the expanded inventory. Semantic,
harness, and infrastructure failures stay at zero. An unsupported row needs an
accepted record that authorizes and bounds its exclusion, or a remediation
owner while work is open.

ADR 0013 no longer authorizes Annex B exclusions. Its 11 owned rows move to
remediation owners in the applying change. The ADR 0031 deferral list keeps its
entries and gains none, because ADR 0031 lets only M5c graph nodes add one. A
new path that the track cannot close stays with remediation, and the track
stays open until the path closes or an accepted record bounds it.

The conformance label stays the separate gate of ADR 0019 and remains unused
while ADR 0016 keeps dynamic source outside the profile.


Consequences
------------

The denominator grows by 1,916 paths. Feature-tagged rows enter through the
existing frontmatter rejection. Most *test/annexB/* rows carry no flag, so the
applying change adds a reviewed runner gate that records each unadmitted
Annex B row as unsupported with a named capability instead of executing it.
Each implementing unit in *PLAN-LANGUAGE.md* removes its part of that gate.

About 477 new rows become ADR 0016 results through reviewed exclusion audit
rows, so the post-M5 report's ADR 0016 count grows by roughly that much beyond
the 1,804 M5 exclusions. The M5 count does not change.

Applying this record changes ADR 0013's and ADR 0020's status lines. The
exclusion audit binds ADR 0013 by digest, so that change re-reviews the audit
rows that cite it. New dependency tags still amend ADR 0013's vocabulary.

*ROADMAP.md*, the language profile, and the coverage report name the 17th
edition and the three ECMAScript 2027 features after acceptance. The coverage
report keeps the M5 and post-M5 denominators separate.

Gate cost grows with the manifest. [*PLAN-GATE.md*](../../PLAN-GATE.md) owns
any change to partitioning or sharding that the larger corpus needs.


Failure modes and replacement triggers
--------------------------------------

 -  Publication of ECMAScript 2027 replaces the edition section. The three
    named features then become ordinary edition features, and Temporal needs
    its own decision.
 -  A change to one of the three named features before publication re-reviews
    its rows and its source commit.
 -  A *test/annexB/* or core path that needs `[[IsHTMLDDA]]` without the
    `IsHTMLDDA` flag reopens step 2.
 -  A proposal flag that moves to the standard section of a later
    *features.txt* is handled by the re-pin that brings it.
 -  If the post-M5 track is abandoned before Annex B lands, this record is
    superseded and the Annex B exclusion returns with recorded owners.
 -  Re-pinning test262 re-reviews every affected path under ADR 0013's
    revision rule.


Links
-----

 -  [ADR 0013](./0013-m5-edition-and-manifest.md) defines the manifest schema
    and vocabulary that remain, and the edition and optional-section policy
    this record supersedes.
 -  [ADR 0016](./0016-dynamic-source-boundary.md) keeps dynamic source outside
    the profile.
 -  [ADR 0019](./0019-m5-claim-closure.md) defines the closure rules and the
    label gate.
 -  [ADR 0020](./0020-m5-applicable-test-inventory.md) defines the inventory
    artifact whose rule this record replaces.
 -  [ADR 0028](./0028-legacy-function-caller-boundary.md) is superseded
    separately by the `legacy-caller` unit.
 -  [ADR 0031](./0031-m5-named-deferral.md) keeps the M5 deferral list.
 -  [*PLAN-LANGUAGE.md*](../../PLAN-LANGUAGE.md) schedules the implementation.
 -  [*PLAN-TEMPORAL.md*](../../PLAN-TEMPORAL.md) and
    [*PLAN-INTL.md*](../../PLAN-INTL.md) own the tracks that stay outside.
 -  [*M5 exit report*](../m5c-closure/m5-exit-report.md) records the M5 result.
