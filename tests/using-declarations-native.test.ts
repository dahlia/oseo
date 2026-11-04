/* eslint-disable no-await-in-loop -- Native builds run serially. */

/*
 * Fixed native fixtures of the using-declarations unit. They run here
 * rather than in tests/native.ts because the M5c exclusion audit binds
 * that file by digest. Each fixture compiles under both specialization
 * policies with collection forced at every safepoint and must match
 * Node.js and Deno byte for byte.
 */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  compileSource,
  printMir,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../packages/testkit/src/index.ts";
import { runNativeCli } from "./native-cli.ts";
import { nativeToolchain } from "./native-toolchain.ts";
import { agentReferencePrelude } from "./native/agent-reference.ts";
import {
  type UsingFixture,
  usingDeclarationFixtures,
} from "./native/fixtures/using-declarations.ts";
import { realmReferencePrelude } from "./native/realm-reference.ts";

const fixtures: readonly UsingFixture[] = usingDeclarationFixtures;

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const skip = nativeTarget == null ? "requires a supported native host" : false;

// The captured `String` keeps the reference console working while a
// fixture replaces or deletes the realm's own global binding.
const referencePrelude = `
const oseoReferenceConsole = console;
const oseoReferenceString = String;
Object.defineProperty(globalThis, "console", {
  value: {
    log(...values) {
      oseoReferenceConsole.log(values.map(oseoReferenceString).join(" "));
    },
  },
});
`;

interface Observation {
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}

async function references(
  fixture: UsingFixture,
): Promise<readonly Observation[]> {
  const directory = await host.makeTemporaryDirectory("oseo-using-");
  // Node.js strips TypeScript with a parser that rejects a `using` head
  // of a classic for statement, so the references run plain JavaScript.
  const path = `${directory}/${fixture.name}.js`;
  try {
    const source = fixture.globalScriptReference
      ? `(0, eval)(${JSON.stringify(fixture.source)});\n`
      : fixture.source;
    await host.writeTextFile(
      path,
      referencePrelude +
        (fixture.test262Host === true
          ? agentReferencePrelude + realmReferencePrelude
          : "") +
        source,
    );
    const observations: Observation[] = [];
    if (fixture.denoOnly !== true) {
      observations.push(
        await host.run({
          args: [path],
          command: process.execPath,
          cwd: directory,
        }),
      );
    }
    if (fixture.nodeOnly !== true) {
      observations.push(
        await host.run({
          args: ["run", "--quiet", path],
          command: "deno",
          cwd: directory,
        }),
      );
    }
    for (const observation of observations) {
      assert.equal(observation.exitStatus, 0, observation.stderr);
    }
    return observations;
  } finally {
    await host.remove(directory);
  }
}

for (const fixture of fixtures) {
  test(`using-declarations fixture ${fixture.name}`, { skip }, async () => {
    const observed = await references(fixture);
    assertMatchingObservations(observed);
    const reference = observed[0]!;
    const test262Host = fixture.test262Host === true;
    const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          { source: fixture.source, sourceId: `${fixture.name}.ts` },
          { observeSpecialization: true, specialization, test262Host },
        );
        assert.deepEqual(compiled.diagnostics, [], fixture.name);
        assert.ok(compiled.mir != null);
        const mir = printMir(compiled.mir);
        if (specialization === "enabled") {
          assert.match(mir, /guard-object/u);
          assert.match(mir, /guard-shape/u);
          assert.match(mir, /property-get generic/u);
        } else {
          assert.doesNotMatch(mir, /guard-(?:object|shape)/u);
        }
        await withNativeFixture(
          {
            agents: compiled.agents ?? [],
            backend: cBackend,
            host,
            input: compiled.mir,
            operation: "execute",
            runtime: cRuntimeProvider,
            target: nativeTarget!,
            toolchain: nativeToolchain,
          },
          (native) => {
            assertMatchingObservations([reference, native]);
            assert.ok(native.counters != null);
            assert.ok(native.counters.collections > 0);
            if (specialization === "enabled") {
              assert.ok(native.counters.guardMisses > 0);
              if (fixture.guardHits === true) {
                assert.ok(native.counters.guardHits > 0);
              }
            }
          },
        );
      }
    } finally {
      if (saved == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      else process.env.OSEO_GC_EVERY_SAFEPOINT = saved;
    }
  });
}

// Module top level: a dependency's `using` is disposed when its own
// evaluation completes, before the importer runs, and the importer's
// `await using` makes its evaluation asynchronous and awaits during
// disposal after the body's own await.
const moduleEntry = fileURLToPath(
  new URL("./fixtures/using-module/main.mjs", import.meta.url),
);
const moduleExpected = [
  "dependency body function",
  "dispose dependency",
  "imported function",
  "main body",
  "microtask after body",
  "after await",
  "dispose main async",
  "dispose main sync",
  "",
].join("\n");

test("using-declarations module top level", { skip }, async () => {
  for (const [command, args] of [
    [process.execPath, [moduleEntry]],
    ["deno", ["run", "--quiet", moduleEntry]],
  ] as const) {
    const result = await host.run({
      args,
      command,
      cwd: fileURLToPath(new URL("..", import.meta.url)),
    });
    assert.equal(result.exitStatus, 0, result.stderr);
    assert.equal(result.stdout, moduleExpected, command);
  }
  const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
  process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
  try {
    for (const specialization of ["disabled", "enabled"] as const) {
      const result = await runNativeCli(
        {
          args: [
            ...(specialization === "disabled" ? ["--no-specialization"] : []),
            moduleEntry,
          ],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(result.exitStatus, 0, result.stderr);
      assert.equal(result.stderr, "");
      assert.equal(result.stdout, moduleExpected, specialization);
    }
  } finally {
    if (saved == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    else process.env.OSEO_GC_EVERY_SAFEPOINT = saved;
  }
});
