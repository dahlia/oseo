import assert from "node:assert/strict";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";

function emit(source: string): string {
  const compiled = compileSource(babelFrontend, {
    source,
    sourceId: "tail-call-emission.js",
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  return cBackend.emit(compiled.mir).source;
}

/**
 * Matches consecutive generated C statements. Each statement is literal
 * text in which `#` stands for one decimal number, and statements may be
 * separated by any indentation.
 */
function statements(...lines: readonly string[]): RegExp {
  return new RegExp(
    lines
      .map((line) =>
        line
          .split("#")
          .map((part) => part.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&"))
          .join(String.raw`\d+`),
      )
      .join(String.raw`\n\s*`),
    "u",
  );
}

const valueStore = "roots[#] = result.value;";
const abruptExit = "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;";

test("a strict tail call records its call and leaves the frame", () => {
  const source = emit(
    '"use strict";\nvar g = function () {};\n' +
      "function f(n) { return g(n, n); }\nf(1);\n",
  );
  assert.match(
    source,
    statements(
      "result = oseo_tail_call(context, roots[#], roots[#], 2u, &roots[#]);",
      valueStore,
      abruptExit,
    ),
  );
});

test("a non-strict return keeps the ordinary call", () => {
  const source = emit(
    "var g = function () {};\nfunction f(n) { return g(n); }\nf(1);\n",
  );
  assert.doesNotMatch(source, /oseo_tail_call/u);
});

test("a derived constructor passes its this binding cell", () => {
  const source = emit(
    '"use strict";\nvar g = function () {};\nclass B {}\n' +
      "class D extends B { constructor() { super(); return g(); } }\n" +
      "new D();\n",
  );
  assert.match(
    source,
    statements(
      "result = oseo_environment_get(context, roots[#], #u);",
      abruptExit,
      "result = oseo_tail_call_derived(context, roots[#], roots[#], 0u, " +
        "NULL, result.value);",
      valueStore,
      abruptExit,
    ),
  );
  // The tail call's block returns without the derived-return check,
  // which the trampoline applies to the chain's value instead.
  const tail = source.indexOf("oseo_tail_call_derived(");
  const constructorBody = source.slice(tail, source.indexOf("abrupt:", tail));
  assert.doesNotMatch(constructorBody, /oseo_derived_constructor_result/u);
});

test("host intrinsics use the host tail call ABI", () => {
  const source = emit(
    '"use strict";\nvar g = function () {};\n' +
      "function f(x) { return console.log(x); }\n" +
      "function s(x) { return setTimeout(g, x); }\n" +
      "function c(x) { return clearTimeout(x); }\nf(1); s(0); c(0);\n",
  );
  assert.match(
    source,
    statements(
      "result = oseo_tail_host_call(context, OSEO_TAIL_HOST_CONSOLE_LOG, " +
        "1u, &roots[#]);",
    ),
  );
  assert.match(
    source,
    statements(
      "result = oseo_tail_host_call(context, OSEO_TAIL_HOST_SET_TIMEOUT, " +
        "2u, &roots[#]);",
    ),
  );
  assert.match(
    source,
    statements(
      "result = oseo_tail_host_call(context, OSEO_TAIL_HOST_CLEAR_TIMEOUT, " +
        "1u, &roots[#]);",
      valueStore,
      abruptExit,
    ),
  );
  assert.doesNotMatch(source, /result = oseo_clear_timeout\(context, /u);
});

test("clearTimeout outside tail position keeps its direct ABI", () => {
  const source = emit(
    '"use strict";\nfunction f(x) { clearTimeout(x); return 1; }\n' +
      "function g(x) { try { return clearTimeout(x); } finally {} }\n" +
      "f(0); g(0); clearTimeout();\n",
  );
  assert.match(source, /result = oseo_clear_timeout\(context, /u);
  assert.doesNotMatch(source, /oseo_tail_host_call\(/u);
});

test("clearTimeout records empty, spread, and derived tail calls", () => {
  const source = emit(
    '"use strict";\nfunction f() { return clearTimeout(); }\n' +
      "function g(xs) { return clearTimeout(...xs); }\n" +
      "class B {}\nclass D extends B { constructor(x) {\n" +
      "super(); return clearTimeout(x); } }\nf(); g([]); new D(0);\n",
  );
  assert.match(
    source,
    statements(
      "result = oseo_tail_host_call(context, OSEO_TAIL_HOST_CLEAR_TIMEOUT, " +
        "0u, NULL);",
      valueStore,
      abruptExit,
    ),
  );
  assert.match(
    source,
    statements(
      "result = oseo_tail_host_call(context, OSEO_TAIL_HOST_CLEAR_TIMEOUT, " +
        "argument_count_#, argument_values_#);",
    ),
  );
  assert.match(
    source,
    statements(
      "result = oseo_tail_host_call_derived(context, " +
        "OSEO_TAIL_HOST_CLEAR_TIMEOUT, 1u, &roots[#], result.value);",
      valueStore,
      abruptExit,
    ),
  );
});

test("an outlined body leaves a tail call through its owner", () => {
  // Enough statements to exceed one outlined helper's text budget.
  const body = Array.from(
    { length: 600 },
    (_, index) => `  x = x + ${index};`,
  ).join("\n");
  const source = emit(
    '"use strict";\nvar g = function () {};\n' +
      `function f(x) {\n${body}\n  return g(x);\n}\nf(1);\n`,
  );
  assert.match(source, /\} generated_c_oseo_body_\d+_state;/u);
  // The status check returns the abrupt continuation index from the
  // helper, and the owner releases the frame and returns the result.
  assert.match(
    source,
    statements(
      "result = oseo_tail_call(context, roots[#], roots[#], 1u, &roots[#]);",
      valueStore,
      "if (result.status != OSEO_STATUS_NORMAL) return #u;",
    ),
  );
});
