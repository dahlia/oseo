/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type { Diagnostic, SourceInput } from "@oseo/compiler";
import {
  node,
  nodes,
  type BabelNode,
  type ParserError,
  type SourceIndex,
} from "./babel.ts";
import { unparenthesizedExpression } from "./convert.ts";
import {
  diagnosticAt,
  earlyErrorDiagnostic,
  errorOffset,
} from "./locations.ts";

const newImportMessage = "An import() call cannot be the operand of new.";
const newImportReason = "ImportCallNotNewExpression";

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
 * an unparenthesized ImportCall may not begin that operand. A
 * ParenthesizedExpression ends the walk:
 * `new (import(...)).name` is a valid PrimaryExpression operand.
 * A TypeScript non-null assertion is transparent before erasure.
 */
function newOperandImportCall(callee: BabelNode): BabelNode | undefined {
  let current: BabelNode | undefined = callee;
  while (current != null) {
    if (importCall(current)) return current;
    if (current.type === "MemberExpression") {
      current = node(current.object);
    } else if (current.type === "TaggedTemplateExpression") {
      current = node(current.tag);
    } else if (current.type === "TSNonNullExpression") {
      current = node(current.expression);
    } else {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Walk either source goal without recursing on the host stack.
 */
function* syntaxNodes(file: BabelNode): Iterable<BabelNode> {
  const pending = [node(file.program) ?? file];
  while (pending.length > 0) {
    const value = pending.pop();
    if (value?.type == null) continue;
    yield value;
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
}

/**
 * One OSEO0001 early error per ImportCall that begins a `new` operand,
 * located at that ImportCall. Run before profile conversion so an earlier
 * unsupported construct cannot mask the grammar error.
 */
export function newImportCallDiagnostics(
  input: SourceInput,
  index: SourceIndex,
  file: BabelNode,
): readonly Diagnostic[] {
  const calls: BabelNode[] = [];
  for (const value of syntaxNodes(file)) {
    const callee = value.type === "NewExpression" ? node(value.callee) : null;
    const call = callee == null ? undefined : newOperandImportCall(callee);
    if (call != null) calls.push(call);
  }
  return calls
    .toSorted((left, right) => (left.start ?? 0) - (right.start ?? 0))
    .map((call) => earlyErrorDiagnostic(input, index, call, newImportMessage));
}

/**
 * Report Babel errors that Oseo's own grammar checks do not handle.
 * Match each recoverable Babel 8.1 error against the tree that raised it.
 * Type erasure and Oseo's grammar checks then handle those cases.
 */
export function unhandledParserDiagnostics(
  input: SourceInput,
  index: SourceIndex,
  file: BabelNode,
  errors: readonly ParserError[],
): readonly Diagnostic[] {
  const handled = new Set<string>();
  const reasons = new Set(errors.map((error) => error.reasonCode));
  if (
    reasons.has(newImportReason) ||
    reasons.has("StrictDelete") ||
    reasons.has("DeletePrivateField")
  ) {
    for (const value of syntaxNodes(file)) {
      if (value.type === "NewExpression") {
        const callee = node(value.callee);
        if (callee == null || importCall(callee)) continue;
        const call = newOperandImportCall(callee);
        if (call?.start != null) {
          handled.add(`${newImportReason}:${call.start}`);
        }
      }
      if (
        value.type !== "UnaryExpression" ||
        value.operator !== "delete" ||
        value.start == null ||
        node(value.argument)?.type !== "ParenthesizedExpression"
      )
        continue;
      const operand = unparenthesizedExpression(value.argument);
      if (operand?.type === "Identifier") {
        handled.add(`StrictDelete:${value.start}`);
      } else if (
        operand != null &&
        node(operand.property)?.type === "PrivateName"
      ) {
        handled.add(`DeletePrivateField:${value.start}`);
      }
    }
  }
  return errors.flatMap((error) => {
    const offset = errorOffset(error);
    return handled.has(`${error.reasonCode}:${offset}`)
      ? []
      : [diagnosticAt(input, index, offset)];
  });
}
