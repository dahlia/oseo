/* eslint-disable no-await-in-loop -- Native fixture builds are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { cBackend } from "../packages/backend-c/src/index.ts";
import { runNativeCli } from "../packages/cli/src/index.ts";
import {
  compileSource,
  describeTarget,
  printMir,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../packages/testkit/src/index.ts";
import { zigToolchain } from "../packages/toolchain-zig/src/index.ts";
import {
  isTestShardPosition,
  parseTestShardArguments,
  selectTestShard,
} from "../tools/shard.ts";

import type { Fixture } from "./native/fixture.ts";
import { arrayBufferFixtures } from "./native/fixtures/array-buffer.ts";
import { asyncFixtures } from "./native/fixtures/async.ts";
import { asyncGeneratorFixtures } from "./native/fixtures/async-generators.ts";
import { asyncIterationFixtures } from "./native/fixtures/async-iteration.ts";
import { bindingFixtures } from "./native/fixtures/bindings.ts";
import { bigintFixtures } from "./native/fixtures/bigint.ts";
import { bigintIntrinsicFixtures } from "./native/fixtures/bigint-intrinsic.ts";
import { classFixtures } from "./native/fixtures/classes.ts";
import { dataViewFixtures } from "./native/fixtures/data-view.ts";
import { expressionFixtures } from "./native/fixtures/expressions.ts";
import { functionFixtures } from "./native/fixtures/functions.ts";
import { generatorFixtures } from "./native/fixtures/generators.ts";
import * as globalRecord from "./native/fixtures/global-object-record.ts";
import * as iteratorFixtures from "./native/fixtures/iterator-intrinsic.ts";
import * as mapFixtures from "./native/fixtures/map-intrinsic.ts";
import * as numberFixtures from "./native/fixtures/number-intrinsic.ts";
import { objectFixtures } from "./native/fixtures/objects.ts";
import * as promiseFixtures from "./native/fixtures/promise-intrinsic.ts";
import { receiverFixtures } from "./native/fixtures/receivers.ts";
import { regexpIntrinsicFixtures } from "./native/fixtures/regexp-intrinsic.ts";
import * as stringFixtures from "./native/fixtures/string-intrinsic.ts";

const { arrayConstructorFixtures } =
  await import("./native/fixtures/array-constructor.ts");
const { arrayPrototypeIterativeFixtures } =
  await import("./native/fixtures/array-prototype-iterative.ts");
const { arrayPrototypeCopyingFixtures } =
  await import("./native/fixtures/array-prototype-copying.ts");
const { arrayPrototypeSortFixtures } =
  await import("./native/fixtures/array-prototype-sort.ts");
const { arrayPrototypeSpeciesMappingFixtures } =
  await import("./native/fixtures/array-prototype-species-mapping.ts");
const { stringPrototypeAccessFixtures } =
  await import("./native/fixtures/string-prototype-access.ts");
const { stringPrototypeSearchAndSliceFixtures } =
  await import("./native/fixtures/string-prototype-search-and-slice.ts");
const { stringPrototypeMatchAndSplitFixtures } =
  await import("./native/fixtures/string-prototype-match-and-split.ts");
const { numberPrototypeFixtures } =
  await import("./native/fixtures/number-prototype.ts");

import { runNativeScenario0 } from "./native/scenarios/shard-0.ts";
import { runNativeScenario1 } from "./native/scenarios/shard-1.ts";
import { runNativeScenario2 } from "./native/scenarios/shard-2.ts";

const nativeArguments = parseTestShardArguments(process.argv.slice(2));
if (nativeArguments.help) {
  console.log("usage: node tests/native.ts [--shard INDEX/TOTAL]");
  process.exit(0);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
assert(nativeTarget != null, "supported native execution host");
const zigNativeTarget =
  nativeTarget.name === "macos-aarch64"
    ? "aarch64-macos"
    : nativeTarget.name === "linux-x86_64-gnu"
      ? "x86_64-linux-gnu"
      : assert.fail(`unsupported execution target: ${nativeTarget.name}`);

// The captured `String` keeps the reference console working while a
// fixture replaces or deletes the realm's own global binding.
const referencePrelude = `
const oseoReferenceConsole = console;
const oseoReferenceString = String;
Object.defineProperty(globalThis, "console", {
  value: {
    log(...values: unknown[]) {
      oseoReferenceConsole.log(values.map(oseoReferenceString).join(" "));
    },
  },
});
`;

const fixtures: readonly Fixture[] = [
  ...functionFixtures,
  ...globalRecord.globalObjectRecordFixtures,
  ...objectFixtures,
  ...arrayBufferFixtures,
  ...arrayConstructorFixtures,
  ...arrayPrototypeCopyingFixtures,
  ...arrayPrototypeIterativeFixtures,
  ...arrayPrototypeSortFixtures,
  ...arrayPrototypeSpeciesMappingFixtures,
  ...classFixtures,
  ...bindingFixtures,
  ...bigintFixtures,
  ...bigintIntrinsicFixtures,
  ...dataViewFixtures,
  ...expressionFixtures,
  ...receiverFixtures,
  ...regexpIntrinsicFixtures,
  ...generatorFixtures,
  ...iteratorFixtures.iteratorIntrinsicFixtures,
  ...mapFixtures.mapIntrinsicFixtures,
  ...numberFixtures.numberIntrinsicFixtures,
  ...promiseFixtures.promiseIntrinsicFixtures,
  ...stringFixtures.stringIntrinsicFixtures,
  ...stringPrototypeAccessFixtures,
  ...stringPrototypeSearchAndSliceFixtures,
  ...stringPrototypeMatchAndSplitFixtures,
  ...numberPrototypeFixtures,
  ...asyncFixtures,
  ...asyncIterationFixtures,
  ...asyncGeneratorFixtures,
];

const descriptorMapCompilation = compileSource(babelFrontend, {
  source: "Object.create(null, { item: { value: 3 } });",
  sourceId: "object-create-descriptor-map.ts",
});
assert.deepEqual(descriptorMapCompilation.diagnostics, []);
assert(descriptorMapCompilation.mir != null, "descriptor map MIR");

const spreadDescriptorMap = await runNativeCli(
  {
    args: ["spread-descriptor-map.ts"],
    source: "Object.create(...[null, { item: { value: 3 } }]);",
    sourceId: "spread-descriptor-map.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(spreadDescriptorMap.exitStatus, 1);
assert.equal(spreadDescriptorMap.stdout, "");
assert.match(
  spreadDescriptorMap.stderr,
  /error\[OSEO2001\].*descriptor maps are unsupported/u,
);

const deferredStringTrim = await runNativeCli(
  {
    args: ["deferred-string-trim.ts"],
    source: '"".trim();',
    sourceId: "deferred-string-trim.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(deferredStringTrim.exitStatus, 1);
assert.equal(deferredStringTrim.stdout, "");
assert.match(
  deferredStringTrim.stderr,
  /^deferred-string-trim\.ts:1:\d+: error\[OSEO2001\]: String prototype/u,
);

const deferredRegExpFallback = await runNativeCli(
  {
    args: ["deferred-regexp-fallback.ts"],
    source: '"aaa".match("a*");',
    sourceId: "deferred-regexp-fallback.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(deferredRegExpFallback.exitStatus, 1);
assert.equal(deferredRegExpFallback.stdout, "");
assert.match(
  deferredRegExpFallback.stderr,
  /^deferred-regexp-fallback\.ts:1:\d+: error\[OSEO2001\]: Regular/u,
);

for (const deferredRegExp of [
  {
    name: "deferred-regexp-property.ts",
    source: 'new RegExp("\\\\p{ASCII}", "u");',
  },
  {
    name: "deferred-regexp-class-string.ts",
    source: 'new RegExp("[\\\\q{ab}]", "v");',
  },
  {
    name: "deferred-regexp-modifier.ts",
    source: 'new RegExp("(?i:a)");',
  },
  {
    name: "deferred-regexp-escaped-group-name.ts",
    source: 'new RegExp("(?<\\\\u0041>a)");',
  },
  {
    name: "deferred-regexp-escaped-group-forward-reference.ts",
    source: 'new RegExp("\\\\k<A>(?<\\\\u0041>x)");',
  },
  {
    name: "deferred-regexp-unicode-group-name.ts",
    source: 'new RegExp("\\\\k<é>(?<é>a)");',
  },
  {
    name: "deferred-regexp-nonascii-identity.ts",
    source: 'new RegExp("\\\\é");',
  },
  {
    name: "deferred-regexp-nonascii-class-identity.ts",
    source: 'new RegExp("[\\\\é]");',
  },
  {
    name: "deferred-regexp-exec.ts",
    source: 'new RegExp("a").exec("a");',
  },
  {
    name: "deferred-regexp-source.ts",
    source: 'new RegExp("a").source;',
  },
  {
    name: "deferred-regexp-symbol-search.ts",
    source: 'RegExp.prototype[Symbol.search]("");',
  },
]) {
  const deferred = await runNativeCli(
    {
      args: [deferredRegExp.name],
      source: deferredRegExp.source,
      sourceId: deferredRegExp.name,
      version: "0.1.0",
    },
    host,
  );
  assert.equal(deferred.exitStatus, 1);
  assert.equal(deferred.stdout, "");
  assert.match(
    deferred.stderr,
    new RegExp(
      `^${deferredRegExp.name.replace(".", "\\.")}:1:\\d+: ` +
        "error\\[OSEO2001\\]: (?:RegExp|Regular expression)",
      "u",
    ),
  );
}

for (const deferredSymbol of [
  {
    name: "deferred-regexp-symbol-match.ts",
    source: `
const regexp = new RegExp("a+");
regexp.toString = () => "z";
"aaa".match(regexp);
`,
  },
  {
    name: "deferred-regexp-symbol-match-all.ts",
    source: `
const regexp = new RegExp("a+", "g");
Object.defineProperty(regexp, "flags", { value: "g" });
regexp.toString = () => "z";
"aaa".matchAll(regexp);
`,
  },
  {
    name: "deferred-regexp-symbol-search-fallthrough.ts",
    source: `
const regexp = new RegExp("a+");
regexp.toString = () => "z";
"aaa".search(regexp);
`,
  },
  {
    name: "deferred-regexp-symbol-split.ts",
    source: `
const regexp = new RegExp("a+");
regexp.toString = () => "z";
"aaa".split(regexp);
`,
  },
]) {
  const deferred = await runNativeCli(
    {
      args: [deferredSymbol.name],
      source: deferredSymbol.source,
      sourceId: deferredSymbol.name,
      version: "0.1.0",
    },
    host,
  );
  assert.equal(deferred.exitStatus, 1);
  assert.equal(deferred.stdout, "");
  assert.match(
    deferred.stderr,
    new RegExp(
      `^${deferredSymbol.name.replace(".", "\\.")}:\\d+:\\d+: ` +
        "error\\[OSEO2001\\]: RegExp",
      "u",
    ),
  );
}

for (const misplacedRegExpPlaceholder of [
  {
    name: "misplaced-regexp-placeholder-match.ts",
    source: `
RegExp.prototype[Symbol.match] = RegExp.prototype.exec;
"a".match("a");
`,
  },
  {
    name: "misplaced-regexp-placeholder-match-all.ts",
    source: `
RegExp.prototype[Symbol.matchAll] = RegExp.prototype[Symbol.match];
"a".matchAll("a");
`,
  },
  {
    name: "misplaced-regexp-placeholder-search.ts",
    source: `
RegExp.prototype[Symbol.search] = RegExp.prototype[Symbol.split];
"a".search("a");
`,
  },
]) {
  const deferred = await runNativeCli(
    {
      args: [misplacedRegExpPlaceholder.name],
      source: misplacedRegExpPlaceholder.source,
      sourceId: misplacedRegExpPlaceholder.name,
      version: "0.1.0",
    },
    host,
  );
  assert.equal(deferred.exitStatus, 1);
  assert.equal(deferred.stdout, "");
  assert.match(
    deferred.stderr,
    new RegExp(
      `^${misplacedRegExpPlaceholder.name.replace(".", "\\.")}:` +
        "\\d+:\\d+: error\\[OSEO2001\\]: RegExp String dispatch",
      "u",
    ),
  );
}

for (const missingRegExpPlaceholder of [
  {
    name: "missing-regexp-placeholder-match.ts",
    symbol: "match",
    expression: '"a".match("a")',
  },
  {
    name: "missing-regexp-placeholder-match-all.ts",
    symbol: "matchAll",
    expression: '"a".matchAll("a")',
  },
  {
    name: "missing-regexp-placeholder-search.ts",
    symbol: "search",
    expression: '"a".search("a")',
  },
]) {
  const source = `
delete RegExp.prototype[Symbol.${missingRegExpPlaceholder.symbol}];
${missingRegExpPlaceholder.expression};
`;
  const deferred = await runNativeCli(
    {
      args: [missingRegExpPlaceholder.name],
      source,
      sourceId: missingRegExpPlaceholder.name,
      version: "0.1.0",
    },
    host,
  );
  assert.equal(deferred.exitStatus, 1);
  assert.equal(deferred.stdout, "");
  assert.match(
    deferred.stderr,
    new RegExp(
      `^${missingRegExpPlaceholder.name.replace(".", "\\.")}:` +
        "\\d+:\\d+: error\\[OSEO2001\\]: RegExp String dispatch",
      "u",
    ),
  );
}

for (const shadowedRegExpPlaceholder of [
  {
    expected: "\n",
    expression: 'console.log("a".match()[0])',
    name: "shadowed-regexp-placeholder-match.ts",
    symbol: "match",
  },
  {
    expected: "\n",
    expression: 'console.log("a".matchAll().next().value[0])',
    name: "shadowed-regexp-placeholder-match-all.ts",
    symbol: "matchAll",
  },
  {
    expected: "0\n",
    expression: 'console.log("a".search())',
    name: "shadowed-regexp-placeholder-search.ts",
    symbol: "search",
  },
]) {
  const source = `
Object.prototype[Symbol.${shadowedRegExpPlaceholder.symbol}] = () => 1;
${shadowedRegExpPlaceholder.expression};
`;
  const native = await runNativeCli(
    {
      args: [shadowedRegExpPlaceholder.name],
      source,
      sourceId: shadowedRegExpPlaceholder.name,
      version: "0.1.0",
    },
    host,
  );
  assert.equal(native.exitStatus, 0, native.stderr);
  assert.equal(native.stdout, shadowedRegExpPlaceholder.expected);
  assert.equal(native.stderr, "");
}

const coreClassBackreference = await runNativeCli(
  {
    args: ["regexp-core-class-backreference.ts"],
    source: `
try {
  new RegExp("(a)[\\\\1]");
} catch (error) {
  console.log(error instanceof SyntaxError);
}
`,
    sourceId: "regexp-core-class-backreference.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(coreClassBackreference.exitStatus, 0);
assert.equal(coreClassBackreference.stdout, "true\n");
assert.equal(coreClassBackreference.stderr, "");

for (const deferredPattern of [
  {
    name: "deferred-regexp-short-hex.ts",
    units: "92, 120, 49",
  },
  {
    name: "deferred-regexp-bad-unicode.ts",
    units: "92, 117, 49, 50, 122, 52",
  },
]) {
  const deferred = await runNativeCli(
    {
      args: [deferredPattern.name],
      source: '"x".match(String.fromCharCode(' + deferredPattern.units + "));",
      sourceId: deferredPattern.name,
      version: "0.1.0",
    },
    host,
  );
  assert.equal(deferred.exitStatus, 1);
  assert.equal(deferred.stdout, "");
  assert.match(
    deferred.stderr,
    new RegExp(
      `^${deferredPattern.name.replace(".", "\\.")}:1:\\d+: ` +
        "error\\[OSEO2001\\]: Regular",
      "u",
    ),
  );
}

const deferredObjectAssign = await runNativeCli(
  {
    args: ["deferred-object-assign.ts"],
    source: "Object.assign({}, {});",
    sourceId: "deferred-object-assign.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(deferredObjectAssign.exitStatus, 1);
assert.equal(deferredObjectAssign.stdout, "");
assert.match(
  deferredObjectAssign.stderr,
  /^deferred-object-assign\.ts:1:\d+: error\[OSEO2001\]: Object static/u,
);

// ADR 0023's portable baseline admits magnitudes through 65,536 bits, and
// BigInt.asUintN is the one fixed-width request whose result grows to the
// full requested width. The reviewed ceiling is Oseo's own resource
// boundary rather than a specified one, so it is checked here instead of
// in a fixture that also has to match the reference hosts.
const bigintWidthCeiling = await runNativeCli(
  {
    args: ["bigint-width-ceiling.ts"],
    source: [
      "console.log(BigInt.asUintN(65536, -1n) > 0n);",
      "try { BigInt.asUintN(65537, -1n); } catch (error) {",
      "  console.log(error instanceof RangeError, error.message);",
      "}",
    ].join("\n"),
    sourceId: "bigint-width-ceiling.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(bigintWidthCeiling.exitStatus, 0, bigintWidthCeiling.stderr);
assert.equal(
  bigintWidthCeiling.stdout,
  "true\ntrue BigInt exceeds the 65,536-bit implementation limit.\n",
);

async function requireSuccess(
  command: string,
  args: readonly string[],
): Promise<{
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const result = await host.run({ args, command, cwd: root });
  if (result.exitStatus !== 0) {
    throw new Error(`${command} reference fixture failed:\n${result.stderr}`);
  }
  return result;
}

async function references(fixture: Fixture): Promise<
  readonly [
    {
      readonly exitStatus: number;
      readonly stderr: string;
      readonly stdout: string;
    },
    {
      readonly exitStatus: number;
      readonly stderr: string;
      readonly stdout: string;
    },
  ]
> {
  const directory = await host.makeTemporaryDirectory("oseo-reference-");
  const path = `${directory}/${fixture.name}.ts`;
  try {
    const source = fixture.globalScriptReference
      ? `(0, eval)(${JSON.stringify(fixture.source)});\n`
      : fixture.nonStrictScript
        ? `new Function(${JSON.stringify(fixture.source)})();\n`
        : fixture.source;
    await host.writeTextFile(path, referencePrelude + source);
    return [
      await requireSuccess(process.execPath, [path]),
      await requireSuccess("deno", ["run", "--quiet", path]),
    ];
  } finally {
    await host.remove(directory);
  }
}

const selectedFixtures = selectTestShard(fixtures, nativeArguments.shard);
for (const fixture of selectedFixtures) {
  const [nodeReference, denoReference] = await references(fixture);
  assertMatchingObservations([nodeReference, denoReference]);
  const disabledCompilation = compileSource(
    babelFrontend,
    {
      source: fixture.source,
      sourceId: `${fixture.name}.ts`,
    },
    { observeSpecialization: true, specialization: "disabled" },
  );
  const enabledCompilation = compileSource(
    babelFrontend,
    {
      source: fixture.source,
      sourceId: `${fixture.name}.ts`,
    },
    { observeSpecialization: true, specialization: "enabled" },
  );
  assert.deepEqual(disabledCompilation.diagnostics, [], fixture.name);
  assert.deepEqual(enabledCompilation.diagnostics, [], fixture.name);
  const disabledMir = disabledCompilation.mir;
  const enabledMir = enabledCompilation.mir;
  assert(disabledMir != null, `${fixture.name}: disabled MIR`);
  assert(enabledMir != null, `${fixture.name}: enabled MIR`);

  if (fixture.name === "property-specialization") {
    const enabledText = printMir(enabledMir);
    assert.match(enabledText, /guard-object/u);
    assert.match(enabledText, /guard-shape/u);
    assert.match(enabledText, /load-fixed-slot/u);
    assert.match(enabledText, /property-get generic/u);
    assert.match(enabledText, /join property read/u);
    assert.doesNotMatch(enabledText, /property-get-cached/u);
    assert.doesNotMatch(printMir(disabledMir), /guard-(?:object|shape)/u);
  }

  if (fixture.name === "delete-non-strict") {
    const enabledText = printMir(enabledMir);
    assert.match(enabledText, /guard-object/u);
    assert.match(enabledText, /property-get generic/u);
  }

  if (
    fixture.name === "array-buffer" ||
    fixture.name === "array-prototype-copying" ||
    fixture.name === "array-prototype-iterative" ||
    fixture.name === "array-prototype-sort" ||
    fixture.name === "array-prototype-species-mapping" ||
    fixture.name === "bigint-intrinsic" ||
    fixture.name === "data-view" ||
    fixture.name === "regexp-intrinsic" ||
    fixture.name === "object-constructor" ||
    fixture.name === "object-define-property" ||
    fixture.name === "object-define-properties" ||
    fixture.name === "object-descriptor-queries" ||
    fixture.name === "object-integrity-levels" ||
    fixture.name === "global-object-record" ||
    fixture.name === "object-prototype" ||
    fixture.name === "function-prototype" ||
    fixture.name === "iterator-intrinsic" ||
    fixture.name === "map-intrinsic" ||
    fixture.name === "number-intrinsic" ||
    fixture.name === "promise-all-and-race" ||
    fixture.name === "promise-intrinsic" ||
    fixture.name === "string-intrinsic" ||
    fixture.name === "string-prototype-access" ||
    fixture.name === "string-prototype-search-and-slice" ||
    fixture.name === "string-prototype-match-and-split" ||
    fixture.name === "number-prototype"
  ) {
    const enabledText = printMir(enabledMir);
    assert.match(enabledText, /guard-object/u);
    assert.match(enabledText, /guard-shape/u);
    assert.match(enabledText, /property-get generic/u);
    assert.doesNotMatch(printMir(disabledMir), /guard-(?:object|shape)/u);
  }

  if (fixture.name === "object-literal-prototype-setter") {
    assert.match(printMir(enabledMir), /guard-smi/u);
    assert.doesNotMatch(printMir(disabledMir), /guard-smi/u);
  }

  if (
    fixture.name === "class-optional-private-reads" ||
    fixture.name === "class-optional-private-methods"
  ) {
    for (const text of [printMir(disabledMir), printMir(enabledMir)]) {
      assert.match(text, /private-get private-get/u);
    }
  }

  if (fixture.name === "class-optional-private-methods") {
    assert.match(printMir(enabledMir), /guard-smi/u);
    assert.doesNotMatch(printMir(disabledMir), /guard-smi/u);
  }

  if (
    fixture.name === "for-in" ||
    fixture.name === "for-in-enumeration" ||
    fixture.name === "for-in-object-patterns"
  ) {
    // Both policies lower the enumerate head to the same two owned
    // operations, and neither emits an iterator close: an enumerate
    // iterator is never closed, so no head or body completion routes
    // through one. An object pattern head adds no iterator either, so
    // its abrupt property read, default, and rest leave the loop through
    // the enclosing transfer alone.
    for (const text of [printMir(disabledMir), printMir(enabledMir)]) {
      assert.match(text, /enumerate-get EnumerateObjectProperties/u);
      assert.match(text, /enumerate-next enumeration step/u);
      assert.doesNotMatch(text, /iterator-close/u);
    }
  }

  if (fixture.name === "script-this") {
    // Script top level and a non-strict function share one lowering,
    // while the strict function in the same Script reads its receiver.
    // Neither depends on the specialization policy.
    for (const text of [printMir(disabledMir), printMir(enabledMir)]) {
      assert.match(text, /global-this global this/u);
      assert.match(text, /= receiver this/u);
    }
  }

  if (fixture.name === "script-this-hints") {
    assert.match(printMir(enabledMir), /guard-smi/u);
    assert.doesNotMatch(printMir(disabledMir), /guard-smi/u);
  }

  if (
    fixture.name === "array-buffer" ||
    fixture.name === "closures-and-methods" ||
    fixture.name === "function-prototype" ||
    fixture.name === "iterator-intrinsic" ||
    fixture.name === "map-intrinsic" ||
    fixture.name === "number-intrinsic" ||
    fixture.name === "promise-all-and-race" ||
    fixture.name === "promise-intrinsic" ||
    fixture.name === "string-intrinsic" ||
    fixture.name === "object-constructor" ||
    fixture.name === "object-define-property" ||
    fixture.name === "object-define-properties" ||
    fixture.name === "object-descriptor-queries" ||
    fixture.name === "object-integrity-levels" ||
    fixture.name === "global-object-record" ||
    fixture.name === "object-prototype" ||
    fixture.name === "catchable-type-errors" ||
    fixture.name === "aggregate-error-and-options" ||
    fixture.name === "async-continuations" ||
    fixture.name === "async-await-positions" ||
    fixture.name === "async-pattern-await-positions" ||
    fixture.name === "async-pattern-await-abrupt" ||
    fixture.name === "async-generator-pattern-await" ||
    fixture.name === "async-declaration-list-await" ||
    fixture.name === "lexical-declaration-lists" ||
    fixture.name === "lexical-declaration-list-hints" ||
    fixture.name === "generic-addition" ||
    fixture.name === "guarded-addition" ||
    fixture.name === "timer-event-loop" ||
    fixture.name === "arrays" ||
    fixture.name === "array-bindings" ||
    fixture.name === "object-bindings" ||
    fixture.name === "object-literals" ||
    fixture.name === "object-literal-prototype-setter" ||
    fixture.name === "class-definitions" ||
    fixture.name === "class-identity" ||
    fixture.name === "class-name-binding" ||
    fixture.name === "class-evaluation-order" ||
    fixture.name === "class-strict-body" ||
    fixture.name === "class-inheritance" ||
    fixture.name === "class-super-binding" ||
    fixture.name === "class-super-property" ||
    fixture.name === "class-super-assignment" ||
    fixture.name === "class-super-computed" ||
    fixture.name === "class-super-delete" ||
    fixture.name === "class-super-targets" ||
    fixture.name === "class-super-static" ||
    fixture.name === "class-super-fresh-construct" ||
    fixture.name === "class-heritage-values" ||
    fixture.name === "class-new-target" ||
    fixture.name === "class-lexical-super" ||
    fixture.name === "class-derived-return-hints" ||
    fixture.name === "class-error-subclass" ||
    fixture.name === "class-fields" ||
    fixture.name === "class-field-order" ||
    fixture.name === "class-field-inheritance" ||
    fixture.name === "class-field-scope" ||
    fixture.name === "class-field-super" ||
    fixture.name === "class-private-fields" ||
    fixture.name === "class-private-methods" ||
    fixture.name === "class-private-accessors" ||
    fixture.name === "class-private-brand-checks" ||
    fixture.name === "class-cross-private-access" ||
    fixture.name === "class-optional-private-reads" ||
    fixture.name === "class-optional-private-methods" ||
    fixture.name === "class-static-private-methods" ||
    fixture.name === "class-private-updates" ||
    fixture.name === "class-static-fields" ||
    fixture.name === "class-static-field-order" ||
    fixture.name === "class-static-private-fields" ||
    fixture.name === "class-static-field-inheritance" ||
    fixture.name === "class-static-blocks" ||
    fixture.name === "class-static-block-order" ||
    fixture.name === "class-static-block-scope" ||
    fixture.name === "class-static-block-super" ||
    fixture.name === "generators" ||
    fixture.name === "generator-delegated-throw" ||
    fixture.name === "async-generators" ||
    fixture.name === "async-from-sync-delegated-throw" ||
    fixture.name === "async-generator-prototypes" ||
    fixture.name === "async-generator-resumptions" ||
    fixture.name === "async-generator-delegation" ||
    fixture.name === "async-generator-delegation-suspension" ||
    fixture.name === "async-generator-for-await-suspension" ||
    fixture.name === "async-generator-missing-throw-close-suspension" ||
    fixture.name === "async-from-sync-rejection-close" ||
    fixture.name === "catch-bindings" ||
    fixture.name === "catch-var-coexistence" ||
    fixture.name === "block-function-var-coexistence" ||
    fixture.name === "switch-function-declarations" ||
    fixture.name === "debugger-statement" ||
    fixture.name === "optional-catch-binding" ||
    fixture.name === "compound-assignments" ||
    fixture.name === "delete-non-strict" ||
    fixture.name === "mapped-arguments-object" ||
    fixture.name === "mapped-arguments-hoisted-function" ||
    fixture.name === "script-this" ||
    fixture.name === "script-this-strict" ||
    fixture.name === "script-this-hints" ||
    fixture.name === "script-global-bindings" ||
    fixture.name === "object-define-property" ||
    fixture.name === "object-descriptor-queries" ||
    fixture.name === "object-integrity-levels" ||
    fixture.name === "global-object-record" ||
    fixture.name === "symbols" ||
    fixture.name === "string-prototype-access" ||
    fixture.name === "array-prototype-copying" ||
    fixture.name === "array-prototype-iterative" ||
    fixture.name === "array-prototype-sort" ||
    fixture.name === "string-prototype-search-and-slice" ||
    fixture.name === "string-prototype-match-and-split" ||
    fixture.name === "number-prototype" ||
    fixture.name === "array-prototype-species-mapping" ||
    fixture.name === "delete-strict" ||
    fixture.name === "function-rest-parameters" ||
    fixture.name === "for-of" ||
    fixture.name === "for-in" ||
    fixture.name === "for-in-enumeration" ||
    fixture.name === "for-in-object-patterns" ||
    fixture.name === "for-await-of-frame-suspension" ||
    fixture.name === "for-await-of-close-suspension" ||
    fixture.name === "in-and-instanceof" ||
    fixture.name === "optional-chaining" ||
    fixture.name === "typeof-void-remainder" ||
    fixture.name === "typeof-unresolved" ||
    fixture.name === "bigint-intrinsic" ||
    fixture.name === "data-view" ||
    fixture.name === "regexp-intrinsic" ||
    fixture.name === "bigint-primitive" ||
    fixture.name === "bigint-false-number-hint" ||
    fixture.name === "tagged-templates" ||
    fixture.name === "template-literals"
  ) {
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
  }
  try {
    for (const [mode, compilation] of [
      ["disabled", disabledMir],
      ["enabled", enabledMir],
    ] as const) {
      await withNativeFixture(
        {
          backend: cBackend,
          host,
          input: compilation,
          keepArtifacts: process.env.OSEO_KEEP_ARTIFACTS === "1",
          operation: "execute",
          runtime: cRuntimeProvider,
          target: nativeTarget,
          toolchain: zigToolchain,
        },
        (native) => {
          assertMatchingObservations([nodeReference, denoReference, native]);
          assert(native.counters != null, `${fixture.name}: counters`);
          assert(native.emittedC.includes("OseoResult"), "generic call ABI");
          if (mode === "disabled") {
            assert.equal(native.counters.guardHits, 0);
            assert.equal(native.counters.guardMisses, 0);
            assert.equal(native.counters.overflowMisses, 0);
          }
          if (fixture.specialization != null) {
            const expected = fixture.specialization;
            assert.equal(
              native.counters.genericAdditionCalls,
              mode === "enabled"
                ? expected.genericCallsEnabled
                : expected.genericCallsDisabled,
            );
            if (mode === "enabled") {
              assert.equal(native.counters.guardHits, expected.hits);
              assert.equal(native.counters.guardMisses, expected.misses);
              assert.equal(
                native.counters.overflowMisses,
                expected.overflowMisses,
              );
            }
          }
          if (fixture.name === "guarded-addition" && mode === "enabled") {
            assert.match(native.emittedC, /oseo_value_is_smi/u);
            assert.match(native.emittedC, /oseo_smi_try_add/u);
            assert.match(native.emittedC, /oseo_value_box_smi/u);
            assert.ok(native.counters.allocations > 0);
            assert.ok(native.counters.collections > 0);
          }
          if (fixture.name === "delete-non-strict") {
            assert.ok(native.counters.collections > 0);
            if (mode === "enabled") {
              assert.ok(native.counters.guardMisses > 0);
            }
          }
          if (
            fixture.name === "array-buffer" ||
            fixture.name === "array-prototype-copying" ||
            fixture.name === "array-prototype-iterative" ||
            fixture.name === "array-prototype-sort" ||
            fixture.name === "array-prototype-species-mapping" ||
            fixture.name === "bigint-intrinsic" ||
            fixture.name === "data-view" ||
            fixture.name === "regexp-intrinsic" ||
            fixture.name === "object-constructor" ||
            fixture.name === "object-define-property" ||
            fixture.name === "object-define-properties" ||
            fixture.name === "object-descriptor-queries" ||
            fixture.name === "object-integrity-levels" ||
            fixture.name === "global-object-record" ||
            fixture.name === "object-prototype" ||
            fixture.name === "function-prototype" ||
            fixture.name === "iterator-intrinsic" ||
            fixture.name === "map-intrinsic" ||
            fixture.name === "number-intrinsic" ||
            fixture.name === "promise-all-and-race" ||
            fixture.name === "promise-intrinsic" ||
            fixture.name === "string-intrinsic" ||
            fixture.name === "string-prototype-access" ||
            fixture.name === "string-prototype-search-and-slice" ||
            fixture.name === "string-prototype-match-and-split" ||
            fixture.name === "number-prototype"
          ) {
            assert.ok(native.counters.collections > 0);
            if (mode === "enabled") {
              if (
                fixture.name === "array-buffer" ||
                fixture.name === "array-prototype-copying" ||
                fixture.name === "array-prototype-sort" ||
                fixture.name === "map-intrinsic" ||
                fixture.name === "object-constructor" ||
                fixture.name === "number-prototype"
              ) {
                assert.ok(native.counters.guardHits > 0);
              }
              assert.ok(native.counters.guardMisses > 0);
            }
          }
          if (fixture.name === "delete-strict") {
            assert.ok(native.counters.collections > 0);
          }
          if (fixture.name === "aggregate-error-and-options") {
            assert.ok(native.counters.collections > 0);
          }
          if (fixture.name === "symbols") {
            assert.ok(native.counters.collections > 0);
          }
          if (fixture.name === "class-super-targets") {
            // A destructuring leaf and a for-of head reuse the ordinary
            // `super` property set rather than a second store path, and
            // every evaluated reference survives forced collection
            // between the reference and the value it stores.
            assert.match(native.emittedC, /oseo_super_set\(context, roots\[/u);
            assert.ok(native.counters.collections > 0);
          }
          if (
            fixture.name === "class-optional-private-reads" ||
            fixture.name === "class-optional-private-methods"
          ) {
            // The optional guard precedes PrivateGet, while a live private
            // method call retains its branded object as the receiver across
            // the lookup safepoint and the following call safepoint.
            assert.match(
              native.emittedC,
              /oseo_private_get\(context, roots\[/u,
            );
            assert.ok(native.counters.collections > 0);
          }
          if (
            fixture.name === "class-optional-private-methods" &&
            mode === "enabled"
          ) {
            assert.ok(native.counters.guardHits > 0);
            assert.ok(native.counters.guardMisses > 0);
          }
          if (
            fixture.name === "for-in" ||
            fixture.name === "for-in-enumeration" ||
            fixture.name === "for-in-object-patterns"
          ) {
            // An enumerate head is not the iterator protocol: it acquires
            // and steps its own record and is never closed, so no
            // iterator entry point may appear, and every record, key
            // snapshot, and processed key must survive forced collection
            // between two steps and across a suspension.
            assert.match(
              native.emittedC,
              /oseo_enumerate_get\(context, roots\[/u,
            );
            assert.match(
              native.emittedC,
              /oseo_enumerate_next\(context, roots\[/u,
            );
            assert.doesNotMatch(native.emittedC, /oseo_iterator_close/u);
            assert.ok(native.counters.collections > 0);
          }
          if (fixture.name === "typeof-unresolved") {
            // The folded "undefined" result and every with-chain typeof
            // observation must survive forced collection, and no lowered
            // path may read or create a binding for an unresolvable
            // direct operand.
            assert.ok(native.counters.collections > 0);
            assert.doesNotMatch(native.emittedC, /missingTopLevel/u);
          }
          if (
            fixture.name === "async-pattern-await-positions" ||
            fixture.name === "async-pattern-await-abrupt" ||
            fixture.name === "async-generator-pattern-await"
          ) {
            // A pattern subexpression that suspends leaves its prepared
            // reference, iterator, and excluded keys in the resumed
            // frame's root slots, so every forced collection between the
            // suspension and the resumption must keep them alive.
            assert.ok(native.counters.collections > 0);
          }
          if (
            fixture.name === "lexical-declaration-lists" ||
            fixture.name === "async-declaration-list-await"
          ) {
            // The cells a declaration list creates before its first
            // initializer runs must survive every forced collection
            // between the declarators, including across a suspension,
            // and a closure that captured them keeps the same cells.
            assert.ok(native.counters.collections > 0);
          }
          if (fixture.name === "catch-var-coexistence") {
            // Catch and outer var cells remain independently reachable
            // across closures, suspension, and cleanup.
            assert.ok(native.counters.collections > 0);
          }
          if (fixture.name === "block-function-var-coexistence") {
            // The block's own function cell and the outer var cell stay
            // independently reachable across closures and suspension.
            assert.ok(native.counters.collections > 0);
          }
          if (fixture.name === "switch-function-declarations") {
            // A CaseBlock function created on one switch evaluation
            // stays reachable through a closure captured across forced
            // collection, and a later evaluation's function object keeps
            // an identity distinct from an earlier one's.
            assert.ok(native.counters.collections > 0);
          }
          if (fixture.name === "lexical-declaration-list-hints") {
            assert.ok(native.counters.collections > 0);
            if (mode === "enabled") {
              assert.ok(native.counters.guardHits > 0);
              assert.ok(native.counters.guardMisses > 0);
            }
          }
          if (fixture.name === "script-global-bindings") {
            // The global object's properties are installed once from the
            // script's binding cells, and the binding assignment path
            // carries the writing code's strictness.
            assert.match(
              native.emittedC,
              /oseo_global_object_create\(context, roots\[/u,
            );
            assert.match(
              native.emittedC,
              /oseo_global_binding_set\(context, result\.value/u,
            );
            assert.ok(native.counters.collections > 0);
          }
          if (
            fixture.name === "script-this" ||
            fixture.name === "script-this-strict"
          ) {
            // Resolving the global this value allocates once and then
            // survives every forced collection that follows it.
            assert.match(
              native.emittedC,
              /oseo_this_value\(context, receiver\)/u,
            );
            assert.ok(native.counters.collections > 0);
          }
          if (fixture.name === "script-this-hints") {
            assert.ok(native.counters.collections > 0);
            if (mode === "enabled") {
              assert.ok(native.counters.guardHits > 0);
              assert.ok(native.counters.guardMisses > 0);
            }
          }
          if (fixture.name === "object-literal-prototype-setter") {
            assert.ok(native.counters.collections > 0);
            if (mode === "enabled") {
              assert.ok(native.counters.guardMisses > 0);
            }
          }
          if (fixture.name === "specialization-hit" && mode === "enabled") {
            // The function and its environment allocate six objects. The
            // Script global record contributes the ten standard-object and
            // value-property allocations plus seventeen admitted constructor
            // property names shared by every Script, RegExp being the one
            // this node admits.
            assert.equal(native.counters.allocations, 33);
            assert.equal(native.counters.genericAdditionCalls, 0);
          }
          if (fixture.name === "unused-function") {
            assert.match(native.emittedC, /oseo_function_0/u);
          }
          if (fixture.name === "returning-branches") {
            assert.doesNotMatch(native.emittedC, /bb3:/u);
          }
          assert(
            native.compilerInvocation
              .filter((line) => line.startsWith("zig cc "))
              .every((line) => line.includes(zigNativeTarget)),
            "native compiler invocation records an explicit target",
          );
        },
      );
    }
  } finally {
    delete process.env.OSEO_GC_EVERY_SAFEPOINT;
  }

  const crossCompilations =
    fixture.specialization == null ? [enabledMir] : [disabledMir, enabledMir];
  for (const compilation of crossCompilations) {
    await withNativeFixture(
      {
        backend: cBackend,
        host,
        input: compilation,
        keepArtifacts: process.env.OSEO_KEEP_ARTIFACTS === "1",
        operation: "compile",
        runtime: cRuntimeProvider,
        target: describeTarget("linux-aarch64-musl"),
        toolchain: zigToolchain,
      },
      (cross) => {
        assert(
          cross.compilerInvocation
            .filter((line) => line.startsWith("zig cc "))
            .every((line) => line.includes("aarch64-linux-musl")),
          "cross compiler invocation records an explicit target",
        );
      },
    );
  }
}

if (isTestShardPosition(0, nativeArguments.shard)) {
  await runNativeScenario0({
    host,
    nativeTarget,
    root,
    zigNativeTarget,
  });
}

if (isTestShardPosition(1, nativeArguments.shard)) {
  await runNativeScenario1({
    host,
    nativeTarget,
    root,
    zigNativeTarget,
  });
}

if (isTestShardPosition(2, nativeArguments.shard)) {
  await runNativeScenario2({
    host,
    nativeTarget,
    root,
    zigNativeTarget,
  });
}

console.log(
  `native fixtures: ${selectedFixtures.length}/${fixtures.length} Node, ` +
    "Deno, and " +
    `${nativeTarget.name} outputs match`,
);
console.log(
  `cross fixtures: ${
    selectedFixtures.length +
    (isTestShardPosition(0, nativeArguments.shard) ? 1 : 0)
  } linux-aarch64-musl builds passed`,
);
if (isTestShardPosition(0, nativeArguments.shard)) {
  console.log("assembly fixtures: all configured target paths inspected");
}
