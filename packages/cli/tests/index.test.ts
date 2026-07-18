import assert from "node:assert/strict";
import test from "node:test";

import type { CompilerHost } from "@oseo/compiler";

import { runCli, runNativeCli } from "../src/index.ts";

test("prints deterministic MIR and C for accepted source", () => {
  const help = runCli({ args: ["--help"], version: "0.0.0" });
  assert.ok(help.stdout.includes("--emit-c"));
  assert.ok(help.stdout.includes("--dump-mir"));
  assert.ok(help.stdout.includes("--no-specialization"));
  assert.ok(help.stdout.includes("--target"));
  const mir = runCli({
    args: ["--dump-mir", "fixture.ts"],
    source: "console.log(42);",
    sourceId: "fixture.ts",
    version: "0.0.0",
  });
  assert.equal(mir.exitStatus, 0);
  assert.match(mir.stdout, /safepoint console_log/u);
  const emitted = runCli({
    args: ["--emit-c", "fixture.ts"],
    source: "console.log(42);",
    sourceId: "fixture.ts",
    version: "0.0.0",
  });
  assert.equal(emitted.exitStatus, 0);
  assert.match(emitted.stdout, /oseo_console_log/u);
});

test("passes an explicit generic-only policy through CLI orchestration", () => {
  const source =
    "function add(left: number, right: number) { " +
    "return left + right; } add(1, 2);";
  const enabled = runCli({
    args: ["--dump-mir", "fixture.ts"],
    source,
    version: "0.0.0",
  });
  const disabled = runCli({
    args: ["--no-specialization", "--dump-mir", "fixture.ts"],
    source,
    version: "0.0.0",
  });
  assert.match(enabled.stdout, /guard-smi/u);
  assert.doesNotMatch(disabled.stdout, /guard-smi/u);
  assert.match(disabled.stdout, /specialization disabled/u);
});

test("rejects invalid command-line shapes before compilation", () => {
  const unknown = runCli({
    args: ["--unknown", "fixture.ts"],
    source: "console.log(42);",
    version: "0.0.0",
  });
  assert.equal(unknown.exitStatus, 1);
  assert.match(unknown.stderr, /--unknown/u);

  const missingSource = runCli({
    args: ["--dump-mir"],
    source: "console.log(42);",
    version: "0.0.0",
  });
  assert.equal(missingSource.exitStatus, 1);
  assert.match(missingSource.stderr, /SOURCE/u);

  const conflictingModes = runCli({
    args: ["--dump-mir", "--emit-c", "fixture.ts"],
    source: "console.log(42);",
    version: "0.0.0",
  });
  assert.equal(conflictingModes.exitStatus, 1);
  assert.match(conflictingModes.stderr, /--emit-c/u);

  const duplicateMode = runCli({
    args: ["--dump-mir", "--dump-mir", "fixture.ts"],
    source: "console.log(42);",
    version: "0.0.0",
  });
  assert.equal(duplicateMode.exitStatus, 1);
  assert.match(duplicateMode.stderr, /cannot be used multiple times/u);

  const invalidTarget = runCli({
    args: ["--target", "unknown", "fixture.ts"],
    source: "console.log(42);",
    version: "0.0.0",
  });
  assert.equal(invalidTarget.exitStatus, 1);
  assert.match(invalidTarget.stderr, /unknown/u);

  const externalTarget = runCli({
    args: ["--target", "aarch64-macos", "fixture.ts"],
    source: "console.log(42);",
    version: "0.0.0",
  });
  assert.equal(externalTarget.exitStatus, 1);
  assert.match(externalTarget.stderr, /aarch64-macos/u);
});

test("rejects target selection for host-neutral output", () => {
  const result = runCli({
    args: ["--target", "macos-aarch64", "--emit-c", "fixture.ts"],
    source: "console.log(42);",
    version: "0.0.0",
  });
  assert.equal(result.exitStatus, 1);
  assert.match(result.stderr, /asynchronous native execution/u);
});

test("rejects unsupported target-host pairs before building", async () => {
  const cases = [
    {
      architecture: "x86_64",
      operatingSystem: "linux",
      target: "macos-aarch64",
    },
    {
      architecture: "aarch64",
      operatingSystem: "linux",
      target: "linux-aarch64-musl",
    },
  ] as const;
  await Promise.all(
    cases.map(async (fixture) => {
      let temporaryDirectoryRequested = false;
      const host: CompilerHost = {
        executionHost: fixture,
        makeTemporaryDirectory() {
          temporaryDirectoryRequested = true;
          return Promise.reject(new Error("unexpected temporary directory"));
        },
        readTextFile() {
          return Promise.reject(new Error("unexpected read"));
        },
        remove() {
          return Promise.reject(new Error("unexpected cleanup"));
        },
        run() {
          return Promise.reject(new Error("unexpected process"));
        },
        writeTextFile() {
          return Promise.reject(new Error("unexpected write"));
        },
      };
      const result = await runNativeCli(
        {
          args: ["--target", fixture.target, "fixture.ts"],
          source: "console.log(42);",
          version: "0.0.0",
        },
        host,
      );
      assert.equal(result.exitStatus, 1);
      assert.match(
        result.stderr,
        new RegExp(
          `cannot execute on ${fixture.operatingSystem}/` +
            fixture.architecture,
          "u",
        ),
      );
      assert.ok(!temporaryDirectoryRequested);
    }),
  );
});

test("accepts mode options on either side of the source argument", () => {
  for (const args of [
    ["--dump-mir", "fixture.ts"],
    ["fixture.ts", "--dump-mir"],
  ]) {
    const result = runCli({
      args,
      source: "console.log(42);",
      version: "0.0.0",
    });
    assert.equal(result.exitStatus, 0);
    assert.match(result.stdout, /safepoint console_log/u);
  }
});

test("separates the source path from its diagnostic identifier", async () => {
  let readPath: string | URL | undefined;
  const host: CompilerHost = {
    makeTemporaryDirectory() {
      return Promise.reject(new Error("unexpected temporary directory"));
    },
    readTextFile(path) {
      readPath = path;
      return Promise.resolve("console.log(() => 1);");
    },
    remove() {
      return Promise.reject(new Error("unexpected cleanup"));
    },
    run() {
      return Promise.reject(new Error("unexpected process"));
    },
    writeTextFile() {
      return Promise.reject(new Error("unexpected write"));
    },
  };
  const result = await runNativeCli(
    {
      args: ["--dump-mir", "/tmp/input.ts"],
      sourceId: "display.ts",
      version: "0.0.0",
    },
    host,
  );
  assert.equal(readPath, "/tmp/input.ts");
  assert.equal(result.exitStatus, 1);
  assert.match(result.stderr, /^display\.ts:/u);
});

test("reads a file URL entry as a URL", async () => {
  let readPath: string | URL | undefined;
  const host: CompilerHost = {
    makeTemporaryDirectory() {
      return Promise.reject(new Error("unexpected temporary directory"));
    },
    readTextFile(path) {
      readPath = path;
      return Promise.resolve("console.log(42);");
    },
    remove() {
      return Promise.reject(new Error("unexpected cleanup"));
    },
    run() {
      return Promise.reject(new Error("unexpected process"));
    },
    writeTextFile() {
      return Promise.reject(new Error("unexpected write"));
    },
  };
  const result = await runNativeCli(
    {
      args: ["--dump-mir", "file:///work/input.ts"],
      version: "0.0.0",
    },
    host,
  );
  assert.equal(result.exitStatus, 0);
  assert.ok(readPath instanceof URL);
  assert.equal(readPath.href, "file:///work/input.ts");
});

test("loads and lowers a closed file module graph", async () => {
  const reads: string[] = [];
  const host: CompilerHost = {
    canonicalizeFile() {
      return Promise.resolve("file:///work/entry.js");
    },
    makeTemporaryDirectory() {
      return Promise.reject(new Error("unexpected temporary directory"));
    },
    readTextFile(path) {
      reads.push(String(path));
      if (String(path) === "file:///work/values.js") {
        return Promise.resolve("export let answer = 42;");
      }
      return Promise.reject(new Error("unexpected module"));
    },
    remove() {
      return Promise.reject(new Error("unexpected cleanup"));
    },
    run() {
      return Promise.reject(new Error("unexpected process"));
    },
    writeTextFile() {
      return Promise.reject(new Error("unexpected write"));
    },
  };
  const result = await runNativeCli(
    {
      args: ["--dump-mir", "/work/entry.js"],
      source:
        'import * as values from "./values.js"; ' +
        "console.log(values.answer);",
      version: "0.0.0",
    },
    host,
  );
  assert.equal(result.exitStatus, 0);
  assert.deepEqual(reads, ["file:///work/values.js"]);
  assert.match(result.stdout, /module-namespace-create 1 live exports/u);
  assert.match(result.stdout, /property-get generic/u);
});

test("locates unreadable dependencies at their import sites", async () => {
  const host: CompilerHost = {
    canonicalizeFile() {
      return Promise.resolve("file:///work/entry.js");
    },
    makeTemporaryDirectory() {
      return Promise.reject(new Error("unexpected temporary directory"));
    },
    readTextFile() {
      return Promise.reject(new Error("missing dependency"));
    },
    remove() {
      return Promise.reject(new Error("unexpected cleanup"));
    },
    run() {
      return Promise.reject(new Error("unexpected process"));
    },
    writeTextFile() {
      return Promise.reject(new Error("unexpected write"));
    },
  };
  const result = await runNativeCli(
    {
      args: ["--dump-mir", "/work/entry.js"],
      source: 'console.log("before");\nimport "./missing.js";',
      version: "0.0.0",
    },
    host,
  );
  assert.equal(result.exitStatus, 1);
  assert.match(
    result.stderr,
    /file:\/\/\/work\/entry\.js:2:\d+: error\[OSEO3001\]/u,
  );
  assert.doesNotMatch(result.stderr, /missing\.js:1:1/u);
});

test("forces the module goal symbol with --module", async () => {
  const host: CompilerHost = {
    canonicalizeFile() {
      return Promise.resolve("file:///work/entry.js");
    },
    makeTemporaryDirectory() {
      return Promise.reject(new Error("unexpected temporary directory"));
    },
    readTextFile() {
      return Promise.reject(new Error("unexpected read"));
    },
    remove() {
      return Promise.reject(new Error("unexpected remove"));
    },
    run() {
      return Promise.reject(new Error("unexpected process"));
    },
    writeTextFile() {
      return Promise.reject(new Error("unexpected write"));
    },
  };
  const ambiguous = "await (0);";
  const asModule = await runNativeCli(
    {
      args: ["--dump-mir", "--module", "/work/entry.js"],
      source: ambiguous,
      version: "0.0.0",
    },
    host,
  );
  assert.equal(asModule.exitStatus, 0, asModule.stderr);
  assert.match(asModule.stdout, /top-level await/u);
  const asScript = await runNativeCli(
    {
      args: ["--dump-mir", "/work/entry.js"],
      source: ambiguous,
      version: "0.0.0",
    },
    host,
  );
  assert.doesNotMatch(asScript.stdout, /top-level await/u);
  const strictModule = await runNativeCli(
    {
      args: ["--dump-mir", "--module", "/work/entry.js"],
      source: "function duplicate(parameter, parameter) {}",
      version: "0.0.0",
    },
    host,
  );
  assert.equal(strictModule.exitStatus, 1);
  assert.match(strictModule.stderr, /error\[OSEO0001\]/u);
});

test("keeps --module outside the synchronous CLI surface", () => {
  const result = runCli({
    args: ["--module", "entry.js"],
    source: "await (0);",
    sourceId: "entry.js",
    version: "0.0.0",
  });
  assert.equal(result.exitStatus, 1);
  assert.match(result.stderr, /asynchronous CLI host workflow/u);
});

test("recognizes top-level await without module declarations", async () => {
  const host: CompilerHost = {
    canonicalizeFile() {
      return Promise.resolve("file:///work/await.js");
    },
    makeTemporaryDirectory() {
      return Promise.reject(new Error("unexpected temporary directory"));
    },
    readTextFile() {
      return Promise.reject(new Error("unexpected read"));
    },
    remove() {
      return Promise.reject(new Error("unexpected remove"));
    },
    run() {
      return Promise.reject(new Error("unexpected process"));
    },
    writeTextFile() {
      return Promise.reject(new Error("unexpected write"));
    },
  };
  const result = await runNativeCli(
    {
      args: ["--dump-mir", "/work/await.js"],
      source: "await Promise.resolve(1);",
      version: "0.0.0",
    },
    host,
  );
  assert.equal(result.exitStatus, 0);
  assert.match(result.stdout, /top-level await/u);
});

test("preserves module parsing for plain module entries", async () => {
  const host: CompilerHost = {
    canonicalizeFile(path) {
      return Promise.resolve(new URL(String(path), "file:///work/").href);
    },
    makeTemporaryDirectory() {
      return Promise.reject(new Error("unexpected temporary directory"));
    },
    readTextFile() {
      return Promise.reject(new Error("unexpected read"));
    },
    remove() {
      return Promise.reject(new Error("unexpected remove"));
    },
    run() {
      return Promise.reject(new Error("unexpected process"));
    },
    writeTextFile() {
      return Promise.reject(new Error("unexpected write"));
    },
  };
  const source = "function duplicate(parameter, parameter) {}";
  const moduleResults = await Promise.all(
    [
      "entry.mjs",
      "C:\\work\\entry.mjs",
      "file:///work/entry.mjs",
      "entry.mts",
      "C:\\work\\entry.mts",
      "file:///work/entry.mts",
      "file:///work/entry%2Emjs",
      "file:///work/entry%2Emts",
    ].map((sourcePath) =>
      runNativeCli(
        {
          args: ["--dump-mir", sourcePath],
          source,
          version: "0.0.0",
        },
        host,
      ),
    ),
  );
  for (const result of moduleResults) {
    assert.equal(result.exitStatus, 1);
    assert.match(result.stderr, /error\[OSEO0001\]/u);
  }
  const script = await runNativeCli({
    args: ["--dump-mir", "entry.js"],
    source,
    version: "0.0.0",
  });
  assert.equal(script.exitStatus, 0);
});

test("normalizes process spawn failures into host diagnostics", async () => {
  let cleanupCount = 0;
  const host: CompilerHost = {
    executionHost: {
      architecture: "x86_64",
      operatingSystem: "linux",
    },
    makeTemporaryDirectory() {
      return Promise.resolve("/temporary/oseo-cli");
    },
    readTextFile() {
      return Promise.resolve("");
    },
    remove() {
      cleanupCount += 1;
      return Promise.resolve();
    },
    run() {
      return Promise.reject(new Error("spawn zig ENOENT"));
    },
    writeTextFile() {
      return Promise.resolve();
    },
  };
  const result = await runNativeCli(
    {
      args: ["fixture.ts"],
      source: "console.log(42);",
      sourceId: "fixture.ts",
      version: "0.0.0",
    },
    host,
  );
  assert.equal(result.exitStatus, 1);
  assert.match(result.stderr, /error\[OSEO3001\]/u);
  assert.doesNotMatch(result.stderr, /Error:| at /u);
  assert.equal(cleanupCount, 1);
});

test("cleans temporary artifacts after native execution fails", async () => {
  let cleanupCount = 0;
  let processCount = 0;
  const host: CompilerHost = {
    executionHost: {
      architecture: "x86_64",
      operatingSystem: "linux",
    },
    makeTemporaryDirectory() {
      return Promise.resolve("/temporary/oseo-cli");
    },
    readTextFile() {
      return Promise.resolve("");
    },
    remove() {
      cleanupCount += 1;
      return Promise.resolve();
    },
    run() {
      processCount += 1;
      return Promise.resolve({
        exitStatus: processCount === 4 ? 1 : 0,
        stderr: processCount === 4 ? "runtime failure\n" : "",
        stdout: "",
      });
    },
    writeTextFile() {
      return Promise.resolve();
    },
  };
  const result = await runNativeCli(
    {
      args: ["fixture.ts"],
      source: "console.log(42);",
      sourceId: "fixture.ts",
      version: "0.0.0",
    },
    host,
  );
  assert.equal(result.exitStatus, 1);
  assert.equal(result.stderr, "runtime failure\n");
  assert.equal(cleanupCount, 1);
});

test("waits for pending runtime asset writes before cleanup", async () => {
  const events: string[] = [];
  let finishHeaderWrite: (() => void) | undefined;
  let markHeaderWriteStarted: (() => void) | undefined;
  const headerWriteStarted = new Promise<void>((resolve) => {
    markHeaderWriteStarted = resolve;
  });
  let writeCount = 0;
  const host: CompilerHost = {
    executionHost: {
      architecture: "x86_64",
      operatingSystem: "linux",
    },
    makeTemporaryDirectory() {
      return Promise.resolve("/temporary/oseo-cli");
    },
    readTextFile(path) {
      if (String(path).endsWith("/runtime.c")) {
        return headerWriteStarted.then(() =>
          Promise.reject(new Error("runtime read failed")),
        );
      }
      return Promise.resolve("");
    },
    remove() {
      events.push("cleanup");
      return Promise.resolve();
    },
    run() {
      return Promise.resolve({ exitStatus: 0, stderr: "", stdout: "" });
    },
    writeTextFile() {
      writeCount += 1;
      if (writeCount !== 2) return Promise.resolve();
      events.push("header-write-started");
      markHeaderWriteStarted?.();
      return new Promise<void>((resolve) => {
        finishHeaderWrite = () => {
          events.push("header-write-finished");
          resolve();
        };
      });
    },
  };
  const resultPromise = runNativeCli(
    {
      args: ["fixture.ts"],
      source: "console.log(42);",
      sourceId: "fixture.ts",
      version: "0.0.0",
    },
    host,
  );
  await headerWriteStarted;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(finishHeaderWrite != null);
  finishHeaderWrite();
  const result = await resultPromise;
  assert.equal(result.exitStatus, 1);
  assert.ok(
    events.indexOf("header-write-finished") < events.indexOf("cleanup"),
  );
});

type HostFailure =
  | "cleanup"
  | "generated-write"
  | "runtime-read"
  | "runtime-write"
  | "temporary-directory";

function hostFailingAt(failure: HostFailure): CompilerHost {
  let writeCount = 0;
  return {
    executionHost: {
      architecture: "x86_64",
      operatingSystem: "linux",
    },
    makeTemporaryDirectory() {
      return failure === "temporary-directory"
        ? Promise.reject(new Error("temporary directory failed"))
        : Promise.resolve("/temporary/oseo-cli");
    },
    readTextFile() {
      return failure === "runtime-read"
        ? Promise.reject(new Error("runtime read failed"))
        : Promise.resolve("");
    },
    remove() {
      return failure === "cleanup"
        ? Promise.reject(new Error("cleanup failed"))
        : Promise.resolve();
    },
    run() {
      return Promise.resolve({ exitStatus: 0, stderr: "", stdout: "" });
    },
    writeTextFile() {
      writeCount += 1;
      const reject =
        (failure === "generated-write" && writeCount === 1) ||
        (failure === "runtime-write" && writeCount > 1);
      return reject
        ? Promise.reject(new Error("write failed"))
        : Promise.resolve();
    },
  };
}

for (const failure of [
  "temporary-directory",
  "generated-write",
  "runtime-read",
  "runtime-write",
  "cleanup",
] as const) {
  test(`normalizes ${failure} host failures`, async () => {
    const result = await runNativeCli(
      {
        args: ["fixture.ts"],
        source: "console.log(42);",
        sourceId: "fixture.ts",
        version: "0.0.0",
      },
      hostFailingAt(failure),
    );
    assert.equal(result.exitStatus, 1);
    assert.match(result.stderr, /error\[OSEO3001\]/u);
    assert.doesNotMatch(result.stderr, /Error:| at /u);
  });
}
