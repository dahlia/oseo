/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

/* Oseo source license
 * Copyright (C) 2017 Ecma International.  All rights reserved.
 * Copyright (c) 2012 Ecma International.  All rights reserved.
 * The Test262 portions retain the BSD license in LICENSE.
 *
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This notice covers Oseo-authored code.
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

function Test262Error(message) {
  this.message = message;
}

/* The upstream sta.js throwing callback. A reviewed case hands it to an
 * API that must invoke a callable and reports the resulting throw. */
Test262Error.thrower = function (message) {
  throw new Test262Error(message);
};

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
