import { hostCcLane } from "../native-toolchain.ts";
import { buildHostCcFixture } from "../host-cc-runtime.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import fc from "fast-check";

import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";

const { assertProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

interface EphemeronCase {
  readonly ephemerons: readonly (readonly [number, number])[];
  readonly nodeCount: number;
  readonly registrationOrder: readonly number[];
  readonly roots: readonly boolean[];
  readonly strongTargets: readonly number[];
}

const caseArbitrary: fc.Arbitrary<EphemeronCase> = fc
  .integer({ max: 6, min: 1 })
  .chain((nodeCount) =>
    fc.record({
      ephemerons: fc.array(
        fc.tuple(
          fc.integer({ max: nodeCount - 1, min: 0 }),
          fc.integer({ max: nodeCount - 1, min: 0 }),
        ),
        { maxLength: 8 },
      ),
      nodeCount: fc.constant(nodeCount),
      registrationOrder: fc.uniqueArray(
        fc.integer({ max: nodeCount - 1, min: 0 }),
        { maxLength: nodeCount, minLength: nodeCount },
      ),
      roots: fc.array(fc.boolean(), {
        maxLength: nodeCount,
        minLength: nodeCount,
      }),
      strongTargets: fc.array(fc.integer({ max: nodeCount - 1, min: -1 }), {
        maxLength: nodeCount,
        minLength: nodeCount,
      }),
    }),
  );

const root = fileURLToPath(new URL("../..", import.meta.url));
const runtime = join(root, "packages/runtime-c/native");
const runtimeSources = cRuntimeProvider
  .getRuntimeInput()
  .assets.filter((asset) => asset.kind === "source")
  .map((asset) => fileURLToPath(asset.url));
const fixture = join(root, "tests/fixtures/runtime-ephemeron-property.c");
const zigNativeTarget =
  process.platform === "linux" && process.arch === "x64"
    ? "x86_64-linux-gnu"
    : process.platform === "darwin" && process.arch === "arm64"
      ? "aarch64-macos"
      : undefined;

function run(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, OSEO_GC_EVERY_SAFEPOINT: "1" },
  });
  assert.equal(
    result.status,
    0,
    [
      `${command} ${args.join(" ")}`,
      `error: ${result.error?.stack ?? "none"}`,
      `signal: ${result.signal ?? "none"}`,
      `stdout: ${result.stdout ?? ""}`,
      `stderr: ${result.stderr ?? ""}`,
    ].join("\n"),
  );
  return result.stdout ?? "";
}

function reachability(testCase: EphemeronCase): readonly boolean[] {
  const reachable = [...testCase.roots];
  const ephemerons = new Map<number, number>();
  for (const [key, value] of testCase.ephemerons) {
    ephemerons.set(key, value);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < testCase.nodeCount; index += 1) {
      if (!reachable[index]) continue;
      const target = testCase.strongTargets[index];
      if (target != null && target >= 0 && !reachable[target]) {
        reachable[target] = true;
        changed = true;
      }
    }
    for (const [key, value] of ephemerons) {
      if (reachable[key] && !reachable[value]) {
        reachable[value] = true;
        changed = true;
      }
    }
  }
  return reachable;
}

function encode(testCase: EphemeronCase): readonly string[] {
  return [
    `${testCase.nodeCount}`,
    testCase.roots.map((rooted) => (rooted ? "1" : "0")).join(""),
    testCase.strongTargets
      .map((target) => (target < 0 ? "x" : `${target}`))
      .join(""),
    testCase.ephemerons.map(([key, value]) => `${key}${value}`).join(""),
    testCase.registrationOrder.join(""),
  ];
}

function expected(testCase: EphemeronCase): string {
  const reachable = reachability(testCase);
  const cleanup = testCase.registrationOrder
    .filter((index) => !reachable[index])
    .map((index) => index + 1);
  return (
    `live ${reachable.map((live) => (live ? "1" : "0")).join("")}\n` +
    `cleanup${cleanup.length === 0 ? "" : ` ${cleanup.join(",")}`}\n`
  );
}

test(
  "generated ephemeron graphs match the collector reachability model",
  {
    skip: zigNativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "oseo-ephemeron-property-"));
    try {
      const executable = join(directory, "runtime-ephemeron-property");
      if (hostCcLane) {
        buildHostCcFixture(fixture, runtime, runtimeSources, executable);
      } else
        run("zig", [
          "cc",
          "-target",
          zigNativeTarget ?? "x86_64-linux-gnu",
          "-std=c11",
          "-Wall",
          "-Wextra",
          "-Werror",
          "-fsanitize=address,undefined",
          "-I",
          runtime,
          fixture,
          ...runtimeSources,
          "-o",
          executable,
        ]);
      assertProperty(
        "ephemeron fixed points, weak clearing, and cleanup order agree",
        fc.property(caseArbitrary, (testCase) => {
          const encoded = encode(testCase);
          const observation = expected(testCase);
          for (const specialization of ["0", "1"] as const) {
            assert.equal(
              run(executable, [specialization, ...encoded]),
              observation,
            );
          }
        }),
        {
          context: [
            `target=${zigNativeTarget ?? "unsupported"}`,
            "native-collector=forced",
            "specialization=disabled,enabled",
          ],
          domain:
            "one to six heap nodes with zero or one strong successor, " +
            "zero to eight ephemeron edges with last-write-wins keys, " +
            "an arbitrary root set, and a complete cleanup registration " +
            "permutation",
          numRuns: 12,
          profile: "M5b ephemeron tracing checkpoint",
          seed: 0x6000_6f00,
          sizeLimit:
            "at most six nodes, six strong edges, eight ephemeron edges, " +
            "six weak observations, and six cleanup records",
          timeLimitMilliseconds: 180_000,
        },
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  },
);
