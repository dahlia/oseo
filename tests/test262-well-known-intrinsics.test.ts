import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import type { Context } from "node:vm";
import { parse, parseExpression } from "@babel/parser";

import { runCli } from "../packages/cli/src/index.ts";
import type { StructuredDataValue } from "../tools/structured-data.ts";
import {
  assembleTest262Source,
  executeTest262Case,
  parseTest262Case,
} from "../tools/test262.ts";
import { agentSyntaxNode } from "../tools/test262-source.ts";
import type { AgentSyntaxNode } from "../tools/test262-source.ts";

const revision = "f2d1435644797268dca1f7988cad5a4e89ccd8d2";
const include = "wellKnownIntrinsicObjects.js";

/** The six reviewed paths whose only recorded gap was this include. */
const ownedPaths = [
  "test/built-ins/AsyncFunction/is-a-constructor.js",
  "test/built-ins/AsyncGeneratorFunction/is-a-constructor.js",
  "test/built-ins/Function/prototype/arguments/prop-desc.js",
  "test/built-ins/Function/prototype/caller/prop-desc.js",
  "test/built-ins/Function/prototype/toString/built-in-function-object.js",
  "test/built-ins/GeneratorFunction/is-a-constructor.js",
];

interface IntrinsicRecord {
  readonly name: string;
  readonly source: string;
  readonly value?: StructuredDataValue;
}

interface HarnessApi {
  readonly records: readonly IntrinsicRecord[];
  readonly lookup: (key: string) => StructuredDataValue;
  /** The message getWellKnownIntrinsicObject throws for `key`. */
  readonly failure: (key: string) => string;
}

async function harnessText(name: string): Promise<string> {
  return await readFile(
    new URL(`test262/harness/${name}`, import.meta.url),
    "utf8",
  );
}

const reviewedText = await harnessText(include);
const upstreamText = await readFile(
  new URL(import.meta.resolve(`test262/harness/${include}`)),
  "utf8",
);

/**
 * Evaluate one harness copy as its own Script in `context` and return its
 * two definitions. The wrapper function keeps the two copies' top-level
 * `const` and function declarations apart while every name the copies
 * read still resolves through the context's global environment.
 */
function loadHarness(
  context: Context,
  text: string,
  strict: boolean,
): HarnessApi {
  // SAFETY: both harness copies define this array and function, and the
  // wrapper returns those two values and a probe that calls the function.
  return runInContext(
    `(function () {\n${strict ? '"use strict";\n' : ""}${text}\n` +
      "return { records: WellKnownIntrinsicObjects, " +
      "lookup: getWellKnownIntrinsicObject, " +
      "failure: function (key) { try { getWellKnownIntrinsicObject(key); } " +
      "catch (error) { return String(error.message); } " +
      'return "no failure"; } };\n})()',
    context,
  ) as HarnessApi;
}

function harnessContext(setup = ""): Context {
  const context = createContext({});
  runInContext(
    "globalThis.Test262Error = class Test262Error extends Error {};\n" + setup,
    context,
  );
  return context;
}

/** One value the context computes itself, to pin a record's identity. */
function contextValue(context: Context, source: string): StructuredDataValue {
  // SAFETY: the source evaluates to an intrinsic object of that context.
  return runInContext(source, context) as StructuredDataValue;
}

function assertSameHarness(context: Context, strict: boolean): HarnessApi {
  const upstream = loadHarness(context, upstreamText, false);
  const reviewed = loadHarness(context, reviewedText, strict);
  assert.deepEqual(
    Array.from(reviewed.records, ({ name, source }) => [name, source]),
    Array.from(upstream.records, ({ name, source }) => [name, source]),
  );
  for (const [index, record] of reviewed.records.entries()) {
    assert.deepEqual(Object.keys(record), ["name", "source", "value"]);
    assert.ok(
      Object.is(record.value, upstream.records[index]?.value),
      record.name,
    );
  }
  return reviewed;
}

function recordValues(
  api: HarnessApi,
): Map<string, StructuredDataValue | undefined> {
  return new Map(
    Array.from(api.records, ({ name, value }) => [name, value] as const),
  );
}

test("reviewed lookups observe the upstream values in one realm", () => {
  for (const strict of [false, true]) {
    const context = harnessContext();
    const reviewed = assertSameHarness(context, strict);
    const values = recordValues(reviewed);
    // These pins show that the comparison above did not merely agree on
    // undefined for the intrinsics the six owned cases read.
    const pins: readonly (readonly [string, string])[] = [
      ["%AsyncFunction%", "(async function () {}).constructor"],
      ["%AsyncGeneratorFunction%", "(async function* () {}).constructor"],
      ["%GeneratorFunction%", "(function* () {}).constructor"],
      [
        "%ThrowTypeError%",
        '(function () { "use strict"; return ' +
          'Object.getOwnPropertyDescriptor(arguments, "callee").get; })()',
      ],
      ["%eval%", "eval"],
      ["%Function%", "Function"],
    ];
    for (const [name, source] of pins) {
      const expected = contextValue(context, source);
      assert.notEqual(expected, undefined, name);
      assert.equal(values.get(name), expected, name);
      assert.equal(reviewed.lookup(name), expected, name);
    }
    assert.equal(values.get("%AsyncFromSyncIteratorPrototype%"), undefined);
    assert.equal(values.get("%ForInIteratorPrototype%"), undefined);
  }
});

test("missing, throwing, and shadowed globals match upstream", () => {
  const setup =
    "delete globalThis.Intl;\n" +
    "delete globalThis.WeakRef;\n" +
    "delete globalThis.eval;\n" +
    "delete globalThis.Iterator;\n" +
    "Object.defineProperty(globalThis, 'Atomics', {\n" +
    "  configurable: true,\n" +
    "  get() { throw new Error('unavailable'); },\n" +
    "});\n" +
    "let Map = 'lexical';\n";
  for (const strict of [false, true]) {
    const context = harnessContext(setup);
    const reviewed = assertSameHarness(context, strict);
    const upstream = loadHarness(context, upstreamText, false);
    const values = recordValues(reviewed);
    assert.equal(values.get("%Map%"), "lexical");
    for (const name of [
      "%Atomics%",
      "%eval%",
      "%Intl%",
      "%Intl.Collator%",
      "%IteratorHelperPrototype%",
      "%WeakRef%",
    ]) {
      assert.equal(values.get(name), undefined, name);
      assert.equal(
        reviewed.failure(name),
        `this implementation could not obtain ${name}`,
      );
      assert.equal(reviewed.failure(name), upstream.failure(name));
    }
    assert.equal(
      reviewed.failure("%Missing%"),
      "unknown well-known intrinsic %Missing%",
    );
    assert.equal(reviewed.failure("%Missing%"), upstream.failure("%Missing%"));
  }
});

/** Fields that record source positions, comments, or parentheses. */
const layoutFields: ReadonlySet<string> = new Set([
  "comments",
  "end",
  "errors",
  "extra",
  "leadingComments",
  "loc",
  "range",
  "start",
  "trailingComments",
]);

/** A canonical text of a syntax tree without its layout fields. */
function syntaxSignature(value: StructuredDataValue | undefined): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => syntaxSignature(item)).join(",")}]`;
  }
  const node = agentSyntaxNode(value);
  if (node == null) return JSON.stringify(value ?? null);
  const fields = Object.entries(node)
    .filter(([key]) => !layoutFields.has(key))
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([key, field]) => `${key}:${syntaxSignature(field)}`);
  return `{${fields.join(",")}}`;
}

/** Every syntax node below `root`, in no particular order. */
function syntaxNodes(root: AgentSyntaxNode): AgentSyntaxNode[] {
  const nodes: AgentSyntaxNode[] = [];
  const pending: (StructuredDataValue | undefined)[] = [root];
  while (pending.length > 0) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    const node = agentSyntaxNode(value);
    if (node == null) continue;
    nodes.push(node);
    for (const [key, field] of Object.entries(node)) {
      if (!layoutFields.has(key)) pending.push(field);
    }
  }
  return nodes;
}

test("each lookup returns its entry's source expression statically", () => {
  const program = agentSyntaxNode(
    parse(reviewedText, { sourceType: "script" }).program,
  );
  assert.ok(program != null);
  const nodes = syntaxNodes(program);
  for (const node of nodes) {
    if (node.type !== "CallExpression" && node.type !== "NewExpression") {
      continue;
    }
    const callee = agentSyntaxNode(node.callee);
    assert.ok(
      callee?.type !== "Identifier" ||
        (callee.name !== "eval" && callee.name !== "Function"),
      "the reviewed harness compiles no source text",
    );
  }
  const declarator = nodes.find(
    (node) =>
      node.type === "VariableDeclarator" &&
      agentSyntaxNode(node.id)?.name === "lookups",
  );
  const lookups = agentSyntaxNode(declarator?.init);
  assert.equal(lookups?.type, "ObjectExpression");
  const properties = Array.isArray(lookups?.properties)
    ? lookups.properties.map((property) => agentSyntaxNode(property))
    : [];
  const upstreamRecords = loadHarness(
    harnessContext(),
    upstreamText,
    false,
  ).records;
  assert.deepEqual(
    properties.map((property) => agentSyntaxNode(property?.key)?.value),
    Array.from(upstreamRecords, ({ name }) => name),
  );
  for (const [index, property] of properties.entries()) {
    const record = upstreamRecords[index];
    assert.ok(record != null);
    const lookup = agentSyntaxNode(property?.value);
    assert.equal(lookup?.type, "FunctionExpression", record.name);
    const statements = agentSyntaxNode(lookup?.body)?.body;
    assert.ok(Array.isArray(statements), record.name);
    if (record.source === "") {
      assert.equal(statements.length, 0, record.name);
      continue;
    }
    assert.equal(statements.length, 1, record.name);
    const returned = agentSyntaxNode(statements[0]);
    assert.equal(returned?.type, "ReturnStatement", record.name);
    // Only %eval% is respelled: the profile rejects a bare eval
    // identifier, and the global object property is what upstream reads.
    const expected =
      record.source === "eval" ? "globalThis.eval" : record.source;
    assert.equal(
      syntaxSignature(returned?.argument),
      syntaxSignature(agentSyntaxNode(parseExpression(expected))),
      record.name,
    );
  }
});

test("owned cases compile with the reviewed include", async () => {
  const harnesses = {
    base: await harnessText("base.js"),
    done: await harnessText("doneprintHandle.js"),
    includes: new Map(
      await Promise.all(
        [
          "isConstructor.js",
          "nativeFunctionMatcher.js",
          "propertyHelper.js",
          include,
        ].map(async (name) => [name, await harnessText(name)] as const),
      ),
    ),
  };
  const sources = await Promise.all(
    ownedPaths.map(
      async (path) =>
        [
          path,
          await readFile(
            new URL(import.meta.resolve(`test262/${path}`)),
            "utf8",
          ),
        ] as const,
    ),
  );
  for (const [path, source] of sources) {
    const parsed = parseTest262Case(source, path, revision);
    assert.ok(parsed.case.includes.includes(include), path);
    for (const mode of parsed.case.strictness) {
      const result = runCli({
        args: ["--dump-mir", path],
        source: assembleTest262Source(
          source,
          mode,
          parsed.case,
          harnesses,
          false,
        ),
        sourceId: path,
        version: "0.1.0",
      });
      assert.equal(result.stderr, "", `${path} ${mode}`);
      assert.equal(result.exitStatus, 0, `${path} ${mode}`);
    }
  }
});

test("an admitted include reaches execution", async () => {
  const source = `/*---\nincludes: [${include}]\n---*/\n`;
  const parsed = parseTest262Case(source, "test/harness-admitted.js", revision);
  let executions = 0;
  const result = await executeTest262Case(
    source,
    parsed,
    new Set(),
    {
      base: "function assert() {}",
      done: "function $DONE() {}",
      includes: new Map([[include, reviewedText]]),
    },
    {
      async execute() {
        executions += 1;
        return { exitStatus: 0, stderr: "", stdout: "" };
      },
    },
    ["functions"],
  );
  assert.ok(executions > 0);
  assert.equal(result.classification, "pass");
});
