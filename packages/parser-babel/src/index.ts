import { parse as parseBabel } from "@babel/parser";
import type {
  BinaryOperator,
  ByteRange,
  Diagnostic,
  Hint,
  HintName,
  ModuleFrontendResult,
  ModuleSourceFrontend,
  Position,
  SourceFrontend,
  SourceInput,
  SourceRange,
  SyntaxCallTarget,
  SyntaxExpression,
  SyntaxFunction,
  SyntaxImportEntry,
  SyntaxModule,
  SyntaxModuleSpecifier,
  SyntaxParameter,
  SyntaxProgram,
  SyntaxExportEntry,
  SyntaxStatement,
} from "@oseo/compiler";

interface ParserError {
  readonly pos?: number;
  readonly position?: number;
  readonly raisedAt?: number;
}

interface BabelComment {
  readonly end?: number;
  readonly start?: number;
  readonly type?: string;
  readonly value?: string;
}

interface BabelNode {
  readonly [key: string]: unknown;
  readonly end?: number;
  readonly leadingComments?: readonly BabelComment[];
  readonly start?: number;
  readonly type?: string;
}

interface ConvertContext {
  readonly diagnostics: Diagnostic[];
  readonly functionStack: boolean[];
  readonly input: SourceInput;
  readonly locations: SourceIndex;
  readonly strictStack: boolean[];
  syntheticIndex: number;
}

interface SourceIndex {
  readonly byteOffsets: readonly number[];
  readonly columns: readonly number[];
  readonly length: number;
  readonly lines: readonly number[];
}

function node(value: unknown): BabelNode | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as BabelNode;
}

function nodes(value: unknown): readonly BabelNode[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const valueNode = node(item);
    return valueNode == null ? [] : [valueNode];
  });
}

function hasUseStrictDirective(value: BabelNode): boolean {
  return nodes(value.directives).some((directive) => {
    const literal = node(directive.value);
    return literal?.value === "use strict";
  });
}

function utf8Width(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

function createSourceIndex(source: string): SourceIndex {
  const length = source.length + 1;
  const byteOffsets = Array.from({ length }, () => 0);
  const columns = Array.from({ length }, () => 0);
  const lines = Array.from({ length }, () => 0);
  let byteCount = 0;
  let line = 1;
  let column = 1;
  let offset = 0;
  const record = (): void => {
    byteOffsets[offset] = byteCount;
    columns[offset] = column;
    lines[offset] = line;
  };
  record();
  while (offset < source.length) {
    const character = source[offset];
    if (character === "\r") {
      line += 1;
      column = 1;
      byteCount += 1;
      offset += 1;
      record();
      if (source[offset] === "\n") {
        byteCount += 1;
        offset += 1;
        record();
      }
    } else if (
      character === "\n" ||
      character === "\u2028" ||
      character === "\u2029"
    ) {
      line += 1;
      column = 1;
      byteCount += utf8Width(character.codePointAt(0) ?? 0);
      offset += 1;
      record();
    } else {
      column += 1;
      const codePoint = source.codePointAt(offset) ?? 0;
      if (codePoint > 0xffff) {
        byteCount += 3;
        offset += 1;
        record();
        byteCount += 1;
        offset += 1;
        record();
      } else {
        byteCount += utf8Width(codePoint);
        offset += 1;
        record();
      }
    }
  }
  return { byteOffsets, columns, length: source.length, lines };
}

function clampOffset(index: SourceIndex, offset: number): number {
  return Math.max(0, Math.min(offset, index.length));
}

function positionAt(index: SourceIndex, rawOffset: number): Position {
  const offset = clampOffset(index, rawOffset);
  return {
    column: index.columns[offset] ?? 1,
    line: index.lines[offset] ?? 1,
  };
}

function byteOffset(index: SourceIndex, rawOffset: number): number {
  return index.byteOffsets[clampOffset(index, rawOffset)] ?? 0;
}

function offsets(value: BabelNode): readonly [number, number] {
  const start = value.start ?? 0;
  return [start, value.end ?? start];
}

function sourceRange(index: SourceIndex, value: BabelNode): SourceRange {
  const [start, end] = offsets(value);
  return {
    end: positionAt(index, end),
    start: positionAt(index, start),
  };
}

function bytes(index: SourceIndex, value: BabelNode): ByteRange {
  const [start, end] = offsets(value);
  return {
    end: byteOffset(index, end),
    start: byteOffset(index, start),
  };
}

function location(
  context: ConvertContext,
  value: BabelNode,
): { readonly byteRange: ByteRange; readonly range: SourceRange } {
  return {
    byteRange: bytes(context.locations, value),
    range: sourceRange(context.locations, value),
  };
}

function diagnosticAt(
  input: SourceInput,
  index: SourceIndex,
  rawOffset: number,
): Diagnostic {
  const offset = clampOffset(index, rawOffset);
  const position = positionAt(index, offset);
  const encodedOffset = byteOffset(index, offset);
  return {
    byteRange: { end: encodedOffset, start: encodedOffset },
    code: "OSEO0001",
    message: "Source could not be parsed.",
    range: { end: position, start: position },
    sourceId: input.sourceId,
  };
}

function unsupported(
  context: ConvertContext,
  value: BabelNode,
  description?: string,
): undefined {
  context.diagnostics.push({
    ...location(context, value),
    code: "OSEO1001",
    message:
      description ??
      `${value.type ?? "Unknown syntax"} is outside the M1 profile.`,
    sourceId: context.input.sourceId,
  });
  return undefined;
}

function errorOffset(error: ParserError): number {
  return error.pos ?? error.position ?? error.raisedAt ?? 0;
}

const hintNames = new Map<string, HintName>([
  ["TSAnyKeyword", "any"],
  ["TSBooleanKeyword", "boolean"],
  ["TSNullKeyword", "null"],
  ["TSNumberKeyword", "number"],
  ["TSStringKeyword", "string"],
  ["TSUndefinedKeyword", "undefined"],
  ["TSUnknownKeyword", "unknown"],
]);

function typeHint(
  context: ConvertContext,
  annotationValue: unknown,
): Hint | undefined {
  const annotation = node(annotationValue);
  if (annotation == null) return undefined;
  const typeNode =
    annotation.type === "TSTypeAnnotation"
      ? node(annotation.typeAnnotation)
      : annotation;
  if (typeNode == null) return undefined;
  let name = hintNames.get(typeNode.type ?? "");
  if (typeNode.type === "TSLiteralType") {
    const literal = node(typeNode.literal);
    if (literal?.type === "NullLiteral") name = "null";
  }
  if (name == null) {
    unsupported(context, typeNode, "This TypeScript type is not an M1 hint.");
    return undefined;
  }
  return {
    name,
    provenance: "typescript",
    range: sourceRange(context.locations, typeNode),
  };
}

function hintName(value: string): HintName | undefined {
  if (
    value === "any" ||
    value === "boolean" ||
    value === "null" ||
    value === "number" ||
    value === "string" ||
    value === "undefined" ||
    value === "unknown"
  ) {
    return value;
  }
  return undefined;
}

interface JsdocHints {
  readonly parameters: ReadonlyMap<string, Hint>;
  readonly returns: readonly Hint[];
}

function isJsdocComment(
  context: ConvertContext,
  comment: BabelComment,
): boolean {
  return (
    comment.type === "CommentBlock" &&
    comment.start != null &&
    context.input.source.startsWith("/**", comment.start)
  );
}

function jsdocHints(
  context: ConvertContext,
  declaration: BabelNode,
): JsdocHints {
  const parameters = new Map<string, Hint>();
  const returns: Hint[] = [];
  for (const comment of declaration.leadingComments ?? []) {
    if (!isJsdocComment(context, comment)) continue;
    const value = comment.value ?? "";
    const commentNode: BabelNode = {
      end: comment.end ?? 0,
      start: comment.start ?? 0,
      type: "CommentBlock",
    };
    const range = sourceRange(context.locations, commentNode);
    const parameterPattern =
      /@param\s+\{(\w+)\}\s+([\p{ID_Start}_$][\p{ID_Continue}$]*)/gu;
    for (const match of value.matchAll(parameterPattern)) {
      const name = hintName(match[1] ?? "");
      const parameter = match[2];
      if (name != null && parameter != null) {
        parameters.set(parameter, {
          name,
          provenance: "jsdoc",
          range,
        });
      }
    }
    const returnPattern = /@returns?\s+\{(\w+)\}/gu;
    for (const match of value.matchAll(returnPattern)) {
      const name = hintName(match[1] ?? "");
      if (name != null) {
        returns.push({ name, provenance: "jsdoc", range });
      }
    }
  }
  return { parameters, returns };
}

function identifierName(value: BabelNode): string | undefined {
  return value.type === "Identifier" && typeof value.name === "string"
    ? value.name
    : undefined;
}

function moduleName(value: BabelNode): string | undefined {
  if (value.type === "StringLiteral" && typeof value.value === "string") {
    return value.value;
  }
  return identifierName(value);
}

function moduleSpecifier(
  context: ConvertContext,
  value: BabelNode | undefined,
): SyntaxModuleSpecifier | undefined {
  if (value?.type !== "StringLiteral" || typeof value.value !== "string") {
    if (value != null) {
      unsupported(context, value, "A module specifier must be a string.");
    }
    return undefined;
  }
  return { ...location(context, value), value: value.value };
}

function callTarget(
  context: ConvertContext,
  value: BabelNode,
): SyntaxCallTarget | undefined {
  if (value.type === "ParenthesizedExpression") {
    const inner = node(value.expression);
    return inner == null
      ? unsupported(context, value)
      : callTarget(context, inner);
  }
  const name = identifierName(value);
  if (name === "setTimeout" || name === "clearTimeout") {
    return {
      ...location(context, value),
      kind: "timer-intrinsic",
      method: name,
    };
  }
  if (name != null) return { ...location(context, value), kind: "name", name };
  if (value.type !== "MemberExpression") {
    const callee = expression(context, value);
    return callee == null
      ? undefined
      : { ...location(context, value), callee, kind: "dynamic" };
  }
  const object = node(value.object);
  const property = node(value.property);
  if (object == null || property == null) return unsupported(context, value);
  if (
    value.computed !== true &&
    identifierName(object) === "console" &&
    identifierName(property) === "log"
  ) {
    return { ...location(context, value), kind: "console-log" };
  }
  if (value.computed !== true && identifierName(object) === "Object") {
    const method = identifierName(property);
    if (
      method === "create" ||
      method === "defineProperty" ||
      method === "getOwnPropertyDescriptor" ||
      method === "keys" ||
      method === "setPrototypeOf"
    ) {
      return {
        ...location(context, value),
        kind: "object-intrinsic",
        method,
      };
    }
  }
  if (value.computed !== true && identifierName(object) === "Promise") {
    const method = identifierName(property);
    if (
      method === "all" ||
      method === "race" ||
      method === "reject" ||
      method === "resolve"
    ) {
      return {
        ...location(context, value),
        kind: "promise-intrinsic",
        method,
      };
    }
  }
  const parts = memberParts(context, value);
  return parts == null
    ? undefined
    : { ...location(context, value), ...parts, kind: "property" };
}

function memberParts(
  context: ConvertContext,
  value: BabelNode,
):
  | {
      readonly key: SyntaxExpression;
      readonly object: SyntaxExpression;
    }
  | undefined {
  if (value.type !== "MemberExpression" || value.optional === true) {
    return unsupported(context, value, "This property access is unsupported.");
  }
  const objectNode = node(value.object);
  const propertyNode = node(value.property);
  if (objectNode == null || propertyNode == null) {
    return unsupported(context, value);
  }
  const objectValue = expression(context, objectNode);
  let key: SyntaxExpression | undefined;
  if (value.computed === true) {
    key = expression(context, propertyNode);
  } else {
    const name = identifierName(propertyNode);
    if (name != null) {
      key = { ...location(context, propertyNode), kind: "string", value: name };
    }
  }
  return objectValue == null || key == null
    ? undefined
    : { key, object: objectValue };
}

function expression(
  context: ConvertContext,
  value: BabelNode,
): SyntaxExpression | undefined {
  const located = location(context, value);
  if (value.type === "ArrayExpression") {
    const rawElements = Array.isArray(value.elements) ? value.elements : [];
    const elements: (SyntaxExpression | undefined)[] = [];
    for (const rawElement of rawElements) {
      if (rawElement == null) {
        elements.push(undefined);
        continue;
      }
      const elementNode = node(rawElement);
      if (elementNode == null || elementNode.type === "SpreadElement") {
        return unsupported(context, value, "Array spread is unsupported.");
      }
      const converted = expression(context, elementNode);
      if (converted == null) return undefined;
      elements.push(converted);
    }
    return { ...located, elements, kind: "array" };
  }
  if (value.type === "AwaitExpression") {
    const argumentNode = node(value.argument);
    if (argumentNode == null) return unsupported(context, value);
    const argument = expression(context, argumentNode);
    return argument == null
      ? undefined
      : { ...located, argument, kind: "await" };
  }
  if (value.type === "NumericLiteral" && typeof value.value === "number") {
    return { ...located, kind: "number", value: value.value };
  }
  if (value.type === "StringLiteral" && typeof value.value === "string") {
    return { ...located, kind: "string", value: value.value };
  }
  if (value.type === "BooleanLiteral" && typeof value.value === "boolean") {
    return { ...located, kind: "boolean", value: value.value };
  }
  if (value.type === "NullLiteral") return { ...located, kind: "null" };
  if (value.type === "ThisExpression") {
    return context.functionStack.length === 0
      ? unsupported(
          context,
          value,
          "The M3 profile admits this only in function bodies.",
        )
      : { ...located, kind: "this" };
  }
  if (value.type === "Identifier") {
    const name = identifierName(value);
    if (name != null) return { ...located, kind: "identifier", name };
  }
  if (value.type === "ParenthesizedExpression") {
    const inner = node(value.expression);
    return inner == null
      ? unsupported(context, value)
      : expression(context, inner);
  }
  if (value.type === "UnaryExpression") {
    if (value.operator === "delete") {
      const argumentNode = node(value.argument);
      if (argumentNode == null) return unsupported(context, value);
      const member = memberParts(context, argumentNode);
      return member == null
        ? undefined
        : { ...located, ...member, kind: "property-delete" };
    }
    if (
      value.operator !== "-" &&
      value.operator !== "!" &&
      value.operator !== "typeof" &&
      value.operator !== "void"
    ) {
      return unsupported(context, value, "This unary operator is unsupported.");
    }
    const argumentNode = node(value.argument);
    if (argumentNode == null) return unsupported(context, value);
    const argument = expression(context, argumentNode);
    return argument == null
      ? undefined
      : { ...located, argument, kind: "unary", operator: value.operator };
  }
  if (value.type === "ObjectExpression") {
    const properties: {
      readonly key: SyntaxExpression;
      readonly value: SyntaxExpression;
    }[] = [];
    for (const property of nodes(value.properties)) {
      if (property.type !== "ObjectProperty" || property.shorthand === true) {
        return unsupported(
          context,
          property,
          "This object property is unsupported.",
        );
      }
      const keyNode = node(property.key);
      const valueNode = node(property.value);
      if (keyNode == null || valueNode == null)
        return unsupported(context, property);
      let key: SyntaxExpression | undefined;
      if (property.computed === true) {
        key = expression(context, keyNode);
      } else {
        const name = identifierName(keyNode);
        if (
          name === "__proto__" ||
          (keyNode.type === "StringLiteral" && keyNode.value === "__proto__")
        ) {
          return unsupported(
            context,
            property,
            "Noncomputed __proto__ literals are unsupported.",
          );
        }
        if (name != null) {
          key = { ...location(context, keyNode), kind: "string", value: name };
        } else if (keyNode.type === "NumericLiteral") {
          key = {
            ...location(context, keyNode),
            kind: "string",
            value: String(keyNode.value),
          };
        } else {
          key = expression(context, keyNode);
        }
      }
      const propertyValue = expression(context, valueNode);
      if (key == null || propertyValue == null) return undefined;
      properties.push({ key, value: propertyValue });
    }
    return { ...located, kind: "object", properties };
  }
  if (
    value.type === "FunctionExpression" ||
    (value.type === "ArrowFunctionExpression" && value.async === true)
  ) {
    const functionValue = functionDeclaration(context, value, false);
    return functionValue == null
      ? undefined
      : { ...located, functionValue, kind: "function" };
  }
  if (value.type === "MemberExpression") {
    const member = memberParts(context, value);
    return member == null
      ? undefined
      : { ...located, ...member, kind: "property-get" };
  }
  if (value.type === "AssignmentExpression") {
    if (value.operator !== "=") {
      return unsupported(context, value, "This assignment is unsupported.");
    }
    const left = node(value.left);
    const right = node(value.right);
    if (left == null || right == null) return unsupported(context, value);
    const name = identifierName(left);
    if (name != null) {
      const assigned = expression(context, right);
      return assigned == null
        ? undefined
        : { ...located, kind: "binding-set", name, value: assigned };
    }
    const member = memberParts(context, left);
    const assigned = expression(context, right);
    return member == null || assigned == null
      ? undefined
      : { ...located, ...member, kind: "property-set", value: assigned };
  }
  if (value.type === "BinaryExpression") {
    const operator = value.operator;
    const accepted = new Set<unknown>([
      "!==",
      "%",
      "*",
      "+",
      "-",
      "/",
      "<",
      "<=",
      "===",
      ">",
      ">=",
    ]);
    if (!accepted.has(operator)) {
      return unsupported(
        context,
        value,
        "This binary operator is unsupported.",
      );
    }
    const leftNode = node(value.left);
    const rightNode = node(value.right);
    if (leftNode == null || rightNode == null)
      return unsupported(context, value);
    const left = expression(context, leftNode);
    const right = expression(context, rightNode);
    if (left == null || right == null) return undefined;
    return {
      ...located,
      kind: "binary",
      left,
      operator: operator as BinaryOperator,
      right,
    };
  }
  if (value.type === "CallExpression") {
    if (value.typeArguments != null || value.typeParameters != null) {
      return unsupported(
        context,
        value,
        "Call type arguments are outside the M1 profile.",
      );
    }
    const callee = node(value.callee);
    if (callee == null) return unsupported(context, value);
    const target = callTarget(context, callee);
    const argumentValues: SyntaxExpression[] = [];
    for (const argumentValue of nodes(value.arguments)) {
      if (argumentValue.type === "SpreadElement") {
        return unsupported(context, argumentValue);
      }
      const converted = expression(context, argumentValue);
      if (converted == null) return undefined;
      argumentValues.push(converted);
    }
    return target == null
      ? undefined
      : { ...located, arguments: argumentValues, kind: "call", target };
  }
  if (value.type === "NewExpression") {
    if (value.typeArguments != null || value.typeParameters != null) {
      return unsupported(
        context,
        value,
        "Constructor type arguments are outside the M3 profile.",
      );
    }
    const calleeNode = node(value.callee);
    if (calleeNode == null) return unsupported(context, value);
    const callee = expression(context, calleeNode);
    const argumentValues: SyntaxExpression[] = [];
    for (const argumentValue of nodes(value.arguments)) {
      if (argumentValue.type === "SpreadElement") {
        return unsupported(context, argumentValue);
      }
      const converted = expression(context, argumentValue);
      if (converted == null) return undefined;
      argumentValues.push(converted);
    }
    return callee == null
      ? undefined
      : { ...located, arguments: argumentValues, callee, kind: "new" };
  }
  return unsupported(context, value);
}

function statement(
  context: ConvertContext,
  value: BabelNode,
  functionBody: boolean,
): SyntaxStatement | undefined {
  const located = location(context, value);
  if (value.type === "ExpressionStatement") {
    const expressionNode = node(value.expression);
    if (expressionNode == null) return unsupported(context, value);
    const converted = expression(context, expressionNode);
    return converted == null
      ? undefined
      : { ...located, expression: converted, kind: "expression" };
  }
  if (value.type === "VariableDeclaration") {
    if (value.kind !== "const" && value.kind !== "let") {
      return unsupported(
        context,
        value,
        "Only const and let declarations are supported.",
      );
    }
    const declarations = nodes(value.declarations);
    if (declarations.length !== 1) {
      return unsupported(
        context,
        value,
        "An M1 const declaration contains exactly one binding.",
      );
    }
    const declaration = declarations[0];
    if (declaration == null) return unsupported(context, value);
    const identifier = node(declaration.id);
    const initializerNode = node(declaration.init);
    const name = identifier == null ? undefined : identifierName(identifier);
    if (
      identifier == null ||
      name == null ||
      (value.kind === "const" && initializerNode == null)
    ) {
      return unsupported(
        context,
        declaration,
        "A const binding needs one identifier and an initializer.",
      );
    }
    const initializer =
      initializerNode == null
        ? { ...location(context, declaration), kind: "undefined" as const }
        : expression(context, initializerNode);
    if (initializer == null) return undefined;
    const hint = typeHint(context, identifier.typeAnnotation);
    if (context.diagnostics.length > 0) return undefined;
    return { ...located, hint, initializer, kind: value.kind, name };
  }
  if (value.type === "BreakStatement" || value.type === "ContinueStatement") {
    if (value.label != null) {
      return unsupported(
        context,
        value,
        "Labeled control flow is unsupported.",
      );
    }
    return {
      ...located,
      kind: value.type === "BreakStatement" ? "break" : "continue",
    };
  }
  if (value.type === "WhileStatement") {
    const testNode = node(value.test);
    const bodyNode = node(value.body);
    if (testNode == null || bodyNode == null)
      return unsupported(context, value);
    const test = expression(context, testNode);
    const body = statement(context, bodyNode, functionBody);
    return test == null || body == null
      ? undefined
      : { ...located, body, kind: "while", test };
  }
  if (value.type === "ReturnStatement") {
    if (!functionBody) {
      return unsupported(
        context,
        value,
        "A return statement is only valid inside a function.",
      );
    }
    const argument = node(value.argument);
    const converted =
      argument == null ? undefined : expression(context, argument);
    if (argument != null && converted == null) return undefined;
    return { ...located, expression: converted, kind: "return" };
  }
  if (value.type === "ThrowStatement") {
    const argument = node(value.argument);
    if (argument == null) return unsupported(context, value);
    const converted = expression(context, argument);
    return converted == null
      ? undefined
      : { ...located, expression: converted, kind: "throw" };
  }
  if (value.type === "TryStatement") {
    const blockNode = node(value.block);
    const handlerNode = node(value.handler);
    const finalizerNode = node(value.finalizer);
    if (blockNode == null) return unsupported(context, value);
    const block = statement(context, blockNode, functionBody);
    let handler:
      | {
          readonly body: SyntaxStatement;
          readonly name: string;
          readonly range: SourceRange;
        }
      | undefined;
    if (handlerNode != null) {
      const parameter = node(handlerNode.param);
      const bodyNode = node(handlerNode.body);
      const name = parameter == null ? undefined : identifierName(parameter);
      if (parameter == null || name == null || bodyNode == null) {
        return unsupported(
          context,
          handlerNode,
          "A catch clause requires one identifier binding.",
        );
      }
      const body = statement(context, bodyNode, functionBody);
      if (body == null) return undefined;
      handler = {
        body,
        name,
        range: sourceRange(context.locations, parameter),
      };
    }
    const finalizer =
      finalizerNode == null
        ? undefined
        : statement(context, finalizerNode, functionBody);
    if (block == null || (finalizerNode != null && finalizer == null)) {
      return undefined;
    }
    return { ...located, block, finalizer, handler, kind: "try" };
  }
  if (value.type === "BlockStatement") {
    const body: (SyntaxFunction | SyntaxStatement)[] = [];
    for (const child of nodes(value.body)) {
      const converted =
        child.type === "FunctionDeclaration"
          ? functionDeclaration(context, child, true)
          : statement(context, child, functionBody);
      if (converted == null) return undefined;
      body.push(converted);
    }
    return { ...located, body, kind: "block" };
  }
  if (value.type === "IfStatement") {
    const testNode = node(value.test);
    const consequentNode = node(value.consequent);
    const alternateNode = node(value.alternate);
    if (testNode == null || consequentNode == null) {
      return unsupported(context, value);
    }
    const test = expression(context, testNode);
    const consequent = statement(context, consequentNode, functionBody);
    const alternate =
      alternateNode == null
        ? undefined
        : statement(context, alternateNode, functionBody);
    if (test == null || consequent == null) return undefined;
    if (alternateNode != null && alternate == null) return undefined;
    return { ...located, alternate, consequent, kind: "if", test };
  }
  return unsupported(context, value);
}

function syntheticName(context: ConvertContext, role: string): string {
  const index = context.syntheticIndex;
  context.syntheticIndex += 1;
  return `\0oseo-${role}-${index}`;
}

function syntheticParameter(name: string, range: SourceRange): SyntaxParameter {
  return { hints: [], name, range };
}

function syntheticFunction(
  context: ConvertContext,
  range: SourceRange,
  parameters: readonly string[],
  body: readonly (SyntaxFunction | SyntaxStatement)[],
): SyntaxExpression {
  return {
    functionValue: {
      body,
      functionKind: "arrow",
      kind: "function",
      name: undefined,
      parameters: parameters.map((name) => syntheticParameter(name, range)),
      range,
      returnHints: [],
      strict: context.strictStack.at(-1) === true,
    },
    kind: "function",
    range,
  };
}

function undefinedExpression(range: SourceRange): SyntaxExpression {
  return { kind: "undefined", range };
}

function identifierExpression(
  name: string,
  range: SourceRange,
): SyntaxExpression {
  return { kind: "identifier", name, range };
}

function directPromiseResolve(
  value: SyntaxExpression,
  range: SourceRange,
): SyntaxExpression {
  return {
    arguments: [value],
    kind: "call",
    range,
    target: { kind: "promise-intrinsic-direct", method: "resolve", range },
  };
}

function internalPromiseThen(
  promise: SyntaxExpression,
  callback: SyntaxExpression,
  range: SourceRange,
): SyntaxExpression {
  return {
    arguments: [promise, callback],
    kind: "call",
    range,
    target: {
      kind: "promise-intrinsic-direct",
      method: "awaitThen",
      range,
    },
  };
}

function asyncCall(
  execution: SyntaxExpression,
  range: SourceRange,
): SyntaxExpression {
  return {
    arguments: [execution],
    kind: "call",
    range,
    target: { kind: "promise-intrinsic-direct", method: "asyncCall", range },
  };
}

function nodeContainsAwait(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(nodeContainsAwait);
  const valueNode = node(value);
  if (valueNode == null) return false;
  if (valueNode.type === "AwaitExpression") return true;
  if (
    valueNode.type === "FunctionDeclaration" ||
    valueNode.type === "FunctionExpression" ||
    valueNode.type === "ArrowFunctionExpression"
  ) {
    return false;
  }
  return Object.values(valueNode).some(nodeContainsAwait);
}

const maximumAsyncContinuationCount = 256;

function isDirectAsyncAwaitPoint(value: BabelNode): boolean {
  if (value.type === "ExpressionStatement") {
    return node(value.expression)?.type === "AwaitExpression";
  }
  if (value.type === "ReturnStatement") {
    return node(value.argument)?.type === "AwaitExpression";
  }
  if (value.type !== "VariableDeclaration") return false;
  if (value.kind !== "const" && value.kind !== "let") return false;
  const declarations = nodes(value.declarations);
  return (
    declarations.length === 1 &&
    node(declarations[0]?.init)?.type === "AwaitExpression"
  );
}

function validateAsyncContinuationCount(
  context: ConvertContext,
  values: readonly BabelNode[],
): boolean {
  let count = 0;
  for (const value of values) {
    if (!isDirectAsyncAwaitPoint(value)) continue;
    count += 1;
    if (count <= maximumAsyncContinuationCount) continue;
    unsupported(
      context,
      value,
      `An async function may contain at most ` +
        `${maximumAsyncContinuationCount} sequential await points.`,
    );
    return false;
  }
  return true;
}

interface AwaitPoint {
  readonly declaration?: {
    readonly hint: Hint | undefined;
    readonly kind: "const" | "let";
    readonly name: string;
  };
  readonly operand: BabelNode;
  readonly returnValue: boolean;
}

function awaitPoint(
  context: ConvertContext,
  value: BabelNode,
): AwaitPoint | undefined {
  if (value.type === "ExpressionStatement") {
    const awaited = node(value.expression);
    const operand =
      awaited?.type === "AwaitExpression" ? node(awaited.argument) : undefined;
    return operand == null ? undefined : { operand, returnValue: false };
  }
  if (value.type === "ReturnStatement") {
    const awaited = node(value.argument);
    const operand =
      awaited?.type === "AwaitExpression" ? node(awaited.argument) : undefined;
    return operand == null ? undefined : { operand, returnValue: true };
  }
  if (value.type !== "VariableDeclaration") return undefined;
  if (value.kind !== "const" && value.kind !== "let") return undefined;
  const declarations = nodes(value.declarations);
  const declaration = declarations.length === 1 ? declarations[0] : undefined;
  const identifier = declaration == null ? undefined : node(declaration.id);
  const awaited = declaration == null ? undefined : node(declaration.init);
  const operand =
    awaited?.type === "AwaitExpression" ? node(awaited.argument) : undefined;
  const name = identifier == null ? undefined : identifierName(identifier);
  if (identifier == null || name == null || operand == null) return undefined;
  return {
    declaration: {
      hint: typeHint(context, identifier.typeAnnotation),
      kind: value.kind,
      name,
    },
    operand,
    returnValue: false,
  };
}

function asyncScopePlaceholder(
  context: ConvertContext,
  value: BabelNode,
): SyntaxFunction | SyntaxStatement | undefined {
  if (value.type === "FunctionDeclaration") {
    return functionDeclaration(context, value, true);
  }
  if (value.type !== "VariableDeclaration") return undefined;
  if (value.kind !== "const" && value.kind !== "let") return undefined;
  const declarations = nodes(value.declarations);
  const declaration = declarations.length === 1 ? declarations[0] : undefined;
  const identifier = declaration == null ? undefined : node(declaration.id);
  const name = identifier == null ? undefined : identifierName(identifier);
  if (declaration == null || identifier == null || name == null) {
    return undefined;
  }
  const range = sourceRange(context.locations, value);
  return {
    hint: typeHint(context, identifier.typeAnnotation),
    initializer: undefinedExpression(range),
    kind: value.kind,
    name,
    range,
  };
}

function asyncScopePlaceholders(
  context: ConvertContext,
  values: readonly BabelNode[],
): readonly (SyntaxFunction | SyntaxStatement)[] | undefined {
  const declarations: (SyntaxFunction | SyntaxStatement)[] = [];
  for (const value of values) {
    if (
      value.type !== "FunctionDeclaration" &&
      value.type !== "VariableDeclaration"
    ) {
      continue;
    }
    const declaration = asyncScopePlaceholder(context, value);
    if (declaration == null) {
      if (value.type === "FunctionDeclaration") return undefined;
      continue;
    }
    declarations.push(declaration);
  }
  return declarations;
}

function validateAsyncStatements(
  context: ConvertContext,
  values: readonly BabelNode[],
): boolean {
  const validationContext: ConvertContext = {
    ...context,
    functionStack: [...context.functionStack],
    strictStack: [...context.strictStack],
  };
  for (const value of values) {
    const point = awaitPoint(validationContext, value);
    if (point != null) {
      if (nodeContainsAwait(point.operand)) {
        unsupported(
          validationContext,
          point.operand,
          "Nested await operands are outside M4.",
        );
        return false;
      }
      if (expression(validationContext, point.operand) == null) return false;
      continue;
    }
    if (nodeContainsAwait(value)) {
      unsupported(
        validationContext,
        value,
        "Await is supported in declarations, expression statements, and " +
          "returns.",
      );
      return false;
    }
    const converted =
      value.type === "FunctionDeclaration"
        ? functionDeclaration(validationContext, value, true)
        : statement(validationContext, value, true);
    if (converted == null) return false;
  }
  return true;
}

function asyncStatementList(
  context: ConvertContext,
  values: readonly BabelNode[],
  mode: "continuation" | "executor",
): readonly (SyntaxFunction | SyntaxStatement)[] | undefined {
  const body: (SyntaxFunction | SyntaxStatement)[] = [];
  for (const [index, value] of values.entries()) {
    const point = awaitPoint(context, value);
    if (point != null) {
      if (nodeContainsAwait(point.operand)) {
        return unsupported(
          context,
          point.operand,
          "Nested await operands are outside M4.",
        );
      }
      const operand = expression(context, point.operand);
      if (operand == null) return undefined;
      const range = sourceRange(context.locations, value);
      const valueName = syntheticName(context, "await");
      let continuationBody:
        | readonly (SyntaxFunction | SyntaxStatement)[]
        | undefined;
      if (point.returnValue) {
        continuationBody = [
          {
            expression: identifierExpression(valueName, range),
            kind: "return",
            range,
          },
        ];
      } else {
        continuationBody = asyncStatementList(
          context,
          values.slice(index + 1),
          "continuation",
        );
        if (continuationBody != null && point.declaration != null) {
          continuationBody = [
            {
              hint: point.declaration.hint,
              initializer: identifierExpression(valueName, range),
              kind: "binding-init",
              name: point.declaration.name,
              range,
            },
            ...continuationBody,
          ];
        }
      }
      if (continuationBody == null) return undefined;
      const callback = syntheticFunction(
        context,
        range,
        [valueName],
        continuationBody,
      );
      const chain = internalPromiseThen(
        directPromiseResolve(operand, range),
        callback,
        range,
      );
      if (mode === "executor") {
        const declarations = asyncScopePlaceholders(
          context,
          values.slice(index),
        );
        if (declarations == null) return undefined;
        body.push({ expression: chain, kind: "return", range });
        body.push(...declarations);
      } else {
        body.push({ expression: chain, kind: "return", range });
      }
      return body;
    }
    if (nodeContainsAwait(value)) {
      unsupported(
        context,
        value,
        "Await is supported in declarations, expression statements, and " +
          "returns.",
      );
      return undefined;
    }
    if (mode === "continuation" && value.type === "FunctionDeclaration") {
      continue;
    }
    const converted =
      value.type === "FunctionDeclaration"
        ? functionDeclaration(context, value, true)
        : statement(context, value, true);
    if (converted == null) return undefined;
    if (converted.kind === "function") {
      body.push(converted);
      continue;
    }
    if (mode === "continuation") {
      body.push(
        converted.kind === "const" || converted.kind === "let"
          ? { ...converted, kind: "binding-init" }
          : converted,
      );
    } else {
      body.push(converted);
    }
    if (converted.kind === "return" || converted.kind === "throw") {
      if (!validateAsyncStatements(context, values.slice(index + 1))) {
        return undefined;
      }
      if (mode === "executor") {
        const declarations = asyncScopePlaceholders(
          context,
          values.slice(index + 1),
        );
        if (declarations == null) return undefined;
        body.push(...declarations);
      }
      return body;
    }
  }
  const range =
    values.length === 0
      ? { end: { column: 1, line: 1 }, start: { column: 1, line: 1 } }
      : sourceRange(context.locations, values.at(-1) ?? values[0]!);
  body.push({
    expression: undefinedExpression(range),
    kind: "return",
    range,
  });
  return body;
}

function functionDeclaration(
  context: ConvertContext,
  value: BabelNode,
  requireName = true,
): SyntaxFunction | undefined {
  if (value.generator === true) {
    return unsupported(context, value, "Generator functions are unsupported.");
  }
  if (value.typeParameters != null) {
    return unsupported(
      context,
      value,
      "Generic function declarations are outside the M1 profile.",
    );
  }
  const identifier = node(value.id);
  const name = identifier == null ? undefined : identifierName(identifier);
  const bodyNode = node(value.body);
  const asyncArrowExpression =
    value.type === "ArrowFunctionExpression" &&
    value.async === true &&
    bodyNode?.type !== "BlockStatement";
  if (
    (requireName && name == null) ||
    (bodyNode?.type !== "BlockStatement" && !asyncArrowExpression)
  ) {
    return unsupported(
      context,
      value,
      "A function needs a name and block body.",
    );
  }
  const jsdoc = jsdocHints(context, value);
  const parameters: SyntaxParameter[] = [];
  for (const parameterNode of nodes(value.params)) {
    const parameterName = identifierName(parameterNode);
    if (
      parameterName == null ||
      parameterName === "this" ||
      parameterNode.optional === true
    ) {
      return unsupported(
        context,
        parameterNode,
        "M1 function parameters must be plain identifiers.",
      );
    }
    const hints: Hint[] = [];
    const typescriptHint = typeHint(context, parameterNode.typeAnnotation);
    if (typescriptHint != null) hints.push(typescriptHint);
    const jsdocHint = jsdoc.parameters.get(parameterName);
    if (jsdocHint != null) hints.push(jsdocHint);
    parameters.push({
      ...location(context, parameterNode),
      hints,
      name: parameterName,
    });
  }
  const returnHints: Hint[] = [];
  const returnHint = typeHint(context, value.returnType);
  if (returnHint != null) returnHints.push(returnHint);
  returnHints.push(...jsdoc.returns);
  const strict =
    context.strictStack.at(-1) === true ||
    (bodyNode?.type === "BlockStatement" && hasUseStrictDirective(bodyNode));
  const body: (SyntaxFunction | SyntaxStatement)[] = [];
  context.strictStack.push(strict);
  context.functionStack.push(true);
  const children =
    asyncArrowExpression && bodyNode != null
      ? [
          {
            argument: bodyNode,
            ...(bodyNode.end == null ? {} : { end: bodyNode.end }),
            ...(bodyNode.start == null ? {} : { start: bodyNode.start }),
            type: "ReturnStatement",
          } satisfies BabelNode,
        ]
      : nodes(bodyNode?.body);
  if (value.async === true) {
    if (!validateAsyncContinuationCount(context, children)) {
      context.functionStack.pop();
      context.strictStack.pop();
      return undefined;
    }
    const executionBody = asyncStatementList(context, children, "executor");
    if (executionBody != null) {
      const range = location(context, value).range;
      const execution = syntheticFunction(context, range, [], executionBody);
      body.push({
        expression: asyncCall(execution, range),
        kind: "return",
        range,
      });
    }
    if (executionBody == null) {
      context.functionStack.pop();
      context.strictStack.pop();
      return undefined;
    }
  } else {
    for (const child of children) {
      const converted =
        child.type === "FunctionDeclaration"
          ? functionDeclaration(context, child, true)
          : statement(context, child, true);
      if (converted == null) {
        context.functionStack.pop();
        context.strictStack.pop();
        return undefined;
      }
      body.push(converted);
    }
  }
  context.functionStack.pop();
  context.strictStack.pop();
  if (context.diagnostics.length > 0) return undefined;
  return {
    ...location(context, value),
    body,
    functionKind:
      value.type === "ArrowFunctionExpression"
        ? value.async === true
          ? "async-arrow"
          : "arrow"
        : value.async === true
          ? "async"
          : "ordinary",
    kind: "function",
    name,
    parameters,
    returnHints,
    strict,
  };
}

function program(
  context: ConvertContext,
  file: BabelNode,
): SyntaxProgram | undefined {
  const programNode = node(file.program) ?? file;
  const strict = hasUseStrictDirective(programNode);
  const body: (SyntaxFunction | SyntaxStatement)[] = [];
  context.strictStack.push(strict);
  for (const item of nodes(programNode.body)) {
    const converted =
      item.type === "FunctionDeclaration"
        ? functionDeclaration(context, item)
        : statement(context, item, false);
    if (converted == null) {
      context.strictStack.pop();
      return undefined;
    }
    body.push(converted);
  }
  context.strictStack.pop();
  return {
    ...location(context, programNode),
    body,
    kind: "program",
    sourceId: context.input.sourceId,
    strict,
  };
}

function exportForDeclaration(
  declaration: SyntaxFunction | SyntaxStatement,
): SyntaxExportEntry | undefined {
  if (
    declaration.kind !== "const" &&
    declaration.kind !== "let" &&
    declaration.kind !== "function"
  ) {
    return undefined;
  }
  if (declaration.name == null) return undefined;
  return {
    exportedName: declaration.name,
    kind: "local",
    localName: declaration.name,
    range: declaration.range,
  };
}

function hasModuleAttributes(
  context: ConvertContext,
  value: BabelNode,
): boolean {
  if (
    nodes(value.attributes).length > 0 ||
    nodes(value.assertions).length > 0
  ) {
    return true;
  }
  const source = node(value.source);
  if (source?.end == null || value.end == null) return false;
  const suffix = context.input.source
    .slice(source.end, value.end)
    .replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/gu, "");
  return /\b(?:assert|with)\s*\{/u.test(suffix);
}

function moduleProgram(
  context: ConvertContext,
  file: BabelNode,
): SyntaxModule | undefined {
  const programNode = node(file.program) ?? file;
  const body: (SyntaxFunction | SyntaxStatement)[] = [];
  const exports: SyntaxExportEntry[] = [];
  const imports: SyntaxImportEntry[] = [];
  context.strictStack.push(true);
  for (const item of nodes(programNode.body)) {
    if (item.type === "ImportDeclaration") {
      if (hasModuleAttributes(context, item)) {
        unsupported(context, item, "Module attributes are outside M4.");
        break;
      }
      if (item.importKind === "type") {
        unsupported(context, item, "Type-only imports are outside M4.");
        break;
      }
      const specifier = moduleSpecifier(context, node(item.source));
      if (specifier == null) break;
      const rawSpecifiers = nodes(item.specifiers);
      if (rawSpecifiers.length === 0) {
        imports.push({
          ...location(context, item),
          importedName: undefined,
          localName: undefined,
          specifier,
        });
        continue;
      }
      for (const rawSpecifier of rawSpecifiers) {
        if (rawSpecifier.importKind === "type") {
          unsupported(
            context,
            rawSpecifier,
            "Type-only imports are outside M4.",
          );
          break;
        }
        const local = node(rawSpecifier.local);
        const localName = local == null ? undefined : identifierName(local);
        let importedName: string | undefined;
        if (rawSpecifier.type === "ImportDefaultSpecifier") {
          importedName = "default";
        } else if (rawSpecifier.type === "ImportNamespaceSpecifier") {
          importedName = "*";
        } else if (rawSpecifier.type === "ImportSpecifier") {
          const imported = node(rawSpecifier.imported);
          importedName = imported == null ? undefined : moduleName(imported);
        }
        if (localName == null || importedName == null) {
          unsupported(context, rawSpecifier, "This import is unsupported.");
          break;
        }
        imports.push({
          ...location(context, rawSpecifier),
          importedName,
          localName,
          specifier,
        });
      }
      if (context.diagnostics.length > 0) break;
      continue;
    }
    if (item.type === "ExportAllDeclaration") {
      if (hasModuleAttributes(context, item)) {
        unsupported(context, item, "Module attributes are outside M4.");
        break;
      }
      const specifier = moduleSpecifier(context, node(item.source));
      if (specifier == null) break;
      if (item.exported != null) {
        unsupported(context, item, "Namespace re-exports are outside M4.");
        break;
      }
      exports.push({ ...location(context, item), kind: "star", specifier });
      continue;
    }
    if (item.type === "ExportNamedDeclaration") {
      if (hasModuleAttributes(context, item)) {
        unsupported(context, item, "Module attributes are outside M4.");
        break;
      }
      if (item.exportKind === "type") {
        unsupported(context, item, "Type-only exports are outside M4.");
        break;
      }
      const sourceNode = node(item.source);
      const specifier =
        sourceNode == null ? undefined : moduleSpecifier(context, sourceNode);
      if (sourceNode != null && specifier == null) break;
      const declarationNode = node(item.declaration);
      if (declarationNode != null) {
        const converted =
          declarationNode.type === "FunctionDeclaration"
            ? functionDeclaration(context, declarationNode)
            : statement(context, declarationNode, false);
        if (converted == null) break;
        const exportEntry = exportForDeclaration(converted);
        if (exportEntry == null) {
          unsupported(context, declarationNode, "This export is unsupported.");
          break;
        }
        body.push(converted);
        exports.push(exportEntry);
      }
      if (
        declarationNode == null &&
        specifier != null &&
        nodes(item.specifiers).length === 0
      ) {
        // An empty indirect export list contributes no export entry, but
        // its FromClause still joins the module's requested dependencies.
        imports.push({
          ...location(context, item),
          importedName: undefined,
          localName: undefined,
          specifier,
        });
        continue;
      }
      for (const rawSpecifier of nodes(item.specifiers)) {
        if (rawSpecifier.exportKind === "type") {
          unsupported(
            context,
            rawSpecifier,
            "Type-only exports are outside M4.",
          );
          break;
        }
        if (rawSpecifier.type !== "ExportSpecifier") {
          unsupported(context, rawSpecifier, "This export is unsupported.");
          break;
        }
        const local = node(rawSpecifier.local);
        const exported = node(rawSpecifier.exported);
        const localName = local == null ? undefined : moduleName(local);
        const exportedName =
          exported == null ? undefined : moduleName(exported);
        if (localName == null || exportedName == null) {
          unsupported(context, rawSpecifier, "This export is unsupported.");
          break;
        }
        exports.push(
          specifier == null
            ? {
                ...location(context, rawSpecifier),
                exportedName,
                kind: "local",
                localName,
              }
            : {
                ...location(context, rawSpecifier),
                exportedName,
                importedName: localName,
                kind: "indirect",
                specifier,
              },
        );
      }
      if (context.diagnostics.length > 0) break;
      continue;
    }
    if (item.type === "ExportDefaultDeclaration") {
      const declarationNode = node(item.declaration);
      if (declarationNode == null) {
        unsupported(context, item);
        break;
      }
      if (declarationNode.type === "FunctionDeclaration") {
        const declaration = functionDeclaration(
          context,
          declarationNode,
          false,
        );
        if (declaration == null) break;
        if (declaration.name == null) {
          exports.push({
            ...location(context, item),
            declaration: { ...declaration, name: "default" },
            exportedName: "default",
            kind: "default",
          });
          continue;
        }
        body.push(declaration);
        exports.push({
          exportedName: "default",
          kind: "local",
          localName: declaration.name,
          range: declaration.range,
        });
        continue;
      }
      const declaration = expression(context, declarationNode);
      if (declaration == null) break;
      exports.push({
        ...location(context, item),
        declaration,
        exportedName: "default",
        kind: "default",
      });
      continue;
    }
    const converted =
      item.type === "FunctionDeclaration"
        ? functionDeclaration(context, item)
        : statement(context, item, false);
    if (converted == null) break;
    body.push(converted);
  }
  context.strictStack.pop();
  if (context.diagnostics.length > 0) return undefined;
  return {
    ...location(context, programNode),
    body,
    exports,
    imports,
    kind: "module",
    sourceId: context.input.sourceId,
  };
}

function convertModule(
  input: SourceInput,
  file: BabelNode,
): ModuleFrontendResult {
  const locations = createSourceIndex(input.source);
  const parserErrors = Array.isArray(file.errors)
    ? (file.errors as readonly ParserError[])
    : [];
  if (parserErrors.length > 0) {
    return {
      diagnostics: parserErrors.map((error) =>
        diagnosticAt(input, locations, errorOffset(error)),
      ),
      parsed: false,
      sourceId: input.sourceId,
    };
  }
  const context: ConvertContext = {
    diagnostics: [],
    functionStack: [],
    input,
    locations,
    strictStack: [],
    syntheticIndex: 0,
  };
  const converted = moduleProgram(context, file);
  return converted == null || context.diagnostics.length > 0
    ? {
        diagnostics: context.diagnostics,
        parsed: false,
        sourceId: input.sourceId,
      }
    : {
        diagnostics: [],
        module: converted,
        parsed: true,
        sourceId: input.sourceId,
      };
}

/** Babel implementation of the owned Oseo source-frontend boundary. */
export const babelFrontend: SourceFrontend = {
  parse(input: SourceInput) {
    const locations = createSourceIndex(input.source);
    try {
      const file = parseBabel(input.source, {
        allowImportExportEverywhere: true,
        attachComment: true,
        createParenthesizedExpressions: true,
        errorRecovery: true,
        plugins: ["typescript"],
        sourceType: "script",
        tokens: true,
      }) as unknown as BabelNode;
      const parserErrors = Array.isArray(file.errors)
        ? (file.errors as readonly ParserError[])
        : [];
      if (parserErrors.length > 0) {
        return {
          diagnostics: parserErrors.map((error) =>
            diagnosticAt(input, locations, errorOffset(error)),
          ),
          parsed: false,
          sourceId: input.sourceId,
        };
      }
      const context: ConvertContext = {
        diagnostics: [],
        functionStack: [],
        input,
        locations,
        strictStack: [],
        syntheticIndex: 0,
      };
      const converted = program(context, file);
      if (converted == null || context.diagnostics.length > 0) {
        return {
          diagnostics: context.diagnostics,
          parsed: false,
          sourceId: input.sourceId,
        };
      }
      return {
        diagnostics: [],
        parsed: true,
        program: converted,
        sourceId: input.sourceId,
      };
    } catch (error) {
      const value = error as ParserError;
      return {
        diagnostics: [diagnosticAt(input, locations, errorOffset(value))],
        parsed: false,
        sourceId: input.sourceId,
      };
    }
  },
};

/** Babel implementation of the owned Oseo module-frontend boundary. */
export const babelModuleFrontend: ModuleSourceFrontend = {
  parseModule(input: SourceInput) {
    const locations = createSourceIndex(input.source);
    try {
      const file = parseBabel(input.source, {
        attachComment: true,
        createParenthesizedExpressions: true,
        errorRecovery: true,
        plugins: ["typescript"],
        sourceType: "module",
        tokens: true,
      }) as unknown as BabelNode;
      return convertModule(input, file);
    } catch (error) {
      const value = error as ParserError;
      return {
        diagnostics: [diagnosticAt(input, locations, errorOffset(value))],
        parsed: false,
        sourceId: input.sourceId,
      };
    }
  },
};
