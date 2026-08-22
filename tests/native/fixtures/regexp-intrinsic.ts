import type { Fixture } from "../fixture.ts";

export const regexpIntrinsicFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "regexp-intrinsic",
    source: `
console.log("metadata", typeof RegExp, RegExp.name, RegExp.length);
const prototypeDescriptor = Object.getOwnPropertyDescriptor(
  RegExp,
  "prototype",
);
const constructorDescriptor = Object.getOwnPropertyDescriptor(
  RegExp.prototype,
  "constructor",
);
const speciesDescriptor = Object.getOwnPropertyDescriptor(
  RegExp,
  Symbol.species,
);
console.log(
  "links",
  Object.getPrototypeOf(RegExp) === Function.prototype,
  Object.getPrototypeOf(RegExp.prototype) === Object.prototype,
  RegExp.prototype.constructor === RegExp,
  prototypeDescriptor.writable,
  prototypeDescriptor.enumerable,
  prototypeDescriptor.configurable,
  constructorDescriptor.writable,
  constructorDescriptor.enumerable,
  constructorDescriptor.configurable,
);
console.log(
  "species",
  speciesDescriptor.get.name,
  speciesDescriptor.get.length,
  speciesDescriptor.set,
  speciesDescriptor.enumerable,
  speciesDescriptor.configurable,
  RegExp[Symbol.species] === RegExp,
);

const empty = RegExp();
const constructed = new RegExp("a", "ig");
console.log(
  "instances",
  empty instanceof RegExp,
  constructed instanceof RegExp,
  Object.getPrototypeOf(constructed) === RegExp.prototype,
  Object.prototype.toString.call(constructed),
  RegExp(constructed) === constructed,
  new RegExp(constructed) !== constructed,
);
const lastIndexDescriptor = Object.getOwnPropertyDescriptor(
  constructed,
  "lastIndex",
);
console.log(
  "lastIndex descriptor",
  lastIndexDescriptor.value,
  lastIndexDescriptor.writable,
  lastIndexDescriptor.enumerable,
  lastIndexDescriptor.configurable,
);
constructed.lastIndex = 19;
empty.lastIndex = -4;
console.log("lastIndex state", constructed.lastIndex, empty.lastIndex);
console.log(
  "lastIndex delete",
  delete constructed.lastIndex,
  constructed.lastIndex,
);
console.log(
  "validator edges",
  new RegExp("[\\\\-]", "u") instanceof RegExp,
  new RegExp("[𐀀-𐀁]", "u") instanceof RegExp,
  new RegExp("\\\\u{0000061}", "u") instanceof RegExp,
  new RegExp(
    "[\\\\uD800\\\\uDC00-\\\\uD801\\\\uDC01]",
    "u",
  ) instanceof RegExp,
  new RegExp("[𐀀-\\\\uD800\\\\uDC01]", "u") instanceof RegExp,
  new RegExp("[\\\\t- ]") instanceof RegExp,
  new RegExp("[\\\\0-\\\\n]") instanceof RegExp,
);

const order = [];
const regexpLike = {
  get [Symbol.match]() {
    order.push("match");
    return true;
  },
  get source() {
    order.push("source");
    return {
      toString() {
        order.push("pattern string");
        return "a+";
      },
    };
  },
  get flags() {
    order.push("flags");
    return {
      toString() {
        order.push("flags string");
        return "g";
      },
    };
  },
};
const fromLike = RegExp(regexpLike);
console.log(
  "regexp-like",
  fromLike instanceof RegExp,
  order.join(","),
  fromLike.lastIndex,
);

let plainConversions = 0;
const plain = {
  [Symbol.match]: false,
  toString() {
    plainConversions = plainConversions + 1;
    return "plain";
  },
  get source() {
    throw new Error("unreachable source");
  },
};
console.log(
  "match false",
  RegExp(plain) instanceof RegExp,
  plainConversions,
);

for (const values of [
  ["[", ""],
  ["a", "gg"],
  ["a", "uv"],
  ["(?<a>x)(?<a>y)", ""],
  ["\\\\b*", ""],
  ["\\\\B{2}", ""],
  ["[a-\\\\n]", ""],
  ["(a)[\\\\1]", "u"],
  ["\\\\p{", "u"],
  ["\\\\p{}", "u"],
  ["\\\\p{a b}", "u"],
  ["\\\\p{=L}", "u"],
  ["\\\\p{1=L}", "u"],
  ["(?i)", ""],
  ["(?ii:a)", ""],
  ["(?i-i:a)", ""],
  ["(?-:a)", ""],
  ["(?<\\\\uZZZZ>a)", ""],
  ["(?<\\\\u{110000}>a)", ""],
]) {
  try {
    new RegExp(values[0], values[1]);
  } catch (error) {
    console.log("syntax", error instanceof SyntaxError);
  }
}
const abrupt = {
  toString() {
    throw new RangeError("pattern conversion");
  },
};
try {
  RegExp(abrupt);
} catch (error) {
  console.log("abrupt", error instanceof RangeError, error.message);
}
let flagPatternReads = 0;
const orderedPattern = {
  toString() {
    flagPatternReads = flagPatternReads + 1;
    return "a";
  },
};
const abruptFlags = {
  toString() {
    throw new TypeError("flags conversion");
  },
};
try {
  RegExp(orderedPattern, abruptFlags);
} catch (error) {
  console.log(
    "flags abrupt",
    error instanceof TypeError,
    error.message,
    flagPatternReads,
  );
}

class DerivedRegExp extends RegExp {}
const derived = new DerivedRegExp("a", "g");
console.log(
  "derived",
  derived instanceof DerivedRegExp,
  derived instanceof RegExp,
  Object.getPrototypeOf(derived) === DerivedRegExp.prototype,
  derived.lastIndex,
);

/** @param {number} value */
function hinted(value) {
  return value + 1;
}
console.log("hints", hinted(3), hinted("miss"));

const saved = RegExp;
RegExp = 7;
console.log("replace", RegExp);
RegExp = saved;
console.log("restore", RegExp === saved);
`,
    specialization: {
      genericCallsDisabled: 4,
      genericCallsEnabled: 4,
      hits: 36,
      misses: 105,
      overflowMisses: 0,
    },
  },
];
