import type { ProcessObservation, ProcessRequest } from "@oseo/compiler";

/** A request owns its environment snapshot, even when the parent changes it. */
export interface SpawnRequest {
  readonly id: number;
  readonly request: ProcessRequest;
  readonly umask: number;
}

/** Preserve the observable fields of Node's spawn and argument errors. */
export interface SpawnError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string | undefined;
  readonly code?: string | undefined;
  readonly errno?: number | undefined;
  readonly syscall?: string | undefined;
  readonly path?: string | undefined;
  readonly spawnargs?: readonly string[] | undefined;
}

/** Responses are sent only after both child output pipes have closed. */
export type SpawnResponse =
  | { readonly id: number; readonly observation: ProcessObservation }
  | { readonly id: number; readonly error: SpawnError };

/** Reject malformed IPC before accessing a completion or resolving callers. */
export function isSpawnResponse<T>(value: T): value is T & SpawnResponse {
  if (
    value == null ||
    typeof value !== "object" ||
    !("id" in value) ||
    !Number.isSafeInteger(value.id)
  )
    return false;
  if ("error" in value) {
    const error = value.error;
    return (
      error != null &&
      typeof error === "object" &&
      "name" in error &&
      typeof error.name === "string" &&
      "message" in error &&
      typeof error.message === "string"
    );
  }
  if (!("observation" in value)) return false;
  const observation = value.observation;
  return (
    observation != null &&
    typeof observation === "object" &&
    "exitStatus" in observation &&
    Number.isInteger(observation.exitStatus) &&
    "stdout" in observation &&
    typeof observation.stdout === "string" &&
    "stderr" in observation &&
    typeof observation.stderr === "string"
  );
}

/** Copy error metadata across IPC without losing Node's error codes. */
export function describeSpawnError(error: Error): SpawnError {
  // SAFETY: Node adds optional spawn metadata to ordinary Error instances.
  const details = error as Error &
    NodeJS.ErrnoException & {
      readonly spawnargs?: readonly string[];
      readonly path?: string;
    };
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: details.code,
    errno: details.errno,
    syscall: details.syscall,
    path: details.path,
    spawnargs: details.spawnargs,
  };
}

/** Rebuild the rejection that direct spawn would expose to the caller. */
export function restoreSpawnError(details: SpawnError): Error {
  const error =
    details.name === "TypeError"
      ? new TypeError(details.message)
      : details.name === "RangeError"
        ? new RangeError(details.message)
        : new Error(details.message);
  for (const [key, value] of Object.entries(details)) {
    if (key === "name" && value === error.name) continue;
    if (value !== undefined)
      Object.defineProperty(error, key, {
        configurable: true,
        enumerable: key !== "message" && key !== "stack",
        value,
        writable: true,
      });
  }
  return error;
}
