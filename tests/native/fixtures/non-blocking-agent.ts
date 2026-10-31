import type { Fixture } from "../fixture.ts";

/** Ordinary execution and the Script host retain blocking wait behavior. */
export const blockingAgentFixture: Fixture = {
  name: "agent-default-blocking-policy",
  test262Host: true,
  source: `
for (const Constructor of [Int32Array, BigInt64Array]) {
  const view = new Constructor(new SharedArrayBuffer(8));
  const zero = Constructor === Int32Array ? 0 : 0n;
  const one = Constructor === Int32Array ? 1 : 1n;
  console.log(Atomics.wait(view, 0, zero, 0));
  console.log(Atomics.wait(view, 0, one, 0));
}
`,
};

/** Fixed validation, realm ownership, waitAsync, and child-agent probes. */
export const nonBlockingAgentSource = `
function check(label, callback, expected) {
  let actual;
  try { actual = callback(); } catch (error) { actual = error.name; }
  if (actual !== expected) throw new Error(label + ":" + actual);
  console.log(label, actual);
}
for (const Constructor of [Int32Array, BigInt64Array]) {
  const view = new Constructor(new SharedArrayBuffer(8));
  const zero = Constructor === Int32Array ? 0 : 0n;
  const one = Constructor === Int32Array ? 1 : 1n;
  check("match", () => Atomics.wait(view, 0, zero, 0), "TypeError");
  check("mismatch", () => Atomics.wait(view, 0, one, 0), "TypeError");
  check("infinite", () => Atomics.wait(view, 0, zero), "TypeError");
  let order = "";
  const index = { valueOf() { order += "i"; return 0; } };
  const value = { valueOf() { order += "v"; return zero; } };
  const timeout = { valueOf() { order += "t"; return 0; } };
  check("conversion", () => Atomics.wait(view, index, value, timeout),
    "TypeError");
  if (order !== "ivt") throw new Error(order);
  console.log("order", order);
  check("range", () => Atomics.wait(view, view.length, value, timeout),
    "RangeError");
  const poison = { valueOf() { throw new SyntaxError("sentinel"); } };
  check("index", () => Atomics.wait(view, poison, value, timeout),
    "SyntaxError");
  check("value", () => Atomics.wait(view, 0, poison, timeout), "SyntaxError");
  check("timeout", () => Atomics.wait(view, 0, zero, poison), "SyntaxError");
  const wrong = Constructor === Int32Array ? 0n : 0;
  check("wrong type", () => Atomics.wait(view, 0, wrong, poison), "TypeError");
  check("async mismatch", () => Atomics.waitAsync(view, 0, one).value,
    "not-equal");
  check("async zero", () => Atomics.waitAsync(view, 0, zero, 0).value,
    "timed-out");
  const pending = Atomics.waitAsync(view, 0, zero);
  if (!pending.async) throw new Error("not async");
  pending.value.then(value => console.log("async notify", value));
  check("notify", () => Atomics.notify(view, 0), 1);
}
check("invalid view", () => Atomics.wait(new Uint8Array(8), 0, 0, 0),
  "TypeError");
check("unshared", () => Atomics.wait(new Int32Array(1), 0, 0, 0),
  "TypeError");
const realm = $262.createRealm().global;
const foreign = new realm.Int32Array(new realm.SharedArrayBuffer(4));
let realmError = false;
try { realm.Atomics.wait(foreign, 0, 0, 0); }
catch (error) { realmError = error instanceof realm.TypeError; }
if (!realmError) throw new Error("realm policy or error realm");
console.log("realm policy", realmError);
check("main after realm", () => Atomics.wait(foreign, 0, 1, 0), "TypeError");
$262.agent.start(\`
  const view = new Int32Array(new SharedArrayBuffer(4));
  const big = new BigInt64Array(new SharedArrayBuffer(8));
  $262.agent.report(Atomics.wait(view, 0, 0, 0));
  $262.agent.report(Atomics.wait(big, 0, 1n, 0));
  $262.agent.leaving();
\`);
let reports = [];
while (reports.length < 2) {
  const report = $262.agent.getReport();
  if (report === null) $262.agent.sleep(1);
  else reports.push(report);
}
console.log("child policy", reports.join(","));
`;
