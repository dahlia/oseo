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

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

type CallRoute = "apply" | "bind" | "call" | "proxy" | "reflect";
type ArrayMethod = "every" | "filter" | "forEach" | "map" | "some";

/** Every generated case retains all five primitive kinds while shrinking. */
interface WrapperCase {
  readonly boolean: boolean;
  readonly integer: number;
  readonly numberEdge: "integer" | "nan" | "negative-zero" | "infinity";
  readonly route: CallRoute;
  readonly strict: boolean;
  readonly units: readonly number[];
  readonly method: ArrayMethod;
}

const cases: fc.Arbitrary<WrapperCase> = fc.record({
  boolean: fc.boolean(),
  integer: fc.integer({ min: -10_000, max: 10_000 }),
  numberEdge: fc.constantFrom<WrapperCase["numberEdge"]>(
    "integer",
    "nan",
    "negative-zero",
    "infinity",
  ),
  route: fc.constantFrom<CallRoute>(
    "apply",
    "bind",
    "call",
    "proxy",
    "reflect",
  ),
  strict: fc.boolean(),
  units: fc.array(fc.integer({ min: 0, max: 0xffff }), { maxLength: 8 }),
  method: fc.constantFrom<ArrayMethod>(
    "every",
    "filter",
    "forEach",
    "map",
    "some",
  ),
});

const kinds = ["boolean", "number", "string", "symbol", "bigint"] as const;

function primitiveSources(value: WrapperCase): string {
  const number =
    value.numberEdge === "nan"
      ? "NaN"
      : value.numberEdge === "negative-zero"
        ? "-0"
        : value.numberEdge === "infinity"
          ? "Infinity"
          : String(value.integer);
  const string = JSON.stringify(String.fromCharCode(...value.units));
  return (
    `[${value.boolean}, ${number}, ${string}, Symbol(${string}), ` +
    `${BigInt(value.integer) ** 3n}n]`
  );
}

function invocation(route: CallRoute): string {
  switch (route) {
    case "apply":
      return "fn.apply(value, [])";
    case "bind":
      return "fn.bind(value)()";
    case "call":
      return "fn.call(value)";
    case "proxy":
      return "new Proxy(fn, {}).call(value)";
    case "reflect":
      return "Reflect.apply(fn, value, [])";
  }
}

const guardSource = `
/** @param {number} left @param {number} right */
function add(left, right) { return left + right; }
console.log("addition", add(1, 2), add(Object("x"), 1));
function read(object) { return object.marker; }
const shape = { marker: 7 };
console.log("shape", read(shape), read(shape));
shape.other = 1;
console.log("changed", read(shape));
`;
const guardOutput = "addition 3 x1\nshape 7 7\nchanged 7\n";

/** Model OrdinaryCallBindThis separately from the call forwarding route. */
function callProgram(value: WrapperCase): string {
  return `
function invoke(fn, value) { return ${invocation(value.route)}; }
function inspect() {
  ${value.strict ? '"use strict";' : ""}
  const first = this;
  const capture = () => this;
  if (typeof this === "object") this.marker = ${value.integer};
  return [first, this, capture];
}
const primitives = ${primitiveSources(value)};
const intrinsics = [Boolean, Number, String, Symbol, BigInt];
for (let index = 0; index < primitives.length; index++) {
  const primitive = primitives[index];
  const a = invoke(inspect, primitive);
  const b = invoke(inspect, primitive);
  const observed = a[0];
  console.log("binding", typeof observed, Object.is(observed, a[1]),
    Object.is(observed, a[2]()), Object.is(observed, b[0]),
    Object.is(intrinsics[index].prototype.valueOf.call(observed), primitive));
  const seen = [];
  [1, 2].${value.method}(function () {
    ${value.strict ? '"use strict";' : ""}
    seen.push(this);
    return ${value.method === "some" ? "false" : "true"};
  }, primitive);
  console.log("callback", seen.length, typeof seen[0],
    Object.is(seen[0], seen[1]));
}
${guardSource}`;
}

function callExpected(value: WrapperCase): string {
  return (
    kinds
      .map(
        (kind) =>
          [
            `binding ${value.strict ? kind : "object"} true true ` +
              `${value.strict} true`,
            `callback 2 ${value.strict ? kind : "object"} ${value.strict}`,
          ].join("\n") + "\n",
      )
      .join("") + guardOutput
  );
}

/** Model GetV versus a single persistent ToObject array-like receiver. */
function receiverProgram(value: WrapperCase): string {
  return `
const values = ${primitiveSources(value)};
const intrinsics = [Boolean, Number, String, Symbol, BigInt];
for (let index = 0; index < values.length; index++) {
  const value = values[index];
  const prototype = intrinsics[index].prototype;
  const originalTag = Object.getOwnPropertyDescriptor(
    prototype, Symbol.toStringTag);
  let seen;
  Object.defineProperty(prototype, Symbol.toStringTag, {
    configurable: true,
    get() { "use strict"; seen = this; return "boxed"; },
  });
  const tagged = Object.prototype.toString.call(value);
  console.log("tag", tagged, typeof seen,
    Object.is(intrinsics[index].prototype.valueOf.call(seen), value));
  const direct = value[Symbol.toStringTag];
  console.log("getv", direct, typeof seen, Object.is(seen, value));
  if (originalTag) Object.defineProperty(prototype,
    Symbol.toStringTag, originalTag);
  else delete prototype[Symbol.toStringTag];
  if (index === 2) continue;
  let lengthReceiver;
  let iteratorReceiver;
  Object.defineProperty(prototype, Symbol.iterator, {
    configurable: true,
    get() { "use strict"; iteratorReceiver = this; return undefined; },
  });
  Object.defineProperty(prototype, "length", {
    configurable: true,
    get() { ${value.strict ? '"use strict";' : ""}
      lengthReceiver = this; this.marker = ${value.integer}; return 1; },
  });
  Object.defineProperty(prototype, "0", {
    configurable: true,
    get() { ${value.strict ? '"use strict";' : ""}
      console.log("index", this === lengthReceiver); return this.marker; },
  });
  const result = Array.from(value);
  const first = lengthReceiver;
  const second = Array.from(value);
  console.log("arraylike", typeof iteratorReceiver,
    Object.is(iteratorReceiver, value), typeof lengthReceiver,
    first !== lengthReceiver, result[0], second[0]);
  delete prototype[Symbol.iterator];
  delete prototype.length;
  delete prototype["0"];
}
${guardSource}`;
}

function receiverExpected(value: WrapperCase, v8: boolean): string {
  return (
    kinds
      .map(
        (kind) =>
          `tag [object boxed] ${v8 ? kind : "object"} true\n` +
          `getv boxed ${kind} true\n` +
          (kind === "string"
            ? ""
            : "index true\nindex true\n" +
              `arraylike ${kind} true object true ` +
              `${value.integer} ${value.integer}\n`),
      )
      .join("") + guardOutput
  );
}

/** Validate references independently, then native semantics and GC counters. */
async function observe(
  source: string,
  expected: string,
  referenceExpected = expected,
): Promise<void> {
  assert.ok(nativeTarget != null);
  const directory = await host.makeTemporaryDirectory("oseo-wrapper-property-");
  const path = `${directory}/case.js`;
  await host.writeTextFile(path, `(0, eval)(${JSON.stringify(source)});\n`);
  try {
    const referenceObservation = {
      exitStatus: 0,
      stderr: "",
      stdout: referenceExpected,
    };
    for (const command of [process.execPath, "deno"]) {
      const reference = await host.run({
        args: command === "deno" ? ["run", "--quiet", path] : [path],
        command,
        cwd: directory,
      });
      assertMatchingObservations([referenceObservation, reference]);
    }
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source, sourceId: "generated-primitive-wrapper.js" },
        { observeSpecialization: true, specialization },
      );
      assert.deepEqual(compiled.diagnostics, []);
      assert.ok(compiled.mir != null);
      const mir = printMir(compiled.mir);
      if (specialization === "enabled") {
        assert.match(mir, /guard-smi/u);
        assert.match(mir, /guard-shape/u);
        assert.match(mir, /generic-fallback/u);
      } else assert.doesNotMatch(mir, /guard-(?:smi|shape)/u);
      const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        await withNativeFixture(
          {
            backend: cBackend,
            host,
            input: compiled.mir,
            operation: "execute",
            runtime: cRuntimeProvider,
            target: nativeTarget,
            toolchain: nativeToolchain,
          },
          (native) => {
            assertMatchingObservations([
              { exitStatus: 0, stderr: "", stdout: expected },
              native,
            ]);
            assert.ok((native.counters?.collections ?? 0) > 0);
            if (specialization === "enabled") {
              assert.ok((native.counters?.guardHits ?? 0) > 0);
              assert.ok((native.counters?.guardMisses ?? 0) > 0);
              assert.ok((native.counters?.genericAdditionCalls ?? 0) > 0);
            }
          },
        );
      } finally {
        if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
      }
    }
  } finally {
    await host.remove(directory);
  }
}

const context = [
  `host=${host.executionHost?.operatingSystem}/` +
    host.executionHost?.architecture,
  `target=${nativeTarget?.name}`,
  `sanitizers=${nativeTarget?.sanitizers.join(",")}`,
];

test(
  "generated primitive this bindings match the independent model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "primitive wrapper calls preserve brands, identity, and forwarding",
      fc.asyncProperty(cases, async (value) => {
        await observe(callProgram(value), callExpected(value));
      }),
      {
        context,
        domain:
          "all five primitive kinds, four Number classes, bounded " +
          "UTF-16, strict/sloppy callees, five call routes and Array callbacks",
        numRuns: 12,
        profile: "M5 primitive wrapper objects",
        seed: 0x6000_8a00,
        sizeLimit:
          "five primitives, at most eight UTF-16 units, two calls " +
          "and two callbacks per kind, one false hint and a shape mutation",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);

test(
  "generated ToObject receivers retain one box and GetV primitives",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "primitive ToObject consumers preserve receiver and access order",
      fc.asyncProperty(cases, async (value) => {
        // ECMA-262 2025 20.1.3.6 requires a boxed @@toStringTag receiver.
        // Node and Deno (V8) instead expose the primitive at that one Get.
        await observe(
          receiverProgram(value),
          receiverExpected(value, false),
          receiverExpected(value, true),
        );
      }),
      {
        context,
        domain:
          "all five primitive kinds, strict tag/GetV getters and " +
          "strict/sloppy array-like length/index getters on four prototypes",
        numRuns: 12,
        profile: "M5 primitive wrapper objects",
        seed: 0x6000_8a01,
        sizeLimit:
          "five primitives, at most eight UTF-16 units, five tag " +
          "and GetV observations, two one-element Array.from calls per kind",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);
