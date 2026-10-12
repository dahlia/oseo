/* eslint-disable no-await-in-loop -- Native observations are isolated. */
import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  buildModuleGraph,
  compileModuleGraph,
  describeTarget,
  linkModuleGraph,
  printMir,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import {
  createFileModuleLoader,
  createNodeHost,
  fileModuleResolver,
} from "../../packages/host/src/index.ts";
import { babelModuleFrontend } from "../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import { withNativeFixture } from "../../packages/testkit/src/index.ts";
import { runNativeCli } from "../native-cli.ts";
import { hostCcLane, nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty, propertySize } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);
const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const skip = nativeTarget == null ? "requires a supported native host" : false;
const fixture = fileURLToPath(
  new URL("../fixtures/import-attributes/entry.mjs", import.meta.url),
);

async function referenceOutputs(entry: string): Promise<readonly string[]> {
  const outputs: string[] = [];
  for (const request of [
    { command: process.execPath, args: [entry] },
    { command: "deno", args: ["run", "--quiet", "--allow-read", entry] },
  ]) {
    const result = await host.run({ ...request, cwd: process.cwd() });
    assert.equal(result.exitStatus, 0, result.stderr);
    assert.equal(result.stderr, "");
    outputs.push(result.stdout);
  }
  return outputs;
}

async function observeNative(entry: string, expected: string): Promise<void> {
  for (const specialization of ["disabled", "enabled"] as const) {
    const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      const result = await runNativeCli(
        {
          args: [
            ...(specialization === "disabled" ? ["--no-specialization"] : []),
            entry,
          ],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(result.exitStatus, 0, result.stderr);
      assert.equal(result.stderr, "");
      assert.equal(result.stdout, expected);
    } finally {
      if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
    }
  }
}

test(
  "JSON link initializes undefined before scheduled publication",
  { skip },
  async () => {
    const entry = fileURLToPath(
      new URL(
        "../fixtures/import-attributes/publication-entry.mjs",
        import.meta.url,
      ),
    );
    // Synthetic Link initializes the cell; Evaluate publishes parsed data.
    // The observer's only dependency is the evaluating source entry cycle.
    const expected = "linked undefined undefined\nevaluated object 262\n";
    for (const output of await referenceOutputs(entry)) {
      assert.equal(output, expected);
    }
    await observeNative(entry, expected);
  },
);

test(
  "JSON publication runs while its cyclic observer awaits",
  { skip },
  async () => {
    const entry = fileURLToPath(
      new URL(
        "../fixtures/import-attributes/publication-async-entry.mjs",
        import.meta.url,
      ),
    );
    const expected =
      "linked undefined\nresumed object 262\nevaluated object 262\n";
    for (const output of await referenceOutputs(entry)) {
      assert.equal(output, expected);
    }
    await observeNative(entry, expected);
  },
);

test(
  "static JSON identity survives cycles, mutation and collection",
  { skip },
  async () => {
    const expected = [
      "identity true true",
      "namespace true",
      "keys default",
      "values 262 1/x//true",
      "data key true",
      "prototype true",
      "negative zero true",
      "extensible true",
      "array extensible true",
      "hint 263 x1",
      "read 262",
      "shape miss 262",
      "shared mutation 2 1",
      "",
    ].join("\n");
    for (const output of await referenceOutputs(fixture)) {
      assert.equal(output, expected);
    }
    await observeNative(fixture, expected);
    const graph = await buildModuleGraph(
      babelModuleFrontend,
      createFileModuleLoader(host),
      fileModuleResolver,
      pathToFileURL(fixture).href,
    );
    assert.ok(graph.graph);
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileModuleGraph(graph.graph, {
        observeSpecialization: true,
        specialization,
      });
      assert.deepEqual(compiled.diagnostics, []);
      assert.ok(compiled.mir);
      const text = printMir(compiled.mir);
      if (specialization === "enabled") {
        assert.match(text, /guard-smi/u);
        assert.match(text, /guard-shape/u);
        assert.match(text, /generic-fallback/u);
      } else assert.doesNotMatch(text, /guard-(?:smi|shape)/u);
      const synthetic = compiled.hir?.body.filter(
        (statement) =>
          statement.kind === "let" &&
          statement.name === "*default:0*" &&
          statement.initializer.kind === "undefined",
      );
      assert.equal(synthetic?.length, 1);
      const prepared = compiled.hir?.body.filter(
        (statement) =>
          statement.kind === "const" &&
          statement.name.startsWith("*json-data:"),
      );
      assert.equal(prepared?.length, 1);
      const publication = compiled.hir?.functions.flatMap((functionValue) =>
        functionValue.body.filter(
          (statement) =>
            statement.kind === "expression" &&
            statement.expression.kind === "binding-set" &&
            statement.expression.name === "*default:0*" &&
            statement.expression.value.kind === "binding" &&
            statement.expression.value.name.startsWith("*json-data:"),
        ),
      );
      assert.equal(publication?.length, 1);
      if (!hostCcLane) {
        await withNativeFixture(
          {
            backend: cBackend,
            host,
            input: compiled.mir,
            operation: "compile",
            runtime: cRuntimeProvider,
            target: describeTarget("linux-aarch64-musl"),
            toolchain: nativeToolchain,
          },
          (cross) => {
            const invocations = cross.compilerInvocation.filter((line) =>
              line.startsWith("zig cc "),
            );
            assert.ok(invocations.length > 0);
            assert.ok(
              invocations.every((line) => line.includes("aarch64-linux-musl")),
            );
          },
        );
      }
    }
  },
);

test("generated invalid JSON requests preserve diagnostic phases", async () => {
  const violationArbitrary = fc.record({
    violation: fc.constantFrom(
      "missing-type",
      "unknown-key",
      "wrong-type",
      "duplicate-key",
      "invalid-json",
      "named-export",
      "json-entry",
    ),
    answer: fc.integer({ min: -1000, max: 1000 }),
    extraBindings: fc.integer({ min: 0, max: 2 }),
  });
  await assertAsyncProperty(
    "invalid static JSON request boundaries",
    fc.asyncProperty(violationArbitrary, async (value) => {
      const { violation, answer, extraBindings } = value;
      const clause =
        violation === "missing-type"
          ? ""
          : violation === "unknown-key"
            ? 'with {unknown:"json"}'
            : violation === "wrong-type"
              ? 'with {type:"javascript"}'
              : violation === "duplicate-key"
                ? 'with {type:"json", "type":"json"}'
                : 'with {type:"json"}';
      const aliases = Array.from(
        { length: extraBindings },
        (_, index) => `answer as alias${index}`,
      );
      const binding =
        violation === "named-export"
          ? "{answer}"
          : aliases.length === 0
            ? "second"
            : `second, {${aliases.join(",")}}`;
      const source = [
        'import first from "./data.json" with {type:"json"};',
        `import ${binding} from "././data.json" ${clause};`,
      ].join("\n");
      const result = await buildModuleGraph(
        babelModuleFrontend,
        {
          load(canonicalId) {
            return Promise.resolve({
              diagnostics: [],
              source: canonicalId.endsWith(".json")
                ? {
                    kind: "json",
                    source:
                      violation === "invalid-json"
                        ? `{"answer":${answer},}`
                        : `{"answer":${answer}}`,
                    sourceHash: `json:${answer}`,
                    sourceId: canonicalId,
                  }
                : {
                    source,
                    sourceHash: "entry",
                    sourceId: canonicalId,
                  },
            });
          },
        },
        {
          resolve(importerId, specifier) {
            return {
              canonicalId: new URL(specifier.value, importerId).href,
              diagnostics: [],
            };
          },
        },
        violation === "json-entry"
          ? "file:///app/data.json"
          : "file:///app/entry.mjs",
      );
      const diagnostics =
        result.graph == null
          ? result.diagnostics
          : linkModuleGraph(result.graph).diagnostics;
      assert.equal(diagnostics.length, 1);
      assert.equal(
        diagnostics[0]?.code,
        violation === "duplicate-key" ? "OSEO0001" : "OSEO2001",
      );
      if (violation === "json-entry") {
        assert.equal(
          diagnostics[0]?.message,
          "A JSON module cannot be the entry module.",
        );
        assert.equal(diagnostics[0]?.sourceId, "file:///app/data.json");
        assert.deepEqual(diagnostics[0]?.byteRange, { start: 0, end: 0 });
        assert.equal(diagnostics[0]?.range.start.line, 1);
        assert.equal(diagnostics[0]?.range.start.column, 1);
      }
      if (
        violation === "missing-type" ||
        violation === "wrong-type" ||
        violation === "unknown-key" ||
        violation === "duplicate-key"
      ) {
        assert.equal(diagnostics[0]?.range.start.line, 2);
      }
    }),
    {
      domain:
        "valid closed graphs mutated at one static attribute, JSON " +
        "grammar, named-import or JSON entry boundary; up to three bindings; " +
        "shrinking keeps alias identity and distinct request locations",
      numRuns: 16,
      profile: "M5c static import attributes and JSON modules",
      seed: 0x6000_8601,
      sizeLimit: "two requests, one JSON dependency and one invalid mutation",
      timeLimitMilliseconds: 30_000,
    },
  );
});

test("generated JavaScript requests typed as JSON are rejected", async () => {
  const mismatchArbitrary = fc.record({
    form: fc.constantFrom(
      "default",
      "namespace",
      "named",
      "export-from",
      "side-effect",
    ),
    answer: fc.integer({ min: -1000, max: 1000 }),
    untypedAlias: fc.constantFrom("none", "before", "after"),
  });
  await assertAsyncProperty(
    "JavaScript dependency requested with the JSON type",
    fc.asyncProperty(mismatchArbitrary, async (value) => {
      const { form, answer, untypedAlias } = value;
      const typed =
        form === "default"
          ? 'import value from "./plain.js" with {type:"json"};'
          : form === "namespace"
            ? 'import * as value from "./plain.js" with {type:"json"};'
            : form === "named"
              ? 'import {answer} from "./plain.js" with {type:"json"};'
              : form === "export-from"
                ? 'export {default as value} from "./plain.js" ' +
                  'with {type:"json"};'
                : 'import "./plain.js" with {type:"json"};';
      const untyped = 'import plain from "././plain.js";';
      const lines = [
        'import first from "./data.json" with {type:"json"};',
        ...(untypedAlias === "before" ? [untyped] : []),
        typed,
        ...(untypedAlias === "after" ? [untyped] : []),
      ];
      const source = lines.join("\n");
      const typedLine = lines.indexOf(typed);
      const typedStart =
        new TextEncoder().encode(lines.slice(0, typedLine).join("\n")).length +
        1 +
        typed.indexOf('"./plain.js"');
      const result = await buildModuleGraph(
        babelModuleFrontend,
        {
          load(canonicalId) {
            return Promise.resolve({
              diagnostics: [],
              source: canonicalId.endsWith(".json")
                ? {
                    kind: "json",
                    source: `{"answer":${answer}}`,
                    sourceHash: `json:${answer}`,
                    sourceId: canonicalId,
                  }
                : canonicalId.endsWith("/plain.js")
                  ? {
                      source:
                        `export default ${answer};\n` +
                        `export const answer = ${answer};`,
                      sourceHash: `plain:${answer}`,
                      sourceId: canonicalId,
                    }
                  : { source, sourceHash: "entry", sourceId: canonicalId },
            });
          },
        },
        {
          resolve(importerId, specifier) {
            return {
              canonicalId: new URL(specifier.value, importerId).href,
              diagnostics: [],
            };
          },
        },
        "file:///app/entry.mjs",
      );
      assert.equal(result.graph, undefined);
      assert.deepEqual(
        result.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          line: diagnostic.range.start.line,
          message: diagnostic.message,
          sourceId: diagnostic.sourceId,
          start: diagnostic.byteRange.start,
          end: diagnostic.byteRange.end,
        })),
        [
          {
            code: "OSEO2001",
            line: typedLine + 1,
            message: "The module kind does not match its import attributes.",
            sourceId: "file:///app/entry.mjs",
            start: typedStart,
            end: typedStart + '"./plain.js"'.length,
          },
        ],
      );
    }),
    {
      domain:
        "closed graphs with one JavaScript dependency requested with the " +
        "JSON type through a default, namespace, named, re-export or " +
        "side-effect request, with no, earlier or later untyped alias",
      numRuns: 16,
      profile: "M5c static import attributes and JSON modules",
      seed: 0x6000_8602,
      sizeLimit: "three requests, one JSON and one JavaScript dependency",
      timeLimitMilliseconds: 30_000,
    },
  );
});

interface JsonGraphCase {
  readonly answer: number;
  readonly duplicate: number;
  readonly leadingBomCount: number;
  readonly observerFirst: boolean;
  readonly units: readonly number[];
}
const large = propertySize() === "large";
const graphArbitrary: fc.Arbitrary<JsonGraphCase> = fc.record({
  answer: fc.integer({ min: -1_000_000, max: 1_000_000 }),
  duplicate: fc.integer({ min: -1_000_000, max: 1_000_000 }),
  leadingBomCount: fc.integer({ min: 0, max: 2 }),
  observerFirst: fc.boolean(),
  units: fc.array(fc.integer({ min: 0, max: 0xffff }), {
    maxLength: large ? 24 : 12,
  }),
});

test(
  "generated static JSON graphs preserve default data identity",
  { skip },
  async () => {
    await assertAsyncProperty(
      "static JSON graph identity and data construction",
      fc.asyncProperty(graphArbitrary, async (value) => {
        const directory =
          await host.makeTemporaryDirectory("oseo-json-module-");
        let succeeded = false;
        try {
          const text = String.fromCharCode(...value.units);
          const json =
            "\uFEFF".repeat(value.leadingBomCount) +
            '{"answer":' +
            value.answer +
            ',"dup":0,"dup":' +
            value.duplicate +
            ',"units":' +
            JSON.stringify(text) +
            ',"__proto__":{"safe":true},"zero":-0}';
          await host.writeTextFile(`${directory}/data.json`, json);
          await host.writeTextFile(
            `${directory}/cycle.mjs`,
            [
              'import {publication} from "./entry.mjs";',
              'export {publication as data} from "./entry.mjs";',
              'console.log("publication", typeof publication);',
            ].join("\n"),
          );
          const entry = `${directory}/entry.mjs`;
          await host.writeTextFile(
            entry,
            [
              ...(value.observerFirst
                ? ['import {data} from "./cycle.mjs";']
                : []),
              'import first from "./data.json" with {type:"json"};',
              'import second from "././data.json" with {type:"json"};',
              ...(!value.observerFirst
                ? ['import {data} from "./cycle.mjs";']
                : []),
              'export {default as publication} from "./data.json" ' +
                'with {type:"json"};',
              'import * as ns from "./data.json" with {type:"json"};',
              'console.log("identity", first===second, first===data,',
              "  first===ns.default);",
              'console.log("values", first.answer, first.dup,',
              `  first.units === ${JSON.stringify(text)}, first.units.length);`,
              'console.log("key", Object.hasOwn(first,"__proto__"),',
              "  Object.getPrototypeOf(first)===Object.prototype);",
              'console.log("zero", Object.is(first.zero,-0));',
              "/** @param {number} left @param {number} right */",
              "function hinted(left,right) { return left+right; }",
              'console.log("hint", hinted(first.answer,1), hinted("x",1));',
              "function read(value) { return value.answer; }",
              'console.log("hit",read(first));',
              "first.extra=1;",
              'console.log("miss",read(first),data.extra);',
            ].join("\n"),
          );
          const expected = [
            `publication ${value.observerFirst ? "undefined" : "object"}`,
            "identity true true true",
            `values ${value.answer} ${value.duplicate} true ` +
              value.units.length,
            "key true true",
            "zero true",
            `hint ${value.answer + 1} x1`,
            `hit ${value.answer}`,
            `miss ${value.answer} 1`,
            "",
          ].join("\n");
          for (const output of await referenceOutputs(entry)) {
            assert.equal(output, expected);
          }
          await observeNative(entry, expected);
          succeeded = true;
        } catch (error) {
          throw new Error(`JSON graph artifacts retained at ${directory}`, {
            cause: error,
          });
        } finally {
          if (succeeded) await host.remove(directory);
        }
      }),
      {
        context: [`target=${nativeTarget?.name ?? "unsupported"}`],
        domain:
          "closed three-node cycles with both JSON evaluation orders, " +
          "aliases, zero to two leading BOMs, duplicate data keys, " +
          "UTF-16 strings, negative zero, false hints and shape mutation; " +
          "shrinking retains the closed cycle and explicit request order",
        numRuns: 8,
        profile: "M5c static import attributes and JSON modules",
        seed: 0x6000_8600,
        sizeLimit: large ? "24 UTF-16 units" : "12 UTF-16 units",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
