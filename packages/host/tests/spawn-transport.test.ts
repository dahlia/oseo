/* eslint-disable no-await-in-loop -- Each failure owns one isolated service. */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import test from "node:test";

import type { ProcessRequest } from "@oseo/compiler";
import { createSpawnDelegate } from "../src/spawn-delegate.ts";
import type { SpawnHelper } from "../src/spawn-delegate.ts";
import type { SpawnRequest } from "../src/spawn-protocol.ts";

/** Deterministic IPC transport with observable ownership and failure hooks. */
class FakeHelper extends EventEmitter implements SpawnHelper {
  connected = true;
  referenced = false;
  readonly requests: SpawnRequest[] = [];
  readonly callbacks: ((error: Error | null) => void)[] = [];
  readonly channel = { ref: () => {}, unref: () => {} };
  ref(): void {
    this.referenced = true;
  }
  unref(): void {
    this.referenced = false;
  }
  /**
   * Model Node's parent-initiated disconnect: the helper then exits, but
   * Node emits no `close` because the parent never reads channel EOF.
   */
  disconnect(): void {
    this.connected = false;
    queueMicrotask(() => {
      this.emit("disconnect");
      this.emit("exit", 0, null);
    });
  }
  send(
    request: SpawnRequest,
    callback: (error: Error | null) => void,
  ): boolean {
    this.requests.push(request);
    this.callbacks.push(callback);
    return false;
  }
}

const request: ProcessRequest = {
  command: "fake",
  args: ["one"],
  cwd: ".",
};

test("routes reversed concurrent replies through one helper", async () => {
  const helper = new FakeHelper();
  let starts = 0;
  const service = createSpawnDelegate(() => {
    starts++;
    return helper;
  });
  const calls = Array.from({ length: 8 }, () => service.run(request));
  assert.equal(starts, 1);
  assert.equal(helper.referenced, true);
  for (const sent of helper.requests.toReversed()) {
    helper.emit("message", {
      id: sent.id,
      observation: {
        exitStatus: sent.id,
        stdout: `${sent.id}`.repeat(256 * 1024),
        stderr: "error\0",
      },
    });
  }
  const results = await Promise.all(calls);
  for (const [id, observation] of results.entries()) {
    assert.equal(observation.exitStatus, id);
    assert.equal(observation.stdout, `${id}`.repeat(256 * 1024));
    assert.equal(observation.stderr, "error\0");
  }
  assert.equal(helper.referenced, false);
  await service.close();
  await service.close();
});

test("captures cwd and environment before sending", async () => {
  const helper = new FakeHelper();
  const service = createSpawnDelegate(() => helper);
  const env = { EXPLICIT: "old" };
  const call = service.run({ ...request, environment: { variables: env } });
  env.EXPLICIT = "new";
  assert.deepEqual(
    { ...helper.requests[0]?.request.environment?.variables },
    { EXPLICIT: "old" },
  );
  assert.equal(helper.requests[0]?.request.cwd, resolve("."));
  assert.equal(Object.hasOwn(helper.requests[0] ?? {}, "umask"), false);
  helper.emit("message", {
    id: 0,
    observation: { exitStatus: 0, stdout: "", stderr: "" },
  });
  await call;
  await service.close();
});

test("retains inherited environment and prototype keys", async () => {
  const helper = new FakeHelper();
  const service = createSpawnDelegate(() => helper);
  // SAFETY: This fixture deliberately supplies inherited string entries.
  const variables = Object.create({ INHERITED: "value" }) as Record<
    string,
    string
  >;
  Object.defineProperty(variables, "__proto__", {
    enumerable: true,
    value: "literal",
  });
  const call = service.run({ ...request, environment: { variables } });
  const sent = helper.requests[0]?.request.environment?.variables;
  assert.equal(sent?.INHERITED, "value");
  assert.equal(
    Object.getOwnPropertyDescriptor(sent, "__proto__")?.value,
    "literal",
  );
  helper.emit("message", {
    id: 0,
    observation: { exitStatus: 0, stdout: "", stderr: "" },
  });
  await call;
  await service.close();
});

test("drains requests and rejects new work while closing", async () => {
  const helper = new FakeHelper();
  const service = createSpawnDelegate(() => helper);
  const call = service.run(request);
  const closing = service.close();
  assert.equal(helper.connected, true);
  await assert.rejects(service.run(request), /closed/u);
  helper.emit("message", {
    id: 0,
    observation: { exitStatus: 1, stdout: "partial", stderr: "signal" },
  });
  assert.equal((await call).stdout, "partial");
  await closing;
  assert.equal(helper.connected, false);
});

test("command errors retain metadata and allow later work", async () => {
  const helper = new FakeHelper();
  const service = createSpawnDelegate(() => helper);
  const call = service.run(request);
  helper.emit("message", {
    id: 0,
    error: {
      name: "TypeError",
      message: "bad argument",
      code: "ERR_INVALID_ARG_VALUE",
      errno: -2,
      path: "fake",
      syscall: "spawn fake",
      spawnargs: ["one"],
    },
  });
  await assert.rejects(call, {
    name: "TypeError",
    message: "bad argument",
    code: "ERR_INVALID_ARG_VALUE",
    errno: -2,
    path: "fake",
    syscall: "spawn fake",
    spawnargs: ["one"],
  });
  const next = service.run(request);
  helper.emit("message", {
    id: 1,
    observation: { exitStatus: 0, stdout: "ok", stderr: "" },
  });
  assert.equal((await next).stdout, "ok");
  await service.close();
});

test("terminal helper failures reject work without replay", async () => {
  for (const mode of [
    "error",
    "close",
    "disconnect",
    "send",
    "null",
    "unknown",
  ]) {
    const helper = new FakeHelper();
    const service = createSpawnDelegate(() => helper);
    const calls = [service.run(request), service.run(request)];
    if (mode === "error") helper.emit("error", new Error("failed"));
    else if (mode === "close") helper.emit("close", 9, "SIGKILL");
    else if (mode === "disconnect") helper.emit("disconnect");
    else if (mode === "send") helper.callbacks[0]?.(new Error("write failed"));
    else
      helper.emit(
        "message",
        mode === "null"
          ? null
          : {
              id: -1,
              observation: { exitStatus: 0, stdout: "", stderr: "" },
            },
      );
    await Promise.all(calls.map(async (call) => await assert.rejects(call)));
    await assert.rejects(service.run(request));
    assert.equal(helper.requests.length, 2);
    await service.close();
  }
});

test("construction and send errors reject safely", async () => {
  const failed = createSpawnDelegate(() => {
    throw new Error("start failed");
  });
  await assert.rejects(failed.run(request), /start failed/u);
  await failed.close();
  class BrokenHelper extends FakeHelper {
    override send(): never {
      throw new Error("send failed");
    }
  }
  const helper = new BrokenHelper();
  const service = createSpawnDelegate(() => helper);
  await assert.rejects(service.run(request), /send failed/u);
  await service.close();
});
