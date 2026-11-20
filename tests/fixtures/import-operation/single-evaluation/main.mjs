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

import { count } from "./counter.mjs";

const first = import("./once.mjs");
const second = import("./once.mjs");
console.log("distinct promises", first !== second);
const [a, b] = await Promise.all([first, second]);
console.log("concurrent namespace", a === b, a.value);
const c = await import("./once.mjs");
const d = await import("./once.mjs");
console.log("serialized namespace", c === a && d === a);
console.log("evaluations", count());
const self = await import("./self.mjs");
console.log("self request", await self.settled, count());
