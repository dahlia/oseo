import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  chmodSync,
  lstatSync,
  cpSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import test from "node:test";
import { describeTarget } from "../packages/compiler/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import type {
  BuildManifest,
  BuiltForm,
  NativeBuildMetadata,
} from "../tools/perf/build.ts";
import { artifact } from "../tools/perf/evidence.ts";
import {
  digest,
  kernelProfileFlag,
  kernelProfileIterations,
  kernels,
} from "../tools/perf/corpus.ts";
import { Journal, verifyJournal } from "../tools/perf/journal.ts";
import type { RawExecution } from "../tools/perf/observation.ts";
import { defaultMethod, variants } from "../tools/perf/plan.ts";
import type { Command } from "../tools/perf/plan.ts";
import { runOrderedComparison } from "../tools/perf/ordered-comparison.ts";
import { runPairChild } from "../tools/perf/mac-pair-session.ts";
import type { GitHubNativeContext } from "../tools/perf/native-admission.ts";
import type {
  NativeControl,
  NativeControlProof,
} from "../tools/perf/native-phase-ipc.ts";
import type {
  BoundaryProof,
  ComparisonRequest,
  ExclusionProof,
  OrderedComparisonOptions,
  ProfileInput,
  ProfileProof,
} from "../tools/perf/ordered-comparison.ts";

const counters = {
  guardHits: 1,
  guardMisses: 2,
  overflowMisses: 3,
  genericAdditionCalls: 4,
  allocations: 5,
  collections: 6,
};
function raw(stdout: string, stderr = ""): RawExecution {
  return {
    stdout: Buffer.from(stdout),
    stderr: Buffer.from(stderr),
    status: 0,
    signal: null,
    error: null,
    wallMs: 1,
    startedAt: "2026-11-09T00:00:00.000Z",
    finishedAt: "2026-11-09T00:00:00.001Z",
    monotonicStartMs: 1,
    monotonicEndMs: 2,
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
            env: { LANG: "C", OSEO_INPUT: "byte-fixture" },
            stdin: [0, 255, 13, 10],
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

interface Fixture {
  readonly directory: string;
  readonly manifest: BuildManifest;
  readonly options: OrderedComparisonOptions;
  readonly calls: string[];
  readonly inputs: ProfileInput[];
  readonly proof: (request: ComparisonRequest) => BoundaryProof;
  readonly profile: (input: ProfileInput) => Promise<ProfileProof>;
}

function setup(directory: string, mac = false): Fixture {
  const built = join(directory, "built");
  mkdirSync(built);
  const manifest = fixture(built, mac);
  const text = JSON.stringify(manifest);
  writeFileSync(join(built, "built.json"), text);
  writeFileSync(join(built, "built.sha256"), digest(text));
  const calls: string[] = [];
  const inputs: ProfileInput[] = [];
  const proof = (request: ComparisonRequest): BoundaryProof => {
    const path = join(directory, request.id + "-" + calls.length + ".json");
    writeFileSync(path, JSON.stringify({ request, fake: true }));
    return { requestId: request.id, status: "complete", raw: [artifact(path)] };
  };
  const profile = async (input: ProfileInput): Promise<ProfileProof> => {
    inputs.push(input);
    calls.push("profile:" + input.form.workload + "/" + input.form.id);
    return {
      ...proof(input.request),
      artifactId: `${input.form.workload}/${input.form.id}/timed`,
      executable: input.form.executable!,
      launchSha256: digest(JSON.stringify(input.profile.run)),
      cleanup: "complete",
      target: raw(
        `PERF_OK ${input.form.workload} ` +
          `${input.profile.iterations}\nPERF_TIME 17\n`,
      ),
      captures: Array.from({ length: 8 }, (_, index) => {
        const path = join(directory, input.request.id + "-" + index + ".txt");
        writeFileSync(path, `fake report ${index}`);
        return {
          index,
          report: artifact(path),
          useful: true,
          runtimeFrames: true,
          generatedFrames: true,
          complete: true,
        };
      }),
    };
  };
  const options: OrderedComparisonOptions = {
    directory: built,
    destination: join(directory, "result"),
    physicalHost: "fake-physical-host",
    accounts: mac ? ["oseo-mac-1", "oseo-mac-2"] : ["fake-account"],
    source: () => ({ host: manifest.host, tree: "d".repeat(40) }),
    measurement: {
      runId: "hermetic-only",
      rssFirst: true,
      conditions: {
        power: "synthetic",
        backgroundLoad: "fake executors",
        cachePolicy: "warm-process-launch",
        notes: "not performance evidence",
      },
    },
    correctnessExecutor: (command) => {
      calls.push("correctness");
      return executor(manifest)(command);
    },
    measurementExecutor: (command) => {
      calls.push("measurement");
      return executor(manifest)(command);
    },
    boundaries: {
      diagnose: async (request) => {
        calls.push("diagnosis");
        return proof(request);
      },
      admit: async (request, purpose) => {
        calls.push(purpose + "-admission");
        return { ...proof(request), authority: "Root", purpose };
      },
      exclude: async (request, purpose) => {
        calls.push(purpose + "-open");
        const startedMs = Date.now();
        const window = (): ExclusionProof => ({
          ...proof(request),
          physicalHost: options.physicalHost,
          accounts: options.accounts,
          coverage: "whole-window",
          startedMs,
          finishedMs: Date.now(),
        });
        return {
          opened: {
            ...proof(request),
            physicalHost: options.physicalHost,
            accounts: options.accounts,
            startedMs,
            state: "monitoring",
          },
          finish: async () => {
            calls.push(purpose + "-close");
            return window();
          },
        };
      },
      profile,
      finalize: async (request) => {
        calls.push("finalize");
        return proof(request);
      },
    },
  };
  return { directory, manifest, options, calls, inputs, proof, profile };
}

async function withFixture(
  action: (fixture: Fixture) => Promise<void>,
  mac = false,
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "ordered-fake-"));
  try {
    await action(setup(directory, mac));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

for (const mac of [false, true]) {
  test(`ordered real H chain with byte-only fakes, mac=${mac}`, async () => {
    await withFixture(async (f) => {
      const result = await runOrderedComparison(f.options);
      assert.deepEqual(
        {
          status: result.status,
          error: result.error,
          finalizationErrors: result.finalizationErrors,
        },
        { status: "complete", error: null, finalizationErrors: [] },
      );
      const phases = f.calls.filter(
        (call, index) => index === 0 || call !== f.calls[index - 1],
      );
      assert.deepEqual(phases, [
        "diagnosis",
        "correctness",
        "profile-admission",
        "profile-open",
        ...kernels.flatMap((kernel) => [
          `profile:${kernel.id}/oseo-enabled`,
          `profile:${kernel.id}/oseo-disabled`,
        ]),
        "profile-close",
        "timing-admission",
        "timing-open",
        "measurement",
        "timing-close",
        "finalize",
      ]);
      assert.equal(f.calls.filter((call) => call === "correctness").length, 53);
      assert.equal(f.inputs.length, 8);
      const profileEvents = readFileSync(
        join(f.options.destination, "ordered.jsonl"),
        "utf8",
      )
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line))
        .filter((event) => event.kind === "profile-input");
      assert.deepEqual(
        profileEvents.map((event) => event.profile),
        f.inputs.map((input) => input.profile),
      );
      for (const input of f.inputs) {
        const form = f.manifest.forms.find(
          (candidate) =>
            candidate.workload === input.form.workload &&
            candidate.id === input.form.id &&
            candidate.role === "timed",
        )!;
        assert.deepEqual(input.form, JSON.parse(JSON.stringify(form)));
        assert.deepEqual(input.form.run.stdin, [0, 255, 13, 10]);
        assert.deepEqual(input.form.run.args, []);
        assert.deepEqual(input.profile, {
          kind: "kernel-fixed-count-v1",
          iterations: kernelProfileIterations(form.workload),
          run: { ...form.run, args: [kernelProfileFlag] },
        });
        assert.ok(Object.isFrozen(input.profile));
        assert.ok(Object.isFrozen(input.profile.run));
        assert.ok(Object.isFrozen(input.profile.run.args));
        assert.equal(
          readFileSync(input.correctness.stdout.path, "utf8"),
          `PERF_OK ${form.workload} 100\nPERF_TIME 0\n`,
        );
        assert.equal(
          input.acceptsStdout(
            Buffer.from(`PERF_OK ${form.workload} 100\nPERF_TIME 0\n`),
          ),
          false,
        );
        const corpusSource = input.checkerSources.find((file) =>
          file.path.endsWith("/tools/perf/corpus.ts"),
        );
        assert.ok(corpusSource);
        assert.deepEqual(corpusSource, artifact(corpusSource.path));
        assert.equal(input.correctness.status, 0);
        assert.equal(
          input.stdoutCheckerId,
          `H/checkExecution/kernel-fixed-count-v1/${form.workload}/` +
            kernelProfileIterations(form.workload),
        );
        assert.ok(
          input.inputs.some(
            (file) =>
              file.path === input.stdoutCheckerSource.path &&
              file.sha256 === input.stdoutCheckerSource.sha256,
          ),
        );
        assert.deepEqual(input.requirements, {
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
        });
        const profileRows = verifyJournal(
          join(
            f.options.destination,
            input.request.id + "-raw",
            "launches.jsonl",
          ),
        );
        assert.equal(profileRows.length, 1);
        assert.deepEqual(profileRows[0]!.args, [kernelProfileFlag]);
        assert.equal(profileRows[0]!.command, form.run.command);
        assert.equal(profileRows[0]!.cwd, form.run.cwd);
        assert.deepEqual(profileRows[0]!.env, form.run.env);
        assert.equal(profileRows[0]!.timingEligible, false);
        assert.equal(profileRows[0]!.retained, false);
        assert.deepEqual(
          [...readFileSync(profileRows[0]!.stdin.path)],
          [0, 255, 13, 10],
        );
        assert.equal(
          readFileSync(profileRows[0]!.stdout.path, "utf8"),
          `PERF_OK ${form.workload} ${input.profile.iterations}\n` +
            "PERF_TIME 17\n",
        );
        for (const file of [
          form.source,
          form.executable!,
          ...form.generatedC!,
          ...form.identities,
        ]) {
          assert.ok(
            input.inputs.some(
              (value) =>
                value.sha256 === file.sha256 && value.path === file.path,
            ),
          );
        }
        const metadata: NativeBuildMetadata = JSON.parse(
          readFileSync(join(dirname(form.run.command), "build.json"), "utf8"),
        );
        for (const file of [
          metadata.compiler,
          ...metadata.runtimeAssets,
          ...input.checkerSources,
        ]) {
          assert.ok(
            input.inputs.some(
              (value) =>
                value.path === file.path && value.sha256 === file.sha256,
            ),
          );
        }
        assert.equal(
          input.acceptsStdout(
            Buffer.from(
              `PERF_OK ${form.workload} ${input.profile.iterations}\n` +
                "PERF_TIME 999\n",
            ),
          ),
          true,
        );
        assert.equal(
          input.acceptsStdout(
            Buffer.from(`PERF_OK ${form.workload} 99\nPERF_TIME 999\n`),
          ),
          false,
        );
        assert.equal(input.acceptsStdout(Uint8Array.of(255)), false);
      }
      const rows = verifyJournal(
        join(f.options.destination, "correctness", "raw", "launches.jsonl"),
      );
      assert.ok(rows.every((row) => !row.args.includes(kernelProfileFlag)));
      assert.equal(rows.filter((row) => row.role === "timed").length, 36);
      assert.equal(rows.filter((row) => row.role === "observe").length, 8);
      assert.equal(rows.filter((row) => row.role === "startup").length, 9);
      assert.ok(
        rows.every((row) => row.timingEligible === false && !row.retained),
      );
      const measured = verifyJournal(
        join(f.options.destination, "measurement", "raw", "launches.jsonl"),
      );
      assert.ok(measured.every((row) => !row.args.includes(kernelProfileFlag)));
      assert.equal(
        measured.filter((row) => row.phase === "runtime" && row.retained)
          .length,
        36 * 15,
      );
      assert.equal(
        measured.filter((row) => row.phase === "rss" && row.retained).length,
        36 * 15,
      );
      assert.equal(
        measured.filter((row) => row.phase === "startup" && row.retained)
          .length,
        9 * 15,
      );
      assert.equal(
        measured.filter(
          (row) => row.phase === "runtime" && row.reason === "warmup",
        ).length,
        36 * 3,
      );
      assert.equal(
        measured.filter((row) => row.phase === "observe").length,
        8 * 2,
      );
      if (mac)
        assert.equal(
          measured.filter((row) => row.reason === "mac-first-new-executable")
            .length,
          33,
        );
      const evidence = JSON.parse(
        readFileSync(result.measurements!.path, "utf8"),
      );
      assert.deepEqual(evidence.method, defaultMethod);
      assert.deepEqual(
        evidence.kernels[0].variants.map(
          (variant: { readonly id: string }) => variant.id,
        ),
        [
          "oseo-enabled",
          "oseo-disabled",
          "node",
          "node-jitless",
          "deno",
          "bun",
          "node-sea",
          "deno-compile",
          "bun-compile",
        ],
      );
    }, mac);
  });
}

for (const metadataCase of ["decoy-first", "missing", "duplicate"] as const) {
  test(`native metadata identity: ${metadataCase}`, async () => {
    await withFixture(async (f) => {
      const decoyPath = join(f.directory, "unrelated", "build.json");
      mkdirSync(dirname(decoyPath));
      writeFileSync(decoyPath, "not native build metadata");
      const decoy = artifact(decoyPath);
      const forms = f.manifest.forms.map((form) => {
        if (form.specialization == null) return form;
        const expectedPath = join(dirname(form.run.command), "build.json");
        const metadata = form.identities.find(
          (file) => file.path === expectedPath,
        )!;
        assert.ok(metadata);
        return {
          ...form,
          identities: [
            decoy,
            ...form.identities.filter(
              (file) =>
                metadataCase !== "missing" || file.path !== expectedPath,
            ),
            ...(metadataCase === "duplicate" ? [metadata] : []),
          ],
        };
      });
      const text = JSON.stringify({ ...f.manifest, forms });
      writeFileSync(join(f.options.directory, "built.json"), text);
      writeFileSync(join(f.options.directory, "built.sha256"), digest(text));
      const result = await runOrderedComparison(f.options);
      if (metadataCase === "decoy-first") {
        assert.equal(result.status, "complete");
        assert.equal(result.error, null);
        assert.equal(f.inputs.length, 8);
        for (const input of f.inputs) {
          const metadata: NativeBuildMetadata = JSON.parse(
            readFileSync(
              join(dirname(input.form.run.command), "build.json"),
              "utf8",
            ),
          );
          assert.ok(
            input.inputs.some(
              (file) =>
                file.path === metadata.compiler.path &&
                file.sha256 === metadata.compiler.sha256,
            ),
          );
        }
      } else {
        assert.equal(result.status, "failed");
        assert.equal(result.failedPhase, "inputs");
        assert.match(result.error!, /Missing native build metadata identity/u);
        assert.deepEqual(f.calls, []);
      }
    });
  });
}

for (const status of [
  "failed",
  "partial",
  "unknown",
  "stale",
  "no-raw",
] as const) {
  test(`diagnosis ${status} blocks later work`, async () => {
    await withFixture(async (f) => {
      const result = await runOrderedComparison({
        ...f.options,
        boundaries: {
          ...f.options.boundaries,
          diagnose: async (req) => {
            const proof = f.proof(req);
            return {
              ...proof,
              status:
                status === "stale" || status === "no-raw" ? "complete" : status,
              requestId: status === "stale" ? "old-request" : req.id,
              raw: status === "no-raw" ? [] : proof.raw,
            };
          },
        },
      });
      assert.equal(result.status, "failed");
      assert.equal(result.failedPhase, "diagnosis");
      assert.deepEqual(f.calls, ["finalize"]);
    });
  });
}

test("missing profile adapter blocks execution", async () => {
  await withFixture(async (f) => {
    const boundaries = { ...f.options.boundaries };
    // @ts-expect-error Runtime callers can omit the future adapter.
    delete boundaries.profile;
    const result = await runOrderedComparison({ ...f.options, boundaries });
    assert.match(result.error!, /Missing required boundary: profile/u);
    assert.deepEqual(f.calls, []);
  });
});

test("H byte failure blocks admission", async () => {
  await withFixture(async (f) => {
    const bad = { ...raw("bad output\n", "original error\n"), status: 19 };
    const result = await runOrderedComparison({
      ...f.options,
      correctnessExecutor: () => bad,
    });
    assert.equal(result.failedPhase, "correctness");
    assert.deepEqual(f.calls, ["diagnosis", "finalize"]);
    const rows = verifyJournal(
      join(f.options.destination, "correctness", "raw", "launches.jsonl"),
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.status, 19);
    assert.deepEqual(readFileSync(rows[0]!.stdout.path), bad.stdout);
    assert.deepEqual(readFileSync(rows[0]!.stderr.path), bad.stderr);
    assert.deepEqual([...readFileSync(rows[0]!.stdin.path)], [0, 255, 13, 10]);
    const failure = JSON.parse(
      readFileSync(
        join(f.options.destination, "correctness", "failure.json"),
        "utf8",
      ),
    );
    assert.equal(failure.unattempted.length, 52);
    assert.equal(failure.lastLaunch.status, 19);
  });
});

for (const problem of ["purpose", "authority", "partial"] as const) {
  test(`profile admission ${problem} blocks every profile`, async () => {
    await withFixture(async (f) => {
      const result = await runOrderedComparison({
        ...f.options,
        boundaries: {
          ...f.options.boundaries,
          // @ts-expect-error Exercise untrusted adapter authority.
          admit: async (req) => ({
            ...f.proof(req),
            purpose: problem === "purpose" ? "timing" : "profile",
            authority: problem === "authority" ? "lease" : "Root",
            status: problem === "partial" ? "partial" : "complete",
          }),
        },
      });
      assert.equal(result.status, "failed");
      assert.equal(result.failedPhase, "profile-admission");
      assert.equal(f.inputs.length, 0);
      assert.ok(!f.calls.includes("timing-admission"));
    });
  });
}

for (const problem of ["open", "accounts", "host", "gap", "partial"] as const) {
  test(`profile exclusion ${problem} blocks every profile`, async () => {
    await withFixture(async (f) => {
      const original = f.options.boundaries.exclude;
      const result = await runOrderedComparison({
        ...f.options,
        boundaries: {
          ...f.options.boundaries,
          exclude: async (req, purpose) => {
            if (problem === "open") throw new Error("monitor unavailable");
            const monitor = await original(req, purpose);
            return {
              ...monitor,
              opened: {
                ...monitor.opened,
                accounts: problem === "accounts" ? [] : monitor.opened.accounts,
                physicalHost:
                  problem === "host"
                    ? "other-host"
                    : monitor.opened.physicalHost,
                startedMs:
                  problem === "gap"
                    ? Date.now() + 60_000
                    : monitor.opened.startedMs,
                status:
                  problem === "partial" ? "partial" : monitor.opened.status,
              },
            };
          },
        },
      });
      assert.equal(result.status, "failed");
      assert.equal(f.inputs.length, 0);
      assert.ok(!f.calls.includes("timing-admission"));
      if (problem !== "open") assert.ok(f.calls.includes("profile-close"));
    });
  });
}

for (const position of [0, 1, 2, 3, 4, 5, 6, 7]) {
  test(`required native artifact ${position} cannot be skipped`, async () => {
    await withFixture(async (f) => {
      let attempted = 0;
      const result = await runOrderedComparison({
        ...f.options,
        boundaries: {
          ...f.options.boundaries,
          profile: async (input) => {
            const proof = await f.profile(input);
            return attempted++ === position
              ? { ...proof, captures: proof.captures.slice(1) }
              : proof;
          },
        },
      });
      assert.equal(result.status, "failed");
      assert.equal(result.profiled.length, position);
      assert.equal(f.inputs.length, position + 1);
      assert.ok(f.calls.includes("profile-close"));
      assert.ok(!f.calls.includes("timing-admission"));
    });
  });
}

for (const problem of [
  "status",
  "cleanup",
  "launch",
  "base-launch",
  "baseline-stdout",
  "wrong-count",
  "hash",
  "capture",
  "runtime",
  "duplicate",
  "stale",
] as const) {
  test(`profile ${problem} refuses timing admission`, async () => {
    await withFixture(async (f) => {
      const result = await runOrderedComparison({
        ...f.options,
        boundaries: {
          ...f.options.boundaries,
          profile: async (input) => {
            const proof = await f.profile(input);
            return {
              ...proof,
              status: problem === "status" ? "unknown" : proof.status,
              cleanup: problem === "cleanup" ? "unknown" : proof.cleanup,
              launchSha256:
                problem === "launch"
                  ? "e".repeat(64)
                  : problem === "base-launch"
                    ? digest(JSON.stringify(input.form.run))
                    : proof.launchSha256,
              target:
                problem === "baseline-stdout" || problem === "wrong-count"
                  ? raw(
                      `PERF_OK ${input.form.workload} ` +
                        `${problem === "baseline-stdout" ? 100 : 99}\n` +
                        "PERF_TIME 17\n",
                    )
                  : proof.target,
              executable:
                problem === "hash"
                  ? {
                      ...proof.executable,
                      sha256: "e".repeat(64),
                    }
                  : proof.executable,
              requestId: problem === "stale" ? "historical" : proof.requestId,
              captures: proof.captures.map((capture) => ({
                index: capture.index,
                report:
                  problem === "duplicate"
                    ? proof.captures[0]!.report
                    : capture.report,
                useful: capture.useful,
                runtimeFrames:
                  problem === "runtime" ? false : capture.runtimeFrames,
                generatedFrames: capture.generatedFrames,
                complete: problem === "capture" ? false : capture.complete,
              })),
            };
          },
        },
      });
      assert.equal(result.status, "failed");
      assert.equal(result.profiled.length, 0);
      assert.ok(!f.calls.includes("timing-admission"));
    });
  });
}

test("failed profile exclusion blocks timing", async () => {
  await withFixture(async (f) => {
    const result = await runOrderedComparison({
      ...f.options,
      boundaries: {
        ...f.options.boundaries,
        exclude: async (req, purpose) => {
          const monitor = await f.options.boundaries.exclude(req, purpose);
          return {
            ...monitor,
            finish: async (bounds) => ({
              ...(await monitor.finish(bounds)),
              finishedMs: bounds.startedMs - 1,
            }),
          };
        },
      },
    });
    assert.equal(result.status, "failed");
    assert.equal(result.profiled.length, 8);
    assert.ok(!f.calls.includes("timing-admission"));
  });
});

test("timing requires separate admission", async () => {
  await withFixture(async (f) => {
    let profileApproval: BoundaryProof | null = null;
    const result = await runOrderedComparison({
      ...f.options,
      boundaries: {
        ...f.options.boundaries,
        admit: async (req, purpose) => {
          const proof = await f.options.boundaries.admit(req, purpose);
          if (purpose === "profile") profileApproval = proof;
          if (purpose === "timing" && profileApproval != null) {
            return { ...proof, ...profileApproval };
          }
          return proof;
        },
      },
    });
    assert.equal(result.failedPhase, "timing-admission");
    assert.ok(!f.calls.includes("timing-open"));
    assert.ok(!f.calls.includes("measurement"));
  });
});

test("unknown timing exclusion blocks measurement", async () => {
  await withFixture(async (f) => {
    const result = await runOrderedComparison({
      ...f.options,
      boundaries: {
        ...f.options.boundaries,
        exclude: async (req, purpose) => {
          const monitor = await f.options.boundaries.exclude(req, purpose);
          return purpose === "profile"
            ? monitor
            : { ...monitor, opened: { ...monitor.opened, status: "unknown" } };
        },
      },
    });
    assert.equal(result.status, "failed");
    assert.ok(!f.calls.includes("measurement"));
    assert.ok(f.calls.includes("timing-close"));
  });
});

for (const problem of [
  "source",
  "artifact",
  "mode",
  "raw",
  "manifest",
] as const) {
  test(`${problem} drift blocks correctness`, async () => {
    await withFixture(async (f) => {
      let changed = false;
      const executable = f.manifest.forms[0]!.executable!.path;
      const originalMode = lstatSync(executable).mode & 0o777;
      try {
        const result = await runOrderedComparison({
          ...f.options,
          source: () => ({
            host: f.manifest.host,
            tree:
              changed && problem === "source" ? "e".repeat(40) : "d".repeat(40),
          }),
          boundaries: {
            ...f.options.boundaries,
            diagnose: async (req) => {
              const proof = await f.options.boundaries.diagnose(req);
              changed = true;
              if (problem === "artifact")
                writeFileSync(f.manifest.forms[0]!.executable!.path, "drift");
              if (problem === "mode") {
                assert.notEqual(originalMode & 0o222, 0);
                chmodSync(executable, originalMode & ~0o222);
                assert.equal(lstatSync(executable).mode & 0o222, 0);
                assert.notEqual(
                  lstatSync(executable).mode & 0o777,
                  originalMode,
                );
                assert.deepEqual(
                  artifact(executable),
                  f.manifest.forms[0]!.executable,
                );
              }
              if (problem === "raw") writeFileSync(proof.raw[0]!.path, "drift");
              if (problem === "manifest")
                writeFileSync(join(f.options.directory, "built.json"), "drift");
              return proof;
            },
          },
        });
        assert.equal(result.status, "failed");
        if (problem === "mode") {
          assert.equal(result.failedPhase, "diagnosis");
          assert.equal(
            result.error,
            `Error: Frozen identity changed: ${executable}`,
          );
        }
        assert.ok(!f.calls.includes("correctness"));
        assert.ok(f.calls.includes("finalize"));
      } finally {
        if (problem === "mode") chmodSync(executable, originalMode);
      }
    });
  });
}

test("artifact drift before the chain never reaches diagnosis", async () => {
  await withFixture(async (f) => {
    writeFileSync(f.manifest.forms[0]!.source.path, "changed source");
    const result = await runOrderedComparison(f.options);
    assert.equal(result.status, "failed");
    assert.deepEqual(f.calls, []);
  });
});

test("raw correctness drift blocks the next target", async () => {
  await withFixture(async (f) => {
    const result = await runOrderedComparison({
      ...f.options,
      boundaries: {
        ...f.options.boundaries,
        profile: async (input) => {
          const proof = await f.profile(input);
          writeFileSync(input.correctness.stdout.path, "corrupted");
          return proof;
        },
      },
    });
    assert.equal(result.status, "failed");
    assert.equal(f.inputs.length, 1);
    assert.ok(!f.calls.includes("timing-admission"));
  });
});

test("raw failure survives cleanup errors", async () => {
  await withFixture(async (f) => {
    let targetRequest: ComparisonRequest | null = null;
    const target = {
      ...raw("partial stdout\n", "attach failure\n"),
      status: null,
      signal: "SIGTERM",
      error: "original timeout",
    };
    const result = await runOrderedComparison({
      ...f.options,
      boundaries: {
        ...f.options.boundaries,
        profile: async (input) => {
          targetRequest = input.request;
          return { ...(await f.profile(input)), target };
        },
        exclude: async (req, purpose) => {
          const monitor = await f.options.boundaries.exclude(req, purpose);
          return {
            ...monitor,
            finish: async () => {
              throw new Error("monitor cleanup failed");
            },
          };
        },
        finalize: async () => {
          throw new Error("terminal unknown");
        },
      },
    });
    assert.match(result.error!, /original timeout/u);
    assert.ok(result.failedPhase!.startsWith("profile:"));
    assert.equal(result.finalizationErrors.length, 2);
    assert.match(result.finalizationErrors[0]!, /monitor cleanup/u);
    assert.match(result.finalizationErrors[1]!, /terminal unknown/u);
    assert.ok(targetRequest);
    // SAFETY: The completed profile callback assigned this exact request.
    const completedRequest = targetRequest as ComparisonRequest;
    const rows = verifyJournal(
      join(
        f.options.destination,
        completedRequest.id + "-raw",
        "launches.jsonl",
      ),
    );
    assert.deepEqual(readFileSync(rows[0]!.stdout.path), target.stdout);
    assert.deepEqual(readFileSync(rows[0]!.stderr.path), target.stderr);
    assert.equal(rows[0]!.error, "original timeout");
    assert.equal(rows[0]!.signal, "SIGTERM");
    assert.ok(!f.calls.includes("timing-admission"));
    assert.deepEqual(
      JSON.parse(
        readFileSync(join(f.options.destination, "result.json"), "utf8"),
      ),
      result,
    );
  });
});

test("H failure closes the timing window", async () => {
  await withFixture(async (f) => {
    const result = await runOrderedComparison({
      ...f.options,
      measurementExecutor: () => ({ ...raw("bad startup\n"), status: 23 }),
    });
    assert.equal(result.status, "failed");
    assert.match(result.error!, /Execution failed: 23/u);
    assert.ok(f.calls.includes("timing-close"));
    assert.equal(f.calls.at(-1), "finalize");
    const rows = verifyJournal(
      join(f.options.destination, "measurement", "raw", "launches.jsonl"),
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.status, 23);
  });
});

test("incomplete timing close rejects the result", async () => {
  await withFixture(async (f) => {
    const result = await runOrderedComparison({
      ...f.options,
      boundaries: {
        ...f.options.boundaries,
        exclude: async (req, purpose) => {
          const monitor = await f.options.boundaries.exclude(req, purpose);
          return purpose === "profile"
            ? monitor
            : {
                ...monitor,
                finish: async (bounds) => ({
                  ...(await monitor.finish(bounds)),
                  status: "partial",
                }),
              };
        },
      },
    });
    assert.equal(result.status, "failed");
    assert.ok(result.measurements);
    assert.equal(result.failedPhase, "timing-exclusion-close");
    assert.equal(f.calls.at(-1), "finalize");
  });
});

test("a missing exclusion finalizer blocks profiles", async () => {
  await withFixture(async (f) => {
    const result = await runOrderedComparison({
      ...f.options,
      boundaries: {
        ...f.options.boundaries,
        exclude: async (req, purpose) => {
          const monitor = await f.options.boundaries.exclude(req, purpose);
          // @ts-expect-error Exercise an incomplete external monitor.
          delete monitor.finish;
          return monitor;
        },
      },
    });
    assert.equal(result.status, "failed");
    assert.match(result.error!, /Missing profile exclusion finalizer/u);
    assert.equal(f.inputs.length, 0);
    assert.equal(result.finalizationErrors.length, 1);
  });
});

test("Mac requires runtime frames in every separate capture", async () => {
  await withFixture(async (f) => {
    const result = await runOrderedComparison({
      ...f.options,
      boundaries: {
        ...f.options.boundaries,
        profile: async (input) => {
          const proof = await f.profile(input);
          return {
            ...proof,
            captures: proof.captures.map((capture, index) =>
              Object.assign({}, capture, { runtimeFrames: index !== 0 }),
            ),
          };
        },
      },
    });
    assert.equal(result.status, "failed");
    assert.equal(result.profiled.length, 0);
    assert.ok(!f.calls.includes("timing-admission"));
  }, true);
});

test("final raw mutation prevents a successful handoff", async () => {
  await withFixture(async (f) => {
    const result = await runOrderedComparison({
      ...f.options,
      boundaries: {
        ...f.options.boundaries,
        finalize: async (req, failure) => {
          const rows = verifyJournal(
            join(f.options.destination, "measurement", "raw", "launches.jsonl"),
          );
          writeFileSync(rows[0]!.stdout.path, "changed after timing");
          return f.options.boundaries.finalize(req, failure);
        },
      },
    });
    assert.equal(result.status, "failed");
    assert.equal(result.error, null);
    assert.equal(result.finalizationErrors.length, 1);
    assert.match(result.finalizationErrors[0]!, /Frozen identity changed/u);
  });
});

const ownedNode = {
  skip:
    process.platform === "win32" || "Deno" in globalThis
      ? "requires POSIX Node.js owned group/fd3"
      : false,
};

function fixtureModule(name: string): string {
  return JSON.stringify(
    new URL(`../tools/perf/${name}.ts`, import.meta.url).href,
  );
}

for (const fault of [
  "diagnosis",
  "correctness",
  "profile-admission",
  "profile",
] as const) {
  test(`ordered owned IPC finalizes ${fault} failure`, ownedNode, async () => {
    const directory = mkdtempSync(join(tmpdir(), "ordered-ipc-"));
    const f = setup(directory);
    const phases: string[] = [];
    const now = Date.now();
    const context: GitHubNativeContext = {
      schema: 1,
      origin: "github",
      session: "ordered-ipc",
      repository: "fixture/oseo",
      run: "123",
      attempt: "1",
      comparisonRunId: f.options.measurement.runId,
      commit: f.manifest.host.commit,
      tree: "d".repeat(40),
      manifest: artifact(join(f.options.directory, "built.json")),
      accounts: f.options.accounts,
      jobs: [
        {
          session: "ordered-ipc",
          repository: "fixture/oseo",
          run: "123",
          attempt: "1",
          source: f.manifest.host.commit,
          tree: "d".repeat(40),
          role: "owner",
          job: "11",
          runnerId: "21",
          runnerName: "fixture",
          account: "fixture",
          uid: userInfo().uid,
          hardwareUuid: "11111111-1111-1111-1111-111111111111",
          bootUuid: "22222222-2222-2222-2222-222222222222",
          platform: "linux",
          arch: "x64",
        },
      ],
    };
    const tail = join(directory, "parent-tail.bin");
    const childResult = join(directory, "ordered-result.json");
    const launches = f.manifest.forms.map((form) => {
      const value = executor(f.manifest)(form.run);
      return {
        command: form.run.command,
        ...value,
        stdout: [...value.stdout],
        stderr: [...value.stderr],
      };
    });
    const body = `
import { Socket } from 'node:net';
import { writeFileSync } from 'node:fs';
import { runOrderedComparison } from ${fixtureModule("ordered-comparison")};
import { createPhaseControlClient } from ${fixtureModule("native-phase-ipc")};
const context = ${JSON.stringify(context)};
const fault = ${JSON.stringify(fault)};
const options = ${JSON.stringify(f.options)};
const launches = ${JSON.stringify(launches)};
const client = createPhaseControlClient(
  new Socket({fd:3,readable:true,writable:true}), {
    context,responseMs:1000,signal:new AbortController().signal,
    directory:${JSON.stringify(join(directory, "child-control"))}
  });
const send = (phase, request, bounds=null) =>
  client.request({phase,request,bounds});
let correctness = 0;
let profiles = 0;
let measurements = 0;
let originalFailure = null;
const result = await runOrderedComparison({
  ...options, physicalHost:context.jobs[0].hardwareUuid,
  source:()=>({host:${JSON.stringify(f.manifest.host)},tree:context.tree}),
  correctnessExecutor:command=>{
    correctness++;
    const value=launches.find(row=>row.command===command.command);
    if (!value) throw new Error('missing fixture role');
    return {...value,stdout:Buffer.from(fault==='correctness' ?
      [0,255,128,13,10] : value.stdout),
      stderr:Buffer.from(fault==='correctness' ?
        [255,0,10] : value.stderr),status:fault==='correctness'?19:0};
  },
  measurementExecutor:()=>{measurements++;
    throw new Error('timing must remain unattempted');},
  boundaries:{
    diagnose:async request=>{
      const proof=await send('diagnosis',request);
      if(fault==='diagnosis') throw new Error('original diagnosis failure');
      return proof;
    },
    admit:async(request,purpose)=>{
      const proof=await send(purpose+'-admission',request);
      if(fault==='profile-admission')
        throw new Error('original admission failure');
      return proof;
    },
    exclude:async(request,purpose)=>({
      opened:await send(purpose+'-exclusion',request),
      finish:bounds=>send(purpose+'-exclusion-close',request,bounds),
    }),
    profile:async()=>{profiles++;
      throw new Error('original profile failure');},
    finalize:async(request,failure)=>{
      originalFailure=failure;
      return send('finalize',request);
    },
  },
});
writeFileSync(${JSON.stringify(childResult)},
  JSON.stringify({result,correctness,profiles,measurements,originalFailure}));
process.stdout.write(Buffer.from([0,255,128,13,10]));
process.stderr.write(Buffer.from([255,0,10]));
client.dispose();
`;
    try {
      const parent = await runPairChild(
        {
          executable: process.execPath,
          argv: ["--input-type=module", "-e", body],
          cwd: directory,
          env: {},
          stdin: Uint8Array.of(0, 255),
          timeoutMs: null,
        },
        join(directory, "owned"),
        {
          heartbeatMs: 30,
          lossMs: 300,
          observationMs: 40,
          observationTimeoutMs: 200,
          barrierMs: 1000,
          finalizationMs: 1000,
          termGraceMs: 50,
          cleanupMs: 500,
        },
        new AbortController().signal,
        undefined,
        {
          context,
          responseMs: 1000,
          handle: async (
            control: NativeControl,
          ): Promise<NativeControlProof> => {
            phases.push(control.phase);
            if (control.phase === "finalize")
              writeFileSync(tail, Uint8Array.of(0, 255, 10));
            const base =
              control.phase === "finalize"
                ? {
                    requestId: control.request.id,
                    status: "complete" as const,
                    raw: [artifact(tail)],
                  }
                : f.proof(control.request);
            if (control.phase.endsWith("-admission"))
              return {
                ...base,
                authority: "Root",
                purpose: "profile",
              };
            if (control.phase.includes("-exclusion")) {
              const shared = {
                ...base,
                physicalHost: context.jobs[0]!.hardwareUuid,
                accounts: context.accounts,
                startedMs: now,
              };
              return control.bounds === null
                ? { ...shared, state: "monitoring" }
                : {
                    ...shared,
                    finishedMs: Date.now(),
                    coverage: "whole-window",
                  };
            }
            return base;
          },
        },
      );
      const saved = JSON.parse(readFileSync(childResult, "utf8"));
      writeFileSync(
        join(directory, "parent-result.json"),
        JSON.stringify({ parent, phases }),
      );
      assert.equal(saved.result.status, "failed");
      assert.deepEqual(saved.result.finalizationErrors, []);
      assert.equal(
        saved.result.failedPhase === fault ||
          saved.result.failedPhase.startsWith(fault + ":"),
        true,
      );
      assert.equal(saved.originalFailure, saved.result.error);
      assert.ok(saved.originalFailure);
      if (fault === "correctness") {
        assert.match(saved.originalFailure, /encoded data.*utf-8/u);
      } else {
        const phase = fault === "profile-admission" ? "admission" : fault;
        assert.equal(saved.originalFailure, `Error: original ${phase} failure`);
      }
      assert.equal(saved.measurements, 0);
      assert.equal(saved.result.measurements, null);
      assert.deepEqual(saved.result.profiled, []);
      assert.equal(
        saved.correctness,
        fault === "diagnosis" ? 0 : fault === "correctness" ? 1 : 53,
      );
      assert.equal(saved.profiles, fault === "profile" ? 1 : 0);
      assert.equal(phases.filter((phase) => phase === "finalize").length, 1);
      assert.equal(phases.includes("timing-admission"), false);
      assert.deepEqual(phases, [
        "diagnosis",
        ...(fault === "profile-admission" || fault === "profile"
          ? ["profile-admission"]
          : []),
        ...(fault === "profile"
          ? ["profile-exclusion", "profile-exclusion-close"]
          : []),
        "finalize",
      ]);
      assert.deepEqual(readFileSync(tail), Buffer.from([0, 255, 10]));
      assert.deepEqual(
        readFileSync(join(directory, "owned/stdout.bin")),
        Buffer.from([0, 255, 128, 13, 10]),
      );
      assert.deepEqual(
        readFileSync(join(directory, "owned/stderr.bin")),
        Buffer.from([255, 0, 10]),
      );
      assert.equal(parent.code, 0);
      assert.equal(parent.failure, "Phase control finalized early.");
      assert.equal(parent.cleanup, "gone");
      assert.ok(parent.pid != null);
      assert.throws(() => process.kill(parent.pid!, 0), /ESRCH/u);
      if (fault !== "diagnosis") {
        const rows = verifyJournal(
          join(f.options.destination, "correctness/raw/launches.jsonl"),
        );
        assert.equal(rows.length, fault === "correctness" ? 1 : 53);
        if (fault === "correctness") {
          assert.equal(rows[0]!.status, 19);
          assert.deepEqual(
            readFileSync(rows[0]!.stdout.path),
            Buffer.from([0, 255, 128, 13, 10]),
          );
          assert.deepEqual(
            readFileSync(rows[0]!.stderr.path),
            Buffer.from([255, 0, 10]),
          );
          const failure = JSON.parse(
            readFileSync(
              join(f.options.destination, "correctness/failure.json"),
              "utf8",
            ),
          );
          assert.equal(failure.unattempted.length, 52);
          assert.equal(failure.lastLaunch.status, 19);
        }
      }
    } finally {
      const retain = process.env.OSEO_ORDERED_IPC_TEST_EVIDENCE;
      if (retain !== undefined) {
        mkdirSync(retain, { recursive: true });
        cpSync(directory, join(retain, basename(directory)), {
          recursive: true,
        });
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test("adapters cannot change the fixed profile descriptor", async () => {
  await withFixture(async (f) => {
    const result = await runOrderedComparison({
      ...f.options,
      boundaries: {
        ...f.options.boundaries,
        profile: async (input) => {
          assert.equal(Reflect.deleteProperty(input, "profile"), false);
          assert.equal(Reflect.set(input, "profile", undefined), false);
          for (const [object, key, value] of [
            [input.form, "workload", "unknown"],
            [input.form, "role", "observe"],
            [input.profile, "kind", "unknown"],
            [input.profile, "iterations", 100],
            [input.profile.run, "command", "/other"],
            [input.profile.run, "args", ["--", kernelProfileFlag]],
            [input.profile.run, "cwd", "/other"],
            [input.profile.run, "env", {}],
            [input.profile.run, "stdin", []],
          ] as const) {
            assert.equal(Reflect.set(object, key, value), false, key);
          }
          return f.profile(input);
        },
      },
    });
    assert.equal(result.status, "complete", result.error ?? undefined);
    assert.equal(f.inputs.length, 8);
  });
});
