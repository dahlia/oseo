/* eslint-disable no-await-in-loop -- Native observations are isolated. */

/**
 * Ahead-of-time compiled regular expression literals.
 *
 * The generated domain stays a structured pattern model until the
 * predicate prints it, so a shrunk failure keeps its group graph,
 * quantifier bounds, assertion direction, and reference validity instead
 * of decaying into unparseable text. Each case prints one model twice, as
 * a literal the build compiles and as a `new RegExp` the runtime compiles,
 * so a disagreement between the two compilation paths is visible in the
 * observation itself rather than only against the oracle.
 *
 * The compiler-side matcher artifact is the semantic authority, so the
 * expected observation is derived from it. The reference hosts see the
 * same source, which makes a disagreement visible from three sides.
 */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  defaultComponents,
  runNativeCli,
} from "../../packages/cli/src/index.ts";
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

interface LiteralCase {
  readonly body: Disjunction;
  readonly flags: string;
  readonly texts: readonly string[];
}

/** One generated program that evaluates the same literal many times. */
interface FreshnessCase {
  readonly assigned: number;
  readonly rounds: number;
  readonly sticky: boolean;
}

const characters = ["a", "b", "c", "k", "x", "0", "_", " ", "-", "/"] as const;
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

function patternArbitrary(): fc.Arbitrary<Disjunction> {
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
    term: fc.oneof(
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
 * Resolve a raw model into one both compilation paths admit.
 *
 * Capture indices are assigned in source order, a reference is bound to a
 * capture that exists, and a duplicate group name is dropped. A quantifier
 * is removed from any atom that already repeats, which keeps generated
 * backtracking linear, so a reached execution boundary is a defect rather
 * than an ordinary case.
 *
 * An ignore-case backreference becomes an ordinary character. It is the
 * one construct the ahead-of-time path compiles and the runtime pattern
 * compiler still refuses, and this domain compares the two paths, so the
 * fixed native fixture owns that difference instead.
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
 * A literal writes its pattern between two solidus characters, so a
 * solidus inside it is escaped wherever it appears, including inside a
 * class where the pattern grammar itself would not require it.
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
const classSyntax = new Set(["-", "/", "[", "\\", "]", "^"]);

function printAtom(atom: Atom): string {
  if (atom.kind === "character") {
    return atomSyntax.has(atom.value) ? `\\${atom.value}` : atom.value;
  }
  if (atom.kind === "class-escape") return `\\${atom.name}`;
  if (atom.kind === "dot") return ".";
  if (atom.kind === "backreference") return `\\${atom.index}`;
  if (atom.kind === "class") {
    const members = atom.members
      .map((member) => (classSyntax.has(member) ? `\\${member}` : member))
      .join("");
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

/** The pattern text a literal writes, which is never empty. */
function literalSource(body: Disjunction): string {
  const printed = printDisjunction(body);
  return printed.length === 0 ? "(?:)" : printed;
}

/*
 * One unique flag sequence in any order.
 *
 * No unicode-mode flag appears. The edition advances a failed attempt by
 * one code point while V8 resumes between a surrogate pair's two code
 * units, so a generated assertion under `u` would make the reference
 * hosts an unsound oracle. This domain keeps the complete assertion and
 * lookaround vocabulary and leaves unicode-mode literals to the fixed
 * native fixture, which names its cases rather than generating them.
 */
const flagArbitrary = fc
  .subarray(["d", "g", "m", "s", "y"], { maxLength: 5 })
  .chain((ordinary) =>
    fc
      .tuple(fc.shuffledSubarray(ordinary), fc.constantFrom("", "", "i"))
      .map(([selected, extra]) => selected.join("") + extra),
  );

const literalCase: fc.Arbitrary<LiteralCase> = flagArbitrary.chain((flags) =>
  fc.record({
    body: patternArbitrary().map((body) => resolve(body, flags.includes("i"))),
    flags: fc.constant(flags),
    texts: fc.array(
      fc
        .array(fc.constantFrom(...characters, "A", "B", "K"), {
          maxLength: 6,
          minLength: 0,
        })
        .map((parts) => parts.join("")),
      { maxLength: 3, minLength: 1 },
    ),
  }),
);

const freshnessCase: fc.Arbitrary<FreshnessCase> = fc.record({
  assigned: fc.integer({ max: 5, min: 0 }),
  rounds: fc.integer({ max: 4, min: 2 }),
  sticky: fc.boolean(),
});

/**
 * One controlled mutation of a valid literal, and where it is reported.
 *
 * Every case here reaches the owned pattern parser, so the diagnostic is
 * the owned message at the offending text. A defect the bootstrap parser
 * rejects first, such as an unterminated class or a leading quantifier,
 * reports its own parse rejection instead and belongs to the frontend's
 * own suite rather than to this domain.
 */
const rejectedCase = fc.constantFrom(
  { message: "A group is unterminated.", text: "/(a/" },
  {
    message: "A quantifier's lower bound is above its upper bound.",
    text: "/a{2,1}/",
  },
  { message: "A quantifier has no atom to repeat.", text: "/a**/" },
  { message: "A character class range is out of order.", text: "/[z-a]/" },
  {
    message: "This named backreference names no capturing group.",
    text: "/\\k<missing>/u",
  },
  { message: "This Unicode property is not defined.", text: "/\\p{Nope}/u" },
  {
    message: "This backreference names no capturing group.",
    text: "/(a)\\2/u",
  },
  {
    message:
      "This group name repeats one that can participate in the same match.",
    text: "/(?<a>x)(?<a>y)/",
  },
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
    "oseo-regexp-literal-property-",
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
 * The artifact is the family's semantic authority, so the ahead-of-time
 * descriptor a build emits has to reproduce exactly this.
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

function literalProgram(testCase: LiteralCase): string {
  const source = literalSource(testCase.body);
  return [
    showFunction,
    `const literal = /${source}/${testCase.flags};`,
    `const dynamic = new RegExp(${JSON.stringify(source)}, ` +
      `${JSON.stringify(testCase.flags)});`,
    `const texts = ${JSON.stringify(testCase.texts)};`,
    "for (let index = 0; index < texts.length; index = index + 1) {",
    "  for (let round = 0; round < 2; round = round + 1) {",
    "    const one = show(literal.exec(texts[index]));",
    "    const two = show(dynamic.exec(texts[index]));",
    "    console.log(",
    '      "run",',
    "      one,",
    "      literal.lastIndex,",
    "      one === two,",
    "      literal.lastIndex === dynamic.lastIndex,",
    "    );",
    "  }",
    "}",
    "console.log(",
    '  "text",',
    "  literal.source === dynamic.source,",
    "  literal.flags === dynamic.flags,",
    "  String(literal) === String(dynamic),",
    ");",
    "/** @param {number} value */\nfunction hinted(value) {",
    "  return value + 1;",
    "}",
    'console.log("hint", hinted(1), hinted("x"));',
  ].join("\n");
}

function literalExpected(
  program: RegExpMatcherProgram,
  testCase: LiteralCase,
): Observation {
  const state = { lastIndex: 0 };
  const lines: string[] = [];
  for (const text of testCase.texts) {
    for (let round = 0; round < 2; round += 1) {
      const captures = oracleExec(program, text, state);
      lines.push(
        `run ${oracleShow(program, text, captures)} ${state.lastIndex} ` +
          "true true",
      );
    }
  }
  lines.push("text true true true");
  lines.push("hint 2 x1");
  return { exitStatus: 0, stderr: "", stdout: `${lines.join("\n")}\n` };
}

function freshnessProgram(testCase: FreshnessCase): string {
  const flags = testCase.sticky ? "y" : "g";
  return [
    `const rounds = ${testCase.rounds};`,
    "function make() {",
    `  return /(a)(b)?/${flags};`,
    "}",
    "const held = [];",
    "for (let round = 0; round < rounds; round = round + 1) {",
    "  const each = make();",
    '  each.exec("ab");',
    `  each.lastIndex = each.lastIndex + ${testCase.assigned};`,
    "  held.push(each);",
    "}",
    "let distinct = true;",
    'let indices = "";',
    "for (let outer = 0; outer < held.length; outer = outer + 1) {",
    '  indices = indices + held[outer].lastIndex + "/";',
    "  for (let inner = 0; inner < held.length; inner = inner + 1) {",
    "    if (outer !== inner && held[outer] === held[inner]) {",
    "      distinct = false;",
    "    }",
    "  }",
    "}",
    "const one = make();",
    "const two = make();",
    "console.log(",
    '  "fresh",',
    "  distinct,",
    "  indices,",
    "  one === two,",
    "  one.lastIndex,",
    "  two.lastIndex,",
    "  one.source === two.source,",
    ");",
    "/** @param {number} value */\nfunction hinted(value) {",
    "  return value + 1;",
    "}",
    'console.log("hint", hinted(1), hinted("x"));',
  ].join("\n");
}

function freshnessExpected(testCase: FreshnessCase): Observation {
  // Each evaluation matches "ab" from index zero, so a global or sticky
  // pattern writes 2 and the generated assignment moves it from there.
  let indices = "";
  for (let round = 0; round < testCase.rounds; round += 1) {
    indices += `${2 + testCase.assigned}/`;
  }
  return {
    exitStatus: 0,
    stderr: "",
    stdout: `fresh true ${indices} false 0 0 true\nhint 2 x1\n`,
  };
}

async function assertNative(
  source: string,
  expected: Observation,
  sourceId: string,
): Promise<void> {
  assertMatchingObservations([expected, ...(await references(source))]);
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      defaultComponents.frontend,
      { source, sourceId },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const mir = printMir(compiled.mir);
    assert.match(mir, /regexp-literal/u);
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
          assert.match(native.emittedC, /oseo_regexp_literal\(context, &/u);
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
  "generated literals match the artifact, the constructor, and the hosts",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "an ahead-of-time literal executes exactly as its artifact does",
      fc.asyncProperty(literalCase, async (testCase) => {
        const source = literalSource(testCase.body);
        const parsed = parseRegExpPattern({ flags: testCase.flags, source });
        assert.equal(parsed.parsed, true, `/${source}/${testCase.flags}`);
        assert.ok(parsed.pattern != null);
        const built = buildRegExpMatcher(parsed.pattern, {
          unicodeData: unicodeMatcherData,
        });
        assert.deepEqual(built.errors, []);
        assert.ok(built.program != null);
        await assertNative(
          literalProgram(testCase),
          literalExpected(built.program, testCase),
          "generated-m5-regexp-literal.ts",
        );
      }),
      {
        context: propertyContext(),
        domain:
          "one generated pattern of alternatives, sequences, greedy and " +
          "lazy quantifiers, character classes, class escapes, capturing " +
          "and named groups, resolved backreferences, edge and word " +
          "assertions, and forward and backward lookaround, written both " +
          "as a literal the build compiles and as a constructor argument " +
          "the runtime compiles, with a reference replaced by a character " +
          "under `i` because only the literal path admits that closure " +
          "and with no unicode-mode flag because the reference hosts " +
          "retry a failed attempt one code unit later, which the fixed " +
          "native fixture owns instead; " +
          "one unique flag sequence; up to three inputs of ASCII, cased, " +
          "and empty text; two successive executions each; both " +
          "specialization policies; forced collection; one false number " +
          "hint; and one shape-guard miss",
        numRuns: 8,
        profile: "M5 RegExp ahead-of-time literals",
        seed: 0x6000_5500,
        sizeLimit:
          "at most three alternatives, four terms, depth two, quantifier " +
          "bounds at most three, six input characters, and three inputs",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);

test(
  "every evaluation of one literal owns its object and lastIndex",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "repeated evaluation never reuses an object or its lastIndex",
      fc.asyncProperty(freshnessCase, async (testCase) => {
        await assertNative(
          freshnessProgram(testCase),
          freshnessExpected(testCase),
          "generated-m5-regexp-literal-freshness.ts",
        );
      }),
      {
        context: propertyContext(),
        domain:
          "one literal evaluated a generated number of times inside a " +
          "loop and twice more outside it, a generated `lastIndex` " +
          "assignment on each result, a global or sticky flag, pairwise " +
          "identity over every retained object, both specialization " +
          "policies, forced collection, one false number hint, and one " +
          "shape-guard miss",
        numRuns: 6,
        profile: "M5 RegExp literal freshness",
        seed: 0x6000_5501,
        sizeLimit:
          "at most four evaluations in the loop and a `lastIndex` " +
          "increment of at most five",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

test(
  "generated invalid literals stay early errors",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "a rejected literal fails the build with one located diagnostic",
      fc.asyncProperty(rejectedCase, async (testCase) => {
        const source = `const value = ${testCase.text};\n`;
        const native = await runNativeCli(
          {
            args: ["generated-m5-regexp-literal-invalid.ts"],
            source,
            sourceId: "generated-m5-regexp-literal-invalid.ts",
            version: "0.1.0",
          },
          host,
        );
        assert.equal(native.exitStatus, 1);
        assert.equal(native.stdout, "");
        assert.match(
          native.stderr,
          /^generated-m5-regexp-literal-invalid\.ts:1:\d+: /u,
        );
        assert.match(native.stderr, /error\[OSEO0001\]: /u);
        assert.ok(
          native.stderr.includes(testCase.message),
          `${testCase.text}: ${native.stderr}`,
        );
      }),
      {
        context: propertyContext(),
        domain:
          "one literal carrying a single controlled defect the owned " +
          "pattern parser owns: an unterminated group, an inverted " +
          "quantifier bound, a quantifier with no atom, an inverted class " +
          "range, an undeclared group name, an undefined Unicode " +
          "property, a backreference that names no group, or a duplicate " +
          "group name two alternatives cannot separate",
        numRuns: 8,
        profile: "M5 RegExp literal early errors",
        seed: 0x6000_5502,
        sizeLimit: "one literal of at most sixteen units and two flags",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
