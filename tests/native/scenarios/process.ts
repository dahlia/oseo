/* eslint-disable no-await-in-loop -- Process cases own isolated programs. */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

import type {
  CompilerHost,
  ProcessObservation,
} from "../../../packages/compiler/src/index.ts";
import {
  assertMatchingObservations,
  compileProcessProgram,
  processReferences,
  runProcessProgram,
} from "../../preview-process-support.ts";
import { cBackend } from "../../../packages/backend-c/src/index.ts";
import {
  defaultComponents,
  runNativeUnits,
} from "../../../packages/cli/src/index.ts";
import { nativeToolchain } from "../../native-toolchain.ts";
import { processCases } from "../fixtures/process.ts";

import {
  compileSource,
  targetForExecutionHost,
} from "../../../packages/compiler/src/index.ts";
import { withNativeFixture } from "../../../packages/testkit/src/index.ts";

/** ADR 0038's comparisons keep its named Node/Deno deviations explicit. */
export async function runProcessScenarios(host: CompilerHost): Promise<void> {
  for (const fixture of processCases) {
    const native = await runProcessProgram(
      host,
      fixture.source,
      fixture.execution,
      fixture.module,
      fixture.test262Host,
    );
    for (const result of native) {
      assert.equal(result.exitStatus, fixture.status ?? 0, result.stderr);
      if (fixture.expected != null)
        assert.equal(result.stdout, fixture.expected);
      if (fixture.diagnostic != null) {
        assert.match(result.stderr, fixture.diagnostic);
      }
    }
    if (fixture.reference !== "none") {
      const references = await processReferences(
        host,
        fixture.source,
        fixture.execution,
      );
      if (fixture.reference === "specific") {
        assert.equal(references[0]?.exitStatus, 0);
        assert.equal(references[0]?.stdout, fixture.nodeExpected);
        assert.equal(references[1]?.exitStatus, 0);
        assert.equal(references[1]?.stdout, fixture.denoExpected);
      }
      if (fixture.reference === "node") {
        assert.equal(references[1]?.exitStatus, fixture.denoStatus ?? 0);
        if (fixture.denoExpected != null) {
          assert.equal(references[1]?.stdout, fixture.denoExpected);
        }
      }
      if (fixture.reference === "status") {
        for (const result of [...native, ...references]) {
          assert.equal(result.exitStatus, fixture.status ?? 0);
        }
      } else if (fixture.reference !== "specific") {
        assertMatchingObservations([
          ...native,
          ...(fixture.reference === "node"
            ? references.slice(0, 1)
            : references),
        ]);
      }
    }
  }

  for (const specialization of ["disabled", "enabled"] as const) {
    const mir = await compileProcessProgram(
      host,
      "process-startup.js",
      `console.log(process.argv[0].startsWith("/"));
console.log(JSON.stringify(process.argv[1]));
console.log(JSON.stringify(process.argv.slice(2)));
console.log(JSON.stringify(process.env.OSEO_INVALID_UTF8));
console.log(JSON.stringify(process.env["OSEO_�"]));`,
      specialization,
      false,
    );
    const emitted = cBackend.emit(mir);
    const marker = "    oseo_process_start(&context, argc, argv);";
    assert.ok(emitted.source.includes(marker));
    const source = emitted.source.replace(
      marker,
      `
    extern int setenv(const char *, const char *, int);
    char invalid[] = {'x', (char)0xff, 0};
    char invoked[] = {'r', '/', (char)0xff, 0};
    char key[] = {'O', 'S', 'E', 'O', '_', (char)0xff, 0};
    argv[0] = invoked;
    argv[1] = invalid;
    if (setenv("OSEO_INVALID_UTF8", invalid, 1) != 0) return 2;
    if (setenv(key, invalid, 1) != 0) return 2;
${marker}`,
    );
    const result = await runNativeUnits(
      {
        sources: [{ ...emitted, source }],
        prebuiltObjectPaths: [],
      },
      "process-startup.js",
      host,
      nativeToolchain,
      "enabled",
      undefined,
      undefined,
      {
        args: ["placeholder"],
        captureBytes: true,
        environment: {
          variables: {
            ...Object.fromEntries(
              Object.entries(process.env).filter(
                (entry): entry is [string, string] => entry[1] != null,
              ),
            ),
            OSEO_GC_EVERY_SAFEPOINT: "1",
          },
        },
      },
    );
    assert.equal(result.exitStatus, 0, result.stderr);
    assert.equal(result.stdout, 'true\n"r/�"\n["x�"]\n"x�"\n"x�"\n');
  }

  // User stderr can end mid-line or contain text identical to a private
  // counter record. Only the record an observed build appends is removed.
  const counterText =
    "OSEO_OBSERVATIONS " +
    JSON.stringify({
      guardHits: 9,
      guardMisses: 8,
      overflowMisses: 7,
      genericAdditionCalls: 6,
      allocations: 5,
      collections: 4,
    }) +
    "\n";
  const expectedBytes = new Uint8Array([
    ...new TextEncoder().encode(counterText),
    255,
    0,
    ...new TextEncoder().encode("tail"),
  ]);
  const target =
    host.executionHost == null
      ? undefined
      : targetForExecutionHost(host.executionHost);
  assert.ok(target);
  for (const specialization of ["disabled", "enabled"] as const) {
    for (const observed of [false, true]) {
      const source = `process.stderr.write(${JSON.stringify(counterText)});
process.stderr.write(new Uint8Array([255, 0]));
process.stderr.write("tail");
console.log("ok");`;
      const compiled = compileSource(
        defaultComponents.frontend,
        { source, sourceId: "process-counters.js" },
        { specialization, observeSpecialization: observed },
      );
      assert.deepEqual(compiled.diagnostics, []);
      assert.ok(compiled.mir);
      await withNativeFixture(
        {
          backend: cBackend,
          host,
          input: compiled.mir,
          operation: "execute",
          runtime: defaultComponents.runtime,
          target,
          toolchain: nativeToolchain,
          execution: {
            captureBytes: true,
            environment: {
              variables: {
                ...Object.fromEntries(
                  Object.entries(process.env).filter(
                    (entry): entry is [string, string] => entry[1] != null,
                  ),
                ),
                OSEO_GC_EVERY_SAFEPOINT: "1",
              },
            },
          },
        },
        (native) => {
          assert.equal(native.stdout, "ok\n");
          assert.deepEqual(native.stderrBytes, expectedBytes);
          assert.equal(native.counters != null, observed);
        },
      );
    }
  }

  // The startup snapshot of argv and the environment must not decide which
  // later strings the runtime shares. Entries equal to global property
  // names, as environment values, environment keys, or arguments, leave
  // the program's counters of one observed executable unchanged. The
  // collection count is excluded: under forced collection it grows with
  // the startup work, which depends on the size of the environment.
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] != null,
    ),
  );
  const globalNames = ["undefined", "process", "globalThis", "Infinity"];
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      defaultComponents.frontend,
      {
        source:
          "function add(left: number, right: number) " +
          "{ return left + right; }\nadd(20, 22);\n",
        sourceId: "process-snapshot-sharing.ts",
      },
      { specialization, observeSpecialization: true },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir);
    await withNativeFixture(
      {
        backend: cBackend,
        host,
        input: compiled.mir,
        operation: "execute",
        runtime: defaultComponents.runtime,
        target,
        toolchain: nativeToolchain,
        execution: {
          environment: {
            variables: { ...inherited, OSEO_GC_EVERY_SAFEPOINT: "1" },
          },
        },
      },
      async (native) => {
        assert.ok(native.counters);
        assert.ok(native.counters.allocations > 0);
        const variants = [
          { args: [], variables: {} },
          {
            args: [],
            variables: {
              ...inherited,
              ...Object.fromEntries(
                globalNames.map((name, index) => [
                  `OSEO_SNAPSHOT_VALUE_${index}`,
                  name,
                ]),
              ),
            },
          },
          {
            args: [],
            variables: {
              ...inherited,
              ...Object.fromEntries(globalNames.map((name) => [name, "1"])),
            },
          },
          { args: globalNames, variables: inherited },
        ];
        for (const variant of variants) {
          const observed = await host.run({
            command: native.executablePath,
            args: variant.args,
            cwd: dirname(native.executablePath),
            environment: {
              variables: {
                ...variant.variables,
                OSEO_GC_EVERY_SAFEPOINT: "1",
              },
            },
          });
          assert.equal(observed.exitStatus, 0, observed.stderr);
          const record = /^OSEO_OBSERVATIONS (.*)\n$/mu.exec(
            observed.stderr,
          )?.[1];
          assert.ok(record, observed.stderr);
          const { collections, ...counters } = JSON.parse(record);
          const { collections: expected, ...baseline } = native.counters;
          assert.ok(collections > 0 && expected > 0);
          assert.deepEqual(counters, baseline);
        }
      },
    );
  }

  // The pipe closes before the program's first write. This does not depend
  // on a shell pipeline's final command hiding the producer's status.
  for (const api of [
    "console.log",
    "process.stdout.write",
    "process.stderr.write",
  ] as const) {
    const closeError = api === "process.stderr.write";
    const pipeHost: CompilerHost = {
      ...host,
      async run(request) {
        if (!request.captureBytes) return await host.run(request);
        return await new Promise<ProcessObservation>((resolve, reject) => {
          const child = spawn(request.command, [...request.args], {
            cwd: request.cwd,
            env: request.environment?.variables,
            stdio: ["ignore", "pipe", "pipe"],
          });
          if (closeError) child.stderr.destroy();
          else child.stdout.destroy();
          const stderr: Uint8Array[] = [];
          child.stderr.on("data", (bytes: Uint8Array) => stderr.push(bytes));
          child.on("error", reject);
          child.on("close", (status) =>
            resolve({
              exitStatus: status ?? 1,
              stdout: "",
              stderr: Buffer.concat(stderr).toString("utf8"),
            }),
          );
        });
      },
    };
    const source = `for (let i = 0; i < 100000; i++) ${api}("line\\n");`;
    const reference = await processReferences(pipeHost, source);
    for (const observed of reference) {
      assert.equal(observed.exitStatus, api === "console.log" ? 0 : 1);
    }
    for (const result of await runProcessProgram(pipeHost, source)) {
      assert.equal(result.exitStatus, api === "console.log" ? 0 : 1);
      if (api === "process.stdout.write") {
        assert.match(result.stderr, /OSEO3001.*EPIPE/u);
      }
    }
  }
  // Exercise the real CLI, including its host composition: native descriptors
  // must own the user's pipe so console flushing and explicit writes differ.
  const cliDirectory = await host.makeTemporaryDirectory("oseo-process-cli-");
  try {
    const entry = `${cliDirectory}/entry.js`;
    for (const runtime of ["node", "deno"]) {
      const cliArgs = [
        ...(runtime === "deno" ? ["run", "-A"] : []),
        "packages/cli/src/main.ts",
        entry,
      ];
      const input = new Uint8Array([239, 187, 191, 0, 255, 226, 130]);
      await host.writeTextFile(
        entry,
        `
import { readFileSync } from "node:fs";
const bytes = readFileSync(0);
process.stdout.write(bytes);
process.stderr.write(bytes);`,
      );
      const echoed = await host.run({
        command: runtime,
        args: cliArgs,
        cwd: process.cwd(),
        input,
        captureBytes: true,
      });
      assert.equal(echoed.exitStatus, 0, echoed.stderr);
      assert.deepEqual(echoed.stdoutBytes, input);
      assert.deepEqual(echoed.stderrBytes, input);
      const programArgs = [
        "",
        "two words",
        "한국어",
        "--target",
        "--build-config",
        "--build-config=checked",
        "--emit-c",
        "--help",
        "--version",
        "build",
        "run",
        "--",
        "-x",
      ];
      await host.writeTextFile(
        entry,
        "console.log(JSON.stringify(process.argv.slice(2)));",
      );
      for (const prefix of [[], ["run"]]) {
        const observed = await host.run({
          command: runtime,
          args: [
            ...cliArgs.slice(0, -1),
            ...prefix,
            entry,
            "--",
            ...programArgs,
          ],
          cwd: process.cwd(),
          captureBytes: true,
        });
        assert.equal(observed.exitStatus, 0, observed.stderr);
        assert.equal(observed.stdout, JSON.stringify(programArgs) + "\n");
      }
      for (const api of [
        "console.log",
        "exit-flush",
        "process.stdout.write",
        "process.stderr.write",
      ]) {
        const source =
          api === "exit-flush"
            ? 'console.log("line"); process.exit();'
            : `${api}("line");`;
        await host.writeTextFile(entry, source);
        const status = await new Promise<number | null>((resolve, reject) => {
          const child = spawn(runtime, cliArgs, {
            cwd: process.cwd(),
            stdio: ["ignore", "pipe", "pipe"],
          });
          if (api === "process.stderr.write") {
            child.stderr.destroy();
            child.stdout.resume();
          } else {
            child.stdout.destroy();
            child.stderr.resume();
          }
          child.on("error", reject);
          child.on("close", resolve);
        });
        assert.equal(
          status,
          api.startsWith("process.") ? 1 : 0,
          `${runtime}: ${api}`,
        );
      }
    }
  } finally {
    await host.remove(cliDirectory);
  }

  if (process.platform === "linux") {
    const fullHost: CompilerHost = {
      ...host,
      async run(request) {
        if (!request.captureBytes) return await host.run(request);
        const fd = openSync("/dev/full", "w");
        try {
          return await new Promise<ProcessObservation>((resolve, reject) => {
            const child = spawn(request.command, [...request.args], {
              cwd: request.cwd,
              env: request.environment?.variables,
              stdio: ["ignore", fd, "pipe"],
            });
            const stderr: Uint8Array[] = [];
            child.stderr?.on("data", (bytes: Uint8Array) => stderr.push(bytes));
            child.on("error", reject);
            child.on("close", (status) =>
              resolve({
                exitStatus: status ?? 1,
                stdout: "",
                stderr: Buffer.concat(stderr).toString("utf8"),
              }),
            );
          });
        } finally {
          closeSync(fd);
        }
      },
    };
    for (const api of ["console.log", "process.stdout.write"]) {
      for (const result of await runProcessProgram(fullHost, `${api}("x");`)) {
        assert.equal(result.exitStatus, 1);
        assert.match(result.stderr, /OSEO3001.*stream.*failed/u);
      }
    }
  }
}
