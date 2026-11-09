import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import test from "node:test";
import { profilingProbes } from "../tools/perf-profile.ts";

function excludesRecordingAndAttachment(argv: readonly string[]): boolean {
  const gdb = basename(argv[0] ?? "") === "gdb";
  return argv.every(
    (argument, index) =>
      !["--attach", "--pid", "--launch"].some(
        (option) => argument === option || argument.startsWith(`${option}=`),
      ) &&
      !(gdb && /^-p(?:\d+)?$/u.test(argument)) &&
      (argument !== "record" || argv[index - 1] === "help"),
  );
}

test("profiling discovery excludes capture and attach command forms", () => {
  for (const platform of ["linux", "darwin"]) {
    const probes = profilingProbes(platform);
    assert.ok(probes.length > 0);
    assert.ok(probes.every(excludesRecordingAndAttachment));
  }
  for (const argv of [
    ["gdb", "--batch", "-p", "1234", "-ex", "bt"],
    ["gdb", "--pid=1234"],
    ["gdb", "-p1234"],
    ["/usr/bin/xcrun", "xctrace", "record", "--all-processes"],
    ["xctrace", "record", "--attach", "1234"],
  ])
    assert.equal(excludesRecordingAndAttachment(argv), false);
  assert.equal(
    excludesRecordingAndAttachment(["/usr/bin/xcode-select", "-p"]),
    true,
  );
  assert.equal(
    excludesRecordingAndAttachment([
      "/usr/bin/xcrun",
      "xctrace",
      "help",
      "record",
    ]),
    true,
  );
  assert.throws(() => profilingProbes("win32"), /Unsupported/);
});

test(
  "missing tools remain failed probes and existing evidence is preserved",
  {
    skip: process.platform !== "linux",
  },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "oseo-profile-discovery-"));
    const output = join(directory, "new");
    const argv = [resolve("tools/perf-profile.ts"), "discover", output];
    try {
      const result = spawnSync(process.execPath, argv, {
        env: { ...process.env, PATH: "" },
        timeout: 240_000,
      });
      assert.equal(result.status, 0, result.stderr.toString());
      const manifest = readFileSync(join(output, "discovery.json"), "utf8");
      assert.equal(result.stdout.toString(), manifest);
      const record = JSON.parse(manifest);
      assert.equal(record.acceptance, "unverified");
      for (const command of record.commands) {
        assert.equal(command.status, null);
        assert.equal(command.error, `Error: spawn ${command.argv[0]} ENOENT`);
        assert.equal(readFileSync(join(output, command.stdout)).length, 0);
        assert.equal(readFileSync(join(output, command.stderr)).length, 0);
      }
      const retry = spawnSync(process.execPath, argv, { timeout: 10_000 });
      assert.notEqual(retry.status, 0);
      assert.equal(
        readFileSync(join(output, "discovery.json"), "utf8"),
        manifest,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test(
  "nonzero tool probes preserve binary output and never accept a method",
  {
    skip: process.platform !== "linux",
  },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "oseo-profile-bytes-"));
    const output = join(directory, "output");
    const bin = join(directory, "bin");
    mkdirSync(bin);
    try {
      for (const name of ["uname", "perf", "gdb"]) {
        writeFileSync(
          join(bin, name),
          "#!/bin/sh\nprintf '\\377\\000A'\n" +
            "printf '\\376\\000B' >&2\nexit 7\n",
          { mode: 0o700 },
        );
      }
      const result = spawnSync(
        process.execPath,
        [resolve("tools/perf-profile.ts"), "discover", output],
        { env: { ...process.env, PATH: bin }, timeout: 10_000 },
      );
      assert.equal(result.status, 0, result.stderr.toString());
      const record = JSON.parse(
        readFileSync(join(output, "discovery.json"), "utf8"),
      );
      assert.equal(record.acceptance, "unverified");
      for (const command of record.commands) {
        assert.equal(command.status, 7);
        assert.equal(command.error, null);
        assert.ok(command.toolPath.startsWith(bin));
        assert.deepEqual(
          readFileSync(join(output, command.stdout)),
          Buffer.from([255, 0, 65]),
        );
        assert.deepEqual(
          readFileSync(join(output, command.stderr)),
          Buffer.from([254, 0, 66]),
        );
        assert.deepEqual(
          Buffer.from(command.stdoutBase64, "base64"),
          readFileSync(join(output, command.stdout)),
        );
        assert.deepEqual(
          Buffer.from(command.stderrBase64, "base64"),
          readFileSync(join(output, command.stderr)),
        );
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

// Simulated profiler text below is not native acceptance evidence.
const { captureArtifact, fileIdentity, inspectStack, validateCaptureRequest } =
  await import("../tools/perf-profile-capture.ts");

test("stack acceptance rejects unknown, truncated and empty captures", () => {
  const linux = "#0 oseo_cell_get ()\n#1 oseo_function_script ()\n#2 main ()";
  assert.equal(inspectStack(linux, "linux").useful, true);
  for (const text of [
    "",
    "#0 main ()",
    linux + "\n#3 ?? ()",
    linux + "\n#15 main ()",
    linux + "\nlost samples",
  ]) {
    assert.equal(inspectStack(text, "linux").useful, false);
  }
  assert.equal(
    inspectStack(
      "    + 4 oseo_cell_get (in fixture) [0x1]\n" +
        "    +   4 oseo_function_script (in fixture) [0x2]",
      "darwin",
    ).useful,
    true,
  );
});

test("capture validates launch, bytes and frozen inputs", () => {
  for (const value of [null, {}, { kind: "existing-artifact" }]) {
    assert.throws(() => validateCaptureRequest(value));
  }
});

test(
  "a short child preserves missing captures and exact argv/env/stdin",
  {
    skip: process.platform !== "linux" || process.arch !== "x64",
  },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "oseo-profile-short-"));
    const source = join(directory, "target.js");
    writeFileSync(
      source,
      "process.stdin.resume(); let s = '';" +
        "process.stdin.on('data', x => s += x);" +
        "process.stdin.on('end', () => process.stdout.write(" +
        "JSON.stringify([process.argv.slice(2), process.env, s])));\n",
    );
    const request = {
      kind: "existing-artifact" as const,
      executable: process.execPath,
      sha256: fileIdentity(process.execPath).sha256,
      inputs: [{ path: source, sha256: fileIdentity(source).sha256 }],
      argv: [source, "argument with spaces"],
      env: { PROFILE_TEST: "fixed" },
      cwd: directory,
      stdinBase64: Buffer.from("input\n").toString("base64"),
      stdoutBase64: Buffer.from(
        JSON.stringify([
          ["argument with spaces"],
          { PROFILE_TEST: "fixed" },
          "input\n",
        ]),
      ).toString("base64"),
      stderrBase64: "",
      exitStatus: 0,
    };
    try {
      assert.equal(
        await captureArtifact(request, join(directory, "capture")),
        false,
      );
      const record = JSON.parse(
        readFileSync(join(directory, "capture", "capture.json"), "utf8"),
      );
      assert.equal(record.status, "failed-or-incomplete");
      assert.equal(record.performanceEvidence, false);
      assert.ok(
        record.lifetimes.every((run: { groupGone: boolean }) => run.groupGone),
      );
      if (existsSync(join(directory, "capture", "preflight-role.json"))) {
        assert.equal(record.captures.length, 8);
        assert.ok(
          record.captures.some(
            (entry: { status: string }) => entry.status !== "useful-stack",
          ),
        );
        const preflight = JSON.parse(
          readFileSync(
            join(directory, "capture", "preflight-role.json"),
            "utf8",
          ),
        );
        assert.equal(preflight.correct, true);
      }
      const saved = readFileSync(join(directory, "capture", "capture.json"));
      await assert.rejects(
        captureArtifact(request, join(directory, "capture")),
      );
      assert.deepEqual(
        readFileSync(join(directory, "capture", "capture.json")),
        saved,
      );
      assert.equal(fileIdentity(source).sha256, request.inputs[0]!.sha256);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test(
  "changed artifact is refused and recorded before it executes",
  {
    skip: process.platform !== "linux" || process.arch !== "x64",
  },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "oseo-profile-digest-"));
    const source = join(directory, "source.txt");
    writeFileSync(source, "input");
    try {
      assert.equal(
        await captureArtifact(
          {
            kind: "existing-artifact" as const,
            executable: process.execPath,
            sha256: "0".repeat(64),
            inputs: [{ path: source, sha256: fileIdentity(source).sha256 }],
            argv: [],
            env: {},
            cwd: directory,
            stdinBase64: "",
            stdoutBase64: "",
            stderrBase64: "",
            exitStatus: 0,
          },
          join(directory, "capture"),
        ),
        false,
      );
      const record = JSON.parse(
        readFileSync(join(directory, "capture", "capture.json"), "utf8"),
      );
      assert.match(record.failure, /frozen digest/);
      assert.ok(
        record.lifetimes.every(
          (run: { stdout: string }) =>
            !["target.stdout", "preflight.stdout"].includes(run.stdout),
        ),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test(
  "an interrupted build command reaps only its owned process group",
  {
    skip: process.platform !== "linux",
  },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "oseo-profile-cleanup-"));
    try {
      const helper = new URL(
        "../tools/perf-profile-capture.ts",
        import.meta.url,
      );
      const moduleUrl = JSON.stringify(helper.href);
      const script = `import { runProfilingCommand } from ${moduleUrl};
setTimeout(() => process.kill(process.pid, 'SIGTERM'), 150);
const result = await runProfilingCommand(${JSON.stringify(directory)},
  'interrupted', [process.execPath, '-e', 'setInterval(() => {}, 1000)'],
  ${JSON.stringify(directory)}, {});
console.log(JSON.stringify(result));`;
      const result = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", script],
        { timeout: 10_000 },
      );
      assert.equal(result.status, 0, result.stderr.toString());
      const record = JSON.parse(result.stdout.toString());
      assert.equal(record.signal, "SIGKILL");
      assert.equal(record.groupGone, true);
      assert.ok(
        record.cleanup.some((reason: string) => reason.includes("signal")),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

function validVariableStdout(stdout: Uint8Array): boolean {
  const match = /^checksum=42 elapsed=(\d+)\n$/u.exec(
    Buffer.from(stdout).toString(),
  );
  return match != null && Number.isFinite(Number(match[1]));
}

test(
  "caller checker validates variable stdout and preserves rejected bytes",
  {
    skip: process.platform !== "linux" || process.arch !== "x64",
  },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "oseo-profile-checker-"));
    const source = join(directory, "target.js");
    const oraclePath = resolve("tests/perf-profiling.test.ts");
    writeFileSync(
      source,
      "setTimeout(() => {\n" +
        "console.log('checksum=' + process.argv[2] + ' elapsed=' + " +
        "Date.now());\n" +
        "if (process.argv[3] === 'stderr') " +
        "process.stderr.write('unexpected');\n" +
        "if (process.argv[3] === 'exit') process.exitCode = 3;\n" +
        "}, 3000);\n",
    );
    const bin = join(directory, "bin");
    mkdirSync(bin);
    // Simulated frames and a Node fixture are not native acceptance evidence.
    writeFileSync(
      join(bin, "gdb"),
      "#!/bin/sh\npid=0\nwhile [ $# -gt 0 ]; do\n" +
        'if [ "$1" = -p ]; then shift; pid=$1; fi\nshift\ndone\n' +
        "printf '#0 oseo_cell_get ()\\n#1 oseo_function_script ()\\n'\n" +
        "printf '[Inferior 1 (process %s) detached]\\n' \"$pid\"\n",
      { mode: 0o700 },
    );
    const originalPath = process.env.PATH;
    process.env.PATH = bin + ":" + (originalPath ?? "");
    const request = {
      kind: "existing-artifact" as const,
      executable: process.execPath,
      sha256: fileIdentity(process.execPath).sha256,
      inputs: [source, oraclePath].map((path) => ({
        path,
        sha256: fileIdentity(path).sha256,
      })),
      argv: [source, "42"],
      env: {},
      cwd: directory,
      stdinBase64: "",
      stdoutBase64: "",
      stderrBase64: "",
      exitStatus: 0,
    };
    const description = {
      id: "test-checksum-and-elapsed",
      sourcePath: oraclePath,
      sourceSha256: fileIdentity(oraclePath).sha256,
    };
    const checks = [
      {
        name: "accept",
        expected: true,
        args: ["42"],
        check: validVariableStdout,
      },
      {
        name: "wrong-checksum",
        expected: false,
        args: ["41"],
        check: validVariableStdout,
      },
      {
        name: "stderr",
        expected: false,
        args: ["42", "stderr"],
        check: validVariableStdout,
      },
      {
        name: "exit",
        expected: false,
        args: ["42", "exit"],
        check: validVariableStdout,
      },
      {
        name: "throw",
        expected: false,
        args: ["42"],
        check: (): boolean => {
          throw new Error("oracle rejected result");
        },
      },
    ];
    try {
      for (const entry of checks) {
        const output = join(directory, entry.name);
        // eslint-disable-next-line no-await-in-loop -- Isolated serial probes.
        const accepted = await captureArtifact(
          { ...request, argv: [source, ...entry.args] },
          output,
          { ...description, check: entry.check },
        );
        const outcome = JSON.parse(
          readFileSync(join(output, "capture.json"), "utf8"),
        );
        assert.equal(
          accepted,
          entry.expected,
          JSON.stringify({
            failure: outcome.failure,
            sourceBefore: outcome.sourceBefore.map(
              (run: { readonly stderr: string }) => ({
                ...run,
                stderrBytes: readFileSync(join(output, run.stderr), "utf8"),
              }),
            ),
            captures: outcome.captures.map(
              (capture: { status: string }) => capture.status,
            ),
          }),
        );
        const proof = JSON.parse(
          readFileSync(join(output, "preflight-check.json"), "utf8"),
        );
        assert.equal(proof.correct, entry.expected);
        assert.equal(proof.oracle, "caller-checker");
        assert.ok(
          readFileSync(join(output, "preflight.stdout"), "utf8").startsWith(
            "checksum=",
          ),
        );
        const identity = JSON.parse(
          readFileSync(join(output, "stdout-oracle.json"), "utf8"),
        );
        assert.equal(identity.actualSourceSha256, description.sourceSha256);
        assert.match(identity.functionSha256, /^[a-f0-9]{64}$/u);
        if (entry.name === "throw") {
          assert.match(proof.checkerError, /oracle rejected/u);
        }
        assert.equal(outcome.requestedCaptures, 8);
        assert.equal(outcome.captures.length, 8);
        assert.ok(
          outcome.lifetimes.every(
            (run: { groupGone: boolean }) => run.groupGone,
          ),
        );
      }
      const missing = join(directory, "missing");
      assert.equal(
        await captureArtifact(
          request,
          missing,
          JSON.parse(JSON.stringify(description)),
        ),
        false,
      );
      const missingProof = JSON.parse(
        readFileSync(join(missing, "capture.json"), "utf8"),
      );
      assert.match(missingProof.failure, /Missing checker/u);
      const exact = join(directory, "default-exact");
      assert.equal(await captureArtifact(request, exact), false);
      const defaultProof = JSON.parse(
        readFileSync(join(exact, "preflight-check.json"), "utf8"),
      );
      assert.equal(defaultProof.oracle, "exact-bytes");
      assert.equal(defaultProof.correct, false);
    } finally {
      if (originalPath == null) delete process.env.PATH;
      else process.env.PATH = originalPath;
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test("frame ownership uses symbols rather than arguments and filenames", () => {
  const generated = [
    "oseo_function_0",
    "oseo_function_script",
    "oseo_dispatch_function",
    "oseo_dispatch_generator",
    "oseo_generator_body_1_resume",
    "generated_c_oseo_function_0",
    "generated_c_oseo_body_0",
    "oseo_case_dispatch",
    "oseo_harness_resume",
    "oseo_fragment_location",
    "oseo_agent_program_0",
  ];
  for (const symbol of generated) {
    for (const [platform, text] of [
      ["linux", `#0 0x123 in ${symbol} () at generated.c:1\n#1 main ()`],
      [
        "darwin",
        `    + 4 ${symbol} (in fixture) [0x1]\n` +
          "    + 4 main (in fixture) [0x2]",
      ],
    ]) {
      const result = inspectStack(text!, platform!);
      assert.equal(result.generated, true, symbol);
      assert.equal(result.runtime, false, symbol);
      assert.equal(result.useful, true, symbol);
    }
  }
  for (const text of [
    '#0 main (s="oseo_cell_get") at oseo_add.c:12',
    "#0 foreign () at /oseo_call_function/generated.c:1",
    '#0 0x123 in foreign (s="oseo_function_0") at generated.c:1',
    "    + 4 foreign (in oseo_cell_get) [0x1]",
    "    + 4 foreign (in oseo_function_script) [0x1]",
  ]) {
    for (const platform of ["linux", "darwin"]) {
      const result = inspectStack(text, platform);
      assert.equal(result.runtime, false, text);
      assert.equal(result.generated, false, text);
    }
  }
  for (const symbol of [
    "oseo_cell_get",
    "oseo_function_environment",
    "oseo_function_code_id",
    "oseo_generated_binding_read_at",
    "oseo_generated_property_get",
  ]) {
    assert.equal(
      inspectStack(`#0 0xabc in ${symbol} () at runtime_binding.c:1`, "linux")
        .runtime,
      true,
      symbol,
    );
    assert.equal(
      inspectStack(`    + 4 ${symbol} (in fixture) [0x1]`, "darwin").runtime,
      true,
      symbol,
    );
  }
});

test(
  "standalone discovery bounds SIGTERM-ignoring probes and descendants",
  {
    skip: process.platform !== "linux",
  },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "oseo-profile-timeout-"));
    const bin = join(directory, "bin");
    mkdirSync(bin);
    const output = join(directory, "output");
    try {
      const descendant =
        "process.on('SIGTERM', () => {});" +
        "process.stdout.write('descendant=' + process.pid + '\\n');" +
        "setInterval(() => {}, 1000);";
      writeFileSync(
        join(bin, "uname"),
        `#!${process.execPath}
const { spawn } = require('node:child_process');
process.on('SIGTERM', () => {});
process.stdout.write(Buffer.from([255, 0, 65]));
process.stderr.write(Buffer.from([254, 0, 66]));
spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {
  stdio: ['ignore', 1, 2],
});
setInterval(() => {}, 1000);
`,
        { mode: 0o700 },
      );
      for (const name of ["perf", "gdb"]) {
        writeFileSync(join(bin, name), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
      }
      const start = Date.now();
      const result = spawnSync(
        process.execPath,
        [resolve("tools/perf-profile.ts"), "discover", output],
        {
          env: { ...process.env, PATH: bin },
          timeout: 30_000,
          killSignal: "SIGKILL",
        },
      );
      assert.equal(result.status, 1, result.stderr.toString());
      assert.ok(Date.now() - start < 30_000);
      const record = JSON.parse(
        readFileSync(join(output, "discovery.json"), "utf8"),
      );
      const probe = record.commands[0];
      assert.equal(probe.timedOut, true);
      assert.equal(probe.signal, "SIGKILL");
      const raw = readFileSync(join(output, probe.stdout));
      assert.deepEqual(raw.subarray(0, 3), Buffer.from([255, 0, 65]));
      assert.deepEqual(
        readFileSync(join(output, probe.stderr)),
        Buffer.from([254, 0, 66]),
      );
      const pid = /descendant=(\d+)/u.exec(raw.toString())?.[1];
      assert.ok(pid, raw.toString());
      // A zombie is dead but may await an external reaper; never call it gone.
      try {
        const state = readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1];
        assert.ok(state?.startsWith("Z"), state);
        assert.equal(probe.groupGone, false);
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "ENOENT"
        )
          throw error;
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test(
  "discovery interruption preserves partial bytes and stops further probes",
  {
    skip: process.platform !== "linux",
  },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "oseo-profile-interrupt-"));
    const bin = join(directory, "bin");
    mkdirSync(bin);
    const output = join(directory, "output");
    try {
      writeFileSync(
        join(bin, "uname"),
        `#!${process.execPath}
process.on('SIGTERM', () => {});
process.stdout.write('partial');
process.kill(process.ppid, 'SIGTERM');
setInterval(() => {}, 1000);
`,
        { mode: 0o700 },
      );
      const result = spawnSync(
        process.execPath,
        [resolve("tools/perf-profile.ts"), "discover", output],
        {
          env: { ...process.env, PATH: bin },
          timeout: 10_000,
          killSignal: "SIGKILL",
        },
      );
      assert.equal(result.status, 1, result.stderr.toString());
      const record = JSON.parse(
        readFileSync(join(output, "discovery.json"), "utf8"),
      );
      assert.equal(record.interrupted, "SIGTERM");
      assert.equal(record.commands.length, 1);
      assert.equal(record.commands[0].signal, "SIGKILL");
      assert.equal(record.commands[0].groupGone, true);
      assert.equal(readFileSync(join(output, "0.stdout"), "utf8"), "partial");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test(
  "capture interruption owns discovery groups directly",
  {
    skip: process.platform !== "linux",
  },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "oseo-capture-interrupt-"));
    const bin = join(directory, "bin");
    mkdirSync(bin);
    const output = join(directory, "output");
    const input = join(directory, "input");
    const request = join(directory, "request.json");
    writeFileSync(input, "source");
    writeFileSync(
      request,
      JSON.stringify({
        kind: "synthetic-method-probe",
        executable: process.execPath,
        sha256: fileIdentity(process.execPath).sha256,
        inputs: [{ path: input, sha256: fileIdentity(input).sha256 }],
        argv: [],
        env: {},
        cwd: directory,
        stdinBase64: "",
        stdoutBase64: "",
        stderrBase64: "",
        exitStatus: 0,
      }),
    );
    // Git remains available for the capture source-identity preflight.
    const originalPath = process.env.PATH ?? "";
    try {
      writeFileSync(
        join(bin, "uname"),
        `#!${process.execPath}
process.on('SIGTERM', () => {});
process.stdout.write('capture-partial');
process.kill(process.ppid, 'SIGINT');
setInterval(() => {}, 1000);
`,
        { mode: 0o700 },
      );
      const result = spawnSync(
        process.execPath,
        [resolve("tools/perf-profile.ts"), "capture", request, output],
        {
          env: { ...process.env, PATH: bin + ":" + originalPath },
          timeout: 10_000,
          killSignal: "SIGKILL",
        },
      );
      assert.equal(result.status, 1, result.stderr.toString());
      const record = JSON.parse(
        readFileSync(join(output, "capture.json"), "utf8"),
      );
      assert.equal(record.interrupted, "SIGINT");
      assert.equal(record.captures.length, 8);
      assert.ok(
        record.lifetimes.every(
          (run: { readonly groupGone: boolean }) => run.groupGone,
        ),
      );
      assert.equal(
        readFileSync(join(output, "discovery", "0.stdout"), "utf8"),
        "capture-partial",
      );
      assert.equal(existsSync(join(output, "preflight.stdout")), false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
