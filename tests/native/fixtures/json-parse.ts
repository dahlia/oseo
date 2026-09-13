import type { Fixture } from "../fixture.ts";

export const jsonParseFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "json-parse",
    source: String.raw`
const originalJSON = JSON;
console.log(
  "identity",
  typeof JSON,
  ({}).toString.call(JSON),
  Object.getPrototypeOf(JSON) === Object.prototype,
  Object.keys(JSON).length,
);
const globalDescriptor = Object.getOwnPropertyDescriptor(this, "JSON");
const parseDescriptor = Object.getOwnPropertyDescriptor(JSON, "parse");
const stringifyDescriptor = Object.getOwnPropertyDescriptor(JSON, "stringify");
console.log(
  "descriptors",
  globalDescriptor.writable,
  globalDescriptor.enumerable,
  globalDescriptor.configurable,
  parseDescriptor.writable,
  parseDescriptor.enumerable,
  parseDescriptor.configurable,
  JSON.parse.name,
  JSON.parse.length,
  stringifyDescriptor.writable,
  stringifyDescriptor.enumerable,
  stringifyDescriptor.configurable,
  JSON.stringify.name,
  JSON.stringify.length,
);
const symbolTagDescriptor = Object.getOwnPropertyDescriptor(
  Symbol.prototype,
  Symbol.toStringTag,
);
console.log("symbol tag", Object.prototype.toString.call(Symbol("tag")));
delete Symbol.prototype[Symbol.toStringTag];
console.log("symbol fallback", Object.prototype.toString.call(Symbol("tag")));
Object.defineProperty(
  Symbol.prototype,
  Symbol.toStringTag,
  symbolTagDescriptor,
);
console.log("symbol restored", Object.prototype.toString.call(Symbol("tag")));
try { new JSON.parse("0"); } catch (error) {
  console.log("construct", error instanceof TypeError);
}
const parsed = JSON.parse(
  ' {"text":"line\\n\\t\\u0041\\ud800","n":-0,"exp":1.25e2,' +
    '"values":[true,false,null],"__proto__":1,"__proto__":2} ',
);
console.log(
  "values",
  parsed.text === "line\n\tA\ud800",
  1 / parsed.n,
  parsed.exp,
  parsed.values[0],
  parsed.values[1],
  parsed.values[2],
  parsed.__proto__,
  Object.getPrototypeOf(parsed) === Object.prototype,
);
for (const text of [
  "", "undefined", "01", ".1", "1.", "1e", "[1,]", "{\"a\":1,}",
  "'x'", "\u16801", "true false", "\"\\x20\"",
]) {
  try {
    JSON.parse(text);
    console.log("invalid missed", text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) console.log("invalid type", text);
  }
}
console.log("invalid", "done");
let deepText = "0";
for (let depth = 0; depth < 255; depth = depth + 1) {
  deepText = "[" + deepText + "]";
}
let deepValue = JSON.parse(deepText);
let deepDepth = 0;
while (deepDepth < 255) {
  deepValue = deepValue[0];
  deepDepth = deepDepth + 1;
}
console.log("deep", deepDepth, deepValue);
const calls = [];
const revived = JSON.parse(
  '{"p1":0,"p2":0,"p1":1,"2":2,"1":1,"nested":[3,4],"drop":5}',
  function (key, value) {
    calls.push(key);
    if (key === "drop" || key === "0") return undefined;
    if (typeof value === "number") return value + 10;
    return value;
  },
);
console.log(
  "reviver",
  calls.join(","),
  revived[1],
  revived[2],
  revived.p1,
  revived.p2,
  0 in revived.nested,
  revived.nested[1],
  "drop" in revived,
);
let wrapper;
const replaced = JSON.parse("2", function (key, value) {
  wrapper = this;
  return key === "" ? value + 1 : value;
});
const wrapperDescriptor = Object.getOwnPropertyDescriptor(wrapper, "");
console.log(
  "wrapper",
  replaced,
  Object.getPrototypeOf(wrapper) === Object.prototype,
  Object.getOwnPropertyNames(wrapper).length,
  wrapperDescriptor.writable,
  wrapperDescriptor.enumerable,
  wrapperDescriptor.configurable,
);
const sourceOrder = [];
const sourceObject = {
  toString() { sourceOrder.push("text"); return "1"; },
};
JSON.parse(sourceObject, function (key, value) {
  sourceOrder.push("reviver:" + key);
  return value;
});
console.log("source order", sourceOrder.join(","));
let proxyReviverCalls = 0;
const proxyReviver = new Proxy(function (key, value) {
  proxyReviverCalls = proxyReviverCalls + 1;
  return key === "" ? value + 1 : value;
}, {});
console.log("proxy reviver", JSON.parse("1", proxyReviver), proxyReviverCalls);
let proxyArrayLengthReads = 0;
let proxyOtherVisits = 0;
const proxyArray = new Proxy([], {
  get(target, key) {
    if (key === "length") proxyArrayLengthReads = proxyArrayLengthReads + 1;
    return target[key];
  },
});
const proxyObject = new Proxy({ other: 0 }, {});
JSON.parse("[null,null]", function (key, value) {
  if (key === "other") proxyOtherVisits = proxyOtherVisits + 1;
  if (key === "0") this[1] = proxyArray;
  return value;
});
JSON.parse("[null,null]", function (key, value) {
  if (key === "other") proxyOtherVisits = proxyOtherVisits + 1;
  if (key === "0") this[1] = proxyObject;
  return value;
});
console.log(
  "proxy values",
  proxyArrayLengthReads,
  proxyOtherVisits,
);
let proxyDescriptorError = false;
try {
  JSON.parse("[null,null]", function (key, value) {
    if (key === "0") {
      this[1] = new Proxy({ other: 0 }, {
        getOwnPropertyDescriptor() { throw new Error("descriptor"); },
      });
    }
    return value;
  });
} catch (error) {
  proxyDescriptorError = error.message === "descriptor";
}
console.log("proxy descriptor", proxyDescriptorError);
const revokedArray = Proxy.revocable([], {});
revokedArray.revoke();
let directRevokedMessage = "";
try {
  Array.isArray(revokedArray.proxy);
} catch (error) {
  directRevokedMessage = error.message;
}
let reviverRevokedError;
try {
  JSON.parse("[null,null]", function (key, value) {
    if (key === "0") this[1] = revokedArray.proxy;
    return value;
  });
} catch (error) {
  reviverRevokedError = error;
}
console.log(
  "revoked proxy value",
  reviverRevokedError instanceof TypeError,
  reviverRevokedError.message === directRevokedMessage,
);
/** @param {number} value @param {number} addend */
function hinted(value, addend) { return value + addend; }
console.log("hint", hinted(JSON.parse("2"), 1), hinted("2", 1));
let turn = 0;
while (turn < 2) {
  console.log("guard", JSON.parse === JSON.parse);
  if (turn === 0) JSON.marker = 1;
  turn = turn + 1;
}
console.log("marker", JSON.marker, delete JSON.marker, "marker" in JSON);
JSON = 40;
console.log("global write", JSON, this.JSON === JSON);
JSON = originalJSON;
console.log("global restore", JSON === originalJSON);
`,
  },
];
