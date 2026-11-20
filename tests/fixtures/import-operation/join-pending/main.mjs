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

const order = [];
const first = import("./waiting.mjs").then(() => order.push("first"));
const empty = import("./empty.mjs").then(() => order.push("empty"));
const second = import("./waiting.mjs").then(() => order.push("second"));
await Promise.all([first, empty, second]);
console.log("joined order", order.join(","));
const later = await import("./waiting.mjs");
console.log("re-entry after completion", later.done);
const grandparent = await import("./grandparent.mjs");
console.log("finished subgraph does not hang", grandparent.depth);
