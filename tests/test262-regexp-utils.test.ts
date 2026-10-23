import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { parse } from "@babel/parser";

import {
  codePointSetRanges,
  ecma262UnicodePropertySet,
  unicodeVersion,
} from "../packages/unicode/src/index.ts";
import { parseHarnessDefinitions } from "../tools/test262-source.ts";

const include = "regExpUtils.js";
const reviewed = await readFile(
  new URL(`test262/harness/${include}`, import.meta.url),
  "utf8",
);
const upstream = await readFile(
  new URL(import.meta.resolve(`test262/harness/${include}`)),
  "utf8",
);
const base = await readFile(
  new URL("test262/harness/base.js", import.meta.url),
  "utf8",
);

/** Run an unchanged helper copy in its own Script global environment. */
function evaluate(text: string, source: string, strict = false): string {
  const context = createContext({});
  runInContext(`${strict ? '"use strict";\n' : ""}${base}\n${text}`, context);
  // SAFETY: each caller serializes its observations as a JSON string.
  return runInContext(
    `${strict ? '"use strict";\n' : ""}${source}`,
    context,
  ) as string;
}

function equivalent(source: string): string {
  const expected = evaluate(upstream, source);
  for (const strict of [false, true]) {
    assert.equal(evaluate(reviewed, source, strict), expected);
  }
  return expected;
}

test("the added helper syntax retains the pinned upstream operations", () => {
  for (const name of ["buildString", "printCodePoint", "testPropertyEscapes"]) {
    const declaration = (text: string) =>
      parse(text).program.body.find(
        (node) => node.type === "FunctionDeclaration" && node.id?.name === name,
      );
    // Locations and raw spelling are not operations. Compare Babel's normalized
    // syntax, including every call, assignment, loop and assertion argument.
    const syntax = (text: string) =>
      JSON.stringify(declaration(text), (key, v) =>
        [
          "start",
          "end",
          "loc",
          "extra",
          "leadingComments",
          "trailingComments",
        ].includes(key)
          ? undefined
          : v,
      );
    assert.ok(declaration(reviewed), name);
    assert.equal(syntax(reviewed), syntax(upstream), name);
  }
  assert.ok(parseHarnessDefinitions(upstream, include).includes("buildString"));
  assert.ok(
    parseHarnessDefinitions(upstream, include).includes("testPropertyEscapes"),
  );
});

test("buildString keeps order, duplicates, bounds and UTF-16", () => {
  const result = equivalent(`JSON.stringify((function () {
    const args = {
      loneCodePoints: [0x61, 0x10000, 0xd800, 0x61],
      ranges: [[0x63, 0x64], [0x62, 0x62], [4, 3], [0x10ffff, 0x10ffff]]
    };
    const before = JSON.stringify(args);
    const string = buildString(args);
    return [Array.from(string, s => s.codePointAt(0)),
      Array.from({ length: string.length }, (_, i) => string.charCodeAt(i)),
      JSON.stringify(args) === before];
  })())`);
  assert.deepEqual(JSON.parse(result), [
    [0x61, 0x10000, 0xd800, 0x61, 0x63, 0x64, 0x62, 0x10ffff],
    [0x61, 0xd800, 0xdc00, 0xd800, 0x61, 0x63, 0x64, 0x62, 0xdbff, 0xdfff],
    true,
  ]);
  assert.equal(
    equivalent(`JSON.stringify(buildString({
      loneCodePoints: [], ranges: []
    }))`),
    '""',
  );
});

test("buildString flushes full chunks and preserves the tail", () => {
  for (const length of [9999, 10000, 10001, 20001]) {
    const source = `JSON.stringify((function () {
      const string = buildString({loneCodePoints: [0x10ffff],
        ranges: [[0x10000, ${0x10000 + length - 1}], [65, 65]]});
      return Array.from(string, s => s.codePointAt(0));
    })())`;
    const actual: readonly number[] = JSON.parse(equivalent(source));
    // Independent scalar sequence oracle, not a second chunk implementation.
    assert.deepEqual(actual, [
      0x10ffff,
      ...Array.from({ length }, (_, i) => 0x10000 + i),
      65,
    ]);
  }
});

test("buildString retains argument access and abrupt effects", () => {
  const source = `JSON.stringify((function () {
    const events = [];
    const original = String.fromCodePoint;
    const args = {
      get loneCodePoints() { events.push('lone'); return [65]; },
      get ranges() { events.push('ranges'); return [[66, 67]]; }
    };
    String.fromCodePoint = function () {
      "use strict";
      events.push([this === null, Array.from(arguments)]);
      return original.apply(null, arguments);
    };
    const value = buildString(args);
    String.fromCodePoint = original;
    return [value, events];
  })())`;
  assert.deepEqual(JSON.parse(equivalent(source)), [
    "ABC",
    ["lone", "ranges", [true, [65]], [true, [66, 67]]],
  ]);
  for (const args of [
    "{}",
    "{loneCodePoints: [-1], ranges: []}",
    "{loneCodePoints: [], ranges: [[0x110000, 0x110000]]}",
    "{get loneCodePoints() { throw 'sentinel'; }}",
  ]) {
    equivalent(`JSON.stringify((function () {
      try { buildString(${args}); return 'no error'; }
      catch (e) { return typeof e === 'string' ? e : e.name; }
    })())`);
  }
});

test("testPropertyEscapes retains calls and assertion effects", () => {
  const result = equivalent(`JSON.stringify((function () {
    const calls = [];
    const receiver = { test(string) {
      calls.push([this === receiver, string]);
      return calls.length !== 1;
    }};
    const value = testPropertyEscapes(receiver, 'A\\ud800\\udc00\\udfff', 'p');
    return [value === undefined, calls];
  })())`);
  assert.deepEqual(JSON.parse(result), [
    true,
    [
      [true, "A\ud800\udc00\udfff"],
      [true, "A"],
      [true, "\ud800\udc00"],
      [true, "\udfff"],
    ],
  ]);
  for (const pattern of [
    "/^\\p{ASCII}+$/u",
    "/^\\P{ASCII}+$/u",
    "/A/g",
    "/A/y",
  ]) {
    equivalent(`JSON.stringify((function () {
      const re = ${pattern}; re.lastIndex = 1;
      try { testPropertyEscapes(re, 'Aé', 'expression'); }
      catch (e) { return [e.name, e.message, re.lastIndex]; }
      return ['ok', re.lastIndex];
    })())`);
  }
  const failure = JSON.parse(
    equivalent(`JSON.stringify((function () {
    const re = /^A+$/u;
    try { testPropertyEscapes(re, 'A\\u{1f4a9}', 'expr'); }
    catch (e) {
      return [e.constructor === Test262Error, e.message, re.lastIndex];
    }
  })())`),
  );
  assert.deepEqual(failure, [true, "`expr` should match U+01F4A9 (`💩`)", 0]);
  assert.equal(
    equivalent(`JSON.stringify((function () {
    testPropertyEscapes({test() { return false; }}, '', 'empty');
    return 'empty returns without assertion';
  })())`),
    '"empty returns without assertion"',
  );
});

test("helper descriptors and thrown test errors remain observable", () => {
  const result = equivalent(`JSON.stringify((function () {
    const events = [];
    const descriptor = Object.getOwnPropertyDescriptor(this, 'buildString');
    const receiver = { get test() {
      events.push('get');
      return function () { events.push(this === receiver); throw 'sentinel'; };
    }};
    try { testPropertyEscapes(receiver, 'abc', 'x'); }
    catch (e) { events.push(e); }
    return [buildString.name, buildString.length, testPropertyEscapes.name,
      testPropertyEscapes.length,
      [descriptor.writable, descriptor.enumerable, descriptor.configurable],
      events];
  }).call(this))`);
  assert.deepEqual(JSON.parse(result), [
    "buildString",
    1,
    "testPropertyEscapes",
    3,
    [true, true, true],
    ["get", true, "sentinel"],
  ]);
});

/** Inclusive intervals, normalized independently of the runtime resolver. */
type Range = readonly [number, number];

function normalized(ranges: readonly Range[]): readonly Range[] {
  const result: [number, number][] = [];
  for (const [start, end] of ranges.toSorted((a, b) => a[0] - b[0])) {
    const previous = result.at(-1);
    if (previous != null && start <= previous[1] + 1) {
      previous[1] = Math.max(previous[1], end);
    } else result.push([start, end]);
  }
  return result;
}

/** Read numeric data as syntax without executing upstream assertions. */
function literalRanges(source: string, variable: string): readonly Range[] {
  const statements = parse(source).program.body;
  const declaration = statements
    .flatMap((node) =>
      node.type === "VariableDeclaration" ? node.declarations : [],
    )
    .find((node) => node.id.type === "Identifier" && node.id.name === variable);
  const init = declaration?.init;
  assert.ok(init?.type === "CallExpression");
  assert.ok(
    init.callee.type === "Identifier" && init.callee.name === "buildString",
  );
  const argument = init.arguments[0];
  assert.ok(argument?.type === "ObjectExpression");
  const ranges: Range[] = [];
  for (const property of argument.properties) {
    assert.ok(property.type === "ObjectProperty");
    assert.ok(property.key.type === "Identifier");
    assert.ok(property.value.type === "ArrayExpression");
    for (const value of property.value.elements) {
      if (property.key.name === "loneCodePoints") {
        assert.ok(value?.type === "NumericLiteral");
        ranges.push([value.value, value.value]);
      } else {
        assert.equal(property.key.name, "ranges");
        assert.ok(value?.type === "ArrayExpression");
        const [start, end] = value.elements;
        assert.ok(start?.type === "NumericLiteral");
        assert.ok(end?.type === "NumericLiteral");
        ranges.push([start.value, end.value]);
      }
    }
  }
  return normalized(ranges);
}

test("pinned property data agrees exactly with owned Unicode 17", async () => {
  assert.equal(unicodeVersion, "17.0.0");
  const directory = "test262/test/built-ins/RegExp/property-escapes/";
  const root = new URL(import.meta.resolve(directory + "generated/ASCII.js"));
  const names = (await readdir(new URL(".", root))).filter((n) =>
    n.endsWith(".js"),
  );
  assert.equal(names.length, 441);
  const sources = await Promise.all(
    names.map(async (name) => ({
      name,
      source: await readFile(new URL(name, root), "utf8"),
    })),
  );
  for (const { name, source } of sources) {
    assert.match(source, /Unicode v17\.0\.0/u);
    const expression = source.match(
      /Unicode property escapes for `([^`]+)`/u,
    )?.[1];
    assert.ok(expression, name);
    const [property, value] = expression.split("=");
    assert.ok(property);
    const set = ecma262UnicodePropertySet(property, value);
    assert.ok(set, expression);
    const expected = Array.from(
      codePointSetRanges(set),
      ({ start, end }) => [start, end] as const,
    );
    assert.deepEqual(literalRanges(source, "matchSymbols"), expected, name);
    if (source.includes("const nonMatchSymbols")) {
      let cursor = 0;
      const complement: Range[] = [];
      for (const [start, end] of expected) {
        if (start > cursor) complement.push([cursor, start - 1]);
        cursor = end + 1;
      }
      if (cursor <= 0x10ffff) complement.push([cursor, 0x10ffff]);
      assert.deepEqual(
        literalRanges(source, "nonMatchSymbols"),
        complement,
        name,
      );
    } else assert.equal(expression, "Any");
  }
});

test("bounded original subjects pass with either helper copy", async () => {
  const directory = "test262/test/built-ins/RegExp/";
  const paths = [
    "CharacterClassEscapes/character-class-word-class-escape-positive-cases.js",
    "property-escapes/generated/ASCII.js",
    "property-escapes/generated/General_Category_-_Surrogate.js",
  ];
  const sources = await Promise.all(
    paths.map(
      async (path) =>
        await readFile(new URL(import.meta.resolve(directory + path)), "utf8"),
    ),
  );
  for (const source of sources) {
    // Append only an observation marker, retaining the whole upstream subject.
    assert.equal(
      equivalent(`${source}\nJSON.stringify('passed');`),
      '"passed"',
    );
  }
});
