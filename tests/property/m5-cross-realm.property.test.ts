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
import { agentReferencePrelude } from "../native/agent-reference.ts";
import { realmReferencePrelude } from "../native/realm-reference.ts";
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/** Built-in constructors whose GetPrototypeFromConstructor default varies. */
const constructors = [
  "Array",
  "Boolean",
  "Date",
  "Error",
  "Map",
  "Promise",
  "RegExp",
  "Set",
  "Uint8Array",
] as const;

type ConstructorName = (typeof constructors)[number];

/**
 * How a construction supplies its new target: the constructor itself, a
 * bound function of some realm's `Object`, which has no `prototype`
 * property, or a Proxy of such a bound function created by another realm's
 * `Proxy`. The last two reach the default through GetFunctionRealm.
 */
type NewTarget =
  | { readonly kind: "bound"; readonly realm: number }
  | {
      readonly kind: "proxy";
      readonly proxyRealm: number;
      readonly realm: number;
    }
  | { readonly kind: "self" };

/** Built-in methods that throw a TypeError for the receiver they get. */
const throwers = [
  "String.prototype.toString",
  "Number.prototype.valueOf",
  "Function.prototype.apply",
  "RegExp.prototype.global",
] as const;

type ThrowerName = (typeof throwers)[number];

/** Array methods that reach ArraySpeciesCreate. */
const speciesMethods = ["concat", "filter", "map", "slice"] as const;

type SpeciesMethod = (typeof speciesMethods)[number];

type Operation =
  | {
      readonly kind: "construct";
      readonly name: ConstructorName;
      readonly realm: number;
      readonly target: NewTarget;
    }
  | {
      readonly kind: "eval";
      readonly realm: number;
      readonly value: number;
    }
  | {
      readonly kind: "forward";
      readonly realm: number;
    }
  | {
      readonly arrayRealm: number;
      readonly constructorRealm: number;
      readonly kind: "species";
      readonly method: SpeciesMethod;
      readonly methodRealm: number;
    }
  | {
      readonly first: number;
      readonly key: string;
      readonly kind: "symbol";
      readonly second: number;
    }
  | {
      readonly kind: "throw";
      readonly name: ThrowerName;
      readonly realm: number;
    };

/**
 * One program over the initial realm, numbered 0, and one to three
 * created realms. Each operation names its realms by index, so shrinking
 * the realm count or an operation keeps every index in range only through
 * `realmIndex`, which folds an index into the realms that exist.
 */
interface RealmCase {
  readonly created: number;
  readonly nested: boolean;
  readonly operations: readonly Operation[];
}

const realmIndexArbitrary = fc.integer({ max: 3, min: 0 });

const operationArbitrary: fc.Arbitrary<Operation> = fc.oneof(
  fc.record({
    kind: fc.constant("construct" as const),
    name: fc.constantFrom(...constructors),
    realm: realmIndexArbitrary,
    target: fc.oneof(
      fc.constant({ kind: "self" as const }),
      fc.record({
        kind: fc.constant("bound" as const),
        realm: realmIndexArbitrary,
      }),
      fc.record({
        kind: fc.constant("proxy" as const),
        proxyRealm: realmIndexArbitrary,
        realm: realmIndexArbitrary,
      }),
    ),
  }),
  fc.record({
    kind: fc.constant("eval" as const),
    realm: realmIndexArbitrary,
    value: fc.integer({ max: 99, min: -9 }),
  }),
  fc.record({
    kind: fc.constant("forward" as const),
    realm: realmIndexArbitrary,
  }),
  fc.record({
    arrayRealm: realmIndexArbitrary,
    constructorRealm: realmIndexArbitrary,
    kind: fc.constant("species" as const),
    method: fc.constantFrom(...speciesMethods),
    methodRealm: realmIndexArbitrary,
  }),
  fc.record({
    first: realmIndexArbitrary,
    key: fc.constantFrom("a", "b", "shared"),
    kind: fc.constant("symbol" as const),
    second: realmIndexArbitrary,
  }),
  fc.record({
    kind: fc.constant("throw" as const),
    name: fc.constantFrom(...throwers),
    realm: realmIndexArbitrary,
  }),
);

const caseArbitrary: fc.Arbitrary<RealmCase> = fc.record({
  created: fc.integer({ max: 3, min: 1 }),
  nested: fc.boolean(),
  operations: fc.array(operationArbitrary, { maxLength: 8, minLength: 1 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function realmIndex(testCase: RealmCase, index: number): number {
  return index % (testCase.created + 1);
}

function constructorArguments(name: ConstructorName): string {
  switch (name) {
    case "Date":
      return "[0]";
    case "Promise":
      return "[() => {}]";
    case "RegExp":
      return '["a"]';
    case "Uint8Array":
      return "[1]";
    default:
      return "[]";
  }
}

function printTarget(testCase: RealmCase, target: NewTarget): string {
  if (target.kind === "self") return "undefined";
  const bound = `realms[${realmIndex(testCase, target.realm)}].Object.bind()`;
  if (target.kind === "bound") return bound;
  const proxyRealm = realmIndex(testCase, target.proxyRealm);
  return `new realms[${proxyRealm}].Proxy(${bound}, {})`;
}

function printThrower(name: ThrowerName, realm: string): string {
  switch (name) {
    case "String.prototype.toString":
      return `${realm}.String.prototype.toString.call(1)`;
    case "Number.prototype.valueOf":
      return `${realm}.Number.prototype.valueOf.call("1")`;
    case "Function.prototype.apply":
      return `${realm}.Function.prototype.apply.call({}, null, [])`;
    case "RegExp.prototype.global":
      return (
        `Object.getOwnPropertyDescriptor(${realm}.RegExp.prototype, ` +
        '"global").get.call({})'
      );
  }
}

function printOperation(testCase: RealmCase, operation: Operation): string {
  const at = (index: number) => `realms[${realmIndex(testCase, index)}]`;
  switch (operation.kind) {
    case "construct": {
      const constructor = `${at(operation.realm)}.${operation.name}`;
      const target = printTarget(testCase, operation.target);
      return (
        `out.push("c" + prototypeRealm(Reflect.construct(${constructor}, ` +
        `${constructorArguments(operation.name)}, ` +
        `${target} ?? ${constructor}), "${operation.name}"));`
      );
    }
    case "eval":
      return `out.push("e" + ${at(operation.realm)}.eval(${operation.value}));`;
    case "forward":
      return (
        `out.push("f" + errorRealm(() => ${at(operation.realm)}` +
        ".Array.prototype.forEach.call([1], () => { " +
        'throw new TypeError("local"); })));'
      );
    case "species": {
      const callback =
        operation.method === "map" || operation.method === "filter"
          ? ", (x) => x"
          : "";
      return (
        `{ const source = ${at(operation.arrayRealm)}.Array.of(1, 2); ` +
        `source.constructor = ${at(operation.constructorRealm)}.Array; ` +
        `out.push("s" + prototypeRealm(${at(operation.methodRealm)}` +
        `.Array.prototype.${operation.method}.call(source` +
        `${callback}), "Array")); }`
      );
    }
    case "symbol":
      return (
        `out.push("y" + (${at(operation.first)}.Symbol.for(` +
        `"${operation.key}") === ${at(operation.second)}.Symbol.for(` +
        `"${operation.key}")) + (${at(operation.first)}.Symbol.iterator === ` +
        `${at(operation.second)}.Symbol.iterator));`
      );
    case "throw":
      return (
        'out.push("t" + errorRealm(() => ' +
        `${printThrower(operation.name, at(operation.realm))}));`
      );
  }
}

function printCase(testCase: RealmCase): string {
  const creations = [];
  for (let index = 0; index < testCase.created; index += 1) {
    creations.push(
      index > 0 && testCase.nested
        ? `hosts.push(hosts[${index}].createRealm());`
        : "hosts.push($262.createRealm());",
    );
  }
  return `
const hosts = [$262];
${creations.join("\n")}
const realms = hosts.map((created) => created.global);
function prototypeRealm(value, name) {
  const prototype = Object.getPrototypeOf(value);
  for (let index = 0; index < realms.length; index += 1) {
    if (prototype === realms[index][name].prototype) return index;
  }
  return "?";
}
function errorRealm(callback) {
  try {
    callback();
    return "none";
  } catch (error) {
    return prototypeRealm(error, "TypeError");
  }
}
function readX(object) {
  return object.x;
}
const out = [];
${testCase.operations
  .map((operation) => printOperation(testCase, operation))
  .join("\n")}
let total = 0;
for (let index = 0; index < 8; index += 1) total += readX({ x: 1 });
for (const realm of realms) total += readX(realm.Object.assign({}, { x: 2 }));
if (readX(new realms[realms.length - 1].Object()) !== undefined) total = -1;
console.log(out.join(" "));
console.log(total === 8 + 2 * realms.length ? "guards" : "broken");
`;
}

/*
 * The independent realm model. A construction's prototype comes from its
 * new target's realm, which for a bound function or a Proxy of one is the
 * realm of the bound `Object`; ArraySpeciesCreate always yields an array
 * of the method's realm, because the source's constructor is some realm's
 * %Array%, which is either the method realm's own, whose species is that
 * %Array%, or another realm's, which counts as undefined; a built-in
 * throws a TypeError of its own realm; a callback's error crosses
 * unchanged; well-known and registered symbols are shared by all realms;
 * and %eval% returns a non-String argument.
 */
function expected(testCase: RealmCase): string {
  const out = testCase.operations.map((operation) => {
    switch (operation.kind) {
      case "construct": {
        const target = operation.target;
        const realm =
          target.kind === "self"
            ? realmIndex(testCase, operation.realm)
            : realmIndex(testCase, target.realm);
        return `c${realm}`;
      }
      case "eval":
        return `e${operation.value}`;
      case "forward":
        return "f0";
      case "species":
        return `s${realmIndex(testCase, operation.methodRealm)}`;
      case "symbol":
        return "ytruetrue";
      case "throw":
        return `t${realmIndex(testCase, operation.realm)}`;
    }
  });
  return `${out.join(" ")}\nguards\n`;
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory("oseo-realms-");
  const sourcePath = `${directory}/cross-realm.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      agentReferencePrelude + realmReferencePrelude + source,
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
  "generated realm programs match the M5 realm model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "constructions, species, errors, symbols, and eval follow realms",
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
            { source, sourceId: "generated-m5-cross-realm.ts" },
            { observeSpecialization: true, specialization, test262Host: true },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-shape/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:smi|shape)/u);
          }
          await withNativeFixture(
            {
              agents: compiled.agents ?? [],
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
              assert.ok(native.counters != null);
              if (specialization === "enabled") {
                assert.ok(native.counters.guardMisses > 0);
              }
            },
          );
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
          "one to three realms created by $262.createRealm, directly or " +
          "from the previous realm's host, and one to eight operations: " +
          "Reflect.construct of a realm's Array, Boolean, Date, Error, " +
          "Map, Promise, RegExp, Set, or Uint8Array with itself, a bound " +
          "Object, or a Proxy of one as new target; concat, filter, map, " +
          "or slice of one realm over another realm's array whose " +
          "constructor is a third realm's Array; a realm's throwing " +
          "String, Number, Function, or RegExp method; a local callback " +
          "error through another realm's forEach; registered and " +
          "well-known symbol identity; and %eval% of a Number; followed " +
          "by a property read whose shape guard misses on other realms",
        numRuns: 8,
        profile: "M5 realms beyond the initial realm",
        seed: 0x6000_8300,
        sizeLimit:
          "at most three created realms and eight operations, each naming " +
          "at most three realms",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
