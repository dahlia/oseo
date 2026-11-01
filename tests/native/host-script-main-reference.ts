import { realpath } from "node:fs/promises";
import type {
  CompilerHost,
  ProcessObservation,
} from "../../packages/compiler/src/index.ts";

/**
 * Evaluate one program as a global Script of a reference process's main
 * realm. Node.js `vm` contexts reflect a nonstandard global object: they
 * reject redeclaring `NaN` with SyntaxError, refuse `preventExtensions`,
 * and report other global descriptors. The main realm's global is an
 * ordinary object, so each program variant gets its own process. The
 * printed verdict names how the program completed; `reached` then runs
 * as a further Script of the same realm.
 */
export function hostScriptMainReference(
  harness: string,
  program: string,
  reached?: string,
): string {
  return `
const vm = process.getBuiltinModule("node:vm");
const host = {
  global: globalThis,
  createRealm() { throw new Error("one realm per reference process"); },
  evalScript(source) {
    if (typeof source !== "string") throw new TypeError("String required");
    return vm.runInThisContext(source);
  },
};
Object.defineProperty(globalThis, "$262", {
  value: host, writable: true, configurable: true,
});
host.evalScript(${JSON.stringify(harness)});
let verdict = "completed";
try { host.evalScript(${JSON.stringify(program)}); }
catch (error) {
  verdict = error instanceof Test262Error ? "Test262Error" :
    error instanceof SyntaxError ? "SyntaxError" : "other " + String(error);
}
console.log(verdict);
${
  reached == null
    ? ""
    : `host.evalScript(${JSON.stringify(reached)});\nconsole.log("reached");`
}
`;
}

/**
 * Run one reference program under Node.js, and under Deno unless the
 * program leaves a global Deno cannot unload from. Deno reads from the
 * canonical directory, as in *host-script-reference.ts*.
 */
export async function hostScriptMainReferences(
  host: CompilerHost,
  source: string,
  deno: boolean,
): Promise<readonly ProcessObservation[]> {
  const directory = await realpath(
    await host.makeTemporaryDirectory("oseo-host-script-main-"),
  );
  const path = `${directory}/reference.cjs`;
  let succeeded = false;
  try {
    await host.writeTextFile(path, source);
    const observations = [
      await host.run({ command: "node", args: [path], cwd: directory }),
    ];
    if (deno) {
      observations.push(
        await host.run({
          command: "deno",
          args: ["run", "--quiet", path],
          cwd: directory,
        }),
      );
    }
    succeeded = true;
    return observations;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}
