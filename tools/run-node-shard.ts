import { spawnSync } from "node:child_process";
import { nodeTestShardArguments } from "./node-shard.ts";
import { parseTestShardArguments } from "./shard.ts";

const { shard } = parseTestShardArguments(process.argv.slice(2));
if (shard == null) throw new Error("Node shard runner requires --shard.");
const args = nodeTestShardArguments(process.cwd(), shard);
if (args.length > 0) {
  const child = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (child.error) throw child.error;
  if (child.signal != null) process.kill(process.pid, child.signal);
  else process.exitCode = child.status ?? 1;
}
