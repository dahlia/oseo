/* eslint-disable no-await-in-loop -- Atomic writes and renames are ordered. */

import process from "node:process";
import { execFile } from "node:child_process";
import { readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { isObject, isString } from "./value-kinds.ts";

const numericIdentifier = String.raw`(?:0|[1-9]\d*)`;
const releaseVersion = new RegExp(
  String.raw`^${numericIdentifier}(\.${numericIdentifier}){2}(?![\s\S])`,
  "u",
);
const nextFile = join("changes.d", "next");
const execFileAsync = promisify(execFile);

interface PackageManifest {
  readonly name?: unknown;
  readonly private?: unknown;
  readonly version?: unknown;
  readonly dependencies?: unknown;
  readonly devDependencies?: unknown;
  readonly optionalDependencies?: unknown;
  readonly peerDependencies?: unknown;
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
  readonly state: "development" | "released";
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
  if (!bytes.endsWith("\n") || !releaseVersion.test(bytes.slice(0, -1))) {
    throw new Error(
      `${source} must contain one x.y.z SemVer and a trailing newline.`,
    );
  }
  return bytes.slice(0, -1);
}

async function readNextVersion(
  root: string,
  operations: VersionFileOperations,
): Promise<string | undefined> {
  const path = join(root, nextFile);
  let bytes: string;
  try {
    bytes = await operations.read(path);
  } catch (error) {
    if (isObject(error) && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  return strictVersion(bytes, nextFile);
}

async function runSacho(root: string, args: readonly string[]): Promise<void> {
  try {
    await execFileAsync("sacho", args, { cwd: root });
  } catch (error) {
    throw new Error(`sacho ${args.join(" ")} failed.`, { cause: error });
  }
}

function parseManifest(bytes: string, path: string): PackageManifest {
  try {
    // SAFETY: The following object check establishes a manifest record.
    const value = JSON.parse(bytes) as unknown;
    if (!isObject(value) || Array.isArray(value)) {
      throw new Error("manifest is not an object");
    }
    // SAFETY: Workspace manifests are trusted repository inputs.
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

function requirePackageName(
  value: PackageManifest["name"],
  path: string,
): string {
  if (!isString(value) || !value.startsWith("@oseo/")) {
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
    if (!isObject(field) || Array.isArray(field)) {
      throw new Error(`${path} dependency fields must be objects.`);
    }
    for (const [name, range] of Object.entries(field)) {
      if (!isString(range)) {
        throw new Error(`${path} dependency ranges must be strings.`);
      }
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
): Promise<readonly [readonly LoadedManifest[], readonly LoadedManifest[]]> {
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
  return [npmManifests, denoManifests];
}

/** Validate package names, versions, pairs, and internal dependency ranges. */
export async function checkWorkspaceVersions(
  root: string,
  operations: VersionFileOperations = defaultOperations,
): Promise<VersionCheckResult> {
  const [npmManifests, denoManifests] = await loadWorkspace(root, operations);
  const first = npmManifests[0];
  if (first == null) throw new Error("No package manifests found.");
  const next = await readNextVersion(root, operations);
  const version = next ?? first.manifest.version;
  if (!isString(version) || !releaseVersion.test(version)) {
    throw new Error(`${first.path} must contain an x.y.z SemVer.`);
  }
  const source = next == null ? "released version" : nextFile;
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
      throw new Error(`${npm.path} does not match ${source} ${version}.`);
    }
    if (deno.manifest.version !== version) {
      throw new Error(`${deno.path} does not match ${source} ${version}.`);
    }
  }
  for (const npm of npmManifests) {
    checkInternalDependencies(npm.manifest, npm.path);
  }
  await runSacho(root, ["check"]);
  if (next == null) await runSacho(root, ["show", version]);
  return {
    packageCount: packageNames.size,
    state: next == null ? "released" : "development",
    version,
  };
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

/** Update Sacho and npm/JSR manifests, rolling back on failure. */
export async function bumpWorkspaceVersion(
  root: string,
  version: string,
  operations: VersionFileOperations = defaultOperations,
): Promise<void> {
  if (!releaseVersion.test(version)) {
    throw new Error(`Expected an x.y.z SemVer, got: ${version}`);
  }
  const current = await checkWorkspaceVersions(root, operations);
  if (current.state === "released" && current.version === version) {
    throw new Error(`${version} is already released; choose a new version.`);
  }
  if (current.version === version) return;
  const [npmManifests, denoManifests] = await loadWorkspace(root, operations);
  const edits = [...npmManifests, ...denoManifests].map((file, index) => {
    const temporaryPath = join(
      dirname(file.path),
      `.oseo-version-${process.pid}-${index}.tmp`,
    );
    return {
      original: file.bytes,
      path: file.path,
      replacement: updatedManifest(file, version),
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
    // Sacho updates next and the materialized changelog in its own transaction.
    // Run it last so any earlier filesystem failure leaves both untouched.
    await runSacho(root, ["next", version]);
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
      `version=${result.version} packages=${result.packageCount} ` +
        `state=${result.state} status=valid`,
    );
    return;
  }
  if (mode === "bump") {
    // SAFETY: This probe only reads the optional Deno global discriminator.
    const deno = (globalThis as { readonly Deno?: unknown }).Deno;
    if (deno != null) throw new Error("Version bump mode requires Node.js.");
    const version = args[1];
    if (version == null) throw new Error("Bump mode requires a version.");
    await bumpWorkspaceVersion(root, version);
    console.log(`version=${version} status=updated`);
    return;
  }
  throw new Error("Usage: versions.ts check | bump <version>");
}

const entryPath = process.argv[1];
if (entryPath != null && pathToFileURL(entryPath).href === import.meta.url) {
  await main(process.argv.slice(2));
}
