import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, win32 } from "node:path";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import type { Context } from "node:vm";
import { fileURLToPath } from "node:url";
import { parse, parseExpression } from "@babel/parser";

import { runCli } from "../packages/cli/src/index.ts";
import type { StructuredDataValue } from "../tools/structured-data.ts";
import {
  assembleTest262Source,
  executeTest262Case,
  parseTest262Case,
} from "../tools/test262.ts";
import { agentSyntaxNode } from "../tools/test262-source.ts";
import type {
  AgentSyntaxNode,
  ParsedTest262Case,
} from "../tools/test262-source.ts";

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
 * read still resolves through the context's global environment, and its
 * call passes the Script's own `this`, the global object, as the copy's
 * top-level `this`.
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
      'return "no failure"; } };\n}).call(this)',
    context,
  ) as HarnessApi;
}

function harnessContext(setup = ""): Context {
  const context = createContext({});
  runInContext(
    "globalThis.Test262Error = class Test262Error extends Error {};",
    context,
  );
  runInContext(setup, context);
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

test("%eval% does not depend on the globalThis binding", () => {
  // Each setup gives globalThis a value that globalThis.eval would misread
  // or throw on, while upstream's bare eval still reads the global object.
  const setups = [
    'globalThis.globalThis = { eval: "replaced" };\n',
    "delete globalThis.globalThis;\n",
    "Object.defineProperty(globalThis, 'globalThis', {\n" +
      "  configurable: true,\n" +
      "  get() { throw new Error('unavailable'); },\n" +
      "});\n",
    'let globalThis = "lexical";\n',
  ];
  for (const setup of setups) {
    for (const strict of [false, true]) {
      const context = harnessContext(setup);
      const reviewed = assertSameHarness(context, strict);
      const expected = contextValue(context, "eval");
      assert.notEqual(expected, undefined, setup);
      assert.equal(recordValues(reviewed).get("%eval%"), expected, setup);
    }
  }
});

test("an absent eval invokes no replaceable global", () => {
  // Upstream's absent eval raises the realm's own ReferenceError, which
  // the outer catch discards. A lookup that constructed one through the
  // global ReferenceError binding would run this replacement, which
  // changes a record read after %eval%.
  const setup =
    "var realm = this;\n" +
    "var constructions = 0;\n" +
    "delete realm.eval;\n" +
    "realm.ReferenceError = function () {\n" +
    "  constructions += 1;\n" +
    "  realm.Math = 0;\n" +
    "};\n";
  for (const strict of [false, true]) {
    const context = harnessContext(setup);
    const math = contextValue(context, "Math");
    const reviewed = assertSameHarness(context, strict);
    const values = recordValues(reviewed);
    assert.equal(values.get("%eval%"), undefined);
    assert.equal(values.get("%Math%"), math);
    assert.equal(contextValue(context, "constructions"), 0);
    assert.equal(
      reviewed.failure("%eval%"),
      "this implementation could not obtain %eval%",
    );
  }
});

/**
 * Evaluate `text`, then `suffix`, as one Script in a fresh context, and
 * return which records hold undefined and whether %eval% holds the
 * context's own eval. Unlike {@link loadHarness}, the suffix's top-level
 * lexical declarations are in their temporal dead zone while the include
 * runs.
 */
function sameScriptOutcome(
  text: string,
  suffix: string,
  strict: boolean,
): { readonly missing: readonly string[]; readonly evalValue: boolean } {
  const context = harnessContext();
  runInContext(`${strict ? '"use strict";\n' : ""}${text}\n${suffix}`, context);
  // SAFETY: the Script above declared the table as a global lexical
  // binding, and JSON text carries the outcome out of the context's realm.
  return JSON.parse(
    runInContext(
      "JSON.stringify({ missing: WellKnownIntrinsicObjects\n" +
        "  .filter(function (record) {\n" +
        "    return record.value === undefined;\n" +
        "  })\n" +
        "  .map(function (record) { return record.name; }),\n" +
        "  evalValue: WellKnownIntrinsicObjects.find(function (record) {\n" +
        '    return record.name === "%eval%";\n' +
        "  }).value === Reflect.get(this, 'eval') })",
      context,
    ) as string,
  ) as { readonly missing: readonly string[]; readonly evalValue: boolean };
}

test("a same-Script globalThis in its dead zone matches upstream", () => {
  for (const strict of [false, true]) {
    const suffix = 'let globalThis = "late";';
    const reviewed = sameScriptOutcome(reviewedText, suffix, strict);
    const upstream = sameScriptOutcome(upstreamText, suffix, strict);
    assert.deepEqual(reviewed, upstream);
    assert.equal(reviewed.evalValue, true);
  }
});

test("a global lexical eval is the one bounded divergence", () => {
  // Only a bare eval identifier read can see a global lexical eval, and
  // only non-strict Script code can declare one. Upstream reads it in its
  // dead zone and records undefined; the reviewed copy reads the global
  // object property. The consumer scan below shows that no consumer of the
  // include at the pinned revision declares one.
  const suffix = "let eval = 1;";
  const reviewed = sameScriptOutcome(reviewedText, suffix, false);
  const upstream = sameScriptOutcome(upstreamText, suffix, false);
  assert.equal(reviewed.evalValue, true);
  assert.equal(upstream.evalValue, false);
  assert.deepEqual(
    upstream.missing.filter((name) => name !== "%eval%"),
    reviewed.missing,
  );
  assert.ok(upstream.missing.includes("%eval%"));
});

/** Every name a binding pattern declares. */
function boundNames(pattern: StructuredDataValue | undefined): string[] {
  const node = agentSyntaxNode(pattern);
  if (node == null) return [];
  switch (node.type) {
    case "Identifier":
      return [String(node.name)];
    case "AssignmentPattern":
      return boundNames(node.left);
    case "RestElement":
      return boundNames(node.argument);
    case "ArrayPattern":
      return Array.isArray(node.elements)
        ? node.elements.flatMap((element) => boundNames(element))
        : [];
    case "ObjectPattern":
      return Array.isArray(node.properties)
        ? node.properties.flatMap((property) => {
            const item = agentSyntaxNode(property);
            return item?.type === "RestElement"
              ? boundNames(item.argument)
              : boundNames(item?.value);
          })
        : [];
    default:
      return [];
  }
}

/** The top-level lexical names one Script source declares. */
function lexicalNames(source: string): string[] {
  const program = agentSyntaxNode(
    parse(source, { sourceType: "script" }).program,
  );
  const body = Array.isArray(program?.body) ? program.body : [];
  return body.flatMap((statement) => {
    const node = agentSyntaxNode(statement);
    if (node?.type === "ClassDeclaration") {
      return boundNames(node.id);
    }
    if (node?.type !== "VariableDeclaration" || node.kind === "var") {
      return [];
    }
    return Array.isArray(node.declarations)
      ? node.declarations.flatMap((declarator) =>
          boundNames(agentSyntaxNode(declarator)?.id),
        )
      : [];
  });
}

/** A filesystem-relative path in the corpus's forward-slash notation. */
function corpusPath(path: string): string {
  return path.replaceAll("\\", "/");
}

/** Every file below `directory`, as canonical corpus paths relative to it. */
async function filesBelow(directory: URL): Promise<string[]> {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      corpusPath(
        relative(fileURLToPath(directory), join(entry.parentPath, entry.name)),
      ),
    );
}

/** One upstream test whose decoded frontmatter names the include. */
interface IncludeConsumer {
  readonly path: string;
  readonly source: string;
  readonly parsed: ParsedTest262Case;
}

/**
 * The tests among `candidates` whose decoded frontmatter includes the
 * reviewed copy. Each candidate's frontmatter is parsed as the runner
 * parses it before any selection, so a YAML escape in the include name
 * cannot hide a consumer, and metadata the parser rejects fails the scan
 * rather than dropping the candidate.
 */
function includeConsumers(
  candidates: readonly (readonly [string, string])[],
): IncludeConsumer[] {
  return candidates
    .map(([path, source]) => ({
      path,
      source,
      parsed: parseTest262Case(source, path, revision),
    }))
    .filter(({ parsed }) => parsed.case.includes.includes(include));
}

test("Windows file paths preserve all owned consumer identities", async () => {
  const root = new URL(import.meta.resolve("test262/package.json"));
  const directory = "C:\\test262\\test";
  const candidates: (readonly [string, string])[] = [];
  for (const path of ownedPaths) {
    const relativePath = path.slice("test/".length);
    const windowsPath = win32.relative(
      directory,
      win32.join(directory, relativePath),
    );
    assert.ok(windowsPath.includes("\\"));
    const canonical = `test/${corpusPath(windowsPath)}`;
    assert.equal(canonical, path);
    candidates.push([
      canonical,
      // eslint-disable-next-line no-await-in-loop -- One open file at a time.
      await readFile(new URL(canonical, root), "utf8"),
    ]);
  }
  assert.deepEqual(
    includeConsumers(candidates).map(({ path }) => path),
    ownedPaths,
  );
});

/**
 * Why one consumer would reach the bounded divergence: a Module's top-level
 * this is undefined, a raw case loads no include, and a top-level lexical
 * eval is visible only to upstream's identifier read.
 */
function divergenceReasons(consumer: IncludeConsumer): string[] {
  const reasons: string[] = [];
  if (consumer.parsed.case.mode !== "script") reasons.push("module");
  if (consumer.parsed.flags.includes("raw")) reasons.push("raw");
  if (lexicalNames(consumer.source).includes("eval")) {
    reasons.push("lexical eval");
  }
  return reasons;
}

test("the consumer scan decodes frontmatter before selecting", () => {
  // The include name is spelled with a YAML escape, so the source text
  // never contains it literally, yet the runner would load the include.
  const escaped = "wellKnownIntrinsic\\u004fbjects.js";
  const metadata = (flags: string): string =>
    `/*---\nincludes: ["${escaped}"]\nflags: [${flags}]\n---*/\n`;
  const candidates = [
    ["test/escaped-module.js", metadata("module")],
    ["test/escaped-lexical.js", `${metadata("")}let eval = 1;\n`],
    ["test/escaped-clean.js", metadata("")],
    ["test/unrelated.js", `/*---\nincludes: [compareArray.js]\n---*/\n`],
  ] as const;
  for (const [, source] of candidates) assert.ok(!source.includes(include));
  assert.deepEqual(
    includeConsumers(candidates).map(
      (consumer) => [consumer.path, divergenceReasons(consumer)] as const,
    ),
    [
      ["test/escaped-module.js", ["module"]],
      ["test/escaped-lexical.js", ["lexical eval"]],
      ["test/escaped-clean.js", []],
    ],
  );
  // Metadata the runner cannot parse is not silently skipped.
  assert.throws(() =>
    includeConsumers([["test/unknown.js", "/*---\nflags: raw\n---*/\n"]]),
  );
  assert.throws(() => includeConsumers([["test/none.js", "let eval;\n"]]));
});

test("no pinned consumer reaches the bounded divergence", async () => {
  const root = new URL(import.meta.resolve("test262/package.json"));
  const tests = new URL("test/", root);
  // The corpus has tens of thousands of files, more than a host's open file
  // limit may allow at once, so each one is read before the next is opened.
  const candidates: (readonly [string, string])[] = [];
  for (const path of await filesBelow(tests)) {
    if (!path.endsWith(".js") || path.includes("_FIXTURE")) continue;
    candidates.push([
      `test/${path}`,
      // eslint-disable-next-line no-await-in-loop -- One open file at a time.
      await readFile(new URL(path, tests), "utf8"),
    ]);
  }
  const consumers = includeConsumers(candidates);
  const includeNames = new Set<string>();
  for (const consumer of consumers) {
    assert.deepEqual(divergenceReasons(consumer), [], consumer.path);
    for (const name of consumer.parsed.case.includes) includeNames.add(name);
  }
  const paths = new Set<string>(consumers.map(({ path }) => path));
  for (const path of ownedPaths) assert.ok(paths.has(path), path);
  // Both the upstream includes the consumers name and every reviewed
  // harness copy the runner can assemble ahead of them.
  const reviewedHarness = new URL("test262/harness/", import.meta.url);
  const harnessSources = await Promise.all([
    ...Array.from(
      includeNames,
      async (name) =>
        [
          name,
          await readFile(new URL(`harness/${name}`, root), "utf8"),
        ] as const,
    ),
    ...(await filesBelow(reviewedHarness)).map(
      async (name) =>
        [name, await readFile(new URL(name, reviewedHarness), "utf8")] as const,
    ),
  ]);
  for (const [name, text] of harnessSources) {
    assert.ok(!lexicalNames(text).includes("eval"), name);
  }
  // The scan itself recognizes a declaration it must reject.
  assert.deepEqual(lexicalNames("let [{ a: eval }] = [{}];"), ["eval"]);
  assert.deepEqual(lexicalNames("const { ...eval } = {};"), ["eval"]);
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
    if (record.source === "eval") {
      // Only %eval% is respelled: the profile rejects a bare eval
      // identifier, so the lookup performs the global object record's
      // HasProperty and Get on the Script's top-level this and returns
      // undefined when the property is absent.
      assert.equal(syntaxSignature(statements), evalLookupSignature);
      continue;
    }
    assert.equal(statements.length, 1, record.name);
    const returned = agentSyntaxNode(statements[0]);
    assert.equal(returned?.type, "ReturnStatement", record.name);
    assert.equal(
      syntaxSignature(returned?.argument),
      syntaxSignature(agentSyntaxNode(parseExpression(record.source))),
      record.name,
    );
  }
  // The lookups run inside one function the Script calls with its own
  // top-level this, which is the global object in either strictness.
  // %ThrowTypeError%'s source is the one other immediately called function,
  // and it takes no argument.
  const calls = nodes.filter(
    (node) =>
      node.type === "CallExpression" &&
      agentSyntaxNode(node.callee)?.type === "FunctionExpression" &&
      Array.isArray(node.arguments) &&
      node.arguments.length > 0,
  );
  assert.equal(calls.length, 1);
  const outer = calls[0];
  assert.equal(syntaxSignature(outer?.arguments), '[{type:"ThisExpression"}]');
  assert.equal(
    syntaxSignature(agentSyntaxNode(outer?.callee)?.params),
    syntaxSignature(
      agentSyntaxNode(parseExpression("function (global) {}"))?.params,
    ),
  );
});

/** The two statements of the reviewed %eval% lookup. */
const evalLookupSignature = syntaxSignature(
  agentSyntaxNode(
    parse('if (!("eval" in global)) return;\nreturn global.eval;', {
      allowReturnOutsideFunction: true,
      sourceType: "script",
    }).program,
  )?.body,
);

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
