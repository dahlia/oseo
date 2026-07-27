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

type PropertyKind =
  | "data"
  | "get"
  | "method"
  | "set"
  | "shorthand"
  | "spread"
  | "spread-nullish";

interface PropertySpec {
  readonly kind: PropertyKind;
  /**
   * Own keys of a `spread` source, as indices into the shared `p<n>` key
   * pool the other property kinds also define, so a generated spread can
   * introduce a fresh key or overwrite an earlier definition. Ignored by
   * every other kind.
   */
  readonly spreadKeys: readonly number[];
  readonly value: number;
}

interface ObjectLiteralCase {
  readonly properties: readonly PropertySpec[];
}

/** The final state of one own key after every property is applied. */
interface KeyState {
  readonly kind: "data" | "get" | "method" | "set";
  /** Index of the property that last defined the key. */
  readonly owner: number;
  readonly value: number;
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
    "spread",
    "spread-nullish",
  ),
  spreadKeys: fc.array(fc.integer({ max: 4, min: 0 }), { maxLength: 3 }),
  value: fc.integer({ max: 20, min: -20 }),
});
/**
 * V8 enumerates an accessor defined after an object literal spread property
 * last instead of in property-creation order, so Node.js and Deno disagree
 * with ECMA-262 for that one combination and cannot act as references for it.
 * The generator rewrites such an accessor as a data property; the fixed
 * tests/fixtures/object-spread-accessor-order.js native check keeps the
 * specified order as evidence without a reference observation.
 */
const caseArbitrary: fc.Arbitrary<ObjectLiteralCase> = fc
  .record({ properties: fc.array(propertyArbitrary, { maxLength: 4 }) })
  .map((testCase) => {
    let spread = false;
    return {
      properties: testCase.properties.map((property) => {
        if (property.kind === "spread" || property.kind === "spread-nullish") {
          spread = true;
          return property;
        }
        return spread && (property.kind === "get" || property.kind === "set")
          ? { ...property, kind: "data" as const }
          : property;
      }),
    };
  });

/**
 * Independent model of the own keys an object literal ends with: a key holds
 * its first insertion position and the definition that last replaced it, and
 * a spread contributes each of its source keys as a data property.
 */
function modelKeys(
  testCase: ObjectLiteralCase,
): readonly (readonly [string, KeyState])[] {
  const insertion: string[] = [];
  const states = new Map<string, KeyState>();
  const define = (key: string, state: KeyState): void => {
    if (!states.has(key)) insertion.push(key);
    states.set(key, state);
  };
  testCase.properties.forEach((property, index) => {
    if (property.kind === "spread-nullish") return;
    if (property.kind === "spread") {
      property.spreadKeys.forEach((key, offset) => {
        define(`p${key}`, {
          kind: "data",
          owner: index,
          value: property.value + offset,
        });
      });
      return;
    }
    define(`p${index}`, {
      kind: property.kind === "shorthand" ? "data" : property.kind,
      owner: index,
      value: property.value,
    });
  });
  return insertion.map((key) => [key, states.get(key)!] as const);
}

function printCase(testCase: ObjectLiteralCase): string {
  const bindings: string[] = [];
  const tokens: string[] = [];
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
    } else if (property.kind === "spread") {
      const entries = property.spreadKeys
        .map((key, offset) => `p${key}: ${property.value + offset}`)
        .join(", ");
      tokens.push(`...(order = order + "${index}", { ${entries} })`);
    } else if (property.kind === "spread-nullish") {
      tokens.push(`...(order = order + "${index}", null)`);
    } else {
      tokens.push(`${name}() { return ${property.value}; }`);
    }
  });
  const reads = modelKeys(testCase).map(([key, state]) => {
    if (state.kind === "method") {
      return (
        `console.log("${key}", typeof o.${key}, o.${key}(), ` +
        `o.${key}.name, "prototype" in o.${key});`
      );
    }
    if (state.kind === "set") {
      return (
        `o.${key} = ${state.value};\n` +
        `console.log("${key}", s${state.owner});`
      );
    }
    return `console.log("${key}", o.${key});`;
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
  const entries = modelKeys(testCase);
  const lines: string[] = [];
  lines.push(`keys ${entries.map(([key]) => `${key},`).join("")}`);
  for (const [key, state] of entries) {
    lines.push(
      state.kind === "method"
        ? `${key} function ${state.value} ${key} false`
        : `${key} ${state.value}`,
    );
  }
  let order = "";
  testCase.properties.forEach((property, index) => {
    if (
      property.kind === "data" ||
      property.kind === "spread" ||
      property.kind === "spread-nullish"
    ) {
      order += String(index);
    }
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

test("object literal model orders only evaluated property definitions", () => {
  assert.equal(
    expected({
      properties: [
        { kind: "shorthand", spreadKeys: [], value: 1 },
        { kind: "data", spreadKeys: [], value: 2 },
        { kind: "method", spreadKeys: [], value: 3 },
        { kind: "data", spreadKeys: [], value: 4 },
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

test("object literal model keeps spread key positions and last values", () => {
  const testCase: ObjectLiteralCase = {
    properties: [
      { kind: "spread", spreadKeys: [2, 0], value: 7 },
      { kind: "data", spreadKeys: [], value: 1 },
      { kind: "spread-nullish", spreadKeys: [], value: 0 },
      { kind: "get", spreadKeys: [], value: 5 },
    ],
  };
  assert.equal(
    expected(testCase),
    "keys p2,p0,p1,p3,\n" +
      "p2 7\n" +
      "p0 8\n" +
      "p1 1\n" +
      "p3 5\n" +
      "order 012\n",
  );
  const source = printCase(testCase);
  assert.match(source, /\.\.\.\(order = order \+ "0", \{ p2: 7, p0: 8 \}\)/u);
  assert.match(source, /\.\.\.\(order = order \+ "2", null\)/u);
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
          "object literals with zero to four data, shorthand, method, " +
          "getter, setter, object spread, and nullish spread properties " +
          "over a shared five-name key pool and bounded integer values, " +
          "comparing an independent key-order, last-definition, and " +
          "evaluation-order model with Node.js, Deno, and both native " +
          "specialization policies with forced collection on the enabled " +
          "path",
        numRuns: 15,
        profile: "M5 basic object literal expressions",
        seed: 0x5eed_0015,
        sizeLimit:
          "zero to four properties, zero to three spread source keys, and " +
          "bounded integer values",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
