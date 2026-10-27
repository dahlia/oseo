import assert from "node:assert/strict";
import test from "node:test";

import { compileSource } from "@oseo/compiler";
import { babelFrontend } from "@oseo/parser-babel";
import { runCli } from "../src/index.ts";

function compile(source: string, host = true) {
  return compileSource(
    babelFrontend,
    { source, sourceId: "host.js" },
    { test262Host: host },
  );
}

test("links Script sources with distinct function and binding IDs", () => {
  const source = `
$262.evalScript('let value = 1; function read() { return value; }');
$262.evalScript('function other() { return read(); }');
console.log(read(), other());
`;
  const result = compile(source);
  assert.deepEqual(result.diagnostics, []);
  const mir = result.mir!;
  const scripts = mir.test262Host!.scripts!;
  assert.equal(scripts.length, 2);
  const ids = mir.functions.map((fn) => fn.id);
  assert.equal(new Set(ids).size, ids.length);
  const lexicals = mir.functions.flatMap((fn) => fn.hostScript?.lexical ?? []);
  assert.equal(lexicals[0]?.name, "value");
  assert.equal(lexicals[0]?.mutable, true);
  const emitted = runCli({
    args: ["--test262-host", "--emit-c", "host.js"],
    source,
    sourceId: "host.js",
    version: "0.1.0",
  });
  assert.equal(emitted.exitStatus, 0, emitted.stderr);
  assert.match(emitted.stdout, /oseo_host_scripts\[\]/u);
  assert.match(emitted.stdout, /oseo_script_lexicals_install/u);
  assert.match(emitted.stdout, /oseo_global_environment/u);
});

test("collects nested, concatenated, computed, and realm Script calls", () => {
  const source = `
$262.evalScript('var a;' + 'var b;');
const other = $262.createRealm();
other['evalScript']('function f() { return 1; }');
$262.evalScript('$262.evalScript("var nested;");');
`;
  const result = compile(source);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.mir!.test262Host!.scripts!.map((entry) => entry.source),
    [
      "var a;var b;",
      "function f() { return 1; }",
      '$262.evalScript("var nested;");',
      "var nested;",
    ],
  );
});

test("collects literal calls through immutable lexical alias chains", () => {
  const result = compile(`
const other = $262.createRealm();
const evaluate = other['evalScript'], copy = evaluate;
function captured() { return copy('var fromClosure;' + '1;'); }
captured();
copy('var fromAlias;');
`);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.mir!.test262Host!.scripts!.map((entry) => entry.source).toSorted(),
    ["var fromAlias;", "var fromClosure;1;"],
  );
});

test("detached realm literal errors remain deferred until invocation", () => {
  const result = compile(`
const other = $262.createRealm();
const evaluate = other.evalScript;
evaluate('x;');
if (false) evaluate('let broken = ;');
`);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.mir!.test262Host!.scripts!.map(({ source, error }) => [
      source,
      error,
    ]),
    [
      ["x;", undefined],
      ["let broken = ;", "syntax"],
    ],
  );
});

test("collects immutable aliases recursively inside a compiled Script", () => {
  const inner = 'const e = $262.evalScript; e("var nestedAlias;");';
  const result = compile(`$262.evalScript(${JSON.stringify(inner)});`);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.mir!.test262Host!.scripts!.map((entry) => entry.source),
    [inner, "var nestedAlias;"],
  );
});

test("alias discovery respects shadowing and mutable targets", () => {
  for (const source of [
    'let e = $262.evalScript; e("not collected");',
    'var e = $262.evalScript; e("not collected");',
    'const e = $262.evalScript.bind($262); e("not collected");',
    'const e = $262.evalScript; e.call(null, "not collected");',
    'const e = $262.evalScript; const source = "var x;"; e(source);',
    'function unrelated(text) { return text; } unrelated("not collected");',
    `const e = $262.evalScript;
     { const e = (text) => text; e("not collected"); }`,
    `const e = $262.evalScript;
     function shadow(e) { return e("not collected"); }
     shadow((text) => text);`,
    `const e = $262.evalScript;
     with ({ e(text) { return text; } }) { e("not collected"); }`,
  ]) {
    const result = compile(source);
    assert.deepEqual(result.diagnostics, [], source);
    assert.deepEqual(result.mir!.test262Host!.scripts, [], source);
  }
});

test("alias discovery retains TDZ and const assignment rules", () => {
  const result = compile(`
function beforeInitialization() { e('var before;'); }
try { beforeInitialization(); } catch (error) {}
const e = $262.evalScript;
try { e = (source) => source; } catch (error) {}
e('var after;');
`);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.mir!.test262Host!.scripts!.map((entry) => entry.source).toSorted(),
    ["var after;", "var before;"],
  );
});

test("defers Script errors until invocation", () => {
  const result = compile(`
if (false) $262.evalScript('let ; =');
$262.evalScript('eval("1")');
`);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.mir!.test262Host!.scripts![0]?.error, "syntax");
  assert.equal(compile('print("ok");', false).mir?.test262Host, undefined);
});

test("resolves host lexical references only in explicit host builds", () => {
  for (const host of [false, true]) {
    const result = compile("console.log(typeof later); later = 1;", host);
    assert.deepEqual(result.diagnostics, []);
    const operations = result.mir!.script.blocks.flatMap((b) => b.operations);
    assert.equal(
      operations.some((op) => op.kind === "global-environment"),
      host,
    );
  }
});

test("var initializers preserve empty Script completion", () => {
  const result = compile("$262.evalScript('1; var x = 3;');");
  assert.deepEqual(result.diagnostics, []);
  const host = result.mir!.test262Host!.scripts![0]!;
  const evaluator = result.mir!.functions.find(
    (fn) => fn.id === host.functionId,
  )!;
  const writes = evaluator.blocks
    .flatMap((block) => block.operations)
    .filter((operation) => operation.kind === "write");
  // One write records `1`; the var initializer writes its global property
  // without updating the hidden Script completion binding.
  assert.equal(writes.length, 1);
});
