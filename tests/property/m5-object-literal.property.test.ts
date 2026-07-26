/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
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

type PropertyKind = "data" | "get" | "method" | "set" | "shorthand";

interface PropertySpec {
  readonly kind: PropertyKind;
  readonly value: number;
}

interface ObjectLiteralCase {
  readonly properties: readonly PropertySpec[];
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const propertyArbitrary: fc.Arbitrary<PropertySpec> = fc.record({
  kind: fc.constantFrom<PropertyKind>(
    "data",
    "get",
    "method",
    "set",
    "shorthand",
  ),
  value: fc.integer({ max: 20, min: -20 }),
});
const caseArbitrary: fc.Arbitrary<ObjectLiteralCase> = fc.record({
  properties: fc.array(propertyArbitrary, { maxLength: 4 }),
});

function printCase(testCase: ObjectLiteralCase): string {
  const bindings: string[] = [];
  const tokens: string[] = [];
  const reads: string[] = [];
  testCase.properties.forEach((property, index) => {
    const name = `p${index}`;
    const store = `s${index}`;
    if (property.kind === "shorthand") {
      bindings.push(`const ${name} = ${property.value};`);
      tokens.push(name);
    } else if (property.kind === "data") {
      tokens.push(`${name}: (order = order + "${index}", ${property.value})`);
    } else if (property.kind === "get") {
      tokens.push(`get ${name}() { return ${property.value}; }`);
    } else if (property.kind === "set") {
      bindings.push(`let ${store};`);
      tokens.push(`set ${name}(v) { ${store} = v; }`);
    } else {
      tokens.push(`${name}() { return ${property.value}; }`);
    }
    if (property.kind === "method") {
      reads.push(
        `console.log("${name}", typeof o.${name}, o.${name}(), ` +
          `o.${name}.name, "prototype" in o.${name});`,
      );
    } else if (property.kind === "set") {
      reads.push(
        `o.${name} = ${property.value};\n` +
          `console.log("${name}", ${store});`,
      );
    } else {
      reads.push(`console.log("${name}", o.${name});`);
    }
  });
  return `
let order = "";
${bindings.join("\n")}
const o = { ${tokens.join(", ")} };
let keyList = "";
for (const key of Object.keys(o)) { keyList = keyList + key + ","; }
console.log("keys", keyList);
${reads.join("\n")}
console.log("order", order);
`;
}

function expected(testCase: ObjectLiteralCase): string {
  const lines: string[] = [];
  const keys = testCase.properties.map((_property, index) => `p${index}`);
  lines.push(`keys ${keys.map((key) => `${key},`).join("")}`);
  testCase.properties.forEach((property, index) => {
    const name = `p${index}`;
    lines.push(
      property.kind === "method"
        ? `${name} function ${property.value} ${name} false`
        : `${name} ${property.value}`,
    );
  });
  let order = "";
  testCase.properties.forEach((property, index) => {
    if (property.kind === "data") order += String(index);
  });
  lines.push(`order ${order}`);
  return `${lines.join("\n")}\n`;
}

async function references(source: string): Promise<
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
  const directory = await host.makeTemporaryDirectory(
    "oseo-object-literal-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(sourcePath, source);
    const observations = [
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
    ] as const;
    succeeded = true;
    return observations;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test("object literal model orders only data property evaluation", () => {
  assert.equal(
    expected({
      properties: [
        { kind: "shorthand", value: 1 },
        { kind: "data", value: 2 },
        { kind: "method", value: 3 },
        { kind: "data", value: 4 },
      ],
    }),
    "keys p0,p1,p2,p3,\n" +
      "p0 1\n" +
      "p1 2\n" +
      "p2 function 3 p2 false\n" +
      "p3 4\n" +
      "order 13\n",
  );
});

test(
  "generated object literals match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "object literals preserve generated values, keys, and evaluation " +
        "order",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-object-literal.ts" },
            { specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          if (specialization === "enabled") {
            process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
          }
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
              (native) =>
                assertMatchingObservations([expectedObservation, native]),
            );
          } finally {
            delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          }
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
          "object literals with zero to four data, shorthand, and method " +
          "properties and bounded integer values, comparing an independent " +
          "key-order and evaluation-order model with Node.js, Deno, and " +
          "both native specialization policies with forced collection on " +
          "the enabled path",
        numRuns: 15,
        profile: "M5 basic object literal expressions",
        seed: 0x5eed_0015,
        sizeLimit: "zero to four properties and bounded integer values",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
