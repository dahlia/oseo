import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import childProcess from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { artifact } from "../tools/perf/evidence.ts";
import {
  RootPhaseIssuer,
  RootPhaseVerifier,
  nativeHostBinding,
  rootKeyPin,
} from "../tools/perf/native-admission.ts";
import type { LocalNativeContext } from "../tools/perf/native-admission.ts";
import {
  readLocalHost,
  readLocalProcess,
  requireLocalParentHost,
  runLocalPhaseParent,
} from "../tools/perf/local-phase-parent.ts";
import type {
  LocalParentOptions,
  LocalParentResult,
} from "../tools/perf/local-phase-parent.ts";
import type {
  NativeControl,
  NativeControlProof,
} from "../tools/perf/native-phase-ipc.ts";

const supported =
  process.platform === "linux" &&
  process.arch === "x64" &&
  !("Deno" in globalThis);
const linux = {
  skip: supported ? false : "requires Linux x64 Node.js ownership",
};
const checkout = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const protocolUrl = new URL(
  "../tools/perf/native-phase-ipc.ts",
  import.meta.url,
).href;
const bounds = {
  responseMs: 2000,
  heartbeatMs: 20,
  termGraceMs: 50,
  cleanupMs: 1000,
  maxEntryBytes: 65_536,
  maxStdinBytes: 65_536,
  maxOutputBytes: 65_536,
};

function fixture(body: string, fault = "") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "oseo-local-parent-")));
  const directory = join(root, "parent");
  const manifest = join(root, "built.json");
  const raw = join(root, "root-decision.bin");
  const entry = join(root, "source.mjs");
  writeFileSync(manifest, "tiny fixture, not a built Oseo workload", {
    mode: 0o600,
  });
  writeFileSync(raw, Buffer.from([0, 255, 128, 10]), { mode: 0o600 });
  const [commit, tree] = execFileSync(
    "git",
    ["-C", checkout, "rev-parse", "HEAD", "HEAD^{tree}"],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n");
  const controller = new AbortController();
  const key = generateKeyPairSync("ed25519");
  const pin = rootKeyPin(key.publicKey);
  const issuer = new RootPhaseIssuer(key.privateKey, pin);
  const phases: string[] = [];
  const pulses: number[] = [];
  let observed: LocalNativeContext | undefined;
  const proof = (
    control: NativeControl,
    context: LocalNativeContext,
  ): NativeControlProof => {
    const base = {
      requestId: control.request.id,
      status: "complete" as const,
      raw: [artifact(raw)],
    };
    if (!control.phase.includes("-exclusion")) return base;
    const common = {
      ...base,
      physicalHost: nativeHostBinding(context),
      accounts: context.accounts,
      startedMs: 1000,
    };
    return control.bounds === null
      ? { ...common, state: "monitoring" }
      : { ...common, finishedMs: 2000, coverage: "whole-window" };
  };
  writeFileSync(
    entry,
    `
import { Socket } from 'node:net';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createPhaseControlClient, nativeControlPhases }
  from ${JSON.stringify(protocolUrl)};
export async function main(context) {
  const stream = new Socket({fd: 3, readable: true, writable: true});
  const request = {id:'diagnosis', phase:'diagnosis',
    runId:context.comparisonRunId, manifest:context.manifest,
    destination:${JSON.stringify(join(root, "request"))},
    source:{tree:context.tree, host:{target:'linux-x86_64-gnu',
      os:'linux fixture',architecture:'x64',cpu:'fixture CPU',logicalCpus:1,
      memoryBytes:1,commit:context.commit,dirty:false,node:'fixture-node',
      deno:'fixture-deno',bun:'fixture-bun',zig:'fixture-zig',
      postject:'fixture-postject',
      pinsSha256:'c'.repeat(64),lockSha256:'d'.repeat(64)}}};
  const control = {phase:'diagnosis',request,bounds:null};
  const client = createPhaseControlClient(stream, {context,responseMs:2000,
    signal:new AbortController().signal,
    directory:${JSON.stringify(join(root, "child-control"))}});
  const frame = {schema:1,role:'ordered-child',sequence:1,
    binding:createHash('sha256').update(JSON.stringify(context)).digest('hex'),
    control,proof:null};
  function send(value) {
    const text=Buffer.from(JSON.stringify(value));
    const bytes=Buffer.alloc(text.length+4);bytes.writeUInt32BE(text.length);
    text.copy(bytes,4);stream.write(bytes);
  }
  ${body}
}
`,
    { mode: 0o600 },
  );
  const options: LocalParentOptions = {
    source: {
      session: "local-fixture",
      repository: "fixture/oseo",
      comparisonRunId: "local-comparison",
      commit: commit!,
      tree: tree!,
      checkout,
      manifest: artifact(manifest),
      accounts: ["fixture-slot"],
    },
    entry: artifact(entry),
    directory,
    stdin: new Uint8Array([0, 255, 128]),
    bounds,
    signal: controller.signal,
    root: {
      verifier: new RootPhaseVerifier(key.publicKey, pin, 16),
      origin: async (context) => {
        observed = context;
        if (fault === "origin") throw new Error("private origin refusal");
        if (fault === "entry-drift")
          writeFileSync(context.entry.path, "changed");
        if (fault === "origin-timeout") await new Promise<void>(() => {});
      },
      decide: async (control, context) => {
        phases.push(control.phase);
        const now = Date.now();
        const decision = {
          schema: 1 as const,
          issuer: "Root" as const,
          keyPin: pin,
          purpose: control.phase.startsWith("profile")
            ? ("profile" as const)
            : ("timing" as const),
          requestId: control.request.id,
          context,
          issuedMs: now,
          expiresMs: now + 5000,
          decision:
            fault === "root-reject" ? ("reject" as const) : ("admit" as const),
          raw: [artifact(raw)],
        };
        if (fault === "wrong-birth")
          Object.assign(context.child, { startTicks: "1" });
        if (fault === "wrong-boot")
          Object.assign(context.host, {
            bootId: "33333333-3333-3333-3333-333333333333",
          });
        return issuer.issue(decision, now);
      },
      adjudicate: async () => {
        if (fault === "adjudicate") throw new Error("private remote refusal");
      },
    },
    handle: async (control, context, signal) => {
      phases.push(control.phase);
      if (fault === "callback" || fault === "descendant")
        throw new Error("private callback detail");
      if (fault === "abort") controller.abort();
      if (fault === "timeout")
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        });
      return proof(control, context);
    },
    pulse: async () => {
      pulses.push(Date.now());
      if (fault === "collector") throw new Error("collector failed");
    },
  };
  return {
    root,
    directory,
    entry,
    manifest,
    controller,
    options,
    phases,
    pulses,
    observed: () => observed,
    run: async () => {
      const result = await runLocalPhaseParent(options);
      writeFileSync(join(root, "fixture-result.json"), JSON.stringify(result), {
        mode: 0o600,
      });
      return result;
    },
    clean: () => {
      const retain = process.env.OSEO_LOCAL_PARENT_TEST_EVIDENCE;
      if (retain !== undefined) {
        mkdirSync(retain, { recursive: true, mode: 0o700 });
        cpSync(root, join(retain, basename(root)), { recursive: true });
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}

const full = `
let opening;
for (const phase of nativeControlPhases) {
  const close=phase.endsWith('-close');
  const req=close?opening:{...request,id:'id-'+phase,phase};
  if (phase.endsWith('-exclusion')) opening=req;
  await client.request({phase,request:req,
    bounds:close?{startedMs:1100,finishedMs:1200}:null});
  if (phase==='profile-exclusion') {
    process.stdout.write(readFileSync(0));
    process.stderr.write(Buffer.from([0,255,128,10]));
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,180);
  }
}
client.dispose();
`;

function gone(value: LocalParentResult): void {
  assert.equal(value.cleanup, "gone");
  assert.equal(value.reaped, true);
  assert.ok(value.pid !== null);
  assert.throws(() => process.kill(value.pid!, 0), /ESRCH/u);
  assert.throws(() => process.kill(-value.pid!, 0), /ESRCH/u);
}

test("local parent rejects unsupported host before entry", () => {
  if (supported) requireLocalParentHost();
  else assert.throws(() => requireLocalParentHost(), /Local phase parent/u);
});

test(
  "local parent binds actual birth and keeps parent live during blocking",
  linux,
  async () => {
    const f = fixture(full);
    let ticks = 0;
    const heartbeat = setInterval(() => ticks++, 10);
    try {
      const result = await f.run();
      assert.equal(
        result.failure,
        null,
        JSON.stringify({
          result,
          stderr: readFileSync(join(f.directory, "stderr.bin"), "utf8"),
        }),
      );
      assert.equal(result.status, "completed");
      assert.equal(result.assessment, "UNASSESSED");
      assert.equal(result.physicalExclusion, "unknown");
      assert.equal(result.capture, "complete");
      assert.ok(ticks >= 5);
      assert.ok(result.pulses >= 5);
      assert.deepEqual(result.context?.host, readLocalHost());
      assert.deepEqual(result.context?.parent, readLocalProcess(process.pid));
      assert.equal(result.context?.child.pid, result.pid);
      assert.equal(result.context?.child.ppid, process.pid);
      assert.equal(result.context?.child.uid, process.getuid!());
      assert.equal(result.context?.origin, "local-linux");
      assert.ok(BigInt(result.context!.child.startTicks) > 0n);
      assert.deepEqual(result.context, f.observed());
      assert.deepEqual(
        readFileSync(join(f.directory, "stdout.bin")),
        Buffer.from([0, 255, 128]),
      );
      assert.deepEqual(
        readFileSync(join(f.directory, "stderr.bin")),
        Buffer.from([0, 255, 128, 10]),
      );
      for (const raw of result.raw) {
        assert.deepEqual(artifact(raw.path), raw);
        assert.equal(lstatSync(raw.path).mode & 0o777, 0o600);
      }
      assert.equal(lstatSync(f.directory).mode & 0o777, 0o700);
      assert.doesNotMatch(JSON.stringify(result), /PRIVATE KEY|nonce/u);
      gone(result);
    } finally {
      clearInterval(heartbeat);
      f.clean();
    }
  },
);

for (const fault of [
  "origin",
  "entry-drift",
  "origin-timeout",
  "root-reject",
  "adjudicate",
  "wrong-birth",
  "wrong-boot",
  "callback",
  "abort",
  "timeout",
  "collector",
] as const) {
  test(
    `local parent fails closed on ${fault} and reaps its child`,
    linux,
    async () => {
      const f = fixture(full, fault);
      try {
        const result = await f.run();
        assert.equal(result.status, "failed");
        assert.notEqual(result.failure, null);
        assert.equal(result.physicalExclusion, "unknown");
        assert.doesNotMatch(
          JSON.stringify(result),
          /private.*refusal|private callback/u,
        );
        assert.ok(f.phases.length <= (fault === "collector" ? 8 : 2));
        gone(result);
      } finally {
        f.clean();
      }
    },
  );
}

for (const fault of [
  "malformed",
  "oversize",
  "partial",
  "out-of-order",
  "unsolicited-proof",
  "replay",
  "wrong-binding",
  "wrong-role",
  "unknown-field",
  "disconnect",
  "early-exit",
  "nonzero",
  "output-overflow",
  "entry-error",
  "partial-after-final",
  "missing-first-control",
  "after-final-hang",
] as const) {
  test(`local owned fd3 rejects ${fault}`, linux, async () => {
    const bodies = {
      malformed: "stream.end(Buffer.from([0,0,0,2,123,33]));",
      oversize:
        "const b=Buffer.alloc(4);b.writeUInt32BE(65537);stream.write(b);",
      partial: "stream.end(Buffer.from([0,0,0,50,123]));",
      "out-of-order":
        "frame.control.phase='timing-admission';" +
        "frame.control.request.phase='timing-admission';send(frame);",
      "unsolicited-proof":
        "frame.proof={requestId:request.id,status:'complete'," +
        "raw:[context.manifest]};send(frame);",
      replay: "send(frame);send(frame);",
      "wrong-binding": "frame.binding='wrong';send(frame);",
      "wrong-role": "frame.role='pair-parent';send(frame);",
      "unknown-field": "frame.pid=process.pid;send(frame);",
      disconnect: "stream.destroy();",
      "early-exit": "process.exit(0);",
      nonzero: full + "process.exit(7);",
      "output-overflow": "process.stdout.write(Buffer.alloc(100000));",
      "entry-error": "throw new Error('fixture entry failed');",
      "missing-first-control": "",
      "after-final-hang": full,
      "partial-after-final": full.replace(
        "client.dispose();",
        "stream.end(Buffer.from([0,0]));",
      ),
    };
    const wait = [
      "nonzero",
      "early-exit",
      "entry-error",
      "partial-after-final",
    ].includes(fault)
      ? ""
      : "setInterval(()=>{},1000);";
    const f = fixture(bodies[fault] + wait);
    try {
      const result = await f.run();
      assert.equal(result.status, "failed", JSON.stringify(result));
      if (fault === "out-of-order") assert.deepEqual(f.phases, []);
      if (fault === "output-overflow") {
        assert.equal(result.capture, "partial");
        assert.equal(
          readFileSync(join(f.directory, "stdout.bin")).length,
          bounds.maxOutputBytes,
        );
      }
      gone(result);
    } finally {
      f.clean();
    }
  });
}

test(
  "local parent refuses stale source and entry pins before launch",
  linux,
  async () => {
    const f = fixture(full);
    try {
      await assert.rejects(
        runLocalPhaseParent({
          ...f.options,
          source: { ...f.options.source, commit: "a".repeat(40) },
        }),
      );
      assert.equal(existsSync(f.directory), false);
      writeFileSync(f.entry, "changed");
      await assert.rejects(f.run());
      assert.equal(existsSync(join(f.directory, "origin.json")), false);
    } finally {
      f.clean();
    }
  },
);

test(
  "local parent refuses a caller flag in place of Root boundaries",
  linux,
  async () => {
    const f = fixture(full);
    try {
      const options = { ...f.options };
      Object.assign(options, { root: { admitted: true } });
      await assert.rejects(runLocalPhaseParent(options));
      assert.equal(existsSync(f.directory), false);
    } finally {
      f.clean();
    }
  },
);

test(
  "local parent rejects pre-abort without creating output",
  linux,
  async () => {
    const f = fixture(full);
    try {
      f.controller.abort();
      await assert.rejects(f.run());
      assert.equal(existsSync(f.directory), false);
    } finally {
      f.clean();
    }
  },
);

test(
  "local parent cleans owned descendants and retains partial exit",
  linux,
  async () => {
    const f = fixture(`
const descendant=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],
  {stdio:'ignore',env:{},detached:false});
process.stdout.write(String(descendant.pid));
await client.request(control);
process.exit(8);
`);
    try {
      const result = await f.run();
      assert.equal(result.status, "failed");
      assert.equal(result.reaped, true);
      assert.equal(result.code, 8);
      const descendant = Number(
        readFileSync(join(f.directory, "stdout.bin"), "utf8"),
      );
      assert.ok(Number.isSafeInteger(descendant) && descendant > 0);
      const stat = `/proc/${descendant}/stat`;
      if (existsSync(stat)) assert.match(readFileSync(stat, "utf8"), /\) Z /u);
      // An orphan zombie can keep the group visible until init reaps it.
      // Unknown cleanup must never become a successful transport receipt.
      if (result.cleanup === "gone") gone(result);
      else assert.notEqual(result.failure, null);
    } finally {
      f.clean();
    }
  },
);

test("local parent reaps an inherited descendant", linux, async () => {
  const f = fixture(
    `
const descendant=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],
  {stdio:'ignore',env:{},detached:false});
process.stdout.write(String(descendant.pid));
process.on('SIGTERM',()=>{
  if (descendant.exitCode!==null || descendant.signalCode!==null)
    process.exit(8);
  else descendant.once('exit',()=>process.exit(8));
});
await client.request(control);
`,
    "descendant",
  );
  try {
    const result = await runLocalPhaseParent({
      ...f.options,
      bounds: { ...bounds, termGraceMs: 500, cleanupMs: 2000 },
    });
    assert.equal(result.status, "failed");
    assert.equal(result.cleanupScope, "owned-process-group");
    gone(result);
    const descendant = Number(
      readFileSync(join(f.directory, "stdout.bin"), "utf8"),
    );
    assert.ok(Number.isSafeInteger(descendant) && descendant > 0);
    assert.throws(() => process.kill(descendant, 0), /ESRCH/u);
  } finally {
    f.clean();
  }
});

/** Hold the final child exit until a parent pulse observes its final ACK. */
function terminalFixture() {
  return fixture(
    full.replace(
      "client.dispose();",
      `
writeFileSync(context.entry.path+'.ready', 'final ACK', {mode:0o600});
while (!readFileSync(context.entry.path+'.release', {flag:'a+'}).length)
  await new Promise(resolve=>setTimeout(resolve,2));
client.dispose();
`,
    ),
  );
}

/** Block only the fixture's event loop so libuv cannot deliver exit yet. */
function waitForZombie(pid: number): string {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    if (stat.slice(stat.lastIndexOf(") ") + 2).startsWith("Z ")) return stat;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
  }
  throw new Error("Fixture child did not reach zombie state");
}

/** Observe one child transition without allowing an unbounded fixture wait. */
async function waitForFixture(check: () => boolean, message: string) {
  const deadline = Date.now() + 1000;
  while (!check()) {
    assert.ok(Date.now() < deadline, message);
    // eslint-disable-next-line no-await-in-loop -- Observe serial child state.
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
  }
}

async function releaseTerminalChild(context: LocalNativeContext) {
  await waitForFixture(
    () => existsSync(context.entry.path + ".ready"),
    "Fixture final ACK was not received",
  );
  writeFileSync(context.entry.path + ".release", "exit", { mode: 0o600 });
  const stat = waitForZombie(context.child.pid);
  // The strict public reader must continue rejecting terminal processes.
  assert.throws(() => readLocalProcess(context.child.pid));
  writeFileSync(
    context.entry.path + ".terminal-trace.json",
    JSON.stringify({
      boundary: "final ACK received, pulse pending, exit event blocked",
      stat,
      expected: context.child,
    }),
    { mode: 0o600 },
  );
}

test(
  "local terminal pulse accepts an owned zombie before exit delivery",
  linux,
  async () => {
    const f = terminalFixture();
    try {
      const result = await runLocalPhaseParent({
        ...f.options,
        pulse: releaseTerminalChild,
      });
      writeFileSync(
        join(f.root, "terminal-result.json"),
        JSON.stringify(result),
        { mode: 0o600 },
      );
      assert.equal(result.status, "completed", JSON.stringify(result));
      assert.equal(result.code, 0);
      assert.equal(result.capture, "complete");
      assert.equal(f.phases.length, 8);
      gone(result);
    } finally {
      f.clean();
    }
  },
);

for (const fault of [
  "callback",
  "callback-after-reap",
  "timeout-after-reap",
  "abort-after-reap",
  "entry-after-reap",
  "manifest-after-reap",
] as const) {
  test(`local terminal pulse preserves ${fault} failure`, linux, async () => {
    const f = terminalFixture();
    let settled = false;
    try {
      const result = await runLocalPhaseParent({
        ...f.options,
        pulse: async (context, signal) => {
          await releaseTerminalChild(context);
          if (fault !== "callback") {
            await waitForFixture(
              () => !existsSync(`/proc/${context.child.pid}`),
              "Fixture child was not reaped",
            );
            writeFileSync(context.entry.path + ".reaped", "gone", {
              mode: 0o600,
            });
          }
          if (fault === "timeout-after-reap") {
            await new Promise<void>((resolve) => {
              if (signal.aborted) resolve();
              else
                signal.addEventListener("abort", () => resolve(), {
                  once: true,
                });
            });
          }
          settled = true;
          if (fault === "abort-after-reap") f.controller.abort();
          else if (fault === "entry-after-reap")
            writeFileSync(context.entry.path, "changed");
          else if (fault === "manifest-after-reap")
            writeFileSync(context.manifest.path, "changed");
          else throw new Error("private terminal callback refusal");
        },
      });
      writeFileSync(
        join(f.root, "terminal-result.json"),
        JSON.stringify(result),
        { mode: 0o600 },
      );
      assert.equal(result.status, "failed", JSON.stringify(result));
      assert.equal(settled, true);
      assert.equal(result.code, 0);
      assert.equal(result.capture, "complete");
      assert.equal(f.phases.length, 8);
      assert.doesNotMatch(JSON.stringify(result), /private terminal/u);
      gone(result);
    } finally {
      f.clean();
    }
  });
}

test(
  "local terminal rejects an extra complete control frame",
  linux,
  async () => {
    const f = fixture(full.replace("client.dispose();", "send(frame);"));
    try {
      const result = await f.run();
      assert.equal(result.status, "failed");
      assert.equal(f.phases.length, 8);
      gone(result);
    } finally {
      f.clean();
    }
  },
);

import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

for (const fault of [
  "birth",
  "parent",
  "group",
  "session",
  "uid",
  "boot",
  "namespace",
  "unreadable",
  "birth-before-gone",
] as const) {
  test(`local terminal ownership rejects ${fault} drift`, linux, async (t) => {
    const f = terminalFixture();
    const read = fs.readSync;
    const link = fs.readlinkSync;
    let injected = false;
    try {
      const result = await runLocalPhaseParent({
        ...f.options,
        pulse: async (context) => {
          await releaseTerminalChild(context);
          if (fault === "namespace") {
            t.mock.method(fs, "readlinkSync", (path: fs.PathLike) => {
              if (path === "/proc/self/ns/pid") {
                injected = true;
                return "pid:[changed]";
              }
              return link(path);
            });
          } else {
            t.mock.method(
              fs,
              "readSync",
              (
                fd: number,
                buffer: Buffer,
                offset: number,
                length: number,
                position: number | null,
              ) => {
                const path = link(`/proc/self/fd/${fd}`);
                const child = `/proc/${context.child.pid}/`;
                if (path === child + "stat" && fault === "unreadable") {
                  injected = true;
                  throw Object.assign(new Error("private read refusal"), {
                    code: "EACCES",
                  });
                }
                if (path === child + "status" && fault === "birth-before-gone")
                  throw Object.assign(new Error("gone"), { code: "ENOENT" });
                const count = read(fd, buffer, offset, length, position);
                if (count === 0) return count;
                const original = buffer.toString(
                  "utf8",
                  offset,
                  offset + count,
                );
                let value = original;
                if (path === child + "stat") {
                  const close = original.lastIndexOf(") ") + 2;
                  const fields = original.slice(close).split(" ");
                  const index =
                    fault === "birth" || fault === "birth-before-gone"
                      ? 19
                      : fault === "parent"
                        ? 1
                        : fault === "group"
                          ? 2
                          : fault === "session"
                            ? 3
                            : undefined;
                  if (index !== undefined) {
                    fields[index] = "1";
                    value = original.slice(0, close) + fields.join(" ");
                  }
                } else if (path === child + "status" && fault === "uid") {
                  value = original.replace(/^Uid:.*$/mu, "Uid:\t1\t1\t1\t1");
                } else if (
                  path === "/proc/sys/kernel/random/boot_id" &&
                  fault === "boot"
                ) {
                  value = "33333333-3333-3333-3333-333333333333\n";
                }
                if (value !== original) injected = true;
                buffer.write(value, offset);
                return Buffer.byteLength(value);
              },
            );
          }
          syncBuiltinESMExports();
        },
      });
      assert.equal(injected, true);
      assert.equal(result.status, "failed", JSON.stringify(result));
      assert.doesNotMatch(JSON.stringify(result), /private read/u);
      assert.equal(result.code, 0);
      gone(result);
    } finally {
      t.mock.restoreAll();
      syncBuiltinESMExports();
      f.clean();
    }
  });
}

test(
  "local terminal pulse accepts gone only after callback settles",
  linux,
  async () => {
    const f = terminalFixture();
    let settled = false;
    try {
      const result = await runLocalPhaseParent({
        ...f.options,
        pulse: async (context) => {
          await releaseTerminalChild(context);
          await waitForFixture(
            () => !existsSync(`/proc/${context.child.pid}`),
            "Fixture child was not reaped",
          );
          settled = true;
        },
      });
      assert.equal(settled, true);
      assert.equal(result.status, "completed", JSON.stringify(result));
      assert.equal(result.pulses, 1);
      gone(result);
    } finally {
      f.clean();
    }
  },
);

test(
  "local post-ACK pulse keeps its own response bound after stdio close",
  linux,
  async () => {
    const f = terminalFixture();
    let prepared = false;
    let settled = false;
    let pulseStarted = 0;
    try {
      const result = await runLocalPhaseParent({
        ...f.options,
        pulse: async (context) => {
          if (!existsSync(context.entry.path + ".ready")) return;
          if (!prepared) {
            await new Promise<void>((resolve) => setTimeout(resolve, 1200));
            prepared = true;
            return;
          }
          pulseStarted = Date.now();
          await releaseTerminalChild(context);
          await new Promise<void>((resolve) => setTimeout(resolve, 1200));
          settled = true;
        },
      });
      writeFileSync(
        join(f.root, "post-ack-result.json"),
        JSON.stringify({ result, settled, pulseStarted }),
      );
      assert.equal(settled, true);
      assert.ok(Date.now() - pulseStarted < bounds.responseMs);
      assert.equal(result.status, "completed", JSON.stringify(result));
      assert.equal(result.capture, "complete");
      gone(result);
    } finally {
      f.clean();
    }
  },
);

for (const prefix of [0, 1, 2, 4, 5]) {
  test(
    `local early finalize after ${prefix} controls stays failed`,
    linux,
    async () => {
      const body = full.replace(
        "for (const phase of nativeControlPhases)",
        `for (const phase of [...nativeControlPhases.slice(0, ${prefix}),
          'finalize'])`,
      );
      const f = fixture(body);
      try {
        const result = await f.run();
        assert.equal(result.status, "failed");
        assert.equal(result.failure, "Phase control finalized early.");
        assert.equal(result.code, 0);
        assert.equal(result.capture, "complete");
        assert.equal(
          f.phases.filter((phase) => phase === "finalize").length,
          1,
        );
        assert.equal(f.phases.length, prefix + 1);
        gone(result);
      } finally {
        f.clean();
      }
    },
  );
}

for (const output of ["stdout", "stderr"] as const) {
  for (const fault of [
    "read-error",
    "write-error",
    "zero-write",
    "short-write",
  ] as const) {
    test(`local ${output} capture preserves ${fault}`, linux, async (t) => {
      const f = fixture(full);
      const spawnChild = childProcess.spawn;
      const write = fs.writeSync;
      const target = join(f.directory, output + ".bin");
      const expected = Buffer.from(
        output === "stdout" ? [0, 255, 128] : [0, 255, 128, 10],
      );
      let injected = false;
      let closed = false;
      let written = 0;
      try {
        t.mock.method(
          childProcess,
          "spawn",
          (...args: Parameters<typeof spawnChild>) => {
            const child = spawnChild(...args);
            child.once("close", () => {
              closed = true;
            });
            if (fault === "read-error") {
              const stream = child[output]!;
              stream.once("data", () => {
                // Retain the prefix before reporting the read failure.
                queueMicrotask(() => {
                  injected = true;
                  stream.destroy(new Error("private capture read failure"));
                });
              });
            }
            return child;
          },
        );
        if (fault !== "read-error") {
          t.mock.method(
            fs,
            "writeSync",
            (fd: number, bytes: Buffer, offset: number, length: number) => {
              if (fs.readlinkSync(`/proc/self/fd/${fd}`) !== target)
                return write(fd, bytes, offset, length);
              injected = true;
              // A real first write leaves a verifiable prefix on disk.
              if (written > 0 && fault === "write-error")
                throw new Error("private capture write failure");
              if (written > 0 && fault === "zero-write") return 0;
              const count = write(fd, bytes, offset, Math.min(length, 1));
              written += count;
              return count;
            },
          );
        }
        syncBuiltinESMExports();
        const result = await f.run();
        assert.equal(injected, true);
        assert.equal(closed, true);
        const complete = fault === "short-write";
        assert.equal(result.status, complete ? "completed" : "failed");
        assert.equal(result.capture, complete ? "complete" : "partial");
        assert.equal(result.assessment, "UNASSESSED");
        assert.equal(result.physicalExclusion, "unknown");
        assert.equal(result.failure === null, complete);
        assert.doesNotMatch(JSON.stringify(result), /private capture/u);
        const prefix =
          fault === "read-error" || complete
            ? expected
            : expected.subarray(0, 1);
        assert.deepEqual(readFileSync(target), prefix);
        assert.ok(prefix.length < bounds.maxOutputBytes);
        assert.deepEqual(
          readFileSync(join(f.directory, "stdin.bin")),
          Buffer.from(f.options.stdin),
        );
        const retained = result.raw.find((raw) => raw.path === target);
        assert.deepEqual(retained, artifact(target));
        const saved = JSON.parse(
          readFileSync(join(f.directory, "result.json"), "utf8"),
        );
        assert.equal(saved.capture, result.capture);
        assert.equal(saved.status, result.status);
        gone(result);
      } finally {
        t.mock.restoreAll();
        syncBuiltinESMExports();
        f.clean();
      }
    });
  }
}

/** Reap escaped toys under the test harness, outside product authority. */
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

for (const output of ["stdout", "stderr"] as const) {
  const name = `local final ACK bounds escaped ${output} teardown`;
  test(name, linux, async () => {
    if (process.env.OSEO_LOCAL_PARENT_ESCAPED_OUTPUT !== output) {
      const root = realpathSync(mkdtempSync(join(tmpdir(), "oseo-escaped-")));
      const receiptPath = join(root, "cleanup.json");
      try {
        const env = { ...process.env };
        delete env.NODE_TEST_CONTEXT;
        const child = childProcess.spawnSync(
          "python3",
          [
            "-c",
            escapedSupervisor,
            receiptPath,
            process.execPath,
            "--test",
            "--test-isolation=none",
            "--test-reporter=tap",
            "--test-name-pattern",
            "^" + name + "$",
            fileURLToPath(import.meta.url),
          ],
          {
            encoding: "utf8",
            env: {
              ...env,
              OSEO_LOCAL_PARENT_ESCAPED_OUTPUT: output,
            },
          },
        );
        const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
        console.log(JSON.stringify({ output, ...receipt }));
        console.log(child.stdout);
        console.log(child.stderr);
        assert.deepEqual(receipt.remaining, []);
        assert.equal(receipt.timeout, undefined);
        assert.equal(receipt.reaped.length, 1);
        assert.ok(receipt.reaped[0].status > 0);
        assert.equal(child.status, 0);
      } finally {
        const retain = process.env.OSEO_LOCAL_PARENT_TEST_EVIDENCE;
        if (retain !== undefined) {
          mkdirSync(retain, { recursive: true, mode: 0o700 });
          cpSync(root, join(retain, "supervisor-" + output), {
            recursive: true,
          });
        }
        rmSync(root, { recursive: true, force: true });
      }
      return;
    }
    const f = fixture(
      full.replace(
        "client.dispose();",
        `
writeFileSync(context.entry.path+'.ack', 'final ACK', {mode:0o600});
const toy=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],
  {detached:true,env:{},stdio:['ignore',
    ${output === "stdout" ? "1,'ignore'" : "'ignore',2"}]});
await new Promise((resolve,reject)=>{
  toy.once('spawn',resolve);toy.once('error',reject);
});
writeFileSync(context.entry.path+'.toy', String(toy.pid), {mode:0o600});
toy.unref();
client.dispose();
process.exit(0);
`,
      ),
    );
    let expired = false;
    const started = Date.now();
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const handle = f.options.handle;
    const terminalHandle: LocalParentOptions["handle"] = async (
      control,
      context,
      signal,
    ) => {
      const proof = await handle(control, context, signal);
      if (control.phase === "finalize") {
        // Start at terminal control, after source checks and child startup.
        watchdog = setTimeout(
          () => {
            expired = true;
            f.controller.abort();
          },
          bounds.responseMs + bounds.cleanupMs + 1000,
        );
      }
      return proof;
    };
    try {
      // Simulate slow harness preparation before launch. Teardown keeps the
      // same 4000ms watchdog and the supervisor keeps its 12-second bound.
      if (output === "stdout")
        await new Promise<void>((resolve) => setTimeout(resolve, 4100));
      const result = await runLocalPhaseParent({
        ...f.options,
        handle: terminalHandle,
      });
      const elapsedMs = Date.now() - started;
      const toy = Number(
        readFileSync(join(f.directory, "entry.mjs.toy"), "utf8"),
      );
      const escaped = readLocalProcess(toy);
      const trace = {
        output,
        elapsedMs,
        expired,
        finalAck: readFileSync(join(f.directory, "entry.mjs.ack"), "utf8"),
        escaped,
        result,
      };
      writeFileSync(join(f.root, "escaped-trace.json"), JSON.stringify(trace));
      console.log(
        JSON.stringify({
          output,
          elapsedMs,
          expired,
          toy,
          status: result.status,
          capture: result.capture,
          code: result.code,
          reaped: result.reaped,
          cleanup: result.cleanup,
          failure: result.failure,
        }),
      );
      assert.notEqual(escaped.group, result.pid);
      assert.equal(result.code, 0);
      assert.equal(f.phases.length, 8);
      gone(result);
      assert.equal(expired, false, "stdio teardown exceeded its bound");
      assert.equal(result.status, "failed");
      assert.equal(result.capture, "partial");
      assert.equal(result.cleanupScope, "owned-process-group");
      assert.equal(result.assessment, "UNASSESSED");
      assert.equal(result.physicalExclusion, "unknown");
      assert.notEqual(result.failure, null);
    } finally {
      clearTimeout(watchdog);
      f.clean();
    }
  });
}
