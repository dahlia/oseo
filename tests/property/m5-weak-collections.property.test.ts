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
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/*
 * Stable identities can be held weakly and stay reachable for the whole
 * program. A fresh object is unreachable as soon as its operation ends, so
 * forced collection may clear it; the synchronous model only asks
 * questions whose answers every conforming collection schedule shares.
 *
 * Cleanup is host-defined, so only the native run reports it. Collection
 * forced at every safepoint queues every fresh registration target before
 * the script ends, and the timer's report then records one registry
 * cleanup job: each callback in registration order, and only afterwards the
 * promise job each callback enabled.
 *
 * Generated promise jobs, queued by the script or chained on an earlier
 * job, each create a WeakRef and dereference every reference so far. Each
 * reaction is a job of its own, so natively a fresh target from the script
 * or an earlier job is already cleared, while its own and stable targets
 * survive. The timer reports those observations after the cleanup report.
 */
type KeyToken =
  | "fresh-object"
  | "number"
  | "object-a"
  | "object-b"
  | "string"
  | "symbol-a"
  | "symbol-b"
  | "undefined";

type Operation =
  | { readonly kind: "map-delete"; readonly key: KeyToken }
  | { readonly kind: "map-get"; readonly key: KeyToken }
  | { readonly kind: "map-has"; readonly key: KeyToken }
  | { readonly kind: "map-set"; readonly key: KeyToken; readonly value: number }
  | { readonly kind: "ref"; readonly key: KeyToken }
  | {
      readonly held: KeyToken;
      readonly kind: "register";
      readonly key: KeyToken;
      readonly token: KeyToken;
    }
  | { readonly kind: "set-add"; readonly key: KeyToken }
  | { readonly kind: "set-delete"; readonly key: KeyToken }
  | { readonly kind: "set-has"; readonly key: KeyToken }
  | { readonly kind: "unregister"; readonly key: KeyToken };

const keyArbitrary = fc.constantFrom<KeyToken>(
  "fresh-object",
  "number",
  "object-a",
  "object-b",
  "string",
  "symbol-a",
  "symbol-b",
  "undefined",
);

const operationArbitrary: fc.Arbitrary<Operation> = fc.oneof(
  fc.record({ key: keyArbitrary, kind: fc.constant("map-delete" as const) }),
  fc.record({ key: keyArbitrary, kind: fc.constant("map-get" as const) }),
  fc.record({ key: keyArbitrary, kind: fc.constant("map-has" as const) }),
  fc.record({
    key: keyArbitrary,
    kind: fc.constant("map-set" as const),
    value: fc.integer({ max: 9, min: 0 }),
  }),
  fc.record({ key: keyArbitrary, kind: fc.constant("ref" as const) }),
  fc.record({
    held: keyArbitrary,
    key: keyArbitrary,
    kind: fc.constant("register" as const),
    token: keyArbitrary,
  }),
  fc.record({ key: keyArbitrary, kind: fc.constant("set-add" as const) }),
  fc.record({ key: keyArbitrary, kind: fc.constant("set-delete" as const) }),
  fc.record({ key: keyArbitrary, kind: fc.constant("set-has" as const) }),
  fc.record({ key: keyArbitrary, kind: fc.constant("unregister" as const) }),
);

/*
 * Every case starts with two or three registrations whose fresh targets die
 * before the script ends, so the native cleanup report sees several records
 * of one registry. Their held values and tokens stay generated, so later
 * unregister operations can still remove them.
 */
const cleanupRegistrationArbitrary = fc.record({
  held: keyArbitrary,
  key: fc.constant<KeyToken>("fresh-object"),
  kind: fc.constant("register" as const),
  token: fc.constantFrom<KeyToken>(
    "fresh-object",
    "object-a",
    "object-b",
    "symbol-a",
    "symbol-b",
    "undefined",
  ),
});

/*
 * A sibling job reacts to a promise the script resolved; a chained job
 * reacts to the previous job's promise, so it is queued only when that job
 * ends. The first job is always a sibling.
 */
interface JobStep {
  readonly link: "chain" | "sibling";
  readonly target: "fresh-object" | "object-a";
}

const jobStepArbitrary: fc.Arbitrary<JobStep> = fc.record({
  link: fc.constantFrom("chain" as const, "sibling" as const),
  target: fc.constantFrom("fresh-object" as const, "object-a" as const),
});

interface GeneratedCase {
  readonly cleanup: readonly Operation[];
  readonly jobs: readonly JobStep[];
  readonly operations: readonly Operation[];
}

const caseArbitrary: fc.Arbitrary<GeneratedCase> = fc.record({
  cleanup: fc.array(cleanupRegistrationArbitrary, {
    maxLength: 3,
    minLength: 2,
  }),
  jobs: fc.array(jobStepArbitrary, { maxLength: 4, minLength: 1 }),
  operations: fc.array(operationArbitrary, {
    maxLength: 16,
    minLength: 1,
  }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function expression(token: KeyToken): string {
  switch (token) {
    case "fresh-object":
      return "{}";
    case "number":
      return "1";
    case "object-a":
      return "objectA";
    case "object-b":
      return "objectB";
    case "string":
      return '"a"';
    case "symbol-a":
      return "symbolA";
    case "symbol-b":
      return "symbolB";
    case "undefined":
      return "undefined";
  }
}

function printOperation(operation: Operation, index: number): string {
  const key = expression(operation.key);
  switch (operation.kind) {
    case "map-set":
      return (
        `probe(${index}, () => ` +
        `map.set(${key}, ${operation.value}) === map);`
      );
    case "map-delete":
    case "map-get":
    case "map-has":
      return `probe(${index}, () => map.${operation.kind.slice(4)}(${key}));`;
    case "set-add":
      return `probe(${index}, () => set.add(${key}) === set);`;
    case "set-delete":
    case "set-has":
      return `probe(${index}, () => set.${operation.kind.slice(4)}(${key}));`;
    case "ref":
      return `probe(${index}, () => {
  const target = ${key};
  return new WeakRef(target).deref() === target;
});`;
    case "register":
      return `probe(${index}, () => registry.register(
  ${key},
  ${expression(operation.held)},
  ${expression(operation.token)},
));`;
    case "unregister":
      return `probe(${index}, () => registry.unregister(${key}));`;
  }
}

function printJobs(jobs: readonly JobStep[]): string {
  return jobs
    .map((job, index) => {
      const link =
        index === 0 || job.link === "sibling"
          ? "Promise.resolve()"
          : `job${index - 1}`;
      const target = expression(job.target);
      return `const job${index} = ${link}.then(() => jobStep(${target}));`;
    })
    .join("\n");
}

function printCase(
  operations: readonly Operation[],
  jobs: readonly JobStep[],
): string {
  return `
const objectA = {};
const objectB = {};
const symbolA = Symbol("a");
const symbolB = Symbol("b");
const map = new WeakMap();
const set = new WeakSet();
const cleanups = [];
const registry = new FinalizationRegistry(function (held) {
  cleanups.push("callback " + String(held));
  Promise.resolve().then(() => cleanups.push("job " + String(held)));
});
function probe(index, operation) {
  try {
    console.log(index, String(operation()));
  } catch (error) {
    console.log(index, error instanceof TypeError ? "TypeError" : "other");
  }
}
${operations.map(printOperation).join("\n")}
const jobReferences = [new WeakRef({})];
const jobReports = [];
function jobStep(target) {
  jobReferences.push(new WeakRef(target));
  jobReports.push(
    jobReferences.map((reference) => typeof reference.deref()).join(" "),
  );
}
${printJobs(jobs)}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3), objectA !== objectB);
setTimeout(() => {
  console.log("cleanup", cleanups.join(", "));
  console.log("jobs", jobReports.join(", "));
}, 0);
`;
}

function weakly(token: KeyToken): boolean {
  return (
    token === "fresh-object" ||
    token === "object-a" ||
    token === "object-b" ||
    token === "symbol-a" ||
    token === "symbol-b"
  );
}

/* A fresh key never equals any earlier or later identity. */
function stable(token: KeyToken): boolean {
  return weakly(token) && token !== "fresh-object";
}

/* The source text String(held) prints for each held value token. */
function heldText(token: KeyToken): string {
  switch (token) {
    case "fresh-object":
    case "object-a":
    case "object-b":
      return "[object Object]";
    case "number":
      return "1";
    case "string":
      return "a";
    case "symbol-a":
      return "Symbol(a)";
    case "symbol-b":
      return "Symbol(b)";
    case "undefined":
      return "undefined";
  }
}

interface Registration {
  readonly held: KeyToken;
  readonly token: KeyToken;
}

interface Expectation {
  /* The observation Node.js and Deno share, without the cleanup report. */
  readonly synchronous: string;
  /* The native observation, whose last line reports the cleanup job. */
  readonly native: string;
}

/*
 * Replays the job queue: sibling jobs are queued in order by the script,
 * and a chained job joins the queue when the job it follows ends. Each
 * report lists the script's fresh reference and every job's reference in
 * creation order; only this job's target and stable targets are live.
 */
function jobReports(jobs: readonly JobStep[]): string {
  const queue = jobs.flatMap((job, index) =>
    index === 0 || job.link === "sibling" ? [index] : [],
  );
  const created: boolean[] = [false];
  const reports: string[] = [];
  for (let position = 0; position < queue.length; position += 1) {
    const index = queue[position] ?? 0;
    const stableTarget = jobs[index]?.target === "object-a";
    created.push(stableTarget);
    const current = created.length - 1;
    reports.push(
      created
        .map((live, reference) =>
          live || reference === current ? "object" : "undefined",
        )
        .join(" "),
    );
    if (jobs[index + 1]?.link === "chain") queue.push(index + 1);
  }
  return reports.join(", ");
}

function expected(
  operations: readonly Operation[],
  jobs: readonly JobStep[],
): Expectation {
  const map = new Map<KeyToken, number>();
  const set = new Set<KeyToken>();
  const tokens: KeyToken[] = [];
  let dead: Registration[] = [];
  const lines = operations.map((operation, index) => {
    const key = operation.key;
    let result: string;
    switch (operation.kind) {
      case "map-set":
        if (!weakly(key)) {
          result = "TypeError";
        } else {
          if (stable(key)) map.set(key, operation.value);
          result = "true";
        }
        break;
      case "map-get":
        result = String(stable(key) ? map.get(key) : undefined);
        break;
      case "map-has":
        result = String(stable(key) && map.has(key));
        break;
      case "map-delete":
        result = String(stable(key) && map.delete(key));
        break;
      case "set-add":
        if (!weakly(key)) {
          result = "TypeError";
        } else {
          if (stable(key)) set.add(key);
          result = "true";
        }
        break;
      case "set-has":
        result = String(stable(key) && set.has(key));
        break;
      case "set-delete":
        result = String(stable(key) && set.delete(key));
        break;
      case "ref":
        result = weakly(key) ? "true" : "TypeError";
        break;
      case "register":
        if (
          !weakly(key) ||
          (stable(key) && key === operation.held) ||
          (!weakly(operation.token) && operation.token !== "undefined")
        ) {
          result = "TypeError";
        } else {
          if (stable(operation.token)) tokens.push(operation.token);
          if (key === "fresh-object") {
            dead.push({ held: operation.held, token: operation.token });
          }
          result = "undefined";
        }
        break;
      case "unregister":
        if (!weakly(key)) {
          result = "TypeError";
        } else {
          const before = tokens.length;
          const kept = tokens.filter((token) => token !== key);
          tokens.length = 0;
          tokens.push(...kept);
          dead = dead.filter(
            (registration) => !stable(key) || registration.token !== key,
          );
          result = String(kept.length !== before);
        }
        break;
    }
    return `${index} ${result}`;
  });
  lines.push("hint 5 23 true");
  const cleanups = [
    ...dead.map((registration) => `callback ${heldText(registration.held)}`),
    ...dead.map((registration) => `job ${heldText(registration.held)}`),
  ];
  return {
    native: [
      ...lines,
      `cleanup ${cleanups.join(", ")}`,
      `jobs ${jobReports(jobs)}`,
      "",
    ].join("\n"),
    synchronous: [...lines, ""].join("\n"),
  };
}

/*
 * A reference engine may or may not collect before its timer runs, so its
 * cleanup and job reports are removed before comparison with the
 * synchronous model.
 */
function withoutCleanupReport<T extends { readonly stdout: string }>(
  observation: T,
): T {
  const lines = observation.stdout.split("\n");
  const report = lines.length - 3;
  if (
    report < 0 ||
    !lines[report]?.startsWith("cleanup ") ||
    !lines[report + 1]?.startsWith("jobs ")
  ) {
    return observation;
  }
  return {
    ...observation,
    stdout: [...lines.slice(0, report), ""].join("\n"),
  };
}

async function references(source: string): Promise<
  readonly [
    {
      readonly exitStatus: number;
      readonly stderr: string;
      readonly stdout: string;
    },
    {
      readonly exitStatus: number;
      readonly stderr: string;
      readonly stdout: string;
    },
  ]
> {
  const directory = await host.makeTemporaryDirectory("oseo-weak-property-");
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
    );
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
  "generated weak collection observations match the identity model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "WeakMap, WeakSet, WeakRef, and FinalizationRegistry agree",
      fc.asyncProperty(caseArbitrary, async (generated) => {
        const operations = [...generated.cleanup, ...generated.operations];
        const source = printCase(operations, generated.jobs);
        const expectation = expected(operations, generated.jobs);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expectation.native,
        };
        assertMatchingObservations([
          { ...expectedObservation, stdout: expectation.synchronous },
          ...(await references(source)).map(withoutCleanupReport),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-weak-collections.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
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
                  assert.ok(native.counters.guardHits > 0);
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
          "two or three FinalizationRegistry registrations of fresh " +
          "targets with generated held values and tokens, then " +
          "one to sixteen WeakMap set, get, has, and delete, WeakSet add, " +
          "has, and delete, WeakRef construction and deref, and " +
          "FinalizationRegistry register and unregister operations over " +
          "two stable objects, two unregistered symbols, a fresh " +
          "unreachable object, and three primitives that cannot be held " +
          "weakly, then one to four sibling or chained promise jobs " +
          "that each construct a WeakRef to a fresh or stable target and " +
          "dereference every earlier one, plus truthful and false number " +
          "hints and a native report of the one cleanup job for fresh " +
          "registration targets and of each job's dereferences",
        numRuns: 12,
        profile: "M5 weak collections",
        seed: 0x6000_7500,
        sizeLimit:
          "at most three fresh registrations and sixteen operations over " +
          "eight reviewed key tokens, four promise jobs, one " +
          "WeakMap, one WeakSet, and one FinalizationRegistry",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
