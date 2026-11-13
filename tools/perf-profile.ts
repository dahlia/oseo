import {
  captureArtifact,
  validateCaptureRequest,
} from "./perf-profile-capture.ts";
import { ProfilingSession } from "./perf-profile-process.ts";
import {
  accessSync,
  constants,
  mkdirSync,
  realpathSync,
  readFileSync,
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

/** Save partial probe bytes after every command, including caught signals. */
export async function discoverProfilingTools(
  directory: string,
  sharedSession?: ProfilingSession,
): Promise<string> {
  const probes = profilingProbes(process.platform);
  mkdirSync(directory, { recursive: false });
  const session = sharedSession ?? new ProfilingSession();
  const commands: object[] = [];
  let completed = false;
  const bundle = (): string =>
    JSON.stringify(
      {
        kind: "profiling-tool-discovery",
        acceptance: "unverified",
        platform: process.platform,
        architecture: process.arch,
        cwd: process.cwd(),
        developerDirectory: process.env.DEVELOPER_DIR ?? null,
        interrupted: session.interrupted,
        completed: completed && session.interrupted == null,
        commands,
      },
      null,
      2,
    ) + "\n";
  const save = (): string => {
    const text = bundle();
    writeFileSync(resolve(directory, "discovery.json"), text);
    return text;
  };
  try {
    save();
    for (const [index, argv] of probes.entries()) {
      const toolPath = executablePath(argv[0]!);
      const executedArgv = [toolPath ?? argv[0]!, ...argv.slice(1)];
      const run = session.launch(
        directory,
        String(index),
        executedArgv,
        process.cwd(),
        Object.fromEntries(
          ["PATH", "HOME", "DEVELOPER_DIR", "LANG", "LC_ALL", "TMPDIR"]
            .map((name) => [name, process.env[name]])
            .filter((entry): entry is [string, string] => entry[1] != null),
        ),
        Buffer.alloc(0),
        20_000,
      );
      // eslint-disable-next-line no-await-in-loop -- Bound each probe.
      const record = await run.done;
      commands.push({
        ...record,
        toolPath,
        stdoutBase64: readFileSync(resolve(directory, record.stdout)).toString(
          "base64",
        ),
        stderrBase64: readFileSync(resolve(directory, record.stderr)).toString(
          "base64",
        ),
      });
      completed =
        commands.length === probes.length &&
        !record.timedOut &&
        record.groupGone;
      save();
      if (record.timedOut || !record.groupGone || session.interrupted != null) {
        completed = false;
        break;
      }
    }
  } finally {
    if (sharedSession == null) await session.finish();
    save();
  }
  return bundle();
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv.length === 4 && process.argv[2] === "discover") {
    process.stdout.write(
      await discoverProfilingTools(resolve(process.argv[3]!)),
    );
    // Missing tools are inventory; interrupted operations must fail.
    const record = JSON.parse(
      readFileSync(resolve(process.argv[3]!, "discovery.json"), "utf8"),
    );
    if (!record.completed) process.exitCode = 1;
  } else if (process.argv.length === 5 && process.argv[2] === "capture") {
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
