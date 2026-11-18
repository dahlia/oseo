/* eslint-disable no-await-in-loop -- Protocol fault cases run serially. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, watch } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { artifact } from "../tools/perf/evidence.ts";
import type { GitHubNativeContext } from "../tools/perf/native-admission.ts";
import type { NativeControlProof } from "../tools/perf/native-phase-ipc.ts";
import { randomBytes } from "node:crypto";
import { createConnection, createServer } from "node:net";
import type { Socket } from "node:net";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import {
  encodePairMessage,
  PairReceiver,
  runPairChild,
  runPairJob,
} from "../tools/perf/mac-pair-session.ts";
import type {
  PairAdmission,
  PairBudgets,
  PairIdentity,
  PairJobOptions,
  PairMessage,
  PairObservation,
  PairSeal,
} from "../tools/perf/mac-pair-session.ts";
import { isString } from "../tools/value-kinds.ts";
import type { SessionCommand } from "../tools/perf/mac-session.ts";

const posix = { skip: process.platform === "win32" ? "POSIX child" : false };
const nonce = randomBytes(32);
const artifactDigest = "c".repeat(64);
const owner: PairIdentity = {
  session: "simulated-private-session",
  repository: "fixture/oseo",
  run: "123",
  attempt: "2",
  source: "a".repeat(40),
  tree: "b".repeat(40),
  role: "owner",
  job: "11",
  runnerId: "21",
  runnerName: "oseo-mac-1",
  account: "oseo-runner",
  uid: 501,
  hardwareUuid: "simulated-hardware",
  bootUuid: "simulated-boot",
  platform: "darwin",
  arch: "arm64",
};
const companion: PairIdentity = {
  ...owner,
  role: "companion",
  job: "12",
  runnerId: "22",
  runnerName: "oseo-mac-2",
  account: "oseo-runner2",
  uid: 502,
};
const budgets: PairBudgets = {
  heartbeatMs: 30,
  lossMs: 300,
  observationMs: 40,
  observationTimeoutMs: 200,
  barrierMs: 1000,
  finalizationMs: 1000,
  termGraceMs: 50,
  cleanupMs: 500,
};
function observed(identity: PairIdentity): PairObservation {
  return {
    identity,
    sourceClean: true,
    artifactDigest,
    setupComplete: true,
    status: "unassessed",
    raw: ["simulated/raw.json"],
    ownedProcessesDigest: "d".repeat(64),
    monitorCost: { wallMs: 1, cpuMicros: 1, rssBytes: 1, ioBytes: null },
  };
}
const admission: PairAdmission = {
  status: "accepted",
  decision: "simulated/reviewed-decision",
  nonceDelivery: "simulated/fixture-only",
  operationalWindow: "simulated/window",
  observation: "simulated/raw.json",
};
const seal: PairSeal = {
  archive: "simulated/archive.tar",
  archiveDigest: "e".repeat(64),
  upload: "simulated/download-verified",
  verified: true,
};
function message(identity = companion, sequence = 1): PairMessage {
  return {
    simulated: true,
    identity,
    sequence,
    kind: "heartbeat",
    phase: "setup",
    utc: new Date().toISOString(),
    monotonicMs: 1,
    observation: observed(identity),
    admission: null,
    seal: null,
  };
}
function command(checkout: string, code: string): SessionCommand {
  return {
    executable: process.execPath,
    argv: ["--input-type=module", "-e", code],
    cwd: checkout,
    env: {},
    stdin: new Uint8Array(),
    timeoutMs: null,
  };
}
async function port(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address !== null && !isString(address));
  await new Promise<void>((resolve, reject) =>
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    }),
  );
  return address.port;
}
async function fixture(
  run: (
    left: PairJobOptions,
    right: PairJobOptions,
    root: string,
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "oseo-mac-pair-"));
  const checkout = join(root, "checkout");
  await mkdir(checkout);
  const endpoint = { host: "127.0.0.1", port: await port() } as const;
  const options = (
    identity: PairIdentity,
    peer: PairIdentity,
  ): PairJobOptions => ({
    endpoint,
    nonce,
    identity,
    peer,
    artifactDigest,
    budgets,
    checkout,
    directory: join(root, identity.role),
    simulated: true,
    setup: [],
    driver: [],
    observe: async () => observed(identity),
    assess: async () => admission,
    finalize: async () => seal,
  });
  try {
    await run(options(owner, companion), options(companion, owner), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function pair(left: PairJobOptions, right: PairJobOptions) {
  const first = runPairJob(left);
  // A real future launcher must coordinate listener readiness under existing
  // rights. This is only a hermetic local start-order seam, not job delivery.
  await delay(50);
  return Promise.all([first, runPairJob(right)]);
}

/** A bound, authenticated peer whose lifecycle can violate local causality. */
async function scriptedPeer(
  local: PairJobOptions,
  respond: (
    kind: PairMessage["kind"] | "connected",
  ) => readonly PairMessage["kind"][],
): Promise<Awaited<ReturnType<typeof runPairJob>>> {
  let sequence = 0;
  const attach = (connection: Socket) => {
    connection.setEncoding("utf8");
    connection.on("error", () => {});
    let buffer = "";
    const sent = new Set<PairMessage["kind"]>();
    const send = (kind: PairMessage["kind"] | "connected") => {
      const replies =
        kind === "heartbeat" ? (["heartbeat"] as const) : respond(kind);
      const frames = replies
        .filter((reply) => {
          if (reply === "heartbeat") return true;
          if (sent.has(reply)) return false;
          sent.add(reply);
          return true;
        })
        .map((reply) =>
          encodePairMessage(
            {
              ...message(local.peer, ++sequence),
              kind: reply,
              admission,
              seal,
            },
            nonce,
          ),
        );
      if (frames.length > 0) connection.write(frames.join(""));
    };
    const receiver = new PairReceiver(
      local.identity,
      nonce,
      artifactDigest,
      true,
    );
    connection.on("data", (text: string) => {
      buffer += text;
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const value = receiver.receive(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        send(value.kind);
      }
    });
    send("connected");
  };
  let connection: Socket | undefined;
  const server = createServer((socket) => {
    connection = socket;
    attach(socket);
  });
  try {
    if (local.identity.role === "companion") {
      await new Promise<void>((resolve) =>
        server.listen(local.endpoint.port, local.endpoint.host, resolve),
      );
      return await runPairJob(local);
    }
    const running = runPairJob(local);
    await delay(50);
    const client = createConnection(local.endpoint);
    connection = client;
    client.once("connect", () => attach(client));
    return await running;
  } finally {
    connection?.destroy();
    server.close();
  }
}

test("premature peer lifecycle cannot skip local sends", posix, async () => {
  const cases = [
    {
      role: "owner",
      trigger: "connected",
      replies: ["ready", "admitted"],
      blocked: "admit",
    },
    {
      role: "owner",
      trigger: "admit",
      replies: ["admitted", "sealed"],
      blocked: "finished",
    },
    {
      role: "owner",
      trigger: "admit",
      replies: ["admitted", "sealed"],
      blocked: "finished",
      emptyDriver: true,
    },
    {
      role: "owner",
      trigger: "finished",
      replies: ["sealed", "released"],
      blocked: "release",
    },
    {
      role: "companion",
      trigger: "connected",
      replies: ["ready", "admit"],
      blocked: "ready",
    },
    {
      role: "companion",
      trigger: "ready",
      replies: ["admit", "finished"],
      blocked: "admitted",
    },
    {
      role: "companion",
      trigger: "admitted",
      replies: ["finished", "release"],
      blocked: "sealed",
    },
  ] as const;
  for (const item of cases) {
    await fixture(async (left, right, root) => {
      const local = item.role === "owner" ? left : right;
      let finalizations = 0;
      const result = await scriptedPeer(
        {
          ...local,
          // Keep local ready pending until the connected peer's batch arrives.
          assess: async () => {
            if (item.trigger === "connected") await delay(150);
            return admission;
          },
          driver:
            item.role === "owner" && !("emptyDriver" in item)
              ? [command(local.checkout, "process.stdout.write('driver')")]
              : [],
          finalize: async () => {
            finalizations += 1;
            return seal;
          },
        },
        (kind) => {
          if (kind === item.trigger) return item.replies;
          if (kind === "ready" && item.trigger === "connected") return [];
          if (item.role === "companion") {
            if (kind === "connected") return ["ready"];
            if (kind === "ready") return ["admit"];
            if (kind === "admitted") return ["finished"];
            if (kind === "sealed") return ["release"];
            return [];
          }
          if (kind === "ready") return ["ready"];
          if (kind === "admit") return ["admitted"];
          if (kind === "finished") return ["sealed"];
          if (kind === "release") return ["released"];
          return [];
        },
      );
      assert.equal(result.status, "failed", `${item.role}/${item.blocked}`);
      assert.match(result.failures.join(" "), /lifecycle/);
      if (item.blocked !== "release") {
        assert.equal(result.children.length, 0);
      }
      if (item.blocked !== "release") assert.equal(finalizations, 0);
      const journal = JSON.parse(
        await readFile(join(root, item.role, "journal.json"), "utf8"),
      );
      assert.ok(
        !journal.events.some(
          (event: {
            readonly direction?: string;
            readonly message?: PairMessage;
          }) =>
            event.direction === "send" && event.message?.kind === item.blocked,
        ),
      );
    });
  }
});

test("early ready survives empty and fast local phases", posix, async () => {
  for (const role of ["owner", "companion"] as const) {
    await fixture(async (left, right) => {
      const local = role === "owner" ? left : right;
      const result = await scriptedPeer(local, (kind) => {
        if (kind === "connected") return ["ready"];
        if (kind === "admit") return ["admitted"];
        if (kind === "finished") return ["sealed"];
        if (kind === "release") return ["released"];
        if (kind === "ready" && role === "companion") return ["admit"];
        if (kind === "admitted") return ["finished"];
        if (kind === "sealed") return ["release"];
        return [];
      });
      assert.equal(result.status, "completed");
    });
  }
});

test("MAC rejects wrong nonce without revealing it", () => {
  const receiver = new PairReceiver(companion, nonce, artifactDigest, true);
  assert.throws(
    () => receiver.receive(encodePairMessage(message(), randomBytes(32))),
    /Authentication/,
  );
  assert.throws(() => encodePairMessage(message(), new Uint8Array()), /nonce/);
});

test("stale session/attempt and every identity substitution fail", () => {
  const changes: Partial<PairIdentity>[] = [
    { session: "stale" },
    { attempt: "1" },
    { run: "old" },
    { source: "f".repeat(40) },
    { tree: "f".repeat(40) },
    { repository: "other/repository" },
    { role: "owner" },
    { account: "wrong" },
    { uid: 503 },
    { job: "wrong" },
    { runnerId: "wrong" },
    { runnerName: "wrong" },
    { hardwareUuid: "other" },
    { bootUuid: "restarted" },
    { platform: "linux" },
    { arch: "x64" },
  ];
  for (const change of changes) {
    const receiver = new PairReceiver(companion, nonce, artifactDigest, true);
    assert.throws(
      () =>
        receiver.receive(
          encodePairMessage(message({ ...companion, ...change }), nonce),
        ),
      /mismatch/,
    );
  }
});

test("replay, skipped sequence and changed artifact fail", () => {
  const receiver = new PairReceiver(companion, nonce, artifactDigest, true);
  const frame = encodePairMessage(message(), nonce);
  receiver.receive(frame);
  assert.throws(() => receiver.receive(frame), /sequence/);
  assert.throws(
    () => receiver.receive(encodePairMessage(message(companion, 3), nonce)),
    /sequence/,
  );
  assert.throws(
    () =>
      new PairReceiver(companion, nonce, artifactDigest, true).receive(
        encodePairMessage(
          {
            ...message(),
            observation: {
              ...observed(companion),
              artifactDigest: "f".repeat(64),
            },
          },
          nonce,
        ),
      ),
    /observation/,
  );
});

test(
  "both roles admitted before blocking driver; observations continue",
  posix,
  async () =>
    fixture(async (left, right, root) => {
      const results = await pair(
        {
          ...left,
          driver: [
            command(
              left.checkout,
              "const until = Date.now() + 350; while (Date.now() < until) {}",
            ),
          ],
        },
        right,
      );
      assert.deepEqual(
        results.map((value) => value.status),
        ["completed", "completed"],
      );
      assert.ok(
        results.every(
          (value) => value.simulated && value.nativeAcceptance === "unverified",
        ),
      );
      const journal = JSON.parse(
        await readFile(join(root, "owner", "journal.json"), "utf8"),
      );
      const admitted = journal.events.findIndex(
        (event: {
          readonly direction: string;
          readonly message?: PairMessage;
        }) =>
          event.direction === "receive" && event.message?.kind === "admitted",
      );
      assert.ok(admitted >= 0);
      assert.ok(
        journal.events
          .slice(admitted)
          .filter(
            (event: { readonly kind: string }) => event.kind === "observation",
          ).length >= 3,
      );
      assert.ok(
        journal.events.some(
          (event: { readonly message?: PairMessage }) =>
            event.message?.phase === "driver",
        ),
      );
      assert.ok(!JSON.stringify(journal).includes(nonce.toString("hex")));
    }),
);

test(
  "missing companion slot times out without launching driver",
  posix,
  async () =>
    fixture(async (left) => {
      const result = await runPairJob({
        ...left,
        driver: [command(left.checkout, "throw Error('must not launch')")],
      });
      assert.equal(result.status, "failed");
      assert.equal(result.children.length, 0);
      assert.match(result.failures.join(" "), /Connection timeout/);
    }),
);

test(
  "final setup and reviewed admission must both be ready",
  posix,
  async () => {
    for (const mode of ["setup", "delivery", "window", "unknown"]) {
      await fixture(async (left, right) => {
        const results = await pair(
          {
            ...left,
            driver: [command(left.checkout, "throw Error('must not launch')")],
          },
          {
            ...right,
            observe: async () => ({
              ...observed(companion),
              setupComplete: mode !== "setup",
            }),
            assess: async () => ({
              ...admission,
              nonceDelivery: mode === "delivery" ? "" : admission.nonceDelivery,
              operationalWindow:
                mode === "window" ? "" : admission.operationalWindow,
              status: mode === "unknown" ? "unknown" : "accepted",
            }),
          },
        );
        assert.ok(results.every((value) => value.status === "failed"));
        assert.equal(results[0]?.children.length, 0);
      });
    }
  },
);

test(
  "host/boot/source changes during blocked driver abort owned child",
  posix,
  async () => {
    for (const mode of ["boot", "source", "unknown"]) {
      await fixture(async (left, right) => {
        let count = 0;
        const results = await pair(
          {
            ...left,
            driver: [command(left.checkout, "while (true) {}")],
            observe: async () => {
              count += 1;
              const value = observed(owner);
              if (count < 7) return value;
              return mode === "unknown"
                ? { ...value, status: "unknown" }
                : {
                    ...value,
                    identity: {
                      ...owner,
                      ...(mode === "boot"
                        ? { bootUuid: "restart" }
                        : { source: "f".repeat(40) }),
                    },
                  };
            },
          },
          right,
        );
        assert.ok(results.every((value) => value.status === "failed"));
        assert.equal(results[0]?.children.length, 1);
        assert.equal(results[0]?.children[0]?.cleanup, "gone");
        assert.match(results[0]?.children[0]?.failure ?? "", /aborted/);
      });
    }
  },
);

test(
  "disconnect while driver blocks stops only launched child",
  posix,
  async () =>
    fixture(async (left, right) => {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 300);
      try {
        const results = await pair(
          { ...left, driver: [command(left.checkout, "while (true) {}")] },
          { ...right, signal: abort.signal },
        );
        assert.ok(results.every((value) => value.status === "failed"));
        assert.equal(results[0]?.children[0]?.cleanup, "gone");
      } finally {
        clearTimeout(timer);
      }
    }),
);

test(
  "observation timeout fails while driver event loop blocks",
  posix,
  async () =>
    fixture(async (left, right) => {
      let count = 0;
      const results = await pair(
        {
          ...left,
          driver: [command(left.checkout, "while (true) {}")],
          observe: async () => {
            count += 1;
            if (count > 5) return new Promise<PairObservation>(() => {});
            return observed(owner);
          },
        },
        right,
      );
      assert.ok(results.every((value) => value.status === "failed"));
      assert.match(results[0]?.failures.join(" ") ?? "", /Observation timeout/);
      assert.equal(results[0]?.children[0]?.cleanup, "gone");
    }),
);

test("both roles need final archive and upload evidence", posix, async () => {
  for (const role of ["owner", "companion"]) {
    for (const field of ["archive", "upload", "archiveDigest"]) {
      await fixture(async (left, right) => {
        const broken = async () => ({ ...seal, [field]: "" });
        const results = await pair(
          { ...left, finalize: role === "owner" ? broken : left.finalize },
          {
            ...right,
            finalize: role === "companion" ? broken : right.finalize,
          },
        );
        assert.ok(results.every((value) => value.status === "failed"));
      });
    }
  }
});

test(
  "missing native observations and non-Mac execution never accept",
  posix,
  async () =>
    fixture(async (left, right) => {
      const results = await pair(
        { ...left, observe: async () => ({ ...observed(owner), raw: [] }) },
        right,
      );
      assert.ok(results.every((value) => value.status === "failed"));
      if (process.platform !== "darwin" || process.arch !== "arm64") {
        await assert.rejects(
          runPairJob({
            ...left,
            simulated: false,
            identity: {
              ...owner,
              hardwareUuid: "12345678-1234-1234-1234-123456789abc",
              bootUuid: "12345678-1234-1234-1234-123456789def",
            },
            peer: {
              ...companion,
              hardwareUuid: "12345678-1234-1234-1234-123456789abc",
              bootUuid: "12345678-1234-1234-1234-123456789def",
            },
          }),
          /Actual darwin/,
        );
      }
      await assert.rejects(
        runPairJob({
          ...left,
          simulated: false,
          simulatedReceiptClock: () => 0,
        }),
        /Simulated clock/,
      );
      await assert.rejects(
        runPairJob({ ...left, peer: { ...companion, account: owner.account } }),
        /accounts/,
      );
      await assert.rejects(
        runPairJob({ ...left, peer: { ...companion, bootUuid: "different" } }),
        /binding/,
      );
    }),
);

test(
  "failure cleanup is bounded and unrelated child remains alive",
  posix,
  async () =>
    fixture(async (left, _right, root) => {
      const otherController = new AbortController();
      const ownController = new AbortController();
      const other = runPairChild(
        command(left.checkout, "while (true) {}"),
        join(root, "unrelated"),
        budgets,
        otherController.signal,
      );
      const own = runPairChild(
        command(
          left.checkout,
          "process.on('SIGTERM', () => {}); while (true) {}",
        ),
        join(root, "owned"),
        budgets,
        ownController.signal,
      );
      await delay(100);
      ownController.abort();
      const value = await own;
      assert.equal(value.cleanup, "gone");
      assert.equal(value.code, null);
      const alive = await Promise.race([
        other.then(() => false),
        delay(50).then(() => true),
      ]);
      assert.equal(alive, true);
      otherController.abort();
      assert.equal((await other).cleanup, "gone");
    }),
);

test(
  "heartbeat loss while target blocks fails without peer disconnect",
  posix,
  async () =>
    fixture(async (left) => {
      const running = runPairJob({
        ...left,
        driver: [command(left.checkout, "while (true) {}")],
      });
      await delay(50);
      const connection = createConnection(left.endpoint);
      let sequence = 0;
      let buffer = "";
      connection.on("error", () => {});
      connection.on("data", (bytes: Buffer) => {
        buffer += bytes.toString("utf8");
        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const envelope = JSON.parse(buffer.slice(0, newline));
          // SAFETY: The only sender is this test's authenticated supervisor.
          const value = JSON.parse(envelope.payload) as PairMessage;
          buffer = buffer.slice(newline + 1);
          if (value.kind === "ready" || value.kind === "admit") {
            connection.write(
              encodePairMessage(
                {
                  ...message(companion, ++sequence),
                  kind: value.kind === "ready" ? "ready" : "admitted",
                  admission,
                },
                nonce,
              ),
            );
          }
        }
      });
      try {
        const result = await running;
        assert.equal(result.status, "failed");
        assert.match(result.failures.join(" "), /heartbeat lost/);
        assert.equal(result.children[0]?.cleanup, "gone");
      } finally {
        connection.destroy();
      }
    }),
);

test(
  "heartbeat loss starts at connection, not time waiting for the slot",
  posix,
  async () =>
    fixture(async (left, right) => {
      const running = runPairJob(left);
      await delay(left.budgets.lossMs + 100);
      const results = await Promise.all([running, runPairJob(right)]);
      assert.ok(results.every((value) => value.status === "completed"));
    }),
);

test("simulation mode is authenticated and cannot be mixed", () => {
  for (const mode of [true, false]) {
    const receiver = new PairReceiver(companion, nonce, artifactDigest, mode);
    assert.throws(
      () =>
        receiver.receive(
          encodePairMessage(
            {
              ...message(),
              simulated: !mode,
            },
            nonce,
          ),
        ),
      /mismatch/,
    );
  }
});

test(
  "split UTF-8 frames survive and terminal release stops heartbeats",
  posix,
  async () =>
    fixture(async (left, _right, root) => {
      const running = runPairJob({
        ...left,
        budgets: {
          ...left.budgets,
          heartbeatMs: 1,
        },
      });
      await delay(50);
      const connection = createConnection(left.endpoint);
      connection.setEncoding("utf8");
      let sequence = 0;
      let buffer = "";
      const sends: Promise<void>[] = [];
      const send = async (kind: PairMessage["kind"], fragment: boolean) => {
        const wire = Buffer.from(
          encodePairMessage(
            {
              ...message(companion, ++sequence),
              kind,
              admission,
              seal,
              observation: {
                ...observed(companion),
                raw: ["simulated/문.json"],
              },
            },
            nonce,
          ),
        );
        if (fragment) {
          const split = wire.indexOf(Buffer.from("문")) + 1;
          assert.ok(split > 0);
          connection.write(wire.subarray(0, split));
          await delay(20);
          connection.write(wire.subarray(split));
        } else connection.write(wire);
      };
      connection.on("error", () => {});
      connection.on("data", (text: string) => {
        buffer += text;
        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const envelope = JSON.parse(buffer.slice(0, newline));
          // SAFETY: Only this fixture's supervisor produces these frames.
          const value = JSON.parse(envelope.payload) as PairMessage;
          buffer = buffer.slice(newline + 1);
          const response = {
            ready: "ready",
            admit: "admitted",
            finished: "sealed",
            release: "released",
          } as const;
          if (value.kind in response) {
            // SAFETY: The preceding membership check covers this closed table.
            const kind = response[value.kind as keyof typeof response];
            sends.push(send(kind, value.kind === "ready"));
          }
        }
      });
      try {
        const result = await running;
        await Promise.all(sends);
        assert.equal(result.status, "completed");
        const journal = await readFile(
          join(root, "owner", "journal.json"),
          "utf8",
        );
        assert.ok(journal.includes("simulated/문.json"));
        assert.ok(!journal.includes("\uFFFD"));
      } finally {
        connection.destroy();
      }
    }),
);

test(
  "delayed admission never publishes newer rejected observations as accepted",
  posix,
  async () =>
    fixture(async (left, right, root) => {
      let newer = false;
      let first = true;
      const results = await pair(
        {
          ...left,
          budgets: { ...left.budgets, observationTimeoutMs: 500, lossMs: 600 },
          driver: [command(left.checkout, "while (true) {}")],
          observe: async () => ({
            ...observed(owner),
            raw: [
              newer ? "simulated/rejected-load" : "simulated/accepted-load",
            ],
          }),
          assess: async (value) => {
            if (first) {
              first = false;
              await delay(50);
              newer = true;
              await delay(100);
              return admission;
            }
            if (value.raw[0] === "simulated/rejected-load") {
              await delay(100);
              return { ...admission, status: "rejected" };
            }
            return admission;
          },
        },
        right,
      );
      assert.ok(results.every((value) => value.status === "failed"));
      assert.equal(results[0]?.children.length, 0);
      const journal = JSON.parse(
        await readFile(join(root, "owner", "journal.json"), "utf8"),
      );
      assert.ok(
        !journal.events.some(
          (event: {
            readonly direction?: string;
            readonly message?: PairMessage;
          }) =>
            event.direction === "send" &&
            event.message?.observation.raw[0] === "simulated/rejected-load",
        ),
      );
    }),
);

test(
  "late authenticated frame cannot erase heartbeat loss between ticks",
  posix,
  async () =>
    fixture(async (left, _right, root) => {
      let clock = 0;
      let beats = 0;
      let sequence = 0;
      const abort = new AbortController();
      const fallback = setTimeout(() => abort.abort(), 2000);
      const running = runPairJob({
        ...left,
        budgets: { ...left.budgets, heartbeatMs: 100, lossMs: 250 },
        simulatedReceiptClock: () => clock,
        signal: abort.signal,
        driver: [command(left.checkout, "while (true) {}")],
      });
      await delay(50);
      const connection = createConnection(left.endpoint);
      connection.setEncoding("utf8");
      let buffer = "";
      let late: ReturnType<typeof setTimeout> | undefined;
      const send = (kind: PairMessage["kind"]) =>
        connection.write(
          encodePairMessage(
            { ...message(companion, ++sequence), kind, admission, seal },
            nonce,
          ),
        );
      connection.on("error", () => {});
      connection.on("data", (text: string) => {
        buffer += text;
        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const envelope = JSON.parse(buffer.slice(0, newline));
          // SAFETY: This fixture's supervisor is the only frame producer.
          const value = JSON.parse(envelope.payload) as PairMessage;
          buffer = buffer.slice(newline + 1);
          if (value.kind === "ready") send("ready");
          if (value.kind === "admit") send("admitted");
          if (value.kind === "heartbeat") {
            beats += 1;
            if (beats < 3) clock = beats * 100;
            if (beats === 3)
              late = setTimeout(() => {
                clock = 275;
                send("heartbeat");
              }, 20);
          }
        }
      });
      try {
        const result = await running;
        assert.equal(result.status, "failed");
        assert.match(
          result.failures.join(" "),
          /heartbeat lost before renewal/,
        );
        assert.equal(result.children[0]?.cleanup, "gone");
        const journal = JSON.parse(
          await readFile(join(root, "owner", "journal.json"), "utf8"),
        );
        assert.ok(
          journal.events.some(
            (event: {
              readonly direction?: string;
              readonly message?: PairMessage;
            }) =>
              event.direction === "receive" &&
              event.message?.sequence === 3 &&
              event.message.kind === "heartbeat",
          ),
        );
      } finally {
        clearTimeout(fallback);
        clearTimeout(late);
        connection.destroy();
      }
    }),
);

test("setup observation in flight is not final admission", posix, async () =>
  fixture(async (left, right, root) => {
    const marker = join(root, "setup-done");
    let calls = 0;
    const assessed: boolean[] = [];
    const results = await pair(
      {
        ...left,
        budgets: { ...left.budgets, observationTimeoutMs: 600 },
        setup: [
          command(
            left.checkout,
            "import fs from 'node:fs';" +
              "setTimeout(() => fs.writeFileSync(" +
              `${JSON.stringify(marker)},'done'),150)`,
          ),
        ],
        driver: [command(left.checkout, "process.stdout.write('driver')")],
        observe: async () => {
          calls += 1;
          const complete = await readFile(marker).then(
            () => true,
            () => false,
          );
          if (calls === 2) await delay(300);
          return { ...observed(owner), setupComplete: complete };
        },
        assess: async (value) => {
          assessed.push(value.setupComplete);
          return {
            ...admission,
            status: value.setupComplete ? "accepted" : "rejected",
          };
        },
      },
      right,
    );
    assert.ok(results.every((value) => value.status === "completed"));
    assert.ok(assessed.length > 0 && assessed.every(Boolean));
    assert.equal(results[0]?.children.length, 2);
  }),
);

test(
  "optional phase pipe preserves beforeLaunch refusal and original stdin",
  posix,
  async () =>
    fixture(async (left, _right, root) => {
      let handled = false;
      const output = join(root, "refused-control");
      const options = {
        context: {
          session: owner.session,
          repository: owner.repository,
          run: owner.run,
          attempt: owner.attempt,
          comparisonRunId: "fixture",
          commit: owner.source,
          tree: owner.tree,
          manifest: {
            path: join(root, "fixture.json"),
            bytes: 1,
            sha256: artifactDigest,
          },
          jobs: [owner],
          accounts: [owner.runnerName],
        },
        responseMs: budgets.barrierMs,
        handle: async () => {
          handled = true;
          throw new Error("unexpected callback");
        },
      };
      const input = {
        ...command(left.checkout, "process.stdout.write('launched')"),
        stdin: new Uint8Array([255, 0, 128]),
      };
      await assert.rejects(
        runPairChild(
          input,
          output,
          budgets,
          new AbortController().signal,
          async () => {
            throw new Error("admission refused before launch");
          },
          options,
        ),
        /admission refused/u,
      );
      assert.equal(handled, false);
      assert.deepEqual(
        await readFile(join(output, "stdin.bin")),
        Buffer.from([255, 0, 128]),
      );
      assert.equal((await readFile(join(output, "stdout.bin"))).length, 0);
      await assert.rejects(readFile(join(output, "launch.json")), /ENOENT/u);
    }),
);

test(
  "optional phase pipe rejects a non-Node command without launching it",
  posix,
  async () =>
    fixture(async (left, _right, root) => {
      const options = {
        context: {
          session: owner.session,
          repository: owner.repository,
          run: owner.run,
          attempt: owner.attempt,
          comparisonRunId: "fixture",
          commit: owner.source,
          tree: owner.tree,
          manifest: {
            path: join(root, "fixture.json"),
            bytes: 1,
            sha256: artifactDigest,
          },
          jobs: [owner],
          accounts: [owner.runnerName],
        },
        responseMs: budgets.barrierMs,
        handle: async () => {
          throw new Error("must not run");
        },
      };
      await assert.rejects(
        runPairChild(
          { ...command(left.checkout, ""), executable: "/bin/sh" },
          join(root, "non-node"),
          budgets,
          new AbortController().signal,
          undefined,
          options,
        ),
        /reviewed Node/u,
      );
      await assert.rejects(
        readFile(join(root, "non-node/launch.json")),
        /ENOENT/u,
      );
    }),
);

const escapedSupervisor = `
import ctypes, json, os, signal, subprocess, sys
from pathlib import Path
libc = ctypes.CDLL(None, use_errno=True)
if libc.prctl(36, 1, 0, 0, 0) != 0:
    raise OSError(ctypes.get_errno(), 'PR_SET_CHILD_SUBREAPER')
receipt = {'subreaper': os.getpid(), 'reaped': []}
code = 1
try:
    child = subprocess.Popen(sys.argv[2:], start_new_session=True)
    receipt['runner'] = child.pid
    def reap_owned(signum, frame):
        children = Path('/proc/self/task/' + str(os.getpid()) + '/children')
        for pid in [int(value) for value in children.read_text().split()]:
            if pid == child.pid:
                continue
            reaped, status = os.waitpid(pid, os.WNOHANG)
            if reaped:
                receipt['reaped'].append({'pid': reaped, 'status': status})
    if os.environ.get('OSEO_PAIR_FD3_TOY', '').startswith('owned-'):
        signal.signal(signal.SIGCHLD, reap_owned)
    try:
        code = child.wait(timeout=12)
    except subprocess.TimeoutExpired:
        receipt['timeout'] = True
        child.kill()
        child.wait()
finally:
    # Only direct children adopted by this private subreaper may be killed.
    children = Path('/proc/self/task/' + str(os.getpid()) + '/children')
    for generation in range(4):
        owned = [int(pid) for pid in children.read_text().split()]
        if not owned:
            break
        for pid in owned:
            os.waitid(os.P_PID, pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)
            os.kill(pid, signal.SIGKILL)
            reaped, status = os.waitpid(pid, 0)
            receipt['reaped'].append({'pid': reaped, 'status': status})
    receipt['remaining'] = children.read_text().split()
    Path(sys.argv[1]).write_text(json.dumps(receipt))
if receipt['remaining']:
    code = 1
sys.exit(code)
`;

for (const mode of [
  "closed",
  "escaped-zero",
  "escaped-error",
  "escaped-signal",
  "escaped-late-stop",
  "owned-zero",
  "owned-error",
  "owned-signal",
  "owned-resistant",
  "owned-late-close",
] as const) {
  const name = `pair terminal fd3 ${mode} preserves exit and bounded cleanup`;
  test(
    name,
    mode === "closed"
      ? posix
      : {
          skip:
            process.platform === "linux" && !("Deno" in globalThis)
              ? false
              : "requires Linux private subreaper for escaped toy",
        },
    async () => {
      if (mode !== "closed" && process.env.OSEO_PAIR_FD3_TOY !== mode) {
        const root = await mkdtemp(join(tmpdir(), "oseo-pair-supervisor-"));
        try {
          const env: NodeJS.ProcessEnv = {
            ...process.env,
            OSEO_PAIR_FD3_TOY: mode,
          };
          delete env.NODE_TEST_CONTEXT;
          const child = spawnSync(
            "python3",
            [
              "-c",
              escapedSupervisor,
              join(root, "cleanup.json"),
              process.execPath,
              "--test",
              "--test-isolation=none",
              "--test-reporter=tap",
              "--test-name-pattern",
              "^" + name + "$",
              fileURLToPath(import.meta.url),
            ],
            { env, encoding: "utf8" },
          );
          const receipt = JSON.parse(
            await readFile(join(root, "cleanup.json"), "utf8"),
          );
          console.log(JSON.stringify({ mode, ...receipt }));
          console.log(child.stdout);
          console.log(child.stderr);
          assert.deepEqual(receipt.remaining, []);
          assert.equal(receipt.timeout, undefined);
          assert.equal(receipt.reaped.length, 1);
          assert.equal(
            receipt.reaped[0].status,
            mode.startsWith("owned-")
              ? mode === "owned-resistant" || mode === "owned-late-close"
                ? 9
                : 15
              : 9,
          );
          assert.equal(child.status, 0);
        } finally {
          const retain = process.env.OSEO_PAIR_TEST_EVIDENCE;
          if (retain !== undefined)
            cpSync(root, join(retain, "supervisor-" + mode), {
              recursive: true,
            });
          await rm(root, { recursive: true, force: true });
        }
        return;
      }
      await fixture(async (left, _right, root) => {
        const manifest = join(root, "built.json");
        const raw = join(root, "raw.bin");
        await writeFile(manifest, "fixture without workload");
        await writeFile(raw, Buffer.from([0, 255, 128]));
        const context: GitHubNativeContext = {
          schema: 1,
          origin: "github",
          session: owner.session,
          repository: owner.repository,
          run: owner.run,
          attempt: owner.attempt,
          comparisonRunId: "fixture-comparison",
          commit: owner.source,
          tree: owner.tree,
          manifest: artifact(manifest),
          accounts: [owner.runnerName],
          jobs: [
            {
              ...owner,
              uid: process.getuid!(),
              platform: "linux",
              arch: "x64",
              hardwareUuid: "11111111-1111-1111-1111-111111111111",
              bootUuid: "22222222-2222-2222-2222-222222222222",
            },
          ],
        };
        const request = {
          id: "diagnosis",
          phase: "diagnosis",
          runId: context.comparisonRunId,
          manifest: context.manifest,
          destination: join(root, "request"),
          source: {
            tree: context.tree,
            host: {
              target: "linux-x86_64-gnu",
              os: "linux fixture",
              architecture: "x64",
              cpu: "fixture",
              logicalCpus: 1,
              memoryBytes: 1,
              commit: context.commit,
              dirty: false,
              node: "fixture-node",
              deno: "fixture-deno",
              bun: "fixture-bun",
              zig: "fixture-zig",
              postject: "fixture-postject",
              pinsSha256: "c".repeat(64),
              lockSha256: "d".repeat(64),
            },
          },
        };
        const moduleUrl = new URL(
          "../tools/perf/native-phase-ipc.ts",
          import.meta.url,
        ).href;
        const source = `
import { Socket } from 'node:net';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { createPhaseControlClient, nativeControlPhases }
  from ${JSON.stringify(moduleUrl)};
const context=${JSON.stringify(context)};
const request=${JSON.stringify(request)};
const stream=new Socket({fd:3,readable:true,writable:true});
const client=createPhaseControlClient(stream,{
  context,responseMs:1000,signal:new AbortController().signal,
  directory:${JSON.stringify(join(root, "child-control"))}
});
let opening;
for (const phase of nativeControlPhases) {
  const close=phase.endsWith('-close');
  const req=close?opening:{...request,id:'id-'+phase,phase};
  if (phase.endsWith('-exclusion')) opening=req;
  await client.request({phase,request:req,
    bounds:close?{startedMs:1050,finishedMs:1150}:null});
}
if (${JSON.stringify(mode)} !== 'closed') {
  const mode=${JSON.stringify(mode)};
  const resistant=mode==='owned-resistant'||mode==='owned-late-close';
  const toySource=\`
    import { closeSync, writeFileSync } from 'node:fs';
    if (\${resistant}) process.on('SIGTERM',()=>{});
    if (\${mode==='owned-late-close'})
      setTimeout(()=>closeSync(3),
        ${budgets.cleanupMs - budgets.termGraceMs / 2});
    writeFileSync(${JSON.stringify(join(root, "toy.ready"))},'ready');
    setInterval(()=>{},1000);
  \`;
  const toy=spawn(process.execPath,['--input-type=module','-e',toySource],{
    detached:!mode.startsWith('owned-'),env:{},
    stdio:['ignore','ignore','ignore',3]
  });
  await new Promise((resolve,reject)=>{
    toy.once('spawn',resolve);toy.once('error',reject);
  });
  while (!existsSync(${JSON.stringify(join(root, "toy.ready"))}))
    await delay(5);
  writeFileSync(${JSON.stringify(join(root, "toy.pid"))},String(toy.pid));
  toy.unref();
}
client.dispose();
writeFileSync(${JSON.stringify(join(root, "leader.exit"))},'exit');
if (${JSON.stringify(mode.endsWith("signal"))})
  process.kill(process.pid,'SIGTERM');
else process.exit(${mode.endsWith("error") ? 7 : 0});
`;
        const controller = new AbortController();
        let watchdog: ReturnType<typeof setTimeout> | undefined;
        let expired = false;
        const phases: string[] = [];
        let abortAt: number | undefined;
        let stopTimer: ReturnType<typeof setTimeout> | undefined;
        const watcher =
          mode === "escaped-late-stop"
            ? watch(root, (_event, filename) => {
                if (filename !== "leader.exit" || stopTimer !== undefined)
                  return;
                stopTimer = setTimeout(
                  () => {
                    abortAt = performance.now();
                    controller.abort();
                  },
                  budgets.cleanupMs - budgets.termGraceMs / 2,
                );
              })
            : undefined;
        try {
          const result = await runPairChild(
            command(left.checkout, source),
            join(root, "fd3"),
            budgets,
            controller.signal,
            undefined,
            {
              context,
              responseMs: 1000,
              handle: async (control): Promise<NativeControlProof> => {
                phases.push(control.phase);
                if (control.phase === "finalize")
                  watchdog = setTimeout(() => {
                    expired = true;
                    controller.abort();
                  }, 4000);
                const base = {
                  requestId: control.request.id,
                  status: "complete" as const,
                  raw: [artifact(raw)],
                };
                if (control.phase.endsWith("-admission"))
                  return {
                    ...base,
                    authority: "Root",
                    purpose: control.phase.startsWith("profile")
                      ? "profile"
                      : "timing",
                  };
                if (!control.phase.includes("-exclusion")) return base;
                const shared = {
                  ...base,
                  physicalHost: context.jobs[0]!.hardwareUuid,
                  accounts: context.accounts,
                  startedMs: 1000,
                };
                return control.bounds === null
                  ? { ...shared, state: "monitoring" }
                  : { ...shared, finishedMs: 1200, coverage: "whole-window" };
              },
            },
          );
          if (mode === "escaped-late-stop") {
            assert.notEqual(abortAt, undefined);
            const elapsed = performance.now() - abortAt!;
            assert.ok(elapsed >= budgets.cleanupMs - 20, String(elapsed));
            assert.ok(elapsed < budgets.cleanupMs + 250, String(elapsed));
            assert.equal(result.failure, "Child aborted.");
          }
          console.log(JSON.stringify({ mode, expired, phases, result }));
          assert.equal(expired, false, "fd3 close exceeded cleanup bound");
          assert.equal(
            result.code,
            mode.endsWith("signal") ? null : mode.endsWith("error") ? 7 : 0,
          );
          assert.equal(
            result.signal,
            mode.endsWith("signal") ? "SIGTERM" : null,
          );
          assert.equal(phases.length, 8);
          assert.equal(result.cleanup, "gone");
          assert.equal(result.failure === null, mode === "closed");
          if (mode.startsWith("owned-")) {
            const toy = Number(await readFile(join(root, "toy.pid"), "utf8"));
            assert.throws(() => process.kill(toy, 0), /ESRCH/u);
            assert.equal(result.failure, "Child left descendants.");
          } else if (mode !== "closed") {
            const toy = Number(await readFile(join(root, "toy.pid"), "utf8"));
            process.kill(toy, 0);
            const stat = await readFile(`/proc/${toy}/stat`, "utf8");
            const fields = stat.slice(stat.lastIndexOf(") ") + 2).split(" ");
            const group = Number(fields[2]);
            assert.equal(group, toy);
            assert.notEqual(group, result.pid);
            console.log(JSON.stringify({ mode, toy, group, product: result }));
          }
        } finally {
          watcher?.close();
          clearTimeout(stopTimer);
          clearTimeout(watchdog);
          const retain = process.env.OSEO_PAIR_TEST_EVIDENCE;
          if (retain !== undefined)
            cpSync(root, join(retain, mode), { recursive: true });
        }
      });
    },
  );
}

test("workflow isolates discovery from pending semantic runs", async () => {
  const workflow = parse(
    await readFile(
      new URL("../.github/workflows/native-optimized.yaml", import.meta.url),
      "utf8",
    ),
  );
  // Keep an exact expression so missing and false cannot acquire new groups.
  const expression =
    "optimized-native-${{ github.ref }}-" +
    "${{ inputs.mac_discovery == true && 'discovery' || 'semantic' }}";
  assert.equal(workflow.concurrency.group.replace(/\s+/gu, " "), expression);
  const group = (input?: boolean) =>
    expression
      .replace("${{ github.ref }}", "refs/heads/fixture")
      .replace(
        "${{ inputs.mac_discovery == true && 'discovery' || 'semantic' }}",
        input === true ? "discovery" : "semantic",
      );
  assert.equal(group(), group(false));
  assert.notEqual(group(true), group(false));
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
});
