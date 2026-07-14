import { parse as parseBabel } from "@babel/parser";
import type {
  Diagnostic,
  FrontendResult,
  Position,
  SourceFrontend,
  SourceInput,
} from "@oseo/compiler";

interface ParserError {
  readonly pos?: number;
  readonly position?: number;
  readonly raisedAt?: number;
}

interface BabelFile {
  readonly errors?: readonly ParserError[];
}

function clampOffset(source: string, offset: number): number {
  return Math.max(0, Math.min(offset, source.length));
}

function positionAt(source: string, rawOffset: number): Position {
  const offset = clampOffset(source, rawOffset);
  let line = 1;
  let column = 1;
  let index = 0;
  while (index < offset) {
    const character = source[index];
    if (character === "\r") {
      line += 1;
      column = 1;
      index += source[index + 1] === "\n" && index + 1 < offset ? 2 : 1;
    } else if (
      character === "\n" ||
      character === "\u2028" ||
      character === "\u2029"
    ) {
      line += 1;
      column = 1;
      index += 1;
    } else {
      column += 1;
      const codePoint = source.codePointAt(index);
      index += codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
    }
  }
  return { column, line };
}

function diagnosticAt(input: SourceInput, rawOffset: number): Diagnostic {
  const offset = clampOffset(input.source, rawOffset);
  const byteOffset = new TextEncoder().encode(
    input.source.slice(0, offset),
  ).length;
  const position = positionAt(input.source, offset);
  return {
    byteRange: { end: byteOffset, start: byteOffset },
    code: "OSEO0001",
    message: "Source could not be parsed.",
    range: { end: position, start: position },
    sourceId: input.sourceId,
  };
}

function errorOffset(error: ParserError): number {
  return error.pos ?? error.position ?? error.raisedAt ?? 0;
}

/** Babel implementation of the owned Oseo source-frontend boundary. */
export const babelFrontend: SourceFrontend = {
  parse(input: SourceInput): FrontendResult {
    try {
      const file = parseBabel(input.source, {
        attachComment: true,
        errorRecovery: true,
        plugins: ["typescript"],
        sourceType: "script",
        tokens: true,
      }) as unknown as BabelFile;
      const diagnostics = (file.errors ?? []).map((error) =>
        diagnosticAt(input, errorOffset(error)),
      );
      return {
        diagnostics,
        parsed: diagnostics.length === 0,
        sourceId: input.sourceId,
      };
    } catch (error) {
      const value = error as ParserError;
      return {
        diagnostics: [diagnosticAt(input, errorOffset(value))],
        parsed: false,
        sourceId: input.sourceId,
      };
    }
  },
};
