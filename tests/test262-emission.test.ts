import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { emitScriptFragments } from "../packages/backend-c/src/index.ts";
import {
  compileBodyFragment,
  compileHarnessFragment,
} from "../packages/compiler/src/index.ts";
import type { SpecializationMode } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import {
  createTest262FragmentEmitter,
  type FragmentEmissionWorker,
} from "../tools/test262-emission.ts";
import type {
  FragmentEmissionRequest,
  FragmentEmissionResponse,
} from "../tools/test262-emission-protocol.ts";

/** A controllable worker transport for request ownership and exit tests. */
class FakeWorker extends EventEmitter implements FragmentEmissionWorker {
  readonly requests: FragmentEmissionRequest[] = [];
  referenced = false;
  terminations = 0;
  sendError: Error | undefined;

  postMessage(request: FragmentEmissionRequest): void {
    if (this.sendError != null) throw this.sendError;
    this.requests.push(request);
  }

  ref(): void {
    this.referenced = true;
  }

  unref(): void {
    this.referenced = false;
  }

  terminate(): Promise<number> {
    this.terminations += 1;
    this.emit("exit", 1);
    return Promise.resolve(1);
  }

  respond(response: FragmentEmissionResponse): void {
    this.emit("message", response);
  }
}

function fixture(
  strict = false,
  specialization: SpecializationMode = "enabled",
) {
  const prepared = compileHarnessFragment(
    babelFrontend,
    [{ sourceId: "h.js", source: "var value = -0;" }],
    strict,
    { specialization },
  );
  assert.equal(prepared.kind, "compiled");
  if (prepared.kind !== "compiled") throw new Error("Harness did not compile.");
  const body = compileBodyFragment(babelFrontend, prepared.harness, {
    sourceId: "body.js",
    source: 'console.log(value, 1e999, "한글\\ud800", /a/u);',
  });
  assert.equal(body.kind, "compiled");
  if (body.kind !== "compiled") throw new Error("Body did not compile.");
  return {
    harness: prepared.harness,
    body: body.body,
    mapping: {
      sourceId: "assembled.js",
      harnessLineOffset: 0,
      bodyLineOffset: 1,
    },
  };
}

const input = fixture();
const expected = emitScriptFragments(input.harness, input.body, input.mapping);

function emit(emitter: ReturnType<typeof createTest262FragmentEmitter>) {
  return emitter.emit(input.harness, input.body, input.mapping);
}

test("emission correlates replies through one lazy worker", async () => {
  const worker = new FakeWorker();
  let created = 0;
  const emitter = createTest262FragmentEmitter(() => {
    created += 1;
    return worker;
  });
  try {
    assert.equal(created, 0);
    const first = emit(emitter);
    const second = emit(emitter);
    assert.equal(created, 1);
    assert.equal(worker.referenced, true);
    const large = {
      ...expected,
      body: { ...expected.body, source: "C".repeat(2 * 1024 * 1024) },
    };
    worker.respond({ id: worker.requests[1]!.id, result: large });
    assert.equal(await second, large);
    assert.equal(worker.referenced, true);
    worker.respond({ id: worker.requests[0]!.id, result: expected });
    assert.equal(await first, expected);
    assert.equal(worker.referenced, false);
  } finally {
    await emitter.close();
  }
});

test("backend errors reject only their own request", async () => {
  const worker = new FakeWorker();
  const emitter = createTest262FragmentEmitter(() => worker);
  try {
    const failure = new Error("invalid fragment");
    const first = assert.rejects(emit(emitter), (error) => error === failure);
    const second = emit(emitter);
    worker.respond({ id: worker.requests[0]!.id, error: failure });
    worker.respond({ id: worker.requests[1]!.id, result: expected });
    await first;
    assert.equal(await second, expected);
  } finally {
    await emitter.close();
  }
});

for (const event of ["error", "messageerror", "exit"] as const) {
  test(`worker ${event} rejects pending and future work`, async () => {
    const worker = new FakeWorker();
    const emitter = createTest262FragmentEmitter(() => worker);
    const first = assert.rejects(emit(emitter));
    const second = assert.rejects(emit(emitter));
    worker.emit(event, event === "exit" ? 0 : new Error("worker failed"));
    await Promise.all([first, second]);
    await assert.rejects(emit(emitter));
    assert.equal(worker.requests.length, 2);
    assert.equal(worker.referenced, false);
    await emitter.close();
  });
}

test("worker construction and transport failures are terminal", async () => {
  const failure = new Error("cannot start");
  const unavailable = createTest262FragmentEmitter(() => {
    throw failure;
  });
  await assert.rejects(emit(unavailable), (error) => error === failure);
  await unavailable.close();
  const worker = new FakeWorker();
  worker.sendError = failure;
  const emitter = createTest262FragmentEmitter(() => worker);
  await assert.rejects(emit(emitter), (error) => error === failure);
  await assert.rejects(emit(emitter), (error) => error === failure);
  await emitter.close();
  assert.equal(worker.terminations, 1);
});

test("close rejects outstanding work and terminates only once", async () => {
  const worker = new FakeWorker();
  const emitter = createTest262FragmentEmitter(() => worker);
  const pending = assert.rejects(emit(emitter), /closed/u);
  const first = emitter.close();
  assert.equal(emitter.close(), first);
  await Promise.all([first, pending]);
  await assert.rejects(emit(emitter), /closed/u);
  assert.equal(worker.terminations, 1);
});

test("unknown replies fail all outstanding work", async () => {
  const worker = new FakeWorker();
  const emitter = createTest262FragmentEmitter(() => worker);
  const pending = assert.rejects(emit(emitter), /Unexpected/u);
  worker.respond({ id: 100, result: expected });
  await pending;
  await emitter.close();
});

test(
  "real worker emits exactly the synchronous backend bytes",
  {
    timeout: 10_000,
  },
  async () => {
    const emitter = createTest262FragmentEmitter();
    try {
      await Promise.all(
        (["enabled", "disabled"] as const).flatMap((specialization) =>
          [false, true].map(async (strict) => {
            const entry = fixture(strict, specialization);
            const before = structuredClone(entry);
            const actual = await emitter.emit(
              entry.harness,
              entry.body,
              entry.mapping,
            );
            assert.deepEqual(
              actual,
              emitScriptFragments(entry.harness, entry.body, entry.mapping),
            );
            assert.deepEqual(entry, before);
          }),
        ),
      );
      await assert.rejects(
        emitter.emit(
          { ...input.harness, nextBindingId: -1 },
          input.body,
          input.mapping,
        ),
        /Invalid fragment ABI/u,
      );
      assert.deepEqual(await emit(emitter), expected);
    } finally {
      await emitter.close();
    }
  },
);

for (const [index, malformed] of [
  null,
  undefined,
  "reply",
  { id: 0, result: {} },
  { id: 0, error: "not an Error" },
  { id: 0.5, result: expected },
  { id: 0, result: { ...expected, body: { source: 1 } } },
].entries()) {
  test(`malformed response rejects requests (case ${index})`, async () => {
    const worker = new FakeWorker();
    const emitter = createTest262FragmentEmitter(() => worker);
    const pending = assert.rejects(emit(emitter), /Malformed/u);
    worker.emit("message", malformed);
    await pending;
    await assert.rejects(emit(emitter), /Malformed/u);
    await emitter.close();
    assert.equal(worker.terminations, 1);
  });
}
