import type { Fixture } from "../fixture.ts";

export const stringPrototypeReplaceFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "string-prototype-replace",
    source: `
const backtick = String.fromCharCode(0x60);
const quote = String.fromCharCode(0x22);
function show(value) { return quote + value + quote; }
const methods = [["replace", 2], ["replaceAll", 2]];
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

for (const name of ["replace", "replaceAll"]) {
  let calls = 0;
  let seen = "";
  const searchValue = {
    [Symbol.replace](...args) {
      calls = calls + 1;
      seen = typeof args[0] + ":" + args[1] + ":" + (args.length);
      return this === searchValue ? "dispatched" : "wrong this";
    },
    toString() { return "never"; },
  };
  console.log(
    "protocol",
    name,
    String.prototype[name].call("subject", searchValue, "R"),
    calls,
    seen,
  );
}

for (const name of ["replace", "replaceAll"]) {
  const nullReplacer = {
    [Symbol.replace]: null,
    toString() { return "b"; },
    valueOf() { throw new RangeError("valueOf must not run"); },
  };
  console.log(
    "null protocol",
    name,
    "abc"[name](nullReplacer, "X"),
    "abc"[name](nullReplacer, function () { return "F"; }),
  );
  try {
    "abc"[name]({ [Symbol.replace]: 1 }, "X");
  } catch (error) {
    console.log("protocol not callable", name, error instanceof TypeError);
  }
  try {
    "abc"[name]({ get [Symbol.replace]() { throw new RangeError(name); } });
  } catch (error) {
    console.log("protocol getter abrupt", name, error instanceof RangeError);
  }
}

/*
 * A primitive operand is never an Object, so no symbol lookup, IsRegExp
 * observation, or flags read reaches it. The pinned reference hosts
 * disagree about this specification change, so the reviewed test262 cases
 * under the node's inventory roots carry that observation instead.
 */
console.log(
  "primitive operand",
  "a1b1c".replace(1, "X"),
  "a1b1c".replaceAll(1, "X"),
);

let order = "";
const orderedReceiver = { toString() { order = order + "r"; return "abc"; } };
const orderedSearch = { toString() { order = order + "s"; return "b"; } };
const orderedReplace = { toString() { order = order + "v"; return "B"; } };
console.log(
  "conversion order",
  String.prototype.replace.call(
    orderedReceiver,
    orderedSearch,
    orderedReplace,
  ),
  order,
);
order = "";
console.log(
  "conversion order all",
  String.prototype.replaceAll.call(
    orderedReceiver,
    orderedSearch,
    orderedReplace,
  ),
  order,
);

order = "";
const callableReplace = function () { order = order + "c"; return "C"; };
callableReplace.toString = function () {
  order = order + "t";
  return "must not convert";
};
console.log(
  "callable skips toString",
  "abc".replace("b", callableReplace),
  order,
);

let functionalLog = "";
console.log(
  "functional replace",
  "a-b-a".replace("a", function (matched, position, subject) {
    "use strict";
    functionalLog = functionalLog + matched + "@" + position + "/" +
      subject + ";" + (this === undefined) + ";" + arguments.length + "|";
    return "[" + matched + "]";
  }),
  functionalLog,
);
functionalLog = "";
console.log(
  "functional replaceAll",
  "a-b-a".replaceAll("a", function (matched, position, subject) {
    functionalLog = functionalLog + position + ":" + subject.length + "|";
    return "<" + position + ">";
  }),
  functionalLog,
);
console.log(
  "functional result converted",
  "abc".replace("b", function () { return 7; }),
  "abc".replace("b", function () { return { toString() { return "O"; } }; }),
);
try {
  "abc".replace("b", function () { throw new RangeError("replacer"); });
} catch (error) {
  console.log("functional abrupt", error instanceof RangeError);
}
try {
  "abc".replace("b", function () {
    return { toString() { throw new RangeError("result"); } };
  });
} catch (error) {
  console.log("functional result abrupt", error instanceof RangeError);
}
console.log(
  "functional skipped without match",
  "abc".replaceAll("z", function () { throw new RangeError("skip"); }),
);

const substitutions = [
  "$$",
  "$&",
  "$" + backtick,
  "$'",
  "$1",
  "$12",
  "$0",
  "$00",
  "$<name>",
  "$<",
  "$",
  "a$",
  "$$&",
  "[$" + backtick + "|$&|$']",
];
for (const template of substitutions) {
  console.log(
    "substitution",
    show(template),
    show("abcbd".replace("cb", template)),
    show("aXbXc".replaceAll("X", template)),
  );
}
console.log(
  "substitution empty match",
  show("ab".replace("", "[$" + backtick + "|$&|$']")),
  show("ab".replaceAll("", "<$" + backtick + "." + "$'>")),
);

console.log(
  "empty search",
  show("abc".replace("", "-")),
  show("abc".replaceAll("", "-")),
  show("".replaceAll("", "-")),
  show("".replace("", "-")),
);
console.log(
  "no match",
  "abc".replace("z", "-") === "abc",
  "abc".replaceAll("z", "-") === "abc",
);
console.log(
  "overlapping",
  "aaaa".replaceAll("aa", "X"),
  "aaaa".replace("aa", "X"),
);
console.log(
  "undefined operands",
  show("aundefinedb".replace(undefined, "X")),
  show("abc".replace("b", undefined)),
  show("abc".replaceAll("b", undefined)),
);

const surrogate = String.fromCharCode(0xd83d, 0xde00);
console.log(
  "code units",
  surrogate.replace(String.fromCharCode(0xd83d), "X").length,
  surrogate.replaceAll("", "-").length,
);

const globalLike = {
  [Symbol.match]: true,
  flags: "g",
  toString() { return "b"; },
};
console.log(
  "regexp-like fallback",
  "abc".replaceAll(globalLike, "X"),
  "abc".replace(globalLike, "X"),
);
try {
  "abc".replaceAll({ [Symbol.match]: true, flags: "i", toString() {
    return "b";
  } }, "X");
} catch (error) {
  console.log("nonglobal", error instanceof TypeError);
}
for (const flags of [null, undefined]) {
  try {
    "abc".replaceAll({ [Symbol.match]: true, flags: flags }, "X");
  } catch (error) {
    console.log("nullish flags", error instanceof TypeError);
  }
}
try {
  "abc".replaceAll({
    [Symbol.match]: true,
    get flags() { throw new RangeError("flags"); },
  }, "X");
} catch (error) {
  console.log("abrupt flags", error instanceof RangeError);
}
try {
  "abc".replaceAll({
    [Symbol.match]: true,
    flags: { toString() { throw new RangeError("flags string"); } },
  }, "X");
} catch (error) {
  console.log("abrupt flags string", error instanceof RangeError);
}
try {
  "abc".replaceAll({
    get [Symbol.match]() { throw new RangeError("m"); },
  }, "X");
} catch (error) {
  console.log("abrupt isRegExp", error instanceof RangeError);
}
// replace performs no IsRegExp observation at all.
let matchReads = 0;
"abc".replace({
  get [Symbol.match]() { matchReads = matchReads + 1; return true; },
  get flags() { matchReads = matchReads + 10; return ""; },
  toString() { return "b"; },
}, "X");
console.log("replace skips isRegExp", matchReads);

for (const value of [null, undefined]) {
  for (const name of ["replace", "replaceAll"]) {
    try { String.prototype[name].call(value, "a", "b"); } catch (error) {
      console.log("nullish receiver", name, error instanceof TypeError);
    }
  }
}
try {
  String.prototype.replace.call(Symbol("s"), "a", "b");
} catch (error) {
  console.log("symbol receiver", error instanceof TypeError);
}
try {
  String.prototype.replaceAll.call(
    { toString() { throw new RangeError("receiver"); } },
    "a",
    "b",
  );
} catch (error) {
  console.log("abrupt receiver", error instanceof RangeError);
}
try {
  "abc".replace({ toString() { throw new RangeError("search"); } }, "b");
} catch (error) {
  console.log("abrupt search", error instanceof RangeError);
}
try {
  "abc".replace("b", { toString() { throw new RangeError("value"); } });
} catch (error) {
  console.log("abrupt value", error instanceof RangeError);
}

console.log(
  "generic receivers",
  String.prototype.replace.call(new String("abc"), "b", "X"),
  String.prototype.replaceAll.call(
    { toString() { return "aba"; } },
    "a",
    "X",
  ),
  String.prototype.replace.call(42, "2", "X"),
);

/** @param {string} value */
function hinted(value) { return value.replaceAll("-", "+"); }
console.log("hint hit", hinted("a-b-c"));
console.log("false hint", hinted(new String("a-b-c")));
let turn = 0;
while (turn < 2) {
  console.log("guard", hinted("a-b-c"));
  if (turn === 0) String.prototype.replaceGuardMarker = 1;
  turn = turn + 1;
}
`,
  },
];
