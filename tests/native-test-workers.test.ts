import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { nativeTestWorkers } from "../tools/native-test-workers.ts";

test("uses the available CPUs on dedicated GitHub runners", () => {
  assert.equal(nativeTestWorkers(3, true), 3);
  assert.equal(nativeTestWorkers(4, true), 4);
  assert.equal(nativeTestWorkers(2, true), 2);
});

test("shares a local machine between two native lanes", () => {
  for (const cpus of [2, 3, 4, 8, 16, 32]) {
    assert.ok(2 * nativeTestWorkers(cpus, false) <= cpus);
  }
  assert.equal(nativeTestWorkers(16, false), 8);
  assert.equal(nativeTestWorkers(1, false), 1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  test(
    `forwards ${signal} and reaps the test process`,
    {
      skip: process.platform === "win32" ? "requires POSIX signals" : false,
      timeout: 10_000,
    },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "oseo-test-launcher-"));
      const ready = join(directory, "ready");
      const fixture = join(directory, "wait.test.mjs");
      await writeFile(
        fixture,
        [
          'import { writeFileSync } from "node:fs";',
          'writeFileSync(process.env.READY, "");',
          "setTimeout(() => {",
          "  writeFileSync(process.env.READY, String(process.pid));",
          "}, 25);",
          "setInterval(() => {}, 1000);",
          "",
        ].join("\n"),
      );
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(
            new URL("../tools/run-native-tests.ts", import.meta.url),
          ),
          "--test-isolation=none",
          fixture,
        ],
        {
          env: { ...process.env, READY: ready },
          stdio: "ignore",
        },
      );
      const exited = once(child, "exit");
      let testPid: number | undefined;
      try {
        const deadline = Date.now() + 5000;
        while (testPid == null && Date.now() < deadline) {
          try {
            // eslint-disable-next-line no-await-in-loop -- Await readiness.
            const pid = Number(await readFile(ready, "utf8"));
            if (Number.isSafeInteger(pid) && pid > 0) testPid = pid;
          } catch {
            /* The marker has not been created yet. */
          }
          if (testPid == null) {
            // eslint-disable-next-line no-await-in-loop -- Bound polling.
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
        assert.ok(testPid != null);
        const reapedPid = testPid;
        child.kill(signal);
        await exited;
        assert.throws(() => process.kill(reapedPid, 0), { code: "ESRCH" });
        testPid = undefined;
      } finally {
        child.kill("SIGKILL");
        if (testPid != null) {
          try {
            process.kill(testPid, "SIGKILL");
          } catch {
            /* Already reaped. */
          }
        }
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
