import type { Fixture } from "../fixture.ts";

export const genericStringCoercionFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "generic-string-coercion",
    source: `
const tagged = [
  ["undefined", undefined],
  ["null", null],
  ["object", {}],
  ["array", []],
  ["function", function named() {}],
  ["arrow", () => 1],
  ["error", new Error("e")],
  ["number wrapper", new Number(1)],
  ["string wrapper", new String("s")],
  ["boolean wrapper", Object(true)],
  ["regexp", new RegExp("a")],
  ["map", new Map()],
  ["array buffer", new ArrayBuffer(1)],
  ["data view", new DataView(new ArrayBuffer(1))],
  ["promise", Promise.resolve(1)],
];
for (const entry of tagged) {
  console.log("tag", entry[0], Object.prototype.toString.call(entry[1]));
}
function collectArguments() { return arguments; }
console.log(
  "tag arguments",
  Object.prototype.toString.call(collectArguments()),
);

const promise = Promise.resolve(1);
console.log("promise text", String(promise), promise + "", \`\${promise}\`);
console.log("promise numeric", +promise, promise * 1);
console.log("promise key", ({ [promise]: 1 })["[object Promise]"]);
console.log(
  "callable text",
  String(function named() {}),
  String(Object.prototype.toString).indexOf("native code") > 0,
);

const tagOwn = { [Symbol.toStringTag]: "Own" };
const tagBase = { [Symbol.toStringTag]: "Base" };
const tagInherited = Object.create(tagBase);
const tagNonString = { [Symbol.toStringTag]: 42 };
const taggedArray = [];
taggedArray[Symbol.toStringTag] = "TaggedArray";
let tagReads = 0;
const tagGetter = {};
Object.defineProperty(tagGetter, Symbol.toStringTag, {
  get() { tagReads = tagReads + 1; return "Getter"; },
});
console.log(
  "toStringTag",
  String(tagOwn),
  String(tagInherited),
  String(tagNonString),
  Object.prototype.toString.call(taggedArray),
  String(tagGetter),
  tagReads,
);
const taggedPromise = Promise.resolve(1);
Object.defineProperty(taggedPromise, Symbol.toStringTag, {
  value: "Shadowed",
});
console.log("shadowed builtin tag", String(taggedPromise));

const hints = [];
const exotic = {
  [Symbol.toPrimitive](hint) {
    hints.push(hint);
    return hint === "number" ? 7 : "E:" + hint;
  },
};
console.log("toPrimitive text", String(exotic), \`\${exotic}\`);
console.log("toPrimitive default", exotic + "", exotic == "E:default");
console.log("toPrimitive number", +exotic, exotic * 2, exotic < 8);
console.log("toPrimitive hints", hints.join(","));

const nullishMethod = {
  [Symbol.toPrimitive]: null,
  toString() { return "N"; },
};
console.log("nullish toPrimitive", String(nullishMethod));
try { String({ [Symbol.toPrimitive]: 1 }); } catch (error) {
  console.log("non-callable toPrimitive", error instanceof TypeError);
}
try { String({ [Symbol.toPrimitive]() { return {}; } }); } catch (error) {
  console.log("object toPrimitive", error instanceof TypeError);
}
try {
  String({ [Symbol.toPrimitive]() { throw new RangeError("exotic"); } });
} catch (error) {
  console.log("abrupt toPrimitive", error instanceof RangeError);
}

const order = [];
const ordinary = {
  toString() { order.push("toString"); return "T"; },
  valueOf() { order.push("valueOf"); return 3; },
};
console.log("string hint", String(ordinary), \`\${ordinary}\`);
console.log("number hint", +ordinary, ordinary - 0);
console.log("default hint", ordinary + "", ordinary + 1);
console.log("order", order.join(","));

const fallthrough = { toString() { return {}; }, valueOf() { return "V"; } };
console.log("string falls through", String(fallthrough));
const numericFallthrough = {
  toString() { return "T"; },
  valueOf() { return {}; },
};
console.log("number falls through", numericFallthrough + "");
try { String({ toString() { return {}; }, valueOf() { return {}; } }); }
catch (error) { console.log("both object", error instanceof TypeError); }
try { String(Object.create(null)); } catch (error) {
  console.log("null prototype", error instanceof TypeError);
}
try { String(Object.create(Function.prototype)); } catch (error) {
  console.log("function prototype receiver", error instanceof TypeError);
}
console.log(
  "non-callable methods",
  String({ toString: 1, valueOf() { return "V"; } }),
);

const savedToString = Object.prototype.toString;
const savedValueOf = Object.prototype.valueOf;
const methodDescriptor = {
  configurable: true,
  enumerable: false,
  value: savedToString,
  writable: true,
};
delete Object.prototype.toString;
let deletedToString = "unset";
try { String({}); } catch (error) {
  deletedToString = error instanceof TypeError;
}
delete Object.prototype.valueOf;
let deletedBoth = "unset";
try { String({}); } catch (error) { deletedBoth = error instanceof TypeError; }
Object.defineProperty(Object.prototype, "toString", methodDescriptor);
methodDescriptor.value = savedValueOf;
Object.defineProperty(Object.prototype, "valueOf", methodDescriptor);
console.log("deleted defaults", deletedToString, deletedBoth);
console.log("restored defaults", String({}));

Object.prototype.toString = function () { return "replaced"; };
console.log("replaced default", String({}), String(Promise.resolve(1)));
methodDescriptor.value = savedToString;
Object.defineProperty(Object.prototype, "toString", methodDescriptor);
console.log("restored again", String({}));

console.log(
  "toLocaleString",
  Object.prototype.toLocaleString.call({ toString() { return "L"; } }),
  Object.prototype.toLocaleString.call(Promise.resolve(1)),
);

const throwingTag = {};
Object.defineProperty(throwingTag, Symbol.toStringTag, {
  get() { throw new RangeError("tag"); },
});
try { String(throwingTag); } catch (error) {
  console.log("abrupt tag", error instanceof RangeError);
}

/** @param {object} value */
function hinted(value) { return String(value.toString()); }
const shaped = { toString() { return "S"; } };
console.log("hint hit", hinted(shaped), hinted(shaped));
console.log("false hint", hinted(Promise.resolve(1)));
let turn = 0;
while (turn < 2) {
  console.log("guard", hinted(shaped));
  if (turn === 0) shaped.guardMarker = 1;
  turn = turn + 1;
}
`,
  },
];
