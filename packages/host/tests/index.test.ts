import assert from "node:assert/strict";
import test from "node:test";

import type {
  CompilerCacheLock,
  CompilerHost,
  ProcessRequest,
} from "@oseo/compiler";

import {
  createDenoHost,
  createFileModuleLoader,
  createNodeHost,
  fileModuleResolver,
  normalizeExecutionHost,
} from "../src/index.ts";

interface MinimalDenoRuntime {
  Command?: unknown;
  cwd?(): string;
  env?: {
    delete(name: string): void;
    get(name: string): string | undefined;
    set(name: string, value: string): void;
  };
  execPath?(): string;
  makeTempDir?(): Promise<string>;
  makeTempFile?(): Promise<string>;
  mkdir?(path: string, options: { readonly recursive: boolean }): Promise<void>;
  readDir?(path: string): AsyncIterable<{
    readonly isFile: boolean;
    readonly name: string;
  }>;
  readTextFile(path: string | URL): Promise<string>;
  remove?(
    path: string,
    options?: { readonly recursive: boolean },
  ): Promise<void>;
  writeTextFile?(path: string, contents: string): Promise<void>;
}

test("normalizes execution hosts without choosing a target", () => {
  assert.deepEqual(normalizeExecutionHost("linux", "x64"), {
    architecture: "x86_64",
    operatingSystem: "linux",
  });
  assert.deepEqual(normalizeExecutionHost("linux", "amd64"), {
    architecture: "x86_64",
    operatingSystem: "linux",
  });
  assert.deepEqual(normalizeExecutionHost("darwin", "arm64"), {
    architecture: "aarch64",
    operatingSystem: "macos",
  });
  assert.deepEqual(normalizeExecutionHost("windows", "riscv64"), {
    architecture: "unknown",
    operatingSystem: "unknown",
  });
  assert.deepEqual(
    createNodeHost().executionHost,
    normalizeExecutionHost(process.platform, process.arch),
  );
});

test("runs a process with one captured environment snapshot", async () => {
  const previousCPath = process.env.CPATH;
  process.env.CPATH = "/tmp/shadow-headers";
  try {
    const host = createNodeHost();
    const environment = await host.captureEnvironment?.({
      inherit: ["PATH", "CPATH"],
    });
    assert.ok(environment != null);
    process.env.CPATH = "/tmp/changed-headers";
    const observation = await host.run({
      args: [
        "-e",
        "console.log(JSON.stringify({" +
          "cpath: process.env.CPATH ?? null," +
          "path: process.env.PATH != null}))",
      ],
      command: process.execPath,
      cwd: process.cwd(),
      environment,
    } as ProcessRequest);
    assert.equal(observation.exitStatus, 0, observation.stderr);
    assert.deepEqual(JSON.parse(observation.stdout), {
      cpath: "/tmp/shadow-headers",
      path: true,
    });
  } finally {
    if (previousCPath == null) delete process.env.CPATH;
    else process.env.CPATH = previousCPath;
  }
});

test("preserves Deno execution without environment access", async () => {
  const runtime = (
    globalThis as typeof globalThis & {
      readonly Deno?: MinimalDenoRuntime;
    }
  ).Deno;
  if (runtime?.Command == null || runtime.execPath == null) return;
  const fixturePath = new URL(
    "fixtures/restricted-environment.ts",
    import.meta.url,
  );
  const command = new (runtime.Command as unknown as new (
    command: string,
    options: {
      readonly args: readonly string[];
      readonly stderr: "piped";
      readonly stdout: "piped";
    },
  ) => {
    output(): Promise<{
      readonly code: number;
      readonly stderr: Uint8Array;
      readonly stdout: Uint8Array;
    }>;
  })(runtime.execPath(), {
    args: [
      "run",
      "--allow-read",
      "--allow-run",
      "--allow-write",
      fixturePath.href,
    ],
    stderr: "piped",
    stdout: "piped",
  });
  const output = await command.output();
  assert.equal(output.code, 0, new TextDecoder().decode(output.stderr));
  assert.equal(new TextDecoder().decode(output.stdout).trim(), "restricted-ok");
});

test("runs a Deno process with only its requested environment", async () => {
  const runtime = (
    globalThis as typeof globalThis & {
      readonly Deno?: MinimalDenoRuntime;
    }
  ).Deno;
  if (
    runtime?.Command == null ||
    runtime.env == null ||
    runtime.execPath == null
  ) {
    return;
  }
  const previousCPath = runtime.env.get("CPATH");
  runtime.env.set("CPATH", "/tmp/shadow-headers");
  try {
    const observation = await createDenoHost().run({
      args: [
        "eval",
        "console.log(JSON.stringify({" +
          "cpath: Deno.env.get('CPATH') ?? null," +
          "path: Deno.env.get('PATH') != null}))",
      ],
      command: runtime.execPath(),
      cwd: runtime.cwd?.() ?? "/",
      environment: {
        variables: {
          PATH: runtime.env.get("PATH") ?? "",
        },
      },
    });
    assert.equal(observation.exitStatus, 0, observation.stderr);
    assert.deepEqual(JSON.parse(observation.stdout), {
      cpath: null,
      path: true,
    });
  } finally {
    if (previousCPath == null) runtime.env.delete("CPATH");
    else runtime.env.set("CPATH", previousCPath);
  }
});

test("rejects parent-directory compiler cache names", async () => {
  const [{ mkdtemp, rm }, { tmpdir }, { join }] = await Promise.all([
    import("node:fs/promises"),
    import("node:os"),
    import("node:path"),
  ]);
  const directory = await mkdtemp(join(tmpdir(), "oseo-cache-name-"));
  const previousRoot = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = directory;
  try {
    const hosts = [
      createNodeHost(),
      ...("Deno" in globalThis ? [createDenoHost()] : []),
    ];
    await Promise.all(
      hosts.flatMap((host) => {
        const cache = host.cache;
        assert.ok(cache != null);
        return [".", ".."].map(
          async (name) =>
            await assert.rejects(
              async () => await cache.getDirectory(name),
              /Invalid compiler cache name/u,
            ),
        );
      }),
    );
  } finally {
    if (previousRoot == null) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = previousRoot;
    await rm(directory, { force: true, recursive: true });
  }
});

test("resolves relative compiler cache roots to absolute paths", async () => {
  if (process.platform === "darwin") return;
  const [{ mkdtemp, rm }, { tmpdir }, { isAbsolute, join, relative }] =
    await Promise.all([
      import("node:fs/promises"),
      import("node:os"),
      import("node:path"),
    ]);
  const directory = await mkdtemp(join(tmpdir(), "oseo-relative-cache-"));
  const previousRoot = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = relative(process.cwd(), directory);
  try {
    const hosts = [
      createNodeHost(),
      ...("Deno" in globalThis ? [createDenoHost()] : []),
    ];
    const cacheDirectories = await Promise.all(
      hosts.map(async (host) => {
        const cache = host.cache;
        assert.ok(cache != null);
        return await cache.getDirectory("runtime-archives");
      }),
    );
    for (const cacheDirectory of cacheDirectories) {
      assert.ok(isAbsolute(cacheDirectory));
      assert.equal(cacheDirectory, join(directory, "oseo", "runtime-archives"));
    }
  } finally {
    if (previousRoot == null) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = previousRoot;
    await rm(directory, { force: true, recursive: true });
  }
});

test("serializes cache leases for the same artifact path", async () => {
  const [{ mkdtemp, rm }, { tmpdir }, { join }] = await Promise.all([
    import("node:fs/promises"),
    import("node:os"),
    import("node:path"),
  ]);
  const directory = await mkdtemp(join(tmpdir(), "oseo-cache-lock-"));
  try {
    const firstCache = createNodeHost().cache;
    const secondCache = createNodeHost().cache;
    assert.ok(firstCache != null);
    assert.ok(secondCache != null);
    const candidate = join(directory, "runtime.a");
    const first = await firstCache.acquireFileLock(candidate);
    let secondAcquired = false;
    const pendingSecond = secondCache
      .acquireFileLock(candidate)
      .then((lock) => {
        secondAcquired = true;
        return lock;
      });
    await new Promise((resolve) => setTimeout(resolve, 75));
    assert.equal(secondAcquired, false);
    await first.release();
    const second = await pendingSecond;
    assert.equal(secondAcquired, true);
    await second.release();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("reclaims an expired cache lease", async () => {
  const [{ mkdir, mkdtemp, readdir, rm, writeFile }, { tmpdir }, { join }] =
    await Promise.all([
      import("node:fs/promises"),
      import("node:os"),
      import("node:path"),
    ]);
  const directory = await mkdtemp(join(tmpdir(), "oseo-stale-lock-"));
  try {
    const cache = createNodeHost().cache;
    assert.ok(cache != null);
    const candidate = join(directory, "runtime.a");
    const lockPath = `${candidate}.lock`;
    await mkdir(lockPath);
    const ownerName = "owner-abandoned-owner.json";
    await writeFile(
      join(lockPath, ownerName),
      JSON.stringify({
        expiresAtMilliseconds: 0,
        token: "abandoned-owner",
      }),
    );
    const startedAt = Date.now();
    const recovered = await cache.acquireFileLock(candidate);
    assert.ok(Date.now() - startedAt < 1_000);
    const ownerNames = (await readdir(lockPath)).filter((name) =>
      name.startsWith("owner-"),
    );
    assert.equal(ownerNames.length, 1);
    assert.match(ownerNames[0] ?? "", /^owner-.+\.json$/u);
    await recovered.release();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("renews an active cache lease", async () => {
  const [{ mkdtemp, readdir, readFile, rm }, { tmpdir }, { join }] =
    await Promise.all([
      import("node:fs/promises"),
      import("node:os"),
      import("node:path"),
    ]);
  const directory = await mkdtemp(join(tmpdir(), "oseo-renewed-lock-"));
  try {
    const cache = createNodeHost().cache;
    assert.ok(cache != null);
    const candidate = join(directory, "runtime.a");
    const lockPath = `${candidate}.lock`;
    const lock = await cache.acquireFileLock(candidate);
    const ownerName = (await readdir(lockPath)).find((name) =>
      name.startsWith("owner-"),
    );
    assert.ok(ownerName != null);
    const ownerPath = join(lockPath, ownerName);
    const before = JSON.parse(await readFile(ownerPath, "utf8")) as {
      readonly expiresAtMilliseconds: number;
    };
    let after = before.expiresAtMilliseconds;
    const deadline = Date.now() + 3_000;
    /* eslint-disable no-await-in-loop -- Renewal polling is ordered. */
    while (after <= before.expiresAtMilliseconds && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      try {
        const currentName = (await readdir(lockPath)).find(
          (name) => name.startsWith("owner-") || name.startsWith("renew-"),
        );
        if (currentName == null) continue;
        const current = JSON.parse(
          await readFile(join(lockPath, currentName), "utf8"),
        ) as {
          readonly expiresAtMilliseconds: number;
        };
        after = current.expiresAtMilliseconds;
      } catch {
        // Renewal may rename the state between the directory and file reads.
      }
    }
    /* eslint-enable no-await-in-loop */
    assert.ok(after > before.expiresAtMilliseconds);
    await lock.release();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("serializes concurrent reclamation of one expired lease", async () => {
  const [{ mkdir, mkdtemp, rm, writeFile }, { tmpdir }, { join }] =
    await Promise.all([
      import("node:fs/promises"),
      import("node:os"),
      import("node:path"),
    ]);
  const directory = await mkdtemp(join(tmpdir(), "oseo-reclaim-race-"));
  try {
    const candidate = join(directory, "runtime.a");
    const lockPath = `${candidate}.lock`;
    await mkdir(lockPath);
    await writeFile(
      join(lockPath, "owner-abandoned-owner.json"),
      JSON.stringify({
        expiresAtMilliseconds: 0,
        token: "abandoned-owner",
      }),
    );
    const acquired: CompilerCacheLock[] = [];
    const pending = Array.from({ length: 16 }, async () => {
      const cache = createNodeHost().cache;
      assert.ok(cache != null);
      const lock = await cache.acquireFileLock(candidate);
      acquired.push(lock);
    });
    /* eslint-disable no-await-in-loop -- Releases follow acquisition order. */
    while (acquired.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(acquired.length, 1);
    for (let index = 0; index < pending.length; index += 1) {
      while (acquired.length === index) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await acquired[index]?.release();
    }
    /* eslint-enable no-await-in-loop */
    await Promise.all(pending);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("an expired owner cannot release its replacement", async () => {
  const [{ mkdtemp, readdir, readFile, rm, writeFile }, { tmpdir }, { join }] =
    await Promise.all([
      import("node:fs/promises"),
      import("node:os"),
      import("node:path"),
    ]);
  const directory = await mkdtemp(join(tmpdir(), "oseo-replaced-lock-"));
  try {
    const firstCache = createNodeHost().cache;
    const secondCache = createNodeHost().cache;
    const thirdCache = createNodeHost().cache;
    assert.ok(firstCache != null);
    assert.ok(secondCache != null);
    assert.ok(thirdCache != null);
    const candidate = join(directory, "runtime.a");
    const lockPath = `${candidate}.lock`;
    const first = await firstCache.acquireFileLock(candidate);
    const ownerName = (await readdir(lockPath)).find((name) =>
      name.startsWith("owner-"),
    );
    assert.ok(ownerName != null);
    const ownerPath = join(lockPath, ownerName);
    const owner = JSON.parse(await readFile(ownerPath, "utf8")) as {
      readonly token: string;
    };
    await writeFile(
      ownerPath,
      JSON.stringify({ expiresAtMilliseconds: 0, token: owner.token }),
    );
    const second = await secondCache.acquireFileLock(candidate);
    await first.release();
    let thirdAcquired = false;
    const pendingThird = thirdCache.acquireFileLock(candidate).then((lock) => {
      thirdAcquired = true;
      return lock;
    });
    await new Promise((resolve) => setTimeout(resolve, 75));
    assert.equal(thirdAcquired, false);
    await second.release();
    const third = await pendingThird;
    await third.release();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("reclaims an expired Deno cache lease", async () => {
  const runtime = (
    globalThis as typeof globalThis & {
      readonly Deno?: MinimalDenoRuntime;
    }
  ).Deno;
  if (
    runtime?.makeTempDir == null ||
    runtime.mkdir == null ||
    runtime.remove == null ||
    runtime.writeTextFile == null
  ) {
    return;
  }
  const directory = await runtime.makeTempDir();
  try {
    const cache = createDenoHost().cache;
    assert.ok(cache != null);
    const candidate = `${directory}/runtime.a`;
    const lockPath = `${candidate}.lock`;
    await runtime.mkdir(lockPath, { recursive: false });
    const ownerName = "owner-abandoned-owner.json";
    await runtime.writeTextFile(
      `${lockPath}/${ownerName}`,
      JSON.stringify({
        expiresAtMilliseconds: 0,
        token: "abandoned-owner",
      }),
    );
    const startedAt = Date.now();
    const recovered = await cache.acquireFileLock(candidate);
    assert.ok(Date.now() - startedAt < 1_000);
    await recovered.release();
  } finally {
    await runtime.remove(directory, { recursive: true });
  }
});

test("serializes concurrent Deno lease reclamation", async () => {
  const runtime = (
    globalThis as typeof globalThis & {
      readonly Deno?: MinimalDenoRuntime;
    }
  ).Deno;
  if (
    runtime?.makeTempDir == null ||
    runtime.mkdir == null ||
    runtime.remove == null ||
    runtime.writeTextFile == null
  ) {
    return;
  }
  const directory = await runtime.makeTempDir();
  try {
    const candidate = `${directory}/runtime.a`;
    const lockPath = `${candidate}.lock`;
    await runtime.mkdir(lockPath, { recursive: false });
    await runtime.writeTextFile(
      `${lockPath}/owner-abandoned-owner.json`,
      JSON.stringify({
        expiresAtMilliseconds: 0,
        token: "abandoned-owner",
      }),
    );
    const acquired: CompilerCacheLock[] = [];
    const pending = Array.from({ length: 16 }, async () => {
      const cache = createDenoHost().cache;
      assert.ok(cache != null);
      const lock = await cache.acquireFileLock(candidate);
      acquired.push(lock);
    });
    /* eslint-disable no-await-in-loop -- Releases follow acquisition order. */
    while (acquired.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(acquired.length, 1);
    for (let index = 0; index < pending.length; index += 1) {
      while (acquired.length === index) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await acquired[index]?.release();
    }
    /* eslint-enable no-await-in-loop */
    await Promise.all(pending);
  } finally {
    await runtime.remove(directory, { recursive: true });
  }
});

test("renews an active Deno cache lease", async () => {
  const runtime = (
    globalThis as typeof globalThis & {
      readonly Deno?: MinimalDenoRuntime;
    }
  ).Deno;
  if (
    runtime?.makeTempDir == null ||
    runtime.readDir == null ||
    runtime.remove == null
  ) {
    return;
  }
  const directory = await runtime.makeTempDir();
  try {
    const cache = createDenoHost().cache;
    assert.ok(cache != null);
    const candidate = `${directory}/runtime.a`;
    const lockPath = `${candidate}.lock`;
    const lock = await cache.acquireFileLock(candidate);
    let ownerName: string | undefined;
    for await (const entry of runtime.readDir(lockPath)) {
      if (entry.name.startsWith("owner-")) ownerName = entry.name;
    }
    assert.ok(ownerName != null);
    const ownerPath = `${lockPath}/${ownerName}`;
    const before = JSON.parse(await runtime.readTextFile(ownerPath)) as {
      readonly expiresAtMilliseconds: number;
    };
    let after = before.expiresAtMilliseconds;
    const deadline = Date.now() + 3_000;
    /* eslint-disable no-await-in-loop -- Renewal polling is ordered. */
    while (after <= before.expiresAtMilliseconds && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      try {
        for await (const entry of runtime.readDir(lockPath)) {
          if (
            !entry.name.startsWith("owner-") &&
            !entry.name.startsWith("renew-")
          ) {
            continue;
          }
          const current = JSON.parse(
            await runtime.readTextFile(`${lockPath}/${entry.name}`),
          ) as {
            readonly expiresAtMilliseconds: number;
          };
          after = current.expiresAtMilliseconds;
        }
      } catch {
        // Renewal may rename the state between the directory and file reads.
      }
    }
    /* eslint-enable no-await-in-loop */
    assert.ok(after > before.expiresAtMilliseconds);
    await lock.release();
  } finally {
    await runtime.remove(directory, { recursive: true });
  }
});

test("fetches remote text assets in the Deno host", async () => {
  const globals = globalThis as typeof globalThis & {
    Deno?: MinimalDenoRuntime;
  };
  const denoDescriptor = Object.getOwnPropertyDescriptor(globals, "Deno");
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  let localRead = false;

  if (globals.Deno == null) {
    Object.defineProperty(globals, "Deno", {
      configurable: true,
      value: {
        async readTextFile(): Promise<string> {
          localRead = true;
          throw new Error("Remote assets must not use Deno.readTextFile().");
        },
      },
    });
  }
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: string | URL | Request): Promise<Response> => {
      assert.equal(String(input), "https://jsr.example/runtime.c");
      return new Response("int oseo_runtime(void) { return 0; }\n");
    },
    writable: true,
  });

  try {
    const source = await createDenoHost().readTextFile(
      new URL("https://jsr.example/runtime.c"),
    );
    assert.equal(source, "int oseo_runtime(void) { return 0; }\n");
    assert.ok(!localRead);
  } finally {
    if (fetchDescriptor == null) Reflect.deleteProperty(globalThis, "fetch");
    else Object.defineProperty(globalThis, "fetch", fetchDescriptor);
    if (denoDescriptor == null) Reflect.deleteProperty(globals, "Deno");
    else Object.defineProperty(globals, "Deno", denoDescriptor);
  }
});

test("reads local text assets through the Deno file API", async () => {
  const globals = globalThis as typeof globalThis & {
    Deno?: MinimalDenoRuntime;
  };
  const descriptor = Object.getOwnPropertyDescriptor(globals, "Deno");
  const runtime = globals.Deno;

  if (
    runtime?.makeTempFile != null &&
    runtime.remove != null &&
    runtime.writeTextFile != null
  ) {
    const path = await runtime.makeTempFile();
    try {
      await runtime.writeTextFile(path, "local asset\n");
      assert.equal(await createDenoHost().readTextFile(path), "local asset\n");
    } finally {
      await runtime.remove(path);
    }
    return;
  }

  Object.defineProperty(globals, "Deno", {
    configurable: true,
    value: {
      async readTextFile(path: string | URL): Promise<string> {
        assert.equal(path, "/tmp/runtime.c");
        return "local asset\n";
      },
    },
  });
  try {
    assert.equal(
      await createDenoHost().readTextFile("/tmp/runtime.c"),
      "local asset\n",
    );
  } finally {
    if (descriptor == null) Reflect.deleteProperty(globals, "Deno");
    else Object.defineProperty(globals, "Deno", descriptor);
  }
});

const moduleRange = {
  end: { column: 10, line: 1 },
  start: { column: 1, line: 1 },
} as const;

test("normalizes relative file module identities", () => {
  const result = fileModuleResolver.resolve("file:///work/src/main.js", {
    byteRange: { end: 15, start: 8 },
    range: moduleRange,
    value: "../lib/./value.js",
  });
  assert.deepEqual(result, {
    canonicalId: "file:///work/lib/value.js",
    diagnostics: [],
  });
});

test("decodes unreserved bytes in file module identities", () => {
  const plain = fileModuleResolver.resolve("file:///work/main.js", {
    byteRange: { end: 10, start: 0 },
    range: moduleRange,
    value: "./dep.js",
  });
  const encoded = fileModuleResolver.resolve("file:///work/main.js", {
    byteRange: { end: 12, start: 0 },
    range: moduleRange,
    value: "./%64ep.js",
  });
  assert.equal(encoded.canonicalId, plain.canonicalId);
  assert.equal(encoded.canonicalId, "file:///work/dep.js");
});

test("rejects bare and non-file module resolution", () => {
  const bare = fileModuleResolver.resolve("file:///work/main.js", {
    byteRange: { end: 5, start: 0 },
    range: moduleRange,
    value: "react",
  });
  assert.equal(bare.canonicalId, undefined);
  assert.equal(bare.diagnostics[0]?.sourceId, "file:///work/main.js");
  assert.deepEqual(bare.diagnostics[0]?.byteRange, { end: 5, start: 0 });

  const remote = fileModuleResolver.resolve("https://example.test/main.js", {
    byteRange: { end: 8, start: 0 },
    range: moduleRange,
    value: "./dep.js",
  });
  assert.equal(remote.canonicalId, undefined);
  assert.match(remote.diagnostics[0]?.message ?? "", /Cannot resolve/u);
});

test("loads file modules with stable content hashes", async () => {
  const reads: (string | URL)[] = [];
  const host = {
    async readTextFile(path: string | URL): Promise<string> {
      reads.push(path);
      return "export const answer = 42;\n";
    },
  } as CompilerHost;
  const loader = createFileModuleLoader(host);
  const first = await loader.load("file:///work/answer.js");
  const second = await loader.load("file:///work/answer.js");
  assert.equal(reads.length, 2);
  assert.equal(String(reads[0]), "file:///work/answer.js");
  assert.equal(first.diagnostics.length, 0);
  assert.equal(first.source?.sourceId, "file:///work/answer.js");
  assert.match(first.source?.sourceHash ?? "", /^fnv1a64:[0-9a-f]{16}$/u);
  assert.equal(second.source?.sourceHash, first.source?.sourceHash);
});

test("locates dependency load failures at the import specifier", async () => {
  const loader = createFileModuleLoader({
    readTextFile() {
      return Promise.reject(new Error("missing dependency"));
    },
  } as unknown as CompilerHost);
  const specifier = {
    byteRange: { end: 27, start: 15 },
    range: {
      end: { column: 28, line: 3 },
      start: { column: 16, line: 3 },
    },
    value: "./missing.js",
  };
  const result = await loader.load("file:///work/missing.js", {
    importerId: "file:///work/entry.js",
    specifier,
  });
  assert.equal(result.diagnostics[0]?.sourceId, "file:///work/entry.js");
  assert.deepEqual(result.diagnostics[0]?.byteRange, specifier.byteRange);
  assert.deepEqual(result.diagnostics[0]?.range, specifier.range);
});

test("canonicalizes filesystem characters as file URL data", async () => {
  const canonicalId = await createNodeHost().canonicalizeFile?.(
    "fixtures/space and #/entry.js",
  );
  assert.match(canonicalId ?? "", /^file:\/\//u);
  assert.match(canonicalId ?? "", /space%20and%20%23/u);
});

test("encodes literal percent signs in Deno file identities", async () => {
  const globals = globalThis as typeof globalThis & {
    Deno?: MinimalDenoRuntime;
  };
  const descriptor = Object.getOwnPropertyDescriptor(globals, "Deno");
  if (globals.Deno == null) {
    Object.defineProperty(globals, "Deno", {
      configurable: true,
      value: { cwd: () => "/work", readTextFile: async () => "" },
    });
  }
  try {
    const host = createDenoHost();
    const canonicalId =
      await createDenoHost().canonicalizeFile?.("/work/entry%20.mjs");
    const relativeId = await host.canonicalizeFile?.("entry%20.mjs");
    const resolved = fileModuleResolver.resolve("file:///work/root.mjs", {
      byteRange: { end: 20, start: 2 },
      range: moduleRange,
      value: "./entry%2520.mjs",
    });
    assert.equal(canonicalId, "file:///work/entry%2520.mjs");
    assert.match(relativeId ?? "", /\/entry%2520\.mjs$/u);
    assert.equal(resolved.canonicalId, canonicalId);
  } finally {
    if (descriptor == null) Reflect.deleteProperty(globals, "Deno");
    else Object.defineProperty(globals, "Deno", descriptor);
  }
});

test("canonicalizes encoded file URL identities", async () => {
  const canonicalId = await createNodeHost().canonicalizeFile?.(
    "file:///work/%64ep.js",
  );
  assert.equal(canonicalId, "file:///work/dep.js");
});
