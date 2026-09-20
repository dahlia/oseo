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
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type ConstructorName =
  | "BigInt64Array"
  | "Float32Array"
  | "Float64Array"
  | "Int16Array"
  | "Int32Array"
  | "Int8Array";
type Element = bigint | number;
type MutationMethod =
  | "copyWithin"
  | "fill"
  | "reverse"
  | "slice"
  | "toReversed"
  | "with";
type Mutation = "detach" | "grow" | "none" | "shrink";

/**
 * How one argument reaches the method: omitted, a literal, or an object
 * whose ToPrimitive conversion performs the case's mutation once. The
 * first converted argument owns the mutation, so a case observes it at a
 * known point in the method's conversion order.
 */
type Argument =
  | { readonly kind: "absent" }
  | { readonly kind: "coerced" }
  | { readonly kind: "plain" };

/** A method parameter is either a relative index or an element value. */
type Parameter = "index" | "value";

interface MutationCase {
  readonly constructorName: ConstructorName;
  readonly elements: readonly Element[];
  readonly indices: readonly number[];
  readonly kinds: readonly Argument[];
  readonly method: MutationMethod;
  readonly mutation: Mutation;
  readonly value: Element;
}

const methods: readonly MutationMethod[] = [
  "copyWithin",
  "fill",
  "reverse",
  "slice",
  "toReversed",
  "with",
];

const parameters = {
  copyWithin: ["index", "index", "index"],
  fill: ["value", "index", "index"],
  reverse: [],
  slice: ["index", "index"],
  toReversed: [],
  with: ["index", "value"],
} satisfies Record<MutationMethod, readonly Parameter[]>;

const numberConstructors: readonly ConstructorName[] = [
  "Float32Array",
  "Float64Array",
  "Int16Array",
  "Int32Array",
  "Int8Array",
];

const argumentKinds: fc.Arbitrary<Argument> = fc.oneof(
  fc.constant<Argument>({ kind: "absent" }),
  fc.constant<Argument>({ kind: "plain" }),
  fc.constant<Argument>({ kind: "coerced" }),
);

const relativeIndices = fc.oneof(
  fc.integer({ max: 6, min: -6 }),
  fc.constantFrom(Infinity, -Infinity, 1.5, -1.5, -0),
);

/**
 * Trailing arguments may only be omitted from the right, and only the
 * first converted argument performs the mutation, so a method with no
 * converted argument records no mutation at all.
 */
function normalize(testCase: MutationCase): MutationCase {
  const signature = parameters[testCase.method];
  const kinds: Argument[] = [];
  let absent = false;
  for (let index = 0; index < signature.length; index += 1) {
    const kind = testCase.kinds[index] ?? { kind: "absent" };
    if (absent || kind.kind === "absent") {
      absent = true;
      kinds.push({ kind: "absent" });
    } else {
      kinds.push(kind);
    }
  }
  const converts = kinds.some((kind) => kind.kind === "coerced");
  const mutation = converts ? testCase.mutation : "none";
  /*
   * V8, and so both reference hosts, resolve a negative `with` index
   * against the length the value conversion left behind, while
   * test/built-ins/TypedArray/prototype/with/negative-index-resize-to-
   * in-bounds.js and its out-of-bounds sibling pin the snapshot length
   * this runtime uses. Generated cases keep that one combination out of
   * the host comparison; the reviewed standards evidence covers it.
   */
  const divergent = testCase.method === "with" && mutation !== "none";
  return {
    constructorName: testCase.constructorName,
    elements: testCase.elements,
    indices: divergent
      ? testCase.indices.map((value, slot) =>
          slot === 0 ? Math.abs(value) : value,
        )
      : testCase.indices,
    kinds,
    method: testCase.method,
    mutation,
    value: testCase.value,
  };
}

function caseArbitraryFor(
  constructors: readonly ConstructorName[],
  element: fc.Arbitrary<Element>,
): fc.Arbitrary<MutationCase> {
  return fc
    .record({
      constructorName: fc.constantFrom(...constructors),
      elements: fc.array(element, { maxLength: 5 }),
      indices: fc.array(relativeIndices, { maxLength: 3, minLength: 3 }),
      kinds: fc.array(argumentKinds, { maxLength: 3, minLength: 3 }),
      method: fc.constantFrom(...methods),
      mutation: fc.constantFrom<Mutation>("none", "detach", "grow", "shrink"),
      value: element,
    })
    .map(normalize);
}

const caseArbitrary = fc.oneof(
  caseArbitraryFor(
    numberConstructors,
    fc.oneof(
      fc.integer({ max: 9, min: -9 }),
      fc.constantFrom(NaN, -0, 0.5, Infinity),
    ),
  ),
  caseArbitraryFor(["BigInt64Array"], fc.bigInt({ max: 9n, min: -9n })),
);

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function isBigInt(value: Element): value is bigint {
  return typeof value === "bigint";
}

function isBigIntKind(name: ConstructorName): boolean {
  return name === "BigInt64Array";
}

function printValue(value: Element): string {
  if (isBigInt(value)) return `${value}n`;
  if (Object.is(value, -0)) return "-0";
  return String(value);
}

function bytesPerElement(name: ConstructorName): number {
  if (name === "Int8Array") return 1;
  if (name === "Int16Array") return 2;
  if (name === "Float64Array" || name === "BigInt64Array") return 8;
  return 4;
}

/** The value a stored element reports through ToString. */
function elementText(value: Element): string {
  if (isBigInt(value)) return String(value);
  return Object.is(value, -0) ? "0" : String(value);
}

function printElements(values: readonly Element[]): string {
  return values.map(elementText).join(",");
}

/** The source argument list, with the mutation on the first conversion. */
function printArguments(testCase: MutationCase, mutation: string): string {
  const signature = parameters[testCase.method];
  const pieces: string[] = [];
  let owner = true;
  for (let index = 0; index < signature.length; index += 1) {
    const kind = testCase.kinds[index];
    if (kind == null || kind.kind === "absent") break;
    const literal =
      signature[index] === "value"
        ? printValue(testCase.value)
        : printValue(testCase.indices[index] ?? 0);
    if (kind.kind === "plain") {
      pieces.push(literal);
      continue;
    }
    const body = owner ? `if (!mutated) { mutated = true; ${mutation} } ` : "";
    owner = false;
    pieces.push(
      `{ valueOf() { console.log("convert"); ${body}return ${literal}; } }`,
    );
  }
  return pieces.join(", ");
}

function printCase(testCase: MutationCase): string {
  const bytes = bytesPerElement(testCase.constructorName);
  const length = testCase.elements.length;
  const mutation =
    testCase.mutation === "detach"
      ? "buffer.transfer();"
      : testCase.mutation === "shrink"
        ? `buffer.resize(${Math.floor(length / 2) * bytes});`
        : testCase.mutation === "grow"
          ? `buffer.resize(${length * bytes * 2});`
          : "";
  const writes = testCase.elements
    .map((value, index) => `view[${index}] = ${printValue(value)};`)
    .join("\n");
  return `
const buffer = new ArrayBuffer(${length * bytes}, {
  maxByteLength: ${length * bytes * 2},
});
const view = new ${testCase.constructorName}(buffer);
${writes}
let mutated = false;
let failure = "";
let result;
// A detached view refuses join, so an empty one reports its text directly.
const text = (value) => (value.length === 0 ? "" : String(value));
try {
  result = view.${testCase.method}(${printArguments(testCase, mutation)});
} catch (error) {
  failure = error.constructor.name;
}
if (failure === "") {
  console.log("result", text(result), result.length, result === view);
} else {
  console.log("throw", failure);
}
console.log("view", text(view), view.length);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
`;
}

/** The value one element keeps after a store into this element kind. */
function store(constructorName: ConstructorName, value: Element): Element {
  if (isBigInt(value)) return value;
  if (constructorName === "Float32Array") return Math.fround(value);
  if (constructorName === "Float64Array") return value;
  if (!Number.isFinite(value)) return 0;
  const integer = Math.trunc(value);
  if (constructorName === "Int32Array") return integer | 0;
  const bits = constructorName === "Int8Array" ? 8 : 16;
  const modulo = 2 ** bits;
  const wrapped = ((integer % modulo) + modulo) % modulo;
  return wrapped >= modulo / 2 ? wrapped - modulo : wrapped + 0;
}

/** ToIntegerOrInfinity over the bounded generated inputs. */
function integerOrInfinity(value: number): number {
  if (Number.isNaN(value) || value === 0) return 0;
  if (!Number.isFinite(value)) return value;
  return Math.trunc(value) + 0;
}

/** The relative-index clamp copyWithin, fill, and slice apply. */
function clampRelative(relative: number, length: number): number {
  if (relative === -Infinity) return 0;
  if (relative < 0) return Math.max(length + relative, 0);
  return Math.min(relative, length);
}

/** A thrown error's constructor name, or the completed result. */
type Outcome =
  | { readonly kind: "throw"; readonly error: string }
  | { readonly kind: "value"; readonly result: readonly Element[] };

interface Model {
  readonly detached: boolean;
  readonly lines: readonly string[];
  readonly live: readonly Element[];
  readonly outcome: Outcome;
}

/** The independent model of one case's conversions, writes, and result. */
function model(testCase: MutationCase): Model {
  const name = testCase.constructorName;
  const bigKind = isBigIntKind(name);
  const snapshot = testCase.elements.length;
  const lines: string[] = [];
  let live: Element[] = testCase.elements.map((value) => store(name, value));
  let detached = false;
  let mutated = false;
  let owner = true;
  const zero: Element = bigKind ? 0n : 0;
  const mutate = (): void => {
    if (mutated) return;
    mutated = true;
    if (testCase.mutation === "detach") {
      detached = true;
      live = [];
    } else if (testCase.mutation === "shrink") {
      live = live.slice(0, Math.floor(snapshot / 2));
    } else if (testCase.mutation === "grow") {
      live = [...live, ...Array.from({ length: snapshot }, () => zero)];
    }
  };
  /** Observes one argument's conversion in the method's own order. */
  const convert = (index: number): boolean => {
    const kind = testCase.kinds[index];
    if (kind == null || kind.kind !== "coerced") return false;
    lines.push("convert");
    if (owner) mutate();
    owner = false;
    return true;
  };
  const absent = (index: number): boolean =>
    (testCase.kinds[index] ?? { kind: "absent" }).kind === "absent";
  const relative = (index: number): number => {
    convert(index);
    return integerOrInfinity(testCase.indices[index] ?? 0);
  };
  const finish = (outcome: Outcome): Model => ({
    detached,
    lines,
    live,
    outcome,
  });
  const fail = (error: string): Model => finish({ error, kind: "throw" });

  if (testCase.method === "reverse") {
    live = live.toReversed();
    return finish({ kind: "value", result: live });
  }
  if (testCase.method === "toReversed") {
    return finish({ kind: "value", result: live.toReversed() });
  }

  if (testCase.method === "copyWithin") {
    const to = clampRelative(absent(0) ? 0 : relative(0), snapshot);
    const from = clampRelative(absent(1) ? 0 : relative(1), snapshot);
    const end = absent(2) ? snapshot : clampRelative(relative(2), snapshot);
    const count = Math.min(end - from, snapshot - to);
    if (count > 0) {
      if (detached) return fail("TypeError");
      const room = Math.max(live.length - Math.max(to, from), 0);
      const moved = Math.min(count, room);
      const source = live.slice(from, from + moved);
      live = [...live];
      for (let index = 0; index < moved; index += 1) {
        live[to + index] = source[index] ?? zero;
      }
    }
    return finish({ kind: "value", result: live });
  }

  if (testCase.method === "fill") {
    if (absent(0) && bigKind) return fail("TypeError");
    convert(0);
    const filled = absent(0) ? store(name, NaN) : store(name, testCase.value);
    let start = clampRelative(absent(1) ? 0 : relative(1), snapshot);
    let end = absent(2) ? snapshot : clampRelative(relative(2), snapshot);
    if (detached) return fail("TypeError");
    end = Math.min(end, live.length);
    start = Math.min(start, live.length);
    live = [...live];
    for (let index = start; index < end; index += 1) live[index] = filled;
    return finish({ kind: "value", result: live });
  }

  if (testCase.method === "slice") {
    const start = clampRelative(absent(0) ? 0 : relative(0), snapshot);
    const end = absent(1) ? snapshot : clampRelative(relative(1), snapshot);
    const count = Math.max(end - start, 0);
    const result: Element[] = Array.from({ length: count }, () => zero);
    if (count > 0) {
      if (detached) return fail("TypeError");
      const reachable = Math.max(Math.min(end, live.length) - start, 0);
      for (let index = 0; index < reachable; index += 1) {
        result[index] = live[start + index] ?? zero;
      }
    }
    return finish({ kind: "value", result });
  }

  const index = absent(0) ? 0 : relative(0);
  const actual = index >= 0 ? index : snapshot + index;
  if (absent(1) && bigKind) return fail("TypeError");
  convert(1);
  const replacement = absent(1)
    ? store(name, NaN)
    : store(name, testCase.value);
  if (detached || actual < 0 || actual >= live.length) {
    return fail("RangeError");
  }
  const reachable = Math.min(live.length, snapshot);
  if (reachable < snapshot && bigKind) return fail("TypeError");
  const result: Element[] = Array.from({ length: snapshot }, (_, slot) =>
    slot < reachable ? (live[slot] ?? zero) : store(name, NaN),
  );
  if (actual < snapshot) result[actual] = replacement;
  return finish({ kind: "value", result });
}

function expected(testCase: MutationCase): string {
  const computed = model(testCase);
  const lines = [...computed.lines];
  const viewLength = computed.detached ? 0 : computed.live.length;
  const viewText = computed.detached ? "" : printElements(computed.live);
  if (computed.outcome.kind === "throw") {
    lines.push(`throw ${computed.outcome.error}`);
  } else {
    const inPlace =
      testCase.method === "copyWithin" ||
      testCase.method === "fill" ||
      testCase.method === "reverse";
    const result = computed.outcome.result;
    lines.push(
      `result ${
        inPlace ? viewText : printElements(result)
      } ${inPlace ? viewLength : result.length} ${inPlace}`,
    );
  }
  lines.push(`view ${viewText} ${viewLength}`, "hint 5 23", "");
  return lines.join("\n");
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
    "oseo-typed-array-mutation-property-",
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

async function assertCase(testCase: MutationCase): Promise<void> {
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
      { source, sourceId: "generated-m5-typed-array-mutation.ts" },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const mir = printMir(compiled.mir);
    if (specialization === "enabled") {
      assert.match(mir, /guard-smi/u);
      assert.match(mir, /generic-fallback/u);
    } else {
      assert.doesNotMatch(mir, /guard-(?:smi|shape)/u);
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
          target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
          toolchain: nativeToolchain,
        },
        (native) => {
          assertMatchingObservations([expectedObservation, native]);
          assert.ok(native.counters?.collections != null);
          assert.ok(native.counters.collections > 0);
          if (specialization === "enabled") {
            assert.ok(native.counters.guardMisses > 0);
          }
        },
      );
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }
}

test(
  "generated TypedArray mutation methods match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "TypedArray mutation and copying methods agree",
      fc.asyncProperty(caseArbitrary, assertCase),
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
          "copyWithin, fill, reverse, slice, toReversed, and with over zero " +
          "to five bounded Number, NaN, signed-zero, infinite, or BigInt " +
          "elements of six typed-array kinds; omitted, plain, infinite, " +
          "fractional, negative, and observably converted relative indices " +
          "and element values; no mutation, detach, shrink, and grow during " +
          "the first conversion; and one deliberate numeric-hint guard miss",
        numRuns: 12,
        profile: "M5 TypedArray mutation and copying methods",
        seed: 0x6000_7900,
        sizeLimit:
          "one length-tracking view, zero to five elements, one resize or " +
          "detach, at most three argument conversions, one result and one " +
          "receiver observation, and one false numeric hint",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

/*
 * Twelve draws cannot guarantee the paths where a mutation during an
 * argument conversion changes what the method may still touch: a
 * copyWithin move clamped to the surviving bytes in each direction, a
 * fill whose bounds outlive the elements, a slice whose end passes the
 * shrunk length, a with whose replaced index survives while a later one
 * does not, and the BigInt view that refuses the resulting undefined.
 * These fixed cases keep each of them exercised on every run.
 */
test(
  "TypedArray mutation resize cases match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const cases: readonly MutationCase[] = [
      {
        constructorName: "Int16Array",
        elements: [1, 2, 3, 4],
        indices: [0, 2, 4],
        kinds: [{ kind: "plain" }, { kind: "plain" }, { kind: "coerced" }],
        method: "copyWithin",
        mutation: "shrink",
        value: 0,
      },
      {
        constructorName: "Int8Array",
        elements: [1, 2, 3, 4],
        indices: [2, 0, 4],
        kinds: [{ kind: "plain" }, { kind: "plain" }, { kind: "coerced" }],
        method: "copyWithin",
        mutation: "shrink",
        value: 0,
      },
      {
        constructorName: "Float64Array",
        elements: [1, 2, 3, 4],
        indices: [0, 0, 4],
        kinds: [{ kind: "coerced" }, { kind: "plain" }, { kind: "plain" }],
        method: "fill",
        mutation: "shrink",
        value: 7,
      },
      {
        constructorName: "Int32Array",
        elements: [1, 2, 3, 4],
        indices: [1, 4, 0],
        kinds: [{ kind: "plain" }, { kind: "coerced" }, { kind: "absent" }],
        method: "slice",
        mutation: "shrink",
        value: 0,
      },
      {
        constructorName: "Float32Array",
        elements: [1, 2, 3, 4],
        indices: [0, 0, 0],
        kinds: [{ kind: "plain" }, { kind: "coerced" }, { kind: "absent" }],
        method: "with",
        mutation: "shrink",
        value: 9,
      },
      {
        constructorName: "BigInt64Array",
        elements: [1n, 2n, 3n, 4n],
        indices: [0, 0, 0],
        kinds: [{ kind: "plain" }, { kind: "coerced" }, { kind: "absent" }],
        method: "with",
        mutation: "shrink",
        value: 9n,
      },
      {
        constructorName: "BigInt64Array",
        elements: [1n, 2n, 3n],
        indices: [0, 3, 0],
        kinds: [{ kind: "plain" }, { kind: "coerced" }, { kind: "absent" }],
        method: "slice",
        mutation: "detach",
        value: 0n,
      },
    ];
    for (const testCase of cases) await assertCase(normalize(testCase));
  },
);
