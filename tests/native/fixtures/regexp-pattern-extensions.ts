import type { Fixture } from "../fixture.ts";

/** Pattern extensions lowered through the generic RegExp matcher. */
export const regexpPatternExtensionFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "regexp-pattern-extensions",
    source: `
function show(regexp, input) {
  const match = regexp.exec(input);
  if (match === null) return "null";
  let result = match.index + ":" + match[0];
  if (match.groups !== undefined) {
    for (const key of Object.keys(match.groups)) {
      result = result + ":" + key + "=" + match.groups[key];
    }
  }
  if (match.indices !== undefined) {
    for (let index = 0; index < match.indices.length; index = index + 1) {
      const pair = match.indices[index];
      result = result + ":" + (pair === undefined
        ? "undefined"
        : pair[0] + "-" + pair[1]);
    }
  }
  return result;
}

console.log("intersection", show(/[[a-c]&&[b-d]]/v, "a b c d"));
console.log("subtraction", show(/[[a-c]--[b]]/v, "bca"));
console.log("strings", show(/[\\q{ab|cd}x]/v, "zzcd"));
console.log("folded negation", show(/[^a]/iv, "aB"));
console.log("folded intersection", show(/[a&&A]/iv, "a"));
console.log("folded subtraction", show(/[[a-z]--A]/iv, "ab"));
console.log("folded strings", show(/[\\q{AB}--\\q{ab}]/iv, "AB"));
console.log("empty priority", show(/[\\q{|a}]/v, "a"));
console.log(
  "string property",
  show(/\\p{Emoji_Keycap_Sequence}/v, "x9\\uFE0F\\u20E3y"),
);
console.log("modifiers", show(/(?i:a)(?-i:b)/, "xxAb"));
console.log(
  "dynamic modifiers",
  show(new RegExp("(?i:a)(?-i:b)"), "xxAb"),
);
console.log("named", show(/(?<é>a)\\k<é>/u, "xaa"));
console.log("lookbehind", show(/(?<=a)b/, "zab"));
console.log("indices", show(/(?<left>a)(b)/d, "zab"));
console.log("dotAll", show(/^a.b$/s, "a\\nb"));
function rejection(construct) {
  try {
    construct();
    return "accepted";
  } catch (error) {
    return error.name;
  }
}
console.log("dynamic escaped group", show(new RegExp("(?<\\\\u0041>a)"), "a"));
console.log(
  "dynamic forward reference",
  show(new RegExp("\\\\k<A>(?<\\\\u0041>x)"), "x"),
);
console.log(
  "dynamic unicode reference",
  show(new RegExp("\\\\k<é>(?<é>a)"), "a"),
);
console.log("dynamic escaped name", show(new RegExp("(?<\\\\u0041>.)"), "a"));
console.log(
  "dynamic braced name",
  show(new RegExp("(?<\\\\u{3C0}>.)\\\\k<π>"), "xx"),
);
console.log(
  "dynamic astral name",
  show(new RegExp("(?<a\\u{104A4}>.)", "u"), "z"),
);
console.log(
  "dynamic escaped pair",
  show(new RegExp("(?<a\\\\uD801\\\\uDCA4>.)\\\\k<a\\\\u{104A4}>"), "qq"),
);
console.log(
  "dynamic written pair",
  show(new RegExp("(?<$\\u{104A4}>b)"), "ab"),
);
console.log(
  "dynamic joiners",
  show(new RegExp("(?<_\\\\u200C\\\\u200D>c)"), "c"),
);
console.log(
  "dynamic exclusive",
  show(new RegExp("(?<π>a)|(?<\\\\u03C0>b)\\\\k<π>"), "bb"),
);
console.log("dynamic indices", show(new RegExp("(?<\\\\u0CA0>a)", "d"), "a"));
console.log(
  "dynamic invalid names",
  rejection(() => new RegExp("(?<\\u{1F98A}>x)")),
  rejection(() => new RegExp("(?<\\\\u{1D7DA}x>x)", "u")),
  rejection(() => new RegExp("(?<\\uD83D x>x)")),
  rejection(() => new RegExp("(?<\\\\uD83D>x)", "u")),
  rejection(() => new RegExp("(?<π>a)(?<\\\\u03C0>b)")),
  rejection(() => new RegExp("(?<a>a)\\\\k<\\\\u0062>", "u")),
  rejection(() => new RegExp("(?<\\\\x41>a)")),
  rejection(() => new RegExp("(?<\\\\u{110000}>a)")),
);

const han = /\\p{Script=Han}/gu;
console.log(
  "species matchAll",
  Array.from("𠮷a𠮷".matchAll(han), (match) => match.index).join(","),
);
console.log(
  "species matchAll v",
  Array.from("𠮷a𠮷".matchAll(/\\p{Script=Han}/gv), (match) => match[0]).join(
    ",",
  ),
);
console.log("species split", "a𠮷b𠮷c".split(/\\p{Script=Han}/u).join("|"));
han.lastIndex = 3;
const copy = new RegExp(han, "duy");
console.log(
  "copy",
  copy !== han,
  copy.source,
  copy.flags,
  copy.lastIndex,
  han.lastIndex,
  show(copy, "𠮷x"),
  copy.lastIndex,
  han.lastIndex,
);
console.log("copy flags", new RegExp(han).flags, RegExp(han) === han);
const order = [];
const flagsValue = {
  toString() {
    order.push("flags");
    return "gu";
  },
};
const target = new Proxy(function () {}, {
  get(object, key, receiver) {
    if (key !== "prototype") return Reflect.get(object, key, receiver);
    order.push("prototype");
    return RegExp.prototype;
  },
});
const branded = /\\p{L}/u;
Object.defineProperty(branded, Symbol.match, {
  get() {
    order.push("match");
    return true;
  },
});
const ordered = Reflect.construct(RegExp, [branded, flagsValue], target);
console.log("copy order", order.join(","), ordered.flags, ordered.test("é"));
console.log(
  "copy abrupt",
  rejection(() =>
    new RegExp(han, {
      toString() {
        throw new RangeError("flags");
      },
    }),
  ),
  rejection(() => new RegExp(han, "uu")),
  rejection(() => new RegExp(han, "uv")),
  rejection(() => new RegExp(han, "uz")),
);
function detached() {
  const source = /\\p{Lu}+/u;
  return new RegExp(source, "gu");
}
const survivor = detached();
console.log("copy survives", survivor.exec("abCDe")[0], survivor.lastIndex);

function observedExec(value, input) {
  return value.exec(input);
}
console.log("guard hit", show(/a/, "a"), observedExec(/a/, "a")[0]);
console.log(
  "guard miss",
  observedExec({ exec(value) { return [value + "!"]; } }, "a")[0],
);
`,
  },
];
