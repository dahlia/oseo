/* eslint-disable no-await-in-loop -- The fixture follows the control order. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { basename, join } from "node:path";
import { duplexPair } from "node:stream";
import { test } from "node:test";
import { artifact } from "../tools/perf/evidence.ts";
import { runPairChild } from "../tools/perf/mac-pair-session.ts";
import type { GitHubNativeContext } from "../tools/perf/native-admission.ts";
import {
  createPhaseControlClient,
  nativeControlPhases,
} from "../tools/perf/native-phase-ipc.ts";
import type {
  NativeControl,
  NativeControlProof,
} from "../tools/perf/native-phase-ipc.ts";
import type { ComparisonRequest } from "../tools/perf/ordered-comparison.ts";

const posix = {
  skip:
    process.platform === "win32" || "Deno" in globalThis
      ? "requires POSIX Node.js owned group/fd3"
      : false,
};
const moduleUrl = new URL("../tools/perf/native-phase-ipc.ts", import.meta.url)
  .href;
const budgets = {
  heartbeatMs: 30,
  lossMs: 300,
  observationMs: 40,
  observationTimeoutMs: 200,
  barrierMs: 1000,
  finalizationMs: 1000,
  termGraceMs: 50,
  cleanupMs: 500,
};

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "oseo-phase-ipc-"));
  const manifestPath = join(directory, "built.json");
  const rawPath = join(directory, "collector.bin");
  writeFileSync(manifestPath, "fixture without workload");
  writeFileSync(rawPath, Buffer.from([0, 0xff, 0x80, 13, 10]));
  const context: GitHubNativeContext = {
    schema: 1,
    origin: "github",
    session: "fixture-session",
    repository: "fixture/oseo",
    run: "123",
    attempt: "2",
    comparisonRunId: "fixture-comparison",
    commit: "a".repeat(40),
    tree: "b".repeat(40),
    manifest: artifact(manifestPath),
    accounts: ["logical-fixture-slot"],
    jobs: [
      {
        session: "fixture-session",
        repository: "fixture/oseo",
        run: "123",
        attempt: "2",
        source: "a".repeat(40),
        tree: "b".repeat(40),
        role: "owner",
        job: "11",
        runnerId: "21",
        runnerName: "fixture-linux",
        account: "fixture-account",
        uid: Math.max(0, userInfo().uid),
        hardwareUuid: "11111111-1111-1111-1111-111111111111",
        bootUuid: "22222222-2222-2222-2222-222222222222",
        platform: "linux",
        arch: "x64",
      },
    ],
  };
  const request: ComparisonRequest = {
    id: "fixture-diagnosis",
    phase: "diagnosis",
    runId: context.comparisonRunId,
    manifest: context.manifest,
    destination: join(directory, "request"),
    source: {
      tree: context.tree,
      host: {
        target: "linux-x86_64-gnu",
        os: "linux fixture",
        architecture: "x64",
        cpu: "fixture CPU",
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
  const control: NativeControl = { phase: "diagnosis", request, bounds: null };
  const proof = (input: NativeControl): NativeControlProof => {
    const base = {
      requestId: input.request.id,
      status: "complete" as const,
      raw: [artifact(rawPath)],
    };
    if (input.phase.endsWith("-admission"))
      return {
        ...base,
        authority: "Root",
        purpose: input.phase.startsWith("profile") ? "profile" : "timing",
      };
    if (input.phase.includes("-exclusion")) {
      const shared = {
        ...base,
        physicalHost: context.jobs[0]!.hardwareUuid,
        accounts: context.accounts,
        startedMs: 1000,
      };
      return input.bounds === null
        ? { ...shared, state: "monitoring" }
        : {
            ...shared,
            finishedMs: 1200,
            coverage: "whole-window",
          };
    }
    return base;
  };
  const run = async (
    body: string,
    handle: (
      input: NativeControl,
      signal: AbortSignal,
    ) => Promise<NativeControlProof> = async (input) => proof(input),
    signal = new AbortController().signal,
    responseMs = 1000,
  ) =>
    runPairChild(
      {
        executable: process.execPath,
        argv: [
          "--input-type=module",
          "-e",
          `
        import { Socket } from 'node:net';
        import { createPhaseControlClient, nativeControlPhases }
          from ${JSON.stringify(moduleUrl)};
        const context = ${JSON.stringify(context)};
        const request = ${JSON.stringify(request)};
        const control = ${JSON.stringify(control)};
        const stream = new Socket({fd: 3, readable: true, writable: true});
        const client = createPhaseControlClient(stream, {
          context, responseMs: 1000, signal: new AbortController().signal,
          directory: ${JSON.stringify(join(directory, "child-control"))}
        });
        ${body}
      `,
        ],
        cwd: directory,
        env: {},
        stdin: new Uint8Array([0, 255]),
        timeoutMs: null,
      },
      join(directory, "child"),
      budgets,
      signal,
      undefined,
      { context, responseMs, handle },
    );
  return {
    directory,
    context,
    request,
    control,
    proof,
    run,
    clean: () => {
      const retain = process.env.OSEO_PHASE_IPC_TEST_EVIDENCE;
      if (retain !== undefined) {
        mkdirSync(retain, { recursive: true });
        cpSync(directory, join(retain, basename(directory)), {
          recursive: true,
        });
      }
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
const successfulChild = `
  let opening;
  for (const phase of nativeControlPhases) {
    const close = phase.endsWith('-close');
    const req = close ? opening : {...request, id: 'id-' + phase, phase};
    if (phase.endsWith('-exclusion')) opening = req;
    await client.request({phase, request: req,
      bounds: close ? {startedMs: 1050, finishedMs: 1150} : null});
    if (phase === 'profile-exclusion') {
      process.stdout.write(Buffer.from([0, 255, 128, 13, 10]));
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 180);
    }
  }
  client.dispose();
`;

test(
  "owned Node controls keep parent heartbeat live during blocked child",
  posix,
  async () => {
    const f = fixture();
    let ticks = 0;
    let before = 0;
    let after = 0;
    const heartbeat = setInterval(() => ticks++, 10);
    try {
      const phases: string[] = [];
      const result = await f.run(successfulChild, async (control) => {
        phases.push(control.phase);
        if (control.phase === "profile-exclusion") before = ticks;
        if (control.phase === "profile-exclusion-close") after = ticks;
        return f.proof(control);
      });
      assert.equal(
        result.failure,
        null,
        JSON.stringify({
          phases,
          stderr: readFileSync(join(f.directory, "child/stderr.bin"), "utf8"),
          result,
        }),
      );
      assert.equal(result.cleanup, "gone");
      assert.equal(result.code, 0);
      assert.equal(result.uid, userInfo().uid);
      assert.ok(result.pid != null);
      assert.ok(
        after - before >= 5,
        "parent heartbeat continued during Atomics.wait",
      );
      assert.deepEqual(phases, nativeControlPhases);
      assert.deepEqual(
        readFileSync(join(f.directory, "child/stdout.bin")),
        Buffer.from([0, 255, 128, 13, 10]),
      );
      assert.deepEqual(
        readFileSync(join(f.directory, "child/stdin.bin")),
        Buffer.from([0, 255]),
      );
      assert.ok(
        readFileSync(join(f.directory, "child/control/received.bin")).length >
          0,
      );
      assert.throws(() => process.kill(result.pid!, 0), /ESRCH/u);
    } finally {
      clearInterval(heartbeat);
      f.clean();
    }
  },
);

for (const fault of [
  "callback",
  "timeout",
  "exit",
  "early-success-exit",
  "nonzero-after-controls",
  "disconnect",
  "abort",
  "invalid-proof",
  "partial-frame",
  "oversize",
  "wrong-role",
  "replay",
  "unknown-phase",
  "wrong-binding",
] as const) {
  test(
    `owned phase control rejects ${fault} and cleans only its child`,
    posix,
    async () => {
      const f = fixture();
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let calls = 0;
      const wireFault = [
        "oversize",
        "wrong-role",
        "replay",
        "unknown-phase",
        "wrong-binding",
        "partial-frame",
      ].includes(fault);
      const body = wireFault
        ? `
      import { createHash } from 'node:crypto';
      const frame = {schema: 1, role: 'ordered-child', sequence: 1,
        binding: createHash('sha256')
          .update(JSON.stringify(context)).digest('hex'),
        control, proof: null};
      if (${JSON.stringify(fault)} === 'wrong-role') frame.role = 'pair-parent';
      if (${JSON.stringify(fault)} === 'wrong-binding') frame.binding = 'wrong';
      if (${JSON.stringify(fault)} === 'unknown-phase') {
        frame.control.phase = 'exec';
      }
      const bytes = Buffer.from(JSON.stringify(frame));
      const packet = Buffer.alloc(bytes.length + 4);
      packet.writeUInt32BE(bytes.length); bytes.copy(packet, 4);
      if (${JSON.stringify(fault)} === 'oversize') packet.writeUInt32BE(65537);
      if (${JSON.stringify(fault)} === 'partial-frame') {
        stream.end(packet.subarray(0, 8));
      } else {
        stream.write(packet);
        if (${JSON.stringify(fault)} === 'replay') stream.write(packet);
      }
      setInterval(() => {}, 1000);
    `
        : fault === "nonzero-after-controls"
          ? successfulChild + "process.exit(7);"
          : fault === "early-success-exit"
            ? "await client.request(control); client.dispose();"
            : fault === "exit"
              ? "process.exit(7);"
              : fault === "disconnect"
                ? "stream.destroy(); setInterval(() => {}, 1000);"
                : "await client.request(control);" +
                  "throw new Error('later phase ran');";
      try {
        const result = await f.run(
          body,
          async (control, signal) => {
            calls++;
            if (fault === "callback")
              throw new Error("private credential detail");
            if (fault === "timeout" || fault === "abort") {
              if (fault === "abort")
                timer = setTimeout(() => controller.abort(), 20);
              return await new Promise<NativeControlProof>(
                (_resolve, reject) => {
                  signal.addEventListener(
                    "abort",
                    () => reject(new Error("aborted")),
                    { once: true },
                  );
                },
              );
            }
            if (fault === "invalid-proof")
              return { ...f.proof(control), requestId: "different-origin" };
            return f.proof(control);
          },
          controller.signal,
          150,
        );
        assert.notEqual(result.failure, null);
        assert.equal(result.cleanup, "gone");
        assert.ok(calls <= (fault === "nonzero-after-controls" ? 8 : 1));
        if (fault === "nonzero-after-controls") {
          assert.equal(calls, 8);
          assert.equal(result.code, 7);
        }
        if (["callback", "timeout", "abort", "invalid-proof"].includes(fault)) {
          assert.ok(
            readFileSync(join(f.directory, "child/control/received.bin"))
              .length > 4,
          );
        }
        assert.doesNotMatch(JSON.stringify(result), /credential detail/u);
        assert.doesNotMatch(
          readFileSync(join(f.directory, "child/stderr.bin"), "utf8"),
          /later phase ran/u,
        );
        if (result.pid != null) {
          assert.throws(() => process.kill(result.pid!, 0), /ESRCH/u);
        }
      } finally {
        clearTimeout(timer);
        f.clean();
      }
    },
  );
}

function packet(
  f: ReturnType<typeof fixture>,
  changes: Partial<{
    readonly sequence: number;
    readonly binding: string;
    readonly proof: NativeControlProof & { readonly accepted?: boolean };
  }>,
): Buffer {
  const text = Buffer.from(
    JSON.stringify({
      schema: 1,
      role: "pair-parent",
      binding: createHash("sha256")
        .update(JSON.stringify(f.context))
        .digest("hex"),
      sequence: 1,
      control: f.control,
      proof: f.proof(f.control),
      ...changes,
    }),
  );
  const result = Buffer.alloc(text.length + 4);
  result.writeUInt32BE(text.length);
  text.copy(result, 4);
  return result;
}

for (const fault of [
  "unsolicited",
  "duplicate",
  "stale",
  "no-response",
  "fragmented",
  "wrong-context",
  "unknown-proof-field",
  "aborted",
] as const) {
  test(`phase client handles ${fault} replies`, async () => {
    const f = fixture();
    const [clientStream, parentStream] = duplexPair();
    const controller = new AbortController();
    const client = createPhaseControlClient(clientStream, {
      context: f.context,
      responseMs: 100,
      signal: controller.signal,
      directory: join(f.directory, "client"),
    });
    try {
      if (fault === "unsolicited") {
        parentStream.write(packet(f, {}));
        await new Promise<void>((resolve) => setImmediate(resolve));
        await assert.rejects(client.request(f.control));
      } else {
        const pending = client.request(f.control);
        if (fault === "aborted") controller.abort();
        else if (fault !== "no-response") {
          const data = packet(
            f,
            fault === "stale"
              ? { sequence: 2 }
              : fault === "wrong-context"
                ? { binding: "other-context" }
                : fault === "unknown-proof-field"
                  ? { proof: { ...f.proof(f.control), accepted: true } }
                  : {},
          );
          if (fault === "fragmented") {
            for (const byte of data) parentStream.write(Buffer.from([byte]));
          } else parentStream.write(data);
          if (fault === "duplicate") parentStream.write(data);
        }
        if (fault === "fragmented") {
          await pending;
        } else if (fault === "duplicate") {
          await assert.rejects(pending);
          await new Promise<void>((resolve) => setImmediate(resolve));
          await assert.rejects(
            client.request({
              ...f.control,
              phase: "profile-admission",
              request: {
                ...f.request,
                id: "profile",
                phase: "profile-admission",
              },
            }),
          );
        } else await assert.rejects(pending);
      }
    } finally {
      client.dispose();
      parentStream.destroy();
      f.clean();
    }
  });
}

test("phase client sends no out-of-order control bytes", async () => {
  const f = fixture();
  const [clientStream, parentStream] = duplexPair();
  const client = createPhaseControlClient(clientStream, {
    context: f.context,
    responseMs: 100,
    signal: new AbortController().signal,
    directory: join(f.directory, "client"),
  });
  try {
    await assert.rejects(
      client.request({
        ...f.control,
        phase: "timing-admission",
        request: { ...f.request, id: "timing", phase: "timing-admission" },
      }),
    );
    assert.equal(parentStream.readableLength, 0);
  } finally {
    client.dispose();
    parentStream.destroy();
    f.clean();
  }
});

test("phase wire rejects a local parent role on the GitHub route", async () => {
  const f = fixture();
  const [clientStream, parentStream] = duplexPair();
  const client = createPhaseControlClient(clientStream, {
    context: f.context,
    responseMs: 100,
    signal: new AbortController().signal,
    directory: join(f.directory, "client"),
  });
  try {
    const pending = client.request(f.control);
    const original = packet(f, {});
    const text = original
      .subarray(4)
      .toString()
      .replace("pair-parent", "local-parent");
    const data = Buffer.alloc(Buffer.byteLength(text) + 4);
    data.writeUInt32BE(Buffer.byteLength(text));
    data.write(text, 4);
    parentStream.write(data);
    await assert.rejects(pending);
  } finally {
    client.dispose();
    parentStream.destroy();
    f.clean();
  }
});

for (const prefix of [0, 1, 2, 4, 5]) {
  test(
    `owned early finalize after ${prefix} controls remains failed`,
    posix,
    async () => {
      const f = fixture();
      const phases: string[] = [];
      try {
        const body = successfulChild.replace(
          "for (const phase of nativeControlPhases)",
          `for (const phase of [...nativeControlPhases.slice(0, ${prefix}),
            'finalize'])`,
        );
        const result = await f.run(body, async (control) => {
          phases.push(control.phase);
          return f.proof(control);
        });
        writeFileSync(
          join(f.directory, "early-result.json"),
          JSON.stringify({ result, phases }),
        );
        assert.deepEqual(phases, [
          ...nativeControlPhases.slice(0, prefix),
          "finalize",
        ]);
        assert.equal(phases.filter((phase) => phase === "finalize").length, 1);
        assert.equal(result.code, 0);
        assert.equal(result.failure, "Phase control finalized early.");
        assert.equal(result.cleanup, "gone");
        assert.ok(result.pid != null);
        assert.throws(() => process.kill(result.pid!, 0), /ESRCH/u);
      } finally {
        f.clean();
      }
    },
  );
}

for (const fault of [
  "profile-open",
  "timing-open",
  "pending",
  "reused-id",
  "duplicate-finalize",
  "reentry",
  "wrong-close",
] as const) {
  test(`phase client rejects terminal misuse: ${fault}`, async () => {
    const f = fixture();
    const [stream, peer] = duplexPair();
    const client = createPhaseControlClient(stream, {
      context: f.context,
      responseMs: 100,
      signal: new AbortController().signal,
      directory: join(f.directory, "client"),
    });
    const phases: string[] = [];
    peer.on("data", (bytes: Buffer) => {
      const frame = JSON.parse(bytes.subarray(4).toString("utf8"));
      phases.push(frame.control.phase);
      if (fault === "pending") return;
      const text = Buffer.from(
        JSON.stringify({
          ...frame,
          role: "pair-parent",
          proof: f.proof(frame.control),
        }),
      );
      const reply = Buffer.alloc(text.length + 4);
      reply.writeUInt32BE(text.length);
      text.copy(reply, 4);
      peer.write(reply);
    });
    let opening: ComparisonRequest | undefined;
    const control = (phase: string): NativeControl => {
      const close = phase.endsWith("-close");
      const request = close ? opening! : { ...f.request, id: phase, phase };
      if (phase.endsWith("-exclusion")) opening = request;
      return {
        phase,
        request,
        bounds: close ? { startedMs: 1050, finishedMs: 1150 } : null,
      };
    };
    try {
      if (fault === "pending") {
        const pending = assert.rejects(client.request(f.control));
        await assert.rejects(client.request(control("finalize")));
        await pending;
        assert.ok(!phases.includes("finalize"));
      } else {
        const count =
          fault === "profile-open"
            ? 3
            : fault === "timing-open"
              ? 6
              : fault === "wrong-close"
                ? 3
                : 1;
        for (const phase of nativeControlPhases.slice(0, count))
          await client.request(control(phase));
        const before = phases.length;
        if (fault === "duplicate-finalize" || fault === "reentry") {
          await client.request(control("finalize"));
          await assert.rejects(
            client.request(
              control(fault === "reentry" ? "profile-admission" : "finalize"),
            ),
          );
          assert.equal(phases.length, before + 1);
        } else {
          const next = control(
            fault === "wrong-close" ? "profile-exclusion-close" : "finalize",
          );
          await assert.rejects(
            client.request({
              ...next,
              request:
                fault === "reused-id"
                  ? { ...next.request, id: "diagnosis" }
                  : fault === "wrong-close"
                    ? { ...next.request, id: "different-opening" }
                    : next.request,
            }),
          );
          assert.equal(phases.length, before);
        }
      }
    } finally {
      client.dispose();
      peer.destroy();
      f.clean();
    }
  });
}
