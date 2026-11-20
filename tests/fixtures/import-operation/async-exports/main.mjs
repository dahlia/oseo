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

const resolved = await import("./resolves.mjs");
console.log("after await", resolved.value, resolved.late);
const viaThen = await import("./resolves.mjs").then(
  (namespace) => namespace.value,
);
console.log("cached", viaThen);
const rejection = await import("./rejects.mjs").then(
  () => "fulfilled",
  (error) => `${error.constructor.name}: ${error.message}`,
);
console.log("rejected", rejection);
const early = await import("./rejects-early.mjs").then(
  () => "fulfilled",
  (error) => error,
);
console.log("rejected before await", early);
