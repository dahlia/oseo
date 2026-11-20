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

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import {
  describeSpawnError,
  isClosedInputError,
  validateProcessStreams,
} from "./spawn-protocol.ts";
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
process.on("message", ({ id, request }: SpawnRequest) => {
  try {
    validateProcessStreams(request);
    // Keep the caller's process group: existing fixture timeout/interrupt
    // supervisors must still kill the helper, command, and descendants.
    const child = spawn(request.command, [...request.args], {
      cwd: request.cwd,
      env: request.environment?.variables,
      stdio: [
        request.input == null && request.inheritStdin ? "inherit" : "pipe",
        request.inheritOutput ? "inherit" : "pipe",
        request.inheritOutput ? "inherit" : "pipe",
      ],
    });
    children.add(child);
    if (
      !request.inheritOutput &&
      (child.stdout == null || child.stderr == null)
    ) {
      throw new Error("Process output pipes are unavailable.");
    }
    const stdout: Uint8Array[] = [];
    const stderr: Uint8Array[] = [];
    let failed = false;
    child.stdout?.on("data", (chunk: Uint8Array) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Uint8Array) => stderr.push(chunk));
    child.stdin?.on("error", (error: NodeJS.ErrnoException) => {
      if (isClosedInputError(error)) return;
      failed = true;
      respond({ id, error: describeSpawnError(error) });
    });
    child.stdin?.end(request.input);
    child.on("error", (error) => {
      failed = true;
      respond({ id, error: describeSpawnError(error) });
    });
    child.on("close", (code) => {
      children.delete(child);
      if (failed) return;
      const observation = {
        exitStatus: code ?? 1,
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8"),
      };
      respond({
        id,
        observation: request.captureBytes
          ? {
              ...observation,
              stdoutBytes: new Uint8Array(Buffer.concat(stdout)),
              stderrBytes: new Uint8Array(Buffer.concat(stderr)),
            }
          : observation,
      });
    });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    respond({ id, error: describeSpawnError(error) });
  }
});
