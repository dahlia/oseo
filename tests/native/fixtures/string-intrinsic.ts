import type { Fixture } from "../fixture.ts";

export const stringIntrinsicFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "string-intrinsic",
    source: `
console.log("metadata", typeof String, String.name, String.length);
const prototypeDescriptor = Object.getOwnPropertyDescriptor(
  String,
  "prototype",
);
const rawDescriptor = Object.getOwnPropertyDescriptor(String, "raw");
const trimDescriptor = Object.getOwnPropertyDescriptor(
  String.prototype,
  "trim",
);
console.log(
  "descriptors",
  prototypeDescriptor.writable,
  prototypeDescriptor.enumerable,
  prototypeDescriptor.configurable,
  rawDescriptor.writable,
  rawDescriptor.enumerable,
  rawDescriptor.configurable,
  trimDescriptor.writable,
  trimDescriptor.enumerable,
  trimDescriptor.configurable,
);
console.log(
  "statics",
  String.fromCharCode.name,
  String.fromCharCode.length,
  String.fromCodePoint.name,
  String.fromCodePoint.length,
  String.raw.name,
  String.raw.length,
);
console.log(
  "call",
  String(),
  String(undefined),
  String(null),
  String(true),
  String(-0),
  String(1e21),
  String(9007199254740993n),
);
const symbol = Symbol("tag");
console.log("symbol call", String(symbol), String(Symbol()));
try { new String(symbol); } catch (error) {
  console.log("symbol construct", error instanceof TypeError);
}
try { String({ toString: null, valueOf: null }); } catch (error) {
  console.log("no primitive", error instanceof TypeError);
}
let conversions = 0;
const coercible = {
  toString() { conversions = conversions + 1; return "TS"; },
  valueOf() { conversions = conversions + 1; return "VO"; },
};
console.log("hint order", String(coercible), conversions);
const wrapper = new String("héllo");
console.log(
  "wrapper",
  typeof wrapper,
  wrapper.length,
  wrapper[0],
  wrapper[4],
  wrapper[5],
  String.prototype.isPrototypeOf(wrapper),
  wrapper instanceof String,
);
const indexDescriptor = Object.getOwnPropertyDescriptor(wrapper, "1");
const lengthDescriptor = Object.getOwnPropertyDescriptor(wrapper, "length");
console.log(
  "exotic descriptors",
  indexDescriptor.value,
  indexDescriptor.writable,
  indexDescriptor.enumerable,
  indexDescriptor.configurable,
  lengthDescriptor.value,
  lengthDescriptor.writable,
  lengthDescriptor.enumerable,
  lengthDescriptor.configurable,
);
console.log("wrapper tag", ({}).toString.call(wrapper));
console.log(
  "prototype",
  String.prototype.constructor === String,
  String.prototype.length,
  ({}).toString.call(String.prototype),
);
console.log("empty wrapper", new String().length, new String("").length);
let ownKeys = "";
for (const key in new String("ab")) ownKeys = ownKeys + key;
console.log("enumeration", ownKeys, Object.keys(new String("ab")).length);
console.log(
  "from char code",
  String.fromCharCode(),
  String.fromCharCode(104, 105).length,
  String.fromCharCode(65536 + 66) === "B",
  String.fromCharCode(-1) === String.fromCharCode(65535),
  String.fromCharCode(NaN) === String.fromCharCode(0),
);
let charCodeOrder = "";
String.fromCharCode(
  { valueOf() { charCodeOrder = charCodeOrder + "a"; return 65; } },
  { valueOf() { charCodeOrder = charCodeOrder + "b"; return 66; } },
);
console.log("from char code order", charCodeOrder);
try { String.fromCharCode(1n); } catch (error) {
  console.log("from char code bigint", error instanceof TypeError);
}
const astral = String.fromCodePoint(128512);
console.log(
  "from code point",
  String.fromCodePoint().length,
  astral.length,
  astral === String.fromCharCode(55357, 56832),
  String.fromCodePoint(-0).length,
  String.fromCodePoint(55296).length,
  String.fromCodePoint(57343) === String.fromCharCode(57343),
);
for (const invalid of [1.5, -1, 1114112, NaN, Infinity]) {
  try { String.fromCodePoint(invalid); } catch (error) {
    console.log("from code point range", error instanceof RangeError);
  }
}
let codePointOrder = "";
try {
  String.fromCodePoint(
    { valueOf() { codePointOrder = codePointOrder + "a"; return 65; } },
    { valueOf() { codePointOrder = codePointOrder + "b"; return -1; } },
    { valueOf() { codePointOrder = codePointOrder + "c"; return 67; } },
  );
} catch (error) {
  console.log(
    "from code point stops",
    codePointOrder,
    error instanceof RangeError,
  );
}
console.log(
  "raw",
  String.raw({ raw: ["a", "b", "c"] }, 1, 2),
  String.raw({ raw: ["a", "b", "c"] }, 1),
  String.raw({ raw: ["a"] }, 1, 2),
  String.raw({ raw: [] }) === "",
  String.raw({ raw: { 0: "x", 1: "y", length: 2 } }, "-"),
);
console.log("raw negative length", String.raw({ raw: { length: -3 } }) === "");
try { String.raw(); } catch (error) {
  console.log("raw nullish", error instanceof TypeError);
}
try { String.raw({}); } catch (error) {
  console.log("raw missing raw", error instanceof TypeError);
}
let rawOrder = "";
const rawTemplate = {
  get raw() {
    rawOrder = rawOrder + "r";
    return {
      get length() { rawOrder = rawOrder + "n"; return 2; },
      get 0() { rawOrder = rawOrder + "0"; return "A"; },
      get 1() { rawOrder = rawOrder + "1"; return "B"; },
    };
  },
};
const rawResult = String.raw(
  rawTemplate,
  { toString() { rawOrder = rawOrder + "s"; return "-"; } },
);
console.log("raw order", rawResult, rawOrder);
console.log("tagged template", String.raw\`p\${1}q\${2}r\`);
try { new String.raw({ raw: [] }); } catch (error) {
  console.log("static construct", error instanceof TypeError);
}
class Derived extends String {}
const derived = new Derived("sub");
console.log(
  "derived",
  derived instanceof Derived,
  derived instanceof String,
  derived.length,
  derived[2],
  String.prototype.isPrototypeOf(derived),
);
/** @param {string} value */
function hinted(value) { return value + "!"; }
console.log("hint", hinted("a"), hinted(1));
let turn = 0;
while (turn < 2) {
  console.log("guard", String.raw === String.raw);
  if (turn === 0) String.marker = 1;
  turn = turn + 1;
}
function strictStringReceiver() { "use strict"; return this instanceof String; }
console.log("strict receiver", strictStringReceiver.call("x"));
const originalString = String;
const stringGlobalObject = this;
({ value: String } = { value: 31 });
console.log("object target", String, this.String === String);
[String] = [32];
console.log("array target", String, this.String === String);
for (String of [33]) {}
console.log("for-of target", String, this.String === String);
for ({ value: String } of [{ value: 34 }]) {}
console.log("for-of object target", String, this.String === String);
for ([String] of [[35]]) {}
console.log("for-of array target", String, this.String === String);
for (String in { loopKey: true }) {}
console.log("for-in target", String, this.String === String);
for ({ 0: String } in { patternKey: true }) {}
console.log("for-in object target", String, this.String === String);
String = originalString;
console.log("target restore", String === originalString);
String = 40;
console.log("identifier replace", String, this.String === String);
String += 2;
console.log(
  "identifier update",
  String++,
  ++String,
  String,
  this.String,
);
String = originalString;
console.log("identifier restore", String === originalString);
this.String = 123;
console.log("global write", this.String === String, String);
this.String = originalString;
console.log("global restore", this.String === String);
console.log(
  "global delete",
  delete this.String,
  typeof String,
);
try { String; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
try { String += 1; } catch (error) {
  console.log("global deleted update", error instanceof ReferenceError);
}
try { String++; } catch (error) {
  console.log("global deleted step", error instanceof ReferenceError);
}
function strictDeletedStringSet() { "use strict"; String = 1; }
try { strictDeletedStringSet(); } catch (error) {
  console.log("global deleted strict set", error instanceof ReferenceError);
}
function strictDeletedStringPattern() {
  "use strict";
  ({ value: String } = { value: 1 });
}
try { strictDeletedStringPattern(); } catch (error) {
  console.log(
    "global deleted strict pattern",
    error instanceof ReferenceError,
  );
}
function strictDeletedStringLoop() {
  "use strict";
  for (String of [1]) {}
}
try { strictDeletedStringLoop(); } catch (error) {
  console.log("global deleted strict loop", error instanceof ReferenceError);
}
({ value: String } = { value: originalString });
console.log("global deleted pattern restore", this.String === String);
function strictDeleteDuringStringPattern() {
  "use strict";
  ({ value: String = (delete stringGlobalObject.String, 5) } = {});
}
try { strictDeleteDuringStringPattern(); } catch (error) {
  console.log("global strict pattern race", error instanceof ReferenceError);
}
String = originalString;
console.log("global pattern race restore", this.String === String);
function strictDeleteDuringStringSet() {
  "use strict";
  String = (delete stringGlobalObject.String, 5);
}
try { strictDeleteDuringStringSet(); } catch (error) {
  console.log("global strict set race", error instanceof ReferenceError);
}
String = {
  valueOf() {
    delete stringGlobalObject.String;
    return 1;
  },
};
function strictDeleteDuringStringStep() { "use strict"; String++; }
try { strictDeleteDuringStringStep(); } catch (error) {
  console.log("global strict step race", error instanceof ReferenceError);
}
String = originalString;
console.log("global race restore", this.String === String);
`,
  },
];
