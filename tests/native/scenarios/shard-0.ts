/* eslint-disable no-await-in-loop -- Native scenario builds are isolated. */

import assert from "node:assert/strict";

import { cBackend } from "../../../packages/backend-c/src/index.ts";
import { runNativeCli } from "../../../packages/cli/src/index.ts";
import {
  compileSource,
  describeTarget,
} from "../../../packages/compiler/src/index.ts";
import { babelFrontend } from "../../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../../packages/runtime-c/src/index.ts";
import { withNativeFixture } from "../../../packages/testkit/src/index.ts";
import { zigToolchain } from "../../../packages/toolchain-zig/src/index.ts";
import type { NativeScenarioContext } from "../scenario.ts";

export async function runNativeScenario0(
  context: NativeScenarioContext,
): Promise<void> {
  const { host, nativeTarget } = context;

  // Multi-source runtime build contract: every reviewed runtime
  // translation unit plus an extra probe unit compiles, archives in
  // input order, and links into an executable whose observation matches
  // the reviewed-runtime build. The copied runtime_core.c gains an
  // undefined reference to a symbol defined only by the probe unit, so
  // a successful link proves the linker extracted the probe archive
  // member.
  {
    const probeDirectory = await host.makeTemporaryDirectory("oseo-multi-tu-");
    const probeSourcePath = `${probeDirectory}/runtime_probe.c`;
    await host.writeTextFile(
      probeSourcePath,
      "int oseo_probe_second_translation_unit(void);\n" +
        "int oseo_probe_second_translation_unit(void) { return 1; }\n",
    );
    const multiSourceRuntime = {
      getRuntimeInput() {
        const base = cRuntimeProvider.getRuntimeInput();
        return {
          abiVersion: base.abiVersion,
          assets: [
            ...base.assets,
            {
              kind: "source" as const,
              name: "runtime_probe.c",
              url: new URL(`file://${probeSourcePath}`),
            },
          ],
        };
      },
    };
    const probeReferenceHost = {
      ...host,
      async readTextFile(path: string | URL): Promise<string> {
        const source = await host.readTextFile(path);
        if (
          !(path instanceof URL) ||
          !path.pathname.endsWith("/runtime_core.c")
        ) {
          return source;
        }
        return (
          source +
          "\nint oseo_probe_second_translation_unit(void);\n" +
          "int oseo_probe_link_participation(void);\n" +
          "int oseo_probe_link_participation(void) {\n" +
          "    return oseo_probe_second_translation_unit();\n" +
          "}\n"
        );
      },
    };
    const multiSourceCompilation = compileSource(
      babelFrontend,
      { source: 'console.log("multi-source runtime");', sourceId: "multi.ts" },
      { observeSpecialization: false, specialization: "disabled" },
    );
    assert.deepEqual(multiSourceCompilation.diagnostics, []);
    assert(multiSourceCompilation.mir != null, "multi-source MIR");
    await withNativeFixture(
      {
        backend: cBackend,
        host: probeReferenceHost,
        input: multiSourceCompilation.mir,
        keepArtifacts: process.env.OSEO_KEEP_ARTIFACTS === "1",
        operation: "execute",
        runtime: multiSourceRuntime,
        runtimeArchiveReuse: "disabled",
        target: nativeTarget,
        toolchain: zigToolchain,
      },
      (native) => {
        assert.equal(native.stdout, "multi-source runtime\n");
        assert.equal(native.exitStatus, 0);
        const reviewedSourceNames = cRuntimeProvider
          .getRuntimeInput()
          .assets.filter((asset) => asset.kind === "source")
          .map((asset) => asset.name);
        const expectedNames = [...reviewedSourceNames, "runtime_probe.c"];
        const compileLines = native.compilerInvocation.filter((line) =>
          line.includes(" -c "),
        );
        assert.equal(compileLines.length, expectedNames.length);
        expectedNames.forEach((name, index) => {
          assert.ok(
            compileLines[index]?.includes(` -c ${name} -o `),
            `compile request ${index} covers ${name}`,
          );
        });
        const archiveLine = native.compilerInvocation.find((line) =>
          line.includes("zig ar "),
        );
        assert(archiveLine != null, "archive request recorded");
        let archiveCursor = 0;
        for (const [index, name] of expectedNames.entries()) {
          const member = `${name.replace(/\.c$/u, "")}-${index}-`;
          const at = archiveLine.indexOf(member, archiveCursor);
          assert.ok(at >= 0, `archive member ${member} appears in order`);
          archiveCursor = at + member.length;
        }
      },
    );
    await host.remove(probeDirectory);
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
  for (const [target, zigTarget] of [
    ["linux-x86_64-gnu", "x86_64-linux-gnu"],
    ["macos-aarch64", "aarch64-macos"],
    ["linux-aarch64-musl", "aarch64-linux-musl"],
  ] as const) {
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
          zigTarget,
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
        /(?:callq?|bl)\s+_?oseo_add(?:@PLT)?/u,
        `${target}: generic fallback retained`,
      );
      assert.doesNotMatch(
        text,
        /(?:callq?|bl)\s+_?oseo_(?:value_is_smi|smi_try_add|value_box_smi)/u,
        `${target}: small-integer primitives inline`,
      );
    } finally {
      await host.remove(directory);
    }
  }

  // 21.4.1.11 and 21.4.1.13 specify MakeTime and MakeDate as IEEE 754-2019
  // arithmetic in a fixed order, so each product rounds to a double before
  // it reaches the sum that follows it. C11 otherwise lets a compiler
  // contract a multiply-add and skip that rounding, which on an AArch64
  // baseline changes
  // `Date.UTC(1970, 0, 213503982336, 0, 0, 0, -18446744073709552000)` from
  // the specified 34447360 to 34448384. The component pins contraction
  // off, so no target may emit a fused multiply-add for it.
  {
    const dateSource = cRuntimeProvider
      .getRuntimeInput()
      .assets.find((asset) => asset.name === "runtime_date.c");
    assert(dateSource != null, "Date runtime component");
    const internalHeader = cRuntimeProvider
      .getRuntimeInput()
      .assets.find((asset) => asset.name === "runtime_internal.h");
    assert(internalHeader != null, "internal runtime header");
    const publicHeader = cRuntimeProvider
      .getRuntimeInput()
      .assets.find((asset) => asset.name === "oseo_runtime.h");
    assert(publicHeader != null, "public runtime header");
    for (const [target, zigTarget] of [
      ["linux-x86_64-gnu", "x86_64-linux-gnu"],
      ["macos-aarch64", "aarch64-macos"],
      ["linux-aarch64-musl", "aarch64-linux-musl"],
    ] as const) {
      const directory = await host.makeTemporaryDirectory("oseo-date-fp-");
      try {
        for (const asset of [publicHeader, internalHeader, dateSource]) {
          await host.writeTextFile(
            `${directory}/${asset.name}`,
            await host.readTextFile(asset.url),
          );
        }
        const assemblyPath = `${directory}/runtime_date.s`;
        const assembly = await host.run({
          args: [
            "cc",
            "-target",
            zigTarget,
            "-std=c11",
            "-O2",
            "-S",
            "-I",
            directory,
            `${directory}/runtime_date.c`,
            "-o",
            assemblyPath,
          ],
          command: "zig",
          cwd: directory,
        });
        assert.equal(assembly.exitStatus, 0, assembly.stderr);
        const text = await host.readTextFile(assemblyPath);
        assert.doesNotMatch(
          text,
          /\b(?:f(?:n?madd|n?msub|mla|mls)|vf(?:n?madd|n?msub))[a-z0-9.]*\s/u,
          `${target}: Date arithmetic keeps every rounding step`,
        );
      } finally {
        await host.remove(directory);
      }
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
      operation: "compile",
      runtime: cRuntimeProvider,
      target: describeTarget("linux-aarch64-musl"),
      toolchain: zigToolchain,
    },
    (cross) => {
      assert.match(cross.emittedC, /switch \(code_id\)/u);
      assert.match(cross.emittedC, /oseo_call_function\(context/u);
      assert.match(cross.emittedC, /result = oseo_function_0\(/u);
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

  const assignmentTdz = await runNativeCli(
    {
      args: ["assignment-tdz.ts"],
      source: "value = 1; let value = 2;",
      sourceId: "assignment-tdz.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(assignmentTdz.exitStatus, 1);
  assert.equal(assignmentTdz.stdout, "");
  assert.match(
    assignmentTdz.stderr,
    /error\[OSEO2001\].*assigned before initialization/u,
  );

  const finallyTdz = await runNativeCli(
    {
      args: ["finally-tdz.ts"],
      source: `function fail() {
  try {
    value;
  } finally {
    console.log("cleanup");
  }
  let value;
}
fail();
`,
      sourceId: "finally-tdz.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(finallyTdz.exitStatus, 1);
  assert.equal(finallyTdz.stdout, "cleanup\n");
  assert.match(
    finallyTdz.stderr,
    /^finally-tdz\.ts:3:\d+: error\[OSEO2001\]: ReferenceError: Binding/u,
  );

  const functionCoercion = await runNativeCli(
    {
      args: ["function-coercion.ts"],
      source: "function probe() {}\nconsole.log(probe + 1);",
      sourceId: "function-coercion.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(functionCoercion.exitStatus, 0);
  assert.equal(functionCoercion.stdout, "function probe() {}1\n");
  assert.equal(functionCoercion.stderr, "");

  const objectTimerDelay = await runNativeCli(
    {
      args: ["object-timer-delay.ts"],
      source: `
function task(value) { console.log(value); }
setTimeout(task, {}, "object delay");
setTimeout(task, function delay() {}, "function delay");
`,
      sourceId: "object-timer-delay.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(objectTimerDelay.exitStatus, 0);
  assert.equal(objectTimerDelay.stderr, "");
  assert.equal(objectTimerDelay.stdout, "object delay\nfunction delay\n");

  const asyncPromiseIdentity = await runNativeCli(
    {
      args: ["async-promise-identity.ts"],
      source: `
let inner;
async function source() { await 0; }
async function wrapper() { inner = source(); return inner; }
const outer = wrapper();
console.log(outer === inner);
`,
      sourceId: "async-promise-identity.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(asyncPromiseIdentity.exitStatus, 0);
  assert.equal(asyncPromiseIdentity.stderr, "");
  assert.equal(asyncPromiseIdentity.stdout, "false\n");

  const asyncPromiseAssimilation = await runNativeCli(
    {
      args: ["async-promise-assimilation.ts"],
      source: `
const inner = Promise.resolve(1);
inner.then = function customThen(onFulfilled) {
  console.log("custom then");
  return onFulfilled(2);
};
async function wrapper() { return inner; }
wrapper().then(function show(value) { console.log(value); });
`,
      sourceId: "async-promise-assimilation.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(asyncPromiseAssimilation.exitStatus, 0);
  assert.equal(asyncPromiseAssimilation.stderr, "");
  assert.equal(asyncPromiseAssimilation.stdout, "custom then\n2\n");

  const rejectionPassThroughLocation = await runNativeCli(
    {
      args: ["rejection-pass-through.ts"],
      source: `async function fail() { throw "failure"; }
async function wrapper() { return fail(); }
wrapper();
console.log("after");
`,
      sourceId: "rejection-pass-through.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(rejectionPassThroughLocation.exitStatus, 1);
  assert.equal(rejectionPassThroughLocation.stdout, "after\n");
  assert.match(
    rejectionPassThroughLocation.stderr,
    /^rejection-pass-through\.ts:1:\d+: error\[OSEO2001\]/u,
  );

  const retargetedArrayTimerDelay = await runNativeCli(
    {
      args: ["retargeted-array-timer-delay.ts"],
      source: `
function task() { console.log("retargeted array delay"); }
const delay = [];
Object.setPrototypeOf(delay, {});
setTimeout(task, delay);
`,
      sourceId: "retargeted-array-timer-delay.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(retargetedArrayTimerDelay.exitStatus, 0);
  assert.equal(retargetedArrayTimerDelay.stderr, "");
  assert.equal(retargetedArrayTimerDelay.stdout, "retargeted array delay\n");

  const inheritedObjectArrayTimerDelay = await runNativeCli(
    {
      args: ["inherited-object-array-timer-delay.ts"],
      source: `
function task() { console.log("inherited object array delay"); }
const delay = Object.create({});
setTimeout(task, [delay]);
`,
      sourceId: "inherited-object-array-timer-delay.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(inheritedObjectArrayTimerDelay.exitStatus, 0);
  assert.equal(inheritedObjectArrayTimerDelay.stderr, "");
  assert.equal(
    inheritedObjectArrayTimerDelay.stdout,
    "inherited object array delay\n",
  );

  const objectLengthArrayTimerDelay = await runNativeCli(
    {
      args: ["object-length-array-timer-delay.ts"],
      source: `
function task() { console.log("object length array delay"); }
const delay = {};
Object.setPrototypeOf(delay, [1]);
delay.length = {
  valueOf: function delayLength() {
    console.log("coerce array length");
    return 1;
  },
};
setTimeout(task, delay);
`,
      sourceId: "object-length-array-timer-delay.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(objectLengthArrayTimerDelay.exitStatus, 0);
  assert.equal(objectLengthArrayTimerDelay.stderr, "");
  assert.equal(
    objectLengthArrayTimerDelay.stdout,
    "coerce array length\nobject length array delay\n",
  );

  const accessorDescriptor = await runNativeCli(
    {
      args: ["accessor-descriptor.ts"],
      source:
        "const value = {};" +
        'Object.defineProperty(value, "item", {' +
        " get: function () { return 42; } });" +
        "console.log(value.item);",
      sourceId: "accessor-descriptor.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(accessorDescriptor.exitStatus, 0);
  assert.equal(accessorDescriptor.stdout, "42\n");
  assert.equal(accessorDescriptor.stderr, "");

  const inheritedAccessorDescriptor = await runNativeCli(
    {
      args: ["inherited-accessor-descriptor.ts"],
      source:
        "const descriptor = Object.create({ " +
        "get: function () { return 42; } }); " +
        "const value = {};" +
        'Object.defineProperty(value, "item", descriptor);' +
        "console.log(value.item);",
      sourceId: "inherited-accessor-descriptor.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(inheritedAccessorDescriptor.exitStatus, 0);
  assert.equal(inheritedAccessorDescriptor.stdout, "42\n");
  assert.equal(inheritedAccessorDescriptor.stderr, "");

  const accessorToDataConversion = await runNativeCli(
    {
      args: ["accessor-to-data-conversion.ts"],
      source:
        "const value = {};" +
        'Object.defineProperty(value, "item", ' +
        "{ get: function () { return 1; }, configurable: true });" +
        'Object.defineProperty(value, "item", { value: 2 });' +
        "console.log(value.item);",
      sourceId: "accessor-to-data-conversion.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(accessorToDataConversion.exitStatus, 0);
  assert.equal(accessorToDataConversion.stdout, "2\n");
  assert.equal(accessorToDataConversion.stderr, "");

  const nonConfigurableAccessorToData = await runNativeCli(
    {
      args: ["non-configurable-accessor-to-data.ts"],
      source:
        "const value = {};" +
        'Object.defineProperty(value, "item", ' +
        "{ get: function () { return 1; }, configurable: false });" +
        'Object.defineProperty(value, "item", { value: 2 });',
      sourceId: "non-configurable-accessor-to-data.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(nonConfigurableAccessorToData.exitStatus, 1);
  assert.equal(nonConfigurableAccessorToData.stdout, "");
  assert.match(
    nonConfigurableAccessorToData.stderr,
    /error\[OSEO2001\]: TypeError: Cannot redefine a non-configurable/u,
  );

  const nonConfigurableDataToAccessor = await runNativeCli(
    {
      args: ["non-configurable-data-to-accessor.ts"],
      source:
        "const value = {};" +
        'Object.defineProperty(value, "item", ' +
        "{ value: 1, configurable: false });" +
        'Object.defineProperty(value, "item", ' +
        "{ get: function () { return 2; } });",
      sourceId: "non-configurable-data-to-accessor.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(nonConfigurableDataToAccessor.exitStatus, 1);
  assert.equal(nonConfigurableDataToAccessor.stdout, "");
  assert.match(
    nonConfigurableDataToAccessor.stderr,
    /error\[OSEO2001\]: TypeError: Cannot redefine a non-configurable/u,
  );

  const nullGetterField = await runNativeCli(
    {
      args: ["null-getter-field.ts"],
      source: 'Object.defineProperty({}, "item", { get: null });',
      sourceId: "null-getter-field.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(nullGetterField.exitStatus, 1);
  assert.equal(nullGetterField.stdout, "");
  assert.match(
    nullGetterField.stderr,
    /error\[OSEO2001\]: TypeError: A property descriptor 'get' field must/u,
  );

  const nullSetterField = await runNativeCli(
    {
      args: ["null-setter-field.ts"],
      source: 'Object.defineProperty({}, "item", { set: null });',
      sourceId: "null-setter-field.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(nullSetterField.exitStatus, 1);
  assert.equal(nullSetterField.stdout, "");
  assert.match(
    nullSetterField.stderr,
    /error\[OSEO2001\]: TypeError: A property descriptor 'set' field must/u,
  );

  const accessorGrowsArrayLength = await runNativeCli(
    {
      args: ["accessor-grows-array-length.ts"],
      source:
        "const array = [1, 2];" +
        'Object.defineProperty(array, "5", ' +
        "{ get: function () { return 9; } });" +
        "console.log(array.length, array[5]);",
      sourceId: "accessor-grows-array-length.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(accessorGrowsArrayLength.exitStatus, 0);
  assert.equal(accessorGrowsArrayLength.stdout, "6 9\n");
  assert.equal(accessorGrowsArrayLength.stderr, "");

  const accessorBlockedByReadOnlyLength = await runNativeCli(
    {
      args: ["accessor-blocked-by-read-only-length.ts"],
      source:
        "const array = [1, 2];" +
        'Object.defineProperty(array, "length", { writable: false });' +
        'Object.defineProperty(array, "5", ' +
        "{ get: function () { return 9; } });",
      sourceId: "accessor-blocked-by-read-only-length.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(accessorBlockedByReadOnlyLength.exitStatus, 1);
  assert.equal(accessorBlockedByReadOnlyLength.stdout, "");
  assert.match(
    accessorBlockedByReadOnlyLength.stderr,
    /error\[OSEO2001\]: TypeError: Cannot extend an array with a/u,
  );

  const inheritedSetterRunsBeforeLengthCheck = await runNativeCli(
    {
      args: ["inherited-setter-runs-before-length-check.ts"],
      source:
        "const array = [1, 2];" +
        'Object.defineProperty(array, "length", { writable: false });' +
        "let received = 0;" +
        "const proto = { set 5(value) { received = value; } };" +
        "Object.setPrototypeOf(array, proto);" +
        "array[5] = 9;" +
        'const descriptor = Object.getOwnPropertyDescriptor(array, "5");' +
        "console.log(array.length, received, descriptor === undefined);",
      sourceId: "inherited-setter-runs-before-length-check.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(inheritedSetterRunsBeforeLengthCheck.exitStatus, 0);
  assert.equal(inheritedSetterRunsBeforeLengthCheck.stdout, "2 9 true\n");
  assert.equal(inheritedSetterRunsBeforeLengthCheck.stderr, "");

  const accessorForArrayLength = await runNativeCli(
    {
      args: ["accessor-for-array-length.ts"],
      source:
        "const array = [1, 2];" +
        'Object.defineProperty(array, "length", ' +
        "{ get: function () { return 9; } });",
      sourceId: "accessor-for-array-length.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(accessorForArrayLength.exitStatus, 1);
  assert.equal(accessorForArrayLength.stdout, "");
  assert.match(
    accessorForArrayLength.stderr,
    /error\[OSEO2001\]: TypeError: Cannot redefine the array length/u,
  );

  const accessorForFunctionPrototype = await runNativeCli(
    {
      args: ["accessor-for-function-prototype.ts"],
      source:
        "function Ctor() {}" +
        'Object.defineProperty(Ctor, "prototype", ' +
        "{ get: function () { return {}; } });",
      sourceId: "accessor-for-function-prototype.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(accessorForFunctionPrototype.exitStatus, 1);
  assert.equal(accessorForFunctionPrototype.stdout, "");
  assert.match(
    accessorForFunctionPrototype.stderr,
    /error\[OSEO2001\]: TypeError: Cannot redefine the prototype/u,
  );

  const accessorBackedDescriptorField = await runNativeCli(
    {
      args: ["accessor-backed-descriptor-field.ts"],
      source:
        "const value = {};" +
        "const descriptor = { get value() { return 7; }, " +
        "enumerable: true, configurable: true, writable: true };" +
        'Object.defineProperty(value, "item", descriptor);' +
        "console.log(value.item);",
      sourceId: "accessor-backed-descriptor-field.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(accessorBackedDescriptorField.exitStatus, 0);
  assert.equal(accessorBackedDescriptorField.stdout, "7\n");
  assert.equal(accessorBackedDescriptorField.stderr, "");

  const accessorBackedDescriptorFieldThrows = await runNativeCli(
    {
      args: ["accessor-backed-descriptor-field-throws.ts"],
      source:
        "const descriptor = { get value() { " +
        'throw new TypeError("boom"); } };' +
        'Object.defineProperty({}, "item", descriptor);',
      sourceId: "accessor-backed-descriptor-field-throws.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(accessorBackedDescriptorFieldThrows.exitStatus, 1);
  assert.equal(accessorBackedDescriptorFieldThrows.stdout, "");
  assert.match(
    accessorBackedDescriptorFieldThrows.stderr,
    /error\[OSEO2001\]: TypeError: boom/u,
  );

  const descriptorFieldReadOrder = await runNativeCli(
    {
      args: ["descriptor-field-read-order.ts"],
      source:
        "const value = {};" +
        'let order = "";' +
        "const descriptor = {" +
        'get enumerable() { order = order + "e"; return true; },' +
        'get configurable() { order = order + "c"; return true; },' +
        'get value() { order = order + "v"; return 1; },' +
        'get writable() { order = order + "w"; return true; },' +
        'get get() { order = order + "g"; return undefined; },' +
        'get set() { order = order + "s"; return undefined; },' +
        "};" +
        "try {" +
        '  Object.defineProperty(value, "item", descriptor);' +
        '  console.log("no throw");' +
        "} catch (error) {" +
        '  console.log("threw", error instanceof TypeError);' +
        "}" +
        "console.log(order);",
      sourceId: "descriptor-field-read-order.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(descriptorFieldReadOrder.exitStatus, 0);
  assert.equal(descriptorFieldReadOrder.stdout, "threw true\necvwgs\n");
  assert.equal(descriptorFieldReadOrder.stderr, "");

  // A DataView owns no Data Block, so the record it publishes is its only
  // allocation. A failed allocation there must report the owned OSEO2001
  // diagnostic and leave no partly built view behind, so the program
  // prints nothing after the marker and exits nonzero.
  const dataViewAllocationHost = {
    ...host,
    async readTextFile(path: string | URL): Promise<string> {
      const source = await host.readTextFile(path);
      if (
        !(path instanceof URL) ||
        !path.pathname.endsWith("/runtime_data_view.c")
      ) {
        return source;
      }
      const injected = source.replace(
        "    OseoDataView *view =\n" +
          "        oseo_internal_allocate_heap_bytes(context, sizeof(*view));",
        "    OseoDataView *view = NULL;",
      );
      assert.notEqual(injected, source, "DataView allocation failure injected");
      return injected;
    },
  };
  const dataViewAllocation = await runNativeCli(
    {
      args: ["data-view-allocation.ts"],
      source:
        'console.log("before");\n' +
        "console.log(new DataView(new ArrayBuffer(8)).byteLength);",
      sourceId: "data-view-allocation.ts",
      version: "0.1.0",
    },
    dataViewAllocationHost,
  );
  assert.equal(dataViewAllocation.exitStatus, 1);
  assert.equal(dataViewAllocation.stdout, "before\n");
  assert.match(
    dataViewAllocation.stderr,
    /error\[OSEO2001\].*DataView allocation failed/u,
  );
  // A Date owns no allocation beyond its own record, so a failed
  // allocation there must report the owned OSEO2001 diagnostic and leave
  // no partly built Date behind: the program prints nothing after the
  // marker and exits nonzero.
  const dateAllocationHost = {
    ...host,
    async readTextFile(path: string | URL): Promise<string> {
      const source = await host.readTextFile(path);
      if (
        !(path instanceof URL) ||
        !path.pathname.endsWith("/runtime_date.c")
      ) {
        return source;
      }
      const injected = source.replace(
        "OseoDate *date = oseo_internal_allocate_heap_bytes(" +
          "context, sizeof(*date));",
        "OseoDate *date = NULL;",
      );
      assert.notEqual(injected, source, "Date allocation failure injected");
      return injected;
    },
  };
  const dateAllocation = await runNativeCli(
    {
      args: ["date-allocation.ts"],
      source: 'console.log("before");\nconsole.log(new Date(0).getTime());',
      sourceId: "date-allocation.ts",
      version: "0.1.0",
    },
    dateAllocationHost,
  );
  assert.equal(dateAllocation.exitStatus, 1);
  assert.equal(dateAllocation.stdout, "before\n");
  assert.match(
    dateAllocation.stderr,
    /error\[OSEO2001\].*Date allocation failed/u,
  );

  /*
   * Four Date observations the reference hosts cannot answer for this
   * profile, so they are native-only rather than differential fixtures.
   *
   * The three locale methods report the text of the operation they
   * localize, because ECMA-402 is outside this claim while both
   * reference hosts implement it. 21.4.3.2's non-normative
   * recommendation that Date.parse recover a toString or toUTCString
   * text holds for a negative year too, which both reference hosts
   * decline. Clause 21.4.4 binds a setter's `t` to the receiver's
   * [[DateValue]] before the argument conversions, so a conversion that
   * stores a new time value into the same Date does not change the
   * result; Deno agrees, while the pinned Node.js host rereads the slot,
   * so the two references disagree and no differential fixture can hold
   * the case. And Date()
   * without new, Date.now(), and an argumentless construction read the
   * host clock, whose value no fixed expectation can name; what is
   * checked is that all three agree to the second and report a time
   * value in the reviewed range.
   */
  const dateHostBoundaries = await runNativeCli(
    {
      args: ["date-host-boundaries.ts"],
      source: `
const value = new Date(-62198755200000);
console.log(
  "locale",
  value.toLocaleString() === value.toString(),
  value.toLocaleDateString() === value.toDateString(),
  value.toLocaleTimeString() === value.toTimeString(),
);
console.log(
  "negative year",
  value.toString(),
  Date.parse(value.toString()) === value.getTime(),
  Date.parse(value.toUTCString()) === value.getTime(),
  Date.parse(value.toISOString()) === value.getTime(),
);
const snapshot = new Date(0);
const mutatingArgument = {
  valueOf() {
    snapshot.setTime(86400000 * 100);
    return 5;
  },
};
const snapshotReturn = snapshot.setUTCDate(mutatingArgument);
const missing = new Date(NaN);
const missingArgument = {
  valueOf() {
    missing.setTime(0);
    return 5;
  },
};
const missingReturn = missing.setUTCDate(missingArgument);
console.log(
  "snapshot",
  snapshotReturn,
  snapshot.getTime(),
  missingReturn,
  missing.getTime(),
);
const now = Date.now();
const constructed = new Date().getTime();
const called = Date.parse(Date());
console.log(
  "clock",
  now === Math.trunc(now),
  Math.abs(now) <= 8.64e15,
  Math.abs(constructed - now) < 60000,
  Math.abs(called - now) < 60000,
  new Date(now).toISOString().length >= 24,
);
`,
      sourceId: "date-host-boundaries.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(dateHostBoundaries.exitStatus, 0, dateHostBoundaries.stderr);
  assert.equal(
    dateHostBoundaries.stdout,
    "locale true true true\n" +
      "negative year Fri Jan 01 -0001 00:00:00 GMT+0000 " +
      "(Coordinated Universal Time) true true true\n" +
      "snapshot 345600000 345600000 NaN 0\n" +
      "clock true true true true true\n",
  );
  assert.equal(dateHostBoundaries.stderr, "");
}
