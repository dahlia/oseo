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

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";

export function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

interface ArtifactInventory {
  [path: string]: string;
}

/** Return a portable manifest, rejecting symlinks and special files. */
export function inventory(directory: string, prefix = ""): ArtifactInventory {
  const files: ArtifactInventory = {};
  for (const entry of readdirSync(directory, { withFileTypes: true }).toSorted(
    (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  )) {
    if (prefix === "" && entry.name === "checksums.json") continue;
    const path = join(directory, entry.name);
    const key = `${prefix}${entry.name}`;
    if (entry.isDirectory()) Object.assign(files, inventory(path, `${key}/`));
    else if (entry.isFile()) files[key] = sha256(path);
    else throw new Error(`Unexpected artifact member ${key}.`);
  }
  return files;
}

export function seal(directory: string, sha: string): void {
  const files = inventory(directory);
  if (Object.keys(files).length === 0) throw new Error("Empty artifact.");
  writeFileSync(
    join(directory, "checksums.json"),
    JSON.stringify({ sha, files }),
    {
      flag: "wx",
    },
  );
}

export function verify(directory: string, sha: string): void {
  const manifest: unknown = JSON.parse(
    readFileSync(join(directory, "checksums.json"), "utf8"),
  );
  if (!isDeepStrictEqual(manifest, { sha, files: inventory(directory) })) {
    throw new Error(
      `Artifact does not match its checked inventory: ${directory}`,
    );
  }
}

/** Verify all downloaded payloads belong to this exact workflow source. */
export function verifyCurrent(...directories: readonly string[]): void {
  const sha = process.env.GITHUB_SHA;
  if (sha == null) throw new Error("Missing GitHub source SHA.");
  for (const directory of directories) verify(directory, sha);
}
