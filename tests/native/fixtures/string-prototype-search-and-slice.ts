import type { Fixture } from "../fixture.ts";

export const stringPrototypeSearchAndSliceFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "string-prototype-search-and-slice",
    source: `
const methods = [
  ["concat", 1],
  ["indexOf", 1],
  ["lastIndexOf", 1],
  ["includes", 1],
  ["startsWith", 1],
  ["endsWith", 1],
  ["slice", 2],
  ["substring", 2],
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

const astral = "A" + String.fromCharCode(55357, 56832, 0, 66) + "ana";
console.log(
  "concat",
  "a".concat(),
  "a".concat("b", 3, true),
  String.prototype.concat.call(42, "!"),
  astral.concat(String.fromCharCode(55296)).length,
);
console.log(
  "index",
  "bananana".indexOf("ana"),
  "bananana".indexOf("ana", 2),
  "bananana".indexOf("", Infinity),
  "bananana".indexOf("x", -Infinity),
  "bananana".lastIndexOf("ana"),
  "bananana".lastIndexOf("ana", 4),
  "bananana".lastIndexOf("ana", NaN),
  "bananana".lastIndexOf("", -Infinity),
);
console.log(
  "predicates",
  "bananana".includes("ana"),
  "bananana".includes("ana", 6),
  "bananana".startsWith("ban"),
  "bananana".startsWith("ana", 1),
  "bananana".endsWith("ana"),
  "bananana".endsWith("nan", 6),
  "bananana".endsWith("", -Infinity),
);
console.log(
  "slice",
  astral.slice(1, 3) === String.fromCharCode(55357, 56832),
  "abcdef".slice(-4, -1),
  "abcdef".slice(4, 2),
  "abcdef".slice(-Infinity, Infinity),
  "abcdef".substring(4, 2),
  "abcdef".substring(-3, 3),
  "abcdef".substring(2, Infinity),
  "abcdef".substring(3, 3),
);

let order = "";
const receiver = {
  toString() { order = order + "r"; return "abcabc"; },
};
const search = {
  get [Symbol.match]() { order = order + "m"; return false; },
  toString() { order = order + "s"; return "bc"; },
};
const position = {
  valueOf() { order = order + "p"; return 2; },
};
console.log(
  "generic search",
  String.prototype.includes.call(receiver, search, position),
  order,
);
order = "";
console.log(
  "generic index",
  String.prototype.indexOf.call(receiver, search, position),
  order,
);
order = "";
console.log(
  "generic slice",
  String.prototype.slice.call(
    receiver,
    { valueOf() { order = order + "s"; return 1; } },
    { valueOf() { order = order + "e"; return 4; } },
  ),
  order,
);
order = "";
console.log(
  "generic concat",
  String.prototype.concat.call(
    receiver,
    { toString() { order = order + "a"; return "!"; } },
    { toString() { order = order + "b"; return "?"; } },
  ),
  order,
);

let converted = false;
const regexpLike = {
  get [Symbol.match]() { return true; },
  toString() { converted = true; return "a"; },
};
for (const name of ["includes", "startsWith", "endsWith"]) {
  try { String.prototype[name].call("abc", regexpLike, 0); } catch (error) {
    console.log("regexp rejection", name, error instanceof TypeError);
  }
}
console.log("regexp conversion skipped", converted);
const abruptMatch = {
  get [Symbol.match]() { throw new RangeError("match"); },
};
try { "abc".includes(abruptMatch); } catch (error) {
  console.log("match abrupt", error instanceof RangeError);
}

let positionReached = false;
try {
  String.prototype.indexOf.call(
    { toString() { throw new RangeError("receiver"); } },
    { toString() { throw new TypeError("search"); } },
    { valueOf() { positionReached = true; return 0; } },
  );
} catch (error) {
  console.log("receiver abrupt", error instanceof RangeError, positionReached);
}
try {
  "abc".indexOf(
    { toString() { throw new RangeError("search"); } },
    { valueOf() { positionReached = true; return 0; } },
  );
} catch (error) {
  console.log("search abrupt", error instanceof RangeError, positionReached);
}
for (const value of [0n, Symbol("position")]) {
  try { "abc".slice(value); } catch (error) {
    console.log("position rejection", error instanceof TypeError);
  }
}
for (const value of [null, undefined, Symbol("receiver")]) {
  try { String.prototype.substring.call(value, 0); } catch (error) {
    console.log("receiver rejection", error instanceof TypeError);
  }
}

/** @param {string} value */
function hinted(value) { return value.indexOf("a"); }
console.log("hint hit", hinted("abc"));
console.log("false hint", hinted(new String("abc")));
let turn = 0;
while (turn < 2) {
  console.log("guard", hinted("abc"));
  if (turn === 0) String.prototype.searchMarker = 1;
  turn = turn + 1;
}
`,
  },
];
