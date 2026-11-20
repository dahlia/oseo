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

var isFirstScript = typeof globalThis.evaluated === "undefined";
if (isFirstScript) globalThis.evaluated = 0;
globalThis.evaluated += 1;
console.log(isFirstScript ? "script evaluates" : "module evaluates");
var requests = Promise.all([import("./script.js"), import("./script.js")]);
var p = requests.then(async function (namespaces) {
  var again = await import("./script.js");
  return [
    globalThis.evaluated,
    namespaces[0] === namespaces[1],
    again === namespaces[0],
  ];
});
if (isFirstScript) {
  p.then(function (result) {
    console.log("evaluations", result.join(" "));
  });
}
