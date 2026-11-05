/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  type GeneratedModule,
  type GeneratedProgram,
  logText,
  type ModelOutcome,
  modelProgram,
  type ModuleStep,
  moduleSource,
  sortedLines,
} from "../import-operation-model.ts";
import {
  compileModuleFile,
  host,
  nativeSkip,
  nativeTarget,
  runNative,
  runReference,
  specializations,
} from "../import-operation-support.ts";

const { assertAsyncProperty, propertySize } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

const large = propertySize() === "large";

/**
 * A program of two to five modules (seven when large). Each module has
 * up to two static requests and up to four steps; an `import` step names
 * any module, including itself, its ancestors, and modules nothing else
 * requests, so lazy targets, cycles through `import()`, joined pending
 * evaluations, and self-requests all arise. Shrinking keeps the graph
 * shape, the request schedule, and which module throws or awaits.
 */
const programArbitrary: fc.Arbitrary<GeneratedProgram> = fc
  .integer({ max: large ? 7 : 5, min: 2 })
  .chain((count) => {
    const stepArbitrary: fc.Arbitrary<ModuleStep> = fc.oneof(
      { arbitrary: fc.constant({ kind: "await" } as const), weight: 3 },
      {
        arbitrary: fc.record({
          awaited: fc.boolean(),
          kind: fc.constant("import" as const),
          target: fc.integer({ max: count - 1, min: 0 }),
        }),
        weight: 4,
      },
      {
        arbitrary: fc.record({
          kind: fc.constant("probe" as const),
          length: fc.integer({ max: 3, min: 1 }),
        }),
        weight: 2,
      },
      { arbitrary: fc.constant({ kind: "throw" } as const), weight: 1 },
    );
    return fc.record({
      modules: fc.array(
        fc.record({
          imports: fc.uniqueArray(fc.integer({ max: count - 1, min: 0 }), {
            maxLength: 2,
          }),
          steps: fc.array(stepArbitrary, { maxLength: large ? 5 : 4 }),
        }),
        { maxLength: count, minLength: count },
      ),
    });
  })
  .map((program) => ({
    modules: program.modules.map((module, index): GeneratedModule => {
      // A body ends at its first throw, so later steps are never kept.
      const throwAt = module.steps.findIndex((step) => step.kind === "throw");
      const steps =
        throwAt < 0 ? module.steps : module.steps.slice(0, throwAt + 1);
      // The entry requests module 1 dynamically first, so every program
      // exercises the import operation.
      return index === 0
        ? {
            imports: module.imports.filter((target) => target !== 1),
            steps: [{ awaited: false, kind: "import", target: 1 }, ...steps],
          }
        : { imports: module.imports, steps };
    }),
  }));

/**
 * Node.js and Deno load asynchronously, so only host-independent facts
 * are compared: the multiset of logged lines, which records each
 * module's single evaluation, every await and reaction, and each
 * request's namespace or error, together with the entry's settlement.
 * A host that stops at the entry's rejection prints a subset.
 */
function assertReference(
  label: string,
  observation: { exitStatus: number; stderr: string; stdout: string },
  outcome: ModelOutcome,
): void {
  const expected = sortedLines(logText(outcome.log));
  const actual = sortedLines(observation.stdout);
  if (outcome.stalled) {
    assert.notEqual(observation.exitStatus, 0, label);
    assert.deepEqual(actual, expected, label);
    return;
  }
  if (outcome.error == null) {
    assert.equal(observation.exitStatus, 0, `${label}: ${observation.stderr}`);
    assert.deepEqual(actual, expected, label);
    return;
  }
  assert.notEqual(observation.exitStatus, 0, label);
  assert.match(observation.stderr, new RegExp(`Error: ${outcome.error}\\b`));
  const remaining = [...expected];
  for (const line of actual) {
    const position = remaining.indexOf(line);
    assert.ok(position >= 0, `${label} printed an unexpected ${line}`);
    remaining.splice(position, 1);
  }
}

/** Every module reachable from `from` along `edges`, with `from`. */
function reachable(
  from: number,
  edges: (index: number) => readonly number[],
): ReadonlySet<number> {
  const seen = new Set([from]);
  const work = [from];
  while (work.length > 0) {
    for (const next of edges(work.pop()!)) {
      if (!seen.has(next)) {
        seen.add(next);
        work.push(next);
      }
    }
  }
  return seen;
}

/** The entry and every module in a static cycle with it. */
function entryCycle(program: GeneratedProgram): ReadonlySet<number> {
  const forward = reachable(0, (index) => program.modules[index]!.imports);
  const backward = reachable(0, (index) =>
    [...program.modules.keys()].filter((parent) =>
      program.modules[parent]!.imports.includes(index),
    ),
  );
  return new Set([...forward].filter((index) => backward.has(index)));
}

async function assertProgram(program: GeneratedProgram): Promise<void> {
  const outcome = modelProgram(program);
  const directory = await host.makeTemporaryDirectory(
    "oseo-import-operation-property-",
  );
  let succeeded = false;
  try {
    for (const index of program.modules.keys()) {
      await host.writeTextFile(
        `${directory}/m${index}.mjs`,
        moduleSource(program, index),
      );
    }
    const entry = `${directory}/m0.mjs`;
    // Deno is no reference for two shapes. It settles a request for the
    // entry, or for a module in a static cycle with it, by its own
    // evaluation instead of the entry's cycle, so a namespace read can
    // meet an uninitialized export, a rejected cycle fulfills, and a
    // cycle through the entry stops waiting. It also reports every
    // module's unsettled await, where Node.js reports only the entry's.
    const cycle = entryCycle(program);
    const requestsEntryCycle = program.modules.some((module) =>
      module.steps.some(
        (step) => step.kind === "import" && cycle.has(step.target),
      ),
    );
    const references =
      outcome.unsettled || requestsEntryCycle
        ? (["node"] as const)
        : (["node", "deno"] as const);
    for (const reference of references) {
      assertReference(
        reference,
        await runReference(reference, entry, directory),
        outcome,
      );
    }
    for (const specialization of specializations) {
      const native = await runNative(
        await compileModuleFile(entry, specialization),
      );
      // Native execution completes every load synchronously, as the
      // model does, and drains every job before reporting the entry.
      assert.equal(native.stdout, logText(outcome.log), specialization);
      if (outcome.stalled) {
        assert.equal(native.exitStatus, 1);
        assert.match(
          native.stderr,
          /error\[OSEO3001\]: Top-level await cannot make progress\.\n/u,
        );
      } else if (outcome.error == null) {
        assert.equal(native.exitStatus, 0, native.stderr);
        assert.equal(native.stderr, "");
      } else {
        assert.equal(native.exitStatus, 1);
        assert.match(
          native.stderr,
          new RegExp(`error\\[OSEO2001\\]: Error: ${outcome.error}\\n`),
        );
      }
    }
    succeeded = true;
  } catch (error) {
    throw new Error(
      `Import operation property artifacts retained at ${directory}\n` +
        `program=${JSON.stringify(program)}`,
      { cause: error },
    );
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test(
  "generated import() programs follow the edition's evaluation order",
  { skip: nativeSkip },
  async () => {
    await assertAsyncProperty(
      "static-specifier import() matches the edition model natively and " +
        "Node.js and Deno on host-independent observations",
      fc.asyncProperty(programArbitrary, assertProgram),
      {
        context:
          nativeTarget == null || host.executionHost == null
            ? ["target=unsupported host=unknown"]
            : [
                `target=${nativeTarget.name}`,
                `host=${host.executionHost.operatingSystem}/` +
                  host.executionHost.architecture,
                "native-collector=forced",
              ],
        domain:
          "module programs of two to five modules (seven when large) " +
          "with up to two static requests each, whose bodies await, " +
          "start promise reaction chains, throw, or request any module " +
          "with a literal import(), awaited or through a reaction, " +
          "including self-requests, cycles, lazy-only targets, and " +
          "requests that join pending evaluations",
        numRuns: 6,
        profile: "Static-specifier import operation",
        seed: 0x6000_ac00,
        sizeLimit:
          "at most seven modules, two static requests and five steps " +
          "per module, and three reactions per chain",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
