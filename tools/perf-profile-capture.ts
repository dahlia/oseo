import { ProfilingSession } from "./perf-profile-process.ts";
import type { OwnedRun, RunRecord } from "./perf-profile-process.ts";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { arch, hostname, release } from "node:os";
import { isAbsolute, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { discoverProfilingTools, executablePath } from "./perf-profile.ts";
import type {
  StructuredDataInput,
  StructuredDataValue,
} from "./structured-data.ts";
import { parsedMapping } from "./structured-data.ts";
import { isNumber, isString } from "./value-kinds.ts";

/** A caller-owned artifact contract, independent of the corpus harness. */
export interface CaptureRequest {
  readonly kind: "existing-artifact" | "synthetic-method-probe";
  readonly executable: string;
  readonly sha256: string;
  readonly inputs: readonly {
    readonly path: string;
    readonly sha256: string;
  }[];
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly stdinBase64: string;
  readonly stdoutBase64: string;
  readonly stderrBase64: string;
  readonly exitStatus: number;
}

/** A pure, bounded synchronous stdout oracle owned by the caller. */
export interface CaptureStdoutChecker {
  readonly id: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly check: (stdout: Uint8Array) => boolean;
}

function isCheckerFunction<Candidate>(
  value: Candidate,
): value is Candidate & CaptureStdoutChecker["check"] {
  return typeof value === "function";
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Frozen file bytes and filesystem identity. */
export interface FileIdentity {
  readonly path: string;
  readonly realpath: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly mode: number;
}

/** Snapshot bytes, mode and resolved path without modifying the input. */
export function fileIdentity(path: string): FileIdentity {
  const bytes = readFileSync(path);
  return {
    path,
    realpath: realpathSync(path),
    sha256: digest(bytes),
    bytes: bytes.length,
    mode: statSync(path).mode & 0o777,
  };
}

function requiredString(
  value: StructuredDataValue | undefined,
  name: string,
): string {
  if (!isString(value)) throw new Error(`Expected string: ${name}`);
  return value;
}

/** Parse the complete launch contract before executing any caller artifact. */
export function validateCaptureRequest<Candidate>(
  value: StructuredDataInput<Candidate>,
): CaptureRequest {
  const request = parsedMapping(value, "Capture request");
  const kind = request.kind;
  if (kind !== "existing-artifact" && kind !== "synthetic-method-probe") {
    throw new Error("Expected existing-artifact or synthetic-method-probe");
  }
  const executable = requiredString(request.executable, "executable");
  const cwd = requiredString(request.cwd, "cwd");
  const sha256 = requiredString(request.sha256, "sha256");
  const inputs = request.inputs;
  const argv = request.argv;
  const env = parsedMapping(request.env, "Explicit launch environment");
  const exitStatus = request.exitStatus;
  if (
    !isAbsolute(executable) ||
    !isAbsolute(cwd) ||
    !/^[a-f0-9]{64}$/u.test(sha256) ||
    !Array.isArray(inputs) ||
    inputs.length === 0 ||
    !Array.isArray(argv) ||
    !argv.every(isString) ||
    !isNumber(exitStatus) ||
    !Number.isInteger(exitStatus)
  ) {
    throw new Error("Incomplete capture launch, input or byte oracle contract");
  }
  const inputFiles = inputs.map((entry) => {
    const input = parsedMapping(entry, "Frozen source input");
    const path = requiredString(input.path, "input.path");
    const hash = requiredString(input.sha256, "input.sha256");
    if (!isAbsolute(path) || !/^[a-f0-9]{64}$/u.test(hash)) {
      throw new Error("Invalid frozen input path/digest");
    }
    return { path, sha256: hash };
  });
  const environment = Object.fromEntries(
    Object.entries(env).map(([name, entry]) => [
      name,
      requiredString(entry, name),
    ]),
  );
  const base64 = (name: string): string => {
    const text = requiredString(request[name], name);
    if (Buffer.from(text, "base64").toString("base64") !== text) {
      throw new Error(`Expected canonical base64: ${name}`);
    }
    return text;
  };
  return {
    kind,
    executable,
    cwd,
    sha256,
    inputs: inputFiles,
    argv,
    env: environment,
    exitStatus,
    stdinBase64: base64("stdinBase64"),
    stdoutBase64: base64("stdoutBase64"),
    stderrBase64: base64("stderrBase64"),
  };
}

/** Run a smoke build command with owned-group cleanup and raw logs. */
export async function runProfilingCommand(
  directory: string,
  name: string,
  argv: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string>>,
): Promise<RunRecord> {
  const session = new ProfilingSession();
  try {
    return await session.launch(
      directory,
      name,
      argv,
      cwd,
      env,
      Buffer.alloc(0),
      600_000,
    ).done;
  } finally {
    await session.finish();
  }
}

function writeJson<Value>(path: string, value: Value): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function goodRun(record: RunRecord): boolean {
  return (
    record.status === 0 &&
    record.signal == null &&
    record.error == null &&
    !record.timedOut &&
    record.groupGone
  );
}

/** Stack quality observations, independent of cost attribution. */
export interface StackQuality {
  readonly useful: boolean;
  readonly runtime: boolean;
  readonly generated: boolean;
  readonly unknown: boolean;
  readonly truncated: boolean;
  readonly diagnostics: boolean;
  readonly optimizedOut: boolean;
}

/** Conservative stack evidence; it does not assign time or cost shares. */
export function inspectStack(text: string, platform: string): StackQuality {
  const frames = text
    .split("\n")
    .filter((line) =>
      platform === "linux"
        ? /^#\d+\s/u.test(line)
        : /^\s+[+!:|\s]*\d+\s+.*(?:\(|\[)/u.test(line),
    );
  const symbols = frames.map((line) => {
    // Capture only the symbol field, before arguments, image or source paths.
    const match =
      platform === "linux"
        ? /^#\d+\s+(?:0x[\da-f]+\s+in\s+)?([\w.$]+)(?=\s|\()/iu.exec(line)
        : /^\s+[+!:|\s]*\d+\s+([\w.$]+)(?=\s+\(in\s)/u.exec(line);
    return (match?.[1] ?? "")
      .replace(/\.(?:isra|constprop|part|llvm)\.[\da-f]+$/u, "")
      .replace(/^_oseo_/u, "oseo_");
  });
  // Native body units prefix generated functions with their source filename.
  // Dispatch/fragment/agent wrappers also originate in backend-c, while
  // oseo_generated_* helpers are defined in runtime-c and remain runtime.
  const generatedBody = new RegExp(
    "^(?:[\\w]+_)?oseo_(?:function_(?:\\d+|script|instantiate|evaluate)|" +
      "generator_body_\\d+\\w*|body_\\w+)$",
    "u",
  );
  const generatedWrapper = new RegExp(
    "^oseo_(?:dispatch_(?:function|generator)|fragment_location|" +
      "(?:case|harness)_(?:instantiate|evaluate|dispatch|resume)|" +
      "agent_program_\\d+)$",
    "u",
  );
  const generatedSymbol = (symbol: string): boolean =>
    generatedBody.test(symbol) || generatedWrapper.test(symbol);
  const runtime = symbols.some(
    (symbol) => /^oseo_\w+$/u.test(symbol) && !generatedSymbol(symbol),
  );
  const generated = symbols.some(generatedSymbol);
  const unknown = /\?\?|<unknown>|unresolved|unknown frame/iu.test(text);
  const truncated = /#15\s|truncat|incomplete stack/iu.test(text);
  const diagnostics =
    /lost samples|dropped samples|permission denied|failed to|unable to/iu.test(
      text,
    );
  return {
    useful:
      generated && frames.length >= 2 && !unknown && !truncated && !diagnostics,
    runtime,
    generated,
    unknown,
    truncated,
    diagnostics,
    optimizedOut: /<optimized out>/u.test(text),
  };
}

/** Capture eight stops of an existing file, without rebuilding or timing it. */
export async function captureArtifact(
  value: CaptureRequest,
  directory: string,
  providedChecker?: CaptureStdoutChecker,
): Promise<boolean> {
  const request = validateCaptureRequest(structuredClone(value));
  const checker = providedChecker == null ? undefined : { ...providedChecker };
  mkdirSync(directory);
  writeJson(join(directory, "request.json"), request);
  const session = new ProfilingSession();
  const commands: RunRecord[] = [];
  const execute = async (
    name: string,
    argv: readonly string[],
    timeoutMs = 20_000,
  ): Promise<RunRecord> => {
    const run = session.launch(
      directory,
      name,
      argv,
      process.cwd(),
      { PATH: process.env.PATH ?? "" },
      Buffer.alloc(0),
      timeoutMs,
    );
    const record = await run.done;
    commands.push(record);
    return record;
  };
  let sourceBefore: RunRecord[] = [];
  let sourceAfter: RunRecord[] = [];
  const inspectSource = async (phase: string): Promise<RunRecord[]> => [
    await execute(`source-${phase}-head`, [
      "git",
      "rev-parse",
      "HEAD",
      "HEAD^{tree}",
    ]),
    await execute(`source-${phase}-dirty`, ["git", "status", "--porcelain"]),
  ];
  let accepted = false;
  let failure: string | null = null;
  let targetCorrect: boolean | null = null;
  const captures: {
    readonly index: number;
    readonly status: string;
    readonly record?: RunRecord;
    readonly stack?: StackQuality;
    readonly processMatches?: boolean;
  }[] = [];
  let before: ReturnType<typeof fileIdentity>[] = [];
  let after: ReturnType<typeof fileIdentity>[] = [];
  try {
    sourceBefore = await inspectSource("before");
    if (!sourceBefore.every(goodRun))
      throw new Error("Unknown source identity");
    const discovery = await discoverProfilingTools(
      join(directory, "discovery"),
      session,
    );
    if (!JSON.parse(discovery).completed) {
      throw new Error("Discovery interrupted or cleanup incomplete");
    }
    if (
      !(
        (process.platform === "linux" && process.arch === "x64") ||
        (process.platform === "darwin" && process.arch === "arm64")
      )
    ) {
      throw new Error("Requires native Linux x64 or macOS arm64 host");
    }
    const paths = [
      request.executable,
      ...request.inputs.map((input) => input.path),
    ];
    before = paths.map(fileIdentity);
    const expected = [
      request.sha256,
      ...request.inputs.map((input) => input.sha256),
    ];
    if (before.some((entry, index) => entry.sha256 !== expected[index])) {
      throw new Error("Input identity does not match caller's frozen digest");
    }
    writeJson(
      join(directory, "stdout-oracle.json"),
      checker == null
        ? { kind: "exact-bytes", stdoutBase64: request.stdoutBase64 }
        : {
            kind: "caller-checker",
            id: checker.id ?? null,
            sourcePath: checker.sourcePath ?? null,
            declaredSourceSha256: checker.sourceSha256 ?? null,
            actualSourceSha256:
              before.find((entry) => entry.path === checker.sourcePath)
                ?.sha256 ?? null,
            functionSha256: isCheckerFunction(checker.check)
              ? digest(
                  Buffer.from(Function.prototype.toString.call(checker.check)),
                )
              : null,
            semantics: "Caller-owned; digests do not establish correctness",
          },
    );
    if (
      checker != null &&
      (request.kind !== "existing-artifact" ||
        !isString(checker.id) ||
        checker.id.length === 0 ||
        !isCheckerFunction(checker.check) ||
        !request.inputs.some(
          (input) =>
            input.path === checker.sourcePath &&
            input.sha256 === checker.sourceSha256,
        ))
    ) {
      throw new Error("Missing checker function or frozen source identity");
    }
    mkdirSync(join(directory, "files"));
    for (const [index, entry] of before.entries()) {
      copyFileSync(entry.path, join(directory, "files", String(index)));
      chmodSync(join(directory, "files", String(index)), entry.mode);
    }
    writeJson(join(directory, "file-map.json"), before);
    const symbolArgv =
      process.platform === "linux"
        ? [executablePath("readelf") ?? "readelf", "-n", request.executable]
        : ["/usr/bin/dwarfdump", "--uuid", request.executable];
    const symbolsBefore = await execute("symbols-before", symbolArgv);
    const profiler =
      process.platform === "linux"
        ? executablePath("gdb")
        : executablePath("/usr/bin/sample");
    if (profiler == null) throw new Error("Capture tool unavailable");
    const profilerBefore = fileIdentity(profiler);
    writeJson(join(directory, "profiler-before.json"), profilerBefore);
    if (process.platform === "darwin") {
      const help =
        readFileSync(join(directory, "discovery", "9.stderr"), "utf8") +
        readFileSync(join(directory, "discovery", "9.stdout"), "utf8");
      if (
        !/duration/iu.test(help) ||
        !/interval/iu.test(help) ||
        !/-file/u.test(help)
      ) {
        throw new Error(
          "Installed sample help does not confirm capture syntax",
        );
      }
    }
    const startTarget = (name: string): OwnedRun => {
      const run = session.launch(
        directory,
        name,
        [request.executable, ...request.argv],
        request.cwd,
        request.env,
        Buffer.from(request.stdinBase64, "base64"),
        120_000,
      );
      return run;
    };
    const correctness = (record: RunRecord, name: string): boolean => {
      const stdout = readFileSync(join(directory, record.stdout));
      const stderr = readFileSync(join(directory, record.stderr));
      const processCorrect =
        record.status === request.exitStatus &&
        record.signal == null &&
        record.error == null &&
        !record.timedOut &&
        record.groupGone;
      let outputCorrect = false;
      let checkerError: string | null = null;
      try {
        outputCorrect =
          stderr.toString("base64") === request.stderrBase64 &&
          (checker == null
            ? stdout.toString("base64") === request.stdoutBase64
            : checker.check(stdout) === true);
      } catch (error) {
        checkerError = String(error);
      }
      const correct = processCorrect && outputCorrect;
      writeJson(join(directory, `${name}-check.json`), {
        correct,
        processCorrect,
        outputCorrect,
        checkerError,
        oracle: checker == null ? "exact-bytes" : "caller-checker",
        stdoutSha256: digest(stdout),
        stderrSha256: digest(stderr),
      });
      return correct;
    };
    const preflight = await startTarget("preflight").done;
    const preflightCorrect = correctness(preflight, "preflight");
    writeJson(join(directory, "preflight-role.json"), {
      reason:
        process.platform === "darwin"
          ? "mac-first-execution-discard-in-this-probe"
          : "correctness-only",
      retained: false,
      earlierLaunchHistory: "caller-owned; not inferred",
      correct: preflightCorrect,
    });
    if (!preflightCorrect) throw new Error("Preflight output/status mismatch");
    const target = startTarget("target");
    try {
      await delay(50);
      for (let index = 0; index < 8; index++) {
        if (session.interrupted != null)
          throw new Error(`Interrupted: ${session.interrupted}`);
        if (target.exited() || target.pid == null) {
          captures.push({ index, status: "not-attempted-target-exited" });
          continue;
        }
        let identityMatches = false;
        if (process.platform === "linux") {
          try {
            identityMatches =
              fileIdentity(`/proc/${target.pid}/exe`).sha256 === request.sha256;
          } catch {
            // Exit/attach races are retained as failures, never as samples.
          }
        } else {
          // eslint-disable-next-line no-await-in-loop -- Verify each live PID.
          const ps = await execute(`identity-${index}`, [
            "/bin/ps",
            "-p",
            String(target.pid),
            "-o",
            "comm=",
          ]);
          identityMatches =
            goodRun(ps) &&
            readFileSync(join(directory, ps.stdout), "utf8").trim() ===
              realpathSync(request.executable);
        }
        if (!identityMatches || target.exited()) {
          captures.push({ index, status: "attach-identity-failed" });
          continue;
        }
        const argv =
          process.platform === "linux"
            ? [
                profiler,
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
              ]
            : [
                profiler,
                String(target.pid),
                "1",
                "10",
                "-file",
                join(directory, `sample-${index}.txt`),
              ];
        // eslint-disable-next-line no-await-in-loop -- Captures are serial.
        const record = await execute(
          `capture-${index}`,
          argv,
          process.platform === "linux" ? 5_000 : 20_000,
        );
        let raw = readFileSync(join(directory, record.stdout), "utf8");
        if (process.platform === "darwin") {
          try {
            raw = readFileSync(join(directory, `sample-${index}.txt`), "utf8");
          } catch {
            raw = "";
          }
        }
        const stack = inspectStack(
          raw + "\n" + readFileSync(join(directory, record.stderr), "utf8"),
          process.platform,
        );
        const processMatches =
          process.platform === "linux"
            ? raw.includes(`process ${target.pid}`)
            : new RegExp(`^Process:.*\\[${target.pid}\\]`, "mu").test(raw);
        captures.push({
          index,
          status:
            goodRun(record) && stack.useful && processMatches
              ? "useful-stack"
              : "failed-or-insufficient-stack",
          record,
          stack,
          processMatches,
        });
      }
      const result = await target.done;
      targetCorrect = correctness(result, "target");
      const symbolsAfter = await execute("symbols-after", symbolArgv);
      const profilerAfter = fileIdentity(profiler);
      writeJson(join(directory, "profiler-after.json"), profilerAfter);
      after = paths.map(fileIdentity);
      const unchanged = JSON.stringify(before) === JSON.stringify(after);
      const symbolsUnchanged =
        goodRun(symbolsBefore) &&
        goodRun(symbolsAfter) &&
        readFileSync(join(directory, symbolsBefore.stdout)).equals(
          readFileSync(join(directory, symbolsAfter.stdout)),
        );
      accepted =
        captures.some((capture) => capture.stack?.runtime === true) &&
        captures.length === 8 &&
        captures.every((capture) => capture.status === "useful-stack") &&
        JSON.stringify(profilerBefore) === JSON.stringify(profilerAfter) &&
        targetCorrect &&
        unchanged &&
        symbolsUnchanged;
      if (!accepted)
        failure = "Incomplete capture, correctness or identity evidence";
    } finally {
      target.stop("finally: cleanup owned target");
      await target.done;
    }
  } catch (error) {
    failure = String(error);
  } finally {
    try {
      sourceAfter = await inspectSource("after");
      accepted &&= sourceAfter.every(
        (record, index) =>
          goodRun(record) &&
          readFileSync(join(directory, record.stdout)).equals(
            readFileSync(join(directory, sourceBefore[index]!.stdout)),
          ),
      );
    } catch (error) {
      accepted = false;
      failure ??= String(error);
    }
    const lifetimes = await session.finish();
    accepted &&=
      session.interrupted == null && lifetimes.every((run) => run.groupGone);
    while (captures.length < 8) {
      captures.push({
        index: captures.length,
        status: "not-attempted-after-failure",
      });
    }
    const finalIdentities = [
      request.executable,
      ...request.inputs.map((input) => input.path),
    ].map((path) => {
      try {
        return fileIdentity(path);
      } catch (error) {
        return { path, error: String(error) };
      }
    });
    accepted &&= JSON.stringify(before) === JSON.stringify(finalIdentities);
    if (!accepted) failure ??= "Source identity or owned cleanup incomplete";
    writeJson(join(directory, "capture.json"), {
      kind: request.kind,
      performanceEvidence: false,
      timedArtifactAcceptance: "caller must link to final measurement evidence",
      status: accepted ? "method-probe-passed" : "failed-or-incomplete",
      failure,
      interrupted: session.interrupted,
      host: {
        platform: process.platform,
        architecture: arch(),
        hostname: hostname(),
        release: release(),
      },
      sourceBefore,
      sourceAfter,
      ci: Object.fromEntries(
        [
          "GITHUB_SHA",
          "GITHUB_RUN_ID",
          "GITHUB_RUN_ATTEMPT",
          "GITHUB_JOB",
          "RUNNER_OS",
          "RUNNER_ARCH",
          "RUNNER_NAME",
        ].map((name) => [name, process.env[name] ?? null]),
      ),
      targetCorrect,
      requestedCaptures: 8,
      captures,
      before,
      after,
      finalIdentities,
      commands,
      lifetimes,
      lossCount: null,
      limits:
        "Attach stops are not CPU shares or call counts; escaped " +
        "process groups and uncatchable termination cannot be cleaned here",
    });
  }
  return accepted;
}
