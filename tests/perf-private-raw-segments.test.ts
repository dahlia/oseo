import assert from "node:assert/strict";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platform } from "node:process";
import { test } from "node:test";
import { artifact } from "../tools/perf/evidence.ts";
import {
  RawSegmentChain,
  openRawSegment,
  rawRecipientPin,
  sealRawSegment,
} from "../tools/perf/private-raw-segments.ts";
import type {
  RawSegmentContext,
  RawSegmentEntry,
  RawSegmentLimits,
  SealRawSegmentOptions,
  SealedRawSegment,
} from "../tools/perf/private-raw-segments.ts";

const binding: RawSegmentContext = {
  commit: "a".repeat(40),
  tree: "b".repeat(40),
  repository: "fixture/oseo",
  session: "private-raw-fixture",
  comparisonRunId: "comparison-fixture",
  run: "123",
  attempt: "2",
  job: "11",
  role: "owner",
};
const cap: RawSegmentLimits = {
  maxFiles: 10,
  maxFileBytes: 4_000_000,
  maxTotalBytes: 8_000_000,
  maxHeaderBytes: 4096,
  maxManifestBytes: 8192,
  chunkBytes: 31,
};
const invalid = { name: "Error", message: "Invalid private raw segment." };
const posix = {
  skip: platform === "win32" ? "requires POSIX symlink/mode semantics" : false,
};

function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "oseo-raw-")));
  const source = join(directory, "source");
  mkdirSync(source, { mode: 0o700 });
  mkdirSync(join(source, "nested"), { mode: 0o700 });
  const bytes = Buffer.concat([
    Buffer.from("private-fixture-content-never-exported-"),
    Buffer.from([0, 255, 254, 192, 128, 13, 10, 0]),
  ]);
  writeFileSync(join(source, "nested", "stdout.bin"), bytes, { mode: 0o600 });
  writeFileSync(join(source, "stderr.bin"), Buffer.from([255, 0, 128]), {
    mode: 0o600,
  });
  writeFileSync(join(source, "empty.bin"), Buffer.alloc(0), { mode: 0o600 });
  const files: readonly RawSegmentEntry[] = [
    "nested/stdout.bin",
    "stderr.bin",
    "empty.bin",
  ].map((path) => ({
    path,
    bytes: artifact(join(source, ...path.split("/"))).bytes,
    sha256: artifact(join(source, ...path.split("/"))).sha256,
    mode: lstatSync(join(source, ...path.split("/"))).mode & 0o777,
  }));
  const keys = generateKeyPairSync("x25519");
  const pin = rawRecipientPin(keys.publicKey);
  const producer = new RawSegmentChain(binding);
  const collector = new RawSegmentChain(binding);
  const options: SealRawSegmentOptions = {
    privateRoot: source,
    outputRoot: join(directory, "sealed"),
    entries: files,
    chain: producer,
    kind: "pre-release",
    recipient: keys.publicKey,
    recipientPin: pin,
    limits: cap,
  };
  const seal = (
    changes: Partial<SealRawSegmentOptions> = {},
  ): SealedRawSegment => sealRawSegment({ ...options, ...changes });
  const open = (sealed: SealedRawSegment, output = "opened") =>
    openRawSegment({
      envelope: sealed.envelope,
      expectedKind: sealed.manifest.kind,
      outputRoot: join(directory, output),
      chain: collector,
      privateKey: keys.privateKey,
      recipientPin: pin,
      limits: cap,
    });
  return {
    directory,
    source,
    bytes,
    files,
    keys,
    pin,
    producer,
    collector,
    options,
    seal,
    open,
  };
}

function withFixture(run: (value: ReturnType<typeof fixture>) => void): void {
  const value = fixture();
  try {
    run(value);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
}

function header(bytes: Buffer) {
  const size = bytes.readUInt32BE(8);
  return {
    size,
    value: JSON.parse(bytes.subarray(12, 12 + size).toString("utf8")),
  };
}

function replaceEnvelope(
  value: ReturnType<typeof fixture>,
  sealed: SealedRawSegment,
  bytes: Buffer,
): SealedRawSegment {
  const path = join(value.directory, "modified-envelope");
  writeFileSync(path, bytes, { mode: 0o600, flag: "wx" });
  return { ...sealed, envelope: artifact(path) };
}

function changedHeader(bytes: Buffer, mutate: (value: any) => void): Buffer {
  const parsed = header(bytes);
  mutate(parsed.value);
  const body = Buffer.from(JSON.stringify(parsed.value));
  const prefix = Buffer.from(bytes.subarray(0, 12));
  prefix.writeUInt32BE(body.length, 8);
  return Buffer.concat([prefix, body, bytes.subarray(12 + parsed.size)]);
}

test("raw segments round-trip non-UTF8, NUL, empty and multiple files", () => {
  withFixture((value) => {
    const sealed = value.seal();
    const opened = value.open(sealed);
    assert.deepEqual(opened.manifest, sealed.manifest);
    assert.deepEqual(opened.receipt, sealed.receipt);
    for (const file of value.files) {
      const path = file.path.split("/");
      assert.deepEqual(
        readFileSync(join(value.directory, "opened", "files", ...path)),
        readFileSync(join(value.source, ...path)),
      );
    }
    assert.equal(sealed.manifest.files.length, 3);
    assert.equal(sealed.manifest.files[0]?.path, "nested/stdout.bin");
    assert.equal(
      existsSync(join(value.directory, "opened", "files", "raw-0")),
      false,
    );
  });
});

test("raw receipts and errors exclude contents, keys, nonce and paths", () => {
  withFixture((value) => {
    const sealed = value.seal();
    const serialized = JSON.stringify(sealed.receipt);
    const transport = readFileSync(sealed.envelope.path);
    const parsed = header(transport).value;
    for (const secret of [
      value.bytes.toString("hex"),
      value.bytes.toString("base64"),
      "private-fixture-content",
      value.source,
      "stdout.bin",
      parsed.nonce,
      value.keys.privateKey
        .export({ type: "pkcs8", format: "der" })
        .toString("base64"),
    ])
      assert.equal(serialized.includes(secret), false);
    assert.equal(transport.includes(value.bytes), false);
    assert.equal(transport.includes(Buffer.from("stdout.bin")), false);
    assert.deepEqual(Object.keys(sealed.receipt).toSorted(), [
      "context",
      "envelopeBytes",
      "envelopeSha256",
      "fileCount",
      "kind",
      "previous",
      "rawBytes",
      "segmentSha256",
      "sequence",
    ]);
    assert.throws(
      () =>
        value.seal({
          outputRoot: join(value.directory, "callback-failure"),
          chain: new RawSegmentChain(binding),
          onRead: () => {
            throw new Error("secret arbitrary error and nonce");
          },
        }),
      invalid,
    );
    assert.equal(existsSync(join(value.directory, "callback-failure")), false);
  });
});

test("raw encryption uses fresh ephemeral agreement and random nonce", () => {
  withFixture((value) => {
    const first = value.seal();
    const second = value.seal({
      chain: new RawSegmentChain(binding),
      outputRoot: join(value.directory, "sealed-again"),
    });
    const a = header(readFileSync(first.envelope.path)).value;
    const b = header(readFileSync(second.envelope.path)).value;
    assert.notEqual(a.nonce, b.nonce);
    assert.notEqual(a.ephemeral, b.ephemeral);
    assert.notEqual(first.envelope.sha256, second.envelope.sha256);
    assert.equal(first.receipt.segmentSha256, second.receipt.segmentSha256);
  });
});

test("raw sealing ignores unlisted files and preserves sources", () => {
  withFixture((value) => {
    writeFileSync(join(value.source, "unlisted.bin"), "live journal tail", {
      mode: 0o600,
    });
    const before = value.files.map((file) =>
      artifact(join(value.source, ...file.path.split("/"))),
    );
    value.open(value.seal());
    assert.equal(
      existsSync(join(value.directory, "opened", "files", "unlisted.bin")),
      false,
    );
    assert.deepEqual(
      value.files.map((file) =>
        artifact(join(value.source, ...file.path.split("/"))),
      ),
      before,
    );
  });
});

for (const problem of ["missing", "stale", "wrong-length", "mode"] as const) {
  test(`raw sealing rejects ${problem} source before staging`, () => {
    withFixture((value) => {
      const path = join(value.source, "nested", "stdout.bin");
      if (problem === "missing") rmSync(path);
      if (problem === "stale")
        writeFileSync(path, Buffer.alloc(value.bytes.length));
      const entries = value.files.map((file, i) =>
        i === 0
          ? {
              ...file,
              bytes: problem === "wrong-length" ? file.bytes + 1 : file.bytes,
              mode: problem === "mode" ? file.mode ^ 0o200 : file.mode,
            }
          : file,
      );
      assert.throws(() => value.seal({ entries }), invalid);
      assert.equal(existsSync(value.options.outputRoot), false);
    });
  });
}

for (const drift of [
  "bytes",
  "replace",
  "later-file",
  "restore-bytes",
] as const) {
  test(`raw sealing deterministically rejects ${drift} during reading`, () => {
    withFixture((value) => {
      let changed = false;
      assert.throws(
        () =>
          value.seal({
            onRead: (progress) => {
              if (changed && drift === "restore-bytes") {
                writeFileSync(
                  join(value.source, "nested", "stdout.bin"),
                  value.bytes,
                );
                return;
              }
              if (changed || (drift === "later-file" && progress.file !== 1))
                return;
              changed = true;
              const path = join(value.source, "nested", "stdout.bin");
              if (drift === "replace") {
                renameSync(path, path + ".old");
                writeFileSync(path, value.bytes, { mode: 0o600 });
              } else {
                writeFileSync(path, Buffer.alloc(value.bytes.length), {
                  mode: 0o600,
                });
              }
            },
          }),
        invalid,
      );
      assert.equal(changed, true);
      assert.equal(existsSync(value.options.outputRoot), false);
    });
  });
}

test("raw sealing detects POSIX mode changes during reading", posix, () => {
  withFixture((value) => {
    const path = join(value.source, "nested", "stdout.bin");
    assert.throws(
      () => value.seal({ onRead: () => chmodSync(path, 0o400) }),
      invalid,
    );
  });
});

for (const path of [
  "/absolute",
  "../escape",
  "nested/../../escape",
  "nested/./raw",
  "",
  "C:/raw",
  "C:\\raw",
  "nested\\raw",
  "raw\u0000",
  "raw/",
  "CON",
  "a.",
]) {
  test(`raw sealing rejects unsafe path ${JSON.stringify(path)}`, () => {
    withFixture((value) => {
      assert.throws(
        () => value.seal({ entries: [{ ...value.files[0]!, path }] }),
        invalid,
      );
    });
  });
}

for (const problem of [
  "duplicate",
  "case-alias",
  "file-parent",
  "unknown-field",
]) {
  test(`raw sealing rejects closed-list ${problem}`, () => {
    withFixture((value) => {
      const file = value.files[0]!;
      const entries =
        problem === "duplicate"
          ? [file, file]
          : problem === "case-alias"
            ? [file, { ...file, path: file.path.toUpperCase() }]
            : problem === "file-parent"
              ? [file, { ...file, path: "nested" }]
              : [{ ...file, extra: "unreviewed" }];
      assert.throws(() => value.seal({ entries }), invalid);
    });
  });
}

test("raw sealing rejects nonregular file and overlapping output roots", () => {
  withFixture((value) => {
    assert.throws(
      () =>
        value.seal({
          entries: [
            {
              ...value.files[0]!,
              path: "nested",
            },
          ],
        }),
      invalid,
    );
    for (const outputRoot of [
      value.source,
      join(value.source, "destination"),
      value.directory,
    ]) {
      assert.throws(() => value.seal({ outputRoot }), invalid);
    }
  });
});

test("raw sealing rejects hard links to source files", () => {
  withFixture((value) => {
    linkSync(join(value.source, "stderr.bin"), join(value.directory, "alias"));
    assert.throws(() => value.seal(), invalid);
  });
});

for (const type of [
  "file",
  "directory",
  "root",
  "destination-parent",
] as const) {
  test(`raw sealing rejects POSIX ${type} symlink escape`, posix, () => {
    withFixture((value) => {
      const path = join(value.directory, "link");
      if (type === "file") {
        const source = join(value.source, "stderr.bin");
        renameSync(source, path);
        symlinkSync(path, source);
      } else if (type === "directory") {
        renameSync(join(value.source, "nested"), path);
        symlinkSync(path, join(value.source, "nested"));
      } else symlinkSync(value.source, path);
      const options: Partial<SealRawSegmentOptions> =
        type === "root"
          ? { privateRoot: path }
          : type === "destination-parent"
            ? { outputRoot: join(path, "out") }
            : { privateRoot: value.source };
      assert.throws(() => value.seal(options), invalid);
    });
  });
}

test(
  "raw outputs use restrictive POSIX modes without changing sources",
  posix,
  () => {
    withFixture((value) => {
      const sealed = value.seal();
      value.open(sealed);
      for (const path of [
        value.options.outputRoot,
        join(value.directory, "opened"),
        join(value.directory, "opened", "files", "nested"),
      ]) {
        assert.equal(lstatSync(path).mode & 0o777, 0o700);
      }
      for (const path of [
        sealed.envelope.path,
        join(value.directory, "sealed", "raw-0"),
        join(value.directory, "opened", "files", "nested", "stdout.bin"),
      ]) {
        assert.equal(lstatSync(path).mode & 0o777, 0o600);
      }
      assert.equal(
        lstatSync(join(value.source, "stderr.bin")).mode & 0o777,
        0o600,
      );
    });
  },
);

test(
  "raw sealing rejects a POSIX source root or file readable by others",
  posix,
  () => {
    withFixture((value) => {
      chmodSync(value.source, 0o755);
      assert.throws(() => value.seal(), invalid);
      chmodSync(value.source, 0o700);
      chmodSync(join(value.source, "stderr.bin"), 0o644);
      assert.throws(() => value.seal(), invalid);
    });
  },
);

test("raw outputs never overwrite existing directories or files", () => {
  withFixture((value) => {
    const sealed = value.seal();
    const snapshot = readFileSync(sealed.envelope.path);
    assert.throws(
      () => value.seal({ chain: new RawSegmentChain(binding) }),
      invalid,
    );
    assert.deepEqual(readFileSync(sealed.envelope.path), snapshot);
    const output = join(value.directory, "occupied");
    writeFileSync(output, "keep caller bytes", { mode: 0o600 });
    assert.throws(() => value.seal({ outputRoot: output }), invalid);
    assert.equal(readFileSync(output, "utf8"), "keep caller bytes");
    assert.throws(() => value.open(sealed, "sealed"), invalid);
    assert.deepEqual(readFileSync(sealed.envelope.path), snapshot);
    assert.throws(() => value.open(sealed, "occupied"), invalid);
    assert.equal(readFileSync(output, "utf8"), "keep caller bytes");
  });
});

for (const failure of [
  "ciphertext",
  "tag",
  "truncate",
  "extra",
  "stale-hash",
]) {
  test(`raw opening rejects ${failure} without returning plaintext`, () => {
    withFixture((value) => {
      const sealed = value.seal();
      let bytes = readFileSync(sealed.envelope.path);
      const offset = 12 + header(bytes).size;
      if (failure === "ciphertext") bytes[offset + 5]! ^= 1;
      if (failure === "tag") bytes[bytes.length - 1]! ^= 1;
      if (failure === "truncate") bytes = bytes.subarray(0, bytes.length - 1);
      if (failure === "extra") bytes = Buffer.concat([bytes, Buffer.from([0])]);
      const modified = replaceEnvelope(value, sealed, bytes);
      assert.throws(
        () =>
          value.open(
            failure === "stale-hash"
              ? {
                  ...modified,
                  envelope: { ...modified.envelope, sha256: "0".repeat(64) },
                }
              : modified,
          ),
        invalid,
      );
      assert.equal(existsSync(join(value.directory, "opened")), false);
      // A failed authentication never advances Root's independent chain.
      assert.doesNotThrow(() => value.open(sealed));
    });
  });
}

const headerChanges: readonly [string, (value: any) => void][] = [
  [
    "unknown field",
    (value) => {
      value.extra = "plaintext secret";
    },
  ],
  [
    "version",
    (value) => {
      value.schema = 2;
    },
  ],
  [
    "algorithm",
    (value) => {
      value.algorithm = "AES-128-CBC";
    },
  ],
  [
    "nonce length",
    (value) => {
      value.nonce = "AA==";
    },
  ],
  [
    "key algorithm",
    (value) => {
      value.ephemeral = generateKeyPairSync("ed25519")
        .publicKey.export({
          type: "spki",
          format: "der",
        })
        .toString("base64");
    },
  ],
  [
    "key encoding",
    (value) => {
      value.ephemeral = "AA==";
    },
  ],
  [
    "pin",
    (value) => {
      value.recipientPin = "c".repeat(64);
    },
  ],
  [
    "context",
    (value) => {
      value.context.job = "12";
    },
  ],
  [
    "unknown context",
    (value) => {
      value.context.environment = "secret";
    },
  ],
  [
    "manifest size",
    (value) => {
      value.manifestBytes = 9000;
    },
  ],
  [
    "manifest hash",
    (value) => {
      value.manifestSha256 = "f".repeat(64);
    },
  ],
  [
    "raw size",
    (value) => {
      value.rawBytes++;
    },
  ],
];
for (const [label, mutate] of headerChanges) {
  test(`raw opening rejects envelope header ${label}`, () => {
    withFixture((value) => {
      const sealed = value.seal();
      const bytes = changedHeader(readFileSync(sealed.envelope.path), mutate);
      assert.throws(
        () => value.open(replaceEnvelope(value, sealed, bytes)),
        invalid,
      );
      assert.equal(existsSync(join(value.directory, "opened")), false);
    });
  });
}

test("raw opening rejects malformed and oversize headers", () => {
  const changes: readonly ((bytes: Buffer) => Buffer)[] = [
    (bytes) => {
      bytes.writeUInt32BE(4097, 8);
      return bytes;
    },
    (bytes) => {
      bytes[12] = 255;
      return bytes;
    },
    (bytes) => {
      bytes[0] = 0;
      return bytes;
    },
    (bytes) => bytes.subarray(0, 10),
    (bytes) => {
      const parsed = header(bytes);
      const body = bytes
        .subarray(12, 12 + parsed.size)
        .toString("utf8")
        .replace('{"schema":1,', '{"schema":1,"schema":1,');
      const prefix = Buffer.from(bytes.subarray(0, 12));
      prefix.writeUInt32BE(Buffer.byteLength(body), 8);
      return Buffer.concat([
        prefix,
        Buffer.from(body),
        bytes.subarray(12 + parsed.size),
      ]);
    },
  ];
  changes.forEach((change) =>
    withFixture((value) => {
      const sealed = value.seal();
      assert.throws(
        () =>
          value.open(
            replaceEnvelope(
              value,
              sealed,
              change(readFileSync(sealed.envelope.path)),
            ),
          ),
        invalid,
      );
    }),
  );
});

for (const wrong of [
  "recipient",
  "pin",
  "private-algorithm",
  "public-as-private",
]) {
  test(`raw key boundary rejects ${wrong}`, () => {
    withFixture((value) => {
      const sealed = value.seal();
      const other = generateKeyPairSync("x25519");
      assert.throws(
        () =>
          openRawSegment({
            envelope: sealed.envelope,
            expectedKind: "pre-release",
            outputRoot: join(value.directory, "wrong-key"),
            chain: value.collector,
            limits: cap,
            recipientPin: wrong === "pin" ? "c".repeat(64) : value.pin,
            privateKey:
              wrong === "recipient"
                ? other.privateKey
                : wrong === "private-algorithm"
                  ? generateKeyPairSync("ed25519").privateKey
                  : wrong === "public-as-private"
                    ? value.keys.publicKey
                    : value.keys.privateKey,
          }),
        invalid,
      );
      assert.doesNotThrow(() => value.open(sealed));
    });
  });
}

test("raw seal rejects wrong key algorithms and unpinned recipients", () => {
  withFixture((value) => {
    assert.throws(() => rawRecipientPin(value.keys.privateKey), invalid);
    assert.throws(() => value.seal({ recipientPin: "a".repeat(64) }), invalid);
    assert.throws(
      () =>
        value.seal({
          recipient: generateKeyPairSync("ed25519").publicKey,
        }),
      invalid,
    );
  });
});

test("raw transport rejects excess and streams bounded chunks", () => {
  withFixture((value) => {
    const data = Buffer.alloc(1_048_579, 255);
    data[500] = 0;
    const source = join(value.source, "large.bin");
    writeFileSync(source, data, { mode: 0o600 });
    const file = {
      ...artifact(source),
      path: "large.bin",
      mode: lstatSync(source).mode & 0o777,
    };
    for (const limits of [
      { ...cap, maxTotalBytes: 10 },
      { ...cap, maxFileBytes: 10 },
      { ...cap, maxFiles: 0 },
      { ...cap, chunkBytes: 0 },
      { ...cap, chunkBytes: Infinity },
      { ...cap, maxTotalBytes: NaN },
      { ...cap, maxHeaderBytes: 2 },
      { ...cap, maxManifestBytes: 2 },
    ])
      assert.throws(() => value.seal({ entries: [file], limits }), invalid);
    let observed = 0;
    let calls = 0;
    const sealed = value.seal({
      entries: [file],
      limits: { ...cap, chunkBytes: 4093 },
      onRead: ({ bytes }) => {
        assert.ok(bytes - observed <= 4093);
        observed = bytes;
        calls++;
      },
    });
    assert.equal(observed, data.length);
    assert.ok(calls > 250);
    value.open(sealed);
    assert.deepEqual(
      readFileSync(join(value.directory, "opened", "files", "large.bin")),
      data,
    );
    assert.equal(sealed.receipt.rawBytes, data.length);
  });
});

test("raw segments link closed pre-release files and fresh tails", () => {
  withFixture((value) => {
    const first = value.seal();
    value.open(first, "opened-0");
    const raw = join(value.source, "stderr.bin");
    writeFileSync(raw, Buffer.from([0, 255, 4, 5]), { mode: 0o600 });
    const tailEntry = {
      ...artifact(raw),
      path: "stderr.bin",
      mode: lstatSync(raw).mode & 0o777,
    };
    const second = value.seal({
      kind: "release-tail",
      entries: [tailEntry],
      outputRoot: join(value.directory, "sealed-1"),
    });
    const third = value.seal({
      kind: "supervisor-tail",
      entries: [tailEntry],
      outputRoot: join(value.directory, "sealed-2"),
    });
    const fourth = value.seal({
      kind: "ordered-tail",
      entries: [tailEntry],
      outputRoot: join(value.directory, "sealed-3"),
    });
    assert.equal(second.receipt.previous, first.receipt.segmentSha256);
    assert.equal(third.receipt.previous, second.receipt.segmentSha256);
    assert.equal(fourth.receipt.previous, third.receipt.segmentSha256);
    assert.throws(() => value.open(third, "out-of-order"), invalid);
    assert.doesNotThrow(() => value.open(second, "opened-1"));
    assert.throws(() => value.open(second, "replayed"), invalid);
    assert.doesNotThrow(() => value.open(third, "opened-2"));
    assert.doesNotThrow(() => value.open(fourth, "opened-3"));
    assert.throws(
      () =>
        value.seal({
          outputRoot: join(value.directory, "late-pre"),
          entries: [tailEntry],
        }),
      invalid,
    );
    assert.equal("accepted" in fourth.receipt, false);
    assert.equal("success" in fourth.receipt, false);
    assert.equal("terminal" in fourth.receipt, false);
  });
});

test("raw chains reject forks, replays and context substitution", () => {
  withFixture((value) => {
    assert.throws(() => value.seal({ kind: "release-tail" }), invalid);
    const first = value.seal();
    const fork = value.seal({
      chain: new RawSegmentChain(binding),
      outputRoot: join(value.directory, "fork"),
      entries: value.files.toReversed(),
    });
    const forkTail = value.seal({
      chain: (() => {
        const chain = new RawSegmentChain(binding);
        sealRawSegment({
          ...value.options,
          chain,
          entries: value.files.toReversed(),
          outputRoot: join(value.directory, "fork-copy"),
        });
        return chain;
      })(),
      outputRoot: join(value.directory, "fork-tail"),
      kind: "release-tail",
    });
    assert.notEqual(first.receipt.segmentSha256, fork.receipt.segmentSha256);
    value.open(first);
    assert.throws(() => value.open(first, "replayed"), invalid);
    assert.throws(() => value.open(forkTail, "fork-open"), invalid);
    // SAFETY: binding is the fixed closed fixture literal above.
    for (const field of Object.keys(binding) as (keyof RawSegmentContext)[]) {
      const changed = {
        ...binding,
        [field]:
          field === "commit" || field === "tree"
            ? "d".repeat(40)
            : field === "role"
              ? "companion"
              : field === "repository"
                ? "other/fixture"
                : ["run", "attempt", "job"].includes(field)
                  ? "999"
                  : "other-session",
      };
      assert.throws(
        () =>
          openRawSegment({
            envelope: first.envelope,
            expectedKind: "pre-release",
            outputRoot: join(value.directory, `bad-${field}`),
            chain: new RawSegmentChain(changed),
            privateKey: value.keys.privateKey,
            recipientPin: value.pin,
            limits: cap,
          }),
        invalid,
      );
    }
  });
});

/** Re-encrypt fixture metadata independently to test authenticated input. */
function rewrittenManifest(
  value: ReturnType<typeof fixture>,
  sealed: SealedRawSegment,
  mutate: (manifest: any) => void,
): Buffer {
  const bytes = readFileSync(sealed.envelope.path);
  const parsed = header(bytes);
  const start = 12 + parsed.size;
  const aad = bytes.subarray(0, start);
  const peer = createPublicKey({
    key: Buffer.from(parsed.value.ephemeral, "base64"),
    format: "der",
    type: "spki",
  });
  const shared = diffieHellman({
    privateKey: value.keys.privateKey,
    publicKey: peer,
  });
  const secret = hkdfSync(
    "sha256",
    shared,
    createHash("sha256").update(aad).digest(),
    Buffer.from("oseo-private-raw-segment-v1"),
    32,
  );
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(secret),
    Buffer.from(parsed.value.nonce, "base64"),
  );
  decipher.setAAD(aad);
  decipher.setAuthTag(bytes.subarray(bytes.length - 16));
  const plaintext = Buffer.concat([
    decipher.update(bytes.subarray(start, bytes.length - 16)),
    decipher.final(),
  ]);
  const manifest = JSON.parse(
    plaintext.subarray(0, parsed.value.manifestBytes).toString("utf8"),
  );
  mutate(manifest);
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const payload = Buffer.concat([
    manifestBytes,
    plaintext.subarray(parsed.value.manifestBytes),
  ]);
  const ephemeral = generateKeyPairSync("x25519");
  parsed.value.ephemeral = ephemeral.publicKey
    .export({
      type: "spki",
      format: "der",
    })
    .toString("base64");
  parsed.value.nonce = randomBytes(12).toString("base64");
  parsed.value.manifestBytes = manifestBytes.length;
  parsed.value.manifestSha256 = createHash("sha256")
    .update(manifestBytes)
    .digest("hex");
  const newBody = Buffer.from(JSON.stringify(parsed.value));
  const prefix = Buffer.from(bytes.subarray(0, 12));
  prefix.writeUInt32BE(newBody.length, 8);
  const newAad = Buffer.concat([prefix, newBody]);
  const newShared = diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: value.keys.publicKey,
  });
  const newSecret = hkdfSync(
    "sha256",
    newShared,
    createHash("sha256").update(newAad).digest(),
    Buffer.from("oseo-private-raw-segment-v1"),
    32,
  );
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(newSecret),
    Buffer.from(parsed.value.nonce, "base64"),
  );
  cipher.setAAD(newAad);
  return Buffer.concat([
    newAad,
    cipher.update(payload),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
}

test("raw collector verifies plaintext H hashes after valid GCM", () => {
  withFixture((value) => {
    const sealed = value.seal();
    const modified = replaceEnvelope(
      value,
      sealed,
      rewrittenManifest(value, sealed, (manifest) => {
        manifest.files[0].sha256 = "e".repeat(64);
      }),
    );
    assert.throws(() => value.open(modified), invalid);
    assert.equal(existsSync(join(value.directory, "opened")), false);
    assert.doesNotThrow(() => value.open(sealed));
  });
});

test("raw collector requires independently expected segment kind", () => {
  withFixture((value) => {
    const sealed = value.seal();
    assert.throws(
      () =>
        openRawSegment({
          envelope: sealed.envelope,
          outputRoot: join(value.directory, "wrong-kind"),
          chain: value.collector,
          expectedKind: "release-tail",
          privateKey: value.keys.privateKey,
          recipientPin: value.pin,
          limits: cap,
        }),
      invalid,
    );
    assert.equal(value.collector.nextSequence, 0);
    value.open(sealed);
    assert.equal(value.collector.nextSequence, 1);
  });
});

for (const problem of [
  "unknown-field",
  "traversal",
  "duplicate",
  "mode",
] as const) {
  test(`raw collector rejects authenticated manifest ${problem}`, () => {
    withFixture((value) => {
      const sealed = value.seal();
      const bytes = rewrittenManifest(value, sealed, (manifest) => {
        if (problem === "unknown-field")
          manifest.files[0].secret = "unreviewed";
        if (problem === "traversal") manifest.files[0].path = "../escape";
        if (problem === "duplicate")
          manifest.files[1].path = manifest.files[0].path;
        if (problem === "mode") manifest.files[0].mode = -1;
      });
      assert.throws(
        () => value.open(replaceEnvelope(value, sealed, bytes)),
        invalid,
      );
      assert.equal(existsSync(join(value.directory, "opened")), false);
      assert.equal(existsSync(join(value.directory, "escape")), false);
    });
  });
}

test("raw chain supports multiple closed segments before release", () => {
  withFixture((value) => {
    const first = value.seal();
    const next = value.seal({
      outputRoot: join(value.directory, "next-closed"),
    });
    value.open(first, "first");
    value.open(next, "next");
    assert.equal(next.manifest.kind, "pre-release");
    assert.equal(next.manifest.sequence, 1);
    assert.equal(next.manifest.previous, first.receipt.segmentSha256);
  });
});

test("raw chain reserves its sequence during reentrant callbacks", () => {
  withFixture((value) => {
    let attempted = false;
    const sealed = value.seal({
      onRead: () => {
        if (attempted) return;
        attempted = true;
        assert.throws(
          () =>
            value.seal({
              outputRoot: join(value.directory, "nested-seal"),
            }),
          invalid,
        );
      },
    });
    assert.equal(attempted, true);
    assert.equal(existsSync(join(value.directory, "nested-seal")), false);
    assert.equal(value.producer.nextSequence, 1);
    value.open(sealed);
  });
});

/** Model coarse metadata in a copy; filesystem times stay unchanged. */
async function withCoarseMetadata(
  phase: "stable" | "late-file" | "after-encryption",
  run: (
    value: ReturnType<typeof fixture>,
    raw: typeof import("../tools/perf/private-raw-segments.ts"),
  ) => void,
): Promise<void> {
  const value = fixture();
  try {
    const { pathToFileURL } = await import("node:url");
    const original = readFileSync(
      new URL("../tools/perf/private-raw-segments.ts", import.meta.url),
      "utf8",
    );
    assert.equal(original.split("stat.mtimeNs,").length, 2);
    assert.equal(original.split("stat.ctimeNs,").length, 2);
    let source = original
      .replace("stat.mtimeNs,", "0n, /* test-only coarse mtime */")
      .replace("stat.ctimeNs,", "0n, /* test-only coarse ctime */")
      .replace(
        '"../value-kinds.ts"',
        JSON.stringify(
          new URL("../tools/value-kinds.ts", import.meta.url).href,
        ),
      );
    if (phase === "after-encryption") {
      const boundary = "const currentRoot = lstatSync(root, { bigint: true });";
      assert.equal(source.split(boundary).length, 2);
      const mutation =
        "injectedWrite(join(root, ...files[0].path.split('/')), ";
      source =
        'import { writeFileSync as injectedWrite } from "node:fs";\n' +
        source.replace(
          boundary,
          mutation + "Buffer.alloc(files[0].bytes));\n" + boundary,
        );
    }
    const path = join(value.directory, "coarse-raw.ts");
    writeFileSync(path, source, { mode: 0o600 });
    const raw: typeof import("../tools/perf/private-raw-segments.ts") =
      await import(pathToFileURL(path).href);
    run(value, raw);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
}

const coarseLateDrift =
  "raw revalidation detects same-size late drift with coarse metadata";
test(coarseLateDrift, async () => {
  await withCoarseMetadata("late-file", (value, raw) => {
    const chain = new raw.RawSegmentChain(binding);
    let changed = false;
    assert.throws(
      () =>
        raw.sealRawSegment({
          ...value.options,
          chain,
          onRead: (progress) => {
            if (changed || progress.file !== 1) return;
            changed = true;
            writeFileSync(
              join(value.source, "nested", "stdout.bin"),
              Buffer.alloc(value.bytes.length),
            );
          },
        }),
      invalid,
    );
    assert.equal(changed, true);
    assert.equal(chain.nextSequence, 0);
    assert.equal(existsSync(value.options.outputRoot), false);
  });
});

const coarseFinalDrift =
  "raw final acceptance detects post-encryption drift with coarse metadata";
test(coarseFinalDrift, async () => {
  await withCoarseMetadata("after-encryption", (value, raw) => {
    const chain = new raw.RawSegmentChain(binding);
    assert.throws(
      () => raw.sealRawSegment({ ...value.options, chain }),
      invalid,
    );
    assert.deepEqual(
      readFileSync(join(value.source, "nested", "stdout.bin")),
      Buffer.alloc(value.bytes.length),
    );
    assert.equal(chain.nextSequence, 0);
    assert.equal(existsSync(value.options.outputRoot), false);
  });
});

const coarseStableInput =
  "raw stable coarse-metadata input cross-opens without callback replay";
test(coarseStableInput, async () => {
  await withCoarseMetadata("stable", (value, raw) => {
    const progress: { file: number; bytes: number }[] = [];
    const sealed = raw.sealRawSegment({
      ...value.options,
      chain: new raw.RawSegmentChain(binding),
      onRead: (event) => progress.push(event),
    });
    assert.deepEqual(progress, [
      { file: 0, bytes: 31 },
      { file: 0, bytes: value.bytes.length },
      { file: 1, bytes: 3 },
    ]);
    const opened = value.open(sealed);
    assert.deepEqual(opened.manifest, sealed.manifest);
    assert.deepEqual(
      readFileSync(
        join(value.directory, "opened", "files", "nested", "stdout.bin"),
      ),
      value.bytes,
    );
    assert.equal(value.collector.nextSequence, 1);
  });
});
