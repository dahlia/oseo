/**
 * The compact code-point set representation shared by the generated tables
 * and their generator.
 *
 * A set is an inversion list: a strictly increasing, even-length array of
 * boundaries where membership toggles. Boundaries at even indices open a
 * range and boundaries at odd indices close it, so `[0x41, 0x5b]` is the
 * inclusive range U+0041 to U+005A. A closing boundary may equal
 * `maxCodePoint + 1`, which is the only value a set may hold that is not
 * itself a code point.
 *
 * The generated module stores each set as text rather than as an array so
 * that a table stays small and wraps inside the repository line limit. The
 * text holds base-36 integers separated by ASCII whitespace: the first is the
 * first boundary and every later one is the increase from the boundary before
 * it. Deltas keep the digits short and confine a diff to the boundaries that
 * actually moved.
 */

/** The largest Unicode code point, including unassigned and surrogate ones. */
export const maxCodePoint: number = 0x10ffff;

const codePointLimit = maxCodePoint + 1;

/**
 * A code-point set as an inversion list.
 *
 * Consumers may read the boundaries directly to build their own
 * representation. Treat the array as immutable: every set the package
 * returns is shared and cached.
 */
export type CodePointSet = readonly number[];

/** One inclusive code-point range of a set. */
export interface CodePointRange {
  readonly end: number;
  readonly start: number;
}

function tokens(encoded: string): readonly string[] {
  const trimmed = encoded.trim();
  return trimmed === "" ? [] : trimmed.split(/\s+/u);
}

function base36(token: string, signed: boolean): number {
  const pattern = signed ? /^-?[0-9a-z]+$/u : /^[0-9a-z]+$/u;
  if (!pattern.test(token)) {
    throw new Error(`Malformed base-36 token: ${JSON.stringify(token)}.`);
  }
  const negative = token.startsWith("-");
  const magnitude = Number.parseInt(negative ? token.slice(1) : token, 36);
  if (!Number.isSafeInteger(magnitude)) {
    throw new Error(`Base-36 token is out of range: ${token}.`);
  }
  return negative ? -magnitude : magnitude;
}

/** Reject a value that is not a Unicode code point. */
export function assertCodePoint(value: number, description: string): void {
  if (!Number.isInteger(value) || value < 0 || value > maxCodePoint) {
    throw new RangeError(`${description} must be a Unicode code point.`);
  }
}

/** Decode one encoded inversion list, rejecting malformed table text. */
export function decodeCodePointSet(encoded: string): CodePointSet {
  const parts = tokens(encoded);
  if (parts.length % 2 !== 0) {
    throw new Error("An encoded code-point set needs an even boundary count.");
  }
  const boundaries: number[] = [];
  let previous = 0;
  for (const [index, part] of parts.entries()) {
    const delta = base36(part, false);
    if (index > 0 && delta < 1) {
      throw new Error("Encoded set boundaries must strictly increase.");
    }
    const boundary = index === 0 ? delta : previous + delta;
    if (boundary > codePointLimit) {
      throw new Error(`Encoded set boundary ${boundary} exceeds the range.`);
    }
    boundaries.push(boundary);
    previous = boundary;
  }
  return boundaries;
}

/** Encode one inversion list in the form `decodeCodePointSet` accepts. */
export function encodeCodePointSet(set: CodePointSet): string {
  const parts: string[] = [];
  let previous = 0;
  for (const [index, boundary] of set.entries()) {
    parts.push((index === 0 ? boundary : boundary - previous).toString(36));
    previous = boundary;
  }
  return parts.join(" ");
}

/** Whether a set holds one code point. */
export function codePointSetHas(set: CodePointSet, codePoint: number): boolean {
  assertCodePoint(codePoint, "A queried code point");
  let low = 0;
  let high = set.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((set[middle] ?? 0) <= codePoint) low = middle + 1;
    else high = middle;
  }
  return (low & 1) === 1;
}

/** The inclusive ranges of a set, in increasing code-point order. */
export function codePointSetRanges(
  set: CodePointSet,
): readonly CodePointRange[] {
  const ranges: CodePointRange[] = [];
  for (let index = 0; index + 1 < set.length; index += 2) {
    ranges.push({ end: (set[index + 1] ?? 0) - 1, start: set[index] ?? 0 });
  }
  return ranges;
}

/** How many code points a set holds. */
export function codePointSetSize(set: CodePointSet): number {
  let total = 0;
  for (let index = 0; index + 1 < set.length; index += 2) {
    total += (set[index + 1] ?? 0) - (set[index] ?? 0);
  }
  return total;
}

/** Build a normalized set from possibly unsorted, overlapping ranges. */
export function codePointSetFromRanges(
  ranges: readonly CodePointRange[],
): CodePointSet {
  for (const { end, start } of ranges) {
    assertCodePoint(start, "A range start");
    assertCodePoint(end, "A range end");
    if (end < start) throw new RangeError("A range end precedes its start.");
  }
  const sorted = ranges.toSorted((left, right) => left.start - right.start);
  const boundaries: number[] = [];
  for (const { end, start } of sorted) {
    const last = boundaries.length - 1;
    const previousEnd = boundaries[last];
    if (previousEnd != null && start <= previousEnd) {
      if (end + 1 > previousEnd) boundaries[last] = end + 1;
      continue;
    }
    boundaries.push(start, end + 1);
  }
  return boundaries;
}

/** The union of two sets. */
export function unionCodePointSets(
  left: CodePointSet,
  right: CodePointSet,
): CodePointSet {
  const boundaries: number[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  let depth = 0;
  while (leftIndex < left.length || rightIndex < right.length) {
    const leftValue = left[leftIndex] ?? codePointLimit + 1;
    const rightValue = right[rightIndex] ?? codePointLimit + 1;
    const value = Math.min(leftValue, rightValue);
    let opening = 0;
    if (leftValue === value) {
      opening += (leftIndex & 1) === 0 ? 1 : -1;
      leftIndex += 1;
    }
    if (rightValue === value) {
      opening += (rightIndex & 1) === 0 ? 1 : -1;
      rightIndex += 1;
    }
    const previous = depth;
    depth += opening;
    if (previous === 0 && depth > 0) boundaries.push(value);
    else if (previous > 0 && depth === 0) boundaries.push(value);
  }
  return boundaries;
}

/** The complement of a set over the whole code-point range. */
export function complementCodePointSet(set: CodePointSet): CodePointSet {
  const boundaries: number[] = [];
  let position = 0;
  for (let index = 0; index + 1 < set.length; index += 2) {
    const start = set[index] ?? 0;
    if (start > position) boundaries.push(position, start);
    position = set[index + 1] ?? 0;
  }
  if (position < codePointLimit) boundaries.push(position, codePointLimit);
  return boundaries;
}

/**
 * A total assignment of one value index to every code point.
 *
 * `boundaries` starts at zero and increases strictly. Run `i` covers
 * `boundaries[i]` up to but excluding `boundaries[i + 1]`, and the last run
 * extends to `maxCodePoint`. `values[i]` indexes the run's value in whatever
 * name table the partition belongs to.
 */
export interface CodePointPartition {
  readonly boundaries: readonly number[];
  readonly values: readonly number[];
}

/**
 * Decode one encoded partition.
 *
 * The text alternates the base-36 increase of a run's first code point with
 * the base-36 value index of that run. The first increase is absolute and
 * must be zero, so the partition covers every code point.
 */
export function decodeCodePointPartition(
  encoded: string,
  valueCount: number,
): CodePointPartition {
  const parts = tokens(encoded);
  if (parts.length === 0 || parts.length % 2 !== 0) {
    throw new Error("An encoded partition needs at least one boundary pair.");
  }
  const boundaries: number[] = [];
  const values: number[] = [];
  let boundary = 0;
  for (let index = 0; index < parts.length; index += 2) {
    const delta = base36(parts[index] ?? "", false);
    if (index === 0 && delta !== 0) {
      throw new Error("An encoded partition must start at code point zero.");
    }
    if (index > 0 && delta < 1) {
      throw new Error("Encoded partition runs must strictly increase.");
    }
    boundary += delta;
    assertCodePoint(boundary, "An encoded partition boundary");
    const value = base36(parts[index + 1] ?? "", false);
    if (value >= valueCount) {
      throw new Error(`Encoded partition value ${value} has no name.`);
    }
    boundaries.push(boundary);
    values.push(value);
  }
  return { boundaries, values };
}

/** Encode one partition in the form `decodeCodePointPartition` accepts. */
export function encodeCodePointPartition(
  partition: CodePointPartition,
): string {
  const parts: string[] = [];
  let previous = 0;
  for (const [index, boundary] of partition.boundaries.entries()) {
    parts.push(
      (index === 0 ? boundary : boundary - previous).toString(36),
      (partition.values[index] ?? 0).toString(36),
    );
    previous = boundary;
  }
  return parts.join(" ");
}

/** The value index a partition assigns to one code point. */
export function partitionValueAt(
  partition: CodePointPartition,
  codePoint: number,
): number {
  assertCodePoint(codePoint, "A queried code point");
  const { boundaries, values } = partition;
  let low = 0;
  let high = boundaries.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((boundaries[middle] ?? 0) <= codePoint) low = middle + 1;
    else high = middle;
  }
  return values[low - 1] ?? 0;
}

/** Every code point a partition assigns to one of the given value indices. */
export function partitionSet(
  partition: CodePointPartition,
  selected: ReadonlySet<number>,
): CodePointSet {
  const { boundaries, values } = partition;
  const result: number[] = [];
  for (const [index, boundary] of boundaries.entries()) {
    if (!selected.has(values[index] ?? -1)) continue;
    const end = boundaries[index + 1] ?? codePointLimit;
    const last = result.length - 1;
    if (result.length > 0 && result[last] === boundary) result[last] = end;
    else result.push(boundary, end);
  }
  return result;
}

/**
 * Decode a code-point keyed map of single code points.
 *
 * The text holds one base-36 pair per entry: the increase of the source code
 * point from the entry before it, then the signed difference between the
 * target and the source.
 */
export function decodeCodePointMap(
  encoded: string,
): ReadonlyMap<number, number> {
  const parts = tokens(encoded);
  if (parts.length % 2 !== 0) {
    throw new Error("An encoded code-point map needs paired tokens.");
  }
  const entries = new Map<number, number>();
  let source = 0;
  for (let index = 0; index < parts.length; index += 2) {
    const delta = base36(parts[index] ?? "", false);
    if (index > 0 && delta < 1) {
      throw new Error("Encoded map sources must strictly increase.");
    }
    source = index === 0 ? delta : source + delta;
    assertCodePoint(source, "An encoded map source");
    const target = source + base36(parts[index + 1] ?? "", true);
    assertCodePoint(target, "An encoded map target");
    entries.set(source, target);
  }
  return entries;
}

/** Encode a code-point keyed map in the form `decodeCodePointMap` accepts. */
export function encodeCodePointMap(
  entries: ReadonlyMap<number, number>,
): string {
  const parts: string[] = [];
  let previous = 0;
  for (const source of [...entries.keys()].toSorted((a, b) => a - b)) {
    const target = entries.get(source) ?? source;
    parts.push(
      (parts.length === 0 ? source : source - previous).toString(36),
      (target - source < 0 ? "-" : "") + Math.abs(target - source).toString(36),
    );
    previous = source;
  }
  return parts.join(" ");
}

/**
 * Decode a code-point keyed map of code-point sequences.
 *
 * Each entry holds the base-36 increase of its source code point, the base-36
 * length of its sequence, and that many absolute base-36 code points.
 */
export function decodeSequenceMap(
  encoded: string,
): ReadonlyMap<number, readonly number[]> {
  const parts = tokens(encoded);
  const entries = new Map<number, readonly number[]>();
  let source = 0;
  let index = 0;
  let first = true;
  while (index < parts.length) {
    const delta = base36(parts[index] ?? "", false);
    if (!first && delta < 1) {
      throw new Error("Encoded sequence sources must strictly increase.");
    }
    source = first ? delta : source + delta;
    first = false;
    assertCodePoint(source, "An encoded sequence source");
    const length = base36(parts[index + 1] ?? "", false);
    if (length < 1) throw new Error("An encoded sequence must not be empty.");
    if (index + 2 + length > parts.length) {
      throw new Error("An encoded sequence map is truncated.");
    }
    const sequence: number[] = [];
    for (let offset = 0; offset < length; offset += 1) {
      const codePoint = base36(parts[index + 2 + offset] ?? "", false);
      assertCodePoint(codePoint, "An encoded sequence element");
      sequence.push(codePoint);
    }
    entries.set(source, sequence);
    index += 2 + length;
  }
  return entries;
}

/** Encode a sequence map in the form `decodeSequenceMap` accepts. */
export function encodeSequenceMap(
  entries: ReadonlyMap<number, readonly number[]>,
): string {
  const parts: string[] = [];
  let previous = 0;
  let first = true;
  for (const source of [...entries.keys()].toSorted((a, b) => a - b)) {
    const sequence = entries.get(source) ?? [];
    parts.push((first ? source : source - previous).toString(36));
    parts.push(sequence.length.toString(36));
    for (const codePoint of sequence) parts.push(codePoint.toString(36));
    previous = source;
    first = false;
  }
  return parts.join(" ");
}
