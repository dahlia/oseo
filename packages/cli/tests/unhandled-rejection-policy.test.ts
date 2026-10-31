import assert from "node:assert/strict";
import test from "node:test";

import { compileSource, printMir } from "../../compiler/src/index.ts";
import { babelFrontend } from "../../parser-babel/src/index.ts";
import { runCli } from "../src/index.ts";

const source = "Promise.reject(1);";
const setup =
  /context\.unhandled_rejection_policy =\s+OSEO_UNHANDLED_REJECTION_OBSERVE;/u;

test("the rejection policy reaches MIR only when it observes", () => {
  for (const specialization of ["disabled", "enabled"] as const) {
    for (const test262Host of [false, true]) {
      const ordinary = compileSource(
        babelFrontend,
        { source, sourceId: "policy.js" },
        { specialization, test262Host },
      );
      assert.deepEqual(ordinary.diagnostics, []);
      assert.equal(ordinary.mir?.unhandledRejectionPolicy, undefined);
      assert.doesNotMatch(printMir(ordinary.mir!), /unhandled-rejections/u);
      const fatal = compileSource(
        babelFrontend,
        { source, sourceId: "policy.js" },
        { specialization, test262Host, unhandledRejectionPolicy: "fatal" },
      );
      assert.deepEqual(fatal.mir, ordinary.mir);
      const observed = compileSource(
        babelFrontend,
        { source, sourceId: "policy.js" },
        { specialization, test262Host, unhandledRejectionPolicy: "observe" },
      );
      assert.equal(observed.mir?.unhandledRejectionPolicy, "observe");
      assert.match(
        printMir(observed.mir!),
        /^mir .*\nunhandled-rejections observe\n/u,
      );
    }
  }
});

test("only the explicit option emits the observe setup", () => {
  for (const hosted of [false, true]) {
    for (const specialization of ["disabled", "enabled"] as const) {
      const args = [
        ...(hosted ? ["--test262-host"] : []),
        ...(specialization === "disabled" ? ["--no-specialization"] : []),
        "--emit-c",
      ];
      const ordinary = runCli({
        args: [...args, "policy.js"],
        source,
        version: "0.1.0",
      });
      assert.equal(ordinary.exitStatus, 0, ordinary.stderr);
      assert.doesNotMatch(ordinary.stdout, /unhandled_rejection_policy/u);
      const observed = runCli({
        args: [...args, "--test262-observe-rejections", "policy.js"],
        source,
        version: "0.1.0",
      });
      assert.equal(observed.exitStatus, 0, observed.stderr);
      const position = observed.stdout.search(setup);
      assert.ok(position >= 0);
      // The agent cluster copies the policy when the host installs.
      const install = observed.stdout.indexOf("oseo_test262_host_install(");
      assert.equal(install >= 0, hosted);
      if (hosted) assert.ok(position < install);
    }
  }
});

test("the rejection policy is independent of the test262 host", () => {
  const observed = runCli({
    args: ["--dump-mir", "--test262-observe-rejections", "policy.js"],
    source: "$262;",
    version: "0.1.0",
  });
  assert.equal(observed.exitStatus, 0, observed.stderr);
  assert.match(observed.stdout, /unhandled-rejections observe/u);
  assert.doesNotMatch(observed.stdout, /agent/u);
  const hosted = runCli({
    args: ["--dump-mir", "--test262-host", "policy.js"],
    source,
    version: "0.1.0",
  });
  assert.equal(hosted.exitStatus, 0, hosted.stderr);
  assert.doesNotMatch(hosted.stdout, /unhandled-rejections/u);
});
