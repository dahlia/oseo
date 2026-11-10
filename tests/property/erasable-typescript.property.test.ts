/* eslint-disable no-await-in-loop -- Native runs have isolated lifetimes. */
import assert from "node:assert/strict";
import { stripTypeScriptTypes } from "node:module";
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
import {
  babelFrontend,
  babelModuleFrontend,
} from "../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty, propertySize } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);
const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const maxWrapperDepth = propertySize() === "large" ? 12 : 3;

interface ErasureCase {
  readonly left: number;
  readonly right: number;
  readonly label: string;
  readonly annotation: string;
  readonly boundary: string;
  readonly wrappers: readonly string[];
  readonly gap: string;
  readonly sign: string;
  readonly angles: string;
  readonly construct: boolean;
}
const gaps = fc.constantFrom(
  " ",
  "\n",
  "\r",
  "\r\n",
  "\u2028",
  "\u2029",
  "/*\n*/",
  "// gap\n",
);
const signs = fc.constantFrom("+", "-");
const arbitrary = fc.record({
  construct: fc.boolean(),
  gap: gaps,
  sign: signs,
  angles: fc.constantFrom(
    "<T>",
    "<T | U>",
    "<T<U>>",
    "<(T<U>)>",
    "<[T<U>]>",
    "<{ value: T<U> }>",
    "<(T as number)>",
    "<(T satisfies number)>",
    "<(T!)>",
  ),
  annotation: fc.constantFrom(
    "number",
    "Alias",
    "number | string",
    "unknown",
    "typeof seed",
    "{ readonly impossible: never }",
    "T extends number ? number : never",
  ),
  boundary: fc.constantFrom("(0)", "[0]", "`text`", "+1", "-1", "/x/"),
  label: fc.stringMatching(/^[a-z]{1,5}$/u),
  left: fc.integer({ min: -100, max: 100 }),
  right: fc.integer({ min: -100, max: 100 }),
  wrappers: fc.array(fc.constantFrom("as unknown", "satisfies unknown", "!"), {
    maxLength: maxWrapperDepth,
  }),
});

/** Print a scope-closed program; every shrunk value still has a binding. */
function printCase(value: ErasureCase): string {
  const seedExpression = value.wrappers.reduce(
    (expression, wrapper) => `(${expression} ${wrapper})`,
    "seed",
  );
  const callee = value.construct ? "new RelationalBox" : "seed";
  const parameter = value.construct ? "new RelationalBox" : "x";
  return `
import type { Missing } from "./never-loaded.ts";
import type MissingAlias = require("./never-loaded.ts");
export import type ExportedAlias = require("./never-loaded.ts");
declare namespace AmbientAliases {
  import type NestedAlias = require("./never-loaded.ts");
  namespace Members {}
  export import MemberAlias = Members;
  export import type ExternalAlias = require("./never-loaded.ts");
  export type * from "./never-loaded.ts";
}
export type { Missing };
interface Shape<T> { value: T; }
type Alias = number;
namespace Types { export type T = unknown; }
declare const absent: unknown;
const seed = ${value.left};
const T = ${value.right}, U = 2;
class RelationalBox { valueOf() { return seed; } }
const relational = ${callee}${value.angles}${value.gap}${value.sign}T;
console.log("relational", relational);
function relation(x: number) {
  return ${parameter}${value.angles}${value.gap}${value.sign}T;
}
console.log(relation(seed));
console.log({ value:
  ${callee}${value.angles}${value.gap}${value.sign}T
}.value);
console.log([${callee}${value.angles}${value.gap}${value.sign}T][0]);
const separated = (seed<T>)${value.gap}${value.sign}T;
console.log("separated", separated);
console.log(new RelationalBox<T>()${value.gap}${value.sign}T);
console.log(seed<T> << 1, (seed<T>) < T);
function identity<T>(this: unknown, x?: T): T | undefined { return x; }
function receiver(this, x: number) { return x; }
function soleReceiver(this) { return ${value.left}; }
function add(x: number, y: number): number;
function add(x: number, y: number): number { return x + y; }
abstract class Base<T> { abstract read(): T; }
class Box<T> extends Base<T> implements Shape<T> {
  declare absent: Missing;
  readonly value!: T;
  static: ${value.annotation}
  contextual() { return ${value.left}; }
  constructor(value: T) { super(); this.value = value; }
  read(): T { return this.value!; }
  m<U>(x?: U): U | undefined { return x; }
}
const held = identity as ${value.annotation}
(${value.right})
const heldDeclaration = identity
type Removed = ${value.annotation}
${value.boundary}
const one: ${value.annotation} = ${seedExpression};
const { x }: { x: number } = { x: one };
const [y, z]: [number, Alias] = [${value.right}, one];
const id = identity<number>;
const box = new Box<number>(x as number);
const object = { m<T>(x: T): T { return x; } };
try { throw y; } catch (error: unknown) { console.log("caught", error); }
for (const [item] of [[z]]) {
  const copied: number = item; console.log("loop", copied);
}
console.log((box.read() as unknown satisfies unknown)!, box.m<string>());
console.log(object.m<number>(id(y)), identity.length, box.m.length);
console.log(receiver(x), receiver.length, soleReceiver(), soleReceiver.length);
console.log(add(x, y), add(${JSON.stringify(value.label)} as any, y));
console.log(
  typeof held, typeof heldDeclaration,
  Object.hasOwn(box, "static"), box.contextual(),
);
`;
}

async function references(source: string, stripped: string) {
  const directory = await host.makeTemporaryDirectory("oseo-erasure-property-");
  try {
    await host.writeTextFile(`${directory}/case.ts`, source);
    await host.writeTextFile(`${directory}/case.mjs`, stripped);
    return await Promise.all([
      host.run({
        cwd: directory,
        command: process.execPath,
        args: [`${directory}/case.ts`],
      }),
      host.run({
        cwd: directory,
        command: "deno",
        args: ["run", "--quiet", `${directory}/case.ts`],
      }),
      host.run({
        cwd: directory,
        command: process.execPath,
        args: [`${directory}/case.mjs`],
      }),
      host.run({
        cwd: directory,
        command: "deno",
        args: ["run", "--quiet", `${directory}/case.mjs`],
      }),
    ]);
  } finally {
    await host.remove(directory);
  }
}

test(
  "erasable syntax preserves native behavior at every admitted position",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    await assertAsyncProperty(
      "TypeScript erasure invariance",
      fc.asyncProperty(arbitrary, async (value) => {
        const source = printCase(value);
        const stripped = stripTypeScriptTypes(source);
        const observations = await references(source, stripped);
        assertMatchingObservations(observations);
        const prior = process.env.OSEO_GC_EVERY_SAFEPOINT;
        process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
        try {
          for (const text of [source, stripped]) {
            for (const specialization of ["disabled", "enabled"] as const) {
              const compiled = compileSource(
                babelFrontend,
                {
                  source: text,
                  sourceId: "generated-erasure.ts",
                },
                { observeSpecialization: true, specialization },
              );
              assert.deepEqual(compiled.diagnostics, []);
              assert.ok(compiled.mir != null);
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
                  assertMatchingObservations([observations[0]!, native]);
                  assert.ok((native.counters?.collections ?? 0) > 0);
                  if (text === source && specialization === "enabled") {
                    assert.ok((native.counters?.guardMisses ?? 0) > 0);
                  }
                },
              );
            }
          }
        } finally {
          if (prior == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          else process.env.OSEO_GC_EVERY_SAFEPOINT = prior;
        }
      }),
      {
        context: [
          `target=${nativeTarget?.name ?? "unsupported"}`,
          `host=${host.executionHost?.operatingSystem}/` +
            host.executionHost?.architecture,
          `sanitizers=${nativeTarget?.sanitizers.join(",") ?? "unknown"}`,
        ],
        domain:
          "erasable syntax at bindings, parameters, returns, classes, " +
          "methods, calls, construction, assertions " +
          "and their ASI and instantiation/unary boundaries, " +
          "catch and loop bindings; " +
          "type declarations, overloads and type-only module declarations",
        numRuns: 12,
        profile: "erasable TypeScript",
        seed: 0x6000_ad00,
        sizeLimit:
          "two integers from -100 to 100, one to five label letters, " +
          "seven annotation forms, six ASI continuations, " +
          "eight gaps, two unary signs, nine relational angle forms, " +
          "ordinary and new-expression callees, " +
          "one generic class and one false hint, " +
          `at most ${maxWrapperDepth} nested assertions`,
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);

test("rejects generated invalid or unsupported continuations", async () => {
  await assertAsyncProperty(
    "TypeScript instantiation grammar rejection",
    fc.asyncProperty(
      fc.record({
        gap: gaps,
        sign: signs,
        construct: fc.boolean(),
        continuation: fc.constantFrom("unary", "assertion", "missing"),
        operand: fc.constantFrom("y", "(y)", "[y]", "+y", "y ** 2"),
        angles: fc.constantFrom(
          "<T[]>",
          "<T,>",
          "<{ x: T; }>",
          "<(T<U>]>",
          "<[T<U>)>",
        ),
      }),
      async ({ gap, sign, angles, construct, continuation, operand }) => {
        const callee = construct ? "new X" : "x";
        const tail = continuation === "assertion" ? `<U>${operand}` : "<y";
        const expression =
          continuation === "unary"
            ? `${callee}${angles}${gap}${sign}y`
            : `${callee}<T>${gap}${tail}`;
        const source = `function f() { return ${expression}; }`;
        assert.throws(() => stripTypeScriptTypes(source), SyntaxError);
        for (const result of [
          babelFrontend.parse({ source, sourceId: "invalid-generated.ts" }),
          babelModuleFrontend.parseModule({
            source,
            sourceId: "invalid-generated.ts",
          }),
        ]) {
          assert.equal(result.parsed, false, source);
          assert.equal(
            result.diagnostics[0]?.code,
            continuation === "assertion" ? "OSEO1001" : "OSEO0001",
            source,
          );
        }
      },
    ),
    {
      domain: "invalid syntax and unsupported assertion continuations",
      numRuns: 12,
      profile: "erasable TypeScript",
      seed: 0x6000_ad01,
      sizeLimit:
        "eight gaps, two unary signs, five invalid angle forms, " +
        "ordinary/new callees, five operands and " +
        "unary/assertion/missing continuations",
      timeLimitMilliseconds: 300_000,
    },
  );
});

// Stripped JavaScript can resemble new type syntax. Compare typed compilation
// with both hosts' typed and JavaScript executions, without a second TS parse.
const boundaryArbitrary = fc.record({
  construct: fc.boolean(),
  gap: gaps,
  continuation: fc.constantFrom("++", "!"),
  inner: fc.constantFrom(
    "(T as number)",
    "(T satisfies number)",
    "(T!)",
    "(<U>(value: U): U => value)",
    "(async <U>(value: U): 한글 => value)",
  ),
  left: fc.integer({ min: -10, max: 10 }),
  right: fc.integer({ min: -10, max: 10 }),
});
interface BoundaryCase {
  readonly construct: boolean;
  readonly gap: string;
  readonly continuation: string;
  readonly inner: string;
  readonly left: number;
  readonly right: number;
}
function printBoundary(value: BoundaryCase): string {
  const callee = value.construct ? "new X" : "x";
  return `
const seed = ${value.left}, T = ${value.right};
let y = ${value.right};
class X { valueOf() { return seed; } }
function f(x: number) {
  return ${callee}<${value.inner}>${value.gap}${value.continuation}y;
}
const result = f(seed);
console.log(typeof result, result === true, result === false, y);
`;
}

test(
  "runtime relations survive newly ambiguous erased text",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    await assertAsyncProperty(
      "TypeScript runtime relational boundary",
      fc.asyncProperty(boundaryArbitrary, async (value) => {
        const source = printBoundary(value);
        const observations = await references(
          source,
          stripTypeScriptTypes(source),
        );
        assertMatchingObservations(observations);
        const prior = process.env.OSEO_GC_EVERY_SAFEPOINT;
        process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
        try {
          for (const specialization of ["disabled", "enabled"] as const) {
            const compiled = compileSource(
              babelFrontend,
              {
                source,
                sourceId: "generated-relational.ts",
              },
              { specialization, observeSpecialization: true },
            );
            assert.deepEqual(compiled.diagnostics, []);
            assert.ok(compiled.mir != null);
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
                assertMatchingObservations([observations[0]!, native]);
                assert.ok((native.counters?.collections ?? 0) > 0);
              },
            );
          }
        } finally {
          if (prior == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          else process.env.OSEO_GC_EVERY_SAFEPOINT = prior;
        }
      }),
      {
        domain: "runtime relations whose erased text resembles type arguments",
        profile: "erasable TypeScript",
        seed: 0x6000_ad02,
        numRuns: 12,
        sizeLimit:
          "two integers -10..10, eight gaps, two unary continuations, " +
          "five nested runtime forms and ordinary/new callees",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
