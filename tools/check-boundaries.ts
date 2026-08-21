/* eslint-disable no-await-in-loop -- Package source reads are bounded. */

import { parse as parseBabel } from "@babel/parser";
import { readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import type { StructuredDataValue } from "./structured-data.ts";
import { isObject, isString } from "./value-kinds.ts";

interface Manifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly name: string;
}

interface PackageData {
  readonly dependencies: ReadonlySet<string>;
  readonly directory: string;
  readonly name: string;
}

const babelParser = "@babel/parser";
const babelParserOwner = "@oseo/parser-babel";
const compiler = "@oseo/compiler";
const unicode = "@oseo/unicode";
const compilerOnly = new Set<string>([compiler]);
const allowedInternalDependencies = new Map<string, ReadonlySet<string>>([
  ["@oseo/backend-c", compilerOnly],
  [
    "@oseo/cli",
    new Set([
      "@oseo/backend-c",
      compiler,
      "@oseo/host",
      babelParserOwner,
      "@oseo/runtime-c",
      "@oseo/toolchain-zig",
      unicode,
    ]),
  ],
  [compiler, new Set()],
  ["@oseo/host", compilerOnly],
  [babelParserOwner, compilerOnly],
  ["@oseo/runtime-c", compilerOnly],
  ["@oseo/testkit", compilerOnly],
  ["@oseo/toolchain-zig", compilerOnly],
  // The pinned Unicode tables are self-contained data. Keeping the set empty
  // is what stops the compiler core, a backend, or the runtime adapter from
  // being pulled in behind a table lookup.
  [unicode, new Set()],
]);

interface SyntaxNode {
  readonly [key: string]: StructuredDataValue | undefined;
  readonly type?: StructuredDataValue;
}

function syntaxNode<T>(value: T): SyntaxNode | undefined {
  if (!isObject(value) || Array.isArray(value)) {
    return undefined;
  }
  // SAFETY: The object check establishes this open AST record.
  return value as SyntaxNode;
}

function stringLiteralValue<T>(value: T): string | undefined {
  const node = syntaxNode(value);
  if (node?.type !== "StringLiteral" || !isString(node.value)) {
    return undefined;
  }
  return node.value;
}

function collectImportSpecifiers<T>(
  value: T,
  specifiers: Set<string>,
  visited: WeakSet<object>,
): void {
  if (Array.isArray(value)) {
    for (const child of value) {
      collectImportSpecifiers(child, specifiers, visited);
    }
    return;
  }
  const node = syntaxNode(value);
  if (node == null || visited.has(node)) return;
  visited.add(node);
  let specifier: string | undefined;
  if (
    node.type === "ImportDeclaration" ||
    node.type === "ExportAllDeclaration" ||
    node.type === "ExportNamedDeclaration" ||
    node.type === "ImportExpression"
  ) {
    specifier = stringLiteralValue(node.source);
  } else if (node.type === "TSImportType") {
    specifier = stringLiteralValue(node.argument);
  } else if (node.type === "CallExpression") {
    const callee = syntaxNode(node.callee);
    const args = Array.isArray(node.arguments) ? node.arguments : [];
    if (callee?.type === "Import") {
      specifier = stringLiteralValue(args[0]);
    }
  }
  if (specifier != null) specifiers.add(specifier);
  for (const child of Object.values(node)) {
    collectImportSpecifiers(child, specifiers, visited);
  }
}

function isRelativeSpecifier(specifier: string): boolean {
  return (
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../")
  );
}

function barePackageName(specifier: string): string | undefined {
  if (
    isRelativeSpecifier(specifier) ||
    specifier.startsWith("/") ||
    specifier.startsWith("#") ||
    /^[A-Za-z][A-Za-z\d+.-]*:/u.test(specifier)
  ) {
    return undefined;
  }
  const segments = specifier.split("/");
  if (specifier.startsWith("@")) {
    if (segments.length < 2) {
      throw new Error(`Invalid bare package import: ${specifier}`);
    }
    return `${segments[0]}/${segments[1]}`;
  }
  return segments[0];
}

async function sourceFiles(directory: string): Promise<readonly string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

async function sourceImports(directory: string): Promise<ReadonlySet<string>> {
  const imports = new Set<string>();
  const sourceDirectory = join(directory, "src");
  for (const path of await sourceFiles(sourceDirectory)) {
    const source = await readFile(path, "utf8");
    const syntax = parseBabel(source, {
      plugins: ["typescript"],
      sourceFilename: relative(directory, path),
      sourceType: "module",
    });
    const specifiers = new Set<string>();
    collectImportSpecifiers(syntax, specifiers, new WeakSet());
    for (const specifier of specifiers) {
      if (isRelativeSpecifier(specifier)) {
        const target = resolve(dirname(path), specifier);
        const fromPackage = relative(directory, target);
        if (
          fromPackage === ".." ||
          fromPackage.startsWith(`..${sep}`) ||
          isAbsolute(fromPackage)
        ) {
          throw new Error(
            `${relative(directory, path)} imports outside its package: ` +
              specifier,
          );
        }
        continue;
      }
      const dependency = barePackageName(specifier);
      if (dependency == null) continue;
      if (dependency.startsWith("@oseo/") && dependency !== specifier) {
        throw new Error(
          `${relative(directory, path)} imports another package's ` +
            `private path: ${specifier}`,
        );
      }
      imports.add(dependency);
    }
  }
  return imports;
}

async function sourceImportGraph(
  directory: string,
): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
  const files = await sourceFiles(join(directory, "src"));
  const knownFiles = new Set(files.map((path) => resolve(path)));
  const graph = new Map<string, ReadonlySet<string>>();
  for (const path of files) {
    const source = await readFile(path, "utf8");
    const syntax = parseBabel(source, {
      plugins: ["typescript"],
      sourceFilename: relative(directory, path),
      sourceType: "module",
    });
    const specifiers = new Set<string>();
    collectImportSpecifiers(syntax, specifiers, new WeakSet());
    const dependencies = new Set<string>();
    for (const specifier of specifiers) {
      if (!isRelativeSpecifier(specifier)) continue;
      const target = resolve(dirname(path), specifier);
      if (knownFiles.has(target)) dependencies.add(relative(directory, target));
    }
    graph.set(relative(directory, path), dependencies);
  }
  return graph;
}

function visit(
  name: string,
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  active: Set<string>,
  finished: Set<string>,
  cycleKind: string,
): void {
  if (active.has(name)) {
    throw new Error(`${cycleKind} cycle at ${name}.`);
  }
  if (finished.has(name)) return;
  active.add(name);
  for (const dependency of graph.get(name) ?? []) {
    visit(dependency, graph, active, finished, cycleKind);
  }
  active.delete(name);
  finished.add(name);
}

/** Validate package imports, dependency direction, and graph acyclicity. */
export async function checkPackageBoundaries(root: string): Promise<number> {
  const packagesRoot = join(root, "packages");
  const packages: PackageData[] = [];
  for (const entry of await readdir(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = join(packagesRoot, entry.name);
    // SAFETY: Checked-in package manifests are repository-owned inputs.
    const manifest = JSON.parse(
      await readFile(join(directory, "package.json"), "utf8"),
    ) as Manifest;
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    const imported = await sourceImports(directory);
    for (const dependency of imported) {
      if (dependency !== manifest.name && !declared.has(dependency)) {
        throw new Error(`${manifest.name} does not declare ${dependency}.`);
      }
    }
    if (
      manifest.name !== babelParserOwner &&
      (declared.has(babelParser) || imported.has(babelParser))
    ) {
      throw new Error(
        `${manifest.name} imports the concrete Babel parser. ` +
          `The Babel parser belongs to ${babelParserOwner}.`,
      );
    }
    const internal = new Set(
      [...declared].filter((name) => name.startsWith("@oseo/")),
    );
    packages.push({
      dependencies: internal,
      directory,
      name: manifest.name,
    });
  }
  const graph = new Map(
    packages.map((data) => [data.name, data.dependencies] as const),
  );
  for (const data of packages) {
    for (const dependency of data.dependencies) {
      if (!graph.has(dependency)) {
        throw new Error(`${data.name} declares unknown package ${dependency}.`);
      }
    }
    const allowed = allowedInternalDependencies.get(data.name);
    if (allowed == null) {
      throw new Error(`No dependency boundary is registered for ${data.name}.`);
    }
    for (const dependency of data.dependencies) {
      if (!allowed.has(dependency)) {
        throw new Error(`${data.name} must not depend on ${dependency}.`);
      }
    }
  }
  const finished = new Set<string>();
  for (const name of graph.keys()) {
    visit(name, graph, new Set(), finished, "Package dependency");
  }
  for (const data of packages) {
    if (data.name !== compiler && data.name !== babelParserOwner) continue;
    const sourceGraph = await sourceImportGraph(data.directory);
    const sourceFinished = new Set<string>();
    for (const path of sourceGraph.keys()) {
      visit(path, sourceGraph, new Set(), sourceFinished, "Source import");
    }
  }
  return packages.length;
}

const entryPath = process.argv[1];
if (entryPath != null && pathToFileURL(entryPath).href === import.meta.url) {
  const packageCount = await checkPackageBoundaries(process.cwd());
  console.log(
    `packages=${packageCount} dependency-boundaries=valid ` +
      "source-graphs=acyclic",
  );
}
