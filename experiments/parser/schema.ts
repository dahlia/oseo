/** A one-based source position with its corresponding UTF-8 byte offset. */
export interface OwnedPosition {
  readonly byte: number;
  readonly line: number;
  readonly column: number;
}

/** A half-open source range owned by Oseo rather than a parser package. */
export interface OwnedRange {
  readonly start: OwnedPosition;
  readonly end: OwnedPosition;
}

/** Stable diagnostic classes exercised by the M0 parser probe. */
export type DiagnosticCode = "OSEO0001" | "OSEO1001";

/**
 * A parser-independent diagnostic safe to return across the frontend boundary.
 */
export interface OwnedDiagnostic {
  readonly code: DiagnosticCode;
  readonly sourceId: string;
  readonly range: OwnedRange;
  readonly message: string;
  readonly notes?: readonly string[];
}

/** A normalized function parameter and its optional syntax-level hint. */
export interface OwnedParameter {
  readonly name: string;
  readonly range: OwnedRange;
  readonly typeHint?: string;
}

/** The function-declaration subset represented by the parser probe. */
export interface OwnedFunctionDeclaration {
  readonly kind: "function-declaration";
  readonly name: string;
  readonly range: OwnedRange;
  readonly parameters: readonly OwnedParameter[];
  readonly bodyKinds: readonly string[];
  readonly jsdoc?: string;
}

/** The lexical-declaration subset represented by the parser probe. */
export interface OwnedVariableDeclaration {
  readonly kind: "variable-declaration";
  readonly declarationKind: "const" | "let";
  readonly names: readonly string[];
  readonly range: OwnedRange;
}

/** A normalized top-level expression statement. */
export interface OwnedExpressionStatement {
  readonly kind: "expression-statement";
  readonly expressionKind: string;
  readonly range: OwnedRange;
}

/** Every statement shape allowed to cross the probe's owned-syntax boundary. */
export type OwnedStatement =
  | OwnedFunctionDeclaration
  | OwnedVariableDeclaration
  | OwnedExpressionStatement;

/** A parser-independent source comment. */
export interface OwnedComment {
  readonly kind: "line" | "block";
  readonly text: string;
  readonly range: OwnedRange;
}

/** A coarse token category retained without exposing parser token objects. */
export interface OwnedToken {
  readonly kind: string;
  readonly range: OwnedRange;
}

/** The complete parser-independent observation for one source fixture. */
export interface OwnedFile {
  readonly sourceId: string;
  readonly sourceBytes: number;
  readonly lineEnding: "lf" | "crlf";
  readonly statements: readonly OwnedStatement[];
  readonly comments: readonly OwnedComment[];
  readonly tokens: readonly OwnedToken[];
  readonly diagnostics: readonly OwnedDiagnostic[];
}

interface ParserPosition {
  readonly line: number;
  readonly column: number;
}

interface ParserLocation {
  readonly start: ParserPosition;
  readonly end: ParserPosition;
}

/** The minimal parser-node surface accepted by owned range conversion. */
interface ParserNode {
  readonly start: number;
  readonly end: number;
  readonly loc?: ParserLocation | null;
}

interface SyntaxKindMap {
  readonly [parserType: string]: string | undefined;
}

const encoder = new TextEncoder();
const syntaxKinds: SyntaxKindMap = {
  ArrowFunctionExpression: "arrow-function",
  BinaryExpression: "binary-expression",
  BlockStatement: "block",
  CallExpression: "call-expression",
  ConditionalExpression: "conditional-expression",
  ExpressionStatement: "expression-statement",
  FunctionDeclaration: "function-declaration",
  Identifier: "identifier",
  MemberExpression: "member-expression",
  NumericLiteral: "numeric-literal",
  Literal: "literal",
  ReturnStatement: "return-statement",
  StringLiteral: "string-literal",
  VariableDeclaration: "variable-declaration",
};

function positionAt(source: string, offset: number): OwnedPosition {
  const prefix = source.slice(0, offset);
  const lines = prefix.split(/\r\n|\n|\r/u);
  return {
    byte: encoder.encode(prefix).byteLength,
    line: lines.length,
    column: Array.from(lines.at(-1) ?? "").length + 1,
  };
}

/** Convert a parser node range to Oseo's byte and scalar-value coordinates. */
export function rangeOf(source: string, node: ParserNode): OwnedRange {
  return {
    start: positionAt(source, node.start),
    end: positionAt(source, node.end),
  };
}

/** Create a zero-width owned range at a clamped source offset. */
export function emptyRange(source: string, offset: number): OwnedRange {
  const position = positionAt(
    source,
    Math.max(0, Math.min(source.length, offset)),
  );
  return { start: position, end: position };
}

/** Measure source text using the UTF-8 byte convention used by diagnostics. */
export function sourceByteLength(source: string): number {
  return encoder.encode(source).byteLength;
}

/** Normalize retained comment and annotation text across line-ending styles. */
export function normalizeText(text: string): string {
  return text.replace(/\r\n?/gu, "\n").trim();
}

/**
 * Map candidate AST names to the small syntax vocabulary owned by the probe.
 */
export function syntaxKind(type: string): string {
  return syntaxKinds[type] ?? "unsupported-syntax";
}
