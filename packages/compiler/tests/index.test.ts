import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHir,
  buildMir,
  buildModuleGraph,
  canExecuteTarget,
  compileModuleGraph,
  describeTarget,
  printHir,
  printMir,
  renderDiagnostic,
  targetForExecutionHost,
  linkModuleGraph,
} from "../src/index.ts";
import type {
  Diagnostic,
  DiagnosticCode,
  Hint,
  ModuleGraph,
  SourceRange,
  SyntaxModule,
  SyntaxModuleSpecifier,
  SyntaxProgram,
} from "../src/index.ts";

const diagnostic: Diagnostic = {
  byteRange: { end: 0, start: 0 },
  code: "OSEO1001",
  message: "Unsupported syntax.",
  range: {
    end: { column: 1, line: 1 },
    start: { column: 1, line: 1 },
  },
  sourceId: "fixture.ts",
};

test("renders an owned source-located diagnostic", () => {
  assert.equal(
    renderDiagnostic(diagnostic),
    "fixture.ts:1:1: error[OSEO1001]: Unsupported syntax.",
  );
});

test("renders every owned diagnostic class without a host stack", () => {
  const codes: readonly DiagnosticCode[] = [
    "OSEO0001",
    "OSEO1001",
    "OSEO2001",
    "OSEO3001",
  ];
  for (const code of codes) {
    const rendered = renderDiagnostic({ ...diagnostic, code });
    assert.match(rendered, new RegExp(`error\\[${code}\\]`, "u"));
    assert.doesNotMatch(rendered, /Error:| at /u);
  }
});

test("requires explicit native and cross targets", () => {
  const linuxHost = {
    architecture: "x86_64",
    operatingSystem: "linux",
  } as const;
  const macHost = {
    architecture: "aarch64",
    operatingSystem: "macos",
  } as const;
  assert.equal(targetForExecutionHost(linuxHost)?.name, "x86_64-linux-gnu");
  assert.equal(targetForExecutionHost(macHost)?.name, "aarch64-macos");
  assert.ok(canExecuteTarget(linuxHost, describeTarget("x86_64-linux-gnu")));
  assert.ok(canExecuteTarget(macHost, describeTarget("aarch64-macos")));
  assert.ok(!canExecuteTarget(macHost, describeTarget("aarch64-linux-musl")));
  assert.ok(
    !canExecuteTarget(
      { architecture: "aarch64", operatingSystem: "linux" },
      describeTarget("aarch64-linux-musl"),
    ),
  );
  assert.equal(
    targetForExecutionHost({
      architecture: "unknown",
      operatingSystem: "unknown",
    }),
    undefined,
  );
  assert.throws(
    () => describeTarget("unknown" as never),
    /Unsupported native target/u,
  );
});

const range: SourceRange = {
  end: { column: 2, line: 1 },
  start: { column: 1, line: 1 },
};

test("resolves owned syntax and prints deterministic generic IR", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        expression: {
          arguments: [{ kind: "number", range, value: 42 }],
          kind: "call",
          range,
          target: { kind: "console-log", range },
        },
        kind: "expression",
        range,
      },
      {
        alternate: {
          body: [],
          kind: "block",
          range,
        },
        consequent: {
          body: [],
          kind: "block",
          range,
        },
        kind: "if",
        range,
        test: { kind: "boolean", range, value: true },
      },
    ],
    kind: "program",
    range,
    sourceId: "fixture.ts",
  };
  const hirResult = buildHir(syntax);
  assert.deepEqual(hirResult.diagnostics, []);
  assert.ok(hirResult.program != null);
  const firstHir = printHir(hirResult.program);
  assert.equal(printHir(hirResult.program), firstHir);
  assert.match(firstHir, /call intrinsic console\.log/u);

  const mir = buildMir(hirResult.program);
  const firstMir = printMir(mir);
  assert.equal(printMir(mir), firstMir);
  assert.match(firstMir, /safepoint console_log/u);
  assert.match(firstMir, /check-status/u);
  assert.match(firstMir, /root-store/u);
  assert.match(firstMir, /branch %\d+ bb1 bb2/u);
  assert.match(firstMir, /jump bb3/u);
  assert.match(firstMir, /join bb1 \+ bb2/u);
  assert.match(firstMir, /return %/u);
  assert.doesNotMatch(firstMir, /guard-smi|add-smi-checked/u);
});

test("retains lexical reads for runtime temporal-dead-zone checks", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        expression: { kind: "identifier", name: "value", range },
        kind: "expression",
        range,
      },
      {
        hint: undefined,
        initializer: { kind: "number", range, value: 1 },
        kind: "const",
        name: "value",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "tdz.ts",
  };
  const result = buildHir(syntax);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.program != null);
  const text = printMir(buildMir(result.program));
  assert.match(text, /read value/u);
  assert.match(text, /check-status/u);
});

test("shares one binding across duplicate non-strict parameters", () => {
  const result = buildHir({
    body: [
      {
        body: [
          {
            expression: { kind: "identifier", name: "value", range },
            kind: "return",
            range,
          },
        ],
        kind: "function",
        name: "duplicate",
        parameters: [
          { hints: [], name: "value", range },
          { hints: [], name: "value", range },
        ],
        range,
        returnHints: [],
      },
    ],
    kind: "program",
    range,
    sourceId: "duplicate-parameters.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.program != null);
  const functionValue = result.program.functions[0];
  assert.equal(functionValue?.parameters.length, 2);
  assert.equal(
    functionValue?.parameters[0]?.bindingId,
    functionValue?.parameters[1]?.bindingId,
  );
  const statement = functionValue?.body[0];
  assert.equal(statement?.kind, "return");
  if (statement?.kind !== "return") return;
  assert.equal(statement.expression?.kind, "binding");
  if (statement.expression?.kind !== "binding") return;
  assert.equal(
    statement.expression.bindingId,
    functionValue.parameters[1]?.bindingId,
  );
});

test("uses the last repeated top-level function declaration", () => {
  const declaration = (value: number) => ({
    body: [
      {
        expression: { kind: "number" as const, range, value },
        kind: "return" as const,
        range,
      },
    ],
    kind: "function" as const,
    name: "repeated",
    parameters: [],
    range,
    returnHints: [],
  });
  const result = buildHir({
    body: [declaration(1), declaration(2)],
    kind: "program",
    range,
    sourceId: "repeated-function.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.program != null);
  assert.equal(result.program.functions.length, 1);
  assert.match(printHir(result.program), /return 2/u);
  assert.doesNotMatch(printHir(result.program), /return 1/u);
});

test("resolves dynamic call targets through lexical scopes", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        body: [],
        kind: "function",
        name: "target",
        parameters: [],
        range,
        returnHints: [],
      },
      {
        body: [
          {
            expression: {
              arguments: [],
              kind: "call",
              range,
              target: { kind: "name", name: "target", range },
            },
            kind: "expression",
            range,
          },
        ],
        kind: "function",
        name: "invoke",
        parameters: [{ hints: [], name: "target", range }],
        range,
        returnHints: [],
      },
    ],
    kind: "program",
    range,
    sourceId: "shadowed-call.ts",
  };
  const result = buildHir(syntax);
  assert.deepEqual(result.diagnostics, []);
  const statement = result.program?.functions[1]?.body[0];
  assert.equal(statement?.kind, "expression");
  if (statement?.kind !== "expression") return;
  assert.equal(statement.expression.kind, "call");
  if (statement.expression.kind !== "call") return;
  assert.equal(statement.expression.target.kind, "dynamic");
  if (statement.expression.target.kind !== "dynamic") return;
  assert.equal(statement.expression.target.callee.kind, "binding");
});

test("resolves script bindings from declared functions", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        body: [
          {
            expression: { kind: "identifier", name: "value", range },
            kind: "expression",
            range,
          },
        ],
        kind: "function",
        name: "read",
        parameters: [],
        range,
        returnHints: [],
      },
      {
        hint: undefined,
        initializer: { kind: "string", range, value: "script" },
        kind: "const",
        name: "value",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "script-binding.ts",
  };
  const result = buildHir(syntax);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.program != null);
  const declaration = result.program.body.find(
    (statement) => statement.kind === "const",
  );
  const expression = result.program.functions[0]?.body[0];
  assert.equal(declaration?.kind, "const");
  assert.equal(expression?.kind, "expression");
  if (declaration?.kind !== "const" || expression?.kind !== "expression") {
    return;
  }
  assert.equal(expression.expression.kind, "binding");
  if (expression.expression.kind !== "binding") return;
  assert.equal(expression.expression.bindingId, declaration.bindingId);
  const mir = buildMir(result.program);
  assert.ok(
    mir.globalBindings.some(
      (binding) =>
        binding.id === declaration.bindingId && binding.name === "value",
    ),
  );
});

test("lowers shadowed intrinsic globals as methods", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        hint: undefined,
        initializer: { kind: "null", range },
        kind: "const",
        name: "console",
        range,
      },
      {
        body: [
          {
            expression: {
              arguments: [],
              kind: "call",
              range,
              target: { kind: "console-log", range },
            },
            kind: "expression",
            range,
          },
        ],
        kind: "function",
        name: "write",
        parameters: [],
        range,
        returnHints: [],
      },
    ],
    kind: "program",
    range,
    sourceId: "script-console.ts",
  };
  const result = buildHir(syntax);
  assert.deepEqual(result.diagnostics, []);
  const statement = result.program?.functions[0]?.body[0];
  assert.equal(statement?.kind, "expression");
  if (statement?.kind !== "expression") return;
  assert.equal(statement.expression.kind, "call");
  if (statement.expression.kind !== "call") return;
  assert.equal(statement.expression.target.kind, "method");
  if (statement.expression.target.kind !== "method") return;
  assert.equal(statement.expression.target.object.kind, "binding");
  assert.deepEqual(statement.expression.target.key, {
    kind: "string",
    range,
    value: "log",
  });
});

test("resolves declared functions as primitive-global bindings", () => {
  for (const name of ["undefined", "NaN", "Infinity"]) {
    const syntax: SyntaxProgram = {
      body: [
        {
          body: [],
          kind: "function",
          name,
          parameters: [],
          range,
          returnHints: [],
        },
        {
          expression: {
            arguments: [{ kind: "identifier", name, range }],
            kind: "call",
            range,
            target: { kind: "console-log", range },
          },
          kind: "expression",
          range,
        },
      ],
      kind: "program",
      range,
      sourceId: "shadowed-primitive-global.ts",
    };
    const result = buildHir(syntax);
    assert.deepEqual(result.diagnostics, []);
    const statement = result.program?.body[1];
    assert.equal(statement?.kind, "expression");
    if (statement?.kind !== "expression") continue;
    assert.equal(statement.expression.kind, "call");
    if (statement.expression.kind !== "call") continue;
    assert.equal(statement.expression.arguments[0]?.kind, "binding");
  }
});

test("prints distinct non-finite MIR constants", () => {
  const syntax: SyntaxProgram = {
    body: [NaN, Infinity, -Infinity].map((value) => ({
      expression: { kind: "number", range, value } as const,
      kind: "expression" as const,
      range,
    })),
    kind: "program",
    range,
    sourceId: "non-finite.ts",
  };
  const hir = buildHir(syntax).program;
  assert.ok(hir != null);
  const text = printMir(buildMir(hir));
  assert.match(text, /constant NaN/u);
  assert.match(text, /constant Infinity/u);
  assert.match(text, /constant -Infinity/u);
  assert.doesNotMatch(text, /constant null/u);
});

test("distinguishes binding initialization in MIR", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        hint: undefined,
        initializer: { kind: "number", range, value: 1 },
        kind: "const",
        name: "value",
        range,
      },
      {
        expression: { kind: "identifier", name: "value", range },
        kind: "expression",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "binding-write.ts",
  };
  const hir = buildHir(syntax).program;
  assert.ok(hir != null);
  const operations = buildMir(hir).script.blocks.flatMap(
    (block) => block.operations,
  );
  const initialize = operations.find(
    (operation) => operation.kind === "initialize",
  );
  const read = operations.find((operation) => operation.kind === "read");
  assert.ok(initialize != null);
  assert.ok(read != null);
  assert.equal(initialize.bindingId, read.bindingId);
  assert.equal(initialize.arguments.length, 1);
});

test("marks generic addition as an allocation safepoint", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        expression: {
          kind: "binary",
          left: { kind: "string", range, value: "left" },
          operator: "+",
          range,
          right: { kind: "number", range, value: 1 },
        },
        kind: "expression",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "string-addition.ts",
  };
  const hir = buildHir(syntax).program;
  assert.ok(hir != null);
  assert.match(printMir(buildMir(hir)), /safepoint string addition/u);
});

test("copies parameters into a MIR-owned representation", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        body: [],
        kind: "function",
        name: "identity",
        parameters: [
          {
            hints: [{ name: "number", provenance: "typescript", range }],
            name: "value",
            range,
          },
        ],
        range,
        returnHints: [],
      },
    ],
    kind: "program",
    range,
    sourceId: "mir-parameters.ts",
  };
  const hir = buildHir(syntax).program;
  assert.ok(hir != null);
  const mir = buildMir(hir);
  assert.notEqual(mir.functions[0]?.parameters, hir.functions[0]?.parameters);
  assert.notEqual(
    mir.functions[0]?.parameters?.[0],
    hir.functions[0]?.parameters[0],
  );
  assert.notEqual(
    mir.functions[0]?.parameters?.[0]?.hints,
    hir.functions[0]?.parameters[0]?.hints,
  );
  assert.notEqual(
    mir.functions[0]?.parameters?.[0]?.hints[0],
    hir.functions[0]?.parameters[0]?.hints[0],
  );
  assert.deepEqual(mir.functions[0]?.parameters?.[0], {
    bindingId: hir.functions[0]?.parameters[0]?.bindingId,
    hints: [{ name: "number", provenance: "typescript", range }],
    name: "value",
    range,
  });
});

function additionProgram(
  leftHints: readonly Hint[],
  rightHints: readonly Hint[],
): SyntaxProgram {
  return {
    body: [
      {
        body: [
          {
            expression: {
              kind: "binary",
              left: { kind: "identifier", name: "left", range },
              operator: "+",
              range,
              right: { kind: "identifier", name: "right", range },
            },
            kind: "return",
            range,
          },
        ],
        kind: "function",
        name: "add",
        parameters: [
          { hints: leftHints, name: "left", range },
          { hints: rightHints, name: "right", range },
        ],
        range,
        returnHints: [],
      },
    ],
    kind: "program",
    range,
    sourceId: "specialized-addition.ts",
  };
}

const typescriptNumber: Hint = {
  name: "number",
  provenance: "typescript",
  range,
};
const jsdocNumber: Hint = {
  name: "number",
  provenance: "jsdoc",
  range,
};

test("selects checked addition from equivalent number hints", () => {
  for (const hint of [typescriptNumber, jsdocNumber]) {
    const hir = buildHir(additionProgram([hint], [hint])).program;
    assert.ok(hir != null);
    const mir = buildMir(hir, { specialization: "enabled" });
    const functionValue = mir.functions[0];
    assert.equal(mir.specialization, "enabled");
    assert.equal(functionValue?.specialization?.kind, "smi-add");
    assert.equal(functionValue?.specialization?.genericBlock, 6);
    assert.equal(functionValue?.specialization?.joinBlock, 7);
    const text = printMir(mir);
    assert.match(text, /specialization enabled/u);
    assert.equal(text.match(/guard-smi/gu)?.length, 2);
    assert.match(text, /add-smi-checked/u);
    assert.match(text, /box-smi/u);
    assert.match(text, /generic-fallback bb6/u);
    assert.match(text, /join bb7/u);
  }
});

test("keeps disabled and ineligible MIR generic-only", () => {
  const cases = [
    {
      hints: [[typescriptNumber], [typescriptNumber]] as const,
      specialization: "disabled" as const,
    },
    {
      hints: [[], []] as const,
      specialization: "enabled" as const,
    },
    {
      hints: [
        [typescriptNumber, { ...jsdocNumber, name: "string" as const }],
        [typescriptNumber],
      ] as const,
      specialization: "enabled" as const,
    },
  ];
  for (const entry of cases) {
    const hir = buildHir(
      additionProgram(entry.hints[0], entry.hints[1]),
    ).program;
    assert.ok(hir != null);
    const mir = buildMir(hir, { specialization: entry.specialization });
    assert.equal(mir.functions[0]?.specialization, undefined);
    assert.doesNotMatch(printMir(mir), /guard-smi|add-smi-checked/u);
  }
});

test("generated hint mutations change only specialization selection", () => {
  const mutations: readonly {
    readonly hints: readonly Hint[];
    readonly name: string;
    readonly selected: boolean;
  }[] = [
    { hints: [typescriptNumber], name: "add", selected: true },
    { hints: [], name: "remove", selected: false },
    {
      hints: [{ ...typescriptNumber, name: "string" }],
      name: "replace",
      selected: false,
    },
    {
      hints: [{ ...typescriptNumber, name: "any" }],
      name: "falsify",
      selected: false,
    },
  ];
  for (const mutation of mutations) {
    const hir = buildHir(
      additionProgram(mutation.hints, mutation.hints),
    ).program;
    assert.ok(hir != null, mutation.name);
    const mir = buildMir(hir, { specialization: "enabled" });
    assert.equal(
      mir.functions[0]?.specialization != null,
      mutation.selected,
      mutation.name,
    );
    const disabled = buildMir(hir, { specialization: "disabled" });
    assert.equal(disabled.functions[0]?.specialization, undefined);
  }
});

const moduleRange: SourceRange = {
  end: { column: 1, line: 1 },
  start: { column: 1, line: 1 },
};

function testModule(sourceId: string, source: string): SyntaxModule {
  return {
    body: [],
    exports: [],
    imports:
      source === ""
        ? []
        : source.split(",").map((value) => ({
            byteRange: { end: value.length, start: 0 },
            importedName: undefined,
            localName: undefined,
            range: moduleRange,
            specifier: {
              byteRange: { end: value.length, start: 0 },
              range: moduleRange,
              value,
            },
          })),
    kind: "module",
    range: moduleRange,
    sourceId,
  };
}

test("deduplicates module instances across cycles and aliases", async () => {
  const sources = new Map([
    ["file:///app/a.js", "./main.js"],
    ["file:///app/main.js", "./a.js,././a.js"],
  ]);
  const result = await buildModuleGraph(
    {
      parseModule(input) {
        return {
          diagnostics: [],
          module: testModule(input.sourceId, input.source),
          parsed: true,
          sourceId: input.sourceId,
        };
      },
    },
    {
      load(canonicalId) {
        const source = sources.get(canonicalId);
        return Promise.resolve(
          source == null
            ? { diagnostics: [diagnostic] }
            : {
                diagnostics: [],
                source: {
                  source,
                  sourceHash: `hash:${source}`,
                  sourceId: canonicalId,
                },
              },
        );
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
    "file:///app/main.js",
  );
  assert.deepEqual(
    result.graph?.modules.map((module) => ({
      dependencies: module.dependencies.map((item) => item.canonicalId),
      id: module.canonicalId,
      sourceHash: module.sourceHash,
    })),
    [
      {
        dependencies: ["file:///app/a.js"],
        id: "file:///app/main.js",
        sourceHash: "hash:./a.js,././a.js",
      },
      {
        dependencies: ["file:///app/main.js"],
        id: "file:///app/a.js",
        sourceHash: "hash:./main.js",
      },
    ],
  );
});

test("keeps dependency order and canonical parser identity", async () => {
  const seenSourceIds: string[] = [];
  const seenReferrers: (string | undefined)[] = [];
  const specifier = (value: string, start: number) => ({
    byteRange: { end: start + value.length, start },
    range: moduleRange,
    value,
  });
  const result = await buildModuleGraph(
    {
      parseModule(input) {
        seenSourceIds.push(input.sourceId);
        const syntax = testModule(input.sourceId, "");
        return {
          diagnostics: [],
          module:
            input.source === "entry"
              ? {
                  ...syntax,
                  exports: [
                    {
                      exportedName: "value",
                      importedName: "value",
                      kind: "indirect",
                      range: moduleRange,
                      specifier: specifier("./first.js", 5),
                    },
                  ],
                  imports: [
                    {
                      byteRange: { end: 31, start: 20 },
                      importedName: undefined,
                      localName: undefined,
                      range: moduleRange,
                      specifier: specifier("./second.js", 20),
                    },
                  ],
                }
              : syntax,
          parsed: true,
          sourceId: input.sourceId,
        };
      },
    },
    {
      load(canonicalId, referrer) {
        seenReferrers.push(
          referrer == null
            ? undefined
            : `${referrer.importerId}:${referrer.specifier.value}`,
        );
        return Promise.resolve({
          diagnostics: [],
          source: {
            source: canonicalId.endsWith("entry.js") ? "entry" : "leaf",
            sourceHash: canonicalId,
            sourceId: "loader-alias",
          },
        });
      },
    },
    {
      resolve(importerId, sourceSpecifier) {
        return {
          canonicalId: new URL(sourceSpecifier.value, importerId).href,
          diagnostics: [],
        };
      },
    },
    "file:///app/entry.js",
  );
  assert.deepEqual(
    result.graph?.modules[0]?.dependencies.map((item) => item.canonicalId),
    ["file:///app/first.js", "file:///app/second.js"],
  );
  assert.deepEqual(seenSourceIds, [
    "file:///app/entry.js",
    "file:///app/first.js",
    "file:///app/second.js",
  ]);
  assert.deepEqual(seenReferrers, [
    undefined,
    "file:///app/entry.js:./first.js",
    "file:///app/entry.js:./second.js",
  ]);
});

test("keeps module loader failures as owned graph diagnostics", async () => {
  const result = await buildModuleGraph(
    { parseModule: () => ({ diagnostics: [], parsed: false, sourceId: "x" }) },
    {
      load: () => Promise.resolve({ diagnostics: [diagnostic] }),
    },
    { resolve: () => ({ diagnostics: [] }) },
    "file:///missing.js",
  );
  assert.equal(result.graph, undefined);
  assert.deepEqual(result.diagnostics, [diagnostic]);
});

function graphSpecifier(value: string, start: number): SyntaxModuleSpecifier {
  return {
    byteRange: { end: start + value.length, start },
    range: moduleRange,
    value,
  };
}

test("links live cells, namespaces, cycles, and evaluation order", () => {
  const fromA = graphSpecifier("./a.js", 0);
  const fromB = graphSpecifier("./b.js", 0);
  const a = {
    canonicalId: "file:///a.js",
    dependencies: [{ canonicalId: "file:///b.js", specifier: fromB }],
    resolutions: [{ canonicalId: "file:///b.js", specifier: fromB }],
    sourceHash: "a",
    syntax: {
      ...testModule("file:///a.js", ""),
      exports: [
        {
          exportedName: "value",
          kind: "local" as const,
          localName: "value",
          range: moduleRange,
        },
        {
          exportedName: "beta",
          kind: "local" as const,
          localName: "beta",
          range: moduleRange,
        },
      ],
      imports: [
        {
          byteRange: fromB.byteRange,
          importedName: undefined,
          localName: undefined,
          range: moduleRange,
          specifier: fromB,
        },
      ],
    },
  };
  const b = {
    canonicalId: "file:///b.js",
    dependencies: [{ canonicalId: "file:///a.js", specifier: fromA }],
    resolutions: [{ canonicalId: "file:///a.js", specifier: fromA }],
    sourceHash: "b",
    syntax: {
      ...testModule("file:///b.js", ""),
      exports: [
        {
          exportedName: "forwarded",
          importedName: "value",
          kind: "indirect" as const,
          range: moduleRange,
          specifier: fromA,
        },
        { kind: "star" as const, range: moduleRange, specifier: fromA },
      ],
      imports: [
        {
          byteRange: fromA.byteRange,
          importedName: "value",
          localName: "alias",
          range: moduleRange,
          specifier: fromA,
        },
        {
          byteRange: fromA.byteRange,
          importedName: "*",
          localName: "namespace",
          range: moduleRange,
          specifier: fromA,
        },
      ],
    },
  };
  const result = linkModuleGraph({
    entryId: "file:///b.js",
    kind: "module-graph",
    modules: [b, a],
  });
  assert.equal(result.diagnostics.length, 0);
  const linkedA = result.graph?.modules.find(
    (module) => module.canonicalId === "file:///a.js",
  );
  const linkedB = result.graph?.modules.find(
    (module) => module.canonicalId === "file:///b.js",
  );
  const valueCell = linkedA?.exports.find(
    (entry) => entry.exportedName === "value",
  )?.cellId;
  assert.equal(
    linkedB?.imports.find((entry) => entry.localName === "alias")?.cellId,
    valueCell,
  );
  assert.equal(
    linkedB?.exports.find((entry) => entry.exportedName === "forwarded")
      ?.cellId,
    valueCell,
  );
  assert.deepEqual(linkedA?.namespaceNames, ["beta", "value"]);
  assert.deepEqual(linkedB?.namespaceNames, ["beta", "forwarded", "value"]);
  assert.deepEqual(result.graph?.components, [
    {
      cyclic: true,
      id: 0,
      moduleIds: ["file:///a.js", "file:///b.js"],
    },
  ]);
  assert.deepEqual(result.graph?.evaluationOrder, [
    "file:///a.js",
    "file:///b.js",
  ]);
});

test("preserves dependency order within a cyclic component", () => {
  const fromA = graphSpecifier("./a.js", 0);
  const fromB = graphSpecifier("./b.js", 0);
  const fromC = graphSpecifier("./c.js", 10);
  const node = (
    canonicalId: string,
    dependencies: readonly {
      readonly canonicalId: string;
      readonly specifier: SyntaxModuleSpecifier;
    }[],
  ) => ({
    canonicalId,
    dependencies,
    resolutions: dependencies,
    sourceHash: canonicalId,
    syntax: testModule(canonicalId, ""),
  });
  const a = node("file:///a.js", [
    { canonicalId: "file:///b.js", specifier: fromB },
    { canonicalId: "file:///c.js", specifier: fromC },
  ]);
  const b = node("file:///b.js", [
    { canonicalId: "file:///a.js", specifier: fromA },
  ]);
  const c = node("file:///c.js", [
    { canonicalId: "file:///a.js", specifier: fromA },
  ]);
  const result = linkModuleGraph({
    entryId: a.canonicalId,
    kind: "module-graph",
    modules: [a, b, c],
  });
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.graph?.components[0]?.moduleIds, [
    "file:///b.js",
    "file:///c.js",
    "file:///a.js",
  ]);
  assert.deepEqual(result.graph?.evaluationOrder, [
    "file:///b.js",
    "file:///c.js",
    "file:///a.js",
  ]);
});

test("links deep module graphs without using the host stack", () => {
  const moduleCount = 5_000;
  const modules = Array.from({ length: moduleCount }, (_, index) => {
    const canonicalId = `file:///${index}.js`;
    const dependencyId =
      index + 1 < moduleCount ? `file:///${index + 1}.js` : undefined;
    const specifier =
      dependencyId == null ? undefined : graphSpecifier(`./${index + 1}.js`, 0);
    const dependencies =
      dependencyId == null || specifier == null
        ? []
        : [{ canonicalId: dependencyId, specifier }];
    return {
      canonicalId,
      dependencies,
      resolutions: dependencies,
      sourceHash: String(index),
      syntax: testModule(canonicalId, ""),
    };
  });
  const result = linkModuleGraph({
    entryId: modules[0]!.canonicalId,
    kind: "module-graph",
    modules,
  });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.graph?.components.length, moduleCount);
  assert.equal(result.graph?.evaluationOrder.length, moduleCount);
  assert.equal(result.graph?.evaluationOrder[0], modules.at(-1)?.canonicalId);
  assert.equal(result.graph?.evaluationOrder.at(-1), modules[0]?.canonicalId);
});

test("reports ambiguous star exports only when a binding requests them", () => {
  const left = graphSpecifier("./left.js", 0);
  const right = graphSpecifier("./right.js", 10);
  const root = graphSpecifier("./root.js", 0);
  const leaf = (canonicalId: string, localName: string) => ({
    canonicalId,
    dependencies: [],
    resolutions: [],
    sourceHash: localName,
    syntax: {
      ...testModule(canonicalId, ""),
      exports: [
        {
          exportedName: "shared",
          kind: "local" as const,
          localName,
          range: moduleRange,
        },
      ],
    },
  });
  const graph: ModuleGraph = {
    entryId: "file:///consumer.js",
    kind: "module-graph",
    modules: [
      {
        canonicalId: "file:///consumer.js",
        dependencies: [{ canonicalId: "file:///root.js", specifier: root }],
        resolutions: [{ canonicalId: "file:///root.js", specifier: root }],
        sourceHash: "consumer",
        syntax: {
          ...testModule("file:///consumer.js", ""),
          imports: [
            {
              byteRange: root.byteRange,
              importedName: "shared",
              localName: "shared",
              range: moduleRange,
              specifier: root,
            },
          ],
        },
      },
      {
        canonicalId: "file:///root.js",
        dependencies: [
          { canonicalId: "file:///left.js", specifier: left },
          { canonicalId: "file:///right.js", specifier: right },
        ],
        resolutions: [
          { canonicalId: "file:///left.js", specifier: left },
          { canonicalId: "file:///right.js", specifier: right },
        ],
        sourceHash: "root",
        syntax: {
          ...testModule("file:///root.js", ""),
          exports: [
            { kind: "star", range: moduleRange, specifier: left },
            { kind: "star", range: moduleRange, specifier: right },
          ],
        },
      },
      leaf("file:///left.js", "leftShared"),
      leaf("file:///right.js", "rightShared"),
    ],
  };
  const result = linkModuleGraph(graph);
  assert.equal(result.graph, undefined);
  assert.match(result.diagnostics[0]?.message ?? "", /ambiguous/u);
});

test("lowers linked modules through shared live binding identities", () => {
  const dependencySpecifier = graphSpecifier("./dependency.js", 0);
  const dependency = {
    canonicalId: "file:///dependency.js",
    dependencies: [],
    resolutions: [],
    sourceHash: "dependency",
    syntax: {
      ...testModule("file:///dependency.js", ""),
      body: [
        {
          byteRange: { end: 22, start: 0 },
          hint: undefined,
          initializer: { kind: "number" as const, range, value: 41 },
          kind: "let" as const,
          name: "answer",
          range,
        },
      ],
      exports: [
        {
          exportedName: "answer",
          kind: "local" as const,
          localName: "answer",
          range,
        },
      ],
    },
  };
  const entry = {
    canonicalId: "file:///entry.js",
    dependencies: [
      {
        canonicalId: dependency.canonicalId,
        specifier: dependencySpecifier,
      },
    ],
    resolutions: [
      {
        canonicalId: dependency.canonicalId,
        specifier: dependencySpecifier,
      },
    ],
    sourceHash: "entry",
    syntax: {
      ...testModule("file:///entry.js", ""),
      body: [
        {
          byteRange: { end: 40, start: 20 },
          expression: {
            arguments: [{ kind: "identifier" as const, name: "value", range }],
            kind: "call" as const,
            range,
            target: { kind: "console-log" as const, range },
          },
          kind: "expression" as const,
          range,
        },
      ],
      imports: [
        {
          byteRange: dependencySpecifier.byteRange,
          importedName: "answer",
          localName: "value",
          range,
          specifier: dependencySpecifier,
        },
      ],
      exports: [
        {
          exportedName: "value",
          kind: "local" as const,
          localName: "value",
          range,
        },
      ],
    },
  };
  const result = compileModuleGraph({
    entryId: entry.canonicalId,
    kind: "module-graph",
    modules: [entry, dependency],
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  assert.deepEqual(
    result.mir.globalBindings.filter(
      (binding) => !binding.name.startsWith("*module-promise:"),
    ),
    [{ id: 0, name: "answer" }],
  );
  const text = printMir(result.mir);
  assert.ok(text.indexOf("initialize answer") < text.indexOf("read value"));
  assert.match(text, /initialize %b0 answer/u);
  const operations = [...result.mir.functions, result.mir.script]
    .flatMap((functionValue) => functionValue.blocks)
    .flatMap((block) => block.operations);
  const importedRead = operations.find(
    (operation) =>
      operation.kind === "read" && operation.detail.includes("value"),
  );
  assert.equal(importedRead?.bindingId, 0);
  assert.equal(importedRead?.range.sourceId, entry.canonicalId);
  const dependencyInitialize = operations.find(
    (operation) => operation.kind === "initialize" && operation.bindingId === 0,
  );
  assert.equal(dependencyInitialize?.range.sourceId, dependency.canonicalId);
  assert.equal(result.graph?.modules[0]?.exports[0]?.cellId, 0);
});

test("creates one live namespace binding for imports and re-exports", () => {
  const specifier = graphSpecifier("./values.js", 0);
  const values = {
    canonicalId: "file:///values.js",
    dependencies: [],
    resolutions: [],
    sourceHash: "values",
    syntax: {
      ...testModule("file:///values.js", ""),
      body: [
        {
          hint: undefined,
          initializer: { kind: "number" as const, range, value: 1 },
          kind: "let" as const,
          name: "zeta",
          range,
        },
        {
          hint: undefined,
          initializer: { kind: "number" as const, range, value: 2 },
          kind: "const" as const,
          name: "alpha",
          range,
        },
      ],
      exports: [
        {
          exportedName: "zeta",
          kind: "local" as const,
          localName: "zeta",
          range,
        },
        {
          exportedName: "alpha",
          kind: "local" as const,
          localName: "alpha",
          range,
        },
      ],
    },
  };
  const imports = ["first", "second"].map((localName) => ({
    byteRange: specifier.byteRange,
    importedName: "*",
    localName,
    range,
    specifier,
  }));
  const entry = {
    canonicalId: "file:///namespace.js",
    dependencies: [{ canonicalId: values.canonicalId, specifier }],
    resolutions: [{ canonicalId: values.canonicalId, specifier }],
    sourceHash: "namespace",
    syntax: {
      ...testModule("file:///namespace.js", ""),
      body: [],
      exports: [
        {
          exportedName: "namespace",
          kind: "local" as const,
          localName: "first",
          range,
        },
      ],
      imports,
    },
  };
  const result = compileModuleGraph({
    entryId: entry.canonicalId,
    kind: "module-graph",
    modules: [entry, values],
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const operations = result.mir.script.blocks.flatMap(
    (block) => block.operations,
  );
  const namespaces = operations.filter(
    (operation) => operation.kind === "module-namespace-create",
  );
  assert.equal(namespaces.length, 1);
  assert.deepEqual(namespaces[0]?.namespaceNames, ["alpha", "zeta"]);
  assert.deepEqual(namespaces[0]?.namespaceBindingIds, [1, 0]);
  assert.equal(
    result.mir.globalBindings.filter((binding) =>
      binding.name.startsWith("*namespace:"),
    ).length,
    1,
  );
  const linkedEntry = result.graph?.modules.find(
    (module) => module.canonicalId === entry.canonicalId,
  );
  assert.equal(
    linkedEntry?.exports.find(
      (exported) => exported.exportedName === "namespace",
    )?.cellId,
    linkedEntry?.imports.find((imported) => imported.localName === "first")
      ?.cellId,
  );
});

test("rejects asynchronous module cycles before scheduling", () => {
  const canonicalId = "file:///cycle.js";
  const specifier = graphSpecifier("./cycle.js", 0);
  const module = {
    canonicalId,
    dependencies: [{ canonicalId, specifier }],
    resolutions: [{ canonicalId, specifier }],
    sourceHash: "cycle",
    syntax: {
      ...testModule(canonicalId, ""),
      body: [
        {
          expression: {
            argument: { kind: "number" as const, range, value: 0 },
            kind: "await" as const,
            range,
          },
          kind: "expression" as const,
          range,
        },
      ],
      imports: [
        {
          byteRange: specifier.byteRange,
          importedName: undefined,
          localName: undefined,
          range,
          specifier,
        },
      ],
    },
  };
  const result = compileModuleGraph({
    entryId: canonicalId,
    kind: "module-graph",
    modules: [module],
  });
  assert.equal(result.mir, undefined);
  assert.match(result.diagnostics[0]?.message ?? "", /asynchronous module/iu);
});
