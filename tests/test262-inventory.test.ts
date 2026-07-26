import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyInventoryEntry,
  parseFeatureRegistry,
  parseInventoryPolicy,
  parseTest262Features,
  serializeInventory,
} from "../tools/test262-inventory.ts";

const policy = parseInventoryPolicy(`
formatVersion: 1
edition: 16
editionYear: 2025
suiteRevision: test-revision
candidateRoots: [test/built-ins, test/language]
sources:
  edition: https://github.com/tc39/ecma262/tree/test-edition
  featureRegistry: https://github.com/tc39/test262/blob/test/features.txt
  finishedProposals: https://github.com/tc39/proposals/blob/test/finished-proposals.md
postEditionFeatures:
  Temporal: 2027
`);

const registry = parseFeatureRegistry(`
## Proposed language features
# Proposed tests carry dedicated flags.
decorators

## Standard language features
class
Temporal

## Test-Harness Features
host-gc-required
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

test("treats registered and featureless core cases as edition members", () => {
  assert.deepEqual(
    classifyInventoryEntry(
      "test/language/tagged.js",
      ["class"],
      registry,
      policy,
    ),
    {
      basis: "edition-2025",
      boundary: "included",
      path: "test/language/tagged.js",
    },
  );
  assert.deepEqual(
    classifyInventoryEntry("test/language/untagged.js", [], registry, policy),
    {
      basis: "edition-2025:unflagged-core",
      boundary: "included",
      path: "test/language/untagged.js",
    },
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
        basis: "edition-2025:unflagged-core",
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
