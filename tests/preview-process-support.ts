/* eslint-disable no-await-in-loop -- Native policies run serially. */

import assert from "node:assert/strict";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  defaultComponents,
  runNativeUnits,
} from "../packages/cli/src/index.ts";
import type { NativeExecutionOptions } from "../packages/cli/src/index.ts";
import {
  buildModuleGraph,
  compileModuleGraph,
  compileSource,
} from "../packages/compiler/src/index.ts";
import type {
  CompilerHost,
  ProcessObservation,
  MirProgram,
  SpecializationMode,
} from "../packages/compiler/src/index.ts";
import {
  createFileModuleLoader,
  createNodeHost,
  fileModuleResolver,
} from "../packages/host/src/index.ts";
import { nativeToolchain } from "./native-toolchain.ts";

export type { NativeExecutionOptions };
export { assertMatchingObservations } from "../packages/testkit/src/index.ts";

export const processHost: CompilerHost = createNodeHost();

/** Compile a real graph, including builtin nodes without source syntax. */
export async function compileProcessProgram(
  host: CompilerHost,
  path: string,
  source: string,
  specialization: SpecializationMode,
  module: boolean,
  test262Host = false,
): Promise<MirProgram> {
  if (!module) {
    const compiled = compileSource(
      defaultComponents.frontend,
      { source, sourceId: path },
      { specialization, test262Host },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir);
    return compiled.mir;
  }
  await host.writeTextFile(path, source);
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
  const compiled = compileModuleGraph(graph.graph, { specialization });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir);
  return compiled.mir;
}

/** Run output/status as observations, including deliberate nonzero exits. */
export async function runProcessProgram(
  host: CompilerHost,
  source: string,
  execution: NativeExecutionOptions = {},
  module = false,
  test262Host = false,
): Promise<readonly ProcessObservation[]> {
  const directory = await host.makeTemporaryDirectory("oseo-process-");
  let succeeded = false;
  try {
    const path = `${directory}/entry.ts`;
    const observed: ProcessObservation[] = [];
    for (const specialization of ["disabled", "enabled"] as const) {
      const mir = await compileProcessProgram(
        host,
        path,
        source,
        specialization,
        module,
        test262Host,
      );
      const environment = {
        variables: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              (entry): entry is [string, string] => entry[1] != null,
            ),
          ),
          ...execution.environment?.variables,
          OSEO_GC_EVERY_SAFEPOINT: "1",
        },
      };
      const result = await runNativeUnits(
        { sources: [cBackend.emit(mir)], prebuiltObjectPaths: [] },
        path,
        host,
        nativeToolchain,
        "enabled",
        undefined,
        undefined,
        { ...execution, environment, captureBytes: true },
      );
      assert.equal(result.executed, true, result.stderr);
      observed.push(result);
    }
    succeeded = true;
    return observed;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

/** Reference processes use the same stdin, environment, and user argv. */
export async function processReferences(
  host: CompilerHost,
  source: string,
  execution: NativeExecutionOptions = {},
): Promise<readonly ProcessObservation[]> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-process-reference-",
  );
  try {
    const path = `${directory}/entry.ts`;
    await host.writeTextFile(path, source);
    return await Promise.all([
      host.run({
        ...execution,
        command: "node",
        cwd: directory,
        environment: {
          variables: {
            ...Object.fromEntries(
              Object.entries(process.env).filter(
                (entry): entry is [string, string] => entry[1] != null,
              ),
            ),
            ...execution.environment?.variables,
          },
        },
        args: [path, ...(execution.args ?? [])],
        captureBytes: true,
      }),
      host.run({
        ...execution,
        command: "deno",
        cwd: directory,
        environment: {
          variables: {
            ...Object.fromEntries(
              Object.entries(process.env).filter(
                (entry): entry is [string, string] => entry[1] != null,
              ),
            ),
            ...execution.environment?.variables,
          },
        },
        args: [
          "run",
          "--quiet",
          "--allow-env",
          path,
          ...(execution.args ?? []),
        ],
        captureBytes: true,
      }),
    ]);
  } finally {
    await host.remove(directory);
  }
}
