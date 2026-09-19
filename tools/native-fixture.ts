import { spawn, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

/** Execution only: compilation retains its separate budget. */
// The heap fixture measured 48.1 s on a shared Linux host. Ten minutes
// leaves over twelve times that elapsed time; this is not a compile limit.
export const nativeFixtureTimeout = 600_000;
const diagnosticBudget = 5_000;
const outputLimit = 16 * 1024 * 1024;

interface FixtureOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly input?: string | undefined;
  readonly timeout?: number;
  readonly encoding?: "utf8" | "base64";
  readonly maxBuffer?: number;
}

interface FixtureResult {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: Error;
}

/**
 * A separate event loop can sample a stuck fixture before killing it even
 * when the test's caller is synchronous. No shell or external watchdog is
 * needed. Output and diagnostics travel through the supervisor's stderr on
 * failure so the test runner retains them in CI logs.
 */
export function runNativeFixture(
  command: string,
  args: readonly string[],
  options: FixtureOptions = {},
): FixtureResult {
  const timeout = options.timeout ?? nativeFixtureTimeout;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error("Fixture timeout must be finite and positive.");
  }
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(import.meta.url),
      ...(options.encoding === "base64" ? ["--base64"] : []),
      String(timeout),
      command,
      ...args,
    ],
    {
      cwd: options.cwd,
      env: options.env,
      input: options.input,
      encoding: "utf8",
      maxBuffer: 3 * (options.maxBuffer ?? outputLimit),
      timeout: timeout + diagnosticBudget + 10_000,
      killSignal: "SIGKILL",
    },
  );
  if (result.error != null || result.status !== 0) {
    throw new Error(
      "Native fixture supervisor failed: " +
        JSON.stringify([command, ...args]) +
        `\n${result.error?.message ?? ""}\n${result.stderr}\n${result.stdout}`,
    );
  }
  // SAFETY: the supervisor below emits this record on successful completion.
  return JSON.parse(result.stdout) as FixtureResult;
}

function sample(pid: number): string {
  if (process.platform === "darwin") {
    const result = spawnSync("/usr/bin/sample", [String(pid), "1", "1"], {
      encoding: "utf8",
      timeout: diagnosticBudget,
      killSignal: "SIGKILL",
      maxBuffer: outputLimit,
    });
    return [
      `sample pid=${pid} status=${result.status} signal=${result.signal}`,
      result.error?.message ?? "",
      result.stdout,
      result.stderr,
    ].join("\n");
  }
  if (process.platform === "linux") {
    const records: string[] = [];
    try {
      for (const tid of readdirSync(`/proc/${pid}/task`)) {
        for (const name of ["status", "wchan", "stack", "syscall"]) {
          const path = `/proc/${pid}/task/${tid}/${name}`;
          try {
            records.push(`${path}:\n${readFileSync(path, "utf8")}`);
          } catch (error) {
            records.push(`${path}: ${String(error)}`);
          }
        }
      }
    } catch (error) {
      records.push(`proc sample unavailable: ${String(error)}`);
    }
    const debuggerRun = spawnSync(
      "gdb",
      [
        "--batch",
        "-nx",
        "-ex",
        "set pagination off",
        "-ex",
        "thread apply all bt",
        "-p",
        String(pid),
      ],
      {
        encoding: "utf8",
        timeout: diagnosticBudget,
        killSignal: "SIGKILL",
        maxBuffer: outputLimit,
      },
    );
    records.push(
      `gdb status=${debuggerRun.status} signal=${debuggerRun.signal}`,
      debuggerRun.error?.message ?? "",
      debuggerRun.stdout ?? "",
      debuggerRun.stderr ?? "",
    );
    return records.join("\n");
  }
  return `Process sampling unavailable on ${process.platform}.`;
}

if (import.meta.main) {
  const binary = process.argv[2] === "--base64";
  const offset = binary ? 1 : 0;
  const timeout = Number(process.argv[2 + offset]);
  const command = process.argv[3 + offset]!;
  const args = process.argv.slice(4 + offset);
  const encoding = binary ? "base64" : "utf8";
  const diagnosticText = (text: string): string =>
    binary ? Buffer.from(text, "base64").toString("utf8") : text;
  const started = performance.now();
  const child = spawn(command, args, {
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let failure: string | undefined;
  let diagnostics = "";
  let finished = false;
  let reapTimer: ReturnType<typeof setTimeout> | undefined;
  const kill = (): void => {
    if (child.pid == null) return;
    try {
      if (process.platform === "win32") child.kill("SIGKILL");
      else process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      diagnostics += `\nkill: ${String(error)}`;
    }
  };
  const finish = (): void => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    clearTimeout(reapTimer);
    for (const [signal, handler] of Object.entries(interruptions)) {
      process.removeListener(signal, handler);
    }
    process.stdin.unpipe(child.stdin);
    process.stdin.pause();
    const result = {
      status: child.exitCode,
      signal: child.signalCode,
      stdout,
      stderr,
    };
    if (failure != null) {
      console.error(
        [
          `Native fixture ${failure}`,
          `command: ${JSON.stringify([command, ...args])}`,
          `elapsed: ${(performance.now() - started).toFixed(1)} ms`,
          `limit: ${timeout} ms; pid: ${child.pid ?? "unavailable"}`,
          `status: ${result.status}; signal: ${result.signal}`,
          `stdin: ${input}`,
          `GC: ${process.env.OSEO_GC_EVERY_SAFEPOINT ?? "unset"}`,
          `stdout:\n${diagnosticText(stdout)}`,
          `stderr:\n${diagnosticText(stderr)}`,
          `sample:\n${diagnostics}`,
        ].join("\n"),
      );
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify(result));
    }
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
    child.unref();
  };
  const stop = (reason: string): void => {
    if (failure != null) return;
    failure = reason;
    if (child.pid != null) diagnostics = sample(child.pid);
    kill();
    reapTimer = setTimeout(finish, 1_000);
  };
  const interruptions = {
    SIGINT: () => stop("interrupted by SIGINT"),
    SIGTERM: () => stop("interrupted by SIGTERM"),
  };
  for (const [signal, handler] of Object.entries(interruptions)) {
    process.on(signal, handler);
  }
  const timer = setTimeout(() => stop("timed out"), timeout);
  let input = "";
  process.stdin.on("data", (chunk: Buffer) => {
    input = (input + chunk.toString()).slice(0, outputLimit);
  });
  process.stdin.pipe(child.stdin);
  child.stdin.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") stop(`stdin failed: ${error.message}`);
  });
  child.stdout.setEncoding(encoding).on("data", (chunk: string) => {
    stdout += chunk;
    if (stdout.length > outputLimit) {
      stdout = stdout.slice(0, outputLimit);
      stop("exceeded stdout limit");
    }
  });
  child.stderr.setEncoding(encoding).on("data", (chunk: string) => {
    stderr += chunk;
    if (stderr.length > outputLimit) {
      stderr = stderr.slice(0, outputLimit);
      stop("exceeded stderr limit");
    }
  });
  child.on("error", (error) => {
    failure = error.message;
  });
  child.on("close", finish);
}
