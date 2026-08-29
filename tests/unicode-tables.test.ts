import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  binaryProperties,
  buildUnicodeTables,
  collectPropertySets,
  generateUnicodeTables,
  parseCaseFoldingFile,
  parsePinnedInputManifest,
  parsePropertyAliasesFile,
  parsePropertyValueAliasesFile,
  parseSpecialCasingFile,
  parseUcdEntries,
  parseUnicodeDataFile,
  renderRuntimeTablesHeader,
  renderTablesModule,
  verifyPinnedInput,
} from "../tools/unicode-tables.ts";
import type { PinnedInputManifest } from "../tools/unicode-tables.ts";
import type { StructuredDataRecord } from "../tools/structured-data.ts";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageRoot = join(repositoryRoot, "packages/unicode");

function manifestFixture(
  overrides: Readonly<StructuredDataRecord> = {},
): string {
  return JSON.stringify({
    emojiVersion: "17.0",
    files: [
      {
        bytes: 1,
        header: "unicode",
        name: "Sample.txt",
        path: "data/ucd/Sample.txt",
        sha256: "0".repeat(64),
        url: "https://example.invalid/Sample.txt",
      },
    ],
    license: {
      bytes: 1,
      identifier: "Unicode-3.0",
      path: "UNICODE-LICENSE.txt",
      sha256: "0".repeat(64),
      url: "https://example.invalid/license.txt",
    },
    unicodeVersion: "17.0.0",
    version: 1,
    ...overrides,
  });
}

function digestedInput(
  manifest: PinnedInputManifest,
  contents: string,
  overrides: Partial<PinnedInputManifest["files"][number]> = {},
): PinnedInputManifest["files"][number] {
  return {
    bytes: Buffer.byteLength(contents, "utf8"),
    header: "unicode",
    name: "CaseFolding.txt",
    path: "data/ucd/CaseFolding.txt",
    sha256: createHash("sha256").update(contents, "utf8").digest("hex"),
    url: `https://example.invalid/${manifest.unicodeVersion}/CaseFolding.txt`,
    ...overrides,
  };
}

test("the pinned manifest rejects a version that is not a Unicode one", () => {
  assert.throws(
    () => parsePinnedInputManifest(manifestFixture({ unicodeVersion: "17" })),
    /three-part Unicode version/u,
  );
  assert.throws(
    () => parsePinnedInputManifest(manifestFixture({ emojiVersion: "17" })),
    /two-part emoji version/u,
  );
  assert.throws(
    () => parsePinnedInputManifest(manifestFixture({ version: 2 })),
    /must declare version 1/u,
  );
  assert.throws(
    () => parsePinnedInputManifest(manifestFixture({ files: [] })),
    /must list its files/u,
  );
});

test("the pinned manifest rejects an unknown header kind", () => {
  assert.throws(
    () =>
      parsePinnedInputManifest(
        manifestFixture({
          files: [
            {
              bytes: 1,
              header: "sometimes",
              name: "Sample.txt",
              path: "data/ucd/Sample.txt",
              sha256: "0".repeat(64),
              url: "https://example.invalid/Sample.txt",
            },
          ],
        }),
      ),
    /must be emoji, none, or unicode/u,
  );
});

test("the pinned manifest rejects a repeated input name", () => {
  const duplicate = {
    bytes: 1,
    header: "unicode",
    name: "Sample.txt",
    path: "data/ucd/Sample.txt",
    sha256: "0".repeat(64),
    url: "https://example.invalid/Sample.txt",
  };
  assert.throws(
    () =>
      parsePinnedInputManifest(
        manifestFixture({ files: [duplicate, duplicate] }),
      ),
    /lists a file name twice/u,
  );
});

test("an input whose bytes or digest moved is rejected", () => {
  const manifest = parsePinnedInputManifest(manifestFixture());
  const contents = "# CaseFolding-17.0.0.txt\n";
  const input = digestedInput(manifest, contents);
  verifyPinnedInput(manifest, input, contents);
  assert.throws(
    () => verifyPinnedInput(manifest, { ...input, bytes: 1 }, contents),
    /holds \d+ bytes, not the pinned 1/u,
  );
  assert.throws(
    () =>
      verifyPinnedInput(
        manifest,
        { ...input, sha256: "a".repeat(64) },
        contents,
      ),
    /has digest [0-9a-f]{64}, not a{64}/u,
  );
});

test("an input from another Unicode version is rejected", () => {
  const manifest = parsePinnedInputManifest(manifestFixture());
  const contents = "# CaseFolding-16.0.0.txt\n";
  assert.throws(
    () =>
      verifyPinnedInput(manifest, digestedInput(manifest, contents), contents),
    /is Unicode 16\.0\.0, not 17\.0\.0/u,
  );
});

test("an input whose header names another file is rejected", () => {
  const manifest = parsePinnedInputManifest(manifestFixture());
  const contents = "# PropList-17.0.0.txt\n";
  assert.throws(
    () =>
      verifyPinnedInput(manifest, digestedInput(manifest, contents), contents),
    /declares itself as PropList\.txt/u,
  );
});

test("an emoji input from another emoji version is rejected", () => {
  const manifest = parsePinnedInputManifest(manifestFixture());
  const emoji = { header: "emoji", name: "emoji-data.txt" } as const;
  const wrong = "# emoji-data.txt\n# Version: 16.0\n";
  assert.throws(
    () =>
      verifyPinnedInput(manifest, digestedInput(manifest, wrong, emoji), wrong),
    /is emoji 16\.0, not 17\.0/u,
  );
  const right = "# emoji-data.txt\n# Version: 17.0\n";
  verifyPinnedInput(manifest, digestedInput(manifest, right, emoji), right);
});

test("a header that is missing or of the wrong kind is rejected", () => {
  const manifest = parsePinnedInputManifest(manifestFixture());
  const check = (
    contents: string,
    overrides: Partial<PinnedInputManifest["files"][number]>,
  ): void => {
    verifyPinnedInput(
      manifest,
      digestedInput(manifest, contents, overrides),
      contents,
    );
  };
  // A versioned input whose header is gone must not pass by default.
  assert.throws(
    () => check("0041; C; 0061;\n", {}),
    /has no Unicode version header/u,
  );
  // An emoji input must open with its own name and declare a version.
  assert.throws(
    () => check("# other.txt\n# Version: 17.0\n", { header: "emoji" }),
    /does not open with its own name/u,
  );
  assert.throws(
    () =>
      check("# emoji-data.txt\n# nothing\n", {
        header: "emoji",
        name: "emoji-data.txt",
      }),
    /declares no emoji version/u,
  );
  // A headerless input must stay headerless.
  assert.throws(
    () => check("# CaseFolding-17.0.0.txt\n", { header: "none" }),
    /carries a header it should not have/u,
  );
  check("0041;A;Lu;0;L;;;;;N;;;;;\n", { header: "none" });
});

test("property-file lines parse into ranges and fields", () => {
  const entries = parseUcdEntries(
    ["# comment", "", "0041 ; Alphabetic # Lu", "0100..0105 ; Alphabetic"].join(
      "\n",
    ),
    "Sample.txt",
  );
  assert.deepEqual(entries, [
    { end: 0x41, fields: ["Alphabetic"], line: 3, start: 0x41 },
    { end: 0x105, fields: ["Alphabetic"], line: 4, start: 0x100 },
  ]);
});

test("a malformed property-file line fails rather than being skipped", () => {
  assert.throws(
    () => parseUcdEntries("0041\n", "Sample.txt"),
    /Sample\.txt:1: a data line needs a value field/u,
  );
  assert.throws(
    () => parseUcdEntries("00G1 ; Alphabetic\n", "Sample.txt"),
    /Sample\.txt:1 is not a code point/u,
  );
  assert.throws(
    () => parseUcdEntries("110000 ; Alphabetic\n", "Sample.txt"),
    /exceeds the code-point range/u,
  );
  assert.throws(
    () => parseUcdEntries("0105..0100 ; Alphabetic\n", "Sample.txt"),
    /range end precedes its start/u,
  );
  assert.throws(
    () => parseUcdEntries("0041..0042..0043 ; Alphabetic\n", "Sample.txt"),
    /malformed code-point range/u,
  );
});

const unicodeDataLine = (
  codePoint: string,
  name: string,
  category: string,
  mirrored = "N",
  upper = "",
  lower = "",
  combiningClass = "0",
  decomposition = "",
): string =>
  [
    codePoint,
    name,
    category,
    combiningClass,
    "L",
    decomposition,
    "",
    "",
    "",
    mirrored,
    "",
    "",
    upper,
    lower,
    "",
  ].join(";");

test("UnicodeData ranges, mirroring, and case mappings parse", () => {
  const parsed = parseUnicodeDataFile(
    [
      unicodeDataLine("0028", "LEFT PARENTHESIS", "Ps", "Y"),
      unicodeDataLine("0041", "LATIN CAPITAL LETTER A", "Lu", "N", "", "0061"),
      unicodeDataLine(
        "00C5",
        "LATIN CAPITAL LETTER A WITH RING ABOVE",
        "Lu",
        "N",
        "",
        "",
        "0",
        "0041 030A",
      ),
      unicodeDataLine("0300", "COMBINING GRAVE", "Mn", "N", "", "", "230"),
      unicodeDataLine("3400", "<CJK Ideograph Extension A, First>", "Lo"),
      unicodeDataLine("4DBF", "<CJK Ideograph Extension A, Last>", "Lo"),
      unicodeDataLine(
        "FB03",
        "LATIN SMALL LIGATURE FFI",
        "Ll",
        "N",
        "",
        "",
        "0",
        "<compat> 0066 0066 0069",
      ),
    ].join("\n"),
  );
  assert.deepEqual(parsed.categories.get("Lo"), [0x3400, 0x4dc0]);
  assert.deepEqual(parsed.bidiMirrored, [0x28, 0x29]);
  assert.equal(parsed.simpleLowercase.get(0x41), 0x61);
  assert.equal(parsed.simpleUppercase.get(0x41), undefined);
  assert.deepEqual(parsed.canonicalDecomposition.get(0xc5), [0x41, 0x30a]);
  assert.deepEqual(
    parsed.compatibilityDecomposition.get(0xfb03),
    [0x66, 0x66, 0x69],
  );
  assert.deepEqual(parsed.combiningClasses.get(230), [
    { end: 0x300, start: 0x300 },
  ]);
  assert.equal(parsed.combiningClasses.has(0), false);
});

test("a broken UnicodeData structure fails generation", () => {
  assert.throws(
    () => parseUnicodeDataFile("0041;A;Lu;0;L\n"),
    /expected 15 fields/u,
  );
  assert.throws(
    () =>
      parseUnicodeDataFile(
        [
          unicodeDataLine("0042", "B", "Lu"),
          unicodeDataLine("0041", "A", "Lu"),
        ].join("\n"),
      ),
    /code points must increase/u,
  );
  assert.throws(
    () => parseUnicodeDataFile(unicodeDataLine("0041", "A", "L")),
    /bad category L/u,
  );
  assert.throws(
    () => parseUnicodeDataFile(unicodeDataLine("0041", "A", "Lu", "M")),
    /bad Bidi_Mirrored flag/u,
  );
  assert.throws(
    () => parseUnicodeDataFile(unicodeDataLine("3400", "<Block, First>", "Lo")),
    /ends inside a code-point range/u,
  );
  assert.throws(
    () =>
      parseUnicodeDataFile(
        [
          unicodeDataLine("3400", "<Block, First>", "Lo"),
          unicodeDataLine("4DBF", "<Block, Last>", "Lu"),
        ].join("\n"),
      ),
    /unmatched range end/u,
  );
  // Two different blocks with the same category must not pair up.
  assert.throws(
    () =>
      parseUnicodeDataFile(
        [
          unicodeDataLine("3400", "<Block A, First>", "Lo"),
          unicodeDataLine("4DBF", "<Block B, Last>", "Lo"),
        ].join("\n"),
      ),
    /unmatched range end/u,
  );
  assert.throws(
    () =>
      parseUnicodeDataFile(
        unicodeDataLine("0300", "A", "Mn", "N", "", "", "x"),
      ),
    /bad combining class x/u,
  );
  assert.throws(
    () =>
      parseUnicodeDataFile(
        unicodeDataLine("0300", "A", "Mn", "N", "", "", "255"),
      ),
    /bad combining class 255/u,
  );
  assert.throws(
    () =>
      parseUnicodeDataFile(
        unicodeDataLine(
          "00A0",
          "NO-BREAK SPACE",
          "Zs",
          "N",
          "",
          "",
          "0",
          "<noBreak 0020",
        ),
      ),
    /bad decomposition tag <noBreak/u,
  );
  assert.throws(
    () =>
      parseUnicodeDataFile(
        unicodeDataLine(
          "00A0",
          "NO-BREAK SPACE",
          "Zs",
          "N",
          "",
          "",
          "0",
          "<noBreak>",
        ),
      ),
    /empty decomposition mapping/u,
  );
});

test("case folding statuses select the simple and full mappings", () => {
  const folding = parseCaseFoldingFile(
    [
      "0041; C; 0061; # LATIN CAPITAL LETTER A",
      "00DF; F; 0073 0073; # LATIN SMALL LETTER SHARP S",
      "1E9E; S; 00DF; # LATIN CAPITAL LETTER SHARP S",
      "0130; T; 0069; # LATIN CAPITAL LETTER I WITH DOT ABOVE",
    ].join("\n"),
  );
  assert.equal(folding.simple.get(0x41), 0x61);
  assert.equal(folding.simple.get(0x1e9e), 0xdf);
  assert.deepEqual(folding.full.get(0xdf), [0x73, 0x73]);
  assert.equal(folding.simple.has(0x130), false);
  assert.equal(folding.full.has(0x130), false);
});

test("a malformed case folding entry fails generation", () => {
  assert.throws(
    () => parseCaseFoldingFile("0041; X; 0061;\n"),
    /bad status X/u,
  );
  assert.throws(
    () => parseCaseFoldingFile("0041; C; 0061 0062;\n"),
    /C needs one/u,
  );
  assert.throws(
    () => parseCaseFoldingFile("0041; F; 0061;\n"),
    /F needs a sequence/u,
  );
  assert.throws(
    () => parseCaseFoldingFile("0041..0042; C; 0061;\n"),
    /ranges are not allowed/u,
  );
});

test("an unknown case mapping context fails generation", () => {
  assert.throws(
    () => parseSpecialCasingFile("03A3; 03C2; 03A3; 03A3; Penultimate;\n"),
    /unknown context Penultimate/u,
  );
  const negated = parseSpecialCasingFile(
    "0049; 0131; 0049; 0049; tr Not_Before_Dot;\n",
  );
  assert.deepEqual(negated.conditional[0]?.conditions, ["Not_Before_Dot"]);
});

test("special casing separates unconditional and conditional entries", () => {
  const parsed = parseSpecialCasingFile(
    [
      "00DF; 00DF; 0053 0073; 0053 0053; # SHARP S",
      "03A3; 03C2; 03A3; 03A3; Final_Sigma; # SIGMA",
      "0130; 0069; 0130; 0130; tr; # I WITH DOT ABOVE",
    ].join("\n"),
  );
  assert.deepEqual(parsed.uppercase.get(0xdf), [0x53, 0x53]);
  assert.equal(parsed.conditional.length, 2);
  assert.deepEqual(parsed.conditional[0], {
    codePoint: 0x3a3,
    conditions: ["Final_Sigma"],
    language: null,
    lowercase: [0x3c2],
    titlecase: [0x3a3],
    uppercase: [0x3a3],
  });
  assert.equal(parsed.conditional[1]?.language, "tr");
  assert.deepEqual(parsed.conditional[1]?.conditions, []);
});

test("property aliases reject a missing name and add ECMAScript ones", () => {
  const source = ["AHex ; ASCII_Hex_Digit", "gc ; General_Category"].join("\n");
  const aliases = parsePropertyAliasesFile(
    source,
    ["ASCII_Hex_Digit", "General_Category"],
    ["Any"],
  );
  assert.equal(aliases.get("AHex"), "ASCII_Hex_Digit");
  assert.equal(aliases.get("gc"), "General_Category");
  assert.equal(aliases.get("Any"), "Any");
  assert.throws(
    () => parsePropertyAliasesFile(source, ["Emoji"]),
    /does not define Emoji/u,
  );
  assert.throws(
    () => parsePropertyAliasesFile(source, ["General_Category"], ["gc"]),
    /already defines gc/u,
  );
});

test("value aliases map every spelling to one canonical long name", () => {
  const source = [
    "gc ; Lu ; Uppercase_Letter",
    "gc ; Cc ; Control ; cntrl",
    "sc ; Latn ; Latin",
  ].join("\n");
  const categories = parsePropertyValueAliasesFile(source, "gc");
  assert.deepEqual(categories.canonical, ["Control", "Uppercase_Letter"]);
  assert.equal(categories.aliases.get("cntrl"), "Control");
  assert.equal(categories.aliases.get("Lu"), "Uppercase_Letter");
  assert.equal(parsePropertyValueAliasesFile(source, "sc").canonical.length, 1);
  assert.throws(
    () => parsePropertyValueAliasesFile(source, "scx"),
    /has no scx values/u,
  );
});

test("generation rejects an input that no longer defines a property", () => {
  const entries = parseUcdEntries("0041 ; Dash\n", "PropList.txt");
  assert.deepEqual(
    [...collectPropertySets(entries, "PropList.txt", ["Dash"])],
    [["Dash", [0x41, 0x42]]],
  );
  assert.throws(
    () => collectPropertySets(entries, "PropList.txt", ["Dash", "Hex_Digit"]),
    /PropList\.txt does not define Hex_Digit/u,
  );
});

test("generation rejects a missing pinned input", () => {
  const manifest = parsePinnedInputManifest(manifestFixture());
  assert.throws(
    () => buildUnicodeTables(manifest, new Map()),
    /The pinned input UnicodeData\.txt is missing/u,
  );
});

test("generation is deterministic and matches what is committed", async () => {
  const first = await generateUnicodeTables(repositoryRoot);
  const second = await generateUnicodeTables(repositoryRoot);
  assert.equal(second.source, first.source);
  const committed = await readFile(
    join(repositoryRoot, "packages/unicode/src/tables.ts"),
    "utf8",
  );
  assert.equal(
    committed,
    first.source,
    "packages/unicode/src/tables.ts is stale; run mise run unicode:update.",
  );
  const runtimeCommitted = await readFile(
    join(repositoryRoot, "packages/runtime-c/native/runtime_unicode_tables.h"),
    "utf8",
  );
  assert.equal(
    runtimeCommitted,
    first.runtimeSource,
    "runtime_unicode_tables.h is stale; run mise run unicode:update.",
  );
  assert.equal(first.summary.unicodeVersion, "17.0.0");
  assert.equal(first.summary.binaryProperties, binaryProperties.length);
});

test("every line of the generated module fits the line limit", async () => {
  const { source } = await generateUnicodeTables(repositoryRoot);
  // A URL is exempt from the repository line limit wherever it appears; no
  // other generated line may rely on that exemption.
  const overlong = source
    .split("\n")
    .filter((line) => line.length > 80 && !line.includes("https://"));
  assert.deepEqual(overlong, []);
});

test("the rendered module is a pure function of its tables", async () => {
  const manifest = parsePinnedInputManifest(
    await readFile(join(packageRoot, "data/manifest.yaml"), "utf8"),
  );
  const contents = new Map(
    await Promise.all(
      manifest.files.map(
        async (input): Promise<readonly [string, string]> => [
          input.name,
          await readFile(join(packageRoot, input.path), "utf8"),
        ],
      ),
    ),
  );
  const tables = buildUnicodeTables(manifest, contents);
  assert.equal(renderTablesModule(tables), renderTablesModule(tables));
  assert.equal(
    renderRuntimeTablesHeader(tables),
    renderRuntimeTablesHeader(tables),
  );
  assert.equal(tables.generalCategoryNames.length, 30);
  assert.equal(
    new Set(tables.generalCategoryNames).size,
    tables.generalCategoryNames.length,
  );
});
