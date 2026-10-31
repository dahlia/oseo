import { parse as parseBabel, type ParserOptions } from "@babel/parser";
import {
  isNumber,
  node,
  nodes,
  type BabelNode,
  type BabelNodeValue,
  type ParserError,
} from "./babel.ts";
import { errorOffset } from "./locations.ts";

interface Candidate {
  readonly start: number;
  readonly end: number;
}

const escapedStatic = new RegExp(
  Array.from("static", (letter) => {
    const hex = letter.charCodeAt(0).toString(16);
    return `(?:${letter}|\\\\u00${hex}|\\\\u\\{0*${hex}\\})`;
  }).join(""),
  "gu",
);
const lineTerminator = /[\n\r\u2028\u2029]/u;

/** Trivia may hide the line terminator that permits a class field's ASI. */
function hasLineTerminator(source: string, start: number): boolean {
  let end = start;
  while (end < source.length) {
    if (/\s/u.test(source[end] ?? "")) {
      end += 1;
    } else if (source.startsWith("/*", end)) {
      const close = source.indexOf("*/", end + 2);
      if (close < 0) break;
      end = close + 2;
    } else if (source.startsWith("//", end)) {
      const rest = source.slice(end + 2);
      const nextLine = rest.search(lineTerminator);
      end = nextLine < 0 ? source.length : end + 2 + nextLine;
    } else {
      break;
    }
  }
  return lineTerminator.test(source.slice(start, end));
}

/** Offsets after an inserted semicolon map back to its original boundary. */
function originalOffset(offset: number, insertions: readonly number[]): number {
  let low = 0;
  let high = insertions.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((insertions[middle] ?? Infinity) < offset) low = middle + 1;
    else high = middle;
  }
  return offset - low;
}

/** Copy parser data while restoring offsets; Babel locations stay internal. */
function restoreOffsets(
  value: BabelNodeValue,
  insertions: readonly number[],
): BabelNodeValue {
  if (Array.isArray(value)) {
    return value.map((child) => restoreOffsets(child, insertions));
  }
  const object = node(value);
  if (object == null) return value;
  return Object.fromEntries(
    Object.entries(object).map(([key, child]) => [
      key,
      isNumber(child) &&
      ["start", "end", "index", "pos", "raisedAt", "position"].includes(key)
        ? originalOffset(child, insertions)
        : restoreOffsets(child, insertions),
    ]),
  );
}

/**
 * Babel's TypeScript plugin mistakes escaped static field names for modifiers.
 * Probe same-width, non-contextual names to identify actual ASI fields without
 * interpreting matches in strings, templates, comments or larger identifiers.
 * Make only those semicolons explicit, then restore the original byte-source
 * coordinates before either frontend sees the AST. Type annotations and hints
 * remain in the real parse, and no Babel node crosses the frontend boundary.
 */
export function parseWithClassStaticAsi(
  source: string,
  options: ParserOptions,
): BabelNode | undefined {
  const candidates: Candidate[] = [];
  for (const match of source.matchAll(escapedStatic)) {
    const start = match.index;
    const end = start + match[0].length;
    if (match[0].includes("\\") && hasLineTerminator(source, end)) {
      candidates.push({ start, end });
    }
  }
  if (candidates.length === 0) return node(parseBabel(source, options));
  let probeSource = "";
  let previous = 0;
  for (const candidate of candidates) {
    probeSource +=
      source.slice(previous, candidate.start) +
      "s" +
      "a".repeat(candidate.end - candidate.start - 2) +
      "c";
    previous = candidate.end;
  }
  probeSource += source.slice(previous);
  let probe: BabelNode | undefined;
  try {
    probe = node(parseBabel(probeSource, options));
  } catch {
    // Preserve the original parser's error for unrelated malformed syntax.
    return node(parseBabel(source, options));
  }
  const byStart = new Map(
    candidates.map((candidate) => [candidate.start, candidate]),
  );
  const pending = [node(probe?.program)];
  const ends: number[] = [];
  while (pending.length > 0) {
    const value = pending.pop();
    if (value?.type == null) continue;
    if (value.type === "ClassProperty" && value.value == null) {
      const key = node(value.key);
      const candidate = key?.start == null ? undefined : byStart.get(key.start);
      if (
        key?.type === "Identifier" &&
        candidate != null &&
        key.end === candidate.end &&
        value.end === candidate.end
      ) {
        ends.push(candidate.end);
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
  if (ends.length === 0) return node(parseBabel(source, options));
  ends.sort((a, b) => a - b);
  let normalized = "";
  previous = 0;
  for (const end of ends) {
    normalized += source.slice(previous, end) + ";";
    previous = end;
  }
  normalized += source.slice(previous);
  const insertions = ends.map((end, i) => end + i);
  try {
    const file = node(parseBabel(normalized, options));
    return node(restoreOffsets(file, insertions));
  } catch (error) {
    // SAFETY: Babel errors expose the offsets read by errorOffset.
    const offset = errorOffset(error as ParserError);
    throw Object.assign(
      new SyntaxError("Source could not be parsed.", {
        cause: error,
      }),
      { pos: originalOffset(offset, insertions) },
    );
  }
}
