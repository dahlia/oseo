import assert from "node:assert/strict";
import test from "node:test";

import { buildHir, buildMir, printHir, printMir } from "../src/index.ts";
import type {
  Hint,
  SourceRange,
  SyntaxProgram,
  SyntaxStatement,
} from "../src/index.ts";

const range: SourceRange = {
  end: { column: 2, line: 1 },
  start: { column: 1, line: 1 },
};

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

test("lowers typeof and remainder through checked runtime calls", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        hint: undefined,
        initializer: { kind: "number", range, value: 7 },
        kind: "const",
        name: "value",
        range,
      },
      {
        expression: {
          argument: { kind: "identifier", name: "value", range },
          kind: "unary",
          operator: "typeof",
          range,
        },
        kind: "expression",
        range,
      },
      {
        expression: {
          kind: "binary",
          left: { kind: "identifier", name: "value", range },
          operator: "%",
          range,
          right: { kind: "number", range, value: 2 },
        },
        kind: "expression",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "typeof-remainder.ts",
  };
  const hir = buildHir(syntax).program;
  assert.ok(hir != null);
  const operations = buildMir(hir).script.blocks.flatMap(
    (block) => block.operations,
  );
  const typeofIndex = operations.findIndex(
    (operation) =>
      operation.kind === "unary" && operation.operator === "typeof",
  );
  assert.ok(typeofIndex >= 0);
  assert.equal(operations[typeofIndex - 1]?.kind, "safepoint");
  assert.match(operations[typeofIndex - 1]?.detail ?? "", /typeof string/u);
  assert.equal(operations[typeofIndex + 1]?.kind, "check-status");
  const remainderIndex = operations.findIndex(
    (operation) => operation.kind === "binary" && operation.operator === "%",
  );
  assert.ok(remainderIndex >= 0);
  assert.equal(operations[remainderIndex + 1]?.kind, "check-status");
});

test("marks coercing unary operators as allocation safepoints", () => {
  for (const operator of ["+", "-", "~"] as const) {
    const syntax: SyntaxProgram = {
      body: [
        {
          expression: {
            argument: { kind: "string", range, value: "2" },
            kind: "unary",
            operator,
            range,
          },
          kind: "expression",
          range,
        },
      ],
      kind: "program",
      range,
      sourceId: `unary-${operator}.ts`,
    };
    const hir = buildHir(syntax).program;
    assert.ok(hir != null);
    const operations = buildMir(hir).script.blocks.flatMap(
      (block) => block.operations,
    );
    const index = operations.findIndex(
      (operation) =>
        operation.kind === "unary" && operation.operator === operator,
    );
    assert.ok(index >= 0);
    assert.equal(operations[index - 1]?.kind, "safepoint");
    assert.match(operations[index - 1]?.detail ?? "", /operand coercion/u);
    assert.equal(operations[index + 1]?.kind, "check-status");
  }
});

test("keeps non-coercing unary operators without a coercion safepoint", () => {
  for (const operator of ["!", "void"] as const) {
    const syntax: SyntaxProgram = {
      body: [
        {
          expression: {
            argument: { kind: "boolean", range, value: true },
            kind: "unary",
            operator,
            range,
          },
          kind: "expression",
          range,
        },
      ],
      kind: "program",
      range,
      sourceId: `unary-${operator}.ts`,
    };
    const hir = buildHir(syntax).program;
    assert.ok(hir != null);
    const operations = buildMir(hir).script.blocks.flatMap(
      (block) => block.operations,
    );
    const index = operations.findIndex(
      (operation) =>
        operation.kind === "unary" && operation.operator === operator,
    );
    assert.ok(index >= 0);
    assert.notEqual(operations[index - 1]?.detail, "operand coercion");
  }
});

test("marks every coercing binary operator as an allocation safepoint", () => {
  const coercing = [
    "-",
    "*",
    "/",
    "%",
    "**",
    "&",
    "|",
    "^",
    "<<",
    ">>",
    ">>>",
    "<",
    "<=",
    ">",
    ">=",
    "==",
    "!=",
  ] as const;
  for (const operator of coercing) {
    const syntax: SyntaxProgram = {
      body: [
        {
          expression: {
            kind: "binary",
            left: { kind: "number", range, value: 1 },
            operator,
            range,
            right: { kind: "number", range, value: 2 },
          },
          kind: "expression",
          range,
        },
      ],
      kind: "program",
      range,
      sourceId: `binary-safepoint.ts`,
    };
    const hir = buildHir(syntax).program;
    assert.ok(hir != null);
    const operations = buildMir(hir).script.blocks.flatMap(
      (block) => block.operations,
    );
    const index = operations.findIndex(
      (operation) =>
        operation.kind === "binary" && operation.operator === operator,
    );
    assert.ok(index >= 0, `${operator} lowers to a binary operation`);
    assert.equal(operations[index - 1]?.kind, "safepoint");
    assert.match(operations[index - 1]?.detail ?? "", /operand coercion/u);
    assert.equal(operations[index + 1]?.kind, "check-status");
  }
});

test("keeps strict equality without a coercion safepoint", () => {
  for (const operator of ["===", "!=="] as const) {
    const syntax: SyntaxProgram = {
      body: [
        {
          expression: {
            kind: "binary",
            left: { kind: "number", range, value: 1 },
            operator,
            range,
            right: { kind: "number", range, value: 2 },
          },
          kind: "expression",
          range,
        },
      ],
      kind: "program",
      range,
      sourceId: `strict-equality.ts`,
    };
    const hir = buildHir(syntax).program;
    assert.ok(hir != null);
    const operations = buildMir(hir).script.blocks.flatMap(
      (block) => block.operations,
    );
    const index = operations.findIndex(
      (operation) =>
        operation.kind === "binary" && operation.operator === operator,
    );
    assert.ok(index >= 0);
    assert.notEqual(operations[index - 1]?.detail, "operand coercion");
  }
});

test("marks relational operators as allocation safepoints", () => {
  for (const operator of ["in", "instanceof"] as const) {
    const syntax: SyntaxProgram = {
      body: [
        {
          expression: {
            kind: "binary",
            left: { kind: "string", range, value: "key" },
            operator,
            range,
            right: { kind: "object", properties: [], range },
          },
          kind: "expression",
          range,
        },
      ],
      kind: "program",
      range,
      sourceId: `${operator}-safepoint.ts`,
    };
    const hir = buildHir(syntax).program;
    assert.ok(hir != null);
    const operations = buildMir(hir).script.blocks.flatMap(
      (block) => block.operations,
    );
    const index = operations.findIndex(
      (operation) =>
        operation.kind === "binary" && operation.operator === operator,
    );
    assert.ok(index >= 0);
    assert.equal(operations[index - 1]?.kind, "safepoint");
  }
});

test("resolves unshadowed error names to intrinsic references", () => {
  const errorNames = [
    "Error",
    "EvalError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "TypeError",
    "URIError",
  ] as const;
  for (const name of errorNames) {
    const syntax: SyntaxProgram = {
      body: [
        {
          expression: {
            argument: { kind: "identifier", name, range },
            kind: "unary",
            operator: "typeof",
            range,
          },
          kind: "expression",
          range,
        },
        {
          expression: { kind: "identifier", name, range },
          kind: "expression",
          range,
        },
      ],
      kind: "program",
      range,
      sourceId: `error-intrinsic-${name}.ts`,
    };
    const hirResult = buildHir(syntax);
    assert.deepEqual(hirResult.diagnostics, []);
    assert.ok(hirResult.program != null);
    assert.match(
      printHir(hirResult.program),
      new RegExp(`intrinsic ${name}`, "u"),
    );
    const operations = buildMir(hirResult.program).script.blocks.flatMap(
      (block) => block.operations,
    );
    const index = operations.findIndex(
      (operation) =>
        operation.kind === "error-intrinsic" && operation.errorName === name,
    );
    assert.ok(index >= 0, `${name} lowers to an error-intrinsic operation`);
    assert.equal(operations[index - 1]?.kind, "safepoint");
    assert.equal(operations[index + 1]?.kind, "check-status");
  }
});

test("keeps shadowed error names ordinary bindings", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        hint: undefined,
        initializer: { kind: "number", range, value: 1 },
        kind: "const",
        name: "TypeError",
        range,
      },
      {
        expression: { kind: "identifier", name: "TypeError", range },
        kind: "expression",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "shadowed-error-intrinsic.ts",
  };
  const hirResult = buildHir(syntax);
  assert.deepEqual(hirResult.diagnostics, []);
  assert.ok(hirResult.program != null);
  const printed = printHir(hirResult.program);
  assert.doesNotMatch(printed, /intrinsic TypeError/u);
  assert.match(printed, /%b\d+\(TypeError\)/u);
});

test("resolves the unshadowed Symbol intrinsic", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        expression: {
          argument: { kind: "identifier", name: "Symbol", range },
          kind: "unary",
          operator: "typeof",
          range,
        },
        kind: "expression",
        range,
      },
      {
        expression: { kind: "identifier", name: "Symbol", range },
        kind: "expression",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "symbol-intrinsic.ts",
  };
  const hirResult = buildHir(syntax);
  assert.deepEqual(hirResult.diagnostics, []);
  assert.ok(hirResult.program != null);
  assert.match(printHir(hirResult.program), /intrinsic Symbol/u);
  const operations = buildMir(hirResult.program).script.blocks.flatMap(
    (block) => block.operations,
  );
  const index = operations.findIndex(
    (operation) => operation.kind === "symbol-intrinsic",
  );
  assert.ok(index >= 0);
  assert.equal(operations[index - 1]?.kind, "safepoint");
  assert.equal(operations[index + 1]?.kind, "check-status");
});

test("keeps a shadowed Symbol an ordinary binding", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        hint: undefined,
        initializer: { kind: "number", range, value: 1 },
        kind: "const",
        name: "Symbol",
        range,
      },
      {
        expression: { kind: "identifier", name: "Symbol", range },
        kind: "expression",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "shadowed-symbol.ts",
  };
  const hirResult = buildHir(syntax);
  assert.deepEqual(hirResult.diagnostics, []);
  assert.ok(hirResult.program != null);
  const printed = printHir(hirResult.program);
  assert.doesNotMatch(printed, /intrinsic Symbol/u);
  assert.match(printed, /%b\d+\(Symbol\)/u);
});

test("lowers void to an operand evaluation without a status check", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        expression: {
          argument: { kind: "number", range, value: 1 },
          kind: "unary",
          operator: "void",
          range,
        },
        kind: "expression",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "void-operand.ts",
  };
  const hir = buildHir(syntax).program;
  assert.ok(hir != null);
  const operations = buildMir(hir).script.blocks.flatMap(
    (block) => block.operations,
  );
  const voidIndex = operations.findIndex(
    (operation) => operation.kind === "unary" && operation.operator === "void",
  );
  assert.ok(voidIndex >= 0);
  assert.notEqual(operations[voidIndex + 1]?.kind, "check-status");
});

test("lowers short-circuit logic through a parameterized join", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        expression: {
          kind: "logical",
          left: { kind: "boolean", range, value: false },
          operator: "&&",
          range,
          right: { kind: "number", range, value: 2 },
        },
        kind: "expression",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "logical-join.ts",
  };
  const hir = buildHir(syntax).program;
  assert.ok(hir != null);
  const script = buildMir(hir).script;
  const join = script.blocks.find(
    (block) => (block.parameters?.length ?? 0) === 1,
  );
  assert.ok(join != null);
  const jumps = script.blocks.filter(
    (block) =>
      block.terminator.kind === "jump" &&
      block.terminator.target === join.id &&
      block.terminator.values?.length === 1,
  );
  assert.equal(jumps.length, 2);
  const entry = script.blocks[0];
  assert.ok(entry != null);
  assert.equal(entry.terminator.kind, "branch");
  assert.ok(
    !entry.operations.some(
      (operation) =>
        operation.kind === "constant" && operation.constant?.kind === "number",
    ),
    "the right operand must not evaluate before the guard",
  );
});

test("lowers nullish coalescing through null and undefined checks", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        expression: {
          kind: "logical",
          left: { kind: "null", range },
          operator: "??",
          range,
          right: { kind: "number", range, value: 2 },
        },
        kind: "expression",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "nullish-join.ts",
  };
  const hir = buildHir(syntax).program;
  assert.ok(hir != null);
  const script = buildMir(hir).script;
  const join = script.blocks.find(
    (block) => (block.parameters?.length ?? 0) === 1,
  );
  assert.ok(join != null);
  const equalityChecks = script.blocks
    .flatMap((block) => block.operations)
    .filter(
      (operation) =>
        operation.kind === "binary" && operation.operator === "===",
    );
  assert.equal(equalityChecks.length, 2);
  const jumps = script.blocks.filter(
    (block) =>
      block.terminator.kind === "jump" &&
      block.terminator.target === join.id &&
      block.terminator.values?.length === 1,
  );
  assert.equal(jumps.length, 2);
});

test("lowers optional chains through one nullish branch and join", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        expression: {
          base: { kind: "null", range },
          kind: "optional-chain",
          links: [
            {
              key: { kind: "string", range, value: "method" },
              kind: "member",
              optional: true,
              range,
            },
            {
              arguments: [{ kind: "number", range, value: 2 }],
              kind: "call",
              optional: false,
              range,
            },
          ],
          range,
        },
        kind: "expression",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "optional-chain-join.ts",
  };
  const hir = buildHir(syntax).program;
  assert.ok(hir != null);
  const script = buildMir(hir).script;
  const equalityChecks = script.blocks
    .flatMap((block) => block.operations)
    .filter(
      (operation) =>
        operation.kind === "binary" && operation.operator === "===",
    );
  assert.equal(equalityChecks.length, 2);
  const join = script.blocks.find(
    (block) => (block.parameters?.length ?? 0) === 1,
  );
  assert.ok(join != null);
  const entry = script.blocks[0];
  assert.ok(entry != null);
  assert.equal(entry.terminator.kind, "branch");
  assert.ok(
    !entry.operations.some(
      (operation) =>
        operation.kind === "constant" && operation.constant?.kind === "number",
    ),
    "the call argument must not evaluate before the nullish guard",
  );
  assert.ok(
    script.blocks.some((block) =>
      block.operations.some(
        (operation) =>
          operation.kind === "call" &&
          operation.detail === "optional chain function value",
      ),
    ),
  );
});

test("lowers comma sequences to their final operand", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        expression: {
          expressions: [
            { kind: "number", range, value: 1 },
            { kind: "string", range, value: "last" },
          ],
          kind: "sequence",
          range,
        },
        kind: "expression",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "sequence.ts",
  };
  const hir = buildHir(syntax).program;
  assert.ok(hir != null);
  const operations = buildMir(hir).script.blocks.flatMap(
    (block) => block.operations,
  );
  const constants = operations.filter(
    (operation) => operation.kind === "constant",
  );
  assert.equal(constants[0]?.constant?.kind, "number");
  assert.equal(constants[1]?.constant?.kind, "string");
});

test("lowers conditional expressions into branch arms and a join", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        expression: {
          alternate: { kind: "string", range, value: "alternate" },
          consequent: { kind: "string", range, value: "consequent" },
          kind: "conditional",
          range,
          test: { kind: "boolean", range, value: true },
        },
        kind: "expression",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "conditional-join.ts",
  };
  const hir = buildHir(syntax).program;
  assert.ok(hir != null);
  const script = buildMir(hir).script;
  const join = script.blocks.find(
    (block) => (block.parameters?.length ?? 0) === 1,
  );
  assert.ok(join != null);
  const armJumps = script.blocks.filter(
    (block) =>
      block.terminator.kind === "jump" &&
      block.terminator.target === join.id &&
      block.terminator.values?.length === 1,
  );
  assert.equal(armJumps.length, 2);
  assert.match(printMir(buildMir(hir)), /join \? bb/u);
});

test("validates label references during resolution", () => {
  const labeled = (label: string, body: SyntaxStatement): SyntaxStatement => ({
    body,
    kind: "labeled",
    label,
    range,
  });
  const cases: readonly [SyntaxStatement, RegExp][] = [
    [
      labeled("known", {
        body: [{ kind: "break", label: "missing", range }],
        kind: "block",
        range,
      }),
      /Undefined label 'missing'/u,
    ],
    [
      labeled("target", {
        body: [{ kind: "continue", label: "target", range }],
        kind: "block",
        range,
      }),
      /continue label must reference an enclosing loop/u,
    ],
    [
      labeled(
        "outer",
        labeled("outer", {
          body: [],
          kind: "block",
          range,
        }),
      ),
      /Duplicate label 'outer'/u,
    ],
    [
      labeled("outer", {
        body: [
          {
            body: [{ kind: "break", label: "outer", range }],
            kind: "function",
            name: "inner",
            parameters: [],
            range,
            returnHints: [],
          },
        ],
        kind: "block",
        range,
      }),
      /Undefined label 'outer'/u,
    ],
  ];
  for (const [statement, message] of cases) {
    const result = buildHir({
      body: [statement],
      kind: "program",
      range,
      sourceId: "labels.ts",
    });
    assert.equal(result.program, undefined);
    assert.match(result.diagnostics[0]?.message ?? "", message);
  }
});

test("evaluates switch case tests lazily in separate blocks", () => {
  const switchCase = (value: number): SyntaxProgram["body"][number] => ({
    cases: [
      {
        body: [],
        range,
        test: { kind: "number", range, value: 1 },
      },
      {
        body: [],
        range,
        test: { kind: "number", range, value: 2 },
      },
    ],
    discriminant: { kind: "number", range, value },
    kind: "switch",
    range,
  });
  const syntax: SyntaxProgram = {
    body: [switchCase(2)],
    kind: "program",
    range,
    sourceId: "switch-lazy.ts",
  };
  const hir = buildHir(syntax).program;
  assert.ok(hir != null);
  const script = buildMir(hir).script;
  const testBlocks = script.blocks.filter((block) =>
    block.operations.some(
      (operation) =>
        operation.kind === "binary" && operation.operator === "===",
    ),
  );
  assert.equal(testBlocks.length, 2);
  assert.notEqual(testBlocks[0]?.id, testBlocks[1]?.id);
  assert.match(printMir(buildMir(hir)), /join switch bb/u);
});

test("runs cleanup only for control transfers that leave its region", () => {
  const emptyBlock: SyntaxStatement = { body: [], kind: "block", range };
  const internalTransfers: SyntaxProgram = {
    body: [
      {
        block: {
          body: [
            {
              body: {
                body: [
                  {
                    cases: [
                      {
                        body: [{ kind: "break", range }],
                        range,
                      },
                    ],
                    discriminant: { kind: "number", range, value: 0 },
                    kind: "switch",
                    range,
                  },
                  { kind: "continue", range },
                ],
                kind: "block",
                range,
              },
              kind: "while",
              range,
              test: { kind: "boolean", range, value: false },
            },
          ],
          kind: "block",
          range,
        },
        finalizer: emptyBlock,
        handler: undefined,
        kind: "try",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "internal-cleanup-targets.ts",
  };
  const internalHir = buildHir(internalTransfers).program;
  assert.ok(internalHir != null);
  const internalJumps = buildMir(internalHir)
    .script.blocks.flatMap((block) => block.operations)
    .filter(
      (operation) =>
        operation.kind === "completion-set" &&
        operation.completionKind === "jump",
    );
  assert.equal(internalJumps.length, 0);

  const externalTransfer: SyntaxProgram = {
    body: [
      {
        body: {
          block: {
            body: [{ kind: "break", range }],
            kind: "block",
            range,
          },
          finalizer: emptyBlock,
          handler: undefined,
          kind: "try",
          range,
        },
        kind: "while",
        range,
        test: { kind: "boolean", range, value: true },
      },
    ],
    kind: "program",
    range,
    sourceId: "external-cleanup-target.ts",
  };
  const externalHir = buildHir(externalTransfer).program;
  assert.ok(externalHir != null);
  const externalJumps = buildMir(externalHir)
    .script.blocks.flatMap((block) => block.operations)
    .filter(
      (operation) =>
        operation.kind === "completion-set" &&
        operation.completionKind === "jump",
    );
  assert.equal(externalJumps.length, 1);
  assert.equal(externalJumps[0]?.completionTarget?.cleanupDepth, 0);
});

test("copies for-head bindings once per iteration", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        body: {
          body: [
            {
              expression: {
                kind: "binding-set",
                name: "index",
                range,
                value: { kind: "number", range, value: 1 },
              },
              kind: "expression",
              range,
            },
          ],
          kind: "block",
          range,
        },
        declarations: [
          {
            declarationKind: "let",
            hint: undefined,
            initializer: { kind: "number", range, value: 0 },
            kind: "binding",
            name: "index",
            range,
          },
        ],
        kind: "for",
        range,
        test: { kind: "boolean", range, value: false },
      },
    ],
    kind: "program",
    range,
    sourceId: "for-per-iteration.ts",
  };
  const hir = buildHir(syntax).program;
  assert.ok(hir != null);
  const mir = buildMir(hir);
  const resets = mir.script.blocks
    .flatMap((block) => block.operations)
    .filter((operation) => operation.kind === "binding-reset");
  // One establishing cell, one pre-loop copy, and one per-iteration
  // copy in the update block.
  assert.equal(resets.length, 3);
  const text = printMir(mir);
  assert.match(text, /join for bb/u);
});

test("keeps do-while bodies ahead of their condition", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        body: {
          body: [
            {
              expression: { kind: "number", range, value: 1 },
              kind: "expression",
              range,
            },
          ],
          kind: "block",
          range,
        },
        kind: "do-while",
        range,
        test: { kind: "boolean", range, value: false },
      },
    ],
    kind: "program",
    range,
    sourceId: "do-while.ts",
  };
  const hir = buildHir(syntax).program;
  assert.ok(hir != null);
  const script = buildMir(hir).script;
  const entry = script.blocks[0];
  assert.ok(entry != null);
  assert.equal(entry.terminator.kind, "jump");
  const bodyId =
    entry.terminator.kind === "jump" ? entry.terminator.target : -1;
  const backEdge = script.blocks.find(
    (block) =>
      block.terminator.kind === "branch" &&
      block.terminator.whenTrue === bodyId,
  );
  assert.ok(backEdge != null, "the condition must branch back to the body");
  assert.match(printMir(buildMir(hir)), /join do-while bb/u);
});

test("rejects typeof with an unresolved name during resolution", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        expression: {
          argument: { kind: "identifier", name: "missing", range },
          kind: "unary",
          operator: "typeof",
          range,
        },
        kind: "expression",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "typeof-unresolved.ts",
  };
  const result = buildHir(syntax);
  assert.equal(result.program, undefined);
  assert.match(
    result.diagnostics[0]?.message ?? "",
    /typeof with an unresolved name/u,
  );
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
