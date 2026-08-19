import { createDenoHost } from "../../src/index.ts";

interface RestrictedDenoRuntime {
  cwd(): string;
  execPath(): string;
}

// SAFETY: The fixture runs only with this restricted Deno API.
const runtime = (
  globalThis as typeof globalThis & {
    readonly Deno?: RestrictedDenoRuntime;
  }
).Deno;
if (runtime == null) throw new Error("Deno is unavailable.");

const host = createDenoHost();
const snapshot = await host.captureEnvironment?.({ inherit: ["PATH"] });
if (snapshot !== undefined) {
  throw new Error("The restricted host unexpectedly captured an environment.");
}
const result = await host.run({
  args: ["eval", "console.log('restricted-ok')"],
  command: runtime.execPath(),
  cwd: runtime.cwd(),
});
if (result.exitStatus !== 0) throw new Error(result.stderr);
console.log(result.stdout.trim());
