import assert from "node:assert/strict";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
  type NativeToolchain,
} from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import {
  callableFrameCost,
  chainCharges,
  emittedFrameCharges,
  type FrameContract,
  type NonTailChain,
  nonTailResources,
  recursionEvents,
  resourceDiagnostic,
  runtimeFrameContract,
  simulateResources,
  toolchainFrameContract,
} from "./proper-tail-call-resources.ts";

/*
 * The resource model behind the native proper tail call negatives, checked
 * without a C compiler. The fixed expectations are boundaries worked out
 * from the emitted charges by hand, so a change to the slot layout, the
 * cost formula, or the model's event order shows up here first.
 */

const hostCcArguments = [
  "-DOSEO_CALLABLE_FRAME_MULTIPLIER=8u",
  "-DOSEO_CALLABLE_FRAME_BASE_SLOTS=32u",
];
const zigContract = runtimeFrameContract();
const hostCcContract = runtimeFrameContract(hostCcArguments);

function compile(
  source: string,
  sourceId: string,
  specialization: "disabled" | "enabled" = "enabled",
) {
  const compiled = compileSource(
    babelFrontend,
    { source, sourceId },
    { specialization },
  );
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  return compiled.mir;
}

function planningToolchain(
  requests: readonly (readonly string[])[],
): NativeToolchain {
  return {
    createBuildPlan: (input) => ({
      executablePath: "/plan/program",
      requests: requests.map((args) => ({
        args,
        command: "cc",
        cwd: "/plan",
      })),
      target: input.target,
    }),
  };
}

test("the frame contract follows the runtime headers and -D overrides", () => {
  assert.deepEqual(zigContract, {
    callableFrameBaseSlots: 32,
    callableFrameMultiplier: 1,
    maxActiveFrameSlots: 65_536,
    maxCallDepth: 256,
  });
  assert.deepEqual(hostCcContract, {
    ...zigContract,
    callableFrameMultiplier: 8,
  });
  assert.deepEqual(
    runtimeFrameContract(["-D", "OSEO_CALLABLE_FRAME_MULTIPLIER=4u"]),
    { ...zigContract, callableFrameMultiplier: 4 },
  );
  for (const unsupported of [
    ["-UOSEO_CALLABLE_FRAME_MULTIPLIER"],
    ["-DOSEO_MAX_ACTIVE_FRAME_SLOTS=1u"],
    ["-DOSEO_CALLABLE_FRAME_MULTIPLIER=8"],
    ["-DOSEO_CALLABLE_FRAME_MULTIPLIER=0u"],
    [
      "-DOSEO_CALLABLE_FRAME_MULTIPLIER=8u",
      "-DOSEO_CALLABLE_FRAME_MULTIPLIER=4u",
    ],
  ]) {
    assert.throws(() => runtimeFrameContract(unsupported), /Unsupported/u);
  }
});

test("a build plan's compile steps select one frame contract", () => {
  const target = describeTarget("linux-x86_64-gnu");
  const compileStep = [...hostCcArguments, "-c", "generated.c"];
  assert.deepEqual(
    toolchainFrameContract(
      planningToolchain([compileStep, compileStep, ["-o", "program"]]),
      target,
    ),
    hostCcContract,
  );
  assert.deepEqual(
    toolchainFrameContract(
      planningToolchain([["-O2", "generated.c", "-o", "program"]]),
      target,
    ),
    zigContract,
  );
  for (const requests of [
    [compileStep, ["-c", "runtime.c"]],
    [
      ["-c", "generated.c"],
      [...hostCcArguments, "-o", "program"],
    ],
    [],
  ]) {
    assert.throws(
      () => toolchainFrameContract(planningToolchain(requests), target),
      /disagree/u,
    );
  }
});

test("callable frame costs scale only slots past the base", () => {
  assert.equal(callableFrameCost(zigContract, 61), 61);
  assert.equal(callableFrameCost(hostCcContract, 32), 32);
  assert.equal(callableFrameCost(hostCcContract, 61), 264);
  assert.equal(callableFrameCost(hostCcContract, 97), 552);
  // 32 + (65,536 - 32) / 8 = 8,220 slots is the widest enterable frame.
  assert.equal(callableFrameCost(hostCcContract, 8_220), 65_536);
  assert.equal(callableFrameCost(hostCcContract, 8_221), 65_537);
});

test("the simulator checks the call level before the frame charge", () => {
  const contract: FrameContract = {
    callableFrameBaseSlots: 32,
    callableFrameMultiplier: 1,
    maxActiveFrameSlots: 100,
    maxCallDepth: 2,
  };
  const wide = { kind: "enter", slots: 50 } as const;
  assert.deepEqual(simulateResources(contract, 10, [wide, wide]), {
    kind: "frame-budget",
    liveFrames: 1,
  });
  const narrow = { kind: "enter", slots: 10 } as const;
  assert.deepEqual(simulateResources(contract, 95, [narrow]), {
    kind: "frame-budget",
    liveFrames: 0,
  });
  assert.deepEqual(
    simulateResources(contract, 0, [narrow, narrow, { kind: "transient" }]),
    { kind: "call-depth", liveFrames: 2 },
  );
  assert.deepEqual(
    simulateResources(contract, 0, [
      narrow,
      narrow,
      { kind: "leave" },
      { kind: "transient" },
      narrow,
    ]),
    { kind: "completed", peakLiveFrames: 2 },
  );
  assert.throws(
    () => simulateResources(contract, 0, [{ kind: "leave" }]),
    /no frame/u,
  );
});

test("emitted frame charges must cover every generated function", () => {
  const emitted = cBackend.emit(
    compile(
      '"use strict";\nfunction f() { return () => 1; }\nf()();\n',
      "charges.js",
    ),
  );
  const charges = emittedFrameCharges(emitted);
  assert.equal(charges.functions.size, 2);
  const caseLabel = /^ {4}case \d+u:$/mu;
  assert.match(emitted.source, caseLabel);
  for (const source of [
    emitted.source.replace(caseLabel, "    case 999u:"),
    emitted.source.replace(
      /^ {4}result = oseo_frame_enter\(\n {8}&context, \d+u\);$/mu,
      "",
    ),
    `${emitted.source}\nvoid extra(OseoContext *context) {\n` +
      "    (void)oseo_frame_enter(context, 1u);\n}\n",
  ]) {
    assert.throws(() => emittedFrameCharges({ ...emitted, source }));
  }
  assert.throws(
    () =>
      emittedFrameCharges({
        ...emitted,
        compilationUnits: [{ source: "", sourceName: "unit.c" }],
      }),
    /standalone/u,
  );
});

const probes = [
  {
    iterations: 0,
    name: "a try block",
    source: `"use strict";
function f(n) {
  try { return n === 0 ? 0 : f(n - 1); } catch (error) { throw error; }
}
f(300);
`,
    // 39 + 248 * (32 + 8 * 29) = 65,511 leaves 25 slots, short of a 249th.
    hostCc: { kind: "frame-budget", liveFrames: 248 },
  },
  {
    iterations: 2,
    name: "a for-of body",
    source: `"use strict";
function f(n) {
  for (const value of [n]) return value === 0 ? 0 : f(value - 1);
}
f(300);
`,
    // 39 + 118 * (32 + 8 * 65) = 65,175; a 119th 552-slot frame overflows.
    hostCc: { kind: "frame-budget", liveFrames: 118 },
  },
  {
    iterations: 0,
    name: "an operand with work after the call",
    source: `"use strict";
function f(n) { return n === 0 ? 0 : f(n - 1) + 0; }
f(300);
`,
    // 39 + 256 * (32 + 8 * 14) = 36,903; the 257th call level fails first.
    hostCc: { kind: "call-depth", liveFrames: 256 },
  },
] as const;

for (const probe of probes) {
  test(`fixed non-tail probe resources: ${probe.name}`, () => {
    for (const specialization of ["disabled", "enabled"] as const) {
      const charges = emittedFrameCharges(
        cBackend.emit(
          compile(probe.source, "non-tail-calls.js", specialization),
        ),
      );
      const [slots, ...others] = charges.functions.values();
      assert.ok(slots != null);
      assert.deepEqual(others, []);
      assert.equal(charges.script, 39);
      const events = recursionEvents(slots, 301, probe.iterations);
      assert.deepEqual(simulateResources(zigContract, charges.script, events), {
        kind: "call-depth",
        liveFrames: 256,
      });
      assert.deepEqual(
        simulateResources(hostCcContract, charges.script, events),
        probe.hostCc,
      );
    }
  });
}

test("resource diagnostics match one exact guard line", () => {
  const pattern = resourceDiagnostic("non-tail-calls.js", "frame-budget");
  const line =
    "non-tail-calls.js:3:31: error[OSEO2001]: " +
    "Maximum active native frame budget exceeded.\n";
  assert.match(line, pattern);
  for (const other of [
    line.replace("non-tail-calls.js", "other.js"),
    line.replace("frame budget", "call depth"),
    `${line}==1==ERROR: AddressSanitizer: stack-overflow\n`,
    `prefix\n${line}`,
    line.trimEnd(),
  ]) {
    assert.doesNotMatch(other, pattern);
  }
  assert.match(
    "x.js:1:1: error[OSEO2001]: Maximum call depth exceeded.\n",
    resourceDiagnostic("x.js", "call-depth"),
  );
});

/*
 * Run 61 of the non-tail property's seed 0x60008901 at ten times the
 * ordinary case budget, printed by that suite. The prediction below is the
 * model's, from the emitted charges; it has not yet been confirmed by a
 * native host C compiler run.
 */
const predictedCounterexample: NonTailChain = {
  context: "stored",
  depth: 59,
  hops: [{ definition: "arrow", form: "tagged" }],
  throwAtBottom: true,
};
const predictedCounterexampleSource = [
  '"use strict";',
  "let steps = 0;",
  "const hop0 = (n) => { steps += 1; label2: { " +
    "for (let j1 = 0; j1 < 1; j1++) { while (true) { " +
    'if (n === 0) { throw new RangeError("bottom 0"); } ' +
    "return [tag0`${n - 1}`][0]; } } } };",
  "",
  "const bound0 = hop0.bind(null);",
  "const proxy0 = new Proxy(hop0, {});",
  "const trap0 = new Proxy(function () {}, {",
  "  apply(target, thisArgument, values) { return hop0(...values); },",
  "});",
  "const tag0 = (strings, ...values) => hop0(...values);",
  "",
  "try {",
  "  console.log(hop0(59), steps);",
  "} catch (error) {",
  "  console.log(error.constructor.name, error.message, steps);",
  "}",
  "",
].join("\n");

test("a wide stored chain is predicted to exhaust the host-cc budget", () => {
  for (const [specialization, slots, script, liveFrames] of [
    // 132 + 45 * (32 + 8 * 174) = 64,212; the 46th hop needs 1,424 more.
    ["disabled", 206, 132, 45],
    // 192 + 42 * (32 + 8 * 187) = 64,368; the 43rd hop needs 1,528 more.
    ["enabled", 219, 192, 42],
  ] as const) {
    const mir = compile(
      predictedCounterexampleSource,
      "generated-m5-proper-tail-calls.js",
      specialization,
    );
    const charges = chainCharges(
      predictedCounterexampleSource,
      mir,
      cBackend.emit(mir),
    );
    assert.equal(charges.hop.get(0), slots);
    assert.equal(charges.tag.get(0), 37);
    assert.equal(charges.handler.get(0), 38);
    assert.equal(charges.script, script);
    assert.deepEqual(
      nonTailResources(predictedCounterexample, charges, hostCcContract),
      { kind: "frame-budget", liveFrames },
    );
    // Under Zig's charge all 60 hop frames fit at the bottom.
    assert.deepEqual(
      nonTailResources(predictedCounterexample, charges, zigContract),
      { kind: "completed", peakLiveFrames: 60 },
    );
    assert.throws(
      () =>
        nonTailResources(
          predictedCounterexample,
          { ...charges, tag: new Map() },
          zigContract,
        ),
      /Missing tag 0/u,
    );
  }
});
