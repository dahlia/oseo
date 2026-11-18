import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  RootPhaseIssuer,
  RootPhaseVerifier,
  rootKeyPin,
  requireNativeOrigin,
  validateNativeContext,
} from "../tools/perf/native-admission.ts";
import type {
  GitHubNativeContext,
  LocalNativeContext,
  NativeContext,
  RootPhaseDecision,
  RootPhaseReceipt,
} from "../tools/perf/native-admission.ts";
import { artifact } from "../tools/perf/evidence.ts";
import type { ComparisonRequest } from "../tools/perf/ordered-comparison.ts";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "oseo-admission-"));
  const raw = join(directory, "decision.bin");
  const manifest = join(directory, "built.json");
  writeFileSync(raw, Buffer.from([0, 0xff, 13, 10]), { mode: 0o600 });
  writeFileSync(manifest, "fixture only, no native build", { mode: 0o600 });
  const keys = generateKeyPairSync("ed25519");
  const pin = rootKeyPin(keys.publicKey);
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
    manifest: artifact(manifest),
    accounts: ["fixture-linux"],
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
        account: "fixture",
        uid: 1234,
        hardwareUuid: "11111111-1111-1111-1111-111111111111",
        bootUuid: "22222222-2222-2222-2222-222222222222",
        platform: "linux",
        arch: "x64",
      },
    ],
  };
  const request: ComparisonRequest = {
    id: "request-profile",
    phase: "profile-admission",
    runId: context.comparisonRunId,
    manifest: context.manifest,
    destination: join(directory, "request-profile"),
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
  const decision: RootPhaseDecision = {
    schema: 1,
    issuer: "Root",
    keyPin: pin,
    purpose: "profile",
    requestId: request.id,
    context,
    issuedMs: 1000,
    expiresMs: 2000,
    decision: "admit",
    raw: [artifact(raw)],
  };
  const issuer = new RootPhaseIssuer(keys.privateKey, pin);
  const verifier = new RootPhaseVerifier(keys.publicKey, pin, 16);
  const receipt = issuer.issue(decision, 1100);
  const accept = (
    candidate = receipt,
    req = request,
    ctx: NativeContext = context,
    purpose: "profile" | "timing" = "profile",
    now = 1200,
  ) =>
    verifier.accept(
      candidate,
      req,
      ctx,
      purpose,
      () => now,
      async () => {},
    );
  const signed = (value: RootPhaseDecision): RootPhaseReceipt => {
    const payload = JSON.stringify(value);
    return {
      payload,
      signature: sign(null, Buffer.from(payload), keys.privateKey).toString(
        "base64",
      ),
    };
  };
  return {
    directory,
    raw,
    manifest,
    keys,
    pin,
    context,
    request,
    decision,
    issuer,
    verifier,
    receipt,
    accept,
    signed,
    clean: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test("Root receipt pins the public key and exact payload bytes", async () => {
  const f = fixture();
  try {
    let adjudicated = false;
    const result = await f.verifier.accept(
      f.receipt,
      f.request,
      f.context,
      "profile",
      () => 1200,
      async (decision) => {
        assert.deepEqual(decision.context, f.context);
        adjudicated = true;
      },
    );
    assert.equal(adjudicated, true);
    assert.equal(result.authority, "Root");
    assert.deepEqual(result.raw, f.decision.raw);
    assert.deepEqual(Object.keys(f.receipt).toSorted(), [
      "payload",
      "signature",
    ]);
    assert.doesNotMatch(JSON.stringify(f.receipt), /PRIVATE KEY|nonce/u);
    await assert.rejects(f.accept(), /Invalid Root/u);
  } finally {
    f.clean();
  }
});

test("Root receipt rejects caller keys and tampering", async () => {
  const f = fixture();
  try {
    const attacker = generateKeyPairSync("ed25519");
    assert.throws(() => new RootPhaseVerifier(attacker.publicKey, f.pin, 16));
    assert.throws(() => new RootPhaseVerifier(f.keys.privateKey, f.pin, 16));
    assert.throws(() => new RootPhaseIssuer(attacker.privateKey, f.pin));
    await assert.rejects(
      f.accept({
        payload: f.receipt.payload,
        signature: sign(
          null,
          Buffer.from(f.receipt.payload),
          attacker.privateKey,
        ).toString("base64"),
      }),
    );
    await assert.rejects(
      f.accept({
        ...f.receipt,
        payload: f.receipt.payload.replace('"admit"', '"reject"'),
      }),
    );
    // SAFETY: Exercise the receipt's closed schema against an extra wire key.
    const withKey = { ...f.receipt, publicKey: "attacker" } as RootPhaseReceipt;
    await assert.rejects(f.accept(withKey));
  } finally {
    f.clean();
  }
});

for (const field of [
  "session",
  "repository",
  "run",
  "attempt",
  "commit",
  "tree",
  "comparisonRunId",
] as const) {
  test(`Root receipt rejects changed ${field} binding`, async () => {
    const f = fixture();
    try {
      const context = { ...f.context, [field]: "different" };
      await assert.rejects(f.accept(f.receipt, f.request, context));
    } finally {
      f.clean();
    }
  });
}

for (const field of [
  "job",
  "runnerId",
  "runnerName",
  "account",
  "uid",
  "hardwareUuid",
  "bootUuid",
  "role",
] as const) {
  test(`Root receipt rejects a different expected ${field}`, async () => {
    const f = fixture();
    try {
      // SAFETY: Wrong-origin fixture intentionally violates the public type.
      const context = {
        ...f.context,
        jobs: [
          {
            ...f.context.jobs[0]!,
            [field]: field === "uid" ? 9876 : "changed",
          },
        ],
      } as GitHubNativeContext;
      await assert.rejects(f.accept(f.receipt, f.request, context));
    } finally {
      f.clean();
    }
  });
}

for (const kind of [
  "expired",
  "future",
  "issuer",
  "schema",
  "purpose",
  "request",
  "unknown",
  "extra",
  "denied",
  "empty-raw",
] as const) {
  test(`Root receipt fails closed for ${kind}`, async () => {
    const f = fixture();
    try {
      const changes = {
        expired: { expiresMs: 1200 },
        future: { issuedMs: 1300 },
        issuer: { issuer: "child" },
        schema: { schema: 2 },
        purpose: { purpose: "timing" },
        request: { requestId: "other-request" },
        unknown: { decision: "unknown" },
        extra: { secret: "forbidden" },
        denied: { decision: "reject" },
        "empty-raw": { raw: [] },
      };
      // SAFETY: Malformed signed inputs bypass the issuer to test the verifier.
      const value = { ...f.decision, ...changes[kind] } as RootPhaseDecision;
      await assert.rejects(f.accept(f.signed(value)));
    } finally {
      f.clean();
    }
  });
}

test("Root issuer rejects incomplete or unknown context", () => {
  const f = fixture();
  try {
    assert.throws(() =>
      f.issuer.issue(
        { ...f.decision, context: { ...f.context, jobs: [] } },
        1100,
      ),
    );
    // SAFETY: Explicit malformed issuer fixture, never a production key.
    const incomplete = { issuer: "Root" } as RootPhaseDecision;
    assert.throws(() => f.issuer.issue(incomplete, 1100));
    assert.throws(() =>
      f.issuer.issue({ ...f.decision, decision: "reject", raw: [] }, 1100),
    );
  } finally {
    f.clean();
  }
});

test("Root evidence hashes and H manifest bytes must still match", async () => {
  const f = fixture();
  try {
    writeFileSync(f.raw, "changed");
    await assert.rejects(f.accept());
    const fresh = fixture();
    try {
      writeFileSync(fresh.manifest, "changed");
      await assert.rejects(fresh.accept());
    } finally {
      fresh.clean();
    }
  } finally {
    f.clean();
  }
});

test("Root adjudication failure consumes the receipt", async () => {
  const f = fixture();
  try {
    await assert.rejects(
      f.verifier.accept(
        f.receipt,
        f.request,
        f.context,
        "profile",
        () => 1200,
        async () => {
          throw new Error("private collector failure");
        },
      ),
      (error: Error) => {
        assert.doesNotMatch(error.message, /private collector/u);
        return /Invalid Root/u.test(error.message);
      },
    );
    await assert.rejects(f.accept());
  } finally {
    f.clean();
  }
});

test("Root replay state covers concurrency and late expiry", async () => {
  const f = fixture();
  try {
    let now = 1200;
    const deferred = Promise.withResolvers<void>();
    const pending = f.verifier.accept(
      f.receipt,
      f.request,
      f.context,
      "profile",
      () => now,
      () => deferred.promise,
    );
    await assert.rejects(f.accept());
    now = 2000;
    deferred.resolve();
    await assert.rejects(pending);
  } finally {
    f.clean();
  }
});

test("Root profile receipt cannot open a separate timing request", async () => {
  const f = fixture();
  try {
    await assert.rejects(
      f.accept(
        f.receipt,
        { ...f.request, id: "request-timing", phase: "timing-admission" },
        f.context,
        "timing",
      ),
    );
    const timing = {
      ...f.decision,
      purpose: "timing" as const,
      requestId: "request-timing",
    };
    assert.equal(
      (
        await f.accept(
          f.issuer.issue(timing, 1100),
          { ...f.request, id: "request-timing", phase: "timing-admission" },
          f.context,
          "timing",
        )
      ).purpose,
      "timing",
    );
  } finally {
    f.clean();
  }
});

test("Root one-use state survives expiry and fresh signing", async () => {
  const f = fixture();
  try {
    await f.accept();
    const later = f.issuer.issue(
      { ...f.decision, issuedMs: 2100, expiresMs: 3100 },
      2200,
    );
    await assert.rejects(
      f.accept(later, f.request, f.context, "profile", 2300),
    );
  } finally {
    f.clean();
  }
});

test("Root replay storage refuses overflow without eviction", async () => {
  const f = fixture();
  try {
    const verifier = new RootPhaseVerifier(f.keys.publicKey, f.pin, 1);
    await verifier.accept(
      f.receipt,
      f.request,
      f.context,
      "profile",
      () => 1200,
      async () => {},
    );
    const request = { ...f.request, id: "second-profile" };
    const receipt = f.issuer.issue(
      { ...f.decision, requestId: request.id },
      1100,
    );
    await assert.rejects(
      verifier.accept(
        receipt,
        request,
        f.context,
        "profile",
        () => 1200,
        async () => {},
      ),
    );
    await assert.rejects(
      verifier.accept(
        f.receipt,
        f.request,
        f.context,
        "profile",
        () => 1200,
        async () => {},
      ),
    );
  } finally {
    f.clean();
  }
});

test("Root issuer rejects coerced numeric identifiers", () => {
  const f = fixture();
  try {
    // SAFETY: JSON numbers are malformed for string IDs, even if numeric.
    const context = JSON.parse(
      JSON.stringify({ ...f.context, run: 123 }),
    ) as GitHubNativeContext;
    assert.throws(() => f.issuer.issue({ ...f.decision, context }, 1100));
  } finally {
    f.clean();
  }
});

test("Root rejects nonscalar or nil inventory identities", () => {
  const f = fixture();
  try {
    for (const field of ["hardwareUuid", "bootUuid"] as const) {
      for (const value of [
        [f.context.jobs[0]![field]],
        "00000000-0000-0000-0000-000000000000",
      ]) {
        // SAFETY: Exercise malformed serialized inventory at the public API.
        const context = JSON.parse(
          JSON.stringify({
            ...f.context,
            jobs: [{ ...f.context.jobs[0], [field]: value }],
          }),
        ) as GitHubNativeContext;
        assert.throws(() => f.issuer.issue({ ...f.decision, context }, 1100));
      }
    }
  } finally {
    f.clean();
  }
});

test("Root rejects expected binding drift during adjudication", async () => {
  await Promise.all(
    ["request", "inventory"].map(async (field) => {
      const f = fixture();
      try {
        await assert.rejects(
          f.verifier.accept(
            f.receipt,
            f.request,
            f.context,
            "profile",
            () => 1200,
            async () => {
              if (field === "request")
                Object.assign(f.request, { id: "other-id" });
              else
                Object.assign(f.context.jobs[0]!, { account: "other-account" });
            },
          ),
        );
      } finally {
        f.clean();
      }
    }),
  );
});

function localFixture() {
  const f = fixture();
  const context: LocalNativeContext = {
    schema: 1,
    origin: "local-linux",
    session: f.context.session,
    repository: f.context.repository,
    comparisonRunId: f.context.comparisonRunId,
    commit: f.context.commit,
    tree: f.context.tree,
    manifest: f.context.manifest,
    accounts: f.context.accounts,
    checkout: f.directory,
    checkoutDirty: false,
    host: {
      hostname: "fixture",
      machineId: "1".repeat(32),
      bootId: "22222222-2222-2222-2222-222222222222",
      pidNamespace: "pid:[123]",
    },
    parent: {
      pid: 101,
      ppid: 100,
      uid: 1000,
      group: 100,
      sid: 100,
      startTicks: "10",
    },
    child: {
      pid: 102,
      ppid: 101,
      uid: 1000,
      group: 102,
      sid: 102,
      startTicks: "11",
    },
    entry: artifact(f.manifest),
  };
  const decision = { ...f.decision, context };
  const receipt = f.issuer.issue(decision, 1100);
  return {
    ...f,
    local: context,
    localDecision: decision,
    localReceipt: receipt,
  };
}

test("local admission explicitly separates GitHub identity", async () => {
  const f = localFixture();
  try {
    requireNativeOrigin(f.local, "local-linux");
    assert.throws(() => requireNativeOrigin(f.local, "github"));
    assert.throws(() => requireNativeOrigin(f.context, "local-linux"));
    requireNativeOrigin(f.context, "github");
    for (const field of ["run", "attempt", "jobs", "runnerId", "job"])
      assert.equal(field in f.local, false);
    await f.accept(f.localReceipt, f.request, f.local);
    await assert.rejects(f.accept(f.localReceipt, f.request, f.local));
  } finally {
    f.clean();
  }
});

for (const field of [
  "boot",
  "machine",
  "hostname",
  "namespace",
  "parent-pid",
  "parent-uid",
  "parent-birth",
  "child-pid",
  "child-uid",
  "child-birth",
  "session",
  "commit",
  "tree",
  "manifest",
  "entry",
  "checkout",
  "dirty",
  "purpose",
  "expiry",
  "key",
  "github",
  "missing-origin",
  "unknown-origin",
  "forged-origin",
  "injected-job",
] as const) {
  test(`local Root admission rejects ${field} substitution`, async () => {
    const f = localFixture();
    try {
      const ctx = structuredClone(f.local);
      const decision = structuredClone(f.localDecision);
      switch (field) {
        case "boot":
          Object.assign(ctx.host, {
            bootId: "33333333-3333-3333-3333-333333333333",
          });
          break;
        case "machine":
          Object.assign(ctx.host, { machineId: "2".repeat(32) });
          break;
        case "hostname":
          Object.assign(ctx.host, { hostname: "other" });
          break;
        case "namespace":
          Object.assign(ctx.host, { pidNamespace: "pid:[456]" });
          break;
        case "parent-pid":
          Object.assign(ctx.parent, { pid: 103 });
          Object.assign(ctx.child, { ppid: 103 });
          break;
        case "parent-uid":
          Object.assign(ctx.parent, { uid: 1001 });
          Object.assign(ctx.child, { uid: 1001 });
          Object.assign(ctx.parent, { uid: 1001 });
          break;
        case "parent-birth":
          Object.assign(ctx.parent, { startTicks: "9" });
          break;
        case "child-pid":
          Object.assign(ctx.child, { pid: 103, group: 103, sid: 103 });
          break;
        case "child-uid":
          Object.assign(ctx.child, { uid: 1001 });
          Object.assign(ctx.parent, { uid: 1001 });
          break;
        case "child-birth":
          Object.assign(ctx.child, { startTicks: "12" });
          break;
        case "session":
          Object.assign(ctx, { session: "other" });
          break;
        case "commit":
          Object.assign(ctx, { commit: "c".repeat(40) });
          break;
        case "tree":
          Object.assign(ctx, { tree: "c".repeat(40) });
          break;
        case "manifest":
          Object.assign(ctx.manifest, { sha256: "c".repeat(64) });
          break;
        case "entry":
          Object.assign(ctx.entry, { sha256: "c".repeat(64) });
          break;
        case "checkout":
          Object.assign(ctx, { checkout: join(f.directory, "other") });
          break;
        case "dirty":
          Object.assign(ctx, { checkoutDirty: true });
          break;
        case "purpose":
          Object.assign(decision, { purpose: "timing" });
          break;
        case "expiry":
          Object.assign(decision, { expiresMs: 1200 });
          break;
        case "key":
          Object.assign(decision, { keyPin: "c".repeat(64) });
          break;
        case "github":
          Object.assign(decision, { context: f.context });
          break;
        case "missing-origin":
          Reflect.deleteProperty(ctx, "origin");
          break;
        case "unknown-origin":
          Object.assign(ctx, { origin: "unknown" });
          break;
        case "forged-origin":
          Object.assign(ctx, { origin: "github" });
          break;
        case "injected-job":
          Object.assign(ctx, { jobs: f.context.jobs });
          break;
      }
      const receipt = ["purpose", "expiry", "key", "github"].includes(field)
        ? f.signed(decision)
        : f.localReceipt;
      await assert.rejects(f.accept(receipt, f.request, ctx));
    } finally {
      f.clean();
    }
  });
}

test("local context rejects missing birth and unowned children", () => {
  const f = localFixture();
  try {
    for (const delta of [
      { startTicks: "0" },
      { startTicks: 10 },
      { pid: -1 },
      { ppid: 999 },
      { group: 101 },
      { sid: 101 },
      { uid: -1 },
      { startTicks: "9" },
    ]) {
      const context = structuredClone(f.local);
      Object.assign(context.child, delta);
      assert.throws(() => validateNativeContext(context));
    }
    const missing = structuredClone(f.local);
    Reflect.deleteProperty(missing.child, "startTicks");
    assert.throws(() => validateNativeContext(missing));
  } finally {
    f.clean();
  }
});

test("local signatures need adjudication and consume rejection", async () => {
  const f = localFixture();
  try {
    await assert.rejects(
      f.verifier.accept(
        f.localReceipt,
        f.request,
        f.local,
        "profile",
        () => 1200,
        async () => {
          throw new Error("unknown host");
        },
      ),
    );
    await assert.rejects(f.accept(f.localReceipt, f.request, f.local));
    await assert.rejects(f.accept(f.receipt, f.request, f.local));
  } finally {
    f.clean();
  }
});
