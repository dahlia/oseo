/* eslint-disable no-await-in-loop -- Discovery probes run in a fixed order. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  constants,
  lstat,
  mkdir,
  open,
  realpath,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { isObject, isString } from "../value-kinds.ts";

const schema = "oseo-mac-discovery-v1";
const systemPath = "/usr/bin:/bin:/usr/sbin:/sbin";

/** Caller-provided CI bindings and the two approved directory roots. */
export interface DiscoveryInput {
  readonly repository: string;
  readonly runId: string;
  readonly attempt: string;
  readonly job: string;
  readonly label: "oseo-mac-1" | "oseo-mac-2";
  readonly runnerName: string;
  readonly runnerOs: string;
  readonly runnerArch: string;
  readonly runnerEnvironment: string;
  readonly githubActions: string;
  readonly sha: string;
  readonly workspace: string;
  readonly temp: string;
}

/** A discovery executable/argument vector, with no shell or target PID. */
export interface DiscoveryCommand {
  readonly name: string;
  readonly executable: string;
  readonly argv: readonly string[];
}

/** Private decoded streams and the bounded probe/cleanup outcome. */
export interface DiscoveryResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly errorCode: string | null;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly truncated: boolean;
  readonly cleanup: "verified" | "unknown";
}

/** Production execution or an explicitly supplied hermetic fixture seam. */
export type DiscoveryRunner = (
  command: DiscoveryCommand,
  cwd: string,
) => DiscoveryResult | Promise<DiscoveryResult>;

/** Runtime facts and execution seam, without Mac acceptance claims. */
export interface DiscoveryRuntime {
  readonly platform: string;
  readonly arch: string;
  readonly node: string;
  readonly run: DiscoveryRunner;
}

/** Fixed probes have no target PID, source execution or shell expansion. */
export function discoveryCommands(node: string): readonly DiscoveryCommand[] {
  return [
    { name: "utc", executable: "/bin/date", argv: ["-u", "+%FT%TZ"] },
    { name: "account", executable: "/usr/bin/id", argv: ["-un"] },
    { name: "uid", executable: "/usr/bin/id", argv: ["-u"] },
    { name: "gid", executable: "/usr/bin/id", argv: ["-g"] },
    { name: "os", executable: "/usr/bin/uname", argv: ["-s"] },
    { name: "arch", executable: "/usr/bin/uname", argv: ["-m"] },
    { name: "version", executable: "/usr/bin/sw_vers", argv: [] },
    {
      name: "hardware",
      executable: "/usr/sbin/ioreg",
      argv: ["-r", "-d", "1", "-c", "IOPlatformExpertDevice"],
    },
    {
      name: "boot",
      executable: "/usr/sbin/sysctl",
      argv: ["-n", "kern.bootsessionuuid"],
    },
    { name: "head", executable: "/usr/bin/git", argv: ["rev-parse", "HEAD"] },
    {
      name: "tree",
      executable: "/usr/bin/git",
      argv: ["rev-parse", "HEAD^{tree}"],
    },
    {
      name: "status",
      executable: "/usr/bin/git",
      argv: [
        "-c",
        "core.fsmonitor=false",
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ],
    },
    { name: "node", executable: node, argv: ["--version"] },
    {
      name: "tool-locations",
      executable: "/usr/bin/which",
      argv: ["sample", "atos", "xcrun", "time"],
    },
    { name: "sample-help", executable: "/usr/bin/sample", argv: ["-h"] },
    { name: "atos-help", executable: "/usr/bin/atos", argv: ["-h"] },
    {
      name: "xctrace-location",
      executable: "/usr/bin/xcrun",
      argv: ["--find", "xctrace"],
    },
    { name: "disk", executable: "/bin/df", argv: ["-k", "."] },
    {
      name: "final-head",
      executable: "/usr/bin/git",
      argv: ["rev-parse", "HEAD"],
    },
    {
      name: "final-tree",
      executable: "/usr/bin/git",
      argv: ["rev-parse", "HEAD^{tree}"],
    },
    {
      name: "final-status",
      executable: "/usr/bin/git",
      argv: [
        "-c",
        "core.fsmonitor=false",
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ],
    },
  ];
}

/**
 * Run with a minimal environment and bounded owned-group cleanup.
 * Schedule TERM at five seconds, KILL at six, and cleanup finalization
 * at six and a half seconds. Visible groups remain unknown; escaped
 * descendants are outside this check. Streams decode as UTF-8, retaining
 * at most one MiB each and marking truncation as a failure.
 */
export async function runDiscoveryCommand(
  command: DiscoveryCommand,
  cwd: string,
): Promise<DiscoveryResult> {
  const started = performance.now();
  return await new Promise((resolve) => {
    const child = spawn(command.executable, [...command.argv], {
      cwd,
      env: {
        PATH: systemPath,
        LC_ALL: "C",
        GIT_OPTIONAL_LOCKS: "0",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
      },
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout: Buffer = Buffer.alloc(0);
    let stderr: Buffer = Buffer.alloc(0);
    let exitCode: number | null = null;
    let signal: string | null = null;
    let errorCode: string | null = null;
    let timedOut = false;
    let truncated = false;
    let finished = false;
    const visible = (): boolean => {
      if (child.pid === undefined) return false;
      try {
        process.kill(process.platform === "win32" ? child.pid : -child.pid, 0);
        return true;
      } catch (error) {
        return !(
          error instanceof Error &&
          "code" in error &&
          error.code === "ESRCH"
        );
      }
    };
    const terminate = (termination: NodeJS.Signals): void => {
      if (child.pid === undefined) return;
      try {
        if (process.platform === "win32") child.kill(termination);
        else process.kill(-child.pid, termination);
      } catch {
        /* Disappearance is checked separately. */
      }
    };
    const finish = (): void => {
      if (finished) return;
      const cleanup = visible() ? "unknown" : "verified";
      if (cleanup === "unknown") terminate("SIGKILL");
      finished = true;
      clearTimeout(deadline);
      clearTimeout(killDeadline);
      clearTimeout(cleanupDeadline);
      child.stdout.destroy();
      child.stderr.destroy();
      resolve({
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        exitCode,
        signal,
        errorCode,
        durationMs: performance.now() - started,
        timedOut,
        truncated,
        cleanup,
      });
    };
    const deadline = setTimeout(() => {
      timedOut = true;
      errorCode ??= "ETIMEDOUT";
      terminate("SIGTERM");
    }, 5000);
    const killDeadline = setTimeout(() => terminate("SIGKILL"), 6000);
    const cleanupDeadline = setTimeout(() => {
      terminate("SIGKILL");
      finish();
      child.unref();
    }, 6500);
    const append = (current: Buffer, chunk: Buffer): Buffer => {
      const remaining = 1024 * 1024 - current.length;
      if (chunk.length > remaining) {
        truncated = true;
        errorCode ??= "ENOBUFS";
        terminate("SIGTERM");
      }
      return Buffer.concat([current, chunk.subarray(0, remaining)]);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.on("error", (error) => {
      errorCode =
        "code" in error && isString(error.code) ? error.code : "SPAWN_ERROR";
    });
    child.on("exit", (code, termination) => {
      exitCode = code;
      signal = termination;
    });
    child.on("close", finish);
  });
}

function sourceSha(value: string): boolean {
  return value.length === 40 && /^[a-f\d]{40}$/u.test(value);
}

function validateInput(input: DiscoveryInput): void {
  if (
    !/^[\w.-]+\/[\w.-]+$/u.test(input.repository) ||
    !/^[1-9]\d*$/u.test(input.runId) ||
    !/^[1-9]\d*$/u.test(input.attempt) ||
    !sourceSha(input.sha) ||
    [input.repository, input.runId, input.attempt].some(
      (text) => text !== text.trim(),
    ) ||
    !["oseo-mac-1", "oseo-mac-2"].includes(input.label) ||
    input.job !== `mac-discovery-${input.label.at(-1)}` ||
    input.runnerName !== input.label ||
    input.githubActions !== "true" ||
    input.runnerEnvironment !== "self-hosted" ||
    input.runnerOs !== "macOS" ||
    input.runnerArch !== "ARM64" ||
    !isAbsolute(input.workspace) ||
    !isAbsolute(input.temp)
  ) {
    throw new Error("Invalid discovery CI identity");
  }
}

/** Equality is scoped to one repository/run/attempt, never authentication. */
export function discoveryFingerprint(
  input: DiscoveryInput,
  domain: string,
  value: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        schema,
        input.repository,
        input.runId,
        input.attempt,
        input.sha,
        domain,
        value,
      ]),
    )
    .digest("hex");
}

interface ProbeRecord {
  readonly command: DiscoveryCommand;
  readonly result: DiscoveryResult;
  readonly startedUtc: string;
  readonly finishedUtc: string;
}

function successful(record: ProbeRecord | undefined): boolean {
  return (
    record?.result.exitCode === 0 &&
    record.result.signal === null &&
    record.result.errorCode === null &&
    !record.result.timedOut &&
    !record.result.truncated &&
    record.result.cleanup === "verified"
  );
}

const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu;

/** The fixture seam never asserts actual Mac acceptance. */
export async function discoverMac(
  input: DiscoveryInput,
  runtime: DiscoveryRuntime,
): Promise<boolean> {
  validateInput(input);
  const workspace = await realpath(input.workspace);
  const temp = await realpath(input.temp);
  if (workspace !== input.workspace || temp !== input.temp) {
    throw new Error("Discovery roots must be canonical directories");
  }
  const directory = join(temp, "oseo-mac-discovery");
  const location = relative(workspace, directory);
  if (
    !(
      location === ".." ||
      location.startsWith(`..${sep}`) ||
      isAbsolute(location)
    )
  ) {
    throw new Error("Evidence must be outside the checkout");
  }
  // Exclusive creation refuses stale attempts and symlink destinations.
  await mkdir(directory, { mode: 0o700 });
  const raw = join(directory, "private");
  const derived = join(directory, "derived");
  await mkdir(raw, { mode: 0o700 });
  await mkdir(derived, { mode: 0o700 });
  const records: ProbeRecord[] = [];
  let cleanupUnknown = false;
  for (const command of discoveryCommands(runtime.node)) {
    const startedUtc = new Date().toISOString();
    const result: DiscoveryResult = cleanupUnknown
      ? {
          stdout: "",
          stderr: "",
          exitCode: null,
          signal: null,
          errorCode: "UNATTEMPTED_AFTER_CLEANUP",
          durationMs: 0,
          timedOut: false,
          truncated: false,
          cleanup: "unknown",
        }
      : await runtime.run(command, workspace);
    cleanupUnknown ||= result.cleanup === "unknown";
    const record = {
      command,
      result,
      startedUtc,
      finishedUtc: new Date().toISOString(),
    };
    records.push(record);
    await writeFile(
      join(raw, `${command.name}.json`),
      JSON.stringify(record, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
  }
  const find = (name: string): ProbeRecord | undefined =>
    records.find((record) => record.command.name === name);
  const value = (name: string): string =>
    successful(find(name)) ? (find(name)?.result.stdout.trim() ?? "") : "";
  const hardware =
    value("hardware")
      .match(/"IOPlatformUUID"\s*=\s*"([a-f\d-]+)"/iu)?.[1]
      ?.toLowerCase() ?? "";
  const boot = value("boot").toLowerCase();
  const failures: string[] = [];
  const requireFact = (condition: boolean, name: string): void => {
    if (!condition) failures.push(name);
  };
  requireFact(
    !records.some(
      ({ result }) =>
        result.timedOut || result.truncated || result.cleanup === "unknown",
    ),
    "probe-execution",
  );
  requireFact(
    runtime.platform === "darwin" && runtime.arch === "arm64",
    "runtime-platform",
  );
  requireFact(
    value("os") === "Darwin" && value("arch") === "arm64",
    "observed-platform",
  );
  requireFact(value("account") !== "", "account");
  requireFact(/^\d+$/u.test(value("uid")), "uid");
  requireFact(/^\d+$/u.test(value("gid")), "gid");
  const zeroUuid = "00000000-0000-0000-0000-000000000000";
  requireFact(uuid.test(hardware) && hardware !== zeroUuid, "hardware");
  requireFact(uuid.test(boot) && boot !== zeroUuid, "boot");
  requireFact(value("head") === input.sha, "source-sha");
  requireFact(sourceSha(value("tree")), "source-tree");
  requireFact(
    successful(find("status")) && value("status") === "",
    "source-clean",
  );
  requireFact(
    value("final-head") === input.sha &&
      value("final-tree") === value("tree") &&
      successful(find("final-status")) &&
      value("final-status") === "",
    "source-final",
  );
  requireFact(value("node") === "v24.21.0", "node-pin");
  requireFact(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u.test(value("utc")), "utc");
  const fingerprint = (domain: string, text: string): string | null =>
    text === "" ? null : discoveryFingerprint(input, domain, text);
  const directories = [];
  for (const [name, path] of [
    ["workspace", workspace],
    ["temp", temp],
  ]) {
    if (name === undefined || path === undefined) continue;
    try {
      const info = await lstat(path);
      const rights: Record<string, boolean> = {};
      for (const [right, mode] of Object.entries({
        read: constants.R_OK,
        write: constants.W_OK,
        search: constants.X_OK,
      })) {
        try {
          await access(path, mode);
          rights[right] = true;
        } catch {
          rights[right] = false;
        }
      }
      directories.push({
        name,
        mode: info.mode & 0o777,
        uid: fingerprint("uid", String(info.uid)),
        gid: fingerprint("gid", String(info.gid)),
        directory: info.isDirectory(),
        rights,
      });
      requireFact(info.isDirectory(), `${name}-directory`);
    } catch {
      directories.push({ name, status: "unknown" });
      failures.push(`${name}-metadata`);
    }
  }
  const probeSummary = [];
  for (const record of records) {
    const content = JSON.stringify(record, null, 2) + "\n";
    probeSummary.push({
      name: record.command.name,
      executable:
        record.command.name === "node"
          ? "pinned-node"
          : record.command.executable,
      argv: record.command.argv,
      exitCode: record.result.exitCode,
      signal: record.result.signal,
      errorCode: record.result.errorCode,
      durationMs: record.result.durationMs,
      timedOut: record.result.timedOut,
      truncated: record.result.truncated,
      cleanup: record.result.cleanup,
      startedUtc: record.startedUtc,
      finishedUtc: record.finishedUtc,
      support:
        record.result.errorCode === "ENOENT"
          ? "unavailable"
          : successful(record)
            ? "observed-success"
            : "unknown",
      stdout: fingerprint(
        `stdout:${record.command.name}`,
        record.result.stdout,
      ),
      stderr: fingerprint(
        `stderr:${record.command.name}`,
        record.result.stderr,
      ),
      rawRecordFingerprint: discoveryFingerprint(input, "raw-record", content),
      rawMode: "0600",
    });
  }
  const observedSha = (name: string): string | null =>
    sourceSha(value(name)) ? value(name) : null;
  const source = {
    expectedSha: input.sha,
    sha: observedSha("head"),
    tree: observedSha("tree"),
    finalSha: observedSha("final-head"),
    finalTree: observedSha("final-tree"),
    clean:
      successful(find("status")) &&
      value("status") === "" &&
      successful(find("final-status")) &&
      value("final-status") === "",
  };
  const body =
    JSON.stringify(
      {
        schema,
        purpose: "PREPARATION-only",
        nativeAcceptance: "unverified",
        physicalIsolation: "unknown",
        status: failures.length === 0 ? "observed" : "failed",
        failures,
        source,
        ci: {
          repository: input.repository,
          runId: input.runId,
          attempt: input.attempt,
          job: input.job,
          label: input.label,
          runnerName: fingerprint("runner-name", input.runnerName),
          numericJobId: null,
          numericRunnerId: null,
        },
        identity: {
          account: fingerprint("account", value("account")),
          uid: fingerprint("uid", value("uid")),
          gid: fingerprint("gid", value("gid")),
          hardware: fingerprint("hardware", hardware),
          boot: fingerprint("boot", boot),
        },
        platform: {
          runtime: runtime.platform,
          arch: runtime.arch,
          os: value("os") === "Darwin" ? "Darwin" : null,
        },
        directories,
        probes: probeSummary,
        representation:
          "run/attempt-scoped SHA-256; derived, not raw acceptance",
        rawLifetime: "private transient files; lost at normal runner cleanup",
      },
      null,
      2,
    ) + "\n";
  await writeFile(join(derived, "discovery.json"), body, {
    flag: "wx",
    mode: 0o600,
  });
  await writeFile(
    join(derived, "manifest.json"),
    JSON.stringify(
      {
        schema,
        source,
        runId: input.runId,
        attempt: input.attempt,
        job: input.job,
        label: input.label,
        files: [
          {
            path: "discovery.json",
            mode: "0600",
            bytes: Buffer.byteLength(body),
            sha256: createHash("sha256").update(body).digest("hex"),
          },
        ],
      },
      null,
      2,
    ) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  return failures.length === 0;
}

/** USTAR carries synthetic ownership, never the job account's metadata. */
function derivedTarEntry(name: string, bytes: Buffer): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "ascii");
  const octal = (value: number, offset: number, width: number): void => {
    header.write(
      value.toString(8).padStart(width - 1, "0") + "\0",
      offset,
      width,
      "ascii",
    );
  };
  octal(0o600, 100, 8);
  octal(0, 108, 8);
  octal(0, 116, 8);
  octal(bytes.length, 124, 12);
  octal(0, 136, 12);
  header.fill(0x20, 148, 156);
  header.write("0", 156, "ascii");
  header.write("ustar\0", 257, "ascii");
  header.write("00", 263, "ascii");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return Buffer.concat([
    header,
    bytes,
    Buffer.alloc((512 - (bytes.length % 512)) % 512),
  ]);
}

async function readDerivedFile(path: string): Promise<Buffer> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (
      !info.isFile() ||
      (info.mode & 0o777) !== 0o600 ||
      info.size > 1024 * 1024
    ) {
      throw new Error("Invalid private derived evidence file");
    }
    return await file.readFile();
  } finally {
    await file.close();
  }
}

/** Failure collection preserves the original diagnostic status. */
export async function archiveMacDiscovery(
  input: DiscoveryInput,
): Promise<void> {
  validateInput(input);
  const temp = await realpath(input.temp);
  if (temp !== input.temp) throw new Error("Noncanonical collection root");
  const workspace = await realpath(input.workspace);
  const location = relative(workspace, temp);
  if (
    workspace !== input.workspace ||
    !(
      location === ".." ||
      location.startsWith(`..${sep}`) ||
      isAbsolute(location)
    )
  ) {
    throw new Error("Collection must remain outside the checkout");
  }
  const directory = join(temp, "oseo-mac-discovery", "derived");
  if ((await realpath(directory)) !== directory) {
    throw new Error("Symlinked evidence directory");
  }
  for (const path of [join(temp, "oseo-mac-discovery"), directory]) {
    const info = await lstat(path);
    if (!info.isDirectory() || (info.mode & 0o777) !== 0o700) {
      throw new Error("Invalid private evidence directory");
    }
  }
  const discovery = await readDerivedFile(join(directory, "discovery.json"));
  const manifestBytes = await readDerivedFile(join(directory, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const report = JSON.parse(discovery.toString("utf8"));
  const digest = createHash("sha256").update(discovery).digest("hex");
  if (
    !isObject(manifest) ||
    manifest.schema !== schema ||
    manifest.runId !== input.runId ||
    manifest.attempt !== input.attempt ||
    manifest.job !== input.job ||
    manifest.label !== input.label ||
    !isObject(manifest.source) ||
    manifest.source.expectedSha !== input.sha ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== 1 ||
    !isObject(manifest.files[0]) ||
    manifest.files[0].path !== "discovery.json" ||
    manifest.files[0].mode !== "0600" ||
    manifest.files[0].bytes !== discovery.length ||
    manifest.files[0].sha256 !== digest ||
    !isObject(report) ||
    report.schema !== schema ||
    !isObject(report.ci) ||
    report.ci.repository !== input.repository ||
    report.ci.runId !== input.runId ||
    report.ci.attempt !== input.attempt ||
    report.ci.job !== input.job ||
    report.ci.label !== input.label ||
    !isObject(report.source) ||
    report.source.expectedSha !== input.sha
  ) {
    throw new Error("Collection context or file digest mismatch");
  }
  const archive = Buffer.concat([
    derivedTarEntry("derived/discovery.json", discovery),
    derivedTarEntry("derived/manifest.json", manifestBytes),
    Buffer.alloc(1024),
  ]);
  await writeFile(join(temp, "mac-discovery-derived.tar"), archive, {
    flag: "wx",
    mode: 0o600,
  });
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const env = process.env;
  try {
    const input: DiscoveryInput = {
      repository: env.GITHUB_REPOSITORY ?? "",
      runId: env.GITHUB_RUN_ID ?? "",
      attempt: env.GITHUB_RUN_ATTEMPT ?? "",
      job: env.GITHUB_JOB ?? "",
      // SAFETY: validateInput rejects every other label before any probe.
      label: (env.OSEO_DISCOVERY_LABEL ?? "") as DiscoveryInput["label"],
      runnerName: env.RUNNER_NAME ?? "",
      runnerOs: env.RUNNER_OS ?? "",
      runnerArch: env.RUNNER_ARCH ?? "",
      runnerEnvironment: env.RUNNER_ENVIRONMENT ?? "",
      githubActions: env.GITHUB_ACTIONS ?? "",
      sha: env.GITHUB_SHA ?? "",
      workspace: env.GITHUB_WORKSPACE ?? "",
      temp: env.RUNNER_TEMP ?? "",
    };
    if (process.version !== "v24.21.0") {
      throw new Error("Pinned Node.js is unavailable");
    }
    if (env.OSEO_DISCOVERY_ARCHIVE_ONLY === "true") {
      await archiveMacDiscovery(input);
    } else {
      if (env.OSEO_DISCOVERY_ARCHIVE_ONLY !== undefined) {
        throw new Error("Invalid collection mode");
      }
      const observed = await discoverMac(input, {
        platform: process.platform,
        arch: process.arch,
        node: process.execPath,
        run: runDiscoveryCommand,
      });
      if (!observed) process.exitCode = 1;
    }
  } catch {
    console.error("Mac preparation discovery failed; preserve job status");
    process.exitCode = 1;
  }
}
