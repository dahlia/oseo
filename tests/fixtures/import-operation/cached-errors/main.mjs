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

const first = await import("./thrower.mjs").catch((error) => error);
const second = await import("./thrower.mjs").catch((error) => error);
console.log("same error", first === second, first.message);
const late = await import("./thrower.mjs").then(
  () => "fulfilled",
  (error) => error === first,
);
console.log("later request", late);
const afterAwait = await import("./throws-after-await.mjs").catch((e) => e);
const afterAgain = await import("./throws-after-await.mjs").catch((e) => e);
console.log("after await", afterAwait.message, afterAwait === afterAgain);
