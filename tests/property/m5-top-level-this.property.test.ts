/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import { runNativeCli } from "../../packages/cli/src/index.ts";
import {
  compileSource,
  describeTarget,
  printMir,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import { zigToolchain } from "../../packages/toolchain-zig/src/index.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/**
 * One position that reads `this`. Every entry names the environment the
 * read resolves through rather than the value it produces, so the oracle
 * stays independent of the compiler's lowering.
 */
type ThisPosition =
  | "after-await"
  | "async-function"
  | "class-field"
  | "class-method"
  | "class-static"
  | "detached-class-method"
  | "detached-method"
  | "function"
  | "function-arrow"
  | "generator"
  | "object-method"
  | "own-strict-function"
  | "parameter-default"
  | "top-level"
  | "top-level-arrow";

/**
 * One top-level declaration whose relationship to the global object the
 * generated case observes. A Script's `var` and function declarations
 * become global-object properties that share storage with the binding; a
 * lexical declaration stays in the global declarative record, and module
 * code contributes nothing at all.
 */
type BindingKind = "function" | "lexical" | "none" | "var";

interface ThisCase {
  /** The top-level declaration observed through the captured receiver. */
  readonly binding: BindingKind;
  /** Add a false number return hint and a guarded addition that misses. */
  readonly hinted: boolean;
  readonly position: ThisPosition;
  readonly sourceKind: "module" | "script";
  /** A Script `"use strict"` directive; module code is always strict. */
  readonly strictDirective: boolean;
}

/** The identity an admitted position observes, named by its binding. */
type Expected = "captured" | "class" | "holder" | "instance" | "undefined";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const positions: readonly ThisPosition[] = [
  "after-await",
  "async-function",
  "class-field",
  "class-method",
  "class-static",
  "detached-class-method",
  "detached-method",
  "function",
  "function-arrow",
  "generator",
  "object-method",
  "own-strict-function",
  "parameter-default",
  "top-level",
  "top-level-arrow",
];

const bindingKinds: readonly BindingKind[] = [
  "function",
  "lexical",
  "none",
  "var",
];

const caseArbitrary: fc.Arbitrary<ThisCase> = fc
  .record({
    binding: fc.constantFrom(...bindingKinds),
    hinted: fc.boolean(),
    position: fc.constantFrom(...positions),
    sourceKind: fc.constantFrom("module" as const, "script" as const),
    strictDirective: fc.boolean(),
  })
  .map((value): ThisCase => {
    // Top-level await is module-only syntax, so the generated case moves
    // to the module kind instead of being filtered away. Module code is
    // already strict, so it never carries a Script directive.
    const sourceKind =
      value.position === "after-await" ? ("module" as const) : value.sourceKind;
    // The only host position whose this binding is a Global Environment
    // Record's is indirect `eval`, and a strict indirect `eval` gets its
    // own variable environment instead of adding to the global object.
    // A Script directive is therefore generated only beside a
    // declaration the global object never binds; the strict Script's own
    // global bindings are pinned by a fixed native scenario instead.
    const globalDeclaration =
      sourceKind === "script" &&
      (value.binding === "function" || value.binding === "var");
    return {
      binding: value.binding,
      hinted: value.hinted,
      position: value.position,
      sourceKind,
      strictDirective:
        sourceKind === "module" || globalDeclaration
          ? false
          : value.strictDirective,
    };
  });

/** Whether code written directly at the source top level is strict. */
function ambientStrict(testCase: ThisCase): boolean {
  return testCase.sourceKind === "module" || testCase.strictDirective;
}

/**
 * The identity ECMA-262 requires at the generated position. A function
 * whose [[ThisMode]] is strict keeps an undefined receiver, and every
 * other ordinary call with no receiver resolves the same value the top
 * level captured.
 */
function expectedIdentity(testCase: ThisCase): Expected {
  if (testCase.position === "object-method") return "holder";
  if (
    testCase.position === "class-field" ||
    testCase.position === "class-method"
  ) {
    return "instance";
  }
  if (testCase.position === "class-static") return "class";
  if (
    testCase.position === "detached-class-method" ||
    testCase.position === "own-strict-function"
  ) {
    return "undefined";
  }
  // A Script's this binding lives in its Global Environment Record, so a
  // top-level read is the captured value whatever the directive says.
  if (
    testCase.position === "after-await" ||
    testCase.position === "top-level" ||
    testCase.position === "top-level-arrow"
  ) {
    return "captured";
  }
  return ambientStrict(testCase) ? "undefined" : "captured";
}

/** The reported line for one identity, matching the printed `report`. */
function reportLine(testCase: ThisCase, identity: Expected): string {
  // A module top level captures undefined, so the two leading booleans
  // agree there and separate only under a Script.
  const capturedIsUndefined = testCase.sourceKind === "module";
  const isUndefined =
    identity === "undefined" ||
    (identity === "captured" && capturedIsUndefined);
  const isCaptured =
    identity === "captured" ||
    (identity === "undefined" && capturedIsUndefined);
  return [
    testCase.position,
    isCaptured,
    isUndefined,
    identity === "holder",
    identity === "instance",
    identity === "class",
    isUndefined ? "undefined" : identity === "class" ? "function" : "object",
  ].join(" ");
}

/**
 * Whether the generated declaration is one GlobalDeclarationInstantiation
 * binds on the global object. Only a Script's var-scoped names qualify:
 * its lexical declarations stay in the global declarative record, and
 * module code adds nothing to the global object at all.
 */
function bindsOnGlobalObject(testCase: ThisCase): boolean {
  return (
    testCase.sourceKind === "script" &&
    (testCase.binding === "function" || testCase.binding === "var")
  );
}

/**
 * The `probe` line the generated source prints: the property's type
 * before the declaration statement runs, then the value a binding read
 * observes after a property write, then the value a property read
 * observes after a binding write. A declaration the global object does
 * not bind reports `absent` in all three fields.
 */
function probeLine(testCase: ThisCase): string | undefined {
  if (testCase.binding === "none") return undefined;
  if (!bindsOnGlobalObject(testCase)) return "probe absent absent absent";
  // GlobalDeclarationInstantiation initializes a function binding to its
  // function object and a `var` binding to undefined, both before the
  // first statement runs. Afterwards the property and the binding are
  // one storage location, so each write is visible through the other.
  const initial = testCase.binding === "function" ? "function" : "undefined";
  return `probe ${initial} 2 3`;
}

function model(testCase: ThisCase): string {
  const lines = testCase.hinted ? ["hint 2", "hint text!"] : [];
  const probe = probeLine(testCase);
  if (probe != null) lines.push(probe);
  lines.push(reportLine(testCase, expectedIdentity(testCase)));
  return `${lines.join("\n")}\n`;
}

/**
 * The declaration and the observations that separate a global-object
 * property from an ordinary binding. Every observation is guarded by the
 * property's presence, so a module top level, whose captured value is
 * `undefined`, reports absence instead of throwing.
 */
function bindingSource(binding: BindingKind): string {
  if (binding === "none") return "";
  const declaration =
    binding === "function"
      ? "function probed() { return 1; }"
      : binding === "lexical"
        ? "let probed = 1;"
        : "var probed = 1;";
  return [
    'const probedInitial = captured != null && "probed" in captured',
    "  ? typeof captured.probed",
    '  : "absent";',
    declaration,
    "function readProbed() { return probed; }",
    'let probedBinding = "absent";',
    'let probedProperty = "absent";',
    'if (captured != null && "probed" in captured) {',
    "  captured.probed = 2;",
    "  probedBinding = readProbed();",
    "  probed = 3;",
    "  probedProperty = captured.probed;",
    "}",
    'console.log("probe", probedInitial, probedBinding, probedProperty);',
  ].join("\n");
}

const hintSource = `
holder.tag = 1;
/** @param {number} left @param {number} right @returns {number} */
function add(left, right) { return left + right; }
console.log("hint", add(holder.method().tag, 1));
holder.tag = "text";
console.log("hint", add(holder.method().tag, "!"));
`;

function positionSource(position: ThisPosition): string {
  const tag = JSON.stringify(position);
  if (position === "top-level") return `report(${tag}, this);`;
  if (position === "top-level-arrow") {
    return `report(${tag}, (() => this)());`;
  }
  if (position === "after-await") {
    return `await Promise.resolve();\nreport(${tag}, this);`;
  }
  if (position === "function") {
    return `function ordinary() { return this; }\nreport(${tag}, ordinary());`;
  }
  if (position === "own-strict-function") {
    return (
      'function ownStrict() { "use strict"; return this; }\n' +
      `report(${tag}, ownStrict());`
    );
  }
  if (position === "function-arrow") {
    return (
      "function arrowOwner() {\n" +
      "  const nested = () => this;\n" +
      "  return nested();\n" +
      "}\n" +
      `report(${tag}, arrowOwner());`
    );
  }
  if (position === "parameter-default") {
    return (
      "function defaulted(value = this) { return value; }\n" +
      `report(${tag}, defaulted());`
    );
  }
  if (position === "generator") {
    return (
      "function* stepped() { yield this; }\n" +
      `report(${tag}, stepped().next().value);`
    );
  }
  if (position === "async-function") {
    return (
      "async function later() { return this; }\n" +
      `later().then((value) => report(${tag}, value));`
    );
  }
  if (position === "object-method") return `report(${tag}, holder.method());`;
  if (position === "detached-method") {
    return `const detached = holder.method;\nreport(${tag}, detached());`;
  }
  if (position === "class-method") return `report(${tag}, instance.read());`;
  if (position === "class-static") return `report(${tag}, Owner.readStatic());`;
  if (position === "class-field") return `report(${tag}, instance.fieldThis);`;
  return (
    "const detachedClass = instance.read;\n" +
    `report(${tag}, detachedClass());`
  );
}

function printCase(testCase: ThisCase): string {
  return [
    testCase.strictDirective ? '"use strict";' : "",
    "const captured = this;",
    "class Owner {",
    "  fieldThis = this;",
    "  read() { return this; }",
    "  static readStatic() { return this; }",
    "}",
    "const instance = new Owner();",
    "const holder = { method() { return this; } };",
    "function report(tag, value) {",
    "  console.log(",
    "    tag,",
    "    value === captured,",
    "    value === undefined,",
    "    value === holder,",
    "    value === instance,",
    "    value === Owner,",
    "    typeof value,",
    "  );",
    "}",
    testCase.hinted ? hintSource : "",
    bindingSource(testCase.binding),
    positionSource(testCase.position),
    "",
  ].join("\n");
}

async function references(testCase: ThisCase): Promise<
  readonly {
    readonly exitStatus: number;
    readonly stderr: string;
    readonly stdout: string;
  }[]
> {
  const directory = await host.makeTemporaryDirectory("oseo-this-property-");
  const source = printCase(testCase);
  const sourcePath =
    testCase.sourceKind === "module"
      ? `${directory}/case.mjs`
      : `${directory}/case.js`;
  try {
    // A Script reference reaches the realm's global this value through
    // indirect eval, which is the only host position whose this binding
    // is a Global Environment Record's.
    await host.writeTextFile(
      sourcePath,
      testCase.sourceKind === "module"
        ? source
        : `(0, eval)(${JSON.stringify(source)});\n`,
    );
    return [
      await host.run({
        args: [sourcePath],
        command: process.execPath,
        cwd: directory,
      }),
      await host.run({
        args: ["run", "--quiet", sourcePath],
        command: "deno",
        cwd: directory,
      }),
    ];
  } finally {
    await host.remove(directory);
  }
}

async function assertModuleCase(
  testCase: ThisCase,
  expected: {
    readonly exitStatus: number;
    readonly stderr: string;
    readonly stdout: string;
  },
): Promise<void> {
  const directory = await host.makeTemporaryDirectory("oseo-this-module-");
  try {
    const entry = `${directory}/entry.mjs`;
    await host.writeTextFile(entry, printCase(testCase));
    for (const specialization of ["disabled", "enabled"] as const) {
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        const native = await runNativeCli(
          {
            args: [
              ...(specialization === "disabled" ? ["--no-specialization"] : []),
              entry,
            ],
            version: "0.1.0",
          },
          host,
        );
        assertMatchingObservations([expected, native]);
      } finally {
        delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      }
    }
  } finally {
    await host.remove(directory);
  }
}

async function assertScriptCase(
  testCase: ThisCase,
  expected: {
    readonly exitStatus: number;
    readonly stderr: string;
    readonly stdout: string;
  },
): Promise<void> {
  const source = printCase(testCase);
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "generated-m5-top-level-this.js" },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const mir = printMir(compiled.mir);
    // A Script never reaches the module constant, and it always reaches
    // the global this environment through its own top-level capture.
    assert.match(mir, /global-this global this/u);
    assert.doesNotMatch(mir, /constant module this/u);
    if (specialization === "enabled" && testCase.hinted) {
      assert.match(mir, /guard-smi/u);
    }
    if (specialization === "disabled") {
      assert.doesNotMatch(mir, /guard-smi/u);
    }
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      await withNativeFixture(
        {
          backend: cBackend,
          host,
          input: compiled.mir,
          operation: "execute",
          runtime: cRuntimeProvider,
          target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
          toolchain: zigToolchain,
        },
        (native) => {
          assertMatchingObservations([expected, native]);
          assert.ok(native.counters != null);
          assert.ok(native.counters.collections > 0);
          if (specialization === "enabled" && testCase.hinted) {
            assert.ok(native.counters.guardHits > 0);
            assert.ok(native.counters.guardMisses > 0);
          }
          if (specialization === "disabled") {
            assert.equal(native.counters.guardHits, 0);
            assert.equal(native.counters.guardMisses, 0);
          }
        },
      );
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }
}

test("this model separates receiver substitution from strict receivers", () => {
  assert.equal(
    model({
      binding: "none",
      hinted: false,
      position: "function",
      sourceKind: "script",
      strictDirective: false,
    }),
    "function true false false false false object\n",
  );
  assert.equal(
    model({
      binding: "none",
      hinted: false,
      position: "function",
      sourceKind: "script",
      strictDirective: true,
    }),
    "function false true false false false undefined\n",
  );
  assert.equal(
    model({
      binding: "none",
      hinted: true,
      position: "top-level",
      sourceKind: "module",
      strictDirective: false,
    }),
    "hint 2\nhint text!\ntop-level true true false false false undefined\n",
  );
  assert.equal(
    model({
      binding: "none",
      hinted: false,
      position: "class-static",
      sourceKind: "module",
      strictDirective: false,
    }),
    "class-static false false false false true function\n",
  );
});

test("this model binds only a Script's var-scoped top-level names", () => {
  // A Script's `var` and function declarations reach the global object,
  // and each observation crosses the property and the binding in both
  // directions from one storage location.
  assert.equal(
    model({
      binding: "var",
      hinted: false,
      position: "top-level",
      sourceKind: "script",
      strictDirective: false,
    }),
    "probe undefined 2 3\ntop-level true false false false false object\n",
  );
  assert.equal(
    model({
      binding: "function",
      hinted: false,
      position: "top-level",
      sourceKind: "script",
      strictDirective: false,
    }),
    "probe function 2 3\ntop-level true false false false false object\n",
  );
  // A Script's lexical declaration lives in the global declarative
  // record, and module code adds nothing to the global object, so both
  // report the property absent.
  assert.equal(
    model({
      binding: "lexical",
      hinted: false,
      position: "top-level",
      sourceKind: "script",
      strictDirective: false,
    }),
    "probe absent absent absent\n" +
      "top-level true false false false false object\n",
  );
  assert.equal(
    model({
      binding: "var",
      hinted: false,
      position: "top-level",
      sourceKind: "module",
      strictDirective: false,
    }),
    "probe absent absent absent\n" +
      "top-level true true false false false undefined\n",
  );
});

test(
  "generated this positions match the M5 receiver model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "top-level this resolves through the environment that binds it",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const expected = {
          exitStatus: 0,
          stderr: "",
          stdout: model(testCase),
        };
        assertMatchingObservations([expected, ...(await references(testCase))]);
        if (testCase.sourceKind === "module") {
          await assertModuleCase(testCase, expected);
          return;
        }
        await assertScriptCase(testCase, expected);
      }),
      {
        context:
          nativeTarget == null || host.executionHost == null
            ? ["target=unsupported host=unknown"]
            : [
                `target=${nativeTarget.name}`,
                `host=${host.executionHost.operatingSystem}/` +
                  host.executionHost.architecture,
                `sanitizers=${nativeTarget.sanitizers.join(",")}`,
              ],
        domain:
          "fifteen this positions across Script and module source kinds, " +
          "a Script strict directive, ordinary, own-strict, arrow, " +
          "generator, asynchronous, parameter-default, method, detached, " +
          "class instance, static, and field receivers, a module " +
          "continuation resumed after top-level await, an absent, `var`, " +
          "function, or lexical top-level declaration observed through " +
          "the captured receiver, and an optional false number hint " +
          "whose guarded addition misses",
        numRuns: 32,
        profile: "M5 top-level this",
        seed: 0x5eed_0026,
        sizeLimit: "one this position per generated source",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
