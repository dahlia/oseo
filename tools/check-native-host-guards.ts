import { parse as parseBabel } from "@babel/parser";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import type { StructuredDataValue } from "./structured-data.ts";
import { isBoolean, isNumber, isObject, isString } from "./value-kinds.ts";

const nativeHelpers = new Set(["runNativeCli", "withNativeFixture"]);
const skipReason = "requires a supported native host";

interface SyntaxNode {
  readonly [key: string]: StructuredDataValue | undefined;
  readonly type?: StructuredDataValue;
}

/** One native property test that lacks its unsupported-host skip. */
export interface NativeHostGuardProblem {
  readonly line: number;
  readonly path: string;
  readonly testName: string;
}

function syntaxNode<Candidate>(value: Candidate): SyntaxNode | undefined {
  if (!isObject(value) || Array.isArray(value)) return undefined;
  // SAFETY: Babel syntax nodes are open records with structured values.
  return value as SyntaxNode;
}

function childNodes(value: SyntaxNode): readonly StructuredDataValue[] {
  return Object.values(value).filter(
    (child): child is StructuredDataValue => child !== undefined,
  );
}

function walk<Candidate>(
  value: Candidate,
  visit: (node: SyntaxNode) => void,
): void {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit);
    return;
  }
  const node = syntaxNode(value);
  if (node == null) return;
  visit(node);
  for (const child of childNodes(node)) walk(child, visit);
}

function identifierName<Candidate>(value: Candidate): string | undefined {
  const node = syntaxNode(value);
  return node?.type === "Identifier" && isString(node.name)
    ? node.name
    : undefined;
}

function stringValue<Candidate>(value: Candidate): string | undefined {
  const node = syntaxNode(value);
  return node?.type === "StringLiteral" && isString(node.value)
    ? node.value
    : undefined;
}

function argumentsOf(node: SyntaxNode): readonly StructuredDataValue[] {
  return Array.isArray(node.arguments) ? node.arguments : [];
}

function collectImports(
  syntax: SyntaxNode,
): readonly [ReadonlySet<string>, ReadonlySet<string>] {
  const helpers = new Set<string>();
  const testFunctions = new Set<string>();
  walk(syntax, (node) => {
    if (node.type !== "ImportDeclaration") return;
    const source = stringValue(node.source);
    const specifiers = Array.isArray(node.specifiers) ? node.specifiers : [];
    for (const value of specifiers) {
      const specifier = syntaxNode(value);
      if (specifier == null) continue;
      const local = identifierName(specifier.local);
      if (local == null) continue;
      if (
        specifier.type === "ImportSpecifier" &&
        nativeHelpers.has(identifierName(specifier.imported) ?? "")
      ) {
        helpers.add(local);
      }
      if (
        source === "node:test" &&
        (specifier.type === "ImportDefaultSpecifier" ||
          identifierName(specifier.imported) === "test")
      ) {
        testFunctions.add(local);
      }
    }
  });
  return [helpers, testFunctions];
}

/**
 * Names bound to the result of `targetForExecutionHost`.
 *
 * A guard is only a host guard if it inspects the selected target. Comparing
 * some other identifier against a nullish value has the same shape and never
 * fires, so the callback would still reach native execution on an unsupported
 * host.
 */
function collectTargetBindings(syntax: SyntaxNode): ReadonlySet<string> {
  const bindings = new Set<string>();
  walk(syntax, (node) => {
    if (node.type !== "VariableDeclarator") return;
    const name = identifierName(node.id);
    const initializer = syntaxNode(node.init);
    if (
      name != null &&
      initializer?.type === "CallExpression" &&
      identifierName(initializer.callee) === "targetForExecutionHost"
    ) {
      bindings.add(name);
    }
  });
  return bindings;
}

function collectLocalFunctions(
  syntax: SyntaxNode,
): ReadonlyMap<string, SyntaxNode> {
  const functions = new Map<string, SyntaxNode>();
  walk(syntax, (node) => {
    if (node.type === "FunctionDeclaration") {
      const name = identifierName(node.id);
      if (name != null) functions.set(name, node);
      return;
    }
    if (node.type !== "VariableDeclarator") return;
    const name = identifierName(node.id);
    const initializer = syntaxNode(node.init);
    if (
      name != null &&
      (initializer?.type === "ArrowFunctionExpression" ||
        initializer?.type === "FunctionExpression")
    ) {
      functions.set(name, initializer);
    }
  });
  return functions;
}

function reachesNativeHelper<Candidate>(
  value: Candidate,
  helpers: ReadonlySet<string>,
  functions: ReadonlyMap<string, SyntaxNode>,
  active: ReadonlySet<string> = new Set(),
): boolean {
  if (Array.isArray(value)) {
    return value.some((child) =>
      reachesNativeHelper(child, helpers, functions, active),
    );
  }
  const node = syntaxNode(value);
  if (node == null) return false;
  const name = identifierName(node);
  if (name != null && helpers.has(name)) return true;
  if (name != null && !active.has(name)) {
    const called = functions.get(name);
    if (called != null) {
      const nextActive = new Set(active);
      nextActive.add(name);
      if (reachesNativeHelper(called, helpers, functions, nextActive)) {
        return true;
      }
    }
  }
  return childNodes(node).some((child) =>
    reachesNativeHelper(child, helpers, functions, active),
  );
}

function nullishOperandKind<Candidate>(
  value: Candidate,
): "null" | "undefined" | undefined {
  if (syntaxNode(value)?.type === "NullLiteral") return "null";
  if (identifierName(value) === "undefined") return "undefined";
  return undefined;
}

/**
 * Whether a test compares the selected target against a nullish value in a
 * way that actually fires on an unsupported host.
 *
 * `targetForExecutionHost` returns `undefined` and never `null`, so a strict
 * comparison against `null` is always false and its skip never runs. Accepting
 * one here would pass a guard that still executes native work on Windows,
 * which is the failure this check exists to catch.
 */
function isNullishTargetCheck<Candidate>(
  value: Candidate,
  targets: ReadonlySet<string>,
): boolean {
  const node = syntaxNode(value);
  if (
    node?.type !== "BinaryExpression" ||
    (node.operator !== "==" && node.operator !== "===")
  ) {
    return false;
  }
  const leftKind = nullishOperandKind(node.left);
  const rightKind = nullishOperandKind(node.right);
  if ((leftKind == null) === (rightKind == null)) return false;
  const kind = leftKind ?? rightKind;
  const targetName =
    leftKind == null ? identifierName(node.left) : identifierName(node.right);
  if (targetName == null || !targets.has(targetName)) return false;
  return node.operator === "==" || kind === "undefined";
}

function isUnsupportedHostSkip<Candidate>(
  value: Candidate,
  targets: ReadonlySet<string>,
): boolean {
  const node = syntaxNode(value);
  if (node?.type !== "ConditionalExpression") return false;
  const alternate = syntaxNode(node.alternate);
  return (
    isNullishTargetCheck(node.test, targets) &&
    stringValue(node.consequent) === skipReason &&
    alternate?.type === "BooleanLiteral" &&
    isBoolean(alternate.value) &&
    !alternate.value
  );
}

function hasUnsupportedHostGuard(
  node: SyntaxNode,
  targets: ReadonlySet<string>,
): boolean {
  const options = syntaxNode(argumentsOf(node)[1]);
  if (options?.type !== "ObjectExpression") return false;
  const properties = Array.isArray(options.properties)
    ? options.properties
    : [];
  return properties.some((value) => {
    const property = syntaxNode(value);
    return (
      property?.type === "ObjectProperty" &&
      (identifierName(property.key) === "skip" ||
        stringValue(property.key) === "skip") &&
      isUnsupportedHostSkip(property.value, targets)
    );
  });
}

function testName(node: SyntaxNode): string {
  const first = argumentsOf(node)[0];
  const literal = stringValue(first);
  if (literal != null) return literal;
  return identifierName(first) ?? "<nonliteral test name>";
}

function nodeLine(node: SyntaxNode): number {
  const location = syntaxNode(node.loc);
  const start = syntaxNode(location?.start);
  return isNumber(start?.line) ? start.line : 1;
}

/** Check one property test source for unsupported-native-host guards. */
export function checkNativeHostGuardSource(
  path: string,
  source: string,
): readonly NativeHostGuardProblem[] {
  const parsed = parseBabel(source, {
    plugins: ["typescript"],
    sourceFilename: path,
    sourceType: "module",
  });
  const syntax = syntaxNode(parsed);
  if (syntax == null) return [];
  const [helpers, testFunctions] = collectImports(syntax);
  if (helpers.size === 0 || testFunctions.size === 0) return [];
  const functions = collectLocalFunctions(syntax);
  const targets = collectTargetBindings(syntax);
  const problems: NativeHostGuardProblem[] = [];
  walk(syntax, (node) => {
    if (
      node.type !== "CallExpression" ||
      !testFunctions.has(identifierName(node.callee) ?? "") ||
      !reachesNativeHelper(argumentsOf(node).slice(1), helpers, functions) ||
      hasUnsupportedHostGuard(node, targets)
    ) {
      return;
    }
    problems.push({
      line: nodeLine(node),
      path,
      testName: testName(node),
    });
  });
  return problems;
}

/** Check every native property test in a repository worktree. */
export async function checkNativeHostGuards(
  root: string,
): Promise<readonly NativeHostGuardProblem[]> {
  const directory = join(root, "tests", "property");
  const entries = await readdir(directory, { withFileTypes: true });
  const propertyEntries = entries
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith(".property.test.ts"),
    )
    .toSorted((left, right) => left.name.localeCompare(right.name));
  const results = await Promise.all(
    propertyEntries.map(async (entry) => {
      const absolutePath = join(directory, entry.name);
      const path = relative(root, absolutePath);
      return checkNativeHostGuardSource(
        path,
        await readFile(absolutePath, "utf8"),
      );
    }),
  );
  return results.flat();
}

/** Format an actionable report for unsupported-native-host guard failures. */
export function formatNativeHostGuardProblems(
  problems: readonly NativeHostGuardProblem[],
): string {
  const details = problems.map(
    (problem) =>
      `${problem.path}:${problem.line}: test ${JSON.stringify(
        problem.testName,
      )} can run native code without an unsupported-host skip.`,
  );
  return [
    ...details,
    "Add this test option:",
    "{ skip: nativeTarget == null ?",
    '  "requires a supported native host" : false }',
  ].join("\n");
}

const entryPath = process.argv[1];
if (entryPath != null && pathToFileURL(entryPath).href === import.meta.url) {
  const problems = await checkNativeHostGuards(process.cwd());
  if (problems.length > 0) {
    throw new Error(formatNativeHostGuardProblems(problems));
  }
  console.log("native-property-host-guards=valid");
}
