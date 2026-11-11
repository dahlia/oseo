import assert from "node:assert/strict";
import { chmodSync, copyFileSync, mkdtempSync, mkdirSync } from "node:fs";
import {
  readFileSync,
  realpathSync,
  symlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import test from "node:test";
import { describeTarget } from "../packages/compiler/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";

import {
  buildMatrix,
  pinnedCommand,
  launchEnvironment,
} from "../tools/perf/build.ts";
import type {
  BuildManifest,
  BuiltForm,
  NativeBuildMetadata,
} from "../tools/perf/build.ts";
import { artifact, validateEvidence } from "../tools/perf/evidence.ts";
import { digest, kernels } from "../tools/perf/corpus.ts";
import { Journal } from "../tools/perf/journal.ts";
import { checkMatrix } from "../tools/perf/correctness.ts";
import type { LaunchRecord } from "../tools/perf/journal.ts";
import {
  measureMatrix,
  readMatrix,
  verifyMatrix,
} from "../tools/perf/measure.ts";
import { executeRaw, requireRssTool } from "../tools/perf/observation.ts";
import type { RawExecution } from "../tools/perf/observation.ts";
import { defaultMethod, variants } from "../tools/perf/plan.ts";
import type { Command } from "../tools/perf/plan.ts";

const counters = {
  guardHits: 1,
  guardMisses: 2,
  overflowMisses: 3,
  genericAdditionCalls: 4,
  allocations: 5,
  collections: 6,
};
const conditions = {
  power: "synthetic",
  backgroundLoad: "fake executor only",
  cachePolicy: "warm-process-launch" as const,
  notes: "not measurements",
};

function raw(stdout: string, stderr = ""): RawExecution {
  return {
    stdout: Buffer.from(stdout),
    stderr: Buffer.from(stderr),
    status: 0,
    signal: null,
    error: null,
    startedAt: "2026-11-09T00:00:00.000Z",
    finishedAt: "2026-11-09T00:00:00.001Z",
    monotonicStartMs: 1,
    monotonicEndMs: 2,
    wallMs: 1,
  };
}

function fixture(directory: string, mac = false): BuildManifest {
  const file = (name: string) => {
    const path = join(directory, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, name);
    return artifact(path);
  };
  const forms: BuiltForm[] = [];
  for (const workload of [...kernels.map((kernel) => kernel.id), "startup"]) {
    const source = file(`${workload}.js`);
    for (const variant of variants(
      kernels[0]!,
      directory,
      "linux-x86_64-gnu",
      process.execPath,
    )) {
      const native = variant.specialization != null;
      const roles =
        workload === "startup"
          ? (["startup"] as const)
          : native
            ? (["timed", "observe"] as const)
            : (["timed"] as const);
      for (const role of roles) {
        const stem = `${workload}-${variant.id}-${role}`;
        const binary = file(native ? `${stem}/program` : stem);
        const generatedC = native ? [file(`${stem}.c`)] : null;
        const metadataFiles = [];
        if (native) {
          const runtime = cRuntimeProvider.getRuntimeInput();
          const compiler = artifact(
            realpathSync(file(`${stem}/compiler`).path),
          );
          const runtimeAssets = runtime.assets.map((asset) => {
            const path = join(dirname(binary.path), asset.name);
            copyFileSync(asset.url, path);
            return artifact(path);
          });
          const metadata: NativeBuildMetadata = {
            source,
            compiler,
            runtimeAssets,
            generatedC: generatedC!,
            specialization: variant.specialization!,
            observeSpecialization: role === "observe",
            runtimeAbiVersion: runtime.abiVersion,
            cache: "cold-private-no-archive-reuse",
            plan: {
              buildConfiguration: "optimized",
              executablePath: binary.path,
              target: describeTarget(
                mac ? "macos-aarch64" : "linux-x86_64-gnu",
              ),
              requests: [
                {
                  command: compiler.path,
                  args: ["cc"],
                  cwd: dirname(binary.path),
                },
              ],
            },
          };
          const path = join(dirname(binary.path), "build.json");
          writeFileSync(path, JSON.stringify(metadata));
          metadataFiles.push(artifact(path));
        }
        forms.push({
          id: variant.id,
          workload,
          role,
          source,
          run: {
            command: binary.path,
            args:
              variant.executable != null
                ? []
                : variant.run.args.map((arg) =>
                    arg.endsWith(".js") ? source.path : arg,
                  ),
            cwd: directory,
            env: {},
            stdin: new Uint8Array(),
          },
          identities: [
            source,
            artifact(realpathSync(binary.path)),
            ...(generatedC ?? []),
            ...metadataFiles,
          ],
          executable: native || variant.executable != null ? binary : null,
          generatedC,
          specialization: variant.specialization,
          buildConfiguration: "optimized",
          observeSpecialization: role === "observe",
        });
      }
    }
  }
  const journal = new Journal(join(directory, "builds"), () => raw(""));
  journal.run(forms[0]!.run, {
    phase: "build",
    role: "build",
    artifactId: "synthetic-build",
    round: null,
    retained: false,
    reason: "fixture",
    identities: [],
  });
  return {
    schema: 1,
    method: defaultMethod,
    forms,
    buildJournal: artifact(join(journal.directory, "launches.jsonl")),
    host: {
      target: mac ? "macos-aarch64" : "linux-x86_64-gnu",
      os: mac ? "darwin fixture" : "linux fixture",
      architecture: mac ? "arm64" : "x64",
      cpu: "synthetic",
      logicalCpus: 2,
      memoryBytes: 100,
      commit: "a".repeat(40),
      dirty: false,
      node: "fixture node",
      deno: "fixture deno",
      bun: "fixture bun",
      zig: "fixture zig",
      postject: "fixture postject",
      pinsSha256: "b".repeat(64),
      lockSha256: "c".repeat(64),
    },
  };
}

function executor(manifest: BuildManifest): (command: Command) => RawExecution {
  return (command) => {
    const rss = command.command === "/usr/bin/time";
    const path = rss
      ? command.args[manifest.host.target === "macos-aarch64" ? 1 : 2]
      : command.command;
    const form = manifest.forms.find(
      (candidate) => candidate.run.command === path,
    )!;
    assert.ok(form);
    const stderr = rss
      ? manifest.host.target === "macos-aarch64"
        ? "   1234 maximum resident set size\n"
        : "PERF_RSS_KIB 12\n"
      : form.role === "observe"
        ? `OSEO_OBSERVATIONS ${JSON.stringify(counters)}\n`
        : "";
    return raw(
      `PERF_OK ${form.workload} ${form.workload === "startup" ? 1 : 100}\n` +
        "PERF_TIME 0\n",
      stderr,
    );
  };
}

function records(directory: string): LaunchRecord[] {
  return readFileSync(join(directory, "raw", "launches.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test("driver collects four by nine serial rotating populations", () => {
  const directory = mkdtempSync(join(tmpdir(), "perf-driver-"));
  try {
    const manifest = fixture(directory, true);
    const destination = join(directory, "results");
    let active = false;
    const fake = executor(manifest);
    const result = measureMatrix(
      manifest,
      destination,
      { runId: "synthetic", conditions },
      (command) => {
        assert.equal(active, false);
        active = true;
        const observation = fake(command);
        active = false;
        return observation;
      },
    );
    validateEvidence(result);
    assert.equal(result.kernels.length, 4);
    const launches = records(destination);
    assert.equal(launches.length, 9 * 18 + 4 * 9 * (18 + 15) + 8 * 2);
    const runtime = launches.filter((record) => record.phase === "runtime");
    assert.equal(runtime.length, 4 * 9 * 18);
    assert.deepEqual(
      runtime.slice(0, 9).map((record) => record.artifactId),
      manifest.forms
        .filter(
          (form) => form.workload === kernels[0]!.id && form.role === "timed",
        )
        .map((form) => `${form.workload}/${form.id}/timed`),
    );
    assert.equal(runtime[9]!.artifactId, runtime[1]!.artifactId);
    for (const kernel of result.kernels) {
      assert.equal(kernel.samples.length, 9 * 15);
      for (const form of kernel.variants) {
        assert.equal(form.startupMs.length, 15);
        assert.equal(form.peakRssBytes.length, 15);
      }
    }
    const discarded = launches.filter(
      (record) => record.reason === "mac-first-new-executable",
    );
    assert.equal(discarded.length, 33);
    assert.ok(discarded.every((record) => record.retained === false));
    assert.equal(
      launches.filter((record) => record.phase === "rss").length,
      4 * 9 * 15,
    );
    const rss = launches.find((record) => record.phase === "rss")!;
    const stderr = rss.stderr;
    assert.match(readFileSync(stderr.path, "utf8"), /maximum resident/u);
    const startup = launches.find((record) => record.phase === "startup")!;
    assert.notEqual(startup.artifactId, runtime[0]!.artifactId);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("RSS-first retains preflight before fifteen RSS repetitions", () => {
  const directory = mkdtempSync(join(tmpdir(), "perf-driver-"));
  try {
    const manifest = fixture(directory, true);
    const destination = join(directory, "rss-first");
    measureMatrix(
      manifest,
      destination,
      { runId: "synthetic", conditions, rssFirst: true },
      executor(manifest),
    );
    const launches = records(destination);
    const runtime = launches.filter((record) => record.phase !== "startup");
    assert.ok(
      runtime
        .slice(0, 9)
        .every(
          (record) =>
            ["mac-first-new-executable", "rss-preflight"].includes(
              String(record.reason),
            ) && record.retained === false,
        ),
    );
    assert.equal(runtime[9]!.phase, "rss");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("failed launches retain bytes and produce no successful evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "perf-driver-"));
  try {
    const manifest = fixture(directory);
    const destination = join(directory, "failed");
    assert.throws(() =>
      measureMatrix(
        manifest,
        destination,
        { runId: "synthetic", conditions },
        () => ({
          ...raw("wrong\n"),
          stderr: Uint8Array.from([255, 0, 128]),
          status: 7,
        }),
      ),
    );
    const launches = records(destination);
    assert.equal(launches.length, 1);
    assert.equal(launches[0]!.status, 7);
    const stderr = launches[0]!.stderr;
    assert.deepEqual([...readFileSync(stderr.path)], [255, 0, 128]);
    assert.throws(() => readFileSync(join(destination, "measurements.json")));
    const failure = JSON.parse(
      readFileSync(join(destination, "failure.json"), "utf8"),
    );
    assert.equal(failure.lastLaunch.id, launches[0]!.id);
    assert.equal(failure.lastLaunch.phase, "startup");
    assert.equal(failure.lastLaunch.artifactId, launches[0]!.artifactId);
    assert.equal(failure.lastLaunch.status, 7);
    assert.equal(failure.lastLaunch.signal, null);
    assert.deepEqual(failure.lastLaunch.stderr, launches[0]!.stderr);
    assert.equal(failure.journal, join(destination, "raw", "launches.jsonl"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("driver rejects mixed roles, changed files and missing rows", () => {
  const directory = mkdtempSync(join(tmpdir(), "perf-driver-"));
  try {
    const manifest = fixture(directory);
    verifyMatrix(manifest);
    assert.throws(
      () => verifyMatrix({ ...manifest, forms: manifest.forms.slice(1) }),
      /Incomplete built role matrix/u,
    );
    assert.throws(
      () =>
        verifyMatrix({
          ...manifest,
          forms: manifest.forms.map((form, index) =>
            index === 0 ? { ...form, observeSpecialization: true } : form,
          ),
        }),
      /Invalid artifact role/u,
    );
    const interpreted = manifest.forms.find((form) => form.id === "node")!;
    assert.throws(
      () =>
        verifyMatrix({
          ...manifest,
          forms: manifest.forms.map((form) =>
            form === interpreted
              ? {
                  ...form,
                  run: { ...form.run, args: ["--jitless", form.source.path] },
                }
              : form,
          ),
        }),
      /Launch arguments do not match frozen source/u,
    );
    const timed = manifest.forms[0]!;
    assert.throws(
      () =>
        verifyMatrix({
          ...manifest,
          forms: manifest.forms.map((form) =>
            form.workload === timed.workload &&
            form.id === timed.id &&
            form.role === "observe"
              ? {
                  ...form,
                  executable: timed.executable,
                  run: { ...form.run, command: timed.run.command },
                }
              : form,
          ),
        }),
      /separate executable bytes/u,
    );
    writeFileSync(timed.source.path, "replaced source");
    assert.throws(() => verifyMatrix(manifest), /Artifact changed/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("raw transport preserves stdin argv env cwd and invalid UTF-8", () => {
  const directory = mkdtempSync(join(tmpdir(), "perf-bytes-"));
  const original = process.env.OSEO_PERF_PARENT_ONLY;
  process.env.OSEO_PERF_PARENT_ONLY = "must-not-inherit";
  try {
    const journal = new Journal(join(directory, "journal"));
    const script = join(directory, "child.cjs");
    writeFileSync(
      script,
      `const fs = require('node:fs');
process.stdout.write(fs.readFileSync(0));
process.stderr.write(Buffer.from([255, 0, 128]));
fs.writeFileSync('contract.json', JSON.stringify({
  args: process.argv.slice(2), env: process.env, cwd: process.cwd()
}));`,
    );
    chmodSync(script, 0o600);
    const input = Uint8Array.from([0, 255, 128, 10]);
    const result = journal.run(
      {
        command: process.execPath,
        args: [script, "^눈|error", "a b", ""],
        env: { DEMO_LABEL: "ignored" },
        cwd: directory,
        stdin: input,
      },
      {
        phase: "runtime",
        role: "timed",
        artifactId: "transport-fixture",
        round: -1,
        retained: false,
        reason: "correctness",
        identities: [],
      },
    );
    assert.equal(result.status, 0);
    assert.deepEqual([...result.stdout], [...input]);
    assert.deepEqual([...result.stderr], [255, 0, 128]);
    const contract = JSON.parse(
      readFileSync(join(directory, "contract.json"), "utf8"),
    );
    assert.deepEqual(contract.args, ["^눈|error", "a b", ""]);
    assert.equal(contract.env.DEMO_LABEL, "ignored");
    assert.equal(contract.env.OSEO_PERF_PARENT_ONLY, undefined);
    // Windows cwd may use the short alias of the requested temp path.
    assert.equal(
      realpathSync.native(contract.cwd),
      realpathSync.native(directory),
    );
    const entries = readFileSync(
      join(directory, "journal", "launches.jsonl"),
      "utf8",
    ).trim();
    const record = JSON.parse(entries);
    assert.equal(record.cwd, directory);
    const request = JSON.parse(
      readFileSync(join(directory, "journal", "requests.jsonl"), "utf8"),
    );
    assert.equal(request.cwd, directory);
    assert.deepEqual([...readFileSync(record.stdin.path)], [...input]);
    assert.deepEqual([...readFileSync(record.stdout.path)], [...input]);
    assert.deepEqual([...readFileSync(record.stderr.path)], [255, 0, 128]);
    const missing = executeRaw({
      command: join(directory, "missing"),
      args: [],
    });
    assert.equal(missing.status, null);
    assert.ok(missing.error);
  } finally {
    if (original == null) delete process.env.OSEO_PERF_PARENT_ONLY;
    else process.env.OSEO_PERF_PARENT_ONLY = original;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("build driver uses optimized API and seals actual build journals", () => {
  const directory = mkdtempSync(join(tmpdir(), "perf-build-"));
  try {
    const base = fixture(directory);
    const bin = join(directory, "tools");
    mkdirSync(bin);
    for (const name of ["node", "deno", "bun", "zig", "postject", "cp"]) {
      const path = join(bin, name);
      writeFileSync(path, name);
      chmodSync(path, 0o700);
    }
    const destination = join(directory, "built");
    const calls: Command[] = [];
    const manifest = buildMatrix(
      destination,
      base.host,
      { PATH: bin, GH_TOKEN: "synthetic-secret", NODE_OPTIONS: "--jitless" },
      (command) => {
        calls.push(command);
        const args = command.args;
        const output = ["-o", "--output", "--outfile"]
          .map((flag) => args.indexOf(flag))
          .find((index) => index >= 0);
        if (output != null) {
          writeFileSync(args[output + 1]!, JSON.stringify(command));
          chmodSync(args[output + 1]!, 0o700);
        } else if (basename(command.command) === "cp") {
          writeFileSync(args[1]!, JSON.stringify(command));
          chmodSync(args[1]!, 0o700);
        }
        return raw("");
      },
    );
    verifyMatrix(manifest);
    assert.equal(readMatrix(destination).forms.length, 53);
    writeFileSync(join(destination, "built.json"), "modified manifest");
    assert.throws(() => readMatrix(destination), /digest mismatch/u);
    assert.equal(manifest.forms.length, 53);
    const prepared = JSON.parse(
      readFileSync(join(destination, "plan.json"), "utf8"),
    );
    for (const form of manifest.forms.filter(
      (candidate) =>
        candidate.id.startsWith("oseo-") && candidate.role !== "observe",
    )) {
      const planned = prepared.corpus
        .find((entry: { id: string }) => entry.id === form.workload)
        .variants.find((entry: { id: string }) => entry.id === form.id);
      assert.equal(planned.run.command, form.run.command);
      assert.equal(planned.executable, form.executable!.path);
      assert.equal(planned.generatedC, null);
    }

    assert.ok(!JSON.stringify(manifest).includes("synthetic-secret"));
    const native = calls.filter((call) => basename(call.command) === "zig");
    assert.ok(native.length > 18);
    for (const call of native.filter((request) => request.args[0] === "cc")) {
      assert.ok(call.args.includes("-O2"));
      assert.ok(call.args.includes("-fno-sanitize=all"));
      assert.ok(call.args.includes("-ffp-contract=off"));
      assert.ok(!call.args.includes("-g"));
    }
    const launches = readFileSync(manifest.buildJournal.path, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(launches.length, calls.length);
    assert.ok(!JSON.stringify(launches).includes("synthetic-secret"));
    assert.ok(
      launches.every(
        (record) =>
          record.phase === "build" &&
          record.retained === false &&
          record.status === 0,
      ),
    );
    assert.ok(
      manifest.forms
        .filter((form) => form.id.startsWith("oseo-"))
        .every((form) => form.generatedC!.length > 0),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("frozen executable metadata must identify the launched bytes", () => {
  const directory = mkdtempSync(join(tmpdir(), "perf-binding-"));
  try {
    const manifest = fixture(directory);
    const wrong = manifest.forms.find(
      (form) =>
        form.workload === kernels[1]!.id &&
        form.id === "oseo-enabled" &&
        form.role === "timed",
    )!;
    const first = manifest.forms[0]!;
    const forms = [
      { ...first, executable: wrong.executable },
      ...manifest.forms.slice(1),
    ];
    assert.throws(
      () => verifyMatrix({ ...manifest, forms }),
      /Executable identity does not match launch/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("fixed-corpus launches exclude credentials and engine overrides", () => {
  const env = launchEnvironment({
    PATH: "/tools",
    HOME: "/home/example",
    TMPDIR: "/private/tmp",
    LANG: "C.UTF-8",
    GH_TOKEN: "synthetic-secret",
    ANTHROPIC_API_KEY: "synthetic-secret",
    NODE_OPTIONS: "--jitless",
    DENO_V8_FLAGS: "--jitless",
    BUN_OPTIONS: "--preload bad.js",
  });
  assert.deepEqual(env, {
    PATH: "/tools",
    HOME: "/home/example",
    TMPDIR: "/private/tmp",
    LANG: "C.UTF-8",
  });
});

test(
  "dispatch symlinks preserve argv0 while identities hash target bytes",
  {
    skip: process.platform === "win32" ? "requires POSIX file symlinks" : false,
  },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "perf-dispatch-"));
    try {
      const alias = join(directory, "node-alias");
      symlinkSync(process.execPath, alias);
      const command = pinnedCommand(
        { command: alias, args: ["-e", "process.stdout.write(process.argv0)"] },
        directory,
        { PATH: dirname(process.execPath), GH_TOKEN: "synthetic-secret" },
      );
      assert.equal(command.command, alias);
      const result = executeRaw(command);
      assert.equal(result.status, 0);
      assert.equal(Buffer.from(result.stdout).toString(), alias);
      assert.equal(command.env!.GH_TOKEN, undefined);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test("RSS availability preflight rejects a missing tool or directory", () => {
  const directory = mkdtempSync(join(tmpdir(), "perf-rss-tool-"));
  try {
    assert.throws(() => requireRssTool(join(directory, "missing")));
    assert.throws(() => requireRssTool(directory), /must be a file/u);
    requireRssTool(process.execPath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("journaling requires explicit process inputs before spawning", () => {
  const directory = mkdtempSync(join(tmpdir(), "perf-explicit-"));
  try {
    let calls = 0;
    const journal = new Journal(join(directory, "raw"), () => {
      calls++;
      return raw("");
    });
    assert.throws(
      () =>
        journal.run(
          {
            command: process.execPath,
            args: [],
            cwd: directory,
            stdin: [],
          },
          {
            phase: "runtime",
            role: "timed",
            artifactId: "no-env",
            round: -1,
            retained: false,
            reason: "correctness",
            identities: [],
          },
        ),
      /require explicit cwd, env and stdin/u,
    );
    assert.equal(calls, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function seal(manifest: BuildManifest, directory: string): void {
  const text = JSON.stringify(manifest);
  writeFileSync(join(directory, "built.json"), text);
  writeFileSync(join(directory, "built.sha256"), digest(text));
}

test("correctness checks all 53 roles without populations", () => {
  const directory = mkdtempSync(join(tmpdir(), "perf-correctness-"));
  try {
    const manifest = fixture(directory, true);
    seal(manifest, directory);
    const destination = join(directory, "correctness");
    let index = 0;
    const fake = executor(manifest);
    checkMatrix(directory, destination, {
      source: () => ({ host: manifest.host, tree: "d".repeat(40) }),
      executor: (command) => {
        const form = manifest.forms[index++]!;
        assert.deepEqual(command.args, form.run.args);
        assert.deepEqual(command.env, form.run.env);
        assert.equal(command.cwd, form.run.cwd);
        assert.deepEqual([...command.stdin!], [...form.run.stdin!]);
        return fake(command);
      },
    });
    assert.equal(index, 53);
    const launches = records(destination);
    assert.equal(launches.length, 53);
    assert.equal(launches.filter((row) => row.role === "timed").length, 36);
    assert.equal(launches.filter((row) => row.role === "observe").length, 8);
    assert.equal(launches.filter((row) => row.role === "startup").length, 9);
    assert.ok(
      launches.every((row) => !row.retained && row.timingEligible === false),
    );
    assert.equal(
      launches.filter((row) => row.reason === "mac-first-new-executable")
        .length,
      33,
    );
    const summary = JSON.parse(
      readFileSync(join(destination, "correctness.json"), "utf8"),
    );
    assert.equal(summary.checkedForms, 53);
    assert.equal(summary.observed.length, 8);
    assert.deepEqual(summary.observed[0].counters, counters);
    assert.equal(summary.timingEligible, false);
    assert.equal(summary.retained, false);
    assert.equal(summary.samples, undefined);
    assert.throws(() => readFileSync(join(destination, "measurements.json")));
    assert.throws(() => checkMatrix(directory, destination), /EEXIST/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("correctness preserves raw failures and links the failed role", () => {
  for (const failure of [
    "exit",
    "signal",
    "spawn",
    "timeout",
    "utf8",
    "checksum",
    "counter",
  ]) {
    const directory = mkdtempSync(join(tmpdir(), "perf-correctness-fail-"));
    try {
      const manifest = fixture(directory);
      seal(manifest, directory);
      const destination = join(directory, "correctness");
      const fake = executor(manifest);
      let index = 0;
      assert.throws(() =>
        checkMatrix(directory, destination, {
          source: () => ({ host: manifest.host, tree: "d".repeat(40) }),
          executor: (command) => {
            const result = fake(command);
            if (++index !== (failure === "counter" ? 2 : 1)) return result;
            switch (failure) {
              case "exit":
                return { ...result, status: 1 };
              case "signal":
                return { ...result, status: null, signal: "SIGTERM" };
              case "spawn":
                return { ...result, error: "spawn ENOENT", status: null };
              case "timeout":
                return {
                  ...result,
                  error: "spawn ETIMEDOUT",
                  signal: "SIGTERM",
                  status: null,
                };
              case "utf8":
                return { ...result, stdout: Uint8Array.of(0xff) };
              case "checksum":
                return raw("PERF_OK wrong 100\nPERF_TIME 0\n");
              default:
                return {
                  ...result,
                  stderr: Buffer.from("OSEO_OBSERVATIONS {}\n"),
                };
            }
          },
        }),
      );
      const launches = records(destination);
      const last = launches.at(-1)!;
      const summary = JSON.parse(
        readFileSync(join(destination, "failure.json"), "utf8"),
      );
      assert.equal(summary.attempted, last.artifactId);
      assert.equal(summary.lastLaunch.stdout.sha256, last.stdout.sha256);
      assert.equal(summary.completed.length, launches.length - 1);
      assert.equal(summary.unattempted.length, 53 - launches.length);
      assert.equal(summary.timingEligible, false);
      assert.equal(artifact(last.stdout.path).sha256, last.stdout.sha256);
      assert.equal(artifact(last.stderr.path).sha256, last.stderr.sha256);
      assert.equal(artifact(last.stdin.path).sha256, last.stdin.sha256);
      if (failure === "utf8")
        assert.deepEqual(readFileSync(last.stdout.path), Buffer.from([0xff]));
      assert.throws(() => readFileSync(join(destination, "correctness.json")));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("correctness rejects mixed roles and changed identities", () => {
  for (const failure of [
    "missing",
    "mixed",
    "dirty",
    "tool",
    "pin",
    "tree",
    "artifact",
    "manifest",
  ]) {
    const directory = mkdtempSync(join(tmpdir(), "perf-correctness-reject-"));
    try {
      const original = fixture(directory);
      const manifest =
        failure === "missing"
          ? { ...original, forms: original.forms.slice(1) }
          : failure === "mixed"
            ? {
                ...original,
                forms: [original.forms[1]!, ...original.forms.slice(1)],
              }
            : original;
      seal(manifest, directory);
      const destination = join(directory, "correctness");
      let sourceCalls = 0;
      let launches = 0;
      const fake = executor(manifest);
      assert.throws(() =>
        checkMatrix(directory, destination, {
          source: () => {
            sourceCalls++;
            const host = { ...manifest.host };
            if (failure === "dirty") host.dirty = true;
            if (failure === "tool") host.node = "changed";
            if (failure === "pin") host.pinsSha256 = "e".repeat(64);
            return {
              host,
              tree: (failure === "tree" && sourceCalls > 1 ? "e" : "d").repeat(
                40,
              ),
            };
          },
          executor: (command) => {
            const result = fake(command);
            if (++launches === 53) {
              if (failure === "artifact")
                writeFileSync(manifest.forms[0]!.source.path, "changed");
              if (failure === "manifest")
                seal(
                  { ...manifest, host: { ...manifest.host, cpu: "changed" } },
                  directory,
                );
            }
            return result;
          },
        }),
      );
      assert.equal(
        launches,
        ["tree", "artifact", "manifest"].includes(failure) ? 53 : 0,
      );
      const summary = JSON.parse(
        readFileSync(join(destination, "failure.json"), "utf8"),
      );
      assert.equal(summary.source.host.commit, original.host.commit);
      assert.equal(summary.latestSource.host.commit, original.host.commit);
      if (failure === "tree") {
        assert.equal(summary.source.tree, "d".repeat(40));
        assert.equal(summary.latestSource.tree, "e".repeat(40));
      }
      assert.equal(summary.timingEligible, false);
      assert.throws(() => readFileSync(join(destination, "correctness.json")));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("every native role verifies copied runtime and compiler bytes", () => {
  const directory = mkdtempSync(join(tmpdir(), "perf-native-identity-"));
  try {
    const manifest = fixture(directory);
    for (const form of manifest.forms.filter((row) =>
      row.id.startsWith("oseo-"),
    )) {
      const path = join(dirname(form.run.command), "build.json");
      const metadata: NativeBuildMetadata = JSON.parse(
        readFileSync(path, "utf8"),
      );
      for (const file of [metadata.runtimeAssets[0]!, metadata.compiler]) {
        const original = readFileSync(file.path);
        writeFileSync(file.path, "changed");
        assert.throws(() => verifyMatrix(manifest), /Artifact changed/u);
        writeFileSync(file.path, original);
      }
    }
    verifyMatrix(manifest);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("native metadata rejects incomplete or mixed records", () => {
  const directory = mkdtempSync(join(tmpdir(), "perf-native-metadata-"));
  try {
    const manifest = fixture(directory);
    const form = manifest.forms[0]!;
    const path = join(dirname(form.run.command), "build.json");
    const original = readFileSync(path, "utf8");
    const metadata: NativeBuildMetadata = JSON.parse(original);
    const replacements = [
      { runtimeAssets: [] },
      { runtimeAssets: metadata.runtimeAssets.slice(1) },
      {
        runtimeAssets: [
          ...metadata.runtimeAssets.slice(1),
          metadata.runtimeAssets[1]!,
        ],
      },
      { compiler: null },
      { runtimeAbiVersion: "changed" },
      { source: { ...form.source, sha256: "f".repeat(64) } },
      { generatedC: [] },
      { specialization: "disabled" },
      { observeSpecialization: true },
      { cache: "reused" },
      { plan: null },
      { plan: { ...metadata.plan, requests: [] } },
      { plan: { ...metadata.plan, buildConfiguration: "checked" } },
      { plan: { ...metadata.plan, executablePath: "wrong" } },
      { plan: { ...metadata.plan, target: { name: "macos-aarch64" } } },
    ];
    for (const replacement of replacements) {
      writeFileSync(path, JSON.stringify({ ...metadata, ...replacement }));
      const changed: BuildManifest = {
        ...manifest,
        forms: [
          {
            ...form,
            identities: form.identities.map((file) =>
              file.path === path ? artifact(path) : file,
            ),
          },
          ...manifest.forms.slice(1),
        ],
      };
      assert.throws(() => verifyMatrix(changed));
    }
    writeFileSync(path, original);
    const missing: BuildManifest = {
      ...manifest,
      forms: [
        {
          ...form,
          identities: form.identities.filter((file) => file.path !== path),
        },
        ...manifest.forms.slice(1),
      ],
    };
    assert.throws(
      () => verifyMatrix(missing),
      /Missing native build metadata/u,
    );
    verifyMatrix(manifest);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("build acceptance requires every raw stream and matching requests", () => {
  const directory = mkdtempSync(join(tmpdir(), "perf-build-raw-"));
  try {
    const manifest = fixture(directory);
    const row: LaunchRecord = JSON.parse(
      readFileSync(manifest.buildJournal.path, "utf8"),
    );
    for (const file of [row.stdin, row.stdout, row.stderr]) {
      const bytes = readFileSync(file.path);
      rmSync(file.path);
      assert.throws(() => verifyMatrix(manifest));
      writeFileSync(file.path, "changed");
      assert.throws(() => verifyMatrix(manifest), /Raw stream changed/u);
      writeFileSync(file.path, bytes);
    }
    const requests = join(
      dirname(manifest.buildJournal.path),
      "requests.jsonl",
    );
    const original = readFileSync(requests, "utf8");
    const request = JSON.parse(original);
    writeFileSync(
      requests,
      JSON.stringify({ ...request, cwd: "wrong" }) + "\n",
    );
    assert.throws(
      () => verifyMatrix(manifest),
      /Raw request\/launch mismatch/u,
    );
    writeFileSync(requests, "{}\n");
    assert.throws(() => verifyMatrix(manifest), /Missing raw request/u);
    writeFileSync(requests, original);
    verifyMatrix(manifest);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("correctness cannot succeed with missing or changed raw evidence", () => {
  for (const failure of ["build", "stdin", "stdout", "stderr", "requests"]) {
    const directory = mkdtempSync(join(tmpdir(), "perf-correctness-raw-"));
    try {
      const manifest = fixture(directory);
      seal(manifest, directory);
      const destination = join(directory, "correctness");
      const fake = executor(manifest);
      let calls = 0;
      assert.throws(() =>
        checkMatrix(directory, destination, {
          source: () => ({ host: manifest.host, tree: "d".repeat(40) }),
          executor: (command) => {
            const result = fake(command);
            if (++calls === 53) {
              const path =
                failure === "build"
                  ? join(dirname(manifest.buildJournal.path), "000000.stdout")
                  : join(
                      destination,
                      "raw",
                      failure === "requests"
                        ? "requests.jsonl"
                        : `000000.${failure}`,
                    );
              if (failure === "stdout") writeFileSync(path, "changed");
              else rmSync(path);
            }
            return result;
          },
        }),
      );
      const failureRecord = JSON.parse(
        readFileSync(join(destination, "failure.json"), "utf8"),
      );
      assert.equal(failureRecord.completed.length, 53);
      assert.equal(failureRecord.timingEligible, false);
      assert.throws(() => readFileSync(join(destination, "correctness.json")));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test(
  "native compiler fixture pins resolve aliased temporary parents",
  {
    skip: process.platform === "win32" ? "requires directory symlinks" : false,
  },
  () => {
    const directory = realpathSync(
      mkdtempSync(join(tmpdir(), "perf-aliased-temp-")),
    );
    const alias = directory + "-alias";
    try {
      symlinkSync(directory, alias, "dir");
      verifyMatrix(fixture(alias));
    } finally {
      rmSync(alias, { force: true });
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
