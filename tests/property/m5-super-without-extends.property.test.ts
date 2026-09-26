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
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

interface NumericDelta {
  readonly kind: "number";
  readonly value: number;
}

interface StringDelta {
  readonly kind: "string";
  readonly value: string;
}

/** Construction fixes the delta kind for the printer and independent oracle. */
type Delta = NumericDelta | StringDelta;

interface SuperWithoutExtendsCase {
  readonly computed: boolean;
  readonly delta: Delta;
  readonly hinted: boolean;
  readonly methodKind: "async" | "async-generator" | "generator" | "ordinary";
  readonly owner: "class" | "object";
  readonly replacement: number;
  readonly strict: boolean;
  readonly value: number;
}

const caseArbitrary: fc.Arbitrary<SuperWithoutExtendsCase> = fc.record({
  computed: fc.boolean(),
  delta: fc.oneof(
    fc.integer({ max: 20, min: -20 }).map((value) => ({
      kind: "number" as const,
      value,
    })),
    fc.integer({ max: 20, min: -20 }).map((value) => ({
      kind: "string" as const,
      value: String(value),
    })),
  ),
  hinted: fc.boolean(),
  methodKind: fc.constantFrom(
    "async",
    "async-generator",
    "generator",
    "ordinary",
  ),
  owner: fc.constantFrom("class", "object"),
  replacement: fc.integer({ max: 20, min: -20 }),
  strict: fc.boolean(),
  value: fc.integer({ max: 20, min: -20 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function valueSource(delta: Delta): string {
  return delta.kind === "string"
    ? JSON.stringify(delta.value)
    : String(delta.value);
}

function printCase(testCase: SuperWithoutExtendsCase): string {
  const key = testCase.computed ? '["m5GeneratedSuper"]' : ".m5GeneratedSuper";
  const parameter = testCase.hinted ? "delta: number" : "delta";
  const prefix =
    testCase.methodKind === "async"
      ? "async "
      : testCase.methodKind === "generator"
        ? "*"
        : testCase.methodKind === "async-generator"
          ? "async *"
          : "";
  const suspend =
    testCase.methodKind === "async" || testCase.methodKind === "async-generator"
      ? "await 0; "
      : "";
  const completion =
    testCase.methodKind === "generator" ||
    testCase.methodKind === "async-generator"
      ? "yield"
      : "return";
  const directive = testCase.strict ? '"use strict"; ' : "";
  const separator = testCase.owner === "object" ? "," : "";
  const methods = `
  ${prefix}receiverRead() {
    ${directive}${suspend}${completion} (() => super.m5GeneratedReceiver)();
  }${separator}
  ${prefix}warm() {
    ${suspend}${completion} super.m5GeneratedSuper;
  }${separator}
  ${prefix}read(${parameter}) {
    ${suspend}${completion} super${key} + delta;
  }${separator}
`;
  function observe(call: string): string {
    if (testCase.methodKind === "async") return `await ${call}`;
    if (testCase.methodKind === "generator") return `${call}.next().value`;
    if (testCase.methodKind === "async-generator") {
      return `(await ${call}.next()).value`;
    }
    return call;
  }
  const warm = observe("receiver.warm()");
  const nullReceiver = observe("receiver.receiverRead.call(null)");
  const undefinedReceiver = observe("receiver.receiverRead.call(undefined)");
  const borrowed =
    testCase.owner === "object" && !testCase.strict
      ? "{ valueOf() { return 3; } }"
      : "3";
  const primitiveReceiver = observe(`receiver.receiverRead.call(${borrowed})`);
  const read = observe(`receiver.read(${valueSource(testCase.delta)})`);
  const declaration =
    testCase.owner === "class"
      ? `class Holder {${methods}}
const receiver = new Holder();
const home = Holder.prototype;`
      : `const receiver = {${methods}};
const home = receiver;`;
  return `
async function observeHomes() {
Object.defineProperty(Object.prototype, "m5GeneratedReceiver", {
  configurable: true,
  get() { "use strict"; return this; },
});
Object.prototype.m5GeneratedSuper = ${testCase.value};
${declaration}
console.log(${warm}, ${read});
console.log(${nullReceiver} === globalThis,
  ${undefinedReceiver} === globalThis, typeof (${primitiveReceiver}),
  (${primitiveReceiver}).valueOf());
Object.setPrototypeOf(home, {
  m5GeneratedSuper: ${testCase.replacement},
});
console.log(${warm}, ${read});
}
observeHomes();
`;
}

function add(left: number, right: Delta): number | string {
  return right.kind === "string"
    ? String(left) + right.value
    : left + right.value;
}

function expected(testCase: SuperWithoutExtendsCase): string {
  return (
    `${testCase.value} ${add(testCase.value, testCase.delta)}\n` +
    (testCase.owner === "object" && !testCase.strict
      ? "true true object 3\n"
      : "false false number 3\n") +
    `${testCase.replacement} ${add(testCase.replacement, testCase.delta)}\n`
  );
}

async function references(source: string): Promise<
  readonly [
    {
      readonly exitStatus: number;
      readonly stderr: string;
      readonly stdout: string;
    },
    {
      readonly exitStatus: number;
      readonly stderr: string;
      readonly stdout: string;
    },
  ]
> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-super-without-extends-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    // The printer emits exactly one optional erasable parameter annotation.
    // Evaluate the remaining Script identically under both reference hosts.
    const script = source.replaceAll("delta: number", "delta");
    await host.writeTextFile(
      sourcePath,
      `new Function(${JSON.stringify(script)})();\n`,
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

async function assertGeneratedCase(
  source: string,
  stdout: string,
): Promise<void> {
  const expectedObservation = { exitStatus: 0, stderr: "", stdout };
  assertMatchingObservations([
    expectedObservation,
    ...(await references(source)),
  ]);
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "generated-m5-super-without-extends.ts" },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const mir = printMir(compiled.mir);
    if (specialization === "enabled") {
      assert.match(mir, /guard-object/u);
      assert.match(mir, /guard-shape/u);
      assert.match(mir, /property-get generic/u);
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    } else {
      assert.doesNotMatch(mir, /guard-(?:object|shape)/u);
    }
    try {
      await withNativeFixture(
        {
          backend: cBackend,
          host,
          input: compiled.mir,
          operation: "execute",
          runtime: cRuntimeProvider,
          target: nativeTarget!,
          toolchain: nativeToolchain,
        },
        (native) => {
          assertMatchingObservations([expectedObservation, native]);
          assert.ok(native.counters != null);
          if (specialization === "enabled") {
            assert.ok(native.counters.guardMisses > 0);
            assert.ok(native.counters.collections > 0);
          }
        },
      );
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }
}

test(
  "generated extends-free super properties match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "extends-free home objects reach their current prototype",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        await assertGeneratedCase(printCase(testCase), expected(testCase));
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
          "an extends-free class or object-literal ordinary, async, " +
          "generator, or async-generator method reading a literal " +
          "or computed Object.prototype property before and after a home-" +
          "object prototype replacement, with absent, truthful, and false " +
          "numeric hints, compared with an independent addition model under " +
          "Node.js, Deno, both native specialization policies, deliberate " +
          "shape-guard misses, generic fallback, forced collection, and " +
          "borrowed nullish and object receivers, plus strict primitive " +
          "receivers",
        numRuns: 12,
        profile: "M5 super properties without class heritage",
        seed: 0x6000_8100,
        sizeLimit:
          "one home object, two reads before and after one prototype " +
          "replacement, and bounded integer or string operands",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
