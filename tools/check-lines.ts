/* eslint-disable no-await-in-loop -- Recursive filesystem reads are bounded. */
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

import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const ignoredDirectories = new Set([".git", "dist", "node_modules"]);
const ignoredFiles = new Set(["pnpm-lock.yaml"]);
const maintainedExtensions = new Set([
  ".c",
  ".h",
  ".json",
  ".md",
  ".sh",
  ".toml",
  ".ts",
  ".yaml",
  ".yml",
]);

function exemptLine(path: string, line: string): boolean {
  if (line.includes("http://") || line.includes("https://")) return true;
  if (
    extname(path) === ".md" &&
    (line.trimStart().startsWith("|") || line.includes("]("))
  ) {
    return true;
  }
  // Generated closure-ledger entries are canonical one-line records that
  // check:m5c-closure-ledger owns; its hand-edited header still wraps.
  if (path === "docs/m5c-closure/ledger.yaml" && line.startsWith("  test/")) {
    return true;
  }
  // Upstream test262 paths are fixed identifiers like URLs: a manifest line
  // is exempt only when removing that unbreakable token would fit.
  if (
    path === "tests/test262/subset.yaml" ||
    path === "tests/test262/results.yaml" ||
    path === "docs/m5c-closure/observation-batches.yaml" ||
    path === "docs/m5c-closure/deferrals.yaml" ||
    path.startsWith("tests/test262/results/") ||
    path === "tests/compatibility-ratchet-overrides.yaml"
  ) {
    const token = line.match(/\btest\/[^\s"']+/u);
    if (token != null && line.length - token[0].length <= 80) return true;
  }
  return false;
}

async function walk(
  root: string,
  directory: string,
): Promise<readonly string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".oseo-")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name))
        files.push(...(await walk(root, path)));
    } else if (
      maintainedExtensions.has(extname(entry.name)) &&
      !ignoredFiles.has(entry.name)
    ) {
      files.push(relative(root, path));
    }
  }
  return files;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const failures: string[] = [];
  for (const path of await walk(root, root)) {
    const lines = (await readFile(join(root, path), "utf8")).split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      if (line.length > 80 && !exemptLine(path, line)) {
        failures.push(`${path}:${index + 1}: ${line.length} columns`);
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`Lines exceed 80 columns:\n${failures.join("\n")}`);
  }
  console.log("line-length=valid");
}

await main();
