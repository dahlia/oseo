/* eslint-disable no-await-in-loop -- Native builds run one at a time. */
import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { targetForExecutionHost } from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { runNativeCli } from "../native-cli.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/** DoWait inputs; shrinking preserves valid source and zero waits. */
interface WaitCase {
  readonly asynchronous: boolean;
  readonly bigint: boolean;
  readonly index: number;
  readonly invalidView: boolean;
  readonly mismatch: boolean;
  readonly shared: boolean;
  readonly throwsAt: "index" | "none" | "timeout" | "value";
  readonly wrongValue: boolean;
}

const anyWait = fc.record<WaitCase>({
  asynchronous: fc.boolean(),
  bigint: fc.boolean(),
  index: fc.integer({ min: -1, max: 1 }),
  invalidView: fc.boolean(),
  mismatch: fc.boolean(),
  shared: fc.boolean(),
  throwsAt: fc.constantFrom("index", "none", "timeout", "value"),
  wrongValue: fc.boolean(),
});

// Every case reaches the policy/comparison step at least once; optional
// extra calls explore invalid inputs and abrupt conversions as well.
const cases = fc
  .tuple(
    fc.record<WaitCase>({
      asynchronous: fc.boolean(),
      bigint: fc.boolean(),
      index: fc.constant(0),
      invalidView: fc.constant(false),
      mismatch: fc.boolean(),
      shared: fc.constant(true),
      throwsAt: fc.constant("none"),
      wrongValue: fc.constant(false),
    }),
    fc.array(anyWait, { maxLength: 5 }),
  )
  .map(([valid, extra]) => [valid].concat(extra));

/** Independent validation/conversion model, without calling Atomics. */
function expected(input: WaitCase, canBlock: boolean): string {
  if (input.invalidView || !input.shared) return ":TypeError";
  if (input.throwsAt === "index") return "i:SyntaxError";
  if (input.index !== 0) return "i:RangeError";
  if (input.throwsAt === "value") return "iv:SyntaxError";
  if (input.wrongValue) return "iv:TypeError";
  if (input.throwsAt === "timeout") return "ivt:SyntaxError";
  if (!input.asynchronous && !canBlock) return "ivt:TypeError";
  return `ivt:${input.mismatch ? "not-equal" : "timed-out"}`;
}

function source(inputs: readonly WaitCase[]): string {
  return inputs
    .map((input, i) => {
      const constructor = input.invalidView
        ? "Uint8Array"
        : input.bigint
          ? "BigInt64Array"
          : "Int32Array";
      const buffer = input.shared ? "SharedArrayBuffer" : "ArrayBuffer";
      const value = input.mismatch ? "1" : "0";
      const valueExpression =
        input.bigint !== input.wrongValue ? `${value}n` : value;
      const conversion = (step: WaitCase["throwsAt"], result: string) =>
        input.throwsAt === step
          ? 'throw new SyntaxError("sentinel");'
          : `return ${result};`;
      return `{
  let log = "";
  const view = new ${constructor}(new ${buffer}(8), 0, 1);
  const index = { valueOf() { log += "i";
    ${conversion("index", String(input.index))} } };
  const value = { valueOf() { log += "v";
    ${conversion("value", valueExpression)} } };
  const timeout = { valueOf() { log += "t";
    ${conversion("timeout", "0")} } };
  let outcome;
  try {
    outcome = Atomics.${input.asynchronous ? "waitAsync" : "wait"}(
      view, index, value, timeout);
    ${input.asynchronous ? "outcome = outcome.value;" : ""}
  } catch (error) { outcome = error.name; }
  console.log("${i}", log + ":" + outcome);
}`;
    })
    .join("\n");
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);

test(
  "generated DoWait validation precedes the executing agent's policy",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "argument validation and conversions precede CanBlock and comparison",
      fc.asyncProperty(cases, async (inputs) => {
        for (const canBlock of [false, true]) {
          for (const specialization of ["disabled", "enabled"] as const) {
            if (specialization === "enabled") {
              process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
            }
            try {
              const result = await runNativeCli(
                {
                  args: [
                    "--test262-host",
                    ...(canBlock ? [] : ["--test262-non-blocking"]),
                    ...(specialization === "disabled"
                      ? ["--no-specialization"]
                      : []),
                    "generated-wait.js",
                  ],
                  source: source(inputs),
                  version: "0.1.0",
                },
                host,
              );
              assert.equal(result.exitStatus, 0, result.stderr);
              assert.equal(result.stderr, "");
              assert.equal(
                result.stdout,
                inputs
                  .map((input, i) => `${i} ${expected(input, canBlock)}\n`)
                  .join(""),
              );
            } finally {
              delete process.env.OSEO_GC_EVERY_SAFEPOINT;
            }
          }
        }
      }),
      {
        context: ["native-collector=forced-on-enabled"],
        domain:
          "one to six wait/waitAsync calls over shared/unshared, " +
          "Int32/BigInt64/non-waitable views, indices -1..1, matching or " +
          "mismatching values, wrong numeric types, and throwing index, " +
          "value or timeout conversion; both main-agent policies",
        numRuns: 5,
        profile: "M5 non-blocking agent",
        seed: 0x6000_9400,
        sizeLimit: "six calls, one-element views, zero timeout",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
