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

import type { Hint, HintName } from "@oseo/compiler";
import {
  node,
  type BabelComment,
  type BabelNode,
  type BabelNodeValue,
  type ConvertContext,
} from "./babel.ts";
import { sourceRange } from "./locations.ts";

const hintNames: ReadonlyMap<string, HintName> = new Map<string, HintName>([
  ["TSAnyKeyword", "any"],
  ["TSBigIntKeyword", "bigint"],
  ["TSBooleanKeyword", "boolean"],
  ["TSNullKeyword", "null"],
  ["TSNumberKeyword", "number"],
  ["TSStringKeyword", "string"],
  ["TSUndefinedKeyword", "undefined"],
  ["TSUnknownKeyword", "unknown"],
]);

export function typeHint(
  context: ConvertContext,
  annotationValue: BabelNodeValue,
): Hint | undefined {
  const annotation = node(annotationValue);
  if (annotation == null) return undefined;
  const typeNode =
    annotation.type === "TSTypeAnnotation"
      ? node(annotation.typeAnnotation)
      : annotation;
  if (typeNode == null) return undefined;
  let name = hintNames.get(typeNode.type ?? "");
  if (typeNode.type === "TSLiteralType") {
    const literal = node(typeNode.literal);
    if (literal?.type === "NullLiteral") name = "null";
  }
  if (name == null) {
    return undefined;
  }
  return {
    name,
    provenance: "typescript",
    range: sourceRange(context.locations, typeNode),
  };
}

export function hintName(value: string): HintName | undefined {
  if (
    value === "any" ||
    value === "bigint" ||
    value === "boolean" ||
    value === "null" ||
    value === "number" ||
    value === "string" ||
    value === "undefined" ||
    value === "unknown"
  ) {
    return value;
  }
  return undefined;
}

export interface JsdocHints {
  readonly parameters: ReadonlyMap<string, Hint>;
  readonly returns: readonly Hint[];
}

export function isJsdocComment(
  context: ConvertContext,
  comment: BabelComment,
): boolean {
  return (
    comment.type === "CommentBlock" &&
    comment.start != null &&
    context.input.source.startsWith("/**", comment.start)
  );
}

export function jsdocHints(
  context: ConvertContext,
  declaration: BabelNode,
): JsdocHints {
  const parameters = new Map<string, Hint>();
  const returns: Hint[] = [];
  for (const comment of declaration.leadingComments ?? []) {
    if (!isJsdocComment(context, comment)) continue;
    const value = comment.value ?? "";
    const commentNode: BabelNode = {
      end: comment.end ?? 0,
      start: comment.start ?? 0,
      type: "CommentBlock",
    };
    const range = sourceRange(context.locations, commentNode);
    const parameterPattern =
      /@param\s+\{(\w+)\}\s+([\p{ID_Start}_$][\p{ID_Continue}$]*)/gu;
    for (const match of value.matchAll(parameterPattern)) {
      const name = hintName(match[1] ?? "");
      const parameter = match[2];
      if (name != null && parameter != null) {
        parameters.set(parameter, {
          name,
          provenance: "jsdoc",
          range,
        });
      }
    }
    const returnPattern = /@returns?\s+\{(\w+)\}/gu;
    for (const match of value.matchAll(returnPattern)) {
      const name = hintName(match[1] ?? "");
      if (name != null) {
        returns.push({ name, provenance: "jsdoc", range });
      }
    }
  }
  return { parameters, returns };
}
