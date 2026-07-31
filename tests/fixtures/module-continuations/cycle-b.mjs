import "./cycle-a.mjs";

export let bState = "b pending";
console.log("cycle b start");

/**
 * @param {number} left
 * @param {number} right
 */
function hintedAdd(left, right) {
  return left + right;
}

const guardMiss = hintedAdd(
  {
    valueOf: function () {
      console.log("guard miss fallback");
      return "x";
    },
  },
  1,
);
await Promise.resolve();
bState = "b ready";
console.log("cycle b done", guardMiss);
