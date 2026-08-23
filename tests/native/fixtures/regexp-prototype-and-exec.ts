import type { Fixture } from "../fixture.ts";

/**
 * Built-in regular expression execution, the match result object, and the
 * prototype methods and accessors.
 *
 * Every observation is printed rather than asserted so the reference
 * hosts decide it. The one place this unit deliberately leaves V8 is how
 * a failed attempt advances under `u`: the edition resumes after the
 * whole surrogate pair and V8 resumes between its two code units, which
 * only a zero-width term can observe. The compiler-side matcher already
 * resolves that in favor of the edition, so no case here places an
 * assertion after a pair that fails.
 */
export const regexpPrototypeAndExecFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "regexp-prototype-and-exec",
    source: `
function show(match) {
  if (match === null) return "null";
  let text = "[" + match.index + "|";
  for (let index = 0; index < match.length; index = index + 1) {
    text = text + (match[index] === undefined ? "<u>" : match[index]) + "/";
  }
  text = text + "]";
  if (match.groups !== undefined) {
    text = text + "{";
    for (const key of Object.keys(match.groups)) {
      const value = match.groups[key];
      text = text + key + "=" + (value === undefined ? "<u>" : value) + ",";
    }
    text = text + "}";
  }
  if (match.indices !== undefined) {
    text = text + "#";
    for (let index = 0; index < match.indices.length; index = index + 1) {
      const pair = match.indices[index];
      text = text + (pair === undefined
        ? "<u>"
        : "(" + pair[0] + "," + pair[1] + ")");
    }
  }
  return text;
}

const prototype = RegExp.prototype;
for (const name of ["exec", "test", "toString"]) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
  console.log(
    "method",
    name,
    descriptor.value.name,
    descriptor.value.length,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
    Object.getOwnPropertyDescriptor(descriptor.value, "prototype"),
  );
}
for (const name of [
  "flags",
  "source",
  "hasIndices",
  "global",
  "ignoreCase",
  "multiline",
  "dotAll",
  "unicode",
  "unicodeSets",
  "sticky",
]) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
  console.log(
    "accessor",
    name,
    descriptor.get.name,
    descriptor.get.length,
    descriptor.set,
    descriptor.enumerable,
    descriptor.configurable,
  );
}
console.log(
  "prototype values",
  prototype.source,
  prototype.flags,
  prototype.toString(),
  prototype.global,
  prototype.hasIndices,
  prototype.unicodeSets,
);

const every = new RegExp("a", "dgimsy");
console.log(
  "flags",
  every.flags,
  every.hasIndices,
  every.global,
  every.ignoreCase,
  every.multiline,
  every.dotAll,
  every.unicode,
  every.unicodeSets,
  every.sticky,
);
const sets = new RegExp("a", "v");
console.log("v flags", sets.flags, sets.unicode, sets.unicodeSets);
console.log(
  "source escaping",
  new RegExp("").source,
  new RegExp("/").source,
  new RegExp("[/]").source,
  new RegExp("\\\\/").source,
  new RegExp("a/b").source,
  new RegExp("\\n").source,
  new RegExp("\\r").source,
  new RegExp("\\\\\\n").source,
  new RegExp("a\\\\\\\\/b").source,
  new RegExp("a").toString(),
  new RegExp("a", "gi").toString(),
);
console.log(
  "generic toString",
  prototype.toString.call({ source: "x", flags: "gi" }),
);
console.log(
  "generic flags",
  Object.getOwnPropertyDescriptor(prototype, "flags").get.call({
    dotAll: {},
    global: 0,
    hasIndices: 1,
    ignoreCase: "yes",
    multiline: null,
    sticky: "y",
    unicode: undefined,
    unicodeSets: 2,
  }),
);

const cases = [
  ["a(b)c", "", "xxabcyy"],
  ["(\\\\d+)-(\\\\d+)", "", "ab 12-34 cd"],
  ["a|ab", "", "ab"],
  ["(a|ab)(c|bcd)", "", "abcd"],
  ["(a*)*b", "", "aaab"],
  ["(a+)+b", "", "aaab"],
  ["a{2,3}?", "", "aaaa"],
  ["(z)?(a)", "", "a"],
  ["(?:(a)|(b))*", "", "ab"],
  ["((a+)?(b+)?(c))*", "", "aacbbbc"],
  ["(?=a)a", "", "a"],
  ["(?!a)b", "", "b"],
  ["(?<=(a)(b))c", "", "abc"],
  ["(?<!x)y", "", "zy"],
  ["(?<=a|bc)d", "", "abcbcd"],
  ["(a)\\\\1", "", "aa"],
  ["(?<n>a)\\\\k<n>", "", "aa"],
  ["(a*)b\\\\1+", "", "aabaa"],
  ["\\\\bfoo\\\\b", "", "a foo b"],
  ["\\\\Bo\\\\B", "", "foo"],
  ["^b", "m", "a\\nb"],
  ["c$", "m", "c\\nd"],
  [".", "", "\\n"],
  [".", "s", "\\n"],
  ["[a-c]+", "", "xxbcaXX"],
  ["[^a-c]+", "", "abcxy"],
  ["\\\\d\\\\D\\\\s\\\\S\\\\w\\\\W", "", "1a b_!"],
  ["A", "i", "a"],
  ["[^a]", "i", "A"],
  ["[a-z]+", "i", "AbC"],
  ["\\\\w+", "i", "aZ9_"],
  [".", "u", "\\u{1D306}"],
  ["\\\\udf06", "u", "\\u{1D306}"],
  ["[\\\\u{1D300}-\\\\u{1D310}]", "u", "x\\u{1D306}"],
  ["k", "iu", "\\u212A"],
  ["K", "iu", "\\u212A"],
  ["\\u212A", "iu", "k"],
  ["[jkl]", "iu", "\\u212A"],
  ["[^k]", "iu", "\\u212A"],
  ["\\\\w", "iu", "\\u212A"],
  ["\\\\W", "iu", "\\u212A"],
  ["k", "i", "\\u212A"],
  ["[^k]", "i", "\\u212A"],
  ["s", "iu", "\\u017F"],
  ["S", "iu", "\\u017F"],
  ["\\u017F", "iu", "s"],
  ["[r-t]", "iu", "\\u017F"],
  ["[^s]", "iu", "\\u017F"],
  ["\\\\w", "iu", "\\u017F"],
  ["\\\\W", "iu", "\\u017F"],
  ["\\\\S", "iu", "\\u017F"],
  ["s", "i", "\\u017F"],
  ["[^s]", "i", "\\u017F"],
  ["(k)\\\\1", "iu", "K\\u212A"],
  ["(s)\\\\1", "iu", "\\u017FS"],
  ["(?:)", "", "ab"],
  ["", "", "ab"],
  ["(?<y>\\\\d{4})-(?<m>\\\\d{2})", "d", "on 2026-08 x"],
  ["(?<a>x)|(?<b>y)", "d", "y"],
  ["(a)(b)?", "d", "a"],
];
for (const entry of cases) {
  const expression = new RegExp(entry[0], entry[1]);
  console.log(
    "exec",
    entry[0],
    entry[1],
    show(expression.exec(entry[2])),
    expression.lastIndex,
  );
}

const scanned = new RegExp("a", "g");
let scan = "";
for (let round = 0; round < 4; round = round + 1) {
  scan = scan + show(scanned.exec("aab")) + ":" + scanned.lastIndex + " ";
}
console.log("global scan", scan);
const stuck = new RegExp("(?:)", "g");
let empties = "";
for (let round = 0; round < 3; round = round + 1) {
  empties = empties + show(stuck.exec("ab")) + ":" + stuck.lastIndex + " ";
}
console.log("empty scan", empties);
const anchored = new RegExp("b", "y");
anchored.lastIndex = 1;
console.log("sticky hit", show(anchored.exec("ab")), anchored.lastIndex);
console.log("sticky miss", show(anchored.exec("ab")), anchored.lastIndex);
const surrogate = new RegExp(".", "gu");
console.log(
  "unicode advance",
  show(surrogate.exec("\\u{1D306}")),
  surrogate.lastIndex,
);
const beyond = new RegExp("a", "g");
beyond.lastIndex = 99;
console.log("past end", show(beyond.exec("aaa")), beyond.lastIndex);
const ignored = new RegExp("a");
ignored.lastIndex = 2;
console.log("non-global", show(ignored.exec("aaa")), ignored.lastIndex);

const result = new RegExp("(a)(b)?").exec("a");
console.log(
  "result shape",
  Array.isArray(result),
  result.length,
  Object.keys(result).join(","),
  Object.getPrototypeOf(result) === Array.prototype,
);
console.log("result input", result.input, result.index, result.groups);
const named = new RegExp("(?<only>a)", "d").exec("a");
console.log(
  "groups shape",
  Object.getPrototypeOf(named.groups),
  Object.keys(named.groups).join(","),
  Object.keys(named.indices).join(","),
  Object.getPrototypeOf(named.indices.groups),
  Array.isArray(named.indices),
  Array.isArray(named.indices[0]),
);

class DerivedRegExp extends RegExp {}
const derived = new DerivedRegExp("(b)c", "g");
console.log(
  "derived",
  show(derived.exec("abcabc")),
  derived.lastIndex,
  derived.test("abc"),
  derived.source,
  derived.flags,
  derived.toString(),
);

const overridden = new RegExp("a");
overridden.exec = function replaced(text) {
  return { replaced: text };
};
console.log("test dispatch", overridden.test("zzz"));
overridden.exec = function bad() {
  return 5;
};
try {
  overridden.test("z");
} catch (error) {
  console.log("bad exec", error instanceof TypeError);
}
const inherited = { __proto__: RegExp.prototype };
try {
  inherited.exec("a");
} catch (error) {
  console.log("plain exec", error instanceof TypeError);
}
try {
  inherited.test("a");
} catch (error) {
  console.log("plain test", error instanceof TypeError);
}
try {
  Object.getOwnPropertyDescriptor(prototype, "source").get.call({});
} catch (error) {
  console.log("plain source", error instanceof TypeError);
}
try {
  Object.getOwnPropertyDescriptor(prototype, "global").get.call({});
} catch (error) {
  console.log("plain global", error instanceof TypeError);
}
for (const receiver of [null, undefined, 1, "s", true]) {
  try {
    prototype.exec.call(receiver, "x");
  } catch (error) {
    console.log("exec receiver", error instanceof TypeError);
  }
  try {
    prototype.toString.call(receiver);
  } catch (error) {
    console.log("toString receiver", error instanceof TypeError);
  }
}
const frozen = new RegExp("a", "g");
Object.defineProperty(frozen, "lastIndex", { value: 0, writable: false });
try {
  frozen.exec("b");
} catch (error) {
  console.log("read-only lastIndex", error instanceof TypeError);
}
const converted = new RegExp("X");
let conversions = 0;
const argument = {
  toString() {
    conversions = conversions + 1;
    return "aXa";
  },
};
console.log(
  "argument conversion",
  show(converted.exec(argument)),
  conversions,
);
console.log("undefined argument", show(new RegExp("undefined").exec()));
const abrupt = new RegExp("a", "g");
abrupt.lastIndex = {
  valueOf() {
    throw new RangeError("lastIndex conversion");
  },
};
try {
  abrupt.exec("a");
} catch (error) {
  console.log("abrupt lastIndex", error instanceof RangeError, error.message);
}
const coerced = new RegExp("a", "g");
coerced.lastIndex = "1";
console.log("string lastIndex", show(coerced.exec("aa")), coerced.lastIndex);
coerced.lastIndex = -3;
console.log("negative lastIndex", show(coerced.exec("aa")), coerced.lastIndex);
coerced.lastIndex = 1.7;
console.log(
  "fractional lastIndex",
  show(coerced.exec("ba")),
  coerced.lastIndex,
);

let retained = [];
for (let round = 0; round < 40; round = round + 1) {
  const scanner = new RegExp("(a+)(b*)", "g");
  const matched = scanner.exec("xaabbxaab");
  retained.push(matched[0] + matched[1] + matched[2] + matched.index);
  retained.push(new RegExp("z" + round).source);
}
console.log("retained", retained.length, retained[0], retained[79]);

/** @param {number} value */
function hinted(value) {
  return value + 1;
}
console.log("hints", hinted(3), hinted("miss"));
`,
    specialization: {
      genericCallsDisabled: 796,
      genericCallsEnabled: 796,
      hits: 190,
      misses: 739,
      overflowMisses: 0,
    },
  },
];
