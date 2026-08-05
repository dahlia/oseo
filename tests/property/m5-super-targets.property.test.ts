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

/** Where the `super` target is written inside the class body. */
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
 * Which admitted target position the `super` reference stands in. Every
 * form holds the evaluated reference until PutValue stores through it;
 * the loop heads re-evaluate it once per iteration.
 */
type TargetForm =
  | "array-element"
  | "array-rest"
  | "element-default"
  | "for-await-head"
  | "for-await-pattern-head"
  | "for-of-head"
  | "for-of-pattern-head"
  | "nested-array"
  | "object-property"
  | "object-rest";

/**
 * How the reference spells its key. `effect` and `abrupt` observe that
 * the key expression runs while the reference is evaluated, and
 * `poisoned` observes that the produced key object reaches ToPropertyKey
 * exactly once. Where that conversion falls relative to the stored value
 * is pinned by the frontend structural tests and the fixed native
 * fixture, which tag the value's own acquisition.
 */
type KeyForm = "abrupt" | "effect" | "poisoned" | "pure" | "static";

/** What the parent object holds under the stored name. */
type SinkForm = "absent" | "data" | "setter";

interface SuperTargetCase {
  readonly element: ElementForm;
  readonly key: KeyForm;
  readonly sink: SinkForm;
  readonly target: TargetForm;
}

/** Target positions every element form can carry. */
const synchronousTargets = [
  "array-element" as const,
  "array-rest" as const,
  "element-default" as const,
  "for-of-head" as const,
  "for-of-pattern-head" as const,
  "nested-array" as const,
  "object-property" as const,
  "object-rest" as const,
];

const elements = [
  "arrow" as const,
  "async-method" as const,
  "constructor-after-super" as const,
  "constructor-before-super" as const,
  "field" as const,
  "generator" as const,
  "getter" as const,
  "method" as const,
  "static-block" as const,
  "static-method" as const,
];

const keys = [
  "abrupt" as const,
  "effect" as const,
  "poisoned" as const,
  "pure" as const,
  "static" as const,
];

const sinks = ["absent" as const, "data" as const, "setter" as const];

/**
 * The lowered store either position emits: the ordinary `super` property
 * set, whose fourth argument is the receiver the reference carried.
 */
const superStorePattern = new RegExp(
  "property-set (?:destructuring member|for-of property) target " +
    String.raw`%\d+, %\d+, %\d+, %\d+`,
  "u",
);

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const caseArbitrary: fc.Arbitrary<SuperTargetCase> = fc.oneof(
  fc.record({
    element: fc.constantFrom(...elements),
    key: fc.constantFrom(...keys),
    sink: fc.constantFrom(...sinks),
    target: fc.constantFrom(...synchronousTargets),
  }),
  // `for await` needs an asynchronous element, so the head is drawn only
  // where the grammar admits it.
  fc.record({
    element: fc.constant("async-method" as const),
    key: fc.constantFrom(...keys),
    sink: fc.constantFrom(...sinks),
    target: fc.constantFrom(
      "for-await-head" as const,
      "for-await-pattern-head" as const,
    ),
  }),
);

/** The value each target position stores, as the program prints it. */
function storedText(testCase: SuperTargetCase): string {
  return testCase.target === "object-rest" ? "[object Object]" : "7";
}

/**
 * The independent oracle: the single line each generated program prints,
 * as the tag log and the observed outcome. A target before `super()`
 * reads the receiver first, so it reports the uninitialized `this`
 * binding and its key expression never runs. Otherwise the key
 * expression runs while the reference is evaluated, ToPropertyKey runs
 * only after the value exists, a parent setter runs against the derived
 * receiver, and any other target defines an own property of that
 * receiver while the parent keeps whatever it had.
 */
function model(testCase: SuperTargetCase): string {
  if (testCase.element === "constructor-before-super") {
    return "|ReferenceError\n";
  }
  const tags: string[] = [];
  if (testCase.key === "effect") tags.push("key");
  if (testCase.key === "abrupt") return "abrupt |TypeError\n";
  if (testCase.key === "poisoned") tags.push("toString");
  const stored = storedText(testCase);
  if (testCase.sink === "setter") tags.push(`set:${stored}`);
  const own = testCase.sink === "setter" ? "none" : `own:${stored}`;
  const parent = testCase.sink === "absent" ? "absent" : "kept";
  const order = tags.length === 0 ? "" : `${tags.join(" ")} `;
  return `${order}|${own}/${parent}\n`;
}

function operand(testCase: SuperTargetCase): string {
  if (testCase.key === "static") return "super.sink";
  if (testCase.key === "pure") return 'super["sink"]';
  if (testCase.key === "effect") return 'super[key("sink")]';
  return testCase.key === "abrupt" ? "super[abrupt()]" : "super[poisoned()]";
}

/**
 * The statement each target position contributes. The map is keyed by
 * every `TargetForm`, so adding a position to the generated domain
 * without printing it is a type error rather than a silent fallthrough.
 */
function statement(testCase: SuperTargetCase): string {
  const target = operand(testCase);
  const statements: Record<TargetForm, string> = {
    "array-element": `[${target}] = [7];`,
    "array-rest": `[...${target}] = [7];`,
    "element-default": `[${target} = 7] = [];`,
    "for-await-head": `for await (${target} of [7]) {}`,
    "for-await-pattern-head": `for await ([${target}] of [[7]]) {}`,
    "for-of-head": `for (${target} of [7]) {}`,
    "for-of-pattern-head": `for ([${target}] of [[7]]) {}`,
    "nested-array": `[[${target}]] = [[7]];`,
    "object-property": `({ p: ${target} } = { p: 7 });`,
    "object-rest": `({ ...${target} } = { r: 7 });`,
  };
  return statements[testCase.target];
}

function body(testCase: SuperTargetCase, parent: string): string {
  return `
    try {
      ${statement(testCase)}
      report(probe(this, ${parent}));
    } catch (error) {
      report(error.constructor.name);
    }`;
}

/**
 * The class member each element form contributes and the expression that
 * runs it. A static element's home object is the constructor, so its
 * probe compares against the parent constructor rather than the parent
 * prototype.
 */
function element(testCase: SuperTargetCase): {
  readonly member: string;
  readonly trigger: string;
} {
  const instance = body(testCase, "Base.prototype");
  const statics = body(testCase, "Base");
  const members: Record<
    ElementForm,
    { readonly member: string; readonly trigger: string }
  > = {
    arrow: {
      member:
        `run() {\n    const reach = () => {${instance}\n    };\n` +
        `    reach();\n  }`,
      trigger: "new Probe().run()",
    },
    "async-method": {
      member: `async run() {${instance}\n  }`,
      trigger: "new Probe().run()",
    },
    "constructor-after-super": {
      member: `constructor() {\n    super();${instance}\n  }`,
      trigger: "new Probe()",
    },
    "constructor-before-super": {
      member: `constructor() {${instance}\n    super();\n  }`,
      trigger: "new Probe()",
    },
    field: {
      member: `probe = (() => {${instance}\n  })();`,
      trigger: "new Probe()",
    },
    generator: {
      member: `*run() {${instance}\n    yield 1;\n  }`,
      trigger: "new Probe().run().next()",
    },
    getter: {
      member: `get run() {${instance}\n  }`,
      trigger: "new Probe().run",
    },
    method: {
      member: `run() {${instance}\n  }`,
      trigger: "new Probe().run()",
    },
    "static-block": { member: `static {${statics}\n  }`, trigger: '""' },
    "static-method": {
      member: `static run() {${statics}\n  }`,
      trigger: "Probe.run()",
    },
  };
  return members[testCase.element];
}

/** The parent definitions the drawn sink installs on both home objects. */
function sinkDefinitions(testCase: SuperTargetCase): string {
  if (testCase.sink === "setter") {
    return `
Object.defineProperty(Base.prototype, "sink", {
  configurable: true,
  set(value) {
    tag("set:" + value);
  },
});
Object.defineProperty(Base, "sink", {
  configurable: true,
  set(value) {
    tag("set:" + value);
  },
});`;
  }
  if (testCase.sink === "data") {
    return '\nBase.prototype.sink = "base-data";\nBase.sink = "base-data";';
  }
  return "";
}

function printCase(testCase: SuperTargetCase): string {
  const { member, trigger } = element(testCase);
  return `
let order = "";
function tag(text) {
  order = order + text + " ";
}
function key(name) {
  tag("key");
  return name;
}
function abrupt() {
  tag("abrupt");
  throw new TypeError("key failed");
}
function poisoned() {
  return {
    toString() {
      tag("toString");
      return "sink";
    },
  };
}
class Base {}${sinkDefinitions(testCase)}
function probe(receiver, parent) {
  const own = Object.getOwnPropertyDescriptor(receiver, "sink");
  const kept = Object.getOwnPropertyDescriptor(parent, "sink");
  return (
    (own === undefined ? "none" : "own:" + own.value) +
    "/" +
    (kept === undefined ? "absent" : "kept")
  );
}
function report(value) {
  console.log(order + "|" + value);
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
    "oseo-super-targets-property-",
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

test("the super-target model keeps every observable step ordered", () => {
  assert.equal(
    model({
      element: "method",
      key: "static",
      sink: "setter",
      target: "array-element",
    }),
    "set:7 |none/kept\n",
  );
  assert.equal(
    model({
      element: "getter",
      key: "effect",
      sink: "absent",
      target: "for-of-head",
    }),
    "key |own:7/absent\n",
  );
  assert.equal(
    model({
      element: "field",
      key: "poisoned",
      sink: "data",
      target: "object-rest",
    }),
    "toString |own:[object Object]/kept\n",
  );
  assert.equal(
    model({
      element: "generator",
      key: "abrupt",
      sink: "data",
      target: "array-rest",
    }),
    "abrupt |TypeError\n",
  );
  assert.equal(
    model({
      element: "constructor-before-super",
      key: "effect",
      sink: "setter",
      target: "array-element",
    }),
    "|ReferenceError\n",
  );
});

test(
  "generated super property targets match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "a super target stores through the receiver its reference carries",
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
            { source, sourceId: "generated-m5-super-targets.js" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          // The store reuses the ordinary `super` property set: a lookup
          // that starts at the home object's prototype and a fourth
          // receiver argument, with no RequireObjectCoercible on a base
          // no expression produced.
          assert.match(mir, /super-base home object prototype/u);
          assert.match(mir, superStorePattern);
          assert.doesNotMatch(
            mir,
            /RequireObjectCoercible for assignment target/u,
          );
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
          "a super property target written in an array element, object " +
          "property, nested array, element default, array rest, object " +
          "rest, for-of head, for-of head pattern, for-await-of head, and " +
          "for-await-of head pattern, " +
          "inside an instance method, static method, getter, arrow, " +
          "derived constructor before and after super(), field " +
          "initializer, static block, generator, and asynchronous method, " +
          "over static, pure computed, side-effecting, abrupt, and " +
          "poisoned-conversion keys naming a parent setter, a parent data " +
          "property, or an absent property",
        numRuns: 16,
        profile: "M5 super property assignment targets",
        seed: 0x6000_2a00,
        sizeLimit: "one observed super target per generated program",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);
