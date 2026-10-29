/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { runNativeCli } from "../native-cli.ts";
import { targetForExecutionHost } from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import {
  assertMatchingObservations,
  type FixtureObservation,
} from "../../packages/testkit/src/index.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/** The declaration of `probed` in the Script the realm evaluates first. */
type PreludeKind = "const" | "function" | "let" | "none" | "var";

/** A module-level binding of `probed` that hides the global one. */
type ShadowKind = "const" | "function" | "import" | "none";

/** Where the observing module performs its operation. */
type Position = "deferred" | "function" | "top-level";

type Operation = "read" | "typeof" | "write";

interface PreludeCase {
  /** Add a false number hint whose guarded addition misses. */
  readonly hinted: boolean;
  /** Whether the entry or a module it imports observes `probed`. */
  readonly observer: "dependency" | "entry";
  readonly operation: Operation;
  readonly position: Position;
  readonly prelude: PreludeKind;
  readonly shadow: ShadowKind;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const caseArbitrary: fc.Arbitrary<PreludeCase> = fc.record({
  hinted: fc.boolean(),
  observer: fc.constantFrom("dependency" as const, "entry" as const),
  operation: fc.constantFrom(
    "read" as const,
    "typeof" as const,
    "write" as const,
  ),
  position: fc.constantFrom(
    "deferred" as const,
    "function" as const,
    "top-level" as const,
  ),
  prelude: fc.constantFrom(
    "const" as const,
    "function" as const,
    "let" as const,
    "none" as const,
    "var" as const,
  ),
  shadow: fc.constantFrom(
    "const" as const,
    "function" as const,
    "import" as const,
    "none" as const,
  ),
});

/** The printed form of one value, calling a function to name its source. */
const describeSource =
  "function describe(value) {\n" +
  '  return typeof value === "function" ? "function:" + value() : ' +
  "String(value);\n" +
  "}";

/** The description of the initial value each declaration binds. */
function initialDescription(kind: PreludeKind | ShadowKind): string {
  if (kind === "function") return "function:1";
  return "1";
}

/** Whether GlobalDeclarationInstantiation binds `probed` as a property. */
function bindsProperty(prelude: PreludeKind): boolean {
  return prelude === "function" || prelude === "var";
}

/**
 * The result line ECMA-262 requires. Module code is strict, its own
 * declarations and imports hide the global environment, a Script's
 * `var` and function names are global-object properties sharing storage
 * with their bindings, and its lexical names live only in the global
 * declarative record.
 */
function model(testCase: PreludeCase): string {
  const lines = testCase.hinted ? ["hint 2 aa"] : [];
  const shadowValue =
    testCase.shadow === "function"
      ? "function:module"
      : testCase.shadow === "import"
        ? "imported"
        : "module";
  const globalProperty = bindsProperty(testCase.prelude)
    ? initialDescription(testCase.prelude)
    : "undefined";
  let result: string;
  let written = false;
  if (testCase.operation === "typeof") {
    if (testCase.shadow !== "none") {
      result = testCase.shadow === "function" ? "function" : "string";
    } else if (testCase.prelude === "none") {
      result = "undefined";
    } else {
      result = testCase.prelude === "function" ? "function" : "number";
    }
  } else if (testCase.operation === "read") {
    if (testCase.shadow !== "none") result = shadowValue;
    else if (testCase.prelude === "none") result = "throw ReferenceError";
    else result = initialDescription(testCase.prelude);
  } else if (testCase.shadow === "const" || testCase.shadow === "import") {
    result = "throw TypeError";
  } else if (testCase.shadow === "function") {
    result = `7 ${globalProperty}`;
  } else if (testCase.prelude === "none") {
    result = "throw ReferenceError";
  } else if (testCase.prelude === "const") {
    result = "throw TypeError";
  } else {
    written = true;
    result = bindsProperty(testCase.prelude) ? "7 7" : "7 undefined";
  }
  const property = bindsProperty(testCase.prelude)
    ? written
      ? "7"
      : initialDescription(testCase.prelude)
    : "absent";
  lines.push(`result ${result}`, `property ${property}`);
  return `${lines.join("\n")}\n`;
}

function preludeSource(testCase: PreludeCase): string {
  const declaration = {
    const: "const probed = 1;",
    function: "function probed() { return 1; }",
    let: "let probed = 1;",
    none: "",
    var: "var probed = 1;",
  }[testCase.prelude];
  return `${declaration}\n${describeSource}\n`;
}

/**
 * The operation as one expression, so the top-level position evaluates it
 * directly in the module body rather than inside a function.
 */
function operationExpression(operation: Operation): string {
  if (operation === "typeof") return "typeof probed";
  if (operation === "read") return "describe(probed)";
  return '(probed = 7, describe(probed) + " " + describe(globalThis.probed))';
}

const hintSource =
  "/** @param {number} value @returns {number} */\n" +
  "function twice(value) { return value + value; }\n" +
  'console.log("hint", twice(1), twice("a"));';

/** The observing module, which exports `report` for a deferred call. */
function observerSource(testCase: PreludeCase): string {
  const shadow = {
    const: 'const probed = "module";',
    function: 'function probed() { return "module"; }',
    import: 'import { probed } from "./other.mjs";',
    none: "",
  }[testCase.shadow];
  const observe =
    "function observe() {\n" +
    "  try {\n" +
    `    return ${operationExpression(testCase.operation)};\n` +
    "  } catch (error) {\n" +
    '    return "throw " + error.constructor.name;\n' +
    "  }\n" +
    "}";
  const topLevel =
    "let observed;\n" +
    "try {\n" +
    `  observed = ${operationExpression(testCase.operation)};\n` +
    "} catch (error) {\n" +
    '  observed = "throw " + error.constructor.name;\n' +
    "}";
  const report =
    testCase.position === "top-level"
      ? `${topLevel}\nexport function report() { return observed; }`
      : testCase.position === "function"
        ? `${observe}\nconst observed = observe();\n` +
          "export function report() { return observed; }"
        : `${observe}\nexport const report = () => observe();`;
  return [shadow, testCase.hinted ? hintSource : "", report, ""].join("\n");
}

/** The entry, which prints after every module in the graph evaluated. */
function entrySource(testCase: PreludeCase): string {
  const print =
    'console.log("result", report());\n' +
    'console.log("property", "probed" in globalThis ? ' +
    'describe(globalThis.probed) : "absent");\n';
  if (testCase.observer === "entry") {
    return `${observerSource(testCase)}\n${print}`;
  }
  return `import { report } from "./observer.mjs";\n${print}`;
}

const referenceSource =
  'import { readFileSync } from "node:fs";\n' +
  'import { runInThisContext } from "node:vm";\n' +
  "runInThisContext(\n" +
  '  readFileSync(new URL("./prelude.js", import.meta.url), "utf8"),\n' +
  ");\n" +
  'await import("./entry.mjs");\n';

async function writeCase(directory: string, testCase: PreludeCase) {
  await host.writeTextFile(`${directory}/prelude.js`, preludeSource(testCase));
  await host.writeTextFile(`${directory}/entry.mjs`, entrySource(testCase));
  await host.writeTextFile(
    `${directory}/other.mjs`,
    'export const probed = "imported";\n',
  );
  if (testCase.observer === "dependency") {
    await host.writeTextFile(
      `${directory}/observer.mjs`,
      observerSource(testCase),
    );
  }
  await host.writeTextFile(`${directory}/reference.mjs`, referenceSource);
}

test("prelude model separates shadowed, global, and absent names", () => {
  const base: PreludeCase = {
    hinted: false,
    observer: "dependency",
    operation: "write",
    position: "function",
    prelude: "var",
    shadow: "none",
  };
  assert.equal(model(base), "result 7 7\nproperty 7\n");
  assert.equal(
    model({ ...base, prelude: "let" }),
    "result 7 undefined\nproperty absent\n",
  );
  assert.equal(
    model({ ...base, prelude: "none" }),
    "result throw ReferenceError\nproperty absent\n",
  );
  assert.equal(
    model({ ...base, prelude: "function", shadow: "function" }),
    "result 7 function:1\nproperty function:1\n",
  );
  assert.equal(
    model({ ...base, operation: "typeof", prelude: "none", hinted: true }),
    "hint 2 aa\nresult undefined\nproperty absent\n",
  );
});

test(
  "generated Script and module graphs match the global environment model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "a module resolves a prelude Script's names as its global environment",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const expected: FixtureObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: model(testCase),
        };
        const directory = await host.makeTemporaryDirectory(
          "oseo-module-prelude-property-",
        );
        try {
          await writeCase(directory, testCase);
          const reference = `${directory}/reference.mjs`;
          assertMatchingObservations([
            expected,
            await host.run({
              args: [reference],
              command: process.execPath,
              cwd: directory,
            }),
            await host.run({
              args: ["run", "--quiet", "--allow-read", reference],
              command: "deno",
              cwd: directory,
            }),
          ]);
          for (const specialization of ["disabled", "enabled"] as const) {
            process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
            try {
              const native = await runNativeCli(
                {
                  args: [
                    ...(specialization === "disabled"
                      ? ["--no-specialization"]
                      : []),
                    "--script",
                    `${directory}/prelude.js`,
                    `${directory}/entry.mjs`,
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
          "a prelude Script declaring `probed` as var, function, let, " +
          "const, or nothing; an entry or imported observer module that " +
          "leaves it visible or hides it with a const, function, or " +
          "imported binding; a read, typeof, or write at the module top " +
          "level, in a function called during evaluation, or in a closure " +
          "called after the graph evaluated; and an optional false number " +
          "hint whose guarded addition misses",
        numRuns: 24,
        profile: "M5 module prelude Script",
        seed: 0x6000_9100,
        sizeLimit: "one prelude name and one observing module per graph",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
