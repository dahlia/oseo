/* eslint-disable no-await-in-loop -- Protocol checks are serial. */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import {
  accessSync,
  closeSync,
  openSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { fileIdentity } from "../tools/perf-profile-capture.ts";
import {
  readKernelControl,
  writeKernelControl,
} from "../tools/perf/kernel-root/control.ts";
import {
  RootLifetime,
  replayKernelLifetimeProof,
  requireKernelLifetimeCleanup,
  requireKernelLifetimeArm,
  sessionStat,
} from "../tools/perf/kernel-root/lifetime.ts";
import type {
  KernelLifetimeInput,
  LifetimeProof,
} from "../tools/perf/kernel-root/lifetime.ts";

import type * as S from "../tools/perf/native-host-collector.ts";

const qaRoot = process.env.OSEO_KERNEL_LIFETIME_QA_ROOT;
const linux = process.platform === "linux" && process.arch === "x64";

/** Metadata only: the real helper may attempt its original denied open. */
function uuidGuard(): void {
  const path = "/sys/devices/virtual/dmi/id/product_uuid";
  assert.equal(realpathSync(path), path);
  const meta = lstatSync(path);
  assert.ok(meta.isFile());
  assert.equal(meta.dev, 26);
  assert.equal(meta.ino, 2001);
  assert.equal(meta.uid, 0);
  assert.equal(meta.gid, 0);
  assert.equal(meta.mode & 0o777, 0o400);
  assert.notEqual(process.geteuid!(), 0);
  assert.throws(() => accessSync(path, constants.R_OK), { code: "EACCES" });
}

const childSource = `
const { startChildLifetime } = await import(process.argv[1]);
const input = JSON.parse(process.argv[2]);
try {
  const helper = await startChildLifetime({
    deployment: input, parentPid: process.ppid,
  });
  process.on('message', () => helper.stop());
  process.send({ ready: true });
  try { await helper.done; process.send({ helperClosed: true }); }
  catch { process.send({ helperFailed: true }); }
  process.disconnect();
} catch (error) {
  const { writeFileSync } = await import("node:fs");
  const { inspect } = await import("node:util");
  writeFileSync(input.output + "/bootstrap-error.txt", inspect(error),
    { mode: 0o600 });
  process.send({ bootstrapFailed: true });
  process.disconnect();
  process.exitCode = 1;
}
`;

for (const boundary of ["normal-close", "control-pipe-eof"] as const)
  test(
    `unchanged Source8 real lifetime ABI: ${boundary}`,
    {
      skip:
        !linux || qaRoot == null
          ? "requires explicit private Linux Source8 QA allocation"
          : false,
    },
    async () => {
      uuidGuard();
      assert.ok(qaRoot);
      const localApi = new URL(
        "../tools/perf/native-host-collector.ts",
        import.meta.url,
      );
      const injectedApi = process.env.OSEO_KERNEL_ROOT_CONTRACT_SOURCE;
      assert.ok(existsSync(localApi) || injectedApi);
      const apiUrl = existsSync(localApi)
        ? localApi
        : pathToFileURL(injectedApi!);
      // SAFETY: actual S parsers are read-only QA, not source admission.
      const api = (await import(apiUrl.href)) as typeof S;
      const base = readKernelControl<KernelLifetimeInput>(
        join(qaRoot, "allocation.json"),
      );
      const output = join(qaRoot, boundary);
      mkdirSync(output, { mode: 0o700 });
      const input = { ...base, output };
      const allocation = input.linuxLifetime;
      for (const pin of [allocation.python, allocation.source])
        assert.deepEqual(fileIdentity(pin.path), pin);
      const pythonVersion = execFileSync(
        allocation.python.path,
        ["-I", "-B", "-c", 'import sys; print(sys.version, end="")'],
        { encoding: "utf8", env: input.env },
      );
      assert.equal(pythonVersion, allocation.pythonVersion);
      writeKernelControl(join(output, "invocation.json"), {
        node: fileIdentity(realpathSync(process.execPath)),
        nodeVersion: process.version,
        argv: ["--input-type=module", "-e", childSource],
        input,
        cwd: "/",
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      });
      uuidGuard();
      const childError = openSync(
        join(output, "child-stderr.bin"),
        "wx",
        0o600,
      );
      const child = spawn(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          childSource,
          new URL("../tools/perf/kernel-root/lifetime.ts", import.meta.url)
            .href,
          JSON.stringify(input),
        ],
        {
          detached: true,
          cwd: "/",
          env: input.env,
          stdio: ["ignore", "ignore", childError, "ipc"],
        },
      );
      closeSync(childError);
      const exited = once(child, "exit");
      void exited.catch(() => undefined);
      const closed = once(child, "close");
      let root: RootLifetime | undefined;
      try {
        const [ready] = await once(child, "message");
        assert.deepEqual(ready, { ready: true });
        assert.ok(child.pid);
        root = await RootLifetime.bind(input, child.pid);
        const directory = join(output, "lifetime");
        const armPath = join(directory, "arm.json");
        const armPin = fileIdentity(armPath);
        const arm =
          readKernelControl<Parameters<typeof requireKernelLifetimeArm>[0]>(
            armPath,
          );
        const spawnPath = join(directory, "spawn.json");
        const spawnPin = fileIdentity(spawnPath);
        const originalSpawn = readKernelControl<{
          readonly pid: number;
          readonly controlPid: number;
          readonly config: typeof arm.config;
          readonly python: typeof allocation.python;
          readonly source: typeof allocation.source;
        }>(spawnPath);
        requireKernelLifetimeArm(arm, arm.config, originalSpawn.pid);
        assert.deepEqual(originalSpawn.config, arm.config);
        assert.equal(originalSpawn.controlPid, child.pid);
        assert.equal(arm.config.controlPid, child.pid);
        assert.equal(arm.config.rootPid, process.pid);
        assert.deepEqual(originalSpawn.python, allocation.python);
        assert.deepEqual(originalSpawn.source, allocation.source);
        assert.equal(arm.config.pythonPath, allocation.python.path);
        assert.equal(arm.config.pythonSha256, allocation.python.sha256);
        assert.equal(arm.config.sourceSha256, allocation.source.sha256);
        assert.equal(arm.hostObservation.hardware.value, null);
        assert.equal(arm.hostObservation.hardware.error?.errno, 13);
        const originalLeader = sessionStat(arm.leaderStat);
        let helperBirth: string | undefined;
        const helperPid = arm.challenge.observerPid;
        const pidfdPath = `/proc/${helperPid}/fd/${arm.pidfdNumber}`;
        const fdBefore = lstatSync(pidfdPath, { bigint: true });
        assert.equal(readlinkSync(pidfdPath), "anon_inode:[pidfd]");
        const fdinfo = readFileSync(
          `/proc/${helperPid}/fdinfo/${arm.pidfdNumber}`,
          "utf8",
        );
        assert.match(fdinfo, new RegExp(`Pid:\\s+${child.pid}\\n`, "u"));
        writeKernelControl(join(output, "pidfd-before.json"), {
          inode: fdBefore.ino.toString(),
          fdinfo,
          descriptors: readdirSync(`/proc/${helperPid}/fd`).map((fd) => ({
            fd,
            target: readlinkSync(`/proc/${helperPid}/fd/${fd}`),
          })),
          executable: fileIdentity(realpathSync(`/proc/${helperPid}/exe`)),
        });
        for (let sequence = 0; sequence < 2; sequence++) {
          const start = process.hrtime.bigint().toString();
          const psRaw = execFileSync(
            "/usr/bin/ps",
            [
              "-p",
              `${helperPid},${child.pid}`,
              "-o",
              "pid=,ppid=,pgid=,uid=,pcpu=,time=,comm=",
            ],
            { env: { ...input.env, LC_ALL: "C" }, timeout: 1000 },
          );
          const helperRaw = readFileSync(`/proc/${helperPid}/stat`);
          const leaderRaw: Buffer = readFileSync(`/proc/${child.pid}/stat`);
          const originals = [
            ["ps", psRaw],
            ["helper-stat", helperRaw],
            ["leader-stat", leaderRaw],
          ] as const;
          const rawPins = originals.map(([name, bytes]) => {
            const path = join(output, `identity-${sequence}-${name}.bin`);
            writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
            return fileIdentity(path);
          });
          const parsed = api.parseCollectorProcesses(
            psRaw,
            input.host.target,
            2,
          );
          assert.equal(parsed.complete, true);
          assert.deepEqual(parsed.errors, []);
          assert.equal(parsed.processes.length, 2);
          const helper = parsed.processes.find((row) => row.pid === helperPid);
          const leader = parsed.processes.find((row) => row.pid === child.pid);
          assert.ok(helper && leader);
          const helperStat = sessionStat(helperRaw.toString("utf8"));
          const leaderStat = sessionStat(leaderRaw.toString("utf8"));
          assert.deepEqual(leaderStat, originalLeader);
          helperBirth ??= helperStat.ticks;
          assert.deepEqual(helperStat, {
            pid: helperPid,
            ppid: child.pid,
            group: child.pid,
            sid: child.pid,
            ticks: helperBirth,
          });
          assert.ok(BigInt(helperBirth) >= BigInt(originalLeader.ticks));
          assert.deepEqual(api.parseCollectorProcStat(helperRaw), {
            pid: helperPid,
            ppid: child.pid,
            group: child.pid,
            startTicks: helperBirth,
          });
          assert.deepEqual(api.parseCollectorProcStat(leaderRaw), {
            pid: child.pid,
            ppid: process.pid,
            group: child.pid,
            startTicks: originalLeader.ticks,
          });
          assert.equal(helper.ppid, child.pid);
          assert.equal(helper.group, child.pid);
          assert.equal(helper.uid, input.host.uid);
          assert.equal(helper.uid, process.getuid!());
          assert.equal(
            helper.comm,
            basename(arm.config.pythonPath).slice(0, 15),
          );
          assert.equal(leader.ppid, process.pid);
          assert.equal(leader.group, child.pid);
          assert.equal(leader.uid, input.host.uid);
          const probePath = join(output, `toy-probe-${sequence}.json`);
          writeKernelControl(probePath, {
            kind: "toy-abi-clock-only-not-S-evidence",
            rawPins,
            start: { monotonicNs: start },
            end: { monotonicNs: process.hrtime.bigint().toString() },
          });
          const samplePath = join(output, `toy-sample-${sequence}.json`);
          writeKernelControl(samplePath, {
            kind: "toy-abi-clock-only-not-S-evidence",
            end: { monotonicNs: process.hrtime.bigint().toString() },
          });
          const sample = fileIdentity(samplePath);
          const probe = fileIdentity(probePath);
          await assert.rejects(
            root.poll({ ...sample, sha256: "0".repeat(64) }, probe, sequence),
          );
          const proof: LifetimeProof = await root.poll(sample, probe, sequence);
          assert.equal(
            replayKernelLifetimeProof(
              proof,
              sample,
              probe,
              sequence,
              input.host,
              process.pid,
            )?.pid,
            child.pid,
          );
          assert.deepEqual(proof.arm, armPin);
          assert.equal(proof.leaderStat, arm.leaderStat);
          assert.ok(BigInt(proof.rootArmedNs) <= BigInt(start));
          assert.deepEqual(fileIdentity(armPath), armPin);
          assert.deepEqual(fileIdentity(spawnPath), spawnPin);
          writeKernelControl(join(output, `identity-${sequence}.json`), {
            arm: armPin,
            spawn: spawnPin,
            proof,
            rawPins,
            helper: { ...helper, birth: helperBirth },
            helperStat,
            leaderStat,
            parser: fileIdentity(apiUrl.pathname),
          });
          await assert.rejects(root.poll(sample, probe, sequence));
          assert.equal(
            lstatSync(pidfdPath, { bigint: true }).ino,
            fdBefore.ino,
          );
          assert.equal(
            readFileSync(
              `/proc/${helperPid}/fdinfo/${arm.pidfdNumber}`,
              "utf8",
            ),
            fdinfo,
          );
        }
        const helperResult = once(child, "message");
        if (boundary === "normal-close") {
          await root.close();
          assert.deepEqual((await helperResult)[0], { helperClosed: true });
          requireKernelLifetimeCleanup(directory);
        } else {
          child.send({ stop: true });
          assert.deepEqual((await helperResult)[0], { helperFailed: true });
          await assert.rejects(root.close());
          assert.throws(() => requireKernelLifetimeCleanup(directory));
          const terminal = readKernelControl<{
            readonly status: string;
            readonly cleanup: Readonly<Record<string, string>>;
            readonly cleanupErrors: readonly unknown[];
          }>(join(directory, "terminal.json"));
          assert.equal(terminal.status, "failed");
          assert.deepEqual(terminal.cleanupErrors, []);
          for (const key of [
            "streamClose",
            "clientClose",
            "clientFdClosed",
            "serverClose",
            "socketUnlink",
            "pidfdClose",
          ])
            assert.equal(terminal.cleanup[key], "completed");
          const reaped = readKernelControl<{
            readonly pid: number;
            readonly code: number;
          }>(join(directory, "reaped.json"));
          assert.equal(reaped.pid, helperPid);
          assert.equal(reaped.code, 1);
        }
        assert.deepEqual(await exited, [0, null]);
        await closed;
        assert.equal(existsSync(`/proc/${child.pid}`), false);
        assert.equal(existsSync(`/proc/${helperPid}`), false);
        assert.equal(existsSync(join(directory, "observer.sock")), false);
        writeKernelControl(join(output, "toy-reaped.json"), {
          code: 0,
          signal: null,
          childAbsent: true,
          helperAbsent: true,
          socketAbsent: true,
          unchangedPersistentPidfd: true,
        });
      } finally {
        root?.destroy();
        if (child.connected) child.send({ stop: true }, () => undefined);
        await closed;
        uuidGuard();
        for (const pin of [allocation.python, allocation.source])
          assert.deepEqual(fileIdentity(pin.path), pin);
      }
    },
  );
