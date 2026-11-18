import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
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
import { basename, isAbsolute, join } from "node:path";
import { test } from "node:test";
import * as operator from "../tools/perf/kernel-root/operator.ts";
import {
  discoverProfilingTools,
  profilingProbes,
} from "../tools/perf-profile.ts";
import { writeKernelControl } from "../tools/perf/kernel-root/control.ts";
import { createHash } from "node:crypto";
import { fileIdentity, inspectStack } from "../tools/perf-profile-capture.ts";
import { launch as launchOwned } from "../tools/perf-profile-process.ts";
import type { RunRecord } from "../tools/perf-profile-process.ts";
import * as replay from "../tools/perf/kernel-root/profile-replay.ts";

import type { ProfileInput } from "../tools/perf/ordered-comparison.ts";
import { digest } from "../tools/perf/corpus.ts";
import { artifact } from "../tools/perf/evidence.ts";
import * as boundaries from "../tools/perf/kernel-root/boundaries.ts";
import {
  kernelCaptureRequest,
  kernelStdoutChecker,
} from "../tools/perf/kernel-root/profile.ts";
import { validateCaptureRequest } from "../tools/perf-profile-capture.ts";

/** Private fixtures require POSIX ownership and mode semantics. */
const posixFixture = {
  skip:
    process.platform === "linux" || process.platform === "darwin"
      ? false
      : "requires POSIX ownership and private file modes",
};

/** Actual H shape with inert bytes, without executable evidence. */
function withInput(
  operation: (input: ProfileInput) => void | Promise<void>,
  workload = "sieve",
  iterations = 2000,
): void | Promise<void> {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), "kernel-root-profile-")),
  );
  const file = (name: string, bytes: string | Uint8Array) => {
    const path = join(directory, name);
    writeFileSync(path, bytes);
    return artifact(path);
  };
  const executable = file("inert-binary", "not a native executable");
  const checker = file("checker.ts", "fixture checker identity");
  const source = file("kernel.js", "fixture source identity");
  const stdin = file("stdin", new Uint8Array([0, 128, 255]));
  const stdout = file("stdout", `PERF_OK ${workload} 100\nPERF_TIME 7\n`);
  const stderr = file("stderr", "");
  const manifest = file("built.json", "inert H manifest identity");
  const command = {
    command: executable.path,
    args: [],
    env: { LANG: "C", FIXTURE: "yes" },
    cwd: directory,
    stdin: new Uint8Array([0, 128, 255]),
  };
  const input: ProfileInput = {
    request: {
      id: "fixture-request",
      phase: `profile:${workload}/oseo-enabled/timed`,
      runId: "fixture-only",
      manifest,
      source: {
        tree: "1".repeat(40),
        host: {
          target: "linux-x86_64-gnu",
          os: "fixture",
          architecture: "x64",
          cpu: "fixture",
          logicalCpus: 1,
          memoryBytes: 1,
          commit: "2".repeat(40),
          dirty: false,
          node: "fixture",
          deno: "fixture",
          bun: "fixture",
          zig: "fixture",
          postject: "fixture",
          pinsSha256: "3".repeat(64),
          lockSha256: "4".repeat(64),
        },
      },
      destination: join(directory, "request"),
    },
    form: {
      id: "oseo-enabled",
      workload,
      role: "timed",
      source,
      run: command,
      identities: [source, executable],
      executable,
      generatedC: [],
      specialization: "enabled",
      buildConfiguration: "optimized",
      observeSpecialization: false,
    },
    profile: {
      kind: "kernel-fixed-count-v1",
      iterations,
      run: { ...command, args: ["--oseo-kernel-profile"] },
    },
    inputs: [source, executable, checker, stdin, stdout, stderr],
    checkerSources: [checker],
    correctness: {
      ...command,
      id: "fixture-launch",
      artifactId: `${workload}/oseo-enabled/timed`,
      phase: "runtime",
      role: "timed",
      round: null,
      retained: false,
      reason: "correctness-only",
      identities: [source, executable],
      stdin,
      stdout,
      stderr,
      status: 0,
      signal: null,
      error: null,
      enqueuedAt: "2026-11-17T00:00:00.000Z",
      startedAt: "2026-11-17T00:00:00.000Z",
      finishedAt: "2026-11-17T00:00:00.001Z",
      monotonicStartMs: 0,
      monotonicEndMs: 1,
      wallMs: 1,
    },
    requirements: {
      captures: 8,
      targetTimeoutMs: 120_000,
      linux: { serial: true, captureTimeoutMs: 5_000, frames: 16 },
      mac: {
        concurrent: true,
        targetCount: 1,
        seconds: 1,
        intervalMs: 10,
        captureTimeoutMs: 20_000,
        correlated: true,
      },
    },
    stdoutCheckerId: [
      "H/checkExecution/kernel-fixed-count-v1",
      workload,
      iterations,
    ].join("/"),
    stdoutCheckerSource: checker,
    acceptsStdout: (bytes: Uint8Array) => {
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        const lines = text.trimEnd().split("\n");
        const time = /^PERF_TIME (\d+)$/u.exec(lines[1] ?? "");
        return (
          lines.length === 2 &&
          lines[0] === `PERF_OK ${workload} ${iterations}` &&
          time != null &&
          Number.isSafeInteger(Number(time[1]))
        );
      } catch {
        return false;
      }
    },
  };
  const cleanup = (): void => {
    rmSync(directory, { recursive: true, force: true });
  };
  let pending: void | Promise<void>;
  try {
    pending = operation(input);
  } catch (error) {
    cleanup();
    throw error;
  }
  if (pending instanceof Promise) return pending.finally(cleanup);
  cleanup();
}

/** N bytes are distinct from the original 100-call baseline. */
function profileOutput(input: ProfileInput, time: number): Buffer {
  return Buffer.from(
    `PERF_OK ${input.form.workload} ${input.profile.iterations}\n` +
      `PERF_TIME ${time}\n`,
  );
}

test("H native launch maps to P's existing byte request", () => {
  withInput((input) => {
    const request = kernelCaptureRequest(input);
    assert.deepEqual(validateCaptureRequest(request), request);
    assert.deepEqual(request.argv, input.profile.run.args);
    assert.deepEqual(request.env, input.correctness.env);
    assert.equal(request.cwd, input.correctness.cwd);
    assert.equal(request.executable, input.form.executable!.path);
    assert.equal(request.sha256, input.form.executable!.sha256);
    assert.deepEqual(
      Buffer.from(request.stdinBase64, "base64"),
      Buffer.from([0, 128, 255]),
    );
    assert.deepEqual(
      Buffer.from(request.stderrBase64, "base64"),
      Buffer.alloc(0),
    );
    const checker = kernelStdoutChecker(input);
    assert.equal(checker.check, input.acceptsStdout);
    assert.equal(checker.check(profileOutput(input, 8)), true);
    assert.equal(checker.check(Buffer.from("wrong")), false);
    assert.equal(checker.sourceSha256, input.stdoutCheckerSource.sha256);
  });
});

test("reference, startup and observation roles cannot become profiles", () => {
  withInput((input) => {
    for (const form of [
      { ...input.form, specialization: null },
      { ...input.form, role: "startup" as const },
      { ...input.form, role: "observe" as const },
      { ...input.form, observeSpecialization: true },
    ]) {
      assert.throws(() => kernelCaptureRequest({ ...input, form }));
    }
  });
});

test("a different correctness launch cannot supply P's oracle", () => {
  withInput((input) => {
    for (const correctness of [
      { ...input.correctness, args: ["changed"] },
      { ...input.correctness, cwd: "/different" },
      { ...input.correctness, env: {} },
      { ...input.correctness, command: "/different" },
      { ...input.correctness, status: 1 },
      { ...input.correctness, signal: "SIGTERM" },
      { ...input.correctness, error: "failed" },
    ]) {
      assert.throws(() => kernelCaptureRequest({ ...input, correctness }));
    }
    assert.throws(() =>
      kernelCaptureRequest({
        ...input,
        form: { ...input.form, run: { ...input.form.run, stdin: [] } },
      }),
    );
  });
});

test("missing checker and changed raw block mapping", () => {
  withInput((input) => {
    assert.throws(() =>
      kernelCaptureRequest({ ...input, inputs: [input.form.source] }),
    );
    writeFileSync(input.correctness.stdout.path, "replaced");
    assert.throws(() => kernelCaptureRequest(input), /Changed H profile input/);
  });
});

test("no default Root operations can start P or issue complete proofs", () => {
  assert.throws(
    () => boundaries.createKernelRootBoundaries(JSON.parse("{}")),
    /Missing Root diagnose/,
  );
});

/** Synthetic P originals exercise replay only; no workload was executed. */
function rawProfile(input: ProfileInput) {
  const directory = join(input.request.destination, "raw-fixture");
  mkdirSync(directory, { recursive: true });
  const put = (name: string, bytes: string | Buffer) => {
    writeFileSync(join(directory, name), bytes, { mode: 0o600 });
  };
  const json = <Value>(name: string, value: Value) =>
    put(name, JSON.stringify(value) + "\n");
  const request = kernelCaptureRequest(input);
  json("request.json", request);
  const mac = input.request.source.host.target === "macos-aarch64";
  const checker = kernelStdoutChecker(input);
  json("stdout-oracle.json", {
    kind: "caller-checker",
    id: checker.id,
    sourcePath: checker.sourcePath,
    declaredSourceSha256: checker.sourceSha256,
    actualSourceSha256: checker.sourceSha256,
    functionSha256: createHash("sha256")
      .update(Function.prototype.toString.call(checker.check))
      .digest("hex"),
    semantics: "Caller-owned; digests do not establish correctness",
  });
  const pins = [
    request.executable,
    ...request.inputs.map((file) => file.path),
  ].map(fileIdentity);
  json("file-map.json", pins);
  mkdirSync(join(directory, "files"));
  for (const [index, pin] of pins.entries()) {
    const saved = join(directory, "files", String(index));
    copyFileSync(pin.path, saved);
    chmodSync(saved, pin.mode);
  }
  const run = (
    name: string,
    argv: readonly string[],
    output: string | Buffer,
    start = 100,
    end = 101,
    stderr: Buffer | string = "",
    env: Readonly<Record<string, string>> = { PATH: "/fixture" },
    cwd = input.correctness.cwd,
  ): RunRecord => {
    const record: RunRecord = {
      directory,
      argv,
      cwd,
      env,
      startedUtc: new Date(start).toISOString(),
      finishedUtc: new Date(end).toISOString(),
      monotonicStartMs: start,
      monotonicEndMs: end,
      wallMs: end - start,
      pid: 12345,
      status: 0,
      signal: null,
      error: null,
      timedOut: false,
      stdout: name + ".stdout",
      stderr: name + ".stderr",
      cleanup: [],
      groupGone: true,
    };
    put(record.stdout, output);
    put(record.stderr, stderr);
    json(name + ".json", record);
    return record;
  };
  const source = (phase: string) => [
    run(
      `source-${phase}-head`,
      ["git", "rev-parse", "HEAD", "HEAD^{tree}"],
      input.request.source.host.commit + "\n" + input.request.source.tree,
    ),
    run(`source-${phase}-dirty`, ["git", "status", "--porcelain"], ""),
  ];
  const preflight = run(
    "preflight",
    [request.executable, ...request.argv],
    profileOutput(input, 11),
    10,
    20,
    Buffer.from(request.stderrBase64, "base64"),
    request.env,
    request.cwd,
  );
  const target = run(
    "target",
    [request.executable, ...request.argv],
    profileOutput(input, 13),
    100,
    10000,
    Buffer.from(request.stderrBase64, "base64"),
    request.env,
    request.cwd,
  );
  const profilerPath = join(directory, "inert-gdb");
  put("inert-gdb", "inert profiler bytes");
  const profiler = fileIdentity(profilerPath);
  json("profiler-before.json", profiler);
  json("profiler-after.json", profiler);
  const discoveryDirectory = join(directory, "discovery");
  mkdirSync(discoveryDirectory);
  const discoveryCommands = Array.from(
    profilingProbes(mac ? "darwin" : "linux"),
    (argv, index) => {
      const tool =
        argv[0] === "gdb" || argv[0] === "/usr/bin/sample"
          ? profilerPath
          : argv[0]!;
      const record = {
        ...run(`discovery-${index}`, [tool, ...argv.slice(1)], "fixture probe"),
        directory: discoveryDirectory,
        stdout: `${index}.stdout`,
        stderr: `${index}.stderr`,
      };
      for (const [name, value] of [
        [record.stdout, "fixture probe"],
        [record.stderr, ""],
        [`${index}.json`, JSON.stringify(record)],
      ])
        writeFileSync(join(discoveryDirectory, name!), value!, { mode: 0o600 });
      return {
        ...record,
        toolPath: tool,
        stdoutBase64: Buffer.from("fixture probe").toString("base64"),
        stderrBase64: "",
      };
    },
  );
  json("discovery/discovery.json", {
    kind: "profiling-tool-discovery",
    acceptance: "unverified",
    completed: true,
    interrupted: null,
    platform: mac ? "darwin" : "linux",
    architecture: mac ? "arm64" : "x64",
    cwd: input.correctness.cwd,
    commands: discoveryCommands,
  });
  const captures = Array.from({ length: 8 }, (_, index) => {
    const text = mac
      ? `Process: fixture [${target.pid}]\n` +
        "Target Type: live task\n" +
        "Analysis of sampling fixture every 10 milliseconds\n" +
        "    1 oseo_add (in fixture) [0x1]\n" +
        "    1 oseo_function_1 (in fixture) [0x2]\nBinary Images:\n" +
        `fixture ${index}\n`
      : `process ${target.pid}\n#0 oseo_add ()\n` +
        `#1 oseo_function_1 ()\nfixture ${index}\n`;
    const stderr = mac ? "Sampling completed, processing symbols..." : "";
    const argv = mac
      ? [
          profilerPath,
          String(target.pid),
          "1",
          "10",
          "-file",
          join(directory, `sample-${index}.txt`),
        ]
      : [
          profilerPath,
          "--nx",
          "--nh",
          "--batch",
          "-iex",
          "set auto-load off",
          "-iex",
          "set debuginfod enabled off",
          "-p",
          String(target.pid),
          "-ex",
          "thread apply all bt 16",
          "-ex",
          "detach",
        ];
    const record = run(
      `capture-${index}`,
      argv,
      mac ? "" : text,
      200 + index * 10,
      (mac ? 1200 : 205) + index * 10,
      stderr,
    );
    if (mac) put(`sample-${index}.txt`, text);
    return {
      index,
      status: "useful-stack",
      record,
      stack: inspectStack(text + "\n" + stderr, mac ? "darwin" : "linux"),
      targetAliveAtCompletion: mac,
      windowComplete: mac,
    };
  });
  const commands = [
    ...captures.map((capture) => capture.record),
    run(
      "symbols-before",
      [
        mac ? "/usr/bin/dwarfdump" : "/fixture/readelf",
        mac ? "--uuid" : "-n",
        request.executable,
      ],
      "fixed symbols",
    ),
    run(
      "symbols-after",
      [
        mac ? "/usr/bin/dwarfdump" : "/fixture/readelf",
        mac ? "--uuid" : "-n",
        request.executable,
      ],
      "fixed symbols",
    ),
  ];
  const report = {
    kind: "existing-artifact",
    status: "method-probe-passed",
    failure: null,
    interrupted: null,
    host: {
      platform: mac ? "darwin" : "linux",
      architecture: mac ? "arm64" : "x64",
    },
    requestedCaptures: 8,
    captures,
    before: pins,
    after: pins,
    finalIdentities: pins,
    commands,
    lifetimes: [
      preflight,
      target,
      ...discoveryCommands.map((row) => {
        const {
          toolPath: _tool,
          stdoutBase64: _out,
          stderrBase64: _err,
          ...record
        } = row;
        return record;
      }),
    ],
    sourceBefore: source("before"),
    sourceAfter: source("after"),
  };
  json("capture.json", report);
  return { directory, report, json, put };
}

test("P raw replay reconstructs H proof from eight distinct originals", () => {
  withInput((input) => {
    const fixture = rawProfile(input);
    const proof = replay.replayKernelProfile(
      input,
      fixture.directory,
      input.correctness.cwd,
    );
    assert.equal(proof.captures.length, 8);
    assert.equal(proof.launchSha256, digest(JSON.stringify(input.profile.run)));
    assert.notEqual(proof.launchSha256, digest(JSON.stringify(input.form.run)));
    assert.equal(proof.cleanup, "complete");
    assert.deepEqual(
      Buffer.from(proof.target.stdout),
      profileOutput(input, 13),
    );
    assert.equal(
      new Set(proof.captures.map((capture) => capture.report.path)).size,
      8,
    );
  });
});

for (const fault of [
  "partial",
  "source",
  "env",
  "argv",
  "cwd",
  "output",
  "saved",
  "checker",
  "profiler",
  "raw",
  "count",
  "cleanup",
  "terminal",
  "target-window",
  "pid",
] as const) {
  test(`P raw replay refuses original contract drift: ${fault}`, () => {
    withInput((input) => {
      const f = rawProfile(input);
      const target = f.report.lifetimes[1]!;
      if (fault === "partial")
        f.json("capture.json", { ...f.report, status: "partial" });
      if (fault === "source") f.put("source-after-head.stdout", "different");
      if (fault === "output") f.put(target.stdout, "wrong");
      if (fault === "saved") f.put("files/0", "changed");
      if (fault === "checker") f.json("stdout-oracle.json", {});
      if (fault === "profiler") f.put("inert-gdb", "changed");
      if (fault === "raw") f.put("capture-4.stdout", "no stack");
      if (fault === "count")
        f.json("capture.json", {
          ...f.report,
          captures: f.report.captures.slice(1),
        });
      if (["env", "argv", "cwd", "cleanup", "terminal"].includes(fault)) {
        const changed = {
          ...target,
          env: fault === "env" ? {} : target.env,
          argv: fault === "argv" ? ["/different"] : target.argv,
          cwd: fault === "cwd" ? "/different" : target.cwd,
          groupGone: fault === "cleanup" ? false : target.groupGone,
          status: fault === "terminal" ? null : target.status,
        };
        f.json("target.json", changed);
        f.json("capture.json", {
          ...f.report,
          lifetimes: [
            f.report.lifetimes[0],
            changed,
            ...f.report.lifetimes.slice(2),
          ],
        });
      }
      if (fault === "pid" || fault === "target-window") {
        const first = f.report.captures[0]!;
        const changed = {
          ...first.record,
          argv:
            fault === "pid"
              ? first.record.argv.map((arg) =>
                  arg === "12345" ? "99999" : arg,
                )
              : first.record.argv,
          startedUtc:
            fault === "target-window"
              ? new Date(0).toISOString()
              : first.record.startedUtc,
        };
        f.json("capture-0.json", changed);
        f.json("capture.json", {
          ...f.report,
          commands: [changed, ...f.report.commands.slice(1)],
          captures: [
            { ...first, record: changed },
            ...f.report.captures.slice(1),
          ],
        });
      }
      assert.throws(() =>
        replay.replayKernelProfile(input, f.directory, input.correctness.cwd),
      );
    });
  });
}

/** The same inert request on the Mac target. */
function macInput(original: ProfileInput): ProfileInput {
  return {
    ...original,
    request: {
      ...original.request,
      source: {
        ...original.request.source,
        host: { ...original.request.source.host, target: "macos-aarch64" },
      },
    },
  };
}

/**
 * Replace one fixture run with P's own record of a spawn without a tool. A
 * bare tool name resolves through an empty PATH. An absolute name, as in P's
 * Mac plan, ignores PATH and would start the installed tool, so P launches
 * the same name inside the empty directory. The record then takes the
 * planned argv and the ENOENT message spawn gives for it, in P's format.
 */
async function failedSpawn(
  directory: string,
  name: string,
  argv: readonly string[],
  cwd: string,
): Promise<RunRecord> {
  for (const suffix of [".stdout", ".stderr", ".json"])
    rmSync(join(directory, name + suffix));
  const empty = realpathSync(
    mkdtempSync(join(tmpdir(), "kernel-root-no-tools-")),
  );
  const absolute = isAbsolute(argv[0]!);
  const launched = absolute
    ? [join(empty, basename(argv[0]!)), ...argv.slice(1)]
    : argv;
  let record: RunRecord;
  try {
    const run = launchOwned(
      directory,
      name,
      launched,
      cwd,
      { PATH: empty },
      Buffer.alloc(0),
      20_000,
    );
    record = await run.done;
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
  assert.equal(record.pid, null);
  if (!absolute) return record;
  const path = join(directory, `${name}.json`);
  assert.equal(
    readFileSync(path, "utf8"),
    JSON.stringify(record, null, 2) + "\n",
  );
  assert.equal(record.error, `Error: spawn ${launched[0]} ENOENT`);
  const planned = { ...record, argv, error: `Error: spawn ${argv[0]} ENOENT` };
  writeFileSync(path, JSON.stringify(planned, null, 2) + "\n");
  return planned;
}

/** Substitute P's failed-spawn original for one discovery probe. */
async function missingDiscovery(
  input: ProfileInput,
  fixture: ReturnType<typeof rawProfile>,
  index: number,
  change: (row: DiscoveryRow) => DiscoveryRow = (row) => row,
): Promise<RunRecord> {
  const mac = input.request.source.host.target === "macos-aarch64";
  const argv = profilingProbes(mac ? "darwin" : "linux")[index]!;
  const record = await failedSpawn(
    join(fixture.directory, "discovery"),
    String(index),
    argv,
    input.correctness.cwd,
  );
  assert.equal(record.pid, null);
  // SAFETY: the fixture's own bundle; the replay checks every field again.
  const discovery = JSON.parse(
    readFileSync(join(fixture.directory, "discovery/discovery.json"), "utf8"),
  ) as { readonly commands: readonly DiscoveryRow[] };
  const row = change({
    ...record,
    toolPath: null,
    stdoutBase64: "",
    stderrBase64: "",
  });
  fixture.json("discovery/discovery.json", {
    ...discovery,
    commands: discovery.commands.map((item, slot) =>
      slot === index ? row : item,
    ),
  });
  fixture.json("capture.json", {
    ...fixture.report,
    lifetimes: fixture.report.lifetimes.map((item, slot) =>
      slot === index + 2 ? record : item,
    ),
  });
  return record;
}

/** One discovery bundle row: P's run record plus its resolved tool. */
interface DiscoveryRow extends RunRecord {
  readonly toolPath: string | null;
  readonly stdoutBase64: string;
  readonly stderrBase64: string;
}

test("failed-spawn fixture never starts an absolute executable", async () => {
  await withInput(async (input) => {
    const directory = join(input.request.destination, "absolute");
    mkdirSync(directory, { recursive: true });
    for (const suffix of [".stdout", ".stderr", ".json"])
      writeFileSync(join(directory, "probe" + suffix), "fixture");
    // Node itself exists on every host, so only the fixture can make it fail.
    const argv = [process.execPath, "--version"];
    const record = await failedSpawn(
      directory,
      "probe",
      argv,
      input.correctness.cwd,
    );
    assert.equal(record.pid, null);
    assert.equal(record.status, null);
    assert.deepEqual(record.argv, argv);
    assert.equal(record.error, `Error: spawn ${process.execPath} ENOENT`);
    assert.deepEqual(record.cleanup, []);
    assert.equal(readFileSync(join(directory, "probe.stdout")).length, 0);
    assert.equal(readFileSync(join(directory, "probe.stderr")).length, 0);
    assert.equal(
      readFileSync(join(directory, "probe.json"), "utf8"),
      JSON.stringify(record, null, 2) + "\n",
    );
  });
});

test("absent optional perf stays P's failed spawn beside GDB", async () => {
  await withInput(async (input) => {
    const fixture = rawProfile(input);
    const record = await missingDiscovery(input, fixture, 1);
    assert.deepEqual(record.argv, ["perf", "--version"]);
    assert.equal(record.status, null);
    assert.equal(record.error, "Error: spawn perf ENOENT");
    const proof = replay.replayKernelProfile(
      input,
      fixture.directory,
      input.correctness.cwd,
    );
    assert.equal(proof.captures.length, 8);
    assert.ok(
      proof.raw.some((pin) => pin.path.endsWith(join("discovery", "1.json"))),
    );
  });
});

for (const fault of [
  "gdb",
  "gdb-configuration",
  "readelf",
  "mac-xcodebuild",
  "tool-path",
  "error",
  "status",
  "stdout",
  "cleanup",
] as const)
  test(`required tool or malformed discovery fails: ${fault}`, async () => {
    const mac = fault.startsWith("mac-");
    await withInput(async (original) => {
      const input = mac ? macInput(original) : original;
      const fixture = rawProfile(input);
      if (fault === "gdb" || fault === "gdb-configuration")
        await missingDiscovery(input, fixture, fault === "gdb" ? 2 : 3);
      else if (mac) {
        const record = await missingDiscovery(input, fixture, 3);
        assert.deepEqual(record.argv, ["/usr/bin/xcodebuild", "-version"]);
        assert.equal(record.error, "Error: spawn /usr/bin/xcodebuild ENOENT");
        const saved = join(fixture.directory, "discovery/3.json");
        const bytes = readFileSync(saved);
        assert.equal(bytes.toString(), JSON.stringify(record, null, 2) + "\n");
        for (const stream of ["3.stdout", "3.stderr"])
          assert.equal(
            readFileSync(join(fixture.directory, "discovery", stream)).length,
            0,
          );
        assert.equal(
          replay
            .profileInventory(fixture.directory)
            .find((pin) => pin.path === saved)?.sha256,
          createHash("sha256").update(bytes).digest("hex"),
        );
      } else if (fault === "readelf") {
        const symbols = fixture.report.commands.at(-2)!;
        assert.equal(symbols.stdout, "symbols-before.stdout");
        const record = await failedSpawn(
          fixture.directory,
          "symbols-before",
          symbols.argv,
          symbols.cwd,
        );
        fixture.json("capture.json", {
          ...fixture.report,
          commands: fixture.report.commands.map((item) =>
            item === symbols ? record : item,
          ),
        });
      } else {
        const record = await missingDiscovery(input, fixture, 1, (row) =>
          fault === "tool-path"
            ? { ...row, toolPath: "perf" }
            : { ...row, stdoutBase64: fault === "stdout" ? "eA==" : "" },
        );
        const changed = new Map<string, RunRecord>([
          ["error", { ...record, error: "Error: spawn perf EACCES" }],
          ["status", { ...record, status: 0 }],
          ["cleanup", { ...record, cleanup: ["timeout"] }],
        ]).get(fault);
        if (fault === "stdout") fixture.put("discovery/1.stdout", "x");
        if (changed) {
          fixture.json("discovery/1.json", changed);
          fixture.json("capture.json", {
            ...fixture.report,
            lifetimes: fixture.report.lifetimes.map((item, slot) =>
              slot === 3 ? changed : item,
            ),
          });
        }
      }
      assert.throws(
        () =>
          replay.replayKernelProfile(
            input,
            fixture.directory,
            input.correctness.cwd,
          ),
        fault === "gdb" || fault === "gdb-configuration" || mac
          ? /Required discovery tool missing/u
          : assert.AssertionError,
      );
    });
  });

test("Mac P raw keeps eight overlapping original windows on one target", () => {
  withInput((original) => {
    const input: ProfileInput = {
      ...original,
      request: {
        ...original.request,
        source: {
          ...original.request.source,
          host: {
            ...original.request.source.host,
            target: "macos-aarch64",
          },
        },
      },
    };
    const fixture = rawProfile(input);
    assert.equal(
      replay.replayKernelProfile(
        input,
        fixture.directory,
        input.correctness.cwd,
      ).captures.length,
      8,
    );
    const capture = fixture.report.captures[0]!;
    fixture.json("capture.json", {
      ...fixture.report,
      captures: [
        { ...capture, targetAliveAtCompletion: false },
        ...fixture.report.captures.slice(1),
      ],
    });
    assert.throws(() =>
      replay.replayKernelProfile(
        input,
        fixture.directory,
        input.correctness.cwd,
      ),
    );
  });
});

test("Root diagnosis replays P discovery and tool pins", posixFixture, () => {
  withInput((input) => {
    const fixture = rawProfile(input);
    fixture.put("inert-readelf", "fixture readelf identity");
    const host = {
      target: "linux-x86_64-gnu" as const,
      hardware: "fixture",
      boot: "fixture",
      uid: process.getuid!(),
    };
    const receipt = {
      request: input.request,
      host,
      discovery: fileIdentity(
        join(fixture.directory, "discovery/discovery.json"),
      ),
      tools: [
        fileIdentity(join(fixture.directory, "inert-gdb")),
        fileIdentity(join(fixture.directory, "inert-readelf")),
      ],
    };
    assert.ok(
      operator.replayKernelDiagnosis(receipt, input.request, host).length > 8,
    );
    assert.throws(() =>
      operator.replayKernelDiagnosis(
        { ...receipt, tools: [] },
        input.request,
        host,
      ),
    );
    fixture.put("discovery/2.stdout", "changed original version output");
    assert.throws(() =>
      operator.replayKernelDiagnosis(receipt, input.request, host),
    );
  });
});

/** P's discovery plan for Linux resolves its tools through PATH. */
const linuxDiscovery =
  process.platform === "linux"
    ? false
    : "requires P's Linux discovery plan, which finds its tools on PATH";

/** Host fields the diagnosis receipt must echo. */
const diagnosisHost = {
  target: "linux-x86_64-gnu" as const,
  hardware: "fixture",
  boot: "fixture",
  get uid(): number {
    return process.getuid!();
  },
};

/**
 * Run P's own discoverProfilingTools() with fixture tools on PATH. The GDB
 * fixture prints a long configuration, so the base64 copies of its output
 * carry P's whole discovery.json past the 65,536-byte control frame. perf
 * stays absent and P records its failed spawn. Root runs P under umask 077.
 */
async function withPlainDiscovery(
  operation: (discovery: {
    readonly path: string;
    readonly gdb: string;
    readonly readelf: string;
  }) => void,
): Promise<void> {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), "kernel-root-discovery-")),
  );
  try {
    const tools = join(directory, "tools");
    mkdirSync(tools);
    const script = (name: string, body: string): string => {
      const path = join(tools, name);
      writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o700 });
      return path;
    };
    script("uname", "printf 'Linux fixture\\n'");
    const gdb = script(
      "gdb",
      [
        "i=0",
        'while [ "$i" -lt 1500 ]; do',
        "  printf '  --with-fixture-configuration-%04d\\n' \"$i\"",
        "  i=$((i + 1))",
        "done",
      ].join("\n"),
    );
    const readelf = script("readelf", "exit 0");
    const path = process.env.PATH;
    const umask = process.umask(0o077);
    process.env.PATH = tools;
    try {
      await discoverProfilingTools(join(directory, "discovery"));
    } finally {
      if (path == null) delete process.env.PATH;
      else process.env.PATH = path;
      process.umask(umask);
    }
    operation({
      path: join(directory, "discovery", "discovery.json"),
      gdb,
      readelf,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test(
  "Root diagnosis reads P's whole discovery past one control frame",
  { skip: linuxDiscovery },
  async () => {
    await withInput(async (input) => {
      await withPlainDiscovery((discovery) => {
        const pin = fileIdentity(discovery.path);
        assert.ok(pin.bytes > 65_536);
        assert.equal(pin.mode, 0o600);
        // SAFETY: P's own bundle; replayKernelDiagnosis() checks it again.
        const bundle = JSON.parse(readFileSync(discovery.path, "utf8")) as {
          readonly commands: readonly DiscoveryRow[];
        };
        assert.equal("kernelControlTransport" in bundle, false);
        assert.equal(bundle.commands[1]!.pid, null);
        assert.equal(bundle.commands[2]!.toolPath, discovery.gdb);
        const raw = operator.replayKernelDiagnosis(
          {
            request: input.request,
            host: diagnosisHost,
            discovery: pin,
            tools: [
              fileIdentity(discovery.gdb),
              fileIdentity(discovery.readelf),
            ],
          },
          input.request,
          diagnosisHost,
        );
        assert.ok(raw.some((item) => item.path === discovery.path));
      });
    });
  },
);

for (const fault of [
  "parts",
  "mode",
  "symlink",
  "record-mode",
  "record",
  "interrupted",
  "tool",
] as const)
  test(
    `Root diagnosis refuses a changed P discovery original: ${fault}`,
    { skip: linuxDiscovery },
    async () => {
      await withInput(async (input) => {
        await withPlainDiscovery((discovery) => {
          const directory = join(discovery.path, "..");
          const replayed = (tools: readonly string[]) =>
            operator.replayKernelDiagnosis(
              {
                request: input.request,
                host: diagnosisHost,
                discovery: fileIdentity(discovery.path),
                tools: tools.map(fileIdentity),
              },
              input.request,
              diagnosisHost,
            );
          // The unchanged bundle replays, so a refusal comes from the fault.
          replayed([discovery.gdb, discovery.readelf]);
          // SAFETY: P's own bundle, rewritten below in a faulted form.
          const bundle = JSON.parse(readFileSync(discovery.path, "utf8")) as {
            readonly commands: readonly DiscoveryRow[];
          };
          if (fault === "parts") {
            rmSync(discovery.path);
            writeKernelControl(discovery.path, bundle);
            assert.ok(
              "kernelControlTransport" in
                JSON.parse(readFileSync(discovery.path, "utf8")),
            );
          }
          if (fault === "mode") chmodSync(discovery.path, 0o644);
          if (fault === "symlink") {
            renameSync(discovery.path, discovery.path + ".target");
            symlinkSync(discovery.path + ".target", discovery.path);
          }
          if (fault === "record-mode")
            chmodSync(join(directory, "2.json"), 0o644);
          // P's own record and bundle text: pretty JSON and a newline.
          if (fault === "record") {
            const {
              toolPath: _tool,
              stdoutBase64: _stdout,
              stderrBase64: _stderr,
              ...row
            } = bundle.commands[3]!;
            writeFileSync(
              join(directory, "3.json"),
              JSON.stringify({ ...row, wallMs: row.wallMs + 1 }, null, 2) +
                "\n",
            );
          }
          if (fault === "interrupted")
            writeFileSync(
              discovery.path,
              JSON.stringify(
                { ...bundle, interrupted: "SIGTERM", completed: false },
                null,
                2,
              ) + "\n",
            );
          const tools =
            fault === "tool"
              ? [discovery.readelf, discovery.readelf]
              : [discovery.gdb, discovery.readelf];
          assert.throws(
            () => replayed(tools),
            fault === "parts" ? /parts frame/u : assert.AssertionError,
          );
        });
      });
    },
  );

for (const [workload, iterations] of [
  ["sieve", 2000],
  ["permute", 1000],
  ["json-roundtrip", 10000],
  ["regexp", 10000],
] as const) {
  test(`fixed ${workload} profile preserves the 100-call baseline`, () => {
    withInput(
      (input) => {
        const before = JSON.stringify(input);
        const request = kernelCaptureRequest(input);
        assert.equal(
          Buffer.from(request.stdoutBase64, "base64").toString(),
          `PERF_OK ${workload} 100\nPERF_TIME 7\n`,
        );
        const checker = kernelStdoutChecker(input);
        assert.equal(checker.id, input.stdoutCheckerId);
        assert.equal(checker.check(profileOutput(input, 9)), true);
        assert.equal(
          checker.check(Buffer.from(request.stdoutBase64, "base64")),
          false,
        );
        const fixture = rawProfile(input);
        const proof = replay.replayKernelProfile(
          input,
          fixture.directory,
          input.correctness.cwd,
        );
        assert.equal(
          proof.launchSha256,
          digest(JSON.stringify(input.profile.run)),
        );
        assert.notEqual(
          proof.launchSha256,
          digest(JSON.stringify(input.form.run)),
        );
        assert.deepEqual(proof.target.stdout, profileOutput(input, 13));
        assert.deepEqual(proof.executable, input.form.executable);
        assert.equal(proof.artifactId, input.correctness.artifactId);
        assert.equal(JSON.stringify(input), before);
      },
      workload,
      iterations,
    );
  });
}

test("fixed profile descriptor and exact native command are required", () => {
  withInput((input) => {
    for (const profile of [
      undefined,
      { ...input.profile, kind: "other" },
      { ...input.profile, iterations: 100 },
      { ...input.profile, iterations: 1000 },
      ...[
        [],
        [""],
        ["2000"],
        ["--oseo-kernel-profile=2000"],
        ["--oseo-kernel-profile", "--oseo-kernel-profile"],
        ["--oseo-kernel-profile", "extra"],
        ["--", "--oseo-kernel-profile"],
        ["--oseo-kernel-profile", "--"],
        ["--OSEO-KERNEL-PROFILE"],
      ].map((args) =>
        Object.assign({}, input.profile, {
          run: { ...input.profile.run, args },
        }),
      ),
      ...[
        { command: "/different" },
        { cwd: "/different" },
        { env: {} },
        { stdin: [] },
      ].map((change) =>
        Object.assign({}, input.profile, {
          run: { ...input.profile.run, ...change },
        }),
      ),
    ]) {
      // SAFETY: Exercise malformed descriptors without changing byte inputs.
      const changed: ProfileInput = {
        ...input,
        profile: profile as ProfileInput["profile"],
      };
      assert.throws(() => kernelCaptureRequest(changed));
      assert.throws(() => kernelStdoutChecker(changed));
    }
    for (const form of [
      { ...input.form, workload: "richards" },
      { ...input.form, id: "node" },
      { ...input.form, specialization: "disabled" as const },
      { ...input.form, buildConfiguration: "checked" as const },
      { ...input.form, run: { ...input.form.run, args: ["extra"] } },
    ])
      // @ts-expect-error Deliberately reject a checked BuiltForm at runtime.
      assert.throws(() => kernelCaptureRequest({ ...input, form }));
  });
});

test("baseline and checker closure are independently pinned", () => {
  withInput((input) => {
    for (const text of [
      "PERF_OK sieve 2000\nPERF_TIME 7\n",
      "PERF_OK permute 100\nPERF_TIME 7\n",
      "PERF_OK sieve 100\nPERF_TIME 9007199254740992\n",
      "PERF_OK sieve 100\nPERF_TIME 7\nextra\n",
    ]) {
      writeFileSync(input.correctness.stdout.path, text);
      const stdout = artifact(input.correctness.stdout.path);
      assert.throws(() =>
        kernelCaptureRequest({
          ...input,
          correctness: { ...input.correctness, stdout },
          inputs: input.inputs.map((file) =>
            file.path === stdout.path ? stdout : file,
          ),
        }),
      );
    }
  });
  withInput((input) => {
    for (const changed of [
      { ...input, stdoutCheckerId: "H/checkExecution/sieve/100" },
      { ...input, checkerSources: [] },
      { ...input, checkerSources: [input.request.manifest] },
      { ...input, correctness: { ...input.correctness, identities: [] } },
      {
        ...input,
        form: {
          ...input.form,
          source: { ...input.form.source, sha256: "0".repeat(64) },
        },
      },
      {
        ...input,
        form: {
          ...input.form,
          executable: { ...input.form.executable!, bytes: 1 },
        },
      },
    ])
      assert.throws(() => kernelCaptureRequest(changed));
  });
});

for (const launch of ["preflight", "target"] as const) {
  test(`original ${launch} must use profile argv and N stdout`, () => {
    withInput((input) => {
      const f = rawProfile(input);
      for (const output of [
        "PERF_OK sieve 100\nPERF_TIME 7\n",
        "PERF_OK permute 2000\nPERF_TIME 7\n",
        "PERF_OK sieve 1000\nPERF_TIME 7\n",
        "PERF_OK sieve 2000\nPERF_TIME 7\nextra\n",
        Buffer.from([255]),
      ]) {
        f.put(`${launch}.stdout`, output);
        assert.throws(() =>
          replay.replayKernelProfile(input, f.directory, input.correctness.cwd),
        );
      }
      f.put(`${launch}.stdout`, profileOutput(input, 13));
      for (const change of [
        { argv: [input.form.run.command] },
        { argv: ["/different", ...input.profile.run.args] },
        { argv: [input.profile.run.command, "extra"] },
        { status: 1 },
        { signal: "SIGTERM" },
        { error: "failure" },
      ]) {
        const index = launch === "preflight" ? 0 : 1;
        const record = { ...f.report.lifetimes[index]!, ...change };
        f.json(`${launch}.json`, record);
        f.json("capture.json", {
          ...f.report,
          lifetimes: f.report.lifetimes.map((row, i) =>
            i === index ? record : row,
          ),
        });
        assert.throws(() =>
          replay.replayKernelProfile(input, f.directory, input.correctness.cwd),
        );
      }
      f.json("capture.json", f.report);
      f.json(
        `${launch}.json`,
        f.report.lifetimes[launch === "preflight" ? 0 : 1],
      );
      f.json("request.json", {
        ...kernelCaptureRequest(input),
        argv: input.form.run.args,
      });
      assert.throws(() =>
        replay.replayKernelProfile(input, f.directory, input.correctness.cwd),
      );
    });
  });
}

test("profile callback and its actual closure cannot drift", () => {
  withInput((input) => {
    assert.throws(() =>
      kernelStdoutChecker({
        ...input,
        acceptsStdout: () => true,
      }),
    );
    const f = rawProfile(input);
    assert.throws(() =>
      replay.replayKernelProfile(
        {
          ...input,
          acceptsStdout: (stdout) => input.acceptsStdout(stdout),
        },
        f.directory,
        input.correctness.cwd,
      ),
    );
    writeFileSync(input.stdoutCheckerSource.path, "changed checker source");
    assert.throws(() => kernelStdoutChecker(input));
  });
});

test("disabled policy keeps the same strict fixed profile contract", () => {
  withInput((original) => {
    const input: ProfileInput = {
      ...original,
      form: {
        ...original.form,
        id: "oseo-disabled",
        specialization: "disabled",
      },
      correctness: {
        ...original.correctness,
        artifactId: "sieve/oseo-disabled/timed",
      },
    };
    assert.deepEqual(kernelCaptureRequest(input).argv, input.profile.run.args);
    const f = rawProfile(input);
    assert.equal(
      replay.replayKernelProfile(input, f.directory, input.correctness.cwd)
        .status,
      "complete",
    );
  });
});
