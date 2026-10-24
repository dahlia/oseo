import fc from "fast-check";

/** Descriptor/Proxy outcomes, independent of source rendering and lookup. */
export type SetDescriptor =
  | "setter"
  | "throwing-setter"
  | "no-setter"
  | "writable"
  | "readonly"
  | "missing"
  | "proxy-true"
  | "proxy-false"
  | "proxy-throw";

/** Shrinking preserves all receiver kinds and two stores per receiver. */
export interface PrimitiveSetCase {
  readonly callerStrict: boolean;
  readonly setterStrict: boolean;
  readonly descriptor: SetDescriptor;
  readonly key: "string" | "symbol" | "index" | "outside-index" | "length";
  readonly integer: number;
  readonly depth: number;
}

export const primitiveSetCases: fc.Arbitrary<PrimitiveSetCase> = fc.record({
  callerStrict: fc.boolean(),
  setterStrict: fc.boolean(),
  descriptor: fc.constantFrom<SetDescriptor>(
    "setter",
    "throwing-setter",
    "no-setter",
    "writable",
    "readonly",
    "missing",
    "proxy-true",
    "proxy-false",
    "proxy-throw",
  ),
  key: fc.constantFrom<PrimitiveSetCase["key"]>(
    "string",
    "symbol",
    "index",
    "outside-index",
    "length",
  ),
  integer: fc.integer({ min: -1000, max: 1000 }),
  depth: fc.integer({ min: 0, max: 2 }),
});

const kinds = [
  "boolean",
  "number",
  "string",
  "symbol",
  "bigint",
  "object",
  "null",
  "undefined",
] as const;

/** ECMA-262 PutValue/OrdinarySet model; never executes generated JS. */
export function primitiveSetExpected(value: PrimitiveSetCase): string {
  const lines: string[] = [];
  for (const kind of kinds) {
    const nullish = kind === "null" || kind === "undefined";
    const blocked =
      kind === "string" && (value.key === "index" || value.key === "length");
    const descriptor = blocked ? "readonly" : value.descriptor;
    const setter =
      !nullish && (descriptor === "setter" || descriptor === "throwing-setter");
    for (let write = 0; write < 2; write++) {
      const trace = ["base", "key", "rhs"];
      let outcome = "ok:true";
      if (nullish) outcome = "TypeError";
      else {
        trace.push("convert");
        if (setter) {
          const receiverKind = value.setterStrict ? kind : "object";
          const same = value.setterStrict || kind === "object";
          trace.push(`set:${receiverKind}:${same}:true:true`);
          if (descriptor === "throwing-setter") outcome = "thrown";
        } else if (descriptor.startsWith("proxy-")) {
          trace.push(`trap:${kind}:true:true:true`);
          if (descriptor === "proxy-throw") outcome = "thrown";
          else if (descriptor === "proxy-false" && value.callerStrict) {
            outcome = "TypeError";
          }
        } else if (
          value.callerStrict &&
          (descriptor === "readonly" ||
            descriptor === "no-setter" ||
            kind !== "object")
        )
          outcome = "TypeError";
      }
      lines.push(`${kind} ${outcome} ${trace.join(",")}`);
    }
    lines.push(`fresh ${setter && !value.setterStrict && kind !== "object"}`);
    if (kind === "object") {
      const stored = descriptor === "writable" || descriptor === "missing";
      lines.push(`own ${stored} ${stored}`);
    }
  }
  return lines.join("\n") + "\n";
}

/** Render only admitted Script syntax; each prototype is restored per kind. */
export function primitiveSetProgram(value: PrimitiveSetCase): string {
  const key =
    value.key === "symbol"
      ? 'Symbol("key")'
      : JSON.stringify(
          value.key === "index"
            ? "0"
            : value.key === "outside-index"
              ? "3"
              : value.key === "length"
                ? "length"
                : "probe",
        );
  const descriptor = value.descriptor;
  const define =
    descriptor === "missing"
      ? ""
      : descriptor === "setter" || descriptor === "throwing-setter"
        ? `
Object.defineProperty(owner, propertyKey, {
  configurable: true,
  get() { throw "getter must not run"; },
  set: function (value) {
    ${value.setterStrict ? '"use strict";' : ""}
    boxes.push(this);
    const unboxed = intrinsic ? intrinsic.prototype.valueOf.call(this) : this;
    trace.push("set:" + typeof this + ":" + Object.is(this, primitive) +
      ":" + Object.is(unboxed, primitive) + ":" + (value === payload));
    const live = [{ value }, { receiver: this }, { key: propertyKey }];
    if (live[0].value !== payload) throw "lost value";
    ${descriptor === "throwing-setter" ? "throw thrown;" : ""}
  },
});`
        : descriptor === "no-setter"
          ? `
Object.defineProperty(owner, propertyKey, {
  configurable: true, get() { throw "getter must not run"; },
});`
          : descriptor.startsWith("proxy-")
            ? `
owner = new Proxy(owner, {
  set(target, key, value, receiver) {
    trace.push("trap:" + typeof receiver + ":" +
      Object.is(receiver, primitive) + ":" + (key === propertyKey) +
      ":" + (value === payload));
    ${
      descriptor === "proxy-throw"
        ? "throw thrown;"
        : `return ${descriptor === "proxy-true"};`
    }
  },
});`
            : `
Object.defineProperty(owner, propertyKey, {
  configurable: true, value: "old", writable: ${descriptor === "writable"},
});`;
  return `
const primitives = [false, ${value.integer}, "a\\ud800b", Symbol("live"),
  ${BigInt(value.integer) ** 5n}n, {}, null, undefined];
const intrinsics = [Boolean, Number, String, Symbol, BigInt];
const kinds = ${JSON.stringify(kinds)};
const propertyKey = ${key};
for (let index = 0; index < primitives.length; index++) {
  const primitive = primitives[index];
  const intrinsic = intrinsics[index];
  const prototype = intrinsic ? intrinsic.prototype : null;
  const oldParent = prototype ? Object.getPrototypeOf(prototype) : null;
  const boxes = [];
  const payload = { marker: ${value.integer} };
  const thrown = { marker: "thrown" };
  let trace = [];
  let owner = Object.create(oldParent);
  ${define}
  for (let depth = 0; depth < ${value.depth}; depth++) {
    owner = Object.create(owner);
  }
  let baseValue = primitive;
  if (prototype) Object.setPrototypeOf(prototype, owner);
  else if (index === 5) Object.setPrototypeOf(primitive, owner);
  function base() { trace.push("base"); return baseValue; }
  function key() { trace.push("key"); return {
    [Symbol.toPrimitive]() { trace.push("convert"); return propertyKey; },
  }; }
  function rhs() { trace.push("rhs"); return payload; }
  function write() {
    ${value.callerStrict ? '"use strict";' : ""}
    return base()[key()] = rhs();
  }
  for (let writeIndex = 0; writeIndex < 2; writeIndex++) {
    trace = [];
    let outcome;
    try { outcome = "ok:" + (write() === payload); }
    catch (error) {
      outcome = error === thrown ? "thrown" :
        error instanceof TypeError ? "TypeError" : "unexpected";
    }
    console.log(kinds[index], outcome, trace.join(","));
  }
  console.log("fresh", boxes.length === 2 && boxes[0] !== boxes[1]);
  if (index === 5) {
    const own = Object.getOwnPropertyDescriptor(primitive, propertyKey);
    console.log("own", own !== undefined, !!own && own.value === payload);
  }
  if (prototype) Object.setPrototypeOf(prototype, oldParent);
}
`;
}

/** Fixed native subjects guarantee boundaries that random draws may miss. */
export function primitiveSetBoundaries(): readonly PrimitiveSetCase[] {
  const values: PrimitiveSetCase[] = [];
  for (const callerStrict of [false, true]) {
    for (const setterStrict of [false, true]) {
      for (const key of ["string", "symbol"] as const) {
        values.push({
          callerStrict,
          setterStrict,
          key,
          descriptor: "setter",
          integer: -7,
          depth: 2,
        });
      }
    }
    for (const descriptor of [
      "throwing-setter",
      "no-setter",
      "writable",
      "readonly",
      "missing",
      "proxy-true",
      "proxy-false",
      "proxy-throw",
    ] as const) {
      values.push({
        callerStrict,
        setterStrict: true,
        descriptor,
        key: "symbol",
        integer: 7,
        depth: 1,
      });
    }
  }
  for (const key of ["index", "outside-index", "length"] as const) {
    values.push({
      callerStrict: true,
      setterStrict: true,
      key,
      descriptor: "setter",
      integer: 7,
      depth: 0,
    });
  }
  return values;
}
