import type { Fixture } from "../fixture.ts";

/**
 * Exhaustive BMP source construction, not runtime source evaluation.
 * Each comment has the upstream token position and assignment text.
 * Non-terminating single-line comments share a binding that starts at
 * zero; any escaped assignment poisons it. The four terminators have
 * independent bindings, so each assignment must execute. Multi-line
 * comments likewise cannot hide an escaped write behind a later reset.
 */
function bmpComments(single: boolean): string {
  let source = "var yy = 0; var xx = 0;\n";
  const terminators = [0x0a, 0x0d, 0x2028, 0x2029];
  for (let code = 0; code <= 0xffff; code += 1) {
    const character = String.fromCharCode(code);
    if (single) {
      if (!terminators.includes(code)) {
        source += `//var ${character}yy = -1\n`;
      }
    } else {
      source += `/*var ${character}xx = 1*/\n`;
    }
  }
  source += single ? "console.log(yy);\n" : "console.log(xx);\n";
  if (single) {
    for (const code of terminators) {
      source += "yy = 0;\n";
      source += `//var ${String.fromCharCode(code)}yy = -1\n`;
      source += "console.log(yy);\n";
    }
  }
  return source;
}

/** Every UTF-16 code unit is parsed in its original comment position. */
export const lexicalBmpFixtures: readonly (Fixture & {
  readonly paths: readonly string[];
  readonly expected: string;
})[] = [
  {
    name: "ds16-lexical-bmp-single",
    paths: ["test/language/comments/S7.4_A5.js"],
    source: bmpComments(true),
    expected: "0\n-1\n-1\n-1\n-1\n",
  },
  {
    name: "ds16-lexical-bmp-multi",
    paths: ["test/language/comments/S7.4_A6.js"],
    source: bmpComments(false),
    expected: "0\n",
  },
];
