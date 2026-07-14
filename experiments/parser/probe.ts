import { parse as parseBabel } from "@babel/parser";
import * as acorn from "acorn";
import { tsPlugin } from "acorn-typescript";

import { corpus } from "./corpus.ts";
import {
  type DiagnosticCode,
  emptyRange,
  normalizeText,
  type OwnedComment,
  type OwnedDiagnostic,
  type OwnedFile,
  type OwnedParameter,
  type OwnedStatement,
  type OwnedToken,
  rangeOf,
  sourceByteLength,
  syntaxKind,
} from "./schema.ts";

interface AnyDeclaration {
  readonly id?: AnyNode;
  readonly init?: AnyNode;
}

interface AnyNodeBody {
  readonly body?: readonly AnyNode[];
}

/** A candidate AST view that must not escape parser normalization. */
interface AnyNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly name?: string;
  readonly id?: AnyNode | null;
  readonly params?: readonly AnyNode[];
  readonly body?: AnyNode | AnyNodeBody;
  readonly declarations?: readonly AnyDeclaration[];
  readonly kind?: string;
  readonly expression?: AnyNode;
  readonly typeAnnotation?: AnyNode | null;
  readonly leadingComments?: readonly AnyComment[];
}

interface AnyComment {
  readonly type: string;
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

interface TokenLabel {
  readonly label?: string;
}

interface AnyToken {
  readonly type: string | TokenLabel;
  readonly start: number;
  readonly end: number;
}

interface ParserError {
  readonly message: string;
  readonly pos?: number;
  readonly position?: number;
}

/** Candidate data retained only until it becomes an owned probe observation. */
interface Parsed {
  readonly body: readonly AnyNode[];
  readonly comments: readonly AnyComment[];
  readonly tokens: readonly AnyToken[];
  readonly errors: readonly ParserError[];
}

interface BabelFile {
  readonly program: ProgramNode;
  readonly comments?: readonly AnyComment[];
  readonly tokens?: readonly AnyToken[];
  readonly errors?: readonly ParserError[];
}

interface ProgramNode {
  readonly body: readonly AnyNode[];
}

interface ThrownParserError {
  readonly message?: string;
  readonly pos?: number;
  readonly raisedAt?: number;
}

/** Parser implementations compared by the M0 probe. */
type ParserCandidate = "babel" | "acorn";

function diagnostic(
  sourceId: string,
  source: string,
  code: DiagnosticCode,
  offset: number,
  message: string,
): OwnedDiagnostic {
  return { code, sourceId, range: emptyRange(source, offset), message };
}

function typeHint(source: string, parameter: AnyNode): string | undefined {
  const annotation = parameter.typeAnnotation;
  if (annotation == null) return undefined;
  return normalizeText(source.slice(annotation.start + 1, annotation.end));
}

function normalizeParameter(
  source: string,
  parameter: AnyNode,
): OwnedParameter {
  const hint = typeHint(source, parameter);
  return {
    name: parameter.name ?? "<unsupported>",
    range: rangeOf(source, parameter),
    ...(hint == null ? {} : { typeHint: hint }),
  };
}

function ownedStatement(
  source: string,
  node: AnyNode,
): OwnedStatement | undefined {
  if (node.type === "FunctionDeclaration") {
    const block = node.body as AnyNodeBody;
    const jsdoc = node.leadingComments?.find(
      (comment) =>
        comment.type.includes("Block") &&
        comment.value.trimStart().startsWith("*"),
    );
    return {
      kind: "function-declaration",
      name: node.id?.name ?? "<anonymous>",
      range: rangeOf(source, node),
      parameters: (node.params ?? []).map((parameter) =>
        normalizeParameter(source, parameter),
      ),
      bodyKinds: (block.body ?? []).map((statement) =>
        syntaxKind(statement.type),
      ),
      ...(jsdoc == null ? {} : { jsdoc: normalizeText(jsdoc.value) }),
    };
  }
  if (
    node.type === "VariableDeclaration" &&
    (node.kind === "const" || node.kind === "let")
  ) {
    return {
      kind: "variable-declaration",
      declarationKind: node.kind,
      names: (node.declarations ?? []).map(
        (entry) => entry.id?.name ?? "<unsupported>",
      ),
      range: rangeOf(source, node),
    };
  }
  if (node.type === "ExpressionStatement") {
    return {
      kind: "expression-statement",
      expressionKind: syntaxKind(node.expression?.type ?? ""),
      range: rangeOf(source, node),
    };
  }
  return undefined;
}

function normalizeComments(
  source: string,
  comments: readonly AnyComment[],
): readonly OwnedComment[] {
  return comments.map((comment) => ({
    kind: comment.type.includes("Line") ? "line" : "block",
    text: normalizeText(comment.value),
    range: rangeOf(source, comment),
  }));
}

function normalizeTokens(
  source: string,
  tokens: readonly AnyToken[],
): readonly OwnedToken[] {
  return tokens.map((token) => {
    const raw =
      typeof token.type === "string"
        ? token.type
        : (token.type.label ?? "unknown");
    return { kind: tokenKind(raw), range: rangeOf(source, token) };
  });
}

const keywordTokens: ReadonlySet<string> = new Set([
  "const",
  "else",
  "false",
  "function",
  "if",
  "let",
  "null",
  "return",
  "true",
]);

function tokenKind(raw: string): string {
  if (raw === "name") return "identifier";
  if (raw === "num") return "number";
  if (raw === "string") return "string";
  if (raw === "eof") return "end-of-file";
  if (raw.startsWith("Comment")) return "comment";
  if (keywordTokens.has(raw)) return "keyword";
  return "punctuator";
}

function parseWithBabel(source: string): Parsed {
  const file = parseBabel(source, {
    sourceType: "module",
    plugins: ["typescript"],
    attachComment: true,
    errorRecovery: true,
    tokens: true,
  }) as unknown as BabelFile;
  return {
    body: file.program.body,
    comments: file.comments ?? [],
    tokens: file.tokens ?? [],
    errors: file.errors ?? [],
  };
}

function parseWithAcorn(source: string): Parsed {
  const comments: acorn.Comment[] = [];
  const tokens: acorn.Token[] = [];
  const plugin = tsPlugin() as unknown as (
    base: typeof acorn.Parser,
  ) => typeof acorn.Parser;
  const Parser = acorn.Parser.extend(plugin);
  const program = Parser.parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    locations: true,
    onComment: comments,
    onToken: tokens,
  }) as unknown as ProgramNode;
  return {
    body: program.body,
    comments: comments as unknown as readonly AnyComment[],
    tokens: tokens as unknown as readonly AnyToken[],
    errors: [],
  };
}

/** Convert all candidate-specific data for one fixture to the owned schema. */
function normalizeFile(
  candidate: ParserCandidate,
  sourceId: string,
  source: string,
): OwnedFile {
  let parsed: Parsed;
  try {
    parsed =
      candidate === "babel" ? parseWithBabel(source) : parseWithAcorn(source);
  } catch (error) {
    const value = error as ThrownParserError;
    return {
      sourceId,
      sourceBytes: sourceByteLength(source),
      lineEnding: source.includes("\r\n") ? "crlf" : "lf",
      statements: [],
      comments: [],
      tokens: [],
      diagnostics: [
        diagnostic(
          sourceId,
          source,
          "OSEO0001",
          value.pos ?? value.raisedAt ?? 0,
          "Source could not be parsed.",
        ),
      ],
    };
  }

  const statements: readonly OwnedStatement[] = parsed.body.flatMap(
    (node): readonly OwnedStatement[] => {
      const statement = ownedStatement(source, node);
      return statement == null ? [] : [statement];
    },
  );
  const diagnostics: OwnedDiagnostic[] = parsed.errors.map((error) =>
    diagnostic(
      sourceId,
      source,
      "OSEO0001",
      error.pos ?? error.position ?? 0,
      "Source could not be parsed.",
    ),
  );
  for (const node of parsed.body) {
    if (node.type === "VariableDeclaration") {
      const initializer = node.declarations?.[0]?.init;
      if (initializer?.type === "ArrowFunctionExpression") {
        diagnostics.push(
          diagnostic(
            sourceId,
            source,
            "OSEO1001",
            initializer.start,
            "Arrow functions are outside the M1 language profile.",
          ),
        );
      }
    }
  }

  return {
    sourceId,
    sourceBytes: sourceByteLength(source),
    lineEnding: source.includes("\r\n") ? "crlf" : "lf",
    statements,
    comments: normalizeComments(source, parsed.comments),
    tokens: normalizeTokens(source, parsed.tokens),
    diagnostics,
  };
}

const requestedCandidate =
  globalThis.process?.argv[2] ?? globalThis.Deno?.args[0] ?? "babel";
if (requestedCandidate !== "babel" && requestedCandidate !== "acorn") {
  throw new Error(`unknown parser candidate: ${requestedCandidate}`);
}
const candidate: ParserCandidate = requestedCandidate;

const result: readonly OwnedFile[] = corpus.map((entry) =>
  normalizeFile(candidate, entry.id, entry.source),
);
console.log(JSON.stringify(result, null, 2));
