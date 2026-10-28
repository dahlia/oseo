import { Worker } from "node:worker_threads";
import type { Transferable } from "node:worker_threads";
import type {
  EmittedScriptFragments,
  FragmentSourceMap,
} from "../packages/backend-c/src/index.ts";
import type {
  HarnessFragment,
  ScriptFragment,
} from "../packages/compiler/src/index.ts";
import { isFragmentEmissionResponse } from "./test262-emission-protocol.ts";
import type {
  FragmentEmissionRequest,
  FragmentEmissionResponse,
} from "./test262-emission-protocol.ts";

/** Minimal worker boundary, injectable for lifecycle and transport tests. */
export interface FragmentEmissionWorker {
  on(
    event: "message",
    listener: (message: FragmentEmissionResponse) => void,
  ): void;
  on(event: "error" | "messageerror", listener: (error: Error) => void): void;
  on(event: "exit", listener: (code: number) => void): void;
  postMessage(
    request: FragmentEmissionRequest,
    transfer: readonly Transferable[],
  ): void;
  ref(): void;
  unref(): void;
  terminate(): Promise<number>;
}

/** Caller-owned emission service; closing rejects all outstanding work. */
export interface Test262FragmentEmitter {
  emit(
    harness: HarnessFragment,
    body: ScriptFragment,
    mapping: FragmentSourceMap,
  ): Promise<EmittedScriptFragments>;
  close(): Promise<void>;
}

/** Completion owned by one request until a reply or terminal failure. */
interface PendingEmission {
  readonly resolve: (result: EmittedScriptFragments) => void;
  readonly reject: (error: Error) => void;
}

/**
 * Reuse one independent backend heap without keeping an idle runner alive.
 * Worker failures are terminal: falling back could hide operational faults.
 */
export function createTest262FragmentEmitter(
  createWorker: () => FragmentEmissionWorker = () => {
    const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
    return new Worker(
      new URL(`./test262-emission-worker.${extension}`, import.meta.url),
    );
  },
): Test262FragmentEmitter {
  const pending = new Map<number, PendingEmission>();
  let worker: FragmentEmissionWorker | undefined;
  let failure: Error | undefined;
  let sequence = 0;
  let closing: Promise<void> | undefined;
  let termination: Promise<void> | undefined;
  const terminate = (): Promise<void> => {
    termination ??= Promise.resolve().then(async () => {
      await worker?.terminate();
    });
    // A terminal transport failure already rejects every pending request.
    // close() still exposes a termination failure to explicit owners.
    void termination.catch(() => {});
    return termination;
  };
  const fail = (error: Error): void => {
    failure ??= error;
    for (const item of pending.values()) item.reject(failure);
    pending.clear();
    worker?.unref();
    void terminate();
  };
  const initialize = (): FragmentEmissionWorker => {
    if (worker != null) return worker;
    const created = createWorker();
    worker = created;
    created.on("message", (message) => {
      if (!isFragmentEmissionResponse(message)) {
        fail(new Error("Malformed fragment emission response."));
        return;
      }
      const item = pending.get(message.id);
      if (item == null) {
        fail(new Error("Unexpected fragment emission response."));
        return;
      }
      pending.delete(message.id);
      if ("error" in message) item.reject(message.error);
      else item.resolve(message.result);
      if (pending.size === 0) created.unref();
    });
    created.on("error", fail);
    created.on("messageerror", fail);
    created.on("exit", (code) => {
      fail(new Error(`Fragment emission worker exited (${code}).`));
    });
    created.unref();
    return created;
  };
  return {
    emit(harness, body, mapping) {
      if (failure != null) return Promise.reject(failure);
      return new Promise((resolve, reject) => {
        try {
          const active = initialize();
          const id = sequence++;
          pending.set(id, { resolve, reject });
          active.ref();
          // The IR is cloned, never transferred; a Worker has no origin.
          active.postMessage({ id, harness, body, mapping }, []);
        } catch (error) {
          fail(
            error instanceof Error
              ? error
              : new Error("Fragment worker request failed.", { cause: error }),
          );
          // Creation can fail before the promise enters the pending map.
          reject(failure);
        }
      });
    },
    close() {
      closing ??= (async () => {
        fail(new Error("Fragment emitter is closed."));
        await terminate();
      })();
      return closing;
    },
  };
}
