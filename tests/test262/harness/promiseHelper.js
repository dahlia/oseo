/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// The reviewed Promise combinator roots use these upstream helpers to assert
// promise-job ordering and allSettled result records.
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

function checkSettledPromises(settleds, expected, message) {
  const prefix = message ? message + ": " : "";
  assert.sameValue(
    Array.isArray(settleds),
    true,
    prefix + "Settled values is an array",
  );
  assert.sameValue(
    settleds.length,
    expected.length,
    prefix + "The settled values has a different length than expected",
  );
  settleds.forEach(function (settled, index) {
    assert.sameValue(
      Object.prototype.hasOwnProperty.call(settled, "status"),
      true,
      prefix + "The settled value has a property status",
    );
    assert.sameValue(
      settled.status,
      expected[index].status,
      prefix + "status for item " + index,
    );
    if (settled.status === "fulfilled") {
      assert.sameValue(
        Object.prototype.hasOwnProperty.call(settled, "value"),
        true,
        prefix + "The fulfilled promise has a property named value",
      );
      assert.sameValue(
        Object.prototype.hasOwnProperty.call(settled, "reason"),
        false,
        prefix + "The fulfilled promise has no property named reason",
      );
      assert.sameValue(
        settled.value,
        expected[index].value,
        prefix + "value for item " + index,
      );
    } else {
      assert.sameValue(
        settled.status,
        "rejected",
        prefix + "Valid statuses are only fulfilled or rejected",
      );
      assert.sameValue(
        Object.prototype.hasOwnProperty.call(settled, "value"),
        false,
        prefix + "The rejected promise has no property named value",
      );
      assert.sameValue(
        Object.prototype.hasOwnProperty.call(settled, "reason"),
        true,
        prefix + "The rejected promise has a property named reason",
      );
      assert.sameValue(
        settled.reason,
        expected[index].reason,
        prefix + "reason for item " + index,
      );
    }
  });
}
