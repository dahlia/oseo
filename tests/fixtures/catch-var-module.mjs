/* oxlint-disable no-shadow, block-scoped-var */
// This fixture deliberately exercises catch and var bindings with one name.
var value = "module outer";
let readCatch;

try {
  throw "module caught";
} catch (value) {
  readCatch = function () {
    return value;
  };
  var value = "module catch";
  console.log("module catch", value);
}

console.log("module outer", value, readCatch());

export const retained = value;
