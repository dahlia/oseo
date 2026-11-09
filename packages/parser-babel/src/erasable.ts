import type { Diagnostic, SourceInput } from "@oseo/compiler";
import {
  isString,
  node,
  nodes,
  type BabelNode,
  type BabelNodeValue,
} from "./babel.ts";
import { bytes, sourceRange } from "./locations.ts";
import type { SourceIndex } from "./babel.ts";
import { parseWithClassStaticAsi } from "./class-static-asi.ts";
import {
  diagnosticAt,
  earlyErrorDiagnostic,
  errorOffset,
} from "./locations.ts";
import type { ParserError } from "./babel.ts";

const erasedDeclarations = new Set([
  "TSInterfaceDeclaration",
  "TSTypeAliasDeclaration",
  "TSDeclareFunction",
  "TSDeclareMethod",
  "TSIndexSignature",
]);

const expressionWrappers = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSInstantiationExpression",
]);

const erasedFields = new Set([
  "abstract",
  "accessibility",
  "definite",
  "implements",
  "override",
  "readonly",
  "superTypeParameters",
  "superTypeArguments",
  "typeArguments",
  "typeParameters",
]);

/** Erased source retains original offsets for diagnostics and hint ranges. */
interface ErasureResult {
  readonly file: BabelNode;
  readonly source: string;
  readonly diagnostics: readonly Diagnostic[];
  /** Namespace module restrictions do not apply after whole ambient erasure. */
  readonly ambientModuleStarts: ReadonlySet<number>;
  /** Optional binding-pattern parameters validated by the stripped reparse. */
  readonly optionalPatternStarts: ReadonlySet<number>;
  /** Exact runtime reflection text, independent of parsing coordinates. */
  readonly sourceText: (start: number, end: number) => string;
}

/** Mutable adapter-owned copy used only while rebuilding a Babel node. */
interface MutableBabelNode extends BabelNode {
  [key: string]: BabelNodeValue;
}

// Node.js classifies namespace bodies before discarding ambient declarations.
// An ambient value member still makes a non-ambient namespace unsupported.
function typeOnlyNamespace(value: BabelNode): boolean {
  if (value.type === "ExportNamedDeclaration") {
    const declaration = node(value.declaration);
    return declaration != null && typeOnlyNamespace(declaration);
  }
  if (
    value.type === "TSInterfaceDeclaration" ||
    value.type === "TSTypeAliasDeclaration"
  )
    return true;
  if (value.type !== "TSModuleDeclaration") return false;
  if (
    value.kind !== "namespace" &&
    value.kind !== "global" &&
    node(value.id)?.type !== "StringLiteral"
  ) {
    return false;
  }
  const body = node(value.body);
  return body?.type === "TSModuleDeclaration"
    ? typeOnlyNamespace(body)
    : nodes(body?.body).every(typeOnlyNamespace);
}

/**
 * Erase type syntax at the Babel boundary without resolving types. Annotation
 * subtrees remain available only to the existing syntactic hint mapping.
 * Source spans and parentheses stay attached to executable nodes.
 */
export function eraseTypeSyntax(
  input: SourceInput,
  locations: SourceIndex,
  file: BabelNode,
): ErasureResult {
  const diagnostics: Diagnostic[] = [];
  const ambientModuleStarts = new Set<number>();
  const optionalPatternStarts = new Set<number>();
  const spans: (readonly [number, number])[] = [];
  let relationalInstantiation = false;
  let runtimeAngles = false;
  let assertionStart: number | undefined;
  const semicolons = new Set<number>();
  const movedOpeners: (readonly [number, number])[] = [];
  const movedClosers: (readonly [number, number])[] = [];
  let tokens = nodes(file.tokens);
  function remove(value: BabelNode, statement = false): void {
    if (value.start != null && value.end != null) {
      spans.push([value.start, value.end]);
      if (statement) {
        const previous = tokenNear(value.start, -1);
        const next = tokenNear(value.end, 1);
        if (
          previous != null &&
          continuesStatement(next) &&
          /[\n\r\u2028\u2029]/u.test(input.source.slice(value.end, next?.start))
        ) {
          semicolons.add(
            input.source.slice(previous.start, previous.end) === ";"
              ? previous.start!
              : value.start,
          );
        }
      }
    }
  }
  function tokenIndexAt(offset: number): number {
    let low = 0;
    let high = tokens.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((tokens[middle]?.start ?? -1) < offset) low = middle + 1;
      else high = middle;
    }
    return low;
  }
  function tokenNear(offset: number, direction: -1 | 1): BabelNode | undefined {
    let index = tokenIndexAt(offset) + (direction === -1 ? -1 : 0);
    while (
      tokens[index]?.type === "CommentLine" ||
      tokens[index]?.type === "CommentBlock"
    )
      index += direction;
    return tokens[index];
  }
  function relationalContinuation(end: number | undefined): boolean {
    const next = tokenNear(end ?? 0, 1);
    const text = input.source.slice(next?.start, next?.end);
    if (text === "<" && next?.start != null) {
      assertionStart = Math.min(assertionStart ?? Infinity, next.start);
    }
    return ["+", "-", "<"].includes(text);
  }
  function continuesExpression(token: BabelNode | undefined): boolean {
    const first = token?.start == null ? "" : input.source[token.start];
    return first === "(" || first === "[" || first === "`";
  }
  function continuesStatement(token: BabelNode | undefined): boolean {
    const text =
      token == null ? "" : input.source.slice(token.start, token.end);
    return (
      continuesExpression(token) ||
      text === "+" ||
      text === "-" ||
      text.startsWith("/")
    );
  }
  function firstToken(
    start: number,
    end: number,
    names: readonly string[],
  ): BabelNode | undefined {
    for (let index = tokenIndexAt(start); index < tokens.length; index += 1) {
      const token = tokens[index]!;
      if ((token.end ?? Infinity) > end) break;
      if (names.includes(input.source.slice(token.start, token.end)))
        return token;
    }
    return undefined;
  }
  function removeTokens(
    value: {
      readonly start: number | undefined;
      readonly end: number | undefined;
    },
    names: readonly string[],
    firstOnly = false,
  ): void {
    if (names.length === 0) return;
    for (
      let index = tokenIndexAt(value.start ?? 0);
      index < tokens.length;
      index += 1
    ) {
      const token = tokens[index]!;
      if ((token.end ?? Infinity) > (value.end ?? 0)) break;
      if (names.includes(input.source.slice(token.start, token.end))) {
        remove(token);
        if (firstOnly) break;
      }
    }
  }
  function reject(
    value: BabelNode,
    message = "This TypeScript syntax requires runtime transformation.",
  ): BabelNode {
    diagnostics.push({
      byteRange: bytes(locations, value),
      code: "OSEO1001",
      message,
      range: sourceRange(locations, value),
      sourceId: input.sourceId,
    });
    return value;
  }
  /** Recover an assertion read as a relation after an instantiation. */
  function assertionContinuation(): BabelNode | undefined {
    if (assertionStart == null) return undefined;
    const start = assertionStart;
    // Multiplication makes the following < begin an operand, in the original
    // async, generator, private-name and module context. This probe never runs.
    const marker = "*0*";
    const probe =
      input.source.slice(0, start) + marker + input.source.slice(start);
    try {
      const parsed = node(
        parseWithClassStaticAsi(probe, {
          allowImportExportEverywhere: true,
          createParenthesizedExpressions: true,
          errorRecovery: true,
          plugins: ["typescript"],
          sourceType:
            node(file.program)?.sourceType === "module" ? "module" : "script",
          tokens: true,
        }),
      );
      // Existing type-only binding errors are handled by the normal reparse.
      // SAFETY: Babel parser errors expose the optional offsets read here.
      const errors = new Set(
        nodes(file.errors).map(
          (error) => `${error.reasonCode}:${errorOffset(error as ParserError)}`,
        ),
      );
      if (
        nodes(parsed?.errors).some((error) => {
          // SAFETY: Babel parser errors expose optional offsets.
          const offset = errorOffset(error as ParserError);
          const original =
            offset <= start ? offset : Math.max(start, offset - marker.length);
          return !errors.has(`${error.reasonCode}:${original}`);
        })
      )
        return undefined;
      const assertions: BabelNode[] = [];
      function find(value: BabelNode): void {
        if (
          value.type === "TSTypeAssertion" &&
          value.start === start + marker.length
        ) {
          assertions.push(value);
        }
        for (const [key, child] of Object.entries(value)) {
          if (["tokens", "comments", "errors"].includes(key)) continue;
          for (const item of Array.isArray(child) ? child : [child]) {
            const childNode = node(item);
            if (childNode?.type != null) find(childNode);
          }
        }
      }
      if (parsed != null) find(parsed);
      const assertion = assertions[0];
      if (assertion?.start == null || assertion.end == null) return undefined;
      return {
        type: "TSTypeAssertion",
        start: assertion.start - marker.length,
        end: assertion.end - marker.length,
      };
    } catch {
      return undefined;
    }
  }
  function erase(value: BabelNode, statement = false): BabelNode | undefined {
    if (value.type === "ForOfStatement" || value.type === "ForInStatement") {
      for (const declaration of nodes(node(value.left)?.declarations)) {
        const annotation = node(node(declaration.id)?.typeAnnotation);
        if (annotation != null) {
          diagnostics.push(
            earlyErrorDiagnostic(
              input,
              locations,
              annotation,
              "A for-in/of declaration cannot have a type annotation.",
            ),
          );
        }
      }
    }
    if (
      value.declare === true ||
      erasedDeclarations.has(value.type ?? "") ||
      (value.abstract === true &&
        (value.type === "ClassProperty" ||
          value.type === "ClassPrivateProperty" ||
          value.type === "ClassAccessorProperty"))
    ) {
      remove(value, statement);
      return undefined;
    }
    if (value.importKind === "type" || value.exportKind === "type") {
      remove(value, statement);
      return undefined;
    }
    if (expressionWrappers.has(value.type ?? "")) {
      const inner = node(value.expression);
      if (
        value.type === "TSInstantiationExpression" &&
        relationalContinuation(value.end)
      ) {
        // Babel can treat angles before +, -, or < as an instantiation.
        // Node.js parses a relation, including before an unsupported assertion.
        // Keep those tokens for the final JavaScript reparse.
        relationalInstantiation = true;
        return inner == null ? reject(value) : erase(inner);
      }
      if (inner?.end != null && value.end != null) {
        if (
          value.type === "TSAsExpression" ||
          value.type === "TSSatisfiesExpression"
        ) {
          if (continuesExpression(tokenNear(value.end, 1))) {
            const keyword = firstToken(inner.end, value.end, [
              "as",
              "satisfies",
            ]);
            if (keyword?.start != null) semicolons.add(keyword.start);
          }
        }
        spans.push([
          value.type === "TSNonNullExpression" ? value.end - 1 : inner.end,
          value.end,
        ]);
      }
      return inner == null ? reject(value) : erase(inner);
    }
    if (value.type === "TSModuleDeclaration") {
      if (!typeOnlyNamespace(value)) return reject(value);
      remove(value, statement);
      return undefined;
    }
    if (value.type?.startsWith("TS") === true) return reject(value);
    if (nodes(value.decorators).length > 0) return reject(value);
    if (
      (value.type === "ExportNamedDeclaration" ||
        value.type === "ExportDefaultDeclaration") &&
      node(value.declaration) != null
    ) {
      const declaration = erase(node(value.declaration)!);
      if (declaration == null) remove(value, statement);
      return declaration == null ? undefined : { ...value, declaration };
    }
    const specifiers = nodes(value.specifiers);
    if (
      specifiers.some(
        (item) => item.importKind === "type" || item.exportKind === "type",
      )
    ) {
      for (const [index, item] of specifiers.entries()) {
        if (item.importKind !== "type" && item.exportKind !== "type") continue;
        const next = specifiers[index + 1];
        const previous = specifiers[index - 1];
        const sameList = previous?.type === item.type;
        const separator =
          next == null
            ? firstToken(item.end ?? 0, value.end ?? 0, [",", "}"])
            : undefined;
        const trailingComma =
          separator != null &&
          input.source.slice(separator.start, separator.end) === ",";
        spans.push([
          next == null && sameList ? previous!.end! : item.start!,
          next == null
            ? trailingComma
              ? separator!.end!
              : item.end!
            : next.start!,
        ]);
      }
    }
    const elementKey = node(value.key);
    const anonymousClass =
      value.type === "ClassDeclaration" || value.type === "ClassExpression"
        ? firstToken(value.start ?? 0, node(value.body)?.start ?? 0, ["class"])
        : undefined;
    const prefix = {
      start: value.start,
      end:
        elementKey?.start ??
        node(value.id)?.start ??
        anonymousClass?.start ??
        value.start,
    };
    const modifiers = ["abstract", "readonly", "override"].filter(
      (name) => value[name] === true,
    );
    if (isString(value.accessibility)) {
      modifiers.push(value.accessibility);
    }
    removeTokens(prefix, modifiers);
    if (
      (value.optional === true || value.definite === true) &&
      value.type !== "OptionalMemberExpression" &&
      value.type !== "OptionalCallExpression"
    ) {
      if (
        value.optional === true &&
        (value.type === "ObjectPattern" || value.type === "ArrayPattern")
      ) {
        const marker = tokenNear(
          node(value.typeAnnotation)?.start ?? value.end ?? 0,
          -1,
        );
        if (input.source.slice(marker?.start, marker?.end) === "?") {
          remove(marker!);
        }
      } else
        removeTokens(
          {
            start: elementKey?.end ?? value.start,
            end:
              node(value.typeAnnotation)?.start ??
              node(value.value)?.start ??
              value.end,
          },
          [value.optional === true ? "?" : "!"],
          true,
        );
    }
    if (
      value.type === "ClassProperty" &&
      value.computed !== true &&
      elementKey?.type === "Identifier" &&
      ["static", "get", "set"].includes(String(elementKey.name)) &&
      node(value.value) == null
    ) {
      const annotation = node(value.typeAnnotation);
      if (annotation?.start != null) semicolons.add(annotation.start);
    }
    const implemented = nodes(value.implements);
    if (implemented.length > 0) {
      const end = implemented.at(-1)?.end;
      const previous =
        node(value.superTypeArguments ?? value.superTypeParameters) ??
        node(value.superClass) ??
        node(value.typeParameters) ??
        node(value.id);
      const keyword = firstToken(
        previous?.end ?? value.start ?? 0,
        implemented[0]?.start ?? 0,
        ["implements"],
      );
      if (keyword?.start != null && end != null) {
        spans.push([keyword.start, end]);
      }
    }
    const result: Record<string, BabelNodeValue> = {};
    for (const [key, child] of Object.entries(value)) {
      if (erasedFields.has(key)) {
        const type = node(child);
        if (
          value.type === "NewExpression" &&
          (key === "typeArguments" || key === "typeParameters") &&
          type != null &&
          relationalContinuation(type.end)
        ) {
          // Babel moves an unparenthesized callee's type arguments here.
          relationalInstantiation = true;
          continue;
        }
        if (type != null) remove(type);
        if (
          key === "typeParameters" &&
          value.type === "ArrowFunctionExpression" &&
          value.async === true &&
          type?.start != null &&
          type.end != null &&
          /[\n\r\u2028\u2029]/u.test(input.source.slice(type.start, type.end))
        ) {
          const open = tokenNear(type.end, 1);
          if (input.source.slice(open?.start, open?.end) === "(") {
            movedOpeners.push([open!.start!, type.start]);
          }
        }
        continue;
      }
      if (key === "tokens" || key === "comments" || key === "errors") {
        result[key] = child;
        continue;
      }
      // These are type trees, never executable children. Keeping their original
      // nodes also preserves the primitive hint's exact source range.
      if (key === "typeAnnotation" || key === "returnType") {
        const type = node(child);
        if (type != null) remove(type);
        if (
          key === "returnType" &&
          value.type === "ArrowFunctionExpression" &&
          type?.start != null &&
          type.end != null
        ) {
          for (
            let index = tokenIndexAt(type.start) - 1;
            index >= 0;
            index -= 1
          ) {
            const close = tokens[index]!;
            if ((close.start ?? -1) < (value.start ?? 0)) break;
            if (input.source.slice(close.start, close.end) !== ")") continue;
            if (
              /[\n\r\u2028\u2029]/u.test(
                input.source.slice(close.end, type.end),
              )
            ) {
              movedClosers.push([close.start!, type.end - 1]);
            }
            break;
          }
        }
        result[key] = child;
        continue;
      }
      if (
        key === "optional" &&
        (value.type === "Identifier" ||
          value.type === "ClassProperty" ||
          value.type === "ClassPrivateProperty")
      )
        continue;
      if (Array.isArray(child)) {
        result[key] = child.flatMap((item) => {
          const itemNode = node(item);
          if (itemNode?.type == null) return [item];
          if (
            key === "params" &&
            value.kind !== "constructor" &&
            itemNode === child[0] &&
            itemNode.type === "Identifier" &&
            itemNode.name === "this"
          ) {
            const next = node(child[1]);
            const separator = firstToken(
              itemNode.end ?? 0,
              next?.start ?? node(value.body)?.start ?? value.end ?? 0,
              [",", ")"],
            );
            const end =
              separator != null &&
              input.source.slice(separator.start, separator.end) === ","
                ? separator.end!
                : itemNode.end!;
            spans.push([itemNode.start!, end]);
            return [];
          }
          const statementList =
            (key === "body" &&
              ["Program", "BlockStatement", "StaticBlock"].includes(
                value.type ?? "",
              )) ||
            (key === "consequent" && value.type === "SwitchCase");
          const parameter =
            itemNode.type === "AssignmentPattern"
              ? node(itemNode.left)
              : undefined;
          if (key === "params" && parameter?.optional === true) {
            diagnostics.push(
              earlyErrorDiagnostic(
                input,
                locations,
                itemNode,
                "An optional parameter cannot have an initializer.",
              ),
            );
          }
          if (
            key === "params" &&
            itemNode.optional === true &&
            (itemNode.type === "ObjectPattern" ||
              itemNode.type === "ArrayPattern") &&
            itemNode.start != null
          ) {
            optionalPatternStarts.add(itemNode.start);
          }
          const converted = erase(itemNode, statementList);
          return converted == null ? [] : [converted];
        });
      } else {
        const childNode = node(child);
        const converted = childNode?.type == null ? child : erase(childNode);
        if (value.type === "WithStatement" && key === "body") {
          let originalBody = childNode;
          let remainingBody = node(converted);
          while (
            originalBody?.type === "LabeledStatement" &&
            remainingBody?.type === "LabeledStatement"
          ) {
            originalBody = node(originalBody.body);
            remainingBody = node(remainingBody.body);
          }
          if (originalBody != null && remainingBody == null) {
            reject(
              originalBody,
              "A with body cannot be an erased TypeScript declaration.",
            );
          }
        }
        if (
          converted == null &&
          childNode?.declare === true &&
          childNode.start != null &&
          ((value.type === "IfStatement" &&
            (key === "consequent" || key === "alternate")) ||
            (key === "body" &&
              [
                "WhileStatement",
                "DoWhileStatement",
                "ForStatement",
                "ForInStatement",
                "ForOfStatement",
              ].includes(value.type ?? "")))
        ) {
          semicolons.add(childNode.start);
        }
        result[key] = converted;
      }
    }
    return result;
  }
  // Validate ambient module members before whole declarations disappear.
  // Class-field `declare` remains valid even inside an ambient class.
  function validateAmbient(value: BabelNode, ambient = false): void {
    if (
      ambient &&
      [
        "ImportDeclaration",
        "TSImportEqualsDeclaration",
        "ExportNamedDeclaration",
        "ExportDefaultDeclaration",
        "ExportAllDeclaration",
      ].includes(value.type ?? "")
    ) {
      const keyword = firstToken(value.start ?? 0, value.end ?? 0, [
        "import",
        "export",
      ]);
      if (keyword?.start != null) ambientModuleStarts.add(keyword.start);
    }
    if (
      value.type === "ExportNamedDeclaration" ||
      value.type === "ExportDefaultDeclaration"
    ) {
      const declaration = node(value.declaration);
      if (declaration != null) validateAmbient(declaration, ambient);
      return;
    }
    if (ambient && value.declare === true) {
      diagnostics.push(
        earlyErrorDiagnostic(
          input,
          locations,
          value,
          "A declaration in an ambient context cannot repeat declare.",
        ),
      );
    }
    if (value.type === "TSModuleDeclaration") {
      const body = node(value.body);
      const nestedAmbient = ambient || value.declare === true;
      if (body?.type === "TSModuleDeclaration") {
        validateAmbient(body, nestedAmbient);
      } else {
        for (const member of nodes(body?.body)) {
          validateAmbient(member, nestedAmbient);
        }
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (["tokens", "comments", "errors"].includes(key)) continue;
      for (const item of Array.isArray(child) ? child : [child]) {
        const childNode = node(item);
        if (childNode?.type != null) validateAmbient(childNode);
      }
    }
  }
  const continuationGaps: (readonly [number, number])[] = [];
  function findContinuationGaps(value: BabelNode): void {
    if (
      value.type === "BinaryExpression" &&
      ["<", ">"].includes(String(value.operator))
    )
      runtimeAngles = true;
    const end =
      value.type === "TSInstantiationExpression"
        ? value.end
        : value.type === "NewExpression"
          ? node(value.typeArguments ?? value.typeParameters)?.end
          : undefined;
    if (end != null) {
      const next = tokenNear(end, 1);
      if (
        next?.start != null &&
        ["+", "-"].includes(input.source.slice(next.start, next.end)) &&
        /[\n\r\u2028\u2029]/u.test(input.source.slice(end, next.start))
      ) {
        continuationGaps.push([end, next.start]);
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (["tokens", "comments", "errors"].includes(key)) continue;
      for (const item of Array.isArray(child) ? child : [child]) {
        const childNode = node(item);
        if (childNode?.type != null) findContinuationGaps(childNode);
      }
    }
  }
  findContinuationGaps(file);
  if (continuationGaps.length > 0) {
    const probe = input.source.split("");
    for (const [start, end] of continuationGaps) {
      for (let offset = start; offset < end; offset += 1) probe[offset] = " ";
    }
    try {
      // Without the gap's line break, Babel exposes nested runtime erasures.
      // Only parser coordinates come from this probe; output uses input.source.
      const parsed = node(
        parseWithClassStaticAsi(probe.join(""), {
          allowImportExportEverywhere: true,
          attachComment: true,
          createParenthesizedExpressions: true,
          errorRecovery: true,
          plugins: ["typescript"],
          sourceType:
            node(file.program)?.sourceType === "module" ? "module" : "script",
          tokens: true,
        }),
      );
      if (parsed != null) {
        file = parsed;
        tokens = nodes(file.tokens);
      }
    } catch {
      // The original tree and stripped reparse retain malformed-source errors.
    }
    relationalInstantiation = true;
  }
  validateAmbient(file);
  const normalized = erase(file) ?? file;
  // Erasing an inner type must not turn an existing relation into type syntax.
  if (spans.length > 0 && runtimeAngles) relationalInstantiation = true;
  if (
    (spans.length === 0 && !relationalInstantiation) ||
    diagnostics.length > 0
  ) {
    return {
      diagnostics,
      ambientModuleStarts,
      optionalPatternStarts,
      file: normalized,
      source: input.source,
      sourceText: (start, end) => input.source.slice(start, end),
    };
  }
  const assertion = assertionContinuation();
  // Node.js uses whitespace of the same UTF-8 and UTF-16 width. Parsing keeps
  // original UTF-16 coordinates even when an arrow's moved closing paren
  // requires a wider reflected spelling for a final Unicode type name.
  const characters = input.source.split("");
  for (const [start, end] of spans) {
    for (let index = start; index < end; index += 1) {
      if (/\s/u.test(input.source[index] ?? "")) continue;
      const scalar = input.source.codePointAt(index) ?? 0;
      if (scalar > 0xffff) {
        characters[index] = " ";
        characters[index + 1] = "\uFEFF";
        index += 1;
      } else {
        characters[index] =
          scalar < 0x80 ? " " : scalar < 0x800 ? "\u00A0" : "\u2002";
      }
    }
  }
  // TypeScript's inserted semicolons must survive the JavaScript reparse.
  for (const index of semicolons) characters[index] = ";";
  // Node.js moves the opener before erased generic line breaks in async arrows.
  for (const [from, to] of movedOpeners) {
    characters[from] = " ";
    characters[to] = "(";
  }
  const reflectedOverrides = new Map<number, string>();
  for (const [from, to] of movedClosers) {
    characters[from] = " ";
    characters[to] = ")";
    const unit = input.source.charCodeAt(to);
    const start = unit >= 0xdc00 && unit <= 0xdfff ? to - 1 : to;
    const scalar = input.source.codePointAt(start) ?? 0;
    if (scalar > 0x7f) {
      const width = scalar < 0x800 ? 2 : scalar < 0x10000 ? 3 : 4;
      reflectedOverrides.set(start, ")" + " ".repeat(width - 1));
      if (scalar > 0xffff) reflectedOverrides.set(start + 1, "");
    }
  }
  const source = characters.join("");
  function sourceText(start: number, end: number): string {
    if (reflectedOverrides.size === 0) return source.slice(start, end);
    const parts: string[] = [];
    for (let index = start; index < end; index += 1) {
      parts.push(reflectedOverrides.get(index) ?? characters[index] ?? "");
    }
    return parts.join("");
  }
  const annotations = new Map<string, BabelNode>();
  function visit(value: BabelNode, restore: boolean): BabelNode {
    const identity = node(value.body)?.start ?? value.start;
    const id = `${value.type}:${identity}`;
    if (
      !restore &&
      (value.typeAnnotation != null || value.returnType != null)
    ) {
      annotations.set(id, value);
    }
    const result: MutableBabelNode = { ...value };
    for (const [key, child] of Object.entries(value)) {
      if (
        [
          "typeAnnotation",
          "returnType",
          "tokens",
          "comments",
          "errors",
        ].includes(key)
      )
        continue;
      if (Array.isArray(child)) {
        result[key] = child.map((item) => {
          const childNode = node(item);
          return childNode?.type == null ? item : visit(childNode, restore);
        });
      } else {
        const childNode = node(child);
        if (childNode?.type != null) result[key] = visit(childNode, restore);
      }
    }
    const annotation = restore ? annotations.get(id) : undefined;
    if (annotation?.typeAnnotation != null) {
      result.typeAnnotation = annotation.typeAnnotation;
    }
    if (annotation?.returnType != null)
      result.returnType = annotation.returnType;
    return result;
  }
  visit(normalized, false);
  try {
    const stripped = node(
      parseWithClassStaticAsi(source, {
        allowImportExportEverywhere: true,
        attachComment: true,
        createParenthesizedExpressions: true,
        errorRecovery: true,
        plugins: relationalInstantiation ? [] : ["typescript"],
        sourceType:
          node(file.program)?.sourceType === "module" ? "module" : "script",
        tokens: true,
      }),
    );
    if (stripped == null) throw new Error("Babel returned no stripped tree.");
    const errors = Array.isArray(stripped.errors) ? stripped.errors : [];
    // A malformed first relation takes precedence over the assertion.
    // SAFETY: Babel parser errors expose the optional offsets read here.
    if (
      assertion != null &&
      errors.every(
        (error) =>
          errorOffset(error as ParserError) >= (assertion.start ?? Infinity),
      )
    ) {
      reject(assertion);
    } else {
      for (const error of errors) {
        // SAFETY: Babel's error array contains errors with optional offsets.
        diagnostics.push(
          diagnosticAt(input, locations, errorOffset(error as ParserError)),
        );
      }
    }
    return {
      diagnostics,
      ambientModuleStarts,
      optionalPatternStarts,
      file: visit(stripped, true),
      source,
      sourceText,
    };
  } catch (error) {
    // SAFETY: Babel exceptions expose the optional offsets read here.
    const offset = errorOffset(error as ParserError);
    if (assertion != null && offset >= (assertion.start ?? Infinity)) {
      reject(assertion);
    } else diagnostics.push(diagnosticAt(input, locations, offset));
    return {
      diagnostics,
      ambientModuleStarts,
      optionalPatternStarts,
      file: normalized,
      source,
      sourceText,
    };
  }
}
