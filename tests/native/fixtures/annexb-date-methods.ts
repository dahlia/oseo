import type { Fixture } from "../fixture.ts";

/*
 * The setYear case whose ToNumber stores a new time value into the same
 * Date is not here: both reference hosts reread the slot after the
 * conversion, where B.2.3.2 uses the value read before it. The property
 * suite observes that case natively against a written expectation.
 */
export const annexBDateMethodFixtures: readonly Fixture[] = [
  {
    name: "annexb-date-methods",
    source: `
const proto = Date.prototype;
const methods = [
  ["getYear", 0],
  ["setYear", 1],
];
let metadata = "";
for (let index = 0; index < methods.length; index = index + 1) {
  const name = methods[index][0];
  const value = proto[name];
  const descriptor = Object.getOwnPropertyDescriptor(proto, name);
  if (
    typeof value !== "function" ||
    value.name !== name ||
    value.length !== methods[index][1] ||
    Object.getPrototypeOf(value) !== Function.prototype ||
    Object.prototype.hasOwnProperty.call(value, "prototype") ||
    descriptor.writable !== true ||
    descriptor.enumerable !== false ||
    descriptor.configurable !== true
  ) {
    metadata = metadata + " " + name;
  }
}
console.log("metadata", methods.length, metadata === "");
const gmt = Object.getOwnPropertyDescriptor(proto, "toGMTString");
console.log(
  "toGMTString",
  proto.toGMTString === proto.toUTCString,
  proto.toGMTString.name,
  proto.toGMTString.length,
  gmt.writable,
  gmt.enumerable,
  gmt.configurable,
  new Date(0).toGMTString(),
  new Date(Date.UTC(-1, 11, 31, 23, 59, 59)).toGMTString(),
  new Date(NaN).toGMTString(),
);
const instants = [
  0,
  -1,
  Date.UTC(1899, 11, 31, 23, 59, 59, 999),
  Date.UTC(1900, 0, 1),
  Date.UTC(1999, 11, 31, 23, 59, 59, 999),
  Date.UTC(2000, 0, 1),
  Date.UTC(2024, 1, 29, 12, 34, 56, 789),
  Date.UTC(-271821, 3, 20),
  Date.UTC(275760, 8, 13),
  8.64e15,
  -8.64e15,
];
let years = "";
for (let index = 0; index < instants.length; index = index + 1) {
  years = years + " " + new Date(instants[index]).getYear();
}
console.log("getYear", years, new Date(NaN).getYear());
const operands = [
  0, 1, 50, 99, 99.9, 100, 1899, 1900, 2000, -1, -0.5, -0, 0.5, 275760,
  275761, -271821, -271822,
];
let results = "";
for (let index = 0; index < operands.length; index = index + 1) {
  const date = new Date(Date.UTC(2024, 1, 29, 12, 34, 56, 789));
  const returned = date.setYear(operands[index]);
  results =
    results + " " + returned + ":" + (returned === date.getTime());
}
console.log("setYear", results);
const leap = new Date(Date.UTC(2024, 1, 29));
leap.setYear(23);
console.log("leap day", leap.getTime(), leap.getUTCMonth(), leap.getUTCDate());
const invalid = new Date(NaN);
console.log("invalid start", invalid.setYear(5), invalid.getTime());
const unchanged = new Date(1234);
console.log(
  "nan year",
  unchanged.setYear(NaN),
  unchanged.getTime(),
  new Date(0).setYear(),
  new Date(0).setYear(undefined),
  new Date(NaN).setYear(Infinity),
  new Date(0).setYear(-Infinity),
);
console.log(
  "coercion",
  new Date(0).setYear("98"),
  new Date(0).setYear(" 2001 "),
  new Date(0).setYear(null),
  new Date(0).setYear(true),
  new Date(0).setYear([3]),
  new Date(0).setYear({ valueOf() { return 7; } }),
  new Date(0).setYear("x"),
);
let thisErrors = 0;
const receivers = [
  {},
  [],
  null,
  undefined,
  0,
  "2000",
  Date,
  Object.create(proto),
];
for (let index = 0; index < receivers.length; index = index + 1) {
  try {
    proto.getYear.call(receivers[index]);
  } catch (error) {
    if (error instanceof TypeError) thisErrors = thisErrors + 1;
  }
  try {
    proto.setYear.call(receivers[index], 1);
  } catch (error) {
    if (error instanceof TypeError) thisErrors = thisErrors + 1;
  }
  try {
    proto.toGMTString.call(receivers[index]);
  } catch (error) {
    if (error instanceof TypeError) thisErrors = thisErrors + 1;
  }
}
console.log("receivers", receivers.length * 3, thisErrors);
const order = [];
try {
  proto.setYear.call({}, { valueOf() { order.push("year"); return 1; } });
} catch (error) {
  console.log("receiver first", error instanceof TypeError, order.length);
}
const abrupt = new Date(0);
try {
  abrupt.setYear({ valueOf() { throw new RangeError("y"); } });
} catch (error) {
  console.log("abrupt", error instanceof RangeError, abrupt.getTime());
}
try {
  new Date(0).setYear(Symbol("y"));
} catch (error) {
  console.log("symbol", error instanceof TypeError);
}
try {
  new Date(0).setYear(1n);
} catch (error) {
  console.log("bigint", error instanceof TypeError);
}
try {
  new proto.setYear(1);
} catch (error) {
  console.log("not a constructor", error instanceof TypeError);
}
/** @param {number} operand @param {number} addend */
function hinted(operand, addend) { return operand + addend; }
console.log("hint", hinted(2, 1), hinted(new Date(0).getYear(), 1));
const holders = [{ date: new Date(0) }, { date: new Date(0), extra: 1 }];
let turn = 0;
while (turn < 2) {
  console.log("guard", holders[turn].date.getYear());
  turn = turn + 1;
}
`,
  },
];
