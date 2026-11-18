import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type {
  CaptureRequest,
  CaptureStdoutChecker,
} from "../../perf-profile-capture.ts";
import { artifact } from "../evidence.ts";
import type { Artifact } from "../evidence.ts";
import { checkExecution, executionText } from "../observation.ts";
import type { ProfileInput } from "../ordered-comparison.ts";

/** Independent approved count table; H owns its separate launch definition. */
const profileCounts: ReadonlyMap<string, number> = new Map([
  ["sieve", 2000],
  ["permute", 1000],
  ["json-roundtrip", 10000],
  ["regexp", 10000],
]);

function isStdoutChecker<Candidate>(
  value: Candidate,
): value is Candidate & CaptureStdoutChecker["check"] {
  return typeof value === "function";
}

function read(file: Artifact): Buffer {
  assert.deepEqual(artifact(file.path), file, "Changed H profile input");
  return readFileSync(file.path);
}

/** Bind P's existing-artifact request to H's actual checked native launch. */
export function kernelCaptureRequest(input: ProfileInput): CaptureRequest {
  const { form, correctness, requirements, profile } = input;
  const iterations = profileCounts.get(form.workload);
  assert.ok(iterations != null, "Unknown profile kernel");
  assert.ok(profile, "Missing fixed-count profile descriptor");
  assert.equal(profile.kind, "kernel-fixed-count-v1");
  assert.equal(profile.iterations, iterations);
  assert.deepEqual(form.run.args, []);
  assert.deepEqual(profile.run.args, ["--oseo-kernel-profile"]);
  assert.deepEqual({ ...profile.run, args: [] }, form.run);
  assert.ok(
    form.specialization === "enabled" || form.specialization === "disabled",
  );
  assert.equal(form.id, `oseo-${form.specialization}`);
  assert.equal(
    input.stdoutCheckerId,
    `H/checkExecution/kernel-fixed-count-v1/${form.workload}/${iterations}`,
  );
  assert.ok(isStdoutChecker(input.acceptsStdout));
  assert.equal(form.role, "timed");
  assert.equal(form.buildConfiguration, "optimized");
  assert.equal(form.observeSpecialization, false);
  assert.ok(form.executable);
  assert.equal(form.run.command, form.executable.path);
  assert.equal(
    correctness.artifactId,
    `${form.workload}/${form.id}/${form.role}`,
  );
  assert.equal(correctness.phase, "runtime");
  assert.equal(correctness.role, "timed");
  assert.deepEqual(correctness.identities, form.identities);
  assert.equal(correctness.command, form.run.command);
  assert.deepEqual(correctness.args, form.run.args);
  assert.equal(correctness.cwd, form.run.cwd);
  assert.deepEqual(correctness.env, form.run.env);
  assert.ok(form.run.stdin != null);
  assert.deepEqual(read(correctness.stdin), Buffer.from(form.run.stdin));
  assert.equal(correctness.status, 0);
  assert.equal(correctness.signal, null);
  assert.equal(correctness.error, null);
  assert.equal(requirements.captures, 8);
  assert.equal(requirements.targetTimeoutMs, 120_000);
  assert.deepEqual(requirements.linux, {
    serial: true,
    captureTimeoutMs: 5_000,
    frames: 16,
  });
  assert.deepEqual(requirements.mac, {
    concurrent: true,
    targetCount: 1,
    seconds: 1,
    intervalMs: 10,
    captureTimeoutMs: 20_000,
    correlated: true,
  });
  const required = [
    form.source,
    form.executable,
    ...form.identities,
    ...(form.generatedC ?? []),
    correctness.stdin,
    correctness.stdout,
    correctness.stderr,
    input.stdoutCheckerSource,
    ...input.checkerSources,
  ];
  assert.ok(input.checkerSources.length > 0);
  assert.ok(
    input.checkerSources.some(
      (file) => file.path === input.stdoutCheckerSource.path,
    ),
  );
  for (const file of [...required, ...input.inputs]) read(file);
  for (const file of required) {
    assert.ok(
      input.inputs.some(
        (pin) =>
          pin.path === file.path &&
          pin.sha256 === file.sha256 &&
          pin.bytes === file.bytes,
      ),
      "Required H input is absent from P inputs",
    );
  }
  // The original correctness record proves 100 calls, never the profile N.
  checkExecution(
    executionText({
      ...correctness,
      stdout: read(correctness.stdout),
      stderr: read(correctness.stderr),
    }),
    form.workload,
    100,
  );
  assert.ok(
    input.inputs.some(
      (file) =>
        file.path === input.stdoutCheckerSource.path &&
        file.sha256 === input.stdoutCheckerSource.sha256,
    ),
    "H checker source is absent from P inputs",
  );
  return {
    kind: "existing-artifact",
    executable: form.executable.path,
    sha256: form.executable.sha256,
    inputs: input.inputs.map(({ path, sha256 }) => ({ path, sha256 })),
    argv: [...profile.run.args],
    cwd: correctness.cwd,
    env: { ...correctness.env },
    stdinBase64: read(correctness.stdin).toString("base64"),
    stdoutBase64: read(correctness.stdout).toString("base64"),
    stderrBase64: read(correctness.stderr).toString("base64"),
    exitStatus: correctness.status,
  };
}

/** Keep H's variable-output checker; exact baseline bytes are insufficient. */
export function kernelStdoutChecker(input: ProfileInput): CaptureStdoutChecker {
  kernelCaptureRequest(input);
  assert.equal(
    input.acceptsStdout(read(input.correctness.stdout)),
    false,
    "The profile checker must reject the 100-call baseline",
  );
  return {
    id: input.stdoutCheckerId,
    sourcePath: input.stdoutCheckerSource.path,
    sourceSha256: input.stdoutCheckerSource.sha256,
    check: input.acceptsStdout,
  };
}
