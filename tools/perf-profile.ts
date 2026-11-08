import {
  captureArtifact,
  validateCaptureRequest,
} from "./perf-profile-capture.ts";
import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  mkdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Read-only discovery commands; none launches a profiling target. */
export function profilingProbes(
  platform: string,
): readonly (readonly string[])[] {
  if (platform === "linux") {
    return [
      ["uname", "-a"],
      ["perf", "--version"],
      ["gdb", "--version"],
      [
        "gdb",
        "--nx",
        "--nh",
        "--batch",
        "-iex",
        "set auto-load off",
        "-ex",
        "show configuration",
        "-ex",
        "python import gdb; print(gdb.VERSION)",
      ],
    ];
  }
  if (platform === "darwin") {
    return [
      ["/usr/bin/uname", "-a"],
      ["/usr/bin/sw_vers"],
      ["/usr/bin/xcode-select", "-p"],
      ["/usr/bin/xcodebuild", "-version"],
      ["/usr/bin/xcrun", "--find", "xctrace"],
      ["/usr/bin/xcrun", "xctrace", "version"],
      ["/usr/bin/xcrun", "xctrace", "help", "record"],
      ["/usr/bin/xcrun", "xctrace", "help", "export"],
      ["/usr/bin/xcrun", "xctrace", "list", "templates"],
      ["/usr/bin/sample", "-h"],
    ];
  }
  throw new Error(`Unsupported profiling discovery host: ${platform}`);
}

/** Resolve an installed executable without installing or modifying it. */
export function executablePath(command: string): string | null {
  const candidates = isAbsolute(command)
    ? [command]
    : (process.env.PATH ?? "")
        .split(delimiter)
        .map((entry) => join(entry, command));
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return realpathSync(candidate);
    } catch {
      // Missing and inaccessible executables remain failed probes.
    }
  }
  return null;
}

/** Save probe bytes and return a log bundle without accepting a method. */
export function discoverProfilingTools(directory: string): string {
  const probes = profilingProbes(process.platform);
  mkdirSync(directory, { recursive: false });
  const commands = probes.map((argv, index) => {
    const startedUtc = new Date().toISOString();
    const toolPath = executablePath(argv[0]!);
    const executedArgv = [toolPath ?? argv[0]!, ...argv.slice(1)];
    const result = spawnSync(executedArgv[0]!, executedArgv.slice(1), {
      timeout: 20_000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const finishedUtc = new Date().toISOString();
    const stdout = `${index}.stdout`;
    const stderr = `${index}.stderr`;
    writeFileSync(resolve(directory, stdout), result.stdout ?? Buffer.alloc(0));
    writeFileSync(resolve(directory, stderr), result.stderr ?? Buffer.alloc(0));
    return {
      argv: executedArgv,
      toolPath,
      startedUtc,
      finishedUtc,
      status: result.status,
      signal: result.signal,
      error: result.error?.message ?? null,
      stdout,
      stderr,
      stdoutBase64: (result.stdout ?? Buffer.alloc(0)).toString("base64"),
      stderrBase64: (result.stderr ?? Buffer.alloc(0)).toString("base64"),
    };
  });
  const bundle =
    JSON.stringify(
      {
        kind: "profiling-tool-discovery",
        acceptance: "unverified",
        platform: process.platform,
        architecture: process.arch,
        cwd: process.cwd(),
        developerDirectory: process.env.DEVELOPER_DIR ?? null,
        commands,
      },
      null,
      2,
    ) + "\n";
  writeFileSync(resolve(directory, "discovery.json"), bundle);
  return bundle;
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv.length === 4 && process.argv[2] === "discover") {
    process.stdout.write(discoverProfilingTools(resolve(process.argv[3]!)));
  } else if (process.argv.length === 5 && process.argv[2] === "capture") {
    const { readFileSync } = await import("node:fs");
    const request = validateCaptureRequest(
      JSON.parse(readFileSync(process.argv[3]!, "utf8")),
    );
    process.exitCode = (await captureArtifact(
      request,
      resolve(process.argv[4]!),
    ))
      ? 0
      : 1;
  } else {
    throw new Error(
      "usage: perf-profile.ts discover NEW_DIRECTORY | " +
        "capture REQUEST_JSON NEW_DIRECTORY",
    );
  }
}
