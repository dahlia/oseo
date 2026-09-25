import assert from "node:assert/strict";
import test from "node:test";

import type {
  CompilerHost,
  NativeBuildInput,
  NativeToolchain,
} from "@oseo/compiler";
import { cRuntimeProvider } from "@oseo/runtime-c";

import { runCli, runNativeCli, runNativeUnits } from "../src/index.ts";

test("prints deterministic MIR and C for accepted source", () => {
  const help = runCli({ args: ["--help"], version: "0.0.0" });
  assert.ok(help.stdout.includes("--emit-c"));
  assert.ok(help.stdout.includes("--dump-mir"));
  assert.ok(help.stdout.includes("--no-specialization"));
  assert.ok(help.stdout.includes("--no-runtime-archive-reuse"));
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

test("composes the pinned Unicode property resolver", () => {
  const accepted = runCli({
    args: ["--dump-mir", "fixture.ts"],
    source: "const value = /\\p{sc=Grek}/u;",
    sourceId: "fixture.ts",
    version: "0.0.0",
  });
  assert.equal(accepted.exitStatus, 0);
  assert.equal(accepted.stderr, "");
  assert.match(accepted.stdout, /regexp-literal/u);

  const rejected = runCli({
    args: ["--dump-mir", "fixture.ts"],
    source: "const value = /\\p{Latin}/u;",
    sourceId: "fixture.ts",
    version: "0.0.0",
  });
  assert.equal(rejected.exitStatus, 1);
  assert.match(rejected.stderr, /OSEO0001/u);
  assert.match(rejected.stderr, /Unicode property is not defined/u);
});

test("composes the pinned resolver for module sources", async () => {
  const host: CompilerHost = {
    canonicalizeFile() {
      return Promise.resolve("file:///work/entry.mjs");
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
      args: ["--dump-mir", "/work/entry.mjs"],
      source: "export default /\\p{sc=Grek}/u;",
      version: "0.0.0",
    },
    host,
  );
  assert.equal(result.exitStatus, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /regexp-literal/u);
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
      // `eval` stays outside the admitted global-object profile, so the
      // source still ends in a source-located compile diagnostic.
      return Promise.resolve("console.log(eval);");
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
  assert.match(asModule.stdout, /async function .*\*module:/u);
  assert.match(asModule.stdout, /generator-await/u);
  const asScript = await runNativeCli(
    {
      args: ["--dump-mir", "/work/entry.js"],
      source: ambiguous,
      version: "0.0.0",
    },
    host,
  );
  assert.doesNotMatch(asScript.stdout, /generator-await/u);
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
  assert.match(result.stdout, /async function .*\*module:/u);
  assert.match(result.stdout, /generator-await/u);
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

test("names temporary process resource exhaustion", async () => {
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
      return Promise.resolve();
    },
    run() {
      return Promise.reject(
        Object.assign(new Error("spawn zig EAGAIN"), { code: "EAGAIN" }),
      );
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
  assert.ok(
    result.stderr.includes(
      "could not be started because the host temporarily exhausted " +
        "process resources.",
    ),
  );
});

test("cleans temporary artifacts after native execution fails", async () => {
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
    run(request) {
      // The fixture executable is the only non-toolchain process.
      const isExecution = request.command !== "zig";
      return Promise.resolve({
        exitStatus: isExecution ? 1 : 0,
        stderr: isExecution ? "runtime failure\n" : "",
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

test("reuses a cached archive and preserves an explicit bypass", async () => {
  let directoryIndex = 0;
  let cached = false;
  let cacheChecks = 0;
  let publications = 0;
  let cacheSetupFails = false;
  let cacheLockFails = false;
  let cacheLookupFails = false;
  let publicationFails = false;
  let runtimeWriteFails = false;
  let environmentUnavailable = false;
  let activeLocks = 0;
  let capturedEnvironment:
    | {
        readonly variables: Readonly<Record<string, string>>;
      }
    | undefined;
  const requests: string[][] = [];
  const writes: string[][] = [];
  let currentWrites: string[] = [];
  const host: CompilerHost = {
    cache: {
      acquireFileLock() {
        if (cacheLockFails) {
          return Promise.reject(new Error("cache lock unavailable"));
        }
        activeLocks += 1;
        let released = false;
        return Promise.resolve({
          release() {
            if (!released) {
              activeLocks -= 1;
              released = true;
            }
            return Promise.resolve();
          },
        });
      },
      getDirectory() {
        if (cacheSetupFails) {
          return Promise.reject(new Error("cache directory unavailable"));
        }
        return Promise.resolve("/cache/runtime-archives");
      },
      hasFile() {
        if (cacheLookupFails) {
          return Promise.reject(new Error("cache lookup unavailable"));
        }
        cacheChecks += 1;
        return Promise.resolve(cached);
      },
      publishFile() {
        if (publicationFails) {
          return Promise.reject(new Error("cache publication unavailable"));
        }
        cached = true;
        publications += 1;
        return Promise.resolve();
      },
    },
    captureEnvironment() {
      const environment = {
        variables: {
          HOME: "/home/test",
          PATH: "/opt/zig/bin",
        },
      };
      capturedEnvironment = environmentUnavailable ? undefined : environment;
      return Promise.resolve(capturedEnvironment);
    },
    executionHost: {
      architecture: "x86_64",
      operatingSystem: "linux",
    },
    makeTemporaryDirectory() {
      directoryIndex += 1;
      currentWrites = [];
      writes.push(currentWrites);
      return Promise.resolve(`/temporary/oseo-cli-${directoryIndex}`);
    },
    readTextFile() {
      return Promise.resolve("");
    },
    remove() {
      return Promise.resolve();
    },
    run(request) {
      if (request.command === "zig") {
        assert.equal(request.environment, capturedEnvironment);
      }
      requests.push([request.command, ...request.args]);
      return Promise.resolve({
        exitStatus: 0,
        stderr: "",
        stdout:
          request.command === "zig" && request.args[0] === "env"
            ? "zig_exe=/opt/zig/zig\nZIG_LIBC=null\n"
            : "",
      });
    },
    writeTextFile(path) {
      currentWrites.push(path);
      return runtimeWriteFails && !path.endsWith("generated.c")
        ? Promise.reject(new Error("runtime write unavailable"))
        : Promise.resolve();
    },
  };
  const invoke = async (args: readonly string[] = ["fixture.ts"]) =>
    await runNativeCli(
      {
        args,
        source: "console.log(42);",
        sourceId: "fixture.ts",
        version: "0.0.0",
      },
      host,
    );
  assert.equal((await invoke()).exitStatus, 0);
  assert.equal(cached, true);
  assert.equal(publications, 1);
  const firstRequestCount = requests.length;
  assert.equal((await invoke()).exitStatus, 0);
  const secondRequests = requests.slice(firstRequestCount);
  assert.ok(
    secondRequests.every(
      (request) => request[1] !== "ar" && !request.includes("-c"),
    ),
    JSON.stringify(secondRequests),
  );
  const runtimeSourceNames = new Set(
    cRuntimeProvider
      .getRuntimeInput()
      .assets.filter((asset) => asset.kind === "source")
      .map((asset) => asset.name),
  );
  assert.ok(
    writes[1]?.every(
      (path) => !runtimeSourceNames.has(path.slice(path.lastIndexOf("/") + 1)),
    ),
  );
  assert.equal(cacheChecks, 2);
  assert.equal(publications, 1);

  cacheSetupFails = true;
  const setupFallbackStart = requests.length;
  assert.equal((await invoke()).exitStatus, 0);
  const setupFallbackRequests = requests.slice(setupFallbackStart);
  assert.ok(setupFallbackRequests.some((request) => request[1] === "ar"));
  assert.ok(setupFallbackRequests.some((request) => request.includes("-c")));
  cacheSetupFails = false;

  cacheLockFails = true;
  const lockFallbackStart = requests.length;
  assert.equal((await invoke()).exitStatus, 0);
  const lockFallbackRequests = requests.slice(lockFallbackStart);
  assert.ok(lockFallbackRequests.some((request) => request[1] === "ar"));
  assert.ok(lockFallbackRequests.some((request) => request.includes("-c")));
  cacheLockFails = false;

  cacheLookupFails = true;
  const lookupFallbackStart = requests.length;
  assert.equal((await invoke()).exitStatus, 0);
  const lookupFallbackRequests = requests.slice(lookupFallbackStart);
  assert.ok(lookupFallbackRequests.some((request) => request[1] === "ar"));
  assert.ok(lookupFallbackRequests.some((request) => request.includes("-c")));
  cacheLookupFails = false;

  cached = false;
  publicationFails = true;
  const publicationFallbackStart = requests.length;
  assert.equal((await invoke()).exitStatus, 0);
  const publicationFallbackRequests = requests.slice(publicationFallbackStart);
  assert.ok(publicationFallbackRequests.some((request) => request[1] === "ar"));
  assert.ok(
    publicationFallbackRequests.some((request) => request.includes("-c")),
  );
  assert.equal(publications, 1);
  publicationFails = false;

  cached = false;
  runtimeWriteFails = true;
  assert.equal((await invoke()).exitStatus, 1);
  assert.equal(activeLocks, 0);
  runtimeWriteFails = false;

  const bypassStart = requests.length;
  assert.equal(
    (await invoke(["--no-runtime-archive-reuse", "fixture.ts"])).exitStatus,
    0,
  );
  const bypassRequests = requests.slice(bypassStart);
  assert.ok(bypassRequests.some((request) => request[1] === "ar"));
  assert.ok(bypassRequests.some((request) => request.includes("-c")));
  assert.equal(cacheChecks, 4);
  assert.equal(publications, 1);

  environmentUnavailable = true;
  const unavailableStart = requests.length;
  assert.equal((await invoke()).exitStatus, 0);
  const unavailableRequests = requests.slice(unavailableStart);
  assert.ok(unavailableRequests.some((request) => request[1] === "ar"));
  assert.ok(unavailableRequests.some((request) => request.includes("-c")));
  assert.equal(cacheChecks, 4);
});

test("retries a failed Zig identity probe", async () => {
  let cached = false;
  let identityProbes = 0;
  let publications = 0;
  const requests: string[][] = [];
  const host: CompilerHost = {
    cache: {
      acquireFileLock() {
        return Promise.resolve({
          release() {
            return Promise.resolve();
          },
        });
      },
      getDirectory() {
        return Promise.resolve("/cache/runtime-archives");
      },
      hasFile() {
        return Promise.resolve(cached);
      },
      publishFile() {
        cached = true;
        publications += 1;
        return Promise.resolve();
      },
    },
    captureEnvironment() {
      return Promise.resolve({
        variables: {
          HOME: "/home/test",
          PATH: "/opt/zig/bin",
        },
      });
    },
    executionHost: {
      architecture: "x86_64",
      operatingSystem: "linux",
    },
    makeTemporaryDirectory() {
      return Promise.resolve("/temporary/oseo-cli-retry");
    },
    readTextFile() {
      return Promise.resolve("");
    },
    remove() {
      return Promise.resolve();
    },
    run(request) {
      requests.push([request.command, ...request.args]);
      if (request.command === "zig" && request.args[0] === "env") {
        identityProbes += 1;
        return Promise.resolve({
          exitStatus: identityProbes === 1 ? 1 : 0,
          stderr: "",
          stdout:
            identityProbes === 1 ? "" : "zig_exe=/opt/zig/zig\nZIG_LIBC=null\n",
        });
      }
      return Promise.resolve({ exitStatus: 0, stderr: "", stdout: "" });
    },
    writeTextFile() {
      return Promise.resolve();
    },
  };
  const invoke = async () =>
    await runNativeCli(
      {
        args: ["fixture.ts"],
        source: "console.log(42);",
        sourceId: "fixture.ts",
        version: "0.0.0",
      },
      host,
    );
  assert.equal((await invoke()).exitStatus, 0);
  assert.equal(publications, 0);
  assert.ok(requests.some((request) => request[1] === "ar"));
  const retryStart = requests.length;
  assert.equal((await invoke()).exitStatus, 0);
  assert.equal(identityProbes, 2);
  assert.equal(publications, 1);
  assert.ok(
    requests
      .slice(retryStart)
      .some((request) => request[0] === "zig" && request[1] === "env"),
  );
  assert.equal((await invoke()).exitStatus, 0);
  assert.equal(identityProbes, 3);
  assert.equal(publications, 1);
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
      if (String(path).endsWith("/runtime_core.c")) {
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

test("native units share the existing build and cleanup workflow", async () => {
  const writes = new Map<string, string>();
  const inputs: NativeBuildInput[] = [];
  let cleaned = 0;
  const host: CompilerHost = {
    executionHost: { architecture: "x86_64", operatingSystem: "linux" },
    makeTemporaryDirectory: async () => "/work",
    readTextFile: async () => "runtime asset",
    writeTextFile: async (path, source) => {
      writes.set(path, source);
    },
    remove: async () => {
      cleaned += 1;
    },
    run: async () => ({ exitStatus: 0, stderr: "", stdout: "42\n" }),
  };
  const toolchain: NativeToolchain = {
    createBuildPlan(input) {
      inputs.push(input);
      return {
        executablePath: "/work/program",
        requests: [],
        target: input.target,
      };
    },
  };
  const result = await runNativeUnits(
    {
      sources: [
        { sourceName: "launcher.c", source: "launcher" },
        { sourceName: "case.c", source: "body" },
      ],
      prebuiltObjectPaths: ["/cache/harness.o"],
    },
    "original.js",
    host,
    toolchain,
  );
  assert.deepEqual(result, { exitStatus: 0, stderr: "", stdout: "42\n" });
  assert.equal(writes.get("/work/case.c"), "body");
  assert.equal(inputs[0]?.generatedSourcePath, "/work/launcher.c");
  assert.deepEqual(inputs[0]?.additionalGeneratedSourcePaths, ["/work/case.c"]);
  assert.deepEqual(inputs[0]?.prebuiltObjectPaths, ["/cache/harness.o"]);
  assert.equal(cleaned, 1);
  const invalid = await runNativeUnits(
    {
      sources: [{ sourceName: "../escape.c", source: "bad" }],
      prebuiltObjectPaths: [],
    },
    "original.js",
    host,
    toolchain,
  );
  assert.match(invalid.stderr, /OSEO3001/u);
  assert.equal(inputs.length, 1);
  assert.equal(cleaned, 2);
});

test("native unit setup and cleanup failures match the CLI", async () => {
  await Promise.all(
    (["setup", "cleanup"] as const).map(async (failure) => {
      const host: CompilerHost = {
        executionHost: { architecture: "x86_64", operatingSystem: "linux" },
        async makeTemporaryDirectory() {
          if (failure === "setup") throw new Error("ENOSPC");
          return "/work";
        },
        readTextFile: async () => "runtime asset",
        writeTextFile: async () => {},
        async remove() {
          throw new Error("cleanup failure");
        },
        run: async () => ({ exitStatus: 0, stderr: "", stdout: "42\n" }),
      };
      const toolchain: NativeToolchain = {
        createBuildPlan(input) {
          return {
            executablePath: "/work/program",
            requests: [],
            target: input.target,
          };
        },
      };
      const expected = await runNativeCli(
        {
          args: ["original.js"],
          source: "console.log(42);",
          sourceId: "original.js",
          version: "test",
        },
        host,
        toolchain,
      );
      const actual = await runNativeUnits(
        {
          sources: [{ sourceName: "case.c", source: "body" }],
          prebuiltObjectPaths: [],
        },
        "original.js",
        host,
        toolchain,
      );
      assert.deepEqual(actual, expected);
      assert.match(actual.stderr, /original.js:1:1: error\[OSEO3001\]/u);
      assert.match(
        actual.stderr,
        failure === "setup" ? /created/u : /removed/u,
      );
    }),
  );
});

const agentSource = [
  "for (let i = 0; i < 2; i++) {",
  "  $262.agent.start(`$262.agent.report(${i} + 1);`);",
  "}",
  '$262.agent.start("$262.agent.leaving();");',
  "$262.agent.start(`$262.agent.report(${1} + 1);`);",
  "console.log(typeof $262.agent.getReport);",
].join("\n");

test("compiles agent programs beside a test262 host program", () => {
  const help = runCli({ args: ["--help"], version: "0.0.0" });
  assert.ok(help.stdout.includes("--test262-host"));
  const mir = runCli({
    args: ["--test262-host", "--dump-mir", "agents.js"],
    source: agentSource,
    sourceId: "agents.js",
    version: "0.0.0",
  });
  assert.equal(mir.exitStatus, 0, mir.stderr);
  // The repeated template compiles once, and the string literal is a
  // template without holes.
  assert.equal(mir.stdout.match(/agent-hole agent hole 0/gu)?.length, 1);
  const emitted = runCli({
    args: ["--test262-host", "--emit-c", "agents.js"],
    source: agentSource,
    sourceId: "agents.js",
    version: "0.0.0",
  });
  assert.equal(emitted.exitStatus, 0, emitted.stderr);
  assert.match(
    emitted.stdout,
    /oseo_test262_host_install\(\n {8}&context, oseo_agent_programs, 2u\)/u,
  );
  assert.match(
    emitted.stdout,
    /OseoResult oseo_agent_program_0\(OseoContext \*context\)/u,
  );
  assert.match(
    emitted.stdout,
    /OseoResult oseo_agent_program_1\(OseoContext \*context\)/u,
  );
  assert.match(emitted.stdout, /result = oseo_agent_hole\(context, 0u\);/u);
  assert.match(emitted.stdout, /"agents\.js#agent-1", 17u\}/u);
  assert.doesNotMatch(emitted.stdout, /oseo_agent_program_2/u);

  const plain = runCli({
    args: ["--emit-c", "plain.js"],
    source: "console.log(1);",
    sourceId: "plain.js",
    version: "0.0.0",
  });
  assert.doesNotMatch(plain.stdout, /oseo_test262_host_install/u);
  // Without the host, `$262` is an ordinary global reference, and the
  // program installs no host object and links no agent program.
  const unhosted = runCli({
    args: ["--emit-c", "unhosted.js"],
    source: agentSource,
    sourceId: "unhosted.js",
    version: "0.0.0",
  });
  assert.equal(unhosted.exitStatus, 0, unhosted.stderr);
  assert.doesNotMatch(unhosted.stdout, /oseo_test262_host_install/u);
  assert.doesNotMatch(unhosted.stdout, /oseo_agent_program_0/u);
});

test("rejects agent templates whose holes are not literal positions", () => {
  for (const [template, message] of [
    ["`let x = ${1}2;`", /hole 0 is not delimited as one numeric literal/u],
    ["`let x = a${1};`", /hole 0 is not delimited as one numeric literal/u],
    ["`let x = Math.${1};`", /hole 0 is not delimited as one numeric literal/u],
    ["`let x = ${1}.5;`", /hole 0 is not delimited as one numeric literal/u],
    ["`let x = '${1}';`", /hole 0 \(\$262AgentHole0\) is not one numeric/u],
    ["`// ${1}\n`", /hole 0 \(\$262AgentHole0\) is not one numeric/u],
    ["`let x = { ${1} };`", /OSEO0001/u],
    ["`${1} => 1;`", /OSEO0001/u],
    ["`let x; x = ${1} = 2;`", /OSEO0001/u],
    ["`with ({}) { ${1}; }`", /is not one numeric literal position/u],
    ["`delete ${1};`", /is not one numeric literal position/u],
    // An escaped spelling of a placeholder is not the hole's token.
    [
      "`// ${42}\n$262.agent.report($262AgentHole\\\\u0030);`",
      /is not one numeric literal position|Unknown binding/u,
    ],
  ] as const) {
    const rejected = runCli({
      args: ["--test262-host", "--dump-mir", "template.js"],
      source: `$262.agent.start(${template});`,
      sourceId: "template.js",
      version: "0.0.0",
    });
    assert.equal(rejected.exitStatus, 1, template);
    assert.match(rejected.stderr, message, template);
  }
  // A hole the Script reads twice, through typeof and a plain read, is
  // still one placeholder per substitution.
  const accepted = runCli({
    args: ["--test262-host", "--dump-mir", "template.js"],
    source: "$262.agent.start(`let x = typeof ${1} + ${2};`);",
    sourceId: "template.js",
    version: "0.0.0",
  });
  assert.equal(accepted.exitStatus, 0, accepted.stderr);
  assert.match(accepted.stdout, /agent hole 1/u);
  // An escaped identifier that decodes to a placeholder name moves the
  // placeholder instead of shadowing the hole.
  const escaped = runCli({
    args: ["--test262-host", "--dump-mir", "template.js"],
    source:
      "$262.agent.start(`let $262AgentHol\\\\u{65}0 = 1; " +
      "$262.agent.report(${1} + $262AgentHol\\\\u{65}0);`);",
    sourceId: "template.js",
    version: "0.0.0",
  });
  assert.equal(escaped.exitStatus, 0, escaped.stderr);
  assert.match(escaped.stdout, /agent hole 0/u);
});

test("links each agent unit beside the main unit", async () => {
  const writes = new Map<string, string>();
  const inputs: NativeBuildInput[] = [];
  const host: CompilerHost = {
    executionHost: { architecture: "x86_64", operatingSystem: "linux" },
    makeTemporaryDirectory: async () => "/work",
    readTextFile: async () => "runtime asset",
    writeTextFile: async (path, source) => {
      writes.set(path, source);
    },
    remove: async () => undefined,
    run: async () => ({ exitStatus: 0, stderr: "", stdout: "" }),
  };
  const toolchain: NativeToolchain = {
    createBuildPlan(input) {
      inputs.push(input);
      return {
        executablePath: "/work/program",
        requests: [],
        target: input.target,
      };
    },
  };
  const result = await runNativeCli(
    {
      args: ["--test262-host", "agents.js"],
      source: agentSource,
      sourceId: "agents.js",
      version: "0.0.0",
    },
    host,
    toolchain,
  );
  assert.equal(result.exitStatus, 0, result.stderr);
  assert.equal(inputs[0]?.generatedSourcePath, "/work/generated.c");
  assert.deepEqual(inputs[0]?.additionalGeneratedSourcePaths, [
    "/work/agent-0.c",
    "/work/agent-1.c",
  ]);
  assert.match(writes.get("/work/agent-1.c") ?? "", /oseo_agent_program_1/u);
  const moduleGoal = await runNativeCli(
    {
      args: ["--test262-host", "--module", "agents.js"],
      source: "export {};",
      sourceId: "agents.js",
      version: "0.0.0",
    },
    host,
    toolchain,
  );
  assert.equal(moduleGoal.exitStatus, 1);
  assert.match(moduleGoal.stderr, /applies only to Scripts/u);
});
