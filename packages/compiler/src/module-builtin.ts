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

import type { SourceRange } from "./source.ts";
import type {
  BuiltinModuleSpecifier,
  ModuleGraphNode,
  SyntaxModule,
} from "./syntax.ts";

/** The closed export table implemented by the process runtime ABI. */
export const builtinModuleExports = {
  "node:process": ["default", "argv", "env", "exit", "stdout", "stderr"],
  "node:fs": ["default", "readFileSync"],
} as const;

/** Bare names remain package specifiers rather than builtin aliases. */
export function isBuiltinModuleSpecifier(
  specifier: string,
): specifier is BuiltinModuleSpecifier {
  return specifier === "node:process" || specifier === "node:fs";
}

/** Builtins have a stable location for compiler-generated declarations. */
export function moduleNodeRange(node: ModuleGraphNode): SourceRange {
  return node.moduleKind === "builtin"
    ? {
        sourceId: node.canonicalId,
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
      }
    : node.syntax.range;
}

/**
 * A private linking view of the export table. A builtin graph node never
 * carries source syntax and never passes through a source frontend.
 */
export function moduleNodeSyntax(node: ModuleGraphNode): SyntaxModule {
  if (node.moduleKind !== "builtin") return node.syntax;
  const range = moduleNodeRange(node);
  return {
    kind: "module",
    sourceId: node.canonicalId,
    range,
    body: [],
    imports: [],
    exports: builtinModuleExports[node.builtin].map((name) => ({
      kind: "local",
      exportedName: name,
      localName: name,
      range,
    })),
    varNames: [],
  };
}
