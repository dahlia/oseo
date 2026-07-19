/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

function Test262Error(message) {
  this.message = message;
}

function test262SameValue(actual, expected) {
  if (actual === expected) {
    if (actual === 0) return 1 / actual === 1 / expected;
    return true;
  }
  if (actual !== actual) return expected !== expected;
  return false;
}

function assert(value, message) {
  if (value === true) return;
  throw new Test262Error(message);
}

assert.sameValue = function (actual, expected, message) {
  if (test262SameValue(actual, expected)) return;
  throw new Test262Error(message);
};

assert.notSameValue = function (actual, unexpected, message) {
  if (!test262SameValue(actual, unexpected)) return;
  throw new Test262Error(message);
};

assert.throws = function (expectedErrorConstructor, func, message) {
  if (typeof func !== "function") {
    throw new Test262Error(
      "assert.throws requires a function to run as its second argument.",
    );
  }
  try {
    func();
  } catch (thrown) {
    if (typeof thrown !== "object" || thrown === null) {
      throw new Test262Error(message);
    }
    if (thrown.constructor !== expectedErrorConstructor) {
      throw new Test262Error(message);
    }
    return;
  }
  throw new Test262Error(message);
};

function compareArray(actual, expected) {
  if (actual.length !== expected.length) return false;
  let index = 0;
  while (index < actual.length) {
    if (!test262SameValue(actual[index], expected[index])) return false;
    index = index + 1;
  }
  return true;
}

assert.compareArray = function (actual, expected, message) {
  if (compareArray(actual, expected)) return;
  throw new Test262Error(message);
};

function $DONOTEVALUATE() {
  throw new Test262Error("This statement must not be evaluated.");
}
