/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
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
import { performance } from "node:perf_hooks";
import { ProfilingSession } from "../tools/perf-profile-process.ts";
import type { OwnedRun, RunRecord } from "../tools/perf-profile-process.ts";
import type { StackCapture } from "../tools/perf-profile-capture.ts";
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
const {
  captureArtifact,
  captureOwnedStacks,
  fileIdentity,
  inspectHostedMacSyntheticCapture,
  inspectHostedMacSyntheticStack,
  inspectStack,
  validateCaptureRequest,
} = await import("../tools/perf-profile-capture.ts");

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

const hostedMacCallGraph = [
  "Call graph:",
  "    4 Thread_1 DispatchQueue_1: com.apple.main-thread (serial)",
  "      3 start (in dyld) + 4 [0x2004]",
  "      + 3 main (in fixture) + 4 [0x1004]",
  "      + ! 3 oseo_call_function (in fixture) + 4 [0x1014]",
  "      + !   3 oseo_dispatch_function (in fixture) + 4 [0x1024]",
  "      + !   : 3 oseo_cell_create (in fixture) + 4 [0x1034]",
  "      + !   : | 3 DYLD-STUB$$_platform_bzero (in libsystem_malloc.dylib)" +
    " + 8 [0x3004]",
  "      1 ??? (in <unknown binary>) [0x9000]",
  "        1 ??? (in <unknown binary>) [0x9004]",
  "",
  "Total number in stack (recursive counted multiple, when >=5):",
  "",
  "Sort by top of stack, same collapsed (when >= 5):",
  "",
  "Binary Images:",
  "    0x1000 - 0x10ff +fixture (0) " +
    "<ADEBFB7E-5B41-366F-B2A5-A16E391120D8> /tmp/fixture",
  "    0x2000 - 0x20ff dyld (1.0.0 - 1387.2) " +
    "<57F4E7E7-A497-38BB-A3D2-A459C622460B> /usr/lib/dyld",
  "    0x3000 - 0x30ff libsystem_malloc.dylib (812.160.5) " +
    "<8CF02A42-BC33-38BF-B14A-FA9B13B3CA3F> " +
    "/usr/lib/system/libsystem_malloc.dylib",
  "       0x28d26e000 -        0x28d26ebbf  libsystem_trial.dylib " +
    "(474.2.18.2.1) <698A199E-73E6-3D12-AB87-C8E100BEA52E> " +
    "/usr/lib/system/libsystem_trial.dylib",
  "",
].join("\n");

test("hosted Mac smoke requires a complete named call-graph witness", () => {
  const complete = hostedMacCallGraph;
  assert.deepEqual(inspectHostedMacSyntheticStack(complete, "fixture"), {
    mainThreadReportedStacks: 4,
    unknownBranches: 1,
    reportedStacksWithUnknown: 1,
    deduplicatedBranches: 0,
    reportedStacksWithDeduplicated: 0,
    witnessLines: [3, 4, 5, 6, 7, 8],
    witnessReportedStacks: 3,
  });
  assert.equal(inspectStack(complete, "darwin").useful, false);
  const withFiveUnknown = complete
    .replace("4 Thread", "8 Thread")
    .replace("      1 ???", "      5 ???");
  const summary = "        ???  (in <unknown binary>)        5";
  const withSummary = withFiveUnknown.replace(
    "Binary Images:",
    summary + "\n\nBinary Images:",
  );
  const fiveUnknown = inspectHostedMacSyntheticStack(
    withFiveUnknown,
    "fixture",
  );
  assert.ok(fiveUnknown);
  assert.equal(fiveUnknown.mainThreadReportedStacks, 8);
  assert.equal(fiveUnknown.unknownBranches, 1);
  assert.equal(fiveUnknown.reportedStacksWithUnknown, 5);
  assert.deepEqual(
    inspectHostedMacSyntheticStack(withSummary, "fixture"),
    fiveUnknown,
  );
  assert.equal(inspectStack(withSummary, "darwin").useful, false);

  const withoutWitness = {
    ...fiveUnknown,
    witnessLines: [],
    witnessReportedStacks: 0,
  };
  for (const graph of [
    withFiveUnknown.replace("oseo_dispatch_function", "unknown_dispatch"),
    withFiveUnknown.replace("oseo_call_function", "unknown_runtime"),
    withFiveUnknown.replace("oseo_cell_create", "oseo_function_0"),
  ]) {
    assert.deepEqual(
      inspectHostedMacSyntheticStack(graph, "fixture"),
      withoutWitness,
    );
  }
  const unknownCaller = withFiveUnknown.replace(
    "3 start (in dyld) + 4 [0x2004]",
    "3 ??? (in <unknown binary>) [0x9040]",
  );
  assert.deepEqual(inspectHostedMacSyntheticStack(unknownCaller, "fixture"), {
    ...withoutWitness,
    unknownBranches: 2,
    reportedStacksWithUnknown: 8,
  });

  const deduplicated = withFiveUnknown
    .replace("oseo_cell_create", "<deduplicated_symbol>")
    .replace("DYLD-STUB$$_platform_bzero", "<deduplicated_symbol>")
    .replace(
      "5 ??? (in <unknown binary>) [0x9000]",
      "5 <deduplicated_symbol> (in fixture) [0x1040]",
    );
  assert.deepEqual(inspectHostedMacSyntheticStack(deduplicated, "fixture"), {
    ...withoutWitness,
    deduplicatedBranches: 3,
    reportedStacksWithDeduplicated: 8,
    reportedStacksWithUnknown: 1,
  });

  const cut = complete.indexOf("libsystem_trial.dylib") + "libs".length;
  for (const bad of [
    complete.replace("4 Thread", "5 Thread"),
    complete.replace("[0x1024]", "[0x9040]"),
    complete.replace("DYLD-STUB$$", "BAD-STUB$$"),
    complete.replace("DYLD-STUB$$_platform_bzero", "0x3004"),
    complete.replace("DYLD-STUB$$_platform_bzero", "..."),
    complete.replace("[0x3004]", "[0x9040]"),
    complete.slice(0, cut),
    complete.slice(0, cut) + "\n",
    complete.trimEnd(),
    "Truncated report\n" + complete,
    "Lost samples\n" + complete,
    withSummary.replace(summary, summary + "\n" + summary),
    withSummary.replace(summary, summary.replace(/5$/u, "6")),
    complete.replace("Binary Images:", summary + "\nBinary Images:"),
    complete.replace("+ !   : 3", "+ !   :   3"),
    complete.replace("Total number in stack", "malformed graph"),
    complete.replace("Binary Images:", "unresolved frame\nBinary Images:"),
  ]) {
    assert.equal(inspectHostedMacSyntheticStack(bad, "fixture"), undefined);
  }
});

test("capture validates launch, bytes and frozen inputs", () => {
  for (const value of [null, {}, { kind: "existing-artifact" }]) {
    assert.throws(() => validateCaptureRequest(value));
  }
  const directory = mkdtempSync(join(tmpdir(), "oseo-smoke-license-"));
  const output = join(directory, "output");
  try {
    // Stop the real CLI at host selection, before it copies any source.
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "data:text/javascript," +
          "Object.defineProperty(process,'arch',{value:'unsupported'})",
        resolve("tools/perf-profile-smoke.ts"),
        output,
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Requires Linux x64 or macOS arm64/u);
    assert.equal(existsSync(join(output, "smoke.js")), false);
    assert.deepEqual(
      readFileSync(join(output, "LICENSE")),
      readFileSync(new URL("../LICENSE", import.meta.url)),
    );
    assert.deepEqual(
      readFileSync(join(output, "UNICODE-LICENSE.txt")),
      readFileSync(
        new URL("../packages/runtime-c/UNICODE-LICENSE.txt", import.meta.url),
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
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

// Real owned child processes below emit fake reports. They do not exercise
// Apple tooling, a native workload, or measurement acceptance.
for (const mode of [
  "valid",
  "nonzero",
  "missing",
  "partial",
  "runtime-only",
  "generated-only",
  "unknown-branch",
  "wrong-pid",
  "wrong-identity",
  "target-exit",
  "target-exit-before-last-report",
  "already-exited",
  "timeout",
  "interrupt",
  "launch-error",
]) {
  test(
    `overlapping Mac samplers preserve independent outcomes: ${mode}`,
    { skip: process.platform === "win32" },
    async () => {
      const directory = mkdtempSync(join(tmpdir(), "oseo-mac-overlap-"));
      const session = new ProfilingSession();
      const profiler = join(directory, "sample");
      const records: RunRecord[] = [];
      const deadlines: number[] = [];
      let launches = 0;
      let settledSamplers = 0;
      const firstSevenSettled = Promise.withResolvers<void>();
      let signalTimer: ReturnType<typeof setTimeout> | undefined;
      const target = session.launch(
        directory,
        "target",
        [
          process.execPath,
          "-e",
          "const keepAlive = setInterval(() => {}, 1000);" +
            "process.on('SIGUSR2', () => clearInterval(keepAlive));",
        ],
        directory,
        {},
        Buffer.alloc(0),
        120_000,
      );
      const targetHash = fileIdentity(process.execPath).sha256;
      const image = basename(process.execPath);
      const witnessGraph = hostedMacCallGraph.replaceAll("fixture", image);
      const request = {
        kind: "synthetic-method-probe" as const,
        executable: process.execPath,
        sha256: targetHash,
        inputs: [{ path: profiler, sha256: "0".repeat(64) }],
        argv: [],
        env: {},
        cwd: directory,
        stdinBase64: "",
        stdoutBase64: "",
        stderrBase64: "",
        exitStatus: 0,
      };
      try {
        writeFileSync(
          profiler,
          `#!${process.execPath}
const fs = require('node:fs');
const [pid, duration, interval, flag, file] = process.argv.slice(2);
const index = Number(/sample-(\\d+)\\.txt$/.exec(file)[1]);
const mode = process.env.FAKE_MODE;
console.log(JSON.stringify({ pid, duration, interval, flag, file,
  samplerPid: process.pid }));
const heading = 'Analysis of sampling fixture (pid ' + pid +
  ') every 10 milliseconds\\nProcess: fixture [' +
  (mode === 'wrong-pid' && index === 3 ? '0' : pid) +
  ']\\nTarget Type: live task\\n';
const raw = heading + (mode === 'target-exit-before-last-report' ?
  ${JSON.stringify(witnessGraph)} :
  (mode === 'generated-only' && index === 3 ? '' :
    '    + 4 oseo_cell_get (in fixture) [0x1]\\n') +
  (mode === 'runtime-only' && index === 3 ?
    '    + 4 main (in fixture) [0x2]\\n' :
    '    + 4 oseo_function_script (in fixture) [0x2]\\n') +
  (mode === 'generated-only' && index === 3 ?
    '    + 4 main (in fixture) [0x3]\\n' : '') +
  (mode === 'unknown-branch' && index === 3 ?
    '    + 1 ??? (in <unknown binary>) [0x9000]\\n' : '') +
  (mode === 'partial' && index === 3 ? '' : 'Binary Images:\\n'));
if (!(mode === 'missing' && index === 3)) fs.writeFileSync(file, raw);
if (mode === 'timeout' && index === 3) {
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
} else {
  setTimeout(() => {
    if (!(mode === 'partial' && index === 3))
      console.error('Sampling completed, processing symbols...');
    process.exitCode = mode === 'nonzero' && index === 3 ? 7 : 0;
  }, 1_100);
}
`,
          { mode: 0o700 },
        );
        if (mode === "already-exited") {
          target.stop("test: target exited before capture phase");
          await target.done;
        }
        const { captures, complete } = await captureOwnedStacks({
          target,
          request,
          directory,
          profiler,
          platform: "darwin",
          interrupted: () => session.interrupted,
          captures: [],
          execute: async (name, argv, timeoutMs = 20_000) => {
            let actualArgv = argv;
            if (name.startsWith("identity-")) {
              assert.deepEqual(argv, [
                "/bin/ps",
                "-p",
                String(target.pid),
                "-o",
                "comm=",
              ]);
              // Emulate macOS ps output only after checking the actual live
              // child executable; Linux ps comm has different semantics.
              actualArgv = [
                process.execPath,
                "-e",
                "const fs = require('node:fs');" +
                  "process.stdout.write(fs.realpathSync(" +
                  JSON.stringify(
                    process.platform === "linux"
                      ? `/proc/${target.pid}/exe`
                      : process.execPath,
                  ) +
                  "));",
              ];
              if (mode === "wrong-identity" && name === "identity-3") {
                actualArgv = [process.execPath, "-e", "console.log('wrong')"];
              }
            } else {
              assert.deepEqual(argv.slice(0, 5), [
                profiler,
                String(target.pid),
                "1",
                "10",
                "-file",
              ]);
              assert.equal(timeoutMs, 20_000);
              deadlines.push(timeoutMs);
              if (mode === "launch-error" && name === "capture-3") {
                throw new Error("test launch failed");
              }
              launches++;
              if (launches === 8) {
                if (mode === "interrupt")
                  signalTimer = setTimeout(() => process.emit("SIGINT"), 100);
                if (mode === "target-exit")
                  signalTimer = setTimeout(
                    () => target.stop("test: exit during sampling"),
                    100,
                  );
              }
            }
            const record = await session.launch(
              directory,
              name,
              actualArgv,
              directory,
              { FAKE_MODE: mode },
              Buffer.alloc(0),
              timeoutMs,
            ).done;
            records.push(record);
            if (mode === "target-exit-before-last-report") {
              if (name === "capture-7") {
                await Promise.race([
                  firstSevenSettled.promise,
                  once(AbortSignal.timeout(timeoutMs), "abort").then(() =>
                    assert.fail("Earlier sampler fixtures did not settle"),
                  ),
                ]);
                // Let the other capture continuations observe the live child.
                await new Promise<void>((resolveTurn) =>
                  setImmediate(resolveTurn),
                );
                process.kill(target.pid!, "SIGUSR2");
                assert.equal((await target.done).status, 0);
              } else if (name.startsWith("capture-")) {
                settledSamplers++;
                if (settledSamplers === 7) firstSevenSettled.resolve();
              }
            }
            return record;
          },
        });
        assert.deepEqual(
          captures.map((capture) => capture.index),
          [0, 1, 2, 3, 4, 5, 6, 7],
        );
        assert.equal(complete, mode === "valid");
        assert.equal(
          launches,
          mode === "already-exited"
            ? 0
            : ["wrong-identity", "launch-error"].includes(mode)
              ? 7
              : 8,
        );
        const samplers = records.filter((record) =>
          record.stdout.startsWith("capture-"),
        );
        assert.equal(
          new Set(samplers.map((record) => record.pid)).size,
          samplers.length,
        );
        assert.equal(
          new Set(samplers.map((record) => record.stdout)).size,
          samplers.length,
        );
        assert.equal(
          new Set(samplers.map((record) => record.stderr)).size,
          samplers.length,
        );
        if (mode === "valid") {
          assert.equal(samplers.length, 8);
          assert.equal(deadlines.length, 8);
          assert.ok(
            Math.max(
              ...samplers.map((record) => Date.parse(record.startedUtc)),
            ) <
              Math.min(
                ...samplers.map((record) => Date.parse(record.finishedUtc)),
              ),
          );
          for (const capture of captures) {
            assert.equal(capture.windowComplete, true);
            assert.equal(capture.targetAliveAtCompletion, true);
            assert.equal(capture.processMatches, true);
            assert.equal(capture.stack?.runtime, true);
            assert.equal(capture.stack?.generated, true);
            assert.equal(capture.overlappingCommandIndices?.length, 7);
            const observed = JSON.parse(
              readFileSync(join(directory, capture.record!.stdout), "utf8"),
            );
            assert.equal(observed.pid, String(target.pid));
            assert.equal(observed.samplerPid, capture.record!.pid);
            assert.equal(
              observed.file,
              join(directory, `sample-${capture.index}.txt`),
            );
          }
        } else if (mode === "target-exit-before-last-report") {
          const verdicts = captures.map((capture) => {
            const record = capture.record!;
            const raw = readFileSync(
              join(directory, `sample-${capture.index}.txt`),
            );
            const input = {
              image,
              pid: target.pid!,
              stdout: readFileSync(join(directory, record.stdout), "utf8"),
              stderr: readFileSync(join(directory, record.stderr), "utf8"),
            };
            const verdict = inspectHostedMacSyntheticCapture(
              capture,
              raw,
              input,
            );
            assert.ok(verdict.evidence);
            if (capture.index === 0) {
              assert.equal(verdict.accepted, true);
              const missingWitness = Buffer.from(
                raw.toString().replace("oseo_dispatch_function", "other"),
              );
              const failed = inspectHostedMacSyntheticCapture(
                capture,
                missingWitness,
                input,
              );
              assert.deepEqual(failed.evidence, {
                ...verdict.evidence,
                witnessLines: [],
                witnessReportedStacks: 0,
              });
              assert.equal(failed.accepted, false);
            }
            assert.equal(capture.processMatches, true);
            assert.equal(record.status, 0);
            return verdict.accepted;
          });
          assert.deepEqual(verdicts, [
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            false,
          ]);
          assert.equal(captures[7]!.targetAliveAtCompletion, false);
          assert.equal(captures[7]!.windowComplete, false);
        } else if (mode === "target-exit") {
          assert.ok(
            captures.every(
              (capture) => capture.targetAliveAtCompletion === false,
            ),
          );
        } else if (mode === "already-exited") {
          assert.ok(
            captures.every(
              (capture) => capture.status === "not-attempted-target-exited",
            ),
          );
        } else if (mode === "timeout") {
          assert.equal(captures[3]!.record?.timedOut, true);
          assert.equal(captures[3]!.record?.signal, "SIGKILL");
        } else if (mode === "launch-error") {
          assert.match(captures[3]!.error!, /test launch failed/u);
          assert.equal(captures[3]!.status, "capture-error");
        } else if (mode !== "interrupt") {
          if (mode === "unknown-branch") {
            assert.equal(captures[3]!.windowComplete, true);
            assert.equal(captures[3]!.processMatches, true);
            assert.equal(captures[3]!.stack?.unknown, true);
          }
          assert.notEqual(captures[3]!.status, "useful-stack");
          assert.ok(
            captures
              .filter((capture) => capture.index !== 3)
              .every((capture) => capture.status === "useful-stack"),
          );
        }
        assert.equal(fileIdentity(process.execPath).sha256, targetHash);
      } finally {
        clearTimeout(signalTimer);
        const lifetimes = await session.finish();
        assert.ok(lifetimes.every((record) => record.groupGone));
        for (const record of lifetimes) {
          if (record.pid != null)
            assert.throws(() => process.kill(-record.pid!, 0), {
              code: "ESRCH",
            });
        }
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
}

test(
  "Linux owned captures keep eight serial bounded GDB stops",
  {
    skip: process.platform !== "linux",
  },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "oseo-linux-capture-"));
    const session = new ProfilingSession();
    try {
      const target = session.launch(
        directory,
        "target",
        [process.execPath, "-e", "setInterval(() => {}, 1000)"],
        directory,
        {},
        Buffer.alloc(0),
        120_000,
      );
      let active = 0;
      const names: string[] = [];
      const { captures, complete } = await captureOwnedStacks({
        target,
        directory,
        platform: "linux",
        profiler: "fake-gdb",
        request: {
          kind: "synthetic-method-probe",
          executable: process.execPath,
          sha256: fileIdentity(process.execPath).sha256,
          inputs: [],
          argv: [],
          env: {},
          cwd: directory,
          stdinBase64: "",
          stdoutBase64: "",
          stderrBase64: "",
          exitStatus: 0,
        },
        interrupted: () => session.interrupted,
        captures: [],
        execute: async (name, argv, timeoutMs) => {
          assert.equal(active++, 0);
          names.push(name);
          assert.equal(timeoutMs, 5_000);
          assert.deepEqual(argv, [
            "fake-gdb",
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
          const record = await session.launch(
            directory,
            name,
            [
              process.execPath,
              "-e",
              "console.log(" +
                JSON.stringify(
                  `#0 oseo_cell_get ()\n#1 oseo_function_script ()\n` +
                    `[Inferior 1 (process ${target.pid}) detached]`,
                ) +
                ")",
            ],
            directory,
            {},
            Buffer.alloc(0),
            timeoutMs!,
          ).done;
          active--;
          return record;
        },
      });
      assert.equal(captures.length, 8);
      assert.equal(complete, true);
      assert.ok(captures.every((capture) => capture.status === "useful-stack"));
      assert.deepEqual(
        names,
        Array.from({ length: 8 }, (_, i) => `capture-${i}`),
      );
      assert.ok(
        captures.every((capture) => capture.overlappingCommandIndices == null),
      );
    } finally {
      assert.ok((await session.finish()).every((record) => record.groupGone));
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

for (const failure of ["signal", "launch-error", "raw-read-error"]) {
  test(
    `Linux retains earlier capture positions after ${failure}`,
    {
      skip: process.platform !== "linux",
    },
    async () => {
      const directory = mkdtempSync(join(tmpdir(), "oseo-linux-partial-"));
      const session = new ProfilingSession();
      const retained: StackCapture[] = [];
      try {
        const target = session.launch(
          directory,
          "target",
          [process.execPath, "-e", "setInterval(() => {}, 1000)"],
          directory,
          {},
          Buffer.alloc(0),
          120_000,
        );
        await assert.rejects(
          captureOwnedStacks({
            target,
            directory,
            platform: "linux",
            profiler: "fake-gdb",
            request: {
              kind: "synthetic-method-probe",
              executable: process.execPath,
              sha256: fileIdentity(process.execPath).sha256,
              inputs: [],
              argv: [],
              env: {},
              cwd: directory,
              stdinBase64: "",
              stdoutBase64: "",
              stderrBase64: "",
              exitStatus: 0,
            },
            captures: retained,
            interrupted: () => session.interrupted,
            execute: async (name, _argv, timeoutMs) => {
              if (failure === "launch-error" && name === "capture-2") {
                throw new Error("test failed launch");
              }
              const record = await session.launch(
                directory,
                name,
                [
                  process.execPath,
                  "-e",
                  "console.log(" +
                    JSON.stringify(
                      `#0 oseo_cell_get ()\n#1 oseo_function_script ()\n` +
                        `[Inferior 1 (process ${target.pid}) detached]`,
                    ) +
                    ")",
                ],
                directory,
                {},
                Buffer.alloc(0),
                timeoutMs!,
              ).done;
              if (failure === "signal" && name === "capture-1") {
                process.emit("SIGINT");
              }
              return failure === "raw-read-error" && name === "capture-2"
                ? { ...record, stdout: "missing-output" }
                : record;
            },
          }),
          failure === "signal"
            ? /Interrupted/u
            : failure === "launch-error"
              ? /test failed launch/u
              : /ENOENT/u,
        );
        assert.deepEqual(
          retained.map((capture) => capture.index),
          [0, 1],
        );
        assert.ok(
          retained.every(
            (capture) =>
              capture.status === "useful-stack" &&
              capture.stack?.runtime &&
              capture.stack.generated &&
              capture.processMatches,
          ),
        );
        for (const capture of retained) {
          assert.ok(existsSync(join(directory, capture.record!.stdout)));
          assert.ok(existsSync(join(directory, capture.record!.stderr)));
        }
      } finally {
        assert.ok((await session.finish()).every((record) => record.groupGone));
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
}

// Fake owned runs exercise the artifact finalizer without native execution.
for (const scenario of [
  "raw-read-pass",
  "raw-read-wrong-output",
  "raw-read-status",
  "raw-read-timeout",
  "raw-read-checker-error",
  "launch-error",
  "interruption",
  "preflight-failure",
]) {
  test(
    `artifact target oracle survives ${scenario}`,
    { skip: process.platform !== "linux" || process.arch !== "x64" },
    async (context) => {
      const directory = mkdtempSync(join(tmpdir(), "oseo-target-oracle-"));
      const output = join(directory, "capture");
      const profiler = join(directory, "gdb");
      writeFileSync(profiler, "fake profiler\n", { mode: 0o700 });
      const originalPath = process.env.PATH;
      process.env.PATH = directory;
      const bytes = Buffer.from([0, 255, 65, 10]);
      const launches: { readonly name: string; readonly timeout: number }[] =
        [];
      const stops: string[] = [];
      const completion = Promise.withResolvers<RunRecord>();
      let targetRecord: RunRecord | undefined;
      let targetExited = false;
      let checkerCalls = 0;
      const targetPass = scenario === "raw-read-pass";
      const originalFailure =
        scenario === "launch-error"
          ? /fixture launch failed/u
          : scenario === "interruption"
            ? /Interrupted: SIGINT/u
            : scenario === "preflight-failure"
              ? /Preflight output\/status mismatch/u
              : /ENOENT.*capture-2.stdout/u;
      const resolveTarget = (record: RunRecord): void => {
        targetExited = true;
        writeFileSync(join(output, "target.json"), JSON.stringify(record));
        completion.resolve(record);
      };
      context.mock.method(
        ProfilingSession.prototype,
        "launch",
        function (
          this: ProfilingSession,
          ...args: Parameters<ProfilingSession["launch"]>
        ): OwnedRun {
          const [destination, name, argv, cwd, env, stdin, timeout] = args;
          launches.push({ name, timeout });
          if (name === "capture-2" && scenario === "launch-error") {
            throw new Error("fixture launch failed");
          }
          const isTarget = name === "target";
          const isProgram = isTarget || name === "preflight";
          if (isProgram) {
            assert.equal(timeout, 120_000);
            assert.deepEqual(argv, [process.execPath, "fixture-argument"]);
            assert.equal(cwd, directory);
            assert.deepEqual(env, { FIXTURE: "target-oracle" });
            assert.deepEqual(stdin, bytes);
          } else if (name.startsWith("capture-")) {
            assert.equal(timeout, 5_000);
            assert.deepEqual(argv, [
              profiler,
              "--nx",
              "--nh",
              "--batch",
              "-iex",
              "set auto-load off",
              "-iex",
              "set debuginfod enabled off",
              "-p",
              String(process.pid),
              "-ex",
              "thread apply all bt 16",
              "-ex",
              "detach",
            ]);
          } else {
            assert.equal(timeout, 20_000);
          }
          const stdout = `${name}.stdout`;
          const stderr = `${name}.stderr`;
          const stdoutBytes = isProgram
            ? isTarget && scenario === "raw-read-wrong-output"
              ? Buffer.from("wrong\n")
              : bytes
            : name.startsWith("capture-")
              ? Buffer.from(
                  "#0 oseo_cell_get ()\n#1 oseo_function_script ()\n" +
                    `[Inferior 1 (process ${process.pid}) detached]\n`,
                )
              : Buffer.from("fixture identity\n");
          writeFileSync(join(destination, stdout), stdoutBytes);
          writeFileSync(join(destination, stderr), Buffer.alloc(0));
          const record: RunRecord = {
            directory: destination,
            argv,
            cwd,
            env,
            startedUtc: new Date().toISOString(),
            finishedUtc: new Date().toISOString(),
            // Synthetic fixture values, never owned-process clock evidence.
            monotonicStartMs: 10,
            monotonicEndMs: 20,
            wallMs: 10,
            pid: process.pid,
            status:
              (isTarget && scenario === "raw-read-status") ||
              (name === "preflight" && scenario === "preflight-failure")
                ? 7
                : 0,
            signal: null,
            error: null,
            timedOut: false,
            stdout,
            stderr,
            cleanup: [],
            groupGone: true,
          };
          writeFileSync(
            join(destination, `${name}.json`),
            JSON.stringify(record),
          );
          if (isTarget) targetRecord = record;
          if (name === "capture-2") {
            assert.ok(targetRecord);
            resolveTarget(
              scenario === "raw-read-timeout"
                ? {
                    ...targetRecord,
                    status: null,
                    signal: "SIGKILL",
                    timedOut: true,
                    cleanup: ["timeout: SIGKILL owned process group"],
                  }
                : targetRecord,
            );
            rmSync(join(destination, stdout));
          }
          const run: OwnedRun = {
            pid: process.pid,
            exited: () => !isTarget || targetExited,
            done: isTarget ? completion.promise : Promise.resolve(record),
            stop: (reason) => {
              if (!isTarget) return;
              stops.push(reason);
              if (targetExited) return;
              resolveTarget({
                ...record,
                status: null,
                signal: "SIGKILL",
                cleanup: [reason],
              });
            },
          };
          this.runs.add(run);
          if (name === "capture-1" && scenario === "interruption") {
            process.emit("SIGINT");
          }
          return run;
        },
      );
      try {
        const request = {
          kind: "existing-artifact" as const,
          executable: process.execPath,
          sha256: fileIdentity(process.execPath).sha256,
          inputs: [{ path: profiler, sha256: fileIdentity(profiler).sha256 }],
          argv: ["fixture-argument"],
          env: { FIXTURE: "target-oracle" },
          cwd: directory,
          stdinBase64: bytes.toString("base64"),
          stdoutBase64: bytes.toString("base64"),
          stderrBase64: "",
          exitStatus: 0,
        };
        assert.equal(
          await captureArtifact(
            request,
            output,
            scenario === "raw-read-checker-error"
              ? {
                  id: "fixture-checker",
                  sourcePath: profiler,
                  sourceSha256: request.inputs[0]!.sha256,
                  check: () => {
                    if (++checkerCalls === 1) return true;
                    throw new Error("fixture target checker failed");
                  },
                }
              : undefined,
          ),
          false,
        );
        const result = JSON.parse(
          readFileSync(join(output, "capture.json"), "utf8"),
        );
        assert.equal(result.status, "failed-or-incomplete");
        assert.match(result.failure, originalFailure);
        assert.equal(result.performanceEvidence, false);
        assert.equal(result.captures.length, 8);
        assert.ok(result.lifetimes.every((run: RunRecord) => run.groupGone));
        assert.equal(
          launches.filter(({ name }) => name === "preflight").length,
          1,
        );
        const preflight = JSON.parse(
          readFileSync(join(output, "preflight-check.json"), "utf8"),
        );
        if (scenario === "preflight-failure") {
          assert.equal(preflight.correct, false);
          assert.equal(
            launches.some(({ name }) => name === "target"),
            false,
          );
          assert.equal(result.targetCorrect, null);
          assert.equal(existsSync(join(output, "target-check.json")), false);
          return;
        }
        assert.equal(preflight.correct, true);
        assert.equal(
          launches.filter(({ name }) => name === "target").length,
          1,
        );
        assert.ok(stops.includes("finally: cleanup owned target"));
        assert.equal(targetExited, true);
        assert.equal(result.targetCorrect, targetPass);
        const proof = JSON.parse(
          readFileSync(join(output, "target-check.json"), "utf8"),
        );
        const joined = JSON.parse(
          readFileSync(join(output, "target.json"), "utf8"),
        );
        assert.equal(proof.correct, targetPass);
        assert.equal(
          proof.processCorrect,
          [
            "raw-read-pass",
            "raw-read-wrong-output",
            "raw-read-checker-error",
          ].includes(scenario),
        );
        assert.equal(
          proof.outputCorrect,
          !["raw-read-wrong-output", "raw-read-checker-error"].includes(
            scenario,
          ),
        );
        assert.equal(
          proof.checkerError,
          scenario === "raw-read-checker-error"
            ? "Error: fixture target checker failed"
            : null,
        );
        assert.equal(
          checkerCalls,
          scenario === "raw-read-checker-error" ? 2 : 0,
        );
        for (const stream of ["stdout", "stderr"] as const) {
          assert.equal(
            proof[`${stream}Sha256`],
            createHash("sha256")
              .update(readFileSync(join(output, joined[stream])))
              .digest("hex"),
          );
        }
        assert.equal(joined.timedOut, scenario === "raw-read-timeout");
        assert.equal(
          joined.signal,
          ["raw-read-timeout", "launch-error", "interruption"].includes(
            scenario,
          )
            ? "SIGKILL"
            : null,
        );
        assert.equal(joined.error, null);
        assert.equal(
          joined.status,
          joined.signal != null ? null : scenario === "raw-read-status" ? 7 : 0,
        );
        assert.equal(
          result.interrupted,
          scenario === "interruption" ? "SIGINT" : null,
        );
        assert.deepEqual(
          result.captures
            .slice(0, 2)
            .map((capture: StackCapture) => capture.index),
          [0, 1],
        );
        for (const capture of result.captures.slice(0, 2)) {
          assert.equal(capture.status, "useful-stack");
          assert.ok(existsSync(join(output, capture.record.stdout)));
          assert.ok(existsSync(join(output, capture.record.stderr)));
        }
        assert.ok(
          result.captures
            .slice(2)
            .every(
              (capture: StackCapture) =>
                capture.status === "not-attempted-after-failure",
            ),
        );
        assert.deepEqual(
          launches
            .filter(({ name }) => name.startsWith("capture-"))
            .map(({ name }) => name),
          scenario === "interruption"
            ? ["capture-0", "capture-1"]
            : ["capture-0", "capture-1", "capture-2"],
        );
      } finally {
        context.mock.restoreAll();
        if (originalPath == null) delete process.env.PATH;
        else process.env.PATH = originalPath;
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
}

// These Node.js children test actual receipts without building native code.
for (const outcome of ["success", "spawn-failure", "timeout", "interruption"]) {
  test(
    `owned process receipts retain monotonic lifecycle bounds: ${outcome}`,
    { skip: process.platform === "win32" },
    async () => {
      const directory = mkdtempSync(join(tmpdir(), "oseo-run-receipt-"));
      const session = new ProfilingSession();
      const input = Buffer.from([0, 255, 65, 10]);
      const program = `
const fs = require('node:fs');
fs.writeSync(1, fs.readFileSync(0));
fs.writeSync(1, process.env.RECEIPT + ':' + process.argv[1]);
fs.writeSync(2, Buffer.from([0, 254, 10]));
${outcome === "timeout" ? "setInterval(() => {}, 1000);" : ""}
`;
      const argv =
        outcome === "spawn-failure"
          ? [join(directory, "missing-executable")]
          : [process.execPath, "-e", program, "argument"];
      const env = { RECEIPT: "owned" };
      const before = performance.now();
      const startedBefore = Date.now();
      try {
        const run = session.launch(
          directory,
          "receipt",
          argv,
          directory,
          env,
          input,
          2_000,
        );
        if (outcome === "interruption") process.emit("SIGTERM");
        const record = await run.done;
        const after = performance.now();
        const finishedAfter = Date.now();
        assert.ok(Number.isFinite(record.monotonicStartMs));
        assert.ok(Number.isFinite(record.monotonicEndMs));
        assert.ok(Number.isFinite(record.wallMs));
        assert.ok(record.monotonicStartMs >= before);
        assert.ok(record.monotonicEndMs >= record.monotonicStartMs);
        assert.ok(record.monotonicEndMs <= after);
        assert.equal(
          record.wallMs,
          record.monotonicEndMs - record.monotonicStartMs,
        );
        assert.ok(Date.parse(record.startedUtc) >= startedBefore);
        assert.ok(Date.parse(record.finishedUtc) <= finishedAfter);
        assert.deepEqual(record.argv, argv);
        assert.deepEqual(record.env, env);
        assert.equal(record.cwd, directory);
        assert.equal(record.directory, directory);
        assert.equal(record.pid, run.pid ?? null);
        assert.equal(run.exited(), true);
        assert.equal(record.groupGone, true);
        assert.equal(record.timedOut, outcome === "timeout");
        const stdout = readFileSync(join(directory, record.stdout));
        const stderr = readFileSync(join(directory, record.stderr));
        if (outcome === "spawn-failure") {
          assert.equal(run.pid, undefined);
          assert.equal(record.status, null);
          assert.equal(record.signal, null);
          assert.match(record.error!, /ENOENT/u);
          assert.deepEqual(record.cleanup, []);
          assert.equal(stdout.length, 0);
          assert.equal(stderr.length, 0);
        } else if (outcome === "interruption") {
          assert.equal(record.status, null);
          assert.equal(record.signal, "SIGKILL");
          assert.equal(session.interrupted, "SIGTERM");
          assert.deepEqual(record.cleanup, [
            "signal SIGTERM: cleanup owned group",
          ]);
        } else {
          assert.equal(record.error, null);
          assert.deepEqual(
            stdout,
            Buffer.concat([input, Buffer.from("owned:argument")]),
          );
          assert.deepEqual(stderr, Buffer.from([0, 254, 10]));
          if (outcome === "timeout") {
            assert.equal(record.status, null);
            assert.equal(record.signal, "SIGKILL");
            assert.deepEqual(record.cleanup, [
              "timeout: SIGKILL owned process group",
            ]);
          } else {
            assert.equal(record.status, 0);
            assert.equal(record.signal, null);
            assert.deepEqual(record.cleanup, []);
          }
        }
        assert.deepEqual(
          JSON.parse(readFileSync(join(directory, "receipt.json"), "utf8")),
          record,
        );
      } finally {
        await session.finish();
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
}
