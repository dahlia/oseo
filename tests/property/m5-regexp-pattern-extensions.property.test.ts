/**
 * Generated pattern-extension semantics over the generic matcher.
 *
 * The host engine is an independent oracle for the candidate-edition
 * grammar. Each generated case stays inside the exact extension family it
 * names, so shrinking preserves the class-set operation, modifier scope,
 * capture form, or matching flag under test.
 *
 * Dynamically constructed group names are checked natively against a
 * fixed table of code points whose identifier properties are spelled out
 * here, so neither the runtime decoder nor the compiler parser is its own
 * oracle.
 */

import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  buildRegExpMatcher,
  parseRegExpPattern,
  searchRegExpMatcher,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import type {
  RegExpMatcherProgram,
  RegExpPatternExtensions,
} from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import {
  binaryPropertySet,
  codePointSetHas,
} from "../../packages/unicode/src/index.ts";

import { runNativeCli } from "../native-cli.ts";
import {
  propertyEscapeSet,
  stringPropertyEscapeSet,
  unicodeMatcherData,
} from "../regexp-matcher-data.ts";

const { assertAsyncProperty, assertProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

const extensions: RegExpPatternExtensions = {
  admitted: ["class-set-notation", "modifiers", "unicode-property-escapes"],
  identifierPart: (codePoint) => codePoint === 0x00e9,
  identifierStart: (codePoint) => codePoint === 0x00e9,
  unicodeProperty: (escape) =>
    propertyEscapeSet(escape) != null ||
    stringPropertyEscapeSet(escape) != null,
};

interface PatternCase {
  readonly flags: string;
  readonly input: string;
  readonly source: string;
}

const textArbitrary = fc
  .array(
    fc.constantFrom(
      "a",
      "A",
      "b",
      "c",
      "d",
      "x",
      "y",
      "\n",
      "9",
      "\ufe0f",
      "\u20e3",
    ),
    { maxLength: 8 },
  )
  .map((characters) => characters.join(""));

const caseArbitrary: fc.Arbitrary<PatternCase> = fc.oneof(
  textArbitrary.map((input) => ({
    flags: "v",
    input,
    source: "[[a-c]&&[b-d]]",
  })),
  textArbitrary.map((input) => ({
    flags: "v",
    input,
    source: "[[a-c]--[b]]",
  })),
  textArbitrary.map((input) => ({
    flags: "v",
    input,
    source: "[\\q{ab|cd}x]",
  })),
  textArbitrary.map((input) => ({
    flags: "iv",
    input,
    source: "[^a]",
  })),
  textArbitrary.map((input) => ({
    flags: "iv",
    input,
    source: "[a&&A]",
  })),
  textArbitrary.map((input) => ({
    flags: "iv",
    input,
    source: "[[a-z]--A]",
  })),
  textArbitrary.map((input) => ({
    flags: "iv",
    input,
    source: "[\\q{AB}--\\q{ab}]",
  })),
  textArbitrary.map((input) => ({
    flags: "v",
    input,
    source: "[\\q{|a}]",
  })),
  textArbitrary.map((input) => ({
    flags: "v",
    input,
    source: "[\\q{a|}]",
  })),
  textArbitrary.map((input) => ({
    flags: "v",
    input,
    source: "\\p{Emoji_Keycap_Sequence}",
  })),
  textArbitrary.map((input) => ({
    flags: "",
    input,
    source: "(?i:a)(?-i:b)",
  })),
  textArbitrary.map((input) => ({
    flags: "",
    input,
    source: "(?s:a.b)",
  })),
  textArbitrary.map((input) => ({
    flags: "",
    input,
    source: "(?m:^b$)",
  })),
  textArbitrary.map((input) => ({
    flags: "u",
    input,
    source: "(?<é>a)\\k<é>",
  })),
  textArbitrary.map((input) => ({
    flags: "",
    input,
    source: "(?<=a)b",
  })),
  textArbitrary.map((input) => ({
    flags: "d",
    input,
    source: "(a)(?<right>b)",
  })),
  textArbitrary.map((input) => ({
    flags: "s",
    input,
    source: "a.b",
  })),
);

function artifact(testCase: PatternCase): RegExpMatcherProgram {
  const parsed = parseRegExpPattern({
    extensions,
    flags: testCase.flags,
    source: testCase.source,
  });
  assert.deepEqual(parsed.errors, []);
  assert.ok(parsed.pattern != null);
  const built = buildRegExpMatcher(parsed.pattern, {
    unicodeData: unicodeMatcherData,
  });
  assert.deepEqual(built.errors, []);
  assert.ok(built.program != null);
  return built.program;
}

interface Observation {
  readonly captures: readonly (string | null)[];
  readonly index: number;
}

function observed(testCase: PatternCase): Observation | undefined {
  const result = searchRegExpMatcher({
    program: artifact(testCase),
    startIndex: 0,
    text: testCase.input,
  });
  if (result.outcome !== "matched") return undefined;
  const whole = result.captures[0];
  assert.ok(whole != null);
  return {
    captures: result.captures.map((span) =>
      span == null ? null : testCase.input.slice(span.start, span.end),
    ),
    index: whole.start,
  };
}

function hostObserved(testCase: PatternCase): Observation | undefined {
  const regexp = new RegExp(testCase.source, testCase.flags);
  const match = regexp.exec(testCase.input);
  if (match == null) return undefined;
  return {
    captures: [...match].map((capture) => capture ?? null),
    index: match.index,
  };
}

test("generated pattern extensions agree with the host", () => {
  assertProperty(
    "class sets, modifiers, captures, lookbehind, indices, and dotAll match",
    fc.property(caseArbitrary, (testCase) => {
      assert.deepEqual(observed(testCase), hostObserved(testCase));
    }),
    {
      domain:
        "one generated input paired with class-set intersection, " +
        "subtraction, a finite string disjunction, a pinned string " +
        "property, scoped i, m, or s modifiers, a non-ASCII named group " +
        "and backreference, lookbehind, match indices, or dotAll matching",
      numRuns: 64,
      profile: "M5 RegExp pattern extensions",
      seed: 0x6000_5d00,
      sizeLimit: "at most eight generated input characters and one pattern",
      timeLimitMilliseconds: 30_000,
    },
  );
});

/**
 * One code point a generated group name may hold, with the identifier
 * classification ECMA-262 gives it under the pinned Unicode 17.0 data.
 *
 * `start` admits the point as RegExpIdentifierStart and `part` as
 * RegExpIdentifierPart, which already folds in the `$`, `_`, and joiner
 * allowances. Every point is chosen so its answer has not changed across
 * the Unicode releases the reference hosts ship.
 */
interface NamePoint {
  readonly codePoint: number;
  readonly part: boolean;
  readonly start: boolean;
}

const namePoints: readonly NamePoint[] = [
  { codePoint: 0x41, part: true, start: true },
  { codePoint: 0x7a, part: true, start: true },
  { codePoint: 0x24, part: true, start: true },
  { codePoint: 0x5f, part: true, start: true },
  { codePoint: 0x3c0, part: true, start: true },
  { codePoint: 0xca0, part: true, start: true },
  { codePoint: 0x1_0400, part: true, start: true },
  { codePoint: 0x37, part: true, start: false },
  { codePoint: 0x301, part: true, start: false },
  { codePoint: 0x200c, part: true, start: false },
  { codePoint: 0x200d, part: true, start: false },
  { codePoint: 0x1_04a4, part: true, start: false },
  { codePoint: 0x1_d7da, part: true, start: false },
  { codePoint: 0x2d, part: false, start: false },
  { codePoint: 0x2603, part: false, start: false },
  { codePoint: 0x1_f98a, part: false, start: false },
  { codePoint: 0xd83d, part: false, start: false },
];

/**
 * How one code point is written inside the pattern text.
 *
 * `split` writes a supplementary point as an escaped lead surrogate
 * followed by a written trail surrogate, which RegExpIdentifierName never
 * joins, so it always names two lone surrogates.
 */
type Spelling = "braced" | "escaped" | "split" | "written";

interface NameAtom {
  readonly point: NamePoint;
  readonly spelling: Spelling;
}

function hex(value: number, width: number): string {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function surrogates(codePoint: number): readonly [number, number] {
  const offset = codePoint - 0x1_0000;
  return [0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff)];
}

function spell(atom: NameAtom): string {
  const { codePoint } = atom.point;
  switch (atom.spelling) {
    case "braced":
      return `\\u{0${hex(codePoint, 1)}}`;
    case "escaped":
      if (codePoint <= 0xffff) return `\\u${hex(codePoint, 4)}`;
      return surrogates(codePoint)
        .map((unit) => `\\u${hex(unit, 4)}`)
        .join("");
    case "split": {
      if (codePoint <= 0xffff) return `\\u${hex(codePoint, 4)}`;
      const [lead, trail] = surrogates(codePoint);
      return `\\u${hex(lead, 4)}${String.fromCharCode(trail)}`;
    }
    case "written":
      return String.fromCodePoint(codePoint);
  }
}

/** Whether the spelled name is valid, decided from the table alone. */
function nameValid(atoms: readonly NameAtom[]): boolean {
  return atoms.every((atom, index) => {
    if (atom.spelling === "split" && atom.point.codePoint > 0xffff) {
      return false;
    }
    return index === 0 ? atom.point.start : atom.point.part;
  });
}

function decoded(atoms: readonly NameAtom[]): string {
  return atoms
    .map((atom) => String.fromCodePoint(atom.point.codePoint))
    .join("");
}

interface NameCase {
  readonly alias: readonly Spelling[];
  readonly atoms: readonly NameAtom[];
  readonly unicode: boolean;
}

const spellingArbitrary = fc.constantFrom<Spelling>(
  "braced",
  "escaped",
  "split",
  "written",
);

const nameCaseArbitrary: fc.Arbitrary<NameCase> = fc
  .array(
    fc.record({
      point: fc.constantFrom(...namePoints),
      spelling: spellingArbitrary,
    }),
    { maxLength: 3, minLength: 1 },
  )
  .chain((atoms) =>
    fc.record({
      alias: fc.array(
        fc.constantFrom<Spelling>("braced", "escaped", "written"),
        { maxLength: atoms.length, minLength: atoms.length },
      ),
      atoms: fc.constant(atoms),
      unicode: fc.boolean(),
    }),
  );

/**
 * The same name with every point spelled another valid way. A split
 * spelling never survives into the alias, so the alias is valid exactly
 * when the code points are.
 */
function aliasAtoms(testCase: NameCase): readonly NameAtom[] {
  return testCase.atoms.map((atom, index) => ({
    point: atom.point,
    spelling: testCase.alias[index] ?? "written",
  }));
}

interface NameProbe {
  readonly input: string;
  readonly label: string;
  readonly source: string;
}

function nameProbes(testCase: NameCase): readonly NameProbe[] {
  const name = testCase.atoms.map(spell).join("");
  const alias = aliasAtoms(testCase).map(spell).join("");
  return [
    { input: "q", label: "declare", source: `(?<${name}>.)` },
    { input: "qq", label: "reference", source: `(?<${name}>.)\\k<${alias}>` },
    {
      input: "qq",
      label: "forward",
      source: `\\k<${alias}>(?<${name}>q)q`,
    },
    {
      input: "b",
      label: "exclusive",
      source: `(?<${name}>a)|(?<${alias}>b)`,
    },
    {
      input: "ab",
      label: "coexisting",
      source: `(?<${name}>a)(?<${alias}>b)`,
    },
    { input: "q", label: "missing", source: `(?<${name}>.)\\k<Missing>` },
  ];
}

function expectedProbe(testCase: NameCase, probe: NameProbe): string {
  if (!nameValid(testCase.atoms)) return `${probe.label} SyntaxError`;
  const key = decoded(testCase.atoms);
  switch (probe.label) {
    case "declare":
      return `${probe.label} 0 q ${key}=q 0-1`;
    case "reference":
      return `${probe.label} 0 qq ${key}=q 0-1`;
    case "forward":
      return `${probe.label} 0 qq ${key}=q 0-1`;
    case "exclusive":
      return `${probe.label} 0 b ${key}=b 0-1`;
    default:
      return `${probe.label} SyntaxError`;
  }
}

function nameProgram(testCase: NameCase): string {
  const flags = testCase.unicode ? "du" : "d";
  return [
    "function probe(label, source, input) {",
    "  let regexp;",
    "  try {",
    `    regexp = new RegExp(source, ${JSON.stringify(flags)});`,
    "  } catch (error) {",
    "    console.log(label, error.name);",
    "    return;",
    "  }",
    "  const match = regexp.exec(input);",
    "  const keys = Object.keys(match.groups);",
    "  const pairs = keys.map((key) => key + '=' + match.groups[key]);",
    "  const spans = keys.map((key) => match.indices.groups[key].join('-'));",
    "  console.log(label, match.index, match[0], pairs.join(','), " +
      "spans.join(','));",
    "}",
    ...nameProbes(testCase).map(
      (probe) =>
        `probe(${JSON.stringify(probe.label)}, ` +
        `${JSON.stringify(probe.source)}, ${JSON.stringify(probe.input)});`,
    ),
    "",
  ].join("\n");
}

/** The pinned identifier callbacks the build gives the compiler parser. */
const pinnedIdentifiers: RegExpPatternExtensions = {
  admitted: [],
  identifierPart: (codePoint) =>
    codePointSetHas(binaryPropertySet("ID_Continue") ?? [], codePoint),
  identifierStart: (codePoint) =>
    codePointSetHas(binaryPropertySet("ID_Start") ?? [], codePoint),
};

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

test("the group-name table agrees with the pinned identifier data", () => {
  for (const point of namePoints) {
    const special = point.codePoint === 0x24 || point.codePoint === 0x5f;
    const joiner = point.codePoint === 0x200c || point.codePoint === 0x200d;
    assert.equal(
      point.start,
      special || pinnedIdentifiers.identifierStart?.(point.codePoint),
      hex(point.codePoint, 4),
    );
    assert.equal(
      point.part,
      special || joiner || pinnedIdentifiers.identifierPart?.(point.codePoint),
      hex(point.codePoint, 4),
    );
  }
});

test(
  "generated dynamic group names decode and classify like the edition",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "dynamic group names, references, and duplicates follow the table",
      fc.asyncProperty(nameCaseArbitrary, async (testCase) => {
        for (const probe of nameProbes(testCase)) {
          const parsed = parseRegExpPattern({
            extensions: pinnedIdentifiers,
            flags: testCase.unicode ? "du" : "d",
            source: probe.source,
          });
          const valid = !expectedProbe(testCase, probe).endsWith("SyntaxError");
          assert.equal(parsed.parsed, valid, probe.source);
        }
        const native = await runNativeCli(
          {
            args: ["generated-m5-regexp-group-names.ts"],
            source: nameProgram(testCase),
            sourceId: "generated-m5-regexp-group-names.ts",
            version: "0.1.0",
          },
          host,
        );
        assert.equal(native.stderr, "");
        assert.equal(native.exitStatus, 0);
        assert.equal(
          native.stdout,
          nameProbes(testCase)
            .map((probe) => `${expectedProbe(testCase, probe)}\n`)
            .join(""),
        );
      }),
      {
        context:
          nativeTarget == null || host.executionHost == null
            ? ["target=unsupported host=unknown"]
            : [
                `target=${nativeTarget.name}`,
                `host=${host.executionHost.operatingSystem}/` +
                  host.executionHost.architecture,
                `sanitizers=${nativeTarget.sanitizers.join(",")}`,
              ],
        domain:
          "one dynamically constructed group name of one to three code " +
          "points from a fixed identifier table, each written, escaped, " +
          "braced, or split across an escaped lead and a written trail " +
          "surrogate, with an alias spelling, with or without u, " +
          "declared, referenced backward and forward, duplicated in " +
          "exclusive and coexisting alternatives, and referenced by a " +
          "missing name",
        numRuns: 8,
        profile: "M5 RegExp dynamic group names",
        seed: 0x6000_5d01,
        sizeLimit:
          "at most three name code points from seventeen table entries, " +
          "four spellings, and six probes per program",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
