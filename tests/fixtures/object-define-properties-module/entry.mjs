/* eslint-disable no-import-assign -- Tests namespace redefinition. */

import * as mixed from "./mixed.mjs";
import * as descriptors from "./value.mjs";

// A module namespace as the properties argument: every export is an own
// enumerable property whose sorted key order drives the collection pass,
// and each descriptor is read through the namespace's binding cells. The
// exported function is an object too, so it converts to an all-default
// descriptor rather than being skipped.
const target = {};
console.log(
  "returned",
  Object.defineProperties(target, descriptors) === target,
);
const bumpDescriptor = Object.getOwnPropertyDescriptor(target, "bump");
const firstDescriptor = Object.getOwnPropertyDescriptor(target, "first");
console.log(
  "collected",
  target.first,
  target.second,
  bumpDescriptor.value,
  bumpDescriptor.writable,
  firstDescriptor.writable,
  firstDescriptor.enumerable,
  firstDescriptor.configurable,
);
descriptors.bump();
const retarget = {};
Object.defineProperties(retarget, descriptors);
console.log(
  "live",
  retarget.first,
  Object.getOwnPropertyDescriptor(retarget, "first").writable,
);

// A non-object export aborts the collection pass, so the object export
// sorted ahead of it must not reach the target.
const untouched = {};
try {
  Object.defineProperties(untouched, mixed);
} catch (error) {
  console.log(
    "mixed namespace",
    error instanceof TypeError,
    "alpha" in untouched,
  );
}

// A module namespace as the target accepts a compatible redefinition and
// rejects an incompatible one only after the whole collection pass ran.
console.log(
  "namespace target same",
  Object.defineProperties(descriptors, { first: { enumerable: true } }) ===
    descriptors,
);
const applyLog = [];
try {
  Object.defineProperties(descriptors, {
    first: {
      get enumerable() {
        applyLog.push("first");
        return true;
      },
    },
    second: {
      get enumerable() {
        applyLog.push("second");
        return false;
      },
    },
  });
} catch (error) {
  console.log(
    "namespace incompatible",
    error instanceof TypeError,
    applyLog[0],
    applyLog[1],
    descriptors.first.value,
  );
}
