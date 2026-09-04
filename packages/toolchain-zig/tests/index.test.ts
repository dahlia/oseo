import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { describeTarget } from "@oseo/compiler";

import { zigToolchain } from "../src/index.ts";

const mutableCompilerEnvironment = [
  "CC",
  "C_INCLUDE_PATH",
  "CPLUS_INCLUDE_PATH",
  "CPATH",
  "HOMEBREW_PREFIX",
  "LIBRARY_PATH",
  "NIX_CFLAGS_COMPILE",
  "NIX_CFLAGS_LINK",
  "NIX_LDFLAGS",
  "SDKROOT",
  "ZIG_BUILD_RUNNER",
  "ZIG_IS_DETECTING_LIBC_PATHS",
  "ZIG_IS_TRYING_TO_NOT_CALL_ITSELF",
  "ZIG_LIBC",
  "ZIG_LIB_DIR",
] as const;

async function buildSanitizedArchive(root: string): Promise<Uint8Array> {
  const runtimeDirectory = join(root, "runtime");
  const workingDirectory = join(root, "build");
  await Promise.all([mkdir(runtimeDirectory), mkdir(workingDirectory)]);
  const headerPath = join(runtimeDirectory, "runtime_internal.h");
  const sourcePath = join(runtimeDirectory, "runtime_core.c");
  await Promise.all([
    writeFile(
      headerPath,
      "static inline int oseo_divide(int left, int right) {\n" +
        "  return left / right;\n" +
        "}\n",
    ),
    writeFile(
      sourcePath,
      '#include "runtime_internal.h"\n' +
        "int oseo_runtime(int value) {\n" +
        "  return oseo_divide(value, value - value);\n" +
        "}\n",
    ),
  ]);
  const plan = zigToolchain.createBuildPlan({
    generatedSourcePath: join(root, "generated.c"),
    runtimeDirectory,
    runtimeSourcePaths: [sourcePath],
    target: describeTarget(
      process.platform === "darwin" ? "macos-aarch64" : "linux-x86_64-gnu",
    ),
    workingDirectory,
  });
  for (const request of plan.requests.slice(0, -1)) {
    const result = spawnSync(request.command, request.args, {
      cwd: request.cwd,
      encoding: "utf8",
      env: request.environment?.variables,
    });
    assert.equal(
      result.status,
      0,
      `${result.error?.message ?? ""}\n${result.stderr}`,
    );
  }
  assert.ok(plan.runtimeArchivePath != null);
  const archive = await readFile(plan.runtimeArchivePath);
  assert.ok(!archive.includes(Buffer.from(runtimeDirectory)));
  return archive;
}

test("excludes mutable compiler inputs from the Zig environment", () => {
  const environment = zigToolchain.environment;
  assert.ok(environment != null);
  for (const name of mutableCompilerEnvironment) {
    assert.ok(!environment.inherit.includes(name));
  }
});

test("rejects compiler environment outside the Zig policy", async () => {
  const environment = {
    variables: {
      C_INCLUDE_PATH: "/tmp/mutable-headers",
      PATH: "/opt/zig/bin",
    },
  } as const;
  assert.throws(
    () =>
      zigToolchain.createBuildPlan({
        environment,
        generatedSourcePath: "/tmp/generated.c",
        runtimeDirectory: "/tmp/runtime",
        runtimeSourcePaths: ["/tmp/runtime/runtime.c"],
        target: describeTarget("linux-x86_64-gnu"),
        workingDirectory: "/tmp/build",
      }),
    /not admitted by the Zig environment policy/u,
  );
  const reuse = zigToolchain.runtimeArchiveReuse;
  assert.ok(reuse != null);
  await assert.rejects(
    async () =>
      await reuse.createKey({
        runtimeAbiVersion: "m5",
        runtimeAssets: [
          {
            contents: "int oseo_runtime(void) { return 1; }\n",
            kind: "source",
            name: "runtime.c",
          },
        ],
        target: describeTarget("linux-x86_64-gnu"),
        toolchainEnvironment: environment,
        toolchainIdentity: "zig_exe=/opt/zig/bin/zig",
      }),
    /not admitted by the Zig environment policy/u,
  );
});

for (const [target, zigTarget] of [
  ["linux-x86_64-gnu", "x86_64-linux-gnu"],
  ["macos-aarch64", "aarch64-macos"],
  ["linux-aarch64-musl", "aarch64-linux-musl"],
] as const) {
  test(`maps deterministic ${target} compiler requests`, () => {
    const plan = zigToolchain.createBuildPlan({
      generatedSourcePath: "/tmp/generated.c",
      runtimeDirectory: "/tmp/runtime",
      runtimeSourcePaths: ["/tmp/runtime/runtime.c"],
      target: describeTarget(target),
      workingDirectory: "/tmp/build",
    });
    assert.ok(
      plan.requests.every((request) =>
        request.command === "zig" && request.args[0] === "ar"
          ? true
          : request.args.includes(zigTarget),
      ),
    );
    assert.match(plan.executablePath, new RegExp(target, "u"));
    const sanitizer = plan.target.sanitizers.join(",");
    const compilerRequests = plan.requests.filter(
      (request) => request.args[0] === "cc",
    );
    const requiredFlags = ["-Wall", "-Wextra", "-Werror", "-pedantic"];
    assert.ok(
      compilerRequests.every((request) =>
        requiredFlags.every((flag) => request.args.includes(flag)),
      ),
    );
    const runtimeCompileRequests = compilerRequests.filter((request) =>
      request.args.includes("-c"),
    );
    assert.ok(
      runtimeCompileRequests.every((request) => request.args.includes("-O2")),
    );
    assert.ok(
      compilerRequests
        .filter((request) => !request.args.includes("-c"))
        .every((request) => !request.args.includes("-O2")),
    );
    if (sanitizer === "") {
      assert.ok(
        compilerRequests.every((request) =>
          request.args.every((arg) => !arg.startsWith("-fsanitize=")),
        ),
      );
    } else {
      assert.ok(
        compilerRequests.every((request) =>
          request.args.includes(`-fsanitize=${sanitizer}`),
        ),
      );
    }
  });
}

test("compiles and archives multiple runtime sources in input order", () => {
  const environment = {
    variables: {
      HOME: "/home/compiler",
      PATH: "/opt/zig/bin",
    },
  } as const;
  const plan = zigToolchain.createBuildPlan({
    environment,
    generatedSourcePath: "/tmp/generated.c",
    runtimeDirectory: "/tmp/runtime",
    runtimeSourcePaths: [
      "/tmp/runtime/runtime_core.c",
      "/tmp/runtime/runtime_memory.c",
    ],
    target: describeTarget("linux-x86_64-gnu"),
    workingDirectory: "/tmp/build",
  });
  const compileRequests = plan.requests.filter(
    (request) => request.args[0] === "cc" && request.args.includes("-c"),
  );
  assert.ok(
    compileRequests.every((request) =>
      request.args.includes("-fdebug-compilation-dir=/oseo/runtime"),
    ),
  );
  assert.ok(
    compileRequests.every(
      (request) => request.cwd === "/tmp/runtime" && request.args.includes("."),
    ),
  );
  assert.ok(
    compileRequests.every((request) => request.environment === environment),
  );
  assert.deepEqual(
    compileRequests.map((request) => request.args.at(-3)),
    ["runtime_core.c", "runtime_memory.c"],
  );
  assert.deepEqual(
    compileRequests.map((request) => request.args.at(-1)),
    [
      "/tmp/build/runtime_core-0-linux-x86_64-gnu.o",
      "/tmp/build/runtime_memory-1-linux-x86_64-gnu.o",
    ],
  );
  const archive = plan.requests.find((request) => request.args[0] === "ar");
  assert.ok(archive != null);
  assert.deepEqual(archive.args, [
    "ar",
    "rcs",
    "/tmp/build/liboseo_runtime-linux-x86_64-gnu.a",
    "/tmp/build/runtime_core-0-linux-x86_64-gnu.o",
    "/tmp/build/runtime_memory-1-linux-x86_64-gnu.o",
  ]);
  const archiveIndex = plan.requests.indexOf(archive);
  assert.ok(
    compileRequests.every(
      (request) => plan.requests.indexOf(request) < archiveIndex,
    ),
  );
  const link = plan.requests.at(-1);
  assert.ok(link != null);
  assert.ok(
    link.args.includes("/tmp/build/liboseo_runtime-linux-x86_64-gnu.a"),
  );
  assert.ok(link.args.every((arg) => !arg.startsWith("-ffile-prefix-map=")));
});

test("normalizes runtime paths before deriving source arguments", () => {
  const plan = zigToolchain.createBuildPlan({
    generatedSourcePath: "generated.c",
    runtimeDirectory: "./runtime/../runtime",
    runtimeSourcePaths: ["runtime/nested/../runtime_core.c"],
    target: describeTarget("linux-x86_64-gnu"),
    workingDirectory: "build",
  });
  const compile = plan.requests.find(
    (request) => request.args[0] === "cc" && request.args.includes("-c"),
  );
  assert.ok(compile != null);
  assert.equal(compile.args.at(-3), "runtime_core.c");
});

test("preserves explicit POSIX paths on Windows hosts", () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(
    process,
    "platform",
  );
  assert.ok(platformDescriptor != null);
  Object.defineProperty(process, "platform", {
    configurable: true,
    enumerable: platformDescriptor.enumerable ?? false,
    value: "win32",
  });
  try {
    const plan = zigToolchain.createBuildPlan({
      generatedSourcePath: "/tmp/generated.c",
      runtimeDirectory: "/tmp/runtime",
      runtimeSourcePaths: ["/tmp/runtime/runtime_core.c"],
      target: describeTarget("linux-x86_64-gnu"),
      workingDirectory: "/tmp/build",
    });
    const compile = plan.requests.find(
      (request) => request.args[0] === "cc" && request.args.includes("-c"),
    );
    assert.ok(compile != null);
    assert.equal(
      compile.args.at(-1),
      "/tmp/build/runtime_core-0-linux-x86_64-gnu.o",
    );
    assert.equal(plan.executablePath, "/tmp/build/fixture-linux-x86_64-gnu");
  } finally {
    Object.defineProperty(process, "platform", platformDescriptor);
  }
});

test("derives Windows runtime paths without embedding the source root", () => {
  const runtimeDirectory = String.raw`C:\oseo\runtime`;
  const plan = zigToolchain.createBuildPlan({
    generatedSourcePath: String.raw`C:\oseo\generated.c`,
    runtimeDirectory,
    runtimeSourcePaths: [String.raw`C:\oseo\runtime\nested\..\runtime_core.c`],
    target: describeTarget("linux-x86_64-gnu"),
    workingDirectory: String.raw`C:\oseo\build`,
  });
  const compile = plan.requests.find(
    (request) => request.args[0] === "cc" && request.args.includes("-c"),
  );
  assert.ok(compile != null);
  assert.equal(compile.args.at(-3), "runtime_core.c");
  assert.ok(
    !compile.args.some((argument) => argument.includes(runtimeDirectory)),
  );
  assert.equal(
    compile.args.at(-1),
    String.raw`C:\oseo\build\runtime_core-0-linux-x86_64-gnu.o`,
  );
});

test("derives relative Windows runtime paths on Windows hosts", () => {
  if (process.platform !== "win32") return;
  const plan = zigToolchain.createBuildPlan({
    generatedSourcePath: String.raw`generated.c`,
    runtimeDirectory: String.raw`runtime`,
    runtimeSourcePaths: [String.raw`runtime\nested\..\runtime_core.c`],
    target: describeTarget("linux-x86_64-gnu"),
    workingDirectory: String.raw`build`,
  });
  const compile = plan.requests.find(
    (request) => request.args[0] === "cc" && request.args.includes("-c"),
  );
  assert.ok(compile != null);
  assert.equal(compile.args.at(-3), "runtime_core.c");
  assert.equal(
    compile.args.at(-1),
    String.raw`build\runtime_core-0-linux-x86_64-gnu.o`,
  );
});

test("produces path-stable sanitized runtime archives", async () => {
  const firstRoot = await mkdtemp(join(tmpdir(), "oseo-runtime-first-"));
  const secondRoot = await mkdtemp(join(tmpdir(), "oseo-runtime-second-"));
  try {
    assert.deepEqual(
      await buildSanitizedArchive(firstRoot),
      await buildSanitizedArchive(secondRoot),
    );
  } finally {
    await Promise.all([
      rm(firstRoot, { force: true, recursive: true }),
      rm(secondRoot, { force: true, recursive: true }),
    ]);
  }
});

test("rejects a build plan without runtime sources", () => {
  assert.throws(
    () =>
      zigToolchain.createBuildPlan({
        generatedSourcePath: "/tmp/generated.c",
        runtimeDirectory: "/tmp/runtime",
        runtimeSourcePaths: [],
        target: describeTarget("linux-x86_64-gnu"),
        workingDirectory: "/tmp/build",
      }),
    /at least one runtime source/u,
  );
});

test("keeps object names distinct for same-named sources", () => {
  const plan = zigToolchain.createBuildPlan({
    generatedSourcePath: "/tmp/generated.c",
    runtimeDirectory: "/tmp/runtime",
    runtimeSourcePaths: ["/tmp/runtime/runtime.c", "/tmp/other/runtime.c"],
    target: describeTarget("linux-x86_64-gnu"),
    workingDirectory: "/tmp/build",
  });
  const compileRequests = plan.requests.filter(
    (request) => request.args[0] === "cc" && request.args.includes("-c"),
  );
  assert.deepEqual(
    compileRequests.map((request) => request.args.at(-1)),
    [
      "/tmp/build/runtime-0-linux-x86_64-gnu.o",
      "/tmp/build/runtime-1-linux-x86_64-gnu.o",
    ],
  );
});

test("links a prebuilt runtime archive without rebuilding it", () => {
  const plan = zigToolchain.createBuildPlan({
    generatedSourcePath: "/tmp/generated.c",
    prebuiltRuntimeArchivePath: "/cache/runtime.a",
    runtimeDirectory: "/tmp/runtime",
    runtimeSourcePaths: [],
    target: describeTarget("linux-x86_64-gnu"),
    workingDirectory: "/tmp/build",
  });
  assert.equal(plan.runtimeArchivePath, undefined);
  assert.equal(plan.requests.length, 1);
  assert.deepEqual(plan.requests[0]?.args.slice(-4), [
    "/tmp/generated.c",
    "/cache/runtime.a",
    "-o",
    "/tmp/build/fixture-linux-x86_64-gnu",
  ]);
});

test("rejects sources beside a prebuilt runtime archive", () => {
  assert.throws(
    () =>
      zigToolchain.createBuildPlan({
        generatedSourcePath: "/tmp/generated.c",
        prebuiltRuntimeArchivePath: "/cache/runtime.a",
        runtimeDirectory: "/tmp/runtime",
        runtimeSourcePaths: ["/tmp/runtime/runtime.c"],
        target: describeTarget("linux-x86_64-gnu"),
        workingDirectory: "/tmp/build",
      }),
    /cannot be combined/u,
  );
});

test("changes the archive key when a runtime source changes", async () => {
  const reuse = zigToolchain.runtimeArchiveReuse;
  assert.ok(reuse != null);
  const input = {
    runtimeAbiVersion: "m5",
    runtimeAssets: [
      {
        contents: "#define OSEO_ABI 5\n",
        kind: "header",
        name: "oseo_runtime.h",
      },
      {
        contents: "int oseo_runtime(void) { return 1; }\n",
        kind: "source",
        name: "runtime.c",
      },
    ],
    target: describeTarget("linux-x86_64-gnu"),
    toolchainEnvironment: {
      variables: { HOME: "/home/compiler", PATH: "/opt/zig/bin" },
    },
    toolchainIdentity: "zig_exe=/opt/zig-0.16.0/zig\nZIG_LIBC=null",
  } as const;
  const original = await reuse.createKey(input);
  const changed = await reuse.createKey({
    ...input,
    runtimeAssets: [
      input.runtimeAssets[0],
      {
        ...input.runtimeAssets[1],
        contents: "int oseo_runtime(void) { return 2; }\n",
      },
    ],
  });
  assert.match(original, /^[0-9a-f]{64}$/u);
  assert.notEqual(changed, original);
  assert.equal(await reuse.createKey(input), original);
});

test("covers archive inputs and toolchain identity", async () => {
  const reuse = zigToolchain.runtimeArchiveReuse;
  assert.ok(reuse != null);
  const environment = {
    variables: { HOME: "/home/compiler", PATH: "/opt/zig/bin" },
  } as const;
  assert.deepEqual(reuse.createIdentityRequest("/tmp/build", environment), {
    args: ["env"],
    command: "zig",
    cwd: "/tmp/build",
    environment,
  });
  const input = {
    runtimeAbiVersion: "m5",
    runtimeAssets: [
      {
        contents: "#define OSEO_ABI 5\n",
        kind: "header",
        name: "oseo_runtime.h",
      },
      {
        contents: "int oseo_runtime(void) { return 1; }\n",
        kind: "source",
        name: "runtime.c",
      },
    ],
    target: describeTarget("linux-x86_64-gnu"),
    toolchainEnvironment: {
      variables: { HOME: "/home/compiler", PATH: "/opt/zig/bin" },
    },
    toolchainIdentity: "zig_exe=/opt/zig-0.16.0/zig\nZIG_LIBC=null",
  } as const;
  const original = await reuse.createKey(input);
  assert.equal(
    await reuse.createKey({
      ...input,
      toolchainEnvironment: {
        variables: {
          PATH: input.toolchainEnvironment.variables.PATH,
          HOME: input.toolchainEnvironment.variables.HOME,
        },
      },
    }),
    original,
  );
  const changedKeys = await Promise.all([
    reuse.createKey({ ...input, runtimeAbiVersion: "m6" }),
    reuse.createKey({
      ...input,
      runtimeAssets: [
        { ...input.runtimeAssets[0], contents: "#define OSEO_ABI 6\n" },
        input.runtimeAssets[1],
      ],
    }),
    reuse.createKey({
      ...input,
      target: describeTarget("linux-aarch64-musl"),
    }),
    reuse.createKey({
      ...input,
      toolchainIdentity: "zig_exe=/other/zig-0.16.0/zig\nZIG_LIBC=null",
    }),
    reuse.createKey({
      ...input,
      toolchainIdentity:
        "zig_exe=/opt/zig-0.16.0/zig\nZIG_LIBC=/target/libc.txt",
    }),
    reuse.createKey({
      ...input,
      toolchainEnvironment: {
        variables: {
          HOME: "/home/compiler",
          PATH: "/other/zig/bin",
        },
      },
    }),
  ]);
  assert.equal(new Set([original, ...changedKeys]).size, 7);
});
