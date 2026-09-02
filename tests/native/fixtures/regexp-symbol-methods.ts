import type { Fixture } from "../fixture.ts";

/**
 * The `RegExp.prototype` well-known symbol methods, `RegExp.escape`,
 * `%RegExpStringIteratorPrototype%`, and the `String.prototype` methods
 * that now reach them through RegExpCreate and Invoke.
 *
 * Every observation is printed rather than asserted so the reference
 * hosts decide it. Two observations stay out of this fixture because the
 * pinned hosts disagree about them: a `@@replace` receiver whose `exec`
 * is an ordinary function and whose `lastIndex` never advances, where the
 * pinned Node.js host stops after one execution while Deno and the
 * edition continue, and an Annex B pattern reaching the dynamic
 * validator, which both hosts accept and this runtime rejects.
 */
export const regexpSymbolMethodsFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "regexp-symbol-methods",
    source: `
function render(values) {
  if (values === null) return "null";
  let text = "";
  for (let index = 0; index < values.length; index = index + 1) {
    if (index !== 0) text = text + "|";
    const value = values[index];
    text = text + (value === undefined ? "<u>" : value);
  }
  return "[" + text + "]";
}

const symbols = [
  [Symbol.match, "[Symbol.match]", 1],
  [Symbol.matchAll, "[Symbol.matchAll]", 1],
  [Symbol.replace, "[Symbol.replace]", 2],
  [Symbol.search, "[Symbol.search]", 1],
  [Symbol.split, "[Symbol.split]", 2],
];
for (const entry of symbols) {
  const descriptor = Object.getOwnPropertyDescriptor(
    RegExp.prototype,
    entry[0],
  );
  console.log(
    "method",
    entry[1],
    descriptor.value.name === entry[1],
    descriptor.value.length === entry[2],
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
    Object.getOwnPropertyDescriptor(descriptor.value, "prototype"),
  );
  try { new descriptor.value(); } catch (error) {
    console.log("not constructor", entry[1], error instanceof TypeError);
  }
  try { descriptor.value.call(undefined, ""); } catch (error) {
    console.log("primitive receiver", entry[1], error instanceof TypeError);
  }
}

const escapeDescriptor = Object.getOwnPropertyDescriptor(RegExp, "escape");
console.log(
  "escape metadata",
  escapeDescriptor.value.name,
  escapeDescriptor.value.length,
  escapeDescriptor.writable,
  escapeDescriptor.enumerable,
  escapeDescriptor.configurable,
);
for (const value of [1, null, undefined, Symbol("s"), new String("a")]) {
  try {
    RegExp.escape(value);
    console.log("escape accepted", typeof value);
  } catch (error) {
    console.log("escape rejects", typeof value, error instanceof TypeError);
  }
}
console.log("escape empty", "<" + RegExp.escape("") + ">");
console.log("escape syntax", RegExp.escape("^$\\\\.*+?()[]{}|/"));
console.log("escape control", RegExp.escape("\\t\\n\\u000b\\f\\r"));
console.log("escape punctuators", RegExp.escape(",-=<>#&!%:;@~'\\\`\\""));
console.log("escape spaces", RegExp.escape("a b\\u00a0c\\u1680d\\u3000e"));
console.log("escape terminators", RegExp.escape("a\\u2028b\\u2029c\\ufeff"));
console.log("escape leading digit", RegExp.escape("1a"));
console.log("escape leading letter", RegExp.escape("za"));
console.log("escape leading underscore", RegExp.escape("_a"));
console.log("escape astral", RegExp.escape("x\\u{10428}"));
console.log("escape lone surrogate", RegExp.escape("x\\ud800y\\udfffz"));
console.log("escape round trip", new RegExp(RegExp.escape("a.c")).test("abc"));
console.log("escape round trip literal", new RegExp(
  RegExp.escape("a.c"),
).test("a.c"));

console.log("match non-global", render(/(\\d)(\\w)/[Symbol.match]("a1b2")));
console.log("match global", render("a1b2c3".match(/\\d/g)));
console.log("match no result", render("abc".match(/\\d/g)));
console.log("match empty global", render("abc".match(/(?:)/g)));
console.log("match unicode empty", render("\\u{10428}b".match(/(?:)/gu)));
console.log("match resets last index", (() => {
  const pattern = /a/g;
  pattern.lastIndex = 5;
  const result = render(pattern[Symbol.match]("aa"));
  return result + " " + pattern.lastIndex;
})());

console.log("search found", "abc".search(/b/));
console.log("search missing", "abc".search(/z/));
console.log("search preserves last index", (() => {
  const pattern = /b/g;
  pattern.lastIndex = 2;
  return pattern[Symbol.search]("abc") + " " + pattern.lastIndex;
})());
console.log("search sticky", (() => {
  const pattern = /a/y;
  pattern.lastIndex = 1;
  return pattern[Symbol.search]("baa") + " " + pattern.lastIndex;
})());

console.log("split simple", render("a1b2c".split(/\\d/)));
console.log("split captures", render("a1b2c".split(/(\\d)/)));
console.log("split undefined capture", render("ab".split(/(x)|b/)));
console.log("split limit", render("a1b2c".split(/\\d/, 2)));
console.log("split capture limit", render("a1b2c".split(/(\\d)/, 2)));
console.log("split zero limit", render("abc".split(/b/, 0)));
console.log("split empty subject", render("".split(/a/)));
console.log("split empty subject match", render("".split(/(?:)/)));
console.log("split empty pattern", render("abc".split(/(?:)/)));
console.log("split unicode", render("\\u{10428}a".split(/(?:)/u)));
console.log("split sticky flag kept", render("a1b".split(/\\d/y)));
console.log("split global flag kept", render("a1b".split(/\\d/g)));

console.log("replace first", "a1b2".replace(/\\d/, "#"));
console.log("replace global", "a1b2".replace(/\\d/g, "#"));
console.log("replace capture", "a1b2".replace(/(\\d)/g, "[$1]"));
console.log("replace missing capture", "ab".replace(/a/, "[$1][$01][$99]"));
console.log("replace two digit", "ab".replace(/(a)/, "[$01][$10][$11]"));
console.log("replace named", "2026-08".replace(/(?<y>\\d+)-(?<m>\\d+)/,
  "$<m>/$<y>"));
console.log("replace named missing", "ab".replace(/(?<g>a)/, "[$<g>][$<z>]"));
console.log("replace unterminated named", "ab".replace(/(?<g>a)/, "[$<g]"));
console.log("replace no groups named", "ab".replace(/a/, "[$<g>]"));
console.log("replace tokens", "abc".replace(/b/, "$$ $\\\` $' $& $"));
console.log("replace empty global", "abc".replace(/(?:)/g, "-"));
console.log("replace unicode empty", "\\u{10428}".replace(/(?:)/gu, "-"));
console.log("replace functional", "a1b2".replace(/(\\d)/g,
  function (matched, capture, position, subject) {
    return "<" + matched + capture + position + subject.length + ">";
  }));
console.log("replace functional named", "2026-08".replace(
  /(?<y>\\d+)-(?<m>\\d+)/,
  function () {
    const groups = arguments[arguments.length - 1];
    return arguments.length + ":" + groups.y + ":" + groups.m;
  },
));
console.log("replace functional undefined capture", "ab".replace(/(x)|(a)/,
  function (matched, first, second) {
    return "<" + matched + "," + first + "," + second + ">";
  }));

const iterator = "a1b2".matchAll(/\\d/g);
const iteratorPrototype = Object.getPrototypeOf(iterator);
console.log(
  "iterator prototype",
  Object.getPrototypeOf(iteratorPrototype) ===
    Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())),
  iteratorPrototype[Symbol.toStringTag],
  Object.prototype.toString.call(iterator),
);
const nextDescriptor = Object.getOwnPropertyDescriptor(
  iteratorPrototype,
  "next",
);
console.log(
  "iterator next",
  nextDescriptor.value.name,
  nextDescriptor.value.length,
  nextDescriptor.writable,
  nextDescriptor.enumerable,
  nextDescriptor.configurable,
);
const tagDescriptor = Object.getOwnPropertyDescriptor(
  iteratorPrototype,
  Symbol.toStringTag,
);
console.log(
  "iterator tag",
  tagDescriptor.writable,
  tagDescriptor.enumerable,
  tagDescriptor.configurable,
);
try { iteratorPrototype.next.call({}); } catch (error) {
  console.log("iterator brand", error instanceof TypeError);
}
console.log("iterator steps", render([
  iterator.next().value[0],
  iterator.next().value[0],
  iterator.next().done,
  iterator.next().done,
]));
console.log("matchAll non-global", (() => {
  const steps = /a/[Symbol.matchAll]("aa");
  const first = steps.next();
  return first.value[0] + " " + steps.next().done;
})());
console.log("matchAll copies last index", (() => {
  const pattern = /a/g;
  pattern.lastIndex = 1;
  const steps = pattern[Symbol.matchAll]("aaa");
  return steps.next().value.index + " " + pattern.lastIndex;
})());
try { "a".matchAll(/a/); } catch (error) {
  console.log("matchAll requires global", error instanceof TypeError);
}
console.log("matchAll empty", render([..."ab".matchAll(/(?:)/g)].map(
  (step) => step.index,
)));

class Subclassed extends RegExp {}
console.log("split species", render("a1b".split(new Subclassed("\\\\d"))));
console.log("matchAll species", (() => {
  const steps = new Subclassed("a", "g")[Symbol.matchAll]("aa");
  return steps.next().value[0] + steps.next().value[0];
})());

const generic = {
  exec() { return null; },
  flags: "",
  lastIndex: 0,
};
console.log("generic search", RegExp.prototype[Symbol.search].call(
  generic,
  "abc",
));
try {
  RegExp.prototype[Symbol.search].call({ exec() { return 5; } }, "a");
} catch (error) {
  console.log("generic exec result", error instanceof TypeError);
}
console.log("generic replace clamps", RegExp.prototype[Symbol.replace].call(
  { exec() { const result = ["b"]; result.index = 100; return result; },
    flags: "" },
  "abc",
  "Z",
));
console.log("generic replace negative", RegExp.prototype[Symbol.replace].call(
  { exec() { const result = ["a"]; result.index = -5; return result; },
    flags: "" },
  "abc",
  "Z",
));

console.log("string match string operand", render("a.c".match(".")));
console.log("string match undefined", render("abc".match()));
console.log("string search undefined", "abc".search());
console.log("string split undefined", render("abc".split()));
console.log("string matchAll undefined", render(
  [..."ab".matchAll()].map((step) => step.index),
));
console.log("string protocol wins", (() => {
  let seen = 0;
  const operand = {
    [Symbol.match](value) { seen = seen + 1; return value + "!"; },
  };
  return "abc".match(operand) + " " + seen;
})());
for (const name of ["match", "matchAll", "search"]) {
  const symbol = name === "match"
    ? Symbol.match
    : name === "matchAll" ? Symbol.matchAll : Symbol.search;
  const saved = RegExp.prototype[symbol];
  delete RegExp.prototype[symbol];
  try {
    String.prototype[name].call("a", "a");
    console.log("missing symbol", name, "no throw");
  } catch (error) {
    console.log("missing symbol", name, error instanceof TypeError);
  }
  Object.defineProperty(RegExp.prototype, symbol, {
    configurable: true,
    value: saved,
    writable: true,
  });
}

/** @param {string} value */
function hinted(value) { return value.replace(/-/g, "+"); }
console.log("hint hit", hinted("a-b-c"));
console.log("false hint", hinted(new String("a-b-c")));
let turn = 0;
while (turn < 2) {
  console.log("guard", hinted("a-b-c"));
  if (turn === 0) String.prototype.regexpSymbolGuardMarker = 1;
  turn = turn + 1;
}
`,
  },
];
