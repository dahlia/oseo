import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileIdentity } from "../tools/perf-profile-capture.ts";
import type * as S from "../tools/perf/native-host-collector.ts";
import { writeKernelControl } from "../tools/perf/kernel-root/control.ts";
import * as lifetime from "../tools/perf/kernel-root/lifetime.ts";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import {
  KernelLifetimeFrames,
  sessionStat,
  requireLifetimeSocketIdentity,
} from "../tools/perf/kernel-root/lifetime.ts";
import * as ownership from "../tools/perf/kernel-root/ownership.ts";
import type { OwnershipRow } from "../tools/perf/kernel-root/ownership.ts";

/** Private fixtures require POSIX ownership and mode semantics. */
const posixFixture = {
  skip:
    process.platform === "linux" || process.platform === "darwin"
      ? false
      : "requires POSIX ownership and private file modes",
};

const root: OwnershipRow = {
  pid: 10,
  ppid: 1,
  group: 10,
  uid: 1000,
  comm: "node",
  birth: "100",
  birthPrecision: "kernel-ticks",
};
const leader = { ...root, pid: 20, ppid: 10, group: 20, birth: "200" };
const leaf = {
  ...root,
  pid: 30,
  ppid: 20,
  group: 20,
  birth: null,
  birthPrecision: "unknown",
  comm: "short-lived",
};

test("stable-chain ownership preserves a vanished leaf's unknown birth", () => {
  const checked: number[] = [];
  ownership.requireStableKernelChain(
    leaf,
    [root, leader, leaf],
    [root, leader],
    10,
    1000,
    new Set(),
    (pid) => checked.push(pid),
  );
  assert.deepEqual(checked, [20, 10]);
  assert.equal(leaf.birth, null);
});

for (const boundary of [
  "prearm",
  "detached-P",
  "helper-close",
  "postleader",
  "reused",
  "unknown-parent",
  "uid",
  "changed-birth",
  "unbracketed",
] as const)
  test(`unproved lifetime boundary remains a failure: ${boundary}`, () => {
    const current =
      boundary === "postleader"
        ? [root, leaf]
        : [
            root,
            {
              ...leader,
              birth: boundary === "unknown-parent" ? null : leader.birth,
              birthPrecision:
                boundary === "changed-birth"
                  ? "changed"
                  : leader.birthPrecision,
            },
            leaf,
          ];
    const previous =
      boundary === "prearm" || boundary === "helper-close"
        ? []
        : [root, leader];
    assert.throws(() =>
      ownership.requireStableKernelChain(
        {
          ...leaf,
          group: boundary === "detached-P" ? 999 : leaf.group,
          uid: boundary === "uid" ? 1001 : leaf.uid,
        },
        current,
        previous,
        10,
        1000,
        new Set(boundary === "reused" ? [leaf.pid] : []),
        () => {
          if (boundary === "unbracketed") throw new Error("no bracket stat");
        },
      ),
    );
  });

test("pipe frames retain nonce bytes and reject EOF", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const frames = new KernelLifetimeFrames(input, output, 1000);
  const nonce = "a".repeat(64);
  const pending = frames.read();
  input.write(JSON.stringify({ nonce, observerPid: 20 }) + "\n");
  assert.deepEqual(await pending, { nonce, observerPid: 20 });
  assert.equal(
    frames.lastRaw,
    JSON.stringify({ nonce, observerPid: 20 }) + "\n",
  );
  const next = frames.read();
  input.end();
  await assert.rejects(next, /EOF/);
});

test("observer rejects oversized frames and changed socket inode", async () => {
  const input = new PassThrough();
  const frames = new KernelLifetimeFrames(input, new PassThrough(), 1000);
  const pending = frames.read();
  input.write("x".repeat(65537));
  await assert.rejects(pending, /Oversize/);
  const identity = {
    device: "1",
    inode: "2",
    uid: 1000,
    gid: 1000,
    mode: 0o600,
  };
  requireLifetimeSocketIdentity(identity, identity);
  assert.throws(() =>
    requireLifetimeSocketIdentity(identity, { ...identity, inode: "3" }),
  );
});

test("session stat rejects zombie, absent SID and malformed births", () => {
  const tail = ["10", "20", "20", ...Array(15).fill("0"), "123"];
  assert.deepEqual(sessionStat(`20 (control ) name) S ${tail.join(" ")}`), {
    pid: 20,
    ppid: 10,
    group: 20,
    sid: 20,
    ticks: "123",
  });
  for (const raw of [
    "",
    "20 (x) S 1",
    `20 (x) Z ${tail.join(" ")}`,
    `20 (x) S 10 20 0 ${tail.slice(3).join(" ")}`,
  ])
    assert.throws(() => sessionStat(raw));
});

/** The clocks of an S sample or probe record that the replay consumes. */
interface SRecord {
  readonly start?: S.CollectorClock;
  readonly end: S.CollectorClock;
}

/** S originals a fixture publishes in place of its small default ones. */
interface SOriginals {
  readonly sample: SRecord;
  readonly probe: SRecord;
  /** Publish them as S does, or through another writer for a negative. */
  readonly write: (path: string, value: SRecord) => void;
}

/** Original-format synthetic wires; the Python helper is never launched. */
function lifetimeProofFixture(rootArmedNs: string, s?: SOriginals) {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), "kernel-lifetime-proof-")),
  );
  const write = <Value>(name: string, value: Value) => {
    const path = join(directory, name);
    writeKernelControl(path, value);
    return fileIdentity(path);
  };
  const publish = (
    name: string,
    value: SRecord,
    writer: SOriginals["write"],
  ) => {
    const path = join(directory, name);
    writer(path, value);
    return fileIdentity(path);
  };
  const host = {
    target: "linux-x86_64-gnu" as const,
    hardware: "fixture",
    boot: "fixture-boot",
    uid: process.getuid!(),
  };
  const binding = {
    taskId: "kernel-task",
    runId: "fixture-kernel",
    manifestSha256: "1".repeat(64),
    host,
    phase: "kernel-control" as const,
  };
  const config = {
    directory,
    controlPid: 20,
    rootPid: process.pid,
    host,
    pythonVersion: "fixture",
    pythonPath: "/fixture/python",
    pythonSha256: "2".repeat(64),
    sourceSha256: "3".repeat(64),
    binding,
    responseMs: 1000,
    timeoutMs: 10000,
    maxSamples: 10,
  };
  const challenge = { nonce: "4".repeat(64), observerPid: 21 };
  const arm = {
    config,
    challenge,
    response: { challenge, binding },
    hostObservation: {
      boot: host.boot,
      uid: host.uid,
      hostname: "fixture",
      hardware: { value: host.hardware, error: null },
    },
    leaderStat: `20 (control) S ${[
      process.pid,
      20,
      20,
      ...Array(15).fill(0),
      200,
    ].join(" ")}`,
    handleGeneration: "5".repeat(64),
    pidfdNumber: 7,
    events: [],
  };
  const armPin = write("arm.json", arm);
  const spawn = write("spawn.json", { pid: 21, config });
  const pipe = write("pipe.json", {
    arm: armPin,
    spawn,
    challengeRaw: JSON.stringify(challenge),
    responseRaw: JSON.stringify(arm.response),
    armRaw: JSON.stringify(arm),
  });
  const hello = { kind: "hello", binding, nonce: "6".repeat(64) };
  const reply = {
    hello,
    arm,
    peer: { pid: process.pid, uid: host.uid, gid: process.getgid!() },
  };
  write("root-arm.json", {
    arm: armPin,
    rootArmedNs,
    actualRootPid: process.pid,
    spawnedControlPid: 20,
    hello,
    reply,
    wireHello: JSON.stringify(hello),
    wireReply: JSON.stringify(reply),
    pipe,
  });
  const sample = s
    ? publish("sample.json", s.sample, s.write)
    : write("sample.json", { end: { monotonicNs: "300" } });
  const probe = s
    ? publish("probe.json", s.probe, s.write)
    : write("probe.json", {
        start: { monotonicNs: "100" },
        end: { monotonicNs: "200" },
      });
  const request = {
    kind: "poll",
    binding,
    sequence: 0,
    sampleSequence: 0,
    sample,
    probe,
    handleGeneration: arm.handleGeneration,
  };
  const response = { request, events: [] };
  const poll = {
    arm: armPin,
    request,
    response,
    requestedNs: "400",
    receivedNs: "500",
    wireRequest: JSON.stringify(request),
    wireResponse: JSON.stringify(response),
  };
  const transcript = write("poll.json", poll);
  const proof = {
    sample,
    probe,
    sampleSequence: 0,
    rootArmedNs,
    requestedNs: "400",
    receivedNs: "500",
    leaderPid: 20,
    leaderStat: arm.leaderStat,
    arm: armPin,
    transcript,
    handleGeneration: arm.handleGeneration,
  };
  return { directory, host, proof, sample, probe };
}

test(
  "post-poll binds original sample, pipe and persistent handle",
  posixFixture,
  () => {
    const f = lifetimeProofFixture("50");
    try {
      const observedLeader = lifetime.replayKernelLifetimeProof(
        f.proof,
        f.sample,
        f.probe,
        0,
        f.host,
        process.pid,
      );
      assert.equal(observedLeader?.pid, 20);
      for (const proof of [
        { ...f.proof, sampleSequence: 1 },
        { ...f.proof, handleGeneration: "0".repeat(64) },
        { ...f.proof, requestedNs: "1" },
        { ...f.proof, receivedNs: "2" },
        { ...f.proof, leaderPid: 99 },
      ])
        assert.throws(() =>
          lifetime.replayKernelLifetimeProof(
            proof,
            f.sample,
            f.probe,
            0,
            f.host,
            process.pid,
          ),
        );
    } finally {
      rmSync(f.directory, { recursive: true, force: true });
    }
  },
);

test("later arm never repairs the original prearm probe", posixFixture, () => {
  const f = lifetimeProofFixture("150");
  try {
    assert.equal(
      lifetime.replayKernelLifetimeProof(
        f.proof,
        f.sample,
        f.probe,
        0,
        f.host,
        process.pid,
      ),
      null,
    );
  } finally {
    rmSync(f.directory, { recursive: true, force: true });
  }
});

/** Actual S, from this tree or the read-only contract source a gate assigns. */
async function actualS(): Promise<typeof S> {
  const local = new URL(
    "../tools/perf/native-host-collector.ts",
    import.meta.url,
  );
  const injected = process.env.OSEO_KERNEL_ROOT_CONTRACT_SOURCE;
  assert.ok(
    existsSync(local) || injected,
    "Actual S is not integrated and no read-only contract source was assigned",
  );
  const url = existsSync(local) ? local : pathToFileURL(injected!);
  // SAFETY: offline use of the actual S parser; no source admission.
  return (await import(url.href)) as typeof S;
}

/** S's writer: whole JSON, no trailing newline, exclusive create, 0600. */
function writeSOriginal(path: string, value: SRecord): void {
  writeFileSync(path, JSON.stringify(value), { flag: "wx", mode: 0o600 });
}

/** One S clock at a fixture monotonic instant. */
function clock(ns: number): S.CollectorClock {
  return { utc: new Date(ns / 1e6).toISOString(), monotonicNs: String(ns) };
}

/** An S-format sample whose process inventory alone exceeds one frame. */
async function largeSOriginals(
  write: SOriginals["write"],
): Promise<SOriginals> {
  const api = await actualS();
  const rows = Array.from(
    { length: 900 },
    (_, index) => `${1000 + index} 1 ${1000 + index} 1000 0.0 00:00 worker`,
  );
  const inventory = api.parseCollectorProcesses(
    Buffer.from(rows.join("\n")),
    "linux-x86_64-gnu",
    4096,
  );
  assert.equal(inventory.complete, true);
  const sample = {
    start: clock(50),
    scheduled: clock(50),
    latenessMs: 0,
    end: clock(300),
    checkpoint: null,
    firstRecord: 0,
    nextRecord: 1,
    identity: {
      hardware: "fixture",
      boot: "fixture-boot",
      account: "fixture",
      uid: process.getuid!(),
    },
    inventory,
    pidChanges: [],
    counters: {},
    overhead: { before: null, after: null },
    snapshotIsNotAtomic: true,
  };
  assert.ok(Buffer.byteLength(JSON.stringify(sample)) > 65_536);
  return {
    sample,
    probe: { start: clock(100), end: clock(200) },
    write,
  };
}

test(
  "post-poll replays an unframed S sample past one frame",
  posixFixture,
  async () => {
    const f = lifetimeProofFixture("50", await largeSOriginals(writeSOriginal));
    try {
      assert.ok(f.sample.bytes > 65_536);
      assert.equal(existsSync(f.sample.path + ".part-000000"), false);
      assert.equal(
        lifetime.replayKernelLifetimeProof(
          f.proof,
          f.sample,
          f.probe,
          0,
          f.host,
          process.pid,
        )?.pid,
        20,
      );
    } finally {
      rmSync(f.directory, { recursive: true, force: true });
    }
  },
);

for (const fault of ["parts", "mode", "symlink", "tamper"] as const)
  test(
    `S sample replay keeps its original writer: ${fault}`,
    posixFixture,
    async () => {
      const write = (path: string, value: SRecord): void => {
        if (fault === "parts") writeKernelControl(path, value);
        else if (fault === "symlink" && path.endsWith("/sample.json")) {
          writeSOriginal(path + ".target", value);
          symlinkSync(path + ".target", path);
        } else writeSOriginal(path, value);
        if (fault === "mode") chmodSync(path, 0o644);
      };
      const f = lifetimeProofFixture("50", await largeSOriginals(write));
      try {
        if (fault === "tamper")
          writeFileSync(f.sample.path, "{}", { mode: 0o600 });
        assert.throws(
          () =>
            lifetime.replayKernelLifetimeProof(
              f.proof,
              f.sample,
              f.probe,
              0,
              f.host,
              process.pid,
            ),
          fault === "parts" ? /parts frame/u : assert.AssertionError,
        );
      } finally {
        rmSync(f.directory, { recursive: true, force: true });
      }
    },
  );
