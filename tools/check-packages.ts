/* eslint-disable no-await-in-loop -- Archive checks report in package order. */

import { spawn } from "node:child_process";
import {
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface PackedFile {
  readonly path: string;
}

interface PackResult {
  readonly filename: string;
  readonly files: readonly PackedFile[];
  readonly name: string;
}

interface CommandResult {
  readonly stderr: string;
  readonly stdout: string;
}

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, unknown>>;
  readonly devDependencies?: Readonly<Record<string, unknown>>;
  readonly name?: unknown;
  readonly optionalDependencies?: Readonly<Record<string, unknown>>;
  readonly peerDependencies?: Readonly<Record<string, unknown>>;
  readonly version?: unknown;
}

async function run(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<CommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Uint8Array[] = [];
    const stderr: Uint8Array[] = [];
    child.stdout.on("data", (chunk: Uint8Array) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Uint8Array) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = {
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8"),
      };
      if (code !== 0) {
        reject(
          new Error(
            `${command} ${args.join(" ")} failed (${code}):\n` + result.stderr,
          ),
        );
      } else {
        resolve(result);
      }
    });
  });
}

function requireFile(
  files: ReadonlySet<string>,
  path: string,
  name: string,
): void {
  if (!files.has(path)) throw new Error(`${name} archive is missing ${path}.`);
}

function requireReleaseDependencies(
  manifest: PackageManifest,
  expectedName: string,
): void {
  if (manifest.name !== expectedName || typeof manifest.version !== "string") {
    throw new Error(`${expectedName} archive has invalid package metadata.`);
  }
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
      if (range !== manifest.version) {
        throw new Error(
          `${expectedName} archive dependency ${name} must use ` +
            `release version ${manifest.version}.`,
        );
      }
    }
  }
}

function releaseDependencies(
  dependencies: Readonly<Record<string, unknown>> | undefined,
  version: string,
): Readonly<Record<string, unknown>> | undefined {
  if (dependencies == null) return undefined;
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, range]) => {
      if (!name.startsWith("@oseo/")) return [name, range];
      if (range !== "workspace:*") {
        throw new Error(
          `Internal dependency ${name} must use workspace:* before packing.`,
        );
      }
      return [name, version];
    }),
  );
}

async function stagePackage(
  root: string,
  directory: string,
  destination: string,
): Promise<string> {
  const source = join(root, "packages", directory);
  const stage = join(destination, `stage-${directory}`);
  const manifest = JSON.parse(
    await readFile(join(source, "package.json"), "utf8"),
  ) as PackageManifest;
  if (typeof manifest.version !== "string") {
    throw new Error(`${directory} package version is missing.`);
  }
  const [rootLicense, packageLicense] = await Promise.all([
    readFile(join(root, "LICENSE"), "utf8"),
    readFile(join(source, "LICENSE"), "utf8"),
  ]);
  if (packageLicense !== rootLicense) {
    throw new Error(`${directory} LICENSE does not match the repository.`);
  }
  const releaseManifest = {
    ...manifest,
    dependencies: releaseDependencies(manifest.dependencies, manifest.version),
    devDependencies: releaseDependencies(
      manifest.devDependencies,
      manifest.version,
    ),
    optionalDependencies: releaseDependencies(
      manifest.optionalDependencies,
      manifest.version,
    ),
    peerDependencies: releaseDependencies(
      manifest.peerDependencies,
      manifest.version,
    ),
  };
  await mkdir(stage);
  await copyFile(join(source, "LICENSE"), join(stage, "LICENSE"));
  await copyFile(join(source, "README.md"), join(stage, "README.md"));
  await cp(join(source, "dist"), join(stage, "dist"), { recursive: true });
  if (directory === "runtime-c") {
    await cp(join(source, "native"), join(stage, "native"), {
      recursive: true,
    });
  }
  await writeFile(
    join(stage, "package.json"),
    `${JSON.stringify(releaseManifest, null, 2)}\n`,
  );
  return stage;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const destination = await mkdtemp(join(tmpdir(), "oseo-packages-"));
  try {
    const packageDirectories = (
      await readdir(join(root, "packages"), { withFileTypes: true })
    )
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted();
    for (const directory of packageDirectories) {
      const stage = await stagePackage(root, directory, destination);
      const result = await run(
        "aube",
        ["pack", "-C", stage, "--json", "--pack-destination", destination],
        root,
      );
      const packed = (JSON.parse(result.stdout) as readonly PackResult[])[0];
      if (packed == null)
        throw new Error(`${directory} did not produce a pack.`);
      const files = new Set(packed.files.map((file) => file.path));
      for (const path of [
        "LICENSE",
        "README.md",
        "dist/index.d.ts",
        "dist/index.d.ts.map",
        "dist/index.js",
        "dist/index.js.map",
        "package.json",
      ]) {
        requireFile(files, path, packed.name);
      }
      if ([...files].some((path) => path.startsWith("src/"))) {
        throw new Error(`${packed.name} npm archive contains private source.`);
      }
      if (packed.name === "@oseo/runtime-c") {
        requireFile(files, "native/oseo_runtime.h", packed.name);
        requireFile(files, "native/runtime_internal.h", packed.name);
        requireFile(files, "native/runtime.c", packed.name);
      }
      const manifestBytes = await run(
        "tar",
        ["-xOzf", packed.filename, "package/package.json"],
        root,
      );
      const manifest = JSON.parse(manifestBytes.stdout) as PackageManifest;
      requireReleaseDependencies(manifest, packed.name);
      console.log(`${packed.name}: npm archive valid`);
    }
  } finally {
    await rm(destination, { force: true, recursive: true });
  }
}

await main();
