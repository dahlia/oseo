import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createNodeHost,
  normalizeExecutionHost,
} from "../packages/host/src/index.ts";
import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { runNativeCli } from "./native-cli.ts";
import { hostCcLane, nativeBuildConfiguration } from "./native-toolchain.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  normalizeExecutionHost(process.platform, process.arch),
);
for (const buildConfiguration of ["checked", "optimized"] as const) {
  if (hostCcLane && buildConfiguration === "optimized") continue;

  test(
    `retained executable replacement (${buildConfiguration})`,
    { skip: nativeTarget == null ? "requires a supported native host" : false },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "oseo-retained-"));
      const source = join(directory, "entry.ts");
      const output = join(directory, "program");
      try {
        await writeFile(source, 'console.log("first");');
        const first = await runNativeCli(
          {
            args: [
              "build",
              source,
              "-o",
              output,
              "--build-config",
              buildConfiguration,
            ],
            version: "0.0.0",
          },
          host,
        );
        assert.deepEqual(first, { exitStatus: 0, stderr: "", stdout: "" });
        assert.equal(
          spawnSync(output, [], { encoding: "utf8" }).stdout,
          "first\n",
        );
        await writeFile(source, 'console.log("replacement");');
        const second = await runNativeCli(
          {
            args: [
              "build",
              source,
              "-o",
              output,
              `--build-config=${buildConfiguration}`,
            ],
            version: "0.0.0",
          },
          host,
        );
        assert.deepEqual(second, { exitStatus: 0, stderr: "", stdout: "" });
        const execution = spawnSync(output, [], { encoding: "utf8" });
        assert.equal(execution.status, 0, execution.stderr);
        assert.equal(execution.stdout, "replacement\n");
        const before = await readFile(output);
        await writeFile(source, "Function(1);");
        const failed = await runNativeCli(
          {
            args: [
              "build",
              source,
              "-o",
              output,
              "--build-config",
              buildConfiguration,
            ],
            version: "0.0.0",
          },
          host,
        );
        assert.equal(failed.exitStatus, 1);
        assert.deepEqual(await readFile(output), before);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}

for (const buildConfiguration of ["checked", "optimized"] as const) {
  test(
    `retained Linux AArch64 cross-link (${buildConfiguration})`,
    {
      // The host sanitizer compiler does not cross-link.
      skip:
        nativeTarget == null || hostCcLane
          ? "requires a supported native host"
          : false,
    },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "oseo-cross-retained-"));
      const source = join(directory, "entry.ts");
      const output = join(directory, "program-linux-aarch64-musl");
      try {
        await writeFile(source, "console.log(42);");
        const built = await runNativeCli(
          {
            args: [
              "build",
              source,
              "--target",
              "linux-aarch64-musl",
              "-o",
              output,
              "--build-config",
              buildConfiguration,
            ],
            version: "0.0.0",
          },
          host,
        );
        assert.deepEqual(built, { exitStatus: 0, stderr: "", stdout: "" });
        const bytes = await readFile(output);
        assert.equal(bytes.subarray(0, 4).toString("hex"), "7f454c46");
        assert.equal(bytes.readUInt16LE(18), 183);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}

test(
  "real CLI command defaults and overrides retain executable output",
  {
    skip:
      nativeTarget == null || hostCcLane
        ? "requires a supported native host"
        : false,
  },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "oseo-cli-config-"));
    const source = join(directory, "entry.ts");
    const output = join(directory, "program");
    try {
      await writeFile(source, "console.log(42);");
      const invocations = [
        [source],
        ["run", source],
        [source, "--build-config", "optimized"],
        ["run", source, "--build-config", "optimized"],
        ["build", source, "-o", output],
        ["build", source, "-o", output, "--build-config", "checked"],
      ];
      for (const launcher of [
        [process.execPath, "packages/cli/dist/main.js"],
        ["deno", "run", "-A", "packages/cli/src/main.ts"],
      ]) {
        for (const args of invocations) {
          const result = spawnSync(
            launcher[0]!,
            [...launcher.slice(1), ...args],
            {
              encoding: "utf8",
            },
          );
          assert.equal(result.status, 0, result.stderr);
          assert.equal(result.stderr, "");
          assert.equal(result.stdout, args[0] === "build" ? "" : "42\n");
          if (args[0] === "build") {
            const execution = spawnSync(output, [], { encoding: "utf8" });
            assert.equal(execution.status, 0, execution.stderr);
            assert.equal(execution.stdout, "42\n");
          }
        }
        for (const option of [
          ["--build-config", "optimized"],
          ["--target", "linux-aarch64-musl"],
          ["--output", output],
          ["--no-runtime-archive-reuse"],
        ]) {
          // eslint-disable-next-line no-await-in-loop -- Shared output.
          const before = await readFile(output);
          const result = spawnSync(
            launcher[0]!,
            [...launcher.slice(1), "build", source, "--emit-c", ...option],
            { encoding: "utf8" },
          );
          assert.equal(result.status, 1);
          assert.match(result.stderr, /OSEO3001/u);
          // eslint-disable-next-line no-await-in-loop -- Shared output.
          assert.deepEqual(await readFile(output), before);
        }
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "selected test configuration supports command spellings",
  {
    skip:
      nativeTarget == null || hostCcLane
        ? "requires a supported native host"
        : false,
  },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "oseo-test-config-"));
    const source = join(directory, "entry.ts");
    const output = join(directory, "program");
    try {
      await writeFile(source, "console.log(42);");
      for (const args of [
        [source],
        ["run", source],
        ["build", source, "-o", output],
      ]) {
        const commands: string[][] = [];
        // eslint-disable-next-line no-await-in-loop -- Separate observations.
        const result = await runNativeCli(
          { args, version: "0.0.0" },
          {
            ...host,
            async run(request: Parameters<typeof host.run>[0]) {
              commands.push([...request.args]);
              return await host.run(request);
            },
          },
        );
        assert.equal(result.exitStatus, 0, result.stderr);
        const configuration = nativeBuildConfiguration;
        const compiles = commands.filter((compilerArgs) =>
          compilerArgs.includes("-std=c11"),
        );
        assert.ok(compiles.length > 0);
        assert.ok(
          compiles.every(
            (compilerArgs) =>
              compilerArgs.includes("-fno-sanitize=all") ===
              (configuration === "optimized"),
          ),
        );
        assert.equal(result.stdout, args[0] === "build" ? "" : "42\n");
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
