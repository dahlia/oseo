/* eslint-disable no-await-in-loop -- Exercise the persistent chain in order. */
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import {
  cpSync,
  watch,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import { artifact } from "../tools/perf/evidence.ts";
import {
  startAsyncRawSealer,
  validateRawSealResponse,
} from "../tools/perf/async-raw-sealer.ts";
import {
  RawSegmentChain,
  openRawSegment,
  rawRecipientPin,
  sealRawSegment,
} from "../tools/perf/private-raw-segments.ts";
import type {
  RawSegmentContext,
  RawSegmentLimits,
  RawSegmentKind,
} from "../tools/perf/private-raw-segments.ts";

const context: RawSegmentContext = {
  commit: "a".repeat(40),
  tree: "b".repeat(40),
  repository: "fixture/oseo",
  session: "async-fixture",
  comparisonRunId: "comparison-fixture",
  run: "123",
  attempt: "2",
  job: "11",
  role: "owner",
};
const limits: RawSegmentLimits = {
  maxFiles: 10,
  maxFileBytes: 16_000_000,
  maxTotalBytes: 16_000_000,
  maxHeaderBytes: 4096,
  maxManifestBytes: 8192,
  chunkBytes: 1024,
};
const supported = {
  skip:
    process.versions.deno !== undefined || process.platform === "win32"
      ? "requires POSIX Node workers"
      : false,
};

function fixture(size = 64) {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), "oseo-async-raw-")),
  );
  const source = join(directory, "source");
  mkdirSync(source, { mode: 0o700 });
  const bytes = Buffer.alloc(size, 255);
  Buffer.from([0, 128, 192, 13, 10, 0]).copy(bytes);
  const path = join(source, "closed.bin");
  writeFileSync(path, bytes, { mode: 0o600 });
  const entries = [
    {
      ...artifact(path),
      path: "closed.bin",
      mode: lstatSync(path).mode & 0o777,
    },
  ];
  const keys = generateKeyPairSync("x25519");
  const options = {
    context,
    recipient: keys.publicKey,
    recipientPin: rawRecipientPin(keys.publicKey),
    limits,
    controlMs: 10_000,
  };
  const request = (index = 0, kind: RawSegmentKind = "pre-release") => ({
    privateRoot: source,
    outputRoot: join(directory, `sealed-${index}`),
    entries,
    kind,
  });
  return {
    directory,
    source,
    path,
    bytes,
    keys,
    options,
    request,
    remove: () => {
      const base = process.env.OSEO_ASYNC_SEALER_TEST_EVIDENCE;
      if (base !== undefined) {
        mkdirSync(base, { recursive: true, mode: 0o700 });
        const target = mkdtempSync(join(base, "fixture-"));
        cpSync(directory, join(target, "raw"), { recursive: true });
      }
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test(
  "async sealer preserves a persistent chain and all closed tails",
  supported,
  async () => {
    const f = fixture();
    const session = await startAsyncRawSealer(f.options);
    const verifier = new RawSegmentChain(context);
    let previous: string | null = null;
    try {
      const kinds: readonly RawSegmentKind[] = [
        "pre-release",
        "pre-release",
        "release-tail",
        "ordered-tail",
        "supervisor-tail",
      ];
      for (const [index, kind] of kinds.entries()) {
        const sealed = await session.seal(f.request(index, kind));
        assert.equal(sealed.receipt.sequence, index);
        assert.equal(sealed.receipt.previous, previous);
        previous = sealed.receipt.segmentSha256;
        const root = join(f.directory, `opened-${index}`);
        const opened = openRawSegment({
          envelope: sealed.envelope,
          outputRoot: root,
          chain: verifier,
          expectedKind: kind,
          privateKey: f.keys.privateKey,
          recipientPin: f.options.recipientPin,
          limits,
        });
        assert.deepEqual(opened.manifest, sealed.manifest);
        assert.deepEqual(
          readFileSync(join(root, "files", "closed.bin")),
          f.bytes,
        );
        assert.equal(lstatSync(sealed.envelope.path).mode & 0o777, 0o600);
        assert.equal(
          lstatSync(f.request(index).outputRoot).mode & 0o777,
          0o700,
        );
      }
      assert.deepEqual(readFileSync(f.path), f.bytes);
      assert.equal(lstatSync(f.path).mode & 0o777, 0o600);
    } finally {
      await session.close();
      await session.finished;
      f.remove();
    }
  },
);

test(
  "async sealer parent heartbeat continues during real fixture sealing",
  supported,
  async () => {
    const f = fixture(12_000_000);
    const session = await startAsyncRawSealer(f.options);
    let beats = 0;
    const timer = setInterval(() => beats++, 1);
    try {
      const sealed = await session.seal(f.request());
      assert.ok(beats > 2);
      assert.equal(sealed.receipt.rawBytes, f.bytes.length);
      assert.deepEqual(readFileSync(f.path), f.bytes);
    } finally {
      clearInterval(timer);
      await session.close();
      f.remove();
    }
  },
);

for (const failure of ["pin", "private-key", "context"] as const) {
  test(
    `async sealer rejects invalid session ${failure}`,
    supported,
    async () => {
      const f = fixture();
      try {
        const options =
          failure === "pin"
            ? { ...f.options, recipientPin: "0".repeat(64) }
            : failure === "private-key"
              ? {
                  ...f.options,
                  recipient: f.keys.privateKey,
                }
              : { ...f.options, context: { ...context, job: "unknown" } };
        await assert.rejects(startAsyncRawSealer(options));
        assert.deepEqual(readFileSync(f.path), f.bytes);
      } finally {
        f.remove();
      }
    },
  );
}

test(
  "async sealer rejects busy calls without forking the chain",
  supported,
  async () => {
    const f = fixture(1_000_000);
    const session = await startAsyncRawSealer(f.options);
    try {
      const first = session.seal(f.request());
      await assert.rejects(session.seal(f.request(1)));
      assert.equal((await first).receipt.sequence, 0);
      assert.equal((await session.seal(f.request(1))).receipt.sequence, 1);
    } finally {
      await session.close();
      f.remove();
    }
  },
);

for (const failure of [
  "first-tail",
  "pre-after-tail",
  "mutation",
  "partial",
  "abort",
  "timeout",
  "death",
] as const) {
  test(`async sealer discards session on ${failure}`, supported, async (t) => {
    const f = fixture(1_000_000);
    const abort = new AbortController();
    const session = await startAsyncRawSealer({
      ...f.options,
      signal: abort.signal,
    });
    try {
      if (failure === "pre-after-tail") {
        await session.seal(f.request());
        await session.seal(f.request(1, "release-tail"));
      }
      if (failure === "mutation") writeFileSync(f.path, "changed");
      if (failure === "partial")
        writeFileSync(f.path, f.bytes.subarray(0, f.bytes.length - 1));
      if (failure === "timeout" || failure === "death") {
        t.mock.method(Worker.prototype, "postMessage", function (this: Worker) {
          if (failure === "death") void this.terminate();
        });
      }
      // A bounded fixture timer tests the supplied control deadline.
      const operation = session.seal(
        f.request(2, failure === "first-tail" ? "release-tail" : "pre-release"),
      );
      const rejected = assert.rejects(operation);
      if (failure === "abort") abort.abort();
      await rejected;
      await session.finished;
      await assert.rejects(session.seal(f.request(3)));
      assert.ok(existsSync(f.path));
      assert.equal(lstatSync(f.path).mode & 0o777, 0o600);
    } finally {
      t.mock.restoreAll();
      await session.close();
      f.remove();
    }
  });
}

for (const corruption of [
  "sequence",
  "context",
  "kind",
  "previous",
  "manifest",
  "receipt",
  "partial",
  "extra",
] as const) {
  test(`async sealer validates response ${corruption}`, () => {
    const f = fixture();
    try {
      const request = f.request();
      const sealed = sealRawSegment({
        ...request,
        ...f.options,
        chain: new RawSegmentChain(context),
      });
      const bad = JSON.parse(JSON.stringify(sealed));
      if (corruption === "sequence") bad.receipt.sequence++;
      if (corruption === "context") bad.manifest.context.job = "22";
      if (corruption === "kind") bad.receipt.kind = "ordered-tail";
      if (corruption === "previous") bad.receipt.previous = "0".repeat(64);
      if (corruption === "manifest")
        bad.manifest.files[0].sha256 = createHash("sha256")
          .update("changed")
          .digest("hex");
      if (corruption === "receipt") bad.receipt.envelopeBytes++;
      const wire =
        corruption === "partial"
          ? { manifest: bad.manifest }
          : corruption === "extra"
            ? { ...bad, accepted: true }
            : bad;
      assert.throws(() =>
        validateRawSealResponse(wire, {
          context,
          sequence: 0,
          previous: null,
          request,
          limits,
        }),
      );
      assert.deepEqual(readFileSync(f.path), f.bytes);
    } finally {
      f.remove();
    }
  });
}

test(
  "async sealer explicitly rejects unsupported runtimes",
  {
    skip: supported.skip === false ? "supported Node host" : false,
  },
  async () => {
    const f = fixture();
    try {
      await assert.rejects(startAsyncRawSealer(f.options), /POSIX Node/u);
    } finally {
      f.remove();
    }
  },
);

test(
  "async envelopes reject wrong recipient, context and missing predecessor",
  supported,
  async () => {
    const f = fixture();
    const session = await startAsyncRawSealer(f.options);
    try {
      const first = await session.seal(f.request());
      const second = await session.seal(f.request(1, "ordered-tail"));
      const wrong = generateKeyPairSync("x25519");
      const options = {
        envelope: first.envelope,
        outputRoot: join(f.directory, "wrong-key"),
        chain: new RawSegmentChain(context),
        expectedKind: "pre-release" as const,
        privateKey: wrong.privateKey,
        recipientPin: f.options.recipientPin,
        limits,
      };
      assert.throws(() => openRawSegment(options));
      assert.throws(() =>
        openRawSegment({
          ...options,
          privateKey: f.keys.privateKey,
          chain: new RawSegmentChain({ ...context, job: "22" }),
          outputRoot: join(f.directory, "wrong-context"),
        }),
      );
      assert.throws(() =>
        openRawSegment({
          ...options,
          envelope: second.envelope,
          privateKey: f.keys.privateKey,
          expectedKind: "ordered-tail",
          outputRoot: join(f.directory, "gap"),
        }),
      );
      const bytes = readFileSync(first.envelope.path);
      bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
      writeFileSync(first.envelope.path, bytes);
      assert.throws(() =>
        openRawSegment({
          ...options,
          envelope: artifact(first.envelope.path),
          privateKey: f.keys.privateKey,
          outputRoot: join(f.directory, "mutated"),
        }),
      );
      writeFileSync(first.envelope.path, bytes.subarray(0, bytes.length - 1));
      assert.throws(() =>
        openRawSegment({
          ...options,
          envelope: artifact(first.envelope.path),
          privateKey: f.keys.privateKey,
          outputRoot: join(f.directory, "partial"),
        }),
      );
      assert.deepEqual(readFileSync(f.path), f.bytes);
    } finally {
      await session.close();
      f.remove();
    }
  },
);

for (const failure of [
  "stale",
  "partial-frame",
  "duplicate",
  "unsolicited",
] as const) {
  test(
    `async session rejects ${failure} worker responses`,
    supported,
    async (t) => {
      const f = fixture();
      const session = await startAsyncRawSealer(f.options);
      const owned: Worker[] = [];
      const original = Worker.prototype.postMessage;
      try {
        t.mock.method(
          Worker.prototype,
          "postMessage",
          function (this: Worker, message: any) {
            owned.push(this);
            if (failure === "stale" || failure === "partial-frame") {
              this.emit(
                "message",
                failure === "partial-frame"
                  ? {
                      protocol: message.protocol,
                      id: message.id,
                    }
                  : {
                      protocol: message.protocol,
                      id: message.id + 1,
                      result: {},
                    },
              );
              return;
            }
            original.call(this, message);
          },
        );
        if (failure === "duplicate") {
          const emit = Worker.prototype.emit;
          t.mock.method(
            Worker.prototype,
            "emit",
            function (this: Worker, event: string, ...args: any[]): boolean {
              const result = emit.call(this, event, ...args);
              if (event === "message" && args[0]?.result !== undefined) {
                emit.call(this, event, ...args);
              }
              return result;
            },
          );
        }
        const operation = session.seal(f.request());
        if (failure === "unsolicited") {
          await operation;
          const thread = owned[0];
          assert.ok(thread);
          thread.emit("message", {
            protocol: "oseo-async-raw-sealer-v1",
            id: 0,
            result: {},
          });
        } else await assert.rejects(operation);
        await session.finished;
        await assert.rejects(session.seal(f.request(1)));
        assert.deepEqual(readFileSync(f.path), f.bytes);
      } finally {
        t.mock.restoreAll();
        await session.close();
        f.remove();
      }
    },
  );
}

test("async worker ignores ambient NODE_OPTIONS", supported, async () => {
  const f = fixture();
  const before = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = "--require=/oseo-absent-fixture-module.cjs";
  try {
    const session = await startAsyncRawSealer(f.options);
    try {
      assert.equal((await session.seal(f.request())).receipt.sequence, 0);
    } finally {
      await session.close();
    }
  } finally {
    if (before === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = before;
    f.remove();
  }
});

test(
  "async abort retains private partial sealing evidence",
  supported,
  async () => {
    const f = fixture(12_000_000);
    const abort = new AbortController();
    const session = await startAsyncRawSealer({
      ...f.options,
      signal: abort.signal,
    });
    let observed = false;
    const watcher = watch(f.directory, (_event, filename) => {
      if (filename === "sealed-0") {
        observed = true;
        abort.abort();
      }
    });
    try {
      await assert.rejects(session.seal(f.request()));
      await session.finished;
      assert.ok(observed);
      assert.ok(existsSync(f.request().outputRoot));
      assert.equal(lstatSync(f.request().outputRoot).mode & 0o777, 0o700);
      assert.deepEqual(readFileSync(f.path), f.bytes);
      assert.equal(lstatSync(f.path).mode & 0o777, 0o600);
    } finally {
      watcher.close();
      await session.close();
      f.remove();
    }
  },
);

test(
  "async sealer refuses callbacks and selected helper code",
  supported,
  async () => {
    const f = fixture();
    const session = await startAsyncRawSealer(f.options);
    let called = false;
    const request = {
      ...f.request(),
      workerModule: "/untrusted/entry.ts",
      onRead: () => {
        called = true;
      },
    };
    try {
      await assert.rejects(session.seal(request));
      await session.finished;
      assert.equal(called, false);
      assert.ok(!existsSync(f.request().outputRoot));
      assert.deepEqual(readFileSync(f.path), f.bytes);
    } finally {
      await session.close();
      f.remove();
    }
  },
);
