/* eslint-disable no-await-in-loop -- Repository source reads are bounded. */
import { parse } from "@babel/parser";
import { readFile, readdir } from "node:fs/promises";
import { posix } from "node:path";
import { pathToFileURL } from "node:url";
import type { StructuredDataValue } from "./structured-data.ts";
import { isObject, isString } from "./value-kinds.ts";

interface SyntaxNode {
  readonly [key: string]: StructuredDataValue | undefined;
}

function node<Candidate>(value: Candidate): SyntaxNode | undefined {
  if (!isObject(value) || Array.isArray(value)) return undefined;
  // SAFETY: Babel nodes are open records of structured syntax values.
  return value as SyntaxNode;
}

function literal<Candidate>(value: Candidate): string | undefined {
  const syntax = node(value);
  if (
    syntax?.type === "TemplateLiteral" &&
    Array.isArray(syntax.expressions) &&
    syntax.expressions.length === 0 &&
    Array.isArray(syntax.quasis) &&
    syntax.quasis.length === 1
  ) {
    const quasiValue = node(node(syntax.quasis[0])?.value);
    return isString(quasiValue?.cooked) ? quasiValue.cooked : undefined;
  }
  return syntax?.type === "StringLiteral" && isString(syntax.value)
    ? syntax.value
    : undefined;
}

function walk<Candidate>(
  value: Candidate,
  visit: (syntax: SyntaxNode) => void,
): void {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit);
    return;
  }
  const syntax = node(value);
  if (syntax == null) return;
  visit(syntax);
  for (const child of Object.values(syntax)) walk(child, visit);
}

function importPath(path: string, destination: string): string {
  const relative = posix.relative(posix.dirname(path), destination);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

/** Report concrete adapter imports that bypass native test composition. */
export function checkNativeToolchainSource(
  path: string,
  source: string,
): readonly string[] {
  // The selector owns adapter selection. Adapter unit tests must exercise
  // the concrete implementation rather than whichever lane was selected.
  if (
    path === "tests/native-toolchain.ts" ||
    /^packages\/toolchain-(?:zig|host-cc)\/tests\//u.test(path)
  )
    return [];
  const problems = new Set<string>();
  const defaultBindings = new Set<string>();
  const syntax = parse(source, {
    plugins: ["typescript"],
    sourceType: "module",
  });
  walk(syntax, (entry) => {
    if (entry.importKind === "type" || entry.exportKind === "type") return;
    const bindings = Array.isArray(entry.specifiers) ? entry.specifiers : [];
    if (
      bindings.length > 0 &&
      bindings.every((item) => {
        const binding = node(item);
        return binding?.importKind === "type" || binding?.exportKind === "type";
      })
    )
      return;
    let specifier = literal(entry.source);
    if (entry.type === "CallExpression") {
      const callee = node(entry.callee);
      if (
        callee?.type === "Import" ||
        (callee?.type === "Identifier" && callee.name === "require")
      ) {
        specifier = literal(
          Array.isArray(entry.arguments) ? entry.arguments[0] : undefined,
        );
      }
    }
    if (specifier == null) return;
    const resolved = specifier.startsWith(".")
      ? posix.normalize(posix.join(posix.dirname(path), specifier))
      : specifier;
    const adapter =
      /^(?:@oseo\/toolchain-[^/]+|packages\/toolchain-[^/]+)(?:\/|$)/u.test(
        resolved,
      );
    const cli = /^(?:@oseo\/cli|packages\/cli)(?:\/|$)/u.test(resolved);
    const specifiers = Array.isArray(entry.specifiers) ? entry.specifiers : [];
    if (cli && entry.type === "ImportDeclaration") {
      for (const value of specifiers) {
        const item = node(value);
        const imported = node(item?.imported);
        const local = node(item?.local);
        if (
          item?.importKind !== "type" &&
          (imported?.name === "defaultComponents" ||
            literal(imported) === "defaultComponents") &&
          isString(local?.name)
        )
          defaultBindings.add(local.name);
      }
    }
    const directCli =
      cli &&
      ((entry.type !== "ImportDeclaration" &&
        entry.type !== "ExportNamedDeclaration") ||
        specifiers.some((value) => {
          const item = node(value);
          if (item?.importKind === "type" || item?.exportKind === "type")
            return false;
          const imported = node(item?.imported ?? item?.local);
          return (
            item?.type === "ImportNamespaceSpecifier" ||
            item?.type === "ExportNamespaceSpecifier" ||
            imported?.name === "runNativeCli" ||
            literal(imported) === "runNativeCli"
          );
        }));
    if (!adapter && !directCli) return;
    const destination = adapter
      ? "tests/native-toolchain.ts"
      : "tests/native-cli.ts";
    const name = adapter ? "nativeToolchain" : "runNativeCli";
    const modulePath = importPath(path, destination);
    const replacement = `import { ${name} } from "${modulePath}";`;
    problems.add(
      `${path}: ${specifier} bypasses native sanitizer ` +
        `selection. Use ${replacement}`,
    );
  });
  const allowed = new Set<SyntaxNode>();
  walk(syntax, (entry) => {
    const object = node(entry.object);
    const property = node(entry.property);
    if (
      (entry.type === "MemberExpression" ||
        entry.type === "OptionalMemberExpression") &&
      !entry.computed &&
      property?.type === "Identifier" &&
      property.name !== "toolchain" &&
      object != null
    )
      allowed.add(object);
    if (entry.type === "ImportSpecifier") {
      const local = node(entry.local);
      const imported = node(entry.imported);
      if (local != null) allowed.add(local);
      if (imported != null) allowed.add(imported);
    }
    if (entry.type === "TSTypeQuery") {
      const name = node(entry.exprName);
      if (name != null) allowed.add(name);
    }
  });
  walk(syntax, (entry) => {
    if (
      entry.type === "Identifier" &&
      isString(entry.name) &&
      defaultBindings.has(entry.name) &&
      !allowed.has(entry)
    ) {
      const modulePath = importPath(path, "tests/native-toolchain.ts");
      problems.add(
        `${path}: defaultComponents exposes the default Zig ` +
          `toolchain. Use import { nativeToolchain } from "${modulePath}";`,
      );
    }
  });
  return [...problems];
}

async function sources(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const path = posix.join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await sources(path)));
    else if (entry.isFile() && path.endsWith(".ts")) paths.push(path);
  }
  return paths.toSorted();
}

/** Scan all integration tests and the other sanitizer-lane entry points. */
export async function checkNativeToolchains(
  root: string,
): Promise<readonly string[]> {
  const paths = [posix.join(root, "tools/test262.ts")];
  for (const directory of [
    "tests",
    "tools/native-io",
    "packages/toolchain-zig/tests",
    "packages/toolchain-host-cc/tests",
  ]) {
    paths.push(...(await sources(posix.join(root, directory))));
  }
  const problems: string[] = [];
  for (const path of paths) {
    problems.push(
      ...checkNativeToolchainSource(
        posix.relative(root, path),
        await readFile(path, "utf8"),
      ),
    );
  }
  return problems;
}

const entryPath = process.argv[1];
if (entryPath != null && pathToFileURL(entryPath).href === import.meta.url) {
  const problems = await checkNativeToolchains(process.cwd());
  if (problems.length > 0) throw new Error(problems.join("\n"));
  console.log("native-toolchain-selection=valid");
}
