import assert from "node:assert/strict";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { materializedBodySource } from "./materialized-body-cases.ts";

for (const specialization of ["disabled", "enabled"] as const) {
  test(`large suspended body uses packed units: ${specialization}`, () => {
    const compiled = compileSource(
      babelFrontend,
      { source: materializedBodySource, sourceId: "materialized-body.ts" },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const emitted = cBackend.emit(compiled.mir);
    const units = emitted.compilationUnits;
    assert.ok(units != null && units.length >= 3);
    const definitions = new Set<string>();
    const generatorUnits = new Set<number>();
    for (const [unit, physical] of units.entries()) {
      for (const match of physical.source.matchAll(
        /^size_t (\w+_oseo_(?:body|generator_body)_\w+_\d+)\(\n/gmu,
      )) {
        assert.ok(!definitions.has(match[1]!));
        definitions.add(match[1]!);
        if (match[1]!.includes("_generator_body_")) generatorUnits.add(unit);
      }
    }
    assert.ok(generatorUnits.size >= 2, "the suspended body spans C units");
    const logicalEntries = [
      ...emitted.source.matchAll(/^    \w+_oseo_\w+_\d+,$/gmu),
    ].length;
    assert.ok(logicalEntries > definitions.size);
    assert.match(emitted.source, /switch \(body->entry_index\)/u);
    assert.match(emitted.source, /oseo_generator_completions\(generator\)/u);
    assert.match(emitted.source, /oseo_generator_suspend\(context/u);
    assert.match(emitted.source, /OSEO_MAX_ACTIVE_FRAME_SLOTS/u);
  });
}
