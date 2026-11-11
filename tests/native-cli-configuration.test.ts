/* eslint-disable no-await-in-loop -- Cases use isolated hosts. */

import assert from "node:assert/strict";
import test from "node:test";
import type {
  CompilerHost,
  NativeBuildInput,
  NativeToolchain,
  ProcessRequest,
} from "../packages/compiler/src/index.ts";
import type { ExecutablePublisher } from "../packages/host/src/index.ts";
import { createNativeCliRunner } from "./native-cli-runner.ts";

function fixture() {
  const builds: NativeBuildInput[] = [];
  const requests: ProcessRequest[] = [];
  const reads: string[] = [];
  const host: CompilerHost = {
    executionHost: { architecture: "x86_64", operatingSystem: "linux" },
    canonicalizeFile(path) {
      return Promise.resolve(new URL(String(path), "file:///work/").href);
    },
    makeTemporaryDirectory: async () => "/fake/build",
    readTextFile(path) {
      reads.push(String(path));
      return Promise.resolve("/* runtime */");
    },
    remove: async () => {},
    writeTextFile: async () => {},
    run(request) {
      requests.push(request);
      const stdout =
        request.command === "compiler" ? "" : JSON.stringify(request.args);
      return Promise.resolve({
        exitStatus: 0,
        stdout,
        stderr: "",
        stdoutBytes: new TextEncoder().encode(stdout),
        stderrBytes: new Uint8Array(),
      });
    },
  };
  const toolchain: NativeToolchain = {
    createBuildPlan(input) {
      builds.push(input);
      return {
        executablePath: "/fake/program",
        target: input.target,
        requests: [
          { command: "compiler", args: [], cwd: input.workingDirectory },
        ],
      };
    },
  };
  const publisher: ExecutablePublisher = {
    inspect: async (path, protectedPaths) => ({ path, protectedPaths }),
    publish: async () => {},
  };
  return { builds, host, publisher, reads, requests, toolchain };
}

const request = { source: "console.log(42);", version: "0.0.0" };

for (const configuration of ["checked", "optimized"] as const) {
  test(`test CLI args (${configuration})`, async () => {
    const programArgs = [
      "--build-config",
      "--build-config=checked",
      "--emit-c",
      "--help",
      "--version",
      "",
      "two words",
      "한글",
      "--",
      "-x",
    ];
    for (const prefix of [[], ["run"]]) {
      const state = fixture();
      const run = createNativeCliRunner(state.toolchain, configuration);
      const input = new Uint8Array([239, 187, 191, 0, 255]);
      const result = await run(
        {
          ...request,
          args: [...prefix, "entry.ts", "--", ...programArgs],
          execution: { captureBytes: true, input },
        },
        state.host,
      );
      assert.equal(result.exitStatus, 0, result.stderr);
      assert.equal(state.builds[0]?.buildConfiguration, configuration);
      assert.deepEqual(state.requests.at(-1)?.args, programArgs);
      assert.deepEqual(state.requests.at(-1)?.input, input);
      assert.equal(state.requests[0]?.input, undefined);
      assert.deepEqual(
        result.stdoutBytes,
        new TextEncoder().encode(JSON.stringify(programArgs)),
      );
    }
  });

  test(`test CLI config precedence (${configuration})`, async () => {
    for (const prefix of [[], ["run"], ["build"]]) {
      for (const explicit of [undefined, "checked", "optimized"] as const) {
        const state = fixture();
        const run = createNativeCliRunner(
          state.toolchain,
          configuration,
          state.publisher,
        );
        const result = await run(
          {
            ...request,
            args: [
              ...prefix,
              ...(explicit == null ? [] : ["--build-config", explicit]),
              "entry.ts",
              "--no-specialization",
            ],
          },
          state.host,
        );
        assert.equal(result.exitStatus, 0, result.stderr);
        assert.equal(
          state.builds[0]?.buildConfiguration,
          explicit ?? configuration,
        );
        if (prefix[0] === "build") {
          assert.equal(result.executed, undefined);
          assert.equal(state.requests.length, 1);
        }
      }
    }
  });

  test(`test CLI option values (${configuration})`, async () => {
    for (const prefix of [[], ["run"], ["build"]]) {
      for (const scriptOptions of [
        ["--"],
        ["--", "--build-config", "checked"],
        ["--help"],
        ["--version"],
        ["--emit-c"],
        ["--build-config"],
        ["--build-config=checked"],
      ]) {
        const state = fixture();
        const run = createNativeCliRunner(
          state.toolchain,
          configuration,
          state.publisher,
        );
        const result = await run(
          {
            ...request,
            source: "export {};",
            scriptSource: "",
            args: [
              ...prefix,
              "--script",
              ...scriptOptions,
              "entry.ts",
              "--module",
            ],
          },
          state.host,
        );
        assert.equal(result.exitStatus, 0, result.stderr);
        assert.equal(
          state.builds[0]?.buildConfiguration,
          scriptOptions.length > 1 ? "checked" : configuration,
        );
      }
    }
  });
}

test("test CLI preserves help, version, text, and parse errors", async () => {
  for (const [args, status] of [
    [["--help"], 0],
    [["--version"], 0],
    [["build", "entry.ts", "--emit-c"], 0],
    [["build", "entry.ts", "--dump-mir"], 0],
    [["run", "entry.ts", "--unknown"], 1],
    [["entry.ts", "--build-config", "invalid"], 1],
    [["build", "entry.ts", "--emit-c", "--build-config", "checked"], 1],
  ] as const) {
    const state = fixture();
    const run = createNativeCliRunner(state.toolchain, "optimized");
    const result = await run({ ...request, args }, state.host);
    assert.equal(result.exitStatus, status, result.stderr);
    assert.deepEqual(state.builds, []);
    assert.deepEqual(state.requests, []);
    assert.deepEqual(state.reads, []);
    assert.notEqual(result.stdout + result.stderr, "");
  }
});
