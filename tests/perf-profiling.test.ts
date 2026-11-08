import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
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
