/*
 * The reviewed cases that include deepEqual.js compare ordinary arrays,
 * nested arrays, primitives, and undefined. Keep the harness at that admitted
 * surface instead of importing upstream's diagnostic formatter, whose Date,
 * Error, Reflect, typed-array, and iterator references widen the profile even
 * when an assertion succeeds.
 */
function __oseoDeepEqual(left, right) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  let index = 0;
  while (index < left.length) {
    if (!__oseoDeepEqual(left[index], right[index])) return false;
    index = index + 1;
  }
  return true;
}

assert.deepEqual = function (actual, expected, message) {
  assert(
    __oseoDeepEqual(actual, expected),
    message || "Expected values to be structurally equal.",
  );
};
