/* eslint-disable no-await-in-loop -- Native scenario builds are isolated. */
import assert from "node:assert/strict";

import { runNativeCli } from "../../native-cli.ts";
import type { NativeScenarioContext } from "../scenario.ts";

/*
 * Native-only agent cluster observations. The reference hosts either run
 * their agents on truly parallel threads, so they cannot pin an order the
 * native turn handoff makes deterministic, or have no counterpart for the
 * boundaries this profile owns: the ahead-of-time agent programs, the
 * stalled cluster, and the process ending with an agent's error.
 */
export async function runAgentScenarios(
  context: NativeScenarioContext,
): Promise<void> {
  const { host } = context;
  const run = async (name: string, source: string, hosted = true) =>
    await runNativeCli(
      {
        args: [...(hosted ? ["--test262-host"] : []), name],
        source,
        sourceId: name,
        version: "0.1.0",
      },
      host,
    );

  // WaiterList order across agents is FIFO. Each agent enters its wait
  // only after the main agent released it, and the release hands the turn
  // to that agent before the next one, so the waiting order is exactly the
  // release order, and one-at-a-time notification reports it back. This
  // is the upstream notify-in-order case with the yields made exact.
  const order = await run(
    "agent-notify-order.ts",
    `
const NUMAGENT = 3;
const SPIN = 1;
const RUNNING = SPIN + NUMAGENT;
for (let i = 0; i < NUMAGENT; i++) {
  $262.agent.start(\`
    $262.agent.receiveBroadcast(function (sab) {
      const view = new Int32Array(sab);
      Atomics.add(view, \${RUNNING}, 1);
      while (Atomics.load(view, \${SPIN + i}) === 0) {}
      $262.agent.report(\${i});
      Atomics.wait(view, 0, 0);
      $262.agent.report(\${i});
      $262.agent.leaving();
    });
  \`);
}
const view = new Int32Array(new SharedArrayBuffer(4 * (RUNNING + 1)));
$262.agent.broadcast(view.buffer);
while (Atomics.load(view, RUNNING) !== NUMAGENT) {}
function report() {
  let value;
  while ((value = $262.agent.getReport()) === null) $262.agent.sleep(1);
  return value;
}
const waiting = [];
for (const agent of [2, 0, 1]) {
  Atomics.store(view, SPIN + agent, 1);
  waiting.push(report());
  $262.agent.sleep(5);
}
const notified = [];
for (let i = 0; i < NUMAGENT; i++) {
  notified.push(Atomics.notify(view, 0, 1) + ":" + report());
}
console.log(waiting.join(), notified.join());
`,
  );
  assert.equal(order.exitStatus, 0, order.stderr);
  assert.equal(order.stdout, "2,0,1 1:2,1:0,1:1\n");
  assert.equal(order.stderr, "");

  // A hole that holds a BigInt literal evaluates to that BigInt, and the
  // same template matches a start whose hole holds a Number literal.
  const bigHole = await run(
    "agent-bigint-hole.ts",
    `
for (const value of ["42n", "7"]) {
  $262.agent.start(\`
    $262.agent.report(typeof \${value} + " " + String(\${value}));
    $262.agent.leaving();
  \`);
}
const reports = [];
while (reports.length < 2) {
  const report = $262.agent.getReport();
  if (report === null) $262.agent.sleep(1);
  else reports.push(report);
}
console.log(reports.sort().join());
`,
  );
  assert.equal(bigHole.exitStatus, 0, bigHole.stderr);
  assert.equal(bigHole.stdout, "bigint 42,number 7\n");

  // Function source reflects the literal text the start source held at
  // each hole, never the placeholder the agent program was compiled with.
  const reflected = await run(
    "agent-source-text.ts",
    `
for (const value of ["42", "7n"]) {
  $262.agent.start(\`
    function f() { return \${value} + \${value}; }
    class C { m() { return [\${value}]; } }
    $262.agent.report(f.toString() + " " + C.prototype.m.toString());
    $262.agent.leaving();
  \`);
}
const reports = [];
while (reports.length < 2) {
  const report = $262.agent.getReport();
  if (report === null) $262.agent.sleep(1);
  else reports.push(report);
}
console.log(reports.sort().join("\\n"));
`,
  );
  assert.equal(reflected.exitStatus, 0, reflected.stderr);
  assert.equal(
    reflected.stdout,
    "function f() { return 42 + 42; } m() { return [42]; }\n" +
      "function f() { return 7n + 7n; } m() { return [7n]; }\n",
  );

  // One block broadcast twice reaches an agent as two buffer objects, and
  // SharedArrayBuffer.prototype.slice rejects a species result that shares
  // the source's block. Agents started one after another, each finishing
  // before the next, all run.
  const aliased = await run(
    "agent-slice-alias.ts",
    `
let seen = null;
$262.agent.start(\`
  let first = null;
  $262.agent.receiveBroadcast(function (buffer) {
    if (first === null) {
      first = buffer;
      return;
    }
    first.constructor = { [Symbol.species]: function () { return buffer; } };
    try {
      first.slice(0, 4);
      $262.agent.report("sliced");
    } catch (error) {
      $262.agent.report(error instanceof TypeError ? "TypeError" : "other");
    }
    $262.agent.leaving();
  });
\`);
const shared = new SharedArrayBuffer(8);
$262.agent.broadcast(shared);
$262.agent.broadcast(shared);
while ((seen = $262.agent.getReport()) === null) $262.agent.sleep(1);
let finished = 0;
for (let round = 0; round < 12; round++) {
  $262.agent.start("$262.agent.report('done'); $262.agent.leaving();");
  let report;
  while ((report = $262.agent.getReport()) === null) $262.agent.sleep(1);
  if (report === "done") finished += 1;
}
console.log(seen, finished);
`,
  );
  assert.equal(aliased.exitStatus, 0, aliased.stderr);
  assert.equal(aliased.stdout, "TypeError 12\n");

  // Source text that no compiled template matches is the owned boundary
  // ADR 0016 keeps for dynamic source: a hole must hold a decimal integer
  // literal, and the literal runs must match exactly.
  for (const [name, argument] of [
    ["agent-negative-hole.ts", "`$262.agent.report(${-1});`"],
    ["agent-fraction-hole.ts", "`$262.agent.report(${1.5});`"],
    ["agent-computed-source.ts", "text"],
  ] as const) {
    const rejected = await run(
      name,
      `const text = "$262.agent.leaving();";\n$262.agent.start(${argument});\n`,
    );
    assert.equal(rejected.exitStatus, 1, name);
    assert.equal(rejected.stdout, "", name);
    assert.match(
      rejected.stderr,
      new RegExp(
        `^${name.replace(".", "\\.")}:2:1: error\\[OSEO2001\\]: Agent ` +
          "source text outside the ahead-of-time agent programs is not " +
          "admitted\\.\n$",
        "u",
      ),
      name,
    );
  }

  // A template whose hole is not one numeric literal token position
  // cannot be compiled ahead of time and is rejected before any build.
  for (const [name, template, message] of [
    [
      "agent-hole-in-string.ts",
      '$262.agent.report("${1}");',
      "Agent source template hole 0 \\(\\$262AgentHole0\\) is not one " +
        "numeric literal position\\.",
    ],
    [
      "agent-hole-member.ts",
      "$262.agent.report(Math.${1});",
      "Agent source template hole 0 is not delimited as one numeric " +
        "literal token\\.",
    ],
    [
      "agent-hole-target.ts",
      "let x; x = ${1} = 2;",
      "Source could not be parsed\\.",
    ],
  ] as const) {
    const rejected = await run(name, `$262.agent.start(\`${template}\`);\n`);
    assert.equal(rejected.exitStatus, 1, name);
    assert.equal(rejected.stdout, "", name);
    assert.match(rejected.stderr, /error\[OSEO(?:0001|1001)\]/u, name);
    assert.match(rejected.stderr, new RegExp(message, "u"), name);
  }

  // Without the test262 host the realm has no `$262` property, so the
  // global reference throws the ReferenceError of an unresolvable name.
  const unhosted = await run(
    "agent-unhosted.ts",
    "$262.agent.sleep(1);\n",
    false,
  );
  assert.equal(unhosted.exitStatus, 1);
  assert.match(
    unhosted.stderr,
    new RegExp(
      String.raw`^agent-unhosted\.ts:1:1: error\[OSEO2001\]: ` +
        String.raw`ReferenceError: \$262 is not defined\.`,
      "u",
    ),
  );

  // An agent that ends with an uncaught throw ends the process with that
  // agent's error, because a case that lost an agent could otherwise only
  // wait for it forever.
  const thrown = await run(
    "agent-throws.ts",
    `
$262.agent.start("throw new RangeError('agent failed');");
while (true) $262.agent.sleep(1);
`,
  );
  assert.equal(thrown.exitStatus, 1);
  assert.equal(thrown.stdout, "");
  assert.match(thrown.stderr, /agent-throws\.ts#agent-0:1:1: /u);
  assert.match(thrown.stderr, /RangeError: agent failed/u);

  // When every agent waits without a deadline, nothing can wake any of
  // them, so the cluster reports that it cannot make progress.
  const stalled = await run(
    "agent-stalled.ts",
    `
$262.agent.start(\`
  $262.agent.receiveBroadcast(function (sab) {
    Atomics.wait(new Int32Array(sab), 0, 0);
  });
\`);
const view = new Int32Array(new SharedArrayBuffer(8));
$262.agent.broadcast(view.buffer);
console.log("waiting");
Atomics.wait(view, 1, 0);
`,
  );
  assert.equal(stalled.exitStatus, 1);
  assert.equal(stalled.stdout, "waiting\n");
  assert.match(
    stalled.stderr,
    /error\[OSEO3001\]: The agent cluster cannot make progress\.\n$/u,
  );

  // The process ends with the main agent even while another agent still
  // waits, and a main agent with a pending waitAsync waiter that only a
  // waiting agent could notify ends its event loop instead of hanging.
  const abandoned = await run(
    "agent-abandoned.ts",
    `
$262.agent.start(\`
  $262.agent.receiveBroadcast(function (sab) {
    const view = new Int32Array(sab);
    Atomics.add(view, 1, 1);
    Atomics.wait(view, 0, 0);
  });
\`);
const view = new Int32Array(new SharedArrayBuffer(16));
$262.agent.broadcast(view.buffer);
while (Atomics.load(view, 1) !== 1) {}
Atomics.waitAsync(view, 2, 0).value.then(() => console.log("unreachable"));
console.log("main done");
`,
  );
  assert.equal(abandoned.exitStatus, 0, abandoned.stderr);
  assert.equal(abandoned.stdout, "main done\n");
  assert.equal(abandoned.stderr, "");

  const moduleGoal = await runNativeCli(
    {
      args: ["--test262-host", "--module", "agent-module.ts"],
      source: "export {};\n",
      sourceId: "agent-module.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(moduleGoal.exitStatus, 1);
  assert.match(
    moduleGoal.stderr,
    /The --test262-host option applies only to Scripts\./u,
  );
}
