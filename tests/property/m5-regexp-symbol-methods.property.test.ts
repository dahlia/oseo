/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
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
 * failure keeps its alternation, group graph, and quantifier bounds
 * instead of decaying into unparseable text. The vocabulary is
 * deliberately narrower than the execution family's: this family observes
 * what the symbol methods do with a match, so a pattern only has to reach
 * empty matches, captures, named captures, and repeated matches.
 */
type Atom =
  | { readonly kind: "character"; readonly value: string }
  | {
      readonly kind: "class";
      readonly member: string;
      readonly negated: boolean;
    }
  | { readonly kind: "dot" }
  | { readonly escape: string; readonly kind: "class-escape" }
  | {
      readonly body: Disjunction;
      readonly kind: "group";
      readonly name: string | undefined;
    };

interface Term {
  readonly atom: Atom;
  readonly quantifier: string;
}

type Alternative = readonly Term[];
type Disjunction = readonly Alternative[];

interface MethodCase {
  readonly body: Disjunction;
  readonly flags: string;
  readonly subject: string;
}

const subjectCharacters = ["a", "b", "c", "1", " ", "\n"] as const;
const patternCharacters = ["a", "b", "c", "1"] as const;

/**
 * Flag sequences in the order `flags` prints. Supplementary code points
 * stay out of every subject, so a unicode-mode failed attempt never
 * resumes between the two code units of a pair and the family's one
 * documented V8 divergence cannot reach this domain.
 */
const flagSequences = ["", "g", "i", "gi", "u", "gu", "y", "gy"] as const;

function disjunctionArbitrary(depth: number): fc.Arbitrary<Disjunction> {
  return fc.array(
    fc.array(termArbitrary(depth), { maxLength: 3, minLength: 1 }),
    { maxLength: 2, minLength: 1 },
  );
}

function atomArbitrary(depth: number): fc.Arbitrary<Atom> {
  const leaves: readonly fc.Arbitrary<Atom>[] = [
    fc
      .constantFrom(...patternCharacters)
      .map((value): Atom => ({ kind: "character", value })),
    fc
      .constantFrom("d", "w", "s")
      .map((escape): Atom => ({ escape, kind: "class-escape" })),
    fc
      .record({
        member: fc.constantFrom(...patternCharacters),
        negated: fc.boolean(),
      })
      .map(
        (record): Atom => ({
          kind: "class",
          member: record.member,
          negated: record.negated,
        }),
      ),
    fc.constant<Atom>({ kind: "dot" }),
  ];
  if (depth === 0) return fc.oneof(...leaves);
  return fc.oneof(
    ...leaves,
    fc
      .record({
        body: disjunctionArbitrary(depth - 1),
        name: fc.constantFrom<string | undefined>(undefined, "g"),
      })
      .map(
        (record): Atom => ({
          body: record.body,
          kind: "group",
          name: record.name,
        }),
      ),
  );
}

function termArbitrary(depth: number): fc.Arbitrary<Term> {
  return fc.record({
    atom: atomArbitrary(depth),
    quantifier: fc.constantFrom("", "", "*", "+", "?", "{1,2}", "*?"),
  });
}

const methodCase: fc.Arbitrary<MethodCase> = fc.record({
  body: disjunctionArbitrary(1),
  flags: fc.constantFrom(...flagSequences),
  subject: fc
    .array(fc.constantFrom(...subjectCharacters), { maxLength: 6 })
    .map((parts) => parts.join("")),
});

function printAtom(atom: Atom): string {
  if (atom.kind === "character") return atom.value;
  if (atom.kind === "dot") return ".";
  if (atom.kind === "class-escape") return `\\${atom.escape}`;
  if (atom.kind === "class") {
    return `[${atom.negated ? "^" : ""}${atom.member}]`;
  }
  const head = atom.name == null ? "(" : `(?<${atom.name}>`;
  return `${head}${printDisjunction(atom.body)})`;
}

function printDisjunction(body: Disjunction): string {
  return body
    .map((alternative) =>
      alternative
        .map((term) => printAtom(term.atom) + term.quantifier)
        .join(""),
    )
    .join("|");
}

/**
 * A pattern may name `g` only once, because a duplicate group name is an
 * early error outside alternatives that cannot both participate. The
 * generator names groups freely, so the printed pattern drops every name
 * after the first.
 */
function withUniqueNames(body: Disjunction): Disjunction {
  let seen = false;
  const rename = (node: Disjunction): Disjunction =>
    node.map((alternative) =>
      alternative.map((term) => {
        if (term.atom.kind !== "group") return term;
        const named = term.atom.name != null && !seen;
        if (term.atom.name != null) seen = true;
        return {
          atom: {
            body: rename(term.atom.body),
            kind: "group",
            name: named ? term.atom.name : undefined,
          },
          quantifier: term.quantifier,
        };
      }),
    );
  return rename(body);
}

/** RegExpBuiltinExec over the compiler-side matcher. */
function execOracle(
  program: RegExpMatcherProgram,
  text: string,
  state: { lastIndex: number },
): readonly (RegExpSpan | undefined)[] | undefined {
  const anchored = program.flags.global || program.flags.sticky;
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

function textOf(
  text: string,
  span: RegExpSpan | undefined,
): string | undefined {
  return span == null ? undefined : text.slice(span.start, span.end);
}

/** The printed form of one match array, mirroring `render` in the case. */
function renderMatch(
  text: string,
  captures: readonly (RegExpSpan | undefined)[] | undefined,
): string {
  if (captures == null) return "null";
  const whole = captures[0];
  assert.ok(whole != null);
  const parts = captures.map((span) => textOf(text, span) ?? "<u>");
  return `(${whole.start}:${parts.join("/")})`;
}

/** AdvanceStringIndex. */
function advance(text: string, index: number, unicode: boolean): number {
  if (!unicode || index + 1 >= text.length) return index + 1;
  const first = text.charCodeAt(index);
  if (first < 0xd800 || first > 0xdbff) return index + 1;
  const second = text.charCodeAt(index + 1);
  if (second < 0xdc00 || second > 0xdfff) return index + 1;
  return index + 2;
}

/** RegExp.prototype[@@match]. */
function matchOracle(program: RegExpMatcherProgram, text: string): string {
  const flags = program.flags;
  const unicode = flags.unicode || flags.unicodeSets;
  const state = { lastIndex: 0 };
  if (!flags.global) {
    return renderMatch(text, execOracle(program, text, state));
  }
  const collected: string[] = [];
  for (;;) {
    const captures = execOracle(program, text, state);
    if (captures == null) {
      return collected.length === 0 ? "null" : `[${collected.join("|")}]`;
    }
    collected.push(textOf(text, captures[0]) ?? "");
    if ((textOf(text, captures[0]) ?? "").length === 0) {
      state.lastIndex = advance(text, state.lastIndex, unicode);
    }
  }
}

/** RegExp.prototype[@@search]. */
function searchOracle(program: RegExpMatcherProgram, text: string): number {
  const captures = execOracle(program, text, { lastIndex: 0 });
  const whole = captures?.[0];
  return whole == null ? -1 : whole.start;
}

/** RegExp.prototype[@@split] over the sticky splitter it constructs. */
function splitOracle(
  splitter: RegExpMatcherProgram,
  text: string,
  limit: number,
  unicode: boolean,
): string {
  const output: string[] = [];
  if (limit === 0) return "[]";
  if (text.length === 0) {
    const captures = execOracle(splitter, text, { lastIndex: 0 });
    return captures == null ? "[]" : "[]";
  }
  let start = 0;
  let cursor = 0;
  while (cursor < text.length) {
    const state = { lastIndex: cursor };
    const captures = execOracle(splitter, text, state);
    if (captures == null) {
      cursor = advance(text, cursor, unicode);
      continue;
    }
    const end = Math.min(state.lastIndex, text.length);
    if (end === start) {
      cursor = advance(text, cursor, unicode);
      continue;
    }
    output.push(text.slice(start, cursor));
    if (output.length === limit) return `[${output.join("|")}]`;
    start = end;
    for (let index = 1; index < captures.length; index += 1) {
      output.push(textOf(text, captures[index]) ?? "<u>");
      if (output.length === limit) return `[${output.join("|")}]`;
    }
    cursor = start;
  }
  output.push(text.slice(start));
  return `[${output.join("|")}]`;
}

/** Every match RegExp.prototype[@@replace] collects before it builds. */
function replaceResults(
  program: RegExpMatcherProgram,
  text: string,
): readonly (readonly (RegExpSpan | undefined)[])[] {
  const flags = program.flags;
  const unicode = flags.unicode || flags.unicodeSets;
  const state = { lastIndex: 0 };
  const results: (readonly (RegExpSpan | undefined)[])[] = [];
  for (;;) {
    const captures = execOracle(program, text, state);
    if (captures == null) return results;
    results.push(captures);
    if (!flags.global) return results;
    if ((textOf(text, captures[0]) ?? "").length === 0) {
      state.lastIndex = advance(text, state.lastIndex, unicode);
    }
  }
}

/** GetSubstitution for the reviewed template. */
function substitute(
  program: RegExpMatcherProgram,
  text: string,
  captures: readonly (RegExpSpan | undefined)[],
): string {
  const matched = textOf(text, captures[0]) ?? "";
  const first = captures.length > 1 ? (textOf(text, captures[1]) ?? "") : "$1";
  const named = program.captures.find((capture) => capture.name === "g");
  const group =
    named == null ? "$<g>" : (textOf(text, captures[named.index]) ?? "");
  return `<${matched}:${first}:${group}>`;
}

/** The replacer argument list the reviewed function prints. */
function functionalReplacement(
  program: RegExpMatcherProgram,
  text: string,
  captures: readonly (RegExpSpan | undefined)[],
  position: number,
): string {
  const parts = captures.map((span) => textOf(text, span) ?? "<u>");
  parts.push(String(position), text);
  if (program.captures.some((capture) => capture.name != null)) {
    parts.push("[groups]");
  }
  return `{${parts.join(";")}}`;
}

function replaceOracle(
  program: RegExpMatcherProgram,
  text: string,
  functional: boolean,
): string {
  let accumulated = "";
  let consumed = 0;
  for (const captures of replaceResults(program, text)) {
    const whole = captures[0];
    assert.ok(whole != null);
    const position = Math.min(Math.max(whole.start, 0), text.length);
    const matched = text.slice(whole.start, whole.end);
    const replacement = functional
      ? functionalReplacement(program, text, captures, position)
      : substitute(program, text, captures);
    if (position >= consumed) {
      accumulated += text.slice(consumed, position) + replacement;
      consumed = position + matched.length;
    }
  }
  return accumulated + text.slice(consumed);
}

/** RegExp.prototype[@@matchAll] over the copy the method constructs. */
function matchAllOracle(program: RegExpMatcherProgram, text: string): string {
  const flags = program.flags;
  const unicode = flags.unicode || flags.unicodeSets;
  const state = { lastIndex: 0 };
  const steps: string[] = [];
  for (let guard = 0; guard < 24; guard += 1) {
    const captures = execOracle(program, text, state);
    if (captures == null) break;
    steps.push(renderMatch(text, captures));
    if (!flags.global) break;
    if ((textOf(text, captures[0]) ?? "").length === 0) {
      state.lastIndex = advance(text, state.lastIndex, unicode);
    }
  }
  return steps.join(";");
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

async function references(source: string): Promise<readonly Observation[]> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-regexp-symbol-property-",
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

const preamble = `
function render(match) {
  if (match === null) return "null";
  let text = "";
  for (let index = 0; index < match.length; index = index + 1) {
    if (index !== 0) text = text + "/";
    text = text + (match[index] === undefined ? "<u>" : match[index]);
  }
  return "(" + match.index + ":" + text + ")";
}
function renderList(values) {
  if (values === null) return "null";
  let text = "";
  for (let index = 0; index < values.length; index = index + 1) {
    if (index !== 0) text = text + "|";
    const value = values[index];
    text = text + (value === undefined ? "<u>" : value);
  }
  return "[" + text + "]";
}
`;

function methodSource(testCase: MethodCase, pattern: string): string {
  const flags = JSON.stringify(testCase.flags);
  const source = JSON.stringify(pattern);
  const subject = JSON.stringify(testCase.subject);
  const showMatch = testCase.flags.includes("g") ? "renderList" : "render";
  return `${preamble}
const subject = ${subject};
function make() { return new RegExp(${source}, ${flags}); }
console.log("match", ${showMatch}(make()[Symbol.match](subject)));
console.log("search", make()[Symbol.search](subject));
console.log("split", renderList(make()[Symbol.split](subject)));
console.log("splitlimit", renderList(make()[Symbol.split](subject, 3)));
console.log("replace", make()[Symbol.replace](subject, "<$&:$1:$<g>>"));
console.log("replacefn", make()[Symbol.replace](subject, function () {
  let text = "";
  for (let index = 0; index < arguments.length; index = index + 1) {
    if (index !== 0) text = text + ";";
    const value = arguments[index];
    text = text + (value === undefined
      ? "<u>"
      : typeof value === "object" ? "[groups]" : String(value));
  }
  return "{" + text + "}";
}));
let steps = "";
const iterator = make()[Symbol.matchAll](subject);
let step = iterator.next();
let guard = 0;
while (step.done !== true && guard < 24) {
  if (steps !== "") steps = steps + ";";
  steps = steps + render(step.value);
  step = iterator.next();
  guard = guard + 1;
}
console.log("matchall", steps);
/** @param {string} value */
function hinted(value) { return value.search(make()); }
console.log("hint", hinted(subject), hinted(new String(subject)));
String.prototype.regexpSymbolPropertyMarker = 1;
console.log("guard", hinted(subject));
`;
}

function methodExpected(
  program: RegExpMatcherProgram,
  splitter: RegExpMatcherProgram,
  testCase: MethodCase,
): Observation {
  const text = testCase.subject;
  const unicode = program.flags.unicode || program.flags.unicodeSets;
  const search = searchOracle(program, text);
  const lines = [
    `match ${matchOracle(program, text)}`,
    `search ${search}`,
    `split ${splitOracle(splitter, text, Number.MAX_SAFE_INTEGER, unicode)}`,
    `splitlimit ${splitOracle(splitter, text, 3, unicode)}`,
    `replace ${replaceOracle(program, text, false)}`,
    `replacefn ${replaceOracle(program, text, true)}`,
    `matchall ${matchAllOracle(program, text)}`,
    `hint ${search} ${search}`,
    `guard ${search}`,
  ];
  return { exitStatus: 0, stderr: "", stdout: `${lines.join("\n")}\n` };
}

test(
  "generated RegExp symbol methods agree with the generic matcher",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "match, search, split, replace, and matchAll agree",
      fc.asyncProperty(methodCase, async (generated) => {
        const testCase = {
          body: withUniqueNames(generated.body),
          flags: generated.flags,
          subject: generated.subject,
        };
        const pattern = printDisjunction(testCase.body);
        const parsed = parseRegExpPattern({
          flags: testCase.flags,
          source: pattern,
        });
        assert.equal(parsed.parsed, true, `/${pattern}/${testCase.flags}`);
        assert.ok(parsed.pattern != null);
        const built = buildRegExpMatcher(parsed.pattern, {
          unicodeData: unicodeMatcherData,
        });
        assert.deepEqual(built.errors, []);
        assert.ok(built.program != null);
        const stickyFlags = testCase.flags.includes("y")
          ? testCase.flags
          : `${testCase.flags}y`;
        const stickyParsed = parseRegExpPattern({
          flags: stickyFlags,
          source: pattern,
        });
        assert.ok(stickyParsed.pattern != null);
        const stickyBuilt = buildRegExpMatcher(stickyParsed.pattern, {
          unicodeData: unicodeMatcherData,
        });
        assert.ok(stickyBuilt.program != null);
        await assertNative(
          methodSource(testCase, pattern),
          methodExpected(built.program, stickyBuilt.program, testCase),
          "generated-m5-regexp-symbol-methods.ts",
        );
      }),
      {
        context: propertyContext(),
        domain:
          "one generated pattern of up to two alternatives over " +
          "characters, class escapes, single-member classes, dot, and " +
          "capturing or named groups with greedy, lazy, optional, and " +
          "bounded quantifiers; one flag sequence drawn from the empty, " +
          "global, ignore-case, unicode, and sticky combinations; one " +
          "subject of up to six characters including a line terminator; " +
          "the five symbol methods with a string and a functional " +
          "replacer, a limited and an unlimited split, and a complete " +
          "iterator drain; both specialization policies; forced " +
          "collection at every safepoint; one false string hint; and one " +
          "prototype shape-guard miss",
        numRuns: 8,
        profile: "M5 RegExp symbol methods",
        seed: 0x6000_5b00,
        sizeLimit:
          "at most two alternatives, three terms, depth one, quantifier " +
          "bounds at most two, six subject characters, and twenty-four " +
          "iterator steps",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);

/** EncodeForRegExpEscape, mirrored so the oracle owns the expected text. */
const syntaxCharacters = new Set("^$\\.*+?()[]{}|/");
const controlEscapes = new Map([
  [0x09, "t"],
  [0x0a, "n"],
  [0x0b, "v"],
  [0x0c, "f"],
  [0x0d, "r"],
]);
const otherPunctuators = new Set(",-=<>#&!%:;@~'`\"");

function isSpace(point: number): boolean {
  return (
    point === 0x09 ||
    point === 0x0a ||
    point === 0x0b ||
    point === 0x0c ||
    point === 0x0d ||
    point === 0x20 ||
    point === 0xa0 ||
    point === 0x1680 ||
    (point >= 0x2000 && point <= 0x200a) ||
    point === 0x2028 ||
    point === 0x2029 ||
    point === 0x202f ||
    point === 0x205f ||
    point === 0x3000 ||
    point === 0xfeff
  );
}

function escapeOracle(text: string): string {
  let escaped = "";
  let index = 0;
  while (index < text.length) {
    const point = text.codePointAt(index);
    assert.ok(point != null);
    const units = String.fromCodePoint(point);
    index += units.length;
    const alphanumeric =
      (point >= 0x30 && point <= 0x39) ||
      (point >= 0x41 && point <= 0x5a) ||
      (point >= 0x61 && point <= 0x7a);
    if (escaped.length === 0 && alphanumeric) {
      escaped += `\\x${point.toString(16).padStart(2, "0")}`;
      continue;
    }
    if (syntaxCharacters.has(units)) {
      escaped += `\\${units}`;
      continue;
    }
    const control = controlEscapes.get(point);
    if (control != null) {
      escaped += `\\${control}`;
      continue;
    }
    const surrogate = point >= 0xd800 && point <= 0xdfff;
    if (!otherPunctuators.has(units) && !isSpace(point) && !surrogate) {
      escaped += units;
      continue;
    }
    if (point <= 0xff) {
      escaped += `\\x${point.toString(16).padStart(2, "0")}`;
      continue;
    }
    for (let unit = 0; unit < units.length; unit += 1) {
      const code = units.charCodeAt(unit);
      escaped += `\\u${code.toString(16).padStart(4, "0")}`;
    }
  }
  return escaped;
}

/**
 * The generated code points, spelled numerically so the reviewed domain
 * stays readable: `a`, `7`, `_`, four SyntaxCharacter members, the
 * solidus, the reverse solidus, three other punctuators, tab, line feed,
 * space, no-break space, Ogham space mark, line separator, ideographic
 * space, both lone surrogate halves, one supplementary code point, and
 * one Latin-1 letter.
 */
const escapeCodePoints = [
  0x61, 0x37, 0x5f, 0x2e, 0x2a, 0x28, 0x7c, 0x2f, 0x5c, 0x2d, 0x22, 0x60, 0x09,
  0x0a, 0x20, 0xa0, 0x1680, 0x2028, 0x3000, 0xd800, 0xdfff, 0x1d306, 0xe9,
] as const;

const escapeCase = fc.array(fc.constantFrom(...escapeCodePoints), {
  maxLength: 5,
});

function codeUnits(text: string): readonly number[] {
  return Array.from({ length: text.length }, (_, index) =>
    text.charCodeAt(index),
  );
}

function escapeText(points: readonly number[]): string {
  return points.map((point) => String.fromCodePoint(point)).join("");
}

function escapeSource(points: readonly number[]): string {
  const codes = codeUnits(escapeText(points));
  return `
const subject = String.fromCharCode(${codes.join(", ")});
const escaped = RegExp.escape(subject);
let rendered = "";
for (let index = 0; index < escaped.length; index = index + 1) {
  if (index !== 0) rendered = rendered + ".";
  rendered = rendered + escaped.charCodeAt(index);
}
console.log("escaped", rendered);
console.log("inert", new RegExp(escaped).test(subject));
/** @param {string} value */
function hinted(value) { return RegExp.escape(value).length; }
console.log("hint", hinted(subject), hinted(new String(subject).valueOf()));
String.prototype.regexpEscapeMarker = 1;
console.log("guard", hinted(subject));
`;
}

function escapeExpected(points: readonly number[]): Observation {
  const text = escapeText(points);
  const escaped = escapeOracle(text);
  const rendered = codeUnits(escaped).join(".");
  // Every escaped form is a literal pattern for its own source text, so
  // the round trip reports what a direct search of that text reports.
  const inert = new RegExp(escaped).test(text);
  return {
    exitStatus: 0,
    stderr: "",
    stdout:
      `escaped ${rendered}\n` +
      `inert ${inert}\n` +
      `hint ${escaped.length} ${escaped.length}\n` +
      `guard ${escaped.length}\n`,
  };
}

test(
  "generated RegExp.escape agrees with EncodeForRegExpEscape",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "escaped text is inert and matches the oracle exactly",
      fc.asyncProperty(escapeCase, async (points) => {
        await assertNative(
          escapeSource(points),
          escapeExpected(points),
          "generated-m5-regexp-escape.ts",
        );
      }),
      {
        context: propertyContext(),
        domain:
          "zero to five code points drawn from ASCII letters and digits, " +
          "an underscore, SyntaxCharacter members, the solidus, the " +
          "reverse solidus, other punctuators, control escapes, ASCII and " +
          "non-ASCII whitespace, a line separator, both lone surrogate " +
          "halves, one supplementary code point, and one Latin-1 letter; " +
          "a round trip through the escaped pattern; both specialization " +
          "policies; forced collection; one false hint; and one " +
          "shape-guard miss",
        numRuns: 8,
        profile: "M5 RegExp escape",
        seed: 0x6000_5b01,
        sizeLimit:
          "at most five code points, one round trip, and one prototype " +
          "shape change",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

type OperandKind =
  | "callable"
  | "deleted"
  | "noncallable"
  | "nullish"
  | "regexp"
  | "string";

interface ProtocolCase {
  readonly method: "match" | "matchAll" | "search";
  readonly operand: OperandKind;
}

const protocolCase: fc.Arbitrary<ProtocolCase> = fc.record({
  method: fc.constantFrom<"match" | "matchAll" | "search">(
    "match",
    "matchAll",
    "search",
  ),
  operand: fc.constantFrom<OperandKind>(
    "callable",
    "deleted",
    "noncallable",
    "nullish",
    "regexp",
    "string",
  ),
});

function protocolSymbol(method: ProtocolCase["method"]): string {
  if (method === "match") return "Symbol.match";
  if (method === "matchAll") return "Symbol.matchAll";
  return "Symbol.search";
}

function protocolOperand(testCase: ProtocolCase): string {
  const symbol = protocolSymbol(testCase.method);
  if (testCase.operand === "callable") {
    return `{ [${symbol}](value) { return "called:" + value; } }`;
  }
  if (testCase.operand === "noncallable") return `{ [${symbol}]: 1 }`;
  if (testCase.operand === "nullish") {
    return `{ [${symbol}]: null, toString() { return "b"; } }`;
  }
  if (testCase.operand === "regexp") return 'new RegExp("b", "g")';
  return '"b"';
}

function protocolSource(testCase: ProtocolCase): string {
  const symbol = protocolSymbol(testCase.method);
  const deleted = testCase.operand === "deleted";
  const prelude = deleted ? `delete RegExp.prototype[${symbol}];\n` : "";
  const operand = deleted ? '"b"' : protocolOperand(testCase);
  return `${prelude}
function show(result) {
  if (result === null || result === undefined) return String(result);
  if (typeof result === "number" || typeof result === "string") {
    return String(result);
  }
  if (typeof result.next === "function") {
    const step = result.next();
    return step.done === true ? "done" : String(step.value[0]);
  }
  return String(result[0]);
}
try {
  console.log("result", show("abc".${testCase.method}(${operand})));
} catch (error) {
  console.log("threw", error instanceof TypeError);
}
/** @param {number} value */
function hinted(value) { return value + 1; }
console.log("hint", hinted(1), hinted("x"));
`;
}

function protocolExpected(testCase: ProtocolCase): Observation {
  const tail = "hint 2 x1\n";
  if (testCase.operand === "callable") {
    return { exitStatus: 0, stderr: "", stdout: `result called:abc\n${tail}` };
  }
  if (testCase.operand === "noncallable" || testCase.operand === "deleted") {
    return { exitStatus: 0, stderr: "", stdout: `threw true\n${tail}` };
  }
  // A nullish method, a plain String, and a RegExp all reach a real
  // execution: the first two through RegExpCreate and the third through
  // its own prototype method. `search` reports the position instead of
  // the matched text.
  const found = testCase.method === "search" ? "1" : "b";
  return { exitStatus: 0, stderr: "", stdout: `result ${found}\n${tail}` };
}

test(
  "generated String protocol routing reaches the RegExp symbol methods",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "String match, matchAll, and search route through GetMethod",
      fc.asyncProperty(protocolCase, async (testCase) => {
        await assertNative(
          protocolSource(testCase),
          protocolExpected(testCase),
          "generated-m5-regexp-string-routing.ts",
        );
      }),
      {
        context: propertyContext(),
        domain:
          "String match, matchAll, and search against a callable, " +
          "non-callable, nullish, deleted, RegExp, and plain String " +
          "operand; both specialization policies; forced collection; one " +
          "false number hint; and one shape-guard miss",
        numRuns: 6,
        profile: "M5 RegExp String protocol routing",
        seed: 0x6000_5b02,
        sizeLimit:
          "one of three method names, one of six operand shapes, and one " +
          "iterator step",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
