import { node, nodes, type BabelNode } from "./babel.ts";

/** An exported declaration has the placement of its containing wrapper. */
function addPlacedDeclaration(allowed: Set<BabelNode>, value: BabelNode): void {
  allowed.add(value);
  if (
    value.type === "ExportNamedDeclaration" ||
    value.type === "ExportDefaultDeclaration"
  ) {
    const declaration = node(value.declaration);
    if (declaration != null) allowed.add(declaration);
  }
}

/**
 * Whole type-only declarations erase. Inline type specifiers retain an
 * ECMAScript request even when no value specifier remains.
 */
function typeOnlyDeclaration(value: BabelNode): boolean {
  if (value.importKind === "type" || value.exportKind === "type") return true;
  const declaration = node(value.declaration);
  return (
    declaration?.declare === true ||
    (value.type === "ExportNamedDeclaration" &&
      declaration?.type?.startsWith("TS") === true) ||
    declaration?.type === "TSInterfaceDeclaration" ||
    declaration?.type === "TSDeclareFunction"
  );
}

/**
 * Find ECMAScript module declarations anywhere in a Script before profile
 * conversion can mask their grammar errors. Babel's permissive declaration
 * mode is needed for unsupported TS namespaces and module-only extensions;
 * it is not permission to admit ModuleItems into a Script StatementList.
 * TS module bodies have their own grammar and are classified before erasure.
 * Expression extensions are traversed because their executable children
 * still obey the Script grammar. No Babel node leaves the adapter.
 */
export function scriptModuleDeclarations(
  file: BabelNode,
): readonly BabelNode[] {
  const program = node(file.program) ?? file;
  const topLevel = new Set<BabelNode>();
  for (const value of nodes(program.body))
    addPlacedDeclaration(topLevel, value);
  const namespaceMembers = new Set<BabelNode>();
  const pending = [{ value: program, namespace: false }];
  const declarations: BabelNode[] = [];
  while (pending.length > 0) {
    const entry = pending.pop();
    const value = entry?.value;
    if (value?.type == null) continue;
    const namespace =
      entry?.namespace === true || value.type === "TSModuleDeclaration";
    if (value.type === "TSModuleDeclaration") {
      const body = node(value.body);
      if (body?.type === "TSModuleBlock") {
        for (const member of nodes(body.body))
          addPlacedDeclaration(namespaceMembers, member);
      }
    }
    if (value.type === "TSImportEqualsDeclaration") {
      // Direct namespace members have TS placement rules. Nested function or
      // block aliases still fail grammar before whole ambient erasure.
      if (!topLevel.has(value) && !namespaceMembers.has(value))
        declarations.push(value);
    } else if (
      !namespace &&
      (value.type === "ImportDeclaration" ||
        value.type === "ExportNamedDeclaration" ||
        value.type === "ExportDefaultDeclaration" ||
        value.type === "ExportAllDeclaration")
    ) {
      if (!typeOnlyDeclaration(value) || !topLevel.has(value)) {
        declarations.push(value);
      }
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) {
        // A valid statement list can exceed the host's argument limit.
        for (const childNode of nodes(child))
          pending.push({ value: childNode, namespace });
      } else {
        const childNode = node(child);
        if (childNode != null) pending.push({ value: childNode, namespace });
      }
    }
  }
  return declarations.toSorted(
    (left, right) => (left.start ?? 0) - (right.start ?? 0),
  );
}
