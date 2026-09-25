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
