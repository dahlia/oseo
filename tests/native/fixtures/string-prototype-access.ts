import type { Fixture } from "../fixture.ts";

export const stringPrototypeAccessFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "string-prototype-access",
    source: `
console.log(
  "metadata",
  String.prototype.constructor === String,
  String.prototype.at.name,
  String.prototype.at.length,
  String.prototype.charAt.name,
  String.prototype.charAt.length,
  String.prototype.charCodeAt.name,
  String.prototype.charCodeAt.length,
  String.prototype.codePointAt.name,
  String.prototype.codePointAt.length,
  String.prototype.toString.name,
  String.prototype.toString.length,
  String.prototype.valueOf.name,
  String.prototype.valueOf.length,
);
for (const name of [
  "at",
  "charAt",
  "charCodeAt",
  "codePointAt",
  "constructor",
  "toString",
  "valueOf",
]) {
  const descriptor = Object.getOwnPropertyDescriptor(String.prototype, name);
  console.log(
    "descriptor",
    name,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
  );
}
const text = "A" + String.fromCharCode(55357, 56832, 55296, 66);
console.log(
  "units",
  text.length,
  text.charAt(),
  text.charAt(1) === String.fromCharCode(55357),
  text.charAt(9) === "",
  text.charCodeAt(0),
  text.charCodeAt(1),
  text.charCodeAt(9),
  text.codePointAt(0),
  text.codePointAt(1),
  text.codePointAt(2),
  text.codePointAt(3),
  text.codePointAt(4),
);
console.log(
  "relative",
  text.at(0),
  text.at(-1),
  text.at(-2) === String.fromCharCode(55296),
  text.at(-6),
  text.at(5),
  text.at(Infinity),
  text.at(-Infinity),
);
console.log(
  "integer",
  "abcd".charAt(1.9),
  "abcd".charAt(-0.9),
  "abcd".charAt(NaN),
  "abcd".charCodeAt("2"),
  "abcd".codePointAt(true),
  "abcd".at(-1.9),
  "abcd".at(undefined),
);
let order = "";
const genericReceiver = {
  toString() { order = order + "r"; return "xy"; },
};
const genericIndex = {
  valueOf() { order = order + "i"; return 1; },
};
console.log(
  "generic",
  String.prototype.charAt.call(genericReceiver, genericIndex),
  order,
  String.prototype.charAt.call(123, 1),
  String.prototype.charCodeAt.call(true, 0),
  String.prototype.codePointAt.call(42n, 1),
  String.prototype.at.call(["z"], 0),
);
let stopped = false;
try {
  String.prototype.charAt.call(
    { toString() { throw new TypeError("receiver"); } },
    { valueOf() { stopped = true; return 0; } },
  );
} catch (error) {
  console.log("receiver abrupt", error instanceof TypeError, stopped);
}
try { text.at(Symbol("index")); } catch (error) {
  console.log("index symbol", error instanceof TypeError);
}
try { text.charCodeAt(0n); } catch (error) {
  console.log("index bigint", error instanceof TypeError);
}
for (const receiver of [null, undefined, Symbol("receiver")]) {
  try { String.prototype.codePointAt.call(receiver, 0); } catch (error) {
    console.log("receiver rejection", error instanceof TypeError);
  }
}
const wrapper = new String("wrapped");
class DerivedString extends String {}
const derived = new DerivedString("derived");
console.log(
  "brand",
  String.prototype.toString.call("primitive"),
  String.prototype.toString.call(wrapper),
  String.prototype.valueOf.call(String.prototype) === "",
  String.prototype.valueOf.call(derived),
);
for (const receiver of [
  true,
  0,
  0n,
  Symbol("brand"),
  null,
  undefined,
  {},
  [],
]) {
  try { String.prototype.toString.call(receiver); } catch (error) {
    console.log("toString brand", error instanceof TypeError);
  }
  try { String.prototype.valueOf.call(receiver); } catch (error) {
    console.log("valueOf brand", error instanceof TypeError);
  }
}
for (const method of [
  String.prototype.at,
  String.prototype.charAt,
  String.prototype.charCodeAt,
  String.prototype.codePointAt,
  String.prototype.toString,
  String.prototype.valueOf,
]) {
  try { new method(); } catch (error) {
    console.log("not constructor", error instanceof TypeError);
  }
}
/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint hit", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
const originalCharAt = String.prototype.charAt;
let turn = 0;
while (turn < 2) {
  console.log("guard", hinted("guard"));
  if (turn === 0) String.prototype.marker = 1;
  turn = turn + 1;
}
console.log("method stable", String.prototype.charAt === originalCharAt);
`,
  },
];
