import type { Fixture } from "../fixture.ts";

export const typedArrayConstructorFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "typed-array-constructors",
    source: `
const constructors = [
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
];
const bytes = [1, 1, 1, 2, 2, 4, 4, 4, 8, 8, 8];
const TypedArray = Object.getPrototypeOf(Int8Array);
const TypedArrayPrototype = Object.getPrototypeOf(Int8Array.prototype);
console.log(
  "abstract",
  TypedArray.name,
  TypedArray.length,
  TypedArrayPrototype.constructor === TypedArray,
  Object.getPrototypeOf(TypedArrayPrototype) === Object.prototype,
);
try {
  new TypedArray();
} catch (error) {
  console.log("abstract construct", error instanceof TypeError);
}
for (let index = 0; index < constructors.length; index = index + 1) {
  const Constructor = constructors[index];
  const descriptor = Object.getOwnPropertyDescriptor(
    this,
    Constructor.name,
  );
  console.log(
    "metadata",
    Constructor.name,
    Constructor.length,
    Constructor.BYTES_PER_ELEMENT,
    Constructor.prototype.BYTES_PER_ELEMENT,
    Constructor.prototype.constructor === Constructor,
    Object.getPrototypeOf(Constructor) === TypedArray,
    Object.getPrototypeOf(Constructor.prototype) === TypedArrayPrototype,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
    bytes[index],
  );
  const empty = new Constructor();
  const byLength = new Constructor(3);
  console.log(
    "length path",
    Constructor.name,
    empty instanceof Constructor,
    ArrayBuffer.isView(empty),
    byLength[0],
    byLength[2],
    byLength[3],
  );
  try {
    Constructor(1);
  } catch (error) {
    console.log("call", Constructor.name, error instanceof TypeError);
  }
}
const signed = new Int8Array([130, -129, 3.9, NaN, Infinity]);
console.log(
  "signed conversion",
  signed[0],
  signed[1],
  signed[2],
  signed[3],
  signed[4],
);
const unsigned = new Uint32Array([-1, 4294967297, 3.9, NaN]);
console.log(
  "unsigned conversion",
  unsigned[0],
  unsigned[1],
  unsigned[2],
  unsigned[3],
);
const clamped = new Uint8ClampedArray([
  -1,
  0.5,
  1.5,
  2.5,
  254.5,
  255.5,
]);
console.log(
  "clamped conversion",
  clamped[0],
  clamped[1],
  clamped[2],
  clamped[3],
  clamped[4],
  clamped[5],
);
const floating = new Float32Array([1 / 3, Infinity, -Infinity, NaN]);
console.log(
  "float conversion",
  floating[0],
  floating[1],
  floating[2],
  Number.isNaN(floating[3]),
);
const floatEdges = new Float32Array([
  3.4028234663852886e38,
  3.4028235170913126e38,
  3.4028235677973366e38,
  -3.4028234663852886e38,
  -3.4028235170913126e38,
  -3.4028235677973366e38,
]);
console.log(
  "float edges",
  floatEdges[0],
  floatEdges[1],
  floatEdges[2],
  floatEdges[3],
  floatEdges[4],
  floatEdges[5],
);
const bigSigned = new BigInt64Array([-1n, 9223372036854775808n]);
const bigUnsigned = new BigUint64Array([-1n, 18446744073709551617n]);
console.log(
  "bigint conversion",
  bigSigned[0],
  bigSigned[1],
  bigUnsigned[0],
  bigUnsigned[1],
);
try {
  new BigInt64Array([1]);
} catch (error) {
  console.log("bigint number mismatch", error instanceof TypeError);
}
try {
  new Uint8Array([1n]);
} catch (error) {
  console.log("number bigint mismatch", error instanceof TypeError);
}
const buffer = new ArrayBuffer(4);
const bytesView = new Uint8Array(buffer);
const wordsView = new Uint16Array(buffer);
bytesView[0] = 52;
bytesView[1] = 18;
console.log(
  "buffer path",
  wordsView[0],
  new Uint8Array(buffer, 1, 2)[0],
  new Uint8Array(buffer, 1, 2)[1],
  ArrayBuffer.isView(bytesView),
);
try {
  new Uint16Array(buffer, 1);
} catch (error) {
  console.log("unaligned buffer", error instanceof RangeError);
}
try {
  new Uint16Array(buffer, 0, 3);
} catch (error) {
  console.log("oversized buffer", error instanceof RangeError);
}
const detachedDuringLength = new ArrayBuffer(4);
try {
  new Uint8Array(detachedDuringLength, 0, {
    valueOf() {
      detachedDuringLength.transfer();
      return 1;
    },
  });
} catch (error) {
  console.log("detached during length", error instanceof TypeError);
}
const arrayLike = new Int16Array({
  0: 7,
  1: -9,
  length: 2,
  [Symbol.iterator]: null,
});
console.log("array-like path", arrayLike[0], arrayLike[1], arrayLike[2]);
const iterable = new Uint8Array([3, 5, 8]);
console.log("iterable path", iterable[0], iterable[1], iterable[2]);
console.log("index ownership", 0 in iterable, 3 in iterable);
const propertyIsEnumerable = Object.prototype.propertyIsEnumerable;
console.log(
  "index enumerable",
  propertyIsEnumerable.call(iterable, "0"),
  propertyIsEnumerable.call(iterable, "2"),
  propertyIsEnumerable.call(iterable, "3"),
  propertyIsEnumerable.call(iterable, "-0"),
  propertyIsEnumerable.call(iterable, "1.5"),
  propertyIsEnumerable.call(iterable, "4294967295"),
);
const nullPrototypeTag = new Uint8Array(0);
Object.setPrototypeOf(nullPrototypeTag, null);
console.log(
  "null prototype tag",
  nullPrototypeTag[Symbol.toStringTag],
  Object.prototype.toString.call(nullPrototypeTag),
);
const customPrototypeTag = new Uint8Array(0);
Object.setPrototypeOf(customPrototypeTag, {
  [Symbol.toStringTag]: "CustomTypedArray",
});
console.log(
  "custom prototype tag",
  customPrototypeTag[Symbol.toStringTag],
  Object.prototype.toString.call(customPrototypeTag),
);
function observeIterator(label, value) {
  const spread = [...value];
  const [first, second] = value;
  let loop = "";
  for (const item of value) loop = loop + item;
  console.log(label, spread[0], spread[1], first, second, loop);
}
const customPrototypeIterator = new Uint8Array(0);
Object.setPrototypeOf(customPrototypeIterator, {
  [Symbol.iterator]: function () {
    return [4, 6][Symbol.iterator]();
  },
});
observeIterator("custom prototype iterator", customPrototypeIterator);
const ownIterator = new Uint8Array(0);
Object.defineProperty(ownIterator, Symbol.iterator, {
  value: function () { return [5, 7][Symbol.iterator](); },
});
observeIterator("own iterator", ownIterator);
const proxyStepIterator = [21, 23][Symbol.iterator]();
const proxyIterable = {
  [Symbol.iterator]: new Proxy(function () {
    return {
      next: new Proxy(function () { return proxyStepIterator.next(); }, {}),
    };
  }, {}),
};
const proxyIterated = new Uint8Array(proxyIterable);
console.log(
  "callable proxy iterator",
  proxyIterated[0],
  proxyIterated[1],
  proxyIterated[2],
);
const nullPrototypeIterator = new Uint8Array(0);
Object.setPrototypeOf(nullPrototypeIterator, null);
for (const consume of [
  function () { for (const value of nullPrototypeIterator) void value; },
  function () { return [...nullPrototypeIterator]; },
  function () { const [value] = nullPrototypeIterator; return value; },
]) {
  try {
    consume();
  } catch (error) {
    console.log("null prototype iterator", error instanceof TypeError);
  }
}
const typedCopy = new Int16Array(iterable);
iterable[0] = 99;
console.log(
  "typed path",
  typedCopy[0],
  typedCopy[1],
  typedCopy[2],
  iterable[0],
);
try {
  new BigInt64Array(iterable);
} catch (error) {
  console.log("typed content mismatch", error instanceof TypeError);
}
const bigClone = new BigInt64Array(
  new BigInt64Array([-1n, 9223372036854775807n, -9223372036854775808n]),
);
const bigUnsignedClone = new BigUint64Array(
  new BigUint64Array([18446744073709551615n, 9223372036854775808n]),
);
const bigConverted = new BigUint64Array(bigClone);
console.log(
  "same kind bigint clone",
  bigClone[0],
  bigClone[1],
  bigClone[2],
  bigClone[3],
  bigUnsignedClone[0],
  bigUnsignedClone[1],
  bigConverted[0],
  bigConverted[1],
  bigConverted[2],
);
const floatSource = new Float64Array([NaN, -0, 1.5, Infinity]);
const floatClone = new Float64Array(floatSource);
floatSource[2] = 7;
const floatConverted = new Float32Array(floatSource);
console.log(
  "same kind float clone",
  Number.isNaN(floatClone[0]),
  1 / floatClone[1],
  floatClone[2],
  floatClone[3],
  Number.isNaN(floatConverted[0]),
  1 / floatConverted[1],
  floatConverted[2],
  floatConverted[3],
);
const offsetCloneBuffer = new ArrayBuffer(24, { maxByteLength: 32 });
const offsetCloneSource = new Float64Array(offsetCloneBuffer, 8);
offsetCloneSource[0] = 2.5;
offsetCloneSource[1] = -3.25;
offsetCloneBuffer.resize(32);
offsetCloneSource[2] = 4.75;
const offsetClone = new Float64Array(offsetCloneSource);
offsetCloneSource[0] = 0;
console.log(
  "offset clone",
  offsetClone[0],
  offsetClone[1],
  offsetClone[2],
  offsetClone[3],
);
let outOfBoundsConversions = 0;
const outOfBoundsNumber = new Uint8Array(0);
outOfBoundsNumber[1] = {
  valueOf() {
    outOfBoundsConversions = outOfBoundsConversions + 1;
    return 7;
  },
};
console.log("out-of-bounds number set", outOfBoundsConversions);
try {
  new BigInt64Array(0)[1] = 1;
} catch (error) {
  console.log("out-of-bounds bigint set", error instanceof TypeError);
}
const fixedCopyBuffer = new ArrayBuffer(4, { maxByteLength: 8 });
const fixedCopySource = new Uint8Array(fixedCopyBuffer, 1, 2);
fixedCopyBuffer.resize(1);
try {
  new Uint8Array(fixedCopySource);
} catch (error) {
  console.log("out-of-bounds fixed copy", error instanceof TypeError);
}
const trackingCopyBuffer = new ArrayBuffer(4, { maxByteLength: 8 });
const trackingCopySource = new Uint8Array(trackingCopyBuffer, 2);
trackingCopyBuffer.resize(1);
try {
  new Uint8Array(trackingCopySource);
} catch (error) {
  console.log("out-of-bounds tracking copy", error instanceof TypeError);
}
const shadowedAccessors = new Uint8Array(0);
for (const name of ["length", "byteLength", "byteOffset", "buffer"]) {
  Object.defineProperty(shadowedAccessors, name, {
    value: "own " + name,
    writable: true,
  });
  shadowedAccessors[name] = "updated " + name;
  console.log("own accessor shadow", name, shadowedAccessors[name]);
}
const detachedAccessors = new Uint8Array(0);
Object.setPrototypeOf(detachedAccessors, null);
for (const name of ["length", "byteLength", "byteOffset", "buffer"]) {
  console.log(
    "null prototype accessor before",
    name,
    name in detachedAccessors,
    detachedAccessors[name],
  );
  detachedAccessors[name] = "ordinary " + name;
  console.log(
    "null prototype accessor after",
    name,
    name in detachedAccessors,
    detachedAccessors[name],
    Object.prototype.hasOwnProperty.call(detachedAccessors, name),
  );
}
const shadowedMethod = new Uint8Array(0);
Object.defineProperty(shadowedMethod, "map", { value: "own map" });
console.log("own method shadow", shadowedMethod.map);
const customMethod = new Uint8Array(0);
Object.setPrototypeOf(customMethod, { map: "custom map" });
console.log("custom method shadow", customMethod.map);
Object.defineProperty(Uint8Array, "from", { value: "own from" });
console.log("own static shadow", Uint8Array.from);
const indexedHasOwn = new Uint8Array(1);
console.log(
  "indexed has own",
  Object.hasOwn(indexedHasOwn, "0"),
  Object.hasOwn(indexedHasOwn, "1"),
);
const proxiedIndexes = new Proxy(new Uint8Array([31, 37]), {});
const proxiedDescriptor = Object.getOwnPropertyDescriptor(proxiedIndexes, "0");
console.log(
  "proxy index descriptor",
  Object.hasOwn(proxiedIndexes, "0"),
  Object.hasOwn(proxiedIndexes, "2"),
  propertyIsEnumerable.call(proxiedIndexes, "1"),
  propertyIsEnumerable.call(proxiedIndexes, "2"),
  proxiedDescriptor.value,
  proxiedDescriptor.writable,
  proxiedDescriptor.enumerable,
  proxiedDescriptor.configurable,
  Object.getOwnPropertyDescriptor(proxiedIndexes, "2") === undefined,
);
const proxiedBigIndexes = new Proxy(new BigInt64Array([41n]), {});
console.log(
  "proxy bigint index descriptor",
  Object.getOwnPropertyDescriptor(proxiedBigIndexes, "0").value,
  Object.hasOwn(proxiedBigIndexes, "0"),
);
const reflectSetView = new Uint8Array(2);
console.log(
  "reflect indexed set",
  Reflect.set(reflectSetView, "0", 7),
  reflectSetView[0],
  Reflect.set(reflectSetView, "1", 9, reflectSetView),
  reflectSetView[1],
  Reflect.set(reflectSetView, "5", 3),
  Object.hasOwn(reflectSetView, "5"),
);
const reflectSetBigView = new BigInt64Array(1);
console.log(
  "reflect bigint indexed set",
  Reflect.set(reflectSetBigView, "0", 5n),
  reflectSetBigView[0],
);
const proxiedWriteView = new Uint8Array(2);
const transparentWrites = new Proxy(proxiedWriteView, {});
transparentWrites[0] = 11;
transparentWrites["1"] = 13;
transparentWrites[5] = 17;
console.log(
  "transparent proxy indexed set",
  proxiedWriteView[0],
  proxiedWriteView[1],
  Reflect.set(transparentWrites, "0", 19),
  proxiedWriteView[0],
  Object.hasOwn(proxiedWriteView, "5"),
  transparentWrites[5],
);
const foreignBase = new Uint8Array([3, 4]);
const foreignReceiver = new Uint8Array(2);
const shortForeignReceiver = new Uint8Array(1);
const plainBaseReceiver = new Uint8Array(1);
console.log(
  "foreign typed receiver set",
  Reflect.set(foreignBase, "0", 9, foreignReceiver),
  foreignReceiver[0],
  foreignBase[0],
  Reflect.set(foreignBase, "1", 9, shortForeignReceiver),
  shortForeignReceiver[0],
  Reflect.set({}, "0", 7, plainBaseReceiver),
  plainBaseReceiver[0],
);
const nestedWriteView = new Uint8Array(1);
const nestedWrites = new Proxy(new Proxy(nestedWriteView, {}), {});
nestedWrites[0] = 21;
console.log(
  "nested proxy indexed set",
  nestedWriteView[0],
  Reflect.set(nestedWrites, "0", 23),
  nestedWriteView[0],
);
const shrinkingBuffer = new ArrayBuffer(1, { maxByteLength: 1 });
const shrinkingView = new Uint8Array(shrinkingBuffer);
let shrinkObserved = 0;
const shrinkingProxy = new Proxy(shrinkingView, {
  getOwnPropertyDescriptor(target, key) {
    if (key === "0") {
      shrinkObserved = shrinkObserved + 1;
      shrinkingBuffer.resize(0);
      return undefined;
    }
    return Reflect.getOwnPropertyDescriptor(target, key);
  },
});
console.log(
  "shrunk during receiver lookup",
  Reflect.set(shrinkingProxy, "0", 7),
  shrinkObserved,
  shrinkingView[0],
);
class Derived extends Uint8Array {}
const derived = new Derived([4, 6]);
console.log(
  "subclass",
  derived instanceof Derived,
  derived instanceof Uint8Array,
  Object.getPrototypeOf(derived) === Derived.prototype,
  derived[0],
  derived[1],
);
const numberPrototypeTarget = function () {};
numberPrototypeTarget.prototype = 7;
console.log(
  "non-object prototype fallback",
  Object.getPrototypeOf(
    Reflect.construct(Uint8Array, [1], numberPrototypeTarget),
  ) === Uint8Array.prototype,
);
const revocable = Proxy.revocable(function () {}, {
  get(target, key, receiver) {
    if (key === "prototype") {
      revocable.revoke();
      return null;
    }
    return Reflect.get(target, key, receiver);
  },
});
try {
  Reflect.construct(Uint8Array, [1], revocable.proxy);
} catch (error) {
  console.log("revoked realm fallback", error instanceof TypeError);
}
try {
  new Uint8Array(-1);
} catch (error) {
  console.log("negative length", error instanceof RangeError);
}
try {
  new Uint8Array(Symbol("length"));
} catch (error) {
  console.log("symbol length", error instanceof TypeError);
}
let discarded = 0;
for (let index = 0; index < 64; index = index + 1) {
  const temporary = new Uint32Array([index, index + 1, index + 2]);
  discarded = discarded + temporary[0] + temporary[2];
}
console.log("collection pressure", discarded, typedCopy[1]);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
const original = Uint8Array;
Uint8Array = 7;
console.log("global write", Uint8Array, this.Uint8Array === Uint8Array);
Uint8Array = original;
console.log("global restore", Uint8Array === original);
`,
  },
];
