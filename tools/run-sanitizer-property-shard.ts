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

import { spawnSync } from "node:child_process";
import { sharedSanitizerPropertyFiles } from "./sanitizer-property-shard.ts";
import { parseTestShardArguments } from "./shard.ts";

const { shard } = parseTestShardArguments(process.argv.slice(2));
const files = sharedSanitizerPropertyFiles(process.cwd(), shard);
// An empty explicit list would make Node discover everything again.
if (files.length > 0) {
  const child = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=4", ...files],
    { stdio: "inherit" },
  );
  if (child.error) throw child.error;
  if (child.signal != null) process.kill(process.pid, child.signal);
  else process.exitCode = child.status ?? 1;
}
