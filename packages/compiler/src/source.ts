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

/** Stable diagnostic codes owned by the Oseo compiler. */
export type DiagnosticCode = "OSEO0001" | "OSEO1001" | "OSEO2001" | "OSEO3001";

/** A half-open UTF-8 byte range. */
export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/** A one-based Unicode scalar-value source position. */
export interface Position {
  readonly line: number;
  readonly column: number;
}

/** A half-open source range with optional retained module identity. */
export interface SourceRange {
  readonly start: Position;
  readonly end: Position;
  readonly sourceId?: string;
}

/** A source-located error independent of a bootstrap parser or host. */
export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly sourceId: string;
  readonly byteRange: ByteRange;
  readonly range: SourceRange;
  readonly message: string;
  readonly notes?: readonly string[];
}

/** Input accepted by a source frontend implementation. */
export interface SourceInput {
  readonly source: string;
  readonly sourceId: string;
}

/** Render the stable first line of an Oseo diagnostic. */
export function renderDiagnostic(diagnostic: Diagnostic): string {
  const position = diagnostic.range.start;
  return (
    `${diagnostic.sourceId}:${position.line}:${position.column}: ` +
    `error[${diagnostic.code}]: ${diagnostic.message}`
  );
}
