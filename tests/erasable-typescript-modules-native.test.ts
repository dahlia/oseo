/* eslint-disable no-await-in-loop -- Each native policy has its own build. */
import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  buildModuleGraph,
  compileModuleGraph,
  compileSource,
  describeTarget,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import {
  createFileModuleLoader,
  createNodeHost,
  fileModuleResolver,
} from "../packages/host/src/index.ts";
import {
  babelFrontend,
  babelModuleFrontend,
} from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../packages/testkit/src/index.ts";
import { nativeToolchain } from "./native-toolchain.ts";
import * as erasable from "./native/fixtures/erasable-typescript.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

test(
  "type erasure keeps runtime module requests and removes type bindings",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    const directory = await host.makeTemporaryDirectory(
      "oseo-erasure-modules-",
    );
    const files = {
      "deno.json": '{"compilerOptions":{"verbatimModuleSyntax":true}}',
      "main.mts": `import * as ns from "./entry.mts";
console.log("exports", Object.keys(ns).join(","));`,
      "entry.mts": `
import type { Absent } from "./never-read.ts";
export type * from "./also-never-read.ts";
import { type A } from "./imported.mts";
export { type B } from "./exported.mts";
import { value, type Model } from "./mixed.mts";
export interface Shape { value: number; }
export declare const phantom: number;
export function overload(x: number): number;
export const done = value;
console.log("entry", done);
let calls = 0;
function echo(value) { calls = calls + 1; return value; }
const keptImport = echo
import type { Missing as Boundary } from "./never-read.ts";
(1)
const keptExport = echo
export type { Boundary };
[0]
console.log("boundary", typeof keptImport, typeof keptExport, calls);
`,
      "imported.mts": 'console.log("import"); export type A = number;',
      "exported.mts": 'console.log("export"); export type B = string;',
      "mixed.mts":
        'console.log("mixed"); export const value = 7; ' +
        "export type Model = number;",
    };
    const prior = process.env.OSEO_GC_EVERY_SAFEPOINT;
    try {
      for (const [name, source] of Object.entries(files)) {
        await host.writeTextFile(`${directory}/${name}`, source);
      }
      const entry = `${directory}/main.mts`;
      const expected = {
        exitStatus: 0,
        stderr: "",
        stdout:
          "import\nexport\nmixed\nentry 7\n" +
          "boundary function function 0\nexports done\n",
      };
      const references = await Promise.all([
        host.run({ command: process.execPath, args: [entry], cwd: directory }),
        host.run({
          command: "deno",
          args: ["run", "--quiet", "--config", `${directory}/deno.json`, entry],
          cwd: directory,
        }),
      ]);
      assertMatchingObservations([expected, ...references]);
      const loader = createFileModuleLoader(host);
      const reads: string[] = [];
      const hashes = new Map<string, string>();
      const graph = await buildModuleGraph(
        babelModuleFrontend,
        {
          async load(id, referrer) {
            reads.push(id);
            const loaded = await loader.load(id, referrer);
            if (loaded.source != null) {
              hashes.set(id, loaded.source.sourceHash);
              if (id.endsWith("/entry.mts")) {
                assert.equal(loaded.source.source, files["entry.mts"]);
              }
            }
            return loaded;
          },
        },
        fileModuleResolver,
        pathToFileURL(entry).href,
      );
      assert.deepEqual(graph.diagnostics, []);
      assert.ok(graph.graph != null);
      for (const module of graph.graph.modules) {
        assert.equal(module.sourceHash, hashes.get(module.canonicalId));
      }
      assert.equal(reads.length, 5);
      assert.ok(reads.every((id) => !id.includes("never-read")));
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileModuleGraph(graph.graph, {
          observeSpecialization: true,
          specialization,
        });
        assert.deepEqual(compiled.diagnostics, []);
        assert.ok(compiled.mir != null);
        await withNativeFixture(
          {
            backend: cBackend,
            host,
            input: compiled.mir,
            operation: "execute",
            runtime: cRuntimeProvider,
            target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
            toolchain: nativeToolchain,
          },
          (native) => {
            assertMatchingObservations([expected, native]);
            assert.ok((native.counters?.collections ?? 0) > 0);
          },
        );
      }
    } finally {
      if (prior == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      else process.env.OSEO_GC_EVERY_SAFEPOINT = prior;
      await host.remove(directory);
    }
  },
);

test(
  "fixed erasable syntax fixture matches both reference hosts",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    const fixture = erasable.erasableTypeScriptFixtures[0]!;
    const directory = await host.makeTemporaryDirectory("oseo-erasure-fixed-");
    const prior = process.env.OSEO_GC_EVERY_SAFEPOINT;
    try {
      const path = `${directory}/case.ts`;
      await host.writeTextFile(path, fixture.source);
      const references = await Promise.all([
        host.run({ command: process.execPath, args: [path], cwd: directory }),
        host.run({
          command: "deno",
          args: ["run", "--quiet", path],
          cwd: directory,
        }),
      ]);
      assert.equal(references[0]?.exitStatus, 0, references[0]?.stderr);
      assertMatchingObservations(references);
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          {
            source: fixture.source,
            sourceId: "erasable-fixed.ts",
          },
          { observeSpecialization: true, specialization },
        );
        assert.deepEqual(compiled.diagnostics, []);
        assert.ok(compiled.mir != null);
        await withNativeFixture(
          {
            backend: cBackend,
            host,
            input: compiled.mir,
            operation: "execute",
            runtime: cRuntimeProvider,
            target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
            toolchain: nativeToolchain,
          },
          (native) => {
            assertMatchingObservations([references[0]!, native]);
            assert.ok((native.counters?.collections ?? 0) > 0);
          },
        );
      }
    } finally {
      if (prior == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      else process.env.OSEO_GC_EVERY_SAFEPOINT = prior;
      await host.remove(directory);
    }
  },
);

test(
  "reflected Unicode TypeScript source matches Node stripping",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    const source = `
function f(x: /* λ😀 */ 名 | 𐐀): string { /* keep */ return "x"; }
const arrow = (x)
: 名 => x;
class C<T> { declare hidden: T; m(x: T): T { return x; } }
console.log(
  JSON.stringify(f.toString()), JSON.stringify(arrow.toString()),
  JSON.stringify(C.toString()),
);
`;
    const directory = await host.makeTemporaryDirectory("oseo-erasure-text-");
    const prior = process.env.OSEO_GC_EVERY_SAFEPOINT;
    try {
      const path = `${directory}/case.ts`;
      await host.writeTextFile(path, source);
      const reference = await host.run({
        command: process.execPath,
        args: [path],
        cwd: directory,
      });
      assert.equal(reference.exitStatus, 0, reference.stderr);
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          {
            source,
            sourceId: "unicode-erasure.ts",
          },
          { observeSpecialization: true, specialization },
        );
        assert.deepEqual(compiled.diagnostics, []);
        assert.ok(compiled.mir != null);
        await withNativeFixture(
          {
            backend: cBackend,
            host,
            input: compiled.mir,
            operation: "execute",
            runtime: cRuntimeProvider,
            target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
            toolchain: nativeToolchain,
          },
          (native) => {
            assertMatchingObservations([reference, native]);
            assert.ok((native.counters?.collections ?? 0) > 0);
          },
        );
      }
    } finally {
      if (prior == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      else process.env.OSEO_GC_EVERY_SAFEPOINT = prior;
      await host.remove(directory);
    }
  },
);

test(
  "anonymous abstract default classes retain native values and Node source",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    const directory = await host.makeTemporaryDirectory(
      "oseo-abstract-default-",
    );
    const prior = process.env.OSEO_GC_EVERY_SAFEPOINT;
    const imports =
      'import Typed from "./typed.mts"; import Bare from "./bare.mts";';
    const values = imports + "\nconsole.log(new Typed().value, typeof Bare);";
    const main =
      values +
      "\nconsole.log(JSON.stringify(Typed.toString()), " +
      "JSON.stringify(Bare.toString()));";
    try {
      for (const [name, source] of Object.entries({
        "typed.mts": "export default abstract class { value: number = 7; }",
        "bare.mts": "export default abstract class {}",
        "values.mts": values,
        "main.mts": main,
      }))
        await host.writeTextFile(`${directory}/${name}`, source);
      const valuesPath = `${directory}/values.mts`;
      const valueReferences = await Promise.all([
        host.run({
          command: process.execPath,
          args: [valuesPath],
          cwd: directory,
        }),
        host.run({
          command: "deno",
          args: ["run", "--quiet", valuesPath],
          cwd: directory,
        }),
      ]);
      assertMatchingObservations([
        { exitStatus: 0, stderr: "", stdout: "7 function\n" },
        ...valueReferences,
      ]);
      const entry = `${directory}/main.mts`;
      const reference = await host.run({
        command: process.execPath,
        args: [entry],
        cwd: directory,
      });
      assert.equal(reference.exitStatus, 0, reference.stderr);
      const graph = await buildModuleGraph(
        babelModuleFrontend,
        createFileModuleLoader(host),
        fileModuleResolver,
        pathToFileURL(entry).href,
      );
      assert.deepEqual(graph.diagnostics, []);
      assert.ok(graph.graph != null);
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileModuleGraph(graph.graph, {
          observeSpecialization: true,
          specialization,
        });
        assert.deepEqual(compiled.diagnostics, []);
        assert.ok(compiled.mir != null);
        await withNativeFixture(
          {
            backend: cBackend,
            host,
            input: compiled.mir,
            operation: "execute",
            runtime: cRuntimeProvider,
            target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
            toolchain: nativeToolchain,
          },
          (native) => {
            assertMatchingObservations([reference, native]);
            assert.ok((native.counters?.collections ?? 0) > 0);
          },
        );
      }
    } finally {
      if (prior == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      else process.env.OSEO_GC_EVERY_SAFEPOINT = prior;
      await host.remove(directory);
    }
  },
);
