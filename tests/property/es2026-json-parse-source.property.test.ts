/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
  printMir,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/*
 * A generated JSON value. Each primitive carries the exact literal text
 * the generator wrote, so the model knows its source without parsing.
 * An object member list may repeat a name.
 */
type JsonNode =
  | { readonly kind: "array"; readonly items: readonly JsonNode[] }
  | {
      readonly kind: "object";
      readonly members: readonly (readonly [string, JsonNode])[];
    }
  | { readonly kind: "primitive"; readonly literal: string };

type Mutation = "different" | "none" | "same";

interface SourceCase {
  readonly root: JsonNode;
  /** Whitespace around every token, by position modulo its length. */
  readonly spaces: readonly string[];
  readonly mutation: Mutation;
  readonly marker: number;
}

const numberLiteral: fc.Arbitrary<string> = fc
  .record({
    exponent: fc.option(
      fc.record({
        digits: fc.integer({ max: 20, min: 0 }),
        letter: fc.constantFrom("e", "E"),
        sign: fc.constantFrom("", "+", "-"),
      }),
      { nil: undefined },
    ),
    fraction: fc.option(fc.constantFrom("0", "5", "25", "000", "125"), {
      nil: undefined,
    }),
    integer: fc.constantFrom("0", "1", "12", "900", "9007199254740993"),
    negative: fc.boolean(),
  })
  .map(
    ({ exponent, fraction, integer, negative }) =>
      (negative ? "-" : "") +
      integer +
      (fraction === undefined ? "" : `.${fraction}`) +
      (exponent === undefined
        ? ""
        : exponent.letter + exponent.sign + String(exponent.digits)),
  );

const stringPiece = fc.constantFrom(
  "a",
  "Z",
  " ",
  "\\n",
  '\\"',
  "\\\\",
  "\\/",
  "\\u00e9",
  "\\ud83d\\ude00",
  "é",
  "😀",
);

const stringLiteral: fc.Arbitrary<string> = fc
  .array(stringPiece, { maxLength: 4 })
  .map((pieces) => `"${pieces.join("")}"`);

const primitive: fc.Arbitrary<JsonNode> = fc
  .oneof(numberLiteral, stringLiteral, fc.constantFrom("true", "false", "null"))
  .map((literal) => ({ kind: "primitive" as const, literal }));

const memberName = fc.constantFrom("a", "b", "0", "1", "__proto__", "x y");

const node: fc.Arbitrary<JsonNode> = fc.letrec<{ value: JsonNode }>((tie) => ({
  value: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    primitive,
    fc
      .array(tie("value"), { maxLength: 3 })
      .map((items) => ({ items, kind: "array" as const })),
    fc
      .array(fc.tuple(memberName, tie("value")), { maxLength: 3 })
      .map((members) => ({ kind: "object" as const, members })),
  ),
})).value;

const caseArbitrary: fc.Arbitrary<SourceCase> = fc.record({
  marker: fc.integer({ max: 1_000, min: 1 }),
  mutation: fc.constantFrom<Mutation>("none", "same", "different"),
  root: node,
  spaces: fc.array(fc.constantFrom("", " ", "\n", "\t", "\r", "  "), {
    maxLength: 4,
    minLength: 1,
  }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function serialize(root: JsonNode, spaces: readonly string[]): string {
  let position = 0;
  const space = (): string => {
    const text = spaces[position % spaces.length]!;
    position += 1;
    return text;
  };
  const write = (value: JsonNode): string => {
    if (value.kind === "primitive") return space() + value.literal + space();
    if (value.kind === "array") {
      const items = value.items.map(write).join(",");
      return `${space()}[${items.length > 0 ? items : space()}]${space()}`;
    }
    const members = value.members
      .map(([name, member]) => `${space()}"${name}"${space()}:${write(member)}`)
      .join(",");
    return `${space()}{${members.length > 0 ? members : space()}}${space()}`;
  };
  return write(root);
}

function literals(root: JsonNode): string[] {
  if (root.kind === "primitive") return [root.literal];
  if (root.kind === "array") return root.items.flatMap(literals);
  return root.members.flatMap(([, member]) => literals(member));
}

function printCase(testCase: SourceCase): string {
  const text = serialize(testCase.root, testCase.spaces);
  const raws = literals(testCase.root);
  return `
const text = ${JSON.stringify(text)};
const mutation = "${testCase.mutation}";
const log = [];
let mutated = false;
const revived = JSON.parse(text, function (key, value, context) {
  log.push(key + "=" + JSON.stringify(value) + "@" +
    Reflect.ownKeys(context).join(",") + ":" + JSON.stringify(context.source));
  if (!mutated && mutation !== "none" && key !== "") {
    mutated = true;
    const keys = Object.keys(this);
    const index = keys.indexOf(key);
    const sibling = keys[index + 1];
    if (sibling !== undefined) {
      const current = this[sibling];
      const primitive = current === null || typeof current !== "object";
      this[sibling] = mutation === "same" && primitive ? current : 999;
    }
  }
  return value;
});
console.log(log.join("\\n"));
console.log("result", JSON.stringify(revived));
const raws = ${JSON.stringify(raws)};
console.log(
  "raw",
  JSON.stringify(raws.map((raw) => JSON.rawJSON(raw))),
  raws.every((raw) => JSON.isRawJSON(JSON.rawJSON(raw))),
);
let turn = 0;
while (turn < 2) {
  console.log("guard", JSON.parse.length + ${testCase.marker});
  if (turn === 0) JSON.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log(
  "hint",
  hinted(${testCase.marker}, 1),
  hinted("${testCase.marker}", 1),
);
`;
}

/** A primitive as the model holds it: the denoted value and its text. */
type ModelPrimitive = boolean | number | string | null;

/*
 * A model value. A primitive keeps the literal it was parsed from, or no
 * literal once a reviver wrote it. A container's slots are in own-key
 * order; `original` stays true while the slot holds the parsed value,
 * which is when InternalizeJSONProperty still applies its record.
 */
type ModelValue =
  | { readonly kind: "primitive"; readonly value: ModelPrimitive }
  | { readonly kind: "array" | "object"; readonly slots: ModelSlot[] };

interface ModelSlot {
  readonly key: string;
  value: ModelValue;
  literal: string | undefined;
}

function literalValue(literal: string): ModelPrimitive {
  if (literal === "true") return true;
  if (literal === "false") return false;
  if (literal === "null") return null;
  if (literal.startsWith('"')) return String(JSON.parse(literal));
  return Number(literal);
}

function isArrayIndex(key: string): boolean {
  return /^(?:0|[1-9][0-9]*)$/u.test(key) && Number(key) < 2 ** 32 - 1;
}

/** OrdinaryOwnPropertyKeys order for the generated member names. */
function ownKeyOrder(slots: ModelSlot[]): ModelSlot[] {
  const indices = slots
    .filter((slot) => isArrayIndex(slot.key))
    .toSorted((left, right) => Number(left.key) - Number(right.key));
  return [...indices, ...slots.filter((slot) => !isArrayIndex(slot.key))];
}

function slotFor(key: string, value: JsonNode): ModelSlot {
  return value.kind === "primitive"
    ? {
        key,
        literal: value.literal,
        value: { kind: "primitive", value: literalValue(value.literal) },
      }
    : { key, literal: undefined, value: build(value) };
}

/* Builds the parsed value; a repeated member name keeps its first
 * position and takes the last value, as CreateDataProperty does. */
function build(value: JsonNode): ModelValue {
  if (value.kind === "primitive") {
    return { kind: "primitive", value: literalValue(value.literal) };
  }
  if (value.kind === "array") {
    return {
      kind: "array",
      slots: value.items.map((item, index) => slotFor(String(index), item)),
    };
  }
  const slots: ModelSlot[] = [];
  for (const [name, member] of value.members) {
    const replacement = slotFor(name, member);
    const existing = slots.findIndex((slot) => slot.key === name);
    if (existing === -1) slots.push(replacement);
    else slots[existing] = replacement;
  }
  return { kind: "object", slots: ownKeyOrder(slots) };
}

function stringify(value: ModelValue): string {
  if (value.kind === "primitive") return JSON.stringify(value.value);
  if (value.kind === "array") {
    return `[${value.slots.map((slot) => stringify(slot.value)).join(",")}]`;
  }
  return `{${value.slots
    .map((slot) => `${JSON.stringify(slot.key)}:${stringify(slot.value)}`)
    .join(",")}}`;
}

/**
 * The independent model of InternalizeJSONProperty: a post-order walk in
 * own-key order whose primitive contexts carry their literal text while
 * the slot still holds the parsed value. The first reviver call below the
 * root replaces its next sibling as the generated program does.
 */
function expected(testCase: SourceCase): string {
  const lines: string[] = [];
  let mutated = false;
  const visit = (holder: ModelSlot[], slot: ModelSlot): void => {
    if (slot.value.kind !== "primitive") {
      for (const child of slot.value.slots) visit(slot.value.slots, child);
    }
    const source = slot.literal;
    lines.push(
      `${slot.key}=${stringify(slot.value)}@` +
        (source === undefined
          ? ":undefined"
          : `source:${JSON.stringify(source)}`),
    );
    if (!mutated && testCase.mutation !== "none" && slot.key !== "") {
      mutated = true;
      const sibling = holder[holder.indexOf(slot) + 1];
      if (sibling !== undefined) {
        const same =
          testCase.mutation === "same" && sibling.value.kind === "primitive";
        if (!same) {
          sibling.value = { kind: "primitive", value: 999 };
          sibling.literal = undefined;
        }
      }
    }
  };
  const root = slotFor("", testCase.root);
  visit([root], root);
  const raws = literals(testCase.root);
  return [
    ...lines,
    `result ${stringify(root.value)}`,
    `raw [${raws.join(",")}] true`,
    `guard ${testCase.marker + 2}`,
    `guard ${testCase.marker + 2}`,
    `hint ${testCase.marker + 1} ${testCase.marker}1`,
    "",
  ].join("\n");
}

async function reference(
  command: string,
  args: readonly string[],
  source: string,
): Promise<{
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-json-parse-source-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    // Deno runs a file as a module, so both hosts evaluate the source as
    // a global Script through indirect eval.
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
    );
    const observation = await host.run({
      args: [...args, sourcePath],
      command,
      cwd: directory,
    });
    succeeded = true;
    return observation;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test(
  "generated JSON texts give the reviver its source and round-trip raw",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "JSON.parse reports source text and JSON.rawJSON keeps its text",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          await reference(process.execPath, [], source),
          await reference("deno", ["run", "--quiet"], source),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-es2026-json-parse-source.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-smi/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /generic-fallback/u);
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
                toolchain: nativeToolchain,
              },
              (native) => {
                assertMatchingObservations([expectedObservation, native]);
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
          "nested JSON texts of numbers, strings with escapes, literal " +
          "names, arrays, and objects with repeated member names, with " +
          "generated whitespace and an optional sibling replacement by " +
          "the same or a different value, plus one constructor shape " +
          "guard miss and one false number hint",
        numRuns: 12,
        profile: "ES2026 JSON.parse source text and JSON.rawJSON",
        seed: 0x6000_a600,
        sizeLimit:
          "fast-check's small depth size, at most three items or members " +
          "per container, four string pieces, and four whitespace choices",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
