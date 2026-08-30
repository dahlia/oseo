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
