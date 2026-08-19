import type { Fixture } from "../fixture.ts";

export const bigintIntrinsicFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "bigint-intrinsic",
    source: `
console.log("metadata", typeof BigInt, BigInt.name, BigInt.length);
const prototypeDescriptor = Object.getOwnPropertyDescriptor(
  BigInt,
  "prototype",
);
const asIntNDescriptor = Object.getOwnPropertyDescriptor(BigInt, "asIntN");
const toStringDescriptor = Object.getOwnPropertyDescriptor(
  BigInt.prototype,
  "toString",
);
const constructorDescriptor = Object.getOwnPropertyDescriptor(
  BigInt.prototype,
  "constructor",
);
const tagDescriptor = Object.getOwnPropertyDescriptor(
  BigInt.prototype,
  Symbol.toStringTag,
);
console.log(
  "descriptors",
  prototypeDescriptor.writable,
  prototypeDescriptor.enumerable,
  prototypeDescriptor.configurable,
  asIntNDescriptor.writable,
  asIntNDescriptor.enumerable,
  asIntNDescriptor.configurable,
  toStringDescriptor.writable,
  toStringDescriptor.enumerable,
  toStringDescriptor.configurable,
  constructorDescriptor.value === BigInt,
  tagDescriptor.value,
  tagDescriptor.writable,
  tagDescriptor.configurable,
);
console.log(
  "links",
  Object.getPrototypeOf(BigInt) === Function.prototype,
  Object.getPrototypeOf(BigInt.prototype) === Object.prototype,
  BigInt.hasOwnProperty("parseInt"),
);
console.log(
  "method metadata",
  BigInt.asIntN.name,
  BigInt.asIntN.length,
  BigInt.asUintN.name,
  BigInt.asUintN.length,
  BigInt.prototype.toString.name,
  BigInt.prototype.toString.length,
  BigInt.prototype.valueOf.name,
  BigInt.prototype.valueOf.length,
  BigInt.prototype.toLocaleString.name,
  BigInt.prototype.toLocaleString.length,
);
console.log(
  "strings",
  BigInt(""),
  BigInt("   "),
  BigInt("18446744073709551616"),
  BigInt("   -197   "),
  BigInt("+197"),
  BigInt("-0"),
  BigInt("0b1111"),
  BigInt("0B1111"),
  BigInt("0o20"),
  BigInt("0O20"),
  BigInt("0xfabc"),
  BigInt("0Xfffffffffffffffffff"),
);
for (const invalid of [
  "10n",
  "10.5",
  "0b",
  "-0x1",
  "+0b1",
  "+",
  "-",
  "0oa",
  "000 12",
  "00x",
  "1_0",
  "1e3",
]) {
  try { BigInt(invalid); } catch (error) {
    console.log("string error", invalid, error instanceof SyntaxError);
  }
}
console.log(
  "numbers",
  BigInt(0),
  BigInt(-0),
  BigInt(9007199254740991),
  BigInt(-9007199254740991),
  BigInt(9007199254740993),
  BigInt(Number.MAX_SAFE_INTEGER + 3),
  BigInt(2 ** 70),
  BigInt(-(2 ** 70)),
  BigInt(Number.MAX_VALUE),
);
for (const invalid of [0.5, -0.5, Number.MIN_VALUE, NaN, Infinity, -Infinity]) {
  try { BigInt(invalid); } catch (error) {
    console.log("number error", error instanceof RangeError);
  }
}
console.log("booleans", BigInt(true), BigInt(false));
for (const invalid of [undefined, null, Symbol("x")]) {
  try { BigInt(invalid); } catch (error) {
    console.log("type error", error instanceof TypeError);
  }
}
try { new BigInt(1); } catch (error) {
  console.log("construct", error instanceof TypeError);
}
let constructCoercions = 0;
const constructOperand = {
  valueOf() {
    constructCoercions = constructCoercions + 1;
    return 1;
  },
};
class DerivedBigInt extends BigInt {}
console.log(
  "heritage",
  typeof DerivedBigInt,
  Object.getPrototypeOf(DerivedBigInt) === BigInt,
);
try { new DerivedBigInt(constructOperand); } catch (error) {
  console.log(
    "derived construct",
    error instanceof TypeError,
    constructCoercions,
  );
}
for (const constructThroughArray of [
  () => Array.from.call(BigInt, []),
  () => Array.of.call(BigInt),
]) {
  try { constructThroughArray(); } catch (error) {
    console.log("array construct", error instanceof TypeError);
  }
}
try { new BigInt.asIntN(64, 1n); } catch (error) {
  console.log("construct static", error instanceof TypeError);
}
let coercions = 0;
const onceCoerced = {
  [Symbol.toPrimitive]() {
    coercions = coercions + 1;
    return "42";
  },
};
console.log("single coercion", BigInt(onceCoerced), coercions);
const numberHint = {
  valueOf() { return 44; },
  toString() { throw new Error("unreachable"); },
};
console.log("number hint", BigInt(numberHint));
let infinityReads = 0;
const infiniteObject = {
  valueOf() {
    infinityReads = infinityReads + 1;
    return Infinity;
  },
};
try { BigInt(infiniteObject); } catch (error) {
  console.log(
    "object range",
    error instanceof RangeError,
    infinityReads,
  );
}
for (const thrower of [
  { valueOf() { throw new TypeError("valueOf"); } },
  { toString() { throw new TypeError("toString"); } },
]) {
  try { BigInt(thrower); } catch (error) {
    console.log("abrupt", error.message);
  }
}
console.log(
  "asIntN",
  BigInt.asIntN(0, -2n),
  BigInt.asIntN(1, -3n),
  BigInt.asIntN(1, 1n),
  BigInt.asIntN(2, -3n),
  BigInt.asIntN(2, 2n),
  BigInt.asIntN(3, 10n),
  BigInt.asIntN(8, 0xabn),
  BigInt.asIntN(8, 0xabcdef0123456789abcdef0183n),
  BigInt.asIntN(64, 0xabcdef0123456789abcdefn),
  BigInt.asIntN(65, 0xabcdef0123456789abcdefn),
);
console.log(
  "asIntN wide",
  BigInt.asIntN(
    200,
    0xcffffffffffffffffffffffffffffffffffffffffffffffffffn,
  ),
  BigInt.asIntN(
    201,
    0xcffffffffffffffffffffffffffffffffffffffffffffffffffn,
  ),
);
console.log(
  "asUintN",
  BigInt.asUintN(0, -2n),
  BigInt.asUintN(1, -3n),
  BigInt.asUintN(3, 10n),
  BigInt.asUintN(3, -10n),
  BigInt.asUintN(64, -1n),
  BigInt.asUintN(70, -1n),
);
console.log(
  "width identity",
  BigInt.asIntN(2 ** 33, -5n),
  BigInt.asUintN(2 ** 33, 5n),
);
try { BigInt.asUintN(2 ** 33, -1n); } catch (error) {
  console.log("width limit", error instanceof RangeError);
}
console.log(
  "width conversion",
  BigInt.asIntN(-0.9, 1n),
  BigInt.asIntN(NaN, 1n),
  BigInt.asIntN(undefined, 1n),
  BigInt.asIntN(null, 1n),
  BigInt.asIntN(true, 1n),
  BigInt.asIntN("3", 10n),
  BigInt.asIntN(3.9, 10n),
  BigInt.asIntN([0], 1n),
  BigInt.asIntN({}, 1n),
);
console.log(
  "operand conversion",
  BigInt.asIntN(2, false),
  BigInt.asIntN(2, true),
  BigInt.asIntN(2, ""),
  BigInt.asIntN(2, "     "),
  BigInt.asIntN(2, []),
  BigInt.asIntN(2, [1]),
  BigInt.asIntN(3, "0b1010"),
  BigInt.asIntN(3, "0o12"),
  BigInt.asIntN(3, "    0xa    "),
  BigInt.asIntN(2, Object(0n)),
);
for (const invalid of [
  -1,
  -2.5,
  "-2.5",
  -Infinity,
  9007199254740992,
  Infinity,
]) {
  try { BigInt.asIntN(invalid, 0n); } catch (error) {
    console.log("width range", error instanceof RangeError);
  }
}
for (const invalid of [0n, Object(0n), Symbol("1")]) {
  try { BigInt.asIntN(invalid, 0n); } catch (error) {
    console.log("width type", error instanceof TypeError);
  }
}
for (const invalid of [undefined, null, 0, NaN, Symbol("1")]) {
  try { BigInt.asUintN(0, invalid); } catch (error) {
    console.log("operand type", error instanceof TypeError);
  }
}
try { BigInt.asUintN(0, "0b2"); } catch (error) {
  console.log("operand syntax", error instanceof SyntaxError);
}
let step = 0;
const orderedWidth = {
  valueOf() {
    console.log("order width", step);
    step = step + 1;
    return 0;
  },
};
const orderedOperand = {
  valueOf() {
    console.log("order operand", step);
    step = step + 1;
    return 0n;
  },
};
BigInt.asIntN(orderedWidth, orderedOperand);
console.log("order steps", step);
console.log(
  "toString",
  (0n).toString(),
  (100n).toString(),
  (-100n).toString(),
  (0n).toString(undefined),
  (255n).toString(16),
  (255n).toString(2),
  (-255n).toString(36),
  (12345678901234567890123456789n).toString(36),
  (-12345678901234567890123456789n).toString(7),
);
const radixDigits = [];
for (let radix = 2; radix <= 36; radix = radix + 1) {
  radixDigits.push((0n).toString(radix));
  radixDigits.push((-1n).toString(radix));
  radixDigits.push((1n).toString(radix));
}
console.log("radix sweep", radixDigits.join(""));
let letterMismatch = 0;
for (let radix = 11; radix <= 36; radix = radix + 1) {
  for (let digit = 10n; digit < radix; digit = digit + 1n) {
    if (digit.toString(radix) !== String.fromCharCode(Number(digit + 87n))) {
      letterMismatch = letterMismatch + 1;
    }
  }
}
console.log("radix letters", letterMismatch);
for (const radix of [0, 1, 37, null, -1]) {
  try { (1n).toString(radix); } catch (error) {
    console.log("radix range", error instanceof RangeError);
  }
}
for (const radix of [0n, Symbol("1")]) {
  try { (1n).toString(radix); } catch (error) {
    console.log("radix type", error instanceof TypeError);
  }
}
try {
  BigInt.prototype.toString.call(
    10n,
    { valueOf: undefined, toString: undefined },
  );
} catch (error) {
  console.log("radix primitive", error instanceof TypeError);
}
try { BigInt.prototype.toString(1); } catch (error) {
  console.log("prototype receiver", error instanceof TypeError);
}
console.log(
  "valueOf",
  BigInt.prototype.valueOf.call(7n),
  BigInt.prototype.valueOf.call(Object(7n)),
  BigInt.prototype.toString.call(Object(-7n), 16),
);
for (const receiver of [
  {},
  [1n],
  { x: 1n },
  Object(1),
  Object("1"),
  0,
  1,
  NaN,
  undefined,
  null,
  true,
  false,
  "",
  "1n",
]) {
  try { BigInt.prototype.valueOf.call(receiver); } catch (error) {
    console.log("brand", error instanceof TypeError);
  }
}
const unbranded = Object.create(BigInt.prototype);
try { BigInt.prototype.valueOf.call(unbranded); } catch (error) {
  console.log("prototype brand", error instanceof TypeError);
}
console.log("toLocaleString", (5n).toLocaleString(), (-5n).toLocaleString());
try { BigInt.prototype.toLocaleString.call(1); } catch (error) {
  console.log("locale brand", error instanceof TypeError);
}
Object.defineProperty(BigInt.prototype, Symbol.toStringTag, { value: 1 });
console.log(
  "non-string tag",
  ({}).toString.call(1n),
  ({}).toString.call(Object(1n)),
);
Object.defineProperty(
  BigInt.prototype,
  Symbol.toStringTag,
  { value: "BigInt" },
);
const wrapper = Object(123n);
console.log(
  "wrapper",
  typeof wrapper,
  BigInt.prototype.isPrototypeOf(wrapper),
  wrapper.hasOwnProperty("value"),
  ({}).toString.call(wrapper),
  wrapper.toString(),
  wrapper.toString(16),
  wrapper + 1n,
  \`\${wrapper}\`,
);
try { +Object(1n); } catch (error) {
  console.log("wrapper number hint", error instanceof TypeError);
}
console.log("wrapper default hint", "" + Object(1n), Object(1n) == 1n);
const overridden = Object(4n);
overridden.valueOf = function () { return 9n; };
console.log("wrapper override", overridden + 1n);
const originalAsIntN = BigInt.asIntN;
let turn = 0;
while (turn < 2) {
  console.log("guard", BigInt.asIntN === originalAsIntN);
  if (turn === 0) BigInt.marker = 1n;
  turn = turn + 1;
}
delete BigInt.marker;
/** @param {bigint} left @param {bigint} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1n, 2n), hinted("1", "2"));
const originalBigInt = BigInt;
const bigintGlobalObject = this;
BigInt = 5n;
console.log("global write", this.BigInt === BigInt, BigInt);
BigInt = originalBigInt;
console.log("global restore", this.BigInt === BigInt);
console.log("global delete", delete this.BigInt, typeof BigInt);
try { BigInt; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
function strictDeletedBigIntSet() { "use strict"; BigInt = 1n; }
try { strictDeletedBigIntSet(); } catch (error) {
  console.log("global deleted strict set", error instanceof ReferenceError);
}
BigInt = originalBigInt;
console.log("global rebind", this.BigInt === BigInt);
function strictDeleteDuringBigIntSet() {
  "use strict";
  BigInt = (delete bigintGlobalObject.BigInt, 1n);
}
try { strictDeleteDuringBigIntSet(); } catch (error) {
  console.log("global strict set race", error instanceof ReferenceError);
}
BigInt = originalBigInt;
console.log("global race restore", this.BigInt === BigInt);
`,
  },
];
