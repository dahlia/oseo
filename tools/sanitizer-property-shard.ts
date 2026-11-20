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

import { globSync } from "node:fs";
import { sep } from "node:path";
import { dedicatedSanitizerPropertyFiles } from "./native-shard.ts";
import type { TestShard } from "./shard.ts";

/**
 * The ordinary property files the sanitizer property tasks pass to Node,
 * sorted by code point as Node's test runner sorts an explicit file list.
 * Paths use forward slashes on every host so they compare with the
 * dedicated-file list.
 */
export function discoverSanitizerPropertyFiles(cwd: string): readonly string[] {
  return globSync("tests/property/*.property.test.ts", { cwd })
    .map((file) => (sep === "/" ? file : file.split(sep).join("/")))
    .toSorted();
}

/**
 * Select one shared sanitizer property shard without the dedicated files.
 *
 * Node's `--test-shard=INDEX/TOTAL` keeps the files at sorted positions
 * congruent to `INDEX - 1` modulo `TOTAL`. Selecting those positions over
 * the complete list and only then dropping the dedicated files keeps every
 * other file in the shard it already ran in. Without a shard the whole
 * list runs, still without the dedicated files.
 */
export function sharedSanitizerPropertyFiles(
  cwd: string,
  shard?: TestShard,
): readonly string[] {
  return discoverSanitizerPropertyFiles(cwd).filter(
    (file, position) =>
      (shard == null || position % shard.total === shard.index - 1) &&
      !dedicatedSanitizerPropertyFiles.includes(file),
  );
}
