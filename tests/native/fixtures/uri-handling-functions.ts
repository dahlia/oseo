import type { Fixture } from "../fixture.ts";

export const uriHandlingFunctionFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "uri-handling-functions",
    source: `
const uriGlobalObject = this;
const originalEncodeURI = encodeURI;
const names = [
  "decodeURI",
  "decodeURIComponent",
  "encodeURI",
  "encodeURIComponent",
];
const values = [decodeURI, decodeURIComponent, encodeURI, encodeURIComponent];
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
    descriptor.writable !== true ||
    descriptor.enumerable !== false ||
    descriptor.configurable !== true
  ) {
    metadata = metadata + " " + names[index];
  }
}
console.log("metadata", names.length, metadata === "");
const unreserved = "-_.!~*'()ABCXYZabcxyz0189";
const reserved = ";/?:@&=+$,#";
console.log(
  "unreserved",
  encodeURI(unreserved) === unreserved,
  encodeURIComponent(unreserved) === unreserved,
  decodeURI(unreserved) === unreserved,
  decodeURIComponent(unreserved) === unreserved,
);
console.log("reserved", encodeURI(reserved), encodeURIComponent(reserved));
console.log(
  "reserved decode",
  decodeURI(encodeURIComponent(reserved)),
  decodeURIComponent(encodeURIComponent(reserved)),
);
console.log(
  "utf8",
  encodeURI("\\u0000\\u007f"),
  encodeURI("\\u0080\\u07ff"),
  encodeURI("\\u0800\\uffff"),
  encodeURI("\\ud800\\udc00"),
  encodeURI("\\udbff\\udfff"),
);
console.log(
  "component utf8",
  encodeURIComponent("a b"),
  encodeURIComponent("%"),
  encodeURIComponent("\\u00e9\\u4e2d\\ud83d\\ude00"),
);
console.log(
  "decode",
  decodeURIComponent("%00%7F") === "\\u0000\\u007f",
  decodeURIComponent("%C2%80%DF%BF") === "\\u0080\\u07ff",
  decodeURIComponent("%E0%A0%80%EF%BF%BF") === "\\u0800\\uffff",
  decodeURIComponent("%F0%90%80%80%F4%8F%BF%BF") ===
    "\\ud800\\udc00\\udbff\\udfff",
);
console.log(
  "round trip",
  decodeURI(encodeURI("a b\\u00e9\\u4e2d\\ud83d\\ude00;/?:@&=+$,#")) ===
    "a b\\u00e9\\u4e2d\\ud83d\\ude00;/?:@&=+$,#",
  decodeURIComponent(
    encodeURIComponent("a b\\u00e9\\u4e2d\\ud83d\\ude00;/?:@&=+$,#"),
  ) === "a b\\u00e9\\u4e2d\\ud83d\\ude00;/?:@&=+$,#",
);
console.log(
  "preserved case",
  decodeURI("%3b%2F"),
  decodeURIComponent("%3b%2F"),
);
const malformed = [
  "%",
  "%A",
  "%GG",
  "%2G",
  "%80",
  "%BF",
  "%C0%80",
  "%C1%BF",
  "%C2",
  "%C2%2F",
  "%C2A0",
  "%E0%80%80",
  "%ED%A0%80",
  "%ED%BF%BF",
  "%F0%80%80%80",
  "%F4%90%80%80",
  "%F5%80%80%80",
  "%F8%88%80%80%80",
  "%FE",
  "%FF",
];
let decodeErrors = 0;
let componentErrors = 0;
for (let index = 0; index < malformed.length; index = index + 1) {
  try {
    decodeURI(malformed[index]);
  } catch (error) {
    if (error instanceof URIError) decodeErrors = decodeErrors + 1;
  }
  try {
    decodeURIComponent(malformed[index]);
  } catch (error) {
    if (error instanceof URIError) componentErrors = componentErrors + 1;
  }
}
console.log("malformed", malformed.length, decodeErrors, componentErrors);
const unpaired = [
  "\\ud800",
  "\\udfff",
  "\\ud800a",
  "a\\udc00",
  "\\udc00\\ud800",
];
let encodeErrors = 0;
for (let index = 0; index < unpaired.length; index = index + 1) {
  try {
    encodeURI(unpaired[index]);
  } catch (error) {
    if (error instanceof URIError) encodeErrors = encodeErrors + 1;
  }
  try {
    encodeURIComponent(unpaired[index]);
  } catch (error) {
    if (error instanceof URIError) encodeErrors = encodeErrors + 1;
  }
}
console.log("unpaired", unpaired.length, encodeErrors);
try {
  decodeURI("%C3%A9%GG");
} catch (error) {
  console.log(
    "error identity",
    error instanceof URIError,
    error.name,
    error.message.length > 0,
  );
}
console.log(
  "coercion",
  encodeURI(),
  encodeURI(undefined),
  encodeURIComponent(null),
  encodeURI(1.5),
  decodeURI(true),
  encodeURIComponent({ toString() { return "a b"; } }),
);
const order = [];
try {
  encodeURI({
    toString() { order.push("called"); throw new RangeError("x"); },
  });
} catch (error) {
  console.log("abrupt", error instanceof RangeError, order.join(","));
}
try {
  encodeURIComponent(Symbol("x"));
} catch (error) {
  console.log("symbol", error instanceof TypeError);
}
try {
  new encodeURI("a");
} catch (error) {
  console.log("not a constructor", error instanceof TypeError);
}
/** @param {number} operand @param {number} addend */
function hinted(operand, addend) { return operand + addend; }
console.log("hint", hinted(2, 1), hinted(encodeURI("a"), 1));
let turn = 0;
while (turn < 2) {
  console.log("guard", encodeURI("a"), decodeURI("a"));
  if (turn === 0) uriGlobalObject.marker = 1;
  turn = turn + 1;
}
console.log("marker", uriGlobalObject.marker, delete uriGlobalObject.marker);
({ value: encodeURI } = { value: 31 });
console.log("object target", encodeURI, this.encodeURI === encodeURI);
[encodeURI] = [32];
console.log("array target", encodeURI, this.encodeURI === encodeURI);
for (encodeURI of [33]) {}
console.log("for-of target", encodeURI, this.encodeURI === encodeURI);
for (encodeURI in { loopKey: true }) {}
console.log("for-in target", encodeURI, this.encodeURI === encodeURI);
encodeURI = originalEncodeURI;
console.log("target restore", encodeURI === originalEncodeURI);
encodeURI = 40;
console.log("identifier replace", encodeURI, this.encodeURI === encodeURI);
encodeURI += 2;
console.log("identifier update", encodeURI++, ++encodeURI, encodeURI);
encodeURI = originalEncodeURI;
console.log("identifier restore", encodeURI === originalEncodeURI);
this.encodeURI = 123;
console.log("global write", this.encodeURI === encodeURI, encodeURI);
this.encodeURI = originalEncodeURI;
console.log("global restore", this.encodeURI === encodeURI);
console.log("global delete", delete this.encodeURI, typeof encodeURI);
try { encodeURI; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
function strictDeletedSet() { "use strict"; encodeURI = 1; }
try { strictDeletedSet(); } catch (error) {
  console.log("global deleted strict set", error instanceof ReferenceError);
}
({ value: encodeURI } = { value: originalEncodeURI });
console.log("global deleted pattern restore", this.encodeURI === encodeURI);
function strictDeleteDuringSet() {
  "use strict";
  encodeURI = (delete uriGlobalObject.encodeURI, 5);
}
try { strictDeleteDuringSet(); } catch (error) {
  console.log("global strict set race", error instanceof ReferenceError);
}
encodeURI = originalEncodeURI;
console.log("global race restore", this.encodeURI === encodeURI);
`,
  },
];
