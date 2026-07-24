import type {
  ModuleFrontendResult,
  SourceInput,
  SyntaxExportEntry,
  SyntaxImportEntry,
  SyntaxModule,
  SyntaxFunction,
  SyntaxStatement,
} from "@oseo/compiler";
import {
  node,
  nodes,
  type BabelNode,
  type ConvertContext,
  type ParserError,
} from "./babel.ts";
import {
  expression,
  functionDeclaration,
  hoistedVarDeclarations,
  identifierName,
  moduleName,
  moduleSpecifier,
  patternNames,
  statement,
  varScopedFunctionNames,
} from "./convert.ts";
import {
  createSourceIndex,
  diagnosticAt,
  errorOffset,
  location,
  unsupported,
} from "./locations.ts";

export function exportForDeclaration(
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

export function hasModuleAttributes(
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

export function moduleProgram(
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

export function convertModule(
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
