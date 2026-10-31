// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
// Static adaptation of the pinned test262 source:
// Upstream: eval-rqstd-once.js

import {} from "./eval-rqstd-once_FIXTURE.mjs";
import "./eval-rqstd-once_FIXTURE.mjs";
import * as ns1 from "./eval-rqstd-once_FIXTURE.mjs";
import dflt1 from "./eval-rqstd-once_FIXTURE.mjs";
export {} from "./eval-rqstd-once_FIXTURE.mjs";
import dflt2 from "./eval-rqstd-once_FIXTURE.mjs";
export * from "./eval-rqstd-once_FIXTURE.mjs";
export * as ns2 from "./eval-rqstd-once_FIXTURE.mjs";
export * as class from "./eval-rqstd-once_FIXTURE.mjs";
import dflt3, * as ns3 from "./eval-rqstd-once_FIXTURE.mjs";
export default null;

var global = globalThis;

assert.sameValue(global.test262, 262, "global property was defined");

console.log("ok");
