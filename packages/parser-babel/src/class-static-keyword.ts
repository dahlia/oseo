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
import { node, nodes, type BabelNode, type SourceIndex } from "./babel.ts";
import { earlyErrorDiagnostic } from "./locations.ts";

/**
 * Reject escapes in the static modifier before profile conversion. Babel
 * decodes the contextual keyword and accepts its escaped spelling. Tokens
 * distinguish the modifier from escaped property names and comment text;
 * the class element's key ends the modifier region. No AST escapes the
 * frontend boundary.
 */
export function classStaticKeywordDiagnostics(
  input: SourceInput,
  index: SourceIndex,
  file: BabelNode,
): readonly Diagnostic[] {
  const tokens = nodes(file.tokens);
  const escapedStarts = new Set(
    tokens
      .filter(
        (token) =>
          node(token.type)?.label === "name" &&
          token.value === "static" &&
          input.source.slice(token.start, token.end) !== "static",
      )
      .map((token) => token.start),
  );
  if (escapedStarts.size === 0) return [];
  const tokenIndices = new Map(tokens.map((token, i) => [token.start, i]));
  const pending = [node(file.program) ?? file];
  const escaped: BabelNode[] = [];
  while (pending.length > 0) {
    const value = pending.pop();
    if (value?.type == null) continue;
    if (value.type === "ClassBody") {
      for (const element of nodes(value.body)) {
        if (element.static !== true) continue;
        const keyStart = node(element.key)?.start;
        const first = tokenIndices.get(element.start);
        if (keyStart == null || first == null) continue;
        for (let i = first; i < tokens.length; i += 1) {
          const token = tokens[i];
          if (token?.start == null || token.start >= keyStart) break;
          if (escapedStarts.has(token.start)) {
            escaped.push(token);
          }
        }
      }
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) {
        for (const childNode of nodes(child)) pending.push(childNode);
      } else {
        const childNode = node(child);
        if (childNode != null) pending.push(childNode);
      }
    }
  }
  return escaped
    .toSorted((a, b) => (a.start ?? 0) - (b.start ?? 0))
    .map((token) =>
      earlyErrorDiagnostic(
        input,
        index,
        token,
        "The static keyword must not contain Unicode escapes.",
      ),
    );
}
