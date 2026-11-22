/* eslint-disable no-await-in-loop -- Writes follow dependency order. */
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

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";

import {
  parsedObject,
  type StructuredDataRecord,
  type StructuredDataValue,
} from "../structured-data.ts";
import { isNumber, isString } from "../value-kinds.ts";
import { inventory, sha256, verifyCurrent } from "./artifacts.ts";
import { canonical, git, identify } from "./identity.ts";

const npmRegistry = "https://registry.npmjs.org";

async function registry(
  url: string,
): Promise<StructuredDataRecord | undefined> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return object(await response.json());
}

function object<T>(value: T): StructuredDataRecord {
  return parsedObject(value, "Release metadata");
}

function json(path: string): StructuredDataRecord {
  return object(JSON.parse(readFileSync(path, "utf8")));
}

/** Compare the version series used by the two public npm dist-tags. */
export function advancesTag(
  candidate: string,
  current: StructuredDataValue | undefined,
): boolean {
  if (current == null) return true;
  if (!isString(current)) throw new Error("Invalid npm dist-tag.");
  const canary = /-canary\.(\d+)$/u;
  const candidateRun = candidate.match(canary)?.[1];
  if (candidateRun != null) {
    const activeRun = current.match(canary)?.[1];
    if (activeRun == null)
      throw new Error(`Invalid canary dist-tag: ${current}`);
    return BigInt(candidateRun) >= BigInt(activeRun);
  }
  // `latest` may initially be set by the npm bootstrap publish.
  const stable = /^(\d+)\.(\d+)\.(\d+)$/u;
  const release = candidate.match(stable);
  const active = current.match(stable);
  if (release == null || active == null) {
    if (active == null && release != null && canary.test(current)) return true;
    throw new Error(`Cannot compare stable versions ${candidate}, ${current}.`);
  }
  for (const part of [1, 2, 3]) {
    const a = BigInt(release[part]!);
    const b = BigInt(active[part]!);
    if (a !== b) return a > b;
  }
  return true;
}

interface PackageEntry {
  readonly name: string;
  readonly directory: string;
  readonly tarball: string;
}

function stagedPackages(directory: string): readonly PackageEntry[] {
  const list = object(
    JSON.parse(readFileSync(join(directory, "packages.json"), "utf8")),
  ).packages;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("Missing staged packages.");
  }
  return list.map((value) => {
    const { name, directory: folder, tarball } = object(value);
    if (
      !isString(name) ||
      !isString(folder) ||
      !isString(tarball) ||
      !/^[a-z0-9-]+$/u.test(folder) ||
      name !== `@oseo/${folder}` ||
      !/^oseo-[a-z0-9.-]+\.tgz$/u.test(tarball)
    )
      throw new Error("Invalid staged package.");
    return { name, directory: folder, tarball };
  });
}

async function requireNpmIntegrity(
  name: string,
  version: string,
  expected: string,
): Promise<boolean> {
  // Read the packument rather than /:version, which is not a uniform
  // lookup endpoint for scoped packages. Only absence is a retry signal.
  const data = await registry(`${npmRegistry}/${encodeURIComponent(name)}`);
  if (data === undefined) return false;
  const existing = object(object(data).versions)[version];
  if (existing === undefined) return false;
  if (object(object(existing).dist).integrity !== expected) {
    throw new Error(`${name}@${version} differs from the staged tarball.`);
  }
  return true;
}

async function npmTags(name: string): Promise<StructuredDataRecord> {
  const data = await registry(
    `${npmRegistry}/-/package/${encodeURIComponent(name)}/dist-tags`,
  );
  return data === undefined ? {} : object(data);
}

async function confirm(
  check: () => Promise<boolean>,
  name: string,
): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt++) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 5_000));
  }
  throw new Error(`${name} was not visible after publication.`);
}

const rekorConflict = new RegExp(
  "^npm error code TLOG_CREATE_ENTRY_ERROR\\r?\\n" +
    "npm error error creating tlog entry - \\(409\\) an equivalent " +
    "entry already exists in the transparency log with UUID " +
    "(?:[0-9a-f]{64}|[0-9a-f]{80})\\r?$",
  "mu",
);

async function runNpmPublish(
  directory: string,
  args: readonly string[],
  allowRekorRetry: boolean,
): Promise<Error | undefined> {
  return await new Promise((complete, reject) => {
    const child = spawn("npm", args, {
      cwd: directory,
      stdio: ["inherit", "inherit", "pipe"],
    });
    child.stderr.pipe(process.stderr, { end: false });
    const stderr: Uint8Array[] = [];
    if (allowRekorRetry) {
      child.stderr.on("data", (chunk: Uint8Array) => stderr.push(chunk));
    }
    child.once("error", reject);
    child.once("close", (status, signal) => {
      if (status === 0) {
        complete(undefined);
        return;
      }
      const error = new Error(
        `npm publish failed (${signal ?? `exit ${status}`}).`,
      );
      if (
        allowRekorRetry &&
        status === 1 &&
        rekorConflict.test(Buffer.concat(stderr).toString("utf8"))
      ) {
        complete(error);
      } else {
        reject(error);
      }
    });
  });
}

async function publishNpm(
  directory: string,
  version: string,
  tag: string,
): Promise<void> {
  for (const pkg of stagedPackages(directory)) {
    const file = join(directory, "npm", pkg.tarball);
    const hash = createHash("sha512")
      .update(readFileSync(file))
      .digest("base64");
    const check = async (): Promise<boolean> =>
      await requireNpmIntegrity(pkg.name, version, `sha512-${hash}`);
    const existing = await check();
    let current = (await npmTags(pkg.name))[tag];
    if (!existing) {
      const destination = advancesTag(version, current) ? tag : `${tag}-older`;
      const args = [
        "publish",
        file,
        "--access",
        "public",
        "--tag",
        destination,
        "--registry",
        npmRegistry,
        "--ignore-scripts",
      ];
      const conflict = await runNpmPublish(directory, args, true);
      if (conflict == null) {
        await confirm(check, pkg.name);
        continue;
      }
      const published = await check();
      current = (await npmTags(pkg.name))[tag];
      if (!published) {
        if (destination === tag && !advancesTag(version, current)) {
          throw conflict;
        }
        console.error(`Retrying npm publish for ${pkg.name}@${version}.`);
        await runNpmPublish(directory, args, false);
        await confirm(check, pkg.name);
        continue;
      }
    }
    if (advancesTag(version, current) && current !== version) {
      execFileSync(
        "npm",
        [
          "dist-tag",
          "add",
          `${pkg.name}@${version}`,
          tag,
          "--registry",
          npmRegistry,
        ],
        { cwd: directory, stdio: "inherit" },
      );
    }
  }
}

async function checkJsr(
  directory: string,
  pkg: PackageEntry,
  version: string,
): Promise<boolean> {
  const data = await registry(
    `https://jsr.io/${pkg.name}/${version}_meta.json`,
  );
  if (data === undefined) return false;
  const manifest = object(object(data).manifest);
  const files = inventory(join(directory, "jsr", pkg.directory));
  const checksums = Object.fromEntries(
    Object.entries(manifest).map(([path, entry]) => [
      path,
      object(entry).checksum,
    ]),
  );
  const expected = Object.fromEntries(
    Object.entries(files).map(([path, hash]) => [`/${path}`, `sha256-${hash}`]),
  );
  const config = object(
    json(join(directory, "jsr", pkg.directory, "deno.json")),
  );
  const exports = isString(config.exports)
    ? { ".": config.exports }
    : config.exports;
  if (
    !isDeepStrictEqual(checksums, expected) ||
    !isDeepStrictEqual(object(data).exports, exports)
  ) {
    throw new Error(
      `${pkg.name}@${version} differs from the staged JSR source.`,
    );
  }
  return true;
}

async function publishJsr(directory: string, version: string): Promise<void> {
  const packages = stagedPackages(directory);
  let missing = false;
  for (const pkg of packages) {
    if (!(await checkJsr(directory, pkg, version))) missing = true;
  }
  if (missing) {
    // The pinned Deno resolves the staged workspace, orders dependencies
    // and skips previously-published members. We verify every skip above.
    execFileSync("deno", ["publish", "--allow-slow-types"], {
      cwd: join(directory, "jsr"),
      stdio: "inherit",
    });
    for (const pkg of packages) {
      await confirm(
        async () => await checkJsr(directory, pkg, version),
        pkg.name,
      );
    }
  }
}

function gh(args: readonly string[]): string {
  return execFileSync("gh", args, { encoding: "utf8" }).trim();
}

async function githubRelease(
  version: string,
  directory: string,
  archives: readonly string[],
): Promise<void> {
  const repo = ["--repo", canonical];
  const list = await fetch(
    `https://api.github.com/repos/${canonical}/releases/tags/${version}`,
    {
      headers: { Authorization: `Bearer ${process.env.GH_TOKEN}` },
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (list.status === 404) {
    // An interrupted first run may have left an unpublished draft.
    const drafts = gh([
      "api",
      "--paginate",
      `repos/${canonical}/releases`,
      "--jq",
      `.[] | select(.draft and .tag_name == "${version}") | .id`,
    ]);
    if (drafts === "") {
      gh([
        "release",
        "create",
        version,
        ...repo,
        "--draft",
        "--verify-tag",
        "--title",
        `Oseo ${version}`,
        "--notes-file",
        join(directory, "notes.md"),
      ]);
    }
  } else if (!list.ok) {
    throw new Error(`GitHub release lookup failed: HTTP ${list.status}`);
  }
  const view = object(
    JSON.parse(
      gh([
        "release",
        "view",
        version,
        ...repo,
        "--json",
        "databaseId,isDraft,body",
      ]),
    ),
  );
  if (
    !isNumber(view.databaseId) ||
    !isString(view.body) ||
    view.body.trim() !==
      readFileSync(join(directory, "notes.md"), "utf8").trim()
  ) {
    throw new Error("GitHub Release does not match the staged notes.");
  }
  const assets = gh([
    "api",
    "--paginate",
    `repos/${canonical}/releases/${view.databaseId}/assets`,
    "--jq",
    ".[] | [.name, .digest] | @tsv",
  ]);
  const existing = new Map(
    assets
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, digest] = line.split("\t");
        return [name, digest] as const;
      }),
  );
  const files = stagedPackages(directory).map((pkg) =>
    join(directory, "npm", pkg.tarball),
  );
  for (const folder of archives) {
    const names = readdirSync(folder).filter((name) =>
      name.endsWith(".tar.bz2"),
    );
    if (names.length !== 1)
      throw new Error(`Unexpected CLI archives in ${folder}`);
    files.push(join(folder, names[0]!));
  }
  for (const file of files) {
    const name = file.split("/").at(-1);
    if (existing.has(name)) {
      if (existing.get(name) !== `sha256:${sha256(file)}`) {
        throw new Error(
          `GitHub asset ${name} differs from the checked artifact.`,
        );
      }
    } else {
      gh(["release", "upload", version, ...repo, file]);
    }
  }
  if (view.isDraft === true) {
    const latest = (await npmTags("@oseo/cli")).latest === version;
    gh([
      "release",
      "edit",
      version,
      ...repo,
      "--draft=false",
      `--latest=${latest}`,
    ]);
  }
}

const entry = process.argv[1];
if (entry != null && import.meta.filename === resolve(entry)) {
  const [mode, directory, ...archives] = process.argv.slice(2);
  if (directory == null) throw new Error("Missing checked artifact directory.");
  const data = object(json(join(directory, "identity.json")));
  const sha = git(["rev-parse", "HEAD"]);
  const base = String(data.npm).split("-")[0]!;
  const identity = identify(base, sha, process.env);
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.OSEO_ENABLE_PUBLICATION !== "true" ||
    identity.channel === "build" ||
    !isDeepStrictEqual(data, identity)
  )
    throw new Error("Not an authorized publication run.");
  verifyCurrent(directory, ...archives);
  if (mode === "npm") {
    await publishNpm(
      directory,
      identity.npm,
      identity.channel === "stable" ? "latest" : "canary",
    );
  } else if (mode === "jsr") {
    await publishJsr(directory, identity.jsr);
  } else if (
    mode === "github" &&
    identity.channel === "stable" &&
    archives.length === 2
  ) {
    await githubRelease(identity.npm, directory, archives);
  } else if (mode === "stable-docs" && identity.channel === "stable") {
    const deploy = (await npmTags("@oseo/cli")).latest === identity.npm;
    process.stdout.write(deploy ? "true" : "false");
  } else if (mode === "canary-docs" && identity.channel === "canary") {
    const head = gh([
      "api",
      `repos/${canonical}/git/ref/heads/main`,
      "--jq",
      ".object.sha",
    ]);
    process.stdout.write(head === sha ? "true" : "false");
  } else {
    throw new Error(`Invalid publication mode: ${mode}`);
  }
}
