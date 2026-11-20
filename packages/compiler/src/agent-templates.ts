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
  SyntaxCallArgument,
  SyntaxCallTarget,
  SyntaxExpression,
} from "./syntax.ts";

/**
 * The global name of the test262 host object a Script compiled for the
 * test262 host reads.
 */
export const test262HostGlobalName = "$262";

/**
 * One `$262.agent.start` source template found in a Script: the cooked
 * literal text around each substitution of a template literal, or the
 * whole text of a string literal, which has no substitution.
 */
export interface AgentSourceTemplate {
  readonly range: SourceRange;
  readonly segments: readonly string[];
}

function stringKey(expression: SyntaxExpression, name: string): boolean {
  return expression.kind === "string" && expression.value === name;
}

/** Whether a call target is exactly `$262.agent.start`. */
export function isAgentStartTarget(target: SyntaxCallTarget): boolean {
  if (target.kind !== "property" || !stringKey(target.key, "start")) {
    return false;
  }
  const agent = target.object;
  if (agent.kind !== "property-get" || !stringKey(agent.key, "agent")) {
    return false;
  }
  return (
    agent.object.kind === "identifier" &&
    agent.object.name === test262HostGlobalName
  );
}

/**
 * The literal runs of a start argument. The frontend lowers an untagged
 * template literal to a left-nested `+` chain that starts with its first
 * cooked string and continues with a `to-string` conversion for each
 * substitution and a string for each nonempty later run, so the chain is
 * read back into runs with one hole per conversion. A plain string literal
 * is one run, and a chain of string literals is their concatenation. Any
 * other argument has no template, and a start with it reaches the
 * runtime's owned boundary instead.
 */
export function agentTemplateSegments(
  argument: SyntaxCallArgument | undefined,
): readonly string[] | undefined {
  if (argument == null || argument.kind === "spread") return undefined;
  const pieces: SyntaxExpression[] = [];
  let current: SyntaxExpression = argument;
  while (current.kind === "binary" && current.operator === "+") {
    pieces.push(current.right);
    current = current.left;
  }
  if (current.kind !== "string") return undefined;
  const segments = [current.value];
  for (const piece of pieces.toReversed()) {
    if (piece.kind === "unary" && piece.operator === "to-string") {
      segments.push("");
    } else if (piece.kind === "string") {
      segments[segments.length - 1] += piece.value;
    } else {
      return undefined;
    }
  }
  return segments;
}
