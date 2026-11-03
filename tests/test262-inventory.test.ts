import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyInventoryEntry,
  includedInM5Inventory,
  m5IncludedPaths,
  m5InventoryAdditionsPath,
  parseFeatureRegistry,
  parseInventoryPolicy,
  parseM5InventoryPolicy,
  parseTest262Features,
  serializeInventory,
  serializeM5InventoryAdditions,
} from "../tools/test262-inventory.ts";

const policyText = `
formatVersion: 1
edition: 17
editionYear: 2026
suiteRevision: test-revision
candidateRoots: [test/annexB, test/built-ins, test/language]
annexBRoot: test/annexB
excludedOptionalFeatures:
  IsHTMLDDA: annex-b-ishtmldda
normativeOptionalPathPrefixes:
  - test/built-ins/Object/prototype/__proto__/
normativeOptionalPaths:
  - test/built-ins/WeakRef/prototype/constructor.js
sources:
  edition: https://github.com/tc39/ecma262/tree/test-edition
  claimedPostEditionFeatures: https://github.com/tc39/ecma262/tree/test-draft
  featureRegistry: https://github.com/tc39/test262/blob/test/features.txt
  finishedProposals: https://github.com/tc39/proposals/blob/test/finished-proposals.md
postEditionFeatures:
  Temporal: 2027
  explicit-resource-management: 2027
claimedPostEditionFeatures:
  - explicit-resource-management
`;
const policy = parseInventoryPolicy(policyText);

const m5Policy = parseM5InventoryPolicy(`
formatVersion: 1
edition: 16
editionYear: 2025
suiteRevision: test-revision
candidateRoots: [test/built-ins, test/language]
annexBPathPrefixes:
  - test/built-ins/Object/prototype/__proto__/
annexBPaths:
  - test/built-ins/WeakRef/prototype/constructor.js
sources:
  edition: https://github.com/tc39/ecma262/tree/test-edition
  featureRegistry: https://github.com/tc39/test262/blob/test/features.txt
  finishedProposals: https://github.com/tc39/proposals/blob/test/finished-proposals.md
postEditionFeatures:
  Error.isError: 2026
  Temporal: 2027
  explicit-resource-management: 2027
`);

const registry = parseFeatureRegistry(`
## Proposed language features
# Proposed tests carry dedicated flags.
decorators

## Standard language features
class
Error.isError
explicit-resource-management
Temporal
WeakRef
__proto__

## Test-Harness Features
host-gc-required
IsHTMLDDA
`);

test("excludes proposed and post-edition features", () => {
  assert.deepEqual(
    classifyInventoryEntry(
      "test/language/example.js",
      ["Temporal", "decorators"],
      registry,
      policy,
    ),
    {
      basis: "edition-2027:Temporal,proposal:decorators",
      boundary: "excluded",
      path: "test/language/example.js",
    },
  );
});

test("includes normative-optional paths and core Annex B dependencies", () => {
  assert.deepEqual(
    classifyInventoryEntry(
      "test/built-ins/Object/prototype/__proto__/prop-desc.js",
      ["__proto__"],
      registry,
      policy,
    ),
    {
      basis: "edition-2026:normative-optional",
      boundary: "included",
      path: "test/built-ins/Object/prototype/__proto__/prop-desc.js",
    },
  );
  assert.deepEqual(
    classifyInventoryEntry(
      "test/built-ins/WeakRef/prototype/constructor.js",
      ["WeakRef"],
      registry,
      policy,
    ),
    {
      basis: "edition-2026:normative-optional",
      boundary: "included",
      path: "test/built-ins/WeakRef/prototype/constructor.js",
    },
  );
  assert.deepEqual(
    classifyInventoryEntry(
      "test/language/core-depending-on-annex-b.js",
      ["__proto__"],
      registry,
      policy,
    ),
    {
      basis: "edition-2026",
      boundary: "included",
      path: "test/language/core-depending-on-annex-b.js",
    },
  );
});

test("treats registered and featureless core cases as edition members", () => {
  assert.deepEqual(
    classifyInventoryEntry(
      "test/language/tagged.js",
      ["class"],
      registry,
      policy,
    ),
    {
      basis: "edition-2026",
      boundary: "included",
      path: "test/language/tagged.js",
    },
  );
  assert.deepEqual(
    classifyInventoryEntry("test/language/untagged.js", [], registry, policy),
    {
      basis: "edition-2026:unflagged-core",
      boundary: "included",
      path: "test/language/untagged.js",
    },
  );
});

test("includes Annex B except IsHTMLDDA and claimed later features", () => {
  const classify = (path: string, features: readonly string[]) =>
    classifyInventoryEntry(path, features, registry, policy);
  assert.deepEqual(classify("test/annexB/language/comments/a.js", []), {
    basis: "edition-2026:annex-b",
    boundary: "included",
    path: "test/annexB/language/comments/a.js",
  });
  assert.deepEqual(classify("test/annexB/built-ins/dda.js", ["IsHTMLDDA"]), {
    basis: "optional-section:annex-b-ishtmldda",
    boundary: "excluded",
    path: "test/annexB/built-ins/dda.js",
  });
  assert.deepEqual(
    classify("test/annexB/built-ins/proposal.js", ["decorators"]),
    {
      basis: "proposal:decorators",
      boundary: "excluded",
      path: "test/annexB/built-ins/proposal.js",
    },
  );
  assert.deepEqual(
    classify("test/language/using.js", [
      "class",
      "explicit-resource-management",
    ]),
    {
      basis: "edition-2027:explicit-resource-management",
      boundary: "included",
      path: "test/language/using.js",
    },
  );
  assert.deepEqual(
    classify("test/language/mixed.js", [
      "Temporal",
      "explicit-resource-management",
    ]),
    {
      basis: "edition-2027:Temporal",
      boundary: "excluded",
      path: "test/language/mixed.js",
    },
  );
  assert.deepEqual(
    classify("test/built-ins/Error/isError.js", ["Error.isError"]),
    {
      basis: "edition-2026",
      boundary: "included",
      path: "test/built-ins/Error/isError.js",
    },
  );
});

test("rejects a policy that claims an unknown or misplaced section", () => {
  assert.throws(
    () =>
      parseInventoryPolicy(
        policyText.replace(
          "  - explicit-resource-management\n",
          "  - joint-iteration\n",
        ),
      ),
    /claimed feature joint-iteration has no post-edition year/u,
  );
  assert.throws(
    () =>
      parseInventoryPolicy(
        policyText.replace("annexBRoot: test/annexB", "annexBRoot: test/other"),
      ),
    /Annex B root test\/other must be a candidate/u,
  );
  assert.throws(
    () =>
      parseInventoryPolicy(
        policyText.replace(
          "  - test/built-ins/Object/prototype/__proto__/",
          "  - test/annexB/built-ins/",
        ),
      ),
    /must be a main-body candidate subdirectory/u,
  );
  assert.throws(
    () =>
      parseInventoryPolicy(
        policyText.replace(
          "IsHTMLDDA: annex-b-ishtmldda",
          "IsHTMLDDA: Bad Label",
        ),
      ),
    /label Bad Label is malformed/u,
  );
});

test("the frozen M5 rule excludes every ADR 0032 addition", () => {
  const inM5 = (path: string, features: readonly string[]) =>
    includedInM5Inventory(path, features, registry, m5Policy);
  assert.equal(inM5("test/language/core.js", ["class"]), true);
  assert.equal(inM5("test/annexB/language/comments/a.js", []), false);
  assert.equal(
    inM5("test/built-ins/WeakRef/prototype/constructor.js", []),
    false,
  );
  assert.equal(
    inM5("test/built-ins/Error/isError.js", ["Error.isError"]),
    false,
  );
  assert.equal(inM5("test/language/p.js", ["decorators"]), false);
  const additions = serializeM5InventoryAdditions(
    ["test/annexB/a.js"],
    "test-revision",
  );
  assert.match(
    additions,
    /^# Generated by `mise run test262:inventory:update`/u,
  );
  assert.deepEqual(
    m5IncludedPaths(["test/annexB/a.js", "test/language/core.js"], additions),
    ["test/language/core.js"],
  );
  assert.throws(
    () => m5IncludedPaths(["test/language/core.js"], additions),
    /addition test\/annexB\/a\.js is not included/u,
  );
});

function readCheckedIn(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the checked-in M5 view is the pre-ADR 0032 inventory", () => {
  const included = readCheckedIn("tests/test262/inventory.tsv")
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((columns) => columns[1] === "included")
    .map((columns) => columns[0] ?? "");
  const m5 = m5IncludedPaths(included, readCheckedIn(m5InventoryAdditionsPath));
  assert.equal(included.length, 43_007);
  assert.equal(m5.length, 41_091);
  // SHA-256 of the 41,091 included paths of the inventory that M5 closed
  // against, in file order and joined by line feeds.
  assert.equal(
    createHash("sha256").update(m5.join("\n")).digest("hex"),
    "ff3f7921df919d950cb28e8755d0f3cfb0b5b2feb8c0453b0462afc39e9a09d4",
  );
});

test("parses bare carriage returns in upstream frontmatter", () => {
  assert.deepEqual(
    parseTest262Features(
      "/*---\rfeatures: [class]\r---*/\r0;\r",
      "test/language/cr.js",
    ),
    ["class"],
  );
});

test("serializes one compact row per candidate path", () => {
  const serialized = serializeInventory(
    [
      {
        basis: "edition-2027:Temporal",
        boundary: "excluded",
        path: "test/built-ins/Temporal/example.js",
      },
      {
        basis: "edition-2026:unflagged-core",
        boundary: "included",
        path: "test/language/example.js",
      },
    ],
    policy,
  );
  assert.match(serialized, /# candidates: 2\n/u);
  assert.match(serialized, /# included: 1\n/u);
  assert.match(serialized, /# excluded: 1\n/u);
  assert.match(serialized, /# featureless-included: 1\n/u);
  assert.equal(serialized.split("\n").length, 12);
});
