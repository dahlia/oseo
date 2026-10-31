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
