import type { Fixture } from "../fixture.ts";

export const jsonStringifyFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "json-stringify",
    source: String.raw`
const stringifyDescriptor = Object.getOwnPropertyDescriptor(JSON, "stringify");
console.log(
  "descriptor",
  stringifyDescriptor.writable,
  stringifyDescriptor.enumerable,
  stringifyDescriptor.configurable,
  JSON.stringify.name,
  JSON.stringify.length,
);
try { new JSON.stringify(0); } catch (error) {
  console.log("construct", error instanceof TypeError);
}
console.log(
  "primitives",
  JSON.stringify(null),
  JSON.stringify(true),
  JSON.stringify(false),
  JSON.stringify(-0),
  JSON.stringify(Infinity),
  JSON.stringify(NaN),
  JSON.stringify("\b\f\n\r\t\"\\"),
);
console.log(
  "omitted",
  JSON.stringify(undefined) === undefined,
  JSON.stringify(function () {}) === undefined,
  JSON.stringify(Symbol("value")) === undefined,
);
console.log(
  "unicode",
  JSON.stringify("\ud800"),
  JSON.stringify("\udc00"),
  JSON.stringify("\ud83d\ude00"),
);
const array = [1, undefined, function () {}, Symbol("value")];
array.length = 5;
console.log("array", JSON.stringify(array));
const ordered = { b: 2, 1: 1, a: 3 };
Object.defineProperty(ordered, "hidden", { enumerable: false, value: 4 });
ordered[Symbol("ignored")] = 5;
console.log("object", JSON.stringify(ordered));
const snapshot = { first: 1 };
Object.defineProperty(snapshot, "second", {
  enumerable: true,
  get() { snapshot.third = 3; return 2; },
});
console.log("snapshot", JSON.stringify(snapshot), "third" in snapshot);
const calls = [];
const transformed = {
  item: {
    toJSON(key) {
      calls.push("toJSON:" + key + ":" + (this === transformed.item));
      return { value: 2 };
    },
  },
};
const replaced = JSON.stringify(transformed, function (key, value) {
  calls.push("replacer:" + key + ":" + (this === transformed));
  if (key === "value") return value + 1;
  return value;
});
console.log("hooks", replaced, calls.join("|"));
const selected = {
  1: "one",
  a: 1,
  b: 2,
  inherited: 3,
};
Object.setPrototypeOf(selected, { proto: 4 });
console.log(
  "property list",
  JSON.stringify(
    selected,
    ["b", new String("a"), 1, new Number(1), "b", "proto"],
  ),
);
const replacerProxyLog = [];
const replacerProxy = new Proxy(["b"], {
  get(target, key) {
    replacerProxyLog.push(key);
    return target[key];
  },
});
console.log(
  "proxy property list",
  JSON.stringify({ a: 1, b: 2 }, replacerProxy),
  replacerProxyLog.join(","),
);
console.log("gap number", JSON.stringify({ a: [1] }, null, 2));
console.log("gap string", JSON.stringify({ a: 1 }, null, "abcdefghijk"));
console.log(
  "gap wrappers",
  JSON.stringify([1], null, new Number(1)),
  JSON.stringify([1], null, new String("--")),
);
const numberWrapper = new Number(8);
numberWrapper.toString = function () { throw new Error("number toString"); };
numberWrapper.valueOf = function () { return 9; };
const stringWrapper = new String("old");
stringWrapper.toString = function () { return "new"; };
stringWrapper.valueOf = function () { throw new Error("string valueOf"); };
console.log(
  "value wrappers",
  JSON.stringify(numberWrapper),
  JSON.stringify(stringWrapper),
);
const proxyLog = [];
const proxy = new Proxy({ a: 1 }, {
  ownKeys(target) { proxyLog.push("keys"); return Reflect.ownKeys(target); },
  getOwnPropertyDescriptor(target, key) {
    proxyLog.push("descriptor:" + key);
    return Object.getOwnPropertyDescriptor(target, key);
  },
  get(target, key) {
    proxyLog.push("get:" + key);
    return target[key];
  },
});
console.log("proxy", JSON.stringify(proxy), proxyLog.join("|"));
const repeated = {};
console.log("repeated", JSON.stringify([repeated, repeated]));
for (const value of [[], {}]) {
  value.self = value;
  try { JSON.stringify(value); } catch (error) {
    console.log("cycle", error instanceof TypeError);
  }
}
try { JSON.stringify(1n); } catch (error) {
  console.log("bigint", error instanceof TypeError);
}
BigInt.prototype.toJSON = function (key) {
  "use strict";
  return key + ":" + (typeof this === "bigint");
};
console.log("bigint hook", JSON.stringify({ n: 2n }));
delete BigInt.prototype.toJSON;
const revoked = Proxy.revocable({}, {});
revoked.revoke();
try { JSON.stringify(revoked.proxy); } catch (error) {
  console.log("revoked", error instanceof TypeError);
}
for (const attempt of [
  function () {
    JSON.stringify({ toJSON() { throw new Error("toJSON"); } });
  },
  function () {
    JSON.stringify({}, function () { throw new Error("replacer"); });
  },
  function () {
    const replacer = [];
    Object.defineProperty(replacer, "0", {
      get() { throw new Error("replacer index"); },
    });
    replacer.length = 1;
    JSON.stringify({}, replacer);
  },
  function () {
    const value = [];
    Object.defineProperty(value, "0", {
      get() { throw new Error("array index"); },
    });
    value.length = 1;
    JSON.stringify(value);
  },
  function () {
    JSON.stringify(new Proxy({}, {
      ownKeys() { throw new Error("own keys"); },
    }));
  },
]) {
  try { attempt(); } catch (error) { console.log("abrupt", error.message); }
}
let turn = 0;
while (turn < 2) {
  console.log("guard", JSON.stringify({ value: turn }));
  if (turn === 0) JSON.marker = 1;
  turn = turn + 1;
}
console.log("marker", JSON.marker, delete JSON.marker, "marker" in JSON);
`,
  },
];
