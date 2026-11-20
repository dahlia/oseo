// Copyright (C) 2018 Igalia, S. L. All rights reserved.
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

/** Distinct Parse Nodes cache independently; closures share their own site. */
export const templateSiteIdentityFixture: Fixture = {
  name: "template-site-identity",
  source: `
const objects = [];
const substitutions = [];
function tag(template, a, b) {
  objects.push(template);
  substitutions.push(a + ":" + b);
}
// Identical bodies at distinct static Parse Nodes replace the two evals.
function first(a) {
  return function () {
    for (let b = 0; b < 2; b++) { tag\`\${a}\${b}\`; }
  };
}
function second(a) {
  return function () {
    for (let b = 0; b < 2; b++) { tag\`\${a}\${b}\`; }
  };
}
first(0)();
second(1)();
console.log("identities", objects[0] === objects[1],
  objects[1] !== objects[2], objects[2] === objects[3]);
console.log("values", substitutions.join(","));
// A fresh closure of the same static function must reuse its Parse Node.
first(2)();
console.log("recreated", objects[0] === objects[4],
  objects[4] === objects[5]);
console.log("all-values", substitutions.join(","));
`,
};
