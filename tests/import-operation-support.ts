/* eslint-disable no-await-in-loop -- Native policies run serially. */
/**
 * Shared native execution for the import-operation fixtures and property
 * suite. Programs compile with the static-specifier `import()` subset
 * enabled in the frontends, which the default components still leave off,
 * and run under both specialization policies with collection forced at
 * every safepoint.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import process from "node:process";

import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  buildModuleGraph,
  buildScriptRequests,
  compileModuleGraph,
  compileSource,
  type CompilerHost,
  type MirProgram,
  type TargetDescription,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import {
  createFileModuleLoader,
  createNodeHost,
  fileModuleResolver,
} from "../packages/host/src/index.ts";
import {
  createBabelFrontend,
  createBabelModuleFrontend,
} from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { withNativeFixture } from "../packages/testkit/src/index.ts";
import { nativeToolchain } from "./native-toolchain.ts";

export const host: CompilerHost = createNodeHost();
export const nativeTarget: TargetDescription | undefined =
  targetForExecutionHost(
    host.executionHost ?? {
      architecture: "unknown",
      operatingSystem: "unknown",
    },
  );
export const nativeSkip: string | false =
  nativeTarget == null ? "requires a supported native host" : false;

const scriptFrontend = createBabelFrontend({ staticSpecifierImports: true });
const moduleFrontend = createBabelModuleFrontend({
  staticSpecifierImports: true,
});

export type Specialization = "disabled" | "enabled";

/** One native run, with the collector counters it reported. */
export interface NativeRun {
  readonly collections: number;
  readonly emittedC: string;
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}

/** Compile the module graph rooted at `entryPath`. */
export async function compileModuleFile(
  entryPath: string,
  specialization: Specialization,
): Promise<MirProgram> {
  const entry = new URL(`file://${entryPath}`).href;
  const graph = await buildModuleGraph(
    moduleFrontend,
    createFileModuleLoader(host),
    fileModuleResolver,
    entry,
  );
  assert.deepEqual(graph.diagnostics, []);
  assert.ok(graph.graph);
  const compiled = compileModuleGraph(graph.graph, {
    observeSpecialization: true,
    specialization,
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir);
  return compiled.mir;
}

/**
 * Compile a Script whose `import()` calls resolve against its own file
 * path, as the test262 runner composes a Script test.
 */
export async function compileScriptFile(
  scriptPath: string,
  specialization: Specialization,
): Promise<MirProgram> {
  const canonicalId = new URL(`file://${scriptPath}`).href;
  const source = await readFile(scriptPath, "utf8");
  const parsed = scriptFrontend.parse({ source, sourceId: canonicalId });
  assert.deepEqual(parsed.diagnostics, []);
  assert.ok(parsed.program);
  const requests = await buildScriptRequests(
    moduleFrontend,
    createFileModuleLoader(host),
    fileModuleResolver,
    [{ canonicalId, program: parsed.program }],
  );
  assert.deepEqual(requests.diagnostics, []);
  assert.ok(requests.closure);
  const compiled = compileSource(
    scriptFrontend,
    { source, sourceId: canonicalId },
    { observeSpecialization: true, specialization },
    { canonicalId, closure: requests.closure },
  );
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir);
  return compiled.mir;
}

const counterPrefix = "OSEO_OBSERVATIONS ";

/**
 * Build and run one program with collection at every safepoint. A
 * nonzero exit is an observation here, so a failed run is read back from
 * the observation record the fixture runner retains, and then removed.
 */
export async function runNative(mir: MirProgram): Promise<NativeRun> {
  if (nativeTarget == null) throw new Error("No native target.");
  const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
  process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
  try {
    return await withNativeFixture(
      {
        backend: cBackend,
        host,
        input: mir,
        operation: "execute",
        runtime: cRuntimeProvider,
        target: nativeTarget,
        toolchain: nativeToolchain,
      },
      (native) => ({
        collections: native.counters?.collections ?? 0,
        emittedC: native.emittedC,
        exitStatus: native.exitStatus,
        stderr: native.stderr,
        stdout: native.stdout,
      }),
    );
  } catch (error) {
    const directory = /Native artifacts retained at (.+)$/u.exec(
      error instanceof Error ? error.message : "",
    )?.[1];
    if (directory == null) throw error;
    // SAFETY: withNativeFixture writes this record with these fields, and
    // each one read below is checked before use.
    const record = JSON.parse(
      await readFile(`${directory}/native-observation.json`, "utf8"),
    ) as {
      readonly emittedC?: string;
      readonly observation?: {
        readonly exitStatus: number;
        readonly stderr: string;
        readonly stdout: string;
      };
    };
    const observation = record.observation;
    // Only a program that ran and exited abruptly is an observation; a
    // build failure stays a test failure.
    if (observation == null || record.emittedC == null) throw error;
    await host.remove(directory);
    const lines = observation.stderr.split(/(?<=\n)/u);
    const counters = lines.findLast((line) => line.startsWith(counterPrefix));
    // SAFETY: The runtime prints this marker as one JSON object whose
    // collections field is a count; testkit validates the same line.
    const parsed =
      counters == null
        ? { collections: 0 }
        : (JSON.parse(counters.slice(counterPrefix.length)) as {
            readonly collections: number;
          });
    return {
      collections: parsed.collections,
      emittedC: record.emittedC,
      exitStatus: observation.exitStatus,
      stderr: lines.filter((line) => line !== counters).join(""),
      stdout: observation.stdout,
    };
  } finally {
    if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
  }
}

/** A reference host's run of a module entry. */
export function runReference(
  reference: "deno" | "node",
  entryPath: string,
  cwd: string,
): ReturnType<typeof host.run> {
  return host.run(
    reference === "node"
      ? { args: [entryPath], command: process.execPath, cwd }
      : {
          args: ["run", "--quiet", "--allow-read", entryPath],
          command: "deno",
          cwd,
        },
  );
}

export const specializations: readonly Specialization[] = [
  "disabled",
  "enabled",
];
