import { node, nodes, type BabelNode } from "./babel.ts";

/**
 * TS-only import/export forms retain their unsupported-extension policy.
 * Mixed lists with a value entry still contain an ECMAScript declaration.
 */
function typeOnlyDeclaration(value: BabelNode): boolean {
  if (value.importKind === "type" || value.exportKind === "type") return true;
  const specifiers = nodes(value.specifiers);
  if (
    specifiers.length > 0 &&
    specifiers.every(
      (specifier) =>
        specifier.importKind === "type" || specifier.exportKind === "type",
    )
  ) {
    return true;
  }
  const declaration = node(value.declaration);
  return (
    declaration?.declare === true ||
    (value.type === "ExportNamedDeclaration" &&
      declaration?.type?.startsWith("TS") === true) ||
    declaration?.type === "TSInterfaceDeclaration"
  );
}

/**
 * Find ECMAScript module declarations anywhere in a Script before profile
 * conversion can mask their grammar errors. Babel's permissive declaration
 * mode is needed for unsupported TS namespaces and module-only extensions;
 * it is not permission to admit ModuleItems into a Script StatementList.
 * TS module bodies have their own grammar and stay unsupported as a whole.
 * Expression extensions are traversed because their executable children
 * still obey the Script grammar. No Babel node leaves the adapter.
 */
export function scriptModuleDeclarations(
  file: BabelNode,
): readonly BabelNode[] {
  const pending = [node(file.program) ?? file];
  const declarations: BabelNode[] = [];
  while (pending.length > 0) {
    const value = pending.pop();
    if (value?.type == null || value.type === "TSModuleDeclaration") continue;
    if (
      value.type === "ImportDeclaration" ||
      value.type === "ExportNamedDeclaration" ||
      value.type === "ExportDefaultDeclaration" ||
      value.type === "ExportAllDeclaration"
    ) {
      if (!typeOnlyDeclaration(value)) declarations.push(value);
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) {
        // A valid statement list can exceed the host's argument limit.
        for (const childNode of nodes(child)) pending.push(childNode);
      } else {
        const childNode = node(child);
        if (childNode != null) pending.push(childNode);
      }
    }
  }
  return declarations.toSorted(
    (left, right) => (left.start ?? 0) - (right.start ?? 0),
  );
}
