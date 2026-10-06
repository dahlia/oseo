/**
 * Pure readers for upstream test262 sources and the reviewed subset. This
 * module loads no compiler, CLI, or host package, so checks that only parse
 * test262 metadata run without built package output.
 */
import { parse as parseBabel } from "@babel/parser";
import { parse as parseYaml } from "yaml";

import * as test262Summary from "../packages/testkit/src/test262-summary.ts";
import type {
  Test262Case,
  Test262Classification,
  Test262FailurePhase,
  Test262Strictness,
} from "../packages/testkit/src/index.ts";
import {
  parsedObject as record,
  type StructuredDataInput,
  type StructuredDataValue,
} from "./structured-data.ts";
import { isObject, isString } from "./value-kinds.ts";

export function includePropertiesWhen<const Properties extends object>(
  properties: () => Properties | undefined,
): Properties | { [Key in keyof Properties]?: never } {
  return properties() ?? {};
}

const classifications = new Set<Test262Classification>([
  "expected-negative",
  "harness-failure",
  "infrastructure-failure",
  "pass",
  "semantic-failure",
  "unsupported-profile-feature",
]);

interface FrontmatterNegative {
  readonly phase: Test262FailurePhase;
  readonly type: string;
}

/** Parsed metadata and derived strictness for one upstream test. */
export interface ParsedTest262Case {
  readonly case: Test262Case;
  readonly flags: readonly string[];
}

/**
 * One reviewed path, the classification it must retain, and the reviewed
 * semantic dependency tags ADR 0013 admits.
 */
export interface ReviewedTest262Entry {
  readonly dependencies: readonly string[];
  readonly expectedClassification: Test262Classification;
  readonly path: string;
}

/** Pinned test262 revision and explicitly reviewed source paths. */
export interface ReviewedTest262Subset {
  readonly suiteRevision: string;
  readonly supportedFeatures: readonly string[];
  readonly tests: readonly ReviewedTest262Entry[];
}

function stringValue(value: StructuredDataInput, description: string): string {
  if (!isString(value) || value.length === 0) {
    throw new Error(`${description} must be a non-empty string.`);
  }
  return value;
}

function stringArray(
  value: StructuredDataInput,
  description: string,
): readonly string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((entry) => !isString(entry))) {
    throw new Error(`${description} must be an array of strings.`);
  }
  // SAFETY: The array and element checks establish the string sequence.
  return value as readonly string[];
}

function failurePhase(value: StructuredDataInput): Test262FailurePhase {
  if (value === "parse" || value === "resolution" || value === "runtime") {
    return value;
  }
  throw new Error("test262 negative.phase is invalid.");
}

function negative(value: StructuredDataInput): FrontmatterNegative | undefined {
  if (value == null) return undefined;
  const item = record(value, "test262 negative metadata");
  return {
    phase: failurePhase(item.phase),
    type: stringValue(item.type, "test262 negative.type"),
  };
}

function strictness(flags: readonly string[]): readonly Test262Strictness[] {
  const onlyStrict = flags.includes("onlyStrict");
  const noStrict = flags.includes("noStrict");
  if (onlyStrict && noStrict) {
    throw new Error("test262 flags cannot combine onlyStrict and noStrict.");
  }
  if (flags.includes("module") || onlyStrict) return ["strict"];
  if (flags.includes("raw") || noStrict) return ["non-strict"];
  return ["non-strict", "strict"];
}

/** Parse the YAML frontmatter needed to reproduce one reviewed test. */
export function parseTest262Case(
  source: string,
  path: string,
  suiteRevision: string,
): ParsedTest262Case {
  const match = source.match(/\/\*---([\s\S]*?)---\*\//u);
  if (match?.[1] == null) {
    throw new Error(`${path} does not contain test262 frontmatter.`);
  }
  // SAFETY: parsedObject validates the complete YAML frontmatter tree.
  const metadata = record(
    (parseYaml(match[1].replace(/\r\n?/gu, "\n")) ?? {}) as StructuredDataInput,
    `${path} frontmatter`,
  );
  const flags = stringArray(metadata.flags, `${path} flags`);
  const expected = negative(metadata.negative);
  return {
    case: {
      async: flags.includes("async"),
      ...includePropertiesWhen(() => {
        if (expected == null) return undefined;
        return {
          expectedErrorType: expected.type,
          expectedFailurePhase: expected.phase,
        };
      }),
      features: stringArray(metadata.features, `${path} features`),
      flags,
      includes: stringArray(metadata.includes, `${path} includes`),
      mode: flags.includes("module") ? "module" : "script",
      path,
      strictness: strictness(flags),
      suiteRevision,
    },
    flags,
  };
}

/**
 * The global names one upstream harness file declares in its `defines`
 * frontmatter. A harness file without frontmatter or without the key
 * defines nothing the runner can compare.
 */
export function parseHarnessDefinitions(
  source: string,
  name: string,
): readonly string[] {
  const match = source.match(/\/\*---([\s\S]*?)---\*\//u);
  if (match?.[1] == null) return [];
  // SAFETY: record and stringArray validate the frontmatter tree.
  const metadata = record(
    (parseYaml(match[1].replace(/\r\n?/gu, "\n")) ?? {}) as StructuredDataInput,
    `${name} frontmatter`,
  );
  return stringArray(metadata.defines, `${name} defines`);
}

function classification(value: StructuredDataInput): Test262Classification {
  // SAFETY: The membership check below validates this candidate before return.
  const candidate = value as Test262Classification;
  if (isString(value) && classifications.has(candidate)) {
    return candidate;
  }
  throw new Error("Reviewed test262 classification is invalid.");
}

/** Validate the checked-in subset shape, ordering, and uniqueness. */
export function parseReviewedSubset(text: string): ReviewedTest262Subset {
  // SAFETY: parsedObject validates the complete YAML tree at this boundary.
  const root = record(parseYaml(text) as StructuredDataInput, "test262 subset");
  const rawTests = root.tests;
  if (!Array.isArray(rawTests)) {
    throw new Error("test262 subset tests must be an array.");
  }
  const tests = rawTests.map((value, index) => {
    const item = record(value, `test262 subset test ${index}`);
    const dependencies = stringArray(
      item.dependencies,
      `test262 subset test ${index} dependencies`,
    );
    if (dependencies.length === 0) {
      throw new Error(
        `test262 subset test ${index} needs at least one dependency tag.`,
      );
    }
    if (new Set(dependencies).size !== dependencies.length) {
      throw new Error(`test262 subset test ${index} repeats a dependency tag.`);
    }
    for (const dependency of dependencies) {
      if (!test262Summary.test262DependencyVocabulary.has(dependency)) {
        throw new Error(
          `test262 subset test ${index} has unreviewed dependency tag ` +
            `${dependency}.`,
        );
      }
    }
    return {
      dependencies,
      expectedClassification: classification(item.expectedClassification),
      path: stringValue(item.path, `test262 subset test ${index} path`),
    };
  });
  const paths = tests.map((test) => test.path);
  const sortedPaths = paths.toSorted();
  if (paths.some((path, index) => path !== sortedPaths[index])) {
    throw new Error("Reviewed test262 paths must be sorted.");
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error("Reviewed test262 paths must be unique.");
  }
  return {
    suiteRevision: stringValue(root.suiteRevision, "test262 suiteRevision"),
    supportedFeatures: stringArray(
      root.supportedFeatures,
      "test262 supportedFeatures",
    ),
    tests,
  };
}

export interface AgentSyntaxNode {
  readonly [key: string]: StructuredDataValue | undefined;
  readonly type?: StructuredDataValue;
}

export function agentSyntaxNode<Candidate>(
  value: Candidate,
): AgentSyntaxNode | undefined {
  if (!isObject(value) || Array.isArray(value)) return undefined;
  // SAFETY: Babel syntax nodes are open records with structured values.
  return value as AgentSyntaxNode;
}

/** Whether a parsed node is `$262.agent` or `$262["agent"]`. */
export function agentMemberRead(node: AgentSyntaxNode): boolean {
  if (
    node.type !== "MemberExpression" &&
    node.type !== "OptionalMemberExpression"
  ) {
    return false;
  }
  const object = agentSyntaxNode(node.object);
  const property = agentSyntaxNode(node.property);
  if (object?.type !== "Identifier" || object.name !== "$262") return false;
  return node.computed === true
    ? property?.type === "StringLiteral" && property.value === "agent"
    : property?.type === "Identifier" && property.name === "agent";
}

export function collectBoundNames(
  pattern: StructuredDataValue | undefined,
  names: Set<string>,
): void {
  const pending: (StructuredDataValue | undefined)[] = [pattern];
  while (pending.length > 0) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    const node = agentSyntaxNode(value);
    if (node == null) continue;
    switch (node.type) {
      case "Identifier":
        if (isString(node.name)) names.add(node.name);
        break;
      case "ObjectPattern":
        pending.push(node.properties);
        break;
      case "ObjectProperty":
        pending.push(node.value);
        break;
      case "ArrayPattern":
        pending.push(node.elements);
        break;
      case "RestElement":
        pending.push(node.argument);
        break;
      case "AssignmentPattern":
        pending.push(node.left);
        break;
      default:
        break;
    }
  }
}

/**
 * How the walk below treats one syntax field. A `reference` holds
 * expressions whose identifiers resolve through the scope chain, a
 * `binding` holds a declaration pattern whose identifiers the case
 * declares, and `skip` holds a name that is never a reference, such as a
 * non-computed property key or a label.
 */
type ReferenceMode = "binding" | "reference" | "skip";

/**
 * One scope the walk below passes through: the names a declarative scope
 * binds, or `"object"` for a `with` statement's object environment. Any
 * name may resolve through an object environment, since its bindings are
 * the properties the object and its prototype chain hold only at run time.
 */
type ReferenceScope = ReadonlySet<string> | "object";

const syntaxMetadataKeys = new Set([
  "comments",
  "end",
  "errors",
  "extra",
  "innerComments",
  "leadingComments",
  "loc",
  "range",
  "start",
  "tokens",
  "trailingComments",
]);

/**
 * The names the parsed case references where no enclosing scope of the
 * reference declares them, so they can only resolve through the realm's
 * global object. Scopes follow the parsed syntax: the Script or Module, each
 * function with its parameters and hoisted `var` and function declarations,
 * each block, `switch`, `for` head, `catch` clause, and class name. A
 * `typeof` operand is left out, because `typeof` answers an unresolvable
 * reference without needing its binding, and so is every reference inside
 * a `with` body, because the object may provide the binding.
 */
export function unresolvedReferenceNames(
  source: string,
  mode: Test262Case["mode"],
): ReadonlySet<string> {
  let program: unknown;
  try {
    program = parseBabel(source, {
      sourceType: mode === "module" ? "module" : "script",
    });
  } catch {
    return new Set();
  }
  const referenced = new Set<string>();
  const pending: {
    readonly mode: ReferenceMode;
    readonly scopes: readonly ReferenceScope[];
    readonly value: unknown;
  }[] = [{ mode: "reference", scopes: [], value: program }];
  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry == null) break;
    if (entry.mode === "skip") continue;
    if (Array.isArray(entry.value)) {
      for (const value of entry.value) {
        pending.push({ ...entry, value });
      }
      continue;
    }
    const node = agentSyntaxNode(entry.value);
    if (node == null) continue;
    if (node.type === "Identifier") {
      const name = node.name;
      // A declaration position is collected by its scope instead.
      if (entry.mode === "binding" || !isString(name)) continue;
      if (
        !entry.scopes.some((scope) => scope === "object" || scope.has(name))
      ) {
        referenced.add(name);
      }
      continue;
    }
    const scoped = scopedChildren(node);
    for (const [key, value] of Object.entries(node)) {
      if (syntaxMetadataKeys.has(key)) continue;
      const declared = scoped?.(key) ?? [];
      pending.push({
        mode: referenceMode(node, key, entry.mode),
        scopes:
          declared.length === 0 ? entry.scopes : [...entry.scopes, ...declared],
        value,
      });
    }
  }
  return referenced;
}

/**
 * The scopes one scope-creating node adds for each of its fields, or
 * `undefined` for a node that creates none. A field sees only the
 * declarations visible where it is evaluated: function parameters and
 * their defaults do not see the body's declarations, a computed method key
 * and a `switch` discriminant see neither the method's nor the cases'
 * declarations, a class name is visible to its heritage and body, and a
 * `with` object is evaluated outside the object environment its body
 * sees. Declaration positions are read here, so the walk above never
 * treats them as references.
 */
function scopedChildren(
  node: AgentSyntaxNode,
): ((key: string) => readonly ReferenceScope[]) | undefined {
  switch (node.type) {
    case "Program": {
      const names = new Set<string>();
      collectHoistedNames(node.body, names);
      collectLexicalNames(node.body, names);
      return () => [names];
    }
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
    case "ObjectMethod":
    case "ClassMethod":
    case "ClassPrivateMethod": {
      const parameters = new Set<string>();
      if (node.type === "FunctionExpression") {
        collectBoundNames(node.id, parameters);
      }
      collectBoundNames(node.params, parameters);
      const body = new Set<string>();
      const block = agentSyntaxNode(node.body);
      if (block?.type === "BlockStatement") {
        collectHoistedNames(block.body, body);
        collectLexicalNames(block.body, body);
      }
      return (key) =>
        key === "params"
          ? [parameters]
          : key === "body"
            ? [parameters, body]
            : [];
    }
    case "BlockStatement": {
      const names = new Set<string>();
      collectLexicalNames(node.body, names);
      return () => [names];
    }
    case "StaticBlock": {
      // A class static block is its own var scope, like a function body.
      const names = new Set<string>();
      collectHoistedNames(node.body, names);
      collectLexicalNames(node.body, names);
      return () => [names];
    }
    case "SwitchStatement": {
      const names = new Set<string>();
      const cases = Array.isArray(node.cases) ? node.cases : [];
      for (const switchCase of cases) {
        collectLexicalNames(agentSyntaxNode(switchCase)?.consequent, names);
      }
      return (key) => (key === "cases" ? [names] : []);
    }
    case "ForStatement": {
      const names = new Set<string>();
      collectLexicalNames(node.init, names);
      return () => [names];
    }
    case "ForInStatement":
    case "ForOfStatement": {
      const names = new Set<string>();
      collectLexicalNames(node.left, names);
      return () => [names];
    }
    case "CatchClause": {
      const names = new Set<string>();
      collectBoundNames(node.param, names);
      return () => [names];
    }
    case "WithStatement":
      return (key) => (key === "body" ? ["object"] : []);
    case "ClassDeclaration":
    case "ClassExpression": {
      const names = new Set<string>();
      collectBoundNames(node.id, names);
      return (key) => (key === "id" ? [] : [names]);
    }
    default:
      return undefined;
  }
}

/**
 * The `let`, `const`, class, and function declarations directly in one
 * statement list, or in one statement such as a `for` head.
 */
function collectLexicalNames(
  statements: StructuredDataValue | undefined,
  names: Set<string>,
): void {
  const list = Array.isArray(statements) ? statements : [statements];
  for (const statement of list) {
    const node = agentSyntaxNode(statement);
    const declaration =
      node?.type === "ExportNamedDeclaration" ||
      node?.type === "ExportDefaultDeclaration"
        ? agentSyntaxNode(node.declaration)
        : node;
    if (
      declaration?.type === "FunctionDeclaration" ||
      declaration?.type === "ClassDeclaration"
    ) {
      collectBoundNames(declaration.id, names);
    } else if (declaration?.type === "VariableDeclaration") {
      const declarators = declaration.declarations;
      for (const declarator of Array.isArray(declarators) ? declarators : []) {
        collectBoundNames(agentSyntaxNode(declarator)?.id, names);
      }
    } else if (
      node?.type === "ImportDeclaration" &&
      Array.isArray(node.specifiers)
    ) {
      for (const specifier of node.specifiers) {
        collectBoundNames(agentSyntaxNode(specifier)?.local, names);
      }
    }
  }
}

/**
 * The `var` declarations anywhere in one function or Script body, without
 * entering a nested function or class. A function declaration nested in a
 * block stays in that block's scope; the Annex B hoisting that sloppy code
 * would add is outside the claim, so such a case is withheld rather than
 * executed.
 */
function collectHoistedNames(
  statements: StructuredDataValue | undefined,
  names: Set<string>,
): void {
  const pending: (StructuredDataValue | undefined)[] = [statements];
  while (pending.length > 0) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    const node = agentSyntaxNode(value);
    if (node == null) continue;
    switch (node.type) {
      case "VariableDeclaration":
        if (node.kind === "var") collectLexicalNames(value, names);
        break;
      case "ExportNamedDeclaration":
        pending.push(node.declaration);
        break;
      case "BlockStatement":
      case "LabeledStatement":
      case "WithStatement":
      case "WhileStatement":
      case "DoWhileStatement":
        pending.push(node.body);
        break;
      case "IfStatement":
        pending.push(node.consequent, node.alternate);
        break;
      case "ForStatement":
        pending.push(node.init, node.body);
        break;
      case "ForInStatement":
      case "ForOfStatement":
        pending.push(node.left, node.body);
        break;
      case "TryStatement":
        pending.push(node.block, node.handler, node.finalizer);
        break;
      case "CatchClause":
        pending.push(node.body);
        break;
      case "SwitchStatement":
        pending.push(node.cases);
        break;
      case "SwitchCase":
        pending.push(node.consequent);
        break;
      default:
        break;
    }
  }
}

function referenceMode(
  node: AgentSyntaxNode,
  key: string,
  mode: ReferenceMode,
): ReferenceMode {
  const nonComputedKey = node.computed === true ? "reference" : "skip";
  if (mode === "binding") {
    switch (node.type) {
      case "ObjectProperty":
        return key === "key" ? nonComputedKey : "binding";
      case "AssignmentPattern":
        return key === "left" ? "binding" : "reference";
      case "ObjectPattern":
      case "ArrayPattern":
      case "RestElement":
        return "binding";
      default:
        return "reference";
    }
  }
  switch (node.type) {
    case "VariableDeclarator":
      return key === "id" ? "binding" : "reference";
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
    case "ObjectMethod":
    case "ClassMethod":
    case "ClassPrivateMethod":
      if (key === "id" || key === "params") return "binding";
      return key === "key" ? nonComputedKey : "reference";
    case "ClassDeclaration":
    case "ClassExpression":
      return key === "id" ? "binding" : "reference";
    case "CatchClause":
      return key === "param" ? "binding" : "reference";
    case "ImportSpecifier":
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier":
      return key === "local" ? "binding" : "skip";
    case "ExportNamedDeclaration":
      // A re-export's specifiers name another module's exports, not
      // bindings of this module.
      return key === "specifiers" && node.source != null ? "skip" : "reference";
    case "ExportSpecifier":
    case "ExportNamespaceSpecifier":
    case "ExportDefaultSpecifier":
      return key === "exported" ? "skip" : "reference";
    case "MemberExpression":
    case "OptionalMemberExpression":
      if (key === "property") return nonComputedKey;
      // `$262.agent` is the separate multi-agent capability.
      return key === "object" && agentMemberRead(node) ? "skip" : "reference";
    case "ObjectProperty":
    case "ClassProperty":
    case "ClassAccessorProperty":
    case "ClassPrivateProperty":
      return key === "key" ? nonComputedKey : "reference";
    case "LabeledStatement":
    case "BreakStatement":
    case "ContinueStatement":
      return key === "label" ? "skip" : "reference";
    case "MetaProperty":
    case "PrivateName":
    case "ImportAttribute":
      return "skip";
    case "UnaryExpression":
      return node.operator === "typeof" &&
        key === "argument" &&
        agentSyntaxNode(node.argument)?.type === "Identifier"
        ? "skip"
        : "reference";
    default:
      return "reference";
  }
}
