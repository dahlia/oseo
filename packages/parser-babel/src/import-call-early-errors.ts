import type { Diagnostic, SourceInput } from "@oseo/compiler";
import { node, nodes, type BabelNode, type SourceIndex } from "./babel.ts";
import { earlyErrorDiagnostic } from "./locations.ts";

/**
 * True when a Babel node is an ImportCall, in either the default
 * `CallExpression` with an `Import` callee or the `ImportExpression` shape.
 */
function importCall(value: BabelNode): boolean {
  if (value.type === "ImportExpression") return true;
  return (
    value.type === "CallExpression" && node(value.callee)?.type === "Import"
  );
}

/**
 * The ImportCall at the head of a `new` operand, if any. ECMA-262's
 * NewExpression and `new MemberExpression Arguments` productions accept only
 * a MemberExpression after `new`, and an ImportCall is a CallExpression, so
 * an unparenthesized ImportCall may not begin that operand. Babel rejects
 * only a bare `new import(...)` and accepts `new import(...).name`, element
 * access, and a tagged template. A ParenthesizedExpression ends the walk:
 * `new (import(...)).name` is a valid PrimaryExpression operand.
 */
function newOperandImportCall(callee: BabelNode): BabelNode | undefined {
  let current: BabelNode | undefined = callee;
  while (current != null) {
    if (importCall(current)) return current;
    if (current.type === "MemberExpression") {
      current = node(current.object);
    } else if (current.type === "TaggedTemplateExpression") {
      current = node(current.tag);
    } else {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Find each ImportCall that begins the operand of `new` anywhere in a
 * parsed Script or Module, in source order. These are ECMA-262 grammar
 * errors the bootstrap parser accepts. The frontends report them before
 * profile conversion so the ImportCall's profile diagnostic cannot mask a
 * program that no profile could admit. No Babel node leaves the adapter.
 */
function newImportCalls(file: BabelNode): readonly BabelNode[] {
  const pending = [node(file.program) ?? file];
  const calls: BabelNode[] = [];
  while (pending.length > 0) {
    const value = pending.pop();
    if (value?.type == null) continue;
    if (value.type === "NewExpression") {
      const callee = node(value.callee);
      const call = callee == null ? undefined : newOperandImportCall(callee);
      if (call != null) calls.push(call);
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
  return calls.toSorted(
    (left, right) => (left.start ?? 0) - (right.start ?? 0),
  );
}

/**
 * One OSEO0001 early error per ImportCall that begins a `new` operand,
 * located at that ImportCall. The ImportCall itself stays outside the
 * profile under ADR 0016; this reports only the grammar error.
 */
export function newImportCallDiagnostics(
  input: SourceInput,
  index: SourceIndex,
  file: BabelNode,
): readonly Diagnostic[] {
  return newImportCalls(file).map((call) =>
    earlyErrorDiagnostic(
      input,
      index,
      call,
      "An import() call cannot be the operand of new.",
    ),
  );
}
