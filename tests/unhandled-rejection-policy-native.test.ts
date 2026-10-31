/* eslint-disable no-await-in-loop -- Each native build is isolated. */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";

import type { CliResult } from "../packages/cli/src/index.ts";
import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { runNativeCli } from "./native-cli.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);
const observe = "--test262-observe-rejections";
const rejection = /error\[OSEO2001\]: Unhandled promise rejection\./u;

/*
 * ADR 0030: primitive and object reasons, a rejection handled before the
 * checkpoint, a late handler, and an unhandled rejection after a timer
 * turn. Only the handlers' own output is observable.
 */
const toleratedSource = `
var log = [];
Promise.reject(1);
Promise.reject({ tag: "object" });
var late = Promise.reject("late");
Promise.reject("same").catch(function (reason) {
  log.push("same " + reason);
});
Promise.resolve().then(function () { log.push("job"); });
setTimeout(function () {
  late.catch(function (reason) { log.push("late " + reason); });
  Promise.reject(new TypeError("handled")).catch(function (error) {
    log.push("handled " + error.name);
  });
  Promise.reject(new RangeError("after"));
  setTimeout(function () {
    Promise.resolve().then(function () {
      console.log(log.join(","));
    });
  }, 0);
}, 0);
`;
const toleratedOutput = "same same,job,late late,handled TypeError\n";

async function compileAndRun(
  args: readonly string[],
  source: string,
  specialization: "disabled" | "enabled",
): Promise<CliResult> {
  process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
  try {
    return await runNativeCli(
      {
        args: [
          ...(specialization === "disabled" ? ["--no-specialization"] : []),
          ...args,
        ],
        source,
        version: "0.1.0",
      },
      host,
    );
  } finally {
    delete process.env.OSEO_GC_EVERY_SAFEPOINT;
  }
}

test("the reference host prints the tolerated program's output", async () => {
  // Node.js names this policy and Deno has no equivalent flag. The file
  // may run under Deno too, so name Node rather than the test host.
  const result = await host.run({
    command: "node",
    args: ["--unhandled-rejections=none", "-e", toleratedSource],
    cwd: ".",
  });
  assert.equal(result.exitStatus, 0, result.stderr);
  assert.equal(result.stdout, toleratedOutput);
});

test(
  "the observation policy continues after unhandled rejections",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const hosted of [false, true]) {
      for (const specialization of ["disabled", "enabled"] as const) {
        const result = await compileAndRun(
          [...(hosted ? ["--test262-host"] : []), observe, "tolerated.js"],
          toleratedSource,
          specialization,
        );
        assert.equal(result.exitStatus, 0, result.stderr);
        assert.equal(result.stderr, "");
        assert.equal(result.stdout, toleratedOutput);
      }
    }
  },
);

test(
  "an ordinary executable still fails at the first unhandled rejection",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const hosted of [false, true]) {
      for (const specialization of ["disabled", "enabled"] as const) {
        const result = await compileAndRun(
          [...(hosted ? ["--test262-host"] : []), "fatal.js"],
          toleratedSource,
          specialization,
        );
        assert.notEqual(result.exitStatus, 0);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, /^fatal\.js:3:1: /u);
        assert.match(result.stderr, rejection);
      }
    }
  },
);

test(
  "the observation policy keeps every other failure",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const failures = [
      {
        name: "timer.js",
        thrown: "Error",
        source:
          "Promise.reject(1);\n" +
          'setTimeout(function () { throw new Error("timer"); }, 0);\n',
      },
      {
        name: "script.js",
        thrown: "TypeError",
        source: 'Promise.reject(1);\nthrow new TypeError("script");\n',
      },
      {
        name: "job.js",
        thrown: "TypeError",
        source:
          "Promise.reject(1);\n" +
          "Promise.resolve().then(function () {\n" +
          '  console.log("ran");\n' +
          "});\n" +
          'throw new TypeError("entry");\n',
      },
    ];
    for (const failure of failures) {
      for (const specialization of ["disabled", "enabled"] as const) {
        const result = await compileAndRun(
          [observe, failure.name],
          failure.source,
          specialization,
        );
        assert.notEqual(result.exitStatus, 0, failure.name);
        assert.doesNotMatch(result.stderr, rejection, failure.name);
        assert.match(
          result.stderr,
          new RegExp(`\\nOSEO_THROWN ${failure.thrown}\\n$`, "u"),
          failure.name,
        );
      }
    }
  },
);

test(
  "a module selects the policy and still reports a rejected entry",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "oseo-rejection-policy-"));
    try {
      const tolerated = join(root, "tolerated.mjs");
      const toleratedModule =
        "Promise.reject(1);\nawait 0;\nconsole.log('after');\n";
      await writeFile(tolerated, toleratedModule);
      const rejected = join(root, "rejected.mjs");
      const rejectedModule =
        "Promise.reject(1);\nawait 0;\nthrow new TypeError('entry');\n";
      await writeFile(rejected, rejectedModule);
      for (const specialization of ["disabled", "enabled"] as const) {
        const fatal = await compileAndRun(
          ["--module", tolerated],
          toleratedModule,
          specialization,
        );
        assert.notEqual(fatal.exitStatus, 0);
        assert.match(fatal.stderr, rejection);
        const observed = await compileAndRun(
          ["--module", observe, tolerated],
          toleratedModule,
          specialization,
        );
        assert.equal(observed.exitStatus, 0, observed.stderr);
        assert.equal(observed.stdout, "after\n");
        const entry = await compileAndRun(
          ["--module", observe, rejected],
          rejectedModule,
          specialization,
        );
        assert.notEqual(entry.exitStatus, 0);
        assert.doesNotMatch(entry.stderr, rejection);
        assert.match(entry.stderr, /\nOSEO_THROWN TypeError\n$/u);
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  },
);

test(
  "a test262 agent inherits the main agent's rejection policy",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const source = `
$262.agent.start(\`
  Promise.reject(1);
  setTimeout(function () {
    $262.agent.report("agent done");
    $262.agent.leaving();
  }, 0);
\`);
var report = null;
while (report === null) {
  report = $262.agent.getReport();
  if (report === null) $262.agent.sleep(1);
}
console.log(report);
`;
    for (const specialization of ["disabled", "enabled"] as const) {
      const observed = await compileAndRun(
        ["--test262-host", observe, "agent.js"],
        source,
        specialization,
      );
      assert.equal(observed.exitStatus, 0, observed.stderr);
      assert.equal(observed.stdout, "agent done\n");
      const fatal = await compileAndRun(
        ["--test262-host", "agent.js"],
        source,
        specialization,
      );
      assert.notEqual(fatal.exitStatus, 0);
      assert.match(fatal.stderr, rejection);
    }
  },
);
