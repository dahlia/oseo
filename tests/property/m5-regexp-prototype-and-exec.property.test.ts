/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import { runNativeCli } from "../../packages/cli/src/index.ts";
import {
  buildRegExpMatcher,
  compileSource,
  describeTarget,
  parseRegExpPattern,
  printMir,
  searchRegExpMatcher,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import type {
  RegExpMatcherProgram,
  RegExpSpan,
} from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import { zigToolchain } from "../../packages/toolchain-zig/src/index.ts";
import { unicodeMatcherData } from "../regexp-matcher-data.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

interface Observation {
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * The generated pattern model.
 *
 * The model stays structured until the predicate prints it, so a shrunk
 * failure keeps its group graph, quantifier bounds, assertion direction,
 * and reference validity instead of decaying into unparseable text.
 */
interface Quantifier {
  readonly greedy: boolean;
  readonly maximum: number | undefined;
  readonly minimum: number;
}

type Atom =
  | { readonly kind: "character"; readonly value: string }
  | { readonly kind: "class-escape"; readonly name: string }
  | {
      readonly kind: "class";
      readonly members: readonly string[];
      readonly negated: boolean;
    }
  | { readonly kind: "dot" }
  | {
      readonly body: Disjunction;
      readonly capturing: boolean;
      readonly kind: "group";
      readonly name: string | undefined;
    }
  | { readonly index: number; readonly kind: "backreference" };

type Term =
  | { readonly assertion: string; readonly kind: "assertion" }
  | {
      readonly behind: boolean;
      readonly body: Disjunction;
      readonly kind: "lookaround";
      readonly negated: boolean;
    }
  | {
      readonly atom: Atom;
      readonly kind: "atom";
      readonly quantifier: Quantifier | undefined;
    };

type Alternative = readonly Term[];
type Disjunction = readonly Alternative[];

interface PatternCase {
  readonly body: Disjunction;
  readonly flags: string;
  readonly texts: readonly string[];
}

const asciiCharacters = [
  "a",
  "b",
  "c",
  "k",
  "s",
  "x",
  "0",
  "_",
  " ",
  "-",
] as const;
const supplementaryCharacters = ["\u{1D306}", "\u{10428}"] as const;
/** The only two case-equivalence classes that mix ASCII with non-ASCII. */
const foldedCharacters = ["K", "S", "\u017F", "\u212A"] as const;
const classEscapes = ["d", "D", "s", "S", "w", "W"] as const;
const assertions = ["^", "$", "\\b", "\\B"] as const;

function quantifierArbitrary(): fc.Arbitrary<Quantifier> {
  return fc.oneof(
    fc.constant({ greedy: true, maximum: undefined, minimum: 0 }),
    fc.constant({ greedy: false, maximum: undefined, minimum: 0 }),
    fc.constant({ greedy: true, maximum: undefined, minimum: 1 }),
    fc.constant({ greedy: true, maximum: 1, minimum: 0 }),
    fc.constant({ greedy: false, maximum: 1, minimum: 0 }),
    fc.constant({ greedy: true, maximum: 3, minimum: 2 }),
    fc.constant({ greedy: false, maximum: 3, minimum: 1 }),
  );
}

/** True when a subtree already repeats, which forbids repeating it again. */
function repeats(node: Disjunction): boolean {
  return node.some((alternative) =>
    alternative.some((term) => {
      if (term.kind === "assertion") return false;
      if (term.kind === "lookaround") return repeats(term.body);
      if (term.quantifier != null) return true;
      return term.atom.kind === "group" ? repeats(term.atom.body) : false;
    }),
  );
}

function patternArbitrary(
  characters: readonly string[],
  unicodeMode: boolean,
): fc.Arbitrary<Disjunction> {
  const { disjunction } = fc.letrec<{
    alternative: Alternative;
    atom: Atom;
    disjunction: Disjunction;
    term: Term;
  }>((tie) => ({
    alternative: fc.array(tie("term"), { maxLength: 4, minLength: 0 }),
    atom: fc.oneof(
      { depthSize: "small", maxDepth: 2, withCrossShrink: true },
      fc.record({
        kind: fc.constant("character" as const),
        value: fc.constantFrom(...characters),
      }),
      fc.record({
        kind: fc.constant("class-escape" as const),
        name: fc.constantFrom(...classEscapes),
      }),
      fc.record({
        kind: fc.constant("class" as const),
        members: fc.array(fc.constantFrom(...characters), {
          maxLength: 3,
          minLength: 1,
        }),
        negated: fc.boolean(),
      }),
      fc.record({ kind: fc.constant("dot" as const) }),
      fc.record({
        index: fc.integer({ max: 8, min: 0 }),
        kind: fc.constant("backreference" as const),
      }),
      fc.record({
        body: tie("disjunction"),
        capturing: fc.boolean(),
        kind: fc.constant("group" as const),
        name: fc.option(fc.constantFrom("first", "second"), { nil: undefined }),
      }),
    ),
    disjunction: fc.array(tie("alternative"), { maxLength: 3, minLength: 1 }),
    /*
     * A unicode-mode term never asserts. The edition advances a failed
     * attempt by one code point, so it resumes after a surrogate pair;
     * V8 resumes between the pair's two code units instead. Only a
     * zero-width term can succeed there, because V8 still reads a whole
     * code point when it consumes at the resumed position, so a negated
     * class that excludes a supplementary code point matches nothing at
     * that position on either side. Excluding assertions under `u`
     * therefore keeps the reference hosts a sound oracle while every
     * other unicode-mode shape still generates, and non-unicode terms
     * keep the complete assertion and lookaround vocabulary.
     */
    term: unicodeMode
      ? fc.record({
          atom: tie("atom"),
          kind: fc.constant("atom" as const),
          quantifier: fc.option(quantifierArbitrary(), { nil: undefined }),
        })
      : fc.oneof(
          { depthSize: "small", maxDepth: 2, withCrossShrink: true },
          fc.record({
            assertion: fc.constantFrom(...assertions),
            kind: fc.constant("assertion" as const),
          }),
          fc.record({
            atom: tie("atom"),
            kind: fc.constant("atom" as const),
            quantifier: fc.option(quantifierArbitrary(), { nil: undefined }),
          }),
          fc.record({
            behind: fc.boolean(),
            body: tie("disjunction"),
            kind: fc.constant("lookaround" as const),
            negated: fc.boolean(),
          }),
        ),
  }));
  return disjunction;
}

/**
 * Resolve a raw model into one this profile admits.
 *
 * Capture indices are assigned in source order, a reference is bound to a
 * capture that exists, a duplicate group name is dropped, and a
 * quantifier is removed from any atom that already repeats. The last rule
 * keeps generated backtracking linear, so a reached execution boundary is
 * a defect rather than an ordinary case.
 *
 * An ignore-case backreference is replaced by an ordinary character: it is
 * the one construct whose closure can need case-folding data the runtime
 * does not link, and the boundary domain owns that case instead.
 */
function resolve(body: Disjunction, ignoreCase: boolean): Disjunction {
  let captures = 0;
  const usedNames = new Set<string>();
  const resolveDisjunction = (node: Disjunction): Disjunction =>
    node.map((alternative) => alternative.map(resolveTerm));
  const resolveAtom = (atom: Atom): Atom => {
    if (atom.kind === "backreference") {
      if (captures === 0 || ignoreCase) {
        return { kind: "character", value: "a" };
      }
      return { index: 1 + (atom.index % captures), kind: "backreference" };
    }
    if (atom.kind !== "group") return atom;
    let name = atom.capturing ? atom.name : undefined;
    if (name != null && usedNames.has(name)) name = undefined;
    if (name != null) usedNames.add(name);
    if (atom.capturing) captures += 1;
    return {
      body: resolveDisjunction(atom.body),
      capturing: atom.capturing,
      kind: "group",
      name,
    };
  };
  const resolveTerm = (term: Term): Term => {
    if (term.kind === "assertion") return term;
    if (term.kind === "lookaround") {
      return {
        behind: term.behind,
        body: resolveDisjunction(term.body),
        kind: "lookaround",
        negated: term.negated,
      };
    }
    const atom = resolveAtom(term.atom);
    const nested = atom.kind === "group" && repeats(atom.body);
    return {
      atom,
      kind: "atom",
      quantifier: nested ? undefined : term.quantifier,
    };
  };
  return resolveDisjunction(body);
}

function printQuantifier(quantifier: Quantifier): string {
  const suffix = quantifier.greedy ? "" : "?";
  if (quantifier.minimum === 0 && quantifier.maximum === undefined) {
    return `*${suffix}`;
  }
  if (quantifier.minimum === 1 && quantifier.maximum === undefined) {
    return `+${suffix}`;
  }
  if (quantifier.minimum === 0 && quantifier.maximum === 1) {
    return `?${suffix}`;
  }
  return `{${quantifier.minimum},${quantifier.maximum ?? ""}}${suffix}`;
}

/*
 * The two escaping contexts a generated character can print in.
 *
 * A unicode-mode identity escape is admitted only for a syntax
 * character, so every other character prints literally, and the members
 * a class needs escaped are not the ones the main body needs.
 */
const atomSyntax = new Set([
  "$",
  "(",
  ")",
  "*",
  "+",
  ".",
  "/",
  "?",
  "[",
  "\\",
  "]",
  "^",
  "{",
  "|",
  "}",
]);
const classSyntax = new Set(["-", "[", "\\", "]", "^"]);

function printCharacter(value: string): string {
  const point = value.codePointAt(0) ?? 0;
  if (point > 0x7f) {
    return `\\u{${point.toString(16).toUpperCase()}}`;
  }
  return atomSyntax.has(value) ? `\\${value}` : value;
}

function printClassCharacter(value: string): string {
  const point = value.codePointAt(0) ?? 0;
  if (point > 0x7f) {
    return `\\u{${point.toString(16).toUpperCase()}}`;
  }
  return classSyntax.has(value) ? `\\${value}` : value;
}

function printAtom(atom: Atom): string {
  if (atom.kind === "character") return printCharacter(atom.value);
  if (atom.kind === "class-escape") return `\\${atom.name}`;
  if (atom.kind === "dot") return ".";
  if (atom.kind === "backreference") return `\\${atom.index}`;
  if (atom.kind === "class") {
    const members = atom.members.map(printClassCharacter).join("");
    return `[${atom.negated ? "^" : ""}${members}]`;
  }
  const head = atom.capturing
    ? atom.name == null
      ? "("
      : `(?<${atom.name}>`
    : "(?:";
  return `${head}${printDisjunction(atom.body)})`;
}

function printTerm(term: Term): string {
  if (term.kind === "assertion") return term.assertion;
  if (term.kind === "lookaround") {
    const head = `(?${term.behind ? "<" : ""}${term.negated ? "!" : "="}`;
    return `${head}${printDisjunction(term.body)})`;
  }
  const atom = printAtom(term.atom);
  return term.quantifier == null
    ? atom
    : `${atom}${printQuantifier(term.quantifier)}`;
}

function printDisjunction(node: Disjunction): string {
  return node
    .map((alternative) => alternative.map(printTerm).join(""))
    .join("|");
}

const flagArbitrary = fc
  .subarray(["d", "g", "m", "s", "y"], { maxLength: 5 })
  .chain((ordinary) =>
    fc
      .tuple(
        fc.shuffledSubarray(ordinary),
        fc.constantFrom("", "", "u", "i", "iu"),
      )
      .map(([selected, extra]) => selected.join("") + extra),
  );

const patternCase: fc.Arbitrary<PatternCase> = flagArbitrary.chain((flags) => {
  const unicodeMode = flags.includes("u");
  const ignoreCase = flags.includes("i");
  // A pattern that names a non-ASCII code point under `i` is a documented
  // runtime boundary the boundary domain owns, and a supplementary code
  // point only reaches the matcher under `u`. Input text carries no such
  // restriction, so the two folding classes that mix ASCII with non-ASCII
  // reach the matcher through `k`, `s`, U+017F, and U+212A under `iu`.
  const characters =
    unicodeMode && !ignoreCase
      ? [...asciiCharacters, ...supplementaryCharacters]
      : [...asciiCharacters];
  const texts = unicodeMode
    ? [...asciiCharacters, ...supplementaryCharacters, ...foldedCharacters]
    : [...asciiCharacters, ...foldedCharacters];
  return fc.record({
    body: patternArbitrary(characters, unicodeMode).map((body) =>
      resolve(body, flags.includes("i")),
    ),
    flags: fc.constant(flags),
    texts: fc.array(
      fc
        .array(fc.constantFrom(...texts), { maxLength: 6, minLength: 0 })
        .map((parts) => parts.join("")),
      { maxLength: 3, minLength: 1 },
    ),
  });
});

const flagCase = fc.record({
  flags: flagArbitrary,
  source: fc.constantFrom(
    "",
    "a",
    "/",
    "[/]",
    "a\nb",
    "\\/x",
    "(?:ab)|c",
    "a b",
  ),
});

const boundaryCase = fc.constantFrom(
  { flags: "i", pattern: "é" },
  { flags: "i", pattern: "[à-ï]" },
  { flags: "iu", pattern: "\\u{1D306}" },
  // Simple case folding maps U+212A and U+017F into ASCII, but the
  // code-unit uppercase rule the non-unicode modes use does not, so naming
  // either one under a bare `i` still needs data that is not linked.
  { flags: "i", pattern: "K" },
  { flags: "i", pattern: "ſ" },
  { flags: "i", pattern: "(.)\\1" },
  { flags: "iu", pattern: "(\\S)\\1" },
  { flags: "i", pattern: "([^a])\\1" },
);

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

async function references(source: string): Promise<readonly Observation[]> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-regexp-prototype-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
    );
    const observations = [
      await host.run({
        args: [sourcePath],
        command: process.execPath,
        cwd: directory,
      }),
      await host.run({
        args: ["run", "--quiet", sourcePath],
        command: "deno",
        cwd: directory,
      }),
    ] as const;
    succeeded = true;
    return observations;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

const showFunction = `
function show(match) {
  if (match === null) return "null";
  let text = "[" + match.index + "|";
  for (let index = 0; index < match.length; index = index + 1) {
    text = text + (match[index] === undefined ? "<u>" : match[index]) + "/";
  }
  text = text + "]";
  if (match.groups !== undefined) {
    text = text + "{";
    for (const key of Object.keys(match.groups)) {
      const value = match.groups[key];
      text = text + key + "=" + (value === undefined ? "<u>" : value) + ",";
    }
    text = text + "}";
  }
  if (match.indices !== undefined) {
    text = text + "#";
    for (let index = 0; index < match.indices.length; index = index + 1) {
      const pair = match.indices[index];
      text = text + (pair === undefined
        ? "<u>"
        : "(" + pair[0] + "," + pair[1] + ")");
    }
  }
  return text;
}
`;

/**
 * The compiler-side matcher's answer for one built-in execution.
 *
 * The generic matcher artifact is the semantic authority for the family,
 * so the expected observation is derived from it rather than from the
 * reference hosts. The hosts still see the same source, which is what
 * makes a disagreement visible from three sides at once.
 */
function oracleExec(
  program: RegExpMatcherProgram,
  text: string,
  state: { lastIndex: number },
): readonly (RegExpSpan | undefined)[] | undefined {
  const flags = program.flags;
  const anchored = flags.global || flags.sticky;
  const startIndex = anchored ? state.lastIndex : 0;
  if (startIndex > text.length) {
    if (anchored) state.lastIndex = 0;
    return undefined;
  }
  const outcome = searchRegExpMatcher({ program, startIndex, text });
  assert.notEqual(
    outcome.outcome,
    "limit",
    "a generated case must stay inside the reviewed execution limits",
  );
  if (outcome.outcome !== "matched") {
    if (anchored) state.lastIndex = 0;
    return undefined;
  }
  const whole = outcome.captures[0];
  assert.ok(whole != null);
  if (anchored) state.lastIndex = whole.end;
  return outcome.captures;
}

function oracleShow(
  program: RegExpMatcherProgram,
  text: string,
  captures: readonly (RegExpSpan | undefined)[] | undefined,
): string {
  if (captures == null) return "null";
  const whole = captures[0];
  assert.ok(whole != null);
  let out = `[${whole.start}|`;
  for (const span of captures) {
    out += (span == null ? "<u>" : text.slice(span.start, span.end)) + "/";
  }
  out += "]";
  const named = program.captures.filter((capture) => capture.name != null);
  if (named.length > 0) {
    out += "{";
    for (const capture of named) {
      const span = captures[capture.index];
      out += `${capture.name ?? ""}=`;
      out += span == null ? "<u>" : text.slice(span.start, span.end);
      out += ",";
    }
    out += "}";
  }
  if (program.flags.hasIndices) {
    out += "#";
    for (const span of captures) {
      out += span == null ? "<u>" : `(${span.start},${span.end})`;
    }
  }
  return out;
}

function patternSource(testCase: PatternCase): string {
  const pattern = printDisjunction(testCase.body);
  const flags = testCase.flags;
  const lines = [
    showFunction,
    `const expression = new RegExp(${JSON.stringify(pattern)}, ` +
      `${JSON.stringify(flags)});`,
    `const texts = ${JSON.stringify(testCase.texts)};`,
    "for (let index = 0; index < texts.length; index = index + 1) {",
    "  for (let round = 0; round < 2; round = round + 1) {",
    "    console.log(",
    '      "run",',
    "      show(expression.exec(texts[index])),",
    "      expression.lastIndex,",
    "    );",
    "  }",
    "}",
    "/** @param {number} value */\nfunction hinted(value) {",
    "  return value + 1;",
    "}",
    'console.log("hint", hinted(1), hinted("x"));',
  ];
  return lines.join("\n");
}

function patternExpected(
  program: RegExpMatcherProgram,
  testCase: PatternCase,
): Observation {
  const state = { lastIndex: 0 };
  const lines: string[] = [];
  for (const text of testCase.texts) {
    for (let round = 0; round < 2; round += 1) {
      const captures = oracleExec(program, text, state);
      lines.push(
        `run ${oracleShow(program, text, captures)} ${state.lastIndex}`,
      );
    }
  }
  lines.push("hint 2 x1");
  return { exitStatus: 0, stderr: "", stdout: `${lines.join("\n")}\n` };
}

function flagSource(testCase: { flags: string; source: string }): string {
  const pattern = JSON.stringify(testCase.source);
  const flags = JSON.stringify(testCase.flags);
  return `
const expression = new RegExp(${pattern}, ${flags});
console.log(
  "flags",
  expression.flags,
  expression.hasIndices,
  expression.global,
  expression.ignoreCase,
  expression.multiline,
  expression.dotAll,
  expression.unicode,
  expression.unicodeSets,
  expression.sticky,
);
console.log("text", expression.source, expression.toString());
console.log(
  "round trip",
  new RegExp(expression.source, expression.flags).source ===
    expression.source,
);
try {
  RegExp.prototype.exec.call({ source: "a", flags: "" }, "a");
} catch (error) {
  console.log("receiver", error instanceof TypeError);
}
/** @param {number} value */
function hinted(value) { return value + 1; }
console.log("hint", hinted(1), hinted("x"));
`;
}

function flagExpected(testCase: {
  flags: string;
  source: string;
}): Observation {
  const order = ["d", "g", "i", "m", "s", "u", "v", "y"];
  const normalized = order
    .filter((flag) => testCase.flags.includes(flag))
    .join("");
  const has = (flag: string): string => String(normalized.includes(flag));
  const escaped =
    testCase.source.length === 0 ? "(?:)" : escapePattern(testCase.source);
  return {
    exitStatus: 0,
    stderr: "",
    stdout:
      `flags ${normalized} ${has("d")} ${has("g")} ${has("i")} ` +
      `${has("m")} ${has("s")} ${has("u")} ${has("v")} ${has("y")}\n` +
      `text ${escaped} /${escaped}/${normalized}\n` +
      "round trip true\n" +
      "receiver true\n" +
      "hint 2 x1\n",
  };
}

/** EscapeRegExpPattern, mirrored so the oracle owns the expected text. */
function escapePattern(source: string): string {
  let out = "";
  let characterClass = false;
  let escaped = false;
  for (const unit of source) {
    if (
      unit === "\n" ||
      unit === "\r" ||
      unit === "\u2028" ||
      unit === "\u2029"
    ) {
      if (!escaped) out += "\\";
      out +=
        unit === "\n"
          ? "n"
          : unit === "\r"
            ? "r"
            : unit === "\u2028"
              ? "u2028"
              : "u2029";
      escaped = false;
      continue;
    }
    if (escaped) escaped = false;
    else if (unit === "\\") escaped = true;
    else if (unit === "[") characterClass = true;
    else if (unit === "]") characterClass = false;
    else if (unit === "/" && !characterClass) out += "\\";
    out += unit;
  }
  return out;
}

async function assertNative(
  source: string,
  expected: Observation,
  sourceId: string,
): Promise<void> {
  assertMatchingObservations([expected, ...(await references(source))]);
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const mir = printMir(compiled.mir);
    if (specialization === "enabled") {
      assert.match(mir, /guard-shape/u);
      assert.match(mir, /property-get generic/u);
    } else {
      assert.doesNotMatch(mir, /guard-(?:smi|shape)/u);
    }
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      await withNativeFixture(
        {
          backend: cBackend,
          host,
          input: compiled.mir,
          operation: "execute",
          runtime: cRuntimeProvider,
          target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
          toolchain: zigToolchain,
        },
        (native) => {
          assertMatchingObservations([expected, native]);
          assert.ok(native.counters?.collections != null);
          assert.ok(native.counters.collections > 0);
          if (specialization === "enabled") {
            assert.ok(native.counters.guardMisses > 0);
          }
        },
      );
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }
}

function propertyContext(): readonly string[] {
  if (nativeTarget == null || host.executionHost == null) {
    return ["target=unsupported host=unknown"];
  }
  return [
    `target=${nativeTarget.name}`,
    `host=${host.executionHost.operatingSystem}/` +
      host.executionHost.architecture,
    `sanitizers=${nativeTarget.sanitizers.join(",")}`,
  ];
}

test(
  "generated built-in execution matches the generic matcher and hosts",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "generated patterns execute, capture, and advance identically",
      fc.asyncProperty(patternCase, async (testCase) => {
        const source = printDisjunction(testCase.body);
        const parsed = parseRegExpPattern({
          flags: testCase.flags,
          source,
        });
        assert.equal(parsed.parsed, true, `/${source}/${testCase.flags}`);
        assert.ok(parsed.pattern != null);
        const built = buildRegExpMatcher(parsed.pattern, {
          unicodeData: unicodeMatcherData,
        });
        assert.deepEqual(built.errors, []);
        assert.ok(built.program != null);
        await assertNative(
          patternSource(testCase),
          patternExpected(built.program, testCase),
          "generated-m5-regexp-execution.ts",
        );
      }),
      {
        context: propertyContext(),
        domain:
          "one generated pattern of alternatives, sequences, greedy and " +
          "lazy quantifiers, character classes, class escapes, capturing " +
          "and named groups, resolved backreferences, edge and word " +
          "assertions, and forward and backward lookaround, with a " +
          "reference replaced by a character under `i` because the " +
          "boundary domain owns that case and with no assertion in " +
          "unicode mode because the reference hosts retry a failed " +
          "attempt one code unit later; one unique " +
          "flag sequence; up to three inputs of ASCII, supplementary, " +
          "folded, and " +
          "empty text; two successive executions each; one false number " +
          "hint; and one shape-guard miss",
        numRuns: 8,
        profile: "M5 RegExp built-in execution",
        seed: 0x6000_5000,
        sizeLimit:
          "at most three alternatives, four terms, depth two, quantifier " +
          "bounds at most three, six input characters, and three inputs",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);

test(
  "generated prototype accessors and stringification match an oracle",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "flags, source escaping, and toString agree with the oracle",
      fc.asyncProperty(flagCase, async (testCase) => {
        await assertNative(
          flagSource(testCase),
          flagExpected(testCase),
          "generated-m5-regexp-accessors.ts",
        );
      }),
      {
        context: propertyContext(),
        domain:
          "one unique flag sequence in any order, one pattern that is " +
          "empty or holds an escaped or unescaped solidus, a line " +
          "terminator, or a class, one round trip through `source` and " +
          "`flags`, one non-RegExp receiver, one false number hint, and " +
          "one shape-guard miss",
        numRuns: 6,
        profile: "M5 RegExp prototype accessors",
        seed: 0x6000_5001,
        sizeLimit: "one pattern of at most eight units and five flags",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

test(
  "generated ignore-case boundaries report one located diagnostic",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "an unlinked case-folding requirement stays an owned boundary",
      fc.asyncProperty(boundaryCase, async (testCase) => {
        const parsed = parseRegExpPattern({
          flags: testCase.flags,
          source: testCase.pattern,
        });
        assert.equal(parsed.parsed, true);
        const native = await runNativeCli(
          {
            args: ["generated-m5-regexp-case-boundary.ts"],
            source:
              `new RegExp(${JSON.stringify(testCase.pattern)}, ` +
              `${JSON.stringify(testCase.flags)});`,
            sourceId: "generated-m5-regexp-case-boundary.ts",
            version: "0.1.0",
          },
          host,
        );
        assert.equal(native.exitStatus, 1);
        assert.equal(native.stdout, "");
        assert.match(
          native.stderr,
          /^generated-m5-regexp-case-boundary\.ts:1:\d+: /u,
        );
        assert.match(
          native.stderr,
          /error\[OSEO2001\]: Regular expression pattern extension/u,
        );
      }),
      {
        context: propertyContext(),
        domain:
          "one ignore-case pattern whose closure needs case-folding data " +
          "the runtime does not link: a non-ASCII character, a non-ASCII " +
          "class range, a supplementary escape, one of the two characters " +
          "only simple case folding maps into ASCII, or a " +
          "backreference whose sets reach an unknown equivalence class",
        numRuns: 6,
        profile: "M5 RegExp ignore-case boundaries",
        seed: 0x6000_5002,
        sizeLimit: "one pattern of at most twelve units and two flags",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
