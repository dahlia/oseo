/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// The owned Promise.all and Promise.race roots use this upstream helper to
// assert promise-job ordering. Promise.allSettled owns the separate settled
// result helper from the same upstream include.
function checkSequence(array, message) {
  array.forEach(function (element, index) {
    if (element !== index + 1) {
      throw new Test262Error(
        (message === undefined ? "Steps in unexpected sequence:" : message) +
          " '" +
          array.join(",") +
          "'",
      );
    }
  });
  return true;
}
