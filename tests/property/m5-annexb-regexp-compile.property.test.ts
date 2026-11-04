/* eslint-disable no-await-in-loop -- Native observations are isolated. */

/**
 * Generated evidence for Annex B's RegExp.prototype.compile.
 *
 * One case is a receiver and a sequence of operations on it: `compile`
 * with a string pattern and flags, with another RegExp and no flags or
 * some, with no arguments, a `lastIndex` write, making `lastIndex`
 * non-writable, and an execution. The patterns mix valid core and Annex B
 * text with patterns and flags that are early errors, so a sequence
 * reaches every completion `compile` has: reinitialization, a TypeError
 * before conversion, a SyntaxError that leaves the receiver unchanged,
 * and a TypeError from the `lastIndex` reset after it has changed.
 *
 * After each operation the program prints the receiver's source, flags,
 * and `lastIndex` and an execution of a fresh RegExp built from that
 * source and flags, then executes the receiver itself on the same input,
 * so a stale compiled artifact shows up as a difference between the two.
 * That execution reads and may advance or reset `lastIndex`, or throw on a
 * locked one, as the next operation then observes. Node.js and Deno are
 * the oracle, and the native program runs under both specialization
 * policies with collection forced at every safepoint.
 */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import { defaultComponents } from "../../packages/cli/src/index.ts";
import {
  compileSource,
  describeTarget,
  printMir,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import { nativeToolchain } from "../native-toolchain.ts";
import { hostScriptReferences } from "../native/host-script-reference.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

// Valid core and Annex B patterns, then text that is an early error under
// some or all flag sets.
const patterns = [
  "a",
  "a+",
  "(a)|b",
  "(?<n>a)\\k<n>",
  "[a-c]+",
  "^b$",
  "",
  "\\c\\x",
  "\\k<n>",
  "[\\d-a]",
  "(?=a)*a",
  "\\1(a)",
  "a{,2}",
  "(",
  "{1}",
  "\\a",
] as const;
const flagTexts = ["", "g", "i", "y", "gimsy", "u", "d", "gg", "z"] as const;

type Operation =
  | {
      readonly flags: (typeof flagTexts)[number] | undefined;
      readonly kind: "string";
      readonly pattern: (typeof patterns)[number];
    }
  | {
      readonly flags: string | undefined;
      readonly kind: "regexp";
      readonly source: number;
    }
  | { readonly kind: "empty" }
  | { readonly kind: "lastIndex"; readonly value: number }
  | { readonly kind: "lock" }
  | { readonly input: string; readonly kind: "exec" };

interface CompileCase {
  readonly operations: readonly Operation[];
  readonly receiver: "literal" | "constructed" | "subclass";
}

const operationArbitrary: fc.Arbitrary<Operation> = fc.oneof(
  {
    arbitrary: fc.record({
      flags: fc.option(fc.constantFrom(...flagTexts), { nil: undefined }),
      kind: fc.constant("string" as const),
      pattern: fc.constantFrom(...patterns),
    }),
    weight: 6,
  },
  {
    arbitrary: fc.record({
      flags: fc.option(fc.constantFrom("", "g"), { nil: undefined }),
      kind: fc.constant("regexp" as const),
      source: fc.nat({ max: 3 }),
    }),
    weight: 3,
  },
  { arbitrary: fc.constant({ kind: "empty" as const }), weight: 1 },
  {
    arbitrary: fc.record({
      kind: fc.constant("lastIndex" as const),
      value: fc.integer({ max: 4, min: -1 }),
    }),
    weight: 1,
  },
  { arbitrary: fc.constant({ kind: "lock" as const }), weight: 1 },
  {
    arbitrary: fc.record({
      input: fc.constantFrom("aab", "bab", "k<n>a", "\\cx", "-1a"),
      kind: fc.constant("exec" as const),
    }),
    weight: 2,
  },
);

const caseArbitrary: fc.Arbitrary<CompileCase> = fc.record({
  operations: fc.array(operationArbitrary, { maxLength: 10, minLength: 1 }),
  receiver: fc.constantFrom("literal", "constructed", "subclass"),
});

function argument(value: string | undefined): string {
  return value == null ? "undefined" : JSON.stringify(value);
}

const lockDescriptor = "{ writable: false }";

function operationSource(operation: Operation): string {
  switch (operation.kind) {
    case "string":
      return (
        `receiver.compile(${JSON.stringify(operation.pattern)}, ` +
        `${argument(operation.flags)})`
      );
    case "regexp":
      return operation.flags === undefined
        ? `receiver.compile(sources[${operation.source}])`
        : `receiver.compile(sources[${operation.source}], ` +
            `${argument(operation.flags)})`;
    case "empty":
      return "receiver.compile()";
    case "lastIndex":
      return `receiver.lastIndex = ${operation.value}`;
    case "lock":
      return `Object.defineProperty(receiver, "lastIndex", ${lockDescriptor})`;
    case "exec":
      return `show(receiver, ${JSON.stringify(operation.input)})`;
  }
}

function programSource(testCase: CompileCase): string {
  const receiver =
    testCase.receiver === "literal"
      ? "/r/g"
      : testCase.receiver === "constructed"
        ? 'new RegExp("r", "y")'
        : 'new (class extends RegExp {})("r")';
  const lines = [
    '"use strict";',
    "function show(pattern, input) {",
    "  var match = pattern.exec(input);",
    '  return match === null ? "null" : ' +
      'JSON.stringify(Array.from(match)) + "@" + match.index;',
    "}",
    "function fresh(pattern) {",
    "  return new RegExp(pattern.source, pattern.flags);",
    "}",
    `var receiver = ${receiver};`,
    'var sources = [/a/g, /(?<n>b)/, new RegExp("\\\\k", "y"), /x|/i];',
  ];
  for (const [index, operation] of testCase.operations.entries()) {
    lines.push(
      "try {",
      `  var result = ${operationSource(operation)};`,
      `  console.log(${index}, "ok", result === receiver ? "this" : ` +
        "typeof result);",
      "} catch (error) {",
      `  console.log(${index}, error.constructor.name);`,
      "}",
      `console.log(${index}, JSON.stringify(receiver.source), ` +
        "receiver.flags, receiver.lastIndex, " +
        'show(fresh(receiver), "aab-k<n>ba"));',
      "try {",
      `  console.log(${index}, "receiver", ` +
        'show(receiver, "aab-k<n>ba"), receiver.lastIndex);',
      "} catch (error) {",
      `  console.log(${index}, "receiver", error.constructor.name);`,
      "}",
    );
  }
  return lines.join("\n");
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

test(
  "generated compile sequences reinitialize RegExp objects in place",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "compile sequences match the reference hosts natively",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = programSource(testCase);
        const references = await hostScriptReferences(host, source);
        assertMatchingObservations(references);
        const reference = references[0]!;
        assert.equal(reference.exitStatus, 0, reference.stderr);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            defaultComponents.frontend,
            { source, sourceId: "generated-m5-annexb-regexp-compile.js" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          if (specialization === "disabled") {
            assert.doesNotMatch(printMir(compiled.mir), /guard-shape/u);
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
                toolchain: nativeToolchain,
              },
              (native) => {
                assertMatchingObservations([reference, native]);
                assert.ok(native.counters != null);
                assert.ok(native.counters.collections > 0);
              },
            );
          } finally {
            delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          }
        }
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
          "one literal, constructed, or subclass receiver and one to ten " +
          "compile, lastIndex write, lastIndex lock, and exec operations " +
          "over valid core and Annex B patterns, invalid patterns and " +
          "flags, and four RegExp sources",
        numRuns: 12,
        profile: "Annex B RegExp.prototype.compile",
        seed: 0x6000_a100,
        sizeLimit: "ten operations on one receiver",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
