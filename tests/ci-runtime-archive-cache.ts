import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { runtimeArchiveCache } from "../tools/runtime-archive-cache.ts";
import { nativeToolchain } from "./native-toolchain.ts";

const host = createNodeHost();
if (host.executionHost == null)
  throw new Error("Unknown native execution host.");
const target = targetForExecutionHost(host.executionHost);
if (target == null) throw new Error("Unsupported native execution host.");
const entry = await runtimeArchiveCache(
  host,
  nativeToolchain,
  cRuntimeProvider,
  target,
  process.cwd(),
);
console.log(`key=${entry.key}\npath=${entry.path}`);
