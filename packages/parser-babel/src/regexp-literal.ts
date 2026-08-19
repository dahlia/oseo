import { parseRegExpLiteral } from "@oseo/compiler";
import type {
  Diagnostic,
  RegExpLiteralSyntax,
  RegExpPatternError,
} from "@oseo/compiler";

import {
  isString,
  type BabelNode,
  type ConvertContext,
  type SourceIndex,
} from "./babel.ts";
import { byteOffset, location, offsets, positionAt } from "./locations.ts";

/**
 * Build the owned record of one regular expression literal.
 *
 * The record keeps the written pattern text, flag text, and source
 * location, so no bootstrap-parser node survives the frontend boundary
 * and the owned parser is the only reader of the pattern grammar.
 */
export function regExpLiteralSyntax(
  context: ConvertContext,
  value: BabelNode,
): RegExpLiteralSyntax | undefined {
  const pattern = value.pattern;
  const flags = value.flags ?? "";
  if (!isString(pattern) || !isString(flags)) {
    return undefined;
  }
  return {
    ...location(context, value),
    flags,
    kind: "regexp-literal",
    pattern,
  };
}

/**
 * Map one pattern-relative span back into the enclosing source.
 *
 * A literal writes its pattern between two solidus characters and its
 * flags after the second one, and neither part may contain a line
 * terminator, so a span offset shifts by a fixed distance rather than
 * needing a second scan of the source.
 */
function diagnosticFor(
  input: { readonly sourceId: string },
  locations: SourceIndex,
  start: number,
  literal: RegExpLiteralSyntax,
  error: RegExpPatternError,
): Diagnostic {
  const base =
    error.section === "flags" ? start + literal.pattern.length + 2 : start + 1;
  const from = base + error.span.start;
  const to = Math.max(from, base + error.span.end);
  return {
    byteRange: {
      end: byteOffset(locations, to),
      start: byteOffset(locations, from),
    },
    code: error.kind === "invalid" ? "OSEO0001" : "OSEO1001",
    message: error.message,
    range: {
      end: positionAt(locations, to),
      start: positionAt(locations, from),
    },
    sourceId: input.sourceId,
  };
}

/**
 * Validate one regular expression literal and report its boundary.
 *
 * An invalid pattern or flag set is an ECMA-262 early error, so it is
 * reported at the offending text with the parse-rejection code. A
 * pattern this profile cannot evaluate is reported once at the literal,
 * because the syntax is valid and only its evaluation is unavailable.
 */
export function regExpLiteral(
  context: ConvertContext,
  value: BabelNode,
): undefined {
  const literal = regExpLiteralSyntax(context, value);
  if (literal == null) {
    context.diagnostics.push({
      ...location(context, value),
      code: "OSEO0001",
      message: "A regular expression literal could not be read.",
      sourceId: context.input.sourceId,
    });
    return undefined;
  }
  const result = parseRegExpLiteral(literal);
  const [start] = offsets(value);
  for (const error of result.errors) {
    context.diagnostics.push(
      diagnosticFor(context.input, context.locations, start, literal, error),
    );
  }
  if (result.errors.length > 0) return undefined;
  context.diagnostics.push({
    ...location(context, value),
    code: "OSEO1001",
    message: "Regular expression evaluation is outside the M5 profile.",
    sourceId: context.input.sourceId,
  });
  return undefined;
}
