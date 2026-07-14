/* eslint-disable no-await-in-loop -- Atomic writes and renames are ordered. */

import process from "node:process";
import { readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const numericIdentifier = String.raw`(?:0|[1-9]\d*)`;
const dotIdentifier = String.raw`[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*`;
const alphanumericIdentifier = String.raw`\d*[A-Za-z-][0-9A-Za-z-]*`;
const prereleaseIdentifier = `(?:0|[1-9]\\d*|${alphanumericIdentifier})`;
const prerelease = `${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*`;
const coreVersion = [
  numericIdentifier,
  numericIdentifier,
  numericIdentifier,
].join(String.raw`\.`);
const semverPattern = new RegExp(
  `^${coreVersion}(?:-${prerelease})?(?:\\+${dotIdentifier})?$`,
  "u",
);

interface PackageManifest {
  readonly name?: unknown;
  readonly private?: unknown;
  readonly version?: unknown;
  readonly dependencies?: Readonly<Record<string, unknown>>;
  readonly devDependencies?: Readonly<Record<string, unknown>>;
  readonly optionalDependencies?: Readonly<Record<string, unknown>>;
  readonly peerDependencies?: Readonly<Record<string, unknown>>;
}

interface LoadedManifest {
  readonly bytes: string;
  readonly manifest: PackageManifest;
  readonly path: string;
}

interface PlannedEdit {
  readonly original: string;
  readonly path: string;
  readonly replacement: string;
  readonly temporaryPath: string;
}

/** Injectable operations used to verify atomic update failure behavior. */
export interface VersionFileOperations {
  read(path: string): Promise<string>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  write(path: string, contents: string): Promise<void>;
}

/** Result of validating one complete lockstep workspace. */
export interface VersionCheckResult {
  readonly packageCount: number;
  readonly version: string;
}

const defaultOperations: VersionFileOperations = {
  async read(path: string): Promise<string> {
    return await readFile(path, "utf8");
  },
  async remove(path: string): Promise<void> {
    await rm(path, { force: true });
  },
  async rename(from: string, to: string): Promise<void> {
    await rename(from, to);
  },
  async write(path: string, contents: string): Promise<void> {
    await writeFile(path, contents);
  },
};

function strictVersion(bytes: string, source: string): string {
  if (!bytes.endsWith("\n") || bytes.slice(0, -1).includes("\n")) {
    throw new Error(
      `${source} must contain one SemVer and a trailing newline.`,
    );
  }
  const version = bytes.slice(0, -1);
  if (!semverPattern.test(version)) {
    throw new Error(`${source} does not contain a strict SemVer.`);
  }
  return version;
}

function parseManifest(bytes: string, path: string): PackageManifest {
  try {
    const value = JSON.parse(bytes) as unknown;
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("manifest is not an object");
    }
    return value as PackageManifest;
  } catch (error) {
    throw new Error(`Could not read ${path} as a JSON manifest.`, {
      cause: error,
    });
  }
}

async function loadManifest(
  path: string,
  operations: VersionFileOperations,
): Promise<LoadedManifest> {
  let bytes: string;
  try {
    bytes = await operations.read(path);
  } catch (error) {
    throw new Error(`Required package manifest is missing: ${path}`, {
      cause: error,
    });
  }
  return { bytes, manifest: parseManifest(bytes, path), path };
}

function requirePackageName(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.startsWith("@oseo/")) {
    throw new Error(`${path} must name a public @oseo/* package.`);
  }
  return value;
}

function checkInternalDependencies(
  manifest: PackageManifest,
  path: string,
): void {
  const fields = [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.optionalDependencies,
    manifest.peerDependencies,
  ];
  for (const field of fields) {
    if (field == null) continue;
    for (const [name, range] of Object.entries(field)) {
      if (!name.startsWith("@oseo/")) continue;
      if (range !== "workspace:*") {
        throw new Error(
          `${path} must use workspace:* for internal dependency ${name}.`,
        );
      }
    }
  }
}

async function loadWorkspace(
  root: string,
  operations: VersionFileOperations,
): Promise<
  readonly [string, readonly LoadedManifest[], readonly LoadedManifest[]]
> {
  const versionPath = join(root, "VERSION");
  const version = strictVersion(
    await operations.read(versionPath),
    versionPath,
  );
  const npmManifests: LoadedManifest[] = [];
  const denoManifests: LoadedManifest[] = [];
  const packageDirectories = (
    await readdir(join(root, "packages"), { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
  for (const directory of packageDirectories) {
    const packageRoot = join(root, "packages", directory);
    npmManifests.push(
      await loadManifest(join(packageRoot, "package.json"), operations),
    );
    denoManifests.push(
      await loadManifest(join(packageRoot, "deno.json"), operations),
    );
  }
  return [version, npmManifests, denoManifests];
}

/** Validate package names, versions, pairs, and internal dependency ranges. */
export async function checkWorkspaceVersions(
  root: string,
  operations: VersionFileOperations = defaultOperations,
): Promise<VersionCheckResult> {
  const [version, npmManifests, denoManifests] = await loadWorkspace(
    root,
    operations,
  );
  const packageNames = new Set<string>();
  for (let index = 0; index < npmManifests.length; index += 1) {
    const npm = npmManifests[index];
    const deno = denoManifests[index];
    if (npm == null || deno == null)
      throw new Error("Manifest pair is missing.");
    const npmName = requirePackageName(npm.manifest.name, npm.path);
    const denoName = requirePackageName(deno.manifest.name, deno.path);
    if (npmName !== denoName) {
      throw new Error(`${npm.path} and ${deno.path} name different packages.`);
    }
    if (packageNames.has(npmName)) {
      throw new Error(`Duplicate package name: ${npmName}`);
    }
    packageNames.add(npmName);
    if (npm.manifest.private === true) {
      throw new Error(`${npm.path} must be public.`);
    }
    if (npm.manifest.version !== version) {
      throw new Error(`${npm.path} does not match VERSION ${version}.`);
    }
    if (deno.manifest.version !== version) {
      throw new Error(`${deno.path} does not match VERSION ${version}.`);
    }
  }
  for (const npm of npmManifests) {
    checkInternalDependencies(npm.manifest, npm.path);
  }
  return { packageCount: packageNames.size, version };
}

function updatedManifest(loaded: LoadedManifest, version: string): string {
  const value = { ...loaded.manifest, version };
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function removeTemporaries(
  edits: readonly PlannedEdit[],
  operations: VersionFileOperations,
): Promise<void> {
  await Promise.all(
    edits.map(async (edit) => await operations.remove(edit.temporaryPath)),
  );
}

async function restoreEdits(
  edits: readonly PlannedEdit[],
  operations: VersionFileOperations,
): Promise<void> {
  const failures: unknown[] = [];
  for (const edit of edits) {
    const restorePath = `${edit.path}.oseo-restore-${process.pid}`;
    try {
      await operations.write(restorePath, edit.original);
      await operations.rename(restorePath, edit.path);
    } catch (error) {
      failures.push(error);
    } finally {
      await operations.remove(restorePath).catch(() => undefined);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Version rollback failed.");
  }
}

/** Atomically update VERSION and all npm and JSR package manifests. */
export async function setWorkspaceVersion(
  root: string,
  version: string,
  operations: VersionFileOperations = defaultOperations,
): Promise<void> {
  if (!semverPattern.test(version)) {
    throw new Error(`Invalid strict SemVer: ${version}`);
  }
  await checkWorkspaceVersions(root, operations);
  const [, npmManifests, denoManifests] = await loadWorkspace(root, operations);
  const versionPath = join(root, "VERSION");
  const versionOriginal = await operations.read(versionPath);
  const files: readonly Omit<PlannedEdit, "temporaryPath">[] = [
    {
      original: versionOriginal,
      path: versionPath,
      replacement: `${version}\n`,
    },
    ...npmManifests.map((loaded) => ({
      original: loaded.bytes,
      path: loaded.path,
      replacement: updatedManifest(loaded, version),
    })),
    ...denoManifests.map((loaded) => ({
      original: loaded.bytes,
      path: loaded.path,
      replacement: updatedManifest(loaded, version),
    })),
  ];
  const edits = files.map((file, index): PlannedEdit => {
    const temporaryPath = join(
      dirname(file.path),
      `.oseo-version-${process.pid}-${index}.tmp`,
    );
    return {
      original: file.original,
      path: file.path,
      replacement: file.replacement,
      temporaryPath,
    };
  });
  try {
    for (const edit of edits) {
      await operations.write(edit.temporaryPath, edit.replacement);
    }
  } catch (error) {
    await removeTemporaries(edits, operations);
    throw new Error("Version update stopped before changing any manifest.", {
      cause: error,
    });
  }

  const replaced: PlannedEdit[] = [];
  try {
    for (const edit of edits) {
      await operations.rename(edit.temporaryPath, edit.path);
      replaced.push(edit);
    }
  } catch (error) {
    await restoreEdits(replaced, operations);
    await removeTemporaries(edits, operations);
    throw new Error("Version update failed and original files were restored.", {
      cause: error,
    });
  }
}

async function main(args: readonly string[]): Promise<void> {
  const mode = args[0];
  const root = process.cwd();
  if (mode === "check") {
    const result = await checkWorkspaceVersions(root);
    console.log(
      `version=${result.version} packages=${result.packageCount} status=valid`,
    );
    return;
  }
  if (mode === "set") {
    const deno = (globalThis as { readonly Deno?: unknown }).Deno;
    if (deno != null) throw new Error("Version set mode requires Node.js.");
    const version = args[1];
    if (version == null) throw new Error("Set mode requires a version.");
    await setWorkspaceVersion(root, version);
    console.log(`version=${version} status=updated`);
    return;
  }
  throw new Error("Usage: versions.ts check | set <version>");
}

const entryPath = process.argv[1];
if (entryPath != null && pathToFileURL(entryPath).href === import.meta.url) {
  await main(process.argv.slice(2));
}
