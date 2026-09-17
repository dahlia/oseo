/* eslint-disable no-await-in-loop -- Serial native evidence. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import process from "node:process";
import { createNodeHost } from "../packages/host/src/index.ts";
import {
  prepareHarnessObject,
  describeTarget,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import type {
  NativeToolchain,
  HarnessObjectKeyInput,
} from "../packages/compiler/src/index.ts";
import { nativeToolchain } from "./native-toolchain.ts";
import { runNativeCli } from "./native-cli.ts";
import {
  createTest262FragmentExecutor,
  fragmentBoundaryReason,
  withHarnessIntegrity,
} from "../tools/test262-fragments.ts";
import type { Test262FragmentInput } from "../tools/test262-fragments.ts";

const nativeTarget = targetForExecutionHost(
  createNodeHost().executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function assembled(input: Test262FragmentInput): string {
  return (
    (input.strict ? '"use strict";\n' : "") +
    input.sources.map((s) => s.source).join("\n") +
    "\n" +
    input.body +
    "\n"
  );
}

test("fragment boundaries reject ASI joins", () => {
  for (const strict of [false, true]) {
    const input = {
      strict,
      raw: false,
      sources: [{ sourceId: "h.js", source: "let x = 1; // tail" }],
      body: "console.log(x);",
    };
    assert.equal(fragmentBoundaryReason(input, assembled(input)), undefined);
    const crossing = {
      ...input,
      sources: [{ sourceId: "h.js", source: "foo" }],
      body: "(bar)",
    };
    assert.equal(
      fragmentBoundaryReason(crossing, assembled(crossing)),
      "boundary",
    );
    assert.equal(fragmentBoundaryReason(input, "changed"), "assembly");
  }
});

test("runner fallback retains the exact whole input", async () => {
  const host = createNodeHost();
  const executor = createTest262FragmentExecutor(host, nativeToolchain);
  const cases = [
    { source: "let Object = 1;", harness: "Object;", reason: "shadowing" },
    {
      source: '"use strict"; console.log(1);',
      harness: "var x;",
      reason: "strictness",
    },
    {
      source: "with ({}) { missing = 1; }",
      harness: "var x;",
      reason: "global-effects",
    },
    { source: "with ({}) {}", harness: "var x;", reason: "with" },
    {
      source: "(1)",
      harness: "var foo = function() {};\nfoo",
      reason: "boundary",
    },
    { source: "let = ;", harness: "var x;", reason: "diagnostic" },
  ];
  for (const entry of cases) {
    const fragment = {
      body: entry.source,
      strict: false,
      raw: false,
      sources: [{ sourceId: "h.js", source: entry.harness }],
    };
    const request = {
      fragment,
      source: assembled(fragment),
      mode: "script" as const,
      sourceId: "fallback.js",
      specialization: "enabled" as const,
    };
    const result = {
      exitStatus: 23,
      stdout: request.source,
      stderr: "original",
    };
    assert.equal(await executor.execute(request, async () => result), result);
    assert.equal(executor.counts.attempts[entry.reason], 1, entry.reason);
  }
});

test(
  "runner split and shadowing fallback retain native output and locations",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
    timeout: 180_000,
  },
  async () => {
    const host = createNodeHost();
    const executor = createTest262FragmentExecutor(host, nativeToolchain);
    for (const strict of [false, true]) {
      for (const specialization of ["enabled", "disabled"] as const) {
        for (const body of [
          "console.log(helper());",
          "throw new Error('body');",
          "let Object = 1; console.log(helper());",
        ]) {
          const fragment = {
            body,
            strict,
            raw: false,
            sources: [
              {
                sourceId: "h.js",
                source:
                  "function helper() { return Object.keys({x: 1})[0]; }\n",
              },
            ],
          };
          const source = assembled(fragment);
          const request = {
            fragment,
            source,
            sourceId: "runner-case.js",
            mode: "script" as const,
            specialization,
          };
          const whole = () =>
            runNativeCli({
              args: [
                ...(specialization === "disabled"
                  ? ["--no-specialization"]
                  : []),
                request.sourceId,
              ],
              source,
              sourceId: request.sourceId,
              version: "test",
            });
          assert.deepEqual(
            await executor.execute(request, whole),
            await whole(),
          );
        }
      }
    }
    assert.equal(executor.counts.attempts.split, 8);
    assert.equal(executor.counts.attempts.shadowing, 4);
  },
);

test("object cache coalesces workers and repairs corruption", async () => {
  const original = createNodeHost();
  const dir = await original.makeTemporaryDirectory("oseo-integrity-test-");
  let builds = 0;
  try {
    await mkdir(`${dir}/cache`);
    const host = withHarnessIntegrity({
      ...original,
      cache: { ...original.cache!, getDirectory: async () => `${dir}/cache` },
      async run(request) {
        builds += 1;
        await writeFile(`${request.cwd}/harness.o`, "valid object bytes");
        return { exitStatus: 0, stderr: "", stdout: "" };
      },
    });
    const toolchain: NativeToolchain = {
      createBuildPlan() {
        throw new Error("not a link test");
      },
      harnessObjectReuse: {
        createKey: async () => "key",
        createBuildRequest: (input) => ({
          command: "test-cc",
          args: [],
          cwd: input.workingDirectory,
        }),
      },
    };
    const input: HarnessObjectKeyInput = {
      fragmentAbiVersion: "test",
      harnessSources: [],
      strict: false,
      specialization: "enabled",
      observeSpecialization: false,
      frontendIdentity: "f",
      compilerIdentity: "c",
      backendIdentity: "b",
      generatedSource: "C",
      runtimeAbiVersion: "r",
      runtimeAssets: [],
      target: describeTarget("linux-x86_64-gnu"),
      toolchainEnvironment: { variables: {} },
      toolchainIdentity: "cc",
    };
    const objects = await Promise.all(
      Array.from({ length: 8 }, () =>
        prepareHarnessObject(host, toolchain, input),
      ),
    );
    assert.equal(builds, 1);
    assert.equal(objects.filter((object) => object.cacheHit).length, 7);
    await writeFile(objects[0]!.objectPath, "corrupt");
    const repaired = await prepareHarnessObject(host, toolchain, input);
    assert.equal(repaired.cacheHit, false);
    assert.equal(builds, 2);
    assert.equal(
      await readFile(repaired.objectPath, "utf8"),
      "valid object bytes",
    );
  } finally {
    await original.remove(dir);
  }
});

test("explicit whole routes never build fragments", async () => {
  const host = createNodeHost();
  const executor = createTest262FragmentExecutor(host, nativeToolchain);
  const base = {
    mode: "script" as const,
    source: "42;",
    sourceId: "raw.js",
    specialization: "enabled" as const,
  };
  const result = { exitStatus: 0, stdout: "", stderr: "" };
  const whole = async () => result;
  await executor.execute(base, whole);
  await executor.execute({ ...base, mode: "module" }, whole);
  await executor.execute(
    {
      ...base,
      fragment: { body: "42;", sources: [], strict: false, raw: true },
    },
    whole,
  );
  const previous = process.env.OSEO_TEST262_HARNESS_REUSE;
  try {
    process.env.OSEO_TEST262_HARNESS_REUSE = "disabled";
    await executor.execute(base, whole);
  } finally {
    if (previous == null) delete process.env.OSEO_TEST262_HARNESS_REUSE;
    else process.env.OSEO_TEST262_HARNESS_REUSE = previous;
  }
  assert.deepEqual(executor.counts.attempts, {
    metadata: 1,
    module: 1,
    raw: 1,
    bypass: 1,
  });
});

test(
  "split build failures are evicted without whole fallback",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const phase of ["identity", "object"]) {
      let attempts = 0;
      const host = createNodeHost();
      const directory = await host.makeTemporaryDirectory("oseo-failure-");
      try {
        const executor = createTest262FragmentExecutor(
          {
            ...host,
            cache: {
              ...host.cache!,
              getDirectory: async () => directory,
            },
            async run() {
              attempts += 1;
              if (phase === "object" && attempts === 1) {
                return { exitStatus: 0, stdout: "injected cc", stderr: "" };
              }
              throw new Error("injected build failure");
            },
          },
          nativeToolchain,
        );
        const fragment = {
          sources: [{ sourceId: "h.js", source: "var x = 1;" }],
          body: "console.log(x);",
          strict: false,
          raw: false,
        };
        for (let attempt = 0; attempt < 2; attempt += 1) {
          await assert.rejects(
            executor.execute(
              {
                fragment,
                source: assembled(fragment),
                sourceId: "failure.js",
                mode: "script",
                specialization: "enabled",
              },
              async () => {
                assert.fail("build errors must not fall back");
              },
            ),
            /injected build failure/u,
          );
        }
        assert.equal(attempts, phase === "identity" ? 2 : 3);
      } finally {
        await host.remove(directory);
      }
    }
  },
);

test(
  "fallback preserves harness TDZ and forced collection observations",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
    timeout: 120_000,
  },
  async () => {
    const executor = createTest262FragmentExecutor(
      createNodeHost(),
      nativeToolchain,
    );
    const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
    try {
      for (const gc of [false, true]) {
        if (gc) process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
        else delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        for (const body of ["console.log(helper());", "let Object = 1;"]) {
          const fragment = {
            body,
            strict: false,
            raw: false,
            sources: [
              {
                sourceId: "h.js",
                source:
                  "var captured = Object;\n" +
                  "function helper() { return captured.keys({x: 1})[0]; }",
              },
            ],
          };
          const source = assembled(fragment);
          const request = {
            fragment,
            source,
            mode: "script" as const,
            sourceId: "tdz.js",
            specialization: "enabled" as const,
          };
          const whole = () =>
            runNativeCli({
              args: [request.sourceId],
              source,
              sourceId: request.sourceId,
              version: "test",
            });
          const expected = await whole();
          assert.deepEqual(await executor.execute(request, whole), expected);
          if (body.startsWith("let")) {
            assert.notEqual(expected.exitStatus, 0);
            assert.match(expected.stderr, /tdz.js:1:/u);
          }
        }
      }
    } finally {
      if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
    }
    assert.equal(executor.counts.attempts.split, 2);
    assert.equal(executor.counts.attempts.shadowing, 2);
  },
);

test(
  "split source maps count every ECMAScript line separator",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
    timeout: 120_000,
  },
  async () => {
    const executor = createTest262FragmentExecutor(
      createNodeHost(),
      nativeToolchain,
    );
    for (const separator of ["\r", "\r\n", "\u2028", "\u2029"]) {
      for (const strict of [false, true]) {
        const fragment = {
          strict,
          raw: false,
          body: "throw new Error('line');",
          sources: [
            { sourceId: "h.js", source: `var x = 1;${separator}var y = 2;` },
          ],
        };
        const source = assembled(fragment);
        const request = {
          fragment,
          source,
          sourceId: "lines.js",
          mode: "script" as const,
          specialization: "enabled" as const,
        };
        const whole = () =>
          runNativeCli({
            args: [request.sourceId],
            source,
            sourceId: request.sourceId,
            version: "test",
          });
        assert.deepEqual(await executor.execute(request, whole), await whole());
      }
    }
    assert.equal(executor.counts.attempts.split, 8);
  },
);

test("execution counts use the first diagnostic prefix", async () => {
  const executor = createTest262FragmentExecutor(
    createNodeHost(),
    nativeToolchain,
  );
  const request = {
    source: "",
    sourceId: "counter.js",
    mode: "script" as const,
    specialization: "enabled" as const,
  };
  for (const code of ["OSEO2001", "OSEO3001"]) {
    await executor.execute(request, async () => ({
      exitStatus: 1,
      stdout: "",
      stderr:
        `counter.js:1:1: error[${code}]: thrown text\n` +
        "fake.js:2:3: error[OSEO1001]: embedded message\n",
    }));
  }
  await executor.execute(request, async () => ({
    exitStatus: 0,
    stdout: "",
    stderr: "fake.js:2:3: error[OSEO1001]: successful user output\n",
  }));
  assert.equal(executor.counts.attempts.metadata, 3);
  assert.equal(executor.counts.executed.metadata, 2);
});
