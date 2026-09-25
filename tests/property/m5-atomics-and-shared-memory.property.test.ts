/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
  printMir,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import { agentReferencePrelude } from "../native/agent-reference.ts";
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/**
 * How one data cell combines the updates every agent applies to it. Each
 * family is commutative and associative, so the cell's final value is the
 * same for every interleaving of the agents, which is what lets real
 * threads in the references and the native turn order agree. `cas`
 * increments through a compareExchange retry loop.
 */
type Family = "add" | "and" | "cas" | "or" | "sub" | "xor";

/** How an agent ends: a wait the main agent notifies, or one that cannot. */
type Gate = "async" | "not-equal" | "notify" | "timeout";

interface Update {
  readonly cell: number;
  readonly value: number;
}

interface AgentPlan {
  readonly gate: Gate;
  readonly updates: readonly Update[];
}

/**
 * Up to three agents updating four data cells of one element kind over a
 * shared buffer, each ending at a gate on its own control cell. `holes`
 * passes every update operand into the agent source through a template
 * substitution instead of writing it into the template's literal text.
 */
interface ClusterCase {
  readonly agents: readonly AgentPlan[];
  readonly big: boolean;
  readonly families: readonly Family[];
  readonly holes: boolean;
}

const cells = 4;

const caseArbitrary: fc.Arbitrary<ClusterCase> = fc.record({
  agents: fc.array(
    fc.record({
      gate: fc.constantFrom("async", "not-equal", "notify", "timeout"),
      updates: fc.array(
        fc.record({
          cell: fc.integer({ max: cells - 1, min: 0 }),
          value: fc.oneof(
            fc.integer({ max: 16, min: 0 }),
            fc.integer({ max: 2 ** 31 - 1, min: 0 }),
          ),
        }),
        { maxLength: 6, minLength: 1 },
      ),
    }),
    { maxLength: 3, minLength: 1 },
  ),
  big: fc.boolean(),
  families: fc.array(fc.constantFrom("add", "and", "cas", "or", "sub", "xor"), {
    maxLength: cells,
    minLength: cells,
  }),
  holes: fc.boolean(),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function family(testCase: ClusterCase, cell: number): Family {
  return testCase.families[cell] ?? "add";
}

/* The operand as agent source: a literal, or a hole the main agent fills. */
function operand(
  testCase: ClusterCase,
  value: number,
  holes: string[],
): string {
  const text = testCase.big ? `${value}n` : String(value);
  if (!testCase.holes) return text;
  holes.push(text);
  return `\${operands[${holes.length - 1}]}`;
}

function printUpdate(
  testCase: ClusterCase,
  update: Update,
  holes: string[],
): string {
  const value = operand(testCase, update.value, holes);
  const cellFamily = family(testCase, update.cell);
  if (cellFamily === "cas") {
    return (
      "{ let old; do { old = Atomics.load(data, " +
      `${update.cell}); } while (Atomics.compareExchange(data, ` +
      `${update.cell}, old, old + ${value}) !== old); }`
    );
  }
  return `Atomics.${cellFamily}(data, ${update.cell}, ${value});`;
}

function printGate(gate: Gate, agent: number): string {
  const cell = 1 + agent;
  if (gate === "async") {
    return (
      `Atomics.waitAsync(control, ${cell}, 0).value.then((outcome) => {\n` +
      `      $262.agent.report("${agent}:" + outcome);\n` +
      "      $262.agent.leaving();\n" +
      "    });"
    );
  }
  const call =
    gate === "not-equal"
      ? `Atomics.wait(control, ${cell}, 1)`
      : gate === "timeout"
        ? `Atomics.wait(control, ${cell}, 0, 5)`
        : `Atomics.wait(control, ${cell}, 0)`;
  const report = `$262.agent.report("${agent}:" + ${call});`;
  return `${report}\n    $262.agent.leaving();`;
}

function initial(testCase: ClusterCase): string {
  return testCase.families
    .map((cellFamily, cell) =>
      cellFamily === "and"
        ? `Atomics.store(data, ${cell}, ${testCase.big ? "-1n" : "-1"});`
        : "",
    )
    .filter((line) => line !== "")
    .join("\n");
}

function printCase(testCase: ClusterCase): string {
  const kind = testCase.big ? "BigInt64Array" : "Int32Array";
  const starts = testCase.agents.map((agent, index) => {
    const holes: string[] = [];
    const updates = agent.updates
      .map((update) => `    ${printUpdate(testCase, update, holes)}`)
      .join("\n");
    const body =
      "$262.agent.receiveBroadcast(function (sab) {\n" +
      "    const control = new Int32Array(sab, 0, 4);\n" +
      `    const data = new ${kind}(sab, 16, ${cells});\n` +
      `${updates}\n` +
      "    Atomics.add(control, 0, 1);\n" +
      "    Atomics.notify(control, 0);\n" +
      `    ${printGate(agent.gate, index)}\n` +
      "  });";
    return (
      `{\n  const operands = ${JSON.stringify(holes)};\n` +
      `  $262.agent.start(\`\n  ${body}\n\`);\n}`
    );
  });
  const gates = testCase.agents
    .map((agent, index) =>
      agent.gate === "notify" || agent.gate === "async"
        ? `while (Atomics.notify(control, ${1 + index}, 1) === 0) ` +
          "$262.agent.sleep(1);"
        : "",
    )
    .filter((line) => line !== "")
    .join("\n");
  return `
${starts.join("\n")}
const sab = new SharedArrayBuffer(16 + ${cells * (testCase.big ? 8 : 4)});
const control = new Int32Array(sab, 0, 4);
const data = new ${kind}(sab, 16, ${cells});
${initial(testCase)}
$262.agent.broadcast(sab);
let done;
while ((done = Atomics.load(control, 0)) !== ${testCase.agents.length}) {
  Atomics.wait(control, 0, done);
}
const finals = [];
for (let cell = 0; cell < ${cells}; cell++) {
  finals.push(String(Atomics.load(data, cell)));
}
console.log("cells", finals.join());
${gates}
const reports = [];
while (reports.length < ${testCase.agents.length}) {
  const report = $262.agent.getReport();
  if (report === null) $262.agent.sleep(1);
  else reports.push(report);
}
console.log("gates", reports.sort().join());
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
const sum = hinted(Atomics.load(data, 0), data[1]);
console.log("hint", String(sum), hinted("a", "b"));
`;
}

/* The independent model: every cell folds its agents' updates in order. */
function expected(testCase: ClusterCase): string {
  const bits = testCase.big ? 64n : 32n;
  const modulus = 1n << bits;
  const values: bigint[] = testCase.families.map((cellFamily) =>
    cellFamily === "and" ? modulus - 1n : 0n,
  );
  for (const agent of testCase.agents) {
    for (const update of agent.updates) {
      const previous = values[update.cell] ?? 0n;
      const value = BigInt(update.value);
      const next = {
        add: previous + value,
        and: previous & value,
        cas: previous + value,
        or: previous | value,
        sub: previous - value,
        xor: previous ^ value,
      }[family(testCase, update.cell)];
      values[update.cell] = ((next % modulus) + modulus) % modulus;
    }
  }
  const signed = values.map((raw) =>
    raw >= modulus / 2n ? raw - modulus : raw,
  );
  const printed = signed.map((value) =>
    testCase.big ? `${value}` : `${Number(value)}`,
  );
  const gates = testCase.agents
    .map((agent, index) => {
      const outcome =
        agent.gate === "not-equal"
          ? "not-equal"
          : agent.gate === "timeout"
            ? "timed-out"
            : "ok";
      return `${index}:${outcome}`;
    })
    .toSorted();
  const first = signed[0] ?? 0n;
  const second = signed[1] ?? 0n;
  const hint = testCase.big
    ? String(first + second)
    : String(Number(first) + Number(second));
  return (
    `cells ${printed.join()}\n` +
    `gates ${gates.join()}\n` +
    `hint ${hint} ab\n`
  );
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory("oseo-agents-");
  const sourcePath = `${directory}/atomics-and-shared-memory.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(sourcePath, agentReferencePrelude + source);
    const observations = [
      await host.run({
        args: [sourcePath],
        command: process.execPath,
        cwd: directory,
      }),
      await host.run({
        args: ["run", "--quiet", sourcePath],
        command: "deno",
        cwd: directory,
      }),
    ] as const;
    succeeded = true;
    return observations;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test(
  "generated agent clusters match the M5 shared-memory model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "agents' Atomics updates, waits, and notifications agree",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            {
              source,
              sourceId: "generated-m5-atomics-and-shared-memory.ts",
            },
            { observeSpecialization: true, specialization, test262Host: true },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          assert.equal(compiled.agents?.length, testCase.agents.length);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-smi/u);
            assert.match(mir, /generic-fallback/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:smi|shape)/u);
          }
          process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
          try {
            await withNativeFixture(
              {
                agents: compiled.agents ?? [],
                backend: cBackend,
                host,
                input: compiled.mir,
                operation: "execute",
                runtime: cRuntimeProvider,
                target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
                toolchain: nativeToolchain,
              },
              (native) => {
                assertMatchingObservations([expectedObservation, native]);
                assert.ok(native.counters?.collections != null);
                assert.ok(native.counters.collections > 0);
                if (specialization === "enabled") {
                  assert.ok(native.counters.guardMisses > 0);
                }
              },
            );
          } finally {
            delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          }
        }
      }),
      {
        context:
          nativeTarget == null || host.executionHost == null
            ? ["target=unsupported host=unknown"]
            : [
                `target=${nativeTarget.name}`,
                `host=${host.executionHost.operatingSystem}/` +
                  host.executionHost.architecture,
                `sanitizers=${nativeTarget.sanitizers.join(",")}`,
              ],
        domain:
          "one to three agents started from ahead-of-time templates whose " +
          "operands are literal text or numeric and BigInt holes, each " +
          "applying one to six add, sub, and, or, xor, or compareExchange " +
          "retry updates to four Int32Array or BigInt64Array cells of one " +
          "broadcast SharedArrayBuffer, then ending at a notified wait, a " +
          "notified waitAsync, a not-equal wait, or a timed-out wait on its " +
          "own control cell, plus one false numeric hint",
        numRuns: 6,
        profile: "M5 agent clusters and shared memory",
        seed: 0x6000_7f00,
        sizeLimit:
          "at most three agents, six updates each, four data cells, and " +
          "one gate per agent",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
