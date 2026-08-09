/* eslint-disable no-import-assign -- Tests namespace descriptor rejection. */

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
