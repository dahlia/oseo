/* eslint-disable no-await-in-loop -- Native policies run serially. */

/*
 * Fixed native fixtures of the import-operation unit: the design's test
 * groups G1 through G10 and G14 for static-specifier `import()`. Each
 * program runs under both specialization policies with collection forced
 * at every safepoint. They live here rather than in tests/native.ts
 * because the M5c exclusion audit binds that file by digest.
 *
 * Node.js and Deno complete HostLoadImportedModule after loader work,
 * while Oseo completes it synchronously, so a reference host is compared
 * byte for byte only where the edition fixes the order independently of
 * that timing. The generated traces compare natively with the edition
 * model in tests/import-operation-model.ts exactly and with the reference
 * hosts as multisets of lines.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  type GeneratedProgram,
  logText,
  modelProgram,
  moduleSource,
  sortedLines,
} from "./import-operation-model.ts";
import {
  compileModuleFile,
  compileScriptFile,
  host,
  nativeSkip,
  runNative,
  runReference,
  specializations,
} from "./import-operation-support.ts";

const fixtures = fileURLToPath(
  new URL("./fixtures/import-operation/", import.meta.url),
);

/** One fixed program and how each reference host may be compared. */
interface FixedCase {
  /** `script.js` is compiled as a Script referrer, not a module. */
  readonly entry: "main.mjs" | "script.js";
  readonly group: string;
  readonly name: string;
  /** Reference hosts that agree with the edition byte for byte. */
  readonly references: readonly ("deno" | "node")[];
  /** The entry never settles: every host reports the stalled await. */
  readonly stalled?: true;
  readonly stdout: string;
}

const lines = (...values: readonly string[]): string =>
  values.map((value) => `${value}\n`).join("");

const fixedCases: readonly FixedCase[] = [
  {
    entry: "main.mjs",
    group: "G1",
    name: "single-evaluation",
    references: ["deno", "node"],
    stdout: lines(
      "distinct promises true",
      "once evaluates",
      "concurrent namespace true 1",
      "serialized namespace true",
      "evaluations 1",
      "self evaluates",
      "self request is a promise true",
      "self request true 2",
    ),
  },
  {
    // Neither reference host runs a Script with a build-side referrer,
    // so the expected output follows the edition: one Script and one
    // module record for the same file, each evaluated once.
    entry: "script.js",
    group: "G1, G2",
    name: "script-identity",
    references: [],
    stdout: lines(
      "script evaluates",
      "module evaluates",
      "evaluations 2 true true",
    ),
  },
  {
    entry: "main.mjs",
    group: "G3",
    name: "cached-errors",
    references: ["deno", "node"],
    stdout: lines(
      "thrower evaluates",
      "same error true thrower failed",
      "later request true",
      "before await",
      "after await thrown after await true",
    ),
  },
  {
    // Node.js 24 aborts on the second cycle and Deno rejects the member
    // with a different value; test262's
    // import-fulfilled-member-of-errored-cycle.js asserts the identity
    // the edition gives, which this output follows.
    entry: "main.mjs",
    group: "G3, G8",
    name: "errored-cycle",
    references: [],
    stdout: lines(
      "member evaluates",
      "root evaluates",
      "root rejects async error in root",
      "member shares the root error true",
      "second member evaluates",
      "capability created for the root second root failed true",
    ),
  },
  {
    entry: "main.mjs",
    group: "G4",
    name: "namespace-reuse",
    references: ["deno", "node"],
    stdout: lines(
      "empty evaluates",
      "static and dynamic true",
      "repeated true",
      "export-free true 0",
      "lazy-only true true",
      "shape true false Module alpha,beta,default",
    ),
  },
  {
    entry: "main.mjs",
    group: "G5",
    name: "lazy-live-bindings",
    references: ["deno", "node"],
    stdout: lines(
      "entry starts",
      "request made",
      "lazy evaluates",
      "value 10",
      "live value 11",
      "shared value 12 12",
      "snapshot and live 12 13",
    ),
  },
  {
    entry: "main.mjs",
    group: "G6",
    name: "async-exports",
    references: ["deno", "node"],
    stdout: lines(
      "after await awaited timer",
      "cached awaited",
      "rejected TypeError: rejected after await",
      "rejected before await primitive",
    ),
  },
  {
    entry: "main.mjs",
    group: "G7",
    name: "join-pending",
    references: ["deno", "node"],
    stdout: lines(
      "waiting starts",
      "waiting ends",
      "joined order empty,first,second",
      "re-entry after completion true",
      "finished subgraph does not hang 2",
    ),
  },
  {
    entry: "main.mjs",
    group: "G7",
    name: "self-await-stall",
    references: ["deno", "node"],
    stalled: true,
    stdout: lines("before"),
  },
  {
    // Node.js 24's loader reads Promise[Symbol.species] from its own
    // promises, so Deno is the single reference for this program.
    entry: "main.mjs",
    group: "G10",
    name: "promise-identity",
    references: ["deno"],
    stdout: lines(
      "intrinsic promise true true",
      "rebinding ignored true true",
      "same namespace true",
      "species reads 0",
      "callable then resolved by then",
      "noncallable then object 42",
      "throwing then then threw",
      "rejecting then then rejected",
      "hints object number",
    ),
  },
];

const stallDiagnostic =
  "error[OSEO3001]: Top-level await cannot make progress.";

for (const fixed of fixedCases) {
  test(
    `${fixed.group}: import() runs ${fixed.name}`,
    { skip: nativeSkip },
    async () => {
      const directory = `${fixtures}${fixed.name}`;
      const entry = `${directory}/${fixed.entry}`;
      for (const reference of fixed.references) {
        const observation = await runReference(reference, entry, directory);
        assert.equal(observation.stdout, fixed.stdout, reference);
        if (fixed.stalled === true) {
          assert.notEqual(observation.exitStatus, 0, reference);
        } else {
          assert.equal(observation.exitStatus, 0, observation.stderr);
          assert.equal(observation.stderr, "", reference);
        }
      }
      for (const specialization of specializations) {
        const mir =
          fixed.entry === "script.js"
            ? await compileScriptFile(entry, specialization)
            : await compileModuleFile(entry, specialization);
        const native = await runNative(mir);
        assert.equal(native.stdout, fixed.stdout, specialization);
        if (fixed.stalled === true) {
          assert.equal(native.exitStatus, 1, specialization);
          assert.ok(native.stderr.includes(stallDiagnostic), native.stderr);
        } else {
          assert.equal(native.exitStatus, 0, native.stderr);
          assert.equal(native.stderr, "");
          assert.ok(native.collections > 0, specialization);
        }
        // ImportCall lowers only to the generic runtime operation.
        assert.match(native.emittedC, /oseo_module_import\(context, /u);
      }
    },
  );
}

/** A generated program the model traces exactly. */
interface TracedCase {
  readonly group: string;
  readonly name: string;
  readonly program: GeneratedProgram;
}

const awaitStep = { kind: "await" } as const;
const throwStep = { kind: "throw" } as const;
const request = (target: number, awaited = false) =>
  ({ awaited, kind: "import", target }) as const;
const probe = (length: number) => ({ kind: "probe", length }) as const;

const tracedCases: readonly TracedCase[] = [
  {
    // B's graph starts before A's, and both wait on one leaf; when the
    // leaf fulfills, B's import settles first.
    group: "G8",
    name: "fulfillment-order",
    program: {
      modules: [
        { imports: [], steps: [request(2), awaitStep, request(1), probe(3)] },
        { imports: [3], steps: [] },
        { imports: [3], steps: [] },
        { imports: [], steps: [awaitStep, awaitStep, awaitStep] },
      ],
    },
  },
  {
    // The leaf rejects after both graphs started: its parents reject in
    // [[AsyncParentModules]] order, leaf to root.
    group: "G8",
    name: "rejection-order",
    program: {
      modules: [
        { imports: [], steps: [request(2), awaitStep, request(1), probe(4)] },
        { imports: [4], steps: [awaitStep] },
        { imports: [4, 3], steps: [] },
        { imports: [], steps: [] },
        { imports: [], steps: [awaitStep, awaitStep, throwStep] },
      ],
    },
  },
  {
    // One graph stays pending while another starts and completes, and a
    // third starts afterwards: the async evaluation count keeps
    // increasing, so the pending graph's ancestors still run first.
    group: "G8",
    name: "evaluation-count",
    program: {
      modules: [
        {
          imports: [],
          steps: [request(1), request(3, true), request(4), probe(2)],
        },
        { imports: [2], steps: [] },
        { imports: [], steps: [awaitStep, awaitStep, awaitStep, awaitStep] },
        { imports: [], steps: [awaitStep] },
        { imports: [2], steps: [awaitStep] },
      ],
    },
  },
  {
    // Requests made while the static graph is still in its DFS run in
    // later jobs and find their targets evaluated or evaluating.
    group: "G9",
    name: "requests-during-dfs",
    program: {
      modules: [
        { imports: [1, 2, 3], steps: [request(1)] },
        { imports: [], steps: [request(2), request(3), request(0)] },
        { imports: [], steps: [awaitStep] },
        { imports: [], steps: [request(1)] },
      ],
    },
  },
  {
    // Requests join a pending evaluation in registration order across
    // an unrelated request, and a request after completion re-enters.
    group: "G7",
    name: "joined-requests",
    program: {
      modules: [
        {
          imports: [],
          steps: [
            request(1),
            request(2),
            request(1),
            awaitStep,
            awaitStep,
            awaitStep,
            request(1, true),
            request(3, true),
          ],
        },
        { imports: [], steps: [awaitStep, awaitStep] },
        { imports: [], steps: [] },
        { imports: [1], steps: [probe(2)] },
      ],
    },
  },
];

for (const traced of tracedCases) {
  test(
    `${traced.group}: import() follows the edition in ${traced.name}`,
    { skip: nativeSkip },
    async () => {
      const outcome = modelProgram(traced.program);
      assert.equal(outcome.stalled, false);
      assert.equal(outcome.error, undefined);
      const expected = logText(outcome.log);
      const directory = await host.makeTemporaryDirectory(
        "oseo-import-operation-",
      );
      try {
        for (const index of traced.program.modules.keys()) {
          await host.writeTextFile(
            `${directory}/m${index}.mjs`,
            moduleSource(traced.program, index),
          );
        }
        const entry = `${directory}/m0.mjs`;
        for (const reference of ["deno", "node"] as const) {
          const observation = await runReference(reference, entry, directory);
          assert.equal(observation.exitStatus, 0, observation.stderr);
          assert.deepEqual(
            sortedLines(observation.stdout),
            sortedLines(expected),
            reference,
          );
        }
        for (const specialization of specializations) {
          const native = await runNative(
            await compileModuleFile(entry, specialization),
          );
          assert.equal(native.stdout, expected, specialization);
          assert.equal(native.exitStatus, 0, native.stderr);
          assert.ok(native.collections > 0, specialization);
        }
      } finally {
        await host.remove(directory);
      }
    },
  );
}

test(
  "G14: an import() program links no loader, parser, or compiler",
  { skip: nativeSkip },
  async () => {
    const entry = `${fixtures}lazy-live-bindings/main.mjs`;
    const native = await runNative(await compileModuleFile(entry, "enabled"));
    assert.equal(native.exitStatus, 0, native.stderr);
    // Each site passes one constant table index, and no specifier text
    // reaches the executable.
    assert.equal(
      native.emittedC.match(/= oseo_module_import\(context, 1u?, /gu)?.length,
      2,
    );
    assert.doesNotMatch(native.emittedC, /\.\/lazy\.mjs/u);
    assert.doesNotMatch(
      native.emittedC,
      /oseo_(?:parse|compile|eval|load_module|module_load)\w*\(/u,
    );
  },
);
