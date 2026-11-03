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
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/*
 * Generated call graphs for ADR 0034's legacy `caller` and `arguments`.
 * A program is a set of functions, each non-strict, strict, or a
 * non-strict arrow, whose bodies read other functions' properties, call
 * each other through every call form, throw, catch, and, in strict code,
 * make proper tail calls. A depth argument bounds recursion. Graphs
 * marked mutating also define, freeze, and delete the two properties,
 * which ADR 0034 makes configurable unlike V8. The oracle below runs the
 * same graph over an explicit activation stack. Both native specialization
 * policies must print what it predicts, and so must Node.js, the only
 * reference host that ships the extension, for every graph that does not
 * mutate.
 */
type FunctionKind = "arrow" | "sloppy" | "strict";

type CallForm =
  | "apply"
  | "bind"
  | "call"
  | "direct"
  | "map"
  | "proxy"
  | "reflect";

type Step =
  | { readonly kind: "read"; readonly target: number }
  | {
      readonly form: CallForm;
      readonly guarded: boolean;
      readonly kind: "call";
      readonly target: number;
      readonly value: number;
    }
  | { readonly kind: "throw" }
  | {
      readonly how: Mutation;
      readonly kind: "mutate";
      readonly target: number;
    };

/** A definition with an empty descriptor, `Object.freeze`, or delete. */
type Mutation = "define" | "delete" | "freeze";

interface GeneratedFunction {
  readonly kind: FunctionKind;
  readonly steps: readonly Step[];
  /** A strict function's final `return` call, a proper tail call. */
  readonly tail?: {
    readonly form: "call" | "direct";
    readonly target: number;
    readonly value: number;
  };
}

interface CallGraph {
  readonly depth: number;
  readonly functions: readonly GeneratedFunction[];
  /** False keeps the graph comparable with V8's descriptors. */
  readonly mutating: boolean;
}

const maximumFunctions = 4;

function stepArbitrary(count: number, mutating: boolean): fc.Arbitrary<Step> {
  const target = fc.integer({ max: count - 1, min: 0 });
  const mutation = fc.record({
    how: fc.constantFrom<Mutation>("define", "delete", "freeze"),
    kind: fc.constant("mutate" as const),
    target,
  });
  return fc.oneof(
    ...(mutating ? [mutation] : []),
    fc.record({ kind: fc.constant("read" as const), target }),
    fc.record({
      form: fc.constantFrom<CallForm>(
        "apply",
        "bind",
        "call",
        "direct",
        "map",
        "proxy",
        "reflect",
      ),
      guarded: fc.boolean(),
      kind: fc.constant("call" as const),
      target,
      value: fc.integer({ max: 9, min: 0 }),
    }),
    fc.constant({ kind: "throw" as const }),
  );
}

const graphArbitrary: fc.Arbitrary<CallGraph> = fc
  .tuple(fc.integer({ max: maximumFunctions, min: 1 }), fc.boolean())
  .chain(([count, mutating]) =>
    fc.record({
      depth: fc.integer({ max: 3, min: 1 }),
      functions: fc.array(
        fc
          .record({
            kind: fc.constantFrom<FunctionKind>("arrow", "sloppy", "strict"),
            steps: fc.array(stepArbitrary(count, mutating), { maxLength: 4 }),
            tail: fc.option(
              fc.record({
                form: fc.constantFrom<"call" | "direct">("call", "direct"),
                target: fc.integer({ max: count - 1, min: 0 }),
                value: fc.integer({ max: 9, min: 0 }),
              }),
              { nil: undefined },
            ),
          })
          .map((fn): GeneratedFunction =>
            fn.kind === "strict" && fn.tail != null
              ? { kind: fn.kind, steps: fn.steps, tail: fn.tail }
              : { kind: fn.kind, steps: fn.steps },
          ),
        { maxLength: count, minLength: count },
      ),
      mutating: fc.constant(mutating),
    }),
  );

function callExpression(form: CallForm, target: number, value: number) {
  const callee = `F${target}`;
  switch (form) {
    case "apply":
      return `${callee}.apply(null, [d - 1, ${value}])`;
    case "bind":
      return `${callee}.bind(null, d - 1)(${value})`;
    case "call":
      return `${callee}.call(null, d - 1, ${value})`;
    case "direct":
      return `${callee}(d - 1, ${value})`;
    case "map":
      return `[d - 1].map(${callee})`;
    case "proxy":
      return `new Proxy(${callee}, {})(d - 1, ${value})`;
    case "reflect":
      return `Reflect.apply(${callee}, null, [d - 1, ${value}])`;
  }
}

function printMutation(how: Mutation, target: number): string {
  // A strict body throws where a non-strict one ignores a refused
  // delete or definition; either way the program goes on.
  const callee = `F${target}`;
  switch (how) {
    case "define":
      return (
        `try { Object.defineProperty(${callee}, "caller", {}); ` +
        `Object.defineProperty(${callee}, "arguments", {}); } catch (e) {}`
      );
    case "delete":
      return (
        `try { delete ${callee}.caller; delete ${callee}.arguments; } ` +
        "catch (e) {}"
      );
    case "freeze":
      return `Object.freeze(${callee});`;
  }
}

function printStep(step: Step, index: number, position: number): string {
  switch (step.kind) {
    case "read":
      return (
        `log.push("${index}.${position} " + ` +
        `attempt(function () { return nm(F${step.target}.caller) + " " + ` +
        `args(F${step.target}); }));`
      );
    case "throw":
      return `if (d % 2 === 1) throw "T${index}.${position}";`;
    case "mutate":
      return printMutation(step.how, step.target);
    case "call": {
      const call = callExpression(step.form, step.target, step.value);
      return step.guarded
        ? `if (d > 0) { try { ${call}; } catch (e) { ` +
            `log.push("caught " + e); } }`
        : `if (d > 0) ${call};`;
    }
  }
}

function printGraph(graph: CallGraph): string {
  const functions = graph.functions.map((fn, index) => {
    const body = [
      ...(fn.kind === "strict" ? ['"use strict";'] : []),
      ...fn.steps.map((step, position) => printStep(step, index, position)),
      ...(fn.tail == null
        ? []
        : [
            `if (d > 0) return ${callExpression(
              fn.tail.form,
              fn.tail.target,
              fn.tail.value,
            )};`,
          ]),
    ].join("\n  ");
    return fn.kind === "arrow"
      ? `var F${index} = (d, x) => {\n  ${body}\n};`
      : `function F${index}(d, x) {\n  ${body}\n}`;
  });
  return `
var log = [];
function nm(v) { return v === null ? "null" : v.name; }
function args(f) {
  var a = f.arguments;
  return a === null ? "null" : a.length + "/" + a[1];
}
function attempt(fn) {
  try { return fn(); } catch (e) { return "throws " + e.constructor.name; }
}
${functions.join("\n")}
function main() {
  try { F0(${graph.depth}, 0); } catch (e) { log.push("uncaught " + e); }
  console.log(log.join("\\n"));
}
main();
`;
}

interface Activation {
  readonly argumentCount: number;
  readonly caller: string;
  readonly fn: number;
  readonly second: number | undefined;
}

class Thrown {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }
}

/** The independent activation model ADR 0034 describes. */
function expected(graph: CallGraph): string {
  const log: string[] = [];
  const stack: Activation[] = [];
  // A non-strict function's properties stay live until a definition or
  // freeze fixes the text a read prints, or a delete removes them. A
  // frozen function's fixed properties can no longer be deleted.
  const fixed = new Map<number, string | "deleted">();
  const frozen = new Set<number>();
  const reportable = (fn: number): boolean =>
    graph.functions[fn]!.kind !== "strict";
  const run = (
    fn: number,
    caller: string,
    argumentCount: number,
    depth: number,
    second: number | undefined,
  ): void => {
    stack.push({ argumentCount, caller, fn, second });
    try {
      const value = graph.functions[fn]!;
      const call = (form: CallForm, target: number, argument: number): void => {
        // Every form but `map` is transparent; `map` is a built-in that
        // makes the call itself, and passes (value, index, array).
        const reported =
          form === "map" ? "null" : reportable(fn) ? `F${fn}` : "null";
        if (form === "map") run(target, reported, 3, depth - 1, 0);
        else run(target, reported, 2, depth - 1, argument);
      };
      const live = (target: number): string => {
        const latest = stack.findLast((entry) => entry.fn === target);
        return latest == null
          ? "null null"
          : `${latest.caller} ${latest.argumentCount}/${latest.second}`;
      };
      for (const [position, step] of value.steps.entries()) {
        if (step.kind === "read") {
          const state = fixed.get(step.target);
          if (
            graph.functions[step.target]!.kind !== "sloppy" ||
            state === "deleted"
          ) {
            log.push(`${fn}.${position} throws TypeError`);
            continue;
          }
          log.push(`${fn}.${position} ${state ?? live(step.target)}`);
        } else if (step.kind === "mutate") {
          if (graph.functions[step.target]!.kind !== "sloppy") continue;
          const state = fixed.get(step.target);
          if (step.how === "delete") {
            if (!frozen.has(step.target)) fixed.set(step.target, "deleted");
            continue;
          }
          if (state == null) fixed.set(step.target, live(step.target));
          if (step.how === "freeze") frozen.add(step.target);
        } else if (step.kind === "throw") {
          if (depth % 2 === 1) throw new Thrown(`T${fn}.${position}`);
        } else if (depth > 0) {
          if (!step.guarded) call(step.form, step.target, step.value);
          else {
            try {
              call(step.form, step.target, step.value);
            } catch (error) {
              if (!(error instanceof Thrown)) throw error;
              log.push(`caught ${error.value}`);
            }
          }
        }
      }
      if (value.tail != null && depth > 0) {
        // A strict function's tail call reports null, like any call it
        // makes, although Oseo has already released its frame.
        call(value.tail.form, value.tail.target, value.tail.value);
      }
    } finally {
      stack.pop();
    }
  };
  try {
    run(0, "main", 2, graph.depth, 0);
  } catch (error) {
    if (!(error instanceof Thrown)) throw error;
    log.push(`uncaught ${error.value}`);
  }
  return `${log.join("\n")}\n`;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

async function nodeReference(source: string) {
  const directory = await host.makeTemporaryDirectory(
    "oseo-legacy-caller-property-",
  );
  const sourcePath = `${directory}/case.cjs`;
  let succeeded = false;
  try {
    // `vm` runs the program as Script code, so no wrapper function sits
    // below `main` and the answers match a native Script.
    await host.writeTextFile(
      sourcePath,
      `require("node:vm").runInThisContext(${JSON.stringify(source)});\n`,
    );
    const observation = await host.run({
      args: [sourcePath],
      command: process.execPath,
      cwd: directory,
    });
    succeeded = true;
    return observation;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test("the activation model reports the reviewed fixed graph", () => {
  const graph: CallGraph = {
    depth: 2,
    functions: [
      {
        kind: "sloppy",
        steps: [
          { form: "call", guarded: true, kind: "call", target: 1, value: 4 },
          { kind: "read", target: 0 },
        ],
      },
      {
        kind: "strict",
        steps: [{ kind: "read", target: 0 }],
        tail: { form: "direct", target: 0, value: 7 },
      },
    ],
    mutating: false,
  };
  assert.equal(expected(graph), "1.0 main 2/0\n0.1 null 2/7\n0.1 main 2/0\n");
});

test("the activation model fixes and deletes in a reviewed graph", () => {
  const graph: CallGraph = {
    depth: 1,
    functions: [
      {
        kind: "sloppy",
        steps: [
          { form: "direct", guarded: false, kind: "call", target: 1, value: 3 },
          { kind: "read", target: 1 },
          { kind: "read", target: 2 },
        ],
      },
      {
        kind: "sloppy",
        steps: [
          { how: "define", kind: "mutate", target: 1 },
          { how: "freeze", kind: "mutate", target: 2 },
          { how: "delete", kind: "mutate", target: 2 },
        ],
      },
      { kind: "sloppy", steps: [] },
    ],
    mutating: true,
  };
  assert.equal(expected(graph), "0.1 F0 2/3\n0.2 null null\n");
});

test(
  "generated call graphs report the modeled caller and arguments",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "legacy caller and arguments follow the activation model",
      fc.asyncProperty(graphArbitrary, async (graph) => {
        const source = printGraph(graph);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(graph),
        };
        if (!graph.mutating) {
          assertMatchingObservations([
            expectedObservation,
            await nodeReference(source),
          ]);
        }
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-legacy-caller.js" },
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
                toolchain: nativeToolchain,
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
          "one to four non-strict, strict, or arrow functions whose bodies " +
          "read caller and arguments, call through seven forms, throw, " +
          "catch, make strict tail calls, and in mutating graphs define, " +
          "freeze, and delete both properties, at a depth of one to three",
        numRuns: 12,
        profile: "post-M5 legacy caller",
        seed: 0x6000_9800,
        sizeLimit: "four functions of four steps each and depth three",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
