import type {
  CompilerHost,
  HarnessObjectKeyInput,
  NativeToolchain,
} from "./native.ts";

/** Published object ownership belongs to the host cache, not the build dir. */
export interface PreparedHarnessObject {
  readonly key: string;
  readonly objectPath: string;
  readonly cacheHit: boolean;
}

/**
 * Build a normalized harness object once under the host's exclusive key lock.
 * Without persistent storage the caller owns the returned temporary directory.
 */
export async function prepareHarnessObject(
  host: CompilerHost,
  toolchain: NativeToolchain,
  input: HarnessObjectKeyInput,
): Promise<PreparedHarnessObject> {
  const reuse = toolchain.harnessObjectReuse;
  if (reuse == null) throw new Error("Toolchain lacks harness object support.");
  const key = await reuse.createKey(input);
  const cache = host.cache;
  const directory =
    cache == null ? undefined : await cache.getDirectory("harness-objects");
  const objectPath = directory == null ? undefined : `${directory}/${key}.o`;
  const lock =
    objectPath == null
      ? undefined
      : await cache!.acquireFileLock(`${objectPath}.lock`);
  let work: string | undefined;
  try {
    if (objectPath != null && (await cache!.hasFile(objectPath))) {
      return { key, objectPath, cacheHit: true };
    }
    work = await host.makeTemporaryDirectory("oseo-harness-");
    await Promise.all(
      input.runtimeAssets.map(async (asset) => {
        if (asset.kind !== "header") return;
        if (!/^[A-Za-z0-9_.-]+$/u.test(asset.name) || asset.name === "..") {
          throw new Error("Runtime header requires a flat staging name.");
        }
        await host.writeTextFile(`${work}/${asset.name}`, asset.contents);
      }),
    );
    await host.writeTextFile(`${work}/harness.c`, input.generatedSource);
    const observed = await host.run(
      reuse.createBuildRequest({
        workingDirectory: work,
        target: input.target,
        environment: input.toolchainEnvironment,
      }),
    );
    if (observed.exitStatus !== 0) {
      throw new Error(`Harness object build failed: ${observed.stderr}`);
    }
    const built = `${work}/harness.o`;
    if (objectPath == null) {
      work = undefined;
      return { key, objectPath: built, cacheHit: false };
    }
    await cache!.publishFile(built, objectPath);
    return { key, objectPath, cacheHit: false };
  } finally {
    try {
      if (work != null) await host.remove(work);
    } finally {
      await lock?.release();
    }
  }
}

/** Exact normalized adapter invocations, independent of staging paths. */
export interface HarnessToolchainPolicy {
  readonly adapter: string;
  readonly compileFlags: readonly string[];
  readonly linkFlags: readonly string[];
  readonly runtimeFlags: readonly string[];
}

/** Canonical key encoding preserves ordered sources, assets, and flags. */
export async function createHarnessObjectKey(
  input: HarnessObjectKeyInput,
  policy: HarnessToolchainPolicy,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      fragmentAbiVersion: input.fragmentAbiVersion,
      harnessSources: input.harnessSources.map((source) => [
        source.sourceId,
        source.source,
      ]),
      strict: input.strict,
      specialization: input.specialization,
      observeSpecialization: input.observeSpecialization,
      frontendIdentity: input.frontendIdentity,
      compilerIdentity: input.compilerIdentity,
      backendIdentity: input.backendIdentity,
      generatedSource: input.generatedSource,
      runtimeAbiVersion: input.runtimeAbiVersion,
      runtimeAssets: input.runtimeAssets.map((asset) => [
        asset.name,
        asset.kind,
        asset.contents,
      ]),
      target: [
        input.target.name,
        input.target.architecture,
        input.target.operatingSystem,
        input.target.abi ?? null,
        input.target.cStandard,
        input.target.executableFormat,
        input.target.sanitizers,
      ],
      toolchainIdentity: input.toolchainIdentity,
      environment: Object.entries(
        input.toolchainEnvironment.variables,
      ).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      adapter: policy.adapter,
      compileFlags: policy.compileFlags,
      linkFlags: policy.linkFlags,
      runtimeFlags: policy.runtimeFlags,
    }),
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
