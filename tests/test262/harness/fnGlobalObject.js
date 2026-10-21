/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// The upstream global object helper, with the same definitions and caching.
// Upstream obtains the global object as Function("return this;")(), which
// compiles source text at runtime; ADR 0016 keeps the Function constructor
// outside the admitted dynamic source. This copy reads the initial value of
// globalThis instead, which is the global object of the only realm a case
// runs in. Reading it while the harness loads, before any case body runs,
// keeps the cached value independent of later writes to globalThis, as the
// upstream cache is. A top-level this probe would not do: module cases
// load the harness as module code, where this is undefined.
// Copyright (C) 2017 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
var __globalObject = globalThis;
function fnGlobalObject() {
  return __globalObject;
}
