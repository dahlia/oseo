/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// The upstream constructor detection helper, unchanged in behavior. The
// repository formatter owns every JavaScript file here, so spacing differs
// from upstream while every operation is identical. The helper is admitted
// by this profile now that Reflect.construct materializes: it needs only a
// typeof test, a thrown Test262Error, and one Reflect.construct call whose
// abrupt completion it catches.
// Copyright (C) 2017 André Bargull. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
function isConstructor(f) {
  if (typeof f !== "function") {
    throw new Test262Error("isConstructor invoked with a non-function value");
  }

  try {
    Reflect.construct(function () {}, [], f);
  } catch (e) {
    return false;
  }
  return true;
}
