/* eslint-disable no-await-in-loop -- Demo executables build serially. */

import assert from "node:assert/strict";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { cBackend } from "../../../packages/backend-c/src/index.ts";
import { defaultComponents } from "../../../packages/cli/src/index.ts";
import {
  buildModuleGraph,
  compileModuleGraph,
  targetForExecutionHost,
} from "../../../packages/compiler/src/index.ts";
import type {
  CompilerHost,
  ProcessObservation,
  SpecializationMode,
} from "../../../packages/compiler/src/index.ts";
import {
  createFileModuleLoader,
  fileModuleResolver,
} from "../../../packages/host/src/index.ts";
import {
  type RuntimeObservationCounters,
  withNativeFixture,
} from "../../../packages/testkit/src/index.ts";
import { runNativeCli } from "../../native-cli.ts";
import { nativeToolchain } from "../../native-toolchain.ts";
import {
  allDemoCases,
  assertDemoObservation,
  demoSources,
  numericEdgeInput,
  numericEdgeOutput,
  numericForms,
} from "../../preview-demos-cases.ts";
import type { DemoCase, DemoObservation } from "../../preview-demos-cases.ts";

const policies = [
  { name: "enabled", args: [] },
  { name: "disabled", args: ["--no-specialization"] },
] as const;

function examplePath(source: string): string {
  return fileURLToPath(new URL(`../../../examples/${source}`, import.meta.url));
}

function environment(
  demo: Pick<DemoCase, "forcedCollection" | "label">,
): Record<string, string> {
  const variables = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] != null && entry[0] !== "DEMO_LABEL",
    ),
  );
  if (demo.label !== undefined) variables.DEMO_LABEL = demo.label;
  if (demo.forcedCollection !== false) {
    variables.OSEO_GC_EVERY_SAFEPOINT = "1";
  }
  return variables;
}

function demoObservation(observed: ProcessObservation): DemoObservation {
  assert.ok(observed.stdoutBytes, "byte capture was requested");
  assert.ok(observed.stderrBytes, "byte capture was requested");
  return {
    stdout: observed.stdoutBytes,
    stderr: observed.stderrBytes,
    status: observed.exitStatus,
  };
}

/**
 * Build one numeric form with observations, run the edge input with
 * argument 2, and return its counters after checking the ordinary output.
 */
async function observeNumericForm(
  host: CompilerHost,
  source: string,
  specialization: SpecializationMode,
): Promise<RuntimeObservationCounters> {
  const path = examplePath(source);
  const graph = await buildModuleGraph(
    defaultComponents.moduleFrontend,
    createFileModuleLoader(
      host,
      defaultComponents.runtime.getRuntimeInput().abiVersion,
    ),
    fileModuleResolver,
    pathToFileURL(path).href,
  );
  assert.deepEqual(graph.diagnostics, []);
  assert.ok(graph.graph);
  const compiled = compileModuleGraph(graph.graph, {
    observeSpecialization: true,
    specialization,
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir);
  const target =
    host.executionHost == null
      ? undefined
      : targetForExecutionHost(host.executionHost);
  assert.ok(target);
  const where = `${source} observed, specialization ${specialization}`;
  return await withNativeFixture(
    {
      backend: cBackend,
      execution: {
        args: ["2"],
        captureBytes: true,
        environment: { variables: environment({}) },
        input: numericEdgeInput,
      },
      host,
      input: compiled.mir,
      operation: "execute",
      runtime: defaultComponents.runtime,
      target,
      toolchain: nativeToolchain,
    },
    (native) => {
      assert.equal(native.exitStatus, 0, `${where}: ${native.stderr}`);
      assert.equal(native.stdout, numericEdgeOutput, where);
      assert.equal(native.stderr, "", where);
      assert.ok(native.counters, where);
      return native.counters;
    },
  );
}

/**
 * The examples build as retained executables through the CLI in the lane's
 * configuration, so `test:native:optimized` covers the optimized programs
 * on both execution targets. Each fixed case from the reference test runs
 * against the executable of both specialization policies.
 */
export async function runPreviewDemoScenarios(
  host: CompilerHost,
): Promise<void> {
  const directory = await host.makeTemporaryDirectory("oseo-demos-");
  let succeeded = false;
  try {
    for (const source of demoSources) {
      for (const policy of policies) {
        const output = join(
          directory,
          `${source.replace(/\.ts$/u, "")}-${policy.name}`,
        );
        const built = await runNativeCli(
          {
            args: ["build", examplePath(source), "-o", output, ...policy.args],
            version: "0.0.0",
          },
          host,
        );
        assert.deepEqual(
          built,
          { exitStatus: 0, stderr: "", stdout: "" },
          `${source} build, specialization ${policy.name}`,
        );
        for (const demo of allDemoCases) {
          if (demo.source !== source) continue;
          const observed = await host.run({
            args: demo.args,
            captureBytes: true,
            command: output,
            cwd: directory,
            environment: { variables: environment(demo) },
            input: demo.input,
          });
          assertDemoObservation(
            demoObservation(observed),
            demo,
            `native ${policy.name}`,
          );
        }
      }
    }
    await assertNumericSpecialization(host);
    succeeded = true;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

/**
 * The edge input runs two batches of ten pairs. In the hinted form, the
 * first pair is a small-integer hit, the next two pass both tag guards and
 * overflow checked addition, and the remaining seven fail a tag guard.
 * Property-cache guards increment the same hit and miss counters, and the
 * specialization policy changes them too, so the M2 share is the
 * difference from the unhinted form under the same policy: the sources
 * differ only in the add() hints. Both kinds of miss reach the compiled
 * generic addition, and the output check above proves its result.
 */
async function assertNumericSpecialization(host: CompilerHost): Promise<void> {
  const observed = new Map<string, RuntimeObservationCounters>();
  for (const source of numericForms) {
    for (const specialization of ["disabled", "enabled"] as const) {
      observed.set(
        `${source} ${specialization}`,
        await observeNumericForm(host, source, specialization),
      );
    }
  }
  const counters = (key: string): RuntimeObservationCounters => {
    const value = observed.get(key);
    assert.ok(value, key);
    return value;
  };
  for (const specialization of ["disabled", "enabled"] as const) {
    const unhinted = counters(`numeric-unhinted.ts ${specialization}`);
    // String hints select no candidate either. That is suppression, not a
    // guard miss.
    assert.deepEqual(
      counters(`numeric-wrong-hints.ts ${specialization}`),
      unhinted,
      `string hints select no specialization (${specialization})`,
    );
    assert.equal(unhinted.overflowMisses, 0, specialization);
  }
  assert.deepEqual(
    counters("numeric-hinted.ts disabled"),
    counters("numeric-unhinted.ts disabled"),
    "the disabled policy selects no specialization",
  );
  const hinted = counters("numeric-hinted.ts enabled");
  const unhinted = counters("numeric-unhinted.ts enabled");
  assert.deepEqual(
    {
      guardHits: hinted.guardHits - unhinted.guardHits,
      guardMisses: hinted.guardMisses - unhinted.guardMisses,
      overflowMisses: hinted.overflowMisses,
      genericAdditionCalls:
        unhinted.genericAdditionCalls - hinted.genericAdditionCalls,
    },
    {
      guardHits: 2,
      guardMisses: 14,
      overflowMisses: 4,
      genericAdditionCalls: 2,
    },
    "hinted add() hits, tag misses, and overflow misses",
  );
}
