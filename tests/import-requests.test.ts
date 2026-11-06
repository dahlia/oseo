import assert from "node:assert/strict";
import test from "node:test";

import {
  buildModuleGraph,
  buildScriptRequests,
  compileModuleGraph,
  compileSource,
  importCallProfileMessage,
  linkModuleGraph,
  printMir,
  type Diagnostic,
  type ModuleGraphOptions,
  type ModuleLoader,
  type SourceRange,
} from "../packages/compiler/src/index.ts";
import {
  fileModuleResolver,
  hashModuleSource,
} from "../packages/host/src/index.ts";
import {
  babelModuleFrontend,
  createBabelFrontend,
  createBabelModuleFrontend,
} from "../packages/parser-babel/src/index.ts";

const scriptFrontend = createBabelFrontend({ staticSpecifierImports: true });
const moduleFrontend = createBabelModuleFrontend({
  staticSpecifierImports: true,
});

/** An in-memory file loader that reports a missing file as the host does. */
function memoryLoader(files: Readonly<Record<string, string>>): ModuleLoader {
  return {
    load(canonicalId, referrer) {
      const name = canonicalId.slice("file:///app/".length);
      const source = files[name];
      if (source == null) {
        return Promise.resolve({
          diagnostics: [
            {
              byteRange: referrer?.specifier.byteRange ?? { end: 0, start: 0 },
              code: "OSEO3001",
              message: "The module source could not be read.",
              range: referrer?.specifier.range ?? {
                end: { column: 1, line: 1 },
                start: { column: 1, line: 1 },
              },
              sourceId: referrer?.importerId ?? canonicalId,
            },
          ],
        });
      }
      return Promise.resolve({
        diagnostics: [],
        source: {
          kind: name.endsWith(".json") ? "json" : "javascript",
          source,
          sourceHash: hashModuleSource(source),
          sourceId: canonicalId,
        },
      });
    },
  };
}

function graphOf(
  files: Readonly<Record<string, string>>,
  options: ModuleGraphOptions = {},
  frontend = moduleFrontend,
) {
  return buildModuleGraph(
    frontend,
    memoryLoader(files),
    fileModuleResolver,
    "file:///app/main.mjs",
    options,
  );
}

function positionOf(sourceId: string, range: SourceRange): string {
  return `${sourceId}:${range.start.line}:${range.start.column}`;
}

/** One comparable row per diagnostic, with its notes. */
function rows(diagnostics: readonly Diagnostic[]) {
  return diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    message: diagnostic.message,
    notes: diagnostic.notes,
    position: positionOf(diagnostic.sourceId, diagnostic.range),
  }));
}

const files = {
  "dep.mjs": "export const dep = 1;",
  "lazy.mjs": [
    'import { leaf } from "./leaf.mjs";',
    'export const later = () => import("./main.mjs");',
    "export { leaf };",
  ].join("\n"),
  "leaf.mjs": "export const leaf = 2;",
  "main.mjs": [
    'import { dep } from "./dep.mjs";',
    'const lazy = import("./lazy.mjs");',
    'const again = import("./dep.mjs");',
    'const alias = import("./nested/../lazy.mjs");',
  ].join("\n"),
};

test("discovery records every request without new startup edges", async () => {
  const result = await graphOf(files);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.graph);
  const { graph } = result;
  assert.deepEqual(
    graph.modules.map((module) => [module.canonicalId, module.discoveredBy]),
    [
      ["file:///app/main.mjs", undefined],
      ["file:///app/dep.mjs", 0],
      ["file:///app/lazy.mjs", 1],
      ["file:///app/leaf.mjs", 4],
    ],
  );
  // Only static requests are evaluation dependencies.
  assert.deepEqual(
    graph.modules.map((module) =>
      module.dependencies.map((dependency) => dependency.canonicalId),
    ),
    [["file:///app/dep.mjs"], [], ["file:///app/leaf.mjs"], []],
  );
  assert.deepEqual(
    graph.requests?.map((request) => ({
      edgeKind: request.edgeKind,
      index: request.index,
      position: `${request.referrer.kind} ${positionOf(
        request.referrer.id,
        request.range,
      )}`,
      specifier: request.specifier.value,
      targetId: request.targetId,
    })),
    [
      {
        edgeKind: "evaluation",
        index: 0,
        position: "module file:///app/main.mjs:1:21",
        specifier: "./dep.mjs",
        targetId: "file:///app/dep.mjs",
      },
      {
        edgeKind: "discovery",
        index: 1,
        position: "module file:///app/main.mjs:2:14",
        specifier: "./lazy.mjs",
        targetId: "file:///app/lazy.mjs",
      },
      {
        edgeKind: "discovery",
        index: 2,
        position: "module file:///app/main.mjs:3:15",
        specifier: "./dep.mjs",
        targetId: "file:///app/dep.mjs",
      },
      {
        edgeKind: "discovery",
        index: 3,
        position: "module file:///app/main.mjs:4:15",
        specifier: "./nested/../lazy.mjs",
        targetId: "file:///app/lazy.mjs",
      },
      {
        edgeKind: "evaluation",
        index: 4,
        position: "module file:///app/lazy.mjs:1:22",
        specifier: "./leaf.mjs",
        targetId: "file:///app/leaf.mjs",
      },
      {
        edgeKind: "discovery",
        index: 5,
        position: "module file:///app/lazy.mjs:2:28",
        specifier: "./main.mjs",
        targetId: "file:///app/main.mjs",
      },
    ],
  );
  assert.deepEqual(await graphOf(files), result);
  const linked = linkModuleGraph(graph);
  assert.deepEqual(linked.diagnostics, []);
  assert.deepEqual(linked.graph?.evaluationOrder, [
    "file:///app/dep.mjs",
    "file:///app/main.mjs",
  ]);
  assert.equal(linked.graph?.modules.length, 4);
});

test("compilation lowers each discovered import() site", async () => {
  const result = await graphOf(files);
  assert.ok(result.graph);
  const compiled = compileModuleGraph(result.graph);
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir);
  // Each site names its target's constant table index. The table lists
  // the static closure first, then the modules only import() reaches.
  assert.equal(
    printMir(compiled.mir).match(/= call module_import %\d+ /gu)?.length,
    4,
  );
  // A Script compiled without its request closure keeps the profile
  // diagnostic, because no module table names the site's target.
  const script = compileSource(scriptFrontend, {
    source: 'var p;\np = import("./a.js");',
    sourceId: "file:///app/script.js",
  });
  assert.deepEqual(
    script.diagnostics.map((diagnostic) => [
      diagnostic.code,
      diagnostic.message,
      diagnostic.range.start,
    ]),
    [["OSEO1001", importCallProfileMessage, { column: 5, line: 2 }]],
  );
});

test("a Script referrer resolves against its own identity", async () => {
  const parsed = scriptFrontend.parse({
    source: 'import("./self.js");\nimport("./m.mjs");',
    sourceId: "self.js",
  });
  assert.ok(parsed.program);
  const scripts = [
    { canonicalId: "file:///app/self.js", program: parsed.program },
  ];
  const loader = memoryLoader({
    "m.mjs": 'import "./self.js";',
    "self.js": "export const asModule = true;",
  });
  const result = await buildScriptRequests(
    moduleFrontend,
    loader,
    fileModuleResolver,
    scripts,
  );
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.closure);
  // The module with the Script's identity is a separate record that the
  // Script's own request discovered.
  assert.deepEqual(
    result.closure.modules.map((module) => [
      module.canonicalId,
      module.discoveredBy,
    ]),
    [
      ["file:///app/self.js", 0],
      ["file:///app/m.mjs", 1],
    ],
  );
  assert.deepEqual(
    result.closure.requests.map((request) => [
      request.referrer,
      request.edgeKind,
      request.targetId,
    ]),
    [
      [
        { id: "file:///app/self.js", kind: "script" },
        "discovery",
        "file:///app/self.js",
      ],
      [
        { id: "file:///app/self.js", kind: "script" },
        "discovery",
        "file:///app/m.mjs",
      ],
      [
        { id: "file:///app/m.mjs", kind: "module" },
        "evaluation",
        "file:///app/self.js",
      ],
    ],
  );
  // With a module entry, Script requests come first and their targets
  // follow the entry's static closure.
  const withEntry = await graphOf(
    { "m.mjs": "export {};", "main.mjs": 'import "./dep.mjs";', "dep.mjs": "" },
    { scripts },
  );
  assert.equal(withEntry.graph, undefined);
  assert.deepEqual(rows(withEntry.diagnostics), [
    {
      code: "OSEO3001",
      message: "The module source could not be read.",
      notes: undefined,
      position: "file:///app/self.js:1:8",
    },
  ]);
  const ordered = await graphOf(
    {
      "dep.mjs": "",
      "m.mjs": "export {};",
      "main.mjs": 'import "./dep.mjs";',
      "self.js": "export {};",
    },
    { scripts },
  );
  assert.ok(ordered.graph);
  assert.deepEqual(
    ordered.graph.modules.map((module) => module.canonicalId),
    [
      "file:///app/main.mjs",
      "file:///app/dep.mjs",
      "file:///app/self.js",
      "file:///app/m.mjs",
    ],
  );
  assert.deepEqual(
    ordered.graph.requests?.map((request) => request.referrer.kind),
    ["script", "script", "module"],
  );
});

test("the empty specifier fails the build", async () => {
  const result = await graphOf({ "main.mjs": 'import("");' });
  assert.equal(result.graph, undefined);
  assert.deepEqual(rows(result.diagnostics), [
    {
      code: "OSEO3001",
      message: "Unsupported module specifier ''.",
      notes: undefined,
      position: "file:///app/main.mjs:1:8",
    },
  ]);
});

test("an unresolvable or unreadable target fails the build", async () => {
  const result = await graphOf({
    "main.mjs": 'import("bare");\nimport("./lazy.mjs");',
    "lazy.mjs": 'import "./absent.mjs";\nimport("./gone.mjs");',
  });
  assert.equal(result.graph, undefined);
  const chain = ["requested by import() at file:///app/main.mjs:2:1"];
  assert.deepEqual(rows(result.diagnostics), [
    {
      code: "OSEO3001",
      message: "Unsupported module specifier 'bare'.",
      notes: undefined,
      position: "file:///app/main.mjs:1:8",
    },
    {
      code: "OSEO3001",
      message: "The module source could not be read.",
      notes: chain,
      position: "file:///app/lazy.mjs:1:8",
    },
    {
      code: "OSEO3001",
      message: "The module source could not be read.",
      notes: chain,
      position: "file:///app/lazy.mjs:2:8",
    },
  ]);
});

test("a target that cannot parse or link reports its chain", async () => {
  const parse = await graphOf({
    "deep.mjs": "export const = ;",
    "lazy.mjs": 'import "./deep.mjs";',
    "main.mjs": 'import "./dep.mjs";',
    "dep.mjs": 'export const p = () => import("./lazy.mjs");',
  });
  assert.equal(parse.graph, undefined);
  assert.equal(parse.diagnostics.length, 1);
  assert.equal(parse.diagnostics[0]?.sourceId, "file:///app/deep.mjs");
  assert.deepEqual(parse.diagnostics[0]?.notes, [
    "imported by a static request at file:///app/lazy.mjs:1:8",
    "requested by import() at file:///app/dep.mjs:1:24",
    "imported by a static request at file:///app/main.mjs:1:8",
  ]);

  const unadmitted = await graphOf({
    "lazy.mjs": "const name = './x.mjs';\nimport(name);",
    "main.mjs": 'import("./lazy.mjs");',
  });
  assert.deepEqual(rows(unadmitted.diagnostics), [
    {
      code: "OSEO1001",
      message: importCallProfileMessage,
      notes: ["requested by import() at file:///app/main.mjs:1:1"],
      position: "file:///app/lazy.mjs:2:1",
    },
  ]);

  const link = await graphOf({
    "lazy.mjs": 'import { missing } from "./leaf.mjs";\nexport { missing };',
    "leaf.mjs": "export const leaf = 1;",
    "main.mjs": 'import("./lazy.mjs");',
  });
  assert.ok(link.graph);
  const linked = linkModuleGraph(link.graph);
  assert.equal(linked.graph, undefined);
  assert.equal(linked.diagnostics.length, 1);
  assert.deepEqual(linked.diagnostics[0]?.notes, [
    "requested by import() at file:///app/main.mjs:1:1",
  ]);
  // Linking runs before the profile check, so the link failure is what
  // compilation reports.
  assert.deepEqual(
    compileModuleGraph(link.graph).diagnostics,
    linked.diagnostics,
  );
});

test("a JSON target requested without attributes fails discovery", async () => {
  const result = await graphOf({
    "data.json": "{}",
    "main.mjs": 'import("./data.json");',
  });
  assert.deepEqual(rows(result.diagnostics), [
    {
      code: "OSEO2001",
      message: "The module kind does not match its import attributes.",
      notes: undefined,
      position: "file:///app/main.mjs:1:8",
    },
  ]);
});

test("static-only failures keep their diagnostics unchanged", async () => {
  const sources = {
    "dep.mjs": "export const = ;",
    "main.mjs": 'import "./dep.mjs";\nimport "./absent.mjs";',
  };
  const enabled = await graphOf(sources);
  const disabled = await graphOf(sources, {}, babelModuleFrontend);
  assert.deepEqual(enabled, disabled);
  assert.ok(enabled.diagnostics.length > 0);
  for (const diagnostic of enabled.diagnostics) {
    assert.equal(diagnostic.notes, undefined);
  }
});

test("lazy attribute and profile refusals keep the chain", async () => {
  const attribute = await graphOf({
    "data.json": "{}",
    "lazy.mjs": 'import "./data.json" with { unknown: "json" };',
    "main.mjs": 'import("./lazy.mjs");',
  });
  assert.deepEqual(rows(attribute.diagnostics), [
    {
      code: "OSEO2001",
      message: "Unsupported static import attribute.",
      notes: ["requested by import() at file:///app/main.mjs:1:1"],
      position: "file:///app/lazy.mjs:1:29",
    },
  ]);

  // A form outside the subset in a module that only import() reaches is
  // a frontend refusal that names how the module was reached.
  const profile = await graphOf({
    "lazy.mjs": "const name = './deeper.mjs';\nimport(name);",
    "main.mjs": 'import "./static.mjs";\nimport("./lazy.mjs");',
    "static.mjs": "export {};",
  });
  assert.deepEqual(rows(profile.diagnostics), [
    {
      code: "OSEO1001",
      message: importCallProfileMessage,
      notes: ["requested by import() at file:///app/main.mjs:2:1"],
      position: "file:///app/lazy.mjs:2:1",
    },
  ]);
});
