import type { Fixture } from "../fixture.ts";

export const annexBStringMethodFixtures: readonly Fixture[] = [
  {
    name: "annexb-string-methods",
    source: `
const proto = String.prototype;
const methods = [
  ["substr", 2],
  ["anchor", 1],
  ["big", 0],
  ["blink", 0],
  ["bold", 0],
  ["fixed", 0],
  ["fontcolor", 1],
  ["fontsize", 1],
  ["italics", 0],
  ["link", 1],
  ["small", 0],
  ["strike", 0],
  ["sub", 0],
  ["sup", 0],
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
const left = Object.getOwnPropertyDescriptor(proto, "trimLeft");
const right = Object.getOwnPropertyDescriptor(proto, "trimRight");
console.log(
  "aliases",
  proto.trimLeft === proto.trimStart,
  proto.trimRight === proto.trimEnd,
  proto.trimLeft.name,
  proto.trimRight.name,
  proto.trimLeft.length,
  left.writable,
  left.enumerable,
  left.configurable,
  right.writable,
  right.enumerable,
  right.configurable,
);
const spaces = "\\u0009\\u000b\\u000c \\u00a0\\ufeff\\u2028\\u3000";
console.log(
  "trim",
  "[" + (spaces + "a b" + spaces).trimLeft() + "]",
  "[" + (spaces + "a b" + spaces).trimRight() + "]",
  "[" + "\\u180ex".trimLeft() + "]" === "[\\u180ex]",
);
const text = "abcdef";
console.log(
  "substr",
  text.substr(),
  text.substr(2),
  text.substr(2, 2),
  text.substr(-2),
  text.substr(-2, 1),
  text.substr(-10, 3),
  text.substr(10),
  text.substr(2, -1) === "",
  text.substr(2, 0) === "",
  text.substr(1, 100),
);
console.log(
  "substr numbers",
  text.substr(1.9, 2.9),
  text.substr(-1.5),
  text.substr(NaN, 2),
  text.substr(2, NaN) === "",
  text.substr(Infinity) === "",
  text.substr(-Infinity, 2),
  text.substr(0, Infinity),
  text.substr(-0, 1),
  text.substr("1", "2"),
  text.substr(true, null) === "",
  text.substr(undefined, undefined),
);
console.log(
  "substr receivers",
  proto.substr.call(12345, 1, 3),
  proto.substr.call(true, 1),
  proto.substr.call({ toString() { return "xyz"; } }, -1),
  "\\ud83d\\ude00".substr(1) === "\\ude00",
);
console.log(
  "html",
  "x".anchor("n"),
  "x".big(),
  "x".blink(),
  "x".bold(),
  "x".fixed(),
  "x".fontcolor("red"),
  "x".fontsize(7),
  "x".italics(),
  "x".link("u"),
  "x".small(),
  "x".strike(),
  "x".sub(),
  "x".sup(),
);
console.log(
  "html attributes",
  "".anchor('"a"b""'),
  "<&>".link("<&>'"),
  "x".anchor(),
  "x".fontsize(undefined),
  "x".fontcolor(null),
  "x".fontsize(-0),
  "x".link({ toString() { return 'q"'; } }),
  "x".anchor("\\ud800").length,
);
console.log(
  "html receivers",
  proto.bold.call(42),
  proto.sub.call(false),
  proto.anchor.call({ toString() { return "t"; } }, "a"),
  proto.big.call("", "ignored"),
);
const order = [];
proto.anchor.call(
  { toString() { order.push("this"); return "t"; } },
  { toString() { order.push("value"); return "v"; } },
);
proto.bold.call(
  { toString() { order.push("bold this"); return "t"; } },
  { toString() { order.push("bold value"); return "v"; } },
);
proto.substr.call(
  { toString() { order.push("substr this"); return "abc"; } },
  { valueOf() { order.push("start"); return 1; } },
  { valueOf() { order.push("length"); return 1; } },
);
console.log("order", order.join(","));
let nullish = 0;
const names = ["substr", "anchor", "big", "link", "trimLeft", "trimRight"];
for (let index = 0; index < names.length; index = index + 1) {
  try {
    proto[names[index]].call(null);
  } catch (error) {
    if (error instanceof TypeError) nullish = nullish + 1;
  }
  try {
    proto[names[index]].call(undefined);
  } catch (error) {
    if (error instanceof TypeError) nullish = nullish + 1;
  }
}
console.log("nullish", names.length * 2, nullish);
try {
  "x".fontcolor(Symbol("s"));
} catch (error) {
  console.log("symbol value", error instanceof TypeError);
}
try {
  proto.big.call(Symbol("s"));
} catch (error) {
  console.log("symbol receiver", error instanceof TypeError);
}
try {
  "x".link({ toString() { throw new RangeError("v"); } });
} catch (error) {
  console.log("abrupt value", error instanceof RangeError);
}
try {
  "abc".substr({ valueOf() { throw new RangeError("s"); } });
} catch (error) {
  console.log("abrupt start", error instanceof RangeError);
}
try {
  new proto.anchor("a");
} catch (error) {
  console.log("not a constructor", error instanceof TypeError);
}
/** @param {number} operand @param {number} addend */
function hinted(operand, addend) { return operand + addend; }
console.log("hint", hinted(2, 1), hinted("x".bold(), 1));
const replaced = proto.bold;
proto.bold = function () { return "replaced"; };
console.log("replace", "x".bold(), proto.bold === replaced);
proto.bold = replaced;
console.log("restore", "x".bold());
let turn = 0;
const receivers = [{ value: "a" }, { value: "b", extra: 1 }];
while (turn < 2) {
  const holder = receivers[turn];
  console.log("guard", holder.value.substr(0, 1), holder.value.sup());
  turn = turn + 1;
}
`,
  },
];
