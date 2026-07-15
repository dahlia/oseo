import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHir,
  buildMir,
  describeTarget,
  printHir,
  printMir,
  renderDiagnostic,
} from "../src/index.ts";
import type {
  Diagnostic,
  DiagnosticCode,
  Hint,
  SourceRange,
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
  assert.ok(describeTarget("x86_64-linux-gnu").execute);
  assert.ok(!describeTarget("aarch64-linux-musl").execute);
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

test("resolves direct call targets through lexical scopes", () => {
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
  assert.equal(result.program, undefined);
  assert.match(result.diagnostics[0]?.message ?? "", /resolves to a binding/u);
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
  const declaration = result.program.body[0];
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
  assert.deepEqual(mir.globalBindings, [
    { id: declaration.bindingId, name: "value" },
  ]);
});

test("shadows intrinsic globals with script bindings inside functions", () => {
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
  assert.equal(result.program, undefined);
  assert.match(result.diagnostics[0]?.message ?? "", /console.*binding/u);
});

test("resolves declared functions before primitive globals", () => {
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
    assert.equal(result.program, undefined);
    assert.match(result.diagnostics[0]?.message ?? "", /Function values/u);
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

test("records const binding writes in MIR", () => {
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
  const write = operations.find((operation) => operation.kind === "write");
  const read = operations.find((operation) => operation.kind === "read");
  assert.ok(write != null);
  assert.ok(read != null);
  assert.equal(write.bindingId, read.bindingId);
  assert.equal(write.arguments.length, 1);
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
