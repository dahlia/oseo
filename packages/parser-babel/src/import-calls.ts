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

import type {
  SyntaxImportCall,
  SyntaxModule,
  SyntaxProgram,
} from "@oseo/compiler";
import {
  isString,
  node,
  type BabelNode,
  type BabelNodeValue,
} from "./babel.ts";

/**
 * The string literal of an ImportCall in the static-specifier subset, or
 * `undefined` for every other form. The subset is one string literal
 * argument, optionally parenthesized and followed by the trailing comma
 * the grammar allows, with no options argument, no phase such as
 * `import.defer` or `import.source`, and no type arguments.
 */
export function staticImportSpecifier(value: BabelNode): BabelNode | undefined {
  if (value.type !== "ImportExpression") return undefined;
  if (value.options != null || value.phase != null) return undefined;
  if (value.typeArguments != null || value.typeParameters != null) {
    return undefined;
  }
  // Parentheses cannot change a literal's value, so they are admitted.
  let source = node(value.source);
  while (source?.type === "ParenthesizedExpression") {
    source = node(source.expression);
  }
  return source?.type === "StringLiteral" && isString(source.value)
    ? source
    : undefined;
}

/**
 * Every `import-call` node in converted syntax, in source order. The walk
 * reads the finished tree instead of recording calls during conversion,
 * so a call converted on an abandoned path can never become a request.
 * Owned syntax is plain data, so the walk reads it as the open records
 * that Babel nodes also are.
 */
export function collectImportCalls(
  syntax: SyntaxModule | SyntaxProgram,
): readonly SyntaxImportCall[] {
  const calls = new Map<string, SyntaxImportCall>();
  const seen = new Set<BabelNode>();
  const pending: BabelNodeValue[] = Object.values(syntax);
  while (pending.length > 0) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      // A statement list can exceed the host's argument limit.
      for (const item of value) pending.push(item);
      continue;
    }
    const record = node(value);
    if (record == null || seen.has(record)) continue;
    seen.add(record);
    if (isImportCall(record)) {
      const call = record;
      const start = call.byteRange?.start ?? 0;
      const end = call.byteRange?.end ?? 0;
      calls.set(`${start}:${end}`, call);
      continue;
    }
    for (const child of Object.values(record)) pending.push(child);
  }
  return [...calls.values()].toSorted(
    (left, right) =>
      (left.byteRange?.start ?? 0) - (right.byteRange?.start ?? 0),
  );
}

/** True for a record that conversion created as an `import-call` node. */
function isImportCall(value: BabelNode): value is BabelNode & SyntaxImportCall {
  return value.kind === "import-call";
}
