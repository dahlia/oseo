import type { Fixture } from "../fixture.ts";

export const globalNumericFunctionFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "global-numeric-functions",
    source: `
const numericGlobalObject = this;
const originalIsNaN = isNaN;
const names = ["isFinite", "isNaN", "parseFloat", "parseInt"];
const values = [isFinite, isNaN, parseFloat, parseInt];
const lengths = [1, 1, 1, 2];
let metadata = "";
for (let index = 0; index < names.length; index = index + 1) {
  const value = values[index];
  const descriptor = Object.getOwnPropertyDescriptor(this, names[index]);
  if (
    typeof value !== "function" ||
    value.name !== names[index] ||
    value.length !== lengths[index] ||
    Object.getPrototypeOf(value) !== Function.prototype ||
    value.prototype !== undefined ||
    descriptor.writable !== true ||
    descriptor.enumerable !== false ||
    descriptor.configurable !== true
  ) {
    metadata = metadata + " " + names[index];
  }
}
console.log("metadata", names.length, metadata === "");
console.log(
  "identity",
  parseFloat === Number.parseFloat,
  parseInt === Number.parseInt,
  isNaN !== Number.isNaN,
  isFinite !== Number.isFinite,
);
console.log(
  "parseInt radix",
  parseInt("101"),
  parseInt("101", 2),
  parseInt("101", 0),
  parseInt("101", undefined),
  parseInt("1Z", 36),
  parseInt("1Z", 37),
  parseInt("11", 1),
  parseInt("11", -1),
  parseInt("11", NaN),
  parseInt("11", 4294967298),
  parseInt("11", 4294967312),
  parseInt("11", "16"),
  parseInt("11", 16.9),
  parseInt("z", 36),
);
console.log(
  "parseInt prefix",
  parseInt("0x1F"),
  parseInt("0X1f", 16),
  parseInt("0x1F", 10),
  parseInt("0x1F", 0),
  parseInt("0x"),
  parseInt("0xg"),
  parseInt("-0x10"),
  parseInt("+0X10", 16),
  parseInt("0b11"),
  parseInt("0o17"),
);
console.log(
  "parseInt grammar",
  parseInt(""),
  parseInt("   "),
  parseInt(
    "\\t\\n\\u000b\\u000c\\r \\u00a0\\u1680\\u2000\\u2028\\u2029" +
      "\\u202f\\u205f\\u3000\\ufeff42px",
  ),
  parseInt("\\u180e42"),
  parseInt("-"),
  parseInt("+"),
  parseInt("--1"),
  parseInt("  -12.9e3"),
  parseInt("1_000"),
  parseInt("12abc34"),
  parseInt("Infinity"),
  Object.is(parseInt("-0"), -0),
  Object.is(parseInt("-0x0"), -0),
);
let oneFollowedByZeros = "1";
for (let index = 0; index < 400; index = index + 1) {
  oneFollowedByZeros = oneFollowedByZeros + "0";
}
console.log(
  "parseInt precision",
  parseInt("9007199254740993"),
  parseInt("18446744073709551616"),
  parseInt("0x10000000000000000000", 16) === 75557863725914323419136,
  parseInt(oneFollowedByZeros),
  parseInt("123456789012345678901234567890"),
  parseInt("zzzzzzzzzzzzzzzzzzzz", 36) === 13367494538843734067838845976575,
);
console.log(
  "parseFloat grammar",
  parseFloat("3.5e2abc"),
  parseFloat("  +.5"),
  parseFloat("-.5e-1x"),
  parseFloat("1e"),
  parseFloat("1e+"),
  parseFloat("1.e1"),
  parseFloat(".e1"),
  parseFloat("1_0"),
  parseFloat("1.0e-1_0"),
  parseFloat("0x10"),
  parseFloat("Infinityx"),
  parseFloat("-Infinity"),
  parseFloat("infinity"),
  parseFloat("\\u180e1"),
  parseFloat("\\ufeff\\u30001.5"),
  parseFloat(""),
  parseFloat("."),
  parseFloat("-"),
  Object.is(parseFloat("-0"), -0),
  Object.is(parseFloat("-0.0e5"), -0),
  parseFloat("1e1000"),
  parseFloat("-1e1000"),
  parseFloat("1e-1000"),
  parseFloat("0.1e1" + "\\u0660"),
  parseFloat("0.30000000000000004"),
  parseFloat("123456789012345678901234567890"),
);
console.log(
  "coercion",
  parseInt(),
  parseFloat(),
  parseInt(null),
  parseFloat(undefined),
  parseInt(true, 36),
  parseInt(12.5),
  parseFloat(-1.5e-7),
  parseInt(1e21),
  parseFloat(1e21),
  parseInt({ toString() { return "0x11"; } }),
  parseFloat({ toString() { return "  2.5e1x"; }, valueOf() { return 9; } }),
  parseInt("11", { valueOf() { return 2; } }),
);
console.log(
  "isNaN",
  isNaN(),
  isNaN(undefined),
  isNaN(null),
  isNaN(NaN),
  isNaN("NaN"),
  isNaN(""),
  isNaN("  12  "),
  isNaN("0x1F"),
  isNaN("1_0"),
  isNaN("Infinity"),
  isNaN("x"),
  isNaN(true),
  isNaN([]),
  isNaN([1]),
  isNaN([NaN]),
  isNaN([1, 2]),
  isNaN({}),
  isNaN({ valueOf() { return "7"; } }),
  isNaN({ toString() { return "7"; }, valueOf() { return {}; } }),
  isNaN(new Number(NaN)),
  isNaN(new String("3")),
);
console.log(
  "isFinite",
  isFinite(),
  isFinite(null),
  isFinite(0),
  isFinite(-0),
  isFinite(Infinity),
  isFinite(-Infinity),
  isFinite(NaN),
  isFinite("12"),
  isFinite(""),
  isFinite("Infinity"),
  isFinite("1e400"),
  isFinite("x"),
  isFinite(false),
  isFinite([]),
  isFinite([Infinity]),
  isFinite({ valueOf() { return 1.5; } }),
  isFinite({ [Symbol.toPrimitive]() { return "8"; } }),
  isFinite(new Number(Infinity)),
);
const order = [];
const ordered = {
  valueOf() { order.push("valueOf"); return "3"; },
  toString() { order.push("toString"); return "4"; },
};
console.log("hint order", isNaN(ordered), isFinite(ordered), order.join(","));
try { isNaN(Symbol("x")); } catch (error) {
  console.log("symbol", error instanceof TypeError);
}
try { isFinite(1n); } catch (error) {
  console.log("bigint", error instanceof TypeError);
}
try { parseInt(Symbol("x")); } catch (error) {
  console.log("parse symbol", error instanceof TypeError);
}
try { parseFloat(Symbol("x")); } catch (error) {
  console.log("parse float symbol", error instanceof TypeError);
}
try {
  isNaN({ [Symbol.toPrimitive]() { throw new RangeError("x"); } });
} catch (error) {
  console.log("abrupt", error instanceof RangeError);
}
try {
  isFinite({ [Symbol.toPrimitive]() { return {}; } });
} catch (error) {
  console.log("object result", error instanceof TypeError);
}
try {
  isNaN({ [Symbol.toPrimitive]: 1 });
} catch (error) {
  console.log("not callable", error instanceof TypeError);
}
try {
  isFinite({ get [Symbol.toPrimitive]() { throw new RangeError("get"); } });
} catch (error) {
  console.log("abrupt get", error instanceof RangeError);
}
try {
  parseInt({ toString() { throw new RangeError("string"); } });
} catch (error) {
  console.log("abrupt string", error instanceof RangeError);
}
try {
  parseInt("1", { valueOf() { throw new RangeError("radix"); } });
} catch (error) {
  console.log("abrupt radix", error instanceof RangeError);
}
let radixOrder = "";
try {
  parseInt(
    {
      toString() {
        radixOrder = radixOrder + "s";
        throw new RangeError("s");
      },
    },
    { valueOf() { radixOrder = radixOrder + "r"; return 10; } },
  );
} catch (error) {
  console.log("conversion order", radixOrder, error instanceof RangeError);
}
for (let index = 0; index < names.length; index = index + 1) {
  try {
    new values[index]("1");
    console.log("constructor", names[index], "no throw");
  } catch (error) {
    console.log("constructor", names[index], error instanceof TypeError);
  }
}
let superOrder = "";
class Derived extends Object {
  constructor() {
    try {
      super((superOrder = superOrder + "argument"));
    } catch (error) {
      superOrder = superOrder + (error instanceof TypeError ? ",type" : ",x");
    }
  }
}
Object.setPrototypeOf(Derived, parseInt);
try {
  new Derived();
} catch (error) {
  superOrder = superOrder + (error instanceof ReferenceError ? ",ref" : ",x");
}
console.log("super order", superOrder);
/** @param {number} operand @param {number} addend */
function hinted(operand, addend) { return operand + addend; }
console.log(
  "hint",
  hinted(2, 1),
  hinted(parseInt("7"), 1),
  hinted(isNaN(1), 1),
);
let turn = 0;
while (turn < 2) {
  console.log(
    "guard",
    isNaN("a"),
    isFinite("1"),
    parseInt("8"),
    parseFloat("9"),
  );
  if (turn === 0) numericGlobalObject.marker = 1;
  turn = turn + 1;
}
console.log(
  "marker",
  numericGlobalObject.marker,
  delete numericGlobalObject.marker,
);
({ value: isNaN } = { value: 31 });
console.log("object target", isNaN, this.isNaN === isNaN);
[isNaN] = [32];
console.log("array target", isNaN, this.isNaN === isNaN);
for (isNaN of [33]) {}
console.log("for-of target", isNaN, this.isNaN === isNaN);
for (isNaN in { loopKey: true }) {}
console.log("for-in target", isNaN, this.isNaN === isNaN);
isNaN = originalIsNaN;
console.log("target restore", isNaN === originalIsNaN);
isNaN = 40;
console.log("identifier replace", isNaN, this.isNaN === isNaN);
isNaN += 2;
console.log("identifier update", isNaN++, ++isNaN, isNaN);
isNaN = originalIsNaN;
console.log("identifier restore", isNaN === originalIsNaN);
this.isNaN = 123;
console.log("global write", this.isNaN === isNaN, isNaN);
this.isNaN = originalIsNaN;
console.log("global restore", this.isNaN === isNaN);
console.log("global delete", delete this.isNaN, typeof isNaN);
try { isNaN; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
function strictDeletedSet() { "use strict"; isNaN = 1; }
try { strictDeletedSet(); } catch (error) {
  console.log("global deleted strict set", error instanceof ReferenceError);
}
({ value: isNaN } = { value: originalIsNaN });
console.log("global deleted pattern restore", this.isNaN === isNaN);
function strictDeleteDuringSet() {
  "use strict";
  isNaN = (delete numericGlobalObject.isNaN, 5);
}
try { strictDeleteDuringSet(); } catch (error) {
  console.log("global strict set race", error instanceof ReferenceError);
}
isNaN = originalIsNaN;
console.log("global race restore", this.isNaN === isNaN);
const originalParseInt = parseInt;
this.parseInt = 1;
console.log(
  "parseInt write",
  parseInt,
  Number.parseInt === originalParseInt,
  Number.parseInt("0x10"),
);
this.parseInt = originalParseInt;
console.log("parseInt restore", parseInt === Number.parseInt);
`,
  },
];
