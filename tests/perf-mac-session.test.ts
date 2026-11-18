/* eslint-disable no-await-in-loop -- Signal-handler fixtures run serially. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  macSessionProbe,
  runMacSession,
  runSessionCommand,
} from "../tools/perf/mac-session.ts";
import type {
  MacProbe,
  MacSessionOptions,
  SessionAdmission,
  SessionCommand,
  SessionIdentity,
  SessionPhases,
  SessionSource,
} from "../tools/perf/mac-session.ts";

const posix = { skip: process.platform === "win32" ? "POSIX groups" : false };
const source: SessionSource = {
  sha: "a".repeat(40),
  tree: "b".repeat(40),
  status: "",
};
const identity: SessionIdentity = {
  platform: "darwin",
  arch: "arm64",
  hostname: "fake-vm",
  githubActions: "true",
  runnerEnvironment: "github-hosted",
  runnerOs: "macOS",
  runnerArch: "ARM64",
  runnerName: "fake-runner",
  imageOs: "macos15",
  imageVersion: "fake-image-version",
  runId: "fake-run",
  runAttempt: "1",
  job: "fake-job",
};

function nodeCommand(cwd: string, script: string): SessionCommand {
  return {
    executable: process.execPath,
    argv: ["--input-type=module", "-e", script],
    cwd,
    env: { TEST_VALUE: "explicit" },
    stdin: new Uint8Array(),
    timeoutMs: null,
  };
}

const probeOutput = {
  architecture: "arm64\n",
  os: "15.0\n",
  load: "vm.loadavg: { 0.1 0.2 0.3 }\n",
  memory: "hw.memsize: 7516192768\n",
  hardware: "hw.model: VirtualMac\nhw.ncpu: 3\n",
  virtualMemory:
    "Mach Virtual Memory Statistics: (page size of 16384 bytes)\n" +
    "Pages free: 1234.\n",
  power: "Currently in use:\n sleep 0\n",
  processes: "PID PPID UID %CPU %MEM COMM\n1 0 501 0.0 0.0 fake\n",
  disk:
    "Filesystem 1024-blocks Used Available Capacity Mounted on\n" +
    "/dev/fake 10000 1000 9000 10% /\n",
} satisfies Readonly<Record<MacProbe, string>>;

function fakeProbe(probe: MacProbe, cwd: string): SessionCommand {
  return nodeCommand(
    cwd,
    `process.stdout.write(${JSON.stringify(probeOutput[probe])})`,
  );
}

function knownAdmission(): SessionAdmission {
  const known = {
    status: "known",
    accepted: true,
    evidence: "hermetic fixture only; not actual Mac evidence",
  } as const;
  return {
    scope: "github-hosted-vm",
    load: known,
    memory: known,
    disk: known,
    power: known,
    processes: known,
    tools: known,
  };
}

async function fixture(
  run: (options: MacSessionOptions, root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "oseo-mac-session-"));
  const checkout = join(root, "checkout");
  await mkdir(checkout);
  const good = nodeCommand(checkout, "process.stdout.write('phase');");
  const phases: SessionPhases = {
    build: good,
    correctness: good,
    discovery: good,
    measure: good,
    profile: good,
    archive: good,
    upload: good,
  };
  try {
    await run(
      {
        checkout,
        directory: join(root, "evidence"),
        expectedSource: source,
        expectedIdentity: identity,
        phases,
        assess: async () => knownAdmission(),
        simulatedHost: {
          identity: () => identity,
          source: async () => source,
          probe: fakeProbe,
        },
      },
      root,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test(
  "fake Mac session orders phases and discloses actual OS",
  posix,
  async () => {
    await fixture(async (options) => {
      const result = await runMacSession(options);
      assert.equal(result.status, "succeeded");
      assert.equal(result.simulated, true);
      assert.deepEqual(
        result.commands.map((record) => record.directory.split("/").at(-1)),
        [
          "build",
          "correctness",
          "discovery",
          "measure",
          "profile",
          "archive",
          "upload",
        ],
      );
      const metadata = await readFile(
        join(options.directory, "session.json"),
        "utf8",
      );
      assert.match(metadata, /"physicalIsolation": "unknown"/);
      assert.match(metadata, new RegExp(`"platform": "${process.platform}"`));
      assert.match(metadata, /"simulated": true/);
      assert.equal(options.phases.measure.timeoutMs, null);
    });
  },
);

test(
  "source SHA, tree and dirty status each stop dependent phases",
  posix,
  async () => {
    for (const mismatch of [
      { ...source, sha: "c".repeat(40) },
      { ...source, tree: "d".repeat(40) },
      { ...source, status: "?? dirty\n" },
    ]) {
      await fixture(async (options) => {
        const result = await runMacSession({
          ...options,
          expectedSource: mismatch,
        });
        assert.equal(result.status, "failed");
        assert.equal(result.commands.length, 0);
        assert.match(
          result.failures.join("\n"),
          /Source SHA\/tree\/clean mismatch/,
        );
      });
    }
  },
);

test(
  "unknown, different or self-hosted identity fails before build",
  posix,
  async () => {
    for (const mismatch of [
      { ...identity, arch: "x64" },
      { ...identity, runnerEnvironment: "self-hosted" },
      { ...identity, imageVersion: null },
      { ...identity, runAttempt: "2" },
    ]) {
      await fixture(async (options) => {
        const result = await runMacSession({
          ...options,
          simulatedHost: {
            identity: () => mismatch,
            source: async () => source,
            probe: fakeProbe,
          },
        });
        assert.equal(result.status, "failed");
        assert.equal(result.commands.length, 0);
        assert.match(
          await readFile(
            join(options.directory, "build-identity.json"),
            "utf8",
          ),
          /runnerEnvironment/,
        );
      });
    }
  },
);

test(
  "source changed by build is caught before correctness",
  posix,
  async () => {
    await fixture(async (options) => {
      let calls = 0;
      const result = await runMacSession({
        ...options,
        simulatedHost: {
          identity: () => identity,
          source: async () =>
            ++calls === 1 ? source : { ...source, status: " M src\n" },
          probe: fakeProbe,
        },
      });
      assert.equal(result.status, "failed");
      assert.equal(result.commands.length, 1);
    });
  },
);

test(
  "empty and nonzero probes retain unknown/failed raw and prevent measure",
  posix,
  async () => {
    for (const script of [
      "",
      "process.stderr.write('probe failed'); process.exit(7)",
    ]) {
      await fixture(async (options) => {
        const result = await runMacSession({
          ...options,
          simulatedHost: {
            identity: () => identity,
            source: async () => source,
            probe: (probe, cwd) =>
              probe === "power"
                ? nodeCommand(cwd, script)
                : fakeProbe(probe, cwd),
          },
        });
        assert.equal(result.status, "failed");
        assert.equal(result.commands.length, 5);
        const snapshot = await readFile(
          join(options.directory, "before.json"),
          "utf8",
        );
        assert.match(snapshot, script === "" ? /"unknown"/ : /"failed"/);
        assert.equal(
          await readFile(
            join(options.directory, "before-power", "stderr.bin"),
            "utf8",
          ),
          script === "" ? "" : "probe failed",
        );
      });
    }
  },
);

test(
  "known text cannot replace an unknown or rejected admission field",
  posix,
  async () => {
    for (const memory of [
      { status: "unknown", reason: "VM limit unavailable" } as const,
      { status: "failed", reason: "probe failed" } as const,
      {
        status: "known",
        accepted: false,
        evidence: "insufficient memory",
      } as const,
    ]) {
      await fixture(async (options) => {
        const result = await runMacSession({
          ...options,
          assess: async () => ({ ...knownAdmission(), memory }),
        });
        assert.equal(result.status, "failed");
        assert.ok(
          result.commands.every(
            (entry) => !entry.directory.endsWith("measure"),
          ),
        );
        assert.match(
          await readFile(join(options.directory, "admission.json"), "utf8"),
          /VM limit unavailable|probe failed|insufficient memory/,
        );
      });
    }
  },
);

test(
  "native identity on non-Mac cannot attest a fake Mac",
  {
    skip: process.platform === "darwin" ? "non-Mac guard" : false,
  },
  async () => {
    await fixture(async (options) => {
      const { simulatedHost: _unused, ...native } = options;
      const result = await runMacSession(native);
      assert.equal(result.status, "failed");
      assert.equal(result.simulated, false);
      assert.equal(result.commands.length, 0);
    });
  },
);

test("native probe requests avoid argument and environment inventory", () => {
  const request = macSessionProbe("processes", "/tmp");
  assert.deepEqual(request.argv, [
    "-A",
    "-c",
    "-o",
    "pid,ppid,uid,pcpu,pmem,comm",
  ]);
  assert.deepEqual(Object.keys(request.env).toSorted(), ["LC_ALL", "PATH"]);
  assert.deepEqual(macSessionProbe("disk", "/tmp").argv, ["-k", "/tmp"]);
});

test(
  "child streams preserve exact bytes and explicit launch env",
  posix,
  async () => {
    await fixture(async (options, root) => {
      const command = {
        ...nodeCommand(
          options.checkout,
          "import fs from 'node:fs';" +
            "process.stdout.write(fs.readFileSync(0));" +
            "process.stderr.write(Buffer.from([255,0,10]));" +
            "if(process.env.TEST_VALUE !== 'explicit') process.exit(9);",
        ),
        stdin: new Uint8Array([0, 255, 1, 10]),
      };
      const result = await runSessionCommand(command, join(root, "child"));
      assert.equal(result.failure, null);
      assert.equal(result.cleanup, "gone");
      assert.deepEqual(
        await readFile(join(root, "child", "stdout.bin")),
        Buffer.from(command.stdin),
      );
      assert.deepEqual(
        await readFile(join(root, "child", "stderr.bin")),
        Buffer.from([255, 0, 10]),
      );
      assert.deepEqual(
        await readFile(join(root, "child", "stdin.bin")),
        Buffer.from(command.stdin),
      );
    });
  },
);

test(
  "nonzero, signal, timeout and abort retain partial output",
  posix,
  async () => {
    const cases = [
      {
        script: "process.stdout.write('partial'); process.exit(7)",
        timeoutMs: null,
      },
      {
        script:
          "process.stdout.write('partial');" +
          "process.kill(process.pid,'SIGTERM')",
        timeoutMs: null,
      },
      {
        script: "process.stdout.write('partial'); setInterval(()=>{},1000)",
        timeoutMs: 500,
      },
    ];
    for (const entry of cases) {
      await fixture(async (options, root) => {
        const record = await runSessionCommand(
          {
            ...nodeCommand(options.checkout, entry.script),
            timeoutMs: entry.timeoutMs,
          },
          join(root, "child"),
        );
        assert.notEqual(record.failure, null);
        assert.equal(record.cleanup, "gone");
        assert.equal(
          await readFile(join(root, "child", "stdout.bin"), "utf8"),
          "partial",
        );
        assert.ok(record.finishedAt >= record.startedAt);
      });
    }
    await fixture(async (options, root) => {
      const controller = new AbortController();
      const command = nodeCommand(
        options.checkout,
        "process.stdout.write('partial'); setInterval(()=>{},1000)",
      );
      const timer = setTimeout(() => controller.abort(), 500);
      try {
        const record = await runSessionCommand(
          command,
          join(root, "child"),
          controller.signal,
        );
        assert.match(record.failure ?? "", /Interrupted/);
        assert.equal(
          await readFile(join(root, "child", "stdout.bin"), "utf8"),
          "partial",
        );
      } finally {
        clearTimeout(timer);
      }
    });
  },
);

test(
  "a failed phase still runs archive/upload and skips dependent work",
  posix,
  async () => {
    await fixture(async (options) => {
      const result = await runMacSession({
        ...options,
        phases: {
          ...options.phases,
          correctness: nodeCommand(
            options.checkout,
            "process.stderr.write('wrong bytes'); process.exit(8)",
          ),
        },
      });
      assert.equal(result.status, "failed");
      assert.deepEqual(
        result.commands.map((entry) => entry.code),
        [0, 8, 0, 0],
      );
      assert.equal(
        await readFile(
          join(options.directory, "correctness", "stderr.bin"),
          "utf8",
        ),
        "wrong bytes",
      );
    });
  },
);

test(
  "owned descendant cleanup never kills an unrelated child",
  posix,
  async () => {
    await fixture(async (options, root) => {
      const unrelated = spawn(
        process.execPath,
        ["-e", "setInterval(()=>{},1000)"],
        { stdio: "ignore", env: {} },
      );
      const exited = once(unrelated, "exit");
      try {
        const command = nodeCommand(
          options.checkout,
          "import {spawn} from 'node:child_process';" +
            "const c=spawn(process.execPath," +
            "['-e','setInterval(()=>{},1000)']," +
            "{stdio:'ignore',env:{}});" +
            "process.stdout.write(String(c.pid)); process.exit(0);",
        );
        const record = await runSessionCommand(command, join(root, "child"));
        assert.match(record.failure ?? "", /live process group/);
        assert.equal(record.cleanup, "gone");
        const descendant = Number(
          await readFile(join(root, "child", "stdout.bin"), "utf8"),
        );
        assert.ok(Number.isSafeInteger(descendant) && descendant > 0);
        assert.throws(() => process.kill(descendant, 0), { code: "ESRCH" });
        assert.ok(unrelated.pid !== undefined);
        assert.equal(process.kill(unrelated.pid, 0), true);
      } finally {
        unrelated.kill("SIGKILL");
        await exited;
      }
    });
  },
);

test(
  "aborted session preserves originals and fails without dependent phases",
  posix,
  async () => {
    await fixture(async (options) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 500);
      try {
        const result = await runMacSession({
          ...options,
          signal: controller.signal,
          phases: {
            ...options.phases,
            build: nodeCommand(
              options.checkout,
              "process.stdout.write('before abort'); setInterval(()=>{},1000)",
            ),
          },
        });
        assert.equal(result.status, "failed");
        assert.equal(result.commands.length, 1);
        assert.match(result.failures.join("\n"), /Interrupted|interrupted/);
        assert.equal(
          await readFile(
            join(options.directory, "build", "stdout.bin"),
            "utf8",
          ),
          "before abort",
        );
      } finally {
        clearTimeout(timer);
      }
    });
  },
);

test(
  "failed post-measure probe prevents profiling and success",
  posix,
  async () => {
    await fixture(async (options) => {
      let powerCalls = 0;
      const result = await runMacSession({
        ...options,
        simulatedHost: {
          identity: () => identity,
          source: async () => source,
          probe: (probe, cwd) =>
            probe === "power" && ++powerCalls > 1
              ? nodeCommand(cwd, "process.exit(6)")
              : fakeProbe(probe, cwd),
        },
      });
      assert.equal(result.status, "failed");
      assert.ok(
        result.commands.every((entry) => !entry.directory.endsWith("profile")),
      );
      assert.match(result.failures.join("\n"), /Post-measure|Final conditions/);
    });
  },
);

test(
  "source mutation during upload fails the final source check",
  posix,
  async () => {
    await fixture(async (options, root) => {
      const marker = join(root, "upload-finished");
      const result = await runMacSession({
        ...options,
        phases: {
          ...options.phases,
          upload: nodeCommand(
            options.checkout,
            "import fs from 'node:fs';" +
              `fs.writeFileSync(${JSON.stringify(marker)},'finished');`,
          ),
        },
        simulatedHost: {
          identity: () => identity,
          source: async () => {
            const changed = await readFile(marker).then(
              () => true,
              () => false,
            );
            return changed
              ? { ...source, status: " M changed-during-upload\n" }
              : source;
          },
          probe: fakeProbe,
        },
      });
      assert.equal(result.status, "failed");
      assert.match(result.failures.join("\n"), /Final source\/identity/);
      assert.match(
        await readFile(join(options.directory, "final-source.json"), "utf8"),
        /changed-during-upload/,
      );
    });
  },
);
