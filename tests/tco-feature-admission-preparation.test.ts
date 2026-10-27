import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parse } from "@babel/parser";

import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { assembleTest262Source } from "../tools/test262.ts";
import {
  loadTcoAdmission,
  tcoFeature,
} from "./helpers/tco-feature-admission.ts";

const admission = await loadTcoAdmission();

test("TCO admission retains the two original strict reviewed subjects", () => {
  assert.equal(admission.subjects.length, 2);
  assert.equal(
    admission.subset.supportedFeatures.filter((name) => name === tcoFeature)
      .length,
    1,
  );
  for (const subject of admission.subjects) {
    assert.deepEqual(subject.parsed.flags, ["onlyStrict"]);
    assert.deepEqual(subject.parsed.case.features, [tcoFeature]);
    assert.deepEqual(subject.parsed.case.includes, ["tcoHelper.js"]);
    assert.deepEqual(subject.parsed.case.strictness, ["strict"]);
    assert.equal(subject.parsed.case.expectedFailurePhase, undefined);
    assert.deepEqual(subject.entry.dependencies, ["expression-operators"]);
  }
});

test("reviewed tcoHelper retains the original 100000-depth binding", () => {
  for (const source of [admission.upstreamHelper, admission.reviewedHelper]) {
    const statements = parse(source).program.body;
    assert.equal(statements.length, 1);
    const declaration = statements[0];
    assert.ok(declaration?.type === "VariableDeclaration");
    assert.equal(declaration.kind, "var");
    assert.equal(declaration.declarations.length, 1);
    const binding = declaration.declarations[0];
    assert.ok(binding?.id.type === "Identifier");
    assert.equal(binding.id.name, "$MAX_ITERATIONS");
    assert.ok(binding.init?.type === "NumericLiteral");
    assert.equal(binding.init.value, 100_000);
    assert.equal(runInNewContext(`${source}\n$MAX_ITERATIONS`), 100_000);
  }
});

for (const subject of admission.subjects) {
  for (const specialization of ["disabled", "enabled"] as const) {
    test(`${subject.entry.path}: ${specialization} emits`, () => {
      const source = assembleTest262Source(
        subject.source,
        "strict",
        subject.parsed.case,
        admission.harnesses,
        false,
      );
      assert.ok(source.endsWith(`${subject.source}\n`));
      assert.ok(source.includes(admission.reviewedHelper));
      const compiled = compileSource(
        babelFrontend,
        { source, sourceId: subject.entry.path },
        { specialization },
      );
      assert.deepEqual(compiled.diagnostics, []);
      assert.ok(compiled.mir != null);
      const recursive = compiled.mir.functions.find((fn) => fn.name === "f");
      assert.ok(recursive);
      const tails = recursive.blocks.flatMap((block) =>
        block.operations.filter((op) => op.kind === "call" && op.tail === true),
      );
      assert.equal(tails.length, 1);
      assert.match(cBackend.emit(compiled.mir).source, /oseo_tail_call\(/u);
    });
  }
}
