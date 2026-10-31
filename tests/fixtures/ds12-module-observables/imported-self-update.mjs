// Copyright (C) 2018 Leo Balter. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
// Static adaptation of the pinned test262 source:
// Upstream: imported-self-update.js
import * as ns0 from "./imported-self-update.mjs";

let x = 0;
export { x, x as y };
async function fn() {
  var imported = await Promise.resolve(ns0);
  assert.sameValue(imported.x, 0, "original value, direct binding");
  assert.sameValue(imported.y, 0, "original value, indirect binding");
  x = 1;
  assert.sameValue(imported.x, 1, "updated value, direct binding");
  assert.sameValue(imported.y, 1, "updated value, indirect binding");
}

// Do not use asyncTest: when self imported, $DONE is not defined, asyncTest
// will throw
fn().then($DONE, $DONE);
