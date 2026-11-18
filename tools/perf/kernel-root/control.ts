import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  watch,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileIdentity } from "../../perf-profile-capture.ts";
import type { FileIdentity } from "../../perf-profile-capture.ts";
import type {
  BoundaryProof,
  ComparisonRequest,
  WindowBounds,
} from "../ordered-comparison.ts";
import { requireKernelDirectory } from "./source.ts";

/** Direct owned parent/child data, without a NativeContext or signed origin. */
export interface KernelControl {
  readonly sequence: number;
  readonly childPid: number;
  readonly parentPid: number;
  readonly phase: string;
  readonly request: ComparisonRequest;
  readonly bounds: WindowBounds | null;
  readonly failure: string | null;
}

const frameLimit = 65_536;
const partLimit = 32_768;

interface ControlParts {
  readonly kernelControlTransport: "parts-v1";
  readonly bytes: number;
  readonly sha256: string;
  readonly parts: readonly FileIdentity[];
}

function publish(path: string, bytes: Uint8Array): void {
  const temporary = `${path}.partial-${process.pid}`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    lstatSync(path);
    assert.fail("Control destination already exists");
  } catch (error) {
    assert.ok(error instanceof Error && "code" in error);
    assert.equal(error.code, "ENOENT");
  }
  renameSync(temporary, path);
}

/** Child allocations retain their original hash-bound, non-frame format. */
export function writeKernelAllocation<Value>(path: string, value: Value): void {
  publish(path, Buffer.from(JSON.stringify(value) + "\n"));
}

/** Publish bounded pinned parts before their atomic private control frame. */
export function writeKernelControl<Value>(path: string, value: Value): void {
  const bytes = Buffer.from(JSON.stringify(value) + "\n");
  if (bytes.length <= frameLimit) {
    publish(path, bytes);
    return;
  }
  const parts: FileIdentity[] = [];
  for (let offset = 0; offset < bytes.length; offset += partLimit) {
    const name = `${path}.part-${String(parts.length).padStart(6, "0")}`;
    publish(name, bytes.subarray(offset, offset + partLimit));
    parts.push(fileIdentity(name));
  }
  const transport: ControlParts = {
    kernelControlTransport: "parts-v1",
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    parts,
  };
  const frame = Buffer.from(JSON.stringify(transport) + "\n");
  assert.ok(frame.length <= frameLimit);
  publish(path, frame);
}

function readFrame(path: string): Buffer {
  const pin = fileIdentity(path);
  assert.equal(pin.realpath, path);
  assert.equal(pin.mode, 0o600);
  assert.equal(lstatSync(path).uid, process.getuid!());
  assert.ok(pin.bytes <= frameLimit);
  const bytes = readFileSync(path);
  assert.deepEqual(fileIdentity(path), pin);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), pin.sha256);
  return bytes;
}

/** Detect only the private envelope marker; its fields are checked on read. */
function hasParts<Candidate>(
  value: Candidate,
): value is Candidate & ControlParts {
  return (
    value != null &&
    typeof value === "object" &&
    "kernelControlTransport" in value
  );
}

/** Replay every original payload byte without enlarging any control frame. */
export function readKernelControl<Value>(path: string): Value {
  const bytes = readFrame(path);
  // SAFETY: the codec binds bytes; phase schemas remain the caller's duty.
  const value: unknown = JSON.parse(bytes.toString("utf8"));
  if (hasParts(value)) {
    const transport = value;
    assert.equal(transport.kernelControlTransport, "parts-v1");
    assert.ok(Number.isSafeInteger(transport.bytes));
    assert.ok(transport.bytes > frameLimit);
    assert.ok(Array.isArray(transport.parts));
    assert.equal(
      transport.parts.length,
      Math.ceil(transport.bytes / partLimit),
    );
    const parts = transport.parts.map((pin, index) => {
      assert.equal(pin.path, `${path}.part-${String(index).padStart(6, "0")}`);
      assert.deepEqual(fileIdentity(pin.path), pin);
      const part = readFrame(pin.path);
      assert.equal(
        part.length,
        Math.min(partLimit, transport.bytes - index * partLimit),
      );
      assert.equal(createHash("sha256").update(part).digest("hex"), pin.sha256);
      return part;
    });
    const payload = Buffer.concat(parts);
    assert.equal(payload.length, transport.bytes);
    assert.equal(
      createHash("sha256").update(payload).digest("hex"),
      transport.sha256,
    );
    assert.deepEqual(readFrame(path), bytes);
    // SAFETY: same original JSON codec after complete transitive replay.
    return JSON.parse(payload.toString("utf8")) as Value;
  }
  // SAFETY: unframed original JSON; the caller validates its phase schema.
  return value as Value;
}

/**
 * Read one JSON original that S or P published whole. S writes its samples,
 * probe records and finish.json this way; P writes its discovery bundle and
 * each command record. Neither uses the parts codec, so a valid long S run,
 * or a P bundle carrying base64 tool output, may exceed the control frame
 * ceiling. That ceiling does not apply here, and a parts marker is refused
 * rather than decoded. Owner, mode, canonical path, file type and stable
 * bytes are checked as for a frame; the caller still owns the schema.
 */
export function readKernelOriginalJson<Value>(path: string): Value {
  const before = lstatSync(path);
  assert.ok(before.isFile(), "Whole JSON original is not a regular file");
  assert.equal(before.uid, process.getuid!());
  const pin = fileIdentity(path);
  assert.equal(pin.realpath, path);
  assert.equal(pin.mode, 0o600);
  const bytes = readFileSync(path);
  assert.deepEqual(fileIdentity(path), pin);
  const after = lstatSync(path);
  assert.equal(after.dev, before.dev);
  assert.equal(after.ino, before.ino);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), pin.sha256);
  const value: unknown = JSON.parse(bytes.toString("utf8"));
  assert.equal(
    hasParts(value),
    false,
    "Whole JSON original carries a parts frame",
  );
  // SAFETY: a whole S or P original; the caller validates its schema.
  return value as Value;
}

/** Watch atomic publication; cancellation and the assigned deadline fail. */
export async function waitKernelControl<Value>(
  directory: string,
  name: string,
  responseMs: number | null,
  signal: AbortSignal,
): Promise<Value> {
  requireKernelDirectory(directory);
  assert.ok(
    responseMs == null || (Number.isSafeInteger(responseMs) && responseMs > 0),
  );
  return new Promise<Value>((resolve, reject) => {
    let settled = false;
    const complete = (failure?: Error): void => {
      if (settled) return;
      if (failure != null) {
        settled = true;
        cleanup();
        reject(failure);
        return;
      }
      try {
        const value = readKernelControl<Value>(join(directory, name));
        settled = true;
        cleanup();
        resolve(value);
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          )
        ) {
          complete(error instanceof Error ? error : new Error(String(error)));
        }
      }
    };
    const watcher = watch(directory, () => complete());
    const timer =
      responseMs == null
        ? undefined
        : setTimeout(
            () => complete(new Error("Kernel control deadline")),
            responseMs,
          );
    const aborted = () =>
      complete(new Error(String(signal.reason ?? "Parent channel lost")));
    const cleanup = (): void => {
      watcher.close();
      clearTimeout(timer);
      signal.removeEventListener("abort", aborted);
    };
    watcher.on("error", (error) => complete(error));
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
    else complete();
  });
}

/** The response echoes the complete original request before its H proof. */
export interface KernelResponse {
  readonly control: KernelControl;
  readonly proof: BoundaryProof;
}
