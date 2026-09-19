/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
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
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

interface SymbolCase {
  readonly keys: readonly string[];
  readonly ordinaryDescription: string | undefined;
}

// Registry keys are UTF-16 code-unit sequences, so the units include NUL, a
// non-ASCII BMP letter, both halves of an astral pair, which may appear
// alone as lone surrogates, and ordinary ASCII.
const textArbitrary = fc.string({
  maxLength: 8,
  unit: fc.constantFrom(
    ..."abcxyz012 -_",
    "\u0000",
    "\u00e9",
    "\ud83d",
    "\ude00",
  ),
});

const caseArbitrary: fc.Arbitrary<SymbolCase> = fc.record({
  keys: fc.array(textArbitrary, { maxLength: 5, minLength: 1 }),
  ordinaryDescription: fc.option(textArbitrary, { nil: undefined }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function sourceFor(testCase: SymbolCase): string {
  const keys = JSON.stringify(testCase.keys);
  const ordinary =
    testCase.ordinaryDescription == null
      ? "Symbol()"
      : `Symbol(${JSON.stringify(testCase.ordinaryDescription)})`;
  return `
const keys = ${keys};
function units(text) {
  if (text === undefined) return "undefined";
  let rendered = "[";
  for (let index = 0; index < text.length; index = index + 1) {
    if (index > 0) rendered = rendered + ",";
    rendered = rendered + text.charCodeAt(index);
  }
  return rendered + "]";
}
const registered = [];
for (let index = 0; index < keys.length; index = index + 1) {
  const symbol = Symbol.for(keys[index]);
  registered[index] = symbol;
  console.log(
    "entry",
    index,
    units(symbol.description),
    units(Symbol.keyFor(symbol)),
    symbol.toString() === "Symbol(" + keys[index] + ")",
    symbol === Symbol.for(keys[index]),
  );
}
for (let left = 0; left < registered.length; left = left + 1) {
  for (let right = 0; right < registered.length; right = right + 1) {
    console.log("pair", left, right, registered[left] === registered[right]);
  }
}
const ordinary = ${ordinary};
const wrapper = Object(ordinary);
console.log(
  "ordinary",
  units(ordinary.description),
  units(ordinary.toString()),
  Symbol.keyFor(ordinary),
  Symbol.prototype.valueOf.call(wrapper) === ordinary,
  Symbol.prototype[Symbol.toPrimitive].call(wrapper, "string") === ordinary,
);
const keyed = {};
for (let index = 0; index < registered.length; index = index + 1) {
  keyed[registered[index]] = index;
}
console.log("property count", Reflect.ownKeys(keyed).length);
let turn = 0;
while (turn < 2) {
  console.log(
    "guard",
    Symbol.for === Symbol.for,
    units(Symbol.keyFor(registered[0])),
  );
  if (turn === 0) Symbol.generatedMarker = true;
  turn = turn + 1;
}
console.log("marker", Symbol.generatedMarker, delete Symbol.generatedMarker);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log(
  "hint",
  hinted(registered.length, 1),
  units(hinted(Symbol.keyFor(registered[0]), 1)),
);
`;
}

/** Renders UTF-16 code units the way the generated program prints them. */
function units(text: string | undefined): string {
  if (text === undefined) return "undefined";
  const codes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    codes.push(text.charCodeAt(index));
  }
  return `[${codes.join(",")}]`;
}

function expected(testCase: SymbolCase): string {
  const lines: string[] = [];
  for (const [index, key] of testCase.keys.entries()) {
    lines.push(`entry ${index} ${units(key)} ${units(key)} true true`);
  }
  for (let left = 0; left < testCase.keys.length; left += 1) {
    for (let right = 0; right < testCase.keys.length; right += 1) {
      lines.push(
        `pair ${left} ${right} ` +
          String(testCase.keys[left] === testCase.keys[right]),
      );
    }
  }
  const description = testCase.ordinaryDescription;
  lines.push(
    `ordinary ${units(description)} ` +
      `${units(`Symbol(${description ?? ""})`)} undefined true true`,
  );
  lines.push(`property count ${new Set(testCase.keys).size}`);
  lines.push(`guard true ${units(testCase.keys[0])}`);
  lines.push(`guard true ${units(testCase.keys[0])}`);
  lines.push("marker true true");
  lines.push(
    `hint ${testCase.keys.length + 1} ${units(`${testCase.keys[0]}1`)}`,
    "",
  );
  return lines.join("\n");
}

async function references(source: string) {
  const directory = await host.makeTemporaryDirectory("oseo-symbol-property-");
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});`,
    );
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

test(
  "generated Symbol prototype and registry behavior matches the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Symbol registry identity, descriptions, and property keys agree",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = sourceFor(testCase);
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
            { source, sourceId: "generated-m5-symbol-intrinsic.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /property-get generic/u);
            assert.match(mir, /guard-smi/u);
            assert.match(mir, /generic-fallback/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:shape|smi)/u);
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
                toolchain: nativeToolchain,
              },
              (native) => {
                assertMatchingObservations([expectedObservation, native]);
                assert.ok(native.counters?.collections != null);
                assert.ok(native.counters.collections > 0);
                if (specialization === "enabled") {
                  assert.ok(native.counters.guardMisses > 0);
                }
              },
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
          "one to five UTF-16 registry keys, including NUL, non-ASCII, " +
          "astral, and lone-surrogate units, with duplicates and one " +
          "optional ordinary Symbol description, a deliberate Symbol " +
          "shape-guard miss, and one false numeric hint",
        numRuns: 12,
        profile: "M5 Symbol prototype and registry",
        seed: 0x6000_7800,
        sizeLimit:
          "at most five registry keys of eight UTF-16 units, one ordinary " +
          "description, a full identity matrix, two guarded reads, and " +
          "one false numeric hint",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);
