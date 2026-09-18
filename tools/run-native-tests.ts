import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";

import { nativeTestWorkers } from "./native-test-workers.ts";

const workers = nativeTestWorkers(
  availableParallelism(),
  process.env.GITHUB_ACTIONS === "true",
);
const child = spawn(
  process.execPath,
  ["--test", `--test-concurrency=${workers}`, ...process.argv.slice(2)],
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
