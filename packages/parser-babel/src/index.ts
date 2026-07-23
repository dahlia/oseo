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
  SyntaxArrayBindingPattern,
  SyntaxArrayElement,
  SyntaxBindingPattern,
  SyntaxCallArgument,
  SyntaxCallTarget,
  SyntaxExpression,
  SyntaxForDeclaration,
  SyntaxForOfTarget,
  SyntaxFunction,
  SyntaxSwitchCase,
  SyntaxImportEntry,
  SyntaxModule,
  SyntaxModuleSpecifier,
  SyntaxObjectBindingPattern,
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
    const elements: SyntaxArrayElement[] = [];
    for (const rawElement of rawElements) {
      if (rawElement == null) {
        elements.push(undefined);
        continue;
      }
      const elementNode = node(rawElement);
      if (elementNode == null) return unsupported(context, value);
      if (elementNode.type === "SpreadElement") {
        const argumentNode = node(elementNode.argument);
        if (argumentNode == null) return unsupported(context, elementNode);
        const argument = expression(context, argumentNode);
        if (argument == null) return undefined;
        elements.push({
          ...location(context, elementNode),
          argument,
          kind: "spread",
        });
        continue;
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
    return context.functionStack.at(-1) !== true
      ? unsupported(
          context,
          value,
          "The profile admits this only where an enclosing non-arrow " +
            "function provides it.",
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
      value.operator !== "+" &&
      value.operator !== "typeof" &&
      value.operator !== "void" &&
      value.operator !== "~"
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
    value.type === "ArrowFunctionExpression"
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
    if (left.type === "ArrayPattern" || left.type === "ObjectPattern") {
      const pattern = bindingPattern(context, left, true);
      const assigned = expression(context, right);
      return pattern == null || assigned == null
        ? undefined
        : { ...located, kind: "destructuring-set", pattern, value: assigned };
    }
    const member = memberParts(context, left);
    const assigned = expression(context, right);
    return member == null || assigned == null
      ? undefined
      : { ...located, ...member, kind: "property-set", value: assigned };
  }
  if (value.type === "LogicalExpression") {
    const operator = value.operator;
    if (operator !== "&&" && operator !== "||" && operator !== "??") {
      return unsupported(
        context,
        value,
        "This logical operator is unsupported.",
      );
    }
    const leftNode = node(value.left);
    const rightNode = node(value.right);
    if (leftNode == null || rightNode == null)
      return unsupported(context, value);
    const left = expression(context, leftNode);
    const right = expression(context, rightNode);
    if (left == null || right == null) return undefined;
    return { ...located, kind: "logical", left, operator, right };
  }
  if (value.type === "TaggedTemplateExpression") {
    return unsupported(
      context,
      value,
      "Tagged template expressions are unsupported.",
    );
  }
  if (value.type === "TemplateLiteral") {
    const quasis = nodes(value.quasis);
    const expressions = nodes(value.expressions);
    if (quasis.length !== expressions.length + 1) {
      return unsupported(context, value);
    }
    const first = cookedTemplateText(quasis[0]!);
    if (first == null) return unsupported(context, value);
    // An untagged template is observationally string concatenation for
    // the admitted values: every piece converts through ToString, and a
    // leading string operand keeps + on the string branch.
    let result: SyntaxExpression = {
      ...location(context, quasis[0]!),
      kind: "string",
      value: first,
    };
    for (const [index, expressionNode] of expressions.entries()) {
      const quasi = quasis[index + 1];
      if (quasi == null) return unsupported(context, value);
      const piece = cookedTemplateText(quasi);
      if (piece == null) return unsupported(context, value);
      const substitution = expression(context, expressionNode);
      if (substitution == null) return undefined;
      result = {
        ...located,
        kind: "binary",
        left: result,
        operator: "+",
        right: {
          ...location(context, expressionNode),
          argument: substitution,
          kind: "unary",
          operator: "to-string",
        },
      };
      if (piece !== "") {
        result = {
          ...located,
          kind: "binary",
          left: result,
          operator: "+",
          right: {
            ...location(context, quasi),
            kind: "string",
            value: piece,
          },
        };
      }
    }
    return result;
  }
  if (value.type === "SequenceExpression") {
    const expressions: SyntaxExpression[] = [];
    for (const element of nodes(value.expressions)) {
      const converted = expression(context, element);
      if (converted == null) return undefined;
      expressions.push(converted);
    }
    if (expressions.length < 2) return unsupported(context, value);
    return { ...located, expressions, kind: "sequence" };
  }
  if (value.type === "ConditionalExpression") {
    const testNode = node(value.test);
    const consequentNode = node(value.consequent);
    const alternateNode = node(value.alternate);
    if (testNode == null || consequentNode == null || alternateNode == null) {
      return unsupported(context, value);
    }
    const test = expression(context, testNode);
    const consequent = expression(context, consequentNode);
    const alternate = expression(context, alternateNode);
    if (test == null || consequent == null || alternate == null) {
      return undefined;
    }
    return { ...located, alternate, consequent, kind: "conditional", test };
  }
  if (value.type === "BinaryExpression") {
    const operator = value.operator;
    const accepted = new Set<unknown>([
      "!=",
      "!==",
      "%",
      "&",
      "*",
      "**",
      "+",
      "-",
      "/",
      "<",
      "<<",
      "<=",
      "==",
      "===",
      ">",
      ">=",
      ">>",
      ">>>",
      "^",
      "in",
      "instanceof",
      "|",
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
    const argumentValues: SyntaxCallArgument[] = [];
    for (const argumentValue of nodes(value.arguments)) {
      if (argumentValue.type === "SpreadElement") {
        const spreadArgument = node(argumentValue.argument);
        if (spreadArgument == null) return unsupported(context, argumentValue);
        const converted = expression(context, spreadArgument);
        if (converted == null) return undefined;
        argumentValues.push({
          ...location(context, argumentValue),
          argument: converted,
          kind: "spread",
        });
        continue;
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
    const argumentValues: SyntaxCallArgument[] = [];
    for (const argumentValue of nodes(value.arguments)) {
      if (argumentValue.type === "SpreadElement") {
        const spreadArgument = node(argumentValue.argument);
        if (spreadArgument == null) return unsupported(context, argumentValue);
        const converted = expression(context, spreadArgument);
        if (converted == null) return undefined;
        argumentValues.push({
          ...location(context, argumentValue),
          argument: converted,
          kind: "spread",
        });
        continue;
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

function bindingPattern(
  context: ConvertContext,
  value: BabelNode,
  assignment = false,
): SyntaxBindingPattern | undefined {
  if (value.type === "Identifier") {
    const name = identifierName(value);
    if (name == null || value.optional === true) {
      return unsupported(
        context,
        value,
        "Binding identifiers cannot be optional.",
      );
    }
    return { ...location(context, value), kind: "binding-identifier", name };
  }
  if (value.type === "MemberExpression") {
    if (!assignment) {
      return unsupported(
        context,
        value,
        "Member targets are supported only in assignment patterns.",
      );
    }
    if (nodeContainsAwait(value)) {
      return unsupported(
        context,
        value,
        "Await inside a destructuring assignment target is unsupported.",
      );
    }
    const member = memberParts(context, value);
    return member == null
      ? undefined
      : { ...location(context, value), ...member, kind: "assignment-member" };
  }
  if (value.type !== "ArrayPattern" && value.type !== "ObjectPattern") {
    return unsupported(
      context,
      value,
      "Only identifier, array, and object binding patterns are supported.",
    );
  }
  const annotation = node(value.typeAnnotation);
  if (annotation != null) {
    return unsupported(
      context,
      annotation,
      "TypeScript annotations on binding patterns are unsupported.",
    );
  }
  if (value.type === "ObjectPattern") {
    const properties: SyntaxObjectBindingPattern["properties"][number][] = [];
    let rest: SyntaxObjectBindingPattern["rest"];
    const objectProperties = nodes(value.properties);
    for (const [index, property] of objectProperties.entries()) {
      if (property.type === "RestElement") {
        if (index !== objectProperties.length - 1) {
          return unsupported(
            context,
            property,
            "An object binding rest property must be last.",
          );
        }
        const argument = node(property.argument);
        if (argument == null) return unsupported(context, property);
        const converted = bindingPattern(context, argument, assignment);
        if (
          converted?.kind !== "binding-identifier" &&
          converted?.kind !== "assignment-member"
        ) {
          return unsupported(
            context,
            property,
            "An object binding rest target must be an identifier.",
          );
        }
        rest = converted;
        continue;
      }
      if (property.type !== "ObjectProperty" || property.method === true) {
        return unsupported(
          context,
          property,
          "This object binding property is unsupported.",
        );
      }
      const keyNode = node(property.key);
      const valueNode = node(property.value);
      if (keyNode == null || valueNode == null) {
        return unsupported(context, property);
      }
      if (property.computed === true && nodeContainsAwait(keyNode)) {
        return unsupported(
          context,
          keyNode,
          "Await inside an object binding property name is unsupported.",
        );
      }
      let key: SyntaxExpression | undefined;
      if (property.computed === true) {
        key = expression(context, keyNode);
      } else {
        const name = identifierName(keyNode);
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
      const left =
        valueNode.type === "AssignmentPattern"
          ? node(valueNode.left)
          : valueNode;
      const right =
        valueNode.type === "AssignmentPattern"
          ? node(valueNode.right)
          : undefined;
      if (left == null) return unsupported(context, property);
      if (right != null && nodeContainsAwait(right)) {
        return unsupported(
          context,
          right,
          "Await inside a binding default is unsupported.",
        );
      }
      const pattern = bindingPattern(context, left, assignment);
      const initializer =
        right == null ? undefined : expression(context, right);
      if (
        key == null ||
        pattern == null ||
        (right != null && initializer == null)
      ) {
        return undefined;
      }
      properties.push({
        ...location(context, property),
        ...(initializer == null ? {} : { initializer }),
        key,
        pattern,
      });
    }
    return {
      ...location(context, value),
      kind: "object-binding-pattern",
      properties,
      ...(rest == null ? {} : { rest }),
    };
  }
  const rawElements = Array.isArray(value.elements)
    ? (value.elements as readonly unknown[])
    : [];
  const elements: SyntaxArrayBindingPattern["elements"][number][] = [];
  let rest: SyntaxBindingPattern | undefined;
  for (const [index, rawElement] of rawElements.entries()) {
    const element = node(rawElement);
    if (element == null) {
      elements.push(undefined);
      continue;
    }
    if (element.type === "RestElement") {
      if (index !== rawElements.length - 1) {
        return unsupported(
          context,
          element,
          "An array binding rest element must be last.",
        );
      }
      const argument = node(element.argument);
      if (argument == null) return unsupported(context, element);
      rest = bindingPattern(context, argument, assignment);
      if (rest == null) return undefined;
      continue;
    }
    const left =
      element.type === "AssignmentPattern" ? node(element.left) : element;
    const right =
      element.type === "AssignmentPattern" ? node(element.right) : undefined;
    if (left == null) return unsupported(context, element);
    if (right != null && nodeContainsAwait(right)) {
      return unsupported(
        context,
        right,
        "Await inside an array binding default is unsupported.",
      );
    }
    const pattern = bindingPattern(context, left, assignment);
    const initializer = right == null ? undefined : expression(context, right);
    if (pattern == null || (right != null && initializer == null)) {
      return undefined;
    }
    elements.push({
      ...location(context, element),
      ...(initializer == null ? {} : { initializer }),
      pattern,
    });
  }
  return {
    ...location(context, value),
    elements,
    kind: "array-binding-pattern",
    ...(rest == null ? {} : { rest }),
  };
}

function patternNames(pattern: SyntaxBindingPattern): readonly string[] {
  if (pattern.kind === "assignment-member") return [];
  if (pattern.kind === "binding-identifier") return [pattern.name];
  if (pattern.kind === "object-binding-pattern") {
    return [
      ...pattern.properties.flatMap((property) =>
        patternNames(property.pattern),
      ),
      ...(pattern.rest == null ? [] : patternNames(pattern.rest)),
    ];
  }
  return [
    ...pattern.elements.flatMap((element) =>
      element == null ? [] : patternNames(element.pattern),
    ),
    ...(pattern.rest == null ? [] : patternNames(pattern.rest)),
  ];
}

function rawPatternNames(value: BabelNode): readonly string[] {
  const name = identifierName(value);
  if (name != null) return [name];
  if (value.type === "AssignmentPattern" || value.type === "RestElement") {
    const child = node(
      value.type === "AssignmentPattern" ? value.left : value.argument,
    );
    return child == null ? [] : rawPatternNames(child);
  }
  if (value.type === "ArrayPattern") {
    return nodes(value.elements).flatMap(rawPatternNames);
  }
  if (value.type === "ObjectPattern") {
    return nodes(value.properties).flatMap((property) => {
      if (property.type === "RestElement") return rawPatternNames(property);
      const propertyValue = node(property.value);
      return propertyValue == null ? [] : rawPatternNames(propertyValue);
    });
  }
  return [];
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
    if (value.declare === true) {
      return unsupported(
        context,
        value,
        "Ambient declarations are erased by TypeScript and unsupported.",
      );
    }
    if (value.kind === "var") {
      const assignments: SyntaxStatement[] = [];
      for (const declarator of nodes(value.declarations)) {
        const identifier = node(declarator.id);
        const initializerNode = node(declarator.init);
        if (
          identifier?.type === "ArrayPattern" ||
          identifier?.type === "ObjectPattern"
        ) {
          if (initializerNode == null) {
            return unsupported(
              context,
              declarator,
              "A binding pattern declaration needs an initializer.",
            );
          }
          const pattern = bindingPattern(context, identifier);
          const initializer = expression(context, initializerNode);
          if (pattern == null || initializer == null) {
            return undefined;
          }
          assignments.push({
            ...location(context, declarator),
            declarationKind: "var",
            initializer,
            kind: "binding-pattern",
            mode: "write",
            pattern,
          });
          continue;
        }
        const name =
          identifier == null ? undefined : identifierName(identifier);
        if (name == null) {
          return unsupported(
            context,
            declarator,
            "var destructuring is unsupported.",
          );
        }
        if (initializerNode == null) continue;
        const assigned = expression(context, initializerNode);
        if (assigned == null) return undefined;
        const declaratorRange = location(context, declarator);
        assignments.push({
          ...declaratorRange,
          expression: {
            ...declaratorRange,
            kind: "binding-set",
            name,
            value: assigned,
          },
          kind: "expression",
        });
      }
      const single = assignments.length === 1 ? assignments[0] : undefined;
      if (single != null) return single;
      return { ...located, body: assignments, kind: "block" };
    }
    if (value.kind !== "const" && value.kind !== "let") {
      return unsupported(
        context,
        value,
        "Only const, let, and var declarations are supported.",
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
    if (
      identifier?.type === "ArrayPattern" ||
      identifier?.type === "ObjectPattern"
    ) {
      if (initializerNode == null) {
        return unsupported(
          context,
          declaration,
          "A binding pattern declaration needs an initializer.",
        );
      }
      const pattern = bindingPattern(context, identifier);
      const initializer = expression(context, initializerNode);
      return pattern == null || initializer == null
        ? undefined
        : {
            ...located,
            declarationKind: value.kind,
            initializer,
            kind: "binding-pattern",
            mode: "declare",
            pattern,
          };
    }
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
    const labelNode = node(value.label);
    const label = labelNode == null ? undefined : identifierName(labelNode);
    if (value.label != null && label == null) {
      return unsupported(context, value);
    }
    return {
      ...located,
      kind: value.type === "BreakStatement" ? "break" : "continue",
      ...(label == null ? {} : { label }),
    };
  }
  if (value.type === "LabeledStatement") {
    const labelNode = node(value.label);
    const label = labelNode == null ? undefined : identifierName(labelNode);
    const bodyNode = node(value.body);
    if (label == null || bodyNode == null) {
      return unsupported(context, value);
    }
    const body = statement(context, bodyNode, functionBody);
    return body == null
      ? undefined
      : { ...located, body, kind: "labeled", label };
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
  if (value.type === "EmptyStatement") {
    return { ...located, body: [], kind: "block" };
  }
  if (value.type === "SwitchStatement") {
    const discriminantNode = node(value.discriminant);
    if (discriminantNode == null) return unsupported(context, value);
    const discriminant = expression(context, discriminantNode);
    if (discriminant == null) return undefined;
    const cases: SyntaxSwitchCase[] = [];
    for (const caseNode of nodes(value.cases)) {
      const testNode = node(caseNode.test);
      const test = testNode == null ? undefined : expression(context, testNode);
      if (testNode != null && test == null) return undefined;
      const body: SyntaxStatement[] = [];
      for (const child of nodes(caseNode.consequent)) {
        if (child.type === "FunctionDeclaration") {
          return unsupported(
            context,
            child,
            "Function declarations in switch clauses are unsupported.",
          );
        }
        const converted = statement(context, child, functionBody);
        if (converted == null) return undefined;
        body.push(converted);
      }
      cases.push({
        body,
        range: location(context, caseNode).range,
        ...(test == null ? {} : { test }),
      });
    }
    return { ...located, cases, discriminant, kind: "switch" };
  }
  if (value.type === "ForInStatement") {
    return unsupported(context, value, "for-in statements are unsupported.");
  }
  if (value.type === "ForOfStatement") {
    if (value.await === true) {
      return unsupported(context, value, "for-await-of is unsupported.");
    }
    const left = node(value.left);
    const rightNode = node(value.right);
    const bodyNode = node(value.body);
    if (left == null || rightNode == null || bodyNode == null) {
      return unsupported(context, value);
    }
    let target: SyntaxForOfTarget | undefined;
    if (left.type === "VariableDeclaration") {
      if (left.declare === true) {
        return unsupported(
          context,
          left,
          "Ambient declarations are erased by TypeScript and unsupported.",
        );
      }
      if (left.kind !== "const" && left.kind !== "let" && left.kind !== "var") {
        return unsupported(
          context,
          left,
          "A for-of declaration uses const, let, or var.",
        );
      }
      const declarations = nodes(left.declarations);
      const declaration = declarations[0];
      const identifier = declaration == null ? undefined : node(declaration.id);
      const name = identifier == null ? undefined : identifierName(identifier);
      if (
        declarations.length !== 1 ||
        declaration == null ||
        identifier == null ||
        declaration.init != null
      ) {
        return unsupported(
          context,
          left,
          "A for-of declaration needs one uninitialized binding.",
        );
      }
      if (name != null) {
        target = {
          declarationKind: left.kind,
          hint: typeHint(context, identifier.typeAnnotation),
          kind: "declaration",
          name,
          range: location(context, declaration).range,
        };
      } else if (
        identifier.type === "ArrayPattern" ||
        identifier.type === "ObjectPattern"
      ) {
        const pattern = bindingPattern(context, identifier);
        if (pattern == null) return undefined;
        target = {
          declarationKind: left.kind,
          kind: "pattern-declaration",
          pattern,
          range: location(context, declaration).range,
        };
      }
    } else {
      const name = identifierName(left);
      if (name != null) {
        target = {
          kind: "binding",
          name,
          range: location(context, left).range,
        };
      } else {
        const member = memberParts(context, left);
        if (member != null) {
          target = {
            key: member.key,
            kind: "property",
            object: member.object,
            range: location(context, left).range,
          };
        }
      }
    }
    if (target == null) {
      return unsupported(
        context,
        left,
        "A for-of head needs an identifier or member assignment target.",
      );
    }
    const iterable = expression(context, rightNode);
    const body = statement(context, bodyNode, functionBody);
    return iterable == null || body == null
      ? undefined
      : { ...located, body, iterable, kind: "for-of", target };
  }
  if (value.type === "ForStatement") {
    const initNode = node(value.init);
    const testNode = node(value.test);
    const updateNode = node(value.update);
    const bodyNode = node(value.body);
    if (bodyNode == null) return unsupported(context, value);
    let declarations: SyntaxForDeclaration[] | undefined;
    let init: SyntaxExpression | undefined;
    if (initNode != null && initNode.type === "VariableDeclaration") {
      if (initNode.declare === true) {
        return unsupported(
          context,
          initNode,
          "Ambient declarations are erased by TypeScript and unsupported.",
        );
      }
      if (initNode.kind === "var") {
        const assignments: SyntaxExpression[] = [];
        for (const declarator of nodes(initNode.declarations)) {
          const identifier = node(declarator.id);
          const name =
            identifier == null ? undefined : identifierName(identifier);
          if (name == null) {
            return unsupported(
              context,
              declarator,
              "var destructuring is unsupported.",
            );
          }
          const initializerNode = node(declarator.init);
          if (initializerNode == null) continue;
          const assigned = expression(context, initializerNode);
          if (assigned == null) return undefined;
          assignments.push({
            ...location(context, declarator),
            kind: "binding-set",
            name,
            value: assigned,
          });
        }
        if (assignments.length === 1) init = assignments[0];
        else if (assignments.length > 1) {
          init = { ...located, expressions: assignments, kind: "sequence" };
        }
      } else if (initNode.kind === "const" || initNode.kind === "let") {
        declarations = [];
        for (const declarator of nodes(initNode.declarations)) {
          const identifier = node(declarator.id);
          const name =
            identifier == null ? undefined : identifierName(identifier);
          if (identifier == null || name == null) {
            return unsupported(
              context,
              declarator,
              "for declarations need plain identifiers.",
            );
          }
          const initializerNode = node(declarator.init);
          if (initNode.kind === "const" && initializerNode == null) {
            return unsupported(
              context,
              declarator,
              "A const binding needs one identifier and an initializer.",
            );
          }
          const declaratorRange = location(context, declarator);
          const initializer =
            initializerNode == null
              ? { ...declaratorRange, kind: "undefined" as const }
              : expression(context, initializerNode);
          if (initializer == null) return undefined;
          declarations.push({
            hint: typeHint(context, identifier.typeAnnotation),
            initializer,
            mutable: initNode.kind === "let",
            name,
            range: declaratorRange.range,
          });
        }
      } else {
        return unsupported(
          context,
          initNode,
          "Only const, let, and var declarations are supported.",
        );
      }
    } else if (initNode != null) {
      init = expression(context, initNode);
      if (init == null) return undefined;
    }
    const test = testNode == null ? undefined : expression(context, testNode);
    if (testNode != null && test == null) return undefined;
    const update =
      updateNode == null ? undefined : expression(context, updateNode);
    if (updateNode != null && update == null) return undefined;
    const body = statement(context, bodyNode, functionBody);
    if (body == null) return undefined;
    return {
      ...located,
      body,
      ...(declarations == null ? {} : { declarations }),
      ...(init == null ? {} : { init }),
      kind: "for",
      ...(test == null ? {} : { test }),
      ...(update == null ? {} : { update }),
    };
  }
  if (value.type === "DoWhileStatement") {
    const bodyNode = node(value.body);
    const testNode = node(value.test);
    if (bodyNode == null || testNode == null)
      return unsupported(context, value);
    const body = statement(context, bodyNode, functionBody);
    const test = expression(context, testNode);
    return body == null || test == null
      ? undefined
      : { ...located, body, kind: "do-while", test };
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
          readonly pattern: SyntaxBindingPattern;
          readonly range: SourceRange;
        }
      | undefined;
    if (handlerNode != null) {
      const parameter = node(handlerNode.param);
      const bodyNode = node(handlerNode.body);
      if (parameter == null || bodyNode == null) {
        return unsupported(
          context,
          handlerNode,
          "A catch clause requires one binding pattern.",
        );
      }
      const pattern = bindingPattern(context, parameter);
      const body = statement(context, bodyNode, functionBody);
      if (pattern == null || body == null) return undefined;
      handler = {
        body,
        pattern,
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

function cookedTemplateText(element: BabelNode): string | undefined {
  const elementValue = element.value as
    | { readonly cooked?: unknown }
    | undefined;
  return typeof elementValue?.cooked === "string"
    ? elementValue.cooked
    : undefined;
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

interface DirectAwaitAssignment {
  readonly left: BabelNode;
  readonly operand: BabelNode;
}

function unparenthesizedExpression(value: unknown): BabelNode | undefined {
  let current = node(value);
  while (current?.type === "ParenthesizedExpression") {
    current = node(current.expression);
  }
  return current;
}

function directAwaitAssignment(
  value: BabelNode,
): DirectAwaitAssignment | undefined {
  if (value.type !== "ExpressionStatement") return undefined;
  const expressionValue = unparenthesizedExpression(value.expression);
  if (
    expressionValue?.type !== "AssignmentExpression" ||
    expressionValue.operator !== "="
  ) {
    return undefined;
  }
  const left = node(expressionValue.left);
  const awaited = unparenthesizedExpression(expressionValue.right);
  const operand =
    awaited?.type === "AwaitExpression" ? node(awaited.argument) : undefined;
  if (
    left == null ||
    operand == null ||
    (left.type !== "ArrayPattern" && left.type !== "ObjectPattern")
  ) {
    return undefined;
  }
  return { left, operand };
}

function isDirectAsyncAwaitPoint(value: BabelNode): boolean {
  if (value.type === "ExpressionStatement") {
    return (
      directAwaitAssignment(value) != null ||
      unparenthesizedExpression(value.expression)?.type === "AwaitExpression"
    );
  }
  if (value.type === "ReturnStatement") {
    return (
      unparenthesizedExpression(value.argument)?.type === "AwaitExpression"
    );
  }
  if (value.type !== "VariableDeclaration") return false;
  if (value.kind !== "const" && value.kind !== "let" && value.kind !== "var") {
    return false;
  }
  const declarations = nodes(value.declarations);
  return (
    declarations.length === 1 &&
    unparenthesizedExpression(declarations[0]?.init)?.type === "AwaitExpression"
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
  readonly assignment?: SyntaxBindingPattern;
  readonly declaration?: {
    readonly hint: Hint | undefined;
    readonly kind: "const" | "let" | "var";
    readonly name?: string;
    readonly pattern?: SyntaxBindingPattern;
  };
  readonly operand: BabelNode;
  readonly returnValue: boolean;
}

function awaitPoint(
  context: ConvertContext,
  value: BabelNode,
): AwaitPoint | undefined {
  if (value.type === "ExpressionStatement") {
    const directAssignment = directAwaitAssignment(value);
    if (directAssignment != null) {
      const assignment = bindingPattern(context, directAssignment.left, true);
      return assignment == null
        ? undefined
        : {
            assignment,
            operand: directAssignment.operand,
            returnValue: false,
          };
    }
    const awaited = unparenthesizedExpression(value.expression);
    const operand =
      awaited?.type === "AwaitExpression" ? node(awaited.argument) : undefined;
    return operand == null ? undefined : { operand, returnValue: false };
  }
  if (value.type === "ReturnStatement") {
    const awaited = unparenthesizedExpression(value.argument);
    const operand =
      awaited?.type === "AwaitExpression" ? node(awaited.argument) : undefined;
    return operand == null ? undefined : { operand, returnValue: true };
  }
  if (value.type !== "VariableDeclaration") return undefined;
  if (value.kind !== "const" && value.kind !== "let" && value.kind !== "var") {
    return undefined;
  }
  const declarations = nodes(value.declarations);
  const declaration = declarations.length === 1 ? declarations[0] : undefined;
  const identifier = declaration == null ? undefined : node(declaration.id);
  const awaited =
    declaration == null
      ? undefined
      : unparenthesizedExpression(declaration.init);
  const operand =
    awaited?.type === "AwaitExpression" ? node(awaited.argument) : undefined;
  const name = identifier == null ? undefined : identifierName(identifier);
  if (identifier == null || operand == null) return undefined;
  if (
    name == null &&
    identifier.type !== "ArrayPattern" &&
    identifier.type !== "ObjectPattern"
  ) {
    return undefined;
  }
  const pattern =
    identifier.type === "ArrayPattern" || identifier.type === "ObjectPattern"
      ? bindingPattern(context, identifier)
      : undefined;
  if (name == null && pattern == null) {
    return undefined;
  }
  return {
    declaration: {
      hint:
        identifier.type === "Identifier"
          ? typeHint(context, identifier.typeAnnotation)
          : undefined,
      kind: value.kind,
      ...(name == null ? {} : { name }),
      ...(pattern == null ? {} : { pattern }),
    },
    operand,
    returnValue: false,
  };
}

function asyncScopePlaceholder(
  context: ConvertContext,
  value: BabelNode,
): readonly (SyntaxFunction | SyntaxStatement)[] | undefined {
  if (value.type === "FunctionDeclaration") {
    const declaration = functionDeclaration(context, value, true);
    return declaration == null ? undefined : [declaration];
  }
  if (value.type !== "VariableDeclaration") return undefined;
  if (value.kind !== "const" && value.kind !== "let") return undefined;
  const declarations = nodes(value.declarations);
  const declaration = declarations.length === 1 ? declarations[0] : undefined;
  const identifier = declaration == null ? undefined : node(declaration.id);
  if (declaration == null || identifier == null) {
    return undefined;
  }
  const range = sourceRange(context.locations, value);
  const name = identifierName(identifier);
  if (name != null) {
    return [
      {
        hint: typeHint(context, identifier.typeAnnotation),
        initializer: undefinedExpression(range),
        kind: value.kind,
        name,
        range,
      },
    ];
  }
  const pattern = bindingPattern(context, identifier);
  if (pattern == null) return undefined;
  const declarationKind = value.kind === "const" ? "const" : "let";
  return patternNames(pattern).map((bindingName) => ({
    hint: undefined,
    initializer: undefinedExpression(range),
    kind: declarationKind,
    name: bindingName,
    range,
  }));
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
    const declarationsForValue = asyncScopePlaceholder(context, value);
    if (declarationsForValue == null) {
      if (value.type === "FunctionDeclaration") return undefined;
      continue;
    }
    declarations.push(...declarationsForValue);
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
        if (continuationBody != null) {
          const received: SyntaxStatement | undefined =
            point.assignment != null
              ? {
                  expression: {
                    kind: "destructuring-set",
                    pattern: point.assignment,
                    range,
                    value: identifierExpression(valueName, range),
                  },
                  kind: "expression",
                  range,
                }
              : point.declaration?.pattern != null
                ? {
                    declarationKind: point.declaration.kind,
                    initializer: identifierExpression(valueName, range),
                    kind: "binding-pattern",
                    mode:
                      point.declaration.kind === "var" ? "write" : "initialize",
                    pattern: point.declaration.pattern,
                    range,
                  }
                : point.declaration?.name == null
                  ? undefined
                  : point.declaration.kind === "var"
                    ? {
                        expression: {
                          kind: "binding-set",
                          name: point.declaration.name,
                          range,
                          value: identifierExpression(valueName, range),
                        },
                        kind: "expression",
                        range,
                      }
                    : {
                        hint: point.declaration.hint,
                        initializer: identifierExpression(valueName, range),
                        kind: "binding-init",
                        name: point.declaration.name,
                        range,
                      };
          if (point.assignment != null || point.declaration != null) {
            if (received == null) return undefined;
            continuationBody = [received, ...continuationBody];
          }
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
          : converted.kind === "binding-pattern" &&
              converted.declarationKind !== "var" &&
              converted.mode === "declare"
            ? { ...converted, mode: "initialize" }
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

interface HoistedVar {
  readonly declarator: BabelNode;
  readonly hint: Hint | undefined;
  readonly range: SourceRange;
  readonly byteRange: ByteRange;
}

function unwrapExportDeclaration(value: BabelNode): BabelNode {
  if (
    value.type !== "ExportNamedDeclaration" &&
    value.type !== "ExportDefaultDeclaration"
  ) {
    return value;
  }
  return node(value.declaration) ?? value;
}

function gatherLexicalNames(
  values: readonly BabelNode[],
  includeFunctions: boolean,
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const value of values) {
    const declaration = unwrapExportDeclaration(value);
    if (
      declaration.type === "VariableDeclaration" &&
      (declaration.kind === "const" || declaration.kind === "let")
    ) {
      for (const declarator of nodes(declaration.declarations)) {
        const pattern = node(declarator.id);
        if (pattern == null) continue;
        for (const name of rawPatternNames(pattern)) names.add(name);
      }
    } else if (includeFunctions && declaration.type === "FunctionDeclaration") {
      const identifier = node(declaration.id);
      const name = identifier == null ? undefined : identifierName(identifier);
      if (name != null) names.add(name);
    }
  }
  return names;
}

function varScopedFunctionNames(
  values: readonly BabelNode[],
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const value of values) {
    const declaration = unwrapExportDeclaration(value);
    if (declaration.type !== "FunctionDeclaration") continue;
    const identifier = node(declaration.id);
    const name = identifier == null ? undefined : identifierName(identifier);
    if (name != null) names.add(name);
  }
  return names;
}

function collectVarStatement(
  context: ConvertContext,
  value: BabelNode,
  lexicalFrames: readonly ReadonlySet<string>[],
  catchParameters: ReadonlySet<string>,
  collected: Map<string, HoistedVar>,
  blockFunctions: Set<string>,
): boolean {
  if (value.type === "VariableDeclaration" && value.kind === "var") {
    if (value.declare === true) return true;
    for (const declarator of nodes(value.declarations)) {
      const identifier = node(declarator.id);
      const name = identifier == null ? undefined : identifierName(identifier);
      let names: readonly string[];
      if (identifier == null) {
        unsupported(context, declarator, "var destructuring is unsupported.");
        return false;
      } else if (name != null) {
        names = [name];
      } else if (
        identifier.type === "ArrayPattern" ||
        identifier.type === "ObjectPattern"
      ) {
        const pattern = bindingPattern(context, identifier);
        if (pattern == null) return false;
        names = patternNames(pattern);
      } else {
        unsupported(context, declarator, "var destructuring is unsupported.");
        return false;
      }
      for (const bindingName of names) {
        if (catchParameters.has(bindingName)) {
          unsupported(
            context,
            declarator,
            "A var declaration sharing a catch parameter name is outside " +
              "the admitted profile.",
          );
          return false;
        }
        if (lexicalFrames.some((frame) => frame.has(bindingName))) {
          unsupported(
            context,
            declarator,
            `Cannot redeclare lexical binding '${bindingName}' with var.`,
          );
          return false;
        }
        if (!collected.has(bindingName)) {
          collected.set(bindingName, {
            ...location(context, declarator),
            declarator,
            hint:
              identifier.type === "Identifier"
                ? typeHint(context, identifier.typeAnnotation)
                : undefined,
          });
        }
      }
    }
    return true;
  }
  if (value.type === "BlockStatement") {
    const children = nodes(value.body);
    for (const name of varScopedFunctionNames(children)) {
      blockFunctions.add(name);
    }
    const frames = [...lexicalFrames, gatherLexicalNames(children, true)];
    return children.every((child) =>
      collectVarStatement(
        context,
        child,
        frames,
        catchParameters,
        collected,
        blockFunctions,
      ),
    );
  }
  if (value.type === "IfStatement") {
    const consequent = node(value.consequent);
    const alternate = node(value.alternate);
    for (const branch of [consequent, alternate]) {
      if (
        branch != null &&
        !collectVarStatement(
          context,
          branch,
          lexicalFrames,
          catchParameters,
          collected,
          blockFunctions,
        )
      ) {
        return false;
      }
    }
    return true;
  }
  if (
    value.type === "WhileStatement" ||
    value.type === "DoWhileStatement" ||
    value.type === "LabeledStatement"
  ) {
    const body = node(value.body);
    return (
      body == null ||
      collectVarStatement(
        context,
        body,
        lexicalFrames,
        catchParameters,
        collected,
        blockFunctions,
      )
    );
  }
  if (value.type === "ForStatement" || value.type === "ForOfStatement") {
    const initNode = node(
      value.type === "ForStatement" ? value.init : value.left,
    );
    let bodyFrames = lexicalFrames;
    if (initNode?.type === "VariableDeclaration") {
      if (initNode.kind === "var") {
        if (
          !collectVarStatement(
            context,
            initNode,
            lexicalFrames,
            catchParameters,
            collected,
            blockFunctions,
          )
        ) {
          return false;
        }
      } else {
        bodyFrames = [...lexicalFrames, gatherLexicalNames([initNode], false)];
      }
    }
    const body = node(value.body);
    return (
      body == null ||
      collectVarStatement(
        context,
        body,
        bodyFrames,
        catchParameters,
        collected,
        blockFunctions,
      )
    );
  }
  if (value.type === "SwitchStatement") {
    const caseBodies = nodes(value.cases).flatMap((caseNode) =>
      nodes(caseNode.consequent),
    );
    const frames = [...lexicalFrames, gatherLexicalNames(caseBodies, true)];
    return caseBodies.every((child) =>
      collectVarStatement(
        context,
        child,
        frames,
        catchParameters,
        collected,
        blockFunctions,
      ),
    );
  }
  if (value.type === "TryStatement") {
    const block = node(value.block);
    if (
      block != null &&
      !collectVarStatement(
        context,
        block,
        lexicalFrames,
        catchParameters,
        collected,
        blockFunctions,
      )
    ) {
      return false;
    }
    const handler = node(value.handler);
    if (handler != null) {
      const parameter = node(handler.param);
      const handlerBody = node(handler.body);
      const handlerCatch =
        parameter == null
          ? catchParameters
          : new Set([...catchParameters, ...rawPatternNames(parameter)]);
      if (
        handlerBody != null &&
        !collectVarStatement(
          context,
          handlerBody,
          lexicalFrames,
          handlerCatch,
          collected,
          blockFunctions,
        )
      ) {
        return false;
      }
    }
    const finalizer = node(value.finalizer);
    if (
      finalizer != null &&
      !collectVarStatement(
        context,
        finalizer,
        lexicalFrames,
        catchParameters,
        collected,
        blockFunctions,
      )
    ) {
      return false;
    }
    return true;
  }
  return true;
}

/**
 * Hoist the function-scoped var declarations of one function, script, or
 * module body into initialized bindings. In-place var statements become
 * ordinary assignments, so the pair preserves var semantics for the
 * admitted profile without a separate binding kind. Names owned by
 * parameters or var-scoped function declarations are skipped so bare
 * redeclarations do not reset them.
 */
function hoistedVarDeclarations(
  context: ConvertContext,
  values: readonly BabelNode[],
  skipNames: ReadonlySet<string>,
): SyntaxStatement[] | undefined {
  const collected = new Map<string, HoistedVar>();
  const blockFunctions = new Set<string>();
  const rootLexical = gatherLexicalNames(values, false);
  const complete = values.every((value) =>
    collectVarStatement(
      context,
      unwrapExportDeclaration(value),
      [rootLexical],
      new Set<string>(),
      collected,
      blockFunctions,
    ),
  );
  if (!complete) return undefined;
  const hoisted: SyntaxStatement[] = [];
  for (const [name, info] of collected) {
    if (blockFunctions.has(name)) {
      // Annex B function hoisting would make this observable; reject it
      // instead of silently diverging from web-engine behavior.
      return unsupported(
        context,
        info.declarator,
        `A var declaration sharing the block-level function name ` +
          `'${name}' is outside the admitted profile.`,
      );
    }
    if (skipNames.has(name)) continue;
    hoisted.push({
      // A zero-width leading byte range keeps hoisted bindings ahead of
      // every source-ordered statement when module lowering sorts by
      // byte offset.
      byteRange: { end: 0, start: 0 },
      hint: info.hint,
      initializer: undefinedExpression(info.range),
      kind: "let",
      name,
      range: info.range,
    });
  }
  return hoisted;
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
  const arrowExpressionBody =
    value.type === "ArrowFunctionExpression" &&
    bodyNode?.type !== "BlockStatement";
  if (
    (requireName && name == null) ||
    (bodyNode?.type !== "BlockStatement" && !arrowExpressionBody)
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
  // Arrows do not provide their own receiver, so this stays admitted
  // inside one only when an enclosing non-arrow function provides it.
  context.functionStack.push(
    value.type === "ArrowFunctionExpression"
      ? context.functionStack.at(-1) === true
      : true,
  );
  const children =
    arrowExpressionBody && bodyNode != null
      ? [
          {
            argument: bodyNode,
            ...(bodyNode.end == null ? {} : { end: bodyNode.end }),
            ...(bodyNode.start == null ? {} : { start: bodyNode.start }),
            type: "ReturnStatement",
          } satisfies BabelNode,
        ]
      : nodes(bodyNode?.body);
  const hoisted = hoistedVarDeclarations(
    context,
    children,
    new Set([
      ...parameters.map((parameter) => parameter.name),
      ...varScopedFunctionNames(children),
    ]),
  );
  if (hoisted == null) {
    context.functionStack.pop();
    context.strictStack.pop();
    return undefined;
  }
  if (value.async === true) {
    if (!validateAsyncContinuationCount(context, children)) {
      context.functionStack.pop();
      context.strictStack.pop();
      return undefined;
    }
    const executionBody = asyncStatementList(context, children, "executor");
    if (executionBody != null) {
      const range = location(context, value).range;
      const execution = syntheticFunction(
        context,
        range,
        [],
        [...hoisted, ...executionBody],
      );
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
    body.push(...hoisted);
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
  const items = nodes(programNode.body);
  const hoisted = hoistedVarDeclarations(
    context,
    items,
    varScopedFunctionNames(items),
  );
  if (hoisted == null) {
    context.strictStack.pop();
    return undefined;
  }
  body.push(...hoisted);
  for (const item of items) {
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
): readonly SyntaxExportEntry[] | undefined {
  if (
    declaration.kind === "binding-pattern" &&
    declaration.declarationKind !== "var"
  ) {
    return patternNames(declaration.pattern).map((name) => ({
      exportedName: name,
      kind: "local",
      localName: name,
      range: declaration.range,
    }));
  }
  if (
    declaration.kind !== "const" &&
    declaration.kind !== "let" &&
    declaration.kind !== "function"
  ) {
    return undefined;
  }
  if (declaration.name == null) return undefined;
  return [
    {
      exportedName: declaration.name,
      kind: "local",
      localName: declaration.name,
      range: declaration.range,
    },
  ];
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
  const moduleItems = nodes(programNode.body);
  const hoisted = hoistedVarDeclarations(
    context,
    moduleItems,
    varScopedFunctionNames(moduleItems),
  );
  if (hoisted == null) {
    context.strictStack.pop();
    return undefined;
  }
  body.push(...hoisted);
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
        const exportEntries = exportForDeclaration(converted);
        if (exportEntries == null) {
          unsupported(context, declarationNode, "This export is unsupported.");
          break;
        }
        body.push(converted);
        exports.push(...exportEntries);
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
  // Duplicate exported names are an ECMAScript early error, so they are
  // reported as an entry parse failure rather than a link failure.
  const seenExports = new Set<string>();
  for (const entry of exports) {
    if (entry.kind === "star") continue;
    if (seenExports.has(entry.exportedName)) {
      context.diagnostics.push({
        byteRange: entry.byteRange ?? { end: 0, start: 0 },
        code: "OSEO0001",
        message: `Duplicate export '${entry.exportedName}'.`,
        range: entry.range,
        sourceId: context.input.sourceId,
      });
      return undefined;
    }
    seenExports.add(entry.exportedName);
  }
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
