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

import { dependencyReceiver, dependencyThis } from "./dependency.mjs";

console.log("entry", this === undefined, typeof this, this);
console.log("imported", dependencyThis === undefined);
console.log("imported call", dependencyReceiver() === undefined);
const arrow = () => this;
console.log("arrow", arrow() === undefined);
function inner() {
  return this;
}
console.log("inner", inner() === undefined);
function innerArrowOwner() {
  const nested = () => this;
  return nested();
}
console.log("inner arrow", innerArrowOwner() === undefined);
const holder = {
  arrowMember: () => this,
  method() {
    return this;
  },
};
console.log(
  "member",
  holder.method() === holder,
  holder.arrowMember() === undefined,
);
const detached = holder.method;
console.log("detached", detached() === undefined);
class Owner {
  read() {
    return this;
  }
  static readStatic() {
    return this;
  }
}
const owner = new Owner();
console.log("class", owner.read() === owner, Owner.readStatic() === Owner);
function* stepped() {
  yield this;
}
console.log("generator", stepped().next().value === undefined);
function defaulted(value = this) {
  return value;
}
const arrowDefaulted = (value = this) => value;
console.log(
  "default",
  defaulted() === undefined,
  defaulted(holder) === holder,
  arrowDefaulted() === undefined,
);
async function later() {
  return this;
}
await Promise.resolve();
console.log("after await", this === undefined, arrow() === undefined);
console.log("async", (await later()) === undefined);
