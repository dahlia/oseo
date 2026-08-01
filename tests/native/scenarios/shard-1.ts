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
  "5 5\n";

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
