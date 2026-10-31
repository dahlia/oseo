import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildModuleGraph,
  compileModuleGraph,
  linkModuleGraph,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import {
  babelFrontend,
  babelModuleFrontend,
} from "../packages/parser-babel/src/index.ts";

const script = "var smoosh; function smoosh() {}";

/** These graphs preserve the three DS-11 target-validation subjects. */
const graphs = {
  goal: {
    "entry.mjs": 'import "./target.mjs"; console.log("evaluated");',
    "target.mjs": script,
  },
  ambiguous: {
    "entry.mjs": 'export { x } from "./stars.mjs"; console.log("evaluated");',
    "stars.mjs": 'export * from "./a.mjs"; export * from "./b.mjs";',
    "a.mjs": "export var x;",
    "b.mjs": "export var x;",
  },
  circular: {
    "entry.mjs": 'export { x } from "./other.mjs"; console.log("evaluated");',
    "other.mjs": 'export { x } from "./entry.mjs";',
  },
} as const;

/** Build actual parsed source graphs; no hand-constructed syntax nodes. */
async function graphOf(sources: Readonly<Record<string, string>>) {
  return await buildModuleGraph(
    babelModuleFrontend,
    {
      load(canonicalId) {
        const name = new URL(canonicalId).pathname.slice(1);
        const source = sources[name];
        assert.ok(source != null, name);
        return Promise.resolve({
          diagnostics: [],
          source: {
            kind: "javascript" as const,
            source,
            sourceHash: source,
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
    "file:///entry.mjs",
  );
}

for (const directive of ["", '"use strict";\n']) {
  const mode = directive === "" ? "sloppy" : "strict";
  test(`Script accepts var/function collision (${mode})`, () => {
    const result = babelFrontend.parse({
      source: directive + script,
      sourceId: "script.js",
    });
    assert.equal(result.parsed, true);
    assert.deepEqual(result.diagnostics, []);
  });
}

test("the same var/function collision is a Module early error", () => {
  const result = babelModuleFrontend.parseModule({
    source: script,
    sourceId: "target.mjs",
  });
  assert.equal(result.module, undefined);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.code, "OSEO0001");
  assert.equal(result.diagnostics[0]?.sourceId, "target.mjs");
});

test("a static dependency is parsed with the Module goal", async () => {
  const result = await graphOf(graphs.goal);
  assert.equal(result.graph, undefined);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.code, "OSEO0001");
  assert.equal(result.diagnostics[0]?.sourceId, "file:///target.mjs");
});

for (const kind of ["ambiguous", "circular"] as const) {
  test(`indirect export validation rejects ${kind} resolution`, async () => {
    const parsed = await graphOf(graphs[kind]);
    assert.deepEqual(parsed.diagnostics, []);
    assert.ok(parsed.graph);
    assert.equal(parsed.graph.modules.length, kind === "ambiguous" ? 4 : 2);
    const linked = linkModuleGraph(parsed.graph);
    assert.equal(linked.graph, undefined);
    assert.ok(linked.diagnostics.length > 0);
    assert.ok(linked.diagnostics.every((entry) => entry.code === "OSEO2001"));
    assert.ok(
      linked.diagnostics.some(
        (entry) => entry.sourceId === "file:///entry.mjs",
      ),
    );
    assert.match(
      linked.diagnostics[0]?.message ?? "",
      kind === "ambiguous" ? /ambiguous/u : /resolve|circular|export/u,
    );
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileModuleGraph(parsed.graph, { specialization });
      assert.equal(compiled.mir, undefined);
      assert.deepEqual(compiled.diagnostics, linked.diagnostics);
    }
  });
}

test("unrequested star ambiguity does not invalidate a Module", async () => {
  const parsed = await graphOf({
    ...graphs.ambiguous,
    "entry.mjs": 'import * as ns from "./stars.mjs";',
  });
  assert.deepEqual(parsed.diagnostics, []);
  assert.ok(parsed.graph);
  const linked = linkModuleGraph(parsed.graph);
  assert.deepEqual(linked.diagnostics, []);
  assert.ok(linked.graph);
  assert.deepEqual(
    linked.graph.modules.find((entry) =>
      entry.canonicalId.endsWith("stars.mjs"),
    )?.namespaceNames,
    [],
  );
});

test("a concrete binding resolves through a re-export cycle", async () => {
  const parsed = await graphOf({
    "entry.mjs": 'export { x } from "./other.mjs";',
    "other.mjs": 'import "./entry.mjs"; export var x = 42;',
  });
  assert.deepEqual(parsed.diagnostics, []);
  assert.ok(parsed.graph);
  const linked = linkModuleGraph(parsed.graph);
  assert.deepEqual(linked.diagnostics, []);
  assert.ok(linked.graph);
  const cells = linked.graph.modules.map(
    (entry) => entry.exports.find((item) => item.exportedName === "x")?.cellId,
  );
  assert.ok(cells[0] != null);
  assert.equal(cells[0], cells[1]);
});

test("the usage graph has one target and three namespace cells", async () => {
  const sources = Object.fromEntries(
    ["entry.mjs", "target.mjs"].map((name) => [
      name,
      readFileSync(
        new URL(`./fixtures/module-goal-validation/${name}`, import.meta.url),
        "utf8",
      ),
    ]),
  );
  const parsed = await graphOf(sources);
  assert.deepEqual(parsed.diagnostics, []);
  assert.ok(parsed.graph);
  assert.equal(parsed.graph.modules.length, 2);
  const linked = linkModuleGraph(parsed.graph);
  assert.deepEqual(linked.diagnostics, []);
  assert.ok(linked.graph);
  const target = linked.graph.modules.find(
    (entry) => entry.canonicalId === "file:///target.mjs",
  );
  assert.deepEqual(target?.namespaceNames, ["default", "x", "z"]);
  assert.equal(new Set(target?.exports.map((entry) => entry.cellId)).size, 3);
  const compiled = compileModuleGraph(parsed.graph);
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir);
});

for (const kind of ["goal", "ambiguous", "circular"] as const) {
  test(`reference ${kind} rejection precedes evaluation`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "oseo-module-goal-"));
    try {
      await Promise.all(
        Object.entries(graphs[kind]).map(async ([name, source]) => {
          await writeFile(join(directory, name), source);
        }),
      );
      const host = createNodeHost();
      const results = await Promise.all(
        (
          [
            [process.execPath, [join(directory, "entry.mjs")]],
            ["deno", ["run", "--quiet", join(directory, "entry.mjs")]],
          ] as const
        ).map(async ([command, args]) => {
          return await host.run({ command, args, cwd: directory });
        }),
      );
      for (const result of results) {
        assert.notEqual(result.exitStatus, 0);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, /SyntaxError/u);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
