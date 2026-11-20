/* eslint-disable no-import-assign -- Tests namespace descriptor rejection. */
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

import * as namespace from "./value.mjs";

namespace.updateDescriptor();
const descriptorTarget = {};
Object.defineProperty(descriptorTarget, "live", namespace);
const liveDescriptor = Object.getOwnPropertyDescriptor(
  descriptorTarget,
  "live",
);
console.log(
  "descriptor namespace",
  descriptorTarget.live,
  typeof descriptorTarget.live,
  liveDescriptor.writable,
  liveDescriptor.enumerable,
  liveDescriptor.configurable,
);

const tagDescriptor = Object.getOwnPropertyDescriptor(
  namespace,
  Symbol.toStringTag,
);
console.log(
  "tag descriptor",
  tagDescriptor.value,
  tagDescriptor.writable,
  tagDescriptor.enumerable,
  tagDescriptor.configurable,
  Object.prototype.toString.call(namespace),
);
console.log(
  "tag same",
  Object.defineProperty(namespace, Symbol.toStringTag, tagDescriptor) ===
    namespace,
  Object.defineProperty(namespace, Symbol.toStringTag, {
    value: "Module",
  }) === namespace,
);
for (const descriptor of [
  { configurable: true },
  { enumerable: true },
  { value: "Changed" },
  { writable: true },
  {
    get() {
      return "Module";
    },
  },
]) {
  try {
    Object.defineProperty(namespace, Symbol.toStringTag, descriptor);
  } catch (error) {
    console.log("tag incompatible", error instanceof TypeError);
  }
}

const keyLog = [];
const newKey = {
  toString() {
    keyLog.push("key");
    return "newValue";
  },
};
try {
  Object.defineProperty(namespace, newKey, { value: 2 });
} catch (error) {
  console.log("new", error instanceof TypeError, keyLog[0]);
}
console.log(
  "same",
  Object.defineProperty(namespace, "value", {}) === namespace,
  Object.defineProperty(namespace, "value", { value: 17 }) === namespace,
  namespace.value,
);
for (const descriptor of [
  { configurable: true },
  { enumerable: false },
  { value: 2 },
  { writable: false },
  {
    get() {
      return 1;
    },
  },
]) {
  try {
    Object.defineProperty(namespace, "value", descriptor);
  } catch (error) {
    console.log("incompatible", error instanceof TypeError);
  }
}
console.log("stable", namespace.value);
