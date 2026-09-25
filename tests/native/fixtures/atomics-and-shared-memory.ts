import type { Fixture } from "../fixture.ts";

/*
 * Agent clusters and cross-agent shared memory through the test262 host's
 * `$262.agent`. The native side compiles each `$262.agent.start` template
 * ahead of time and runs every agent on its own thread; Node.js and Deno
 * run the worker-based reference prelude. Every printed observation is one
 * that any interleaving of the agents produces, so the real threads of the
 * references and the native turn order must agree: waits are retried until
 * each waiter has been counted, reports are sorted, and plain memory is
 * read only after an Atomics operation ordered it.
 */
export const atomicsAndSharedMemoryFixtures: readonly Fixture[] = [
  {
    name: "agent-cluster-broadcast",
    test262Host: true,
    source: `
const NUMAGENT = 3;
const ACKED = 0;
for (let i = 0; i < NUMAGENT; i++) {
  $262.agent.start(\`
    $262.agent.receiveBroadcast(function (buffer, id) {
      const view = new Int32Array(buffer);
      if (id === 0) {
        Atomics.store(view, \${i} + 4, \${i} * 10 + 1);
        view[\${i} + 8] = \${i} + 100;
      }
      $262.agent.report([
        \${i},
        id,
        typeof id,
        buffer.byteLength,
        buffer.growable,
        buffer instanceof SharedArrayBuffer,
        Object.getPrototypeOf(buffer) === SharedArrayBuffer.prototype,
        view.length,
      ].join(":"));
      if (id === 0) {
        Atomics.add(view, \${ACKED}, 1);
        Atomics.notify(view, \${ACKED});
      }
      if (id === 2) $262.agent.leaving();
    });
  \`);
}
function waitFor(view, index, expected) {
  let seen;
  while ((seen = Atomics.load(view, index)) !== expected) {
    Atomics.wait(view, index, seen);
  }
}
function collect(count) {
  const reports = [];
  while (reports.length < count) {
    const report = $262.agent.getReport();
    if (report === null) $262.agent.sleep(1);
    else reports.push(report);
  }
  return reports.sort().join(" | ");
}
for (const name of ["start", "broadcast", "getReport", "sleep",
  "monotonicNow"]) {
  const member = $262.agent[name];
  console.log("host", name, typeof member, member.name, member.length);
}
console.log("empty report", $262.agent.getReport());
const shared = new SharedArrayBuffer(64);
const view = new Int32Array(shared);
$262.agent.broadcast(shared, 0);
waitFor(view, ACKED, NUMAGENT);
console.log("first", collect(NUMAGENT));
console.log(
  "stored",
  [4, 5, 6].map((index) => Atomics.load(view, index)).join(),
  [8, 9, 10].map((index) => view[index]).join(),
);
$262.agent.broadcast(new SharedArrayBuffer(0), 1n);
console.log("second", collect(NUMAGENT));
$262.agent.broadcast(new SharedArrayBuffer(16), 2);
console.log("third", collect(NUMAGENT));
let failures = 0;
for (const value of [undefined, 1, new ArrayBuffer(4), {}]) {
  try {
    $262.agent.broadcast(value);
  } catch (error) {
    if (error instanceof TypeError) failures += 1;
  }
}
console.log("broadcast type errors", failures);
`,
  },
  {
    name: "agent-wait-notify",
    test262Host: true,
    source: `
const WAITERS = 3;
const RUNNING = 6;
for (let i = 0; i < WAITERS; i++) {
  $262.agent.start(\`
    $262.agent.receiveBroadcast(function (buffer) {
      const view = new Int32Array(buffer);
      const big = new BigInt64Array(buffer, 32);
      Atomics.add(view, \${RUNNING}, 1);
      const index = \${i} % 2;
      const outcome = Atomics.wait(view, index, 0);
      const bigOutcome = Atomics.wait(big, 0, BigInt(\${i}));
      const before = $262.agent.monotonicNow();
      const timed = Atomics.wait(view, 5, 0, 30);
      const waited = $262.agent.monotonicNow() - before >= 30;
      $262.agent.report(
        [\${i}, index, outcome, bigOutcome, timed, waited].join(":"),
      );
      $262.agent.leaving();
    });
  \`);
}
function notifyAll(view, index, expected) {
  let woken = 0;
  while (woken < expected) {
    woken += Atomics.notify(view, index);
    if (woken < expected) $262.agent.sleep(1);
  }
  return woken;
}
function collect(count) {
  const reports = [];
  while (reports.length < count) {
    const report = $262.agent.getReport();
    if (report === null) $262.agent.sleep(1);
    else reports.push(report);
  }
  return reports.sort().join(" | ");
}
const shared = new SharedArrayBuffer(64);
const view = new Int32Array(shared);
const big = new BigInt64Array(shared, 32);
Atomics.store(big, 0, 7n);
$262.agent.broadcast(shared);
let running;
while ((running = Atomics.load(view, RUNNING)) !== WAITERS) {
  Atomics.wait(view, RUNNING, running, 10);
}
console.log("woken", notifyAll(view, 0, 2), notifyAll(view, 1, 1));
console.log("reports", collect(WAITERS));
console.log("idle", Atomics.notify(view, 0), Atomics.notify(view, 1));
console.log(
  "main not-equal",
  Atomics.wait(view, 2, 1),
  Atomics.wait(view, 2, 0, 0),
);
`,
  },
  {
    name: "agent-wait-async",
    test262Host: true,
    source: `
const AGENTS = 2;
const RUNNING = 4;
for (let i = 0; i < AGENTS; i++) {
  $262.agent.start(\`
    $262.agent.receiveBroadcast(function (buffer) {
      const view = new Int32Array(buffer);
      const listed = Atomics.waitAsync(view, 0, 0);
      const timed = Atomics.waitAsync(view, 3, 0, 20);
      const same = Atomics.waitAsync(view, 1, 5);
      Promise.all([listed.value, timed.value]).then(([ok, late]) => {
        $262.agent.report(
          [\${i}, listed.async, ok, timed.async, late, same.async,
            same.value].join(":"),
        );
        $262.agent.leaving();
      });
      if (\${i} === 0) {
        $262.agent.report("main waiters " + Atomics.notify(view, 2));
      }
      Atomics.add(view, \${RUNNING}, 1);
      Atomics.notify(view, \${RUNNING});
    });
  \`);
}
function collect(count) {
  const reports = [];
  while (reports.length < count) {
    const report = $262.agent.getReport();
    if (report === null) $262.agent.sleep(1);
    else reports.push(report);
  }
  return reports.sort().join(" | ");
}
const shared = new SharedArrayBuffer(32);
const view = new Int32Array(shared);
const mainWait = Atomics.waitAsync(view, 2, 0);
console.log("main listed", mainWait.async);
$262.agent.broadcast(shared);
let running;
while ((running = Atomics.load(view, RUNNING)) !== AGENTS) {
  Atomics.wait(view, RUNNING, running);
}
console.log("agents notified", Atomics.notify(view, 0));
mainWait.value.then((outcome) => {
  console.log("main outcome", outcome);
  console.log("reports", collect(AGENTS + 1));
});
`,
  },
  {
    name: "agent-shared-growth",
    test262Host: true,
    source: `
$262.agent.start(\`
  $262.agent.receiveBroadcast(function (buffer) {
    const tracking = new Int32Array(buffer);
    const before = [buffer.byteLength, buffer.growable, buffer.maxByteLength,
      tracking.length].join();
    buffer.grow(32);
    tracking[6] = 60;
    Atomics.store(tracking, 7, 70);
    $262.agent.report(before + " -> " + [buffer.byteLength,
      tracking.length].join());
    const big = new BigInt64Array(buffer, 0, 2);
    Atomics.add(big, 0, 5n);
    Atomics.store(tracking, 2, 1);
    Atomics.notify(tracking, 2);
    $262.agent.leaving();
  });
\`);
const shared = new SharedArrayBuffer(16, { maxByteLength: 64 });
const tracking = new Int32Array(shared);
const sized = new Int32Array(shared, 0, 4);
const big = new BigInt64Array(shared, 0, 2);
Atomics.store(big, 0, 10n);
$262.agent.broadcast(shared);
while (Atomics.load(tracking, 2) === 0) Atomics.wait(tracking, 2, 0);
let report = null;
while ((report = $262.agent.getReport()) === null) $262.agent.sleep(1);
console.log("agent", report);
console.log(
  "main",
  shared.byteLength,
  tracking.length,
  sized.length,
  Atomics.load(tracking, 7),
  tracking[6],
  Atomics.load(big, 0),
);
const data = new DataView(shared);
console.log("data view", data.byteLength, data.getInt32(28, true));
try {
  shared.grow(16);
} catch (error) {
  console.log("shrink", error instanceof RangeError);
}
`,
  },
  {
    name: "agent-contention",
    test262Host: true,
    source: `
const AGENTS = 3;
const ROUNDS = 40;
const DONE = 15;
for (let i = 0; i < AGENTS; i++) {
  $262.agent.start(\`
    /** @param {number} left @param {number} right */
    function hinted(left, right) {
      return left + right;
    }
    $262.agent.receiveBroadcast(function (buffer) {
      const view = new Int32Array(buffer);
      const bytes = new Uint8Array(buffer);
      const big = new BigInt64Array(buffer, 64);
      for (let round = 0; round < \${ROUNDS}; round++) {
        Atomics.add(view, 0, 1);
        Atomics.sub(view, 1, 2);
        Atomics.xor(view, 2, 1 << \${i});
        Atomics.or(view, 3, 1 << (\${i} + 4));
        let old;
        do {
          old = Atomics.load(view, 4);
        } while (Atomics.compareExchange(view, 4, old, old + 3) !== old);
        Atomics.add(bytes, 20, 1);
        Atomics.add(big, 0, BigInt(\${i} + 1));
      }
      view[8 + \${i}] = hinted(\${i}, 1000);
      Atomics.add(view, \${DONE}, 1);
      Atomics.notify(view, \${DONE});
      $262.agent.leaving();
    });
  \`);
}
/** @param {number} left @param {number} right */
function hinted(left, right) {
  return left + right;
}
const shared = new SharedArrayBuffer(80);
const view = new Int32Array(shared);
const bytes = new Uint8Array(shared);
const big = new BigInt64Array(shared, 64);
Atomics.store(view, 1, 1000);
$262.agent.broadcast(shared);
let done;
while ((done = Atomics.load(view, DONE)) !== AGENTS) {
  Atomics.wait(view, DONE, done);
}
console.log(
  "totals",
  Atomics.load(view, 0),
  Atomics.load(view, 1),
  Atomics.load(view, 2),
  Atomics.load(view, 3),
  Atomics.load(view, 4),
  Atomics.load(bytes, 20),
  Atomics.load(big, 0),
);
console.log("slots", view[8], view[9], view[10]);
console.log("hint", hinted(Atomics.load(big, 0), 1n), hinted(view[8], 1));
`,
  },
];
