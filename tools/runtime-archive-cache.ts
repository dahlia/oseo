import { join } from "node:path";

import type {
  CompilerHost,
  NativeToolchain,
  RuntimeInputProvider,
  TargetDescription,
} from "../packages/compiler/src/index.ts";

/** Locate exactly the archive the native builders will request. */
export async function runtimeArchiveCache(
  host: CompilerHost,
  toolchain: NativeToolchain,
  runtime: RuntimeInputProvider,
  target: TargetDescription,
  workingDirectory: string,
): Promise<{ readonly key: string; readonly path: string }> {
  const reuse = toolchain.runtimeArchiveReuse;
  if (
    reuse == null ||
    toolchain.environment == null ||
    host.cache == null ||
    host.captureEnvironment == null
  ) {
    throw new Error(
      "Archive caching requires an identified toolchain and cache host.",
    );
  }
  const environment = await host.captureEnvironment(toolchain.environment);
  if (environment == null) {
    throw new Error("Cannot capture the native toolchain environment.");
  }
  const identity = await host.run(
    reuse.createIdentityRequest(workingDirectory, environment),
  );
  if (identity.exitStatus !== 0 || identity.stdout.trim() === "") {
    throw new Error("Cannot identify the runtime archive compiler.");
  }
  const input = runtime.getRuntimeInput();
  const key = await reuse.createKey({
    runtimeAbiVersion: input.abiVersion,
    runtimeAssets: await Promise.all(
      input.assets.map(async (asset) => ({
        contents: await host.readTextFile(asset.url),
        kind: asset.kind,
        name: asset.name,
      })),
    ),
    target,
    toolchainEnvironment: environment,
    toolchainIdentity: identity.stdout.trim(),
  });
  if (!/^[a-f0-9]{64}$/u.test(key))
    throw new Error("Invalid runtime archive key.");
  return {
    key: `oseo-runtime-v1-${key}`,
    path: join(
      await host.cache.getDirectory("runtime-archives"),
      `liboseo-runtime-${key}.a`,
    ),
  };
}
