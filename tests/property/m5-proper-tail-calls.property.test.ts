/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
  type MirProgram,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import { runNativeCli } from "../native-cli.ts";
import { nativeToolchain } from "../native-toolchain.ts";
import {
  chainCharges,
  nonTailResources,
  resourceDiagnostic,
  type ResourceOutcome,
  toolchainFrameContract,
} from "../proper-tail-call-resources.ts";

const { assertAsyncProperty, propertySize } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/*
 * Generated proper tail call chains (ECMA-262 15.10). Each case is a
 * structured chain of one to three functions that call one another in a
 * generated position and call form, printed only at the end so shrinking
 * keeps every function, wrapper, and form valid. Node.js and Deno have no
 * proper tail calls, so depths stay within their stacks; depths beyond
 * Oseo's 256-call limit show that no tail step nests a native frame.
 */

type FunctionForm = "arrow" | "concise" | "declaration" | "method" | "static";
type StatementWrapper =
  | "block"
  | "catch"
  | "do"
  | "else"
  | "finally"
  | "for"
  | "for-in"
  | "if"
  | "label"
  | "switch"
  | "while";
type ExpressionWrapper =
  | "and"
  | "coalesce"
  | "comma"
  | "consequent"
  | "alternate"
  | "or"
  | "parenthesized";
type CallForm =
  | "apply"
  | "bound"
  | "call"
  | "optional"
  | "plain"
  | "proxy"
  | "reflect"
  | "tagged"
  | "trap";
type NonTailContext =
  | "catch-finally"
  | "for-of"
  | "operand"
  | "sloppy"
  | "stored"
  | "try";
type Ending = "non-callable" | "return" | "revoked" | "throw";
type ClearTimeoutForm = "absent" | "extra" | "object" | "spread";

interface Hop {
  readonly expressions: readonly ExpressionWrapper[];
  readonly form: CallForm;
  readonly definition: FunctionForm;
  readonly statements: readonly StatementWrapper[];
}

interface TailCase {
  readonly clearTimeout?: ClearTimeoutForm | undefined;
  readonly depth: number;
  readonly hops: readonly Hop[];
}

interface NonTailCase {
  readonly clearTimeout?: ClearTimeoutForm | undefined;
  readonly context: NonTailContext;
  readonly depth: number;
  readonly hops: readonly Hop[];
  readonly throwAtBottom: boolean;
}

interface LivenessCase {
  readonly depth: number;
  readonly ending: Ending;
  readonly extra: number;
  readonly hops: readonly Hop[];
  readonly spread: boolean;
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const large = propertySize() === "large";
const tailDepthLimit = large ? 1200 : 500;

const hopArbitrary: fc.Arbitrary<Hop> = fc.record({
  expressions: fc.array(
    fc.constantFrom<ExpressionWrapper>(
      "and",
      "coalesce",
      "comma",
      "consequent",
      "alternate",
      "or",
      "parenthesized",
    ),
    { maxLength: 2 },
  ),
  form: fc.constantFrom<CallForm>(
    "apply",
    "bound",
    "call",
    "optional",
    "plain",
    "proxy",
    "reflect",
    "tagged",
    "trap",
  ),
  definition: fc.constantFrom<FunctionForm>(
    "arrow",
    "concise",
    "declaration",
    "method",
    "static",
  ),
  statements: fc.array(
    fc.constantFrom<StatementWrapper>(
      "block",
      "catch",
      "do",
      "else",
      "finally",
      "for",
      "for-in",
      "if",
      "label",
      "switch",
      "while",
    ),
    { maxLength: 3 },
  ),
});
const hopsArbitrary = fc.array(hopArbitrary, { maxLength: 3, minLength: 1 });
// Most depths pass the 256-call limit an ordinary chain would hit; small
// depths keep the base case and the first hops shrinkable.
const tailDepthArbitrary = fc.oneof(
  fc.integer({ max: 8, min: 0 }),
  fc.integer({ max: tailDepthLimit, min: 257 }),
);

const tailCaseArbitrary: fc.Arbitrary<TailCase> = fc.record({
  clearTimeout: fc.option(
    fc.constantFrom<ClearTimeoutForm>("absent", "extra", "object", "spread"),
    { nil: undefined },
  ),
  depth: tailDepthArbitrary,
  hops: hopsArbitrary,
});
const nonTailCaseArbitrary: fc.Arbitrary<NonTailCase> = fc.record({
  clearTimeout: fc.option(
    fc.constantFrom<ClearTimeoutForm>("absent", "extra", "object"),
    { nil: undefined },
  ),
  context: fc.constantFrom<NonTailContext>(
    "catch-finally",
    "for-of",
    "operand",
    "sloppy",
    "stored",
    "try",
  ),
  // Each step keeps at most two generated frames, a hop or its immediately
  // invoked arrow and a non-strict trap handler or tag, and forwarding
  // gives its call level back, so the chain stays below the 256-call
  // limit. Wide frames may still exhaust the active frame budget first;
  // `nonTailResources` predicts which draws do.
  depth: fc.integer({ max: 60, min: 0 }),
  hops: hopsArbitrary,
  throwAtBottom: fc.boolean(),
});
const livenessCaseArbitrary: fc.Arbitrary<LivenessCase> = fc.record({
  depth: tailDepthArbitrary,
  ending: fc.constantFrom<Ending>("non-callable", "return", "revoked", "throw"),
  extra: fc.integer({ max: large ? 12 : 6, min: 0 }),
  hops: hopsArbitrary,
  spread: fc.boolean(),
});

/** The callable expression a call form uses to reach hop `index`. */
function hopReference(hops: readonly Hop[], index: number): string {
  const definition = hops[index]!.definition;
  if (definition === "method") return `holder${index}.hop`;
  if (definition === "static") return `Hop${index}.hop`;
  return `hop${index}`;
}

/** Declarations every call form of hop `index` needs. */
function formSupport(hops: readonly Hop[], index: number): string {
  const target = hopReference(hops, index);
  return `
const bound${index} = ${target}.bind(null);
const proxy${index} = new Proxy(${target}, {});
const trap${index} = new Proxy(function () {}, {
  apply(target, thisArgument, values) { return ${target}(...values); },
});
const tag${index} = (strings, ...values) => ${target}(...values);
`;
}

function callExpression(
  form: CallForm,
  hops: readonly Hop[],
  next: number,
  values: readonly string[],
  spread = false,
): string {
  const target = hopReference(hops, next);
  // A tagged call passes each value as one substitution.
  if (form === "tagged") {
    return `tag${next}\`${values.map((value) => `\${${value}}`).join(",")}\``;
  }
  const argumentsSource = spread
    ? `...[${values.join(", ")}]`
    : values.join(", ");
  if (form === "plain") return `${target}(${argumentsSource})`;
  if (form === "call") return `${target}.call(null, ${argumentsSource})`;
  if (form === "apply") return `${target}.apply(null, [${argumentsSource}])`;
  if (form === "reflect") {
    return `Reflect.apply(${target}, null, [${argumentsSource}])`;
  }
  if (form === "optional") return `${target}?.(${argumentsSource})`;
  if (form === "bound") return `bound${next}(${argumentsSource})`;
  if (form === "proxy") return `proxy${next}(${argumentsSource})`;
  return `trap${next}(${argumentsSource})`;
}

function wrapExpression(
  wrappers: readonly ExpressionWrapper[],
  call: string,
): string {
  // Every operand is parenthesized, which keeps `??` apart from `&&`
  // and `||` and never changes whether the call is in tail position.
  let expression = call;
  for (const wrapper of wrappers) {
    if (wrapper === "and") expression = `true && (${expression})`;
    else if (wrapper === "or") expression = `false || (${expression})`;
    else if (wrapper === "coalesce") expression = `null ?? (${expression})`;
    else if (wrapper === "comma") expression = `(0, ${expression})`;
    else if (wrapper === "consequent") {
      expression = `n !== 0 ? (${expression}) : "unreachable"`;
    } else if (wrapper === "alternate") {
      expression = `n === 0 ? "unreachable" : (${expression})`;
    } else expression = `(${expression})`;
  }
  return expression;
}

function wrapStatements(
  wrappers: readonly StatementWrapper[],
  inner: string,
): string {
  let body = inner;
  wrappers.forEach((wrapper, depth) => {
    if (wrapper === "block") body = `{ ${body} }`;
    else if (wrapper === "if") body = `if (true) { ${body} }`;
    else if (wrapper === "else") {
      body = `if (n < 0) { return "unreachable"; } else { ${body} }`;
    } else if (wrapper === "while") body = `while (true) { ${body} }`;
    else if (wrapper === "do") body = `do { ${body} } while (false);`;
    else if (wrapper === "for") {
      body = `for (let j${depth} = 0; j${depth} < 1; j${depth}++) { ${body} }`;
    } else if (wrapper === "for-in") {
      body = `for (const k${depth} in { k: 1 }) { ${body} }`;
    } else if (wrapper === "label") body = `label${depth}: { ${body} }`;
    else if (wrapper === "switch") body = `switch (0) { case 0: { ${body} } }`;
    else if (wrapper === "catch") {
      body = `try { throw 0; } catch (error${depth}) { ${body} }`;
    } else body = `try { steps += 0; } finally { ${body} }`;
  });
  return body;
}

/** One hop function: its base case, then the call to the next hop. */
function hopSource(
  hops: readonly Hop[],
  index: number,
  parameters: string,
  base: string,
  returned: string,
  directive = "",
): string {
  const hop = hops[index]!;
  const body =
    `${directive}steps += 1; ` +
    wrapStatements(
      hop.statements,
      `if (n === 0) { ${base} } return ${returned};`,
    );
  if (hop.definition === "concise" && directive === "") {
    return (
      `const hop${index} = (${parameters}) => ` +
      `(steps += 1, n === 0 ? (() => { ${base} })() : ${returned});`
    );
  }
  if (hop.definition === "declaration" || hop.definition === "concise") {
    return `function hop${index}(${parameters}) { ${body} }`;
  }
  if (hop.definition === "arrow") {
    return `const hop${index} = (${parameters}) => { ${body} };`;
  }
  if (hop.definition === "method") {
    return `const holder${index} = { hop(${parameters}) { ${body} } };`;
  }
  return `class Hop${index} { static hop(${parameters}) { ${body} } }`;
}

/** Unknown handles never coerce; all extra arguments still evaluate. */
function clearTimeoutExpression(form: ClearTimeoutForm): string {
  if (form === "absent") return "clearTimeout()";
  const inert = '{ [Symbol.toPrimitive]() { throw "coerced"; } }';
  // The throwing hook is a native-only fixed contract test: Deno coerces
  // object handles, unlike Oseo's existing numeric-only host intrinsic.
  if (form === "object") return "clearTimeout({ live: true })";
  const argumentsSource = `undefined, (steps += 0, ${inert})`;
  return form === "spread"
    ? `clearTimeout(...[${argumentsSource}])`
    : `clearTimeout(${argumentsSource})`;
}

function printTailCase(testCase: TailCase): string {
  const { hops } = testCase;
  const functions = hops.map((hop, index) => {
    const next = (index + 1) % hops.length;
    const call = callExpression(hop.form, hops, next, ["n - 1"]);
    return hopSource(
      hops,
      index,
      "n",
      testCase.clearTimeout == null
        ? `return "done ${index}";`
        : `return ${clearTimeoutExpression(testCase.clearTimeout)};`,
      wrapExpression(hop.expressions, call),
    );
  });
  return `"use strict";
let steps = 0;
${functions.join("\n")}
${hops.map((_, index) => formSupport(hops, index)).join("\n")}
const result = ${hopReference(hops, 0)}(${testCase.depth});
console.log(result, steps);
`;
}

function expectedTailOutput(testCase: TailCase): string {
  const last = testCase.depth % testCase.hops.length;
  const result = testCase.clearTimeout == null ? `done ${last}` : "undefined";
  return `${result} ${testCase.depth + 1}\n`;
}

/** Wraps a returned call in a context that keeps it out of tail position. */
function nonTailReturn(context: NonTailContext, call: string): string {
  if (context === "try") {
    return (
      `(() => { try { return ${call}; } ` +
      "catch (error) { throw error; } })()"
    );
  }
  if (context === "catch-finally") {
    return (
      "(() => { try { throw 0; } catch (error) { " +
      `return ${call}; } finally { steps += 0; } })()`
    );
  }
  if (context === "for-of") {
    return `(() => { for (const value of [0]) return ${call}; })()`;
  }
  if (context === "operand") return `${call} + ""`;
  if (context === "stored") return `[${call}][0]`;
  return call;
}

function printNonTailCase(testCase: NonTailCase): string {
  const { hops } = testCase;
  const sloppy = testCase.context === "sloppy";
  const functions = hops.map((hop, index) => {
    const next = (index + 1) % hops.length;
    const recursive = callExpression(hop.form, hops, next, ["n - 1"]);
    // The host call has work after it even in a strict static method in
    // the sloppy domain. No new wrapper frame enters the resource model.
    const call =
      testCase.clearTimeout == null
        ? recursive
        : `(${clearTimeoutExpression(testCase.clearTimeout)}, ${recursive})`;
    // The immediately invoked arrows only exist to carry their own
    // statement context; the call they return is in no tail position
    // of the hop itself, and the IIFE is its operand or nested body.
    const nonTail = nonTailReturn(testCase.context, call);
    return hopSource(
      hops,
      index,
      "n",
      testCase.throwAtBottom
        ? `throw new RangeError("bottom ${index}");`
        : `return "done ${index}";`,
      sloppy ? wrapExpression(hop.expressions, call) : nonTail,
    );
  });
  return `${sloppy ? "" : '"use strict";\n'}let steps = 0;
${functions.join("\n")}
${hops.map((_, index) => formSupport(hops, index)).join("\n")}
try {
  console.log(${hopReference(hops, 0)}(${testCase.depth}), steps);
} catch (error) {
  console.log(error.constructor.name, error.message, steps);
}
`;
}

function expectedNonTailOutput(testCase: NonTailCase): string {
  const last = testCase.depth % testCase.hops.length;
  const steps = testCase.depth + 1;
  return testCase.throwAtBottom
    ? `RangeError bottom ${last} ${steps}\n`
    : `done ${last} ${steps}\n`;
}

function printLivenessCase(testCase: LivenessCase): string {
  const { hops } = testCase;
  const extras = Array.from(
    { length: testCase.extra },
    (_, index) => `n * ${index + 2}`,
  );
  const functions = hops.map((hop, index) => {
    const next = (index + 1) % hops.length;
    const call = callExpression(
      hop.form,
      hops,
      next,
      ["n - 1", ...extras],
      testCase.spread,
    );
    const ending =
      testCase.ending === "return"
        ? `return "done ${index} " + rest.length;`
        : testCase.ending === "throw"
          ? `throw new RangeError("bottom ${index}");`
          : testCase.ending === "non-callable"
            ? "return notCallable(n);"
            : "return revoked.proxy();";
    return hopSource(
      hops,
      index,
      "n, ...rest",
      // Each step leaves a closure over its own argument behind, which
      // the collector must keep alive after the step's frame is gone.
      `${ending}`,
      `(captured.push(() => n + rest.length), ${wrapExpression(
        hop.expressions,
        call,
      )})`,
    );
  });
  return `"use strict";
let steps = 0;
const captured = [];
const notCallable = 1;
const revoked = Proxy.revocable(function () {}, {});
revoked.revoke();
${functions.join("\n")}
${hops.map((_, index) => formSupport(hops, index)).join("\n")}
let outcome;
try {
  outcome = ${hopReference(hops, 0)}(${testCase.depth});
} catch (error) {
  outcome = error.constructor.name;
}
console.log(outcome, steps, captured.reduce((sum, read) => sum + read(), 0));
`;
}

function expectedLivenessOutput(testCase: LivenessCase): string {
  const last = testCase.depth % testCase.hops.length;
  const outcome =
    testCase.ending === "return"
      ? `done ${last} ${testCase.depth === 0 ? 0 : testCase.extra}`
      : testCase.ending === "throw"
        ? "RangeError"
        : "TypeError";
  let sum = 0;
  for (let n = testCase.depth; n > 0; n -= 1) {
    sum += n + (n === testCase.depth ? 0 : testCase.extra);
  }
  return `${outcome} ${testCase.depth + 1} ${sum}\n`;
}

async function references(source: string, globalScriptReference = false) {
  const directory = await host.makeTemporaryDirectory(
    "oseo-proper-tail-calls-property-",
  );
  const sourcePath = `${directory}/case.js`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      globalScriptReference ? `(0, eval)(${JSON.stringify(source)});` : source,
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

/**
 * Compares the model, both references, and both native policies. When
 * `resources` predicts that a policy's native frames exhaust the active
 * frame budget, that run must stop with exactly that guard's diagnostic
 * instead; the references still match the semantic model.
 */
async function observe(
  source: string,
  stdout: string,
  resources?: (mir: MirProgram) => ResourceOutcome,
  globalScriptReference = false,
): Promise<void> {
  const expected = { exitStatus: 0, stderr: "", stdout };
  assertMatchingObservations([
    expected,
    ...(await references(source, globalScriptReference)),
  ]);
  const sourceId = "generated-m5-proper-tail-calls.js";
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId },
      { specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const outcome = resources?.(compiled.mir);
    if (outcome?.kind === "call-depth") {
      throw new Error(`The ${specialization} chain reached the call limit.`);
    }
    if (specialization === "enabled") {
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    }
    try {
      if (outcome?.kind === "frame-budget") {
        const native = await runNativeCli(
          {
            args: [
              ...(specialization === "disabled" ? ["--no-specialization"] : []),
              sourceId,
            ],
            source,
            sourceId,
            version: "0.1.0",
          },
          host,
        );
        assert.equal(native.exitStatus, 1, native.stderr);
        assert.equal(native.stdout, "");
        assert.match(native.stderr, resourceDiagnostic(sourceId, outcome.kind));
      } else {
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
          (native) => assertMatchingObservations([expected, native]),
        );
      }
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }
}

const context =
  nativeTarget == null || host.executionHost == null
    ? ["target=unsupported host=unknown"]
    : [
        `target=${nativeTarget.name}`,
        `host=${host.executionHost.operatingSystem}/` +
          host.executionHost.architecture,
        `sanitizers=${nativeTarget.sanitizers.join(",")}`,
      ];
const skip = nativeTarget == null ? "requires a supported native host" : false;

test(
  "generated rebound global eval tail calls keep argument identity",
  { skip },
  async () => {
    await assertAsyncProperty(
      "ordinary global eval bindings remain tail callees",
      fc.asyncProperty(
        fc.record({
          depth: fc.integer({ min: 300, max: tailDepthLimit }),
          label: fc.string({ maxLength: 12 }),
          spread: fc.boolean(),
        }),
        async ({ depth, label, spread }) => {
          // Keep the Script sloppy so assigning eval is legal; only the
          // recursive function needs strict code for PrepareForTailCall.
          const source = `
const intrinsic = eval;
const marker = { label: ${JSON.stringify(label)} };
let steps = 0;
function step(n, value) {
  "use strict";
  steps += 1;
  if (n === 0) return [this === undefined, value === marker, value.label];
  return eval(${spread ? "...[n - 1, value]" : "n - 1, value"});
}
eval = step;
const result = step(${depth}, marker);
eval = intrinsic;
console.log(result[0], result[1], result[2] === marker.label, steps);
`;
          await observe(
            source,
            `true true true ${depth + 1}\n`,
            undefined,
            true,
          );
        },
      ),
      {
        context,
        domain:
          "strict recursion through a rebound global eval, generated depths " +
          "and String payloads, with plain or spread arguments",
        numRuns: 4,
        profile: "M5 rebound global eval tail calls",
        seed: 0x6000_8903,
        sizeLimit: `depth ${tailDepthLimit}, 12-character payload`,
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

test(
  "generated tail position chains run in bounded native frames",
  { skip },
  async () => {
    await assertAsyncProperty(
      "every generated tail position and call form is a proper tail call",
      fc.asyncProperty(tailCaseArbitrary, async (testCase) => {
        await observe(printTailCase(testCase), expectedTailOutput(testCase));
      }),
      {
        context,
        domain:
          "one to three strict functions of five shapes calling the next " +
          "in generated statement and expression tail positions through " +
          "nine call forms, optionally ending in clearTimeout with " +
          "absent, object, extra, or spread arguments",
        numRuns: 8,
        profile: "M5 proper tail call positions and forms",
        seed: 0x6000_8900,
        sizeLimit:
          `depth ${tailDepthLimit}, 3 functions, 3 statement and ` +
          "2 expression wrappers",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

test(
  "generated calls outside tail position keep their frames",
  { skip },
  async () => {
    const contract = toolchainFrameContract(
      nativeToolchain,
      nativeTarget ?? describeTarget("linux-x86_64-gnu"),
    );
    await assertAsyncProperty(
      "non-tail and non-strict calls keep their observations",
      fc.asyncProperty(nonTailCaseArbitrary, async (testCase) => {
        const source = printNonTailCase(testCase);
        await observe(source, expectedNonTailOutput(testCase), (mir) =>
          nonTailResources(
            testCase,
            chainCharges(source, mir, cBackend.emit(mir)),
            contract,
          ),
        );
      }),
      {
        context,
        domain:
          "the same generated chains with the call in a try block, a " +
          "catch with a finally, a for-of body, an operand, a stored " +
          "value, or non-strict code, optionally throwing at the bottom " +
          "and evaluating a non-tail clearTimeout before recursive calls",
        numRuns: 8,
        profile: "M5 proper tail call exclusions",
        seed: 0x6000_8901,
        sizeLimit: "depth 60, 3 functions",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

test(
  "generated tail chains keep arguments, closures, and errors alive",
  { skip },
  async () => {
    await assertAsyncProperty(
      "tail chains preserve liveness and abrupt completions",
      fc.asyncProperty(livenessCaseArbitrary, async (testCase) => {
        await observe(
          printLivenessCase(testCase),
          expectedLivenessOutput(testCase),
        );
      }),
      {
        context,
        domain:
          "generated tail chains passing extra or spread arguments and " +
          "leaving closures behind, ending in a return, a throw, a " +
          "non-callable call, or a revoked Proxy call",
        numRuns: 6,
        profile: "M5 proper tail call liveness",
        seed: 0x6000_8902,
        sizeLimit: `depth ${tailDepthLimit}, ${large ? 12 : 6} extra arguments`,
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);

/** Check the generator's host call without executing native code. */
function checkClearTimeoutTail(source: string, tail: boolean): void {
  const compiled = compileSource(babelFrontend, {
    source,
    sourceId: "clear-timeout-generator.js",
  });
  assert.deepEqual(compiled.diagnostics, [], source);
  assert.ok(compiled.mir != null);
  const calls = compiled.mir.functions.flatMap((fn) =>
    fn.blocks.flatMap((block) =>
      block.operations.filter(
        (operation) =>
          operation.kind === "call" &&
          operation.target?.kind === "timer-intrinsic" &&
          operation.target.method === "clearTimeout",
      ),
    ),
  );
  assert.equal(calls.length, 1, source);
  assert.equal(calls[0]!.tail === true, tail, source);
}

test("clearTimeout generator variants keep their tail contracts", () => {
  for (const definition of [
    "arrow",
    "concise",
    "declaration",
    "method",
    "static",
  ] as const) {
    const hops: readonly Hop[] = [
      {
        definition,
        expressions: [],
        form: "plain",
        statements: [],
      },
    ];

    for (const clearTimeout of [
      "absent",
      "extra",
      "object",
      "spread",
    ] as const) {
      checkClearTimeoutTail(
        printTailCase({ clearTimeout, depth: 1, hops }),
        true,
      );
    }
    for (const nonTailContext of [
      "catch-finally",
      "for-of",
      "operand",
      "sloppy",
      "stored",
      "try",
    ] as const) {
      for (const clearTimeout of ["absent", "extra", "object"] as const) {
        checkClearTimeoutTail(
          printNonTailCase({
            clearTimeout,
            context: nonTailContext,
            depth: 1,
            hops,
            throwAtBottom: false,
          }),
          false,
        );
      }
    }
  }
});
