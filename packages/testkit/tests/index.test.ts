import assert from "node:assert/strict";
import test from "node:test";

import { describeTarget } from "@oseo/compiler";
import type { ProcessEnvironment } from "@oseo/compiler";

import {
  assertMatchingObservations,
  classifyTest262,
  summarizeTest262,
  test262Group,
  withNativeFixture,
} from "../src/index.ts";
import type { NativeFixtureOptions } from "../src/index.ts";

type Host = NativeFixtureOptions["host"];
type ProcessObservation = Awaited<ReturnType<Host["run"]>>;

interface MemoryHost {
  readonly files: Map<string, string>;
  readonly host: Host;
  readonly removed: string[];
  readonly temporaryDirectoryRequests: string[];
}

function memoryHost(
  results: readonly ProcessObservation[],
  executionHost: NonNullable<Host["executionHost"]> = {
    architecture: "x86_64",
    operatingSystem: "linux",
  },
): MemoryHost {
  const files = new Map<string, string>();
  const removed: string[] = [];
  const temporaryDirectoryRequests: string[] = [];
  let resultIndex = 0;
  return {
    files,
    host: {
      executionHost,
      async makeTemporaryDirectory(prefix): Promise<string> {
        temporaryDirectoryRequests.push(prefix);
        return "/tmp/oseo-native-test";
      },
      async readTextFile(): Promise<string> {
        return "runtime input";
      },
      async remove(path: string): Promise<void> {
        removed.push(path);
      },
      async run(): Promise<ProcessObservation> {
        const result = results[resultIndex];
        resultIndex += 1;
        if (result == null) throw new Error("Missing process observation.");
        return result;
      },
      async writeTextFile(path: string, contents: string): Promise<void> {
        files.set(path, contents);
      },
    },
    removed,
    temporaryDirectoryRequests,
  };
}

function fixtureOptions(
  host: Host,
  commands: readonly string[],
): NativeFixtureOptions {
  const target = describeTarget("linux-x86_64-gnu");
  return {
    backend: {
      emit() {
        return { source: "generated C", sourceName: "generated.c" };
      },
    },
    host,
    input: {
      functions: [],
      globalBindings: [],
      globalObjectBindings: [],
      kind: "mir-program",
      observeSpecialization: false,
      script: {
        blocks: [],
        id: -1,
        kind: "mir-function",
        name: "<script>",
        functionLength: 0,
        parameterCount: 0,
        parameters: [],
        range: {
          end: { column: 1, line: 1 },
          start: { column: 1, line: 1 },
        },
        rootSlotCount: 1,
      },
      sourceId: "fixture.ts",
      specialization: "disabled",
    },
    operation: "execute",
    runtime: {
      getRuntimeInput() {
        return {
          abiVersion: "m0",
          assets: [
            {
              kind: "source",
              name: "runtime.c",
              url: new URL("file:///runtime.c"),
            },
          ],
        };
      },
    },
    target,
    toolchain: {
      createBuildPlan() {
        return {
          executablePath: "/tmp/oseo-native-test/fixture",
          requests: commands.map((command) => ({
            args: [`${command}.c`],
            command: "zig",
            cwd: "/tmp/oseo-native-test",
          })),
          target,
        };
      },
    },
  };
}

test("retains artifacts when differential comparison fails", async () => {
  const state = memoryHost([
    { exitStatus: 0, stderr: "", stdout: "compiler output" },
    { exitStatus: 0, stderr: "", stdout: "native output" },
  ]);
  await assert.rejects(
    withNativeFixture(fixtureOptions(state.host, ["compile"]), (native) => {
      assert.deepEqual(state.removed, []);
      assertMatchingObservations([
        { exitStatus: 0, stderr: "", stdout: "reference output" },
        native,
      ]);
    }),
    /Native artifacts retained/u,
  );
  assert.deepEqual(state.removed, []);
  assert.ok(state.files.has("/tmp/oseo-native-test/generated.c"));
  assert.ok(state.files.has("/tmp/oseo-native-test/native-observation.json"));
});

test("rejects compile-only targets before creating a fixture", async () => {
  const state = memoryHost([], {
    architecture: "aarch64",
    operatingSystem: "linux",
  });
  const options = fixtureOptions(state.host, []);
  await assert.rejects(
    withNativeFixture(
      {
        ...options,
        target: describeTarget("linux-aarch64-musl"),
      },
      () => assert.fail("An invalid execution target must not be inspected."),
    ),
    /cannot execute on linux\/aarch64/u,
  );
  assert.deepEqual(state.temporaryDirectoryRequests, []);
  assert.deepEqual(state.files, new Map());
});

test("records complete failed build observations", async () => {
  const state = memoryHost([
    { exitStatus: 1, stderr: "compiler error", stdout: "compiler output" },
  ]);
  await assert.rejects(
    withNativeFixture(fixtureOptions(state.host, ["compile", "link"]), () =>
      assert.fail("A failed build must not reach inspection."),
    ),
    /Native artifacts retained/u,
  );
  const bytes = state.files.get(
    "/tmp/oseo-native-test/native-observation.json",
  );
  assert.ok(bytes != null);
  const metadata = JSON.parse(bytes) as {
    readonly compilerInvocation: readonly string[];
    readonly steps: readonly {
      readonly observation?: ProcessObservation;
    }[];
  };
  assert.deepEqual(metadata.compilerInvocation, [
    "zig compile.c",
    "zig link.c",
  ]);
  assert.deepEqual(metadata.steps[0]?.observation, {
    exitStatus: 1,
    stderr: "compiler error",
    stdout: "compiler output",
  });
});

test("separates private runtime counters from fixture stderr", async () => {
  const state = memoryHost([
    { exitStatus: 0, stderr: "", stdout: "compiler output" },
    {
      exitStatus: 0,
      stderr:
        "OSEO_OBSERVATIONS " +
        '{"guardHits":1,"guardMisses":2,"overflowMisses":3,' +
        '"genericAdditionCalls":4,"allocations":5,"collections":6}\n',
      stdout: "native output",
    },
  ]);
  const options = fixtureOptions(state.host, ["compile"]);
  const input = { ...options.input, observeSpecialization: true };
  await withNativeFixture({ ...options, input }, (native) => {
    assert.equal(native.stderr, "");
    assert.deepEqual(native.counters, {
      allocations: 5,
      collections: 6,
      genericAdditionCalls: 4,
      guardHits: 1,
      guardMisses: 2,
      overflowMisses: 3,
    });
  });
});

test("passes runtime sources to the toolchain in asset order", async () => {
  const state = memoryHost([
    { exitStatus: 0, stderr: "", stdout: "compiler output" },
    { exitStatus: 0, stderr: "", stdout: "native output" },
  ]);
  const options = fixtureOptions(state.host, ["compile"]);
  const received: (readonly string[])[] = [];
  await withNativeFixture(
    {
      ...options,
      runtime: {
        getRuntimeInput() {
          return {
            abiVersion: "m0",
            assets: [
              {
                kind: "header",
                name: "oseo_runtime.h",
                url: new URL("file:///oseo_runtime.h"),
              },
              {
                kind: "source",
                name: "runtime_core.c",
                url: new URL("file:///runtime_core.c"),
              },
              {
                kind: "source",
                name: "runtime_memory.c",
                url: new URL("file:///runtime_memory.c"),
              },
            ],
          };
        },
      },
      toolchain: {
        createBuildPlan(input) {
          received.push(input.runtimeSourcePaths);
          return options.toolchain.createBuildPlan(input);
        },
      },
    },
    () => {},
  );
  assert.deepEqual(received, [
    [
      "/tmp/oseo-native-test/runtime_core.c",
      "/tmp/oseo-native-test/runtime_memory.c",
    ],
  ]);
});

test("serializes concurrent builds for one cold archive key", async () => {
  let directoryIndex = 0;
  let cached = false;
  let compileBuilds = 0;
  let publications = 0;
  let lockTail = Promise.resolve();
  const host: Host = {
    cache: {
      async acquireFileLock() {
        const predecessor = lockTail;
        let releaseLock: (() => void) | undefined;
        lockTail = new Promise<void>((resolve) => {
          releaseLock = resolve;
        });
        await predecessor;
        return {
          release() {
            releaseLock?.();
            return Promise.resolve();
          },
        };
      },
      getDirectory() {
        return Promise.resolve("/cache/runtime-archives");
      },
      hasFile() {
        return Promise.resolve(cached);
      },
      publishFile() {
        cached = true;
        publications += 1;
        return Promise.resolve();
      },
    },
    captureEnvironment() {
      return Promise.resolve({ variables: { PATH: "/opt/zig/bin" } });
    },
    executionHost: {
      architecture: "x86_64",
      operatingSystem: "linux",
    },
    makeTemporaryDirectory() {
      directoryIndex += 1;
      return Promise.resolve(`/tmp/oseo-native-${directoryIndex}`);
    },
    readTextFile() {
      return Promise.resolve("runtime input");
    },
    remove() {
      return Promise.resolve();
    },
    run(request) {
      if (request.args[0] === "env") {
        return Promise.resolve({
          exitStatus: 0,
          stderr: "",
          stdout: "zig_exe=/opt/zig/zig\nZIG_LIBC=null\n",
        });
      }
      if (request.args.includes("-c")) compileBuilds += 1;
      return Promise.resolve({ exitStatus: 0, stderr: "", stdout: "" });
    },
    writeTextFile() {
      return Promise.resolve();
    },
  };
  const base = fixtureOptions(host, []);
  const toolchain = {
    createBuildPlan(
      input: Parameters<typeof base.toolchain.createBuildPlan>[0],
    ) {
      const archivePath = `${input.workingDirectory}/runtime.a`;
      return {
        executablePath: `${input.workingDirectory}/fixture`,
        requests:
          input.prebuiltRuntimeArchivePath == null
            ? [
                {
                  args: ["cc", "-c", input.runtimeSourcePaths[0] ?? ""],
                  command: "zig",
                  cwd: input.workingDirectory,
                },
                {
                  args: ["ar", archivePath],
                  command: "zig",
                  cwd: input.workingDirectory,
                },
                {
                  args: ["cc", archivePath],
                  command: "zig",
                  cwd: input.workingDirectory,
                },
              ]
            : [
                {
                  args: ["cc", input.prebuiltRuntimeArchivePath],
                  command: "zig",
                  cwd: input.workingDirectory,
                },
              ],
        ...(input.prebuiltRuntimeArchivePath == null
          ? { runtimeArchivePath: archivePath }
          : {}),
        target: input.target,
      };
    },
    environment: { inherit: ["PATH"] },
    runtimeArchiveReuse: {
      createIdentityRequest(
        workingDirectory: string,
        environment: ProcessEnvironment,
      ) {
        return {
          args: ["env"],
          command: "zig",
          cwd: workingDirectory,
          environment,
        };
      },
      createKey() {
        return Promise.resolve("shared-key");
      },
    },
  };
  await Promise.all([
    withNativeFixture({ ...base, toolchain }, () => {}),
    withNativeFixture({ ...base, toolchain }, () => {}),
  ]);
  assert.equal(compileBuilds, 1);
  assert.equal(publications, 1);
});

test("retries a failed toolchain identity probe", async () => {
  let cached = false;
  let identityProbes = 0;
  let publications = 0;
  const host: Host = {
    cache: {
      acquireFileLock() {
        return Promise.resolve({
          release() {
            return Promise.resolve();
          },
        });
      },
      getDirectory() {
        return Promise.resolve("/cache/runtime-archives");
      },
      hasFile() {
        return Promise.resolve(cached);
      },
      publishFile() {
        cached = true;
        publications += 1;
        return Promise.resolve();
      },
    },
    captureEnvironment() {
      return Promise.resolve({ variables: { PATH: "/opt/zig/bin" } });
    },
    executionHost: {
      architecture: "x86_64",
      operatingSystem: "linux",
    },
    makeTemporaryDirectory() {
      return Promise.resolve("/tmp/oseo-native-retry");
    },
    readTextFile() {
      return Promise.resolve("runtime input");
    },
    remove() {
      return Promise.resolve();
    },
    run(request) {
      if (request.args[0] === "env") {
        identityProbes += 1;
        return Promise.resolve({
          exitStatus: identityProbes === 1 ? 1 : 0,
          stderr: "",
          stdout:
            identityProbes === 1 ? "" : "zig_exe=/opt/zig/zig\nZIG_LIBC=null\n",
        });
      }
      return Promise.resolve({ exitStatus: 0, stderr: "", stdout: "" });
    },
    writeTextFile() {
      return Promise.resolve();
    },
  };
  const base = fixtureOptions(host, []);
  const toolchain = {
    createBuildPlan(
      input: Parameters<typeof base.toolchain.createBuildPlan>[0],
    ) {
      const archivePath = `${input.workingDirectory}/runtime.a`;
      return {
        executablePath: `${input.workingDirectory}/fixture`,
        requests: [],
        ...(input.prebuiltRuntimeArchivePath == null
          ? { runtimeArchivePath: archivePath }
          : {}),
        target: input.target,
      };
    },
    environment: { inherit: ["PATH"] },
    runtimeArchiveReuse: {
      createIdentityRequest(
        workingDirectory: string,
        environment: ProcessEnvironment,
      ) {
        return {
          args: ["env"],
          command: "zig",
          cwd: workingDirectory,
          environment,
        };
      },
      createKey() {
        return Promise.resolve("retry-key");
      },
    },
  };
  await withNativeFixture({ ...base, toolchain }, () => {});
  assert.equal(publications, 0);
  await withNativeFixture({ ...base, toolchain }, () => {});
  assert.equal(identityProbes, 2);
  assert.equal(publications, 1);
  await withNativeFixture({ ...base, toolchain }, () => {});
  assert.equal(identityProbes, 3);
  assert.equal(publications, 1);
});

test("rejects a runtime input with duplicate asset names", async () => {
  const state = memoryHost([]);
  const options = fixtureOptions(state.host, []);
  await assert.rejects(
    withNativeFixture(
      {
        ...options,
        runtime: {
          getRuntimeInput() {
            return {
              abiVersion: "m0",
              assets: [
                {
                  kind: "source",
                  name: "runtime.c",
                  url: new URL("file:///a/runtime.c"),
                },
                {
                  kind: "source",
                  name: "runtime.c",
                  url: new URL("file:///b/runtime.c"),
                },
              ],
            };
          },
        },
      },
      () => assert.fail("A duplicate asset name must not reach the build."),
    ),
    /duplicate asset name: runtime\.c/u,
  );
  assert.deepEqual(state.temporaryDirectoryRequests, []);
});

test("rejects asset names that differ only by letter case", async () => {
  const state = memoryHost([]);
  const options = fixtureOptions(state.host, []);
  await assert.rejects(
    withNativeFixture(
      {
        ...options,
        runtime: {
          getRuntimeInput() {
            return {
              abiVersion: "m0",
              assets: [
                {
                  kind: "source",
                  name: "runtime.c",
                  url: new URL("file:///a/runtime.c"),
                },
                {
                  kind: "source",
                  name: "RUNTIME.c",
                  url: new URL("file:///b/RUNTIME.c"),
                },
              ],
            };
          },
        },
      },
      () => assert.fail("A case-folded duplicate must not reach the build."),
    ),
    /duplicate asset name: RUNTIME\.c/u,
  );
  assert.deepEqual(state.temporaryDirectoryRequests, []);
});

test("rejects runtime asset names that are not leaf names", async () => {
  const state = memoryHost([]);
  const options = fixtureOptions(state.host, []);
  await assert.rejects(
    withNativeFixture(
      {
        ...options,
        runtime: {
          getRuntimeInput() {
            return {
              abiVersion: "m0",
              assets: [
                {
                  kind: "source",
                  name: "../runtime.c",
                  url: new URL("file:///runtime.c"),
                },
              ],
            };
          },
        },
      },
      () => assert.fail("A non-leaf asset name must not reach the build."),
    ),
    /invalid asset name: \.\.\/runtime\.c/u,
  );
  assert.deepEqual(state.temporaryDirectoryRequests, []);
});

test("rejects assets that collide with the generated name", async () => {
  const state = memoryHost([]);
  const options = fixtureOptions(state.host, []);
  await assert.rejects(
    withNativeFixture(
      {
        ...options,
        runtime: {
          getRuntimeInput() {
            return {
              abiVersion: "m0",
              assets: [
                {
                  kind: "source",
                  name: "generated.c",
                  url: new URL("file:///generated.c"),
                },
              ],
            };
          },
        },
      },
      () => assert.fail("A colliding asset name must not reach the build."),
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Native artifacts retained/u);
      assert.ok(error.cause instanceof Error);
      assert.match(error.cause.message, /generated source name: generated\.c/u);
      return true;
    },
  );
});

test("classifies test262 results without inflating passes", () => {
  const base = {
    async: false,
    features: ["object-spread"],
    flags: [],
    includes: ["assert.js"],
    mode: "script",
    path: "test/language/expressions/object/basic.js",
    strictness: ["non-strict", "strict"],
    suiteRevision: "test-revision",
  } as const;
  const unsupported = classifyTest262(
    base,
    { passed: true },
    new Set<string>(),
    { dependencies: ["object-properties"] },
  );
  const harness = classifyTest262(
    { ...base, features: [] },
    { detail: "include missing", failureKind: "harness", passed: false },
    new Set<string>(),
    { dependencies: ["object-properties"] },
  );
  const infrastructure = classifyTest262(
    { ...base, features: [] },
    {
      detail: "native process resources exhausted",
      failureKind: "infrastructure",
      passed: false,
    },
    new Set<string>(),
    { dependencies: ["object-properties"] },
  );
  const expectedNegative = classifyTest262(
    { ...base, expectedFailurePhase: "parse", features: [] },
    { failedPhase: "parse", passed: false },
    new Set<string>(),
    { dependencies: ["functions"] },
  );
  assert.deepEqual(
    summarizeTest262([unsupported, harness, infrastructure, expectedNegative]),
    {
      dependencies: [
        {
          dependency: "functions",
          expectedNegatives: 1,
          harnessFailures: 0,
          infrastructureFailures: 0,
          passes: 0,
          semanticFailures: 0,
          unsupportedProfileFeatures: 0,
        },
        {
          dependency: "object-properties",
          expectedNegatives: 0,
          harnessFailures: 1,
          infrastructureFailures: 1,
          passes: 0,
          semanticFailures: 0,
          unsupportedProfileFeatures: 1,
        },
      ],
      expectedNegatives: 1,
      groups: [
        {
          expectedNegatives: 1,
          group: "language/expressions",
          harnessFailures: 1,
          infrastructureFailures: 1,
          passes: 0,
          semanticFailures: 0,
          unsupportedProfileFeatures: 1,
        },
      ],
      harnessFailures: 1,
      infrastructureFailures: 1,
      passes: 0,
      semanticFailures: 0,
      unsupportedProfileFeatures: 1,
    },
  );
});

test("derives dependency-indexed path groups from upstream paths", () => {
  assert.equal(
    test262Group("test/built-ins/Object/keys/15.2.3.14-1-1.js"),
    "built-ins/Object",
  );
  assert.equal(
    test262Group("test/language/module-code/top-level-await/dfs-invariant.js"),
    "language/module-code",
  );
  assert.equal(test262Group("test/language/example.js"), "language");
});

test("requires the declared phase for negative test262 cases", () => {
  const result = classifyTest262(
    {
      async: false,
      expectedFailurePhase: "runtime",
      features: [],
      flags: [],
      includes: [],
      mode: "script",
      path: "test/language/statements/throw/runtime.js",
      strictness: ["non-strict"],
      suiteRevision: "test-revision",
    },
    { failedPhase: "parse", passed: false },
    new Set<string>(),
  );
  assert.equal(result.classification, "semantic-failure");
});

test("classifies unavailable observation capabilities as unsupported", () => {
  const result = classifyTest262(
    {
      async: false,
      expectedErrorType: "TypeError",
      expectedFailurePhase: "runtime",
      features: [],
      flags: [],
      includes: [],
      mode: "script",
      path: "test/language/statements/throw/runtime.js",
      strictness: ["non-strict"],
      suiteRevision: "test-revision",
    },
    {
      detail: "The runtime error type is not observable.",
      passed: false,
      unsupportedCapability: "runtime-error-types",
    },
    new Set<string>(),
  );
  assert.equal(result.classification, "unsupported-profile-feature");
  assert.deepEqual(result.unsupportedFeatures, []);
});

test("classifies early errors and resolution failures", () => {
  const base = {
    async: false,
    expectedErrorType: "SyntaxError",
    features: [],
    flags: [],
    includes: [],
    strictness: ["non-strict"],
    suiteRevision: "test-revision",
  } as const;
  const earlyError = classifyTest262(
    {
      ...base,
      expectedFailurePhase: "parse",
      mode: "script",
      path: "test/language/expressions/let/dstr/dup-lexical.js",
    },
    {
      errorType: "SyntaxError",
      failedPhase: "parse",
      passed: false,
    },
    new Set<string>(),
  );
  const resolution = classifyTest262(
    {
      ...base,
      expectedFailurePhase: "resolution",
      mode: "module",
      path: "test/language/module-code/instn-resolve.js",
    },
    {
      errorType: "SyntaxError",
      failedPhase: "resolution",
      passed: false,
    },
    new Set<string>(),
  );
  assert.equal(earlyError.classification, "expected-negative");
  assert.equal(resolution.classification, "expected-negative");
});

test("requires the declared error type for negative test262 cases", () => {
  const testCase = {
    async: false,
    expectedErrorType: "TypeError",
    expectedFailurePhase: "runtime",
    features: [],
    flags: [],
    includes: [],
    mode: "script",
    path: "test/language/expressions/property/runtime.js",
    strictness: ["non-strict"],
    suiteRevision: "test-revision",
  } as const;
  const mismatch = classifyTest262(
    testCase,
    {
      errorType: "RangeError",
      failedPhase: "runtime",
      passed: false,
    },
    new Set<string>(),
  );
  const match = classifyTest262(
    testCase,
    {
      errorType: "TypeError",
      failedPhase: "runtime",
      passed: false,
    },
    new Set<string>(),
  );
  assert.equal(mismatch.classification, "semantic-failure");
  assert.equal(match.classification, "expected-negative");
});
