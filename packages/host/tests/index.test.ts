import assert from "node:assert/strict";
import test from "node:test";

import { createDenoHost } from "../src/index.ts";

interface MinimalDenoRuntime {
  makeTempFile?(): Promise<string>;
  readTextFile(path: string | URL): Promise<string>;
  remove?(path: string): Promise<void>;
  writeTextFile?(path: string, contents: string): Promise<void>;
}

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
