import assert from "node:assert/strict";
import test from "node:test";

import { defaultComponents } from "../packages/cli/src/index.ts";
import {
  buildModuleGraph,
  linkModuleGraph,
} from "../packages/compiler/src/index.ts";
import {
  createFileModuleLoader,
  createNodeHost,
  fileModuleResolver,
} from "../packages/host/src/index.ts";

async function graphFor(source: string, abi = "m5-process-test") {
  const host = { ...createNodeHost(), readTextFile: async () => source };
  let parses = 0;
  const result = await buildModuleGraph(
    {
      parseModule(input) {
        parses += 1;
        return defaultComponents.moduleFrontend.parseModule(input);
      },
    },
    createFileModuleLoader(host, abi),
    fileModuleResolver,
    "file:///process-entry.ts",
  );
  return { ...result, parses };
}

test("builtin nodes carry identity and ABI digest without syntax", async () => {
  const source = `import p from "node:process";
import * as p2 from "node:process";
import fs from "node:fs";`;
  const result = await graphFor(source);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.graph);
  assert.equal(result.parses, 1);
  assert.equal(result.graph.modules.length, 3);
  for (const node of result.graph.modules.slice(1)) {
    assert.equal(node.moduleKind, "builtin");
    assert.equal("syntax" in node, false);
    assert.deepEqual(node.dependencies, []);
    assert.deepEqual(node.resolutions, []);
    assert.match(node.sourceHash, /^fnv1a64:/u);
  }
  assert.deepEqual(linkModuleGraph(result.graph).diagnostics, []);
  const changed = await graphFor(source, "changed-runtime-abi");
  assert.notEqual(
    result.graph.modules[1]?.sourceHash,
    changed.graph?.modules[1]?.sourceHash,
  );
});

test("builtin missing exports are link errors", async () => {
  await Promise.all(
    [
      ["node:process", "exitCode"],
      ["node:fs", "writeFileSync"],
    ].map(async ([specifier, name]) => {
      const result = await graphFor(`import {${name}} from "${specifier}";`);
      assert.ok(result.graph);
      const linked = linkModuleGraph(result.graph);
      assert.equal(linked.diagnostics[0]?.code, "OSEO2001");
      assert.match(linked.diagnostics[0]?.message ?? "", /has no export/u);
    }),
  );
});

test("other node modules and bare aliases remain unsupported", async () => {
  await Promise.all(
    ["node:path", "node:fs/promises", "fs", "process"].map(
      async (specifier) => {
        const result = await graphFor(`import value from "${specifier}";`);
        assert.equal(result.diagnostics[0]?.code, "OSEO3001");
        if (specifier.startsWith("node:")) {
          assert.match(
            result.diagnostics[0]?.message ?? "",
            /node:process and node:fs/u,
          );
        }
      },
    ),
  );
});

test("builtin import attributes cannot request JSON", async () => {
  const result = await graphFor(
    'import fs from "node:fs" with {type: "json"};',
  );
  assert.equal(result.diagnostics[0]?.code, "OSEO2001");
  assert.match(result.diagnostics[0]?.message ?? "", /import attributes/u);
});

test("direct builtin loading rejects unsupported node URLs", async () => {
  const loaded =
    await createFileModuleLoader(createNodeHost()).load("node:path");
  assert.equal(loaded.diagnostics[0]?.code, "OSEO3001");
  assert.match(
    loaded.diagnostics[0]?.message ?? "",
    /node:process and node:fs/u,
  );
});

test("default builtin digest uses the implementing runtime ABI", async () => {
  const host = createNodeHost();
  const explicit = createFileModuleLoader(
    host,
    defaultComponents.runtime.getRuntimeInput().abiVersion,
  );
  const implicit = createFileModuleLoader(host);
  await Promise.all(
    ["node:process", "node:fs"].map(async (specifier) => {
      assert.deepEqual(
        await implicit.load(specifier),
        await explicit.load(specifier),
      );
    }),
  );
});
