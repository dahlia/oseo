import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { runNativeFixture } from "../tools/native-fixture.ts";

test("native fixture retains output and nonzero exit status", () => {
  const run = runNativeFixture(process.execPath, [
    "-e",
    [
      'process.stdout.write("out");',
      'process.stderr.write("err");',
      "process.exitCode = 7;",
    ].join("\n"),
  ]);
  assert.equal(run.status, 7);
  assert.equal(run.signal, null);
  assert.equal(run.stdout, "out");
  assert.equal(run.stderr, "err");
});

test("hung fixture is sampled and killed with replay diagnostics", () => {
  const started = performance.now();
  let diagnostic = "";
  assert.throws(
    () =>
      runNativeFixture(
        process.execPath,
        [
          "-e",
          [
            'process.on("SIGTERM", () => {});',
            "process.stdout.write(`ready ${process.pid}\\n`);",
            'process.stderr.write("waiting\\n");',
            "process.stdin.resume();",
            "setInterval(() => {}, 1000);",
          ].join("\n"),
        ],
        {
          timeout: 1_000,
          input: "schedule to replay\n",
          env: { ...process.env, OSEO_GC_EVERY_SAFEPOINT: "1" },
        },
      ),
    (error: Error) => {
      assert.ok(error instanceof Error);
      diagnostic = error.message;
      return true;
    },
  );
  for (const pattern of [
    /Native fixture timed out/u,
    /command:/u,
    /elapsed: [\d.]+ ms/u,
    /status: null; signal: SIGKILL/u,
    /stdout:\nready \d+/u,
    /stderr:\nwaiting/u,
    /stdin: schedule to replay/u,
    /GC: 1/u,
    /sample:/u,
  ])
    assert.match(diagnostic, pattern);
  if (process.platform === "linux") {
    assert.match(diagnostic, /\/proc\/\d+\/task\/\d+\/stack/u);
    assert.match(diagnostic, /\/wchan/u);
  } else if (process.platform === "darwin") {
    assert.match(diagnostic, /sample pid=\d+ status=/u);
  }
  const pid = Number(/stdout:\nready (\d+)/u.exec(diagnostic)?.[1]);
  assert.ok(pid > 0);
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  assert.ok(performance.now() - started < 15_000);
});

/** The scheduler state letter from a Linux /proc/<pid>/stat record. */
async function processState(pid: number): Promise<string | undefined> {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
  } catch {
    return undefined;
  }
}

async function waitFor(
  description: string,
  condition: () => Promise<boolean>,
): Promise<void> {
  const deadline = performance.now() + 10_000;
  // eslint-disable-next-line no-await-in-loop -- Bound polling.
  while (!(await condition())) {
    assert.ok(performance.now() < deadline, description);
    // eslint-disable-next-line no-await-in-loop -- Bound polling.
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test(
  "reaping reports output still unread when the reap delay expires",
  {
    skip:
      process.platform === "linux"
        ? false
        : "requires Linux /proc and stop-signal EINTR",
    timeout: 20_000,
  },
  async () => {
    // A detached grandchild survives the group kill and keeps the stdout
    // pipe open, so only the reap timer can end the supervisor. Stopping
    // the supervisor while it waits for that timer and writing "late"
    // models a reader that is not scheduled before the timer expires. Under
    // Node, epoll_wait fails with EINTR on SIGCONT and libuv runs the
    // overdue timer before polling again.
    const directory = await mkdtemp(join(tmpdir(), "oseo-reap-"));
    const ready = join(directory, "ready");
    const late = join(directory, "late");
    const holder =
      'process.on("SIGUSR2", () => process.stdout.write("late\\n", () =>' +
      ' require("node:fs").writeFileSync(process.argv.at(-1), "")));' +
      'require("node:fs").writeFileSync(process.argv.at(-2),' +
      " `${process.ppid} ${process.pid}`);" +
      "setInterval(() => {}, 1000);";
    const supervisor = spawn(
      process.execPath,
      [
        fileURLToPath(new URL("../tools/native-fixture.ts", import.meta.url)),
        "600000",
        process.execPath,
        "-e",
        'process.stdout.write("ready\\n");' +
          'require("node:child_process").spawn(process.execPath,' +
          ` ["-e", ${JSON.stringify(holder)}, ...process.argv.slice(-2)],` +
          ' { detached: true, stdio: ["ignore", "inherit", "ignore"] });' +
          "setInterval(() => {}, 1000);",
        ready,
        late,
      ],
      {
        // gdb would only slow the sample down; this test needs none.
        env: { ...process.env, PATH: directory },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 15_000,
        killSignal: "SIGKILL",
      },
    );
    let stderr = "";
    supervisor.stdout.resume();
    supervisor.stderr.setEncoding("utf8").on("data", (text: string) => {
      stderr += text;
    });
    const closed = once(supervisor, "close");
    const supervisorPid = supervisor.pid!;
    let fixturePid: number | undefined;
    let fixtureReaped = false;
    let holderPid: number | undefined;
    try {
      await waitFor("fixture started", async () => {
        try {
          const pids = (await readFile(ready, "utf8")).split(" ").map(Number);
          if (pids.length !== 2) return false;
          if (!pids.every((pid) => Number.isSafeInteger(pid) && pid > 0)) {
            return false;
          }
          [fixturePid, holderPid] = pids;
          return true;
        } catch {
          return false;
        }
      });
      supervisor.kill("SIGTERM");
      // The supervisor reaps the killed fixture from its event loop after
      // arming the reap timer, then sleeps until the timer or more output.
      await waitFor(
        "fixture reaped",
        async () => (await processState(fixturePid!)) == null,
      );
      // Its process group is gone; the ID must not be signaled again.
      fixtureReaped = true;
      await waitFor(
        "supervisor waiting",
        async () => (await processState(supervisorPid)) === "S",
      );
      process.kill(supervisorPid, "SIGSTOP");
      process.kill(holderPid!, "SIGUSR2");
      await waitFor("late output written", async () => {
        try {
          await readFile(late);
          return true;
        } catch {
          return false;
        }
      });
      // Outlast the supervisor's one-second reap delay while it is stopped.
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      process.kill(supervisorPid, "SIGCONT");
      const [status] = await closed;
      assert.equal(status, 1);
      assert.match(stderr, /interrupted by SIGTERM/u);
      assert.match(stderr, /signal: SIGKILL/u);
      assert.match(stderr, /stdout:\nready\nlate\n/u);
    } finally {
      supervisor.kill("SIGCONT");
      if (fixturePid == null && supervisor.exitCode == null) {
        // Without the fixture's PID, only the supervisor can kill its group.
        supervisor.kill("SIGTERM");
        await Promise.race([
          closed,
          new Promise((resolve) => setTimeout(resolve, 5_000)),
        ]);
      }
      supervisor.kill("SIGKILL");
      const survivors = [holderPid];
      if (fixturePid != null && !fixtureReaped) survivors.push(-fixturePid);
      for (const pid of survivors) {
        if (pid == null) continue;
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          /* Already gone. */
        }
      }
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("fixture launch errors fail with the command", () => {
  assert.throws(
    () => runNativeFixture("/no-such-oseo-fixture", []),
    /Native fixture spawn \/no-such-oseo-fixture ENOENT/u,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  test(
    `supervisor ${signal} cancels and reaps the detached fixture`,
    {
      skip: process.platform === "win32" ? "requires POSIX signals" : false,
      timeout: 20_000,
    },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "oseo-supervisor-"));
      const marker = join(directory, "ready");
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL("../tools/native-fixture.ts", import.meta.url)),
          "600000",
          process.execPath,
          "-e",
          // The marker follows the completed stdout write so the signal
          // cannot precede output the supervisor must report. Deno inserts
          // an eval script path into argv, so the marker path is read last.
          'process.stdout.write("ready\\n", () => require("node:fs")' +
            ".writeFileSync(process.argv.at(-1), String(process.pid)));" +
            "setInterval(() => {}, 1000);",
          marker,
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 15_000,
          killSignal: "SIGKILL",
        },
      );
      let stderr = "";
      child.stdout.resume();
      child.stderr.setEncoding("utf8").on("data", (text: string) => {
        stderr += text;
      });
      const closed = once(child, "close");
      let fixturePid: number | undefined;
      try {
        const deadline = performance.now() + 10_000;
        while (fixturePid == null && performance.now() < deadline) {
          try {
            // eslint-disable-next-line no-await-in-loop -- Wait for readiness.
            const pid = Number(await readFile(marker, "utf8"));
            if (Number.isSafeInteger(pid) && pid > 0) fixturePid = pid;
          } catch {
            /* The fixture has not written its marker yet. */
          }
          if (fixturePid == null) {
            // eslint-disable-next-line no-await-in-loop -- Bound polling.
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
        assert.ok(fixturePid != null, "fixture started");
        child.kill(signal);
        const [status] = await closed;
        assert.equal(status, 1);
        assert.match(stderr, new RegExp(`interrupted by ${signal}`, "u"));
        assert.match(stderr, /stdout:\nready/u);
        assert.match(stderr, /signal: SIGKILL/u);
        const reapedPid = fixturePid;
        assert.throws(() => process.kill(reapedPid, 0), { code: "ESRCH" });
        fixturePid = undefined;
      } finally {
        child.kill("SIGKILL");
        if (fixturePid != null) {
          try {
            process.kill(-fixturePid, "SIGKILL");
          } catch {
            /* Already reaped. */
          }
        }
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}

test("binary observations preserve distinct invalid UTF-8 bytes", () => {
  const run = runNativeFixture(
    process.execPath,
    [
      "-e",
      "process.stdout.write(Buffer.from([0x80, 0xff, 0]));" +
        "process.stderr.write(Buffer.from([0x81, 0xfe, 0]));",
    ],
    { encoding: "base64" },
  );
  assert.equal(run.status, 0);
  assert.deepEqual(
    Buffer.from(run.stdout, "base64"),
    Buffer.from([0x80, 0xff, 0]),
  );
  assert.deepEqual(
    Buffer.from(run.stderr, "base64"),
    Buffer.from([0x81, 0xfe, 0]),
  );
});
