import {
  executeCliInvocation,
  parseCliRequest,
} from "../packages/cli/src/index.ts";
import type { runNativeCli } from "../packages/cli/src/index.ts";
import type {
  NativeBuildConfiguration,
  NativeToolchain,
} from "../packages/compiler/src/index.ts";
import type { ExecutablePublisher } from "../packages/host/src/index.ts";

/** Apply a test lane's configuration through the shared typed CLI grammar. */
export function createNativeCliRunner(
  toolchain: NativeToolchain,
  buildConfiguration: NativeBuildConfiguration,
  publisher?: ExecutablePublisher,
): typeof runNativeCli {
  return async (request, host) => {
    const parsed = parseCliRequest(request);
    if (parsed.kind === "result") return parsed.value;
    const value = parsed.value;
    const invocation =
      value.mode === "execute" && value.buildConfiguration == null
        ? { ...value, buildConfiguration }
        : value;
    return await executeCliInvocation(
      invocation,
      request,
      host,
      toolchain,
      publisher,
    );
  };
}
