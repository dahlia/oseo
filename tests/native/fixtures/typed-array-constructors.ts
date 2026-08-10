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
