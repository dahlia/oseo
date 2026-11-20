/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

/* Oseo source license
 * Copyright (C) 2022 Igalia, S.L. All rights reserved.
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

// Upstream asyncHelpers detects `$DONE` through
// `Object.prototype.hasOwnProperty.call(globalThis, "$DONE")`. The admitted
// profile has no `globalThis` binding, and the runner inserts the reviewed
// `$DONE` harness only for asynchronous cases, so this adaptation probes the
// binding with `typeof` instead. The reviewed harness reports a failure
// through `$DONE`, which composes the failure detail itself.
function asyncTest(testFunc) {
  if (typeof $DONE !== "function") {
    throw new Test262Error("asyncTest called without async flag");
  }
  if (typeof testFunc !== "function") {
    $DONE(new Test262Error("asyncTest called with non-function argument"));
    return;
  }
  try {
    testFunc().then(
      function () {
        $DONE();
      },
      function (error) {
        $DONE(error);
      },
    );
  } catch (syncError) {
    $DONE(syncError);
  }
}

// Upstream `assert.throwsAsync` renders the constructor name into its failure
// message. The reviewed harness compares the rejection value's constructor
// identity and throws a `Test262Error` without composing a message from the
// observed value: a rejection whose `constructor` is missing or exotic would
// otherwise replace the mismatch report with a thrown conversion. A rejection
// carrying a different constructor with the same name is therefore reported
// as an ordinary constructor mismatch. The reviewed `$DONE` carries the
// failure detail the runner records.
assert.throwsAsync = function (expectedErrorConstructor, func, message) {
  return new Promise(function (resolve) {
    const fail = function (detail) {
      throw new Test262Error(message === undefined ? detail : message);
    };
    if (typeof expectedErrorConstructor !== "function") {
      fail("assert.throwsAsync needs an error constructor.");
    }
    if (typeof func !== "function") {
      fail("assert.throwsAsync needs a function.");
    }
    let result;
    try {
      result = func();
    } catch (thrown) {
      fail("The function threw synchronously.");
    }
    if (
      result === null ||
      typeof result !== "object" ||
      typeof result.then !== "function"
    ) {
      fail("The result was not a thenable.");
    }
    let settleFulfilled;
    let settleRejected;
    const settlement = new Promise(function (onFulfilled, onRejected) {
      settleFulfilled = onFulfilled;
      settleRejected = onRejected;
    });
    try {
      result.then(settleFulfilled, settleRejected);
    } catch (thrown) {
      fail("The then method threw synchronously.");
    }
    resolve(
      settlement.then(
        function () {
          fail("No exception was thrown at all.");
        },
        function (thrown) {
          if (thrown === null || typeof thrown !== "object") {
            fail("The thrown value was not an object.");
          }
          if (thrown.constructor !== expectedErrorConstructor) {
            fail("A different error constructor was thrown.");
          }
        },
      ),
    );
  });
};
