/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import process from "node:process";
import test from "node:test";

import { runNativeCli } from "../native-cli.ts";
import { targetForExecutionHost } from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import * as testkit from "../../packages/testkit/src/index.ts";
import fc from "fast-check";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/**
 * How an export's binding is created. Lexical bindings stay uninitialized
 * until their declaration evaluates; a var binding is undefined from
 * linking until its initializer runs; a function binding is initialized
 * while the module environment is instantiated.
 */
type ExportKind = "class" | "const" | "function" | "let" | "var";

interface GeneratedExport {
  readonly kind: ExportKind;
  readonly name: string;
}

/**
 * One self-importing module. `exports` is in declaration order, and the
 * probe runs after the first `probeAt` declarations have evaluated.
 */
interface NamespaceCase {
  readonly exports: readonly GeneratedExport[];
  readonly probeAt: number;
  readonly queried: number;
}

const exportNames = ["alpha", "beta", "delta", "epsilon", "gamma"] as const;

const caseArbitrary: fc.Arbitrary<NamespaceCase> = fc
  .uniqueArray(
    fc.record({
      kind: fc.constantFrom<ExportKind>(
        "class",
        "const",
        "function",
        "let",
        "var",
      ),
      name: fc.constantFrom(...exportNames),
    }),
    { maxLength: 4, minLength: 1, selector: (entry) => entry.name },
  )
  .chain((exports) =>
    fc.record({
      exports: fc.constant(exports),
      probeAt: fc.integer({ max: exports.length, min: 0 }),
      queried: fc.integer({ max: exports.length - 1, min: 0 }),
    }),
  );

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function declaration(entry: GeneratedExport, index: number): string {
  switch (entry.kind) {
    case "class":
      return `export class ${entry.name} {}`;
    case "function":
      return `export function ${entry.name}() {}`;
    default:
      return `export ${entry.kind} ${entry.name} = ${index + 1};`;
  }
}

function entrySource(testCase: NamespaceCase): string {
  const queried = JSON.stringify(testCase.exports[testCase.queried]?.name);
  const declarations = testCase.exports.map(declaration);
  return [
    'import * as self from "./entry.mjs";',
    "",
    "const probe = (label, operation) => {",
    "  let outcome;",
    "  try {",
    "    outcome = `ok ${JSON.stringify(operation())}`;",
    "  } catch (error) {",
    "    outcome = error instanceof ReferenceError",
    '      ? "ReferenceError"',
    "      : error.constructor.name;",
    "  }",
    "  console.log(label, outcome);",
    "};",
    "const run = () => {",
    `  probe("hasOwn", () => Object.hasOwn(self, ${queried}));`,
    "  probe(",
    '    "descriptor",',
    "    () => typeof Object.getOwnPropertyDescriptor(",
    `      self, ${queried}).value,`,
    "  );",
    "  probe(",
    '    "propertyIsEnumerable",',
    "    () => Object.prototype.propertyIsEnumerable.call(",
    `      self, ${queried}),`,
    "  );",
    `  probe("in", () => ${queried} in self);`,
    '  probe("keys", () => Object.keys(self));',
    "  probe(",
    '    "for-in",',
    "    () => { const keys = []; for (const key in self) keys.push(key);",
    "      return keys; },",
    "  );",
    '  probe("isSealed", () => Object.isSealed(self));',
    '  probe("isFrozen", () => Object.isFrozen(self));',
    "  probe(",
    '    "proxy hasOwn",',
    `    () => Object.hasOwn(new Proxy(self, {}), ${queried}),`,
    "  );",
    '  probe("ownKeys", () => Reflect.ownKeys(self).length);',
    "};",
    ...declarations.slice(0, testCase.probeAt),
    "run();",
    ...declarations.slice(testCase.probeAt),
    "",
  ].join("\n");
}

/** A value one generated probe prints after a normal completion. */
type ProbeValue = boolean | number | string | readonly string[] | undefined;

function ok(value: ProbeValue): string {
  return `ok ${JSON.stringify(value)}`;
}

/**
 * The independent oracle. An export's binding is readable at the probe
 * when it is a function, a var (possibly still undefined), or a lexical
 * declaration among the first `probeAt` statements. The namespace lists
 * its exports in code-unit order, and each namespace-wide operation
 * reads them in that order.
 */
function expected(testCase: NamespaceCase): string {
  const ready = new Map(
    testCase.exports.map((entry, index) => [
      entry.name,
      entry.kind === "function" ||
        entry.kind === "var" ||
        index < testCase.probeAt,
    ]),
  );
  const values = new Map(
    testCase.exports.map((entry, index) => [
      entry.name,
      entry.kind === "function" || entry.kind === "class"
        ? "function"
        : entry.kind === "var" && index >= testCase.probeAt
          ? "undefined"
          : "number",
    ]),
  );
  const sorted = testCase.exports.map((entry) => entry.name).toSorted();
  const allReady = sorted.every((name) => ready.get(name) === true);
  const queried = testCase.exports[testCase.queried]?.name ?? "";
  const queriedReady = ready.get(queried) === true;
  const reference = "ReferenceError";
  return [
    ["hasOwn", queriedReady ? ok(true) : reference],
    ["descriptor", queriedReady ? ok(values.get(queried)) : reference],
    ["propertyIsEnumerable", queriedReady ? ok(true) : reference],
    ["in", ok(true)],
    ["keys", allReady ? ok(sorted) : reference],
    ["for-in", allReady ? ok(sorted) : reference],
    ["isSealed", allReady ? ok(true) : reference],
    // TestIntegrityLevel stops at the first writable export.
    ["isFrozen", ready.get(sorted[0] ?? "") === true ? ok(false) : reference],
    ["proxy hasOwn", queriedReady ? ok(true) : reference],
    ["ownKeys", ok(sorted.length + 1)],
  ]
    .map(([label, outcome]) => `${label} ${outcome}\n`)
    .join("");
}

test(
  "generated uninitialized namespace exports throw from [[GetOwnProperty]]",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "module namespace own-descriptor operations throw a ReferenceError " +
        "exactly while the queried or enumerated binding is uninitialized",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const directory = await host.makeTemporaryDirectory(
          "oseo-namespace-uninitialized-property-",
        );
        const entryPath = `${directory}/entry.mjs`;
        await host.writeTextFile(entryPath, entrySource(testCase));
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase),
        };
        try {
          testkit.assertMatchingObservations([
            expectedObservation,
            await host.run({
              args: [entryPath],
              command: process.execPath,
              cwd: directory,
            }),
            await host.run({
              args: ["run", "--quiet", entryPath],
              command: "deno",
              cwd: directory,
            }),
          ]);
          for (const specialization of ["disabled", "enabled"] as const) {
            if (specialization === "enabled") {
              process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
            }
            try {
              const native = await runNativeCli(
                {
                  args: [
                    ...(specialization === "disabled"
                      ? ["--no-specialization"]
                      : []),
                    entryPath,
                  ],
                  version: "0.1.0",
                },
                host,
              );
              testkit.assertMatchingObservations([expectedObservation, native]);
            } finally {
              delete process.env.OSEO_GC_EVERY_SAFEPOINT;
            }
          }
        } finally {
          await host.remove(directory);
        }
      }),
      {
        context: ["module-goal=self-import", "native-collector=forced"],
        domain:
          "one self-importing module exporting one to four distinct names " +
          "as let, const, class, var, or function declarations, probed " +
          "before, between, or after them through own-descriptor, " +
          "enumeration, integrity, forwarding proxy, [[HasProperty]], and " +
          "[[OwnPropertyKeys]] operations",
        numRuns: 5,
        profile: "M5 module namespace uninitialized bindings",
        seed: 0x6000_9000,
        sizeLimit:
          "one module, at most four exports from a five-name pool, and one " +
          "probe position",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
