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
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";
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
}
const arbitrary = fc.record({
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
function identity<T>(this: unknown, x?: T): T | undefined { return x; }
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
          "and their ASI boundaries, " +
          "catch and loop bindings; " +
          "type declarations, overloads and type-only module declarations",
        numRuns: 12,
        profile: "erasable TypeScript",
        seed: 0x6000_ad00,
        sizeLimit:
          "two integers from -100 to 100, one to five label letters, " +
          "seven annotation forms, six ASI continuations, " +
          "one generic class and one false hint, " +
          `at most ${maxWrapperDepth} nested assertions`,
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
