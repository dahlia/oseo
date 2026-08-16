/* eslint-disable no-await-in-loop -- Native scenario builds are isolated. */

import assert from "node:assert/strict";
import process from "node:process";

import { runNativeCli } from "../../../packages/cli/src/index.ts";
import type { NativeScenarioContext } from "../scenario.ts";

/**
 * A global Script whose top-level declarations are observed through its
 * `this` binding. Indirect `eval`, the only global-Script position both
 * reference hosts expose, creates its var-scoped global properties with
 * `[[Configurable]]` true and shares no `functionsToInitialize` ordering
 * with a Script, so this source is compared with fixed ECMA-262
 * expectations instead of a host observation.
 */
const globalDeclarationSource = `
function first() { return counted; }
function Promise() { return "replacement"; }
var Object;
const ObjectIntrinsic = Object;
var counted = 1;
var hoisted;
function second() { return "second"; }
let lexicalName = 2;
const constantName = 3;
class ClassName {}
const declaredNames = ["first", "second", "counted", "hoisted"];
let order = "";
for (const key of Object.keys(this)) {
  for (const name of declaredNames) {
    if (key === name) order += key + " ";
  }
}
console.log(order);
const countedDescriptor = Object.getOwnPropertyDescriptor(this, "counted");
console.log(
  countedDescriptor.value,
  countedDescriptor.writable,
  countedDescriptor.enumerable,
  countedDescriptor.configurable,
);
const firstDescriptor = Object.getOwnPropertyDescriptor(this, "first");
console.log(
  typeof firstDescriptor.value,
  firstDescriptor.writable,
  firstDescriptor.enumerable,
  firstDescriptor.configurable,
);
console.log("lexicalName" in this, "constantName" in this, "ClassName" in this);
console.log(delete this.counted, counted, this.counted);
this.appended = 4;
const appendedDescriptor = Object.getOwnPropertyDescriptor(this, "appended");
console.log(
  appendedDescriptor.writable,
  appendedDescriptor.enumerable,
  appendedDescriptor.configurable,
  delete this.appended,
  "appended" in this,
);
Object.defineProperty(this, "counted", { value: 5, writable: false });
counted = 6;
this.counted = 7;
console.log(counted, this.counted, first());
function strictAssign() { "use strict"; counted = 8; }
try { strictAssign(); } catch (error) { console.log(error.constructor.name); }
console.log(counted, first());
console.log(
  "intrinsic-function-configurable",
  Object.getOwnPropertyDescriptor(this, "Promise").configurable,
);
console.log("delete-intrinsic-var", delete Object, typeof Object);
const globalPrototype = ObjectIntrinsic.getPrototypeOf(this);
globalPrototype.Object = 42;
const inheritedObject = Object;
function strictInheritedAssignment() {
  "use strict";
  Object = 43;
}
strictInheritedAssignment();
console.log(
  "inherited-global-binding",
  inheritedObject,
  Object,
  this.Object,
  globalPrototype.Object,
);
delete this.Object;
delete globalPrototype.Object;
`;

/**
 * GlobalDeclarationInstantiation creates every function binding before
 * every `var` binding, so `first second counted hoisted` is the order
 * ECMA-262 requires even though both reference hosts, which share V8,
 * create global declarations in source order instead. The remaining
 * lines are the Script-only descriptor, deletion, and shared-storage
 * boundaries: a var-scoped property is writable, enumerable, and
 * non-configurable, an ordinary property the Script adds itself is
 * configurable, and `[[DefineOwnProperty]]` owns the `[[Writable]]`
 * attribute that the binding's own assignment path then observes.
 */
const globalDeclarationExpectation =
  "first second counted hoisted \n" +
  "1 true true false\n" +
  "function true true false\n" +
  "false false false\n" +
  "false 1 1\n" +
  "true true true true false\n" +
  "5 5 5\n" +
  "TypeError\n" +
  "5 5\n" +
  "intrinsic-function-configurable false\n" +
  "delete-intrinsic-var true undefined\n" +
  "inherited-global-binding 42 43 43 42\n";

/**
 * A strict Script keeps the same global bindings, because strictness
 * does not change GlobalDeclarationInstantiation, and turns every
 * refused write into a TypeError.
 */
const strictGlobalDeclarationSource = `
"use strict";
var counted = 1;
function declared() { return counted; }
let lexicalName = 2;
console.log(this.counted, declared(), typeof this.declared);
console.log("lexicalName" in this, "counted" in this, "declared" in this);
this.counted = 2;
console.log(counted, declared());
counted = 3;
console.log(this.counted);
try {
  console.log(delete this.counted);
} catch (error) {
  console.log("delete", error.constructor.name);
}
Object.defineProperty(this, "counted", { writable: false });
try {
  counted = 4;
} catch (error) {
  console.log("binding", error.constructor.name);
}
try {
  this.counted = 5;
} catch (error) {
  console.log("property", error.constructor.name);
}
console.log(counted, this.counted, declared());
`;

const strictGlobalDeclarationExpectation =
  "1 1 function\n" +
  "false true true\n" +
  "2 2\n" +
  "3\n" +
  "delete TypeError\n" +
  "binding TypeError\n" +
  "property TypeError\n" +
  "3 3 3\n";

/**
 * A block-level function declaration in sloppy-mode Script and ordinary
 * function code. Both reference hosts apply Annex B's web legacy
 * compatibility semantics to this exact shape in sloppy mode, copying the
 * block's function value out to an outer var-scoped binding of the same
 * name, so this source is compared with fixed ECMA-262 expectations
 * instead of a host observation. The strict-mode and module forms of this
 * construct have no such divergence and are covered by the
 * block-function-var-coexistence native fixture and the
 * block-function-var-module fixture, which do compare against Node.js and
 * Deno.
 */
const blockFunctionVarSource = `
var scriptValue = "script outer";
let readBlockType;
{
  readBlockType = function () { return typeof scriptValue; };
  function scriptValue() { return "script block"; }
  console.log("script block", scriptValue());
}
console.log("script outer", scriptValue, readBlockType());

function ordinary() {
  var value = "ordinary outer";
  let readBlockType;
  {
    readBlockType = function () { return typeof value; };
    function value() { return "ordinary block"; }
    console.log("ordinary block", value());
  }
  return [value, readBlockType()];
}
const ordinaryValues = ordinary();
console.log("ordinary", ordinaryValues[0], ordinaryValues[1]);
`;

const blockFunctionVarExpectation =
  "script block script block\n" +
  "script outer script outer function\n" +
  "ordinary block ordinary block\n" +
  "ordinary ordinary outer function\n";

/**
 * A switch-clause function declaration in sloppy-mode Script and ordinary
 * function code. Annex B.3.2's web legacy compatibility semantics reach a
 * CaseClause exactly as they reach a Block, so both reference hosts copy
 * the CaseBlock function's value out to an outer var-scoped binding of the
 * same name in sloppy mode; this source is compared with fixed ECMA-262
 * expectations instead of a host observation. The strict-mode and module
 * forms of this construct have no such divergence and are covered by the
 * switch-function-declarations native fixture, which does compare against
 * Node.js and Deno.
 */
const switchFunctionVarSource = `
var switchValue = "script outer";
let readSwitchType;
switch (1) {
  case 1:
    readSwitchType = function () { return typeof switchValue; };
    function switchValue() { return "switch case"; }
    console.log("switch case", switchValue());
    break;
}
console.log("script outer", switchValue, readSwitchType());

function ordinary() {
  var value = "ordinary outer";
  let readType;
  switch (1) {
    case 1:
      readType = function () { return typeof value; };
      function value() { return "ordinary case"; }
      console.log("ordinary case", value());
      break;
  }
  return [value, readType()];
}
const ordinaryValues = ordinary();
console.log("ordinary", ordinaryValues[0], ordinaryValues[1]);
`;

const switchFunctionVarExpectation =
  "switch case switch case\n" +
  "script outer script outer function\n" +
  "ordinary case ordinary case\n" +
  "ordinary ordinary outer function\n";

export async function runNativeScenario1(
  context: NativeScenarioContext,
): Promise<void> {
  const { host } = context;

  // Script global declarations reach the global object identically under
  // both specialization policies and with a collection forced at every
  // safepoint, which keeps the object, its properties, and the binding
  // cells they share reachable together.
  for (const [name, source, expected] of [
    [
      "global-declarations.js",
      globalDeclarationSource,
      globalDeclarationExpectation,
    ],
    [
      "global-declarations-strict.js",
      strictGlobalDeclarationSource,
      strictGlobalDeclarationExpectation,
    ],
    [
      "block-function-var-sloppy.js",
      blockFunctionVarSource,
      blockFunctionVarExpectation,
    ],
    [
      "switch-function-var-sloppy.js",
      switchFunctionVarSource,
      switchFunctionVarExpectation,
    ],
  ] as const) {
    for (const specialization of ["disabled", "enabled"] as const) {
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        const observed = await runNativeCli(
          {
            args: [
              ...(specialization === "disabled" ? ["--no-specialization"] : []),
              name,
            ],
            source,
            sourceId: name,
            version: "0.1.0",
          },
          host,
        );
        assert.equal(observed.exitStatus, 0, observed.stderr);
        assert.equal(observed.stderr, "");
        assert.equal(observed.stdout, expected, `${name} ${specialization}`);
      } finally {
        delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      }
    }
  }

  for (const [name, source, location, errorName] of [
    [
      "restricted-global-lexical-location.js",
      "\n\nlet undefined;\n",
      "3:5",
      "SyntaxError",
    ],
    [
      "restricted-global-function-location.js",
      "\n\nfunction undefined() {}\n",
      "3:1",
      "TypeError",
    ],
  ] as const) {
    const observed = await runNativeCli(
      { args: [name], source, sourceId: name, version: "0.1.0" },
      host,
    );
    assert.equal(observed.exitStatus, 1);
    assert.equal(observed.stdout, "");
    assert.match(
      observed.stderr,
      new RegExp(`^${name}:${location}: error\\[OSEO2001\\]`, "u"),
    );
    assert.match(observed.stderr, new RegExp(`OSEO_THROWN ${errorName}`, "u"));
  }

  const nonExtensibleGlobalHost = {
    ...host,
    async readTextFile(path: string | URL): Promise<string> {
      const source = await host.readTextFile(path);
      if (
        !(path instanceof URL) ||
        !path.pathname.endsWith("/runtime_binding.c")
      ) {
        return source;
      }
      const injected = source.replace(
        "frame.slots[0] = result.value;\n" +
          "    /* HasRestrictedGlobalProperty runs",
        "frame.slots[0] = result.value;\n" +
          "    ordinary_object(frame.slots[0])->extensible = false;\n" +
          "    /* HasRestrictedGlobalProperty runs",
      );
      assert.notEqual(injected, source, "non-extensible global injected");
      return injected;
    },
  };
  const blockedGlobal = await runNativeCli(
    {
      args: ["non-extensible-global-var-location.js"],
      source: "\n\nvar blocked;\n",
      sourceId: "non-extensible-global-var-location.js",
      version: "0.1.0",
    },
    nonExtensibleGlobalHost,
  );
  assert.equal(blockedGlobal.exitStatus, 1);
  assert.equal(blockedGlobal.stdout, "");
  assert.match(
    blockedGlobal.stderr,
    /^non-extensible-global-var-location\.js:3:5: error\[OSEO2001\]/u,
  );
  assert.match(blockedGlobal.stderr, /OSEO_THROWN TypeError/u);

  const nulSourceId = "source\0identifier.ts";
  const nulSourceDiagnostic = await runNativeCli(
    {
      args: ["nul-source-id.ts"],
      source: "console.log(value); const value = 1;",
      sourceId: nulSourceId,
      version: "0.1.0",
    },
    host,
  );
  assert.equal(nulSourceDiagnostic.exitStatus, 1);
  assert.equal(nulSourceDiagnostic.stdout, "");
  assert.ok(nulSourceDiagnostic.stderr.startsWith(`${nulSourceId}:`));
  assert.match(nulSourceDiagnostic.stderr, /error\[OSEO2001\]/u);

  const recursion = await runNativeCli(
    {
      args: ["recursive-runtime.ts"],
      source: "function recurse() { return recurse(); } recurse();",
      sourceId: "recursive-runtime.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(recursion.exitStatus, 1);
  assert.equal(recursion.stdout, "");
  assert.match(recursion.stderr, /error\[OSEO2001\].*call depth/u);

  const caughtRecursion = await runNativeCli(
    {
      args: ["caught-recursion-runtime.ts"],
      source:
        "function recurse() { return recurse(); } " +
        'try { recurse(); } catch (error) { console.log("caught"); }',
      sourceId: "caught-recursion-runtime.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(caughtRecursion.exitStatus, 1);
  assert.equal(caughtRecursion.stdout, "");
  assert.match(caughtRecursion.stderr, /error\[OSEO2001\].*call depth/u);

  const caughtLanguageError = await runNativeCli(
    {
      args: ["caught-language-error.ts"],
      source: `
try { const value = 1; value = 2; } catch (error) {}
throw 1;
`,
      sourceId: "caught-language-error.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(caughtLanguageError.exitStatus, 1);
  assert.equal(caughtLanguageError.stdout, "");
  assert.match(
    caughtLanguageError.stderr,
    /error\[OSEO2001\]: Unhandled JavaScript throw\./u,
  );
  assert.doesNotMatch(caughtLanguageError.stderr, /immutable binding/u);

  const thrownTimer = await runNativeCli(
    {
      args: ["thrown-timer-runtime.ts"],
      source: `
function observe(value) { console.log(value); }
function task() {
  Promise.resolve("microtask after throw").then(observe);
  throw "timer failure";
}
setTimeout(task, 0);
`,
      sourceId: "thrown-timer-runtime.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(thrownTimer.exitStatus, 1);
  assert.equal(thrownTimer.stdout, "microtask after throw\n");
  assert.match(
    thrownTimer.stderr,
    /error\[OSEO2001\]: Unhandled JavaScript throw\./u,
  );

  const thrownEntry = await runNativeCli(
    {
      args: ["thrown-entry-runtime.ts"],
      source: `
function observe(value) { console.log(value); }
Promise.resolve("microtask after entry throw").then(observe);
throw "entry failure";
`,
      sourceId: "thrown-entry-runtime.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(thrownEntry.exitStatus, 1);
  assert.equal(thrownEntry.stdout, "microtask after entry throw\n");
  assert.match(
    thrownEntry.stderr,
    /error\[OSEO2001\]: Unhandled JavaScript throw\./u,
  );

  const thrownTypedEntry = await runNativeCli(
    {
      args: ["thrown-typed-entry.ts"],
      source: 'throw new TypeError("typed unhandled");',
      sourceId: "thrown-typed-entry.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(thrownTypedEntry.exitStatus, 1);
  assert.equal(thrownTypedEntry.stdout, "");
  assert.match(
    thrownTypedEntry.stderr,
    /^thrown-typed-entry\.ts:1:\d+: error\[OSEO2001\]: TypeError: typed/u,
  );
  // The stable machine-readable marker records the intrinsic error kind.
  assert.match(thrownTypedEntry.stderr, /\nOSEO_THROWN TypeError\n$/u);

  const thrownRuntimeTyped = await runNativeCli(
    {
      args: ["thrown-runtime-typed.ts"],
      source: "const target = null; target.item;",
      sourceId: "thrown-runtime-typed.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(thrownRuntimeTyped.exitStatus, 1);
  assert.equal(thrownRuntimeTyped.stdout, "");
  assert.match(
    thrownRuntimeTyped.stderr,
    /error\[OSEO2001\]: TypeError: Cannot read properties of a nullish/u,
  );

  const thrownRenamedEntry = await runNativeCli(
    {
      args: ["thrown-renamed-entry.ts"],
      source: `
const renamed = new Error("body");
renamed.name = "한글이름";
throw renamed;
`,
      sourceId: "thrown-renamed-entry.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(thrownRenamedEntry.exitStatus, 1);
  assert.equal(thrownRenamedEntry.stdout, "");
  assert.match(thrownRenamedEntry.stderr, /error\[OSEO2001\]: 한글이름: body/u);
  // The marker keeps the intrinsic Error identity even though the human
  // diagnostic shows the mutated non-identifier name.
  assert.match(thrownRenamedEntry.stderr, /\nOSEO_THROWN Error\n$/u);

  const thrownEmptyEntry = await runNativeCli(
    {
      args: ["thrown-empty-entry.ts"],
      source: `
const blank = new TypeError("");
blank.name = "";
throw blank;
`,
      sourceId: "thrown-empty-entry.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(thrownEmptyEntry.exitStatus, 1);
  assert.equal(thrownEmptyEntry.stdout, "");
  // With no renderable name or message the human diagnostic falls back to the
  // generic throw text, yet the marker still exposes the intrinsic identity.
  assert.match(
    thrownEmptyEntry.stderr,
    /error\[OSEO2001\]: Unhandled JavaScript throw\./u,
  );
  assert.match(thrownEmptyEntry.stderr, /\nOSEO_THROWN TypeError\n$/u);

  const thrownPrototypeEntry = await runNativeCli(
    {
      args: ["thrown-prototype-entry.ts"],
      source: `
throw TypeError.prototype;
`,
      sourceId: "thrown-prototype-entry.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(thrownPrototypeEntry.exitStatus, 1);
  assert.equal(thrownPrototypeEntry.stdout, "");
  // Throwing the intrinsic prototype object itself keeps its exact identity,
  // because the kind walk starts at the thrown value rather than its prototype.
  assert.match(thrownPrototypeEntry.stderr, /\nOSEO_THROWN TypeError\n$/u);

  const thrownConvertedMessage = await runNativeCli(
    {
      args: ["thrown-converted-message.ts"],
      source: `
const boom = new Error("original");
boom.message = { toString: function () { return "converted"; } };
throw boom;
`,
      sourceId: "thrown-converted-message.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(thrownConvertedMessage.exitStatus, 1);
  assert.equal(thrownConvertedMessage.stdout, "");
  // The diagnostic points at the throw site (line 4), not the toString
  // method whose conversion moved the context source location.
  assert.match(
    thrownConvertedMessage.stderr,
    /^thrown-converted-message\.ts:4:1: error\[OSEO2001\]: Error: converted/u,
  );

  const wideBindings = Array.from(
    { length: 3_000 },
    (_, index) => `const value${index} = ${index};`,
  ).join("\n");
  const wideRecursion = await runNativeCli(
    {
      args: ["wide-recursion-runtime.ts"],
      source:
        `function recurse(depth) {\n${wideBindings}\n` +
        "  if (depth === 0) return 0;\n" +
        "  return recurse(depth - 1);\n" +
        "}\n" +
        "console.log(recurse(100));\n",
      sourceId: "wide-recursion-runtime.ts",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(wideRecursion.exitStatus, 1);
  assert.equal(wideRecursion.stdout, "");
  assert.match(wideRecursion.stderr, /error\[OSEO2001\].*frame budget/u);

  const rootAllocationFailureHost = {
    ...host,
    async readTextFile(path: string | URL): Promise<string> {
      const source = await host.readTextFile(path);
      if (
        !(path instanceof URL) ||
        !path.pathname.endsWith("/runtime_core.c")
      ) {
        return source;
      }
      const injected = source.replace(
        "slots = calloc(slot_count, sizeof(OseoValue));",
        "slots = NULL;",
      );
      assert.notEqual(injected, source, "root allocation failure injected");
      return injected;
    },
  };
  const rootAllocationFailure = await runNativeCli(
    {
      args: ["root-allocation-runtime.ts"],
      source: "console.log(1);",
      sourceId: "root-allocation-runtime.ts",
      version: "0.1.0",
    },
    rootAllocationFailureHost,
  );
  assert.equal(rootAllocationFailure.exitStatus, 1);
  assert.equal(rootAllocationFailure.stdout, "");
  assert.match(
    rootAllocationFailure.stderr,
    /error\[OSEO2001\].*Root frame allocation failed/u,
  );

  const objectPrototypeRootFailureHost = {
    ...host,
    async readTextFile(path: string | URL): Promise<string> {
      const source = await host.readTextFile(path);
      if (
        !(path instanceof URL) ||
        !path.pathname.endsWith("/runtime_object_builtin.c")
      ) {
        return source;
      }
      const injected = source.replace(
        "result = oseo_roots_allocate(context, &frame, 3u);\n" +
          "        if (result.status == OSEO_STATUS_NORMAL) {\n" +
          "            frame.slots[0] = prototype;",
        'result = failure(context, "OSEO2001", ' +
          '"Injected Object prototype root allocation failure.");\n' +
          "        if (result.status == OSEO_STATUS_NORMAL) {\n" +
          "            frame.slots[0] = prototype;",
      );
      assert.notEqual(
        injected,
        source,
        "Object prototype root allocation failure injected",
      );
      return injected;
    },
  };
  const objectPrototypeRootFailure = await runNativeCli(
    {
      args: ["object-prototype-root-allocation-runtime.ts"],
      source: "console.log({}.toString());",
      sourceId: "object-prototype-root-allocation-runtime.ts",
      version: "0.1.0",
    },
    objectPrototypeRootFailureHost,
  );
  assert.equal(objectPrototypeRootFailure.exitStatus, 1);
  assert.equal(objectPrototypeRootFailure.stdout, "");
  assert.match(
    objectPrototypeRootFailure.stderr,
    /error\[OSEO2001\].*Object prototype root allocation failure/u,
  );

  const concatenationOverflowHost = {
    ...host,
    async readTextFile(path: string | URL): Promise<string> {
      const source = await host.readTextFile(path);
      if (
        !(path instanceof URL) ||
        !path.pathname.endsWith("/runtime_primitive.c")
      ) {
        return source;
      }
      const injected = source.replace(
        "OseoString *right_object = string_object(slots[1]);",
        "OseoString *right_object = string_object(slots[1]);\n" +
          "    right_object->length = SIZE_MAX;",
      );
      assert.notEqual(injected, source, "concatenation overflow injected");
      return injected;
    },
  };
  const concatenationOverflow = await runNativeCli(
    {
      args: ["concatenation-overflow-runtime.ts"],
      source: 'console.log("left" + "right");',
      sourceId: "concatenation-overflow-runtime.ts",
      version: "0.1.0",
    },
    concatenationOverflowHost,
  );
  assert.equal(concatenationOverflow.exitStatus, 1);
  assert.equal(concatenationOverflow.stdout, "");
  assert.match(
    concatenationOverflow.stderr,
    /error\[OSEO2001\].*String allocation is too large/u,
  );

  const concatenationCeilingHost = {
    ...host,
    async readTextFile(path: string | URL): Promise<string> {
      const source = await host.readTextFile(path);
      if (
        !(path instanceof URL) ||
        !path.pathname.endsWith("/runtime_primitive.c")
      ) {
        return source;
      }
      const injected = source.replace(
        "OseoString *right_object = string_object(slots[1]);",
        "OseoString *right_object = string_object(slots[1]);\n" +
          "    right_object->length = OSEO_MAX_STRING_LENGTH;",
      );
      assert.notEqual(injected, source, "concatenation ceiling injected");
      return injected;
    },
  };
  const concatenationCeiling = await runNativeCli(
    {
      args: ["concatenation-ceiling-runtime.ts"],
      source:
        'try { console.log("left" + "right"); } catch (error) {\n' +
        "  console.log(error.name, error.message);\n" +
        "}",
      sourceId: "concatenation-ceiling-runtime.ts",
      version: "0.1.0",
    },
    concatenationCeilingHost,
  );
  assert.equal(concatenationCeiling.exitStatus, 0);
  assert.equal(
    concatenationCeiling.stdout,
    "RangeError Invalid string length.\n",
  );
  assert.equal(concatenationCeiling.stderr, "");

  const stagingCeilingHost = {
    ...host,
    async readTextFile(path: string | URL): Promise<string> {
      const source = await host.readTextFile(path);
      if (!(path instanceof URL)) return source;
      if (path.pathname.endsWith("/runtime_string.c")) {
        const lengthInjected = source.replace(
          "size_t required = builder->length + additional;",
          "if (builder->length > 0u) {\n" +
            "        builder->length = OSEO_MAX_STRING_LENGTH;\n" +
            "    }\n" +
            "    size_t required = builder->length + additional;",
        );
        assert.notEqual(
          lengthInjected,
          source,
          "String builder ceiling injected",
        );
        const allocationInjected = lengthInjected.replace(
          "uint16_t *units = realloc(builder->units, capacity * " +
            "sizeof(uint16_t));",
          "uint16_t *units = required > OSEO_MAX_STRING_LENGTH\n" +
            "        ? NULL\n" +
            "        : realloc(builder->units, capacity * " +
            "sizeof(uint16_t));",
        );
        assert.notEqual(
          allocationInjected,
          lengthInjected,
          "String builder allocation fault injected",
        );
        return allocationInjected;
      }
      if (path.pathname.endsWith("/runtime_object_builtin.c")) {
        const lengthInjected = source.replace(
          "size_t length = tag_length + 9u;",
          "tag_length = OSEO_MAX_STRING_LENGTH;\n" +
            "    size_t length = tag_length + 9u;",
        );
        assert.notEqual(lengthInjected, source, "Object tag ceiling injected");
        const allocationInjected = lengthInjected.replace(
          "uint16_t *units = malloc(length * sizeof(*units));",
          "uint16_t *units = NULL;",
        );
        assert.notEqual(
          allocationInjected,
          lengthInjected,
          "Object tag allocation fault injected",
        );
        return allocationInjected;
      }
      return source;
    },
  };
  const stagingCeiling = await runNativeCli(
    {
      args: ["staging-ceiling-runtime.ts"],
      source:
        'try { "a".concat("b"); } catch (error) {\n' +
        '  console.log("concat", error.name, error.message);\n' +
        "}\n" +
        'const tagged = { [Symbol.toStringTag]: "tag" };\n' +
        "try { tagged.toString(); } catch (error) {\n" +
        '  console.log("tag", error.name, error.message);\n' +
        "}",
      sourceId: "staging-ceiling-runtime.ts",
      version: "0.1.0",
    },
    stagingCeilingHost,
  );
  assert.equal(stagingCeiling.exitStatus, 0);
  assert.equal(
    stagingCeiling.stdout,
    "concat RangeError Invalid string length.\n" +
      "tag RangeError Invalid string length.\n",
  );
  assert.equal(stagingCeiling.stderr, "");

  const fractionalArrayLengthHost = {
    ...host,
    async readTextFile(path: string | URL): Promise<string> {
      const source = await host.readTextFile(path);
      if (
        !(path instanceof URL) ||
        !path.pathname.endsWith("/runtime_primitive.c")
      ) {
        return source;
      }
      const injected = source.replace(
        "array_length = (uint32_t)truncated_length;",
        "array_length = numeric_length == 4294967295.5\n" +
          "                ? 1u\n" +
          "                : (uint32_t)truncated_length;",
      );
      assert.notEqual(
        injected,
        source,
        "fractional Array length bound injected",
      );
      return injected;
    },
  };
  const fractionalArrayLength = await runNativeCli(
    {
      args: ["fractional-array-length-runtime.ts"],
      source:
        "const inherited = Object.create(Array.prototype);\n" +
        "inherited.length = 2 ** 32 - 0.5;\n" +
        'console.log(String(inherited) === "");',
      sourceId: "fractional-array-length-runtime.ts",
      version: "0.1.0",
    },
    fractionalArrayLengthHost,
  );
  assert.equal(fractionalArrayLength.exitStatus, 0);
  assert.equal(fractionalArrayLength.stdout, "true\n");
  assert.equal(fractionalArrayLength.stderr, "");

  const allocationFailureHost = {
    ...host,
    async readTextFile(path: string | URL): Promise<string> {
      const source = await host.readTextFile(path);
      if (
        !(path instanceof URL) ||
        !path.pathname.endsWith("/runtime_primitive.c")
      ) {
        return source;
      }
      const injected = source.replace(
        "char *text = malloc(length + 1u);",
        "char *text = NULL;",
      );
      assert.notEqual(injected, source, "numeric allocation failure injected");
      return injected;
    },
  };
  const allocationFailure = await runNativeCli(
    {
      args: ["numeric-conversion-runtime.ts"],
      source: 'console.log(-"1");',
      sourceId: "numeric-conversion-runtime.ts",
      version: "0.1.0",
    },
    allocationFailureHost,
  );
  assert.equal(allocationFailure.exitStatus, 1);
  assert.equal(allocationFailure.stdout, "");
  assert.match(allocationFailure.stderr, /error\[OSEO2001\].*allocation/u);
}
