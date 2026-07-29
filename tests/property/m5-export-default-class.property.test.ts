/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import process from "node:process";
import test from "node:test";

import { runNativeCli } from "../../packages/cli/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import * as testkit from "../../packages/testkit/src/index.ts";
import fc from "fast-check";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

interface DefaultClassCase {
  readonly anonymous: boolean;
  readonly input: number;
  readonly nameMethod: boolean;
  readonly offset: number;
  readonly staticValue: number;
}

const caseArbitrary: fc.Arbitrary<DefaultClassCase> = fc.record({
  anonymous: fc.boolean(),
  input: fc.integer({ max: 20, min: -20 }),
  nameMethod: fc.boolean(),
  offset: fc.integer({ max: 20, min: -20 }),
  staticValue: fc.integer({ max: 20, min: -20 }),
});

const host = createNodeHost();

function definitionSource(testCase: DefaultClassCase): string {
  const name = testCase.anonymous ? "" : " DefaultShape";
  const localBody = testCase.anonymous
    ? "return this === this;"
    : "return DefaultShape === this;";
  const nameMethod = testCase.nameMethod
    ? ["  static name() {", '    return "name method";', "  }", ""]
    : [];
  return [
    `export default class${name} {`,
    `  static payload = { value: ${testCase.staticValue} };`,
    "",
    "  constructor(value) {",
    "    this.value = value;",
    "  }",
    "",
    "  read() {",
    `    return this.value + ${testCase.offset};`,
    "  }",
    "",
    ...nameMethod,
    "  static local() {",
    `    ${localBody}`,
    "  }",
    "}",
    "",
  ].join("\n");
}

function entrySource(testCase: DefaultClassCase): string {
  const name = testCase.nameMethod ? "Shape.name()" : "Shape.name";
  return [
    'import Shape from "./definition.mjs";',
    "",
    `const instance = new Shape(${testCase.input});`,
    "console.log(" +
      `${name}, Shape.local(), instance.read(), Shape.payload.value);`,
    "",
  ].join("\n");
}

function expected(testCase: DefaultClassCase): string {
  const name = testCase.nameMethod
    ? "name method"
    : testCase.anonymous
      ? "default"
      : "DefaultShape";
  return (
    `${name} true ${testCase.input + testCase.offset} ` +
    `${testCase.staticValue}\n`
  );
}

test("generated default class exports preserve names", async () => {
  await assertAsyncProperty(
    "default class declarations preserve their export and " +
      "constructor names",
    fc.asyncProperty(caseArbitrary, async (testCase) => {
      const directory = await host.makeTemporaryDirectory(
        "oseo-default-class-property-",
      );
      const definitionPath = `${directory}/definition.mjs`;
      const entryPath = `${directory}/entry.mjs`;
      await host.writeTextFile(definitionPath, definitionSource(testCase));
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
      context: ["module-goal=closed graph", "native-collector=forced"],
      domain:
        "named and anonymous default class declarations with optional static " +
        "`name` replacement, a local named-class reference, bounded " +
        "constructor input, a prototype method, and a heap-valued static " +
        "field imported through the default export",
      numRuns: 5,
      profile: "M5 export default class declarations",
      seed: 0x5eed_001e,
      sizeLimit:
        "one definition module, one importing entry module, and bounded " +
        "integer values",
      timeLimitMilliseconds: 180_000,
    },
  );
});
