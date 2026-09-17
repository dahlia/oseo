/* eslint-disable no-await-in-loop -- Ordered cache and build operations. */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";
import { parse } from "@babel/parser";
import { isObject } from "./value-kinds.ts";
import {
  defaultComponents,
  runNativeUnits,
} from "../packages/cli/src/index.ts";
import type { CliResult } from "../packages/cli/src/index.ts";
import { emitScriptFragments } from "../packages/backend-c/src/index.ts";
import {
  compileBodyFragment,
  compileHarnessFragment,
  prepareHarnessObject,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import type {
  CompilerHost,
  HarnessFragmentResult,
  HarnessObjectKeyInput,
  NativeToolchain,
  SourceInput,
} from "../packages/compiler/src/index.ts";
import type { Test262ExecutionRequest } from "./test262.ts";

/** Original source components; the assembled source remains authoritative. */
export interface Test262FragmentInput {
  readonly body: string;
  readonly sources: readonly SourceInput[];
  readonly strict: boolean;
  readonly raw: boolean;
}

/**
 * Operational counts outside the manifest. Executed excludes the same owned
 * compile-stage diagnostics as the reviewed runner, not merely process starts.
 */
export interface FragmentBuildCounts {
  readonly attempts: Record<string, number>;
  readonly executed: Record<string, number>;
  harnessComparisons: number;
  deterministicObjects: number;
  objectsBuilt: number;
  objectsReused: number;
}

function digest(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Validate cached objects under the stage 2 exclusive publication lock. */
export function withHarnessIntegrity(host: CompilerHost): CompilerHost {
  const cache = host.cache;
  if (cache == null) return host;
  return {
    ...host,
    cache: {
      ...cache,
      async hasFile(path) {
        if (!path.endsWith(".o")) return await cache.hasFile(path);
        try {
          return (
            digest(await readFile(path)) ===
            (await host.readTextFile(`${path}.sha256`))
          );
        } catch (error) {
          if (
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          )
            return false;
          throw error;
        }
      },
      async publishFile(source, destination) {
        await cache.publishFile(source, destination);
        if (!destination.endsWith(".o")) return;
        const marker = `${source}.sha256`;
        await host.writeTextFile(marker, digest(await readFile(source)));
        await cache.publishFile(marker, `${destination}.sha256`);
      },
    },
  };
}

async function packageIdentity(names: readonly string[]): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await readFile(new URL("../aube-lock.yaml", import.meta.url)));
  for (const name of names) {
    const root = new URL(`../packages/${name}/`, import.meta.url);
    hash.update(
      JSON.stringify([
        name,
        await readFile(new URL("package.json", root), "utf8"),
      ]),
    );
    const source = new URL("src/", root);
    for (const path of (
      await readdir(source, { recursive: true })
    ).toSorted()) {
      if (!path.endsWith(".ts")) continue;
      hash.update(
        JSON.stringify([path, await readFile(new URL(path, source), "utf8")]),
      );
    }
  }
  return hash.digest("hex");
}

function spans(program: ReturnType<typeof parse>["program"], offset: number) {
  return [...program.directives, ...program.body].map((node) => [
    node.type,
    node.start! + offset,
    node.end! + offset,
  ]);
}

/**
 * Statement ranges prove that joining did not consume a boundary through ASI,
 * comments, expressions, or directives. Compiler admission owns resolution.
 */
export function fragmentBoundaryReason(
  input: Test262FragmentInput,
  assembled: string,
): "assembly" | "boundary" | "with" | undefined {
  const directive = input.strict ? '"use strict";\n' : "";
  const prefix = directive + input.sources.map((s) => s.source).join("\n");
  if (assembled !== `${prefix}\n${input.body}\n`) return "assembly";
  try {
    const options = { sourceType: "script" as const, tokens: true };
    const whole = parse(assembled, options);
    const harness = parse(prefix, options);
    const body = parse(directive + input.body + "\n", options);
    if (
      whole.tokens?.some(
        (token) => isObject(token.type) && token.type.keyword === "with",
      )
    )
      return "with";
    const expected = [
      ...spans(harness.program, 0),
      ...spans(body.program, prefix.length + 1 - directive.length).slice(
        input.strict ? 1 : 0,
      ),
    ];
    if (JSON.stringify(spans(whole.program, 0)) !== JSON.stringify(expected)) {
      return "boundary";
    }
    return undefined;
  } catch {
    return "boundary";
  }
}

/** One run's counters and explicit split-or-whole execution boundary. */
export interface Test262FragmentExecutor {
  readonly counts: FragmentBuildCounts;
  execute(
    request: Test262ExecutionRequest,
    whole: () => Promise<CliResult>,
  ): Promise<CliResult>;
}

/** Coalesce workers within a run without sharing case-dependent state. */
export function createTest262FragmentExecutor(
  originalHost: CompilerHost,
  toolchain: NativeToolchain,
): Test262FragmentExecutor {
  const host = withHarnessIntegrity(originalHost);
  const bundles = new Map<string, HarnessFragmentResult>();
  const emittedHarnesses = new Map<string, string>();
  const objects = new Map<string, Promise<string>>();
  const counts: FragmentBuildCounts = {
    attempts: {},
    executed: {},
    harnessComparisons: 0,
    deterministicObjects: 0,
    objectsBuilt: 0,
    objectsReused: 0,
  };
  const target =
    host.executionHost == null
      ? undefined
      : targetForExecutionHost(host.executionHost);
  const initialize = async () => {
    if (
      host.cache == null ||
      target == null ||
      toolchain.environment == null ||
      toolchain.runtimeArchiveReuse == null
    ) {
      throw new Error("Fragment toolchain metadata is unavailable.");
    }
    const environment = await host.captureEnvironment?.(toolchain.environment);
    if (environment == null) throw new Error("Missing toolchain environment.");
    const runtime = defaultComponents.runtime.getRuntimeInput();
    const runtimeAssets = await Promise.all(
      runtime.assets.map(async (asset) => ({
        name: asset.name,
        kind: asset.kind,
        contents: await host.readTextFile(asset.url),
      })),
    );
    const identity = await host.run(
      toolchain.runtimeArchiveReuse.createIdentityRequest(
        process.cwd(),
        environment,
      ),
    );
    if (identity.exitStatus !== 0 || identity.stdout.trim() === "") {
      throw new Error("The native toolchain identity is unavailable.");
    }
    return {
      target,
      toolchainEnvironment: environment,
      toolchainIdentity: identity.stdout.trim(),
      runtimeAbiVersion: runtime.abiVersion,
      runtimeAssets,
      frontendIdentity: await packageIdentity([
        "parser-babel",
        "cli",
        "unicode",
      ]),
      compilerIdentity: await packageIdentity(["compiler"]),
      backendIdentity: await packageIdentity(["backend-c"]),
    };
  };
  let initialized: ReturnType<typeof initialize> | undefined;
  async function observe(reason: string, execute: () => Promise<CliResult>) {
    counts.attempts[reason] = (counts.attempts[reason] ?? 0) + 1;
    const result = await execute();
    const code = /^.+?:\d+:\d+: error\[(OSEO\d{4})\]/mu.exec(
      result.stderr,
    )?.[1];
    if (
      result.exitStatus === 0 ||
      (code !== "OSEO0001" && code !== "OSEO1001" && code !== "OSEO3001")
    ) {
      counts.executed[reason] = (counts.executed[reason] ?? 0) + 1;
    }
    return result;
  }
  return {
    counts,
    async execute(
      request: Test262ExecutionRequest,
      whole: () => Promise<CliResult>,
    ) {
      const fallback = (reason: string) => observe(reason, whole);
      if (process.env.OSEO_TEST262_HARNESS_REUSE === "disabled") {
        return await fallback("bypass");
      }
      if (request.mode === "module") return await fallback("module");
      const input = request.fragment;
      if (input == null) return await fallback("metadata");
      if (input.raw) return await fallback("raw");
      const key = JSON.stringify([
        input.sources,
        input.strict,
        request.specialization,
      ]);
      let prepared = bundles.get(key);
      if (prepared == null) {
        prepared = compileHarnessFragment(
          defaultComponents.frontend,
          input.sources,
          input.strict,
          { specialization: request.specialization },
        );
        bundles.set(key, prepared);
      }
      if (prepared.kind !== "compiled") return await fallback("harness");
      if (prepared.harness.strict !== input.strict)
        return await fallback("strictness");
      const body = compileBodyFragment(
        defaultComponents.frontend,
        prepared.harness,
        {
          sourceId: request.sourceId,
          source: input.body + "\n",
        },
      );
      if (body.kind !== "compiled") return await fallback(body.reason);
      const boundary = fragmentBoundaryReason(input, request.source);
      if (boundary != null) return await fallback(boundary);
      const prefix = input.sources.map((s) => s.source).join("\n") + "\n";
      const emitted = emitScriptFragments(prepared.harness, body.body, {
        sourceId: request.sourceId,
        harnessLineOffset: 0,
        bodyLineOffset: prefix.match(/\r\n|[\n\r\u2028\u2029]/gu)?.length ?? 0,
      });
      const prior = emittedHarnesses.get(key);
      if (prior != null && prior !== emitted.harness.source) {
        throw new Error("Harness C changed across bodies.");
      }
      if (prior != null) counts.harnessComparisons += 1;
      emittedHarnesses.set(key, emitted.harness.source);
      const harness = prepared.harness;
      let object = objects.get(key);
      if (object == null) {
        object = (async () => {
          if (initialized == null) {
            initialized = initialize();
            void initialized.catch(() => {
              initialized = undefined;
            });
          }
          const common = await initialized;
          const keyInput: HarnessObjectKeyInput = {
            ...common,
            fragmentAbiVersion: harness.abi,
            harnessSources: input.sources,
            strict: input.strict,
            specialization: request.specialization,
            observeSpecialization: false,
            generatedSource: emitted.harness.source,
          };
          const built = await prepareHarnessObject(host, toolchain, keyInput);
          if (process.env.OSEO_TEST262_VERIFY_HARNESS_OBJECTS === "1") {
            const { cache: _cache, ...uncached } = host;
            const rebuilt = await prepareHarnessObject(
              uncached,
              toolchain,
              keyInput,
            );
            try {
              const [first, second] = await Promise.all([
                readFile(built.objectPath),
                readFile(rebuilt.objectPath),
              ]);
              if (!first.equals(second)) {
                throw new Error(
                  "Harness object bytes changed across directories.",
                );
              }
              counts.deterministicObjects += 1;
            } finally {
              await host.remove(dirname(rebuilt.objectPath));
            }
          }
          if (built.cacheHit) counts.objectsReused += 1;
          else counts.objectsBuilt += 1;
          return built.objectPath;
        })();
        objects.set(key, object);
        void object.catch(() => objects.delete(key));
      }
      const objectPath = await object;
      return await observe("split", () =>
        runNativeUnits(
          {
            sources: [emitted.launcher, emitted.body],
            prebuiltObjectPaths: [objectPath],
          },
          request.sourceId,
          host,
          toolchain,
          process.env.OSEO_RUNTIME_ARCHIVE_REUSE === "disabled"
            ? "disabled"
            : "enabled",
        ),
      );
    },
  };
}
