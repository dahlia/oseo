import type { Es2026Fixture } from "../es2026-fixture.ts";

/*
 * JSON.rawJSON, JSON.isRawJSON, and the context argument JSON.parse gives
 * its reviver. Both reference hosts implement them.
 */
export const jsonParseSourceFixtures: readonly Es2026Fixture[] = [
  /* The two functions, raw text validation, and JSON.stringify output. */
  {
    name: "json-raw-json",
    source: `
for (const name of ["rawJSON", "isRawJSON"]) {
  const descriptor = Object.getOwnPropertyDescriptor(JSON, name);
  console.log(
    name,
    typeof descriptor.value,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
    descriptor.value.name,
    descriptor.value.length,
    Object.hasOwn(descriptor.value, "prototype"),
  );
  try {
    new descriptor.value("1");
  } catch (error) {
    console.log("construct", error.constructor.name);
  }
}
const keys = Reflect.ownKeys(JSON).map(String);
console.log(
  "keys",
  keys.indexOf("rawJSON") > keys.indexOf("stringify"),
  keys.indexOf("isRawJSON") > keys.indexOf("rawJSON"),
);
const big = JSON.rawJSON("123456789012345678901234567890");
const descriptor = Object.getOwnPropertyDescriptor(big, "rawJSON");
console.log(
  "object",
  Object.getPrototypeOf(big),
  Object.isFrozen(big),
  Object.isExtensible(big),
  Reflect.ownKeys(big).join(),
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
  typeof big.rawJSON,
);
const lookalike = Object.freeze({ __proto__: null, rawJSON: "1" });
const proxy = new Proxy(big, {});
console.log(
  "isRawJSON",
  JSON.isRawJSON(big),
  JSON.isRawJSON(),
  JSON.isRawJSON(null),
  JSON.isRawJSON(1),
  JSON.isRawJSON("1"),
  JSON.isRawJSON({}),
  JSON.isRawJSON([]),
  JSON.isRawJSON(lookalike),
  JSON.isRawJSON(proxy),
  JSON.isRawJSON(Object.create(big)),
  JSON.isRawJSON(big, 1),
);
console.log(
  "stringify",
  JSON.stringify(big),
  JSON.stringify({
    a: big,
    b: [
      JSON.rawJSON('"x\\\\u0041"'),
      JSON.rawJSON("null"),
      JSON.rawJSON("true"),
    ],
    c: JSON.rawJSON("-0.5e3"),
  }),
  JSON.stringify([JSON.rawJSON("1"), JSON.rawJSON("2")], null, 2)
    .split("\\n")
    .join("|"),
  JSON.stringify({
    toJSON() {
      return big;
    },
  }),
  JSON.stringify([1], (key, value) =>
    key === "0" ? JSON.rawJSON("7e1") : value,
  ),
  JSON.stringify({ raw: big }, ["raw"]),
  JSON.stringify(lookalike),
  JSON.stringify(proxy),
  JSON.stringify({ [Symbol.toPrimitive]: 1, a: JSON.rawJSON("false") }),
);
const inputs = [
  "",
  " 1",
  "1 ",
  "\\t1",
  "1\\t",
  "\\n1",
  "1\\n",
  "\\r1",
  "1\\r",
  "[]",
  "{}",
  "[1]",
  '{"a":1}',
  "1,2",
  "undefined",
  "'x'",
  "01",
  "1.",
  "-",
  '"\\\\x"',
  "nul",
  "1e",
  "--1",
  " 1",
  "1 ",
  '"\\u0001"',
  "Infinity",
  "NaN",
  "0",
  "-0",
  "1E+2",
  '""',
  '"\\\\ud800"',
  "false",
  "null",
];
for (const input of inputs) {
  try {
    const raw = JSON.rawJSON(input);
    console.log("accept", JSON.stringify(input), JSON.stringify([raw]));
  } catch (error) {
    console.log("reject", JSON.stringify(input), error.constructor.name);
  }
}
const coerced = [
  1e21,
  true,
  null,
  12n,
  {
    toString() {
      return "5";
    },
  },
];
for (const value of coerced) {
  console.log("coerce", JSON.rawJSON(value).rawJSON);
}
for (const value of [Symbol("s"), undefined, {}]) {
  try {
    JSON.rawJSON(value);
  } catch (error) {
    console.log("coerce-error", typeof value, error.constructor.name);
  }
}
try {
  JSON.rawJSON({
    toString() {
      throw new RangeError("to string");
    },
  });
} catch (error) {
  console.log("to-string", error.constructor.name);
}
const sum = { total: JSON.rawJSON("9007199254740993") };
console.log(
  "precise",
  JSON.stringify(sum),
  JSON.parse(JSON.stringify(sum)).total,
);
const original = JSON.rawJSON;
JSON.rawJSON = () => "replaced";
console.log("replaced", JSON.rawJSON("1"), original("2").rawJSON);
delete JSON.isRawJSON;
console.log("deleted", typeof JSON.isRawJSON);
let turn = 0;
while (turn < 2) {
  console.log("guard", typeof JSON.stringify, JSON.stringify.length);
  if (turn === 0) JSON.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) {
  return left + right;
}
console.log("hint", hinted(1, 2), hinted("1", 2));
`,
  },
  /* Reviver contexts for parsed, replaced, and added values. */
  {
    name: "json-reviver-source",
    source: `
function describe(context) {
  const keys = Reflect.ownKeys(context).map(String).join(",");
  return (
    keys +
    ":" +
    JSON.stringify(context.source) +
    ":" +
    (Object.getPrototypeOf(context) === Object.prototype) +
    ":" +
    Object.isExtensible(context)
  );
}
function trace(label, text, reviver) {
  const log = [];
  let result;
  try {
    result = JSON.stringify(
      JSON.parse(text, function (key, value, context) {
        log.push(key + "=" + JSON.stringify(value) + "@" + describe(context));
        return reviver === undefined
          ? value
          : reviver.call(this, key, value, context);
      }),
    );
  } catch (error) {
    result = error.constructor.name;
  }
  console.log(label, result);
  for (const line of log) console.log("  " + line);
}
trace(
  "primitives",
  ' [ 1.0 , -0 , 0.5e-3 , 1E+2 , -12 , "x\\\\u0041\\\\n" , "" , ' +
    'true , false , null ] ',
);
trace("nested", '{"a" : {"b" : [ {"c" : 7 } , [ 8 ] ] } , "d" : "e"}');
trace("duplicate", '{"a" : 1 , "a" : 2.50 , "b" : [1] , "b" : {"c" : 3}}');
trace("proto", '{"__proto__" : 1 , "constructor" : "x"}');
trace("top-number", " 4.20 ");
trace("top-string", ' "\\\\ud83d\\\\ude00" ');
trace("unicode", '["é", "😀", "\\\\u00e9"]');
trace("append", "[1,[]]", function (key, value) {
  if (value === 1) this[1].push("added");
  return this[key];
});
trace("add-property", '{"p":1,"q":{}}', function (key, value) {
  if (value === 1) this.q.added = "barf";
  return this[key];
});
trace("replace-same", '{"p":1,"q":2}', function (key, value) {
  if (key === "p") this.q = 2;
  return value;
});
trace("replace-object", '{"p":1,"q":{"r":3}}', function (key, value) {
  if (key === "p") this.q = { r: 3 };
  return value;
});
trace("replace-array", "[1, 2, [3]]", function (key, value) {
  if (key === "0") {
    this[1] = "two";
    this[2] = [3, 4];
  }
  return value;
});
trace("shrink", "[1, 2, 3]", function (key, value) {
  if (key === "0") this.length = 2;
  return value;
});
trace("grow", "[1]", function (key, value) {
  if (key === "0") this.push(5, 6);
  return value;
});
trace("delete", '{"a":1,"b":2,"c":3}', function (key, value) {
  if (key === "a") delete this.b;
  return key === "c" ? undefined : value;
});
trace("restore", '{"a":1,"b":2}', function (key, value) {
  if (key === "a") {
    this.b = 3;
    this.b = 2;
  }
  return value;
});
trace("context-mutable", "[1, 2]", function (key, value, context) {
  context.extra = key;
  if (key === "0") context.source = "changed";
  return value;
});
trace(
  "context-fresh",
  "[1, 1]",
  (() => {
    let previous;
    return function (key, value, context) {
      const fresh = context !== previous;
      previous = context;
      return key === "" ? value : fresh;
    };
  })(),
);
trace("throws", "[1, 2]", function (key, value) {
  if (key === "1") throw new RangeError("reviver");
  return value;
});
trace("syntax", "[1, 2,]");
const argumentsSeen = [];
JSON.parse('{"a":[1]}', function () {
  argumentsSeen.push(arguments.length);
  return arguments[1];
});
console.log("arguments", argumentsSeen.join(","));
console.log("non-callable", JSON.stringify(JSON.parse("[1]", { call: 1 })));
const proxyLog = [];
JSON.parse('{"a":1,"b":[2]}', function (key, value, context) {
  if (key === "a") {
    this.b = new Proxy([2], {
      get(target, property) {
        proxyLog.push("get " + String(property));
        return Reflect.get(target, property);
      },
    });
  }
  proxyLog.push(key + ":" + context.source);
  return value;
});
console.log("proxy", proxyLog.join(" "));
let turn = 0;
while (turn < 2) {
  console.log("guard", typeof JSON.parse, JSON.parse.length);
  if (turn === 0) JSON.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) {
  return left + right;
}
console.log("hint", hinted(1, 2), hinted("1", 2));
`,
  },
  /* Many records and raw objects under collection, and deep nesting. */
  {
    name: "json-parse-source-stress",
    source: `
const items = [];
for (let index = 0; index < 60; index = index + 1) {
  items.push({
    id: index,
    name: "n" + index,
    values: [index, index / 4, -index],
    flag: index % 2 === 0,
    none: null,
  });
}
const text = JSON.stringify({ items, total: items.length });
let sources = 0;
let sourceLength = 0;
const pressure = [];
const revived = JSON.parse(text, function (key, value, context) {
  pressure.push({ key });
  if (typeof context.source === "string") {
    sources = sources + 1;
    sourceLength = sourceLength + context.source.length;
  }
  if (key === "flag") return undefined;
  return value;
});
console.log(
  "revived",
  revived.items.length,
  revived.total,
  sources,
  sourceLength,
  "flag" in revived.items[0],
  revived.items[59].values.join(","),
);
const raws = [];
for (let index = 0; index < 200; index = index + 1) {
  raws.push(JSON.rawJSON(String(index * 1e15 + 1)));
  pressure.push([index]);
}
const out = JSON.stringify(raws);
console.log(
  "raws",
  out.length,
  out.slice(0, 40),
  raws.every((raw) => JSON.isRawJSON(raw)),
);
const deep = "[".repeat(100) + "1" + "]".repeat(100);
let depthSeen = 0;
JSON.parse(deep, function (key, value, context) {
  if (context.source === "1") depthSeen = depthSeen + 1;
  return value;
});
console.log("deep", depthSeen);
let turn = 0;
while (turn < 2) {
  console.log("guard", typeof JSON.rawJSON, JSON.rawJSON.length);
  if (turn === 0) JSON.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) {
  return left + right;
}
console.log("hint", hinted(1, 2), hinted("1", 2));
`,
  },
];
