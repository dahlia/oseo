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

import { bump, seen } from "./dependency.mjs";

const shadowed = "module";
record("entry");
console.log("dependency", JSON.stringify(seen.slice(0, 4)), seen[4]);
console.log("shadowed", shadowed, globalThis.shadowed);
console.log("bump", bump(), globalThis.counter, lexical);
globalThis.counter = 40;
console.log("property write", counter, bump());
console.log("log", log.join(","));
console.log("sloppy", implicitGlobal, sloppyThis, this);
const descriptor = Object.getOwnPropertyDescriptor(globalThis, "record");
console.log("descriptor", descriptor.configurable, descriptor.enumerable);
console.log("lexical property", "lexical" in globalThis, typeof missing);
try {
  fixed = "changed";
} catch (error) {
  console.log("const", error instanceof TypeError, fixed);
}
console.log("retained", retained());
