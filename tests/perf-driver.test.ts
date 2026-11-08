import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync } from "node:fs";
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

import {
  buildMatrix,
  pinnedCommand,
  launchEnvironment,
} from "../tools/perf/build.ts";
import type { BuildManifest, BuiltForm } from "../tools/perf/build.ts";
import { artifact, validateEvidence } from "../tools/perf/evidence.ts";
import { kernels } from "../tools/perf/corpus.ts";
import { Journal } from "../tools/perf/journal.ts";
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
        const binary = file(`${workload}-${variant.id}-${role}`);
        const generatedC = native ? [file(`${basename(binary.path)}.c`)] : null;
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
  return {
    schema: 1,
    method: defaultMethod,
    forms,
    buildJournal: file("builds.jsonl"),
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
    assert.equal(contract.cwd, realpathSync.native(directory));
    const entries = readFileSync(
      join(directory, "journal", "launches.jsonl"),
      "utf8",
    ).trim();
    const record = JSON.parse(entries);
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
