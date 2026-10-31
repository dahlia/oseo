import type { Fixture } from "../fixture.ts";

/** Whole-pattern scans and the ordered fallback share object semantics. */
export const regexpAnchoredRepeatFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "regexp-anchored-repeat",
    source: `
function show(expression, text) {
  expression.lastIndex = 1;
  const match = expression.exec(text);
  console.log(expression.source, expression.flags, text.length,
    match === null ? -1 : match.index,
    match === null ? -1 : match[0].length, expression.lastIndex);
}
for (const text of ["", "a", "aa", "a\\n", "a\\r\\n", "0",
  "\\u{1f600}", "\\ud800", "\\udc00", "\\ud800\\udc00"]) {
  for (const literal of [/^\\D+$/, /^\\S+$/, /^\\W+$/,
    /^\\D+$/u, /^\\S+$/u, /^\\W+$/u,
    /^\\D+$/v, /^\\S+$/v, /^\\W+$/v]) {
    show(literal, text);
    show(new RegExp(literal.source, literal.flags), text);
  }
}
show(/[a]+/, "zaaa!");
show(/^[a]+b$/, "aaab");
for (const text of ["\\ud800", "\\udc00", "\\ud800\\udc00"]) {
  show(/^[\\uD800-\\uDFFF]+$/, text);
  show(/^[\\uD800-\\uDFFF]+$/u, text);
  show(/^[\\uD800-\\uDFFF]+$/v, text);
}
for (const source of ["^([a]+)$", "^[a]+b$", "^[a]+?$", "^(?:a+)+$",
  "^(?=a)[a]+$", "^(a)\\\\1+$", "[a]+$", "^[a]*$", "^[a]{1,3}$"]) {
  show(new RegExp(source), "aaa");
}
for (const flags of ["g", "y", "d", "s", "i", "m", "gu", "yu"]) {
  show(new RegExp("^[a]+$", flags), "aaa");
  show(new RegExp("^[a]+$", flags), "a\\n");
}
for (const length of [2097151, 2097152, 2097153]) {
  const text = "a".repeat(length);
  for (const expression of [/^a+$/, /^a+$/u, /^a+$/v]) {
    show(expression, text);
    show(new RegExp(expression.source, expression.flags), text);
  }
}
/** @param {number} value */
function hinted(value) { return value + 1; }
console.log("hint", hinted(2), hinted("miss"));
`,
  },
];
