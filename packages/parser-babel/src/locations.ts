import type {
  ByteRange,
  Diagnostic,
  Position,
  SourceInput,
  SourceRange,
} from "@oseo/compiler";
import type {
  BabelNode,
  ConvertContext,
  ParserError,
  SourceIndex,
} from "./babel.ts";

export function utf8Width(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

export function createSourceIndex(source: string): SourceIndex {
  const length = source.length + 1;
  const byteOffsets = Array.from({ length }, () => 0);
  const columns = Array.from({ length }, () => 0);
  const lines = Array.from({ length }, () => 0);
  let byteCount = 0;
  let line = 1;
  let column = 1;
  let offset = 0;
  const record = (): void => {
    byteOffsets[offset] = byteCount;
    columns[offset] = column;
    lines[offset] = line;
  };
  record();
  while (offset < source.length) {
    const character = source[offset];
    if (character === "\r") {
      line += 1;
      column = 1;
      byteCount += 1;
      offset += 1;
      record();
      if (source[offset] === "\n") {
        byteCount += 1;
        offset += 1;
        record();
      }
    } else if (
      character === "\n" ||
      character === "\u2028" ||
      character === "\u2029"
    ) {
      line += 1;
      column = 1;
      byteCount += utf8Width(character.codePointAt(0) ?? 0);
      offset += 1;
      record();
    } else {
      column += 1;
      const codePoint = source.codePointAt(offset) ?? 0;
      if (codePoint > 0xffff) {
        byteCount += 3;
        offset += 1;
        record();
        byteCount += 1;
        offset += 1;
        record();
      } else {
        byteCount += utf8Width(codePoint);
        offset += 1;
        record();
      }
    }
  }
  return { byteOffsets, columns, length: source.length, lines };
}

export function clampOffset(index: SourceIndex, offset: number): number {
  return Math.max(0, Math.min(offset, index.length));
}

export function positionAt(index: SourceIndex, rawOffset: number): Position {
  const offset = clampOffset(index, rawOffset);
  return {
    column: index.columns[offset] ?? 1,
    line: index.lines[offset] ?? 1,
  };
}

export function byteOffset(index: SourceIndex, rawOffset: number): number {
  return index.byteOffsets[clampOffset(index, rawOffset)] ?? 0;
}

export function offsets(value: BabelNode): readonly [number, number] {
  const start = value.start ?? 0;
  return [start, value.end ?? start];
}

export function sourceRange(index: SourceIndex, value: BabelNode): SourceRange {
  const [start, end] = offsets(value);
  return {
    end: positionAt(index, end),
    start: positionAt(index, start),
  };
}

export function bytes(index: SourceIndex, value: BabelNode): ByteRange {
  const [start, end] = offsets(value);
  return {
    end: byteOffset(index, end),
    start: byteOffset(index, start),
  };
}

export interface BabelLocation {
  readonly byteRange: ByteRange;
  readonly range: SourceRange;
}

export function location(
  context: ConvertContext,
  value: BabelNode,
): BabelLocation {
  return {
    byteRange: bytes(context.locations, value),
    range: sourceRange(context.locations, value),
  };
}

export function diagnosticAt(
  input: SourceInput,
  index: SourceIndex,
  rawOffset: number,
): Diagnostic {
  const offset = clampOffset(index, rawOffset);
  const position = positionAt(index, offset);
  const encodedOffset = byteOffset(index, offset);
  return {
    byteRange: { end: encodedOffset, start: encodedOffset },
    code: "OSEO0001",
    message: "Source could not be parsed.",
    range: { end: position, start: position },
    sourceId: input.sourceId,
  };
}

/**
 * Reports one ECMA-262 early error the bootstrap parser did not raise,
 * located at the offending syntax. It carries the parse-rejection code
 * rather than the profile code, because the source is not a valid
 * program in any profile: a construct the parser accepts but the
 * grammar's static semantics forbid belongs here, not among the
 * constructs this profile merely does not implement.
 */
export function earlyError(
  context: ConvertContext,
  value: BabelNode,
  description: string,
): undefined {
  context.diagnostics.push({
    ...location(context, value),
    code: "OSEO0001",
    message: description,
    sourceId: context.input.sourceId,
  });
  return undefined;
}

export function unsupported(
  context: ConvertContext,
  value: BabelNode,
  description?: string,
): undefined {
  context.diagnostics.push({
    ...location(context, value),
    code: "OSEO1001",
    message:
      description ??
      `${value.type ?? "Unknown syntax"} is outside the M1 profile.`,
    sourceId: context.input.sourceId,
  });
  return undefined;
}

export function errorOffset(error: ParserError): number {
  return error.pos ?? error.position ?? error.raisedAt ?? 0;
}
