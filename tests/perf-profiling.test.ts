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
        assert.equal(command.error, `spawnSync ${command.argv[0]} ENOENT`);
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
