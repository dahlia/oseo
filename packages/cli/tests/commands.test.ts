import assert from "node:assert/strict";
import test from "node:test";
import type {
  CompilerHost,
  NativeBuildInput,
  NativeToolchain,
} from "@oseo/compiler";
import type { ExecutableDestination, ExecutablePublisher } from "@oseo/host";
import { runCli, runNativeCli } from "../src/index.ts";
import commands from "../src/commands.generated.ts";
import { parse } from "@optique/core/parser";
import { createProgramParser } from "@optique/discover";

function fixture() {
  const builds: NativeBuildInput[] = [];
  const processes: string[] = [];
  const removed: string[] = [];
  const inspections: ExecutableDestination[] = [];
  const publications: string[] = [];
  const reads: string[] = [];
  const host: CompilerHost = {
    executionHost: { architecture: "x86_64", operatingSystem: "linux" },
    canonicalizeFile(path) {
      return Promise.resolve(new URL(String(path), "file:///work/").href);
    },
    makeTemporaryDirectory() {
      return Promise.resolve("/private/build");
    },
    readTextFile(path) {
      reads.push(String(path));
      return Promise.resolve("/* runtime */");
    },
    remove(path) {
      removed.push(path);
      return Promise.resolve();
    },
    run(request) {
      processes.push(request.command);
      return Promise.resolve({ exitStatus: 0, stderr: "", stdout: "" });
    },
    writeTextFile() {
      return Promise.resolve();
    },
  };
  const toolchain: NativeToolchain = {
    createBuildPlan(input) {
      builds.push(input);
      return {
        executablePath: "/private/build/program",
        target: input.target,
        requests: [
          { args: [], command: "linker", cwd: input.workingDirectory },
        ],
      };
    },
  };
  const publisher: ExecutablePublisher = {
    inspect(path, protectedPaths) {
      const destination = { path, protectedPaths };
      inspections.push(destination);
      return Promise.resolve(destination);
    },
    publish(path) {
      publications.push(path);
      return Promise.resolve();
    },
  };
  return {
    builds,
    host,
    inspections,
    processes,
    publications,
    publisher,
    reads,
    removed,
    toolchain,
  };
}

const request = { source: "console.log(42);", version: "0.0.0" };

test("root and run use checked temporary execution", async () => {
  for (const args of [["entry.ts"], ["run", "entry.ts"]]) {
    const state = fixture();
    // eslint-disable-next-line no-await-in-loop -- Compare the two workflows.
    const result = await runNativeCli(
      { ...request, args },
      state.host,
      state.toolchain,
      state.publisher,
    );
    assert.equal(result.exitStatus, 0, result.stderr);
    assert.equal(result.executed, true);
    assert.deepEqual(state.processes, ["linker", "/private/build/program"]);
    assert.deepEqual(state.removed, ["/private/build"]);
    assert.deepEqual(state.publications, []);
    const build = state.builds[0]!;
    assert.ok("buildConfiguration" in build);
    assert.equal(build.buildConfiguration, "checked");
  }
});

test("build retains every target and defaults to optimized", async () => {
  for (const target of [
    "linux-x86_64-gnu",
    "macos-aarch64",
    "linux-aarch64-musl",
  ]) {
    const state = fixture();
    // eslint-disable-next-line no-await-in-loop -- Target cases run in order.
    const result = await runNativeCli(
      { ...request, args: ["build", "src/hello.ts", "--target", target] },
      state.host,
      state.toolchain,
      state.publisher,
    );
    assert.deepEqual(result, { exitStatus: 0, stderr: "", stdout: "" });
    assert.deepEqual(state.processes, ["linker"]);
    assert.deepEqual(state.publications, ["/private/build/program"]);
    assert.equal(state.inspections[0]?.path, `hello-${target}`);
    assert.equal(state.builds[0]?.target.name, target);
    const build = state.builds[0]!;
    assert.ok("buildConfiguration" in build);
    assert.equal(build.buildConfiguration, "optimized");
  }
});

test("output aliases and configuration reach build", async () => {
  for (const output of [
    [],
    ["-o", "artifacts/tool"],
    ["--output", "artifacts/tool"],
  ]) {
    const state = fixture();
    // eslint-disable-next-line no-await-in-loop -- Check each alias.
    const result = await runNativeCli(
      {
        ...request,
        args: [
          "build",
          "src/hello.test.ts",
          "--build-config",
          "checked",
          ...output,
        ],
      },
      state.host,
      state.toolchain,
      state.publisher,
    );
    assert.equal(result.exitStatus, 0, result.stderr);
    assert.equal(
      state.inspections[0]?.path,
      output.length === 0 ? "hello.test" : "artifacts/tool",
    );
    const build = state.builds[0]!;
    assert.ok("buildConfiguration" in build);
    assert.equal(build.buildConfiguration, "checked");
  }
});

test("invalid native and text options have no host effects", async () => {
  for (const args of [
    ["--emit-c", "entry.ts"],
    ["run", "--dump-mir", "entry.ts"],
    ["run", "entry.ts", "--output", "output"],
    ["build", "entry.ts", "--emit-c", "--dump-mir"],
    ["build", "entry.ts", "--emit-c", "--target", "macos-aarch64"],
    ["build", "entry.ts", "--dump-mir", "--no-runtime-archive-reuse"],
    ["build", "entry.ts", "--emit-c", "--build-config", "checked"],
    ["build", "entry.ts", "--dump-mir", "-o", "output"],
    ["build", "entry.ts", "extra"],
    ["build"],
    ["run"],
    ["build", "entry.ts", "--build-config", "unsafe"],
    ["run", "entry.ts", "--unknown"],
  ]) {
    const state = fixture();
    // eslint-disable-next-line no-await-in-loop -- Keep observations separate.
    const result = await runNativeCli(
      { args, version: "0.0.0" },
      state.host,
      state.toolchain,
      state.publisher,
    );
    assert.equal(result.exitStatus, 1, JSON.stringify(args));
    assert.deepEqual(state.reads, []);
    assert.deepEqual(state.builds, []);
    assert.deepEqual(state.processes, []);
    assert.deepEqual(state.inspections, []);
  }
});

test("reserved names have explicit source escapes", () => {
  assert.equal(runCli({ ...request, args: ["build"] }).exitStatus, 1);
  assert.equal(runCli({ ...request, args: ["run"] }).exitStatus, 1);
  for (const args of [["./build"], ["run", "build"], ["buid"]]) {
    const result = runCli({ ...request, args });
    assert.match(result.stderr, /asynchronous CLI host workflow/u);
  }
  assert.deepEqual(
    commands.map((entry) => entry.path),
    [[], ["build"], ["run"]],
  );
});

test("build text modes never invoke native adapters", async () => {
  for (const mode of ["--emit-c", "--dump-mir"]) {
    const state = fixture();
    // eslint-disable-next-line no-await-in-loop -- Check both modes.
    const result = await runNativeCli(
      { ...request, args: ["build", mode, "entry.ts"] },
      state.host,
      state.toolchain,
      state.publisher,
    );
    assert.equal(result.exitStatus, 0, result.stderr);
    assert.notEqual(result.stdout, "");
    assert.deepEqual(state.builds, []);
    assert.deepEqual(state.processes, []);
    assert.deepEqual(state.inspections, []);
  }
});

test("destination refusals and publication failures clean up", async () => {
  const state = fixture();
  const refused = await runNativeCli(
    { ...request, args: ["build", "entry.ts"] },
    state.host,
    state.toolchain,
    {
      ...state.publisher,
      inspect() {
        throw new Error("existing source");
      },
    },
  );
  assert.equal(refused.exitStatus, 1);
  assert.match(refused.stderr, /OSEO3001.*existing source/u);
  assert.deepEqual(state.builds, []);
  const failed = await runNativeCli(
    { ...request, args: ["build", "entry.ts"] },
    state.host,
    state.toolchain,
    {
      ...state.publisher,
      publish() {
        throw new Error("publication failed");
      },
    },
  );
  assert.equal(failed.exitStatus, 1);
  assert.match(failed.stderr, /OSEO3001.*publication failed/u);
  assert.deepEqual(state.removed, ["/private/build"]);
});

test("publication protects the closed module graph", async () => {
  for (const source of ['import "./dep.mjs";', 'import("./dep.mjs");']) {
    const state = fixture();
    // eslint-disable-next-line no-await-in-loop -- Both discovery entry goals.
    const built = await runNativeCli(
      { source, version: "0.0.0", args: ["build", "/work/entry.mjs"] },
      state.host,
      state.toolchain,
      state.publisher,
    );
    assert.equal(built.exitStatus, 0, built.stderr);
    assert.ok(
      state.inspections.at(-1)?.protectedPaths.includes("file:///work/dep.mjs"),
    );
  }
});

test("shared option order preserves command dispatch", async () => {
  const groups = [
    ["--module"],
    ["--no-specialization"],
    ["--target", "linux-x86_64-gnu"],
    ["--build-config", "checked"],
    ["--no-runtime-archive-reuse"],
    ["--script", "prelude.js"],
    ["--test262-host"],
    ["--test262-non-blocking"],
    ["--test262-observe-rejections"],
  ];
  for (const flags of groups) {
    for (const command of [[], ["run"], ["build"]]) {
      for (const args of [
        [...command, ...flags, "entry.ts"],
        [...command, "entry.ts", ...flags],
      ]) {
        // eslint-disable-next-line no-await-in-loop -- Parser mode may vary.
        const parsed = await parse(createProgramParser(commands), args);
        assert.ok(parsed.success, JSON.stringify(args));
        assert.deepEqual(parsed.value.path, command);
      }
    }
    for (const mode of ["--emit-c", "--dump-mir"]) {
      for (const args of [
        ["build", ...flags, mode, "entry.ts"],
        ["build", mode, ...flags, "entry.ts"],
        ["build", "entry.ts", ...flags, mode],
      ]) {
        // eslint-disable-next-line no-await-in-loop -- Parser mode may vary.
        const parsed = await parse(createProgramParser(commands), args);
        assert.ok(parsed.success, JSON.stringify(args));
        assert.deepEqual(parsed.value.path, ["build"]);
      }
    }
  }
});

test("a failed link never publishes and cleans up", async () => {
  const state = fixture();
  const failed = await runNativeCli(
    { ...request, args: ["build", "entry.ts"] },
    {
      ...state.host,
      run() {
        return Promise.resolve({
          exitStatus: 1,
          stdout: "",
          stderr: "link failure",
        });
      },
    },
    state.toolchain,
    state.publisher,
  );
  assert.equal(failed.exitStatus, 1);
  assert.match(failed.stderr, /OSEO3001.*native toolchain/u);
  assert.deepEqual(state.publications, []);
  assert.deepEqual(state.removed, ["/private/build"]);
});

test("native-only diagnostics keep the display source ID", async () => {
  const state = fixture();
  const selected = {
    ...request,
    args: ["build", "--emit-c", "--target", "macos-aarch64", "entry.ts"],
    sourceId: "display.ts",
  };
  const native = await runNativeCli(
    selected,
    state.host,
    state.toolchain,
    state.publisher,
  );
  for (const result of [runCli(selected), native]) {
    assert.equal(result.exitStatus, 1);
    assert.match(result.stderr, /^display\.ts:1:1: error\[OSEO3001\]/u);
  }
  assert.deepEqual(state.reads, []);
  assert.deepEqual(state.builds, []);
  assert.deepEqual(state.inspections, []);
});

test("shortcut names become literal after the option terminator", async () => {
  for (const name of ["build", "run"]) {
    for (const flags of [[], ["--module"]]) {
      // eslint-disable-next-line no-await-in-loop -- Inspect each parse state.
      const literal = await parse(createProgramParser(commands), [
        ...flags,
        "--",
        name,
      ]);
      assert.ok(literal.success);
      assert.deepEqual(literal.value.path, []);
      // eslint-disable-next-line no-await-in-loop -- Inspect each parse state.
      const reserved = await parse(createProgramParser(commands), [
        ...flags,
        name,
      ]);
      assert.equal(reserved.success, false);
    }
  }
});

test("root reservation permits command names as option values", async () => {
  for (const name of ["build", "run"]) {
    // eslint-disable-next-line no-await-in-loop -- Inspect both reserved names.
    const result = await parse(createProgramParser(commands), [
      "--script",
      name,
      "entry.mjs",
    ]);
    assert.ok(result.success);
    assert.deepEqual(result.value.path, []);
  }
});

test("build diagnoses invalid source URLs before host effects", async () => {
  for (const source of [
    "file:///tmp/a%2Fb.ts",
    "FILE:///tmp/a%2Fb.ts",
    "file:///tmp/bad%ZZ.ts",
  ]) {
    for (const output of [[], ["--output", "program"]]) {
      const state = fixture();
      // eslint-disable-next-line no-await-in-loop -- Verify both output modes.
      const result = await runNativeCli(
        { ...request, args: ["build", source, ...output] },
        state.host,
        state.toolchain,
        state.publisher,
      );
      assert.equal(result.exitStatus, 1);
      assert.match(result.stderr, /OSEO3001/u);
      assert.deepEqual(state.inspections, []);
      assert.deepEqual(state.reads, []);
      assert.deepEqual(state.processes, []);
      assert.deepEqual(state.removed, []);
    }
  }
});

test("build decodes file URL stems regardless of scheme case", async () => {
  for (const scheme of ["file:", "FILE:", "FiLe:"]) {
    const state = fixture();
    // eslint-disable-next-line no-await-in-loop -- Verify each URL spelling.
    const result = await runNativeCli(
      { ...request, args: ["build", `${scheme}///tmp/hello%20world.ts`] },
      state.host,
      state.toolchain,
      state.publisher,
    );
    assert.equal(result.exitStatus, 0, result.stderr);
    assert.equal(state.inspections[0]?.path, "hello world");
  }
});
