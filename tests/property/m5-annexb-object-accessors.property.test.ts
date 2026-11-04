/* eslint-disable no-await-in-loop -- Native observations are isolated. */

/*
 * Generated sequences over the Annex B Object accessors of ECMA-262
 * 20.1.3.8 through 20.1.3.12, each compared with an independent model of
 * the clauses and with the reference hosts under both specialization
 * policies and forced collection. Node.js is the only reference for the
 * `__proto__` domain because Deno 2.9.7 replaces that accessor with a shim;
 * both hosts are references for the legacy method domain.
 */

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

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const context: readonly string[] =
  nativeTarget == null || host.executionHost == null
    ? ["target=unsupported host=unknown"]
    : [
        `target=${nativeTarget.name}`,
        `host=${host.executionHost.operatingSystem}/` +
          host.executionHost.architecture,
      ];

/*
 * Every program starts from the same pool: three ordinary objects, the
 * target `t` of a trapless Proxy `px`, a null-prototype object `n`, a
 * non-extensible object `x`, and %Object.prototype% as `OP`. The proxy is
 * never a prototype value, so no generated chain runs through it.
 */
const pool = `
const o0 = {};
const o1 = {};
const o2 = {};
const t = {};
const px = new Proxy(t, {});
const n = Object.create(null);
const x = Object.preventExtensions({});
const OP = Object.prototype;
const names = new Map([[o0, "o0"], [o1, "o1"], [o2, "o2"], [t, "t"],
  [px, "px"], [n, "n"], [x, "x"], [OP, "OP"]]);
function label(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value !== "object") return String(value);
  return names.get(value) ?? "other";
}
function attempt(run) {
  try { return label(run()); } catch (error) {
    return error instanceof TypeError ? "TypeError" : "other";
  }
}
const setProto = Object.getOwnPropertyDescriptor(OP, "__proto__").set;
/** @param {object} value */
function read(value) { return value.__proto__; }
read({ ["__proto__"]: 0 });
read({});
`;

type ProtoTarget = "o0" | "o1" | "o2" | "t" | "px" | "n" | "x" | "OP";
type ProtoValue = "o0" | "o1" | "o2" | "t" | "n" | "x" | "OP" | "null" | "1";
type ProtoOperation =
  | {
      readonly kind: "assign" | "strict" | "reflect" | "call";
      readonly target: ProtoTarget;
      readonly value: ProtoValue;
    }
  | { readonly kind: "read" | "proto"; readonly target: ProtoTarget };

const protoTargets = fc.constantFrom<ProtoTarget>(
  "o0",
  "o1",
  "o2",
  "t",
  "px",
  "n",
  "x",
  "OP",
);
const protoValues = fc.constantFrom<ProtoValue>(
  "o0",
  "o1",
  "o2",
  "t",
  "n",
  "x",
  "OP",
  "null",
  "1",
);
const protoOperation: fc.Arbitrary<ProtoOperation> = fc.oneof(
  fc.record({
    kind: fc.constantFrom("assign", "strict", "reflect", "call"),
    target: protoTargets,
    value: protoValues,
  }),
  fc.record({
    kind: fc.constantFrom("read", "proto"),
    target: protoTargets,
  }),
);
const protoCases = fc.array(protoOperation, { minLength: 1, maxLength: 8 });

function protoSource(operations: readonly ProtoOperation[]): string {
  const lines = operations.map((operation) => {
    const target = operation.target;
    switch (operation.kind) {
      case "assign":
        return (
          `console.log(attempt(() => { ${target}.__proto__ = ` +
          `${operation.value}; return "done"; }));`
        );
      case "strict":
        return (
          'console.log(attempt(() => { "use strict"; ' +
          `${target}.__proto__ = ${operation.value}; return "done"; }));`
        );
      case "reflect":
        return (
          "console.log(attempt(() => Reflect.set(" +
          `${target}, "__proto__", ${operation.value})));`
        );
      case "call":
        return (
          "console.log(attempt(() => setProto.call(" +
          `${target}, ${operation.value})));`
        );
      case "read":
        return `console.log(attempt(() => read(${target})));`;
      case "proto":
        return `console.log(attempt(() => Object.getPrototypeOf(${target})));`;
    }
  });
  return `${pool}${lines.join("\n")}\n`;
}

interface ModelObject {
  extensible: boolean;
  /** An own `__proto__` data property's value, or absent. */
  own?: ProtoValue;
  proto: ProtoValue;
}

/**
 * The clauses on the pool: [[Set]] walks to the first own `__proto__`
 * (10.1.9.2), the accessor's setter ignores a non-object value and
 * throws when [[SetPrototypeOf]] (10.1.2.1, or 10.4.7.2 for `OP`)
 * refuses, and the Proxy forwards every operation to `t`.
 */
/** The trapless Proxy forwards every operation to its target `t`. */
function resolveProtoTarget(name: ProtoTarget): string {
  return name === "px" ? "t" : name;
}

function protoExpected(operations: readonly ProtoOperation[]): string {
  const objects = new Map<string, ModelObject>([
    ["o0", { extensible: true, proto: "OP" }],
    ["o1", { extensible: true, proto: "OP" }],
    ["o2", { extensible: true, proto: "OP" }],
    ["t", { extensible: true, proto: "OP" }],
    ["n", { extensible: true, proto: "null" }],
    ["x", { extensible: false, proto: "OP" }],
    ["OP", { extensible: true, proto: "null" }],
  ]);
  const get = (name: string): ModelObject => objects.get(name)!;
  const setPrototype = (name: string, value: ProtoValue): boolean => {
    const object = get(name);
    if (object.proto === value) return true;
    if (name === "OP") return false;
    if (!object.extensible) return false;
    for (let p: ProtoValue = value; p !== "null"; p = get(p).proto) {
      if (p === name) return false;
    }
    object.proto = value;
    return true;
  };
  // The accessor's [[Set]] on an object receiver; throws on refusal.
  const setter = (name: string, value: ProtoValue): void => {
    if (value === "1") return;
    if (!setPrototype(name, value)) throw new TypeError();
  };
  const assign = (name: string, value: ProtoValue): boolean => {
    for (let current = name; ; current = get(current).proto) {
      if (current === "null" || get(current).own !== undefined) break;
      if (current === "OP") {
        setter(name, value);
        return true;
      }
    }
    const receiver = get(name);
    if (receiver.own === undefined && !receiver.extensible) return false;
    receiver.own = value;
    return true;
  };
  const lines = operations.map((operation): string => {
    const name = resolveProtoTarget(operation.target);
    try {
      switch (operation.kind) {
        case "assign":
          assign(name, operation.value);
          return "done";
        case "strict":
          if (!assign(name, operation.value)) return "TypeError";
          return "done";
        case "reflect":
          return String(assign(name, operation.value));
        case "call":
          setter(name, operation.value);
          return "undefined";
        case "read":
          for (let current = name; ; current = get(current).proto) {
            if (current === "null") return "undefined";
            const own = get(current).own;
            if (own !== undefined) return own;
            if (current === "OP") return get(name).proto;
          }
        case "proto":
          return get(name).proto;
      }
    } catch {
      return "TypeError";
    }
  });
  return `${lines.join("\n")}\n`;
}

type MethodTarget = "o0" | "o1" | "x" | "f" | "px";
type MethodKey = "k" | "j" | "1" | "sym";
type MethodOperation =
  | {
      readonly getter: boolean;
      readonly fn: "g0" | "g1" | "none";
      readonly key: MethodKey;
      readonly kind: "define";
      readonly target: MethodTarget;
    }
  | {
      readonly getter: boolean;
      readonly key: MethodKey;
      readonly kind: "lookup";
      readonly target: MethodTarget;
    }
  | {
      readonly key: MethodKey;
      readonly kind: "get";
      readonly target: MethodTarget;
    };

const methodTargets = fc.constantFrom<MethodTarget>("o0", "o1", "x", "f", "px");
const methodKeys = fc.constantFrom<MethodKey>("k", "j", "1", "sym");
const methodOperation: fc.Arbitrary<MethodOperation> = fc.oneof(
  fc.record({
    fn: fc.constantFrom("g0", "g1", "none"),
    getter: fc.boolean(),
    key: methodKeys,
    kind: fc.constant("define"),
    target: methodTargets,
  }),
  fc.record({
    getter: fc.boolean(),
    key: methodKeys,
    kind: fc.constant("lookup"),
    target: methodTargets,
  }),
  fc.record({
    key: methodKeys,
    kind: fc.constant("get"),
    target: methodTargets,
  }),
);
const methodCases = fc.array(methodOperation, { minLength: 1, maxLength: 8 });

/*
 * `o1` inherits from `o0`; `f` has a non-configurable data property `k`;
 * `px` is a trapless Proxy of `t`. Every key goes through a ToPropertyKey
 * that logs, so the order of the callability check is visible.
 */
const methodPool = `
const o0 = {};
const o1 = Object.create(o0);
const x = Object.preventExtensions({});
const f = Object.defineProperty({}, "k", { value: "fixed" });
const t = {};
const px = new Proxy(t, {});
const sym = Symbol("sym");
function g0() { return "g0"; }
function g1() { return "g1"; }
const none = 1;
let conversions = 0;
function key(value) {
  return { toString() { conversions++; return value; } };
}
function name(value) {
  if (value === g0) return "g0";
  if (value === g1) return "g1";
  return String(value);
}
function attempt(run) {
  const before = conversions;
  try { return name(run()) + " " + (conversions - before); }
  catch (error) {
    return (error instanceof TypeError ? "TypeError" : "other") + " " +
      (conversions - before);
  }
}
/** @param {object} value */
function read(value, k) { return value[k]; }
/** @param {object} value */
function warm(value) { return value.k; }
warm({ k: 0 });
warm({ j: 1, k: 2 });
`;

function methodKeySource(key: MethodKey): string {
  return key === "sym" ? "sym" : `key("${key}")`;
}

function methodSource(operations: readonly MethodOperation[]): string {
  const lines = operations.map((operation) => {
    const k = methodKeySource(operation.key);
    switch (operation.kind) {
      case "define": {
        const method = operation.getter
          ? "__defineGetter__"
          : "__defineSetter__";
        return (
          `console.log(attempt(() => ${operation.target}.${method}(` +
          `${k}, ${operation.fn})));`
        );
      }
      case "lookup": {
        const method = operation.getter
          ? "__lookupGetter__"
          : "__lookupSetter__";
        const call = `${operation.target}.${method}(${k})`;
        return `console.log(attempt(() => ${call}));`;
      }
      case "get":
        return (
          `console.log(attempt(() => read(${operation.target}, ` +
          `${operation.key === "sym" ? "sym" : `"${operation.key}"`})));`
        );
    }
  });
  return `${methodPool}${lines.join("\n")}\n`;
}

interface ModelProperty {
  configurable: boolean;
  get?: string;
  kind: "accessor" | "data";
  set?: string;
  value?: string;
}

/**
 * The clauses on the pool: the define methods check callability before
 * ToPropertyKey and apply ValidateAndApplyPropertyDescriptor (10.1.6.3)
 * with an enumerable, configurable accessor half; the lookup methods
 * return the half of the first own property on the chain, or undefined
 * for a data property.
 */
/** The prototype of each own-property holder in the method pool. */
const methodParents = new Map<string, string>([
  ["f", "OP"],
  ["o0", "OP"],
  ["o1", "o0"],
  ["t", "OP"],
  ["x", "OP"],
]);

/** ToPropertyKey runs a logging toString for every key but the symbol. */
function keyConversions(key: MethodKey): number {
  return key === "sym" ? 0 : 1;
}

function methodExpected(operations: readonly MethodOperation[]): string {
  const own = new Map<string, Map<MethodKey, ModelProperty>>([
    ["o0", new Map()],
    ["o1", new Map()],
    ["x", new Map()],
    [
      "f",
      new Map([["k", { configurable: false, kind: "data", value: "fixed" }]]),
    ],
    ["t", new Map()],
  ]);
  const lines = operations.map((operation): string => {
    const name = operation.target === "px" ? "t" : operation.target;
    const count = keyConversions(operation.key);
    switch (operation.kind) {
      case "define": {
        if (operation.fn === "none") return "TypeError 0";
        const properties = own.get(name)!;
        const current = properties.get(operation.key);
        if (current == null) {
          if (name === "x") return `TypeError ${count}`;
          properties.set(operation.key, {
            configurable: true,
            kind: "accessor",
            ...(operation.getter
              ? { get: operation.fn }
              : { set: operation.fn }),
          });
          return `undefined ${count}`;
        }
        if (!current.configurable) return `TypeError ${count}`;
        if (current.kind === "data") {
          properties.set(operation.key, {
            configurable: true,
            kind: "accessor",
            ...(operation.getter
              ? { get: operation.fn }
              : { set: operation.fn }),
          });
        } else if (operation.getter) {
          current.get = operation.fn;
        } else {
          current.set = operation.fn;
        }
        return `undefined ${count}`;
      }
      case "lookup": {
        for (
          let current: string | null = name;
          current != null && current !== "OP";
          current = methodParents.get(current) ?? null
        ) {
          const property = own.get(current)!.get(operation.key);
          if (property == null) continue;
          const half =
            property.kind === "data"
              ? undefined
              : operation.getter
                ? property.get
                : property.set;
          return `${half ?? "undefined"} ${count}`;
        }
        return `undefined ${count}`;
      }
      case "get": {
        for (
          let current: string | null = name;
          current != null && current !== "OP";
          current = methodParents.get(current) ?? null
        ) {
          const property = own.get(current)!.get(operation.key);
          if (property == null) continue;
          if (property.kind === "data") return `${property.value} 0`;
          return `${property.get ?? "undefined"} 0`;
        }
        return "undefined 0";
      }
    }
  });
  return `${lines.join("\n")}\n`;
}

async function references(
  source: string,
  deno: boolean,
): Promise<readonly { exitStatus: number; stderr: string; stdout: string }[]> {
  const directory = await host.makeTemporaryDirectory("oseo-annexb-object-");
  try {
    const path = `${directory}/case.js`;
    await host.writeTextFile(path, source);
    const observations = [
      await host.run({
        command: process.execPath,
        args: [path],
        cwd: directory,
      }),
    ];
    if (deno) {
      observations.push(
        await host.run({
          command: "deno",
          args: ["run", "--quiet", path],
          cwd: directory,
        }),
      );
    }
    return observations;
  } finally {
    await host.remove(directory);
  }
}

/** Compile `source` under one policy and run it with forced collection. */
async function observeNative(
  source: string,
  specialization: "disabled" | "enabled",
  expected: string,
): Promise<void> {
  const compiled = compileSource(
    babelFrontend,
    { source, sourceId: "generated-m5-annexb-object-accessors.js" },
    { observeSpecialization: true, specialization },
  );
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  const mir = printMir(compiled.mir);
  if (specialization === "enabled") {
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
        target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
        toolchain: nativeToolchain,
      },
      (native) => {
        assertMatchingObservations([
          { exitStatus: 0, stderr: "", stdout: expected },
          native,
        ]);
        assert.ok((native.counters?.collections ?? 0) > 0);
        if (specialization === "enabled") {
          assert.ok((native.counters?.guardMisses ?? 0) > 0);
        }
      },
    );
  } finally {
    delete process.env.OSEO_GC_EVERY_SAFEPOINT;
  }
}

test(
  "generated __proto__ writes and reads match the accessor model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "assignment, strict assignment, Reflect.set, setter calls, and reads",
      fc.asyncProperty(protoCases, async (operations) => {
        const source = protoSource(operations);
        const expected = protoExpected(operations);
        assertMatchingObservations([
          { exitStatus: 0, stderr: "", stdout: expected },
          ...(await references(source, false)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          await observeNative(source, specialization, expected);
        }
      }),
      {
        context,
        domain:
          "one to eight __proto__ assignments, strict assignments, " +
          "Reflect.set calls, setter calls, accessor reads, and prototype " +
          "reads over ordinary, null-prototype, non-extensible, Proxy, " +
          "and Object.prototype targets",
        numRuns: 12,
        profile: "Annex B Object accessors",
        seed: 0x6000_a400,
        sizeLimit: "one to eight operations over an eight-object pool",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);

test(
  "generated legacy accessor definitions and lookups match the model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "__defineGetter__, __defineSetter__, lookups, and accessor reads",
      fc.asyncProperty(methodCases, async (operations) => {
        const source = methodSource(operations);
        const expected = methodExpected(operations);
        assertMatchingObservations([
          { exitStatus: 0, stderr: "", stdout: expected },
          ...(await references(source, true)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          await observeNative(source, specialization, expected);
        }
      }),
      {
        context,
        domain:
          "one to eight legacy getter or setter definitions with callable " +
          "or non-callable values, lookups, and reads over ordinary, " +
          "inheriting, non-extensible, non-configurable, and Proxy " +
          "targets with string, index, and symbol keys",
        numRuns: 12,
        profile: "Annex B Object accessors",
        seed: 0x6000_a401,
        sizeLimit: "one to eight operations over a five-object pool",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
