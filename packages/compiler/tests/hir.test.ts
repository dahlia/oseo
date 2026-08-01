import assert from "node:assert/strict";
import test from "node:test";

import { buildHir, buildMir, printHir, printMir } from "../src/index.ts";
import type { SourceRange, SyntaxProgram } from "../src/index.ts";

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

test("resolves delete identifiers without reading their bindings", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        hint: undefined,
        initializer: { kind: "number", range, value: 1 },
        kind: "let",
        name: "present",
        range,
      },
      {
        expression: {
          argument: { kind: "identifier", name: "present", range },
          kind: "delete",
          range,
        },
        kind: "expression",
        range,
      },
      {
        expression: {
          argument: { kind: "identifier", name: "absent", range },
          kind: "delete",
          range,
        },
        kind: "expression",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "delete-identifiers.js",
  };
  const hir = buildHir(syntax).program;
  assert.ok(hir != null);
  assert.match(printHir(hir), /\n  false[\s\S]*\n  true/u);
  const operations = buildMir(hir).script.blocks.flatMap(
    (block) => block.operations,
  );
  assert.equal(
    operations.filter((operation) => operation.kind === "read").length,
    0,
  );
});

test("rejects duplicate names in owned catch binding patterns", () => {
  const identifier = {
    hints: [],
    kind: "binding-identifier",
    name: "value",
    range,
  } as const;
  const patterns = [
    {
      elements: [
        { pattern: identifier, range },
        { pattern: identifier, range },
      ],
      kind: "array-binding-pattern",
      range,
    },
    {
      kind: "object-binding-pattern",
      properties: [
        {
          key: { kind: "string", range, value: "first" },
          pattern: identifier,
          range,
        },
        {
          key: { kind: "string", range, value: "second" },
          pattern: identifier,
          range,
        },
      ],
      range,
    },
  ] as const;
  for (const pattern of patterns) {
    const result = buildHir({
      body: [
        {
          block: { body: [], kind: "block", range },
          finalizer: undefined,
          handler: {
            body: { body: [], kind: "block", range },
            pattern,
            range,
          },
          kind: "try",
          range,
        },
      ],
      kind: "program",
      range,
      sourceId: "duplicate-catch-binding.ts",
    });
    assert.equal(result.program, undefined);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, "OSEO1001");
    assert.match(
      result.diagnostics[0]?.message ?? "",
      /Duplicate catch binding 'value'/u,
    );
  }
});

test("rejects assignment members in owned binding patterns", () => {
  const member = {
    key: { kind: "string", range, value: "value" },
    kind: "assignment-member",
    object: { kind: "object", properties: [], range },
    range,
  } as const;
  const patterns = [
    member,
    {
      elements: [{ pattern: member, range }],
      kind: "array-binding-pattern",
      range,
    },
  ] as const;
  const declarations = [
    { declarationKind: "var", mode: "write" },
    { declarationKind: "let", mode: "declare" },
  ] as const;
  for (const declaration of declarations) {
    for (const pattern of patterns) {
      const result = buildHir({
        body: [
          {
            ...declaration,
            initializer: { elements: [], kind: "array", range },
            kind: "binding-pattern",
            pattern,
            range,
          },
        ],
        kind: "program",
        range,
        sourceId: `invalid-${declaration.declarationKind}-member-pattern.ts`,
      } as unknown as SyntaxProgram);
      assert.equal(result.program, undefined);
      assert.match(
        result.diagnostics[0]?.message ?? "",
        /Member targets are valid only in assignment patterns/u,
      );
    }
  }
});

test("rejects assignment members in owned for-of declarations", () => {
  const result = buildHir({
    body: [
      {
        body: { body: [], kind: "block", range },
        iterable: { elements: [], kind: "array", range },
        kind: "for-of",
        range,
        target: {
          declarationKind: "var",
          kind: "pattern-declaration",
          pattern: {
            key: { kind: "string", range, value: "value" },
            kind: "assignment-member",
            object: { kind: "object", properties: [], range },
            range,
          },
          range,
        },
      },
    ],
    kind: "program",
    range,
    sourceId: "invalid-for-of-member-pattern.ts",
  } as unknown as SyntaxProgram);
  assert.equal(result.program, undefined);
  assert.match(
    result.diagnostics[0]?.message ?? "",
    /Member targets are valid only in assignment patterns/u,
  );
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
