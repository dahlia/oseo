import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";

import { fileIdentity, inspectStack } from "../../perf-profile-capture.ts";
import type { FileIdentity, StackCapture } from "../../perf-profile-capture.ts";
import type { RunRecord } from "../../perf-profile-process.ts";
import { digest } from "../corpus.ts";
import { profilingProbes } from "../../perf-profile.ts";
import type { ProfileInput, ProfileProof } from "../ordered-comparison.ts";
import { kernelCaptureRequest, kernelStdoutChecker } from "./profile.ts";

/** P's actual durable report, replayed against originals below. */
interface CaptureReport {
  readonly kind: string;
  readonly status: string;
  readonly failure: string | null;
  readonly interrupted: string | null;
  readonly host: { readonly platform: string; readonly architecture: string };
  readonly requestedCaptures: number;
  readonly captures: readonly StackCapture[];
  readonly before: readonly FileIdentity[];
  readonly after: readonly FileIdentity[];
  readonly finalIdentities: readonly FileIdentity[];
  readonly sourceBefore: readonly RunRecord[];
  readonly sourceAfter: readonly RunRecord[];
  readonly commands: readonly RunRecord[];
  readonly lifetimes: readonly RunRecord[];
}

/** Canonical originals, including nested discovery and saved inputs. */
export function profileInventory(directory: string): readonly FileIdentity[] {
  assert.equal(realpathSync(directory), directory);
  const files: FileIdentity[] = [];
  const visit = (path: string): void => {
    const meta = lstatSync(path);
    assert.equal(meta.isSymbolicLink(), false);
    assert.equal(realpathSync(path), path);
    if (meta.isDirectory()) {
      for (const name of readdirSync(path).toSorted()) visit(join(path, name));
    } else {
      assert.ok(meta.isFile());
      files.push(fileIdentity(path));
    }
  };
  visit(directory);
  return files;
}

/**
 * Reconstruct H's proof from P originals, never from P's success booleans.
 * This proves P's owned groups only; the parent must assess escaped children.
 */
export function replayKernelProfile(
  input: ProfileInput,
  directory: string,
  sourceDirectory: string,
): ProfileProof {
  const expected = kernelCaptureRequest(input);
  const files = profileInventory(directory);
  const pins = new Map(files.map((file) => [file.path, file]));
  const bytes = (name: string): Buffer => {
    const path = join(directory, name);
    const pin = pins.get(path);
    assert.ok(pin, `Unpinned P raw: ${name}`);
    assert.deepEqual(fileIdentity(path), pin);
    return readFileSync(path);
  };
  // SAFETY: decode pinned P originals, then replay their fields below.
  const json = <Value>(name: string): Value =>
    JSON.parse(bytes(name).toString("utf8")) as Value;
  const report = json<CaptureReport>("capture.json");
  assert.deepEqual(json("request.json"), expected);
  const checker = kernelStdoutChecker(input);
  assert.deepEqual(json("stdout-oracle.json"), {
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
  assert.equal(report.kind, "existing-artifact");
  assert.equal(report.status, "method-probe-passed");
  assert.equal(report.failure, null);
  assert.equal(report.interrupted, null);
  const mac = input.request.source.host.target === "macos-aarch64";
  const platform = mac ? "darwin" : "linux";
  assert.equal(report.host.platform, platform);
  assert.equal(report.host.architecture, mac ? "arm64" : "x64");
  assert.equal(report.requestedCaptures, 8);
  assert.equal(report.captures.length, 8);
  assert.deepEqual(report.before, report.after);
  assert.deepEqual(report.before, report.finalIdentities);
  assert.deepEqual(
    report.before.map((file) => file.path),
    [expected.executable, ...expected.inputs.map((file) => file.path)],
  );
  for (const [index, pin] of report.before.entries()) {
    assert.deepEqual(fileIdentity(pin.path), pin);
    assert.equal(
      pin.sha256,
      index === 0 ? expected.sha256 : expected.inputs[index - 1]!.sha256,
    );
    const saved = pins.get(join(directory, "files", String(index)));
    assert.ok(saved);
    assert.equal(saved.sha256, pin.sha256);
    assert.equal(saved.bytes, pin.bytes);
    assert.equal(saved.mode, pin.mode);
  }
  const plan = profilingProbes(platform);
  /**
   * P keeps a discovery probe whose tool is not installed as its failed spawn:
   * no PID or status, ENOENT and empty streams. Only Linux perf is optional;
   * GDB profiles and readelf reads symbols, so those must start.
   */
  const missingOptional = (record: RunRecord): void => {
    const slot = /^(\d+)\.stdout$/u.exec(record.stdout);
    assert.ok(slot, "Malformed discovery record");
    const argv = plan[Number(slot[1])];
    assert.ok(!mac && argv?.[0] === "perf", "Required discovery tool missing");
    assert.deepEqual(record.argv, argv);
    assert.equal(record.error, `Error: spawn ${argv[0]} ENOENT`);
    assert.deepEqual(record.cleanup, []);
  };
  const good = (
    record: RunRecord,
    status: number | null = 0,
    discovery = false,
  ): void => {
    const subdirectory = relative(directory, record.directory);
    assert.ok(
      subdirectory === "" ||
        (!subdirectory.startsWith("..") && !subdirectory.startsWith("/")),
    );
    const local = (name: string) => join(subdirectory, name);
    assert.deepEqual(
      json(local(record.stdout.replace(/\.stdout$/u, ".json"))),
      record,
    );
    assert.equal(record.status, status);
    assert.equal(record.signal, null);
    if (!discovery) assert.equal(record.error, null);
    assert.equal(record.timedOut, false);
    assert.equal(record.groupGone, true);
    const spawned = !discovery || record.pid !== null;
    if (spawned) assert.ok(record.pid != null && record.pid > 0);
    else {
      assert.equal(record.status, null);
      missingOptional(record);
      assert.equal(bytes(local(record.stdout)).length, 0);
      assert.equal(bytes(local(record.stderr)).length, 0);
    }
    assert.ok(Number.isFinite(record.monotonicStartMs));
    assert.ok(record.monotonicEndMs >= record.monotonicStartMs);
    assert.equal(
      record.wallMs,
      record.monotonicEndMs - record.monotonicStartMs,
    );
    assert.ok(Date.parse(record.finishedUtc) >= Date.parse(record.startedUtc));
    bytes(local(record.stdout));
    bytes(local(record.stderr));
  };
  for (const record of report.commands) good(record);
  for (const record of report.lifetimes) {
    if (record.directory === directory) {
      good(
        record,
        record.argv[0] === expected.executable ? expected.exitStatus : 0,
      );
    } else {
      assert.equal(record.directory, join(directory, "discovery"));
      good(record, record.status, true);
    }
  }
  const discovery = json<{
    readonly kind: string;
    readonly acceptance: string;
    readonly completed: boolean;
    readonly interrupted: string | null;
    readonly platform: string;
    readonly architecture: string;
    readonly cwd: string;
    readonly commands: readonly (RunRecord & {
      readonly toolPath: string | null;
      readonly stdoutBase64: string;
      readonly stderrBase64: string;
    })[];
  }>("discovery/discovery.json");
  assert.equal(discovery.kind, "profiling-tool-discovery");
  assert.equal(discovery.acceptance, "unverified");
  assert.equal(discovery.completed, true);
  assert.equal(discovery.interrupted, null);
  assert.equal(discovery.platform, platform);
  assert.equal(discovery.architecture, mac ? "arm64" : "x64");
  assert.equal(discovery.cwd, sourceDirectory);
  assert.equal(discovery.commands.length, plan.length);
  for (const [index, record] of discovery.commands.entries()) {
    assert.equal(record.stdout, `${index}.stdout`);
    assert.deepEqual(record.argv, [
      record.toolPath ?? plan[index]![0]!,
      ...plan[index]!.slice(1),
    ]);
    // A failed spawn resolved no tool; good() checked the original record.
    if (record.pid === null) assert.equal(record.toolPath, null);
    const original = report.lifetimes.find(
      (row) =>
        row.directory === join(directory, "discovery") &&
        row.stdout === record.stdout,
    );
    assert.ok(original);
    const { toolPath: _tool, stdoutBase64, stderrBase64, ...base } = record;
    assert.deepEqual(base, original);
    assert.equal(
      bytes(join("discovery", record.stdout)).toString("base64"),
      stdoutBase64,
    );
    assert.equal(
      bytes(join("discovery", record.stderr)).toString("base64"),
      stderrBase64,
    );
  }
  assert.deepEqual(json("file-map.json"), report.before);
  for (const records of [report.sourceBefore, report.sourceAfter]) {
    assert.equal(records.length, 2);
    records.forEach((record) => good(record));
    for (const record of records) assert.equal(record.cwd, sourceDirectory);
    assert.deepEqual(records[0]!.argv, [
      "git",
      "rev-parse",
      "HEAD",
      "HEAD^{tree}",
    ]);
    assert.deepEqual(records[1]!.argv, ["git", "status", "--porcelain"]);
    assert.equal(
      bytes(records[0]!.stdout).toString("utf8").trim(),
      `${input.request.source.host.commit}\n${input.request.source.tree}`,
    );
    assert.equal(bytes(records[1]!.stdout).length, 0);
  }
  const runs = ["preflight", "target"].map((name) => {
    const candidates = report.lifetimes.filter(
      (row) => row.stdout === `${name}.stdout`,
    );
    assert.equal(candidates.length, 1);
    const record = candidates[0]!;
    good(record, expected.exitStatus);
    assert.deepEqual(record.argv, [expected.executable, ...expected.argv]);
    assert.equal(record.cwd, expected.cwd);
    assert.deepEqual(record.env, expected.env);
    assert.equal(
      bytes(record.stderr).toString("base64"),
      expected.stderrBase64,
    );
    assert.equal(checker.check(bytes(record.stdout)), true);
    return record;
  });
  const target = runs[1]!;
  assert.deepEqual(json("profiler-before.json"), json("profiler-after.json"));
  const profiler = json<FileIdentity>("profiler-before.json");
  assert.deepEqual(fileIdentity(profiler.path), profiler);
  const names = new Set<string>();
  const captures = report.captures.map((capture, index) => {
    assert.equal(capture.index, index);
    assert.equal(capture.status, "useful-stack");
    assert.ok(capture.record);
    const record = capture.record;
    good(record);
    assert.ok(
      report.commands.some(
        (row) => digest(JSON.stringify(row)) === digest(JSON.stringify(record)),
      ),
    );
    const name = mac ? `sample-${index}.txt` : record.stdout;
    assert.equal(names.has(name), false);
    names.add(name);
    const text = bytes(name).toString("utf8");
    const stderr = bytes(record.stderr).toString("utf8");
    const quality = inspectStack(text + "\n" + stderr, platform);
    assert.deepEqual(capture.stack, quality);
    assert.ok(quality.useful && quality.generated);
    assert.equal(record.argv[0], profiler.path);
    if (mac) {
      assert.deepEqual(record.argv.slice(1), [
        String(target.pid),
        "1",
        "10",
        "-file",
        join(directory, name),
      ]);
      assert.match(text, new RegExp(`^Process:.*\\[${target.pid}\\]`, "mu"));
      assert.match(text, /^Target Type:\s+live task$/mu);
      assert.match(text, /^Analysis of sampling .* every 10 milliseconds$/mu);
      assert.match(text, /^Binary Images:/mu);
      assert.ok(stderr.includes("Sampling completed, processing symbols..."));
      assert.ok(quality.runtime);
      assert.equal(capture.targetAliveAtCompletion, true);
      assert.equal(capture.windowComplete, true);
      assert.ok(
        Date.parse(record.finishedUtc) - Date.parse(record.startedUtc) >= 1_000,
      );
    } else {
      assert.deepEqual(record.argv, [
        profiler.path,
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
      ]);
      assert.ok(text.includes(`process ${target.pid}`));
    }
    assert.ok(Date.parse(record.startedUtc) >= Date.parse(target.startedUtc));
    assert.ok(Date.parse(record.finishedUtc) <= Date.parse(target.finishedUtc));
    const pin = pins.get(join(directory, name))!;
    return {
      index,
      report: pin,
      useful: true,
      runtimeFrames: quality.runtime,
      generatedFrames: quality.generated,
      complete: true,
    };
  });
  assert.ok(captures.some((capture) => capture.runtimeFrames));
  const symbols = report.commands.filter((record) =>
    ["symbols-before.stdout", "symbols-after.stdout"].includes(record.stdout),
  );
  assert.equal(symbols.length, 2);
  assert.deepEqual(symbols[0]!.argv, symbols[1]!.argv);
  assert.deepEqual(
    symbols[0]!.argv.slice(1),
    mac ? ["--uuid", expected.executable] : ["-n", expected.executable],
  );
  if (mac) assert.equal(symbols[0]!.argv[0], "/usr/bin/dwarfdump");
  else assert.ok(symbols[0]!.argv[0]!.endsWith("/readelf"));
  assert.deepEqual(bytes(symbols[0]!.stdout), bytes(symbols[1]!.stdout));
  for (const pin of files) assert.deepEqual(fileIdentity(pin.path), pin);
  return {
    requestId: input.request.id,
    status: "complete",
    raw: files,
    artifactId: input.correctness.artifactId,
    executable: input.form.executable!,
    launchSha256: digest(JSON.stringify(input.profile.run)),
    captures,
    target: {
      stdout: bytes(target.stdout),
      stderr: bytes(target.stderr),
      status: target.status,
      signal: target.signal,
      error: target.error,
      startedAt: target.startedUtc,
      finishedAt: target.finishedUtc,
      monotonicStartMs: target.monotonicStartMs,
      monotonicEndMs: target.monotonicEndMs,
      wallMs: target.wallMs,
    },
    cleanup: "complete",
  };
}
