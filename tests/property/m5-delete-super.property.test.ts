/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
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

/** Where the `delete super` operand is written inside the class body. */
type ElementForm =
  | "arrow"
  | "async-method"
  | "constructor-after-super"
  | "constructor-before-super"
  | "field"
  | "generator"
  | "getter"
  | "method"
  | "static-block"
  | "static-method";

/**
 * How the reference spells its key. `effect` and `abrupt` observe that
 * the key expression runs before the reference is rejected, and
 * `poisoned` observes that ToPropertyKey is never reached.
 */
type KeyForm = "abrupt" | "effect" | "poisoned" | "pure" | "static";

interface DeleteSuperCase {
  readonly element: ElementForm;
  readonly key: KeyForm;
  /** Name a property the parent does not own, which cannot matter. */
  readonly missing: boolean;
}

/**
 * Element forms whose key expression runs in every engine. A derived
 * constructor before `super()` is excluded: ECMA-262 reads the receiver
 * first and rejects the uninitialized `this` before the key expression,
 * while both reference hosts evaluate the key first, so only keys
 * without an observable evaluation are generated there.
 */
const observableElements = [
  "arrow" as const,
  "async-method" as const,
  "constructor-after-super" as const,
  "field" as const,
  "generator" as const,
  "getter" as const,
  "method" as const,
  "static-block" as const,
  "static-method" as const,
];

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const caseArbitrary: fc.Arbitrary<DeleteSuperCase> = fc.oneof(
  fc.record({
    element: fc.constantFrom(...observableElements),
    key: fc.constantFrom(
      "abrupt" as const,
      "effect" as const,
      "poisoned" as const,
      "pure" as const,
      "static" as const,
    ),
    missing: fc.boolean(),
  }),
  fc.record({
    element: fc.constant("constructor-before-super" as const),
    key: fc.constantFrom("pure" as const, "static" as const),
    missing: fc.boolean(),
  }),
);

/**
 * The independent oracle: the single line each generated program prints,
 * as the key-evaluation log, the reported result, and whether the parent
 * property survived. Deleting a `super` reference always throws a
 * ReferenceError after the reference has been evaluated, so only an
 * abrupt key expression reports a different error, a poisoned key is
 * never converted, and no property is ever removed.
 */
function model(testCase: DeleteSuperCase): string {
  const order =
    testCase.key === "effect"
      ? "key "
      : testCase.key === "abrupt"
        ? "abrupt "
        : "";
  const result = testCase.key === "abrupt" ? "TypeError" : "ReferenceError";
  return `${order}|${result}|true\n`;
}

function operand(testCase: DeleteSuperCase): string {
  const name = testCase.missing ? "absent" : "data";
  if (testCase.key === "static") return `super.${name}`;
  if (testCase.key === "pure") return `super[${JSON.stringify(name)}]`;
  if (testCase.key === "effect") {
    return `super[key(${JSON.stringify(name)})]`;
  }
  return testCase.key === "abrupt" ? "super[abrupt()]" : "super[poisoned()]";
}

function body(testCase: DeleteSuperCase): string {
  return `
    try {
      report(delete ${operand(testCase)});
    } catch (error) {
      report(error.constructor.name);
    }`;
}

/**
 * The class member each element form contributes and the expression that
 * runs it. The map is keyed by every `ElementForm`, so adding a form to
 * the generated domain without printing it is a type error rather than a
 * silent fallthrough to another form's source.
 */
function element(testCase: DeleteSuperCase): {
  readonly member: string;
  readonly trigger: string;
} {
  const statements = body(testCase);
  const members: Record<
    ElementForm,
    { readonly member: string; readonly trigger: string }
  > = {
    arrow: {
      member:
        `run() {\n    const reach = () => {${statements}\n    };\n` +
        `    reach();\n  }`,
      trigger: "new Probe().run()",
    },
    "async-method": {
      member: `async run() {${statements}\n  }`,
      trigger: "new Probe().run()",
    },
    "constructor-after-super": {
      member: `constructor() {\n    super();${statements}\n  }`,
      trigger: "new Probe()",
    },
    "constructor-before-super": {
      member: `constructor() {${statements}\n    super();\n  }`,
      trigger: "new Probe()",
    },
    field: {
      member: `probe = (() => {${statements}\n  })();`,
      trigger: "new Probe()",
    },
    generator: {
      member: `*run() {${statements}\n    yield 1;\n  }`,
      trigger: "new Probe().run().next()",
    },
    getter: {
      member: `get run() {${statements}\n  }`,
      trigger: "new Probe().run",
    },
    method: {
      member: `run() {${statements}\n  }`,
      trigger: "new Probe().run()",
    },
    "static-block": { member: `static {${statements}\n  }`, trigger: '""' },
    "static-method": {
      member: `static run() {${statements}\n  }`,
      trigger: "Probe.run()",
    },
  };
  return members[testCase.element];
}

function printCase(testCase: DeleteSuperCase): string {
  const { member, trigger } = element(testCase);
  return `
let order = "";
function key(name) {
  order = order + "key ";
  return name;
}
function abrupt() {
  order = order + "abrupt ";
  throw new TypeError("key failed");
}
function poisoned() {
  return {
    toString() {
      order = order + "toString ";
      return "data";
    },
  };
}
class Base {}
Base.prototype.data = "base-data";
Base.data = "base-static-data";
function report(value) {
  console.log(order + "|" + value + "|" + ("data" in Base.prototype));
}
class Probe extends Base {
  ${member}
}
${trigger};
`;
}

async function references(source: string): Promise<
  readonly {
    readonly exitStatus: number;
    readonly stderr: string;
    readonly stdout: string;
  }[]
> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-delete-super-property-",
  );
  const sourcePath = `${directory}/case.js`;
  try {
    await host.writeTextFile(sourcePath, source);
    return [
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
    ];
  } finally {
    await host.remove(directory);
  }
}

test("the delete-super model keeps the reference evaluation observable", () => {
  assert.equal(
    model({ element: "method", key: "static", missing: false }),
    "|ReferenceError|true\n",
  );
  assert.equal(
    model({ element: "getter", key: "effect", missing: true }),
    "key |ReferenceError|true\n",
  );
  assert.equal(
    model({ element: "field", key: "abrupt", missing: false }),
    "abrupt |TypeError|true\n",
  );
  assert.equal(
    model({ element: "generator", key: "poisoned", missing: false }),
    "|ReferenceError|true\n",
  );
});

test(
  "generated super property deletions match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "deleting a super reference throws after evaluating the reference",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: model(testCase),
        };
        const referenceResults = await references(source);
        assertMatchingObservations([expectedObservation, ...referenceResults]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-delete-super.js" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          // The reference is rejected before any lookup starts, so no
          // home object prototype is read and no deletion is attempted.
          assert.match(mir, /super-property-delete/u);
          assert.doesNotMatch(mir, /super-base/u);
          assert.doesNotMatch(mir, /= property-delete/u);
          process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
          try {
            await withNativeFixture(
              {
                backend: cBackend,
                host,
                input: compiled.mir,
                operation: "execute",
                runtime: cRuntimeProvider,
                target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
                toolchain: zigToolchain,
              },
              (native) => {
                assertMatchingObservations([expectedObservation, native]);
                assert.ok(native.counters != null);
                assert.ok(native.counters.collections > 0);
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
          "delete of a super property reference written in an instance " +
          "method, static method, getter, arrow, derived constructor " +
          "before and after super(), field initializer, static block, " +
          "generator, and asynchronous method, over static, pure " +
          "computed, side-effecting, abrupt, and poisoned-conversion " +
          "keys naming a present or absent parent property",
        numRuns: 16,
        profile: "M5 super property deletion",
        seed: 0x6000_0e00,
        sizeLimit: "one observed delete expression per generated program",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);
