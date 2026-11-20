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

import * as staticNamespace from "./exports.mjs";
import * as emptyStatic from "./empty.mjs";

const dynamicNamespace = await import("./exports.mjs");
console.log("static and dynamic", dynamicNamespace === staticNamespace);
const again = await import("./exports.mjs");
console.log("repeated", again === dynamicNamespace);
const empty = await import("./empty.mjs");
console.log("export-free", empty === emptyStatic, Object.keys(empty).length);
const lazy = await import("./lazy-only.mjs");
const lazyAgain = await import("./lazy-only.mjs");
console.log(
  "lazy-only",
  lazy === lazyAgain,
  lazy.reexported === staticNamespace,
);
console.log(
  "shape",
  Object.getPrototypeOf(dynamicNamespace) === null,
  Object.isExtensible(dynamicNamespace),
  dynamicNamespace[Symbol.toStringTag],
  Object.keys(dynamicNamespace).join(","),
);
