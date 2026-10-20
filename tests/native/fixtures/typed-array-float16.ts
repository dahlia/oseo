import type { Fixture } from "../fixture.ts";

/*
 * Float16Array, the twelfth concrete TypedArray constructor. It stays in
 * its own file so the constructor fixtures the exclusion audit pins as
 * replacement evidence keep their reviewed bytes.
 */
export const typedArrayFloat16Fixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "typed-array-float16",
    source: `
// ECMA-262 2025 Table 73: Float16Array, element type Float16, two bytes.
const TypedArray = Object.getPrototypeOf(Int8Array);
const descriptor = Object.getOwnPropertyDescriptor(this, "Float16Array");
const bytesDescriptor = Object.getOwnPropertyDescriptor(
  Float16Array,
  "BYTES_PER_ELEMENT",
);
console.log("typeof", typeof Float16Array, typeof this.Float16Array);
console.log(
  "metadata",
  Float16Array.name,
  Float16Array.length,
  Float16Array.BYTES_PER_ELEMENT,
  Float16Array.prototype.BYTES_PER_ELEMENT,
  Float16Array.prototype.constructor === Float16Array,
  Object.getPrototypeOf(Float16Array) === TypedArray,
  Object.getPrototypeOf(Float16Array.prototype) === TypedArray.prototype,
  descriptor.value === Float16Array,
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
  bytesDescriptor.writable,
  bytesDescriptor.enumerable,
  bytesDescriptor.configurable,
);
console.log(
  "tag",
  new Float16Array(1)[Symbol.toStringTag],
  Object.prototype.toString.call(new Float16Array(0)),
);
try {
  Float16Array(1);
} catch (error) {
  console.log("call", error instanceof TypeError);
}
function show(value) {
  return Object.is(value, -0) ? "-0" : String(value);
}
// Each value rounds once, directly from binary64, ties to even. The
// 1 + 2 ** -11 + 2 ** -40 case would round to 1 through binary32 first.
const inputs = [
  0, -0, 1, 1 / 3, 65504, 65519.99, 65520, -65520, 2 ** -14, 2 ** -24,
  2 ** -25, 2 ** -25 + 2 ** -40, 3 * 2 ** -25, 1 + 2 ** -11,
  1 + 3 * 2 ** -11, 1 + 2 ** -11 + 2 ** -40, 2049, 2051, 1e-8, -1e-8,
  Infinity, -Infinity, NaN, "7.5", true,
];
const halves = new Float16Array(inputs);
const shown = [];
for (let index = 0; index < halves.length; index = index + 1) {
  shown.push(show(halves[index]));
}
console.log("conversion", halves.length, shown.join(" "));
const assigned = new Float16Array(2);
assigned[0] = 65519.99;
assigned[1] = { valueOf() { return -(2 ** -25 + 2 ** -40); } };
console.log("assignment", show(assigned[0]), show(assigned[1]));
try {
  new Float16Array([1n]);
} catch (error) {
  console.log("bigint source", error instanceof TypeError);
}
try {
  new BigInt64Array(new Float16Array(1));
} catch (error) {
  console.log("number source", error instanceof TypeError);
}
const fromTyped = new Float16Array(new Float64Array([0.1, -65536, 2 ** -26]));
const toTyped = new Float32Array(new Float16Array([0.1, 1 / 3]));
console.log(
  "typed paths",
  show(fromTyped[0]),
  show(fromTyped[1]),
  show(fromTyped[2]),
  toTyped[0],
  toTyped[1],
);
const fromIterable = new Float16Array(new Set([1.5, 2.5]));
const fromArrayLike = new Float16Array({ length: 2, 0: 0.5, 1: "2" });
console.log(
  "object paths",
  fromIterable[0],
  fromIterable[1],
  fromArrayLike[0],
  fromArrayLike[1],
);
const buffer = new ArrayBuffer(8);
const window = new Float16Array(buffer, 2, 2);
const view = new DataView(buffer);
window[0] = 1.5;
view.setFloat16(4, -2.5, true);
console.log(
  "buffer path",
  window.length,
  window.byteOffset,
  window.byteLength,
  view.getUint16(2, true),
  window[1],
  view.getFloat16(2, true),
);
view.setUint16(2, 0x7e01, true);
console.log("nan bits", Number.isNaN(window[0]));
try {
  new Float16Array(buffer, 1);
} catch (error) {
  console.log("misaligned offset", error instanceof RangeError);
}
try {
  new Float16Array(new ArrayBuffer(3));
} catch (error) {
  console.log("odd byte length", error instanceof RangeError);
}
const sorted = new Float16Array([3, NaN, 0, -0, -1, 65504]).sort();
const sortedShown = [];
for (let index = 0; index < sorted.length; index = index + 1) {
  sortedShown.push(show(sorted[index]));
}
console.log(
  "methods",
  sortedShown.join(" "),
  sorted.includes(NaN),
  sorted.indexOf(NaN),
  new Float16Array(2).fill(1 / 3).join(","),
  new Float16Array([1, 2, 3]).map((value) => value / 3).join(","),
  new Float16Array([1, 2, 3]).subarray(1) instanceof Float16Array,
  new Float16Array([1, 2, 3]).slice(1).constructor === Float16Array,
);
const target = new Float16Array(3);
target.set(new Float64Array([0.1, 0.2]), 1);
console.log("set", target.join(","));
for (const operation of ["load", "store", "add"]) {
  try {
    Atomics[operation](new Float16Array(2), 0, 1);
    console.log("atomics", operation, "accepted");
  } catch (error) {
    console.log("atomics", operation, error instanceof TypeError);
  }
}
let discarded = 0;
for (let index = 0; index < 64; index = index + 1) {
  const temporary = new Float16Array([index, index + 0.5, index + 2]);
  discarded = discarded + temporary[0] + temporary[2];
}
console.log("collection pressure", discarded, halves[3]);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
const original = Float16Array;
Float16Array = 7;
console.log("global write", Float16Array, this.Float16Array === Float16Array);
Float16Array = original;
console.log("global restore", Float16Array === original);
`,
  },
];
