/* eslint-disable no-await-in-loop -- Native fixture builds are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { cBackend } from "../packages/backend-c/src/index.ts";
import { runNativeCli } from "../packages/cli/src/index.ts";
import {
  compileSource,
  describeTarget,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../packages/testkit/src/index.ts";
import { zigToolchain } from "../packages/toolchain-zig/src/index.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const host = createNodeHost();

const referencePrelude = `
const oseoReferenceConsole = console;
Object.defineProperty(globalThis, "console", {
  value: {
    log(...values: unknown[]) {
      oseoReferenceConsole.log(values.map(String).join(" "));
    },
  },
});
`;

interface Fixture {
  readonly name: string;
  readonly nonStrictScript?: boolean;
  readonly source: string;
  readonly specialization?: {
    readonly genericCallsDisabled: number;
    readonly genericCallsEnabled: number;
    readonly hits: number;
    readonly misses: number;
    readonly overflowMisses: number;
  };
}

const fixtures: readonly Fixture[] = [
  {
    name: "arrays",
    source: `
const values = [1, , 3];
console.log(values.length, values[0], values[1], values[2]);
values[5] = 6;
console.log(values.length, values[4], values[5]);
console.log(delete values[5], values.length, values[5]);
values.length = 1;
console.log(values.length, values[0], values[2]);
`,
  },
  {
    name: "ordinary-objects",
    source: `
const value = { first: 1, ["missing"]: undefined };
console.log(value.first);
value.first = 2;
console.log(value.first);
value.self = value;
console.log(value.self === value);
console.log(value.missing);
console.log(delete value.first);
console.log(value.first);
value[1] = "number";
value[true] = "boolean";
value[null] = "null";
value[undefined] = "undefined";
console.log(value["1"], value.true, value.null, value.undefined);
`,
  },
  {
    name: "values",
    source: `
console.log(undefined, null, true, false);
console.log(-0);
console.log("" + -0, "" + NaN, "" + Infinity, "" + -Infinity);
console.log(0.000001, 0.0000123, 1e-7, 1.23e20);
console.log("" + "");
console.log("escaped\\ntext", "한글", "😀");
`,
  },
  {
    name: "truthiness-and-numeric-conversion",
    source: `
console.log(!undefined, !null, !false, !0, !NaN, !"", !"value");
console.log(-true, "" + -null, -"2", -undefined);
console.log("5" * 2, "9" / 3, false - true);
console.log("0b10" * 1, "0o10" * 1, "0x10" * 1, "　2　" * 1);
console.log("nan" * 1, "0x1p2" * 1, "1junk" * 1);
console.log("Infinity" * 1, "+Infinity" * 1, "-Infinity" * 1);
console.log("+inf" * 1, "-infinity" - 0, "+nan" * 1);
console.log("1\\0junk" * 1);
console.log("0x34964e021e30cde" * 1);
console.log("0o15113116004170606336" * 1);
console.log(
  "0b1101001001011001001110000000100001111000110000110011011110" * 1,
);
`,
  },
  {
    name: "generic-addition",
    source: `
function show(left, right) { console.log(left + right); }
show(1, 2);
show("left", 2);
show(true, "right");
show(null, false);
show(undefined, 1);
show("", null);
`,
  },
  {
    name: "comparisons",
    source: `
console.log(0 === -0, NaN === NaN, 1 !== "1", null !== undefined);
console.log("a" < "b", "😀" > "z", "10" < 2, null <= false);
console.log(Infinity >= 1, -Infinity < 0, NaN >= 0);
`,
  },
  {
    name: "scope-and-branches",
    source: `
const value = "outer";
const undefined = "undefined binding";
const NaN = "NaN binding";
const Infinity = "Infinity binding";
function scope() {
  if (false) {
    console.log(later);
  }
  const later = "initialized";
  if (true) {
    const value = "inner";
    console.log(value);
  } else {
    console.log("wrong");
  }
  console.log(value);
  console.log(later);
}
function globals() {
  console.log(undefined, NaN, Infinity);
}
scope();
globals();
`,
  },
  {
    name: "calls-and-order",
    source: `
function factorial(value) {
  if (value === 0) return 1;
  return value * factorial(value - 1);
}
function first(value) { return value; }
function pair(left, right) { console.log(left, right); }
console.log(factorial(6));
console.log(first(console.log("argument"), console.log("extra")));
pair("missing");
`,
  },
  {
    name: "duplicate-declarations",
    nonStrictScript: true,
    source: `
function duplicate(value, value) { return value; }
function repeated() { return "first"; }
function repeated() { return "last"; }
console.log(duplicate("first", "last"));
console.log(duplicate("only"));
console.log(repeated());
`,
  },
  {
    name: "hints",
    source: `
/** @param {string} left @returns {boolean} */
function hinted(left: number, right: string): null {
  return left + right;
}
function plain(left, right) { return left + right; }
console.log(hinted(1, 2), plain(1, 2));
`,
  },
  {
    name: "number-edges",
    source: `
console.log(5e-324, 1e308 * 10, 0 / 0, 1 / 0, 1 / -0);
console.log(0.1 + 0.2, 140737488355327 + 1);
`,
  },
  {
    name: "unused-function",
    source: `
function unused() { return 1; }
console.log("unused declaration accepted");
`,
  },
  {
    name: "returning-branches",
    source: `
function choose(value) {
  if (value) return "yes";
  else return "no";
}
console.log(choose(true), choose(false));
`,
  },
  {
    name: "specialization-hit",
    source: `
function add(left: number, right: number) { return left + right; }
add(20, 22);
`,
    specialization: {
      genericCallsDisabled: 1,
      genericCallsEnabled: 0,
      hits: 1,
      misses: 0,
      overflowMisses: 0,
    },
  },
  {
    name: "guarded-addition",
    source: `
function add(left: number, right: number) { return left + right; }
/** @param {number} left @param {number} right */
function addJs(left, right) { return left + right; }
function sum(value) {
  if (value === 0) return add(0, 0);
  return add(value, sum(value - 1));
}
function first() { console.log("left argument"); return 1; }
function second() { console.log("right argument"); return 2; }
console.log(add(1, 2));
console.log(add(140737488355327, 0));
console.log(add(-140737488355328, 0));
console.log(add(140737488355327, 1));
console.log(add(-140737488355328, -1));
console.log(add(-0, 0));
console.log(add(0.5, 1));
console.log(add(5e-324, 0));
console.log(add(NaN, 1));
console.log(add(Infinity, 1));
console.log(add(-Infinity, 1));
console.log(add("left", 1));
console.log(add(1, "right"));
console.log(add(true, 1));
console.log(add(null, 1));
console.log(add(undefined, 1));
console.log(addJs(20, 22));
console.log(sum(3));
console.log(add(first(), second()));
`,
    specialization: {
      genericCallsDisabled: 22,
      genericCallsEnabled: 13,
      hits: 9,
      misses: 11,
      overflowMisses: 2,
    },
  },
  {
    name: "ineligible-and-ordered-addition",
    source: `
function plain(left, right) { return left + right; }
/** @param {string} left @param {number} right */
function conflicting(left: number, right: number) { return left + right; }
function first() { console.log("left"); return 1; }
function second() { console.log("right"); return 2; }
console.log(plain(first(), second()));
console.log(conflicting("value", 1));
`,
    specialization: {
      genericCallsDisabled: 2,
      genericCallsEnabled: 2,
      hits: 0,
      misses: 0,
      overflowMisses: 0,
    },
  },
];

async function requireSuccess(
  command: string,
  args: readonly string[],
): Promise<{
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const result = await host.run({ args, command, cwd: root });
  if (result.exitStatus !== 0) {
    throw new Error(`${command} reference fixture failed:\n${result.stderr}`);
  }
  return result;
}

async function references(fixture: Fixture): Promise<
  readonly [
    {
      readonly exitStatus: number;
      readonly stderr: string;
      readonly stdout: string;
    },
    {
      readonly exitStatus: number;
      readonly stderr: string;
      readonly stdout: string;
    },
  ]
> {
  const directory = await host.makeTemporaryDirectory("oseo-reference-");
  const path = `${directory}/${fixture.name}.ts`;
  try {
    const source = fixture.nonStrictScript
      ? `new Function(${JSON.stringify(fixture.source)})();\n`
      : fixture.source;
    await host.writeTextFile(path, referencePrelude + source);
    return [
      await requireSuccess(process.execPath, [path]),
      await requireSuccess("deno", ["run", "--quiet", path]),
    ];
  } finally {
    await host.remove(directory);
  }
}

for (const fixture of fixtures) {
  const [nodeReference, denoReference] = await references(fixture);
  assertMatchingObservations([nodeReference, denoReference]);
  const disabledCompilation = compileSource(
    babelFrontend,
    {
      source: fixture.source,
      sourceId: `${fixture.name}.ts`,
    },
    { observeSpecialization: true, specialization: "disabled" },
  );
  const enabledCompilation = compileSource(
    babelFrontend,
    {
      source: fixture.source,
      sourceId: `${fixture.name}.ts`,
    },
    { observeSpecialization: true, specialization: "enabled" },
  );
  assert.deepEqual(disabledCompilation.diagnostics, [], fixture.name);
  assert.deepEqual(enabledCompilation.diagnostics, [], fixture.name);
  const disabledMir = disabledCompilation.mir;
  const enabledMir = enabledCompilation.mir;
  assert(disabledMir != null, `${fixture.name}: disabled MIR`);
  assert(enabledMir != null, `${fixture.name}: enabled MIR`);

  if (
    fixture.name === "generic-addition" ||
    fixture.name === "guarded-addition"
  ) {
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
  }
  try {
    for (const [mode, compilation] of [
      ["disabled", disabledMir],
      ["enabled", enabledMir],
    ] as const) {
      await withNativeFixture(
        {
          backend: cBackend,
          host,
          input: compilation,
          keepArtifacts: process.env.OSEO_KEEP_ARTIFACTS === "1",
          runtime: cRuntimeProvider,
          target: describeTarget("x86_64-linux-gnu"),
          toolchain: zigToolchain,
        },
        (native) => {
          assertMatchingObservations([nodeReference, denoReference, native]);
          assert(native.counters != null, `${fixture.name}: counters`);
          assert(native.emittedC.includes("OseoResult"), "generic call ABI");
          if (mode === "disabled") {
            assert.equal(native.counters.guardHits, 0);
            assert.equal(native.counters.guardMisses, 0);
            assert.equal(native.counters.overflowMisses, 0);
          }
          if (fixture.specialization != null) {
            const expected = fixture.specialization;
            assert.equal(
              native.counters.genericAdditionCalls,
              mode === "enabled"
                ? expected.genericCallsEnabled
                : expected.genericCallsDisabled,
            );
            if (mode === "enabled") {
              assert.equal(native.counters.guardHits, expected.hits);
              assert.equal(native.counters.guardMisses, expected.misses);
              assert.equal(
                native.counters.overflowMisses,
                expected.overflowMisses,
              );
            }
          }
          if (fixture.name === "guarded-addition" && mode === "enabled") {
            assert.match(native.emittedC, /oseo_value_is_smi/u);
            assert.match(native.emittedC, /oseo_smi_try_add/u);
            assert.match(native.emittedC, /oseo_value_box_smi/u);
            assert.ok(native.counters.allocations > 0);
            assert.ok(native.counters.collections > 0);
          }
          if (fixture.name === "specialization-hit" && mode === "enabled") {
            assert.equal(native.counters.allocations, 0);
            assert.equal(native.counters.genericAdditionCalls, 0);
          }
          if (fixture.name === "unused-function") {
            assert.doesNotMatch(native.emittedC, /oseo_function_0/u);
          }
          if (fixture.name === "returning-branches") {
            assert.doesNotMatch(native.emittedC, /bb3:/u);
          }
          assert(
            native.compilerInvocation
              .filter((line) => line.startsWith("zig cc "))
              .every((line) => line.includes("x86_64-linux-gnu")),
            "native compiler invocation records an explicit target",
          );
        },
      );
    }
  } finally {
    delete process.env.OSEO_GC_EVERY_SAFEPOINT;
  }

  const crossCompilations =
    fixture.specialization == null ? [enabledMir] : [disabledMir, enabledMir];
  for (const compilation of crossCompilations) {
    await withNativeFixture(
      {
        backend: cBackend,
        host,
        input: compilation,
        keepArtifacts: process.env.OSEO_KEEP_ARTIFACTS === "1",
        runtime: cRuntimeProvider,
        target: describeTarget("aarch64-linux-musl"),
        toolchain: zigToolchain,
      },
      (cross) => {
        assert(
          cross.compilerInvocation
            .filter((line) => line.startsWith("zig cc "))
            .every((line) => line.includes("aarch64-linux-musl")),
          "cross compiler invocation records an explicit target",
        );
      },
    );
  }
}

const assemblyCompilation = compileSource(
  babelFrontend,
  {
    source:
      "function add(left: number, right: number) { " +
      "return left + right; } console.log(add(1, 2));",
    sourceId: "assembly-specialization.ts",
  },
  { specialization: "enabled" },
);
const assemblyMir = assemblyCompilation.mir;
assert(assemblyMir != null, "assembly specialization MIR");
const assemblySource = cBackend.emit(assemblyMir).source;
for (const target of ["x86_64-linux-gnu", "aarch64-linux-musl"] as const) {
  const directory = await host.makeTemporaryDirectory("oseo-assembly-");
  try {
    const generatedPath = `${directory}/generated.c`;
    const headerPath = `${directory}/oseo_runtime.h`;
    const assemblyPath = `${directory}/generated.s`;
    await host.writeTextFile(generatedPath, assemblySource);
    const runtimeHeader = cRuntimeProvider
      .getRuntimeInput()
      .assets.find((asset) => asset.kind === "header");
    assert(runtimeHeader != null, "runtime header");
    await host.writeTextFile(
      headerPath,
      await host.readTextFile(runtimeHeader.url),
    );
    const assembly = await host.run({
      args: [
        "cc",
        "-target",
        target,
        "-std=c11",
        "-O2",
        "-S",
        "-I",
        directory,
        generatedPath,
        "-o",
        assemblyPath,
      ],
      command: "zig",
      cwd: directory,
    });
    assert.equal(assembly.exitStatus, 0, assembly.stderr);
    const text = await host.readTextFile(assemblyPath);
    assert.match(
      text,
      /(?:callq?|bl)\s+oseo_add(?:@PLT)?/u,
      `${target}: generic fallback retained`,
    );
    assert.doesNotMatch(
      text,
      /(?:callq?|bl)\s+oseo_(?:value_is_smi|smi_try_add|value_box_smi)/u,
      `${target}: small-integer primitives inline`,
    );
  } finally {
    await host.remove(directory);
  }
}

const recursiveCompilation = compileSource(babelFrontend, {
  source: "function recurse() { return recurse(); } recurse();",
  sourceId: "recursive-compile-only.ts",
});
assert.deepEqual(recursiveCompilation.diagnostics, []);
assert(recursiveCompilation.mir != null, "recursive compile-only MIR");
await withNativeFixture(
  {
    backend: cBackend,
    host,
    input: recursiveCompilation.mir,
    runtime: cRuntimeProvider,
    target: describeTarget("aarch64-linux-musl"),
    toolchain: zigToolchain,
  },
  (cross) => {
    assert.match(
      cross.emittedC,
      /OseoFunctionEntry volatile recursive_target_0/u,
    );
  },
);

const cli = await runNativeCli(
  {
    args: ["cli-fixture.ts"],
    source: 'console.log("cli-native");',
    sourceId: "cli-fixture.ts",
    version: "0.1.0",
  },
  host,
);
assert.deepEqual(cli, {
  exitStatus: 0,
  stderr: "",
  stdout: "cli-native\n",
});

let tdzDirectory: string | undefined;
let tdzCleanupCount = 0;
const tdzHost = {
  ...host,
  async makeTemporaryDirectory(prefix: string): Promise<string> {
    const directory = await host.makeTemporaryDirectory(prefix);
    tdzDirectory = directory;
    return directory;
  },
  async remove(path: string): Promise<void> {
    assert.equal(path, tdzDirectory);
    tdzCleanupCount += 1;
    await host.remove(path);
  },
};
const tdz = await runNativeCli(
  {
    args: ["tdz-runtime.ts"],
    source:
      "function read() { console.log(value); }\n" +
      "read();\n" +
      "const value = 1;\n",
    sourceId: "tdz-runtime.ts",
    version: "0.1.0",
  },
  tdzHost,
);
assert.equal(tdz.exitStatus, 1);
assert.equal(tdz.stdout, "");
assert.match(tdz.stderr, /error\[OSEO2001\].*before initialization/u);
assert.equal(tdzCleanupCount, 1);

const nulSourceId = "source\0identifier.ts";
const nulSourceDiagnostic = await runNativeCli(
  {
    args: ["nul-source-id.ts"],
    source: "console.log(value); const value = 1;",
    sourceId: nulSourceId,
    version: "0.1.0",
  },
  host,
);
assert.equal(nulSourceDiagnostic.exitStatus, 1);
assert.equal(nulSourceDiagnostic.stdout, "");
assert.ok(nulSourceDiagnostic.stderr.startsWith(`${nulSourceId}:`));
assert.match(nulSourceDiagnostic.stderr, /error\[OSEO2001\]/u);

const recursion = await runNativeCli(
  {
    args: ["recursive-runtime.ts"],
    source: "function recurse() { return recurse(); } recurse();",
    sourceId: "recursive-runtime.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(recursion.exitStatus, 1);
assert.equal(recursion.stdout, "");
assert.match(recursion.stderr, /error\[OSEO2001\].*call depth/u);

const wideBindings = Array.from(
  { length: 3_000 },
  (_, index) => `const value${index} = ${index};`,
).join("\n");
const wideRecursion = await runNativeCli(
  {
    args: ["wide-recursion-runtime.ts"],
    source:
      `function recurse(depth) {\n${wideBindings}\n` +
      "  if (depth === 0) return 0;\n" +
      "  return recurse(depth - 1);\n" +
      "}\n" +
      "console.log(recurse(100));\n",
    sourceId: "wide-recursion-runtime.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(wideRecursion.exitStatus, 1);
assert.equal(wideRecursion.stdout, "");
assert.match(wideRecursion.stderr, /error\[OSEO2001\].*frame budget/u);

const rootAllocationFailureHost = {
  ...host,
  async readTextFile(path: string | URL): Promise<string> {
    const source = await host.readTextFile(path);
    if (!(path instanceof URL) || !path.pathname.endsWith("/runtime.c")) {
      return source;
    }
    const injected = source.replace(
      "slots = calloc(slot_count, sizeof(OseoValue));",
      "slots = NULL;",
    );
    assert.notEqual(injected, source, "root allocation failure injected");
    return injected;
  },
};
const rootAllocationFailure = await runNativeCli(
  {
    args: ["root-allocation-runtime.ts"],
    source: "console.log(1);",
    sourceId: "root-allocation-runtime.ts",
    version: "0.1.0",
  },
  rootAllocationFailureHost,
);
assert.equal(rootAllocationFailure.exitStatus, 1);
assert.equal(rootAllocationFailure.stdout, "");
assert.match(
  rootAllocationFailure.stderr,
  /error\[OSEO2001\].*Root frame allocation failed/u,
);

const concatenationOverflowHost = {
  ...host,
  async readTextFile(path: string | URL): Promise<string> {
    const source = await host.readTextFile(path);
    if (!(path instanceof URL) || !path.pathname.endsWith("/runtime.c")) {
      return source;
    }
    const injected = source.replace(
      "OseoString *right_object = string_object(slots[1]);",
      "OseoString *right_object = string_object(slots[1]);\n" +
        "    right_object->length = SIZE_MAX;",
    );
    assert.notEqual(injected, source, "concatenation overflow injected");
    return injected;
  },
};
const concatenationOverflow = await runNativeCli(
  {
    args: ["concatenation-overflow-runtime.ts"],
    source: 'console.log("left" + "right");',
    sourceId: "concatenation-overflow-runtime.ts",
    version: "0.1.0",
  },
  concatenationOverflowHost,
);
assert.equal(concatenationOverflow.exitStatus, 1);
assert.equal(concatenationOverflow.stdout, "");
assert.match(
  concatenationOverflow.stderr,
  /error\[OSEO2001\].*String allocation is too large/u,
);

const allocationFailureHost = {
  ...host,
  async readTextFile(path: string | URL): Promise<string> {
    const source = await host.readTextFile(path);
    if (!(path instanceof URL) || !path.pathname.endsWith("/runtime.c")) {
      return source;
    }
    const injected = source.replace(
      "char *text = malloc(length + 1u);",
      "char *text = NULL;",
    );
    assert.notEqual(injected, source, "numeric allocation failure injected");
    return injected;
  },
};
const allocationFailure = await runNativeCli(
  {
    args: ["numeric-conversion-runtime.ts"],
    source: 'console.log(-"1");',
    sourceId: "numeric-conversion-runtime.ts",
    version: "0.1.0",
  },
  allocationFailureHost,
);
assert.equal(allocationFailure.exitStatus, 1);
assert.equal(allocationFailure.stdout, "");
assert.match(allocationFailure.stderr, /error\[OSEO2001\].*allocation/u);

console.log(
  `native fixtures: ${fixtures.length} Node, Deno, and x86-64 outputs match`,
);
console.log(
  `cross fixtures: ${fixtures.length + 1} aarch64-linux-musl builds passed`,
);
console.log("assembly fixtures: x86-64 and AArch64 guarded paths inspected");
