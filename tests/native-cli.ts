import { runNativeCli as run } from "../packages/cli/src/index.ts";
import { nativeToolchain } from "./native-toolchain.ts";

/** Compose the selected test compiler without changing CLI defaults. */
export const runNativeCli: typeof run = (request, host) =>
  run(request, host, nativeToolchain);
