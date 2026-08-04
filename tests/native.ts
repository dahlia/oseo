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
import { asyncFixtures } from "./native/fixtures/async.ts";
import { asyncGeneratorFixtures } from "./native/fixtures/async-generators.ts";
import { asyncIterationFixtures } from "./native/fixtures/async-iteration.ts";
import { bindingFixtures } from "./native/fixtures/bindings.ts";
import { bigintFixtures } from "./native/fixtures/bigint.ts";
import { classFixtures } from "./native/fixtures/classes.ts";
import { expressionFixtures } from "./native/fixtures/expressions.ts";
import { functionFixtures } from "./native/fixtures/functions.ts";
import { generatorFixtures } from "./native/fixtures/generators.ts";
import { objectFixtures } from "./native/fixtures/objects.ts";
import { receiverFixtures } from "./native/fixtures/receivers.ts";

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

const referencePrelude = `
const oseoReferenceConsole = console;
Object.defineProperty(globalThis, "console", {
  value: {
    log(...values: unknown[]) {
      oseoReferenceConsole.log(values.map(String).join(" "));
    },
  },
});
`;

const fixtures: readonly Fixture[] = [
  ...functionFixtures,
  ...objectFixtures,
  ...classFixtures,
  ...bindingFixtures,
  ...bigintFixtures,
  ...expressionFixtures,
  ...receiverFixtures,
  ...generatorFixtures,
  ...asyncFixtures,
  ...asyncIterationFixtures,
  ...asyncGeneratorFixtures,
];

const descriptorMapCompilation = compileSource(babelFrontend, {
  source: "Object.create(null, { item: { value: 3 } });",
  sourceId: "object-create-descriptor-map.ts",
});
assert.equal(descriptorMapCompilation.mir, undefined);
assert.match(
  descriptorMapCompilation.diagnostics[0]?.message ?? "",
  /descriptor maps are unsupported/u,
);

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
    fixture.name === "closures-and-methods" ||
    fixture.name === "catchable-type-errors" ||
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
          if (fixture.name === "delete-strict") {
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
            assert.equal(native.counters.allocations, 5);
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
