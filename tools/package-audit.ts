/* eslint-disable no-await-in-loop -- Packages are audited in list order. */

/**
 * Audit installed npm packages for the package track in PLAN-PKG.md.
 *
 * The tool reads a `node_modules` directory that npm, pnpm, or Yarn built,
 * resolves each candidate's ESM entry the way the planned Oseo resolver
 * will (`exports` with the `oseo` and `import` conditions in manifest key
 * order, `default` always matching, and the legacy `main` fallback), walks
 * every static import transitively, and reports the constructs that Oseo
 * cannot compile or that wait for an M6 API group. It needs no Oseo build
 * and no network beyond the install step that produced the directory.
 *
 * The verdicts are an audit of published artifacts, not an execution
 * result. A global that a package references only inside a function body
 * compiles today and fails only when that function runs; the blocker list
 * says which it is.
 *
 * Usage:
 *
 *     node tools/package-audit.ts --root <node_modules> [--candidates FILE]
 *         [--print | --update]
 *
 * `--print` writes the Markdown report to standard output. `--update`
 * rewrites the generated section of
 * docs/evidence/package-audit/README.md.
 */

import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import {
  dirname,
  extname,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import process from "node:process";

import { parse } from "@babel/parser";

import { isObject, isString } from "./value-kinds.ts";

type AuditValue =
  | AuditNode
  | readonly AuditValue[]
  | boolean
  | null
  | number
  | string
  | undefined;

/** One Babel node, read structurally so no Babel type crosses this file. */
interface AuditNode {
  readonly [key: string]: AuditValue | undefined;
  readonly computed?: boolean;
  readonly name?: string;
  readonly start?: number;
  readonly type?: string;
}

type ExportsValue =
  | string
  | null
  | readonly ExportsValue[]
  | { readonly [key: string]: ExportsValue };

interface Manifest {
  readonly dependencies?: { readonly [name: string]: string };
  readonly exports?: ExportsValue;
  readonly imports?: { readonly [key: string]: ExportsValue };
  readonly main?: string;
  readonly name?: string;
  readonly type?: string;
  readonly version?: string;
}

interface PackageScope {
  readonly directory: string;
  readonly manifest: Manifest;
}

type ModuleFormat = "cjs" | "esm" | "json" | "other";

type BlockerCategory =
  | "cjs-syntax"
  | "dynamic-import"
  | "eval"
  | "function-global"
  | "import-meta"
  | "intl"
  | "node-global"
  | "node-prefix"
  | "typescript"
  | "unresolved"
  | "web-global";

type ReferenceContext = "function-body" | "import" | "top-level";

interface Blocker {
  readonly category: BlockerCategory;
  readonly context: ReferenceContext;
  readonly group?: number;
  readonly location: string;
  readonly name: string;
}

interface ResolvedFile {
  readonly file: string;
  readonly format: ModuleFormat;
  readonly kind: "file";
}

interface UnresolvedSpecifier {
  readonly kind: "data" | "node" | "unresolved";
  readonly reason?: string;
}

type Resolution = ResolvedFile | UnresolvedSpecifier;

interface EntryResolution {
  readonly error?: string;
  readonly file?: string;
  readonly format?: ModuleFormat;
  readonly via?: "exports" | "main";
}

interface FileAnalysis {
  readonly blockers: readonly Blocker[];
  readonly parseError?: string;
  readonly specifiers: readonly string[];
}

interface AuditResult {
  readonly blockers: readonly string[];
  readonly dependencySplit: string;
  readonly entry: string;
  readonly group: string;
  readonly name: string;
  readonly reachedFiles: number;
  readonly verdict: string;
  readonly version: string;
}

/**
 * The export conditions the planned resolver activates for executable
 * source. `default` matches on its own, and the manifest's key order decides
 * among the active conditions, exactly as Node.js resolves `exports`.
 */
const activeConditions: ReadonlySet<string> = new Set(["oseo", "import"]);

/** PLAN-M6.md dependency-ordered API groups, keyed by global name. */
const webGroups: ReadonlyMap<string, number> = new Map([
  ["TextDecoder", 1],
  ["TextEncoder", 1],
  ["URL", 1],
  ["URLSearchParams", 1],
  ["AbortController", 2],
  ["AbortSignal", 2],
  ["Event", 2],
  ["EventTarget", 2],
  ["performance", 3],
  ["queueMicrotask", 3],
  ["structuredClone", 3],
  ["Blob", 4],
  ["File", 4],
  ["FormData", 4],
  ["CompressionStream", 5],
  ["DecompressionStream", 5],
  ["ReadableStream", 5],
  ["TransformStream", 5],
  ["WritableStream", 5],
  ["Headers", 6],
  ["Request", 6],
  ["Response", 6],
  ["fetch", 6],
  ["crypto", 7],
  ["WebAssembly", 8],
  ["atob", 9],
  ["btoa", 9],
]);

const nodeGlobals: ReadonlySet<string> = new Set([
  "Buffer",
  "__dirname",
  "__filename",
  "global",
  "process",
]);

const cjsGlobals: ReadonlySet<string> = new Set(["exports", "module"]);

const functionKinds: ReadonlySet<string> = new Set([
  "ArrowFunctionExpression",
  "ClassMethod",
  "ClassPrivateMethod",
  "FunctionDeclaration",
  "FunctionExpression",
  "ObjectMethod",
]);

const functionExpressionKinds: ReadonlySet<string> = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
]);

const manifestCache = new Map<string, Promise<Manifest | undefined>>();
const scopeCache = new Map<string, Promise<PackageScope | undefined>>();
const realpathCache = new Map<string, Promise<string | undefined>>();

function asNode<Candidate>(value: Candidate): AuditNode | undefined {
  if (!isObject(value) || Array.isArray(value)) return undefined;
  // SAFETY: AuditNode is an open record; the object check establishes it.
  return value as AuditNode;
}

function asNodes(value: AuditValue | undefined): readonly AuditNode[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const itemNode = asNode(item);
    return itemNode == null ? [] : [itemNode];
  });
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** Resolve symbolic links so pnpm layouts yield one identity per file. */
async function canonicalPath(path: string): Promise<string | undefined> {
  let pending = realpathCache.get(path);
  if (pending == null) {
    pending = realpath(path).catch(() => undefined);
    realpathCache.set(path, pending);
  }
  return await pending;
}

async function readManifest(directory: string): Promise<Manifest | undefined> {
  let pending = manifestCache.get(directory);
  if (pending == null) {
    pending = readFile(join(directory, "package.json"), "utf8").then(
      (text): Manifest => {
        const manifest: Manifest = JSON.parse(text);
        return manifest;
      },
      () => undefined,
    );
    manifestCache.set(directory, pending);
  }
  return await pending;
}

/**
 * The nearest enclosing package.json, which Node.js consults for `type`.
 * A nested manifest such as yaml's *browser/package.json* overrides the
 * package root for the files under it.
 */
async function packageScope(file: string): Promise<PackageScope | undefined> {
  const start = dirname(file);
  let pending = scopeCache.get(start);
  if (pending == null) {
    pending = (async () => {
      let directory = start;
      for (;;) {
        const manifest = await readManifest(directory);
        if (manifest != null) return { directory, manifest };
        const parent = dirname(directory);
        if (parent === directory) return undefined;
        directory = parent;
      }
    })();
    scopeCache.set(start, pending);
  }
  return await pending;
}

/** The package name that owns a path, read from its last node_modules. */
function owningPackage(file: string): string | undefined {
  const parts = file.split(sep);
  const index = parts.lastIndexOf("node_modules");
  if (index < 0) return undefined;
  const first = parts[index + 1];
  if (first == null) return undefined;
  if (first.startsWith("@")) {
    const second = parts[index + 2];
    return second == null ? first : `${first}/${second}`;
  }
  return first;
}

async function moduleFormat(file: string): Promise<ModuleFormat> {
  const extension = extname(file);
  if (extension === ".mjs") return "esm";
  if (extension === ".cjs") return "cjs";
  if (extension === ".json") return "json";
  if (extension !== ".js") return "other";
  const scope = await packageScope(file);
  return scope?.manifest.type === "module" ? "esm" : "cjs";
}

/**
 * Select a target from one `exports` or `imports` value. Keys are visited
 * in manifest order; the first key that is `default` or an active condition
 * wins, and a `null` target blocks the subpath.
 */
function selectTarget(value: ExportsValue): string | null | undefined {
  if (value === null) return null;
  if (isString(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const selected = selectTarget(item);
      if (selected !== undefined) return selected;
    }
    return undefined;
  }
  if (!isObject(value)) return undefined;
  for (const key of Object.keys(value)) {
    if (key !== "default" && !activeConditions.has(key)) continue;
    // SAFETY: Object.keys of the exports object yields its own entries.
    const selected = selectTarget(
      (value as { [k: string]: ExportsValue })[key]!,
    );
    if (selected !== undefined) return selected;
  }
  return undefined;
}

interface PatternMatch {
  readonly key: string;
  readonly rest: string;
}

/** Match a subpath against map keys: exact first, then the best pattern. */
function matchKey(
  keys: readonly string[],
  subpath: string,
): PatternMatch | undefined {
  if (keys.includes(subpath)) return { key: subpath, rest: "" };
  let best: PatternMatch | undefined;
  let bestPrefix = -1;
  for (const key of keys) {
    const star = key.indexOf("*");
    if (star < 0 || key.indexOf("*", star + 1) >= 0) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (
      subpath.length < prefix.length + suffix.length ||
      !subpath.startsWith(prefix) ||
      !subpath.endsWith(suffix)
    ) {
      continue;
    }
    if (prefix.length > bestPrefix) {
      bestPrefix = prefix.length;
      best = {
        key,
        rest: subpath.slice(prefix.length, subpath.length - suffix.length),
      };
    }
  }
  return best;
}

function resolveMap(
  map: { readonly [key: string]: ExportsValue },
  subpath: string,
): string | null | undefined {
  const match = matchKey(Object.keys(map), subpath);
  if (match == null) return undefined;
  const selected = selectTarget(map[match.key]!);
  if (selected == null) return selected;
  return match.key.includes("*")
    ? selected.replaceAll("*", match.rest)
    : selected;
}

function isExportsList(value: ExportsValue): value is readonly ExportsValue[] {
  return Array.isArray(value);
}

/** Resolve a subpath through `exports`, as the planned resolver would. */
function resolveExports(
  exportsValue: ExportsValue,
  subpath: string,
): string | null | undefined {
  if (isString(exportsValue) || isExportsList(exportsValue)) {
    return subpath === "." ? selectTarget(exportsValue) : undefined;
  }
  if (!isObject(exportsValue)) return undefined;
  const keys = Object.keys(exportsValue);
  const subpathKeys = keys.filter((key) => key.startsWith("."));
  if (subpathKeys.length === keys.length) {
    return resolveMap(exportsValue, subpath);
  }
  if (subpathKeys.length === 0) {
    return subpath === "." ? selectTarget(exportsValue) : undefined;
  }
  return undefined;
}

async function legacyMain(
  directory: string,
  mainField: string | undefined,
): Promise<string | undefined> {
  const candidates =
    mainField == null
      ? ["index.js"]
      : [
          mainField,
          `${mainField}.js`,
          `${mainField}.json`,
          join(mainField, "index.js"),
          "index.js",
        ];
  for (const candidate of candidates) {
    const path = resolve(directory, candidate);
    if (await isFile(path)) return path;
  }
  return undefined;
}

async function resolvePackageEntry(
  directory: string,
  subpath: string,
): Promise<EntryResolution> {
  const manifest = await readManifest(directory);
  if (manifest == null) return { error: "package.json is unreadable" };
  let target: string | undefined;
  let via: "exports" | "main" | undefined;
  if (manifest.exports !== undefined) {
    const selected = resolveExports(manifest.exports, subpath);
    if (selected === null) return { error: `exports blocks ${subpath}` };
    if (selected === undefined) {
      return { error: `exports has no import target for ${subpath}` };
    }
    if (!selected.startsWith("./")) {
      return { error: `exports target ${selected} is not relative` };
    }
    target = resolve(directory, selected);
    via = "exports";
  } else if (subpath === ".") {
    target = await legacyMain(directory, manifest.main);
    via = "main";
    if (target == null) return { error: "no main entry exists" };
  } else {
    target = resolve(directory, subpath);
    via = "main";
  }
  if (!(await isFile(target))) {
    return { error: `entry file ${relative(directory, target)} is missing` };
  }
  const file = (await canonicalPath(target)) ?? target;
  return { file, format: await moduleFormat(file), via };
}

function splitBareSpecifier(specifier: string): readonly [string, string] {
  const parts = specifier.split("/");
  const nameLength = specifier.startsWith("@") ? 2 : 1;
  const name = parts.slice(0, nameLength).join("/");
  const rest = parts.slice(nameLength).join("/");
  return [name, rest === "" ? "." : `./${rest}`];
}

async function findPackageDirectory(
  name: string,
  fromDirectory: string,
): Promise<string | undefined> {
  let directory = fromDirectory;
  for (;;) {
    const candidate = join(directory, "node_modules", name);
    if (await isDirectory(candidate)) {
      return (await canonicalPath(candidate)) ?? candidate;
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

async function resolveSpecifier(
  specifier: string,
  importer: string,
): Promise<Resolution> {
  if (specifier.startsWith("node:")) return { kind: "node" };
  if (specifier.startsWith("data:")) return { kind: "data" };
  if (specifier.startsWith("#")) {
    const scope = await packageScope(importer);
    const imports = scope?.manifest.imports;
    if (scope == null || imports == null) {
      return { kind: "unresolved", reason: "no imports map" };
    }
    const selected = resolveMap(imports, specifier);
    if (selected == null) {
      return { kind: "unresolved", reason: "imports has no target" };
    }
    if (selected.startsWith("./")) {
      return await resolveFile(resolve(scope.directory, selected));
    }
    return await resolveSpecifier(selected, importer);
  }
  if (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/")
  ) {
    return await resolveFile(resolve(dirname(importer), specifier));
  }
  const [name, subpath] = splitBareSpecifier(specifier);
  const directory = await findPackageDirectory(name, dirname(importer));
  if (directory == null) {
    return { kind: "unresolved", reason: `${name} is not installed` };
  }
  const entry = await resolvePackageEntry(directory, subpath);
  if (entry.file == null || entry.format == null) {
    return { kind: "unresolved", reason: entry.error ?? "no entry" };
  }
  return { file: entry.file, format: entry.format, kind: "file" };
}

/** ESM relative specifiers name exact files; no extension is probed. */
async function resolveFile(path: string): Promise<Resolution> {
  if (!(await isFile(path))) {
    return { kind: "unresolved", reason: "file is missing" };
  }
  const file = (await canonicalPath(path)) ?? path;
  return { file, format: await moduleFormat(file), kind: "file" };
}

function lineOf(source: string, offset: number | undefined): number {
  if (offset == null) return 0;
  let line = 1;
  for (let index = 0; index < offset && index < source.length; index++) {
    if (source.charCodeAt(index) === 10) line++;
  }
  return line;
}

function patternNames(pattern: AuditNode | undefined, into: Set<string>) {
  if (pattern == null) return;
  switch (pattern.type) {
    case "Identifier":
      if (pattern.name != null) into.add(pattern.name);
      return;
    case "ObjectPattern":
      for (const property of asNodes(pattern.properties)) {
        patternNames(
          asNode(
            property.type === "RestElement"
              ? property.argument
              : property.value,
          ),
          into,
        );
      }
      return;
    case "ArrayPattern":
      for (const element of asNodes(pattern.elements))
        patternNames(element, into);
      return;
    case "AssignmentPattern":
      patternNames(asNode(pattern.left), into);
      return;
    case "RestElement":
      patternNames(asNode(pattern.argument), into);
      return;
    default:
      return;
  }
}

/**
 * Every name a file declares anywhere. Scope is not modelled: a file that
 * declares its own `process` function hides the global everywhere in that
 * file, which errs toward fewer reports and matches a manual reading.
 */
function declaredNames(root: AuditNode): ReadonlySet<string> {
  const names = new Set<string>();
  const visit = (value: AuditValue | undefined): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const current = asNode(value);
    if (current == null) return;
    switch (current.type) {
      case "VariableDeclarator":
        patternNames(asNode(current.id), names);
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ClassDeclaration":
      case "ClassExpression":
        patternNames(asNode(current.id), names);
        break;
      case "CatchClause":
        patternNames(asNode(current.param), names);
        break;
      case "ImportSpecifier":
      case "ImportDefaultSpecifier":
      case "ImportNamespaceSpecifier":
        patternNames(asNode(current.local), names);
        break;
      default:
        break;
    }
    if (functionKinds.has(current.type ?? "")) {
      for (const param of asNodes(current.params)) patternNames(param, names);
    }
    for (const key of Object.keys(current)) {
      if (key === "leadingComments" || key === "trailingComments") continue;
      visit(current[key]);
    }
  };
  visit(root);
  return names;
}

interface WalkState {
  readonly blockers: Blocker[];
  readonly declared: ReadonlySet<string>;
  readonly file: string;
  functionDepth: number;
  readonly seen: Set<string>;
  readonly source: string;
  readonly specifiers: string[];
}

function report(
  state: WalkState,
  node: AuditNode,
  category: BlockerCategory,
  name: string,
  context?: ReferenceContext,
): void {
  const location = `${state.file}:${lineOf(state.source, node.start)}`;
  const resolvedContext =
    context ?? (state.functionDepth > 0 ? "function-body" : "top-level");
  const key = `${location}|${category}|${name}|${resolvedContext}`;
  if (state.seen.has(key)) return;
  state.seen.add(key);
  const group = webGroups.get(name.split(/[.(]/u)[0] ?? "");
  state.blockers.push(
    group == null
      ? { category, context: resolvedContext, location, name }
      : { category, context: resolvedContext, group, location, name },
  );
}

function isGlobalReference(state: WalkState, name: string): boolean {
  return !state.declared.has(name);
}

function unwrapParentheses(node: AuditNode | undefined): AuditNode | undefined {
  let current = node;
  while (current?.type === "ParenthesizedExpression") {
    current = asNode(current.expression);
  }
  return current;
}

function classifyIdentifier(state: WalkState, node: AuditNode): void {
  const name = node.name;
  if (name == null || !isGlobalReference(state, name)) return;
  if (name === "Intl") report(state, node, "intl", name);
  else if (cjsGlobals.has(name)) report(state, node, "cjs-syntax", name);
  else if (nodeGlobals.has(name)) report(state, node, "node-global", name);
  else if (webGroups.has(name)) report(state, node, "web-global", name);
}

function walk(state: WalkState, value: AuditValue | undefined): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(state, item);
    return;
  }
  const node = asNode(value);
  if (node == null) return;
  const skipped = new Set<string>(["leadingComments", "trailingComments"]);
  switch (node.type) {
    case "ImportDeclaration":
    case "ExportAllDeclaration": {
      const source = asNode(node.source);
      if (isString(source?.value)) state.specifiers.push(source.value);
      return;
    }
    case "ExportNamedDeclaration": {
      const source = asNode(node.source);
      if (isString(source?.value)) {
        state.specifiers.push(source.value);
        return;
      }
      skipped.add("specifiers");
      break;
    }
    case "ImportExpression":
      report(state, node, "dynamic-import", "import()");
      break;
    case "MetaProperty":
      report(state, node, "import-meta", "import.meta");
      return;
    case "CallExpression":
    case "OptionalCallExpression":
    case "NewExpression": {
      const callee = asNode(node.callee);
      if (callee?.type === "Import") {
        report(state, node, "dynamic-import", "import()");
      } else if (callee?.type === "Identifier" && callee.name != null) {
        if (callee.name === "eval" && isGlobalReference(state, "eval")) {
          report(state, node, "eval", "eval()");
        } else if (
          callee.name === "Function" &&
          isGlobalReference(state, "Function")
        ) {
          const form =
            node.type === "NewExpression" ? "new Function" : "Function()";
          report(state, node, "function-global", form);
        }
      }
      break;
    }
    case "VariableDeclarator":
    case "AssignmentExpression": {
      const source = asNode(
        node.type === "VariableDeclarator" ? node.init : node.right,
      );
      if (
        source?.type === "Identifier" &&
        source.name === "Function" &&
        isGlobalReference(state, "Function")
      ) {
        report(state, node, "function-global", "Function alias");
      }
      break;
    }
    case "MemberExpression":
    case "OptionalMemberExpression": {
      const object = asNode(node.object);
      const property = asNode(node.property);
      if (node.computed !== true) skipped.add("property");
      const propertyName =
        node.computed === true || property?.type !== "Identifier"
          ? undefined
          : property.name;
      if (
        object?.type === "Identifier" &&
        object.name != null &&
        isGlobalReference(state, object.name) &&
        propertyName != null
      ) {
        const qualified = `${object.name}.${propertyName}`;
        if (object.name === "Intl") report(state, node, "intl", qualified);
        else if (object.name === "module" && propertyName === "exports") {
          report(state, node, "cjs-syntax", qualified);
        } else if (object.name === "process") {
          report(state, node, "node-global", qualified);
        } else {
          classifyIdentifier(state, object);
        }
        skipped.add("object");
      } else if (
        propertyName === "constructor" &&
        functionExpressionKinds.has(unwrapParentheses(object)?.type ?? "")
      ) {
        report(state, node, "function-global", "(function).constructor");
      }
      break;
    }
    case "ObjectProperty":
    case "ObjectMethod":
    case "ClassProperty":
    case "ClassMethod":
    case "ClassPrivateProperty":
    case "ClassPrivateMethod":
    case "ClassAccessorProperty":
      if (node.computed !== true) skipped.add("key");
      break;
    case "ImportSpecifier":
      skipped.add("imported");
      break;
    case "ExportSpecifier":
      skipped.add("exported");
      break;
    case "LabeledStatement":
    case "BreakStatement":
    case "ContinueStatement":
      skipped.add("label");
      break;
    case "Identifier":
      classifyIdentifier(state, node);
      return;
    default:
      break;
  }
  const isFunction = functionKinds.has(node.type ?? "");
  if (isFunction) state.functionDepth++;
  for (const key of Object.keys(node)) {
    if (skipped.has(key)) continue;
    walk(state, node[key]);
  }
  if (isFunction) state.functionDepth--;
}

function analyzeFile(
  file: string,
  displayPath: string,
  source: string,
  format: ModuleFormat,
): FileAnalysis {
  let root: AuditNode | undefined;
  try {
    const parsed = parse(source, {
      allowReturnOutsideFunction: true,
      plugins: ["jsx"],
      sourceType: format === "esm" ? "module" : "script",
    });
    root = asNode(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      blockers: [],
      parseError: `${displayPath}: ${message}`,
      specifiers: [],
    };
  }
  if (root == null) return { blockers: [], specifiers: [] };
  const state: WalkState = {
    blockers: [],
    declared: declaredNames(root),
    file: displayPath,
    functionDepth: 0,
    seen: new Set(),
    source,
    specifiers: [],
  };
  walk(state, root);
  return { blockers: state.blockers, specifiers: state.specifiers };
}

function formatBlocker(blocker: Blocker): string {
  const group = blocker.group == null ? "" : ` G${blocker.group}`;
  const detail = `${blocker.category}${group}, ${blocker.context}`;
  return `${blocker.location} ${blocker.name} (${detail})`;
}

async function auditPackage(
  root: string,
  name: string,
  expectedVersion: string,
): Promise<AuditResult> {
  const failure = (version: string, verdict: string, note: string) => ({
    blockers: [note],
    dependencySplit: "0 / 0",
    entry: "",
    group: "none",
    name,
    reachedFiles: 0,
    verdict,
    version,
  });
  const directory = await findPackageDirectory(name, root);
  if (directory == null) {
    return failure("missing", "UNCHECKED (not installed)", "not installed");
  }
  const manifest = await readManifest(directory);
  const version = manifest?.version ?? "?";
  if (version !== expectedVersion) {
    return failure(
      version,
      "UNCHECKED (version mismatch)",
      `installed ${version}, expected ${expectedVersion}`,
    );
  }
  const entry = await resolvePackageEntry(directory, ".");
  if (entry.file == null || entry.format == null) {
    return failure(version, "BLOCKED (no entry)", entry.error ?? "no entry");
  }
  const display = (file: string) =>
    posix.normalize(relative(root, file).split(sep).join("/"));
  const visited = new Set<string>();
  const dependencies = new Map<string, ModuleFormat>();
  const blockers: Blocker[] = [];
  const notes: string[] = [];
  let reachedCjs = false;
  const queue: ResolvedFile[] = [
    { file: entry.file, format: entry.format, kind: "file" },
  ];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.file)) continue;
    visited.add(current.file);
    const displayPath = display(current.file);
    if (current.format === "json") continue;
    if (current.format === "other") {
      if (extname(current.file) === ".ts") {
        blockers.push({
          category: "typescript",
          context: "import",
          location: `${displayPath}:1`,
          name: "TypeScript source",
        });
      }
      continue;
    }
    if (current.format === "cjs") reachedCjs = true;
    const source = await readFile(current.file, "utf8");
    const analysis = analyzeFile(
      current.file,
      displayPath,
      source,
      current.format,
    );
    if (analysis.parseError != null) notes.push(analysis.parseError);
    blockers.push(...analysis.blockers);
    if (current.format === "cjs") continue;
    for (const specifier of analysis.specifiers) {
      const resolved = await resolveSpecifier(specifier, current.file);
      const location = `${displayPath}:import`;
      if (resolved.kind === "file") {
        queue.push(resolved);
        const owner = owningPackage(resolved.file);
        if (owner != null && owner !== name && !dependencies.has(owner)) {
          dependencies.set(owner, resolved.format);
        }
      } else if (resolved.kind === "node") {
        blockers.push({
          category: "node-prefix",
          context: "import",
          location,
          name: specifier,
        });
      } else {
        const reason = resolved.reason ?? resolved.kind;
        blockers.push({
          category: "unresolved",
          context: "import",
          location,
          name: `${specifier} (${reason})`,
        });
      }
    }
  }
  const esmDependencies = [...dependencies.values()].filter(
    (format) => format === "esm",
  ).length;
  const cjsDependencies = dependencies.size - esmDependencies;
  const reasons: string[] = [];
  const categories = new Set(blockers.map((blocker) => blocker.category));
  if (categories.has("cjs-syntax")) reasons.push("CJS syntax");
  if (categories.has("dynamic-import")) reasons.push("dynamic import");
  if (categories.has("eval")) reasons.push("eval");
  if (categories.has("function-global")) reasons.push("Function global");
  if (categories.has("node-prefix")) reasons.push("node: import");
  if (categories.has("node-global")) reasons.push("Node global");
  if (categories.has("import-meta")) reasons.push("import.meta");
  if (categories.has("intl")) reasons.push("Intl");
  if (categories.has("typescript")) reasons.push("TypeScript source");
  if (categories.has("unresolved")) reasons.push("unresolved import");
  if (reachedCjs || cjsDependencies > 0) reasons.push("CJS file");
  const groups = blockers.flatMap((blocker) =>
    blocker.group == null ? [] : [blocker.group],
  );
  const earliest = groups.length === 0 ? undefined : Math.min(...groups);
  let verdict: string;
  if (entry.format !== "esm") verdict = "BLOCKED (CJS entry)";
  else if (reasons.length > 0) verdict = `BLOCKED (${reasons.join(", ")})`;
  else if (earliest != null) verdict = `NEEDS-M6-GROUP-${earliest}`;
  else verdict = "CLEAN";
  return {
    blockers: [...notes, ...blockers.map(formatBlocker)],
    dependencySplit: `${esmDependencies} / ${cjsDependencies}`,
    entry: display(entry.file),
    group: earliest == null ? "none" : String(earliest),
    name,
    reachedFiles: visited.size,
    verdict,
    version,
  };
}

function renderReport(results: readonly AuditResult[]): string {
  const lines = [
    "| Package | Version | ESM entry | Files | Deps (ESM / CJS) | Blockers " +
      "| M6 group | Verdict |",
    "| ------- | ------- | --------- | ----: | ---------------- | -------- " +
      "| -------- | ------- |",
  ];
  for (const result of results) {
    const blockers =
      result.blockers.length === 0 ? "none" : result.blockers.join("<br>");
    lines.push(
      `| ${result.name} | ${result.version} | ${result.entry} | ` +
        `${result.reachedFiles} | ${result.dependencySplit} | ${blockers} | ` +
        `${result.group} | ${result.verdict} |`,
    );
  }
  const clean = results.filter((result) => result.verdict === "CLEAN");
  lines.push("", "Clean packages:", "");
  if (clean.length === 0) lines.push(" -  none");
  for (const result of clean) {
    lines.push(
      ` -  ${result.name} ${result.version} (${result.reachedFiles} ` +
        `${result.reachedFiles === 1 ? "file" : "files"}, ` +
        `dependencies ${result.dependencySplit})`,
    );
  }
  return lines.join("\n") + "\n";
}

interface CandidateList {
  readonly [name: string]: string;
}

const generatedStart =
  "<!-- Generated by `node tools/package-audit.ts --update`; do not edit. -->";
const generatedEnd = "<!-- End of generated audit. -->";

async function updateReadme(path: string, reportText: string): Promise<void> {
  const text = await readFile(path, "utf8");
  const start = text.indexOf(generatedStart);
  const end = text.indexOf(generatedEnd);
  if (start < 0 || end < start) {
    throw new Error(`${path} has no generated audit section.`);
  }
  const updated =
    text.slice(0, start + generatedStart.length) +
    "\n\n" +
    reportText +
    "\n" +
    text.slice(end);
  await writeFile(path, updated);
}

async function main(args: readonly string[]): Promise<void> {
  let root: string | undefined;
  let candidatesPath = "docs/evidence/package-audit/candidates.json";
  let mode: "print" | "update" = "print";
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--root") root = args[++index];
    else if (argument === "--candidates")
      candidatesPath = args[++index] ?? candidatesPath;
    else if (argument === "--print") mode = "print";
    else if (argument === "--update") mode = "update";
    else throw new Error(`Unknown argument ${argument}.`);
  }
  if (root == null) throw new Error("--root <node_modules> is required.");
  const rootPath = (await canonicalPath(resolve(root))) ?? resolve(root);
  const candidates: CandidateList = JSON.parse(
    await readFile(candidatesPath, "utf8"),
  );
  const results: AuditResult[] = [];
  for (const [name, version] of Object.entries(candidates)) {
    process.stderr.write(`Auditing ${name}@${version}\n`);
    results.push(await auditPackage(rootPath, name, version));
  }
  const reportText = renderReport(results);
  if (mode === "print") {
    process.stdout.write(reportText);
    return;
  }
  await updateReadme("docs/evidence/package-audit/README.md", reportText);
}

await main(process.argv.slice(2));
