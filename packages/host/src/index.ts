import { builtinModuleExports, isBuiltinModuleSpecifier } from "@oseo/compiler";

import type {
  CompilerCache,
  CompilerCacheLock,
  CompilerHost,
  Diagnostic,
  ExecutionHostDescription,
  FileFingerprint,
  ModuleLoader,
  ModuleResolver,
  ProcessObservation,
  ProcessRequest,
  SyntaxModuleSpecifier,
} from "@oseo/compiler";

import {
  overwriteExistingDenoTextFile,
  overwriteExistingNodeTextFile,
  renameClaimedCacheLockDirectory,
} from "./cache-files.ts";

import { validateProcessStreams } from "./spawn-protocol.ts";

function includePropertiesWhen<const Properties extends object>(
  properties: () => Properties | undefined,
): Properties | { [Key in keyof Properties]?: never } {
  return properties() ?? {};
}

/** Text requests encode once; byte requests retain their original bytes. */
function isTextProcessInput(value: string | Uint8Array): value is string {
  return typeof value === "string";
}

/** Normalize Node.js or Deno platform facts at the concrete host boundary. */
export function normalizeExecutionHost(
  reportedOperatingSystem: string,
  reportedArchitecture: string,
): ExecutionHostDescription {
  return {
    architecture:
      reportedArchitecture === "arm64" || reportedArchitecture === "aarch64"
        ? "aarch64"
        : reportedArchitecture === "amd64" ||
            reportedArchitecture === "x64" ||
            reportedArchitecture === "x86_64"
          ? "x86_64"
          : "unknown",
    operatingSystem:
      reportedOperatingSystem === "darwin"
        ? "macos"
        : reportedOperatingSystem === "linux"
          ? "linux"
          : "unknown",
  };
}

interface DenoCommandOutput {
  readonly code: number;
  readonly stderr: Uint8Array;
  readonly stdout: Uint8Array;
}

interface DenoCommandChild {
  readonly output: () => Promise<DenoCommandOutput>;
  readonly stdin: WritableStream<Uint8Array>;
}

interface DenoCommandInstance {
  output(): Promise<DenoCommandOutput>;
  spawn(): DenoCommandChild;
}

interface DenoCommandOptions {
  readonly args: readonly string[];
  readonly clearEnv?: boolean;
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly stderr: "piped" | "inherit";
  readonly stdin?: "piped" | "inherit" | "null";
  readonly stdout: "piped" | "inherit";
}

interface DenoCommandConstructor {
  new (command: string, options: DenoCommandOptions): DenoCommandInstance;
}

interface DenoRuntime {
  readonly Command: DenoCommandConstructor;
  readonly build?: {
    readonly arch: string;
    readonly os: string;
  };
  cwd(): string;
  readonly env: {
    get(name: string): string | undefined;
  };
  copyFile(fromPath: string, toPath: string): Promise<void>;
  makeTempFile(options: {
    readonly dir: string;
    readonly prefix: string;
  }): Promise<string>;
  makeTempDir(options: { readonly prefix: string }): Promise<string>;
  mkdir(path: string, options: { readonly recursive: boolean }): Promise<void>;
  readDir(path: string): AsyncIterable<{
    readonly isFile: boolean;
    readonly name: string;
  }>;
  readTextFile(path: string | URL): Promise<string>;
  remove(
    path: string,
    options?: { readonly recursive: boolean },
  ): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  realPath(path: string): Promise<string>;
  stat(path: string): Promise<{
    readonly ctime?: Date | null;
    readonly dev?: number | null;
    readonly ino?: number | null;
    readonly isFile: boolean;
    readonly mtime?: Date | null;
    readonly size: number;
  }>;
  writeTextFile(
    path: string,
    contents: string,
    options?: {
      readonly create?: boolean;
      readonly createNew?: boolean;
    },
  ): Promise<void>;
}

function isDenoRuntime<T>(value: T): value is T & DenoRuntime {
  return (
    value instanceof Object &&
    "Command" in value &&
    typeof value.Command === "function" &&
    "cwd" in value &&
    typeof value.cwd === "function" &&
    "readTextFile" in value &&
    typeof value.readTextFile === "function" &&
    "stat" in value &&
    typeof value.stat === "function"
  );
}

function denoRuntime(): DenoRuntime {
  const runtime = Object.getOwnPropertyDescriptor(globalThis, "Deno")?.value;
  if (!isDenoRuntime(runtime)) throw new Error("Deno host is unavailable.");
  return runtime;
}

function remoteUrl(path: string | URL): URL | undefined {
  let url: URL;
  try {
    url = path instanceof URL ? path : new URL(path);
  } catch {
    return undefined;
  }
  return url.protocol === "http:" || url.protocol === "https:"
    ? url
    : undefined;
}

function requireCacheName(name: string): void {
  if (name === "." || name === ".." || !/^[A-Za-z0-9._-]+$/u.test(name)) {
    throw new Error(`Invalid compiler cache name '${name}'.`);
  }
}

function isNotFound(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    (cause.name === "NotFound" || ("code" in cause && cause.code === "ENOENT"))
  );
}

function isAlreadyExists(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    (cause.name === "AlreadyExists" ||
      ("code" in cause && cause.code === "EEXIST"))
  );
}

function isEnvironmentPermissionDenied(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    (cause.name === "NotCapable" || cause.name === "PermissionDenied")
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Select the exact inherited environment declared by a process request.
 * Keeping this operation in the host adapter avoids exposing runtime-specific
 * environment APIs to toolchain packages.
 */
function selectEnvironment(
  names: readonly string[],
  read: (name: string) => string | undefined,
) {
  const selected: Record<string, string> = {};
  for (const name of names) {
    const value = read(name);
    if (value != null) selected[name] = value;
  }
  return selected;
}

interface CacheLockOwner {
  readonly expiresAtMilliseconds: number;
  readonly token: string;
}

interface CacheLockObservation {
  readonly owner?: CacheLockOwner | undefined;
  readonly ownerPath?: string | undefined;
}

function isCacheLockOwner(
  value: Partial<CacheLockOwner>,
): value is CacheLockOwner {
  return (
    typeof value.token === "string" &&
    /^[A-Za-z0-9-]+$/u.test(value.token) &&
    typeof value.expiresAtMilliseconds === "number" &&
    Number.isFinite(value.expiresAtMilliseconds)
  );
}

function parseCacheLockOwner(contents: string): CacheLockOwner | undefined {
  try {
    // SAFETY: The optional fields are validated before this value is returned.
    const value = JSON.parse(contents) as Partial<CacheLockOwner>;
    return isCacheLockOwner(value)
      ? {
          expiresAtMilliseconds: value.expiresAtMilliseconds,
          token: value.token,
        }
      : undefined;
  } catch {
    return undefined;
  }
}

async function readCacheLockOwner(
  readOwner: () => Promise<string>,
): Promise<CacheLockOwner | undefined> {
  try {
    return parseCacheLockOwner(await readOwner());
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

const cacheLockPollMilliseconds = 25;
const cacheLockLifetimeMilliseconds = 30_000;
const cacheLockRenewMilliseconds = 1_000;
const cacheLockRenameSafetyMilliseconds = 1_000;

function cacheLockOwnerName(token: string): string {
  return `owner-${token}.json`;
}

function cacheLockOperationPath(
  lockPath: string,
  operation: "reclaim" | "release" | "renew",
  token: string,
  expiresAt = Date.now() + cacheLockLifetimeMilliseconds,
): string {
  return (
    `${lockPath}/${operation}-${expiresAt}-${token}-` +
    `${crypto.randomUUID()}.json`
  );
}

function cacheLockOperationExpiration(name: string): number | undefined {
  const match = /^(?:reclaim|release|renew)-(\d+)-/u.exec(name);
  if (match == null) return undefined;
  const expiresAt = Number(match[1]);
  return Number.isFinite(expiresAt) ? expiresAt : undefined;
}

function isCacheLockStateName(name: string): boolean {
  return (
    (name.startsWith("owner-") ||
      name.startsWith("reclaim-") ||
      name.startsWith("release-") ||
      name.startsWith("renew-")) &&
    name.endsWith(".json")
  );
}

function createRenewingCacheLock(
  renew: () => Promise<boolean>,
  release: () => Promise<void>,
): CompilerCacheLock {
  let released = false;
  let renewal = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  function schedule(): void {
    timer = setTimeout(() => {
      renewal = renew()
        .then((owned) => {
          if (owned && !released) schedule();
        })
        .catch(() => {
          if (!released) schedule();
        });
    }, cacheLockRenewMilliseconds);
    // SAFETY: Runtime timers may expose unref; its presence is checked below.
    const unref = (
      timer as ReturnType<typeof setTimeout> & {
        readonly unref?: () => void;
      }
    ).unref;
    unref?.call(timer);
  }
  schedule();
  return {
    async release() {
      if (released) return;
      released = true;
      if (timer != null) clearTimeout(timer);
      await renewal.catch(() => undefined);
      await release();
    },
  };
}

function createNodeCache(): CompilerCache {
  return {
    async acquireFileLock(path): Promise<CompilerCacheLock> {
      const { mkdir, readFile, readdir, rename, rm, writeFile } =
        await import("node:fs/promises");
      const lockPath = `${path}.lock`;
      const invalidOwnerExpiresAt = Date.now() + cacheLockLifetimeMilliseconds;
      async function observeOwner(): Promise<CacheLockObservation> {
        let names: readonly string[];
        try {
          names = await readdir(lockPath);
        } catch (error) {
          if (isNotFound(error)) return {};
          throw error;
        }
        const ownerName = names.find(isCacheLockStateName);
        if (ownerName == null) return {};
        const ownerPath = `${lockPath}/${ownerName}`;
        const owner = await readCacheLockOwner(
          async () => await readFile(ownerPath, "utf8"),
        );
        const operationExpiration = cacheLockOperationExpiration(ownerName);
        return {
          owner:
            operationExpiration == null
              ? owner
              : {
                  expiresAtMilliseconds: Math.max(
                    owner?.expiresAtMilliseconds ?? 0,
                    operationExpiration,
                  ),
                  token: owner?.token ?? "operation",
                },
          ownerPath,
        };
      }
      async function disposeLockDirectory(statePath: string): Promise<void> {
        const disposalExpiresAt = Date.now() + cacheLockLifetimeMilliseconds;
        const disposalStatePath = cacheLockOperationPath(
          lockPath,
          "reclaim",
          "disposal",
          disposalExpiresAt,
        );
        try {
          await rename(statePath, disposalStatePath);
        } catch (error) {
          if (isNotFound(error)) return;
          throw error;
        }
        const disposalPath = `${lockPath}.dispose-${crypto.randomUUID()}`;
        try {
          await renameClaimedCacheLockDirectory(
            rename,
            lockPath,
            disposalPath,
            {
              deadlineMilliseconds:
                disposalExpiresAt - cacheLockRenameSafetyMilliseconds,
              retryPermissionErrors: process.platform === "win32",
            },
          );
        } catch (error) {
          if (isNotFound(error)) return;
          throw error;
        }
        await rm(disposalPath, { force: true, recursive: true });
      }
      async function claimEmptyLock(): Promise<void> {
        const token = crypto.randomUUID();
        const ownerName = "owner-empty-reclaimer.json";
        const ownerPath = `${lockPath}/${ownerName}`;
        try {
          await writeFile(
            ownerPath,
            JSON.stringify({
              expiresAtMilliseconds: Date.now() + cacheLockLifetimeMilliseconds,
              token,
            }),
            { flag: "wx" },
          );
        } catch (error) {
          if (isAlreadyExists(error) || isNotFound(error)) return;
          throw error;
        }
        const names = await readdir(lockPath);
        if (names.some((name) => name !== ownerName)) {
          await rm(ownerPath, { force: true });
          return;
        }
        await disposeLockDirectory(ownerPath);
      }
      /* eslint-disable no-await-in-loop -- Lease steps are ordered. */
      while (true) {
        try {
          await mkdir(lockPath);
          const owner = {
            expiresAtMilliseconds: Date.now() + cacheLockLifetimeMilliseconds,
            token: crypto.randomUUID(),
          };
          const ownerPath = `${lockPath}/${cacheLockOwnerName(owner.token)}`;
          try {
            await writeFile(ownerPath, JSON.stringify(owner));
          } catch (error) {
            await rm(ownerPath, { force: true });
            if (isNotFound(error)) continue;
            throw error;
          }
          const names = await readdir(lockPath);
          if (
            names.some(
              (name) =>
                isCacheLockStateName(name) &&
                name !== cacheLockOwnerName(owner.token),
            )
          ) {
            await rm(ownerPath, { force: true });
            continue;
          }
          return createRenewingCacheLock(
            async () => {
              const renewalPath = cacheLockOperationPath(
                lockPath,
                "renew",
                owner.token,
              );
              try {
                await rename(ownerPath, renewalPath);
              } catch (error) {
                if (isNotFound(error)) return false;
                throw error;
              }
              try {
                await overwriteExistingNodeTextFile(
                  renewalPath,
                  JSON.stringify({
                    expiresAtMilliseconds:
                      Date.now() + cacheLockLifetimeMilliseconds,
                    token: owner.token,
                  }),
                );
                await rename(renewalPath, ownerPath);
                return true;
              } catch (error) {
                try {
                  await rename(renewalPath, ownerPath);
                } catch {
                  // The state was claimed by a concurrent reclaimer.
                }
                throw error;
              }
            },
            async () => {
              const releasePath = cacheLockOperationPath(
                lockPath,
                "release",
                owner.token,
              );
              try {
                await rename(ownerPath, releasePath);
              } catch (error) {
                if (isNotFound(error)) return;
                throw error;
              }
              await disposeLockDirectory(releasePath);
            },
          );
        } catch (error) {
          if (!isAlreadyExists(error)) throw error;
          const observed = await observeOwner();
          const expiresAt =
            observed.owner?.expiresAtMilliseconds ?? invalidOwnerExpiresAt;
          if (Date.now() >= expiresAt) {
            if (observed.ownerPath == null) {
              await claimEmptyLock();
              continue;
            }
            const claimPath = cacheLockOperationPath(
              lockPath,
              "reclaim",
              "stale",
            );
            try {
              await rename(observed.ownerPath, claimPath);
            } catch (claimError) {
              if (isNotFound(claimError)) continue;
              throw claimError;
            }
            const claimedOwner = await readCacheLockOwner(
              async () => await readFile(claimPath, "utf8"),
            );
            if (
              claimedOwner != null &&
              Date.now() < claimedOwner.expiresAtMilliseconds
            ) {
              try {
                await rename(
                  claimPath,
                  `${lockPath}/${cacheLockOwnerName(claimedOwner.token)}`,
                );
              } catch (restoreError) {
                if (!isNotFound(restoreError)) throw restoreError;
              }
              continue;
            }
            await disposeLockDirectory(claimPath);
            continue;
          }
          await wait(cacheLockPollMilliseconds);
        }
      }
      /* eslint-enable no-await-in-loop */
    },
    async getDirectory(name) {
      requireCacheName(name);
      const [{ mkdir }, { homedir }, { join, resolve }] = await Promise.all([
        import("node:fs/promises"),
        import("node:os"),
        import("node:path"),
      ]);
      const configured = process.env.XDG_CACHE_HOME;
      const root =
        process.platform === "darwin"
          ? join(homedir(), "Library", "Caches")
          : configured == null || configured === ""
            ? join(homedir(), ".cache")
            : configured;
      const directory = resolve(root, "oseo", name);
      await mkdir(directory, { recursive: true });
      return directory;
    },
    async hasFile(path) {
      const { stat } = await import("node:fs/promises");
      try {
        const entry = await stat(path);
        return entry.isFile() && entry.size > 0;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },
    async publishFile(sourcePath, destinationPath) {
      const [{ copyFile, rename, rm }, { randomUUID }] = await Promise.all([
        import("node:fs/promises"),
        import("node:crypto"),
      ]);
      const temporaryPath = `${destinationPath}.${randomUUID()}.tmp`;
      try {
        await copyFile(sourcePath, temporaryPath);
        await rename(temporaryPath, destinationPath);
      } finally {
        await rm(temporaryPath, { force: true });
      }
    },
  };
}

function createDenoCache(runtime: DenoRuntime): CompilerCache {
  async function removeTemporary(path: string): Promise<void> {
    try {
      await runtime.remove(path);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  return {
    async acquireFileLock(path): Promise<CompilerCacheLock> {
      const lockPath = `${path}.lock`;
      const invalidOwnerExpiresAt = Date.now() + cacheLockLifetimeMilliseconds;
      async function observeOwner(): Promise<CacheLockObservation> {
        let ownerName: string | undefined;
        try {
          for await (const entry of runtime.readDir(lockPath)) {
            if (entry.isFile && isCacheLockStateName(entry.name)) {
              ownerName = entry.name;
              break;
            }
          }
        } catch (error) {
          if (isNotFound(error)) return {};
          throw error;
        }
        if (ownerName == null) return {};
        const ownerPath = `${lockPath}/${ownerName}`;
        const owner = await readCacheLockOwner(
          async () => await runtime.readTextFile(ownerPath),
        );
        const operationExpiration = cacheLockOperationExpiration(ownerName);
        return {
          owner:
            operationExpiration == null
              ? owner
              : {
                  expiresAtMilliseconds: Math.max(
                    owner?.expiresAtMilliseconds ?? 0,
                    operationExpiration,
                  ),
                  token: owner?.token ?? "operation",
                },
          ownerPath,
        };
      }
      async function disposeLockDirectory(statePath: string): Promise<void> {
        const disposalExpiresAt = Date.now() + cacheLockLifetimeMilliseconds;
        const disposalStatePath = cacheLockOperationPath(
          lockPath,
          "reclaim",
          "disposal",
          disposalExpiresAt,
        );
        try {
          await runtime.rename(statePath, disposalStatePath);
        } catch (error) {
          if (isNotFound(error)) return;
          throw error;
        }
        const disposalPath = `${lockPath}.dispose-${crypto.randomUUID()}`;
        try {
          await renameClaimedCacheLockDirectory(
            async (fromPath, toPath) => await runtime.rename(fromPath, toPath),
            lockPath,
            disposalPath,
            {
              deadlineMilliseconds:
                disposalExpiresAt - cacheLockRenameSafetyMilliseconds,
              retryPermissionErrors: runtime.build?.os === "windows",
            },
          );
        } catch (error) {
          if (isNotFound(error)) return;
          throw error;
        }
        await runtime.remove(disposalPath, { recursive: true });
      }
      async function claimEmptyLock(): Promise<void> {
        const token = crypto.randomUUID();
        const ownerName = "owner-empty-reclaimer.json";
        const ownerPath = `${lockPath}/${ownerName}`;
        try {
          await runtime.writeTextFile(
            ownerPath,
            JSON.stringify({
              expiresAtMilliseconds: Date.now() + cacheLockLifetimeMilliseconds,
              token,
            }),
            { createNew: true },
          );
        } catch (error) {
          if (isAlreadyExists(error) || isNotFound(error)) return;
          throw error;
        }
        let competingState = false;
        for await (const entry of runtime.readDir(lockPath)) {
          if (entry.isFile && entry.name !== ownerName) {
            competingState = true;
            break;
          }
        }
        if (competingState) {
          await removeTemporary(ownerPath);
          return;
        }
        await disposeLockDirectory(ownerPath);
      }
      /* eslint-disable no-await-in-loop -- Lease steps are ordered. */
      while (true) {
        try {
          await runtime.mkdir(lockPath, { recursive: false });
          const owner = {
            expiresAtMilliseconds: Date.now() + cacheLockLifetimeMilliseconds,
            token: crypto.randomUUID(),
          };
          const ownerPath = `${lockPath}/${cacheLockOwnerName(owner.token)}`;
          try {
            await runtime.writeTextFile(ownerPath, JSON.stringify(owner));
          } catch (error) {
            await removeTemporary(ownerPath);
            if (isNotFound(error)) continue;
            throw error;
          }
          let competingState = false;
          for await (const entry of runtime.readDir(lockPath)) {
            if (
              entry.isFile &&
              isCacheLockStateName(entry.name) &&
              entry.name !== cacheLockOwnerName(owner.token)
            ) {
              competingState = true;
              break;
            }
          }
          if (competingState) {
            await removeTemporary(ownerPath);
            continue;
          }
          return createRenewingCacheLock(
            async () => {
              const renewalPath = cacheLockOperationPath(
                lockPath,
                "renew",
                owner.token,
              );
              try {
                await runtime.rename(ownerPath, renewalPath);
              } catch (error) {
                if (isNotFound(error)) return false;
                throw error;
              }
              try {
                await overwriteExistingDenoTextFile(
                  runtime,
                  renewalPath,
                  JSON.stringify({
                    expiresAtMilliseconds:
                      Date.now() + cacheLockLifetimeMilliseconds,
                    token: owner.token,
                  }),
                );
                await runtime.rename(renewalPath, ownerPath);
                return true;
              } catch (error) {
                try {
                  await runtime.rename(renewalPath, ownerPath);
                } catch {
                  // The state was claimed by a concurrent reclaimer.
                }
                throw error;
              }
            },
            async () => {
              const releasePath = cacheLockOperationPath(
                lockPath,
                "release",
                owner.token,
              );
              try {
                await runtime.rename(ownerPath, releasePath);
              } catch (error) {
                if (isNotFound(error)) return;
                throw error;
              }
              await disposeLockDirectory(releasePath);
            },
          );
        } catch (error) {
          if (!isAlreadyExists(error)) throw error;
          const observed = await observeOwner();
          const expiresAt =
            observed.owner?.expiresAtMilliseconds ?? invalidOwnerExpiresAt;
          if (Date.now() >= expiresAt) {
            if (observed.ownerPath == null) {
              await claimEmptyLock();
              continue;
            }
            const claimPath = cacheLockOperationPath(
              lockPath,
              "reclaim",
              "stale",
            );
            try {
              await runtime.rename(observed.ownerPath, claimPath);
            } catch (claimError) {
              if (isNotFound(claimError)) continue;
              throw claimError;
            }
            const claimedOwner = await readCacheLockOwner(
              async () => await runtime.readTextFile(claimPath),
            );
            if (
              claimedOwner != null &&
              Date.now() < claimedOwner.expiresAtMilliseconds
            ) {
              try {
                await runtime.rename(
                  claimPath,
                  `${lockPath}/${cacheLockOwnerName(claimedOwner.token)}`,
                );
              } catch (restoreError) {
                if (!isNotFound(restoreError)) throw restoreError;
              }
              continue;
            }
            await disposeLockDirectory(claimPath);
            continue;
          }
          await wait(cacheLockPollMilliseconds);
        }
      }
      /* eslint-enable no-await-in-loop */
    },
    async getDirectory(name) {
      requireCacheName(name);
      const configured = runtime.env.get("XDG_CACHE_HOME");
      const home = runtime.env.get("HOME");
      const root =
        runtime.build?.os === "darwin"
          ? home == null
            ? undefined
            : `${home}/Library/Caches`
          : configured == null || configured === ""
            ? home == null
              ? undefined
              : `${home}/.cache`
            : configured;
      if (root == null) {
        throw new Error("The compiler cache directory is unavailable.");
      }
      const { resolve } = await import("node:path");
      const directory = resolve(root, "oseo", name);
      await runtime.mkdir(directory, { recursive: true });
      return directory;
    },
    async hasFile(path) {
      try {
        const entry = await runtime.stat(path);
        return entry.isFile && entry.size > 0;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },
    async publishFile(sourcePath, destinationPath) {
      const separator = destinationPath.lastIndexOf("/");
      const directory = destinationPath.slice(0, separator);
      const temporaryPath = await runtime.makeTempFile({
        dir: directory,
        prefix: ".oseo-publish-",
      });
      try {
        await runtime.copyFile(sourcePath, temporaryPath);
        await runtime.rename(temporaryPath, destinationPath);
      } catch (error) {
        try {
          await removeTemporary(temporaryPath);
        } catch {
          // The publication failure remains the authoritative observation.
        }
        throw error;
      }
      await removeTemporary(temporaryPath);
    },
  };
}

function moduleDiagnostic(
  sourceId: string,
  specifier: SyntaxModuleSpecifier | undefined,
  message: string,
): Diagnostic {
  return {
    byteRange: specifier?.byteRange ?? { end: 0, start: 0 },
    code: "OSEO3001",
    message,
    range: specifier?.range ?? {
      end: { column: 1, line: 1 },
      start: { column: 1, line: 1 },
    },
    sourceId,
  };
}

function isUnreservedPathByte(value: number): boolean {
  return (
    (value >= 0x41 && value <= 0x5a) ||
    (value >= 0x61 && value <= 0x7a) ||
    (value >= 0x30 && value <= 0x39) ||
    value === 0x2d ||
    value === 0x2e ||
    value === 0x5f ||
    value === 0x7e
  );
}

/** Normalize one file URL to the canonical module identity spelling. */
export function canonicalizeFileModuleUrl(url: URL): string {
  const canonical = new URL(url.href);
  canonical.pathname = canonical.pathname.replace(/%[0-9a-f]{2}/giu, (part) => {
    const value = Number.parseInt(part.slice(1), 16);
    return isUnreservedPathByte(value)
      ? String.fromCharCode(value)
      : part.toUpperCase();
  });
  return canonical.href;
}

/** Produce the stable content identity recorded in a module graph. */
export function hashModuleSource(source: string): string {
  let hash = 0xcbf2_9ce4_8422_2325n;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x0000_0100_0000_01b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

/** Load canonical file URLs through one explicit compiler host. */
export function createFileModuleLoader(
  host: CompilerHost,
  runtimeAbiVersion = "m5-160",
): ModuleLoader {
  return {
    async load(canonicalId, referrer) {
      if (isBuiltinModuleSpecifier(canonicalId)) {
        return {
          diagnostics: [],
          builtin: {
            kind: "builtin",
            specifier: canonicalId,
            sourceHash: hashModuleSource(
              JSON.stringify({
                exports: builtinModuleExports[canonicalId],
                runtimeAbiVersion,
              }),
            ),
          },
        };
      }
      const diagnosticSourceId = referrer?.importerId ?? canonicalId;
      const diagnosticSpecifier = referrer?.specifier;
      if (canonicalId.startsWith("node:")) {
        return {
          diagnostics: [
            moduleDiagnostic(
              diagnosticSourceId,
              diagnosticSpecifier,
              "Only node:process and node:fs builtin modules are supported.",
            ),
          ],
        };
      }
      let url: URL;
      try {
        url = new URL(canonicalId);
      } catch {
        return {
          diagnostics: [
            moduleDiagnostic(
              diagnosticSourceId,
              diagnosticSpecifier,
              "Invalid module URL.",
            ),
          ],
        };
      }
      if (url.protocol !== "file:") {
        return {
          diagnostics: [
            moduleDiagnostic(
              diagnosticSourceId,
              diagnosticSpecifier,
              "Only file module URLs are supported in M4.",
            ),
          ],
        };
      }
      try {
        const source = await host.readTextFile(url);
        const kind = url.pathname.endsWith(".json") ? "json" : "javascript";
        return {
          diagnostics: [],
          source: {
            kind,
            source: kind === "json" ? source.replace(/^\uFEFF+/u, "") : source,
            sourceHash: hashModuleSource(source),
            sourceId: url.href,
          },
        };
      } catch {
        return {
          diagnostics: [
            moduleDiagnostic(
              diagnosticSourceId,
              diagnosticSpecifier,
              "The module source could not be read.",
            ),
          ],
        };
      }
    },
  };
}

/** Resolve the relative file specifiers frozen by the M4 profile. */
export const fileModuleResolver: ModuleResolver = {
  resolve(importerId, specifier) {
    if (isBuiltinModuleSpecifier(specifier.value)) {
      return { canonicalId: specifier.value, diagnostics: [] };
    }
    if (specifier.value.startsWith("node:")) {
      return {
        diagnostics: [
          moduleDiagnostic(
            importerId,
            specifier,
            "Only node:process and node:fs builtin modules are supported.",
          ),
        ],
      };
    }
    if (
      !specifier.value.startsWith("./") &&
      !specifier.value.startsWith("../")
    ) {
      return {
        diagnostics: [
          moduleDiagnostic(
            importerId,
            specifier,
            `Unsupported module specifier '${specifier.value}'.`,
          ),
        ],
      };
    }
    try {
      const importer = new URL(importerId);
      if (importer.protocol !== "file:") throw new Error("not a file URL");
      const resolved = new URL(specifier.value, importer);
      if (resolved.protocol !== "file:") throw new Error("not a file URL");
      return {
        canonicalId: canonicalizeFileModuleUrl(resolved),
        diagnostics: [],
      };
    } catch {
      return {
        diagnostics: [
          moduleDiagnostic(
            importerId,
            specifier,
            `Cannot resolve module specifier '${specifier.value}'.`,
          ),
        ],
      };
    }
  },
};

/** Optional execution services for long-running Node.js compiler hosts. */
export interface NodeHostOptions {
  /** Spawn through a small reusable process instead of the compiler heap. */
  readonly delegateSpawns?: boolean;
}

/** A Node host can explicitly drain and close its optional spawn service. */
export interface NodeHost extends CompilerHost {
  /** Stop accepting delegated work, drain pending requests, and close IPC. */
  close(): Promise<void>;
}

/** Create the Node.js implementation of compiler host operations. */
export function createNodeHost(options: NodeHostOptions = {}): NodeHost {
  const delegate =
    options.delegateSpawns === true
      ? import("./spawn-delegate.ts").then(({ createSpawnDelegate }) =>
          createSpawnDelegate(),
        )
      : undefined;
  return {
    async close() {
      await (await delegate)?.close();
    },
    cache: createNodeCache(),
    captureEnvironment(policy) {
      return Promise.resolve({
        variables: selectEnvironment(
          policy.inherit,
          (name) => process.env[name],
        ),
      });
    },
    executionHost: normalizeExecutionHost(process.platform, process.arch),
    async canonicalizeFile(path: string): Promise<string> {
      try {
        const url = new URL(path);
        if (url.protocol === "file:") {
          return canonicalizeFileModuleUrl(url);
        }
      } catch {
        // A filesystem path is canonicalized below.
      }
      const [{ resolve }, { pathToFileURL }] = await Promise.all([
        import("node:path"),
        import("node:url"),
      ]);
      return canonicalizeFileModuleUrl(pathToFileURL(resolve(path)));
    },
    async describeFile(path: string): Promise<FileFingerprint | undefined> {
      const { realpath, stat } = await import("node:fs/promises");
      try {
        // stat resolves symbolic links, so a relinked path reports the new
        // target's identity and a replaced file reports new size and time.
        const [resolved, status] = await Promise.all([
          realpath(path),
          stat(path),
        ]);
        const fingerprint: FileFingerprint = {
          device: Number(status.dev),
          inode: Number(status.ino),
          modifiedAtMilliseconds: status.mtimeMs,
          realPath: resolved,
          size: Number(status.size),
        };
        if (status.ctimeMs == null) return fingerprint;
        return { ...fingerprint, changedAtMilliseconds: status.ctimeMs };
      } catch {
        return undefined;
      }
    },
    async makeTemporaryDirectory(prefix: string): Promise<string> {
      const [{ mkdtemp }, { tmpdir }, { join }] = await Promise.all([
        import("node:fs/promises"),
        import("node:os"),
        import("node:path"),
      ]);
      return await mkdtemp(join(tmpdir(), prefix));
    },
    async readTextFile(path: string | URL): Promise<string> {
      const { readFile } = await import("node:fs/promises");
      return await readFile(path, "utf8");
    },
    async remove(path: string): Promise<void> {
      const { rm } = await import("node:fs/promises");
      await rm(path, { force: true, recursive: true });
    },
    async run(request: ProcessRequest): Promise<ProcessObservation> {
      validateProcessStreams(request);
      if (delegate != null) return await (await delegate).run(request);
      const { spawn } = await import("node:child_process");
      return await new Promise((resolve, reject) => {
        const environment = request.environment;
        const child = spawn(request.command, [...request.args], {
          cwd: request.cwd,
          env: environment?.variables ?? process.env,
          stdio: [
            request.input == null && request.inheritStdin ? "inherit" : "pipe",
            request.inheritOutput ? "inherit" : "pipe",
            request.inheritOutput ? "inherit" : "pipe",
          ],
        });
        if (
          !request.inheritOutput &&
          (child.stdout == null || child.stderr == null)
        ) {
          throw new Error("Process output pipes are unavailable.");
        }
        const stdout: Uint8Array[] = [];
        const stderr: Uint8Array[] = [];
        child.stdout?.on("data", (chunk: Uint8Array) => stdout.push(chunk));
        child.stderr?.on("data", (chunk: Uint8Array) => stderr.push(chunk));
        // A program may exit before consuming all input. Its status and
        // output remain authoritative when the input pipe closes early.
        child.stdin?.on("error", (error: NodeJS.ErrnoException) => {
          if (error.code !== "EPIPE") reject(error);
        });
        child.stdin?.end(request.input);
        child.on("error", reject);
        child.on("close", (code) => {
          resolve({
            exitStatus: code ?? 1,
            stderr: Buffer.concat(stderr).toString("utf8"),
            stdout: Buffer.concat(stdout).toString("utf8"),
            ...includePropertiesWhen(() => {
              if (!request.captureBytes) return undefined;
              return {
                stdoutBytes: new Uint8Array(Buffer.concat(stdout)),
                stderrBytes: new Uint8Array(Buffer.concat(stderr)),
              };
            }),
          });
        });
      });
    },
    async writeTextFile(path: string, contents: string): Promise<void> {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(path, contents);
    },
  };
}

/** Create the Deno implementation of compiler host operations. */
export function createDenoHost(): CompilerHost {
  const runtime = denoRuntime();
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  return {
    cache: createDenoCache(runtime),
    captureEnvironment(policy) {
      try {
        return Promise.resolve({
          variables: selectEnvironment(policy.inherit, (name) =>
            runtime.env.get(name),
          ),
        });
      } catch (error) {
        if (isEnvironmentPermissionDenied(error)) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(error);
      }
    },
    executionHost: normalizeExecutionHost(
      runtime.build?.os ?? "unknown",
      runtime.build?.arch ?? "unknown",
    ),
    canonicalizeFile(path: string): Promise<string> {
      try {
        const url = new URL(path);
        if (url.protocol === "file:") {
          return Promise.resolve(canonicalizeFileModuleUrl(url));
        }
      } catch {
        // A filesystem path is canonicalized below.
      }
      const basePath = path.startsWith("/")
        ? path
        : `${runtime.cwd().replace(/\/$/u, "")}/${path}`;
      const url = new URL("file:///");
      url.pathname = basePath.replaceAll("%", "%25");
      return Promise.resolve(canonicalizeFileModuleUrl(url));
    },
    async describeFile(path: string): Promise<FileFingerprint | undefined> {
      try {
        const [resolved, status] = await Promise.all([
          runtime.realPath(path),
          runtime.stat(path),
        ]);
        const fingerprint: FileFingerprint = {
          device: status.dev ?? 0,
          inode: status.ino ?? 0,
          modifiedAtMilliseconds: status.mtime?.getTime() ?? 0,
          realPath: resolved,
          size: status.size,
        };
        const changedAt = status.ctime?.getTime();
        if (changedAt == null) return fingerprint;
        return { ...fingerprint, changedAtMilliseconds: changedAt };
      } catch {
        return undefined;
      }
    },
    async makeTemporaryDirectory(prefix: string): Promise<string> {
      return await runtime.makeTempDir({ prefix });
    },
    async readTextFile(path: string | URL): Promise<string> {
      const url = remoteUrl(path);
      if (url != null) {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch ${url.href}: ` +
              `${response.status} ${response.statusText}`,
          );
        }
        return await response.text();
      }
      return await runtime.readTextFile(path);
    },
    async remove(path: string): Promise<void> {
      await runtime.remove(path, { recursive: true });
    },
    async run(request: ProcessRequest): Promise<ProcessObservation> {
      validateProcessStreams(request);
      const environment = request.environment;
      const command = new runtime.Command(request.command, {
        args: request.args,
        ...includePropertiesWhen(() => {
          if (environment == null) return undefined;
          return {
            clearEnv: true,
            env: environment.variables,
          };
        }),
        cwd: request.cwd,
        ...includePropertiesWhen(() => {
          if (request.input != null) return { stdin: "piped" as const };
          if (request.inheritStdin) return { stdin: "inherit" as const };
          return { stdin: "null" as const };
        }),
        stderr: request.inheritOutput ? "inherit" : "piped",
        stdout: request.inheritOutput ? "inherit" : "piped",
      });
      let output: DenoCommandOutput;
      if (request.input == null) {
        output = await command.output();
      } else {
        const child = command.spawn();
        const capture = child.output();
        const writer = child.stdin.getWriter();
        try {
          await writer.write(
            isTextProcessInput(request.input)
              ? new TextEncoder().encode(request.input)
              : request.input,
          );
          await writer.close();
        } catch (error) {
          // Deno uses BrokenPipe when the program exits without reading.
          if (!(error instanceof Error) || error.name !== "BrokenPipe") {
            await capture;
            throw error;
          }
        } finally {
          writer.releaseLock();
        }
        output = await capture;
      }
      return {
        exitStatus: output.code,
        stderr: request.inheritOutput ? "" : decoder.decode(output.stderr),
        stdout: request.inheritOutput ? "" : decoder.decode(output.stdout),
        ...includePropertiesWhen(() => {
          if (!request.captureBytes) return undefined;
          return {
            stdoutBytes: output.stdout,
            stderrBytes: output.stderr,
          };
        }),
      };
    },
    async writeTextFile(path: string, contents: string): Promise<void> {
      await runtime.writeTextFile(path, contents);
    },
  };
}

export { createExecutablePublisher } from "./executable-publication.ts";
export type {
  ExecutableDestination,
  ExecutablePublisher,
} from "./executable-publication.ts";
