import assert from "node:assert/strict";
import test from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

for (const exitCode of [0, 1]) {
  test(`exits with status ${exitCode} after its child`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "oseo-test-launcher-"));
    const fixture = join(directory, "finish.test.mjs");
    try {
      await writeFile(fixture, `process.exitCode = ${exitCode};\n`);
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(
            new URL("../tools/run-native-tests.ts", import.meta.url),
          ),
          fixture,
        ],
        {
          encoding: "utf8",
          env: { ...process.env, NODE_TEST_CONTEXT: undefined },
          timeout: 10_000,
        },
      );
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      assert.equal(result.status, exitCode, result.stderr);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

for (const sharded of [false, true]) {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    test(
      `forwards ${signal} and reaps the test process (sharded=${sharded})`,
      {
        skip: process.platform === "win32" ? "requires POSIX signals" : false,
        timeout: 10_000,
      },
      async () => {
        const directory = await mkdtemp(join(tmpdir(), "oseo-test-launcher-"));
        const ready = join(directory, "ready");
        const relativeFile = "tests/property/wait.property.test.ts";
        const fixture = join(directory, relativeFile);
        await mkdir(join(directory, "tests/property"), { recursive: true });
        await writeFile(
          fixture,
          [
            'import { writeFileSync } from "node:fs";',
            // Only sharded files delay exit; the plain file owns its signal.
            ...(sharded
              ? [
                  'process.on("SIGTERM", () => {',
                  "  setTimeout(() => process.exit(0), 100);",
                  "});",
                ]
              : []),
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
            ...(sharded
              ? ["--shard", "1/12", relativeFile]
              : ["--test-isolation=none", fixture]),
          ],
          {
            cwd: directory,
            env: { ...process.env, READY: ready, NODE_TEST_CONTEXT: undefined },
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
          const [, exitSignal] = await exited;
          if (sharded) assert.equal(exitSignal, signal);
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
}

for (const probeMode of ["normal", "failed", "hung", "both-hung"] as const) {
  test(
    `handles a SIGTERM-ignoring file with probes=${probeMode}`,
    {
      skip: process.platform === "win32" ? "requires POSIX signals" : false,
      timeout: 10_000,
    },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "oseo-test-launcher-"));
      const ready = join(directory, "ready");
      const relativeFile = "tests/property/wait.property.test.ts";
      const fixture = join(directory, relativeFile);
      const psMarker = join(directory, "ps-attempted");
      const pgrepMarker = join(directory, "pgrep-attempted");
      await mkdir(join(directory, "tests/property"), { recursive: true });
      if (probeMode !== "normal") {
        const bin = join(directory, "bin");
        await mkdir(bin);
        await writeFile(
          join(bin, "ps"),
          '#!/bin/sh\nprintf attempted > "$PS_MARKER"\n' +
            (probeMode === "failed" ? "exit 2\n" : "exec sleep 10\n"),
          { mode: 0o755 },
        );
        if (probeMode === "both-hung") {
          await writeFile(
            join(bin, "pgrep"),
            '#!/bin/sh\nprintf attempted > "$PGREP_MARKER"\n' +
              "exec sleep 10\n",
            { mode: 0o755 },
          );
        }
      }
      await writeFile(
        fixture,
        [
          'import { writeFileSync } from "node:fs";',
          'process.on("SIGTERM", () => {});',
          "writeFileSync(process.env.READY, String(process.pid));",
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
          "--shard",
          "1/12",
          relativeFile,
        ],
        {
          cwd: directory,
          env: {
            ...process.env,
            READY: ready,
            PS_MARKER: psMarker,
            PGREP_MARKER: pgrepMarker,
            PATH:
              probeMode !== "normal"
                ? `${join(directory, "bin")}:${process.env.PATH ?? ""}`
                : process.env.PATH,
            NODE_TEST_CONTEXT: undefined,
          },
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
      const exited = once(child, "exit");
      const closed = once(child, "close");
      const stderr: string[] = [];
      child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
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
        const signaledAt = Date.now();
        child.kill("SIGTERM");
        if (probeMode === "both-hung") {
          const probeDeadline = Date.now() + 5_000;
          let fallbackStarted = false;
          while (!fallbackStarted && Date.now() < probeDeadline) {
            try {
              fallbackStarted =
                // eslint-disable-next-line no-await-in-loop -- Await probe.
                (await readFile(pgrepMarker, "utf8")) === "attempted";
            } catch {
              /* The fallback probe has not started yet. */
            }
            if (!fallbackStarted) {
              // eslint-disable-next-line no-await-in-loop -- Bound polling.
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
          }
          assert.ok(fallbackStarted);
          child.kill("SIGTERM");
        }
        const [, exitSignal] = await exited;
        await closed;
        assert.equal(exitSignal, "SIGTERM");
        const elapsed = Date.now() - signaledAt;
        assert.ok(elapsed >= 1_500 && elapsed < 6_000);
        if (probeMode !== "normal") {
          assert.equal(await readFile(psMarker, "utf8"), "attempted");
        }
        if (probeMode === "both-hung") {
          assert.equal(await readFile(pgrepMarker, "utf8"), "attempted");
          assert.match(stderr.join(""), /Cannot enumerate test-file children/u);
          assert.doesNotThrow(() => process.kill(reapedPid, 0));
        } else {
          assert.equal(stderr.join(""), "");
          assert.throws(() => process.kill(reapedPid, 0), { code: "ESRCH" });
          testPid = undefined;
        }
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
