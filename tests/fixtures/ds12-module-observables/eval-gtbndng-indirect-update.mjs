// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
// Static adaptation of the pinned test262 source:
// Upstream: eval-gtbndng-indirect-update.js

import { x } from "./eval-gtbndng-indirect-update_FIXTURE.mjs";

assert.sameValue(x, 1);

// This function is exposed on the global scope (instead of as an exported
// binding) in order to avoid possible false positives from assuming correct
// behavior of the semantics under test.
globalThis.test262update();

assert.sameValue(x, 2);

console.log("ok");
