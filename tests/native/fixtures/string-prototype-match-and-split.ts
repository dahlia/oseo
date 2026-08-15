import type { Fixture } from "../fixture.ts";

export const stringPrototypeMatchAndSplitFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "string-prototype-match-and-split",
    source: `
const methods = [
  ["match", 1],
  ["matchAll", 1],
  ["search", 1],
  ["split", 2],
];
function render(values) {
  let result = "";
  for (let index = 0; index < values.length; index = index + 1) {
    if (index !== 0) result = result + "|";
    result = result + values[index];
  }
  return result;
}
for (const entry of methods) {
  const name = entry[0];
  const method = String.prototype[name];
  const descriptor = Object.getOwnPropertyDescriptor(String.prototype, name);
  console.log(
    "metadata",
    name,
    method.name === name,
    method.length === entry[1],
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
  );
  try { new method(); } catch (error) {
    console.log("not constructor", name, error instanceof TypeError);
  }
}

for (const entry of [
  [Symbol.match, "match"],
  [Symbol.matchAll, "matchAll"],
  [Symbol.search, "search"],
  [Symbol.split, "split"],
]) {
  const symbol = entry[0];
  const name = entry[1];
  let callCount = 0;
  const protocol = {
    [symbol](...args) {
      callCount = callCount + 1;
      return this === protocol && args[0] === "subject" &&
        (name !== "split" || args[1] === 3);
    },
  };
  console.log("protocol", name, String.prototype[name].call(
    "subject", protocol, 3), callCount);
}

let order = "";
const globalMatcher = {
  get [Symbol.match]() { order = order + "r"; return true; },
  get flags() { order = order + "f"; return "g"; },
  get [Symbol.matchAll]() {
    order = order + "m";
    return function(value) {
      order = order + "c";
      return value === receiver && this === globalMatcher;
    };
  },
};
const receiver = {
  toString() { order = order + "s"; return "subject"; },
};
console.log(
  "matchAll protocol order",
  String.prototype.matchAll.call(receiver, globalMatcher),
  order,
);

order = "";
const fallbackMatcher = {
  get [Symbol.match]() { order = order + "i"; return false; },
  get [Symbol.matchAll]() { order = order + "a"; return undefined; },
  toString() { order = order + "p"; return "b"; },
};
const fallbackReceiver = {
  toString() { order = order + "r"; return "abc"; },
};
const fallbackMatches = String.prototype.matchAll.call(
  fallbackReceiver,
  fallbackMatcher,
);
console.log("matchAll fallback order", fallbackMatches.next().value[0], order);

order = "";
const splitSeparator = {
  get [Symbol.split]() { order = order + "d"; return undefined; },
  toString() { order = order + "p"; return "b"; },
};
const splitLimit = {
  valueOf() { order = order + "l"; return 2; },
};
console.log(
  "split fallback order",
  render(String.prototype.split.call(
    fallbackReceiver,
    splitSeparator,
    splitLimit,
  )),
  order,
);

const matched = "a-b-a".match("a");
console.log(
  "match fallback",
  matched[0],
  matched.index,
  matched.input,
  matched.groups === undefined,
  "bbb".match("a") === null,
);
console.log(
  "search fallback",
  "a-b-a".search("b"),
  "a-b-a".search("z"),
  String.prototype.search.call({ toString() { return "xyx"; } }, "y"),
);
for (const name of ["match", "search"]) {
  order = "";
  const orderedReceiver = {
    toString() { order = order + "r"; return "abc"; },
  };
  const orderedPattern = {
    [name === "match" ? Symbol.match : Symbol.search]: null,
    toString() { order = order + "p"; return "b"; },
  };
  String.prototype[name].call(orderedReceiver, orderedPattern);
  console.log("fallback order", name, order);
}
console.log(
  "null protocol fallback",
  "abc".match({ [Symbol.match]: null, toString() { return "b"; } })[0],
  "abc".search({ [Symbol.search]: null, toString() { return "b"; } }),
);
for (const match of "a-b-a".matchAll("a")) {
  console.log("matchAll fallback", match[0], match.index, match.input);
}
for (const match of "xy".matchAll("")) {
  console.log("matchAll empty", match.index);
}

console.log("split fallback", render("a-b--c".split("-")));
console.log("split limit", render("a-b--c".split("-", 3)));
console.log("split empty", render("abc".split("", 2)));
console.log("split absent", "abc".split()[0], "abc".split().length);
console.log("split zero", "abc".split("", 0).length);
console.log(
  "split generic",
  render(String.prototype.split.call(
    { toString() { return "1x2x3"; } },
    { toString() { return "x"; } },
    { valueOf() { return 2; } },
  )),
);

const abrupt = {
  get [Symbol.search]() { throw new RangeError("search"); },
};
try { "abc".search(abrupt); } catch (error) {
  console.log("abrupt getter", error instanceof RangeError);
}
try { "abc".split({ [Symbol.split]: 1 }); } catch (error) {
  console.log("not callable", error instanceof TypeError);
}
order = "";
try {
  String.prototype.split.call(
    fallbackReceiver,
    { toString() { order = order + "p"; return "b"; } },
    { valueOf() { order = order + "l"; throw new RangeError("limit"); } },
  );
} catch (error) {
  console.log("abrupt limit", error instanceof RangeError, order);
}
try {
  "abc".split({
    toString() { throw new RangeError("separator"); },
  }, 0);
} catch (error) {
  console.log("zero still converts separator", error instanceof RangeError);
}
try {
  "abc".matchAll({ [Symbol.match]: true, flags: "", [Symbol.matchAll]() {} });
} catch (error) {
  console.log("nonglobal", error instanceof TypeError);
}
for (const value of [null, undefined]) {
  try { String.prototype.match.call(value, "a"); } catch (error) {
    console.log("nullish", error instanceof TypeError);
  }
}

/** @param {string} value */
function hinted(value) { return value.split("-")[0]; }
console.log("hint hit", hinted("a-b"));
console.log("false hint", hinted(new String("a-b")));
let turn = 0;
while (turn < 2) {
  console.log("guard", hinted("a-b"));
  if (turn === 0) String.prototype.matchSplitMarker = 1;
  turn = turn + 1;
}
`,
  },
];
