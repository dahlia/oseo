// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
// Static adaptation of the pinned test262 source:
// Upstream: instn-same-global.js

import "./instn-same-global-set_FIXTURE.mjs";

var global = globalThis;

assert.sameValue(global.test262, 262);

console.log("ok");
