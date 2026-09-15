import type { Fixture } from "../fixture.ts";

export const typedArrayCoreFixtures: readonly Fixture[] = [
  {
    name: "typed-array-core",
    source: `
const TypedArray = Object.getPrototypeOf(Int8Array);
const TypedArrayPrototype = TypedArray.prototype;
function list(view) {
  return Array.from(view).join();
}
function describeAccessor(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return [
    typeof descriptor.get,
    descriptor.get.name,
    descriptor.get.length,
    descriptor.set,
    descriptor.enumerable,
    descriptor.configurable,
  ].join(":");
}
for (const key of ["buffer", "byteLength", "byteOffset", "length"]) {
  console.log("accessor", key, describeAccessor(TypedArrayPrototype, key));
}
console.log(
  "tag accessor",
  describeAccessor(TypedArrayPrototype, Symbol.toStringTag),
);
console.log("species accessor", describeAccessor(TypedArray, Symbol.species));
for (const key of ["at", "entries", "keys", "set", "subarray", "values"]) {
  const method = TypedArrayPrototype[key];
  const descriptor = Object.getOwnPropertyDescriptor(TypedArrayPrototype, key);
  let constructible = true;
  try {
    new method();
  } catch (error) {
    constructible = !(error instanceof TypeError);
  }
  console.log(
    "method",
    key,
    method.name,
    method.length,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
    constructible,
  );
}
console.log(
  "identities",
  TypedArrayPrototype[Symbol.iterator] === TypedArrayPrototype.values,
  TypedArrayPrototype.toString === Array.prototype.toString,
  TypedArray[Symbol.species] === TypedArray,
  Uint8Array[Symbol.species] === Uint8Array,
);

const buffer = new ArrayBuffer(16, { maxByteLength: 32 });
const fixed = new Uint16Array(buffer, 4, 3);
const tracking = new Int32Array(buffer, 8);
console.log(
  "views",
  fixed.buffer === buffer,
  fixed.byteLength,
  fixed.byteOffset,
  fixed.length,
  tracking.byteLength,
  tracking.byteOffset,
  tracking.length,
  fixed[Symbol.toStringTag],
  new BigUint64Array(1)[Symbol.toStringTag],
);
buffer.resize(24);
console.log("grown", fixed.length, tracking.length, tracking.byteLength);
buffer.resize(6);
console.log(
  "shrunk",
  fixed.length,
  fixed.byteLength,
  fixed.byteOffset,
  tracking.length,
  tracking.byteOffset,
);
const getLength = Object.getOwnPropertyDescriptor(
  TypedArrayPrototype,
  "length",
).get;
const getTag = Object.getOwnPropertyDescriptor(
  TypedArrayPrototype,
  Symbol.toStringTag,
).get;
for (const receiver of [{}, new DataView(new ArrayBuffer(1)), 1, undefined]) {
  try {
    getLength.call(receiver);
  } catch (error) {
    console.log("accessor receiver", error instanceof TypeError);
  }
  console.log("tag receiver", String(getTag.call(receiver)));
}
const shadow = new Uint8Array(2);
Object.defineProperty(shadow, "length", { value: 9 });
console.log("shadowed", shadow.length, getLength.call(shadow));

const bytes = new Int8Array([1, -2, 3, -4]);
let atCalls = 0;
console.log(
  "at",
  bytes.at(0),
  bytes.at(-1),
  bytes.at(4),
  bytes.at(-5),
  bytes.at(1.9),
  bytes.at("2"),
  String(bytes.at(Infinity)),
  bytes.at({
    valueOf() {
      atCalls = atCalls + 1;
      return -2;
    },
  }),
  atCalls,
  new BigInt64Array([5n, -6n]).at(-1),
);
const shrinking = new ArrayBuffer(4, { maxByteLength: 8 });
const shrinkingView = new Uint8Array(shrinking);
shrinkingView[3] = 7;
console.log(
  "at shrink",
  String(shrinkingView.at({
    valueOf() {
      shrinking.resize(2);
      return 3;
    },
  })),
);
const detached = new Uint8Array(4);
detached.buffer.transfer();
for (const [label, run] of [
  ["at", () => detached.at(0)],
  ["values", () => detached.values()],
  ["keys", () => detached.keys()],
  ["entries", () => detached.entries()],
  ["at receiver", () => TypedArrayPrototype.at.call([1], 0)],
  ["set receiver", () => TypedArrayPrototype.set.call({}, [])],
  ["subarray receiver", () => TypedArrayPrototype.subarray.call([])],
]) {
  try {
    run();
    console.log("no throw", label);
  } catch (error) {
    console.log("validate", label, error instanceof TypeError);
  }
}
console.log(
  "detached accessors",
  detached.length,
  detached.byteLength,
  detached.byteOffset,
  detached.buffer.detached,
);

const target = new Uint8Array(6);
target.set([1, 2, 3]);
target.set({ length: 2, 0: 9, 1: "8" }, 4);
target.set("56", 3);
console.log("set array-like", list(target));
for (const [label, source, offset] of [
  ["negative", [1], -1],
  ["infinite", [], Infinity],
  ["too long", [1, 2, 3], 4],
  ["typed too long", new Int8Array(3), 4],
]) {
  try {
    target.set(source, offset);
  } catch (error) {
    console.log("set range", label, error instanceof RangeError);
  }
}
try {
  target.set(new BigInt64Array(1));
} catch (error) {
  console.log("set content", error instanceof TypeError);
}
try {
  new BigInt64Array(1).set([1]);
} catch (error) {
  console.log("set bigint conversion", error instanceof TypeError);
}
const order = [];
const ordered = new Uint8Array(3);
ordered.set(
  {
    get length() {
      order.push("length");
      return 2;
    },
    get 0() {
      order.push("get 0");
      return {
        valueOf() {
          order.push("convert 0");
          return 4;
        },
      };
    },
    get 1() {
      order.push("get 1");
      return 5;
    },
  },
  {
    valueOf() {
      order.push("offset");
      return 1;
    },
  },
);
console.log("set order", order.join(), list(ordered));
const detaching = new Uint8Array(3);
detaching.set({
  length: 3,
  0: 1,
  get 1() {
    detaching.buffer.transfer();
    return 2;
  },
  2: 3,
});
console.log("set detached mid-copy", detaching.length);
const shared = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
new Uint8Array(shared.buffer, 2, 4).set(new Uint8Array(shared.buffer, 0, 4));
console.log("set same kind overlap", list(shared));
const mixed = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
new Uint16Array(mixed.buffer, 0, 4).set(new Uint8Array(mixed.buffer, 2, 4));
console.log("set mixed overlap", list(mixed));
const floats = new Float32Array(3);
floats.set(new Float64Array([1.5, -0, 1e40]));
console.log("set float", floats[0], 1 / floats[1], floats[2]);
const clamped = new Uint8ClampedArray(3);
clamped.set(new Int16Array([-5, 300, 128]));
console.log("set clamped", list(clamped));
const bigs = new BigUint64Array(2);
bigs.set(new BigInt64Array([-1n, 2n]));
console.log("set bigint kinds", bigs[0], bigs[1]);

const base = new Int16Array([10, 20, 30, 40, 50]);
const middle = base.subarray(1, -1);
console.log(
  "subarray",
  list(middle),
  middle.byteOffset,
  middle.buffer === base.buffer,
  list(base.subarray(-2)),
  base.subarray(3, 1).length,
  base.subarray(-Infinity, Infinity).length,
  Object.getPrototypeOf(middle) === Int16Array.prototype,
);
middle[0] = 99;
console.log("subarray shares", base[1]);
const growable = new ArrayBuffer(4, { maxByteLength: 8 });
const growing = new Uint8Array(growable);
const trackingSub = growing.subarray(1);
const fixedSub = growing.subarray(1, 3);
growable.resize(8);
console.log("subarray tracking", trackingSub.length, fixedSub.length);
class Tagged extends Float64Array {}
const taggedSub = new Tagged(4).subarray(2);
console.log(
  "subarray subclass",
  taggedSub instanceof Tagged,
  taggedSub.length,
);
const speciesCalls = [];
const custom = new Uint8Array([1, 2, 3, 4]);
custom.constructor = {
  [Symbol.species]: function (...args) {
    speciesCalls.push(args.length, args[1], String(args[2]));
    return new Uint8Array(args[0], args[1], args[2]);
  },
};
console.log(
  "subarray species",
  list(custom.subarray(1, 3)),
  speciesCalls.join(),
);
const nullSpecies = new Uint8Array(2);
nullSpecies.constructor = { [Symbol.species]: null };
console.log(
  "subarray null species",
  Object.getPrototypeOf(nullSpecies.subarray(0)) === Uint8Array.prototype,
);
const undefinedConstructor = new Uint8Array(2);
undefinedConstructor.constructor = undefined;
console.log(
  "subarray undefined constructor",
  undefinedConstructor.subarray(1).length,
);
for (const [label, constructor] of [
  ["primitive constructor", 1],
  ["non-constructor species", { [Symbol.species]: () => {} }],
  [
    "non-view species",
    {
      [Symbol.species]: function () {
        return {};
      },
    },
  ],
]) {
  const view = new Uint8Array(4);
  view.constructor = constructor;
  try {
    view.subarray(0);
  } catch (error) {
    console.log("subarray species error", label, error instanceof TypeError);
  }
}

const iterated = new Uint16Array([7, 8, 9]);
console.log(
  "iterators",
  [...iterated.keys()].join(),
  [...iterated.values()].join(),
  [...iterated.entries()].join("|"),
  [...iterated].join(),
  Object.getPrototypeOf(iterated.values()) ===
    Object.getPrototypeOf([][Symbol.iterator]()),
);
const iteratorBuffer = new ArrayBuffer(3, { maxByteLength: 6 });
const liveIterated = new Uint8Array(iteratorBuffer);
const live = liveIterated.values();
console.log("live first", live.next().value);
iteratorBuffer.resize(6);
liveIterated[5] = 6;
const liveRest = [];
for (const value of live) liveRest.push(value);
console.log("live grown", liveRest.join());
const detachIterated = new Uint8Array(4);
const detachIterator = detachIterated.keys();
detachIterator.next();
detachIterated.buffer.transfer();
for (let attempt = 0; attempt < 2; attempt = attempt + 1) {
  try {
    detachIterator.next();
  } catch (error) {
    console.log("iterator detached", attempt, error instanceof TypeError);
  }
}
let loopCount = 0;
try {
  for (const value of new Uint8Array(3).entries()) {
    loopCount = loopCount + value.length;
    if (loopCount === 2) buffer.transfer();
  }
} catch (error) {
  console.log("unexpected", error);
}
console.log("iterator unrelated detach", loopCount);

const view = new Float64Array([1.5, 2.5]);
console.log(
  "canonical get",
  String(view["-0"]),
  String(view["1.5"]),
  String(view["2"]),
  String(view["1e+21"]),
  String(view["4294967295"]),
  view["1"],
  String(view["01"]),
);
console.log(
  "canonical has",
  "0" in view,
  "-0" in view,
  "1.5" in view,
  "2" in view,
  "Infinity" in view,
  "01" in view,
);
Object.prototype["-0"] = "inherited";
Object.prototype["01"] = "inherited";
console.log("canonical prototype", String(view["-0"]), view["01"]);
delete Object.prototype["-0"];
delete Object.prototype["01"];
view["-0"] = 5;
view["1.5"] = 5;
view["NaN"] = 5;
view["01"] = 5;
console.log(
  "canonical set",
  Object.keys(view).join(),
  Object.hasOwn(view, "NaN"),
  Object.hasOwn(view, "01"),
);
let invalidConversions = 0;
view["7"] = {
  valueOf() {
    invalidConversions = invalidConversions + 1;
    return 1;
  },
};
console.log("invalid set converts", invalidConversions);
const element = Object.getOwnPropertyDescriptor(view, "1");
console.log(
  "descriptor",
  element.value,
  element.writable,
  element.enumerable,
  element.configurable,
  String(Object.getOwnPropertyDescriptor(view, "2")),
  String(Object.getOwnPropertyDescriptor(view, "-0")),
);
for (const [label, descriptor] of [
  ["value", { value: 7 }],
  ["full", { value: 8, writable: true, enumerable: true, configurable: true }],
  ["generic", { enumerable: true }],
  ["non-configurable", { value: 1, configurable: false }],
  ["non-enumerable", { enumerable: false }],
  ["non-writable", { writable: false }],
  ["accessor", { get() {} }],
]) {
  console.log(
    "define",
    label,
    Reflect.defineProperty(view, "0", descriptor),
    view[0],
  );
}
console.log(
  "define invalid",
  Reflect.defineProperty(view, "2", { value: 1 }),
  Reflect.defineProperty(view, "-0", { value: 1 }),
);
try {
  Object.defineProperty(view, "5", { value: 1 });
} catch (error) {
  console.log("define throws", error instanceof TypeError);
}
console.log(
  "delete",
  delete view["2"],
  delete view["-0"],
  Reflect.deleteProperty(view, "0"),
  view[0],
);
try {
  (function () {
    "use strict";
    delete view[0];
  })();
} catch (error) {
  console.log("strict delete", error instanceof TypeError);
}
const keyed = new Uint8Array([4, 5, 6]);
keyed.extra = "x";
keyed[Symbol.iterator] = keyed[Symbol.iterator];
console.log(
  "own keys",
  Reflect.ownKeys(keyed).map(String).join(),
  Object.getOwnPropertyNames(keyed).join(),
  Object.keys(keyed).join(),
  Object.values(keyed).join(),
  JSON.stringify(Object.entries(keyed)),
);
const forIn = [];
for (const key in keyed) forIn.push(key);
console.log("for-in", forIn.join());
const { 0: first, ...rest } = keyed;
console.log(
  "copy",
  first,
  JSON.stringify(rest),
  JSON.stringify({ ...keyed }),
  JSON.stringify(Object.assign({}, keyed)),
  JSON.stringify(keyed),
  keyed.propertyIsEnumerable("1"),
  keyed.propertyIsEnumerable("3"),
);
const descriptors = Object.getOwnPropertyDescriptors(new Uint8Array([3]));
console.log("descriptors", descriptors[0].value, descriptors[0].writable);
const heir = Object.create(new Uint8Array(2));
heir[0] = 5;
heir[2] = 6;
heir["-0"] = 7;
console.log(
  "inherited set",
  Object.keys(heir).join(),
  Object.getPrototypeOf(heir)[0],
  "2" in heir,
);
const receiver = new Uint8Array(1);
console.log(
  "reflect set",
  Reflect.set({}, "0", 3, receiver),
  receiver[0],
  Reflect.set({}, "4", 3, receiver),
  Reflect.set(new Uint8Array(1), "0", 9, {}),
);
const proxied = new Proxy(new Int16Array(2), {});
proxied[1] = -3;
console.log(
  "proxy",
  proxied[1],
  Object.keys(proxied).join(),
  Reflect.has(proxied, "2"),
  Object.getOwnPropertyDescriptor(proxied, "0").writable,
  Reflect.defineProperty(proxied, "1", { value: 4 }),
  proxied[1],
  delete proxied["5"],
);

const empty = new Uint8Array(0);
Object.freeze(empty);
console.log("freeze empty", Object.isFrozen(empty), Object.isSealed(empty));
const filled = new Uint8Array(1);
try {
  Object.freeze(filled);
} catch (error) {
  console.log("integrity filled freeze", error instanceof TypeError);
}
console.log(
  "integrity filled state",
  Object.isExtensible(filled),
  Object.isFrozen(filled),
  Reflect.preventExtensions(filled),
  Object.isExtensible(Object.preventExtensions(new Uint8Array(2))),
);
for (const [label, value] of [
  ["tracking", new Uint8Array(new ArrayBuffer(0, { maxByteLength: 1 }))],
  [
    "resizable fixed",
    new Uint8Array(new ArrayBuffer(1, { maxByteLength: 2 }), 0, 0),
  ],
]) {
  for (const operation of ["freeze", "seal", "preventExtensions"]) {
    try {
      Object[operation](value);
      console.log("integrity", label, operation, "ok");
    } catch (error) {
      console.log("integrity", label, operation, error instanceof TypeError);
    }
  }
  console.log(
    "integrity state",
    label,
    Object.isExtensible(value),
    Object.isSealed(value),
    Reflect.preventExtensions(value),
  );
}

let checksum = 0n;
for (let round = 0; round < 40; round = round + 1) {
  const big = new BigInt64Array([BigInt(round), -BigInt(round)]);
  const copy = big.subarray(0);
  for (const [index, value] of copy.entries()) checksum = checksum + value;
  checksum = checksum + big.at(-1) + copy[0];
  checksum = checksum + Object.getOwnPropertyDescriptor(big, "0").value;
}
console.log("collected", checksum);
function elementAt(view, index: number) {
  return view[index];
}
let lengths = 0;
const guarded = new Uint8Array([3, 4, 5]);
for (const index of [0, 1, 2, "1", 1.5, -0]) {
  lengths = lengths + Number(elementAt(guarded, index) ?? 10);
}
console.log("guarded lengths", lengths);
`,
  },
];
