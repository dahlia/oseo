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

const IntrinsicPromise = Promise;
const plain = import("./plain.mjs");
console.log(
  "intrinsic promise",
  Object.getPrototypeOf(plain) === IntrinsicPromise.prototype,
  Promise.resolve(plain) === plain,
);
let speciesReads = 0;
globalThis.Promise = function Replacement() {
  throw new Error("replacement constructed");
};
const afterRebinding = import("./plain.mjs");
globalThis.Promise = IntrinsicPromise;
console.log(
  "rebinding ignored",
  Object.getPrototypeOf(afterRebinding) === IntrinsicPromise.prototype,
  afterRebinding !== plain,
);
Object.defineProperty(IntrinsicPromise, Symbol.species, {
  configurable: true,
  get() {
    speciesReads += 1;
    return IntrinsicPromise;
  },
});
const plainNamespace = await plain;
console.log("same namespace", plainNamespace === (await afterRebinding));
console.log("species reads", speciesReads);

const callable = await import("./then-callable.mjs");
console.log("callable then", callable);
const noncallable = await import("./then-noncallable.mjs");
console.log("noncallable then", typeof noncallable, noncallable.then);
const throwing = await import("./then-throwing.mjs").catch((e) => e.message);
console.log("throwing then", throwing);
const rejecting = await import("./then-rejecting.mjs").catch((e) => e);
console.log("rejecting then", rejecting);

/** @param {number} value */
function describe(value) {
  return typeof value;
}
console.log("hints", describe(plainNamespace), describe(1));
