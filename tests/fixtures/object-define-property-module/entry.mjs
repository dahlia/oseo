/* eslint-disable no-import-assign -- Tests namespace descriptor rejection. */

import * as namespace from "./value.mjs";

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
  Object.defineProperty(namespace, "value", { value: 1 }) === namespace,
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
