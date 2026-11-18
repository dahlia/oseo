/* eslint-disable no-await-in-loop -- Failure fixtures run serially. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import {
  discoverMac,
  archiveMacDiscovery,
  discoveryCommands,
  discoveryFingerprint,
  runDiscoveryCommand,
} from "../tools/perf/mac-discovery.ts";
import type {
  DiscoveryInput,
  DiscoveryResult,
  DiscoveryRuntime,
} from "../tools/perf/mac-discovery.ts";

const hardware = "abcdef01-2345-6789-abcd-0123456789ab";
const boot = "12345678-abcd-4321-abcd-0123456789ab";
const sha = "a".repeat(40);
const tree = "b".repeat(40);
const outputs = new Map<string, string>(
  Object.entries({
    utc: "2026-11-09T10:00:00Z\n",
    account: "private-account\n",
    uid: "501\n",
    gid: "20\n",
    os: "Darwin\n",
    arch: "arm64\n",
    version: "ProductVersion: 15.0\n",
    hardware: `"IOPlatformUUID" = "${hardware}"\n`,
    boot: `${boot}\n`,
    head: `${sha}\n`,
    tree: `${tree}\n`,
    status: "",
    node: "v24.21.0\n",
    "final-head": `${sha}\n`,
    "final-tree": `${tree}\n`,
    "final-status": "",
  }),
);

async function fixture(
  body: (input: DiscoveryInput, runtime: DiscoveryRuntime) => Promise<void>,
  overrides: Readonly<Record<string, Partial<DiscoveryResult>>> = {},
): Promise<void> {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "oseo-discovery-fixture-")),
  );
  const workspace = join(root, "workspace");
  const temp = join(root, "temp");
  await mkdir(workspace);
  await mkdir(temp);
  try {
    await body(
      {
        repository: "fixture/oseo",
        runId: "1234",
        attempt: "2",
        job: "mac-discovery-1",
        label: "oseo-mac-1",
        runnerName: "oseo-mac-1",
        runnerOs: "macOS",
        runnerArch: "ARM64",
        runnerEnvironment: "self-hosted",
        githubActions: "true",
        sha,
        workspace,
        temp,
      },
      {
        platform: "darwin",
        arch: "arm64",
        node: process.execPath,
        run: (command) => ({
          stdout: outputs.get(command.name) ?? "fixture-only optional probe\n",
          stderr: "",
          exitCode: 0,
          signal: null,
          errorCode: null,
          durationMs: 1,
          timedOut: false,
          truncated: false,
          cleanup: "verified",
          ...overrides[command.name],
        }),
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("discovery has a fixed read-only command and argument allowlist", () => {
  const commands = discoveryCommands("/pinned/node");
  assert.deepEqual(
    commands.map((command) => command.name),
    [
      "utc",
      "account",
      "uid",
      "gid",
      "os",
      "arch",
      "version",
      "hardware",
      "boot",
      "head",
      "tree",
      "status",
      "node",
      "tool-locations",
      "sample-help",
      "atos-help",
      "xctrace-location",
      "disk",
      "final-head",
      "final-tree",
      "final-status",
    ],
  );
  assert.deepEqual(
    commands.find((c) => c.name === "sample-help"),
    {
      name: "sample-help",
      executable: "/usr/bin/sample",
      argv: ["-h"],
    },
  );
  assert.deepEqual(
    commands.find((c) => c.name === "xctrace-location"),
    {
      name: "xctrace-location",
      executable: "/usr/bin/xcrun",
      argv: ["--find", "xctrace"],
    },
  );
  assert(commands.every((c) => c.executable.startsWith("/")));
  assert(!JSON.stringify(commands).match(/nonce|credential|sudo|curl|ps\b/u));
});

test("raw failures stay private; exported evidence is derived", async () => {
  await fixture(
    async (input, runtime) => {
      assert.equal(await discoverMac(input, runtime), true);
      const root = join(input.temp, "oseo-mac-discovery");
      const body = await readFile(join(root, "derived/discovery.json"), "utf8");
      for (const raw of [hardware, boot, "private-account", "private-runner"]) {
        assert(!body.includes(raw), raw);
      }
      const record = JSON.parse(body);
      assert.equal(record.purpose, "PREPARATION-only");
      assert.equal(record.nativeAcceptance, "unverified");
      assert.equal(record.physicalIsolation, "unknown");
      assert.equal(record.ci.numericJobId, null);
      assert.equal(record.ci.numericRunnerId, null);
      assert.equal(record.source.tree, tree);
      assert.equal(
        record.probes.find((p: { name: string }) => p.name === "sample-help")
          .exitCode,
        1,
      );
      assert.equal(
        record.probes.find((p: { name: string }) => p.name === "sample-help")
          .support,
        "unknown",
      );
      if (process.platform !== "win32") {
        assert.equal((await stat(root)).mode & 0o777, 0o700);
      }
      const rawPath = join(root, "private/sample-help.json");
      if (process.platform !== "win32") {
        assert.equal((await stat(rawPath)).mode & 0o777, 0o600);
      }
      const raw = JSON.parse(await readFile(rawPath, "utf8"));
      assert.equal(raw.result.stderr, "unsupported-help-private-text");
      assert.equal(raw.result.durationMs, 4);
      const manifest = JSON.parse(
        await readFile(join(root, "derived/manifest.json"), "utf8"),
      );
      assert.equal(
        manifest.files[0].sha256,
        createHash("sha256").update(body).digest("hex"),
      );
      assert.equal(manifest.files[0].bytes, Buffer.byteLength(body));
      assert.equal(manifest.files[0].mode, "0600");
      assert.equal((await readdir(join(root, "derived"))).length, 2);
      await assert.rejects(discoverMac(input, runtime), /EEXIST/u);
    },
    {
      "sample-help": {
        exitCode: 1,
        stderr: "unsupported-help-private-text",
        durationMs: 4,
      },
    },
  );
});

test("fingerprints separate domains and attempts", async () => {
  await fixture(async (input) => {
    const first = discoveryFingerprint(input, "uid", "501");
    assert.equal(
      first,
      discoveryFingerprint(
        { ...input, job: "mac-discovery-2", label: "oseo-mac-2" },
        "uid",
        "501",
      ),
    );
    assert.notEqual(first, discoveryFingerprint(input, "gid", "501"));
    assert.notEqual(
      first,
      discoveryFingerprint({ ...input, attempt: "3" }, "uid", "501"),
    );
    assert.notEqual(
      first,
      discoveryFingerprint({ ...input, runId: "1235" }, "uid", "501"),
    );
  });
});

const posix = {
  skip:
    process.platform === "win32" ? "POSIX archive and symlink facts" : false,
};

test(
  "fixture roots canonicalize a real temporary-directory alias",
  posix,
  async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "oseo-alias-")));
    const target = join(root, "real");
    const alias = join(root, "alias");
    await mkdir(target);
    await symlink(target, alias);
    const previous = process.env.TMPDIR;
    process.env.TMPDIR = alias;
    try {
      await fixture(async (input, runtime) => {
        assert.equal(input.workspace, await realpath(input.workspace));
        assert.equal(input.temp, await realpath(input.temp));
        assert.equal(await discoverMac(input, runtime), true);
      });
    } finally {
      if (previous === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previous;
      await rm(root, { recursive: true, force: true });
    }
  },
);

interface TarFixtureEntry {
  readonly name: string;
  readonly uid: number;
  readonly gid: number;
  readonly uname: string;
  readonly gname: string;
  readonly mode: number;
  readonly type: string;
  readonly data: Buffer;
}

/** Independent reader checks actual USTAR bytes rather than writer calls. */
function tarEntries(archive: Buffer): readonly TarFixtureEntry[] {
  const entries: TarFixtureEntry[] = [];
  let offset = 0;
  while (offset < archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    assert.equal(header.length, 512);
    const text = (at: number, width: number): string =>
      header
        .subarray(at, at + width)
        .toString("ascii")
        .split("\0")[0] ?? "";
    const octal = (at: number, width: number): number =>
      Number.parseInt(text(at, width).trim(), 8);
    const checksum = Buffer.from(header);
    checksum.fill(32, 148, 156);
    assert.equal(
      checksum.reduce((sum, byte) => sum + byte, 0),
      octal(148, 8),
    );
    const size = octal(124, 12);
    entries.push({
      name: text(0, 100),
      uid: octal(108, 8),
      gid: octal(116, 8),
      uname: text(265, 32),
      gname: text(297, 32),
      mode: octal(100, 8),
      type: text(156, 1),
      data: archive.subarray(offset + 512, offset + 512 + size),
    });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  assert(archive.length - offset >= 1024);
  assert(archive.subarray(offset).every((byte) => byte === 0));
  return entries;
}

test("legacy TAR headers expose actual fixture ownership", posix, async () => {
  await fixture(async (input) => {
    const path = join(input.temp, "payload.json");
    await writeFile(path, "{}\n", { mode: 0o600 });
    const archive = join(input.temp, "legacy.tar");
    const result = await runDiscoveryCommand(
      {
        name: "fixture-legacy-tar",
        executable: "/usr/bin/tar",
        argv: ["-cf", archive, "payload.json"],
      },
      input.temp,
    );
    assert.equal(result.exitCode, 0);
    const entry = tarEntries(await readFile(archive))[0];
    assert(entry !== undefined);
    const owner = await stat(path);
    assert(entry.uid === owner.uid && entry.gid === owner.gid);
    assert(
      entry.uid !== 0 ||
        entry.gid !== 0 ||
        entry.uname !== "" ||
        entry.gname !== "",
    );
  });
});

test(
  "failure collection uses neutral ownership and preserves bytes",
  posix,
  async () => {
    await fixture(
      async (input, runtime) => {
        assert.equal(await discoverMac(input, runtime), false);
        await archiveMacDiscovery(input);
        const path = join(input.temp, "mac-discovery-derived.tar");
        const entries = tarEntries(await readFile(path));
        assert.deepEqual(
          entries.map((entry) => entry.name),
          ["derived/discovery.json", "derived/manifest.json"],
        );
        for (const entry of entries) {
          assert.equal(entry.uid, 0);
          assert.equal(entry.gid, 0);
          assert.equal(entry.uname, "");
          assert.equal(entry.gname, "");
          assert.equal(entry.mode, 0o600);
          assert.equal(entry.type, "0");
          assert.deepEqual(
            entry.data,
            await readFile(join(input.temp, "oseo-mac-discovery", entry.name)),
          );
        }
        const report = JSON.parse(entries[0]?.data.toString("utf8") ?? "");
        assert.equal(report.status, "failed");
        const compatible = await runDiscoveryCommand(
          {
            name: "fixture-tar-reader",
            executable: "/usr/bin/tar",
            argv: ["-tf", path],
          },
          input.temp,
        );
        assert.equal(compatible.exitCode, 0);
        assert.equal(
          compatible.stdout,
          "derived/discovery.json\nderived/manifest.json\n",
        );
        await assert.rejects(archiveMacDiscovery(input), /EEXIST/u);
      },
      { "sample-help": { timedOut: true, errorCode: "ETIMEDOUT" } },
    );
  },
);

test(
  "collection rejects stale context and changed derived files",
  posix,
  async () => {
    await fixture(async (input, runtime) => {
      assert.equal(await discoverMac(input, runtime), true);
      await assert.rejects(
        archiveMacDiscovery({ ...input, attempt: "3" }),
        /context or file digest mismatch/u,
      );
      await writeFile(
        join(input.temp, "oseo-mac-discovery/derived/discovery.json"),
        "{}\n",
      );
      await assert.rejects(
        archiveMacDiscovery(input),
        /context or file digest mismatch/u,
      );
      const report = join(
        input.temp,
        "oseo-mac-discovery/derived/discovery.json",
      );
      const other = join(input.temp, "fixture-must-not-read.txt");
      await writeFile(other, "fixture-only\n");
      await rm(report);
      await symlink(other, report);
      await assert.rejects(archiveMacDiscovery(input), /ELOOP/u);
      assert(
        !(await readdir(input.temp)).includes("mac-discovery-derived.tar"),
      );
    });
  },
);

test("invalid CI identities never launch probes", async () => {
  await fixture(async (input, runtime) => {
    let calls = 0;
    const forbidden = {
      ...runtime,
      run: () => {
        calls++;
        throw new Error("unexpected probe");
      },
    };
    for (const patch of [
      { runnerEnvironment: "github-hosted" },
      { runId: "" },
      { runId: "1234\n" },
      { repository: "fixture/oseo\n" },
      { sha: `${sha}\n` },
      { runnerArch: "X64" },
      { job: "mac-discovery-2" },
      { githubActions: "false" },
      { runnerName: "other-runner" },
      { sha: "branch-name" },
    ]) {
      await assert.rejects(
        discoverMac({ ...input, ...patch }, forbidden),
        /Invalid discovery CI identity/u,
      );
    }
    assert.equal(calls, 0);
    assert.deepEqual(await readdir(input.temp), []);
  });
});

test("missing facts and wrong source fail closed", async () => {
  const scenarios: readonly Readonly<
    Record<string, Partial<DiscoveryResult>>
  >[] = [
    { boot: { stdout: "", errorCode: "ENOENT", exitCode: null } },
    { hardware: { stdout: "unavailable" } },
    { account: { stdout: "" } },
    { uid: { stdout: "unknown" } },
    { gid: { exitCode: 1 } },
    { os: { stdout: "Linux\n" } },
    { head: { stdout: "c".repeat(40) } },
    { tree: { stdout: "not-a-tree" } },
    { status: { stdout: " M source.ts\n" } },
    { status: { exitCode: null, signal: "SIGTERM" } },
    { node: { stdout: "v25.0.0" } },
    { "final-status": { stdout: " M changed-during-probes.ts\n" } },
    { "final-head": { stdout: "c".repeat(40) } },
    { "sample-help": { timedOut: true, errorCode: "ETIMEDOUT" } },
    { "tool-locations": { truncated: true, errorCode: "ENOBUFS" } },
  ];
  for (const scenario of scenarios) {
    await fixture(async (input, runtime) => {
      assert.equal(await discoverMac(input, runtime), false);
      const body = JSON.parse(
        await readFile(
          join(input.temp, "oseo-mac-discovery/derived/discovery.json"),
          "utf8",
        ),
      );
      assert.equal(body.status, "failed");
      assert(body.failures.length > 0);
    }, scenario);
  }
  await fixture(async (input, runtime) => {
    assert.equal(
      await discoverMac(input, { ...runtime, platform: "linux", arch: "x64" }),
      false,
    );
  });
});

test("evidence cannot be created inside the checkout", async () => {
  await fixture(async (input, runtime) => {
    const temp = join(input.workspace, "..hidden");
    await mkdir(temp);
    await assert.rejects(
      discoverMac({ ...input, temp }, runtime),
      /outside the checkout/u,
    );
    assert.deepEqual(await readdir(temp), []);
  });
});

test("failure artifacts separate expected and observed source", async () => {
  const invalidTree = "private-unparseable-source-output";
  await fixture(
    async (input, runtime) => {
      assert.equal(await discoverMac(input, runtime), false);
      const root = join(input.temp, "oseo-mac-discovery/derived");
      const text = await readFile(join(root, "discovery.json"), "utf8");
      assert(!text.includes(invalidTree));
      const report = JSON.parse(text);
      assert.equal(report.source.expectedSha, sha);
      assert.equal(report.source.sha, "c".repeat(40));
      assert.equal(report.source.finalSha, sha);
      assert.equal(report.source.tree, null);
      assert.equal(report.source.clean, false);
      const manifest = JSON.parse(
        await readFile(join(root, "manifest.json"), "utf8"),
      );
      assert.deepEqual(manifest.source, report.source);
    },
    {
      head: { stdout: "c".repeat(40) },
      tree: { stdout: invalidTree },
      "final-status": { stdout: " M changed.ts\n" },
    },
  );
});

test("unknown cleanup preserves failure and skips further probes", async () => {
  await fixture(
    async (input, runtime) => {
      let calls = 0;
      const original = runtime.run;
      const observed = await discoverMac(input, {
        ...runtime,
        run: (c, cwd) => {
          calls++;
          return original(c, cwd);
        },
      });
      assert.equal(observed, false);
      assert.equal(calls, 1);
      const raw = JSON.parse(
        await readFile(
          join(input.temp, "oseo-mac-discovery/private/account.json"),
          "utf8",
        ),
      );
      assert.equal(raw.result.errorCode, "UNATTEMPTED_AFTER_CLEANUP");
    },
    { utc: { cleanup: "unknown" } },
  );
});

test(
  "a TERM-resistant child is bounded and never counted as success",
  {
    skip: process.platform === "win32" ? "POSIX owned groups" : false,
  },
  async () => {
    const result = await runDiscoveryCommand(
      {
        name: "hermetic-term-resistant",
        executable: process.execPath,
        argv: [
          "--input-type=module",
          "-e",
          [
            'process.on("SIGTERM", () => {});',
            'process.stdout.write("partial-private-output");',
            "setInterval(() => {}, 1000);",
          ].join("\n"),
        ],
      },
      process.cwd(),
    );
    assert.equal(result.timedOut, true);
    assert.equal(result.errorCode, "ETIMEDOUT");
    assert.notEqual(result.exitCode, 0);
    assert.equal(result.stdout, "partial-private-output");
    assert(result.durationMs >= 5000);
    assert(result.durationMs < 10000);
  },
);

test("probe process excludes ambient secrets", async () => {
  process.env.OSEO_DISCOVERY_TEST_SECRET = "secret-must-not-pass";
  try {
    const result = await runDiscoveryCommand(
      {
        name: "fixture-env",
        executable: process.execPath,
        argv: [
          "--input-type=module",
          "-e",
          "console.log(JSON.stringify(process.env))",
        ],
      },
      process.cwd(),
    );
    assert.equal(result.exitCode, 0);
    const environment = JSON.parse(result.stdout);
    assert(!Object.hasOwn(environment, "OSEO_DISCOVERY_TEST_SECRET"));
    assert(!Object.hasOwn(environment, "GITHUB_TOKEN"));
    assert(!Object.hasOwn(environment, "HOME"));
  } finally {
    delete process.env.OSEO_DISCOVERY_TEST_SECRET;
  }
});

test("workflow preserves defaults and bounds diagnostics", async () => {
  const workflow = parse(
    await readFile(
      new URL("../.github/workflows/native-optimized.yaml", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    workflow.on.workflow_dispatch.inputs.mac_discovery.default,
    false,
  );
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), [
    "mac_discovery",
  ]);
  assert.deepEqual(Object.keys(workflow.jobs), [
    "test262",
    "properties",
    "dedicated-properties",
    "mac-discovery-1",
    "mac-discovery-2",
  ]);
  assert.deepEqual(workflow.on.schedule, [{ cron: "23 3 * * 0" }]);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  for (const name of ["test262", "properties", "dedicated-properties"]) {
    const job = workflow.jobs[name];
    assert.equal(
      job.if,
      "github.event_name != 'workflow_dispatch' || !inputs.mac_discovery",
    );
    assert.equal(job["timeout-minutes"], 90);
    assert.deepEqual(job.strategy.matrix.os, ["ubuntu-latest", "macos-15"]);
    assert.equal(job.strategy["fail-fast"], false);
    assert(
      job.steps.some((s: { uses: string }) => s.uses === "jdx/mise-action@v4"),
    );
  }
  assert.equal(workflow.jobs.test262.strategy.matrix.shard.length, 12);
  assert.equal(workflow.jobs.properties.strategy.matrix.shard.length, 7);
  assert.equal(
    workflow.jobs["dedicated-properties"].strategy.matrix.file.length,
    4,
  );
  for (const n of [1, 2]) {
    const job = workflow.jobs[`mac-discovery-${n}`];
    assert.equal(
      job.if,
      "github.event_name == 'workflow_dispatch' && inputs.mac_discovery",
    );
    assert.deepEqual(job["runs-on"], [
      "self-hosted",
      "macOS",
      "ARM64",
      `oseo-mac-${n}`,
    ]);
    assert.equal(job.needs, undefined);
    assert.equal(job.concurrency, undefined);
    assert.equal(job["timeout-minutes"], 10);
    assert.equal(job.steps[1].with.install, "false");
    assert.equal(job.steps[2].env.MISE_AUTO_INSTALL, "false");
    assert.match(job.steps[2].run, /exec --no-deps/u);
    assert.equal(job.steps[3].if, "always()");
    assert.match(job.steps[3].run, /mac-discovery\.ts$/u);
    assert.equal(job.steps[3].env.OSEO_DISCOVERY_ARCHIVE_ONLY, "true");
    assert.equal(job.steps[3].env.OSEO_DISCOVERY_LABEL, `oseo-mac-${n}`);
    assert.equal(job.steps[3].env.MISE_AUTO_INSTALL, "false");
    assert(!JSON.stringify(job).includes("tar -cf"));
    assert.equal(job.steps[4].if, "always()");
    assert.equal(job.steps[4].with["if-no-files-found"], "error");
    assert(!JSON.stringify(job).includes("continue-on-error"));
    assert(!job.steps[4].with.path.includes("private"));
  }
});
