import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  compileSource,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { withNativeFixture } from "../packages/testkit/src/index.ts";
import { zigToolchain } from "../packages/toolchain-zig/src/index.ts";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  captureArtifact,
  fileIdentity,
  runProfilingCommand,
} from "./perf-profile-capture.ts";

const directory = resolve(process.argv[2] ?? "");
if (process.argv.length !== 3) {
  throw new Error("usage: node tools/perf-profile-smoke.ts NEW_DIRECTORY");
}
mkdirSync(directory);
try {
  writeFileSync(
    join(directory, "host.json"),
    JSON.stringify(
      {
        platform: process.platform,
        architecture: process.arch,
        required: "linux/x64 or darwin/arm64",
      },
      null,
      2,
    ) + "\n",
  );
  if (
    !(
      (process.platform === "linux" && process.arch === "x64") ||
      (process.platform === "darwin" && process.arch === "arm64")
    )
  ) {
    writeFileSync(join(directory, "failure.txt"), "Unsupported native host\n");
    throw new Error("Requires Linux x64 or macOS arm64");
  }
  const host = createNodeHost();
  const target =
    host.executionHost == null
      ? undefined
      : targetForExecutionHost(host.executionHost);
  if (target == null)
    throw new Error("Requires a supported native execution host");
  // Keep the earlier longer-workload's exact work size and arithmetic oracle.
  const source =
    "function add(a, b) { return a + b; } let total = 0; " +
    "for (let i = 0; i < 2000000; i++) { const o = { value: i % 7 }; " +
    "total = add(total, o.value + 0.25); } console.log(total);";
  const sourcePath = join(directory, "smoke.js");
  writeFileSync(sourcePath, source + "\n");
  const compiled = compileSource(
    babelFrontend,
    { sourceId: "profiling-smoke.js", source },
    { specialization: "disabled" },
  );
  if (compiled.diagnostics.length !== 0 || compiled.mir == null) {
    throw new Error(JSON.stringify(compiled.diagnostics));
  }
  const requests: object[] = [];
  const inputs = [sourcePath];
  for (const name of [
    "perf-profile.ts",
    "perf-profile-capture.ts",
    "perf-profile-smoke.ts",
  ]) {
    const path = join(directory, name);
    writeFileSync(path, readFileSync(new URL(name, import.meta.url)));
    inputs.push(path);
  }
  const build = join(directory, "build");
  // Retain runtime source even when the archive cache is reused.
  const runtimeDirectory = join(directory, "runtime-source");
  mkdirSync(runtimeDirectory);
  for (const asset of cRuntimeProvider.getRuntimeInput().assets) {
    const path = join(runtimeDirectory, asset.name);
    // eslint-disable-next-line no-await-in-loop -- Preserve asset order.
    writeFileSync(path, await host.readTextFile(asset.url));
    inputs.push(path);
  }
  await withNativeFixture(
    {
      backend: cBackend,
      host: {
        ...host,
        makeTemporaryDirectory: async () => {
          mkdirSync(build);
          return build;
        },
        run: async (request) => {
          const startedUtc = new Date().toISOString();
          try {
            if (request.environment == null) {
              throw new Error("Build command lacks an explicit environment");
            }
            const run = await runProfilingCommand(
              directory,
              `build-command-${requests.length}`,
              [request.command, ...request.args],
              request.cwd,
              request.environment.variables,
            );
            const result = {
              exitStatus: run.status ?? 1,
              stdout: readFileSync(join(directory, run.stdout), "utf8"),
              stderr: readFileSync(join(directory, run.stderr), "utf8"),
            };
            if (!run.groupGone || run.error != null || run.timedOut) {
              throw new Error("Build process cleanup or execution failed");
            }
            for (const argument of request.args) {
              if (argument.startsWith("/") && argument.endsWith(".a")) {
                inputs.push(argument);
              }
            }
            requests.push({
              request,
              startedUtc,
              finishedUtc: new Date().toISOString(),
              result,
            });
            return result;
          } catch (error) {
            requests.push({
              request,
              startedUtc,
              finishedUtc: new Date().toISOString(),
              error: String(error),
            });
            throw error;
          } finally {
            writeFileSync(
              join(directory, "build-requests.json"),
              JSON.stringify(requests, null, 2) + "\n",
            );
          }
        },
      },
      input: compiled.mir,
      operation: "compile",
      runtime: cRuntimeProvider,
      target,
      toolchain: zigToolchain,
      buildConfiguration: "optimized",
      keepArtifacts: true,
    },
    async (observation) => {
      const metadata = join(directory, "build.json");
      writeFileSync(
        metadata,
        JSON.stringify(
          {
            ...observation,
            emittedC: undefined,
            role: "synthetic-method-probe",
            timedArtifactId: null,
            instrumentation: false,
            specialization: "disabled",
          },
          null,
          2,
        ) + "\n",
      );
      const generated = join(directory, "generated.c");
      writeFileSync(generated, observation.emittedC);
      inputs.push(metadata, generated, join(directory, "build-requests.json"));
      const request = {
        kind: "synthetic-method-probe" as const,
        executable: observation.executablePath,
        sha256: fileIdentity(observation.executablePath).sha256,
        inputs: inputs.map((path) => ({
          path,
          sha256: fileIdentity(path).sha256,
        })),
        argv: [],
        env: {},
        cwd: directory,
        stdinBase64: "",
        stdoutBase64: Buffer.from("6499995\n").toString("base64"),
        stderrBase64: "",
        exitStatus: 0,
      };
      writeFileSync(
        join(directory, "request.json"),
        JSON.stringify(request, null, 2) + "\n",
      );
      process.exitCode = (await captureArtifact(
        request,
        join(directory, "capture"),
      ))
        ? 0
        : 1;
    },
  );
  // Reading the persisted result catches an absent final report independently.
  if (
    JSON.parse(readFileSync(join(directory, "capture", "capture.json"), "utf8"))
      .status !== "method-probe-passed"
  )
    process.exitCode = 1;
} catch (error) {
  writeFileSync(join(directory, "failure.txt"), String(error) + "\n");
  throw error;
}
