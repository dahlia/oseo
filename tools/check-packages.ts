/* eslint-disable no-await-in-loop -- Archive checks report in package order. */
/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
import { join, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { isString } from "./value-kinds.ts";

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
  readonly license?: unknown;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly name?: unknown;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
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

const runtimeNativePrefix = "native/";
const gpl = "GPL-3.0-or-later";
const mitNotice = "MIT-LICENSE.txt";
const unicodeNotice = "UNICODE-LICENSE.txt";
const rolldownNotice = "ROLLDOWN-LICENSE.txt";

function licenseFor(directory: string): string {
  if (directory === "backend-c") return `${gpl} AND MIT`;
  if (directory === "runtime-c") return `${gpl} AND MIT AND Unicode-3.0`;
  if (directory === "unicode") return `${gpl} AND Unicode-3.0`;
  return gpl;
}

function requireLicense(manifest: PackageManifest, directory: string): void {
  const expected = licenseFor(directory);
  if (manifest.license !== expected) {
    throw new Error(`${directory} license field must be ${expected}.`);
  }
}

function licenseFiles(directory: string): readonly string[] {
  if (directory === "backend-c") return ["LICENSE", mitNotice];
  if (directory === "runtime-c") return ["LICENSE", mitNotice, unicodeNotice];
  if (directory === "unicode") return ["LICENSE", unicodeNotice];
  if (directory === "cli") return ["LICENSE", rolldownNotice];
  return ["LICENSE"];
}

function noticeSource(root: string, notice: string): string {
  if (notice === unicodeNotice)
    return join(root, "packages", "unicode", notice);
  if (notice === rolldownNotice) return join(root, "packages", "cli", notice);
  return join(root, notice);
}

function requireNotice(actual: string, expected: string, path: string): void {
  if (!actual.includes(expected))
    throw new Error(`${path} lacks its expected notice.`);
}

/**
 * Archive paths of the reviewed C runtime assets, derived from the
 * `@oseo/runtime-c` public entry point instead of a copy maintained here.
 * That provider is the list the compiler consumes and the build ships, and
 * a package test pins it to a reviewed order, so a new runtime unit reaches
 * this check as soon as it is added there.
 */
const runtimeNativeFiles: ReadonlySet<string> = new Set(
  cRuntimeProvider
    .getRuntimeInput()
    .assets.map((asset) => `${runtimeNativePrefix}${asset.name}`),
);

if (runtimeNativeFiles.size === 0) {
  throw new Error(
    "The @oseo/runtime-c asset list is empty, so the packaging check " +
      "would verify nothing.",
  );
}

/**
 * Require the packed `@oseo/runtime-c` archive to hold exactly the reviewed
 * native assets. A missing asset fails, and so does a packed native file
 * that no reviewed asset names, so neither the archive nor the asset list
 * can drift away from the other unnoticed.
 */
function requireRuntimeNativeFiles(
  files: ReadonlySet<string>,
  name: string,
): void {
  for (const path of runtimeNativeFiles) requireFile(files, path, name);
  const unexpected = [...files]
    .filter(
      (path) =>
        path.startsWith(runtimeNativePrefix) && !runtimeNativeFiles.has(path),
    )
    .toSorted();
  if (unexpected.length > 0) {
    throw new Error(
      `${name} archive packs unreviewed native files: ` +
        `${unexpected.join(", ")}. List each file in the runtime asset ` +
        "list of packages/runtime-c/src/index.ts or stop packing it.",
    );
  }
}

function requireReleaseDependencies(
  manifest: PackageManifest,
  expectedName: string,
  version: string,
): void {
  if (manifest.name !== expectedName || manifest.version !== version) {
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
  dependencies: Readonly<Record<string, string>> | undefined,
  version: string,
): Readonly<Record<string, string>> | undefined {
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
  version?: string,
): Promise<string> {
  const source = join(root, "packages", directory);
  const stage = join(destination, `stage-${directory}`);
  // SAFETY: Checked-in package manifests are repository-owned build inputs.
  const manifest = JSON.parse(
    await readFile(join(source, "package.json"), "utf8"),
  ) as PackageManifest;
  if (!isString(manifest.version)) {
    throw new Error(`${directory} package version is missing.`);
  }
  requireLicense(manifest, directory);
  // SAFETY: Checked-in Deno manifests are repository-owned build inputs.
  const denoManifest = JSON.parse(
    await readFile(join(source, "deno.json"), "utf8"),
  ) as PackageManifest;
  requireLicense(denoManifest, directory);
  const releaseManifest = {
    ...manifest,
    version: version ?? manifest.version,
    dependencies: releaseDependencies(
      manifest.dependencies,
      version ?? manifest.version,
    ),
    devDependencies: releaseDependencies(
      manifest.devDependencies,
      version ?? manifest.version,
    ),
    optionalDependencies: releaseDependencies(
      manifest.optionalDependencies,
      version ?? manifest.version,
    ),
    peerDependencies: releaseDependencies(
      manifest.peerDependencies,
      version ?? manifest.version,
    ),
  };
  await mkdir(stage);
  for (const notice of licenseFiles(directory)) {
    const path = join(source, notice);
    const [canonical, local] = await Promise.all([
      readFile(noticeSource(root, notice), "utf8"),
      readFile(path, "utf8"),
    ]);
    if (local !== canonical) {
      throw new Error(`${directory}/${notice} does not match the repository.`);
    }
    await copyFile(path, join(stage, notice));
  }
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

/** Pack and inspect the very tarballs retained for release. */
export async function packNpmPackages(
  root: string,
  destination: string,
  version?: string,
): Promise<void> {
  const scratch = await mkdtemp(join(tmpdir(), "oseo-packages-"));
  try {
    const example = join(scratch, "license-example.ts");
    await writeFile(
      example,
      'const result: boolean = /\\p{Letter}/u.test("A");',
    );
    const emitted = await run(
      process.execPath,
      ["packages/cli/dist/main.js", "build", "--emit-c", example],
      root,
    );
    for (const notice of [mitNotice, unicodeNotice]) {
      const canonical = await readFile(noticeSource(root, notice), "utf8");
      requireNotice(emitted.stdout, canonical, "CLI emitted C");
    }

    const packageDirectories = (
      await readdir(join(root, "packages"), { withFileTypes: true })
    )
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted();
    for (const directory of packageDirectories) {
      const stage = await stagePackage(root, directory, scratch, version);
      const result = await run(
        "pnpm",
        [
          "--ignore-workspace",
          "pack",
          "--json",
          "--pack-destination",
          destination,
        ],
        stage,
      );
      // SAFETY: pnpm pack --json returns one pack result record.
      const packed = JSON.parse(result.stdout) as PackResult;
      if (packed == null)
        throw new Error(`${directory} did not produce a pack.`);
      const files = new Set(packed.files.map((file) => file.path));
      for (const path of [
        ...licenseFiles(directory),
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
      const readPacked = async (path: string): Promise<string> =>
        (
          await run(
            "tar",
            [
              "-xOzf",
              resolvePath(destination, packed.filename),
              `package/${path}`,
            ],
            root,
          )
        ).stdout;
      for (const notice of licenseFiles(directory)) {
        if (
          (await readPacked(notice)) !==
          (await readFile(noticeSource(root, notice), "utf8"))
        ) {
          throw new Error(`${packed.name} packs a different ${notice}.`);
        }
      }
      if (directory === "runtime-c") {
        requireRuntimeNativeFiles(files, packed.name);
        for (const path of runtimeNativeFiles) {
          const identifier = path.endsWith("/runtime_unicode_tables.h")
            ? "MIT AND Unicode-3.0"
            : "MIT";
          requireNotice(
            await readPacked(path),
            `SPDX-License-Identifier: ${identifier} */`,
            path,
          );
        }
      }
      if (directory === "backend-c") {
        for (const suffix of [".js", ".js.map", ".d.ts", ".d.ts.map"]) {
          requireFile(files, `dist/emitted-c${suffix}`, packed.name);
        }
        requireNotice(
          await readPacked("dist/emitted-c.js"),
          "/*! SPDX-License-Identifier: MIT",
          "dist/emitted-c.js",
        );
      }
      // SAFETY: npm exposes the packed package.json bytes at this exact path.
      const manifest = JSON.parse(
        await readPacked("package.json"),
      ) as PackageManifest;
      requireLicense(manifest, directory);
      // SAFETY: The staging step wrote this manifest from repository inputs.
      const expected = JSON.parse(
        await readFile(join(stage, "package.json"), "utf8"),
      ) as PackageManifest;
      if (!isString(expected.version)) throw new Error("Missing pack version.");
      requireReleaseDependencies(
        manifest,
        `@oseo/${directory}`,
        expected.version,
      );
      console.log(`${packed.name}: npm archive valid`);
    }
  } finally {
    await rm(scratch, { force: true, recursive: true });
  }
}

if (
  process.argv[1] != null &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const destination = await mkdtemp(join(tmpdir(), "oseo-checked-packages-"));
  try {
    await packNpmPackages(process.cwd(), destination);
  } finally {
    await rm(destination, { force: true, recursive: true });
  }
}
