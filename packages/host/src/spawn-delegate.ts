import { fork } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { EventEmitter } from "node:events";
import { resolve as resolvePath } from "node:path";
import type { ProcessObservation, ProcessRequest } from "@oseo/compiler";
import { isSpawnResponse, restoreSpawnError } from "./spawn-protocol.ts";
import type { SpawnRequest } from "./spawn-protocol.ts";

/** The IPC surface used by the delegate, also implemented by test helpers. */
export interface SpawnHelper extends EventEmitter {
  readonly connected: boolean;
  /** Absent after a failed process creation, which emits no `exit`. */
  readonly pid?: number | undefined;
  readonly channel?:
    | {
        ref(): void;
        unref(): void;
      }
    | null
    | undefined;
  ref(): void;
  unref(): void;
  disconnect(): void;
  send(request: SpawnRequest, callback: (error: Error | null) => void): boolean;
}

/** One completion retained until the helper closes the command's pipes. */
interface PendingSpawn {
  readonly resolve: (observation: ProcessObservation) => void;
  readonly reject: (error: Error) => void;
}

/** Match spawn's enumerable environment selection, including inherited keys. */
function snapshotEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  // SAFETY: A null prototype also retains an own '__proto__' environment key.
  const snapshot = Object.create(null) as Record<string, string>;
  for (const name in environment) {
    const value = environment[name];
    if (value != null) snapshot[name] = value;
  }
  return snapshot;
}

/** Host-local spawn service; closing drains requests and releases its IPC. */
export interface SpawnDelegate {
  run(request: ProcessRequest): Promise<ProcessObservation>;
  close(): Promise<void>;
}

/** Start a small Node process without the runner's preload or CLI arguments. */
export function startSpawnHelper(): ChildProcess {
  const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
  return fork(new URL(`./spawn-helper.${extension}`, import.meta.url), [], {
    env: { ...process.env, NODE_OPTIONS: undefined },
    execArgv: [],
    serialization: "advanced",
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
}

/**
 * Multiplex requests without retrying a command after an uncertain failure.
 * Idle IPC is unreferenced so an unused host cannot keep the runner alive.
 * The factory is injectable to exercise helper failures without module mocks.
 */
export function createSpawnDelegate(
  start: () => SpawnHelper = startSpawnHelper,
): SpawnDelegate {
  const pending = new Map<number, PendingSpawn>();
  let child: SpawnHelper | undefined;
  let failure: Error | undefined;
  let closing = false;
  let nextId = 0;
  let closed: Promise<void> | undefined;
  let markClosed: (() => void) | undefined;

  function releaseWhenIdle(): void {
    if (child == null || pending.size > 0) return;
    if (closing && child.connected) child.disconnect();
    if (!closing) {
      child.unref();
      child.channel?.unref();
    }
  }

  function fail(error: Error): void {
    failure ??= error;
    for (const request of pending.values()) request.reject(failure);
    pending.clear();
    // A broken service must not leave a live IPC channel holding the parent.
    if (child?.connected) child.disconnect();
    releaseWhenIdle();
  }

  function helper(): SpawnHelper {
    if (child != null) return child;
    try {
      child = start();
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      fail(error);
      throw error;
    }
    const service = child;
    let exited = false;
    closed = new Promise((resolve) => {
      markClosed = resolve;
    });
    // Node emits `close` only when the channel reaches EOF in the parent.
    // After the parent calls `disconnect()` itself, the helper's exit
    // never produces `close`, so completion is `exit` plus a closed channel.
    function settleWhenGone(): void {
      if (exited && !service.connected) markClosed?.();
    }
    service.on("error", (error: Error) => {
      if (service.pid == null) exited = true;
      fail(error);
      settleWhenGone();
    });
    service.on("disconnect", () => {
      // Channel EOF follows every message the helper wrote, so pending
      // requests here have no response and must not be replayed.
      if (!closing || pending.size > 0) {
        fail(new Error("Spawn helper disconnected."));
      }
      settleWhenGone();
    });
    service.on("message", (response) => {
      if (!isSpawnResponse(response)) {
        fail(new Error("Spawn helper returned a malformed response."));
        return;
      }
      const completion = pending.get(response.id);
      if (completion == null) {
        fail(new Error("Spawn helper returned an unknown request."));
        return;
      }
      pending.delete(response.id);
      if ("error" in response) {
        completion.reject(restoreSpawnError(response.error));
      } else {
        completion.resolve(response.observation);
      }
      releaseWhenIdle();
    });
    service.on("exit", () => {
      // Failure waits for `disconnect`: buffered responses precede EOF.
      exited = true;
      settleWhenGone();
    });
    service.on("close", (code, signal) => {
      exited = true;
      if (!closing || pending.size > 0) {
        fail(
          new Error(`Spawn helper closed (status ${code}, signal ${signal}).`),
        );
      }
      settleWhenGone();
    });
    return child;
  }

  return {
    async run(request) {
      if (failure != null) throw failure;
      if (closing) throw new Error("Spawn delegate is closed.");
      const service = helper();
      service.ref();
      service.channel?.ref();
      const id = nextId++;
      return await new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try {
          service.send(
            {
              id,
              umask: process.umask(),
              request: {
                ...request,
                cwd: resolvePath(request.cwd),
                environment: {
                  variables: snapshotEnvironment(
                    request.environment?.variables ?? process.env,
                  ),
                },
              },
            },
            (error: Error | null) => {
              if (error != null) fail(error);
            },
          );
        } catch (error) {
          if (!(error instanceof Error)) throw error;
          fail(error);
        }
      });
    },
    async close() {
      closing = true;
      child?.ref();
      child?.channel?.ref();
      releaseWhenIdle();
      await closed;
    },
  };
}
