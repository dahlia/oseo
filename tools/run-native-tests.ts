import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { availableParallelism } from "node:os";

import { nativeTestArguments } from "./native-shard.ts";

import { nativeTestWorkers } from "./native-test-workers.ts";

const workers = nativeTestWorkers(
  availableParallelism(),
  process.env.GITHUB_ACTIONS === "true",
);
const input = process.argv.slice(2);
const sharded = input.some(
  (arg) => arg === "--shard" || arg.startsWith("--shard="),
);
const args = nativeTestArguments(input, process.platform);
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
