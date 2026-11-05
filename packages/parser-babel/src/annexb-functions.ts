import { node, nodes, type BabelNode, type BabelNodeValue } from "./babel.ts";

/**
 * Function declarations that Annex B.3.1 admitted as the item of a
 * LabelledStatement. The normalization below replaces each such
 * statement with its function declaration, so this set keeps the one
 * fact the replacement loses: B.3.2's var-scoped copy applies only to a
 * function declaration directly contained in a Block, CaseClause, or
 * DefaultClause statement list, never to a labelled one.
 */
const labelledFunctions = new WeakSet<BabelNode>();

/** True when Annex B.3.1 admitted this declaration under a label. */
export function isLabelledFunctionDeclaration(value: BabelNode): boolean {
  return labelledFunctions.has(value);
}

/** Keys that hold parser metadata rather than child syntax. */
const metadataKeys: ReadonlySet<string> = new Set([
  "comments",
  "extra",
  "innerComments",
  "leadingComments",
  "loc",
  "tokens",
  "trailingComments",
]);

/** Keys whose array value is a StatementList. */
const statementListKeys: ReadonlySet<string> = new Set(["body", "consequent"]);

/**
 * The function declaration a LabelledStatement chain ends in, or
 * undefined when the chain ends in any other statement.
 */
function labelledFunction(value: BabelNode): BabelNode | undefined {
  let current: BabelNode | undefined = value;
  while (current?.type === "LabeledStatement") current = node(current.body);
  return current?.type === "FunctionDeclaration" ? current : undefined;
}

/** A Block whose only item is the given function declaration. */
function syntheticBlock(declaration: BabelNode): BabelNode {
  const { end, loc, start } = declaration;
  if (start == null || end == null) {
    return { body: [declaration], directives: [], loc, type: "BlockStatement" };
  }
  return {
    body: [declaration],
    directives: [],
    end,
    loc,
    start,
    type: "BlockStatement",
  };
}

/**
 * Rewrite the two Annex B function declaration positions into the
 * StatementList forms that the rest of the conversion already handles.
 *
 * B.3.3 evaluates `if (x) function f() {}` as if the declaration were the
 * sole item of a Block, so each such clause becomes a synthetic Block
 * with the declaration's own location. B.3.1 admits a labelled function
 * declaration; no `break` or `continue` can target its labels, because a
 * function body is a new label scope, so each such item of a
 * StatementList becomes the declaration itself. Babel reports both forms
 * in strict code and every other labelled-function position, so this
 * pass only sees the non-strict forms the edition defines.
 */
export function normalizeAnnexBFunctionStatements(file: BabelNode): void {
  const pending = [node(file.program) ?? file];
  while (pending.length > 0) {
    const value = pending.pop();
    if (value?.type == null) continue;
    // SAFETY: Babel nodes are plain mutable objects; the BabelNode view
    // is read-only only to keep conversion code from editing the tree.
    const writable = value as Record<string, BabelNodeValue>;
    if (value.type === "IfStatement") {
      for (const key of ["consequent", "alternate"]) {
        const branch = node(value[key]);
        if (branch?.type === "FunctionDeclaration") {
          writable[key] = syntheticBlock(branch);
        }
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (metadataKeys.has(key)) continue;
      if (Array.isArray(child)) {
        if (statementListKeys.has(key)) {
          for (const [index, item] of child.entries()) {
            const itemNode = node(item);
            if (itemNode?.type !== "LabeledStatement") continue;
            const declaration = labelledFunction(itemNode);
            if (declaration == null) continue;
            labelledFunctions.add(declaration);
            child[index] = declaration;
          }
        }
        // A valid statement list can exceed the host's argument limit.
        for (const childNode of nodes(child)) pending.push(childNode);
      } else {
        const childNode = node(child);
        if (childNode != null) pending.push(childNode);
      }
    }
  }
}
