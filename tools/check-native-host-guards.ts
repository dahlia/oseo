import { parse as parseBabel } from "@babel/parser";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import type { StructuredDataValue } from "./structured-data.ts";
import { isBoolean, isNumber, isObject, isString } from "./value-kinds.ts";

// Keep this list and the build/runner cases in nativeCall in sync with the
// native entry points under tests/. See CONTRIBUTING.md for the rule.
const nativeHelpers = new Set([
  "runNativeFixture",
  "runNativeCli",
  "withNativeFixture",
  "runNativeUnits",
  "prepareHarnessObject",
  "createTest262FragmentExecutor",
  "buildHostCcFixture",
  "buildClockProgram",
  "runClockProbe",
  "runClockScheduler",
  "nativeToolchain",
]);
const processHelpers = new Set([
  "runNativeFixture",
  "spawn",
  "spawnSync",
  "execFile",
  "execFileSync",
]);
const skipReason = "requires a supported native host";

interface SyntaxNode {
  readonly [key: string]: StructuredDataValue | undefined;
  readonly type?: StructuredDataValue;
}

/** One native test that lacks its unsupported-host skip. */
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

function bindingNames<Candidate>(value: Candidate): readonly string[] {
  const node = syntaxNode(value);
  if (node == null) return [];
  const name = identifierName(node);
  if (name != null) return [name];
  if (node.type === "AssignmentPattern") return bindingNames(node.left);
  if (node.type === "RestElement") return bindingNames(node.argument);
  if (node.type === "TSParameterProperty") return bindingNames(node.parameter);
  if (node.type === "ArrayPattern" && Array.isArray(node.elements)) {
    return node.elements.flatMap(bindingNames);
  }
  if (node.type === "ObjectPattern" && Array.isArray(node.properties)) {
    return node.properties.flatMap((property) => {
      const entry = syntaxNode(property);
      return bindingNames(
        entry?.type === "ObjectProperty" ? entry.value : entry,
      );
    });
  }
  return [];
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
): readonly [ReadonlyMap<string, string>, ReadonlySet<string>] {
  const helpers = new Map<string, string>();
  const testFunctions = new Set<string>();
  walk(syntax, (node) => {
    if (node.type !== "ImportDeclaration" || node.importKind === "type") return;
    const source = stringValue(node.source);
    const specifiers = Array.isArray(node.specifiers) ? node.specifiers : [];
    for (const value of specifiers) {
      const specifier = syntaxNode(value);
      if (specifier == null || specifier.importKind === "type") continue;
      const local = identifierName(specifier.local);
      if (local == null) continue;
      if (
        specifier.type === "ImportSpecifier" &&
        (nativeHelpers.has(identifierName(specifier.imported) ?? "") ||
          (source === "node:child_process" &&
            processHelpers.has(identifierName(specifier.imported) ?? "")))
      ) {
        helpers.set(local, identifierName(specifier.imported)!);
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
      ((initializer?.type === "CallExpression" &&
        ["targetForExecutionHost", "hostClockTarget"].includes(
          identifierName(initializer.callee) ?? "",
        )) ||
        isPlatformTarget(initializer))
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
  const collect = (
    value: StructuredDataValue | SyntaxNode | undefined,
  ): void => {
    if (Array.isArray(value)) {
      for (const child of value) collect(child);
      return;
    }
    const node = syntaxNode(value);
    if (node == null) return;
    if (node.type === "FunctionDeclaration") {
      const name = identifierName(node.id);
      if (name != null) functions.set(name, node);
      return;
    }
    if (
      node.type === "ArrowFunctionExpression" ||
      node.type === "FunctionExpression"
    )
      return;
    if (node.type === "VariableDeclarator") {
      const name = identifierName(node.id);
      const initializer = syntaxNode(node.init);
      if (
        name != null &&
        (initializer?.type === "ArrowFunctionExpression" ||
          initializer?.type === "FunctionExpression")
      ) {
        functions.set(name, initializer);
      }
    }
    for (const child of childNodes(node)) collect(child);
  };
  collect(syntax);
  return functions;
}

function memberName<Candidate>(value: Candidate): string | undefined {
  const node = syntaxNode(value);
  if (node?.type !== "MemberExpression") return undefined;
  return node.computed
    ? stringValue(node.property)
    : identifierName(node.property);
}

function isPlatformPair<Candidate>(value: Candidate): boolean {
  const node = syntaxNode(value);
  if (node?.type !== "LogicalExpression" || node.operator !== "&&")
    return false;
  const matches = (
    operand: StructuredDataValue | undefined,
    key: string,
    expected: string,
  ) => {
    const comparison = syntaxNode(operand);
    const member = syntaxNode(comparison?.left);
    return (
      comparison?.type === "BinaryExpression" &&
      comparison.operator === "===" &&
      identifierName(member?.object) === "process" &&
      memberName(member) === key &&
      stringValue(comparison.right) === expected
    );
  };
  return [
    ["linux", "x64"],
    ["darwin", "arm64"],
  ].some(
    ([platform, arch]) =>
      matches(node.left, "platform", platform!) &&
      matches(node.right, "arch", arch!),
  );
}

function isPlatformTarget<Candidate>(value: Candidate): boolean {
  const node = syntaxNode(value);
  return (
    node?.type === "ConditionalExpression" &&
    isPlatformPair(node.test) &&
    stringValue(node.consequent) != null &&
    (identifierName(node.alternate) === "undefined" ||
      isPlatformTarget(node.alternate))
  );
}

function nativeCall(
  node: SyntaxNode,
  helpers: ReadonlyMap<string, string>,
): boolean {
  const args = argumentsOf(node);
  const name = helpers.get(identifierName(node.callee) ?? "");
  const toolchain = (value: StructuredDataValue | undefined) =>
    helpers.get(identifierName(value) ?? "") === "nativeToolchain";
  if (name === "prepareHarnessObject") {
    return toolchain(args[1]);
  }
  if (name === "runNativeUnits") return toolchain(args[3]);
  if (name === "runNativeCli") {
    const request = syntaxNode(args[0]);
    const properties = Array.isArray(request?.properties)
      ? request.properties
      : [];
    const argumentProperty = properties
      .map(syntaxNode)
      .find(
        (property) =>
          (identifierName(property?.key) ?? stringValue(property?.key)) ===
          "args",
      );
    const argv = syntaxNode(argumentProperty?.value);
    if (argv?.type === "ArrayExpression" && Array.isArray(argv.elements)) {
      for (const item of argv.elements) {
        const argument = stringValue(item);
        // A spread/dynamic argument might supply the option terminator.
        if (argument == null || argument === "--") break;
        if (
          ["--emit-c", "--dump-mir", "--help", "--version"].includes(argument)
        )
          return false;
      }
    }
    return true;
  }
  if (
    name === "withNativeFixture" ||
    name === "buildHostCcFixture" ||
    name === "buildClockProgram" ||
    name === "runClockProbe" ||
    name === "runClockScheduler"
  ) {
    return true;
  }
  // Planning alone does not build anything. Actual consumers below identify
  // execution through a plan's executablePath instead.
  if (memberName(node.callee) === "createBuildPlan") return false;
  return false;
}

function isZigCompile(node: SyntaxNode): boolean {
  const args = argumentsOf(node);
  // Existing C runtime tests invoke Zig through a local run wrapper.
  const argv = syntaxNode(args[1]);
  return (
    stringValue(args[0]) === "zig" &&
    argv?.type === "ArrayExpression" &&
    Array.isArray(argv.elements) &&
    stringValue(argv.elements[0]) === "cc"
  );
}

function callsProcess(
  node: SyntaxNode,
  helpers: ReadonlyMap<string, string>,
  functions: ReadonlyMap<string, SyntaxNode>,
  active: ReadonlySet<string> = new Set(),
): boolean {
  const name = identifierName(node.callee);
  if (
    memberName(node.callee) === "run" ||
    processHelpers.has(helpers.get(name ?? "") ?? "")
  )
    return true;
  if (name == null || active.has(name)) return false;
  const body = functions.get(name)?.body;
  let result = false;
  walk(body, (child) => {
    if (
      child.type === "CallExpression" &&
      callsProcess(child, helpers, functions, new Set([...active, name]))
    )
      result = true;
  });
  return result;
}

function executesPlanRequests(
  node: SyntaxNode,
  plans: ReadonlySet<string>,
  helpers: ReadonlyMap<string, string>,
  functions: ReadonlyMap<string, SyntaxNode>,
): boolean {
  const callee = syntaxNode(node.callee);
  const requests = syntaxNode(
    node.type === "ForOfStatement" ? node.right : callee?.object,
  );
  if (
    memberName(requests) !== "requests" ||
    !plans.has(identifierName(requests?.object) ?? "")
  )
    return false;
  let parameter: SyntaxNode | undefined;
  let body: StructuredDataValue | undefined;
  if (node.type === "ForOfStatement") {
    const left = syntaxNode(node.left);
    const declarations = Array.isArray(left?.declarations)
      ? left.declarations
      : [];
    parameter = syntaxNode(syntaxNode(declarations[0])?.id ?? left);
    body = node.body;
  } else if (
    node.type === "CallExpression" &&
    ["forEach", "map"].includes(memberName(callee) ?? "")
  ) {
    const argument = argumentsOf(node)[0];
    const callback =
      functions.get(identifierName(argument) ?? "") ?? syntaxNode(argument);
    parameter = syntaxNode(
      Array.isArray(callback?.params) ? callback.params[0] : undefined,
    );
    body = callback?.body;
  }
  const name = identifierName(parameter);
  if (name == null) return false;
  let executes = false;
  walk(body, (call) => {
    if (
      call.type !== "CallExpression" ||
      !callsProcess(call, helpers, functions)
    )
      return;
    const command = argumentsOf(call)[0];
    if (identifierName(command) === name) executes = true;
    walk(command, (child) => {
      if (
        memberName(child) === "command" &&
        identifierName(child.object) === name
      )
        executes = true;
    });
  });
  return executes;
}

function reachesNativeHelper<Candidate>(
  value: Candidate,
  helpers: ReadonlyMap<string, string>,
  functions: ReadonlyMap<string, SyntaxNode>,
  plans: ReadonlySet<string>,
  executors: ReadonlySet<string>,
  active: ReadonlySet<string> = new Set(),
): boolean {
  if (Array.isArray(value)) {
    return value.some((child) =>
      reachesNativeHelper(child, helpers, functions, plans, executors, active),
    );
  }
  const node = syntaxNode(value);
  if (
    node == null ||
    node.type === "TSTypeQuery" ||
    node.type === "TSTypeReference"
  )
    return false;
  if (node.type === "BlockStatement") {
    functions = new Map([...functions, ...collectLocalFunctions(node)]);
    plans = new Set([...plans, ...collectPlans(node, helpers, "plan")]);
    executors = new Set([
      ...executors,
      ...collectPlans(node, helpers, "executor"),
    ]);
  }
  if (executesPlanRequests(node, plans, helpers, functions)) return true;
  if (node.type === "CallExpression") {
    if (
      nativeCall(node, helpers) ||
      (isZigCompile(node) && callsProcess(node, helpers, functions))
    )
      return true;
    if (
      ["then", "catch", "finally", "map", "flatMap", "forEach"].includes(
        memberName(node.callee) ?? "",
      )
    ) {
      for (const argument of argumentsOf(node)) {
        if (
          nativeCall(
            { type: "CallExpression", callee: argument, arguments: [] },
            helpers,
          )
        )
          return true;
      }
    }
    const callee = syntaxNode(node.callee);
    if (
      memberName(callee) === "execute" &&
      executors.has(identifierName(callee?.object) ?? "")
    )
      return true;
    let consumesPlan = false;
    walk(argumentsOf(node), (child) => {
      if (
        memberName(child) === "executablePath" &&
        plans.has(identifierName(child.object) ?? "")
      ) {
        consumesPlan = true;
      }
    });
    if (consumesPlan && callsProcess(node, helpers, functions)) return true;
    // Follow calls and function-valued callback arguments, not arbitrary
    // identifiers (imports, types and assertions about helpers are harmless).
    for (const candidate of [node.callee, ...argumentsOf(node)]) {
      const name = identifierName(candidate);
      if (name == null || active.has(name)) continue;
      const called = functions.get(name);
      if (
        called != null &&
        reachesNativeHelper(
          called.body,
          helpers,
          functions,
          plans,
          executors,
          new Set([...active, name]),
        )
      ) {
        return true;
      }
    }
  }
  // Uncalled local declarations are not part of the test's execution path.
  if (
    node.type === "FunctionDeclaration" ||
    (node.type === "VariableDeclarator" &&
      ["ArrowFunctionExpression", "FunctionExpression"].includes(
        String(syntaxNode(node.init)?.type),
      ))
  )
    return false;
  return childNodes(node).some((child) =>
    reachesNativeHelper(child, helpers, functions, plans, executors, active),
  );
}

function opensLexicalScope(node: SyntaxNode): boolean {
  return [
    "Program",
    "BlockStatement",
    "ForStatement",
    "ForOfStatement",
    "ForInStatement",
    "CatchClause",
    "SwitchStatement",
  ].includes(String(node.type));
}

function walkScope<Candidate>(
  value: Candidate,
  visit: (node: SyntaxNode) => void,
  root = true,
): void {
  if (Array.isArray(value)) {
    for (const child of value) walkScope(child, visit, false);
    return;
  }
  const node = syntaxNode(value);
  if (
    node == null ||
    (!root && node.type !== "Program" && opensLexicalScope(node)) ||
    [
      "FunctionDeclaration",
      "FunctionExpression",
      "ArrowFunctionExpression",
    ].includes(String(node.type))
  )
    return;
  visit(node);
  for (const child of childNodes(node)) walkScope(child, visit, false);
}

function collectPlans(
  syntax: SyntaxNode,
  helpers: ReadonlyMap<string, string>,
  kind: "plan" | "executor",
): ReadonlySet<string> {
  const plans = new Set<string>();
  walkScope(syntax, (node) => {
    const init = syntaxNode(node.init);
    const callee = syntaxNode(init?.callee);
    const name = identifierName(node.id);
    if (
      node.type === "VariableDeclarator" &&
      name != null &&
      init?.type === "CallExpression" &&
      (kind === "plan"
        ? memberName(callee) === "createBuildPlan" &&
          helpers.get(identifierName(callee?.object) ?? "") ===
            "nativeToolchain"
        : helpers.get(identifierName(callee) ?? "") ===
            "createTest262FragmentExecutor" &&
          helpers.get(identifierName(argumentsOf(init)[1]) ?? "") ===
            "nativeToolchain")
    )
      plans.add(name);
  });
  return plans;
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
  if (node?.type === "LogicalExpression" && node.operator === "||") {
    return (
      isNullishTargetCheck(node.left, targets) ||
      isNullishTargetCheck(node.right, targets)
    );
  }
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
  skips: ReadonlySet<string>,
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
      (isUnsupportedHostSkip(property.value, targets) ||
        skips.has(identifierName(property.value) ?? ""))
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

/** Check one test source for unsupported-native-host guards. */
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
  if (testFunctions.size === 0) return [];
  const functions = collectLocalFunctions(syntax);
  const targets = collectTargetBindings(syntax);
  const plans = collectPlans(syntax, helpers, "plan");
  const executors = collectPlans(syntax, helpers, "executor");
  const skips = new Set<string>();
  walkScope(syntax, (node) => {
    const name = identifierName(node.id);
    if (
      node.type === "VariableDeclarator" &&
      name != null &&
      isUnsupportedHostSkip(node.init, targets)
    )
      skips.add(name);
  });
  const problems: NativeHostGuardProblem[] = [];
  const scan = (
    value: StructuredDataValue | SyntaxNode,
    enclosingFunctions: ReadonlyMap<string, SyntaxNode>,
    enclosingPlans: ReadonlySet<string>,
    enclosingExecutors: ReadonlySet<string>,
    enclosingSkips: ReadonlySet<string>,
  ): void => {
    if (Array.isArray(value)) {
      for (const child of value)
        scan(
          child,
          enclosingFunctions,
          enclosingPlans,
          enclosingExecutors,
          enclosingSkips,
        );
      return;
    }
    const node = syntaxNode(value);
    if (node == null) return;
    const scopedSkips = new Set(enclosingSkips);
    if (opensLexicalScope(node)) {
      walkScope(node, (binding) => {
        if (binding.type !== "VariableDeclarator") return;
        for (const name of bindingNames(binding.id)) scopedSkips.delete(name);
        const name = identifierName(binding.id);
        if (name != null && isUnsupportedHostSkip(binding.init, targets))
          scopedSkips.add(name);
      });
    }
    if (node.type === "CatchClause") {
      for (const name of bindingNames(node.param)) scopedSkips.delete(name);
    }
    if (Array.isArray(node.params)) {
      for (const parameter of node.params) {
        for (const name of bindingNames(parameter)) scopedSkips.delete(name);
      }
    }
    const scopedFunctions =
      node.type === "BlockStatement"
        ? new Map([...enclosingFunctions, ...collectLocalFunctions(node)])
        : enclosingFunctions;
    const scopedPlans =
      node.type === "BlockStatement"
        ? new Set([...enclosingPlans, ...collectPlans(node, helpers, "plan")])
        : enclosingPlans;
    const scopedExecutors =
      node.type === "BlockStatement"
        ? new Set([
            ...enclosingExecutors,
            ...collectPlans(node, helpers, "executor"),
          ])
        : enclosingExecutors;
    if (
      node.type === "CallExpression" &&
      testFunctions.has(identifierName(node.callee) ?? "") &&
      reachesNativeHelper(
        scopedFunctions.get(identifierName(argumentsOf(node).at(-1)) ?? "")
          ?.body ?? argumentsOf(node).slice(-1),
        helpers,
        scopedFunctions,
        scopedPlans,
        scopedExecutors,
      ) &&
      !hasUnsupportedHostGuard(node, targets, scopedSkips)
    ) {
      problems.push({ line: nodeLine(node), path, testName: testName(node) });
    }
    for (const child of childNodes(node))
      scan(child, scopedFunctions, scopedPlans, scopedExecutors, scopedSkips);
  };
  scan(syntax, functions, plans, executors, skips);
  return problems;
}

/** Check every native test in a repository worktree. */
export async function checkNativeHostGuards(
  root: string,
): Promise<readonly NativeHostGuardProblem[]> {
  const directory = join(root, "tests");
  const entries = await readdir(directory, {
    withFileTypes: true,
    recursive: true,
  });
  const paths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name))
    .toSorted();
  const results = await Promise.all(
    paths.map(async (absolutePath) =>
      checkNativeHostGuardSource(
        relative(root, absolutePath),
        await readFile(absolutePath, "utf8"),
      ),
    ),
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
  console.log("native-host-guards=valid");
}
