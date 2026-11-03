import type { Fixture } from "../fixture.ts";

export const annexBEscapeFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "annexb-escape",
    source: `
const escapeGlobalObject = this;
const originalEscape = escape;
const originalUnescape = unescape;
const names = ["escape", "unescape"];
const values = [escape, unescape];
let metadata = "";
for (let index = 0; index < names.length; index = index + 1) {
  const value = values[index];
  const descriptor = Object.getOwnPropertyDescriptor(this, names[index]);
  if (
    typeof value !== "function" ||
    value.name !== names[index] ||
    value.length !== 1 ||
    Object.getPrototypeOf(value) !== Function.prototype ||
    value.prototype !== undefined ||
    Object.prototype.hasOwnProperty.call(value, "prototype") ||
    descriptor.writable !== true ||
    descriptor.enumerable !== false ||
    descriptor.configurable !== true
  ) {
    metadata = metadata + " " + names[index];
  }
}
console.log("metadata", names.length, metadata === "");
const unescaped =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@*_+-./";
console.log("unescaped", escape(unescaped) === unescaped);
let ascii = "";
for (let unit = 0; unit < 128; unit = unit + 1) {
  if (unescaped.indexOf(String.fromCharCode(unit)) < 0) {
    ascii = ascii + String.fromCharCode(unit);
  }
}
console.log("ascii", ascii.length, escape(ascii));
console.log(
  "latin1",
  escape("\\u0080\\u00a0\\u00e9\\u00ff"),
  escape("\\u0100\\u4e2d\\uabcd\\uffff"),
);
console.log(
  "surrogates",
  escape("\\ud800"),
  escape("\\udfff"),
  escape("\\ud83d\\ude00"),
  escape("\\udc00\\ud800"),
);
console.log(
  "unescape forms",
  unescape("%41%62%7e%7E"),
  unescape("%u0041%u4E2D%u4e2d%uFFFF") === "A\\u4e2d\\u4e2d\\uffff",
  unescape("%uD83D%uDE00") === "\\ud83d\\ude00",
  unescape("%uD800") === "\\ud800",
);
console.log(
  "unescape kept",
  unescape("%"),
  unescape("%4"),
  unescape("%G1"),
  unescape("%1G"),
  unescape("%u"),
  unescape("%u004"),
  unescape("%u004G"),
  unescape("%U0041"),
  unescape("%%41"),
  unescape("%u%41"),
);
console.log(
  "unescape prefix",
  unescape("%u00410") === "A0",
  unescape("%u0041%") === "A%",
  unescape("%41%u") === "A%u",
  unescape("%u00zz") === "%u00zz",
  unescape("%u0") === "%u0",
);
let roundTrips = 0;
const samples = [
  "",
  "a b",
  "\\u0000\\u0001\\u007f",
  "%u0041",
  "%41",
  "\\u00ff\\u0100",
  "\\ud800x\\udc00",
  "\\ud83d\\ude00\\uffff",
];
for (let index = 0; index < samples.length; index = index + 1) {
  if (unescape(escape(samples[index])) === samples[index]) {
    roundTrips = roundTrips + 1;
  }
}
console.log("round trip", samples.length, roundTrips);
console.log(
  "coercion",
  escape(),
  escape(undefined),
  unescape(null),
  escape(1.5),
  escape(-0),
  unescape(true),
  escape({ toString() { return "a b"; } }),
  unescape({ toString() { return "%41"; }, valueOf() { return "%42"; } }),
);
const order = [];
try {
  escape({
    toString() { order.push("called"); throw new RangeError("x"); },
  });
} catch (error) {
  console.log("abrupt", error instanceof RangeError, order.join(","));
}
try {
  unescape(Symbol("x"));
} catch (error) {
  console.log("symbol", error instanceof TypeError);
}
try {
  new escape("a");
} catch (error) {
  console.log("not a constructor escape", error instanceof TypeError);
}
try {
  new unescape("a");
} catch (error) {
  console.log("not a constructor unescape", error instanceof TypeError);
}
console.log("receiver", escape.call(42, "a b"), unescape.apply(null, ["%41"]));
/** @param {number} operand @param {number} addend */
function hinted(operand, addend) { return operand + addend; }
console.log("hint", hinted(2, 1), hinted(escape("a"), 1));
let turn = 0;
while (turn < 2) {
  console.log("guard", escape("a b"), unescape("%41"));
  if (turn === 0) escapeGlobalObject.marker = 1;
  turn = turn + 1;
}
console.log(
  "marker",
  escapeGlobalObject.marker,
  delete escapeGlobalObject.marker,
);
({ value: escape } = { value: 31 });
console.log("object target", escape, this.escape === escape);
[unescape] = [32];
console.log("array target", unescape, this.unescape === unescape);
escape = originalEscape;
unescape = originalUnescape;
console.log(
  "target restore",
  escape === originalEscape,
  unescape === originalUnescape,
);
this.escape = 123;
console.log("global write", this.escape === escape, escape);
this.escape = originalEscape;
console.log("global restore", this.escape === escape);
console.log("global delete", delete this.unescape, typeof unescape);
try { unescape; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
function strictDeletedSet() { "use strict"; unescape = 1; }
try { strictDeletedSet(); } catch (error) {
  console.log("global deleted strict set", error instanceof ReferenceError);
}
({ value: unescape } = { value: originalUnescape });
console.log("global deleted pattern restore", this.unescape === unescape);
`,
  },
];
