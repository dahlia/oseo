/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
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

let fromRoot;
try {
  await import("./cycle-root.mjs");
} catch (error) {
  fromRoot = error;
}
console.log("root rejects", fromRoot.message);
let fromMember;
try {
  await import("./cycle-member.mjs");
} catch (error) {
  fromMember = error;
}
console.log("member shares the root error", fromMember === fromRoot);

// The second cycle starts from a parent, so its root has no top-level
// capability until the member's request creates one.
const fromParent = await import("./via-parent.mjs").catch((e) => e);
const fromSecondMember = await import("./cycle2-member.mjs").catch((e) => e);
console.log(
  "capability created for the root",
  fromParent.message,
  fromSecondMember === fromParent,
);
