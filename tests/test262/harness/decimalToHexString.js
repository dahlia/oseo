/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// The upstream encoding assertion helpers, unchanged in behavior. The
// repository formatter owns every JavaScript file here, so spacing differs
// from upstream while every operation is identical. Both functions are
// admitted by this profile: they need only unsigned shifts, string index
// reads, and string concatenation.
// Copyright (C) 2017 André Bargull. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
function decimalToHexString(n) {
  var hex = "0123456789ABCDEF";
  n >>>= 0;
  var s = "";
  while (n) {
    s = hex[n & 0xf] + s;
    n >>>= 4;
  }
  while (s.length < 4) {
    s = "0" + s;
  }
  return s;
}

function decimalToPercentHexString(n) {
  var hex = "0123456789ABCDEF";
  return "%" + hex[(n >> 4) & 0xf] + hex[n & 0xf];
}
