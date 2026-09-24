import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  cBackend,
  emitScriptFragments,
} from "../packages/backend-c/src/index.ts";
import {
  compileBodyFragment,
  compileHarnessFragment,
  compileSource,
  printHir,
  printMir,
} from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";

const sources = ["base.js", "propertyHelper.js"].map((sourceId) => ({
  sourceId,
  source: readFileSync(
    new URL(`./test262/harness/${sourceId}`, import.meta.url),
    "utf8",
  ),
}));
const bodies = [
  ";",
  "let harmless = 1;",
  "var a = 1, b = 2; let c = 3; const d = 4;",
  "function one(a) { let b = a; return () => b; } one(1);",
  "class C { field = 1; method() { return this.field; } } new C();",
];

for (const strict of [false, true]) {
  for (const specialization of ["enabled", "disabled"] as const) {
    test(`harness bytes ignore body: ${strict}/${specialization}`, () => {
      const outputs: string[] = [];
      for (const source of bodies) {
        const prepared = compileHarnessFragment(
          babelFrontend,
          sources,
          strict,
          { specialization },
        );
        assert.equal(prepared.kind, "compiled");
        if (prepared.kind !== "compiled") return;
        const { harness } = prepared;
        const before = JSON.stringify(harness);
        const compiled = compileBodyFragment(babelFrontend, harness, {
          source,
          sourceId: "case.js",
        });
        assert.equal(compiled.kind, "compiled", JSON.stringify(compiled));
        if (compiled.kind !== "compiled") return;
        assert.equal(JSON.stringify(harness), before);
        assert.ok(
          compiled.body.hir.functions.every(
            (fn) => fn.id >= harness.nextFunctionId,
          ),
        );
        assert.ok(compiled.bindingCount >= harness.nextBindingId);
        outputs.push(
          JSON.stringify({
            splitC: emitScriptFragments(harness, compiled.body, {
              sourceId: "case.js",
              harnessLineOffset: 0,
              bodyLineOffset: 1,
            }).harness.source,
            hir: printHir(harness.hir),
            mir: printMir(harness.mir),
            metadata: harness,
            c: cBackend.emit(harness.mir).source,
          }),
        );
      }
      assert.equal(new Set(outputs).size, 1);
    });
  }
}

test("shadowing global declarations require fallback", () => {
  const prepared = compileHarnessFragment(babelFrontend, sources);
  assert.equal(prepared.kind, "compiled");
  if (prepared.kind !== "compiled") return;
  for (const source of [
    "let Object;",
    "const Object = {};",
    "class Object {}",
    "let {Object} = {};",
    "let [Object] = [];",
    "{ var Object; }",
    "function Test262Error() {}",
    "var assert;",
  ]) {
    const result = compileBodyFragment(babelFrontend, prepared.harness, {
      source,
      sourceId: "shadow.js",
    });
    assert.equal(result.kind, "fallback", source);
    if (result.kind === "fallback") assert.equal(result.reason, "shadowing");
  }
  for (const source of [
    "{ let Object; }",
    "function local() { let Object; }",
    "for (let Object = 0; Object < 1; Object++) {}",
    "const object = { Object: 1 };",
  ]) {
    assert.equal(
      compileBodyFragment(babelFrontend, prepared.harness, {
        source,
        sourceId: "local.js",
      }).kind,
      "compiled",
      source,
    );
  }
});

test("tracks unresolved typeof and console/timer lookups", () => {
  const result = compileHarnessFragment(babelFrontend, [
    {
      sourceId: "helpers.js",
      source: `function helper() {
      console.log(typeof absent);
      setTimeout(() => {}, 1);
    }`,
    },
  ]);
  assert.equal(result.kind, "compiled");
  if (result.kind !== "compiled") return;
  for (const name of ["absent", "console", "setTimeout"]) {
    assert.ok(result.harness.globalReferences.includes(name), name);
    assert.equal(
      compileBodyFragment(babelFrontend, result.harness, {
        source: `let ${name};`,
        sourceId: "case.js",
      }).kind,
      "fallback",
    );
  }
});

test("body imports property storage and allocates its own hidden cells", () => {
  const prepared = compileHarnessFragment(babelFrontend, [
    {
      sourceId: "helpers.js",
      source: "var helper = 1; Object.keys({});",
    },
  ]);
  assert.equal(prepared.kind, "compiled");
  if (prepared.kind !== "compiled") return;
  const result = compileBodyFragment(babelFrontend, prepared.harness, {
    source: "helper; delete helper; Object.keys({});",
    sourceId: "case.js",
  });
  assert.equal(result.kind, "compiled");
  if (result.kind !== "compiled") return;
  assert.match(printHir(result.body.hir), /delete .*\["helper"\]/);
  assert.notEqual(
    result.body.hir.intrinsicGlobalObjectBindingId,
    prepared.harness.hir.intrinsicGlobalObjectBindingId,
  );
  for (const unit of [prepared.harness, result.body]) {
    assert.ok(
      unit.launcherInitializers.some((index) => {
        const statement = unit.hir.body[index];
        return (
          statement?.kind === "const" &&
          statement.bindingId === unit.hir.intrinsicGlobalObjectBindingId
        );
      }),
    );
  }
});

test("fallback preserves the original whole-Script TDZ lowering", () => {
  const source = "let Object = {};";
  const prepared = compileHarnessFragment(babelFrontend, sources);
  assert.equal(prepared.kind, "compiled");
  if (prepared.kind !== "compiled") return;
  assert.equal(
    compileBodyFragment(babelFrontend, prepared.harness, {
      source,
      sourceId: "case.js",
    }).kind,
    "fallback",
  );
  const whole = compileSource(babelFrontend, {
    source: [...sources.map((item) => item.source), source].join("\n"),
    sourceId: "case.js",
  });
  assert.deepEqual(whole.diagnostics, []);
  assert.ok(whole.hir);
  assert.match(printHir(whole.hir), /Object/);
});

test("whole-Script output matches the main baseline", async () => {
  const { createHash } = await import("node:crypto");
  // SAFETY: This checked-in baseline is generated from fixture outputs.
  const baseline = JSON.parse(
    readFileSync(
      new URL("./harness-fragment-baseline.json", import.meta.url),
      "utf8",
    ),
  ) as readonly {
    readonly family: string;
    readonly name: string;
    readonly specialization: "enabled" | "disabled";
    readonly sha256: string;
  }[];
  const families = await Promise.all([
    import("./native/fixtures/bindings.ts"),
    import("./native/fixtures/functions.ts"),
    import("./native/fixtures/classes.ts"),
    import("./native/fixtures/objects.ts"),
    import("./native/fixtures/expressions.ts"),
    import("./native/fixtures/generators.ts"),
    import("./native/fixtures/async.ts"),
    import("./native/fixtures/global-object-record.ts"),
  ]);
  const fixtures = families.flatMap((family) => Object.values(family).flat());
  for (const entry of baseline) {
    const fixture = fixtures.find((value) => value.name === entry.name);
    assert.ok(fixture, entry.name);
    const result = compileSource(
      babelFrontend,
      {
        source: fixture.source,
        sourceId: `${entry.family}/${entry.name}.js`,
      },
      { specialization: entry.specialization },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.hir);
    assert.ok(result.mir);
    const bytes = JSON.stringify({
      hir: printHir(result.hir),
      mir: printMir(result.mir),
      c: cBackend.emit(result.mir),
    });
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      entry.sha256,
      `${entry.family}/${entry.name}/${entry.specialization}`,
    );
  }
});

test("unresolved with writes share the global object across fragments", () => {
  // A sloppy all-miss write reaches the realm global object's property,
  // which the launcher shares between the two fragments, so a later
  // typeof in either fragment observes it and neither needs fallback.
  const write = "with ({}) { absent = 1; }";
  const read = "console.log(typeof absent);";
  for (const [harnessSource, bodySource] of [
    [write, read],
    [read, write],
  ]) {
    assert.ok(harnessSource);
    assert.ok(bodySource);
    const whole = compileSource(babelFrontend, {
      source: `${harnessSource}\n${bodySource}`,
      sourceId: "case.js",
    });
    assert.deepEqual(whole.diagnostics, []);
    assert.ok(whole.mir);
    const prepared = compileHarnessFragment(babelFrontend, [
      {
        source: harnessSource,
        sourceId: "helpers.js",
      },
    ]);
    assert.equal(prepared.kind, "compiled");
    if (prepared.kind !== "compiled") return;
    const body = compileBodyFragment(babelFrontend, prepared.harness, {
      source: bodySource,
      sourceId: "case.js",
    });
    assert.equal(body.kind, "compiled");
  }
});

test("hidden with fallback writes require fallback in either fragment", () => {
  // A runtime-owned name still owns a hidden fallback cell, which one
  // fragment's write would initialize without the other observing it.
  const write = "with ({}) { console = 1; }";
  const read = "var observed = 1;";
  for (const [harnessSource, bodySource] of [
    [write, read],
    [read, write],
  ]) {
    assert.ok(harnessSource);
    assert.ok(bodySource);
    const whole = compileSource(babelFrontend, {
      source: `${harnessSource}\n${bodySource}`,
      sourceId: "case.js",
    });
    assert.deepEqual(whole.diagnostics, []);
    const prepared = compileHarnessFragment(babelFrontend, [
      {
        source: harnessSource,
        sourceId: "helpers.js",
      },
    ]);
    if (harnessSource === write) {
      assert.equal(prepared.kind, "fallback");
    } else {
      assert.equal(prepared.kind, "compiled");
      if (prepared.kind !== "compiled") return;
      const body = compileBodyFragment(babelFrontend, prepared.harness, {
        source: bodySource,
        sourceId: "case.js",
      });
      assert.equal(body.kind, "fallback");
      if (body.kind === "fallback") {
        assert.equal(body.reason, "global-effects");
        assert.deepEqual(body.names, ["console"]);
      }
    }
  }
});

test("a body directive cannot change a sloppy harness's strictness", () => {
  const harnessSource = "var helper = 1;";
  const bodySource = '"use strict"; function receiver() { return this; }';
  const prepared = compileHarnessFragment(babelFrontend, [
    {
      source: harnessSource,
      sourceId: "helpers.js",
    },
  ]);
  assert.equal(prepared.kind, "compiled");
  if (prepared.kind !== "compiled") return;
  const body = compileBodyFragment(babelFrontend, prepared.harness, {
    source: bodySource,
    sourceId: "case.js",
  });
  assert.equal(body.kind, "fallback");
  if (body.kind === "fallback") assert.equal(body.reason, "strictness");
  const whole = compileSource(babelFrontend, {
    source: `${harnessSource}\n${bodySource}`,
    sourceId: "case.js",
  });
  assert.deepEqual(whole.diagnostics, []);
  assert.equal(whole.hir?.functions[0]?.strict, false);
});

test("lexical imports retain binding IDs and mutability", () => {
  const harnessSource = "const limit = 1; let count = 0; class Shape {}";
  const bodySource = "Shape; count = limit; limit = 2;";
  const prepared = compileHarnessFragment(babelFrontend, [
    {
      source: harnessSource,
      sourceId: "helpers.js",
    },
  ]);
  assert.equal(prepared.kind, "compiled");
  if (prepared.kind !== "compiled") return;
  const { harness } = prepared;
  const result = compileBodyFragment(babelFrontend, harness, {
    source: bodySource,
    sourceId: "case.js",
  });
  assert.equal(result.kind, "compiled");
  if (result.kind !== "compiled") return;
  const [read, mutableWrite, constWrite] = result.body.hir.body;
  assert.equal(read?.kind, "expression");
  assert.equal(mutableWrite?.kind, "expression");
  assert.equal(constWrite?.kind, "expression");
  if (
    read?.kind !== "expression" ||
    mutableWrite?.kind !== "expression" ||
    constWrite?.kind !== "expression"
  )
    return;
  assert.equal(read.expression.kind, "binding");
  assert.equal(mutableWrite.expression.kind, "binding-set");
  assert.equal(constWrite.expression.kind, "binding-set");
  if (
    read.expression.kind !== "binding" ||
    mutableWrite.expression.kind !== "binding-set" ||
    constWrite.expression.kind !== "binding-set"
  )
    return;
  assert.equal(mutableWrite.expression.value.kind, "binding");
  if (mutableWrite.expression.value.kind !== "binding") return;
  for (const expression of [
    read.expression,
    mutableWrite.expression,
    mutableWrite.expression.value,
    constWrite.expression,
  ]) {
    const exported = harness.bindings.find((b) => b.name === expression.name);
    assert.ok(exported);
    assert.equal(expression.bindingId, exported.id);
    assert.ok(expression.bindingId < harness.nextBindingId);
  }
  assert.equal(mutableWrite.expression.mutable, true);
  assert.equal(constWrite.expression.mutable, false);
  const whole = compileSource(babelFrontend, {
    source: `${harnessSource}\n${bodySource}`,
    sourceId: "case.js",
  });
  assert.deepEqual(whole.diagnostics, []);
  const wholeWrite = whole.hir?.body.at(-1);
  assert.equal(wholeWrite?.kind, "expression");
  if (wholeWrite?.kind !== "expression") return;
  assert.equal(wholeWrite.expression.kind, "binding-set");
  if (wholeWrite.expression.kind !== "binding-set") return;
  assert.equal(constWrite.expression.mutable, wholeWrite.expression.mutable);
});

test("launcher global property order matches whole Script", () => {
  const source = "var h = 1; function hf() {}";
  const bodySource = "function c() {} var b = 2;";
  const prepared = compileHarnessFragment(babelFrontend, [
    { sourceId: "h.js", source },
  ]);
  assert.equal(prepared.kind, "compiled");
  if (prepared.kind !== "compiled") return;
  const compiled = compileBodyFragment(babelFrontend, prepared.harness, {
    sourceId: "case.js",
    source: bodySource,
  });
  assert.equal(compiled.kind, "compiled");
  if (compiled.kind !== "compiled") return;
  const whole = compileSource(babelFrontend, {
    sourceId: "case.js",
    source: source + "\n" + bodySource,
  });
  assert.ok(whole.mir);
  const c = emitScriptFragments(prepared.harness, compiled.body, {
    sourceId: "case.js",
    harnessLineOffset: 0,
    bodyLineOffset: 1,
  }).launcher.source;
  const names = [
    ...c.matchAll(/global_object_units_\d+\[\] = \{([\d, ]+)\};/gu),
  ].map((match) => String.fromCharCode(...match[1]!.split(",").map(Number)));
  assert.deepEqual(
    names,
    whole.mir.globalObjectBindings.map((entry) => entry.name),
  );
  assert.deepEqual(names, ["hf", "c", "h", "b"]);
});
