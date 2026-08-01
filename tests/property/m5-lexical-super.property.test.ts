/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
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

interface LexicalSuperCase {
  readonly computed: boolean;
  readonly depth: number;
  readonly value: number;
}

const caseArbitrary: fc.Arbitrary<LexicalSuperCase> = fc.record({
  computed: fc.boolean(),
  depth: fc.integer({ max: 3, min: 1 }),
  value: fc.integer({ max: 20, min: -20 }),
});

interface OptionalSuperCase {
  readonly computed: boolean;
  readonly depth: number;
  readonly present: boolean;
  readonly value: number;
}

const optionalCaseArbitrary: fc.Arbitrary<OptionalSuperCase> = fc.record({
  computed: fc.boolean(),
  depth: fc.integer({ max: 3, min: 1 }),
  present: fc.boolean(),
  value: fc.integer({ max: 20, min: -20 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/** Wrap one expression in a bounded chain of lexical arrows. */
function arrows(expression: string, depth: number): string {
  let result = expression;
  for (let index = 0; index < depth; index += 1) {
    result = `() => (${result})`;
  }
  return result;
}

/** Invoke every arrow in one generated lexical chain. */
function invoke(expression: string, depth: number): string {
  return `(${expression})${"()".repeat(depth)}`;
}

function printCase(testCase: LexicalSuperCase): string {
  const key = testCase.computed ? '["value"]' : ".value";
  const read = invoke(arrows(`super${key}()`, testCase.depth), testCase.depth);
  const staticRead = invoke(
    arrows(`super${key}()`, testCase.depth),
    testCase.depth,
  );
  const construct = invoke(
    arrows("super(value)", testCase.depth),
    testCase.depth,
  );
  const target = arrows("new.target", testCase.depth);
  const targetRead = invoke("instance.target", testCase.depth);
  return `
class Base {
  constructor(value) {
    this.stored = value;
  }
  value() {
    return this.stored;
  }
  static value() {
    return ${testCase.value + 1};
  }
}
class Derived extends Base {
  constructor(value) {
    ${construct};
    this.target = ${target};
  }
  value() {
    return ${read};
  }
  static value() {
    return ${staticRead};
  }
  async twice() {
    const before = ${read};
    const after = await Promise.resolve(${read});
    return before + after;
  }
}
const instance = new Derived(${testCase.value});
console.log(
  instance.stored,
  instance.value(),
  Derived.value(),
  ${targetRead} === Derived,
);
instance.twice().then((value) => console.log("async", value));
`;
}

function expected(testCase: LexicalSuperCase): string {
  return (
    `${testCase.value} ${testCase.value} ${testCase.value + 1} true\n` +
    `async ${testCase.value * 2}\n`
  );
}

function printOptionalCase(testCase: OptionalSuperCase): string {
  const name = testCase.present ? "method" : "missing";
  const key = testCase.computed ? `[key("${name}")]` : `.${name}`;
  const call = invoke(
    arrows(`super${key}?.(argument())`, testCase.depth),
    testCase.depth,
  );
  return `
let argumentCalls = 0;
let keyCalls = 0;
function argument() {
  argumentCalls += 1;
  return 1;
}
function key(name) {
  keyCalls += 1;
  return name;
}
class Base {
  method(value) {
    return this.value + value;
  }
}
class Derived extends Base {
  constructor(value) {
    super();
    this.value = value;
  }
  optional() {
    return ${call};
  }
  async optionalAsync() {
    await Promise.resolve(0);
    return ${call};
  }
}
const instance = new Derived(${testCase.value});
console.log(instance.optional());
instance.optionalAsync().then((value) => {
  console.log("async", value, keyCalls, argumentCalls);
});
`;
}

function optionalExpected(testCase: OptionalSuperCase): string {
  const value = testCase.present ? String(testCase.value + 1) : "undefined";
  const argumentCalls = testCase.present ? 2 : 0;
  const keyCalls = testCase.computed ? 2 : 0;
  return `${value}\nasync ${value} ${keyCalls} ${argumentCalls}\n`;
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
    "oseo-lexical-super-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(sourcePath, source);
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
  sourceId: string,
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
      { source, sourceId },
      { specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    if (specialization === "enabled") {
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    }
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
        (native) => assertMatchingObservations([expectedObservation, native]),
      );
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }
}

test(
  "generated arrows preserve lexical super and new.target",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "arrow chains preserve lexical class execution context",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        await assertGeneratedCase(
          source,
          "generated-m5-lexical-super.ts",
          expected(testCase),
        );
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
          "one to three nested arrows capturing a derived constructor's " +
          "super call and new.target plus instance, static, and asynchronous " +
          "class method super property reads through literal or computed " +
          "keys, compared with an independent bounded-integer model under " +
          "Node.js, Deno, and both native specialization policies with " +
          "forced collection on the enabled path",
        numRuns: 12,
        profile:
          "M5 lexical super calls, super properties, and new.target in arrows",
        seed: 0x5eed_001d,
        sizeLimit:
          "one class pair, one to three nested arrows, and one bounded integer",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

test(
  "generated arrows preserve optional calls through super properties",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "optional super calls preserve lexical lookup and receiver context",
      fc.asyncProperty(optionalCaseArbitrary, async (testCase) => {
        const source = printOptionalCase(testCase);
        await assertGeneratedCase(
          source,
          "generated-m5-optional-super.ts",
          optionalExpected(testCase),
        );
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
          "one to three nested arrows making a present or absent optional " +
          "super property call through a literal or side-effecting computed " +
          "key in " +
          "synchronous and asynchronous methods, compared with an " +
          "independent bounded-integer and argument-count model under " +
          "Node.js, Deno, and both native specialization policies with " +
          "forced collection on the enabled path",
        numRuns: 12,
        profile: "M5 optional calls through lexical super properties",
        seed: 0x5eed_0027,
        sizeLimit:
          "one class pair, one to three nested arrows, two calls, one key " +
          "mode, one property-presence mode, and one bounded integer",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
