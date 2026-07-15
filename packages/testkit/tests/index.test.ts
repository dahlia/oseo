import assert from "node:assert/strict";
import test from "node:test";

import { assertMatchingObservations, withNativeFixture } from "../src/index.ts";
import type { NativeFixtureOptions } from "../src/index.ts";

type Host = NativeFixtureOptions["host"];
type ProcessObservation = Awaited<ReturnType<Host["run"]>>;

interface MemoryHost {
  readonly files: Map<string, string>;
  readonly host: Host;
  readonly removed: string[];
}

function memoryHost(results: readonly ProcessObservation[]): MemoryHost {
  const files = new Map<string, string>();
  const removed: string[] = [];
  let resultIndex = 0;
  return {
    files,
    host: {
      async makeTemporaryDirectory(): Promise<string> {
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
  };
}

function fixtureOptions(
  host: Host,
  commands: readonly string[],
): NativeFixtureOptions {
  const target = {
    cStandard: "c11",
    execute: true,
    name: "x86_64-linux-gnu",
    sanitizeUndefinedBehavior: true,
  } as const;
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
      kind: "mir-program",
      script: {
        blocks: [],
        id: -1,
        kind: "mir-function",
        name: "<script>",
        parameterCount: 0,
        parameters: [],
        range: {
          end: { column: 1, line: 1 },
          start: { column: 1, line: 1 },
        },
        rootSlotCount: 1,
      },
      sourceId: "fixture.ts",
    },
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
