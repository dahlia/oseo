import assert from "node:assert/strict";
import test from "node:test";

import {
  checkNativeHostGuardSource,
  formatNativeHostGuardProblems,
} from "../tools/check-native-host-guards.ts";

const imports = `
import test from "node:test";
import { withNativeFixture } from "../../packages/testkit/src/index.ts";
`;

test("accepts a guarded native property test", () => {
  const source = `${imports}
const nativeTarget = targetForExecutionHost(executionHost);
test(
  "guarded native property",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await withNativeFixture({});
  },
);
`;
  assert.deepEqual(
    checkNativeHostGuardSource(
      "tests/property/guarded.property.test.ts",
      source,
    ),
    [],
  );
});

test("reports an unguarded native property test by file and name", () => {
  const source = `${imports}
async function runNativeCase() {
  await withNativeFixture({});
}
test("unguarded native property", async () => {
  await runNativeCase();
});
`;
  const problems = checkNativeHostGuardSource(
    "tests/property/unguarded.property.test.ts",
    source,
  );
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.testName, "unguarded native property");
  const report = formatNativeHostGuardProblems(problems);
  assert.match(report, /unguarded\.property\.test\.ts:8/u);
  assert.match(report, /test "unguarded native property"/u);
  assert.match(report, /Add this test option/u);
  assert.match(report, /requires a supported native host/u);
});

test("rejects a strict null guard that never fires", () => {
  // targetForExecutionHost returns undefined, so this skip stays false on an
  // unsupported host and native execution still runs there.
  const source = `${imports}
const nativeTarget = targetForExecutionHost(executionHost);
test(
  "strictly compared native property",
  { skip: nativeTarget === null ? "requires a supported native host" : false },
  async () => {
    await withNativeFixture({});
  },
);
`;
  assert.equal(
    checkNativeHostGuardSource("tests/property/strict.property.test.ts", source)
      .length,
    1,
  );
});

test("accepts a strict undefined guard", () => {
  const source = `${imports}
const nativeTarget = targetForExecutionHost(executionHost);
test(
  "strictly undefined native property",
  {
    skip:
      nativeTarget === undefined ? "requires a supported native host" : false,
  },
  async () => {
    await withNativeFixture({});
  },
);
`;
  assert.deepEqual(
    checkNativeHostGuardSource(
      "tests/property/undefined.property.test.ts",
      source,
    ),
    [],
  );
});

test("rejects a guard on an identifier that is not the native target", () => {
  // Same shape, but the compared name never holds the selected target, so the
  // skip stays false and the callback reaches native execution anyway.
  const source = `${imports}
const nativeTarget = targetForExecutionHost(executionHost);
const otherTarget = "always defined";
test(
  "misdirected native property",
  { skip: otherTarget == null ? "requires a supported native host" : false },
  async () => {
    await withNativeFixture({});
  },
);
`;
  assert.equal(
    checkNativeHostGuardSource(
      "tests/property/misdirected.property.test.ts",
      source,
    ).length,
    1,
  );
});
