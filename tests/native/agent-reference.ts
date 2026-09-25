/**
 * A reference `$262.agent` for Node.js and Deno, prepended to a fixture
 * that the native side compiles with the test262 host.
 *
 * Each agent is a worker thread that evaluates its source as a global
 * Script once it has received the shared control block. Reports travel
 * through a Shared Data Block queue rather than messages, because the
 * main agent reads them synchronously while it may never return to its
 * event loop. `start` waits until the agent has evaluated its source, and
 * `broadcast` waits until every live agent has received the buffer,
 * matching the native host. Node.js workers are unreferenced so a finished
 * main agent ends the process as the native host does; every reference
 * agent must call `leaving()` last, which closes its worker, so Deno exits
 * too. A fixture therefore broadcasts only while every agent still
 * listens: a closed worker cannot receive, where the native host skips an
 * agent that has finished. An agent that throws marks the control block,
 * so the main agent fails at its next wait or report read instead of
 * waiting for that agent forever, as the native host ends the process.
 */
export const agentReferencePrelude: string = String.raw`
const oseoAgentControl = new Int32Array(new SharedArrayBuffer(64));
const oseoAgentQueue = new Uint16Array(new SharedArrayBuffer(1 << 20));
const oseoAgentWorkers = [];
const oseoAgentWorkerPrelude = ${"`"}
const oseoPort =
  typeof Deno === "undefined"
    ? require("node:worker_threads").parentPort
    : self;
let oseoControl;
let oseoQueue;
let oseoBroadcast;
function oseoLock() {
  while (Atomics.compareExchange(oseoControl, 0, 0, 1) !== 0) {}
}
function oseoUnlock() {
  Atomics.store(oseoControl, 0, 0);
}
globalThis.$262 = {
  agent: {
    receiveBroadcast(callback) {
      oseoBroadcast = callback;
    },
    report(value) {
      const text = String(value);
      oseoLock();
      let at = Atomics.load(oseoControl, 1);
      oseoQueue[at] = text.length;
      for (let index = 0; index < text.length; index += 1) {
        oseoQueue[at + 1 + index] = text.charCodeAt(index);
      }
      Atomics.store(oseoControl, 1, at + 1 + text.length);
      oseoUnlock();
    },
    leaving() {
      if (typeof Deno === "undefined") {
        oseoPort.close();
      } else {
        setTimeout(() => self.close(), 0);
      }
    },
    sleep(milliseconds) {
      const cell = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(cell, 0, 0, milliseconds);
    },
    monotonicNow() {
      return performance.timeOrigin + performance.now();
    },
  },
};
function oseoFail(error) {
  Atomics.store(oseoControl, 5, 1);
  Atomics.notify(oseoControl, 3);
  Atomics.notify(oseoControl, 4);
  throw error;
}
function oseoReceive(data) {
  if (data.kind === "init") {
    oseoControl = data.control;
    oseoQueue = data.queue;
    try {
      (0, eval)(data.source);
    } catch (error) {
      oseoFail(error);
    }
    Atomics.add(oseoControl, 4, 1);
    Atomics.notify(oseoControl, 4);
    return;
  }
  Atomics.add(oseoControl, 3, 1);
  Atomics.notify(oseoControl, 3);
  try {
    oseoBroadcast(data.buffer, data.id);
  } catch (error) {
    oseoFail(error);
  }
}
if (typeof Deno === "undefined") {
  oseoPort.on("message", oseoReceive);
} else {
  self.onmessage = (event) => oseoReceive(event.data);
}
${"`"};
function oseoAgentCheck() {
  if (Atomics.load(oseoAgentControl, 5) !== 0) {
    throw new Error("A reference agent threw.");
  }
}
function oseoAgentWaitFor(index, target) {
  for (;;) {
    oseoAgentCheck();
    const current = Atomics.load(oseoAgentControl, index);
    if (current >= target) return;
    Atomics.wait(oseoAgentControl, index, current, 10);
  }
}
globalThis.$262 = {
  agent: {
    start(source) {
      let worker;
      if (typeof Deno === "undefined") {
        const { Worker } = process.getBuiltinModule("node:worker_threads");
        worker = new Worker(oseoAgentWorkerPrelude, { eval: true });
        worker.unref();
      } else {
        const url = URL.createObjectURL(
          new Blob([oseoAgentWorkerPrelude], { type: "text/javascript" }),
        );
        worker = new Worker(url, { type: "module" });
      }
      oseoAgentWorkers.push(worker);
      const started = Atomics.load(oseoAgentControl, 4);
      worker.postMessage({
        control: oseoAgentControl,
        kind: "init",
        queue: oseoAgentQueue,
        source,
      });
      oseoAgentWaitFor(4, started + 1);
    },
    broadcast(buffer, id) {
      if (!(buffer instanceof SharedArrayBuffer)) {
        throw new TypeError("broadcast needs a SharedArrayBuffer");
      }
      const received = Atomics.load(oseoAgentControl, 3);
      for (const worker of oseoAgentWorkers) {
        worker.postMessage({ buffer, id, kind: "broadcast" });
      }
      oseoAgentWaitFor(3, received + oseoAgentWorkers.length);
    },
    getReport() {
      oseoAgentCheck();
      while (Atomics.compareExchange(oseoAgentControl, 0, 0, 1) !== 0) {}
      const read = Atomics.load(oseoAgentControl, 2);
      let report = null;
      if (read < Atomics.load(oseoAgentControl, 1)) {
        const length = oseoAgentQueue[read];
        report = String.fromCharCode(
          ...oseoAgentQueue.subarray(read + 1, read + 1 + length),
        );
        Atomics.store(oseoAgentControl, 2, read + 1 + length);
      }
      Atomics.store(oseoAgentControl, 0, 0);
      return report;
    },
    sleep(milliseconds) {
      const cell = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(cell, 0, 0, milliseconds);
    },
    monotonicNow() {
      return performance.timeOrigin + performance.now();
    },
  },
};
`;
