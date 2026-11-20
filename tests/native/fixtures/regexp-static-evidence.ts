// Copyright (C) 2016 Aleksey Shvayka. All rights reserved.
// Copyright (C) 2016 the V8 project authors. All rights reserved.
// Copyright 2009 the Sputnik authors.  All rights reserved.
// The Test262 portions follow the BSD license in
// ../../test262/harness/LICENSE.

/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This notice covers Oseo-authored code. Material derived from
 * Test262 retains its BSD license.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type { Fixture } from "../fixture.ts";

// Each pair fixes the literal at build time. The accompanying grammar suite
// compiles the exact text emitted by .source, so matching is not inferred
// from spelling alone. No eval or Function is used by the native program.
export const regexpStaticEvidenceFixtures: readonly Fixture[] = [
  {
    name: "regexp-static-evidence",
    source: String.raw`
function check(value) {
  if (!value) throw new Error("static regexp evidence failed");
}
function same(actual, expected) {
  check(Object.is(actual, expected));
}
let mutationsRejected = 0;
const mutations = [
  [1, "1"], [undefined, "undefined"], [42, "42"],
  [true, "true"], [false, "false"], [0, -0],
];
for (let i = 0; i < mutations.length; i++) {
  try { same(mutations[i][0], mutations[i][1]); }
  catch (error) { mutationsRejected = mutationsRejected + 1; }
}
// Keep this verdict independent of the comparator under test.
check(mutations.length === 6 && mutationsRejected === 6);
same(NaN, NaN);
let rejected = false;
try { new RegExp("", "migr"); }
catch (error) { rejected = error instanceof SyntaxError; }
same(rejected, true);
const math = new RegExp(Math, "g");
same(math.ignoreCase, false);
same(math.multiline, false);
same(math.global, true);
same(math.lastIndex, 0);
check(typeof math.source !== "undefined");
const pairs = [
  [new RegExp(""), /(?:)/, [""], "(?:)"],
  [new RegExp("\n"), /\n/, ["\n", "_\n_", "\\n", "\r", "n"], "\\n"],
  [new RegExp("/"), /\//, ["/", "_/_", "\\"], "\\/"],
  [/\ud834\udf06/u, /\ud834\udf06/u, ["\ud834\udf06", "𝌆"],
    "\\ud834\\udf06"],
  [/\u{1d306}/u, /\u{1d306}/u, ["\ud834\udf06", "𝌆"], "\\u{1d306}"],
  [/ab{2,4}c$/, /ab{2,4}c$/,
    ["abbc", "abbbc", "abbbbc", "xabbc", "xabbbc", "xabbbbc",
     "ac", "abc", "abbcx", "bbc", "abb", "abbbbbc"], "ab{2,4}c$"],
];
const expected = [
  [true], [true, true, false, false, false], [true, true, false],
  [true, true], [true, true],
  [true, true, true, true, true, true,
   false, false, false, false, false, false],
];
for (let i = 0; i < pairs.length; i++) {
  const original = pairs[i][0];
  const literal = pairs[i][1];
  const inputs = pairs[i][2];
  same(original.source, pairs[i][3]);
  same(literal.source, original.source);
  same(literal.flags, original.flags);
  for (let j = 0; j < inputs.length; j++) {
    same(original.test(inputs[j]), expected[i][j]);
    same(literal.test(inputs[j]), expected[i][j]);
  }
}
console.log("regexp static evidence passed");
`,
  },
];
