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

// The driver reads no `then`, `constructor`, or species and never calls
// the global Promise, so these patches cannot change module evaluation.
const originalThen = Promise.prototype.then;
let thenCalls = 0;
Promise.prototype.then = function (...args) {
  thenCalls += 1;
  return originalThen.apply(this, args);
};
Object.defineProperty(Promise, Symbol.species, {
  get() {
    console.log("species read");
    return Promise;
  },
});
Promise.all = () => {
  console.log("Promise.all called");
};
Promise.resolve = () => {
  console.log("Promise.resolve called");
};
globalThis.Promise = function () {
  console.log("global Promise called");
};
globalThis.thenCalls = () => thenCalls;
console.log("patched");
