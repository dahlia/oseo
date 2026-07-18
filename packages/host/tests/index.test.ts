import assert from "node:assert/strict";
import test from "node:test";

import type { CompilerHost } from "@oseo/compiler";

import {
  createDenoHost,
  createFileModuleLoader,
  createNodeHost,
  fileModuleResolver,
  normalizeExecutionHost,
} from "../src/index.ts";

interface MinimalDenoRuntime {
  cwd?(): string;
  makeTempFile?(): Promise<string>;
  readTextFile(path: string | URL): Promise<string>;
  remove?(path: string): Promise<void>;
  writeTextFile?(path: string, contents: string): Promise<void>;
}

test("normalizes execution hosts without choosing a target", () => {
  assert.deepEqual(normalizeExecutionHost("linux", "x64"), {
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
