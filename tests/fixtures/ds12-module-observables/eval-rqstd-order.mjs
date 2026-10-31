// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
// Static adaptation of the pinned test262 source:
// Upstream: eval-rqstd-order.js

assert.sameValue(globalThis.test262, "123456789");

import {} from "./eval-rqstd-order-1_FIXTURE.mjs";

import "./eval-rqstd-order-2_FIXTURE.mjs";

import * as ns1 from "./eval-rqstd-order-3_FIXTURE.mjs";

import dflt1 from "./eval-rqstd-order-4_FIXTURE.mjs";

export {} from "./eval-rqstd-order-5_FIXTURE.mjs";

import dflt2 from "./eval-rqstd-order-6_FIXTURE.mjs";

export * from "./eval-rqstd-order-7_FIXTURE.mjs";

import dflt3, * as ns2 from "./eval-rqstd-order-8_FIXTURE.mjs";

export * as ns3 from "./eval-rqstd-order-9_FIXTURE.mjs";

console.log("ok");
