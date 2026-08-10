/**
 * Generate and verify the pinned Unicode tables owned by `@oseo/unicode`.
 *
 * The generator reads only the reviewed Unicode Character Database copies
 * under *packages/unicode/data*. It never contacts the network, never reads
 * host locale state, and never consults a C library classification routine,
 * so the tables a checkout produces depend on nothing but its own reviewed
 * bytes. `mise run check:unicode-tables` regenerates them in memory and fails
 * when the checked-in module differs; `mise run unicode:update` writes it.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parse as parseYaml } from "yaml";

import {
  codePointSetFromRanges,
  codePointSetHas,
  codePointSetSize,
  complementCodePointSet,
  encodeCodePointMap,
  encodeCodePointPartition,
  encodeCodePointSet,
  encodeSequenceMap,
  maxCodePoint,
  partitionSet,
  partitionValueAt,
  unionCodePointSets,
} from "../packages/unicode/src/set.ts";
import type {
  CodePointPartition,
  CodePointRange,
  CodePointSet,
} from "../packages/unicode/src/set.ts";
import type { ConditionalCaseMapping } from "../packages/unicode/src/model.ts";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageDirectory = "packages/unicode";
const packageRoot = join(repositoryRoot, packageDirectory);
const manifestName = "data/manifest.yaml";
const tablesPath = join(packageRoot, "src/tables.ts");

/** The Unicode properties ECMAScript exposes without a value. */
export interface BinaryPropertySources {
  readonly derived: readonly string[];
  readonly derivedCoreProperties: readonly string[];
  readonly derivedNormalizationProps: readonly string[];
  readonly emojiData: readonly string[];
  readonly propList: readonly string[];
  readonly unicodeData: readonly string[];
}

/**
 * Where each ECMAScript binary property comes from.
 *
 * The lists are the fixed vocabulary of table 70 in ECMA-262, not whatever a
 * Unicode release happens to define. A property that a pinned input stops
 * providing fails generation instead of silently producing an empty set,
 * which is how the generator detects an input from the wrong version.
 */
export const binaryPropertySources: BinaryPropertySources = {
  derived: ["ASCII", "Any", "Assigned"],
  derivedCoreProperties: [
    "Alphabetic",
    "Case_Ignorable",
    "Cased",
    "Changes_When_Casefolded",
    "Changes_When_Casemapped",
    "Changes_When_Lowercased",
    "Changes_When_Titlecased",
    "Changes_When_Uppercased",
    "Default_Ignorable_Code_Point",
    "Grapheme_Base",
    "Grapheme_Extend",
    "ID_Continue",
    "ID_Start",
    "Lowercase",
    "Math",
    "Uppercase",
    "XID_Continue",
    "XID_Start",
  ],
  derivedNormalizationProps: ["Changes_When_NFKC_Casefolded"],
  emojiData: [
    "Emoji",
    "Emoji_Component",
    "Emoji_Modifier",
    "Emoji_Modifier_Base",
    "Emoji_Presentation",
    "Extended_Pictographic",
  ],
  propList: [
    "ASCII_Hex_Digit",
    "Bidi_Control",
    "Dash",
    "Deprecated",
    "Diacritic",
    "Extender",
    "Hex_Digit",
    "IDS_Binary_Operator",
    "IDS_Trinary_Operator",
    "Ideographic",
    "Join_Control",
    "Logical_Order_Exception",
    "Noncharacter_Code_Point",
    "Pattern_Syntax",
    "Pattern_White_Space",
    "Quotation_Mark",
    "Radical",
    "Regional_Indicator",
    "Sentence_Terminal",
    "Soft_Dotted",
    "Terminal_Punctuation",
    "Unified_Ideograph",
    "Variation_Selector",
    "White_Space",
  ],
  unicodeData: ["Bidi_Mirrored"],
};

/** The non-binary Unicode properties ECMAScript exposes with a value. */
export const nonBinaryProperties: readonly string[] = [
  "General_Category",
  "Script",
  "Script_Extensions",
];

/** Every ECMAScript binary property name, in ascending order. */
export const binaryProperties: readonly string[] = [
  ...binaryPropertySources.derived,
  ...binaryPropertySources.derivedCoreProperties,
  ...binaryPropertySources.derivedNormalizationProps,
  ...binaryPropertySources.emojiData,
  ...binaryPropertySources.propList,
  ...binaryPropertySources.unicodeData,
].toSorted();

/**
 * Which structural version marker a pinned input must carry.
 *
 * `unicode` is the ordinary `# <Name>-<version>.txt` first line. `emoji` is
 * the emoji data header and its separate `# Version:` line. `none` is a file
 * that upstream ships with no header at all, which today is only
 * *UnicodeData.txt*; such a file must not start with a comment, so a
 * substitution that carries one is still rejected.
 */
export type PinnedInputHeader = "emoji" | "none" | "unicode";

/** One pinned input file as the reviewed manifest describes it. */
export interface PinnedInput {
  readonly bytes: number;
  readonly header: PinnedInputHeader;
  readonly name: string;
  readonly path: string;
  readonly sha256: string;
  readonly url: string;
}

/** The reviewed manifest of pinned Unicode Character Database inputs. */
export interface PinnedInputManifest {
  readonly emojiVersion: string;
  readonly files: readonly PinnedInput[];
  readonly license: PinnedInput & { readonly identifier: string };
  readonly unicodeVersion: string;
  readonly version: number;
}

function record(value: unknown, description: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${description} must be a mapping.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, description: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${description} must be a non-empty string.`);
  }
  return value;
}

function count(value: unknown, description: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${description} must be a non-negative integer.`);
  }
  return value;
}

function headerKind(value: unknown, description: string): PinnedInputHeader {
  if (value !== "emoji" && value !== "none" && value !== "unicode") {
    throw new Error(`${description} must be emoji, none, or unicode.`);
  }
  return value;
}

function pinnedInput(value: unknown, description: string): PinnedInput {
  const entry = record(value, description);
  return {
    bytes: count(entry.bytes, `${description} bytes`),
    header: headerKind(entry.header, `${description} header`),
    name: text(entry.name ?? entry.path, `${description} name`),
    path: text(entry.path, `${description} path`),
    sha256: text(entry.sha256, `${description} sha256`),
    url: text(entry.url, `${description} url`),
  };
}

/** Parse and validate the reviewed pinned-input manifest. */
export function parsePinnedInputManifest(source: string): PinnedInputManifest {
  const root = record(parseYaml(source) as unknown, "The input manifest");
  if (root.version !== 1) {
    throw new Error("The input manifest must declare version 1.");
  }
  const unicodeVersion = text(root.unicodeVersion, "unicodeVersion");
  if (!/^\d+\.\d+\.\d+$/u.test(unicodeVersion)) {
    throw new Error("unicodeVersion must be a three-part Unicode version.");
  }
  const emojiVersion = text(root.emojiVersion, "emojiVersion");
  if (!/^\d+\.\d+$/u.test(emojiVersion)) {
    throw new Error("emojiVersion must be a two-part emoji version.");
  }
  if (!Array.isArray(root.files) || root.files.length === 0) {
    throw new Error("The input manifest must list its files.");
  }
  const files = root.files.map((entry, index) =>
    pinnedInput(entry, `Input ${index}`),
  );
  const names = new Set(files.map(({ name }) => name));
  if (names.size !== files.length) {
    throw new Error("The input manifest lists a file name twice.");
  }
  const licenseEntry = record(root.license, "license");
  return {
    emojiVersion,
    files,
    license: {
      ...pinnedInput(
        { header: "none", ...licenseEntry, name: licenseEntry.path },
        "The license",
      ),
      identifier: text(licenseEntry.identifier, "license identifier"),
    },
    unicodeVersion,
    version: 1,
  };
}

/** Reject a pinned input whose bytes, digest, or version header moved. */
export function verifyPinnedInput(
  manifest: PinnedInputManifest,
  input: PinnedInput,
  contents: string,
): void {
  const bytes = Buffer.byteLength(contents, "utf8");
  if (bytes !== input.bytes) {
    throw new Error(
      `${input.name} holds ${bytes} bytes, not the pinned ${input.bytes}.`,
    );
  }
  const digest = createHash("sha256").update(contents, "utf8").digest("hex");
  if (digest !== input.sha256) {
    throw new Error(`${input.name} has digest ${digest}, not ${input.sha256}.`);
  }
  // The header check is required rather than best-effort. A missing or
  // reshaped header is exactly what a substituted file looks like once its
  // digest has been updated without its contents being reviewed.
  const firstLine = contents.split("\n", 1)[0] ?? "";
  if (input.header === "none") {
    if (firstLine.startsWith("#")) {
      throw new Error(`${input.name} carries a header it should not have.`);
    }
    return;
  }
  if (input.header === "emoji") {
    if (firstLine.trim() !== `# ${input.name}`) {
      throw new Error(`${input.name} does not open with its own name.`);
    }
    const emoji = /^#\s*Version:\s*(\d+\.\d+)\s*$/mu.exec(contents);
    if (emoji == null) {
      throw new Error(`${input.name} declares no emoji version.`);
    }
    if (emoji[1] !== manifest.emojiVersion) {
      throw new Error(
        `${input.name} is emoji ${emoji[1] ?? ""}, not ` +
          `${manifest.emojiVersion}.`,
      );
    }
    return;
  }
  const versioned = /^#\s*([A-Za-z]+)-(\d+\.\d+\.\d+)\.txt\s*$/u.exec(
    firstLine,
  );
  if (versioned == null) {
    throw new Error(`${input.name} has no Unicode version header.`);
  }
  const [, stem, version] = versioned;
  if (`${stem ?? ""}.txt` !== input.name) {
    throw new Error(`${input.name} declares itself as ${stem ?? ""}.txt.`);
  }
  if (version !== manifest.unicodeVersion) {
    throw new Error(
      `${input.name} is Unicode ${version ?? ""}, not ` +
        `${manifest.unicodeVersion}.`,
    );
  }
}

/** One reviewed data line reduced to a code-point range and its fields. */
export interface UcdEntry {
  readonly end: number;
  readonly fields: readonly string[];
  readonly line: number;
  readonly start: number;
}

function codePointValue(token: string, description: string): number {
  if (!/^[0-9A-F]{4,6}$/u.test(token)) {
    throw new Error(`${description} is not a code point: ${token}`);
  }
  const value = Number.parseInt(token, 16);
  if (value > maxCodePoint) {
    throw new Error(`${description} exceeds the code-point range: ${token}`);
  }
  return value;
}

/**
 * Parse the common Unicode Character Database property-file layout.
 *
 * Every accepted line is `code` or `start..end`, a semicolon, and one or more
 * further fields. A comment starts at `#` and a blank line is skipped. A line
 * that does not fit that shape fails rather than being ignored, because a
 * silently skipped line is indistinguishable from missing property data.
 */
export function parseUcdEntries(
  source: string,
  name: string,
): readonly UcdEntry[] {
  const entries: UcdEntry[] = [];
  const lines = source.split("\n");
  for (const [index, raw] of lines.entries()) {
    const line = index + 1;
    const withoutComment = raw.split("#")[0] ?? "";
    const trimmed = withoutComment.trim();
    if (trimmed === "") continue;
    const fields = trimmed.split(";").map((field) => field.trim());
    if (fields.length < 2) {
      throw new Error(`${name}:${line}: a data line needs a value field.`);
    }
    const [range, ...rest] = fields;
    const bounds = (range ?? "").split("..");
    if (bounds.length > 2) {
      throw new Error(`${name}:${line}: malformed code-point range.`);
    }
    const start = codePointValue(bounds[0] ?? "", `${name}:${line}`);
    const end =
      bounds.length === 1
        ? start
        : codePointValue(bounds[1] ?? "", `${name}:${line}`);
    if (end < start) {
      throw new Error(`${name}:${line}: range end precedes its start.`);
    }
    entries.push({ end, fields: rest, line, start });
  }
  return entries;
}

/** Group a property file's entries into one code-point set per value. */
export function collectPropertySets(
  entries: readonly UcdEntry[],
  name: string,
  wanted: readonly string[],
): ReadonlyMap<string, CodePointSet> {
  const ranges = new Map<string, CodePointRange[]>();
  const requested = new Set(wanted);
  for (const entry of entries) {
    const value = entry.fields[0] ?? "";
    if (!requested.has(value)) continue;
    const list = ranges.get(value) ?? [];
    list.push({ end: entry.end, start: entry.start });
    ranges.set(value, list);
  }
  const sets = new Map<string, CodePointSet>();
  for (const value of wanted) {
    const list = ranges.get(value);
    if (list == null) {
      throw new Error(`${name} does not define ${value}.`);
    }
    sets.set(value, codePointSetFromRanges(list));
  }
  return sets;
}

/** The parts of *UnicodeData.txt* the tables depend on. */
export interface UnicodeDataFile {
  readonly bidiMirrored: CodePointSet;
  readonly categories: ReadonlyMap<string, CodePointSet>;
  readonly combiningClasses: ReadonlyMap<number, readonly CodePointRange[]>;
  readonly simpleLowercase: ReadonlyMap<number, number>;
  readonly simpleTitlecase: ReadonlyMap<number, number>;
  readonly simpleUppercase: ReadonlyMap<number, number>;
}

const unicodeDataFieldCount = 15;
const maximumCombiningClass = 254;

interface PendingRange {
  readonly category: string;
  readonly combiningClass: number;
  readonly label: string;
  readonly mirrored: string;
  readonly start: number;
}

/**
 * Parse *UnicodeData.txt*.
 *
 * The file has no version header, so its shape is the only structural
 * evidence available: every line carries exactly fifteen fields, code points
 * increase strictly, and a `<Label, First>` line is followed by a
 * `<Label, Last>` line carrying the same label, general category, combining
 * class, and mirroring flag. Violating any of those fails generation, so a
 * range cannot silently pair up with the wrong block.
 */
export function parseUnicodeDataFile(source: string): UnicodeDataFile {
  const categoryRanges = new Map<string, CodePointRange[]>();
  const combining = new Map<number, CodePointRange[]>();
  const mirrored: CodePointRange[] = [];
  const lowercase = new Map<number, number>();
  const titlecase = new Map<number, number>();
  const uppercase = new Map<number, number>();
  let previous = -1;
  let pendingFirst: PendingRange | undefined;
  const lines = source.split("\n");
  for (const [index, raw] of lines.entries()) {
    const line = index + 1;
    if (raw.trim() === "") continue;
    const fields = raw.split(";");
    if (fields.length !== unicodeDataFieldCount) {
      throw new Error(
        `UnicodeData.txt:${line}: expected ${unicodeDataFieldCount} fields.`,
      );
    }
    const where = `UnicodeData.txt:${line}`;
    const codePoint = codePointValue(fields[0] ?? "", where);
    if (codePoint <= previous) {
      throw new Error(`UnicodeData.txt:${line}: code points must increase.`);
    }
    previous = codePoint;
    const name = fields[1] ?? "";
    const category = fields[2] ?? "";
    if (!/^[A-Z][a-z]$/u.test(category)) {
      throw new Error(`UnicodeData.txt:${line}: bad category ${category}.`);
    }
    const combiningClass = Number(fields[3] ?? "");
    if (
      !/^\d{1,3}$/u.test(fields[3] ?? "") ||
      combiningClass > maximumCombiningClass
    ) {
      throw new Error(`${where}: bad combining class ${fields[3] ?? ""}.`);
    }
    const mirrorFlag = fields[9] ?? "";
    if (mirrorFlag !== "Y" && mirrorFlag !== "N") {
      throw new Error(`${where}: bad Bidi_Mirrored flag.`);
    }
    let start = codePoint;
    const rangeLabel = /^<(.*), (?:First|Last)>$/u.exec(name)?.[1];
    if (name.endsWith(", First>")) {
      if (pendingFirst != null) {
        throw new Error(`${where}: unterminated range start.`);
      }
      if (rangeLabel == null) {
        throw new Error(`${where}: malformed range start name ${name}.`);
      }
      pendingFirst = {
        category,
        combiningClass,
        label: rangeLabel,
        mirrored: mirrorFlag,
        start: codePoint,
      };
      continue;
    }
    if (name.endsWith(", Last>")) {
      if (
        pendingFirst == null ||
        rangeLabel == null ||
        pendingFirst.label !== rangeLabel ||
        pendingFirst.category !== category ||
        pendingFirst.combiningClass !== combiningClass ||
        pendingFirst.mirrored !== mirrorFlag
      ) {
        throw new Error(`${where}: unmatched range end.`);
      }
      start = pendingFirst.start;
      pendingFirst = undefined;
    } else if (pendingFirst != null) {
      throw new Error(`${where}: unterminated range start.`);
    }
    const ranges = categoryRanges.get(category) ?? [];
    ranges.push({ end: codePoint, start });
    categoryRanges.set(category, ranges);
    if (combiningClass !== 0) {
      const classRanges = combining.get(combiningClass) ?? [];
      classRanges.push({ end: codePoint, start });
      combining.set(combiningClass, classRanges);
    }
    if (mirrorFlag === "Y") mirrored.push({ end: codePoint, start });
    if (start !== codePoint) continue;
    const mappings: readonly [number, Map<number, number>][] = [
      [12, uppercase],
      [13, lowercase],
      [14, titlecase],
    ];
    for (const [field, target] of mappings) {
      const token = (fields[field] ?? "").trim();
      if (token === "") continue;
      const mapped = codePointValue(token, `UnicodeData.txt:${line}`);
      if (mapped !== codePoint) target.set(codePoint, mapped);
    }
  }
  if (pendingFirst != null) {
    throw new Error("UnicodeData.txt ends inside a code-point range.");
  }
  const categories = new Map<string, CodePointSet>();
  for (const [category, ranges] of categoryRanges) {
    categories.set(category, codePointSetFromRanges(ranges));
  }
  return {
    bidiMirrored: codePointSetFromRanges(mirrored),
    categories,
    combiningClasses: combining,
    simpleLowercase: lowercase,
    simpleTitlecase: titlecase,
    simpleUppercase: uppercase,
  };
}

/** The simple and full case foldings of *CaseFolding.txt*. */
export interface CaseFoldingFile {
  readonly full: ReadonlyMap<number, readonly number[]>;
  readonly simple: ReadonlyMap<number, number>;
}

/**
 * Parse *CaseFolding.txt*.
 *
 * Status `C` applies to both foldings, `S` replaces it for the simple one,
 * and `F` replaces it for the full one. Status `T` is the Turkic tailoring,
 * which no ECMAScript operation uses; it is validated and then dropped rather
 * than silently mixed into the default foldings.
 */
export function parseCaseFoldingFile(source: string): CaseFoldingFile {
  const simple = new Map<number, number>();
  const full = new Map<number, readonly number[]>();
  for (const entry of parseUcdEntries(source, "CaseFolding.txt")) {
    if (entry.start !== entry.end) {
      throw new Error(`CaseFolding.txt:${entry.line}: ranges are not allowed.`);
    }
    const status = entry.fields[0] ?? "";
    const mapping = (entry.fields[1] ?? "")
      .split(" ")
      .filter((token) => token !== "")
      .map((token) => codePointValue(token, `CaseFolding.txt:${entry.line}`));
    if (mapping.length === 0) {
      throw new Error(`CaseFolding.txt:${entry.line}: empty mapping.`);
    }
    if (status === "T") continue;
    if (status !== "C" && status !== "S" && status !== "F") {
      throw new Error(`CaseFolding.txt:${entry.line}: bad status ${status}.`);
    }
    if (status === "F") {
      if (mapping.length < 2) {
        throw new Error(`CaseFolding.txt:${entry.line}: F needs a sequence.`);
      }
      full.set(entry.start, mapping);
      continue;
    }
    if (mapping.length !== 1) {
      throw new Error(`CaseFolding.txt:${entry.line}: ${status} needs one.`);
    }
    simple.set(entry.start, mapping[0] ?? entry.start);
  }
  return { full, simple };
}

/** The unconditional and conditional mappings of *SpecialCasing.txt*. */
export interface SpecialCasingFile {
  readonly conditional: readonly ConditionalCaseMapping[];
  readonly lowercase: ReadonlyMap<number, readonly number[]>;
  readonly titlecase: ReadonlyMap<number, readonly number[]>;
  readonly uppercase: ReadonlyMap<number, readonly number[]>;
}

/**
 * The context names *SpecialCasing.txt* may attach to a conditional mapping.
 *
 * Each may also appear negated with a `Not_` prefix. Rejecting anything else
 * keeps a later Unicode release from quietly introducing a context that a
 * consumer would then ignore.
 */
export const caseMappingConditions: readonly string[] = [
  "After_I",
  "After_Soft_Dotted",
  "Before_Dot",
  "Final_Sigma",
  "More_Above",
];

function caseSequence(field: string, description: string): readonly number[] {
  return field
    .split(" ")
    .filter((token) => token !== "")
    .map((token) => codePointValue(token, description));
}

/**
 * Parse *SpecialCasing.txt*.
 *
 * An unconditional entry carries three mapping fields. A conditional entry
 * adds a context field whose first token may be a language subtag. Both are
 * retained: the tables do not decide which contexts a caller honors.
 */
export function parseSpecialCasingFile(source: string): SpecialCasingFile {
  const lowercase = new Map<number, readonly number[]>();
  const titlecase = new Map<number, readonly number[]>();
  const uppercase = new Map<number, readonly number[]>();
  const conditional: ConditionalCaseMapping[] = [];
  for (const entry of parseUcdEntries(source, "SpecialCasing.txt")) {
    if (entry.start !== entry.end) {
      throw new Error(`SpecialCasing.txt:${entry.line}: no ranges allowed.`);
    }
    const where = `SpecialCasing.txt:${entry.line}`;
    const fields = entry.fields;
    if (fields.length < 3) throw new Error(`${where}: missing mappings.`);
    const lower = caseSequence(fields[0] ?? "", where);
    const title = caseSequence(fields[1] ?? "", where);
    const upper = caseSequence(fields[2] ?? "", where);
    const context = (fields[3] ?? "").trim();
    if (context === "") {
      if (lower.length === 0 || title.length === 0 || upper.length === 0) {
        throw new Error(`${where}: an unconditional mapping cannot be empty.`);
      }
      lowercase.set(entry.start, lower);
      titlecase.set(entry.start, title);
      uppercase.set(entry.start, upper);
      continue;
    }
    const parts = context.split(" ").filter((token) => token !== "");
    const first = parts[0] ?? "";
    // A context is an optional BCP 47 language subtag followed by zero or
    // more context names. Locale-only entries such as `tr` carry no name, and
    // a locale-only lowercase mapping may be empty, which means removal.
    const language = /^[a-z]{2,3}$/u.test(first) ? first : null;
    const conditions = language == null ? parts : parts.slice(1);
    if (language == null && conditions.length === 0) {
      throw new Error(`${where}: a conditional mapping needs a context.`);
    }
    for (const condition of conditions) {
      const base = condition.startsWith("Not_")
        ? condition.slice("Not_".length)
        : condition;
      if (!caseMappingConditions.includes(base)) {
        throw new Error(`${where}: unknown context ${condition}.`);
      }
    }
    conditional.push({
      codePoint: entry.start,
      conditions,
      language,
      lowercase: lower,
      titlecase: title,
      uppercase: upper,
    });
  }
  return { conditional, lowercase, titlecase, uppercase };
}

/** Parse *PropertyAliases.txt* into an alias-to-canonical-name map. */
export function parsePropertyAliasesFile(
  source: string,
  wanted: readonly string[],
  selfNamed: readonly string[] = [],
): ReadonlyMap<string, string> {
  const requested = new Set(wanted);
  const aliases = new Map<string, string>();
  const found = new Set<string>();
  for (const raw of source.split("\n")) {
    const withoutComment = raw.split("#")[0] ?? "";
    if (withoutComment.trim() === "") continue;
    const fields = withoutComment.split(";").map((field) => field.trim());
    const canonical = fields[1] ?? "";
    if (!requested.has(canonical)) continue;
    found.add(canonical);
    for (const alias of fields) {
      if (alias === "") continue;
      const existing = aliases.get(alias);
      if (existing != null && existing !== canonical) {
        throw new Error(`PropertyAliases.txt: ${alias} is ambiguous.`);
      }
      aliases.set(alias, canonical);
    }
  }
  for (const name of wanted) {
    if (!found.has(name)) {
      throw new Error(`PropertyAliases.txt does not define ${name}.`);
    }
  }
  // ASCII, Any, and Assigned are ECMAScript property names that the Unicode
  // Character Database does not alias, so they name only themselves.
  for (const name of selfNamed) {
    if (aliases.has(name)) {
      throw new Error(`PropertyAliases.txt already defines ${name}.`);
    }
    aliases.set(name, name);
  }
  return aliases;
}

/** One property's value aliases, keyed by every accepted spelling. */
export interface PropertyValueAliases {
  readonly aliases: ReadonlyMap<string, string>;
  readonly canonical: readonly string[];
  readonly shortNames: ReadonlyMap<string, string>;
}

/** Parse the `gc` or `sc` value aliases of *PropertyValueAliases.txt*. */
export function parsePropertyValueAliasesFile(
  source: string,
  property: string,
): PropertyValueAliases {
  const aliases = new Map<string, string>();
  const shortNames = new Map<string, string>();
  const canonical: string[] = [];
  for (const raw of source.split("\n")) {
    const withoutComment = raw.split("#")[0] ?? "";
    if (withoutComment.trim() === "") continue;
    const fields = withoutComment.split(";").map((field) => field.trim());
    if ((fields[0] ?? "") !== property) continue;
    const short = fields[1] ?? "";
    const long = fields[2] ?? "";
    if (short === "" || long === "") {
      throw new Error(`PropertyValueAliases.txt: ${property} needs two names.`);
    }
    canonical.push(long);
    shortNames.set(long, short);
    for (const alias of fields.slice(1)) {
      if (alias === "") continue;
      const existing = aliases.get(alias);
      if (existing != null && existing !== long) {
        throw new Error(
          `PropertyValueAliases.txt: ${property} alias ${alias} is ambiguous.`,
        );
      }
      aliases.set(alias, long);
    }
  }
  if (canonical.length === 0) {
    throw new Error(`PropertyValueAliases.txt has no ${property} values.`);
  }
  canonical.sort();
  return { aliases, canonical, shortNames };
}

/** The ECMAScript word characters, before any case-insensitive extension. */
export const basicWordCharacters: CodePointSet = codePointSetFromRanges([
  { end: 0x39, start: 0x30 },
  { end: 0x5a, start: 0x41 },
  { end: 0x5f, start: 0x5f },
  { end: 0x7a, start: 0x61 },
]);

/** Every generated table, before encoding. */
export interface UnicodeTables {
  readonly binaryPropertySets: ReadonlyMap<string, CodePointSet>;
  readonly caseInsensitiveWordCharacters: CodePointSet;
  readonly combiningClassPartition: CodePointPartition;
  readonly combiningClassValues: readonly number[];
  readonly conditionalCaseMappings: readonly ConditionalCaseMapping[];
  readonly fullCaseFolding: ReadonlyMap<number, readonly number[]>;
  readonly fullLowercase: ReadonlyMap<number, readonly number[]>;
  readonly fullTitlecase: ReadonlyMap<number, readonly number[]>;
  readonly fullUppercase: ReadonlyMap<number, readonly number[]>;
  readonly generalCategoryAliases: ReadonlyMap<string, string>;
  readonly generalCategoryNames: readonly string[];
  readonly generalCategoryPartition: CodePointPartition;
  readonly generalCategorySupercategories: ReadonlyMap<
    string,
    readonly string[]
  >;
  readonly inputs: readonly PinnedInput[];
  readonly licenseIdentifier: string;
  readonly propertyNameAliases: ReadonlyMap<string, string>;
  readonly scriptAliases: ReadonlyMap<string, string>;
  readonly scriptExtensionsGroups: readonly (readonly number[])[];
  readonly scriptExtensionsPartition: CodePointPartition;
  readonly scriptNames: readonly string[];
  readonly scriptPartition: CodePointPartition;
  readonly simpleCaseFolding: ReadonlyMap<number, number>;
  readonly simpleLowercase: ReadonlyMap<number, number>;
  readonly simpleTitlecase: ReadonlyMap<number, number>;
  readonly simpleUppercase: ReadonlyMap<number, number>;
  readonly unicodeVersion: string;
  readonly emojiVersion: string;
  readonly wordCharacters: CodePointSet;
}

/** The reviewed source text of every pinned input, keyed by file name. */
export type PinnedInputContents = ReadonlyMap<string, string>;

function requireContents(contents: PinnedInputContents, name: string): string {
  const source = contents.get(name);
  if (source == null) throw new Error(`The pinned input ${name} is missing.`);
  return source;
}

function partitionFromAssignments(
  assignments: Int32Array,
  fallback: number,
): CodePointPartition {
  const boundaries: number[] = [];
  const values: number[] = [];
  let current = -1;
  for (let codePoint = 0; codePoint <= maxCodePoint; codePoint += 1) {
    const assigned = assignments[codePoint] ?? -1;
    const value = assigned < 0 ? fallback : assigned;
    if (value === current) continue;
    boundaries.push(codePoint);
    values.push(value);
    current = value;
  }
  return { boundaries, values };
}

function assignmentsFromSets(
  sets: ReadonlyMap<string, CodePointSet>,
  names: readonly string[],
  description: string,
): Int32Array {
  const assignments = new Int32Array(maxCodePoint + 1).fill(-1);
  for (const [name, set] of sets) {
    const index = names.indexOf(name);
    if (index < 0) throw new Error(`${description} value ${name} is unknown.`);
    for (let cursor = 0; cursor + 1 < set.length; cursor += 2) {
      const end = set[cursor + 1] ?? 0;
      for (let codePoint = set[cursor] ?? 0; codePoint < end; codePoint += 1) {
        if ((assignments[codePoint] ?? -1) >= 0) {
          throw new Error(
            `${description} assigns U+${codePoint.toString(16)} twice.`,
          );
        }
        assignments[codePoint] = index;
      }
    }
  }
  return assignments;
}

/** Build every table from the reviewed pinned inputs. */
export function buildUnicodeTables(
  manifest: PinnedInputManifest,
  contents: PinnedInputContents,
): UnicodeTables {
  const unicodeData = parseUnicodeDataFile(
    requireContents(contents, "UnicodeData.txt"),
  );
  const categoryValues = parsePropertyValueAliasesFile(
    requireContents(contents, "PropertyValueAliases.txt"),
    "gc",
  );
  const scriptValues = parsePropertyValueAliasesFile(
    requireContents(contents, "PropertyValueAliases.txt"),
    "sc",
  );
  const baseCategories = categoryValues.canonical.filter((name) => {
    const short = categoryValues.shortNames.get(name) ?? "";
    return short.length === 2 && short !== "LC";
  });
  const supercategories = new Map<string, readonly string[]>();
  for (const name of categoryValues.canonical) {
    const short = categoryValues.shortNames.get(name) ?? "";
    if (short.length !== 1 && short !== "LC") continue;
    const members = baseCategories.filter((member) => {
      const memberShort = categoryValues.shortNames.get(member) ?? "";
      return short === "LC"
        ? memberShort === "Lu" || memberShort === "Ll" || memberShort === "Lt"
        : memberShort.startsWith(short);
    });
    if (members.length === 0) {
      throw new Error(`General category ${name} has no members.`);
    }
    supercategories.set(name, members);
  }
  const categorySets = new Map<string, CodePointSet>();
  for (const [short, set] of unicodeData.categories) {
    const long = categoryValues.aliases.get(short);
    if (long == null) {
      throw new Error(`UnicodeData.txt uses unknown category ${short}.`);
    }
    categorySets.set(long, set);
  }
  const unassigned = categoryValues.aliases.get("Cn");
  if (unassigned == null) throw new Error("The Cn category has no name.");
  const generalCategoryPartition = partitionFromAssignments(
    assignmentsFromSets(categorySets, baseCategories, "General_Category"),
    baseCategories.indexOf(unassigned),
  );

  const combiningClassValues = [
    0,
    ...unicodeData.combiningClasses.keys(),
  ].toSorted((left, right) => left - right);
  const combiningSets = new Map<string, CodePointSet>();
  for (const [value, ranges] of unicodeData.combiningClasses) {
    combiningSets.set(`${value}`, codePointSetFromRanges(ranges));
  }
  const combiningClassPartition = partitionFromAssignments(
    assignmentsFromSets(
      combiningSets,
      combiningClassValues.map((value) => `${value}`),
      "Canonical_Combining_Class",
    ),
    combiningClassValues.indexOf(0),
  );

  const scriptEntries = parseUcdEntries(
    requireContents(contents, "Scripts.txt"),
    "Scripts.txt",
  );
  const scriptSets = new Map<string, CodePointRange[]>();
  for (const entry of scriptEntries) {
    const value = entry.fields[0] ?? "";
    const long = scriptValues.aliases.get(value);
    if (long == null) {
      throw new Error(`Scripts.txt:${entry.line}: unknown script ${value}.`);
    }
    const ranges = scriptSets.get(long) ?? [];
    ranges.push({ end: entry.end, start: entry.start });
    scriptSets.set(long, ranges);
  }
  const unknownScript = scriptValues.aliases.get("Zzzz");
  if (unknownScript == null) throw new Error("The Zzzz script has no name.");
  const scriptPartition = partitionFromAssignments(
    assignmentsFromSets(
      new Map(
        [...scriptSets].map(([name, ranges]) => [
          name,
          codePointSetFromRanges(ranges),
        ]),
      ),
      scriptValues.canonical,
      "Script",
    ),
    scriptValues.canonical.indexOf(unknownScript),
  );

  const extensionAssignments = new Map<number, readonly number[]>();
  for (const entry of parseUcdEntries(
    requireContents(contents, "ScriptExtensions.txt"),
    "ScriptExtensions.txt",
  )) {
    const codes = (entry.fields[0] ?? "")
      .split(" ")
      .filter((token) => token !== "");
    if (codes.length === 0) {
      throw new Error(`ScriptExtensions.txt:${entry.line}: empty value.`);
    }
    const indices = codes.map((code) => {
      const long = scriptValues.aliases.get(code);
      if (long == null) {
        throw new Error(
          `ScriptExtensions.txt:${entry.line}: unknown script ${code}.`,
        );
      }
      return scriptValues.canonical.indexOf(long);
    });
    indices.sort((left, right) => left - right);
    for (let cp = entry.start; cp <= entry.end; cp += 1) {
      if (extensionAssignments.has(cp)) {
        throw new Error(
          `ScriptExtensions.txt:${entry.line}: duplicate code point.`,
        );
      }
      extensionAssignments.set(cp, indices);
    }
  }
  const groupIndices = new Map<string, number>();
  const scriptExtensionsGroups: (readonly number[])[] = [];
  const groupAssignments = new Int32Array(maxCodePoint + 1).fill(-1);
  for (let codePoint = 0; codePoint <= maxCodePoint; codePoint += 1) {
    const explicit = extensionAssignments.get(codePoint);
    const indices = explicit ?? [partitionValueAt(scriptPartition, codePoint)];
    const key = indices.join(" ");
    let group = groupIndices.get(key);
    if (group == null) {
      group = scriptExtensionsGroups.length;
      groupIndices.set(key, group);
      scriptExtensionsGroups.push(indices);
    }
    groupAssignments[codePoint] = group;
  }
  const scriptExtensionsPartition = partitionFromAssignments(
    groupAssignments,
    0,
  );

  const binaryPropertySets = new Map<string, CodePointSet>();
  const fileSources: readonly [string, readonly string[]][] = [
    ["PropList.txt", binaryPropertySources.propList],
    ["DerivedCoreProperties.txt", binaryPropertySources.derivedCoreProperties],
    ["emoji-data.txt", binaryPropertySources.emojiData],
    [
      "DerivedNormalizationProps.txt",
      binaryPropertySources.derivedNormalizationProps,
    ],
  ];
  for (const [name, wanted] of fileSources) {
    const entries = parseUcdEntries(requireContents(contents, name), name);
    for (const [property, set] of collectPropertySets(entries, name, wanted)) {
      binaryPropertySets.set(property, set);
    }
  }
  binaryPropertySets.set("Bidi_Mirrored", unicodeData.bidiMirrored);
  binaryPropertySets.set("Any", [0, maxCodePoint + 1]);
  binaryPropertySets.set("ASCII", [0, 0x80]);
  // UnicodeData.txt omits unassigned code points instead of listing them as
  // Cn, so Assigned comes from the completed partition rather than from the
  // categories the file mentions.
  const unassignedSet = partitionSet(
    generalCategoryPartition,
    new Set([baseCategories.indexOf(unassigned)]),
  );
  binaryPropertySets.set("Assigned", complementCodePointSet(unassignedSet));
  const codePointCount = maxCodePoint + 1;
  for (const property of binaryProperties) {
    const set = binaryPropertySets.get(property);
    if (set == null) throw new Error(`No pinned input provides ${property}.`);
    const size = codePointSetSize(set);
    if (size === 0) throw new Error(`${property} holds no code point.`);
    if (property !== "Any" && size === codePointCount) {
      throw new Error(`${property} holds every code point.`);
    }
  }

  const caseFolding = parseCaseFoldingFile(
    requireContents(contents, "CaseFolding.txt"),
  );
  const specialCasing = parseSpecialCasingFile(
    requireContents(contents, "SpecialCasing.txt"),
  );
  // WordCharacters adds every code point whose simple case folding lands in
  // the basic set when a pattern has both `i` and a Unicode mode, so the
  // extension is derived here rather than listed.
  const foldedIntoWord: CodePointRange[] = [];
  for (const [codePoint, folded] of caseFolding.simple) {
    if (codePointSetHas(basicWordCharacters, folded)) {
      foldedIntoWord.push({ end: codePoint, start: codePoint });
    }
  }
  const caseInsensitiveWordCharacters = unionCodePointSets(
    basicWordCharacters,
    codePointSetFromRanges(foldedIntoWord),
  );

  return {
    binaryPropertySets,
    caseInsensitiveWordCharacters,
    combiningClassPartition,
    combiningClassValues,
    conditionalCaseMappings: specialCasing.conditional,
    emojiVersion: manifest.emojiVersion,
    fullCaseFolding: caseFolding.full,
    fullLowercase: differingSequences(
      specialCasing.lowercase,
      unicodeData.simpleLowercase,
    ),
    fullTitlecase: differingSequences(
      specialCasing.titlecase,
      unicodeData.simpleTitlecase,
    ),
    fullUppercase: differingSequences(
      specialCasing.uppercase,
      unicodeData.simpleUppercase,
    ),
    generalCategoryAliases: categoryValues.aliases,
    generalCategoryNames: baseCategories,
    generalCategoryPartition,
    generalCategorySupercategories: supercategories,
    inputs: manifest.files,
    licenseIdentifier: manifest.license.identifier,
    propertyNameAliases: parsePropertyAliasesFile(
      requireContents(contents, "PropertyAliases.txt"),
      [
        ...nonBinaryProperties,
        ...binaryProperties.filter(
          (name) => !binaryPropertySources.derived.includes(name),
        ),
      ],
      binaryPropertySources.derived,
    ),
    scriptAliases: scriptValues.aliases,
    scriptExtensionsGroups,
    scriptExtensionsPartition,
    scriptNames: scriptValues.canonical,
    scriptPartition,
    simpleCaseFolding: caseFolding.simple,
    simpleLowercase: unicodeData.simpleLowercase,
    simpleTitlecase: unicodeData.simpleTitlecase,
    simpleUppercase: unicodeData.simpleUppercase,
    unicodeVersion: manifest.unicodeVersion,
    wordCharacters: basicWordCharacters,
  };
}

/** Keep only the full mappings that differ from their simple mapping. */
function differingSequences(
  entries: ReadonlyMap<number, readonly number[]>,
  simple: ReadonlyMap<number, number>,
): ReadonlyMap<number, readonly number[]> {
  const result = new Map<number, readonly number[]>();
  for (const [codePoint, sequence] of entries) {
    const single = simple.get(codePoint) ?? codePoint;
    if (sequence.length === 1 && sequence[0] === single) continue;
    result.set(codePoint, sequence);
  }
  return result;
}

const lineLimit = 80;

/**
 * Render one encoded table as a template literal wrapped at the line limit.
 *
 * The literal opens with a line break so that no content line has to share
 * space with its declaration, and every content line carries the same
 * indentation. Both are whitespace the decoder discards.
 */
function wrapEncoded(indent: number, encoded: string): string {
  if (encoded === "") return "``";
  const prefix = " ".repeat(indent + 2);
  const available = lineLimit - prefix.length - 1;
  const lines: string[] = [];
  let current = "";
  for (const token of encoded.split(" ")) {
    const candidate = current === "" ? token : `${current} ${token}`;
    if (candidate.length > available && current !== "") {
      lines.push(current);
      current = token;
      continue;
    }
    current = candidate;
  }
  if (current !== "") lines.push(current);
  const body = lines.map((line) => `${prefix}${line}`).join("\n");
  return `\`\n${body}\``;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function encodedRecord(
  entries: readonly (readonly [string, string])[],
): string {
  const lines = entries.map(
    ([key, encoded]) => `  ${quote(key)}: ${wrapEncoded(2, encoded)},`,
  );
  return `{\n${lines.join("\n")}\n}`;
}

function stringRecord(entries: ReadonlyMap<string, string>): string {
  const keys = [...entries.keys()].toSorted();
  const lines = keys.map(
    (key) => `  ${quote(key)}: ${quote(entries.get(key) ?? "")},`,
  );
  return `{\n${lines.join("\n")}\n}`;
}

function stringList(values: readonly string[], indent: number): string {
  const prefix = " ".repeat(indent + 2);
  const lines: string[] = [];
  let current = "";
  for (const value of values) {
    const token = `${quote(value)},`;
    const candidate = current === "" ? token : `${current} ${token}`;
    if (`${prefix}${candidate}`.length > lineLimit && current !== "") {
      lines.push(current);
      current = token;
      continue;
    }
    current = candidate;
  }
  if (current !== "") lines.push(current);
  const body = lines.map((line) => `${prefix}${line}`).join("\n");
  return `[\n${body}\n${" ".repeat(indent)}]`;
}

function codePointList(values: readonly number[]): string {
  return `[${values.map((value) => `0x${value.toString(16)}`).join(", ")}]`;
}

function numberList(values: readonly number[], indent: number): string {
  return stringList(
    values.map((value) => `${value}`),
    indent,
  ).replaceAll('"', "");
}

function conditionalLiteral(mapping: ConditionalCaseMapping): string {
  const language = mapping.language == null ? "null" : quote(mapping.language);
  return [
    "  {",
    `    codePoint: 0x${mapping.codePoint.toString(16)},`,
    `    conditions: ${stringList(mapping.conditions, 4)},`,
    `    language: ${language},`,
    `    lowercase: ${codePointList(mapping.lowercase)},`,
    `    titlecase: ${codePointList(mapping.titlecase)},`,
    `    uppercase: ${codePointList(mapping.uppercase)},`,
    "  },",
  ].join("\n");
}

function inputLiteral(input: PinnedInput): string {
  return [
    "  {",
    `    bytes: ${input.bytes},`,
    `    name: ${quote(input.name)},`,
    `    path: ${quote(`packages/unicode/${input.path}`)},`,
    `    sha256: ${quote(input.sha256)},`,
    `    url: ${quote(input.url)},`,
    "  },",
  ].join("\n");
}

/** Render the generated table module from built tables. */
export function renderTablesModule(tables: UnicodeTables): string {
  const binaryEntries = [...tables.binaryPropertySets.keys()]
    .toSorted()
    .map(
      (name) =>
        [
          name,
          encodeCodePointSet(tables.binaryPropertySets.get(name) ?? []),
        ] as const,
    );
  const supercategoryEntries = [...tables.generalCategorySupercategories]
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([name, members]) => `  ${quote(name)}: ${stringList(members, 2)},`)
    .join("\n");
  const groups = tables.scriptExtensionsGroups.map((indices) =>
    indices.map((index) => index.toString(36)).join(" "),
  );
  return `${[
    "// Generated by mise run unicode:update. Do not edit by hand.",
    "//",
    "// Every table below is derived from the reviewed Unicode Character",
    "// Database copies pinned by packages/unicode/data/manifest.yaml. See",
    "// packages/unicode/README.md for the regeneration and licensing rules.",
    "",
    "import type {",
    "  ConditionalCaseMapping,",
    "  UnicodeDataInput,",
    '} from "./model.ts";',
    "",
    "/** The pinned Unicode version every table in this module describes. */",
    `export const unicodeVersion: string = ${quote(tables.unicodeVersion)};`,
    "",
    "/** The pinned Unicode emoji data version the emoji tables come from. */",
    `export const emojiVersion: string = ${quote(tables.emojiVersion)};`,
    "",
    "/** The SPDX identifier of the pinned Unicode data license. */",
    `export const unicodeDataLicense: string = ${quote(
      tables.licenseIdentifier,
    )};`,
    "",
    "/** Every reviewed input the tables were generated from. */",
    `export const unicodeDataInputs: readonly UnicodeDataInput[] = [`,
    tables.inputs.map(inputLiteral).join("\n"),
    "];",
    "",
    "/** Canonical base General_Category value names, in partition order. */",
    `export const generalCategoryNames: readonly string[] = ${stringList(
      tables.generalCategoryNames,
      0,
    )};`,
    "",
    "/** Base categories each General_Category supercategory covers. */",
    "export const generalCategorySupercategories: Readonly<",
    "  Record<string, readonly string[]>",
    `> = {`,
    supercategoryEntries,
    "};",
    "",
    "/** Every accepted General_Category spelling and its canonical name. */",
    "export const generalCategoryAliases: Readonly<Record<string, string>> =",
    `  ${stringRecord(tables.generalCategoryAliases)};`,
    "",
    "/** The total General_Category assignment over every code point. */",
    `export const generalCategoryPartition: string = ${wrapEncoded(
      0,
      encodeCodePointPartition(tables.generalCategoryPartition),
    )};`,
    "",
    "/** Canonical combining class numbers, in partition order. */",
    `export const combiningClassValues: readonly number[] = ${numberList(
      tables.combiningClassValues,
      0,
    )};`,
    "",
    "/** The total Canonical_Combining_Class assignment over code points. */",
    `export const combiningClassPartition: string = ${wrapEncoded(
      0,
      encodeCodePointPartition(tables.combiningClassPartition),
    )};`,
    "",
    "/** Canonical Script value names, in partition order. */",
    `export const scriptNames: readonly string[] = ${stringList(
      tables.scriptNames,
      0,
    )};`,
    "",
    "/** Every accepted Script spelling and its canonical name. */",
    "export const scriptAliases: Readonly<Record<string, string>> =",
    `  ${stringRecord(tables.scriptAliases)};`,
    "",
    "/** The total Script assignment over every code point. */",
    `export const scriptPartition: string = ${wrapEncoded(
      0,
      encodeCodePointPartition(tables.scriptPartition),
    )};`,
    "",
    "/** Script index sets referenced by the Script_Extensions partition. */",
    `export const scriptExtensionsGroups: readonly string[] = ${stringList(
      groups,
      0,
    )};`,
    "",
    "/** The total Script_Extensions assignment over every code point. */",
    `export const scriptExtensionsPartition: string = ${wrapEncoded(
      0,
      encodeCodePointPartition(tables.scriptExtensionsPartition),
    )};`,
    "",
    "/** Every accepted binary property spelling and its canonical name. */",
    "export const propertyNameAliases: Readonly<Record<string, string>> =",
    `  ${stringRecord(tables.propertyNameAliases)};`,
    "",
    "/** One encoded code-point set per ECMAScript binary property. */",
    "export const binaryPropertySets: Readonly<Record<string, string>> =",
    `  ${encodedRecord(binaryEntries)};`,
    "",
    "/** Simple case folding, as the C and S statuses of CaseFolding.txt. */",
    `export const simpleCaseFolding: string = ${wrapEncoded(
      0,
      encodeCodePointMap(tables.simpleCaseFolding),
    )};`,
    "",
    "/** Full case folding, holding only the F statuses that lengthen. */",
    `export const fullCaseFolding: string = ${wrapEncoded(
      0,
      encodeSequenceMap(tables.fullCaseFolding),
    )};`,
    "",
    "/** Simple lowercase mappings from UnicodeData.txt. */",
    `export const simpleLowercase: string = ${wrapEncoded(
      0,
      encodeCodePointMap(tables.simpleLowercase),
    )};`,
    "",
    "/** Simple uppercase mappings from UnicodeData.txt. */",
    `export const simpleUppercase: string = ${wrapEncoded(
      0,
      encodeCodePointMap(tables.simpleUppercase),
    )};`,
    "",
    "/** Simple titlecase mappings from UnicodeData.txt. */",
    `export const simpleTitlecase: string = ${wrapEncoded(
      0,
      encodeCodePointMap(tables.simpleTitlecase),
    )};`,
    "",
    "/** Unconditional full lowercase mappings that differ from the simple. */",
    `export const fullLowercase: string = ${wrapEncoded(
      0,
      encodeSequenceMap(tables.fullLowercase),
    )};`,
    "",
    "/** Unconditional full uppercase mappings that differ from the simple. */",
    `export const fullUppercase: string = ${wrapEncoded(
      0,
      encodeSequenceMap(tables.fullUppercase),
    )};`,
    "",
    "/** Unconditional full titlecase mappings that differ from the simple. */",
    `export const fullTitlecase: string = ${wrapEncoded(
      0,
      encodeSequenceMap(tables.fullTitlecase),
    )};`,
    "",
    "/** Conditional full case mappings, recorded but not applied. */",
    "export const conditionalCaseMappings: " +
      "readonly ConditionalCaseMapping[] = [",
    tables.conditionalCaseMappings.map(conditionalLiteral).join("\n"),
    "];",
    "",
    "/** The ECMAScript word characters of a pattern without both flags. */",
    `export const wordCharacters: string = ${wrapEncoded(
      0,
      encodeCodePointSet(tables.wordCharacters),
    )};`,
    "",
    "/** The word characters of a pattern with both `i` and `u` or `v`. */",
    `export const caseInsensitiveWordCharacters: string = ${wrapEncoded(
      0,
      encodeCodePointSet(tables.caseInsensitiveWordCharacters),
    )};`,
    "",
  ].join("\n")}`;
}

/** A summary of one generation run, for the task's console output. */
export interface UnicodeTableSummary {
  readonly binaryProperties: number;
  readonly bytes: number;
  readonly generalCategories: number;
  readonly scripts: number;
  readonly unicodeVersion: string;
  readonly wordCharacters: number;
}

/** Read, verify, and build the tables from the reviewed pinned inputs. */
export async function generateUnicodeTables(root: string): Promise<{
  readonly source: string;
  readonly summary: UnicodeTableSummary;
}> {
  const directory =
    root === repositoryRoot ? packageRoot : join(root, packageDirectory);
  const manifest = parsePinnedInputManifest(
    await readFile(join(directory, manifestName), "utf8"),
  );
  const license = await readFile(
    join(directory, manifest.license.path),
    "utf8",
  );
  verifyPinnedInput(manifest, manifest.license, license);
  const contents = new Map<string, string>();
  const sources = await Promise.all(
    manifest.files.map(async (input) => ({
      input,
      source: await readFile(join(directory, input.path), "utf8"),
    })),
  );
  for (const { input, source } of sources) {
    verifyPinnedInput(manifest, input, source);
    contents.set(input.name, source);
  }
  const tables = buildUnicodeTables(manifest, contents);
  const source = renderTablesModule(tables);
  return {
    source,
    summary: {
      binaryProperties: tables.binaryPropertySets.size,
      bytes: Buffer.byteLength(source, "utf8"),
      generalCategories: tables.generalCategoryNames.length,
      scripts: tables.scriptNames.length,
      unicodeVersion: tables.unicodeVersion,
      wordCharacters: codePointSetSize(tables.caseInsensitiveWordCharacters),
    },
  };
}

async function main(): Promise<void> {
  const update = process.argv.includes("--update");
  const { source, summary } = await generateUnicodeTables(repositoryRoot);
  if (update) {
    await writeFile(tablesPath, source, "utf8");
  } else {
    const existing = await readFile(tablesPath, "utf8").catch(() => undefined);
    if (existing !== source) {
      throw new Error(
        "packages/unicode/src/tables.ts is stale. Run " +
          "mise run unicode:update to regenerate it from the pinned inputs.",
      );
    }
  }
  console.log(
    `unicode-tables=${update ? "written" : "current"} ` +
      `version=${summary.unicodeVersion} ` +
      `binary-properties=${summary.binaryProperties} ` +
      `general-categories=${summary.generalCategories} ` +
      `scripts=${summary.scripts} bytes=${summary.bytes}`,
  );
}

const entry = process.argv[1];
if (entry != null && pathToFileURL(entry).href === import.meta.url) {
  await main();
}
