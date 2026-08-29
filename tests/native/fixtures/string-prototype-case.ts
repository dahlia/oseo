import type { Fixture } from "../fixture.ts";

export const stringPrototypeCaseFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "string-prototype-case",
    source: `
const methods = [
  ["localeCompare", 1],
  ["toLocaleLowerCase", 0],
  ["toLocaleUpperCase", 0],
  ["toLowerCase", 0],
  ["toUpperCase", 0],
  ["trim", 0],
  ["trimStart", 0],
  ["trimEnd", 0],
  ["normalize", 0],
];
for (const entry of methods) {
  const name = entry[0];
  const length = entry[1];
  const method = String.prototype[name];
  const descriptor = Object.getOwnPropertyDescriptor(String.prototype, name);
  console.log(
    "metadata",
    name,
    method.name === name,
    method.length === length,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
  );
  try { new method(); } catch (error) {
    console.log("not constructor", name, error instanceof TypeError);
  }
}

console.log(
  "lower",
  "ABC\\u0130\\u03a3".toLowerCase() === "abci\\u0307\\u03c2",
  "A\\u03a3A".toLowerCase() === "a\\u03c3a",
  "A\\u180e\\u03a3".toLowerCase() === "a\\u180e\\u03c2",
  "A\\u03a3\\u180eB".toLowerCase() === "a\\u03c3\\u180eb",
  "\\u1c89".toLowerCase() === "\\u1c8a",
  "\\ud801\\udc00".toLowerCase() === "\\ud801\\udc28",
  "\\ud800".toLowerCase() === "\\ud800",
);
console.log(
  "upper",
  "abc\\u00df\\ufb03".toUpperCase() === "ABCSSFFI",
  "\\u1c8a".toUpperCase() === "\\u1c89",
  "\\ud801\\udc28".toUpperCase() === "\\ud801\\udc00",
  "\\udc00".toUpperCase() === "\\udc00",
);
console.log(
  "locale case",
  "ABC\\u03a3".toLocaleLowerCase() === "abc\\u03c2",
  "abc\\u00df".toLocaleUpperCase() === "ABCSS",
);

const whitespace =
  "\\u0009\\u000a\\u000b\\u000c\\u000d\\u0020\\u00a0\\u1680" +
  "\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008" +
  "\\u2009\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff";
console.log(
  "trim",
  (whitespace + "middle" + whitespace).trim() === "middle",
  (whitespace + "middle" + whitespace).trimStart() ===
    "middle" + whitespace,
  (whitespace + "middle" + whitespace).trimEnd() ===
    whitespace + "middle",
  "\\u200bmiddle\\u200b".trim() === "\\u200bmiddle\\u200b",
  "\\u180emiddle\\u180e".trim() === "\\u180emiddle\\u180e",
  "".trim() === "",
  whitespace.trim() === "",
);

const normalization = [
  ["\\u00f6", "\\u00f6", "o\\u0308", "\\u00f6", "o\\u0308"],
  ["\\u212b", "\\u00c5", "A\\u030a", "\\u00c5", "A\\u030a"],
  ["\\ufb03", "\\ufb03", "\\ufb03", "ffi", "ffi"],
  ["\\uac00", "\\uac00", "\\u1100\\u1161", "\\uac00", "\\u1100\\u1161"],
];
for (const entry of normalization) {
  const input = entry[0];
  console.log(
    "normalize",
    input.normalize("NFC") === entry[1],
    input.normalize("NFD") === entry[2],
    input.normalize("NFKC") === entry[3],
    input.normalize("NFKD") === entry[4],
  );
}
console.log("normalize default", "o\\u0308".normalize() === "\\u00f6");
try { "x".normalize("invalid"); } catch (error) {
  console.log("normalize form", error instanceof RangeError);
}

console.log(
  "locale compare",
  "o\\u0308".localeCompare("\\u00f6") === 0,
  "\\u212b".localeCompare("A\\u030a") === 0,
  "a".localeCompare("b") < 0,
  "b".localeCompare("a") > 0,
  "undefined".localeCompare() === "undefined".localeCompare(undefined),
);

let order = "";
const receiver = {
  toString() { order = order + "r"; return " A\\u00df "; },
};
console.log(
  "generic",
  String.prototype.toUpperCase.call(receiver) === " ASS ",
  String.prototype.trim.call(receiver) === "A\\u00df",
  order,
);
order = "";
console.log(
  "normalize order",
  String.prototype.normalize.call(
    { toString() { order = order + "r"; return "o\\u0308"; } },
    { toString() { order = order + "f"; return "NFC"; } },
  ) === "\\u00f6",
  order,
);
order = "";
console.log(
  "compare order",
  String.prototype.localeCompare.call(
    { toString() { order = order + "r"; return "o\\u0308"; } },
    { toString() { order = order + "a"; return "\\u00f6"; } },
  ) === 0,
  order,
);

for (const value of [null, undefined]) {
  try { String.prototype.trim.call(value); } catch (error) {
    console.log("nullish", error instanceof TypeError);
  }
}
try { String.prototype.toLowerCase.call(Symbol("receiver")); } catch (error) {
  console.log("symbol", error instanceof TypeError);
}
try {
  String.prototype.trim.call({
    toString() { throw new RangeError("receiver"); },
  });
} catch (error) {
  console.log("abrupt", error instanceof RangeError);
}

/** @param {string} value */
function hinted(value) { return value.toLowerCase(); }
console.log("hint hit", hinted("ABC") === "abc");
console.log("false hint", hinted(new String("ABC")) === "abc");
let turn = 0;
while (turn < 2) {
  console.log("guard", hinted("ABC") === "abc");
  if (turn === 0) String.prototype.caseMarker = 1;
  turn = turn + 1;
}
`,
  },
];
