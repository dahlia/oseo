// Copyright (C) 2018 Leo Balter. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
// Static adaptation of the pinned test262 source:
// Upstream: custom-primitive.js
import * as ns0 from "./custom-tostring_FIXTURE.mjs";
import * as ns1 from "./custom-valueof_FIXTURE.mjs";

async function fn() {
  const str = await Promise.resolve(ns0);
  const value = await Promise.resolve(ns1);

  assert.sameValue(String(str), "1612", "namespace uses the imported toString");
  assert.sameValue(
    Number(str),
    1612,
    "namespace fallsback to toString as its prototype is null",
  );

  assert.sameValue(Number(value), 42, "namespace uses the imported valueOf");
  assert.sameValue(
    String(value),
    "42",
    "namespace fallsback to valueOf as its prototype is null",
  );
}

asyncTest(fn);
