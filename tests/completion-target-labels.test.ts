import assert from "node:assert/strict";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";

/*
 * A completion target is entered only through a `resume-completion`
 * switch, which names every completion target emitted for the same body.
 * When every
 * `finally` of a body leaves abruptly, no such switch exists, so the
 * backend must not emit those targets either: their labels would have no
 * `goto`, which `-Werror` rejects as an unused label. These programs
 * compile without a toolchain; the native fixture runs them.
 */

function emit(source: string): string {
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "completion-target-labels.js" },
      { specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const emitted = cBackend.emit(compiled.mir).source;
    assertEveryLabelJumpedTo(emitted);
    if (specialization === "enabled") return emitted;
  }
  throw new Error("unreachable");
}

/** The body lines of every top-level C function, keyed by its name. */
function functionBodies(source: string): ReadonlyMap<string, string[]> {
  const bodies = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of source.split("\n")) {
    const header = /^static \w+ (\w+)\($/u.exec(line);
    if (header != null) {
      current = [];
      bodies.set(header[1]!, current);
    } else if (/^\S/u.test(line) && line !== "{" && line !== ") {") {
      if (line === "}") current = undefined;
    } else current?.push(line);
  }
  return bodies;
}

function assertEveryLabelJumpedTo(source: string): void {
  for (const [name, lines] of functionBodies(source)) {
    const text = lines.join("\n");
    for (const [, label] of text.matchAll(/^\s*(bb\d+):;$/gmu)) {
      assert.ok(
        text.includes(`goto ${label};`),
        `${name} labels ${label} without a goto`,
      );
    }
  }
}

/** The body of the one C function whose name starts with `prefix`. */
function body(source: string, prefix: string): string {
  const matches = [...functionBodies(source)].filter(([name]) =>
    name.startsWith(prefix),
  );
  assert.equal(matches.length, 1, prefix);
  return matches[0]![1].join("\n");
}

/** Block ids a body dispatches a saved completion to. */
function dispatchedTargets(text: string): readonly number[] {
  return [...text.matchAll(/^\s*case (\d+)u: goto bb\1;$/gmu)].map((match) =>
    Number(match[1]),
  );
}

test("a finally whose catch always returns drops the after block", () => {
  // The shrunk proper-tail-call property counterexample.
  const source = emit(`"use strict";
let steps = 0;
const hop0 = (n) => { steps += 1; try { steps += 0; } finally {
  try { throw 0; } catch (error0) {
    if (n === 0) { return "done 0"; }
    return (() => { try { throw 0; } catch (error) {
      return hop1.apply(null, [n - 1]); } finally { steps += 0; } })();
  } } };
const hop1 = (n) => { steps += 1; if (n === 0) { return "done 1"; }
  return hop0.apply(null, [n - 1]); };
console.log(hop0(0), steps);
`);
  const hop0 = body(source, "oseo_function_0");
  assert.doesNotMatch(hop0, /switch \(completion\[\d+u\]\.target\)/u);
  // The implicit `return undefined` after the outer try is gone.
  assert.doesNotMatch(hop0, /oseo_undefined\(\);\n\s*result = \(OseoResult\)/u);
});

test("break and continue through a returning finally drop targets", () => {
  // Each statement's after block is reached only as a completion target;
  // the loop's own exit stays reachable through its condition.
  for (const [statement, unreachable] of [
    ["l: { try { break l; } finally { return 1; } } return 2;", 2],
    [
      "for (let i = 0; i < 3; i++) " +
        "{ try { continue; } finally { return i; } } return 7;",
      undefined,
    ],
    [
      "l: { try { break l; } finally " +
        "{ try { throw 0; } catch (e) { return 1; } } } return 2;",
      2,
    ],
  ] as const) {
    const source = emit(
      `"use strict";\nfunction f() { ${statement} }\nconsole.log(f());\n`,
    );
    const text = body(source, "oseo_function_0");
    assert.deepEqual(dispatchedTargets(text), [], statement);
    if (unreachable != null) {
      assert.ok(!text.includes(`oseo_number(${unreachable}.0)`), statement);
    }
  }
});

test("a reachable finally still dispatches to every completion target", () => {
  const source = emit(`"use strict";
let log = [];
function f(n) {
  l: { try { if (n) break l; return 3; } finally { log.push(n); } }
  return 2;
}
console.log(f(0), f(1), log.join());
`);
  const text = body(source, "oseo_function_0");
  const targets = dispatchedTargets(text);
  // The break target, set before the finally's dispatch is reached, keeps
  // its block, its saved target, and its case.
  const breakTarget = /completion\[(\d+)u\]\.target = (\d+)u;/u.exec(text);
  assert.ok(breakTarget != null);
  const target = Number(breakTarget[2]);
  assert.ok(targets.includes(target), `${targets.join()} lacks ${target}`);
  assert.match(text, new RegExp(`^\\s*bb${target}:;$`, "mu"));
  assert.match(text, /oseo_number\(2\.0\)/u);
});

test("generator bodies keep completion targets across a resumption", () => {
  const kept = emit(`"use strict";
let log = [];
function* g() { try { yield 1; } finally { log.push("f"); } yield 2; }
console.log([...g()].join(), log.join());
`);
  const keptBody = body(kept, "oseo_generator_body_");
  assert.notDeepEqual(dispatchedTargets(keptBody), []);
  assert.match(keptBody, /oseo_number\(2\.0\)/u);

  const dropped = emit(`"use strict";
function* g() { try { yield 1; } finally {
  try { throw 0; } catch (e) { return 3; } } }
const it = g();
console.log(JSON.stringify(it.next()), JSON.stringify(it.next()));
`);
  const droppedBody = body(dropped, "oseo_generator_body_");
  assert.match(droppedBody, /oseo_number\(3\.0\)/u);
});

test("a default-parameter body does not take in its call-time entry", () => {
  // Non-simple parameters run in a call-time prologue that starts at bb0;
  // the generator, async, or async generator body starts after it. A
  // `return` through a `finally` saves the sentinel target 0, which no
  // dispatch names, so the body must not emit the prologue's blocks.
  for (const [prefix, declaration, use] of [
    [
      "generator",
      'function* g(x = 0) { try { yield x; } finally { log.push("f"); } }',
      "console.log([...g()].join(), log.join());",
    ],
    [
      "async",
      "async function f(a = 1) " +
        '{ try { return a; } finally { log.push("f"); } }',
      "f().then((v) => console.log(v, log.join()));",
    ],
    [
      "async generator",
      "async function* h(a = 2) " +
        '{ try { yield a; } finally { log.push("f"); } }',
      "h().next().then((r) => console.log(r.value, log.join()));",
    ],
  ] as const) {
    const source = emit(
      `"use strict";\nconst log = [];\n${declaration}\n${use}\n`,
    );
    const text = body(source, "oseo_generator_body_");
    assert.match(text, /completion\[\d+u\]\.target = 0u;/u, prefix);
    assert.ok(!dispatchedTargets(text).includes(0), prefix);
    assert.doesNotMatch(text, /^\s*bb0:;$/mu, prefix);
  }
});

test("a default-parameter generator keeps its nonzero targets", () => {
  const source = emit(`"use strict";
const log = [];
function* g(n = 1) {
  l: { try { if (n) break l; yield 1; } finally { log.push(n); } }
  yield 2;
}
console.log([...g()].join(), [...g(0)].join(), log.join());
`);
  const text = body(source, "oseo_generator_body_");
  const breakTarget = /completion\[(\d+)u\]\.target = ([1-9]\d*)u;/u.exec(text);
  assert.ok(breakTarget != null);
  const target = Number(breakTarget[2]);
  assert.ok(dispatchedTargets(text).includes(target), `${target}`);
  assert.match(text, new RegExp(`^\\s*bb${target}:;$`, "mu"));
  assert.match(text, /oseo_number\(2\.0\)/u);
  assert.doesNotMatch(text, /^\s*bb0:;$/mu);
});

/** One completion dispatch switch, capturing its case lines. */
const dispatchPattern = /switch \(completion\[\d+u\]\.target\) \{\n([^}]*)\}/gu;

/** Saved nonzero completion targets of a body, in ascending order. */
function savedTargets(text: string): readonly number[] {
  return [
    ...new Set(
      [...text.matchAll(/completion\[\d+u\]\.target = (\d+)u;/gu)]
        .map((match) => Number(match[1]))
        .filter((target) => target !== 0),
    ),
  ].toSorted((left, right) => left - right);
}

test("a dispatch names exactly the saved completion targets", () => {
  const source = emit(`"use strict";
let log = [];
function f(n) {
  log.push("a");
  a: { try { if (n === 1) break a; } finally { log.push("b"); } }
  log.push("c");
  for (let i = 0; i < 2; i++) {
    try { if (n === i) continue; log.push(i); } finally { log.push("d"); }
  }
  b: { try { if (n) break b; return 3; } finally { log.push("e"); } }
  return 2;
}
console.log(f(0), f(1), log.join());
`);
  // The body is outlined into helpers, so read every dispatch of the unit;
  // only `f` saves completion targets.
  const saved = savedTargets(source);
  assert.ok(saved.length >= 4, saved.join());
  const dispatches = [...source.matchAll(dispatchPattern)];
  assert.equal(dispatches.length, 3);
  for (const [, cases] of dispatches) {
    const named = [...cases!.matchAll(/^\s*case (\d+)u: /gmu)].map((match) =>
      Number(match[1]),
    );
    assert.deepEqual(named, saved);
  }
});

/** `count` guarded throws in the shape of test262's shift checks. */
function guardedThrows(count: number): string {
  return Array.from(
    { length: count },
    (_, index) =>
      `if (${index} >>> 0 !== ${index}) ` +
      `{ throw new Error("#${index}: " + (${index} >>> 0)); }`,
  ).join("\n");
}

test("dispatch without a saved target names no blocks", () => {
  // The shape of test262's S11.7.*_A4 shift checks: hundreds of guarded
  // throws, each with its own completion dispatch but no saved jump
  // destination. Naming every block of the body in every dispatch made
  // the C quadratic in the statement count.
  const sizes = [32, 64].map((count) => {
    const compiled = compileSource(
      babelFrontend,
      { source: guardedThrows(count), sourceId: "shift-shape.js" },
      { specialization: "enabled" },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const emitted = cBackend.emit(compiled.mir).source;
    const dispatches = [...emitted.matchAll(dispatchPattern)];
    assert.ok(dispatches.length >= count, `${dispatches.length}`);
    for (const [, cases] of dispatches) {
      assert.match(cases!, /^\s*default: abort\(\);\s*$/u);
    }
    return emitted.length;
  });
  // Doubling the statements at most doubles the C, plus a fixed part.
  assert.ok(sizes[1]! < 2.1 * sizes[0]!, sizes.join());
});
