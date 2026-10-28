import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { describeSpawnError } from "./spawn-protocol.ts";
import type { SpawnRequest, SpawnResponse } from "./spawn-protocol.ts";

// This process deliberately imports no compiler implementation. Its small
// address space, rather than a thread in the compiler, owns fork/exec work.
const children = new Set<ChildProcess>();

function disconnect(): void {
  for (const child of children) child.kill("SIGKILL");
  if (process.connected) process.disconnect();
}

function respond(response: SpawnResponse): void {
  if (!process.connected) return;
  process.send?.(response, (error: Error | null) => {
    if (error != null) disconnect();
  });
}

process.on("disconnect", disconnect);
process.on("message", ({ id, request, umask }: SpawnRequest) => {
  try {
    process.umask(umask);
    // Keep the caller's process group: existing fixture timeout/interrupt
    // supervisors must still kill the helper, command, and descendants.
    const child = spawn(request.command, [...request.args], {
      cwd: request.cwd,
      env: request.environment?.variables,
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.add(child);
    const stdout: Uint8Array[] = [];
    const stderr: Uint8Array[] = [];
    let failed = false;
    child.stdout.on("data", (chunk: Uint8Array) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Uint8Array) => stderr.push(chunk));
    child.on("error", (error) => {
      failed = true;
      respond({ id, error: describeSpawnError(error) });
    });
    child.on("close", (code) => {
      children.delete(child);
      if (failed) return;
      respond({
        id,
        observation: {
          exitStatus: code ?? 1,
          stderr: Buffer.concat(stderr).toString("utf8"),
          stdout: Buffer.concat(stdout).toString("utf8"),
        },
      });
    });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    respond({ id, error: describeSpawnError(error) });
  }
});
