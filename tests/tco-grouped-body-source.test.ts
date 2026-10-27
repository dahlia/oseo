import assert from "node:assert/strict";
import test from "node:test";

import {
  cBackend,
  emitScriptFragments,
} from "../packages/backend-c/src/index.ts";
import {
  compileBodyFragment,
  compileHarnessFragment,
  compileSource,
} from "../packages/compiler/src/index.ts";
import type { MirFunction } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import {
  compileInterop,
  continuationBudget,
  interopCases,
  interopGuard,
} from "./helpers/tco-generator-interop.ts";
import { runtimeFrameContract } from "./proper-tail-call-resources.ts";
import {
  balancedInteropBackend,
  mapNativeSources,
} from "./helpers/balanced-backend.ts";
import {
  assertTailOwnerExit,
  includeSelectedSources,
} from "./helpers/tail-owner-exit.ts";

/** Large enough for real include-wrapper units, without a native toolchain. */
const padding = Array.from(
  { length: 600 },
  (_, index) => `value = value + ${index};`,
).join("\n");

/** A complete generated function, including its iterative owner exit. */
function body(source: string, suffix: string): string {
  const header = new RegExp(`OseoResult (\\w*${suffix})\\(\n`, "u");
  const match = header.exec(source);
  assert.ok(match, suffix);
  const end = source.indexOf("\n}\n", match.index);
  assert.ok(end > match.index);
  return source.slice(match.index, end);
}

function tailOperations(fn: MirFunction): number {
  return fn.blocks
    .flatMap((block) => block.operations)
    .filter((operation) => operation.tail === true).length;
}

for (const specialization of ["disabled", "enabled"] as const) {
  for (const [name, result, abi] of [
    ["dynamic", "target(value)", "oseo_tail_call"],
    ["host", "clearTimeout(value, target(value))", "oseo_tail_host_call"],
  ] as const) {
    test(`Main chunk tail owner: ${name}/${specialization}`, () => {
      const compiled = compileSource(
        babelFrontend,
        {
          sourceId: "packed-tail.js",
          source: `"use strict";
function target(value) { return value; }
function wide(value) {
  try { value = value + 1; } finally { value = value + 2; }
${padding}
  return ${result};
}
wide(0);`,
        },
        { specialization },
      );
      assert.deepEqual(compiled.diagnostics, []);
      assert.ok(compiled.mir);
      const wide = compiled.mir.functions.find((fn) => fn.name === "wide");
      assert.ok(wide);
      assert.equal(tailOperations(wide), 1);
      const emitted = cBackend.emit(compiled.mir);
      const units = emitted.compilationUnits;
      assert.ok(units != null && units.length > 1);
      assert.match(
        emitted.source,
        /_chunks\[continuation\]\(context, &body\)/u,
      );
      const completion = /OseoCompletionRecord completion\[(\d+)u\]/u.exec(
        emitted.source,
      );
      assert.ok(completion && Number(completion[1]) > 0);
      for (const match of emitted.source.matchAll(/completion\[(\d+)u\]/gu)) {
        // A declaration reserves the extent; accesses stay inside it.
        if (match.index === completion.index + "OseoCompletionRecord ".length)
          continue;
        assert.ok(Number(match[1]) < Number(completion[1]));
      }
      const tail = new RegExp(
        String.raw`result = ${abi}\([^;]+;\n\s*` +
          String.raw`roots\[\d+\] = result\.value;\n\s*` +
          String.raw`if \(result\.status != OSEO_STATUS_NORMAL\) ` +
          String.raw`(?:goto entry_\d+;|return \d+u;)`,
        "u",
      );
      assert.match(emitted.source, tail);
      assertTailOwnerExit(emitted);
      const corrupt = mapNativeSources(emitted, (source) =>
        source.replace(
          "    return body.result;",
          "    body.result.status = OSEO_STATUS_NORMAL;\n" +
            "    return body.result;",
        ),
      );
      assert.throws(
        () => assertTailOwnerExit(corrupt),
        "the proof rejects changing the recorded status before return",
      );
      const owner = body(emitted.source, `oseo_function_${wide.id}`);
      const dispatch = owner.indexOf("while (continuation != SIZE_MAX)");
      const release = owner.indexOf("oseo_roots_release(context, &frame);");
      const returned = owner.indexOf("return body.result;");
      assert.ok(dispatch >= 0 && release > dispatch && returned > release);
      assert.doesNotMatch(owner, /oseo_call_complete/u);
      // An explicit direct-call MIR caller must drain only after releasing
      // its callee's logical frame and call charges, including split units.
      const direct = {
        ...compiled.mir,
        script: {
          ...compiled.mir.script,
          blocks: compiled.mir.script.blocks.map((block) => ({
            ...block,
            operations: block.operations.map((operation) =>
              operation.kind === "call" && operation.target?.kind === "dynamic"
                ? {
                    ...operation,
                    arguments: operation.arguments.slice(2),
                    target: { kind: "function" as const, functionId: wide.id },
                  }
                : operation,
            ),
          })),
        },
      };
      const directSource = cBackend.emit(direct).source;
      assert.match(
        directSource,
        new RegExp(
          String.raw`oseo_frame_leave\(context, ` +
            String.raw`OSEO_CALLABLE_FRAME_COST\(\d+u\)\);\n\s*\}\n\s*` +
            String.raw`oseo_call_leave\(context\);\n\s*` +
            String.raw`result = oseo_call_complete\(context, result\);`,
          "u",
        ),
      );
      const balanced = balancedInteropBackend.emit(compiled.mir);
      const teardown = "oseo_context_destroy(&context);";
      let tailOwners = 0;
      let teardownOwners = 0;
      const selected = includeSelectedSources(emitted);
      const balancedSelected = includeSelectedSources(balanced);
      for (const [index, unit] of units.entries()) {
        const actual = selected[index]!;
        assert.ok(
          unit.source.startsWith(`#define OSEO_C_BODY_UNIT ${index}\n`),
        );
        assert.equal(
          unit.source,
          `#define OSEO_C_BODY_UNIT ${index}\n` +
            `#include "${emitted.sourceName}"\n`,
        );
        assert.ok(unit.sourceName.endsWith(`-unit-${index}.c`));
        if (tail.test(actual)) tailOwners++;
        if (actual.includes(teardown)) {
          teardownOwners++;
          assert.match(
            balancedSelected[index]!,
            /context\.active_frame_slots != 0u/u,
          );
        } else {
          assert.equal(balancedSelected[index], actual);
        }
      }
      assert.equal(
        tailOwners,
        1,
        "one include-selected unit owns the tail step",
      );
      assert.equal(
        teardownOwners,
        1,
        "one include-selected unit owns main teardown",
      );
    });
  }

  test(`a Main chunk continuation retains its frame: ${specialization}`, () => {
    const compiled = compileSource(
      babelFrontend,
      {
        sourceId: "packed-tail-continuation.js",
        source: `"use strict";
function drain(value) { return clearTimeout(value); }
function* wide(value = 0) {
  try {
${padding}
    yield value;
    return drain(value);
  } finally { value = value + 1; }
}
const iterator = wide(); iterator.next(); iterator.next();`,
      },
      { specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir);
    const wide = compiled.mir.functions.find((fn) => fn.name === "wide");
    const drain = compiled.mir.functions.find((fn) => fn.name === "drain");
    assert.ok(wide && drain);
    assert.equal(tailOperations(wide), 0);
    assert.equal(tailOperations(drain), 1);
    const emitted = cBackend.emit(compiled.mir);
    assert.ok(emitted.compilationUnits != null);
    const owner = body(emitted.source, `oseo_generator_body_${wide.id}`);
    assert.match(owner, /while \(continuation != SIZE_MAX\)/u);
    assert.match(owner, /\.frame = NULL/u);
    assert.doesNotMatch(owner, /oseo_roots_release/u);
    assert.match(emitted.source, /oseo_generator_completions\(generator\)/u);
    assert.match(emitted.source, /oseo_generator_suspend\(context/u);
    assert.match(emitted.source, /OSEO_CALLABLE_FRAME_COST\(\d+u\)/u);
  });
}

test("include-selected static identity keeps its owner and coordinates", () => {
  const sourceName = "original-source.c";
  const emitted = {
    sourceName,
    source: [
      "#if FRAME_COST <= OSEO_MAX_ACTIVE_FRAME_SLOTS",
      "#if !defined(OSEO_C_BODY_UNIT) || OSEO_C_BODY_UNIT == 1",
      "const uint16_t shared_text[] = {17, 23};",
      "#else",
      "extern const uint16_t shared_text[];",
      "#endif",
      "#endif",
    ].join("\n"),
    compilationUnits: [0, 1, 2].map((unit) => ({
      sourceName: `original-source-unit-${unit}.c`,
      source: `#define OSEO_C_BODY_UNIT ${unit}\n#include "${sourceName}"\n`,
    })),
  };
  const selected = includeSelectedSources(emitted);
  assert.equal(selected.length, 3);
  assert.equal(
    selected.filter((source) => source.includes("= {17, 23}")).length,
    1,
    "one selected definition owns static storage",
  );
  assert.ok(selected[1]!.includes("= {17, 23}"));
  for (const index of [0, 2]) {
    assert.match(selected[index]!, /extern const uint16_t shared_text/u);
    assert.doesNotMatch(selected[index]!, /= \{17, 23\}/u);
  }
  for (const source of selected) {
    assert.ok(source.startsWith("#if FRAME_COST <="));
    assert.ok(source.endsWith("#endif"));
  }
  const wrongInclude = {
    ...emitted,
    compilationUnits: emitted.compilationUnits.map((unit) => ({
      sourceName: unit.sourceName,
      source: unit.source.replace(sourceName, "another-source.c"),
    })),
  };
  assert.throws(() => includeSelectedSources(wrongInclude));
});

// Exercise the original four programs and both charge contracts purely.
// The mixed preparation file also registers reference subprocess callbacks;
// it is retained whole, but is not executed by this pure source gate.
const contracts = [
  runtimeFrameContract(),
  runtimeFrameContract([
    "-DOSEO_CALLABLE_FRAME_MULTIPLIER=8u",
    "-DOSEO_CALLABLE_FRAME_BASE_SLOTS=32u",
  ]),
];
const interopFixtures = [
  ...interopCases,
  ...contracts.map((contract) => interopGuard(contract, "enabled")),
];
for (const fixture of interopFixtures) {
  test(`Main include-unit interop source: ${fixture.name}`, () => {
    for (const specialization of ["disabled", "enabled"] as const) {
      const mir = compileInterop(fixture, specialization);
      const emitted = cBackend.emit(mir);
      const balanced = balancedInteropBackend.emit(mir);
      const teardown = "oseo_context_destroy(&context);";
      assert.equal(
        includeSelectedSources(emitted).filter((source) =>
          source.includes(teardown),
        ).length,
        1,
      );
      assert.equal(
        includeSelectedSources(balanced).filter((source) =>
          source.includes("context.active_frame_slots != 0u"),
        ).length,
        1,
      );
      assert.match(emitted.source, /OSEO_TAIL_HOST_CLEAR_TIMEOUT/u);
      for (const fn of mir.functions.filter((value) => value.generator)) {
        assert.ok(
          fn.blocks.every((block) =>
            block.operations.every((operation) => operation.tail !== true),
          ),
        );
      }
      if (fixture.name.startsWith("wide-")) {
        for (const contract of contracts) continuationBudget(mir, contract);
      }
      const harness = compileHarnessFragment(
        babelFrontend,
        [{ sourceId: "strict.js", source: '"use strict";' }],
        true,
        { specialization, test262Host: true },
      );
      assert.equal(harness.kind, "compiled");
      if (harness.kind !== "compiled") return;
      const compiledBody = compileBodyFragment(babelFrontend, harness.harness, {
        source: fixture.source,
        sourceId: `${fixture.name}.js`,
      });
      assert.equal(compiledBody.kind, "compiled");
      if (compiledBody.kind !== "compiled") return;
      const fragments = emitScriptFragments(
        harness.harness,
        compiledBody.body,
        {
          sourceId: `${fixture.name}.js`,
          harnessLineOffset: 0,
          bodyLineOffset: 1,
        },
      );
      assert.match(fragments.body.source, /OSEO_TAIL_HOST_CLEAR_TIMEOUT/u);
      assert.match(fragments.body.source, /oseo_case_resume/u);
      if (fixture.name.startsWith("wide-")) {
        const charge = continuationBudget(
          compiledBody.body.mir,
          contracts[0]!,
        ).logical;
        const resume = fragments.body.source.slice(
          fragments.body.source.indexOf("OseoResult oseo_case_resume("),
        );
        assert.match(
          resume,
          new RegExp(
            "oseo_frame_enter\\(context, OSEO_CALLABLE_FRAME_COST\\(" +
              `${charge}u\\)\\)[\\s\\S]*?` +
              "oseo_frame_leave\\(context, OSEO_CALLABLE_FRAME_COST\\(" +
              `${charge}u\\)\\)`,
            "u",
          ),
        );
      }
    }
  });
}
