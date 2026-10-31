import type { Fixture } from "../fixture.ts";

// Core replacement evidence for four upstream paths whose only rejected
// operation is optional Annex B: a __proto__ accessor read or write, or a
// legacy regular expression escape. Each program keeps the upstream core
// assertions and checks value and type with Object.is before printing one
// line. The comparator first proves it rejects six near-miss values; that
// verdict counts rejections independently of the comparator under test.
const comparator = String.raw`
function check(value) {
  if (value !== true) throw new Error("annex b core evidence failed");
}
function same(actual, expected) {
  check(Object.is(actual, expected));
}
let mutationsRejected = 0;
const mutations = [
  [1, "1"], [undefined, "undefined"], [null, undefined],
  [true, "true"], [0, -0], [10, "10"],
];
for (let i = 0; i < mutations.length; i++) {
  try { same(mutations[i][0], mutations[i][1]); }
  catch (error) { mutationsRejected = mutationsRejected + 1; }
}
// Keep this verdict independent of the comparator under test.
check(mutations.length === 6 && mutationsRejected === 6);
same(NaN, NaN);
`;

export const annexBMixedCoreFixtures: readonly Fixture[] = [
  {
    name: "annex-b-core-typed-array-no-species",
    source: `${comparator}
// TypedArrayConstructors/ctors/no-species.js reads the clone's buffer
// prototype through the Annex B accessor; Object.getPrototypeOf reads the
// same [[Prototype]] slot.
let throwOnGrossBufferConstruction = false;
let constructions = 0;
let speciesReads = 0;
class GrossBuffer extends ArrayBuffer {
  constructor() {
    super(...arguments);
    constructions = constructions + 1;
    if (throwOnGrossBufferConstruction) throw new Error("unreachable");
  }
  static get [Symbol.species]() {
    speciesReads = speciesReads + 1;
    throw new Error("unreachable");
  }
}
let grossBuf = new GrossBuffer(1024);
same(Object.getPrototypeOf(grossBuf), GrossBuffer.prototype);
same(constructions, 1);
throwOnGrossBufferConstruction = true;
let grossTA = new Uint8Array(grossBuf);
same(grossTA.buffer, grossBuf);
let mysteryTA = new Int8Array(grossTA);
same(Object.getPrototypeOf(mysteryTA.buffer), ArrayBuffer.prototype);
same(mysteryTA.buffer.constructor, ArrayBuffer);
same(mysteryTA.buffer === grossBuf, false);
same(mysteryTA.length, 1024);
same(mysteryTA.buffer.byteLength, 1024);
const constructors = [
  Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
  Int32Array, Uint32Array, Float16Array, Float32Array, Float64Array,
  BigInt64Array, BigUint64Array,
];
let clones = 0;
for (let i = 0; i < constructors.length; i++) {
  const Constructor = constructors[i];
  const source = new Constructor(grossBuf);
  const clone = new Constructor(source);
  same(Object.getPrototypeOf(clone.buffer), ArrayBuffer.prototype);
  same(clone.buffer.constructor, ArrayBuffer);
  same(Object.getPrototypeOf(clone), Constructor.prototype);
  same(clone.buffer === grossBuf, false);
  same(clone.length, source.length);
  clones = clones + 1;
}
same(clones, 12);
same(constructions, 1);
same(speciesReads, 0);
console.log("typed array no-species core ok");
`,
  },
  {
    name: "annex-b-core-typed-array-resizable-prototype",
    source: `${comparator}
// TypedArray/prototype/resizable-and-fixed-have-same-prototype.js compares
// __proto__ reads; Object.getPrototypeOf reads the same [[Prototype]] slot.
// The list is the resizable buffer harness's ctors on a host that has
// Float16Array, including its three class subclasses.
class MyUint8Array extends Uint8Array {}
class MyFloat32Array extends Float32Array {}
class MyBigInt64Array extends BigInt64Array {}
const ctors = [
  Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array,
  Float32Array, Float64Array, Uint8ClampedArray, Float16Array,
  BigUint64Array, BigInt64Array, MyUint8Array, MyFloat32Array,
  MyBigInt64Array,
];
const rab = new ArrayBuffer(40, { maxByteLength: 80 });
const ab = new ArrayBuffer(80);
same(rab.resizable, true);
same(ab.resizable, false);
let compared = 0;
for (let i = 0; i < ctors.length; i++) {
  const ctor = ctors[i];
  const ta_rab = new ctor(rab, 0, 3);
  const ta_ab = new ctor(ab, 0, 3);
  same(Object.getPrototypeOf(ta_ab), Object.getPrototypeOf(ta_rab));
  same(Object.getPrototypeOf(ta_rab), ctor.prototype);
  same(ta_rab.buffer, rab);
  same(ta_ab.buffer, ab);
  same(ta_rab.length, 3);
  same(ta_ab.length, 3);
  compared = compared + 1;
}
same(compared, 15);
console.log("typed array resizable prototype core ok");
`,
  },
  {
    name: "annex-b-core-typed-array-out-of-bounds-prototype",
    source: `${comparator}
// TypedArray/out-of-bounds-behaves-like-detached.js installs the prototype
// through the Annex B __proto__ setter, which calls the same
// [[SetPrototypeOf]] as Object.setPrototypeOf.
const lengthGetter = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Int8Array.prototype), "length",
).get;
const rab = new ArrayBuffer(16, { maxByteLength: 40 });
const i8a = new Int8Array(rab, 0, 4);
const proto = { 2: "wrong value", 5: "wrong value" };
same(Object.setPrototypeOf(i8a, proto), i8a);
same(Object.getPrototypeOf(i8a), proto);
i8a[2] = 10;
same(i8a[2], 10);
same(2 in i8a, true);
same(i8a[5], undefined);
same(5 in i8a, false);
same(lengthGetter.call(i8a), 4);
rab.resize(0);
same(lengthGetter.call(i8a), 0);
same(i8a[2], undefined);
same(2 in i8a, false);
same(i8a[0], undefined);
same(0 in i8a, false);
same(proto[2], "wrong value");
same(Object.getPrototypeOf(i8a), proto);
rab.resize(16);
same(lengthGetter.call(i8a), 4);
same(i8a[2], 0);
same(2 in i8a, true);
console.log("typed array out-of-bounds prototype core ok");
`,
  },
  {
    name: "annex-b-core-string-split-regexp",
    source: `${comparator}
// String/prototype/split/separator-regexp.js without its four Annex B
// patterns: /\\k<x>/ with no group name, /\\XA0/ and /\\X/ identity
// escapes, and the incomplete hexadecimal escape /\\x/.
function sameArray(actual, expected) {
  same(Array.isArray(actual), true);
  same(Object.getPrototypeOf(actual), Array.prototype);
  same(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    same(Object.hasOwn(actual, i), true);
    same(actual[i], expected[i]);
  }
}
const cases = [
  [/^/, ["x"]], [/$/, ["x"]], [/.?/, ["", ""]], [/.*/, ["", ""]],
  [/.+/, ["", ""]], [/.*?/, ["x"]], [/.{1}/, ["", ""]],
  [/.{1,}/, ["", ""]], [/.{1,2}/, ["", ""]], [/()/, ["x"]],
  [/./, ["", ""]], [/(?:)/, ["x"]], [/(...)/, ["x"]], [/(|)/, ["x"]],
  [/[]/, ["x"]], [/[^]/, ["", ""]], [/[.-.]/, ["x"]], [/\\0/, ["x"]],
  [/\\b/, ["x"]], [/\\B/, ["x"]], [/\\d/, ["x"]], [/\\D/, ["", ""]],
  [/\\n/, ["x"]], [/\\r/, ["x"]], [/\\s/, ["x"]], [/\\S/, ["", ""]],
  [/\\v/, ["x"]], [/\\w/, ["", ""]], [/\\W/, ["x"]], [/\\xA0/, ["x"]],
  [/\\ddd/, ["x"]], [/\\cY/, ["x"]], [/[\\b]/, ["x"]],
];
let splits = 0;
for (let i = 0; i < cases.length; i++) {
  sameArray("x".split(cases[i][0]), cases[i][1]);
  same(cases[i][0].lastIndex, 0);
  splits = splits + 1;
}
same(splits, 33);
console.log("string split regexp core ok");
`,
  },
];
