import type { Fixture } from "../fixture.ts";

export const numberIntrinsicFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "number-intrinsic",
    source: `
console.log("metadata", typeof Number, Number.name, Number.length);
const prototypeDescriptor = Object.getOwnPropertyDescriptor(
  Number,
  "prototype",
);
const finiteDescriptor = Object.getOwnPropertyDescriptor(Number, "isFinite");
const maximumDescriptor = Object.getOwnPropertyDescriptor(Number, "MAX_VALUE");
console.log(
  "descriptors",
  prototypeDescriptor.writable,
  prototypeDescriptor.enumerable,
  prototypeDescriptor.configurable,
  finiteDescriptor.writable,
  finiteDescriptor.enumerable,
  finiteDescriptor.configurable,
  maximumDescriptor.writable,
  maximumDescriptor.enumerable,
  maximumDescriptor.configurable,
);
console.log(
  "constants",
  Number.EPSILON > 0,
  Number.MAX_SAFE_INTEGER === 9007199254740991,
  Number.MAX_VALUE > 1e308,
  Number.MIN_SAFE_INTEGER === -9007199254740991,
  Number.MIN_VALUE > 0,
  Number.isNaN(Number.NaN),
  Number.NEGATIVE_INFINITY === -Infinity,
  Number.POSITIVE_INFINITY === Infinity,
);
console.log(
  "call",
  Number(),
  Number(" 12.5 "),
  Number(true),
  Number(9007199254740993n),
);
let bigintObjectConversions = 0;
const bigintObject = {
  valueOf() {
    bigintObjectConversions = bigintObjectConversions + 1;
    return 10n;
  },
};
const boxedBigintObject = new Number(bigintObject);
console.log(
  "bigint object",
  Number(bigintObject),
  boxedBigintObject instanceof Number,
  bigintObjectConversions,
);
try { Number(Symbol("x")); } catch (error) {
  console.log("symbol", error instanceof TypeError);
}
const boxed = new Number(42);
console.log(
  "wrapper",
  typeof boxed,
  Number.prototype.isPrototypeOf(boxed),
  boxed instanceof Number,
  boxed.hasOwnProperty("value"),
);
class DerivedNumber extends Number {}
const derived = new DerivedNumber(-7);
console.log(
  "derived",
  derived instanceof DerivedNumber,
  derived instanceof Number,
  Number.prototype.isPrototypeOf(derived),
);
console.log(
  "predicates",
  Number.isFinite(0),
  Number.isFinite(Infinity),
  Number.isFinite("0"),
  Number.isInteger(-0),
  Number.isInteger(1.5),
  Number.isNaN(NaN),
  Number.isNaN("NaN"),
  Number.isSafeInteger(9007199254740991),
  Number.isSafeInteger(9007199254740992),
);
console.log(
  "parse float",
  Number.parseFloat("  -12.5e2tail"),
  Number.parseFloat("+Infinity!"),
  Number.isNaN(Number.parseFloat("word")),
  Number.parseFloat("1e+"),
);
console.log(
  "parse int",
  Number.parseInt("  -0x10tail"),
  Number.parseInt("101", 2),
  Number.parseInt("z", 36),
  Number.parseInt("10000000000000801", 16) ===
    18446744073709553665,
  Number.isNaN(Number.parseInt("1", 1)),
);
/** @param {number} value */
function hinted(value) { return value + 1; }
console.log("hint", hinted(2), hinted("2"));
let turn = 0;
while (turn < 2) {
  console.log("guard", Number.isFinite === Number.isFinite);
  if (turn === 0) Number.marker = 1;
  turn = turn + 1;
}
function strictNumberRead() { "use strict"; return this instanceof Number; }
console.log("strict receiver", strictNumberRead.call(-12));
const originalNumber = Number;
this.Number = 123;
console.log("global write", this.Number === Number, Number);
this.Number = originalNumber;
console.log("global restore", this.Number === Number);
console.log(
  "global delete",
  delete this.Number,
  typeof Number,
);
try { Number; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
`,
  },
];
