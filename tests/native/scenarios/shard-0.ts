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
  assert.equal(functionCoercion.exitStatus, 1);
  assert.equal(functionCoercion.stdout, "");
  assert.match(
    functionCoercion.stderr,
    /error\[OSEO2001\].*Function and promise text conversion is unsupported/u,
  );

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
}
