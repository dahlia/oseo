/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { runNativeCli } from "./native-cli.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

test(
  "unrelated abrupt completions are never relabeled as Annex B",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const source of [
      'throw new RangeError("prior"); ({}).__proto__;',
      '({ get __proto__() { throw new RangeError("getter"); } }).__proto__;',
      'new Proxy({}, { get() { throw new RangeError("proxy"); } }).__proto__;',
      "const value = null; value.__proto__;",
    ]) {
      for (const specialization of ["disabled", "enabled"] as const) {
        const sourceId = "unrelated-proto-failure.js";
        const native = await runNativeCli(
          {
            args: [
              ...(specialization === "disabled" ? ["--no-specialization"] : []),
              sourceId,
            ],
            source,
            sourceId,
            version: "0.1.0",
          },
          host,
        );
        assert.equal(native.exitStatus, 1);
        assert.match(native.stderr, /error\[OSEO2001\]:/u);
        assert.doesNotMatch(native.stderr, /OSEO1001/u);
        assert.match(native.stderr, /OSEO_THROWN (?:RangeError|TypeError)/u);
      }
    }
  },
);
const diagnostic =
  "error[OSEO1001]: The Object.prototype.__proto__ " +
  "accessor is excluded by Annex B.";

test(
  "only the excluded accessor read reports the owned unsupported diagnostic",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const expression of [
      "({}).__proto__",
      '({})["__proto__"]',
      "new Uint8Array(new ArrayBuffer(0)).__proto__",
      'Reflect.get({}, "__proto__")',
      "new Proxy({}, {}).__proto__",
      "Object.prototype.__proto__",
      "(() => { /** @param {number} value */ " +
        "function read(value) { return value.__proto__; } " +
        'read({ ["__proto__"]: 1 }); return read({}); })()',
      "(() => { class Reader { read() { return super.__proto__; } } " +
        "return new Reader().read(); })()",
      "$262.createRealm().global.Object.prototype.__proto__",
    ]) {
      for (const specialization of ["disabled", "enabled"] as const) {
        process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
        try {
          const sourceId = "annexb-proto.js";
          const native = await runNativeCli(
            {
              args: [
                "--test262-host",
                ...(specialization === "disabled"
                  ? ["--no-specialization"]
                  : []),
                sourceId,
              ],
              source:
                `console.log("before");\n${expression};\n` +
                'console.log("after");\n',
              sourceId,
              version: "0.1.0",
            },
            host,
          );
          assert.equal(native.exitStatus, 1, expression);
          assert.equal(native.stdout, "before\n", expression);
          assert.ok(
            native.stderr.includes(`annexb-proto.js:2:`),
            native.stderr,
          );
          assert.ok(native.stderr.includes(diagnostic), native.stderr);
          assert.doesNotMatch(native.stderr, /OSEO2001/u);
        } finally {
          delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        }
      }
    }
  },
);
