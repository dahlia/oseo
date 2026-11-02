import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  compoundReferenceBaseCases,
  compoundReferenceBaseFixture,
  compoundReferenceBaseMutations,
  compoundReferenceBaseProgram,
} from "./native/fixtures/compound-reference-base.ts";

const suite = dirname(
  fileURLToPath(import.meta.resolve("test262/package.json")),
);

test("the witness rows are the selector's compound assignment paths", () => {
  const selector = "dynamic-source-fixture-construction-evidence.paths.txt";
  const selected = readFileSync(
    new URL(`../docs/m5c-graph/${selector}`, import.meta.url),
    "utf8",
  )
    .trim()
    .split("\n")
    .filter((path) => path.includes("/compound-assignment/"));
  assert.equal(selected.length, 11);
  assert.deepEqual(
    compoundReferenceBaseCases.map((entry) => entry.path).toSorted(),
    selected,
  );
});

for (const entry of compoundReferenceBaseCases) {
  test(`witness values match the pinned source: ${entry.path}`, () => {
    const source = readFileSync(join(suite, entry.path), "utf8");
    const body = source.slice(source.indexOf("---*/"));
    assert.match(source, /^flags: \[noStrict\]$/mu);
    // The original body differs from the witness only at the marked site.
    const original = `
function testCompoundAssignment() {
  var x = ${entry.initial};
  var innerX = (function() {
    x ${entry.operator} (eval("var x = 2;"), ${entry.operand});
    return x;
  })();

  if (innerX !== 2) {
    throw new Test262Error('#1: innerX === 2. Actual: ' + (innerX));
  }
  if (x !== ${entry.expected}) {
    throw new Test262Error('#2: x === ${entry.expected}. Actual: ' + (x));
  }
}
testCompoundAssignment();
`;
    assert.equal(body, `---*/\n${original}`);
  });

  test(`each mutation changes the witness once: ${entry.path}`, () => {
    const program = compoundReferenceBaseProgram(entry);
    for (const mutation of compoundReferenceBaseMutations(entry)) {
      assert.equal(program.split(mutation.from).length, 2, mutation.from);
    }
  });
}

test("the witness constructs no source", () => {
  assert.doesNotMatch(
    compoundReferenceBaseFixture.source,
    /\beval\s*\(|\bFunction\s*\(/u,
  );
});
