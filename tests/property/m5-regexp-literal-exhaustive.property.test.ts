/* eslint-disable no-await-in-loop -- Native observations are isolated. */

/**
 * Exhaustive BMP domains of four test262 regular expression literal tests.
 *
 * Each original loops over every BMP code unit, skips eleven syntax
 * characters and the four line terminators, and evaluates one literal per
 * remaining code unit through `eval`. Nothing here samples that domain or
 * substitutes the RegExp constructor for a literal: every selected code unit
 * is compiled as a literal at build time in both strictness modes, and every
 * literal the build accepts executes natively, where its `source` is compared
 * with the original's expected spelling.
 *
 * The escaped originals also accept a SyntaxError when the code unit is not
 * `$`, ZWNJ or ZWJ and `var _X` parses. A pattern without `u` reaches Annex
 * B's identity escape there, which ADR 0013 excludes, so the build reports
 * those literals as unsupported with the Annex B message. That is the core
 * grammar's SyntaxError outcome, and the build-time domain checks it against
 * the repository's `ID_Continue` table and the core escapes independently of
 * the parser's own classifier. ZWNJ and ZWJ are the exception: Unicode 15.1
 * made them `ID_Continue`, so the core grammar rejects their escapes too,
 * while the originals exempt them from the fallback. Those two assertions
 * depend on Annex B, and the domain pins exactly that residue.
 *
 * The generated part is the native layout of one complete sweep: the
 * rotation that decides which code units share a program, the size of the
 * functions that keep each program inside the native frame budget, and
 * which specialization policy each program uses. Every run still executes
 * every accepted literal exactly once.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import { defaultComponents } from "../../packages/cli/src/index.ts";
import {
  compileSource,
  describeTarget,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import type { MirProgram } from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import {
  binaryPropertySet,
  codePointSetHas,
} from "../../packages/unicode/src/index.ts";
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

interface Observation {
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}

/** One original test262 loop and the literal spelling it evaluates. */
interface LiteralDomain {
  readonly accepted: number;
  readonly escaped: boolean;
  readonly path: string;
  readonly prefix: string;
}

/** One generated layout of a complete native sweep. */
interface SweepLayout {
  readonly groupSize: number;
  readonly offset: number;
  readonly phase: number;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

// The accepted counts pin the build's partition of the escaped domains:
// 65,521 selected code units less the 50,784 that only Annex B admits.
const firstPlain: LiteralDomain = {
  accepted: 65_521,
  escaped: false,
  path: "test/language/literals/regexp/S7.8.5_A1.1_T2.js",
  prefix: "",
};
const firstEscaped: LiteralDomain = {
  accepted: 14_737,
  escaped: true,
  path: "test/language/literals/regexp/S7.8.5_A1.4_T2.js",
  prefix: "\\",
};
const subsequentPlain: LiteralDomain = {
  accepted: 65_521,
  escaped: false,
  path: "test/language/literals/regexp/S7.8.5_A2.1_T2.js",
  prefix: "nnnn",
};
const subsequentEscaped: LiteralDomain = {
  accepted: 14_737,
  escaped: true,
  path: "test/language/literals/regexp/S7.8.5_A2.4_T2.js",
  prefix: "a\\",
};
const domains: readonly LiteralDomain[] = [
  firstPlain,
  firstEscaped,
  subsequentPlain,
  subsequentEscaped,
];

// Each program stays near 14 MB of emitted C; a larger one costs more to
// compile than two of this size.
const programSize = 4096;

// The originals' Elimination and LineTerminator conditions.
const eliminated: ReadonlySet<number> = new Set([
  0x002a, 0x002f, 0x005c, 0x002b, 0x003f, 0x0028, 0x0029, 0x005b, 0x005d,
  0x007b, 0x007d,
]);
const lineTerminators: ReadonlySet<number> = new Set([
  0x000a, 0x000d, 0x2028, 0x2029,
]);

// The escaped originals' identifierPartNotUnicodeIDContinue condition.
const identifierPartNotUnicodeIDContinue: ReadonlySet<number> = new Set([
  0x0024, 0x200c, 0x200d,
]);

// Identity escapes outside UnicodeIDContinue aside, a pattern without `u`
// accepts a backslash before these ID_Continue characters alone: the control
// escapes, the class escapes, the word-boundary assertions and `\0`.
const coreEscapeCharacters: ReadonlySet<number> = new Set(
  Array.from("fnrtvdDsSwWbB0", (character) => character.charCodeAt(0)),
);

const idContinue = binaryPropertySet("ID_Continue");

const selectedCodeUnits: readonly number[] = (() => {
  const units: number[] = [];
  for (let unit = 0; unit <= 0xffff; unit += 1) {
    if (!eliminated.has(unit) && !lineTerminators.has(unit)) units.push(unit);
  }
  return units;
})();

function literalText(domain: LiteralDomain, unit: number): string {
  return domain.prefix + String.fromCharCode(unit);
}

function strictnessPrefix(strict: boolean): string {
  return strict ? '"use strict";\n' : "";
}

function regexpLiterals(mir: MirProgram) {
  return [mir.script, ...mir.functions].flatMap((body) =>
    body.blocks.flatMap((block) =>
      block.operations.filter(
        (operation) => operation.kind === "regexp-literal",
      ),
    ),
  );
}

/**
 * How the build treats one original evaluation.
 *
 * `annex-b-only` is a rejection the original does not tolerate: the code
 * unit is one the original exempts from its UnicodeIDContinue fallback, so
 * only Annex B's identity escape satisfies that assertion.
 */
type LiteralOutcome = "accepted" | "annex-b-only" | "core-syntax-error";

/**
 * Compile one original evaluation as a build-time literal and classify it,
 * asserting every original assertion that the outcome reaches.
 */
function literalOutcome(
  domain: LiteralDomain,
  unit: number,
  strict: boolean,
): LiteralOutcome {
  const text = literalText(domain, unit);
  const label = `${domain.path} code unit ${unit.toString(16)}`;
  const result = compileSource(defaultComponents.frontend, {
    source: `${strictnessPrefix(strict)}/${text}/`,
    sourceId: "regexp-literal-exhaustive.js",
  });
  if (result.mir != null) {
    assert.deepEqual(result.diagnostics, [], label);
    const literals = regexpLiterals(result.mir);
    assert.equal(literals.length, 1, label);
    assert.equal(literals[0]?.regexpProgram?.source, text, label);
    assert.equal(literals[0]?.regexpProgram?.flags.text, "", label);
    return "accepted";
  }
  // The plain originals have no fallback branch.
  assert.ok(domain.escaped, `${label} was rejected`);
  assert.ok(result.diagnostics.length > 0, label);
  for (const diagnostic of result.diagnostics) {
    assert.equal(diagnostic.code, "OSEO1001", label);
    assert.match(diagnostic.message, /admitted only by Annex B/u, label);
  }
  if (identifierPartNotUnicodeIDContinue.has(unit)) return "annex-b-only";
  // The original's `eval("var _" + String.fromCharCode(cu))` check.
  const declaration = compileSource(defaultComponents.frontend, {
    source: `${strictnessPrefix(strict)}var _${String.fromCharCode(unit)}`,
    sourceId: "regexp-literal-exhaustive-identifier.js",
  });
  assert.deepEqual(declaration.diagnostics, [], `${label} var _X`);
  assert.ok(declaration.mir != null, `${label} var _X`);
  return "core-syntax-error";
}

/** One original's selected code units grouped by build outcome. */
interface DomainOutcomes {
  readonly accepted: readonly number[];
  readonly annexBOnly: readonly number[];
}

/** Classify every selected code unit in both strictness modes. */
function classifyDomain(domain: LiteralDomain): DomainOutcomes {
  const accepted: number[] = [];
  const annexBOnly: number[] = [];
  for (const unit of selectedCodeUnits) {
    const sloppy = literalOutcome(domain, unit, false);
    const strict = literalOutcome(domain, unit, true);
    assert.equal(strict, sloppy, `${domain.path} ${unit.toString(16)}`);
    if (sloppy === "accepted") accepted.push(unit);
    else if (sloppy === "annex-b-only") annexBOnly.push(unit);
  }
  return { accepted, annexBOnly };
}

const outcomesByPath = new Map<string, DomainOutcomes>();

function outcomesFor(domain: LiteralDomain): DomainOutcomes {
  let outcomes = outcomesByPath.get(domain.path);
  if (outcomes == null) {
    outcomes = classifyDomain(domain);
    outcomesByPath.set(domain.path, outcomes);
  }
  return outcomes;
}

function acceptedFor(domain: LiteralDomain): readonly number[] {
  return outcomesFor(domain).accepted;
}

/** Split one rotated sweep into native programs of at most programSize. */
function sweepPrograms(
  units: readonly number[],
  offset: number,
): readonly (readonly number[])[] {
  const rotated = [...units.slice(offset), ...units.slice(0, offset)];
  const programs: (readonly number[])[] = [];
  for (let start = 0; start < rotated.length; start += programSize) {
    programs.push(rotated.slice(start, start + programSize));
  }
  return programs;
}

/**
 * One program that evaluates each literal once and compares its `source`
 * with the spelling the original builds from the same code unit.
 */
function programSource(
  domain: LiteralDomain,
  units: readonly number[],
  groupSize: number,
): string {
  const lines = [
    `var prefix = ${JSON.stringify(domain.prefix)};`,
    "var checked = 0;",
    "function check(pattern, unit) {",
    "  var expected = prefix + String.fromCharCode(unit);",
    "  if (!Object.is(pattern.source, expected)) {",
    '    throw new Error("source mismatch at " + unit.toString(16));',
    "  }",
    "  checked += 1;",
    "}",
  ];
  const groups = Math.ceil(units.length / groupSize);
  for (let group = 0; group < groups; group += 1) {
    lines.push(`function group${group}() {`);
    for (const unit of units.slice(
      group * groupSize,
      (group + 1) * groupSize,
    )) {
      lines.push(`  check(/${literalText(domain, unit)}/, ${unit});`);
    }
    lines.push("}");
  }
  for (let group = 0; group < groups; group += 1) {
    lines.push(`group${group}();`);
  }
  lines.push('console.log(checked + " literals preserve their source");');
  return lines.join("\n");
}

function expectedObservation(count: number): Observation {
  return {
    exitStatus: 0,
    stderr: "",
    stdout: `${count} literals preserve their source\n`,
  };
}

/** Run a program on the reference host from memory, as source text. */
function referenceObservation(source: string): Observation {
  const output: string[] = [];
  runInNewContext(source, {
    console: { log: (value: string) => output.push(`${value}\n`) },
  });
  return { exitStatus: 0, stderr: "", stdout: output.join("") };
}

async function assertNativeProgram(
  domain: LiteralDomain,
  units: readonly number[],
  layout: SweepLayout,
  specialization: "disabled" | "enabled",
): Promise<void> {
  const source = programSource(domain, units, layout.groupSize);
  const expected = expectedObservation(units.length);
  assertMatchingObservations([expected, referenceObservation(source)]);
  const compiled = compileSource(
    defaultComponents.frontend,
    { source, sourceId: "generated-m5-regexp-literal-exhaustive.js" },
    { specialization },
  );
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  const literals = regexpLiterals(compiled.mir);
  assert.equal(literals.length, units.length);
  // Function bodies need not follow source order in MIR.
  assert.deepEqual(
    literals.map((literal) => literal.regexpProgram?.source).toSorted(),
    units.map((unit) => literalText(domain, unit)).toSorted(),
  );
  await withNativeFixture(
    {
      backend: cBackend,
      host,
      input: compiled.mir,
      operation: "execute",
      runtime: cRuntimeProvider,
      target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
      toolchain: nativeToolchain,
    },
    (native) => {
      assertMatchingObservations([expected, native]);
      assert.equal(
        native.emittedC.split("oseo_regexp_literal(context, &").length - 1,
        units.length,
      );
    },
  );
}

function propertyContext(domain: LiteralDomain): readonly string[] {
  const target =
    nativeTarget == null || host.executionHost == null
      ? ["target=unsupported host=unknown"]
      : [
          `target=${nativeTarget.name}`,
          `host=${host.executionHost.operatingSystem}/` +
            host.executionHost.architecture,
          `sanitizers=${nativeTarget.sanitizers.join(",")}`,
        ];
  return [`path=${domain.path}`, ...target];
}

test("the originals' loops select 65,521 BMP code units", () => {
  assert.equal(selectedCodeUnits.length, 0x10000 - 11 - 4);
  assert.equal(eliminated.size, 11);
  assert.ok(idContinue != null);
});

for (const domain of domains) {
  test(`every selected literal of ${domain.path} keeps its outcome`, () => {
    const { accepted, annexBOnly } = outcomesFor(domain);
    assert.equal(accepted.length, domain.accepted);
    // Unicode 15.1 moved ZWNJ and ZWJ into ID_Continue, so the core grammar
    // rejects their identity escapes while the originals still exempt them
    // from the fallback. Only Annex B meets those two assertions.
    assert.deepEqual(annexBOnly, domain.escaped ? [0x200c, 0x200d] : []);
    assert.ok(accepted.includes(0x0024));
    const acceptedSet = new Set(accepted);
    for (const unit of selectedCodeUnits) {
      // Independent of the parser's classifier: the core grammar rejects
      // exactly the ID_Continue characters that are not core escapes.
      const coreSyntaxError =
        domain.escaped &&
        idContinue != null &&
        codePointSetHas(idContinue, unit) &&
        !coreEscapeCharacters.has(unit);
      assert.equal(
        acceptedSet.has(unit),
        !coreSyntaxError,
        `${domain.path} code unit ${unit.toString(16)}`,
      );
    }
  });
}

// The program oracle must reject a wrong spelling and a wrong code unit
// before it prints its success line.
for (const [name, mutate] of [
  [
    "a wrong prefix",
    (source: string) =>
      source.replace(/^var prefix = .*;$/mu, 'var prefix = "x";'),
  ],
  [
    "a wrong code unit",
    (source: string) =>
      source.replace(/, (\d+)\);/u, (_, unit) => `, ${Number(unit) + 1});`),
  ],
] as const) {
  test(`the program oracle rejects ${name}`, () => {
    for (const domain of domains) {
      const units = acceptedFor(domain).slice(0, 512);
      const source = programSource(domain, units, 128);
      assert.deepEqual(
        referenceObservation(source),
        expectedObservation(units.length),
      );
      const mutated = mutate(source);
      assert.notEqual(mutated, source);
      assert.throws(() => referenceObservation(mutated), /source mismatch/u);
    }
  });
}

/** One complete native sweep with a generated layout. */
function sweepProperty(domain: LiteralDomain) {
  const accepted = acceptedFor(domain);
  const programCount = Math.ceil(accepted.length / programSize);
  const layout = fc.record({
    groupSize: fc.constantFrom(64, 128, 256),
    offset: fc.nat({ max: accepted.length - 1 }),
    phase: fc.nat({ max: 1 }),
  });
  return fc.asyncProperty(layout, async (testCase: SweepLayout) => {
    const programs = sweepPrograms(accepted, testCase.offset);
    assert.equal(programs.length, programCount);
    assert.deepEqual(
      programs.flat().toSorted((left, right) => left - right),
      accepted,
    );
    await forEachProgram(programs, (units, index) =>
      assertNativeProgram(
        domain,
        units,
        testCase,
        (index + testCase.phase) % 2 === 0 ? "disabled" : "enabled",
      ),
    );
  });
}

// Zig 0.16 runs fewer concurrent clang processes than the host has cores:
// one on three CPUs, the size of a hosted macOS runner, so one build of a
// program's 14 compilation units is serial there. Overlapping three
// programs' builds keeps those cores busy; each program is still built,
// executed and checked on its own.
const programConcurrency = 3;

/**
 * Check every program, at most `programConcurrency` at once, and report the
 * failure of the earliest program in sweep order.
 *
 * Programs start in sweep order, so every program before a failing one has
 * started by the time it fails. After the first failure no new program
 * starts, and the sweep waits for those in flight before rethrowing, so a
 * failed sweep leaves no build running.
 */
async function forEachProgram(
  programs: readonly (readonly number[])[],
  check: (units: readonly number[], index: number) => Promise<void>,
): Promise<void> {
  const failures: { readonly error: unknown; readonly index: number }[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < programs.length && failures.length === 0) {
      const index = next;
      next += 1;
      try {
        await check(programs[index]!, index);
      } catch (error) {
        failures.push({ error, index });
      }
    }
  }
  await Promise.all(Array.from({ length: programConcurrency }, () => worker()));
  if (failures.length > 0) {
    throw failures.toSorted((left, right) => left.index - right.index)[0]!
      .error;
  }
}

function sizeLimit(domain: LiteralDomain): string {
  const programs = Math.ceil(domain.accepted / programSize);
  return `${programs} programs of at most 4,096 literals`;
}

// One run is one complete sweep, so the ordinary budget already executes
// every accepted literal once. Forced collection stays with the AOT literal
// property: no literal here outlives its comparison.
const sweepOptions = {
  numRuns: 1,
  profile: "M5 RegExp exhaustive literal domains",
  timeLimitMilliseconds: 600_000,
};

test(
  `every accepted literal of ${firstPlain.path} keeps its source natively`,
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "every accepted first-position plain literal keeps its source",
      sweepProperty(firstPlain),
      {
        ...sweepOptions,
        context: propertyContext(firstPlain),
        domain:
          "all 65,521 /X/ literals S7.8.5_A1.1_T2 selects, each evaluated " +
          "once natively with its source compared in the program; one " +
          "generated rotation, function size of 64, 128 or 256, and " +
          "specialization phase alternating by program",
        seed: 0x6000_9500,
        sizeLimit: sizeLimit(firstPlain),
      },
    );
  },
);

test(
  `every accepted literal of ${firstEscaped.path} keeps its source natively`,
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "every accepted first-position escaped literal keeps its source",
      sweepProperty(firstEscaped),
      {
        ...sweepOptions,
        context: propertyContext(firstEscaped),
        domain:
          "all 14,737 /\\X/ literals S7.8.5_A1.4_T2 selects and the build " +
          "accepts, each evaluated once natively with its source compared " +
          "in the program; one generated rotation, function size of 64, " +
          "128 or 256, and specialization phase alternating by program",
        seed: 0x6000_9501,
        sizeLimit: sizeLimit(firstEscaped),
      },
    );
  },
);

test(
  `every accepted literal of ${subsequentPlain.path} keeps its source natively`,
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "every accepted subsequent-position plain literal keeps its source",
      sweepProperty(subsequentPlain),
      {
        ...sweepOptions,
        context: propertyContext(subsequentPlain),
        domain:
          "all 65,521 /nnnnX/ literals S7.8.5_A2.1_T2 selects, each " +
          "evaluated once natively with its source compared in the " +
          "program; one generated rotation, function size of 64, 128 or " +
          "256, and specialization phase alternating by program",
        seed: 0x6000_9502,
        sizeLimit: sizeLimit(subsequentPlain),
      },
    );
  },
);

test(
  `every accepted literal of ${subsequentEscaped.path} keeps its source ` +
    "natively",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "every accepted subsequent-position escaped literal keeps its source",
      sweepProperty(subsequentEscaped),
      {
        ...sweepOptions,
        context: propertyContext(subsequentEscaped),
        domain:
          "all 14,737 /a\\X/ literals S7.8.5_A2.4_T2 selects and the " +
          "build accepts, each evaluated once natively with its source " +
          "compared in the program; one generated rotation, function size " +
          "of 64, 128 or 256, and specialization phase alternating by " +
          "program",
        seed: 0x6000_9503,
        sizeLimit: sizeLimit(subsequentEscaped),
      },
    );
  },
);
