/** Stable diagnostic codes owned by the Oseo compiler. */
export type DiagnosticCode = "OSEO0001" | "OSEO1001" | "OSEO2001" | "OSEO3001";

/** A half-open UTF-8 byte range. */
export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/** A one-based Unicode scalar-value source position. */
export interface Position {
  readonly line: number;
  readonly column: number;
}

/** A half-open source range. */
export interface SourceRange {
  readonly start: Position;
  readonly end: Position;
}

/** A source-located error independent of a bootstrap parser or host. */
export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly sourceId: string;
  readonly byteRange: ByteRange;
  readonly range: SourceRange;
  readonly message: string;
  readonly notes?: readonly string[];
}

/** Input accepted by a source frontend implementation. */
export interface SourceInput {
  readonly source: string;
  readonly sourceId: string;
}

/** Provenance retained for an optimization hint. */
export type HintProvenance = "jsdoc" | "typescript";

/** Primitive hint names accepted during M1. */
export type HintName =
  | "any"
  | "boolean"
  | "null"
  | "number"
  | "string"
  | "undefined"
  | "unknown";

/** An owned hint that cannot expose a bootstrap-parser node. */
export interface Hint {
  readonly name: HintName;
  readonly provenance: HintProvenance;
  readonly range: SourceRange;
}

interface LocatedSyntax {
  readonly range: SourceRange;
  readonly byteRange?: ByteRange;
}

/** A call target admitted by the M1 language profile. */
export type SyntaxCallTarget =
  | (LocatedSyntax & {
      readonly kind: "console-log";
    })
  | (LocatedSyntax & {
      readonly kind: "name";
      readonly name: string;
    });

/** Binary operations selected before native backend lowering. */
export type BinaryOperator =
  | "!=="
  | "*"
  | "+"
  | "-"
  | "/"
  | "<"
  | "<="
  | "==="
  | ">"
  | ">=";

/** An expression in the parser-independent M1 syntax tree. */
export type SyntaxExpression =
  | (LocatedSyntax & {
      readonly kind: "binding-set";
      readonly name: string;
      readonly value: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly elements: readonly (SyntaxExpression | undefined)[];
      readonly kind: "array";
    })
  | (LocatedSyntax & {
      readonly kind: "binary";
      readonly left: SyntaxExpression;
      readonly operator: BinaryOperator;
      readonly right: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "boolean";
      readonly value: boolean;
    })
  | (LocatedSyntax & {
      readonly arguments: readonly SyntaxExpression[];
      readonly kind: "call";
      readonly target: SyntaxCallTarget;
    })
  | (LocatedSyntax & {
      readonly kind: "identifier";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly kind: "null";
    })
  | (LocatedSyntax & {
      readonly kind: "object";
      readonly properties: readonly {
        readonly key: SyntaxExpression;
        readonly value: SyntaxExpression;
      }[];
    })
  | (LocatedSyntax & {
      readonly key: SyntaxExpression;
      readonly kind: "property-delete";
      readonly object: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly key: SyntaxExpression;
      readonly kind: "property-get";
      readonly object: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly key: SyntaxExpression;
      readonly kind: "property-set";
      readonly object: SyntaxExpression;
      readonly value: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "number";
      readonly value: number;
    })
  | (LocatedSyntax & {
      readonly kind: "string";
      readonly value: string;
    })
  | (LocatedSyntax & {
      readonly argument: SyntaxExpression;
      readonly kind: "unary";
      readonly operator: "!" | "-";
    })
  | (LocatedSyntax & {
      readonly kind: "undefined";
    });

/** One plain function parameter and its retained hints. */
export interface SyntaxParameter extends LocatedSyntax {
  readonly hints: readonly Hint[];
  readonly name: string;
}

/** A statement in the parser-independent M1 syntax tree. */
export type SyntaxStatement =
  | (LocatedSyntax & {
      readonly body: readonly SyntaxStatement[];
      readonly kind: "block";
    })
  | (LocatedSyntax & {
      readonly kind: "break";
    })
  | (LocatedSyntax & {
      readonly kind: "continue";
    })
  | (LocatedSyntax & {
      readonly hint: Hint | undefined;
      readonly initializer: SyntaxExpression;
      readonly kind: "const";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly hint: Hint | undefined;
      readonly initializer: SyntaxExpression;
      readonly kind: "let";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly expression: SyntaxExpression;
      readonly kind: "expression";
    })
  | (LocatedSyntax & {
      readonly alternate: SyntaxStatement | undefined;
      readonly consequent: SyntaxStatement;
      readonly kind: "if";
      readonly test: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly expression: SyntaxExpression | undefined;
      readonly kind: "return";
    })
  | (LocatedSyntax & {
      readonly body: SyntaxStatement;
      readonly kind: "while";
      readonly test: SyntaxExpression;
    });

/** A top-level function declaration in owned syntax. */
export interface SyntaxFunction extends LocatedSyntax {
  readonly body: readonly SyntaxStatement[];
  readonly kind: "function";
  readonly name: string;
  readonly parameters: readonly SyntaxParameter[];
  readonly returnHints: readonly Hint[];
}

/** One owned M1 script, with no parser-specific values. */
export interface SyntaxProgram extends LocatedSyntax {
  readonly body: readonly (SyntaxFunction | SyntaxStatement)[];
  readonly kind: "program";
  readonly sourceId: string;
}

/** Production frontend output for owned M1 syntax. */
export interface FrontendResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly parsed: boolean;
  readonly program?: SyntaxProgram;
  readonly sourceId: string;
}

/** Replaceable source frontend boundary owned by compiler core. */
export interface SourceFrontend {
  parse(input: SourceInput): FrontendResult;
}

/** A resolved call target in HIR. */
export type HirCallTarget =
  | {
      readonly kind: "console-log";
    }
  | {
      readonly functionId: number;
      readonly kind: "function";
      readonly name: string;
    };

/** A resolved, normalized HIR expression. */
export type HirExpression =
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly kind: "binding-set";
      readonly name: string;
      readonly value: HirExpression;
    })
  | (LocatedSyntax & {
      readonly elements: readonly (HirExpression | undefined)[];
      readonly kind: "array";
    })
  | (LocatedSyntax & {
      readonly kind: "binary";
      readonly left: HirExpression;
      readonly operator: BinaryOperator;
      readonly right: HirExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "boolean";
      readonly value: boolean;
    })
  | (LocatedSyntax & {
      readonly arguments: readonly HirExpression[];
      readonly kind: "call";
      readonly target: HirCallTarget;
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly kind: "binding";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly kind: "null";
    })
  | (LocatedSyntax & {
      readonly kind: "object";
      readonly properties: readonly {
        readonly key: HirExpression;
        readonly value: HirExpression;
      }[];
    })
  | (LocatedSyntax & {
      readonly key: HirExpression;
      readonly kind: "property-delete";
      readonly object: HirExpression;
    })
  | (LocatedSyntax & {
      readonly key: HirExpression;
      readonly kind: "property-get";
      readonly object: HirExpression;
    })
  | (LocatedSyntax & {
      readonly key: HirExpression;
      readonly kind: "property-set";
      readonly object: HirExpression;
      readonly value: HirExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "number";
      readonly value: number;
    })
  | (LocatedSyntax & {
      readonly kind: "string";
      readonly value: string;
    })
  | (LocatedSyntax & {
      readonly argument: HirExpression;
      readonly kind: "unary";
      readonly operator: "!" | "-";
    })
  | (LocatedSyntax & {
      readonly kind: "undefined";
    });

/** A resolved HIR statement with explicit binding identity. */
export type HirStatement =
  | (LocatedSyntax & {
      readonly body: readonly HirStatement[];
      readonly kind: "block";
    })
  | (LocatedSyntax & {
      readonly kind: "break";
    })
  | (LocatedSyntax & {
      readonly kind: "continue";
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly hint: Hint | undefined;
      readonly initializer: HirExpression;
      readonly kind: "const";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly hint: Hint | undefined;
      readonly initializer: HirExpression;
      readonly kind: "let";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly expression: HirExpression;
      readonly kind: "expression";
    })
  | (LocatedSyntax & {
      readonly alternate: HirStatement | undefined;
      readonly consequent: HirStatement;
      readonly kind: "if";
      readonly test: HirExpression;
    })
  | (LocatedSyntax & {
      readonly expression: HirExpression | undefined;
      readonly kind: "return";
    })
  | (LocatedSyntax & {
      readonly body: HirStatement;
      readonly kind: "while";
      readonly test: HirExpression;
    });

/** A resolved function parameter. */
export interface HirParameter extends SyntaxParameter {
  readonly bindingId: number;
}

/** One statically resolved HIR function. */
export interface HirFunction extends LocatedSyntax {
  readonly body: readonly HirStatement[];
  readonly id: number;
  readonly kind: "hir-function";
  readonly name: string;
  readonly parameters: readonly HirParameter[];
  readonly returnHints: readonly Hint[];
}

/** A normalized script and its statically callable functions. */
export interface HirProgram {
  readonly body: readonly HirStatement[];
  readonly functions: readonly HirFunction[];
  readonly kind: "hir-program";
  readonly range: SourceRange;
  readonly sourceId: string;
}

/** Result of profile validation and HIR name resolution. */
export interface HirResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly program?: HirProgram;
}

interface Binding {
  readonly id: number;
  readonly mutable: boolean;
  readonly name: string;
}

interface ResolveState {
  nextBindingId: number;
  readonly diagnostics: Diagnostic[];
  readonly functions: ReadonlyMap<string, number>;
  readonly sourceId: string;
}

function sourceDiagnostic(
  sourceId: string,
  node: LocatedSyntax,
  message: string,
): Diagnostic {
  return {
    byteRange: node.byteRange ?? { end: 0, start: 0 },
    code: "OSEO1001",
    message,
    range: node.range,
    sourceId,
  };
}

function findBinding(
  scopes: readonly Map<string, Binding>[],
  name: string,
): Binding | undefined {
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const binding = scopes[index]?.get(name);
    if (binding != null) return binding;
  }
  return undefined;
}

function resolveExpression(
  expression: SyntaxExpression,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
): HirExpression | undefined {
  if (expression.kind === "binding-set") {
    const binding = findBinding(scopes, expression.name);
    const value = resolveExpression(expression.value, scopes, state);
    if (binding == null) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          expression,
          `Unknown binding '${expression.name}'.`,
        ),
      );
      return undefined;
    }
    if (!binding.mutable) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          expression,
          `Cannot assign to const binding '${expression.name}'.`,
        ),
      );
      return undefined;
    }
    return value == null
      ? undefined
      : { ...expression, bindingId: binding.id, value };
  }
  if (expression.kind === "array") {
    const elements: (HirExpression | undefined)[] = [];
    for (const element of expression.elements) {
      if (element == null) {
        elements.push(undefined);
        continue;
      }
      const resolved = resolveExpression(element, scopes, state);
      if (resolved == null) return undefined;
      elements.push(resolved);
    }
    return { ...expression, elements };
  }
  if (
    expression.kind === "boolean" ||
    expression.kind === "null" ||
    expression.kind === "number" ||
    expression.kind === "string" ||
    expression.kind === "undefined"
  ) {
    return expression;
  }
  if (expression.kind === "identifier") {
    const binding = findBinding(scopes, expression.name);
    if (binding == null) {
      if (state.functions.has(expression.name)) {
        state.diagnostics.push(
          sourceDiagnostic(
            state.sourceId,
            expression,
            "Function values are outside the M1 profile.",
          ),
        );
        return undefined;
      }
      if (expression.name === "undefined") {
        return { kind: "undefined", range: expression.range };
      }
      if (expression.name === "NaN" || expression.name === "Infinity") {
        return {
          kind: "number",
          range: expression.range,
          value: expression.name === "NaN" ? NaN : Infinity,
        };
      }
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          expression,
          `Unknown binding '${expression.name}'.`,
        ),
      );
      return undefined;
    }
    return {
      bindingId: binding.id,
      kind: "binding",
      name: expression.name,
      range: expression.range,
    };
  }
  if (expression.kind === "unary") {
    const argument = resolveExpression(expression.argument, scopes, state);
    if (argument == null) return undefined;
    return { ...expression, argument };
  }
  if (expression.kind === "binary") {
    const left = resolveExpression(expression.left, scopes, state);
    const right = resolveExpression(expression.right, scopes, state);
    if (left == null || right == null) return undefined;
    return {
      ...expression,
      left,
      right,
    };
  }
  if (expression.kind === "object") {
    const properties: {
      readonly key: HirExpression;
      readonly value: HirExpression;
    }[] = [];
    for (const property of expression.properties) {
      const key = resolveExpression(property.key, scopes, state);
      const value = resolveExpression(property.value, scopes, state);
      if (key == null || value == null) return undefined;
      properties.push({ key, value });
    }
    return { ...expression, properties };
  }
  if (
    expression.kind === "property-get" ||
    expression.kind === "property-delete"
  ) {
    const object = resolveExpression(expression.object, scopes, state);
    const key = resolveExpression(expression.key, scopes, state);
    return object == null || key == null
      ? undefined
      : { ...expression, key, object };
  }
  if (expression.kind === "property-set") {
    const object = resolveExpression(expression.object, scopes, state);
    const key = resolveExpression(expression.key, scopes, state);
    const value = resolveExpression(expression.value, scopes, state);
    return object == null || key == null || value == null
      ? undefined
      : { ...expression, key, object, value };
  }
  const argumentValues: HirExpression[] = [];
  for (const argument of expression.arguments) {
    const resolved = resolveExpression(argument, scopes, state);
    if (resolved == null) return undefined;
    argumentValues.push(resolved);
  }
  let target: HirCallTarget;
  if (expression.target.kind === "console-log") {
    const binding = findBinding(scopes, "console");
    if (binding != null) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          expression.target,
          "The console.log target resolves through the 'console' binding; " +
            "property calls are outside the M1 profile.",
        ),
      );
      return undefined;
    }
    if (state.functions.has("console")) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          expression.target,
          "The console.log target resolves through a declared function; " +
            "property calls are outside the M1 profile.",
        ),
      );
      return undefined;
    }
    target = { kind: "console-log" };
  } else {
    const binding = findBinding(scopes, expression.target.name);
    if (binding != null) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          expression.target,
          `Call target '${expression.target.name}' resolves to a binding; ` +
            "function-valued bindings are outside the M1 profile.",
        ),
      );
      return undefined;
    }
    const functionId = state.functions.get(expression.target.name);
    if (functionId == null) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          expression.target,
          `Call target '${expression.target.name}' is not a declared function.`,
        ),
      );
      return undefined;
    }
    target = {
      functionId,
      kind: "function",
      name: expression.target.name,
    };
  }
  return { ...expression, arguments: argumentValues, target };
}

function predeclareBindings(
  statements: readonly SyntaxStatement[],
  scope: Map<string, Binding>,
  state: ResolveState,
): void {
  for (const statement of statements) {
    if (statement.kind !== "const" && statement.kind !== "let") continue;
    if (scope.has(statement.name)) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          statement,
          `Duplicate declaration '${statement.name}'.`,
        ),
      );
      continue;
    }
    scope.set(statement.name, {
      id: state.nextBindingId,
      mutable: statement.kind === "let",
      name: statement.name,
    });
    state.nextBindingId += 1;
  }
}

function resolveStatementList(
  statements: readonly SyntaxStatement[],
  parentScopes: readonly Map<string, Binding>[],
  state: ResolveState,
  functionBody: boolean,
  existingLocal?: Map<string, Binding>,
  loopDepth = 0,
): readonly HirStatement[] {
  const local = existingLocal ?? new Map<string, Binding>();
  if (existingLocal == null) predeclareBindings(statements, local, state);
  const scopes = [...parentScopes, local];
  const result: HirStatement[] = [];
  for (const statement of statements) {
    const resolved = resolveStatement(
      statement,
      scopes,
      state,
      functionBody,
      loopDepth,
    );
    if (resolved != null) result.push(resolved);
  }
  return result;
}

function resolveStatement(
  statement: SyntaxStatement,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
  functionBody: boolean,
  loopDepth = 0,
): HirStatement | undefined {
  if (statement.kind === "const" || statement.kind === "let") {
    const initializer = resolveExpression(statement.initializer, scopes, state);
    const binding = scopes.at(-1)?.get(statement.name);
    if (binding == null || initializer == null) return undefined;
    return { ...statement, bindingId: binding.id, initializer };
  }
  if (statement.kind === "expression") {
    const expression = resolveExpression(statement.expression, scopes, state);
    return expression == null ? undefined : { ...statement, expression };
  }
  if (statement.kind === "return") {
    if (!functionBody) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          statement,
          "A return statement is only valid inside a function.",
        ),
      );
      return undefined;
    }
    const expression =
      statement.expression == null
        ? undefined
        : resolveExpression(statement.expression, scopes, state);
    if (statement.expression != null && expression == null) return undefined;
    return { ...statement, expression };
  }
  if (statement.kind === "break" || statement.kind === "continue") {
    if (loopDepth === 0) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          statement,
          `A ${statement.kind} statement requires an enclosing loop.`,
        ),
      );
      return undefined;
    }
    return statement;
  }
  if (statement.kind === "block") {
    return {
      ...statement,
      body: resolveStatementList(
        statement.body,
        scopes,
        state,
        functionBody,
        undefined,
        loopDepth,
      ),
    };
  }
  if (statement.kind === "while") {
    const test = resolveExpression(statement.test, scopes, state);
    const body = resolveStatement(
      statement.body,
      scopes,
      state,
      functionBody,
      loopDepth + 1,
    );
    return test == null || body == null
      ? undefined
      : { ...statement, body, test };
  }
  const test = resolveExpression(statement.test, scopes, state);
  const consequent = resolveStatement(
    statement.consequent,
    scopes,
    state,
    functionBody,
    loopDepth,
  );
  const alternate =
    statement.alternate == null
      ? undefined
      : resolveStatement(
          statement.alternate,
          scopes,
          state,
          functionBody,
          loopDepth,
        );
  if (test == null || consequent == null) return undefined;
  if (statement.alternate != null && alternate == null) return undefined;
  return { ...statement, alternate, consequent, test };
}

/** Validate owned syntax and resolve all lexical and function identities. */
export function buildHir(program: SyntaxProgram): HirResult {
  const diagnostics: Diagnostic[] = [];
  const functionIds = new Map<string, number>();
  const functionDeclarations = new Map<string, SyntaxFunction>();
  for (const item of program.body) {
    if (item.kind !== "function") continue;
    if (!functionIds.has(item.name)) {
      functionIds.set(item.name, functionIds.size);
    }
    functionDeclarations.set(item.name, item);
  }
  const state: ResolveState = {
    diagnostics,
    functions: functionIds,
    nextBindingId: 0,
    sourceId: program.sourceId,
  };
  const scriptStatements = program.body.filter(
    (item): item is SyntaxStatement => item.kind !== "function",
  );
  const scriptScope = new Map<string, Binding>();
  predeclareBindings(scriptStatements, scriptScope, state);
  const functions: HirFunction[] = [];
  for (const item of functionDeclarations.values()) {
    const parameterScope = new Map<string, Binding>();
    const parameters: HirParameter[] = [];
    for (const parameter of item.parameters) {
      let binding = parameterScope.get(parameter.name);
      if (binding == null) {
        binding = {
          id: state.nextBindingId,
          mutable: true,
          name: parameter.name,
        };
        state.nextBindingId += 1;
        parameterScope.set(parameter.name, binding);
      }
      parameters.push({ ...parameter, bindingId: binding.id });
    }
    const id = functionIds.get(item.name);
    if (id == null) continue;
    functions.push({
      ...item,
      body: resolveStatementList(
        item.body,
        [scriptScope, parameterScope],
        state,
        true,
      ),
      id,
      kind: "hir-function",
      parameters,
    });
  }
  const body = resolveStatementList(
    scriptStatements,
    [],
    state,
    false,
    scriptScope,
  );
  if (diagnostics.length > 0) return { diagnostics };
  return {
    diagnostics,
    program: {
      body,
      functions,
      kind: "hir-program",
      range: program.range,
      sourceId: program.sourceId,
    },
  };
}

function rangeText(range: SourceRange): string {
  return (
    `${range.start.line}:${range.start.column}-` +
    `${range.end.line}:${range.end.column}`
  );
}

function hintText(hints: readonly Hint[]): string {
  if (hints.length === 0) return "";
  return ` hints=[${hints
    .map((hint) => `${hint.provenance}:${hint.name}`)
    .join(",")}]`;
}

function numberText(value: number): string {
  if (Object.is(value, -0)) return "-0";
  return String(value);
}

function printHirExpression(expression: HirExpression): string {
  if (expression.kind === "binding-set") {
    return (
      `%b${expression.bindingId} ${expression.name} = ` +
      printHirExpression(expression.value)
    );
  }
  if (expression.kind === "array") {
    return (
      "[" +
      expression.elements
        .map((element) =>
          element == null ? "<hole>" : printHirExpression(element),
        )
        .join(", ") +
      "]"
    );
  }
  if (expression.kind === "binding") {
    return `%b${expression.bindingId}(${expression.name})`;
  }
  if (expression.kind === "undefined" || expression.kind === "null") {
    return expression.kind;
  }
  if (expression.kind === "string") return JSON.stringify(expression.value);
  if (expression.kind === "number") return numberText(expression.value);
  if (expression.kind === "boolean") return String(expression.value);
  if (expression.kind === "unary") {
    return `(${expression.operator}${printHirExpression(expression.argument)})`;
  }
  if (expression.kind === "binary") {
    const left = printHirExpression(expression.left);
    const operator = String(expression.operator);
    const right = printHirExpression(expression.right);
    return `(${left} ${operator} ${right})`;
  }
  if (expression.kind === "object") {
    return (
      "object{" +
      expression.properties
        .map(
          (property) =>
            `${printHirExpression(property.key)}: ` +
            printHirExpression(property.value),
        )
        .join(", ") +
      "}"
    );
  }
  if (
    expression.kind === "property-get" ||
    expression.kind === "property-delete"
  ) {
    const operation = expression.kind === "property-get" ? "get" : "delete";
    return (
      `${operation} ${printHirExpression(expression.object)}[` +
      `${printHirExpression(expression.key)}]`
    );
  }
  if (expression.kind === "property-set") {
    return (
      `set ${printHirExpression(expression.object)}[` +
      `${printHirExpression(expression.key)}] = ` +
      printHirExpression(expression.value)
    );
  }
  const target =
    expression.target.kind === "console-log"
      ? "intrinsic console.log"
      : `function @f${expression.target.functionId}`;
  return (
    `call ${target}(` +
    expression.arguments.map(printHirExpression).join(", ") +
    ")"
  );
}

function appendHirStatement(
  lines: string[],
  statement: HirStatement,
  indent: string,
): void {
  const location = ` @${rangeText(statement.range)}`;
  if (statement.kind === "const" || statement.kind === "let") {
    lines.push(
      `${indent}${statement.kind} %b${statement.bindingId} ${statement.name}` +
        `${hintText(statement.hint == null ? [] : [statement.hint])} = ` +
        `${printHirExpression(statement.initializer)}${location}`,
    );
  } else if (statement.kind === "expression") {
    lines.push(
      `${indent}${printHirExpression(statement.expression)}${location}`,
    );
  } else if (statement.kind === "return") {
    const value =
      statement.expression == null
        ? "undefined"
        : printHirExpression(statement.expression);
    lines.push(`${indent}return ${value}${location}`);
  } else if (statement.kind === "block") {
    lines.push(`${indent}block${location}`);
    for (const child of statement.body) {
      appendHirStatement(lines, child, `${indent}  `);
    }
  } else if (statement.kind === "break" || statement.kind === "continue") {
    lines.push(`${indent}${statement.kind}${location}`);
  } else if (statement.kind === "while") {
    lines.push(
      `${indent}while ${printHirExpression(statement.test)}${location}`,
    );
    appendHirStatement(lines, statement.body, `${indent}  `);
  } else {
    lines.push(`${indent}if ${printHirExpression(statement.test)}${location}`);
    appendHirStatement(lines, statement.consequent, `${indent}  `);
    if (statement.alternate != null) {
      lines.push(`${indent}else`);
      appendHirStatement(lines, statement.alternate, `${indent}  `);
    }
  }
}

/** Print deterministic, source-located HIR for review and snapshots. */
export function printHir(program: HirProgram): string {
  const lines = [`hir ${JSON.stringify(program.sourceId)}`];
  for (const functionValue of program.functions) {
    const parameters = functionValue.parameters
      .map(
        (parameter) =>
          `%b${parameter.bindingId} ${parameter.name}` +
          hintText(parameter.hints),
      )
      .join(", ");
    lines.push(
      `function @f${functionValue.id} ${functionValue.name}(${parameters})` +
        `${hintText(functionValue.returnHints)} ` +
        `@${rangeText(functionValue.range)}`,
    );
    for (const statement of functionValue.body) {
      appendHirStatement(lines, statement, "  ");
    }
  }
  lines.push(`script @${rangeText(program.range)}`);
  for (const statement of program.body) {
    appendHirStatement(lines, statement, "  ");
  }
  return `${lines.join("\n")}\n`;
}

/** A primitive constant retained without lossy textual serialization. */
export type MirConstant =
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "null" }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "undefined" };

/** A direct call target independent of HIR and source syntax. */
export type MirCallTarget =
  | { readonly kind: "console-log" }
  | { readonly functionId: number; readonly kind: "function" };

/** Hint data copied into MIR without retaining a HIR or syntax object. */
export interface MirHint {
  readonly name: HintName;
  readonly provenance: HintProvenance;
  readonly range: SourceRange;
}

/** Compiler-owned policy for removable guarded specialization. */
export type SpecializationMode = "disabled" | "enabled";

/** Explicit compiler orchestration options, independent of process globals. */
export interface CompilerOptions {
  readonly observeSpecialization?: boolean;
  readonly specialization?: SpecializationMode;
}

/** One MIR-owned function parameter and its specialization hints. */
export interface MirParameter {
  readonly bindingId: number;
  readonly hints: readonly MirHint[];
  readonly name: string;
  readonly range: SourceRange;
}

/** One script-owned lexical binding shared by declared functions. */
export interface MirGlobalBinding {
  readonly id: number;
  readonly name: string;
}

/** One inspectable backend-neutral MIR operation. */
export interface MirOperation {
  readonly arguments: readonly number[];
  readonly arrayLength?: number;
  readonly bindingId?: number;
  readonly constant?: MirConstant;
  readonly detail: string;
  readonly id: number;
  readonly kind:
    | "add-smi-checked"
    | "array-create"
    | "binary"
    | "box-smi"
    | "branch"
    | "call"
    | "check-status"
    | "constant"
    | "count-guard-hit"
    | "count-guard-miss"
    | "count-overflow-miss"
    | "guard-smi"
    | "join"
    | "object-create"
    | "property-key"
    | "property-delete"
    | "property-get"
    | "property-get-cached"
    | "property-set"
    | "read"
    | "root-store"
    | "safepoint"
    | "unbox-smi"
    | "unary"
    | "write";
  readonly checkedResult?: number;
  readonly hint?: MirHint;
  readonly operator?: BinaryOperator | "!" | "-";
  readonly range: SourceRange;
  readonly target?: MirCallTarget;
}

/** A MIR block terminator. */
export type MirTerminator =
  | {
      readonly kind: "branch";
      readonly test: number;
      readonly whenFalse: number;
      readonly whenTrue: number;
    }
  | {
      readonly kind: "jump";
      readonly target: number;
      readonly values?: readonly number[];
    }
  | {
      readonly kind: "return";
      readonly value: number;
    }
  | {
      readonly kind: "unreachable";
    };

/** One deterministic control-flow block. */
export interface MirBlock {
  readonly id: number;
  readonly operations: readonly MirOperation[];
  readonly parameters?: readonly number[];
  readonly terminator: MirTerminator;
}

/** Inspectable identity and control-flow anchors for one specialization. */
export interface MirSpecialization {
  readonly genericBlock: number;
  readonly hints: readonly MirHint[];
  readonly joinBlock: number;
  readonly kind: "smi-add";
  readonly range: SourceRange;
}

/** MIR for one declared function or script. */
export interface MirFunction extends LocatedSyntax {
  readonly blocks: readonly MirBlock[];
  readonly id: number;
  readonly kind: "mir-function";
  readonly name: string;
  readonly parameterCount: number;
  readonly parameters: readonly MirParameter[];
  readonly rootSlotCount: number;
  readonly specialization?: MirSpecialization;
}

/** Backend-neutral MIR for one source script. */
export interface MirProgram {
  readonly functions: readonly MirFunction[];
  readonly globalBindings: readonly MirGlobalBinding[];
  readonly kind: "mir-program";
  readonly script: MirFunction;
  readonly sourceId: string;
  readonly specialization: SpecializationMode;
  readonly observeSpecialization: boolean;
}

interface MutableMirBlock {
  readonly id: number;
  readonly operations: MirOperation[];
  terminator: MirTerminator | undefined;
}

interface MirBuilder {
  readonly blocks: MutableMirBlock[];
  readonly loops: {
    readonly breakTarget: number;
    readonly continueTarget: number;
  }[];
  current: MutableMirBlock;
  nextValue: number;
  readonly specialization: SpecializationMode;
}

function appendMirMetadata(
  builder: MirBuilder,
  kind: MirOperation["kind"],
  detail: string,
  argumentsValue: readonly number[],
  range: SourceRange,
): void {
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: argumentsValue,
    detail,
    id,
    kind,
    range,
  });
}

function recordRoot(
  builder: MirBuilder,
  value: number,
  range: SourceRange,
): number {
  appendMirMetadata(builder, "root-store", `slot %${value}`, [value], range);
  return value;
}

function lowerPropertyKey(
  expression: HirExpression,
  builder: MirBuilder,
): number {
  const input = lowerExpression(expression, builder);
  appendMirMetadata(
    builder,
    "safepoint",
    "primitive property-key conversion",
    [input],
    expression.range,
  );
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [input],
    detail: "ToPropertyKey for admitted primitives",
    id,
    kind: "property-key",
    range: expression.range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [id],
    expression.range,
  );
  return recordRoot(builder, id, expression.range);
}

function lowerExpression(
  expression: HirExpression,
  builder: MirBuilder,
): number {
  if (expression.kind === "binding-set") {
    const value = lowerExpression(expression.value, builder);
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [value],
      bindingId: expression.bindingId,
      detail: `%b${expression.bindingId} ${expression.name}`,
      id,
      kind: "write",
      range: expression.range,
    });
    return recordRoot(builder, id, expression.range);
  }
  if (expression.kind === "array") {
    appendMirMetadata(
      builder,
      "safepoint",
      "array allocation",
      [],
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      arrayLength: expression.elements.length,
      detail: `array length ${expression.elements.length}`,
      id,
      kind: "array-create",
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    recordRoot(builder, id, expression.range);
    for (let index = 0; index < expression.elements.length; index += 1) {
      const element = expression.elements[index];
      if (element == null) continue;
      const keyExpression: HirExpression = {
        kind: "string",
        range: element.range,
        value: String(index),
      };
      const key = lowerPropertyKey(keyExpression, builder);
      const value = lowerExpression(element, builder);
      appendMirMetadata(
        builder,
        "safepoint",
        "array property storage growth",
        [id, key, value],
        expression.range,
      );
      const result = builder.nextValue;
      builder.nextValue += 1;
      builder.current.operations.push({
        arguments: [id, key, value],
        detail: `array element ${index}`,
        id: result,
        kind: "property-set",
        range: element.range,
      });
      appendMirMetadata(
        builder,
        "check-status",
        "normal -> continue, abrupt -> return",
        [result],
        element.range,
      );
      recordRoot(builder, result, element.range);
    }
    return id;
  }
  if (expression.kind === "binding") {
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      bindingId: expression.bindingId,
      detail: expression.name,
      id,
      kind: "read",
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    return recordRoot(builder, id, expression.range);
  }
  if (
    expression.kind === "undefined" ||
    expression.kind === "null" ||
    expression.kind === "boolean" ||
    expression.kind === "number" ||
    expression.kind === "string"
  ) {
    if (expression.kind === "string") {
      appendMirMetadata(
        builder,
        "safepoint",
        "string allocation",
        [],
        expression.range,
      );
    }
    const id = builder.nextValue;
    builder.nextValue += 1;
    let constant: MirConstant;
    if (expression.kind === "undefined") {
      constant = { kind: "undefined" };
    } else if (expression.kind === "null") {
      constant = { kind: "null" };
    } else if (expression.kind === "boolean") {
      constant = { kind: "boolean", value: expression.value };
    } else if (expression.kind === "number") {
      constant = { kind: "number", value: expression.value };
    } else {
      constant = { kind: "string", value: expression.value };
    }
    const detail =
      constant.kind === "undefined" || constant.kind === "null"
        ? constant.kind
        : constant.kind === "number"
          ? numberText(constant.value)
          : JSON.stringify(constant.value);
    builder.current.operations.push({
      arguments: [],
      constant,
      detail,
      id,
      kind: "constant",
      range: expression.range,
    });
    if (expression.kind === "string") {
      appendMirMetadata(
        builder,
        "check-status",
        "normal -> continue, abrupt -> return",
        [id],
        expression.range,
      );
    }
    return recordRoot(builder, id, expression.range);
  }
  if (expression.kind === "unary") {
    const argument = lowerExpression(expression.argument, builder);
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [argument],
      detail: expression.operator,
      id,
      kind: "unary",
      operator: expression.operator,
      range: expression.range,
    });
    if (expression.operator === "-") {
      appendMirMetadata(
        builder,
        "check-status",
        "normal -> continue, abrupt -> return",
        [id],
        expression.range,
      );
    }
    return recordRoot(builder, id, expression.range);
  }
  if (expression.kind === "binary") {
    const left = lowerExpression(expression.left, builder);
    const right = lowerExpression(expression.right, builder);
    if (expression.operator === "+") {
      appendMirMetadata(
        builder,
        "safepoint",
        "string addition fallback",
        [left, right],
        expression.range,
      );
    }
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [left, right],
      detail: String(expression.operator),
      id,
      kind: "binary",
      operator: expression.operator,
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    return recordRoot(builder, id, expression.range);
  }
  if (expression.kind === "object") {
    appendMirMetadata(
      builder,
      "safepoint",
      "object allocation",
      [],
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      detail: "ordinary object with null prototype",
      id,
      kind: "object-create",
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    recordRoot(builder, id, expression.range);
    for (const property of expression.properties) {
      const key = lowerPropertyKey(property.key, builder);
      const value = lowerExpression(property.value, builder);
      appendMirMetadata(
        builder,
        "safepoint",
        "property storage growth",
        [id, key, value],
        expression.range,
      );
      const result = builder.nextValue;
      builder.nextValue += 1;
      builder.current.operations.push({
        arguments: [id, key, value],
        detail: "create data property",
        id: result,
        kind: "property-set",
        range: expression.range,
      });
      appendMirMetadata(
        builder,
        "check-status",
        "normal -> continue, abrupt -> return",
        [result],
        expression.range,
      );
      recordRoot(builder, result, expression.range);
    }
    return id;
  }
  if (
    expression.kind === "property-get" ||
    expression.kind === "property-delete"
  ) {
    const object = lowerExpression(expression.object, builder);
    const key = lowerPropertyKey(expression.key, builder);
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [object, key],
      detail: expression.kind,
      id,
      kind:
        expression.kind === "property-get" &&
        expression.key.kind === "string" &&
        builder.specialization === "enabled"
          ? "property-get-cached"
          : expression.kind,
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    return recordRoot(builder, id, expression.range);
  }
  if (expression.kind === "property-set") {
    const object = lowerExpression(expression.object, builder);
    const key = lowerPropertyKey(expression.key, builder);
    const value = lowerExpression(expression.value, builder);
    appendMirMetadata(
      builder,
      "safepoint",
      "property storage growth",
      [object, key, value],
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [object, key, value],
      detail: "property-set",
      id,
      kind: "property-set",
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    return recordRoot(builder, id, expression.range);
  }
  const argumentIds = expression.arguments.map((argument) =>
    lowerExpression(argument, builder),
  );
  const safepointId = builder.nextValue;
  builder.nextValue += 1;
  const detail =
    expression.target.kind === "console-log"
      ? "console_log"
      : `function @f${expression.target.functionId}`;
  builder.current.operations.push({
    arguments: argumentIds,
    detail,
    id: safepointId,
    kind: "safepoint",
    range: expression.range,
  });
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: argumentIds,
    detail,
    id,
    kind: "call",
    range: expression.range,
    target:
      expression.target.kind === "console-log"
        ? { kind: "console-log" }
        : {
            functionId: expression.target.functionId,
            kind: "function",
          },
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [id],
    expression.range,
  );
  return recordRoot(builder, id, expression.range);
}

function createMirBlock(builder: MirBuilder): MutableMirBlock {
  const block: MutableMirBlock = {
    id: builder.blocks.length,
    operations: [],
    terminator: undefined,
  };
  builder.blocks.push(block);
  return block;
}

function statementBody(statement: HirStatement): readonly HirStatement[] {
  return statement.kind === "block" ? statement.body : [statement];
}

function lowerStatements(
  statements: readonly HirStatement[],
  builder: MirBuilder,
): boolean {
  for (const statement of statements) {
    if (statement.kind === "const" || statement.kind === "let") {
      const value = lowerExpression(statement.initializer, builder);
      const id = builder.nextValue;
      builder.nextValue += 1;
      builder.current.operations.push({
        arguments: [value],
        bindingId: statement.bindingId,
        detail: `%b${statement.bindingId} ${statement.name}`,
        id,
        kind: "write",
        range: statement.range,
      });
      recordRoot(builder, id, statement.range);
    } else if (statement.kind === "expression") {
      lowerExpression(statement.expression, builder);
    } else if (statement.kind === "return") {
      const value =
        statement.expression == null
          ? lowerSyntheticUndefined(statement.range, builder)
          : lowerExpression(statement.expression, builder);
      builder.current.terminator = { kind: "return", value };
      return true;
    } else if (statement.kind === "block") {
      if (lowerStatements(statement.body, builder)) return true;
    } else if (statement.kind === "break" || statement.kind === "continue") {
      const loop = builder.loops.at(-1);
      if (loop == null) throw new Error(`${statement.kind} has no MIR loop.`);
      builder.current.terminator = {
        kind: "jump",
        target:
          statement.kind === "break" ? loop.breakTarget : loop.continueTarget,
      };
      return true;
    } else if (statement.kind === "while") {
      const conditionBlock = createMirBlock(builder);
      const bodyBlock = createMirBlock(builder);
      const exitBlock = createMirBlock(builder);
      builder.current.terminator = {
        kind: "jump",
        target: conditionBlock.id,
      };
      builder.current = conditionBlock;
      const test = lowerExpression(statement.test, builder);
      builder.current.terminator = {
        kind: "branch",
        test,
        whenFalse: exitBlock.id,
        whenTrue: bodyBlock.id,
      };
      builder.loops.push({
        breakTarget: exitBlock.id,
        continueTarget: conditionBlock.id,
      });
      builder.current = bodyBlock;
      const terminated = lowerStatements(
        statementBody(statement.body),
        builder,
      );
      builder.loops.pop();
      if (!terminated) {
        builder.current.terminator = {
          kind: "jump",
          target: conditionBlock.id,
        };
      }
      builder.current = exitBlock;
      appendMirMetadata(
        builder,
        "join",
        `while bb${conditionBlock.id}`,
        [],
        statement.range,
      );
    } else {
      const test = lowerExpression(statement.test, builder);
      const consequentBlock = createMirBlock(builder);
      const alternateBlock = createMirBlock(builder);
      const joinBlock = createMirBlock(builder);
      const branchDetail = [
        `true -> bb${consequentBlock.id}`,
        `false -> bb${alternateBlock.id}`,
      ].join(", ");
      appendMirMetadata(
        builder,
        "branch",
        branchDetail,
        [test],
        statement.range,
      );
      builder.current.terminator = {
        kind: "branch",
        test,
        whenFalse: alternateBlock.id,
        whenTrue: consequentBlock.id,
      };

      builder.current = consequentBlock;
      const consequentReturns = lowerStatements(
        statementBody(statement.consequent),
        builder,
      );
      if (!consequentReturns) {
        builder.current.terminator = { kind: "jump", target: joinBlock.id };
      }

      builder.current = alternateBlock;
      const alternateReturns =
        statement.alternate == null
          ? false
          : lowerStatements(statementBody(statement.alternate), builder);
      if (!alternateReturns) {
        builder.current.terminator = { kind: "jump", target: joinBlock.id };
      }

      builder.current = joinBlock;
      appendMirMetadata(
        builder,
        "join",
        `bb${consequentBlock.id} + bb${alternateBlock.id}`,
        [],
        statement.range,
      );
      if (consequentReturns && alternateReturns) {
        joinBlock.terminator = { kind: "unreachable" };
        return true;
      }
    }
  }
  return false;
}

function lowerSyntheticUndefined(
  range: SourceRange,
  builder: MirBuilder,
): number {
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [],
    constant: { kind: "undefined" },
    detail: "undefined",
    id,
    kind: "constant",
    range,
  });
  return recordRoot(builder, id, range);
}

function buildMirFunction(
  id: number,
  name: string,
  body: readonly HirStatement[],
  parameters: readonly HirParameter[],
  range: SourceRange,
  specialization: SpecializationMode,
): MirFunction {
  const entry: MutableMirBlock = {
    id: 0,
    operations: [],
    terminator: undefined,
  };
  const builder: MirBuilder = {
    blocks: [entry],
    current: entry,
    loops: [],
    nextValue: 0,
    specialization,
  };
  const returned = lowerStatements(body, builder);
  if (!returned) {
    const value = lowerSyntheticUndefined(range, builder);
    builder.current.terminator = { kind: "return", value };
  }
  const mirParameters: readonly MirParameter[] = parameters.map(
    (parameter) => ({
      bindingId: parameter.bindingId,
      hints: parameter.hints.map((hint) => ({
        name: hint.name,
        provenance: hint.provenance,
        range: {
          end: { ...hint.range.end },
          start: { ...hint.range.start },
        },
      })),
      name: parameter.name,
      range: {
        end: { ...parameter.range.end },
        start: { ...parameter.range.start },
      },
    }),
  );
  return {
    blocks: builder.blocks.map((block) => ({
      id: block.id,
      operations: block.operations,
      terminator: block.terminator ?? { kind: "unreachable" },
    })),
    id,
    kind: "mir-function",
    name,
    parameterCount: parameters.length,
    parameters: mirParameters,
    range,
    rootSlotCount: builder.nextValue + parameters.length + 1,
  };
}

function maximumMirValue(functionValue: MirFunction): number {
  let maximum = -1;
  for (const block of functionValue.blocks) {
    for (const operation of block.operations) {
      maximum = Math.max(maximum, operation.id);
      if (operation.checkedResult != null) {
        maximum = Math.max(maximum, operation.checkedResult);
      }
    }
  }
  return maximum;
}

function numberHint(parameter: HirParameter): Hint | undefined {
  if (parameter.hints.length === 0) return undefined;
  if (parameter.hints.some((hint) => hint.name !== "number")) {
    return undefined;
  }
  return parameter.hints[0];
}

function eligibleAddition(functionValue: HirFunction):
  | {
      readonly expression: HirExpression & { readonly kind: "binary" };
      readonly hints: readonly [Hint, Hint];
    }
  | undefined {
  const [leftParameter, rightParameter] = functionValue.parameters;
  if (
    functionValue.parameters.length !== 2 ||
    leftParameter == null ||
    rightParameter == null ||
    leftParameter.bindingId === rightParameter.bindingId
  ) {
    return undefined;
  }
  const leftHint = numberHint(leftParameter);
  const rightHint = numberHint(rightParameter);
  if (leftHint == null || rightHint == null) return undefined;
  const statement = functionValue.body[0];
  if (
    functionValue.body.length !== 1 ||
    statement?.kind !== "return" ||
    statement.expression?.kind !== "binary" ||
    statement.expression.operator !== "+" ||
    statement.expression.left.kind !== "binding" ||
    statement.expression.right.kind !== "binding" ||
    statement.expression.left.bindingId !== leftParameter.bindingId ||
    statement.expression.right.bindingId !== rightParameter.bindingId
  ) {
    return undefined;
  }
  return {
    expression: statement.expression,
    hints: [leftHint, rightHint],
  };
}

function copyHint(hint: Hint): MirHint {
  return {
    name: hint.name,
    provenance: hint.provenance,
    range: {
      end: { ...hint.range.end },
      start: { ...hint.range.start },
    },
  };
}

function specializeAddition(
  generic: MirFunction,
  hir: HirFunction,
): MirFunction {
  const eligible = eligibleAddition(hir);
  const original = generic.blocks[0];
  if (
    eligible == null ||
    generic.blocks.length !== 1 ||
    original == null ||
    original.terminator.kind !== "return"
  ) {
    return generic;
  }
  const binaryIndex = original.operations.findIndex(
    (operation) => operation.kind === "binary" && operation.operator === "+",
  );
  const binary = original.operations[binaryIndex];
  const safepoint = original.operations[binaryIndex - 1];
  if (
    binaryIndex < 1 ||
    binary == null ||
    binary.arguments.length !== 2 ||
    safepoint?.kind !== "safepoint"
  ) {
    return generic;
  }
  const leftValue = binary.arguments[0];
  const rightValue = binary.arguments[1];
  if (leftValue == null || rightValue == null) return generic;

  let nextValue = maximumMirValue(generic) + 1;
  const takeValue = (): number => {
    const value = nextValue;
    nextValue += 1;
    return value;
  };
  const leftGuard = takeValue();
  const rightGuard = takeValue();
  const leftRaw = takeValue();
  const rightRaw = takeValue();
  const checked = takeValue();
  const checkedResult = takeValue();
  const hitCounter = takeValue();
  const boxed = takeValue();
  const missCounter = takeValue();
  const overflowCounter = takeValue();
  const joinValue = takeValue();
  const joinMarker = takeValue();
  const range = eligible.expression.range;
  const hints: readonly [MirHint, MirHint] = [
    copyHint(eligible.hints[0]),
    copyHint(eligible.hints[1]),
  ];
  const operation = (
    id: number,
    kind: MirOperation["kind"],
    detail: string,
    argumentsValue: readonly number[],
    extra: Partial<MirOperation> = {},
  ): MirOperation => ({
    arguments: argumentsValue,
    detail,
    id,
    kind,
    range,
    ...extra,
  });
  const prefix = original.operations.slice(0, binaryIndex - 1);
  const genericOperations = original.operations.slice(binaryIndex - 1);
  const blocks: readonly MirBlock[] = [
    {
      id: 0,
      operations: [
        ...prefix,
        operation(
          leftGuard,
          "guard-smi",
          "left -> bb1, miss -> bb4",
          [leftValue],
          { hint: hints[0] },
        ),
      ],
      terminator: {
        kind: "branch",
        test: leftGuard,
        whenFalse: 4,
        whenTrue: 1,
      },
    },
    {
      id: 1,
      operations: [
        operation(
          rightGuard,
          "guard-smi",
          "right -> bb2, miss -> bb4",
          [rightValue],
          { hint: hints[1] },
        ),
      ],
      terminator: {
        kind: "branch",
        test: rightGuard,
        whenFalse: 4,
        whenTrue: 2,
      },
    },
    {
      id: 2,
      operations: [
        operation(leftRaw, "unbox-smi", "left", [leftValue]),
        operation(rightRaw, "unbox-smi", "right", [rightValue]),
        operation(
          checked,
          "add-smi-checked",
          "in-range -> bb3, overflow -> bb5",
          [leftRaw, rightRaw],
          { checkedResult },
        ),
      ],
      terminator: {
        kind: "branch",
        test: checked,
        whenFalse: 5,
        whenTrue: 3,
      },
    },
    {
      id: 3,
      operations: [
        operation(hitCounter, "count-guard-hit", "smi-add", []),
        operation(boxed, "box-smi", "checked result", [checkedResult]),
      ],
      terminator: { kind: "jump", target: 7, values: [boxed] },
    },
    {
      id: 4,
      operations: [
        operation(missCounter, "count-guard-miss", "generic-fallback bb6", []),
      ],
      terminator: { kind: "jump", target: 6 },
    },
    {
      id: 5,
      operations: [
        operation(
          overflowCounter,
          "count-overflow-miss",
          "generic-fallback bb6",
          [],
        ),
      ],
      terminator: { kind: "jump", target: 6 },
    },
    {
      id: 6,
      operations: genericOperations,
      terminator: {
        kind: "jump",
        target: 7,
        values: [original.terminator.value],
      },
    },
    {
      id: 7,
      operations: [
        operation(joinMarker, "join", "specialized bb3 + generic bb6", [
          boxed,
          original.terminator.value,
        ]),
      ],
      parameters: [joinValue],
      terminator: { kind: "return", value: joinValue },
    },
  ];
  return {
    ...generic,
    blocks,
    rootSlotCount: Math.max(generic.rootSlotCount, nextValue + 1),
    specialization: {
      genericBlock: 6,
      hints,
      joinBlock: 7,
      kind: "smi-add",
      range,
    },
  };
}

/** Lower HIR to inspectable MIR under an explicit specialization policy. */
export function buildMir(
  program: HirProgram,
  options: CompilerOptions = {},
): MirProgram {
  const specialization = options.specialization ?? "enabled";
  return {
    functions: program.functions.map((functionValue) => {
      const generic = buildMirFunction(
        functionValue.id,
        functionValue.name,
        functionValue.body,
        functionValue.parameters,
        functionValue.range,
        specialization,
      );
      return specialization === "enabled"
        ? specializeAddition(generic, functionValue)
        : generic;
    }),
    globalBindings: program.body.flatMap((statement) =>
      statement.kind === "const" || statement.kind === "let"
        ? [{ id: statement.bindingId, name: statement.name }]
        : [],
    ),
    kind: "mir-program",
    observeSpecialization: options.observeSpecialization ?? false,
    script: buildMirFunction(
      -1,
      "<script>",
      program.body,
      [],
      program.range,
      specialization,
    ),
    sourceId: program.sourceId,
    specialization,
  };
}

function printTerminator(terminator: MirTerminator): string {
  if (terminator.kind === "return") return `return %${terminator.value}`;
  if (terminator.kind === "jump") {
    const values = terminator.values?.map((value) => ` %${value}`).join("");
    return `jump bb${terminator.target}${values ?? ""}`;
  }
  if (terminator.kind === "branch") {
    return (
      `branch %${terminator.test} bb${terminator.whenTrue} ` +
      `bb${terminator.whenFalse}`
    );
  }
  return "unreachable";
}

function appendMirFunction(lines: string[], functionValue: MirFunction): void {
  lines.push(
    `function @f${functionValue.id} ${functionValue.name} roots=` +
      `${functionValue.rootSlotCount} @${rangeText(functionValue.range)}`,
  );
  if (functionValue.specialization != null) {
    const specialization = functionValue.specialization;
    const hints = specialization.hints
      .map((hint) => `${hint.provenance}:${hint.name}`)
      .join(", ");
    lines.push(
      `  specialize ${specialization.kind} hints=[${hints}] ` +
        `generic-fallback bb${specialization.genericBlock} ` +
        `join bb${specialization.joinBlock}`,
    );
  }
  for (const block of functionValue.blocks) {
    const parameters = block.parameters?.map((value) => `%${value}`).join(", ");
    lines.push(
      `  bb${block.id}${parameters == null ? "" : `(${parameters})`}:`,
    );
    for (const operation of block.operations) {
      const argumentText = operation.arguments
        .map((argument) => `%${argument}`)
        .join(", ");
      const resultText =
        operation.checkedResult == null
          ? `%${operation.id}`
          : `%${operation.id}, %${operation.checkedResult}`;
      const hintTextValue =
        operation.hint == null
          ? ""
          : ` hint=${operation.hint.provenance}:${operation.hint.name}`;
      lines.push(
        `    ${resultText} = ${operation.kind} ` +
          `${operation.detail}` +
          `${argumentText === "" ? "" : ` ${argumentText}`} ` +
          `@${rangeText(operation.range)}${hintTextValue}`,
      );
    }
    lines.push(`    ${printTerminator(block.terminator)}`);
  }
}

/** Print deterministic MIR without host paths or object identities. */
export function printMir(program: MirProgram): string {
  const lines = [
    `mir ${JSON.stringify(program.sourceId)} ` +
      `specialization ${program.specialization}`,
  ];
  for (const binding of program.globalBindings) {
    lines.push(`global %b${binding.id} ${binding.name}`);
  }
  for (const functionValue of program.functions) {
    appendMirFunction(lines, functionValue);
  }
  appendMirFunction(lines, program.script);
  return `${lines.join("\n")}\n`;
}

/** Result of the host-neutral compiler pipeline. */
export interface CompilationResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly hir?: HirProgram;
  readonly mir?: MirProgram;
  readonly syntax?: SyntaxProgram;
}

/** Compile source through owned syntax, HIR, and policy-selected MIR. */
export function compileSource(
  frontend: SourceFrontend,
  input: SourceInput,
  options: CompilerOptions = {},
): CompilationResult {
  const frontendResult = frontend.parse(input);
  if (frontendResult.program == null) {
    return { diagnostics: frontendResult.diagnostics };
  }
  const hirResult = buildHir(frontendResult.program);
  if (hirResult.program == null) {
    return {
      diagnostics: hirResult.diagnostics,
      syntax: frontendResult.program,
    };
  }
  return {
    diagnostics: [],
    hir: hirResult.program,
    mir: buildMir(hirResult.program, options),
    syntax: frontendResult.program,
  };
}

/** The targets exercised by the native fixture harness. */
export type TargetName = "aarch64-linux-musl" | "x86_64-linux-gnu";

/** Explicit target properties consumed by native toolchain adapters. */
export interface TargetDescription {
  readonly cStandard: "c11";
  readonly execute: boolean;
  readonly name: TargetName;
  readonly sanitizeUndefinedBehavior: boolean;
}

/** Deterministic source emitted by a replaceable native backend. */
export interface EmittedNativeSource {
  readonly source: string;
  readonly sourceName: string;
}

/** Backend boundary that never performs process execution. */
export interface NativeBackend {
  emit(input: MirProgram): EmittedNativeSource;
}

/** One reviewed native asset supplied by a runtime package. */
export interface RuntimeAsset {
  readonly kind: "header" | "source";
  readonly name: string;
  readonly url: URL;
}

/** A versioned set of native runtime inputs. */
export interface RuntimeInput {
  readonly abiVersion: string;
  readonly assets: readonly RuntimeAsset[];
}

/** Provider boundary between runtime selection and backend emission. */
export interface RuntimeInputProvider {
  getRuntimeInput(): RuntimeInput;
}

/** One process request created by a native toolchain adapter. */
export interface ProcessRequest {
  readonly args: readonly string[];
  readonly command: string;
  readonly cwd: string;
}

/** Host-independent subprocess observation. */
export interface ProcessObservation {
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}

/** Files and commands required for one native build. */
export interface NativeBuildPlan {
  readonly executablePath: string;
  readonly requests: readonly ProcessRequest[];
  readonly target: TargetDescription;
}

/** Explicit inputs used to construct a native build plan. */
export interface NativeBuildInput {
  readonly generatedSourcePath: string;
  readonly runtimeDirectory: string;
  readonly runtimeSourcePath: string;
  readonly target: TargetDescription;
  readonly workingDirectory: string;
}

/** Toolchain boundary that constructs commands without executing them. */
export interface NativeToolchain {
  createBuildPlan(input: NativeBuildInput): NativeBuildPlan;
}

/** Narrow host boundary used by compiler adapters and test infrastructure. */
export interface CompilerHost {
  makeTemporaryDirectory(prefix: string): Promise<string>;
  readTextFile(path: string | URL): Promise<string>;
  remove(path: string): Promise<void>;
  run(request: ProcessRequest): Promise<ProcessObservation>;
  writeTextFile(path: string, contents: string): Promise<void>;
}

/** Render the stable first line of an Oseo diagnostic. */
export function renderDiagnostic(diagnostic: Diagnostic): string {
  const position = diagnostic.range.start;
  return (
    `${diagnostic.sourceId}:${position.line}:${position.column}: ` +
    `error[${diagnostic.code}]: ${diagnostic.message}`
  );
}

/** Return the accepted M1 target description for an explicit target name. */
export function describeTarget(name: TargetName): TargetDescription {
  if (name === "x86_64-linux-gnu") {
    return {
      cStandard: "c11",
      execute: true,
      name,
      sanitizeUndefinedBehavior: true,
    };
  }
  return {
    cStandard: "c11",
    execute: false,
    name,
    sanitizeUndefinedBehavior: false,
  };
}
