/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// The upstream local-time assertion helper, unchanged in behavior. The
// repository formatter owns every JavaScript file here, so spacing differs
// from upstream while every operation is identical. The helper is admitted
// by this profile now that the Date family materializes: it needs only
// valueOf, getTimezoneOffset, string concatenation, and a thrown
// Test262Error.
// Copyright (C) 2015 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
function assertRelativeDateMs(date, expectedMs) {
  var actualMs = date.valueOf();
  var localOffset = date.getTimezoneOffset() * 60000;

  if (actualMs - localOffset !== expectedMs) {
    throw new Test262Error(
      "Expected " +
        date +
        " to be " +
        expectedMs +
        " milliseconds from the Unix epoch",
    );
  }
}
