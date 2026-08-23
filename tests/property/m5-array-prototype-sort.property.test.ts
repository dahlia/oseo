/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  printMir,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import { zigToolchain } from "../../packages/toolchain-zig/src/index.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type ComparatorKind =
  | "ascending"
  | "coerced"
  | "constant"
  | "default"
  | "descending"
  | "nan";
type EntryKind = number | "hole" | "undefined";
type ReceiverKind = "array" | "object";
type SortMethod = "sort" | "toSorted";

interface SortCase {
  readonly comparator: ComparatorKind;
  readonly entries: readonly EntryKind[];
  readonly method: SortMethod;
  readonly receiver: ReceiverKind;
}

/** The widest index the reviewed observation prints for any generated case. */
const observedIndexLimit = 7;

const caseArbitrary: fc.Arbitrary<SortCase> = fc.record({
  comparator: fc.constantFrom<ComparatorKind>(
    "ascending",
    "coerced",
    "constant",
    "default",
    "descending",
    "nan",
  ),
  entries: fc.array(
    fc.oneof(
      fc.integer({ max: 3, min: 0 }),
      fc.constant<EntryKind>("hole"),
      fc.constant<EntryKind>("undefined"),
    ),
    { maxLength: 6 },
  ),
  method: fc.constantFrom<SortMethod>("sort", "toSorted"),
  receiver: fc.constantFrom<ReceiverKind>("array", "object"),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const comparatorSources = {
  ascending: "(left, right) => left.key - right.key",
  coerced: "(left, right) => String(left.key - right.key)",
  constant: "() => 0",
  default: undefined,
  descending: "(left, right) => right.key - left.key",
  nan: "() => NaN",
} satisfies Readonly<Record<ComparatorKind, string | undefined>>;

function printCase(testCase: SortCase): string {
  const subject = testCase.receiver === "array" ? "[]" : "{}";
  const assignments = testCase.entries
    .map((entry, index) => {
      if (entry === "hole") return "";
      if (entry === "undefined") return `subject[${index}] = undefined;`;
      return `subject[${index}] = element(${entry}, ${index});`;
    })
    .filter((line) => line !== "")
    .join("\n");
  const comparator = comparatorSources[testCase.comparator];
  const invocation = `Array.prototype.${testCase.method}.call(
  subject,${comparator == null ? "" : `\n  ${comparator},`}
)`;
  return `
function element(key, tag) {
  return { key: key, tag: tag, toString() { return String(key); } };
}
const subject = ${subject};
subject.length = ${testCase.entries.length};
${assignments}
Object.defineProperty(subject, "constructor", {
  get() { console.log("constructor"); return Array; },
});
const result = ${invocation};
console.log("same", result === subject);
console.log("array", Array.isArray(result));
console.log("length", result.length);
for (let index = 0; index < ${observedIndexLimit}; index = index + 1) {
  const present = Object.prototype.hasOwnProperty.call(result, index);
  const value = present ? result[index] : undefined;
  console.log(
    "entry",
    index,
    present,
    value === undefined ? "undefined" : String(value.tag),
  );
}
/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
let turn = 0;
while (turn < 3) {
  console.log("guard", hinted("guard"));
  if (turn === 1) String.prototype.arraySortingPropertyMarker = 1;
  turn = turn + 1;
}
const originalIs = Object.is;
turn = 0;
while (turn < 3) {
  console.log("shape", Object.is === originalIs);
  if (turn === 1) Object.arraySortingPropertyMarker = 1;
  turn = turn + 1;
}
`;
}

interface SortedElement {
  readonly key: number;
  readonly tag: number;
}

function compareElements(
  comparator: ComparatorKind,
  left: SortedElement,
  right: SortedElement,
): number {
  switch (comparator) {
    case "ascending":
      return left.key - right.key;
    case "coerced":
      return Number(String(left.key - right.key));
    case "constant":
    case "nan":
      return 0;
    case "default": {
      const leftText = String(left.key);
      const rightText = String(right.key);
      if (leftText < rightText) return -1;
      return leftText > rightText ? 1 : 0;
    }
    case "descending":
      return right.key - left.key;
  }
}

/** CompareArrayElements over the model's element representation. */
function compareOrder(
  comparator: ComparatorKind,
  left: SortedElement | undefined,
  right: SortedElement | undefined,
): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return compareElements(comparator, left, right);
}

/**
 * The independent model of SortIndexedProperties: `sort` skips holes and
 * `toSorted` reads through them, undefined elements sort after every
 * defined one without reaching the comparator, and equal elements keep
 * their collected order.
 *
 * The ordering is a stable insertion sort written out here rather than a
 * host sort call, so the oracle never delegates the ordering or stability
 * contract to an implementation of the method under test.
 */
function sortedItems(
  testCase: SortCase,
): readonly (SortedElement | undefined)[] {
  const items: (SortedElement | undefined)[] = [];
  for (const [index, entry] of testCase.entries.entries()) {
    if (entry === "hole") {
      if (testCase.method === "sort") continue;
      items.push(undefined);
      continue;
    }
    items.push(entry === "undefined" ? undefined : { key: entry, tag: index });
  }
  const ordered: (SortedElement | undefined)[] = [];
  for (const item of items) {
    let position = ordered.length;
    ordered.push(item);
    while (
      position > 0 &&
      compareOrder(testCase.comparator, ordered[position - 1], item) > 0
    ) {
      ordered[position] = ordered[position - 1];
      position -= 1;
    }
    ordered[position] = item;
  }
  return ordered;
}

function expected(testCase: SortCase): string {
  const items = sortedItems(testCase);
  const lines = [
    `same ${String(testCase.method === "sort")}`,
    `array ${String(
      testCase.method === "toSorted" || testCase.receiver === "array",
    )}`,
    `length ${testCase.entries.length}`,
  ];
  for (let index = 0; index < observedIndexLimit; index += 1) {
    const within = index < items.length;
    const item = within ? items[index] : undefined;
    lines.push(
      `entry ${index} ${String(within)} ` +
        `${item == null ? "undefined" : item.tag}`,
    );
  }
  lines.push(
    "hint h",
    "false hint m",
    "guard g",
    "guard g",
    "guard g",
    "shape true",
    "shape true",
    "shape true",
    "",
  );
  return lines.join("\n");
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory(
    "oseo-array-sort-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
    );
    const observations = [
      await host.run({
        args: [sourcePath],
        command: process.execPath,
        cwd: directory,
      }),
      await host.run({
        args: ["run", "--quiet", sourcePath],
        command: "deno",
        cwd: directory,
      }),
    ] as const;
    succeeded = true;
    return observations;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test(
  "generated Array sorting methods match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Array sorting methods agree",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-array-sorting.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-object/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /property-get generic/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:object|shape)/u);
          }
          process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
          try {
            await withNativeFixture(
              {
                backend: cBackend,
                host,
                input: compiled.mir,
                operation: "execute",
                runtime: cRuntimeProvider,
                target: nativeTarget!,
                toolchain: zigToolchain,
              },
              (native) => {
                assertMatchingObservations([expectedObservation, native]);
                assert.ok(native.counters != null);
                assert.ok(native.counters.collections > 0);
                if (specialization === "disabled") {
                  assert.equal(native.counters.guardHits, 0);
                  assert.equal(native.counters.guardMisses, 0);
                } else {
                  assert.ok(native.counters.guardHits > 0);
                  assert.ok(native.counters.guardMisses > 0);
                }
              },
            );
          } finally {
            delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          }
        }
      }),
      {
        context:
          nativeTarget == null || host.executionHost == null
            ? ["target=unsupported host=unknown"]
            : [
                `target=${nativeTarget.name}`,
                `host=${host.executionHost.operatingSystem}/` +
                  host.executionHost.architecture,
                `sanitizers=${nativeTarget.sanitizers.join(",")}`,
              ],
        domain:
          "sort and toSorted over zero to six sparse array or ordinary " +
          "array-like entries that are a duplicated sort key, an explicit " +
          "undefined, or a hole; the default comparator and five supplied " +
          "comparators covering ascending, descending, constant, NaN, and " +
          "string-coerced results; a constructor read that neither method " +
          "may perform; false hints and a deliberate shape-guard miss",
        numRuns: 10,
        profile: "M5 Array prototype sorting",
        seed: 0x6000_5100,
        sizeLimit:
          "at most six source indices, seven result observations, four " +
          "distinct sort keys, and eight hint or guard observations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
