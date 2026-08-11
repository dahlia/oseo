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

test("lowers each this mode to its own value production", () => {
  const modes = ["global", "module", "strict"] as const;
  const syntax: SyntaxProgram = {
    body: modes.map((thisMode) => ({
      expression: { kind: "this", range, thisMode },
      kind: "expression",
      range,
    })),
    kind: "program",
    range,
    sourceId: "this-modes.js",
  };
  const hirResult = buildHir(syntax);
  assert.deepEqual(hirResult.diagnostics, []);
  assert.ok(hirResult.program != null);
  const hir = printHir(hirResult.program);
  for (const thisMode of modes) {
    assert.match(hir, new RegExp(`this ${thisMode}`, "u"));
  }

  const mir = printMir(buildMir(hirResult.program));
  // A global this environment reaches an allocating runtime operation
  // that resolves a nullish receiver, a module this binding is the
  // undefined constant, and a strict receiver read allocates nothing.
  assert.match(mir, /safepoint global this allocation/u);
  assert.match(mir, /= global-this global this/u);
  assert.match(mir, /= constant module this/u);
  assert.match(mir, /= receiver this/u);
  assert.equal(mir.match(/= global-this /gu)?.length, 1);
  assert.equal(mir.match(/= constant module this/gu)?.length, 1);
  assert.equal(mir.match(/= receiver this/gu)?.length, 1);
});

test("resolves global object properties to script bindings", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        hint: undefined,
        initializer: { kind: "undefined", range },
        kind: "let",
        name: "answer",
        range,
      },
      {
        hint: undefined,
        initializer: { kind: "number", range, value: 1 },
        kind: "const",
        name: "fixed",
        range,
      },
    ],
    globalObjectNames: [{ declaration: "var", name: "answer", range }],
    kind: "program",
    range,
    sourceId: "global-object.js",
  };
  const hirResult = buildHir(syntax);
  assert.deepEqual(hirResult.diagnostics, []);
  assert.ok(hirResult.program != null);
  const bindings = hirResult.program.globalObjectBindings ?? [];
  assert.equal(bindings.length, 1);
  const answer = bindings[0];
  assert.ok(answer != null);
  assert.equal(answer.name, "answer");
  // The declaration kind reaches HIR and MIR, because it is what
  // decides whether the property ECMA-262 creates is this profile's
  // uniform one.
  assert.equal(answer.declaration, "var");
  assert.deepEqual(answer.range, range);
  assert.deepEqual(buildMir(hirResult.program).globalObjectBindings, [
    { declaration: "var", id: answer.id, name: "answer", range },
  ]);
  // The property names the binding the body already declared rather
  // than a second binding created for the global object.
  const hir = printHir(hirResult.program);
  assert.match(hir, new RegExp(`global-object %b${answer.id} answer`, "u"));
  assert.match(hir, new RegExp(`let %b${answer.id} answer`, "u"));
  const mir = printMir(buildMir(hirResult.program));
  assert.match(mir, new RegExp(`global-object %b${answer.id} answer`, "u"));
  assert.doesNotMatch(mir, /global-object %b\d+ fixed/u);
});

test("rejects a global object name with no script binding", () => {
  assert.throws(
    () =>
      buildHir({
        body: [],
        globalObjectNames: [{ declaration: "var", name: "missing", range }],
        kind: "program",
        range,
        sourceId: "global-object-missing.js",
      }),
    /Global object name 'missing' has no script binding\./u,
  );
});

/**
 * One Script whose only top-level declaration binds `name`, so the
 * global-object entry the frontend would report is the single input the
 * intrinsic-collision decision reads.
 */
function intrinsicGlobalProgram(
  declaration: "function" | "var",
  name: string,
): SyntaxProgram {
  return {
    body:
      declaration === "function"
        ? [
            {
              body: [],
              kind: "function",
              name,
              parameters: [],
              range,
              returnHints: [],
            },
          ]
        : [
            {
              hint: undefined,
              initializer: { kind: "undefined", range },
              kind: "let",
              name,
              range,
            },
          ],
    globalObjectNames: [{ declaration, name, range }],
    kind: "program",
    range,
    sourceId: "intrinsic-global.js",
  };
}

test("admits a function declaration that replaces a replaceable global", () => {
  // CreateGlobalFunctionBinding redefines a configurable intrinsic
  // property whole, which is exactly this profile's uniform writable,
  // enumerable, non-configurable property.
  for (const name of ["Symbol", "TypeError"]) {
    const result = buildHir(intrinsicGlobalProgram("function", name));
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.program?.globalObjectBindings, [
      { declaration: "function", id: 0, name, range },
    ]);
  }
});

test("carries intrinsic global declarations to the global record", () => {
  // GlobalDeclarationInstantiation decides each collision before the
  // statement list runs. HIR retains the declaration kind so the runtime
  // can preserve an existing property for `var` and reject a restricted
  // function declaration.
  const cases = [
    { declaration: "var" as const, name: "undefined" },
    { declaration: "var" as const, name: "NaN" },
    { declaration: "var" as const, name: "Infinity" },
    { declaration: "var" as const, name: "Symbol" },
    { declaration: "var" as const, name: "RangeError" },
    { declaration: "function" as const, name: "undefined" },
    { declaration: "function" as const, name: "NaN" },
    { declaration: "function" as const, name: "Infinity" },
  ];
  for (const { declaration, name } of cases) {
    const result = buildHir(intrinsicGlobalProgram(declaration, name));
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.program?.globalObjectBindings, [
      { declaration, id: 0, name, range },
    ]);
  }
});

test("keeps an ordinary top-level name clear of the collision check", () => {
  const result = buildHir(intrinsicGlobalProgram("var", "Symbolic"));
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.program?.globalObjectBindings, [
    { declaration: "var", id: 0, name: "Symbolic", range },
  ]);
});

test("preserves global lexical declaration ranges through MIR", () => {
  const declarationRange = {
    end: { column: 18, line: 4 },
    start: { column: 5, line: 4 },
  };
  const result = buildHir({
    body: [],
    globalLexicalNames: [{ name: "undefined", range: declarationRange }],
    kind: "program",
    range,
    sourceId: "global-lexical-range.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.program?.globalLexicalNames, [
    { name: "undefined", range: declarationRange },
  ]);
  assert.ok(result.program != null);
  assert.deepEqual(buildMir(result.program).globalLexicalNames, [
    { name: "undefined", range: declarationRange },
  ]);
});

test("rejects duplicate prototype setters at the HIR boundary", () => {
  const result = buildHir({
    body: [
      {
        expression: {
          kind: "object",
          properties: [
            {
              key: { kind: "string", range, value: "__proto__" },
              kind: "definition",
              prototypeSetter: true,
              value: { kind: "null", range },
            },
            {
              key: { kind: "string", range, value: "__proto__" },
              kind: "definition",
              prototypeSetter: true,
              value: { kind: "object", properties: [], range },
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
    sourceId: "duplicate-object-prototype-setters.js",
  });
  assert.equal(result.program, undefined);
  assert.deepEqual(result.diagnostics, [
    {
      byteRange: { end: 0, start: 0 },
      code: "OSEO1001",
      message: "An object literal cannot contain multiple prototype setters.",
      range,
      sourceId: "duplicate-object-prototype-setters.js",
    },
  ]);
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
      {
        expression: {
          argument: { kind: "identifier", name: "arguments", range },
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
  assert.match(printHir(hir), /\n  false[\s\S]*\n  true[\s\S]*\n  true/u);
  const operations = buildMir(hir).script.blocks.flatMap(
    (block) => block.operations,
  );
  assert.equal(
    operations.filter((operation) => operation.kind === "read").length,
    0,
  );
});

test("resolves delete arguments through every owning function form", () => {
  const ordinary = buildHir({
    body: [
      {
        body: [
          {
            expression: {
              argument: { kind: "identifier", name: "arguments", range },
              kind: "delete",
              range,
            },
            kind: "return",
            range,
          },
        ],
        kind: "function",
        name: "available",
        parameters: [],
        range,
        returnHints: [],
      },
    ],
    kind: "program",
    range,
    sourceId: "delete-ordinary-arguments.js",
  });
  assert.deepEqual(ordinary.diagnostics, []);
  const ordinaryReturn = ordinary.program?.functions[0]?.body[0];
  assert.equal(ordinaryReturn?.kind, "return");
  if (ordinaryReturn?.kind === "return") {
    assert.equal(ordinaryReturn.expression?.kind, "boolean");
    if (ordinaryReturn.expression?.kind === "boolean") {
      assert.equal(ordinaryReturn.expression.value, false);
    }
  }

  // An asynchronous function owns its own `arguments` binding now, so
  // deleting the resolved name answers `false` exactly as an ordinary
  // function's does instead of reporting an unavailable profile.
  const asynchronous = buildHir({
    body: [
      {
        body: [
          {
            expression: {
              argument: { kind: "identifier", name: "arguments", range },
              kind: "delete",
              range,
            },
            kind: "return",
            range,
          },
        ],
        functionKind: "async",
        kind: "function",
        name: "available",
        parameters: [],
        range,
        returnHints: [],
      },
    ],
    kind: "program",
    range,
    sourceId: "delete-arguments-async.js",
  });
  assert.deepEqual(asynchronous.diagnostics, []);
  const asynchronousReturn = asynchronous.program?.functions[0]?.body[0];
  assert.equal(asynchronousReturn?.kind, "return");
  if (asynchronousReturn?.kind === "return") {
    assert.equal(asynchronousReturn.expression?.kind, "boolean");
    if (asynchronousReturn.expression?.kind === "boolean") {
      assert.equal(asynchronousReturn.expression.value, false);
    }
  }

  // An arrow declares none of its own, so `delete arguments` inside one
  // with no enclosing function is an unresolvable-reference delete and
  // answers `true`, exactly as a Script's own top level does.
  const arrow = buildHir({
    body: [
      {
        body: [
          {
            expression: {
              argument: { kind: "identifier", name: "arguments", range },
              kind: "delete",
              range,
            },
            kind: "return",
            range,
          },
        ],
        functionKind: "arrow",
        kind: "function",
        name: "unresolved",
        parameters: [],
        range,
        returnHints: [],
      },
    ],
    kind: "program",
    range,
    sourceId: "delete-arguments-arrow.js",
  });
  assert.deepEqual(arrow.diagnostics, []);
  const arrowReturn = arrow.program?.functions[0]?.body[0];
  assert.equal(arrowReturn?.kind, "return");
  if (arrowReturn?.kind === "return") {
    assert.equal(arrowReturn.expression?.kind, "boolean");
    if (arrowReturn.expression?.kind === "boolean") {
      assert.equal(arrowReturn.expression.value, true);
    }
  }
});

test("admits the mapped arguments object only for a simple list", () => {
  const mapped = buildHir({
    body: [
      {
        body: [],
        kind: "function",
        name: "simple",
        parameters: [
          { hints: [], name: "a", range },
          { hints: [], name: "b", range },
        ],
        range,
        returnHints: [],
        simpleParameterList: true,
      },
    ],
    kind: "program",
    range,
    sourceId: "mapped-arguments-simple.js",
  });
  assert.deepEqual(mapped.diagnostics, []);
  const mappedFunction = mapped.program?.functions[0];
  assert.ok(mappedFunction?.argumentsBindingId != null);
  assert.equal(mappedFunction?.argumentsMapped, true);

  const unmapped = buildHir({
    body: [
      {
        body: [],
        kind: "function",
        name: "rest",
        parameters: [{ hints: [], name: "a", range, rest: true }],
        range,
        returnHints: [],
      },
    ],
    kind: "program",
    range,
    sourceId: "mapped-arguments-rest.js",
  });
  assert.deepEqual(unmapped.diagnostics, []);
  const unmappedFunction = unmapped.program?.functions[0];
  assert.ok(unmappedFunction?.argumentsBindingId != null);
  assert.equal(unmappedFunction?.argumentsMapped, undefined);

  const strict = buildHir({
    body: [
      {
        body: [],
        kind: "function",
        name: "strictSimple",
        parameters: [{ hints: [], name: "a", range }],
        range,
        returnHints: [],
        simpleParameterList: true,
        strict: true,
      },
    ],
    kind: "program",
    range,
    sourceId: "mapped-arguments-strict.js",
  });
  assert.deepEqual(strict.diagnostics, []);
  const strictFunction = strict.program?.functions[0];
  // A strict function owns the binding but never the mapped shape, so it
  // takes the unmapped snapshot even with a simple parameter list.
  assert.ok(strictFunction?.argumentsBindingId != null);
  assert.equal(strictFunction?.argumentsMapped, undefined);
});

test("gives every function form except an arrow its own arguments", () => {
  const owning = [
    "async",
    "async-generator",
    "class",
    "generator",
    "method",
    "ordinary",
  ] as const;
  for (const functionKind of owning) {
    const result = buildHir({
      body: [
        {
          body: [],
          functionKind,
          kind: "function",
          name: "owner",
          parameters: [],
          range,
          returnHints: [],
          simpleParameterList: true,
        },
      ],
      kind: "program",
      range,
      sourceId: `arguments-owner-${functionKind}.js`,
    });
    assert.deepEqual(result.diagnostics, []);
    assert.ok(
      result.program?.functions[0]?.argumentsBindingId != null,
      `${functionKind} owns an arguments binding`,
    );
  }
  for (const functionKind of ["arrow", "async-arrow"] as const) {
    const result = buildHir({
      body: [
        {
          body: [],
          functionKind,
          kind: "function",
          name: "lexical",
          parameters: [],
          range,
          returnHints: [],
          simpleParameterList: true,
        },
      ],
      kind: "program",
      range,
      sourceId: `arguments-arrow-${functionKind}.js`,
    });
    assert.deepEqual(result.diagnostics, []);
    assert.equal(
      result.program?.functions[0]?.argumentsBindingId,
      undefined,
      `${functionKind} declares no arguments binding`,
    );
    assert.equal(result.program?.functions[0]?.argumentsMapped, undefined);
  }
});

test("resolves an arrow's arguments to the enclosing function binding", () => {
  const result = buildHir({
    body: [
      {
        body: [
          {
            expression: {
              functionValue: {
                body: [
                  {
                    expression: {
                      kind: "identifier",
                      name: "arguments",
                      range,
                    },
                    kind: "return",
                    range,
                  },
                ],
                functionKind: "arrow",
                kind: "function",
                name: undefined,
                parameters: [],
                range,
                returnHints: [],
                simpleParameterList: true,
              },
              kind: "function",
              range,
            },
            kind: "return",
            range,
          },
        ],
        kind: "function",
        name: "outer",
        parameters: [],
        range,
        returnHints: [],
        simpleParameterList: true,
      },
    ],
    kind: "program",
    range,
    sourceId: "arrow-captures-arguments.js",
  });
  assert.deepEqual(result.diagnostics, []);
  const outer = result.program?.functions.find(
    (functionValue) => functionValue.name === "outer",
  );
  const arrow = result.program?.functions.find(
    (functionValue) => functionValue.functionKind === "arrow",
  );
  assert.ok(outer?.argumentsBindingId != null);
  assert.equal(arrow?.argumentsBindingId, undefined);
  const arrowReturn = arrow?.body[0];
  assert.equal(arrowReturn?.kind, "return");
  if (arrowReturn?.kind === "return") {
    assert.equal(arrowReturn.expression?.kind, "binding");
    if (arrowReturn.expression?.kind === "binding") {
      assert.equal(arrowReturn.expression.bindingId, outer?.argumentsBindingId);
    }
  }
});

test("reuses a parameter's binding for a same-name hoisted function", () => {
  // FunctionDeclarationInstantiation instantiates a FunctionBody's own
  // top-level function declarations into the same environment as the
  // parameters whenever the parameter list has no parameter expressions,
  // so a function declaration sharing a parameter's name writes through
  // the parameter's own binding instead of a fresh one; the mapped
  // arguments object this unit admits depends on that identity.
  const mapped = buildHir({
    body: [
      {
        body: [
          {
            body: [],
            kind: "function",
            name: "a",
            parameters: [],
            range,
            returnHints: [],
          },
        ],
        kind: "function",
        name: "f",
        parameters: [{ hints: [], name: "a", range }],
        range,
        returnHints: [],
        simpleParameterList: true,
      },
    ],
    kind: "program",
    range,
    sourceId: "reuse-parameter-function.js",
  });
  assert.deepEqual(mapped.diagnostics, []);
  const functionValue = mapped.program?.functions.find((f) => f.name === "f");
  const parameterBindingId = functionValue?.parameters[0]?.bindingId;
  const init = functionValue?.body[0];
  assert.equal(init?.kind, "function-init");
  if (init?.kind !== "function-init") return;
  assert.equal(init.bindingId, parameterBindingId);
  assert.equal(init.alreadyInitialized, true);

  // A genuinely nested block's function declaration is a distinct,
  // lexically shadowing binding: it must not reuse the parameter's cell
  // even though it shares its name.
  const shadowed = buildHir({
    body: [
      {
        body: [
          {
            body: [
              {
                body: [],
                kind: "function",
                name: "a",
                parameters: [],
                range,
                returnHints: [],
              },
            ],
            kind: "block",
            range,
          },
        ],
        kind: "function",
        name: "g",
        parameters: [{ hints: [], name: "a", range }],
        range,
        returnHints: [],
        simpleParameterList: true,
      },
    ],
    kind: "program",
    range,
    sourceId: "shadowed-parameter-function.js",
  });
  assert.deepEqual(shadowed.diagnostics, []);
  const shadowedFunction = shadowed.program?.functions.find(
    (f) => f.name === "g",
  );
  const shadowedParameterBindingId = shadowedFunction?.parameters[0]?.bindingId;
  const block = shadowedFunction?.body[0];
  assert.equal(block?.kind, "block");
  if (block?.kind !== "block") return;
  const blockInit = block.body[0];
  assert.equal(blockInit?.kind, "function-init");
  if (blockInit?.kind !== "function-init") return;
  assert.notEqual(blockInit.bindingId, shadowedParameterBindingId);
  assert.equal(blockInit.alreadyInitialized, undefined);

  // A second same-name declaration at the same body top level replaces
  // the first as the one `buildFunctionInits` keeps, per the existing
  // last-repeated-declaration rule; it must still carry
  // `alreadyInitialized` forward, since it targets the very same
  // parameter binding the first declaration already reused.
  const repeated = buildHir({
    body: [
      {
        body: [
          {
            body: [],
            kind: "function",
            name: "a",
            parameters: [],
            range,
            returnHints: [],
          },
          {
            body: [],
            kind: "function",
            name: "a",
            parameters: [],
            range,
            returnHints: [],
          },
        ],
        kind: "function",
        name: "h",
        parameters: [{ hints: [], name: "a", range }],
        range,
        returnHints: [],
        simpleParameterList: true,
      },
    ],
    kind: "program",
    range,
    sourceId: "repeated-parameter-function.js",
  });
  assert.deepEqual(repeated.diagnostics, []);
  const repeatedFunction = repeated.program?.functions.find(
    (f) => f.name === "h",
  );
  const repeatedParameterBindingId = repeatedFunction?.parameters[0]?.bindingId;
  const repeatedInit = repeatedFunction?.body[0];
  assert.equal(repeatedInit?.kind, "function-init");
  if (repeatedInit?.kind !== "function-init") return;
  assert.equal(repeatedInit.bindingId, repeatedParameterBindingId);
  assert.equal(repeatedInit.alreadyInitialized, true);
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

test("resolves an owned catch clause without a parameter", () => {
  const logValue = {
    arguments: [{ kind: "identifier", name: "value", range }],
    kind: "call",
    range,
    target: { kind: "console-log", range },
  } as const;
  const syntax: SyntaxProgram = {
    body: [
      {
        hint: undefined,
        initializer: { kind: "number", range, value: 1 },
        kind: "let",
        name: "value",
        range,
      },
      {
        block: {
          body: [
            {
              expression: { kind: "number", range, value: 2 },
              kind: "throw",
              range,
            },
          ],
          kind: "block",
          range,
        },
        finalizer: undefined,
        handler: {
          body: {
            body: [
              {
                hint: undefined,
                initializer: { kind: "number", range, value: 3 },
                kind: "let",
                name: "value",
                range,
              },
              { expression: logValue, kind: "expression", range },
            ],
            kind: "block",
            range,
          },
          pattern: undefined,
          range,
        },
        kind: "try",
        range,
      },
      { expression: logValue, kind: "expression", range },
    ],
    kind: "program",
    range,
    sourceId: "optional-catch-binding.ts",
  };
  const hirResult = buildHir(syntax);
  assert.deepEqual(hirResult.diagnostics, []);
  assert.ok(hirResult.program != null);
  const hir = printHir(hirResult.program);
  assert.match(hir, /^\s*catch$/mu);
  // The catch block keeps its own lexical scope: the shadowing `let`
  // declares a distinct binding, and the read after the statement
  // resolves to the outer one.
  const declared = [...hir.matchAll(/let %b(\d+) value/gu)].map(
    (entry) => entry[1],
  );
  assert.equal(declared.length, 2);
  assert.notEqual(declared[0], declared[1]);
  const reads = [...hir.matchAll(/%b(\d+)\(value\)/gu)].map(
    (entry) => entry[1],
  );
  assert.deepEqual(reads, [declared[1], declared[0]]);

  const mir = printMir(buildMir(hirResult.program));
  assert.match(mir, /caught discarded catch value/u);
  assert.doesNotMatch(mir, /caught catch parameter/u);
});

test("treats a nullish owned catch pattern as the absent parameter", () => {
  const result = buildHir({
    body: [
      {
        block: { body: [], kind: "block", range },
        finalizer: undefined,
        handler: {
          body: { body: [], kind: "block", range },
          pattern: null,
          range,
        },
        kind: "try",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "null-catch-pattern.ts",
  } as unknown as SyntaxProgram);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.program != null);
  assert.match(printHir(result.program), /^\s*catch$/mu);
});

test("rejects an owned catch handler without a body", () => {
  const result = buildHir({
    body: [
      {
        block: { body: [], kind: "block", range },
        finalizer: undefined,
        handler: { pattern: undefined, range },
        kind: "try",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "catch-without-body.ts",
  } as unknown as SyntaxProgram);
  assert.equal(result.program, undefined);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.match(
    result.diagnostics[0]?.message ?? "",
    /A catch clause requires a block body/u,
  );
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

test("rejects nested array patterns in owned for-in heads", () => {
  // Owned syntax narrows a for-in head to an object pattern, but a
  // nested array pattern stays representable as an ordinary recursive
  // leaf. The enumerated key is always a String and this realm creates
  // no string iterator, so HIR repeats the frontend's rejection for any
  // frontend rather than lowering an iterator acquisition that could
  // only throw.
  const nested = {
    elements: [
      {
        pattern: { hints: [], kind: "binding-identifier", name: "x", range },
        range,
      },
    ],
    kind: "array-binding-pattern",
    range,
  };
  const heads = [
    { declarationKind: "const", kind: "pattern-declaration", range },
    { declarationKind: "var", kind: "pattern-declaration", range },
    { kind: "assignment-pattern", range },
  ] as const;
  for (const head of heads) {
    const result = buildHir({
      body: [
        {
          hint: undefined,
          initializer: { kind: "undefined", range },
          kind: "let",
          name: "x",
          range,
        },
        {
          body: { body: [], kind: "block", range },
          kind: "for-in",
          range,
          subject: { kind: "object", properties: [], range },
          target: {
            ...head,
            pattern: {
              kind: "object-binding-pattern",
              properties: [
                {
                  key: { kind: "string", range, value: "0" },
                  pattern: nested,
                  range,
                },
              ],
              range,
            },
          },
        },
      ],
      kind: "program",
      range,
      sourceId: "invalid-for-in-array-pattern.ts",
    } as unknown as SyntaxProgram);
    assert.equal(result.program, undefined, head.kind);
    assert.match(
      result.diagnostics[0]?.message ?? "",
      /for-in array pattern target is unsupported/u,
      head.kind,
    );
  }
});

test("rejects a non-object owned for-in head pattern", () => {
  const result = buildHir({
    body: [
      {
        body: { body: [], kind: "block", range },
        kind: "for-in",
        range,
        subject: { kind: "object", properties: [], range },
        target: {
          declarationKind: "let",
          kind: "pattern-declaration",
          pattern: {
            elements: [],
            kind: "array-binding-pattern",
            range,
          },
          range,
        },
      },
    ],
    kind: "program",
    range,
    sourceId: "invalid-for-in-head-pattern.ts",
  } as unknown as SyntaxProgram);
  assert.equal(result.program, undefined);
  assert.match(
    result.diagnostics[0]?.message ?? "",
    /for-in head pattern must be an object pattern/u,
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

test("hoists a switch clause function into one CaseBlock instantiation", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        cases: [
          {
            body: [
              {
                body: [
                  {
                    expression: { kind: "number", range, value: 1 },
                    kind: "return",
                    range,
                  },
                ],
                kind: "function",
                name: "inner",
                parameters: [],
                range,
                returnHints: [],
              },
            ],
            range,
            test: { kind: "number", range, value: 1 },
          },
        ],
        discriminant: { kind: "number", range, value: 1 },
        kind: "switch",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "switch-function-hoist.ts",
  };
  const result = buildHir(syntax);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.program != null);
  const statement = result.program.body[0];
  assert.equal(statement?.kind, "switch");
  if (statement?.kind !== "switch") return;
  // The declaration is instantiated once, shared by the whole CaseBlock,
  // rather than inline in the one clause where it appears.
  assert.equal(statement.functionInits?.length, 1);
  assert.equal(statement.functionInits?.[0]?.kind, "function-init");
  assert.equal(statement.cases[0]?.body.length, 0);
});

test("rejects every duplicate function name in a switch clause", () => {
  // ECMA-262 exempts a duplicate LexicallyDeclaredNames entry from a
  // CaseBlock's early error only when the host supports Block-Level
  // Function Declarations Web Legacy Compatibility Semantics (Annex
  // B.3.2), which this closed ahead-of-time profile does not implement.
  // A CaseBlock therefore rejects a duplicate function name outright,
  // regardless of matching kind or strictness, unlike a Script or
  // FunctionBody's own unconditional top-level exemption.
  const declaration = (functionKind: "generator" | "ordinary") => ({
    body: [],
    functionKind,
    kind: "function" as const,
    name: "f",
    parameters: [],
    range,
    returnHints: [],
  });
  for (const strict of [false, true]) {
    for (const kinds of [
      ["ordinary", "ordinary"],
      ["ordinary", "generator"],
    ] as const) {
      const result = buildHir({
        body: [
          {
            cases: [
              {
                body: [declaration(kinds[0])],
                range,
                test: { kind: "number", range, value: 1 },
              },
              {
                body: [declaration(kinds[1])],
                range,
                test: { kind: "number", range, value: 2 },
              },
            ],
            discriminant: { kind: "number", range, value: 0 },
            kind: "switch",
            range,
          },
        ],
        kind: "program",
        range,
        sourceId: "switch-function-duplicate.ts",
        strict,
      });
      const label = `${kinds.join("+")} ${strict}`;
      assert.equal(result.program, undefined, label);
      assert.equal(result.diagnostics.length, 1, label);
      assert.equal(result.diagnostics[0]?.code, "OSEO1001", label);
      assert.match(
        result.diagnostics[0]?.message ?? "",
        /Duplicate declaration 'f'/u,
        label,
      );
    }
  }
});

test("admits a top-level function redeclaration of any kind", () => {
  // A Script or FunctionBody's top-level function declaration is a
  // hoistable, var-like declaration: ECMA-262 admits any later
  // declaration of the same name, of any kind, and in strict mode too,
  // unlike a Block or CaseBlock's LexicallyDeclaredNames.
  const declaration = (
    functionKind: "generator" | "ordinary",
    value: number,
  ) => ({
    body: [
      {
        expression: { kind: "number" as const, range, value },
        kind: "return" as const,
        range,
      },
    ],
    functionKind,
    kind: "function" as const,
    name: "f",
    parameters: [],
    range,
    returnHints: [],
  });
  for (const strict of [false, true]) {
    for (const kinds of [
      ["generator", "generator"],
      ["ordinary", "generator"],
    ] as const) {
      const result = buildHir({
        body: [declaration(kinds[0], 1), declaration(kinds[1], 2)],
        kind: "program",
        range,
        sourceId: "top-level-function-duplicate.ts",
        strict,
      });
      assert.deepEqual(result.diagnostics, [], `${kinds.join("+")} ${strict}`);
      assert.ok(result.program != null);
      assert.equal(result.program.functions.length, 1);
      assert.match(printHir(result.program), /return 2/u);
    }
  }
});

test("keeps a parameter-environment body wrapper var-like", () => {
  // A parameter-environment function's synthetic body wrapper is a Block
  // in shape only, not a source Block: the frontend uses it only to give
  // the FunctionBody a scope distinct from its own separate parameter
  // scope. Its own top-level function declarations must keep the
  // FunctionBody's var-like redeclaration policy, so
  // `parameterEnvironmentBody` marks the wrapper and the duplicate below
  // stays admitted, unlike the identical duplicate inside a genuine
  // nested block.
  const declaration = (value: number) => ({
    body: [
      {
        expression: { kind: "number" as const, range, value },
        kind: "return" as const,
        range,
      },
    ],
    kind: "function" as const,
    name: "f",
    parameters: [],
    range,
    returnHints: [],
  });
  const wrappedBody = (parameterEnvironmentBody: boolean) => [
    {
      body: [declaration(1), declaration(2)],
      kind: "block" as const,
      range,
      ...(parameterEnvironmentBody ? { parameterEnvironmentBody } : {}),
    },
  ];
  const wrapped = buildHir({
    body: [
      {
        body: wrappedBody(true),
        kind: "function",
        name: "outer",
        parameters: [],
        range,
        returnHints: [],
      },
    ],
    kind: "program",
    range,
    sourceId: "parameter-environment-body.ts",
  });
  assert.deepEqual(wrapped.diagnostics, []);
  assert.ok(wrapped.program != null);
  assert.match(printHir(wrapped.program), /return 2/u);

  const genuine = buildHir({
    body: [
      {
        body: wrappedBody(false),
        kind: "function",
        name: "outer",
        parameters: [],
        range,
        returnHints: [],
      },
    ],
    kind: "program",
    range,
    sourceId: "genuine-block-body.ts",
  });
  assert.equal(genuine.program, undefined);
  assert.equal(genuine.diagnostics.length, 1);
  assert.equal(genuine.diagnostics[0]?.code, "OSEO1001");
  assert.match(
    genuine.diagnostics[0]?.message ?? "",
    /Duplicate declaration 'f'/u,
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

test("expands a lexical declaration list into the enclosing list", () => {
  const declarators = [
    {
      hint: undefined,
      initializer: { kind: "number", range, value: 1 },
      kind: "let",
      name: "first",
      range,
    },
    {
      hint: undefined,
      initializer: { kind: "number", range, value: 2 },
      kind: "let",
      name: "second",
      range,
    },
  ] as const;
  const syntax: SyntaxProgram = {
    body: [
      { declarations: declarators, kind: "declaration-list", range },
      {
        expression: {
          arguments: [
            { kind: "identifier", name: "first", range },
            { kind: "identifier", name: "second", range },
          ],
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
    sourceId: "declaration-list.ts",
  };
  const result = buildHir(syntax);
  assert.deepEqual(result.diagnostics, []);
  // The declarators become siblings of the statement that follows them,
  // so no block is inserted and no second scope owns their cells.
  assert.deepEqual(
    result.program?.body.map((statement) => statement.kind),
    ["let", "let", "expression"],
  );
});

test("rejects a declaration list in a single-statement position", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        alternate: undefined,
        consequent: {
          declarations: [
            {
              hint: undefined,
              initializer: { kind: "number", range, value: 1 },
              kind: "let",
              name: "first",
              range,
            },
            {
              hint: undefined,
              initializer: { kind: "number", range, value: 2 },
              kind: "let",
              name: "second",
              range,
            },
          ],
          kind: "declaration-list",
          range,
        },
        kind: "if",
        range,
        test: { kind: "boolean", range, value: true },
      },
    ],
    kind: "program",
    range,
    sourceId: "declaration-list-position.ts",
  };
  const result = buildHir(syntax);
  assert.equal(result.program, undefined);
  assert.equal(result.diagnostics.length, 1);
  assert.match(
    result.diagnostics[0]?.message ?? "",
    /lexical declaration list requires a statement list/u,
  );
});

test("rejects a lexical declaration list that mixes binding kinds", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        declarations: [
          {
            hint: undefined,
            initializer: { kind: "number", range, value: 1 },
            kind: "let",
            name: "first",
            range,
          },
          {
            hint: undefined,
            initializer: { kind: "number", range, value: 2 },
            kind: "const",
            name: "second",
            range,
          },
        ],
        kind: "declaration-list",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "declaration-list-kinds.ts",
  };
  const result = buildHir(syntax);
  assert.equal(result.program, undefined);
  // One LetOrConst covers a whole BindingList, so a mixed list has no
  // mutability to resolve and is reported exactly once.
  assert.equal(result.diagnostics.length, 1);
  assert.match(
    result.diagnostics[0]?.message ?? "",
    /declaration list declares one kind of binding/u,
  );
});

test("resolves references to a rejected mixed declaration list", () => {
  const syntax: SyntaxProgram = {
    body: [
      {
        declarations: [
          {
            hint: undefined,
            initializer: { kind: "number", range, value: 1 },
            kind: "let",
            name: "first",
            range,
          },
          {
            hint: undefined,
            initializer: { kind: "number", range, value: 2 },
            kind: "const",
            name: "second",
            range,
          },
        ],
        kind: "declaration-list",
        range,
      },
      {
        expression: {
          arguments: [
            { kind: "identifier", name: "first", range },
            { kind: "identifier", name: "second", range },
          ],
          kind: "call",
          range,
          target: { kind: "console-log", range },
        },
        kind: "expression",
        range,
      },
      {
        expression: {
          functionValue: {
            body: [
              {
                expression: {
                  arguments: [{ kind: "identifier", name: "second", range }],
                  kind: "call",
                  range,
                  target: { kind: "console-log", range },
                },
                kind: "expression",
                range,
              },
            ],
            functionKind: "arrow",
            kind: "function",
            name: undefined,
            parameters: [],
            range,
            returnHints: [],
          },
          kind: "function",
          range,
        },
        kind: "expression",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "declaration-list-kinds-reference.ts",
  };
  const result = buildHir(syntax);
  assert.equal(result.program, undefined);
  // The rejected list still predeclares its declarators, so a later
  // reference resolves and the invalid list reports one diagnostic
  // rather than one per name that reads it.
  assert.equal(result.diagnostics.length, 1);
  assert.match(
    result.diagnostics[0]?.message ?? "",
    /declaration list declares one kind of binding/u,
  );
});
