import { spawnSync } from "node:child_process";
import { run } from "node:test";
import { spec } from "node:test/reporters";

const concurrency = Number(process.argv[2]);
const files = process.argv.slice(3);
if (
  !Number.isSafeInteger(concurrency) ||
  concurrency < 1 ||
  files.length === 0
) {
  throw new Error(
    "Native shard runner requires concurrency and explicit files.",
  );
}
// Node's CLI sorts file arguments. The API keeps this measured-cost order.
const controller = new AbortController();
const interruptGraceMs = 2_000;
const processListMaxBuffer = 16 * 1024 * 1024;
let interrupted: NodeJS.Signals | undefined;
let escalationTimer: ReturnType<typeof setTimeout> | undefined;
const reportedEscalationErrors = new Set<string>();
function restoreSignals(): void {
  for (const [signal, forward] of Object.entries(forwarders)) {
    process.removeListener(signal, forward);
  }
}
function interrupt(signal: NodeJS.Signals): void {
  if (interrupted != null) {
    // Preserve force-interrupt behavior if a child ignores graceful abort.
    restoreSignals();
    process.kill(process.pid, signal);
    return;
  }
  interrupted = signal;
  // Let file processes finish normal cleanup before forcing cancellation.
  escalationTimer = setTimeout(killFileChildren, interruptGraceMs);
  controller.abort();
}
const forwarders = {
  SIGINT: () => interrupt("SIGINT"),
  SIGTERM: () => interrupt("SIGTERM"),
};
for (const [signal, forward] of Object.entries(forwarders)) {
  process.on(signal, forward);
}
function hasLiveChildren(): boolean {
  // Aborting node:test can end its stream before its file processes exit.
  // This Node-only wrapper observes each file until Node reaps it.
  return process.getActiveResourcesInfo().includes("ProcessWrap");
}
function reportEscalationError(error: Error): void {
  if (reportedEscalationErrors.has(error.message)) return;
  reportedEscalationErrors.add(error.message);
  console.error(error);
}
function listFileChildrenWithPs(): readonly number[] {
  // Portable ps has no common parent filter on Linux and macOS. Restrict
  // its output to PID columns, and cap the full process-list read.
  const result = spawnSync("ps", ["-A", "-o", "pid=", "-o", "ppid="], {
    encoding: "utf8",
    maxBuffer: processListMaxBuffer,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.pid == null) {
    throw new Error(`Could not list test processes: ${result.stderr}`);
  }
  const children: number[] = [];
  let parsedRows = 0;
  for (const line of result.stdout.split("\n")) {
    if (line.trim() === "") continue;
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (!match) throw new Error(`Unexpected ps output: ${line}`);
    parsedRows++;
    const pid = Number(match[1]);
    const parentPid = Number(match[2]);
    if (parentPid === process.pid && pid !== result.pid) children.push(pid);
  }
  if (parsedRows === 0) throw new Error("ps returned no process rows.");
  return children;
}
function listFileChildrenWithPgrep(): readonly number[] {
  // pgrep -P selects only immediate children on both supported hosts.
  const result = spawnSync("pgrep", ["-P", String(process.pid)], {
    encoding: "utf8",
    maxBuffer: processListMaxBuffer,
  });
  if (result.error) throw result.error;
  if (result.status === 1 && result.stdout.trim() === "") return [];
  if (result.status !== 0 || result.pid == null) {
    throw new Error(`Could not find test processes: ${result.stderr}`);
  }
  const children: number[] = [];
  for (const line of result.stdout.split("\n")) {
    if (line.trim() === "") continue;
    if (!/^\d+$/.test(line)) {
      throw new Error(`Unexpected pgrep output: ${line}`);
    }
    const pid = Number(line);
    if (pid !== result.pid) children.push(pid);
  }
  if (children.length === 0) {
    throw new Error("pgrep returned no process rows.");
  }
  return children;
}
function killFileChildren(): void {
  if (!hasLiveChildren()) return;
  let children: readonly number[] = [];
  try {
    children = listFileChildrenWithPs();
  } catch (psError) {
    try {
      children = listFileChildrenWithPgrep();
    } catch (pgrepError) {
      // Never re-raise while Node still owns a live file process. Retry
      // enumeration; a second signal or the CI runner can force exit.
      reportEscalationError(
        new Error("Cannot enumerate test-file children", {
          cause: { psError, pgrepError },
        }),
      );
    }
  }
  // Only node:test file processes remain, apart from temporary probes.
  // SIGKILL can orphan a file's own children; only file children are reaped.
  for (const pid of children) {
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ESRCH")
      )
        reportEscalationError(
          error instanceof Error ? error : new Error(String(error)),
        );
    }
  }
  if (hasLiveChildren()) escalationTimer = setTimeout(killFileChildren, 100);
}
function finishInterrupt(): void {
  if (hasLiveChildren()) {
    // A single signal waits; a second one forces exit through interrupt().
    setTimeout(finishInterrupt, 10);
    return;
  }
  if (escalationTimer != null) clearTimeout(escalationTimer);
  restoreSignals();
  process.kill(process.pid, interrupted);
}
const stream = run({ files, concurrency, signal: controller.signal });
stream.on("end", () => {
  if (interrupted == null) restoreSignals();
  else finishInterrupt();
});
stream.on("test:fail", () => {
  process.exitCode = 1;
});
stream.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
stream.compose(new spec()).pipe(process.stdout);
