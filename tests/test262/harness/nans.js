/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// The upstream collection of NaN-producing expressions, unchanged in
// value. The repository formatter owns every JavaScript file here, so
// spacing differs from upstream while every listed expression is
// identical. Every one of them is admitted by this profile: the two
// Math.pow forms became available with the math-namespace node.
// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
var NaNs = [
  NaN,
  Number.NaN,
  NaN * 0,
  0 / 0,
  Infinity / Infinity,
  -(0 / 0),
  Math.pow(-1, 0.5),
  -Math.pow(-1, 0.5),
  Number("Not-a-Number"),
];
