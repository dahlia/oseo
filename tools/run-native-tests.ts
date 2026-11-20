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
import { fileURLToPath } from "node:url";
import { availableParallelism } from "node:os";

import { nativeTestArguments } from "./native-shard.ts";

import { nativeTestWorkers } from "./native-test-workers.ts";

const workerLimit = nativeTestWorkers(
  availableParallelism(),
  process.env.GITHUB_ACTIONS === "true",
);
const input = process.argv.slice(2);
const sharded = input.some(
  (arg) => arg === "--shard" || arg.startsWith("--shard="),
);
const args = nativeTestArguments(input, process.platform);
const workers = sharded ? Math.min(workerLimit, args.length) : workerLimit;
if (sharded)
  console.log(`native-shard ${JSON.stringify({ workers, files: args })}`);
if (args.length === 0 && process.argv.length > 2) process.exit(0);
const child = spawn(
  process.execPath,
  sharded
    ? [
        fileURLToPath(new URL("run-native-shard.ts", import.meta.url)),
        String(workers),
        ...args,
      ]
    : ["--test", `--test-concurrency=${workers}`, ...args],
  { stdio: "inherit" },
);
const forwarders = {
  SIGINT: () => child.kill("SIGINT"),
  SIGTERM: () => child.kill("SIGTERM"),
};
for (const [signal, forward] of Object.entries(forwarders)) {
  process.on(signal, forward);
}
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  for (const [name, forward] of Object.entries(forwarders)) {
    process.removeListener(name, forward);
  }
  if (signal != null) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
