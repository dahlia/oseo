/* eslint-disable no-await-in-loop -- Native commands run serially. */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { runNativeFixture } from "../tools/native-fixture.ts";
import { readFile, readdir, mkdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  emitScriptFragments,
  cBackend,
} from "../packages/backend-c/src/index.ts";
import {
  compileHarnessFragment,
  compileBodyFragment,
  compileSource,
  describeTarget,
  targetForExecutionHost,
  prepareHarnessObject,
  scriptFragmentAbi,
} from "../packages/compiler/src/index.ts";
import type {
  HarnessObjectKeyInput,
  NativeBuildPlan,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { nativeToolchain, hostCcLane } from "./native-toolchain.ts";

async function identity(directory: URL): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await readFile(new URL("../package.json", directory)));
  hash.update(await readFile(new URL("../aube-lock.yaml", import.meta.url)));
  for (const name of (await readdir(directory)).toSorted()) {
    if (!name.endsWith(".ts")) continue;
    hash.update(name).update(await readFile(new URL(name, directory)));
  }
  return hash.digest("hex");
}

function observe(path: string, gc: boolean) {
  const result = runNativeFixture(path, [], {
    encoding: "base64",
    env: gc ? { OSEO_GC_EVERY_SAFEPOINT: "1" } : {},
    timeout: 30_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  return {
    stdout: Buffer.from(result.stdout, "base64"),
    stderr: Buffer.from(result.stderr, "base64"),
    status: result.status,
  };
}

const reviewedGroups = [
  {
    includes: ["var-harness"],
    names: [],
    probes: [
      {
        name: "global-key-order",
        source: `function c() {}
console.log(Object.keys(this).slice(-2).join(","));`,
      },
    ],
  },
  {
    includes: ["empty"],
    names: [],
    probes: [{ name: "empty-harness", source: "console.log(42);" }],
  },
  {
    includes: [],
    names: ["errors-iterabletolist-failures", "message-tostring-abrupt"],
    probes: [],
  },
  {
    includes: ["propertyHelper.js"],
    names: ["cause-property", "length"],
    probes: [],
  },
  {
    includes: ["compareArray.js"],
    names: ["errors-iterabletolist"],
    probes: [],
  },
  {
    includes: [],
    names: [],
    probes: [
      {
        name: "closures-and-globals",
        source: `
let counter = 1;
function make() { let captured = 2; return () => ++captured + counter; }
const f = make();
assert.sameValue(f(), 4);
counter = 3;
assert.sameValue(f(), 7);
var published = 8;
assert.sameValue(this.published, 8);
console.log(f());`,
      },
      {
        name: "generator-and-async",
        source: `
function* sequence() { yield 1; yield 2; }
const it = sequence();
assert.sameValue(it.next().value, 1);
assert.sameValue(it.next().value, 2);
async function work() { return await Promise.resolve(42); }
work().then(value => console.log(value));`,
      },
      {
        name: "body-error-location",
        source: `console.log("before");
throw new Error("body error");`,
      },
      { name: "harness-error-location", source: `assert.sameValue(1, 2);` },
      {
        name: "recursion-limit",
        source: `
function recurse() { return recurse(); }
try { recurse(); } catch (error) { console.log(error.name); }`,
      },
    ],
  },
];

const nativeTarget = targetForExecutionHost(
  createNodeHost().executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

test(
  "prebuilt harness equivalence, reuse and deterministic objects",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
    timeout: 600_000,
  },
  async () => {
    const baseHost = createNodeHost();
    const dir = await baseHost.makeTemporaryDirectory("oseo-split-test-");
    const cacheDir = join(dir, "cache");
    await mkdir(cacheDir);
    let commands = 0;
    const host = {
      ...baseHost,
      cache: {
        ...baseHost.cache!,
        async getDirectory() {
          return cacheDir;
        },
      },
      async run(request: Parameters<typeof baseHost.run>[0]) {
        commands += 1;
        return await baseHost.run(request);
      },
    };
    try {
      const environment = (await host.captureEnvironment!(
        nativeToolchain.environment!,
      )) ?? { variables: {} };
      const target = nativeTarget!;
      const runtime = cRuntimeProvider.getRuntimeInput();
      const assets = await Promise.all(
        runtime.assets.map(async (asset) => ({
          name: asset.name,
          kind: asset.kind,
          contents: await host.readTextFile(asset.url),
        })),
      );
      const runtimeDir = join(dir, "runtime");
      await mkdir(runtimeDir);
      for (const asset of assets) {
        await host.writeTextFile(join(runtimeDir, asset.name), asset.contents);
      }
      const identified = await host.run(
        nativeToolchain.runtimeArchiveReuse!.createIdentityRequest(
          dir,
          environment,
        ),
      );
      assert.equal(identified.exitStatus, 0, identified.stderr);
      const identities = {
        frontendIdentity: await identity(
          new URL("../packages/parser-babel/src/", import.meta.url),
        ),
        compilerIdentity: await identity(
          new URL("../packages/compiler/src/", import.meta.url),
        ),
        backendIdentity: await identity(
          new URL("../packages/backend-c/src/", import.meta.url),
        ),
      };
      let archive: string | undefined;
      const crossArchives = new Map<string, string>();
      const suite = dirname(
        fileURLToPath(import.meta.resolve("test262/package.json")),
      );
      const deterministicObjects: {
        key: string;
        sha256: string;
        bytes: number;
        target: string;
      }[] = [];
      const timings: {
        name: string;
        strict: boolean;
        specialization: string;
        splitMs: number;
        wholeMs: number;
      }[] = [];
      async function executePlan(plan: NativeBuildPlan): Promise<number> {
        const start = performance.now();
        for (const request of plan.requests) {
          const result = await host.run(request);
          assert.equal(result.exitStatus, 0, result.stderr);
        }
        return performance.now() - start;
      }
      for (const strict of [false, true]) {
        for (const specialization of ["enabled", "disabled"] as const) {
          for (const group of reviewedGroups) {
            const sources =
              group.includes[0] === "var-harness"
                ? [{ sourceId: "h.js", source: "var h = 1;" }]
                : await Promise.all(
                    (group.includes[0] === "empty"
                      ? []
                      : ["base.js", ...group.includes]
                    ).map(async (sourceId) => ({
                      sourceId,
                      source: await readFile(
                        new URL(`test262/harness/${sourceId}`, import.meta.url),
                        "utf8",
                      ),
                    })),
                  );
            const h = compileHarnessFragment(babelFrontend, sources, strict, {
              specialization,
            });
            assert.equal(h.kind, "compiled");
            if (h.kind !== "compiled") return;
            let sharedObject: string | undefined;
            const cases = [
              ...(await Promise.all(
                group.names.map(async (name) => ({
                  name,
                  sourceId: `test/built-ins/AggregateError/${name}.js`,
                  source: await readFile(
                    join(suite, `test/built-ins/AggregateError/${name}.js`),
                    "utf8",
                  ),
                })),
              )),
              ...group.probes.map((probe) => ({
                name: probe.name,
                source: probe.source,
                sourceId: `probe/${probe.name}.js`,
              })),
            ];
            for (const { name, sourceId, source } of cases) {
              const b = compileBodyFragment(babelFrontend, h.harness, {
                sourceId,
                source,
              });
              assert.equal(b.kind, "compiled", JSON.stringify(b));
              if (b.kind !== "compiled") return;
              const prefix = sources.map((s) => s.source).join("\n") + "\n";
              const emitted = emitScriptFragments(h.harness, b.body, {
                sourceId,
                harnessLineOffset: 0,
                bodyLineOffset: prefix.split("\n").length - 1,
              });
              const keyInput: HarnessObjectKeyInput = {
                ...identities,
                fragmentAbiVersion: scriptFragmentAbi,
                harnessSources: sources,
                strict,
                specialization,
                observeSpecialization: false,
                generatedSource: emitted.harness.source,
                runtimeAbiVersion: runtime.abiVersion,
                runtimeAssets: assets,
                target,
                toolchainEnvironment: environment,
                toolchainIdentity: identified.stdout,
              };
              const object = await prepareHarnessObject(
                host,
                nativeToolchain,
                keyInput,
              );
              if (sharedObject != null) {
                assert.equal(object.objectPath, sharedObject);
                assert.equal(object.cacheHit, true);
              } else {
                // A previous group may already have prepared this bundle.

                sharedObject = object.objectPath;
                const count = commands;
                const hit = await prepareHarnessObject(
                  host,
                  nativeToolchain,
                  keyInput,
                );
                assert.equal(hit.cacheHit, true);
                assert.equal(commands, count);
                // No shared cache on the second build: compile independently.
                const otherHost = { ...host, cache: undefined };
                const { cache: _, ...uncachedHost } = otherHost;
                const second = await prepareHarnessObject(
                  uncachedHost,
                  nativeToolchain,
                  keyInput,
                );
                const firstBytes = await readFile(object.objectPath);
                assert.deepEqual(firstBytes, await readFile(second.objectPath));
                assert.equal(
                  firstBytes.includes(Buffer.from(dirname(second.objectPath))),
                  false,
                );
                deterministicObjects.push({
                  key: object.key,
                  sha256: createHash("sha256").update(firstBytes).digest("hex"),
                  bytes: firstBytes.length,
                  target: target.name,
                });
                await host.remove(dirname(second.objectPath));
              }
              const work = await host.makeTemporaryDirectory("oseo-case-");
              try {
                for (const unit of [emitted.body, emitted.launcher]) {
                  await host.writeTextFile(
                    join(work, unit.sourceName),
                    unit.source,
                  );
                }
                const common = {
                  environment,
                  target,
                  runtimeDirectory: runtimeDir,
                  workingDirectory: work,
                  runtimeSourcePaths:
                    archive == null
                      ? assets
                          .filter((a) => a.kind === "source")
                          .map((a) => join(runtimeDir, a.name))
                      : [],
                };
                const withRuntime =
                  archive == null
                    ? common
                    : {
                        ...common,
                        prebuiltRuntimeArchivePath: archive,
                      };
                const plan = nativeToolchain.createBuildPlan({
                  ...withRuntime,
                  generatedSourcePath: join(work, "launcher.c"),
                  additionalGeneratedSourcePaths: [join(work, "case.c")],
                  prebuiltObjectPaths: [object.objectPath],
                });
                // Build the runtime once, excluding it from per-case timings.
                if (archive == null) {
                  assert.ok(plan.runtimeArchivePath);
                  await executePlan({
                    ...plan,
                    requests: plan.requests.slice(0, -1),
                  });
                  archive = join(runtimeDir, "runtime.a");
                  await copyFile(plan.runtimeArchivePath, archive);
                }
                const splitMs = await executePlan({
                  ...plan,
                  requests: plan.requests.slice(-1),
                });
                const split = [
                  observe(plan.executablePath, false),
                  observe(plan.executablePath, true),
                ];
                const whole = compileSource(
                  babelFrontend,
                  {
                    sourceId,
                    source: (strict ? '"use strict";\n' : "") + prefix + source,
                  },
                  { specialization },
                );
                assert.ok(whole.mir, JSON.stringify(whole.diagnostics));
                await host.writeTextFile(
                  join(work, "whole.c"),
                  cBackend.emit(whole.mir).source,
                );
                const wholePlan = nativeToolchain.createBuildPlan({
                  ...common,
                  runtimeSourcePaths: [],
                  prebuiltRuntimeArchivePath: archive,
                  generatedSourcePath: join(work, "whole.c"),
                });
                const wholeMs = await executePlan(wholePlan);
                for (const [index, gc] of [false, true].entries()) {
                  const observed = observe(wholePlan.executablePath, gc);
                  assert.equal(
                    observed.status,
                    name.endsWith("error-location") ||
                      name === "recursion-limit"
                      ? 1
                      : 0,
                    observed.stderr.toString(),
                  );
                  if (name === "global-key-order") {
                    assert.equal(observed.stdout.toString(), "c,h\n");
                  }
                  assert.deepEqual(
                    split[index],
                    observed,
                    `${sourceId} ${strict}/${specialization} gc=${gc}`,
                  );
                }
                if (!hostCcLane && name === "errors-iterabletolist-failures") {
                  const { cache: _, ...uncached } = host;
                  for (const crossName of [
                    "linux-aarch64-musl",
                    "macos-aarch64",
                  ] as const) {
                    const crossTarget = describeTarget(crossName);
                    const crossInput = { ...keyInput, target: crossTarget };
                    const crossObject = await prepareHarnessObject(
                      host,
                      nativeToolchain,
                      crossInput,
                    );
                    const second = await prepareHarnessObject(
                      uncached,
                      nativeToolchain,
                      crossInput,
                    );
                    const bytes = await readFile(crossObject.objectPath);
                    assert.deepEqual(bytes, await readFile(second.objectPath));
                    deterministicObjects.push({
                      key: crossObject.key,
                      sha256: createHash("sha256").update(bytes).digest("hex"),
                      bytes: bytes.length,
                      target: crossName,
                    });
                    await host.remove(dirname(second.objectPath));
                    if (crossName !== "linux-aarch64-musl") continue;
                    const previous = crossArchives.get(crossName);
                    const crossPlan = nativeToolchain.createBuildPlan({
                      ...common,
                      target: crossTarget,
                      generatedSourcePath: join(work, "launcher.c"),
                      additionalGeneratedSourcePaths: [join(work, "case.c")],
                      prebuiltObjectPaths: [crossObject.objectPath],
                      ...(previous == null
                        ? {
                            runtimeSourcePaths: assets
                              .filter((a) => a.kind === "source")
                              .map((a) => join(runtimeDir, a.name)),
                          }
                        : {
                            runtimeSourcePaths: [],
                            prebuiltRuntimeArchivePath: previous,
                          }),
                    });
                    await executePlan(crossPlan);
                    const binary = await readFile(crossPlan.executablePath);
                    assert.equal(binary.readUInt16LE(18), 183);
                    if (previous == null) {
                      assert.ok(crossPlan.runtimeArchivePath);
                      const retained = join(runtimeDir, "cross.a");
                      await copyFile(crossPlan.runtimeArchivePath, retained);
                      crossArchives.set(crossName, retained);
                    }
                  }
                }
                timings.push({
                  name,
                  strict,
                  specialization,
                  splitMs,
                  wholeMs,
                });
              } finally {
                await host.remove(work);
              }
            }
          }
        }
      }
      console.log(
        JSON.stringify({
          adapter: hostCcLane ? "host-cc" : "zig",
          measured: true,
          deterministicObjects,
          timings,
        }),
      );
    } finally {
      await host.remove(dir);
    }
  },
);
