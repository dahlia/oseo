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
  LoadedJsonModule,
  SyntaxExpression,
  SyntaxModule,
} from "./syntax.ts";
import type { SourceRange } from "./source.ts";

/** Shapes guaranteed by the edition JSON grammar at the parse boundary. */
type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | JsonObject;
interface JsonObject {
  readonly [key: string]: JsonValue;
}
function isJsonBoolean(value: JsonValue): value is boolean {
  return typeof value === "boolean";
}
function isJsonNumber(value: JsonValue): value is number {
  return typeof value === "number";
}
function isJsonString(value: JsonValue): value is string {
  return typeof value === "string";
}
function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

/**
 * Construct data through generic owned syntax, never a mutable JSON global
 * or a JavaScript reparse. JSON.parse supplies edition JSON grammar only.
 */
function jsonExpression(
  value: JsonValue,
  range: SourceRange,
): SyntaxExpression {
  if (value === null) return { kind: "null", range };
  if (isJsonBoolean(value)) return { kind: "boolean", range, value };
  if (isJsonNumber(value)) return { kind: "number", range, value };
  if (isJsonString(value)) return { kind: "string", range, value };
  if (isJsonArray(value)) {
    return {
      elements: value.map((element) => jsonExpression(element, range)),
      kind: "array",
      range,
    };
  }
  return {
    kind: "object",
    properties: Object.entries(value).map(([key, element]) => ({
      key: { kind: "string", range, value: key },
      kind: "definition",
      value: jsonExpression(element, range),
    })),
    range,
  };
}

/** Validate JSON and produce a default-only synthetic module. */
export function jsonModuleSyntax(source: LoadedJsonModule): SyntaxModule {
  const range: SourceRange = {
    end: { column: 1, line: 1 },
    sourceId: source.sourceId,
    start: { column: 1, line: 1 },
  };
  // SAFETY: JSON.parse validates grammar and creates only JsonValue shapes.
  const value = JSON.parse(source.source) as JsonValue;
  return {
    body: [],
    exports: [
      {
        declaration: jsonExpression(value, range),
        exportedName: "default",
        kind: "default",
        range,
      },
    ],
    imports: [],
    kind: "module",
    range,
    sourceId: source.sourceId,
    varNames: [],
  };
}
