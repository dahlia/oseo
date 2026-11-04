/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import { createContext, runInContext } from "node:vm";

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
import { base64ModelPrelude } from "../native/uint8array-base64-model.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type Alphabet = "base64" | "base64url";
type Handling = "loose" | "stop-before-partial" | "strict" | undefined;
/**
 * How the decode target is built: a fresh view, a view at an offset into
 * a larger buffer, a length-tracking view of a resizable buffer, a view
 * whose buffer is detached, or a fixed view whose resizable buffer shrank
 * below it.
 */
type TargetKind = "detached" | "offset" | "plain" | "shrunk" | "tracking";

/** One edit applied to an encoded string before it is decoded. */
interface Edit {
  readonly kind: "delete" | "insert";
  readonly position: number;
  readonly text: string;
}

interface Base64Case {
  readonly alphabet: Alphabet;
  readonly bytes: readonly number[];
  readonly edits: readonly Edit[];
  readonly handling: Handling;
  readonly hexEdits: readonly Edit[];
  readonly hexSize: number;
  readonly marker: number;
  readonly omitPadding: boolean;
  readonly size: number;
  readonly target: TargetKind;
}

const insertable = [
  " ",
  "\t",
  "\n",
  "=",
  "==",
  "A",
  "+",
  "/",
  "-",
  "_",
  "#",
  ".",
  "é",
  "　",
  "f",
  "G",
];

function editArbitrary(texts: readonly string[]): fc.Arbitrary<Edit> {
  return fc.record({
    kind: fc.constantFrom("delete" as const, "insert" as const),
    position: fc.integer({ max: 40, min: 0 }),
    text: fc.constantFrom(...texts),
  });
}

const caseArbitrary: fc.Arbitrary<Base64Case> = fc.record({
  alphabet: fc.constantFrom("base64" as const, "base64url" as const),
  bytes: fc.array(fc.integer({ max: 255, min: 0 }), { maxLength: 20 }),
  edits: fc.array(editArbitrary(insertable), { maxLength: 3 }),
  handling: fc.constantFrom(
    undefined,
    "loose" as const,
    "strict" as const,
    "stop-before-partial" as const,
  ),
  hexEdits: fc.array(editArbitrary(["0", "a", "F", "g", " ", "x"]), {
    maxLength: 2,
  }),
  hexSize: fc.integer({ max: 24, min: 0 }),
  marker: fc.integer({ max: 1_000, min: 1 }),
  omitPadding: fc.boolean(),
  size: fc.integer({ max: 24, min: 0 }),
  target: fc.constantFrom(
    "detached" as const,
    "offset" as const,
    "plain" as const,
    "shrunk" as const,
    "tracking" as const,
  ),
});

/** The model's methods, installed in a separate realm. */
const modelRealm = createContext({});
runInContext(base64ModelPrelude, modelRealm);

/** Evaluates one expression in the model realm as a String. */
function modelText(expression: string): string {
  return String(runInContext(expression, modelRealm));
}

function applyEdits(text: string, edits: readonly Edit[]): string {
  let result = text;
  for (const edit of edits) {
    const position = Math.min(edit.position, result.length);
    result =
      edit.kind === "insert"
        ? result.slice(0, position) + edit.text + result.slice(position)
        : result.slice(0, position) + result.slice(position + 1);
  }
  return result;
}

/** The base64 and hex inputs of one case, encoded by the model. */
interface CaseInputs {
  readonly encoded: string;
  readonly hex: string;
  readonly text: string;
}

function inputs(testCase: Base64Case): CaseInputs {
  const bytes = `Uint8Array.from(${JSON.stringify(testCase.bytes)})`;
  const options = JSON.stringify({
    alphabet: testCase.alphabet,
    omitPadding: testCase.omitPadding,
  });
  const encoded = modelText(`${bytes}.toBase64(${options})`);
  return {
    encoded,
    hex: applyEdits(modelText(`${bytes}.toHex()`), testCase.hexEdits),
    text: applyEdits(encoded, testCase.edits),
  };
}

function printTarget(kind: TargetKind, size: number): string {
  switch (kind) {
    case "plain":
      return `new Uint8Array(${size}).fill(255)`;
    case "offset":
      return (
        `new Uint8Array(new ArrayBuffer(${size + 3}), 2, ${size})` +
        ".fill(255)"
      );
    case "tracking":
      return (
        `new Uint8Array(new ArrayBuffer(${size}, ` +
        `{ maxByteLength: ${size + 4} })).fill(255)`
      );
    case "detached":
      return `(() => {
  const view = new Uint8Array(${size});
  view.buffer.transfer();
  return view;
})()`;
    case "shrunk":
      return `(() => {
  const buffer = new ArrayBuffer(${size + 2}, { maxByteLength: ${size + 2} });
  const view = new Uint8Array(buffer, 1, ${size});
  buffer.resize(${size});
  return view;
})()`;
  }
}

function printCase(testCase: Base64Case): string {
  const { encoded, hex, text } = inputs(testCase);
  const options = JSON.stringify({
    alphabet: testCase.alphabet,
    lastChunkHandling: testCase.handling,
  });
  const strictness = testCase.omitPadding ? "loose" : "strict";
  const markerHex = testCase.marker.toString(16).padStart(4, "0");
  return `
function show(step) {
  try {
    const value = step();
    return value instanceof Uint8Array
      ? "[" + Array.from(value).join(".") + "]"
      : JSON.stringify(value);
  } catch (error) {
    return error.constructor.name;
  }
}
const bytes = new Uint8Array([${testCase.bytes.join(", ")}]);
const encoded = bytes.toBase64({
  alphabet: "${testCase.alphabet}",
  omitPadding: ${testCase.omitPadding},
});
console.log("encode", encoded, encoded === ${JSON.stringify(encoded)});
console.log("hex", bytes.toHex());
console.log(
  "round",
  show(() => Uint8Array.fromBase64(encoded, {
    alphabet: "${testCase.alphabet}",
    lastChunkHandling: "${strictness}",
  })),
  show(() => Uint8Array.fromHex(bytes.toHex())),
);
const text = ${JSON.stringify(text)};
const options = ${options};
console.log("decode", show(() => Uint8Array.fromBase64(text, options)));
const target = ${printTarget(testCase.target, testCase.size)};
console.log(
  "set",
  show(() => target.setFromBase64(text, options)),
  show(() => target.toHex()),
);
const hexText = ${JSON.stringify(hex)};
console.log("from-hex", show(() => Uint8Array.fromHex(hexText)));
const hexTarget = new Uint8Array(${testCase.hexSize}).fill(255);
console.log(
  "set-hex",
  show(() => hexTarget.setFromHex(hexText)),
  hexTarget.toHex(),
);
let turn = 0;
while (turn < 2) {
  console.log("guard", Uint8Array.fromHex("${markerHex}")[1]);
  if (turn === 0) Uint8Array.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log(
  "hint",
  hinted(${testCase.marker}, 1),
  hinted("${testCase.marker}", 1),
);
`;
}

/** Runs a generated program against the independent model. */
function expected(source: string): string {
  const lines: string[] = [];
  const realm = createContext({
    console: {
      log: (...values: unknown[]) => lines.push(values.map(String).join(" ")),
    },
  });
  runInContext(base64ModelPrelude + source, realm);
  return lines.map((line) => `${line}\n`).join("");
}

/*
 * Deno 2.9.7 keeps decoding after setFromBase64 fills its target, where
 * the edition and the pinned test262 trailing-garbage rows stop, so a case
 * that fills a live target before the end of its text is compared with the
 * model alone.
 */
function denoComparable(testCase: Base64Case, text: string): boolean {
  if (testCase.target === "detached" || testCase.target === "shrunk") {
    return true;
  }
  const options = JSON.stringify({
    alphabet: testCase.alphabet,
    lastChunkHandling: testCase.handling,
  });
  return (
    modelText(`(() => {
  try {
    const result = new Uint8Array(${testCase.size})
      .setFromBase64(${JSON.stringify(text)}, ${options});
    return result.read === ${text.length} ||
      result.written < ${testCase.size};
  } catch {
    return true;
  }
})()`) === "true"
  );
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

async function reference(source: string): Promise<{
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-uint8array-base64-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
    );
    const observation = await host.run({
      args: ["run", "--quiet", sourcePath],
      command: "deno",
      cwd: directory,
    });
    succeeded = true;
    return observation;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test(
  "generated Uint8Array base64 and hex cases match the independent model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "base64 and hex round-trip and partial decodes match the model",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(source),
        };
        if (denoComparable(testCase, inputs(testCase).text)) {
          assertMatchingObservations([
            expectedObservation,
            await reference(source),
          ]);
        }
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-es2026-uint8array-base64.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-smi/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /generic-fallback/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:smi|shape)/u);
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
          "zero to twenty bytes encoded with either alphabet, with or " +
          "without padding, then decoded after up to three insertions or " +
          "deletions of whitespace, padding, alphabet, and invalid " +
          "characters under each lastChunkHandling, into a plain, offset, " +
          "length-tracking, detached, or shrunk target of zero to " +
          "twenty-four bytes, plus hex text after up to two edits into a " +
          "target of zero to twenty-four bytes, one constructor shape " +
          "guard miss, and one false number hint",
        numRuns: 12,
        profile: "ES2026 Uint8Array base64",
        seed: 0x6000_a700,
        sizeLimit:
          "at most twenty bytes, three base64 edits, two hex edits, and " +
          "one constructor property write",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
