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

/**
 * How the generated name is bound on the realm before the observed
 * reference: not at all, as an ordinary writable data property, as an
 * accessor, as a non-writable data property, or as a data property of the
 * global object's prototype.
 */
type Presence = "absent" | "accessor" | "data" | "inherited" | "readonly";

/**
 * The observed reference to the generated name. Every `with` form runs
 * inside an object environment whose null-prototype object never holds the
 * name, so each one reaches the global object through an all-miss chain.
 */
type Operation =
  | "compound"
  | "delete"
  | "global-read"
  | "read"
  | "sloppy-assign"
  | "strict-assign"
  | "typeof"
  | "update"
  | "with-assign"
  | "with-compound"
  | "with-read";

interface GlobalReferenceCase {
  readonly operation: Operation;
  readonly presence: Presence;
  readonly suffix: string;
  readonly value: number;
}

const operations: readonly Operation[] = [
  "compound",
  "delete",
  "global-read",
  "read",
  "sloppy-assign",
  "strict-assign",
  "typeof",
  "update",
  "with-assign",
  "with-compound",
  "with-read",
];

const writeOperations: ReadonlySet<Operation> = new Set([
  "compound",
  "sloppy-assign",
  "strict-assign",
  "update",
  "with-assign",
  "with-compound",
]);

/** Getter calls the observed reference itself performs on an accessor. */
const accessorReads = {
  compound: 1,
  delete: 0,
  "global-read": 1,
  read: 1,
  "sloppy-assign": 0,
  "strict-assign": 0,
  typeof: 1,
  update: 1,
  "with-assign": 0,
  "with-compound": 1,
  "with-read": 1,
} as const satisfies Record<Operation, number>;

const caseArbitrary: fc.Arbitrary<GlobalReferenceCase> = fc.record({
  operation: fc.constantFrom(...operations),
  presence: fc.constantFrom<Presence>(
    "absent",
    "accessor",
    "data",
    "inherited",
    "readonly",
  ),
  // The fixed prefix keeps every generated name a valid identifier that
  // no realm, harness, or host binds.
  suffix: fc.stringMatching(/^[A-Za-z0-9_]{1,6}$/u),
  value: fc.integer({ max: 10_000, min: -10_000 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function setupSource(presence: Presence, name: string, value: number): string {
  switch (presence) {
    case "absent":
      return "";
    case "accessor":
      return `
Object.defineProperty(realm, "${name}", {
  configurable: true,
  get() { reads = reads + 1; return ${value}; },
  set(next) { written = next; },
});`;
    case "data":
      return `realm.${name} = ${value};`;
    case "inherited":
      return `Object.getPrototypeOf(realm).${name} = ${value};`;
    case "readonly":
      return `
Object.defineProperty(realm, "${name}", {
  configurable: true,
  value: ${value},
  writable: false,
});`;
  }
}

function operationSource(
  operation: Operation,
  name: string,
  next: number,
): string {
  switch (operation) {
    case "compound":
      return `result = ${name} += 1;`;
    case "delete":
      return `result = delete ${name};`;
    case "global-read":
      return `result = globalThis.${name};`;
    case "read":
      return `result = ${name};`;
    case "sloppy-assign":
      return `result = ${name} = ${next};`;
    case "strict-assign":
      return (
        'result = (function () { "use strict"; ' +
        `return ${name} = ${next}; })();`
      );
    case "typeof":
      return `result = typeof ${name};`;
    case "update":
      return `result = ${name}++;`;
    case "with-assign":
      return `with (scope) { result = ${name} = ${next}; }`;
    case "with-compound":
      return `with (scope) { result = ${name} += 1; }`;
    case "with-read":
      return `with (scope) { result = ${name}; }`;
  }
}

function printCase(testCase: GlobalReferenceCase): string {
  const name = `oseoGlobal${testCase.suffix}`;
  const next = testCase.value + 1;
  return `
const realm = this;
const scope = Object.create(null);
let reads = 0;
let written = "none";
let result;
${setupSource(testCase.presence, name, testCase.value)}
try {
  ${operationSource(testCase.operation, name, next)}
  console.log("op", typeof result, result);
} catch (error) {
  console.log(
    "op error",
    error instanceof ReferenceError
      ? "ReferenceError"
      : error instanceof TypeError
        ? "TypeError"
        : "other",
  );
}
console.log(
  "after",
  typeof ${name},
  "${name}" in realm,
  Object.prototype.hasOwnProperty.call(realm, "${name}"),
  realm.${name},
);
console.log("accessor", reads, written);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(${testCase.value}, 1), hinted("1", 1));
const probe = { value: ${testCase.value} };
let turn = 0;
while (turn < 2) {
  console.log("guard", probe.value);
  if (turn === 0) probe.marker = 1;
  turn = turn + 1;
}
delete realm.${name};
delete Object.getPrototypeOf(realm).${name};
`;
}

function numberResult(result: number): string {
  return `op number ${result}`;
}

/** The observed reference's completion, independent of any engine. */
function expectedOperation(testCase: GlobalReferenceCase): string {
  const { operation, presence, value } = testCase;
  const next = value + 1;
  if (presence === "absent") {
    switch (operation) {
      case "delete":
        return "op boolean true";
      case "global-read":
        return "op undefined undefined";
      case "sloppy-assign":
      case "with-assign":
        return numberResult(next);
      case "typeof":
        return "op string undefined";
      default:
        // GetValue on an unresolvable reference throws, and a strict
        // PutValue does too instead of creating the property.
        return "op error ReferenceError";
    }
  }
  switch (operation) {
    case "delete":
      return "op boolean true";
    case "typeof":
      return "op string number";
    case "update":
      return numberResult(value);
    case "compound":
    case "sloppy-assign":
    case "with-assign":
    case "with-compound":
      return numberResult(next);
    case "strict-assign":
      return presence === "readonly"
        ? "op error TypeError"
        : numberResult(next);
    case "global-read":
    case "read":
    case "with-read":
      return numberResult(value);
  }
}

function expected(testCase: GlobalReferenceCase): string {
  const { operation, presence, value } = testCase;
  const next = value + 1;
  const writes = writeOperations.has(operation);
  const created =
    presence === "absent" &&
    (operation === "sloppy-assign" || operation === "with-assign");
  const removed =
    operation === "delete" && presence !== "absent" && presence !== "inherited";
  const present = presence === "absent" ? created : !removed;
  const own =
    presence === "inherited"
      ? writes
      : presence === "absent"
        ? created
        : present;
  const current =
    presence === "absent"
      ? next
      : presence === "accessor" || presence === "readonly"
        ? value
        : writes
          ? next
          : value;
  const accessorLine =
    presence === "accessor"
      ? `accessor ${accessorReads[operation] + (present ? 2 : 0)} ${
          writes ? String(next) : "none"
        }`
      : "accessor 0 none";
  return [
    expectedOperation(testCase),
    `after ${present ? "number" : "undefined"} ${present} ${own} ${
      present ? String(current) : "undefined"
    }`,
    accessorLine,
    `hint ${value + 1} 11`,
    `guard ${value}`,
    `guard ${value}`,
    "",
  ].join("\n");
}

/**
 * The one generated combination where both reference hosts disagree with
 * ECMA-262. V8 throws ReferenceError for a strict assignment to a name
 * found only on the global object's prototype, while SetMutableBinding of
 * the global Object Environment Record sees the inherited property through
 * HasProperty and performs an ordinary Set, which creates an own property.
 * That case compares the native observation with the model alone.
 */
function v8Divergence(testCase: GlobalReferenceCase): boolean {
  return (
    testCase.presence === "inherited" && testCase.operation === "strict-assign"
  );
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
    "oseo-globalthis-binding-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    // Indirect eval runs the case as a non-strict global Script, which is
    // what the native compilation of the same source observes.
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
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
 * Compile one generated case under both specialization policies and run
 * it with collection forced at every safepoint, requiring the model's
 * exact observation.
 */
async function assertNative(
  source: string,
  expectedObservation: {
    readonly exitStatus: number;
    readonly stderr: string;
    readonly stdout: string;
  },
): Promise<void> {
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "generated-m5-globalthis-binding.js" },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const mir = printMir(compiled.mir);
    // Every generated reference reaches the realm global object
    // rather than a compile-time rejection or a hidden cell alone.
    assert.match(mir, /read \*intrinsic global object\*/u);
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
}

test("global reference model separates presence and operation", () => {
  const base = { suffix: "a", value: 4 } as const;
  assert.match(
    expected({ ...base, operation: "read", presence: "absent" }),
    /^op error ReferenceError\nafter undefined false false undefined\n/u,
  );
  assert.match(
    expected({ ...base, operation: "with-assign", presence: "absent" }),
    /^op number 5\nafter number true true 5\n/u,
  );
  assert.match(
    expected({ ...base, operation: "update", presence: "accessor" }),
    /^op number 4\nafter number true true 4\naccessor 3 5\n/u,
  );
  assert.match(
    expected({ ...base, operation: "delete", presence: "inherited" }),
    /^op boolean true\nafter number true false 4\n/u,
  );
  assert.match(
    expected({ ...base, operation: "strict-assign", presence: "readonly" }),
    /^op error TypeError\nafter number true true 4\n/u,
  );
});

test(
  "generated global references match the M5 globalThis model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "global references resolve through the realm global object",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          ...(v8Divergence(testCase) ? [] : await references(source)),
        ]);
        await assertNative(source, expectedObservation);
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
          "one fresh global name that is absent or bound as a writable, " +
          "accessor, non-writable, or inherited property, observed by a " +
          "read, typeof, delete, sloppy or strict assignment, compound " +
          "assignment, update, globalThis property read, or all-miss with " +
          "read, assignment, or compound assignment, plus a false number " +
          "hint and one object shape miss",
        numRuns: 16,
        profile: "M5 globalThis binding",
        seed: 0x6000_7e00,
        sizeLimit:
          "one bounded integer, one identifier suffix of at most six " +
          "characters, one observed reference, and one guarded addition",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);

test(
  "a strict write to an inherited global name follows ECMA-262",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    // The generated domain reaches this combination only by chance, and
    // the reference hosts cannot check it, so it keeps one fixed native
    // observation against the model.
    const testCase = {
      operation: "strict-assign",
      presence: "inherited",
      suffix: "Fixed",
      value: 3,
    } as const;
    assert.ok(v8Divergence(testCase));
    await assertNative(printCase(testCase), {
      exitStatus: 0,
      stderr: "",
      stdout: expected(testCase),
    });
  },
);

test(
  "global writes and deletes resolve the name first per ECMA-262",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    // ResolveBinding asks the global object's HasProperty before a write's
    // right-hand side, a delete, or a loop body runs. Node.js and Deno skip
    // that query on the global object's prototype chain, so only the
    // specification order is compared, through a Proxy prototype that
    // records its `has` trap.
    const source = `
const realm = this;
const base = Object.getPrototypeOf(realm);
const log = [];
let flips = 0;
Object.setPrototypeOf(realm, new Proxy(base, {
  has(target, key) {
    if (key === "trapped") {
      log.push("has");
      return false;
    }
    if (key === "flipping") {
      flips = flips + 1;
      return flips > 1;
    }
    return Reflect.has(target, key);
  },
}));
trapped = (log.push("rhs"), 1);
console.log("write", log.join(","), realm.trapped);
log.length = 0;
console.log("delete own", delete trapped, log.join(","));
console.log("delete absent", delete trapped, log.join(","));
log.length = 0;
with ({}) { trapped = (log.push("rhs"), 2); }
console.log("with write", log.join(","), realm.trapped);
delete realm.trapped;
log.length = 0;
[trapped] = [(log.push("rhs"), 3)];
console.log("pattern", log.join(","), realm.trapped);
delete realm.trapped;
log.length = 0;
for (trapped of [4]) { log.push("body"); }
console.log("loop", log.join(","), realm.trapped);
delete realm.trapped;
try {
  (function () { "use strict"; flipping = 5; })();
  console.log("strict flip wrote");
} catch (error) {
  console.log("strict flip", error instanceof ReferenceError, flips);
}
Object.setPrototypeOf(realm, base);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 1), hinted("1", 1));
const probe = { value: 0 };
let turn = 0;
while (turn < 2) {
  console.log("guard", probe.value);
  if (turn === 0) probe.marker = 1;
  turn = turn + 1;
}
`;
    await assertNative(source, {
      exitStatus: 0,
      stderr: "",
      stdout: [
        "write has,rhs 1",
        "delete own true ",
        "delete absent true has",
        "with write has,rhs 2",
        "pattern rhs,has 3",
        "loop has,body 4",
        "strict flip true 1",
        "hint 2 11",
        "guard 0",
        "guard 0",
        "",
      ].join("\n"),
    });
  },
);

test(
  "each global record operation tests the property itself per ECMA-262",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    // ResolveBinding, GetBindingValue, and SetMutableBinding each ask the
    // global object's HasProperty, and a Proxy prototype can answer each
    // one differently. A property found by ResolveBinding but gone for
    // GetBindingValue reads as undefined in non-strict code and throws
    // ReferenceError in strict code; one gone for SetMutableBinding is
    // still written in non-strict code and throws in strict code. Node.js
    // and Deno ask once per reference and skip the write's query, so only
    // the specification order is compared. Each script lists the `has`
    // answers in order; `miss` logs a false one.
    const source = `
const realm = this;
const base = Object.getPrototypeOf(realm);
const log = [];
let answers = [];
Object.setPrototypeOf(realm, new Proxy(base, {
  has(target, key) {
    if (key !== "ghost") return Reflect.has(target, key);
    const answer = answers.length > 0 && answers.shift();
    log.push(answer ? "has" : "miss");
    return answer;
  },
  get(target, key, receiver) {
    if (key !== "ghost") return Reflect.get(target, key, receiver);
    log.push("get");
    return 1;
  },
}));
function rhs(value) { log.push("rhs"); return value; }
function observe(label, script, run) {
  answers = script;
  log.length = 0;
  let result;
  try { result = String(run()); } catch (error) { result = error.name; }
  const own = Object.prototype.hasOwnProperty.call(realm, "ghost");
  console.log(label, result, log.join(","), own ? realm.ghost : "-");
  delete realm.ghost;
}
observe("typeof", [true, false], () => typeof ghost);
observe("strict typeof", [true, false], () => {
  "use strict";
  return typeof ghost;
});
observe("read", [true, true], () => ghost);
observe("read gone", [true, false], () => ghost);
observe("strict read gone", [true, false], () => {
  "use strict";
  return ghost;
});
observe("write", [true, false], () => (ghost = rhs(2)));
observe("strict write", [true, false], () => {
  "use strict";
  return (ghost = rhs(2));
});
observe("compound", [true, false, true], () => (ghost += rhs(1)));
observe("strict compound", [true, false], () => {
  "use strict";
  return (ghost += rhs(1));
});
observe("strict compound kept", [true, true, false], () => {
  "use strict";
  return (ghost += rhs(1));
});
observe("update", [true, false, false], () => ghost++);
observe("logical", [true, false, true], () => (ghost ||= rhs(3)));
observe("with read", [true, false], () => { with ({}) return ghost; });
observe("with write", [true, false], () => {
  with ({}) return (ghost = rhs(4));
});
observe("with compound", [true, false, true], () => {
  with ({}) return (ghost += rhs(1));
});
observe("pattern", [true, false], () => ([ghost] = [rhs(5)]));
observe("loop", [true, false], () => {
  for (ghost of [6]) log.push("body");
});
Object.setPrototypeOf(realm, base);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 1), hinted("1", 1));
const probe = { value: 0 };
let turn = 0;
while (turn < 2) {
  console.log("guard", probe.value);
  if (turn === 0) probe.marker = 1;
  turn = turn + 1;
}
`;
    await assertNative(source, {
      exitStatus: 0,
      stderr: "",
      stdout: [
        "typeof undefined has,miss -",
        "strict typeof ReferenceError has,miss -",
        "read 1 has,has,get -",
        "read gone undefined has,miss -",
        "strict read gone ReferenceError has,miss -",
        "write 2 has,rhs,miss 2",
        "strict write ReferenceError has,rhs,miss -",
        "compound NaN has,miss,rhs,has NaN",
        "strict compound ReferenceError has,miss -",
        "strict compound kept ReferenceError has,has,get,rhs,miss -",
        "update NaN has,miss,miss NaN",
        "logical 3 has,miss,rhs,has 3",
        "with read undefined has,miss -",
        "with write 4 has,rhs,miss 4",
        "with compound NaN has,miss,rhs,has NaN",
        "pattern 5 rhs,has,miss 5",
        "loop undefined has,miss,body 6",
        "hint 2 11",
        "guard 0",
        "guard 0",
        "",
      ].join("\n"),
    });
  },
);

/** Mutable oracle stores retain each binding object's observed state. */
interface WithBindingStates {
  global: number | undefined;
  inner: number | undefined;
  outer: number | undefined;
}

/** A retained object-environment reference, independently of later lookup. */
interface WithPutValueCase {
  readonly base: "global" | "inner" | "outer";
  readonly change: "delete" | "keep" | "readonly" | "replace";
  readonly operation: "=" | "+=" | "&&=" | "??=" | "||=";
  readonly strict: boolean;
  readonly value: number;
}

const withPutValueArbitrary: fc.Arbitrary<WithPutValueCase> = fc.record({
  base: fc.constantFrom("global", "inner", "outer"),
  change: fc.constantFrom("delete", "keep", "readonly", "replace"),
  operation: fc.constantFrom("=", "+=", "&&=", "??=", "||="),
  strict: fc.boolean(),
  value: fc.integer({ max: 8, min: 1 }),
});

function withPutValueSource(
  testCase: WithPutValueCase,
  context?: WithStrictContext,
): string {
  const directive = testCase.strict ? '"use strict";' : "";
  const assignment = `oseoWithPutValue ${testCase.operation} rhs()`;
  const evaluation =
    context == null
      ? `(function () {
        ${directive}
        return (${assignment});
      })()`
      : withStrictContextEvaluation(context, assignment);
  const mutation = {
    delete: "delete selected.oseoWithPutValue;",
    keep: "",
    readonly:
      'Object.defineProperty(selected, "oseoWithPutValue", ' +
      "{ writable: false });",
    replace: "selected.oseoWithPutValue = 99;",
  }[testCase.change];
  return `
const realm = this;
const outer = {};
const inner = {};
const selected = ${testCase.base === "global" ? "realm" : testCase.base};
selected.oseoWithPutValue = ${testCase.value};
let result;
let rhsCalls = 0;
function rhs() {
  rhsCalls++;
  ${mutation}
  // A new nearer binding must not replace the reference retained by LHS.
  if (selected !== inner) inner.oseoWithPutValue = 77;
  for (let index = 0; index < 4; index++) {
    const garbage = { nested: { index } };
  }
  return 2;
}
with (outer) {
  with (inner) {
    try {
      result = ${evaluation};
    } catch (error) { result = error.name; }
  }
}
console.log(
  result,
  rhsCalls,
  selected.oseoWithPutValue,
  "oseoWithPutValue" in selected,
);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 1), hinted("1", 1));
const probe = { value: 0 };
for (let turn = 0; turn < 2; turn++) {
  console.log("guard", probe.value);
  if (turn === 0) probe.marker = 1;
}
console.log(
  "binding-state",
  realm.oseoWithPutValue,
  "oseoWithPutValue" in realm,
  outer.oseoWithPutValue,
  "oseoWithPutValue" in outer,
  inner.oseoWithPutValue,
  "oseoWithPutValue" in inner,
);
delete realm.oseoWithPutValue;
`;
}

/**
 * ECMA-262 2025 13.15 retains lref and, for a read-first assignment, lval.
 * The RHS runs only after that read and only when a logical test takes it.
 * 9.1.1.2.5 tests the selected binding object's current HasProperty,
 * independent of a nearer object, before Set with the reference's strictness.
 */
function withPutValueExpected(testCase: WithPutValueCase): string {
  const short = testCase.operation === "||=" || testCase.operation === "??=";
  const written = testCase.operation === "+=" ? testCase.value + 2 : 2;
  const error =
    !short && testCase.strict
      ? testCase.change === "delete"
        ? "ReferenceError"
        : testCase.change === "readonly"
          ? "TypeError"
          : undefined
      : undefined;
  const present = !(error === "ReferenceError");
  const after = !present
    ? "undefined"
    : short || testCase.change === "readonly"
      ? testCase.value
      : written;
  const states: WithBindingStates = {
    global: undefined,
    inner: undefined,
    outer: undefined,
  };
  states[testCase.base] = present ? Number(after) : undefined;
  if (!short && testCase.base !== "inner") states.inner = 77;
  const bases: readonly WithPutValueCase["base"][] = [
    "global",
    "outer",
    "inner",
  ];
  const bindingState = bases
    .map((base) => {
      const value = states[base];
      return `${value} ${value !== undefined}`;
    })
    .join(" ");
  return [
    `${error ?? (short ? testCase.value : written)} ` +
      `${short ? 0 : 1} ${after} ${present}`,
    "hint 2 11",
    "guard 0",
    "guard 0",
    `binding-state ${bindingState}`,
    "",
  ].join("\n");
}

/**
 * The two measured V8 reference hosts re-resolve a with store after the
 * RHS. ECMA-262 2025 retains its original Environment Record instead.
 * Full binding-state observations also expose redirected read-only writes.
 * This exception is limited to the current positive 1..8 generated domain.
 */
function withPutValueReferenceDiscrepancy(testCase: WithPutValueCase): boolean {
  if (
    !Number.isInteger(testCase.value) ||
    testCase.value < 1 ||
    testCase.value > 8
  )
    return false;
  const takesRhs =
    testCase.operation === "=" ||
    testCase.operation === "+=" ||
    testCase.operation === "&&=";
  return (
    takesRhs &&
    (testCase.base !== "inner" ||
      (testCase.change === "delete" && !testCase.strict))
  );
}

/**
 * Collect both references even for a measured discrepancy, preserving their
 * real output while keeping the normative model as the native oracle.
 * Unexpected process failures remain failures in every class.
 */
async function assertWithReferenceEvidence(
  source: string,
  stdout: string,
  testCase: WithPutValueCase | WithWriteLeafCase,
  discrepancy: string | undefined,
): Promise<void> {
  const observations = await references(source);
  const expectedObservation = { exitStatus: 0, stderr: "", stdout };
  if (discrepancy == null) {
    assertMatchingObservations([expectedObservation, ...observations]);
    return;
  }
  for (const [index, observation] of observations.entries()) {
    assert.equal(observation.exitStatus, 0);
    assert.equal(observation.stderr, "");
    process.stdout.write(
      JSON.stringify({
        kind: "reference-discrepancy-evidence",
        host: index === 0 ? "Node.js" : "Deno",
        discrepancy,
        testCase,
        expected: expectedObservation,
        actual: observation,
        matchesModel: observation.stdout === stdout,
      }) + "\n",
    );
  }
}

test(
  "generated with PutValue retains its object environment",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "with PutValue rechecks the retained binding object",
      fc.asyncProperty(withPutValueArbitrary, async (testCase) => {
        const source = withPutValueSource(testCase);
        const observation = {
          exitStatus: 0,
          stderr: "",
          stdout: withPutValueExpected(testCase),
        };
        await assertWithReferenceEvidence(
          source,
          observation.stdout,
          testCase,
          withPutValueReferenceDiscrepancy(testCase)
            ? "retained with reference across RHS changes"
            : undefined,
        );
        await assertNative(source, observation);
      }),
      {
        context: [
          `target=${nativeTarget?.name ?? "unsupported"}`,
          `host=${host.executionHost?.operatingSystem ?? "unknown"}/` +
            (host.executionHost?.architecture ?? "unknown"),
        ],
        domain:
          "retained inner, outer, or global object environment with a " +
          "positive integer value; RHS deletion, replacement, read-only " +
          "transition, or no mutation; simple, arithmetic, or logical " +
          "assignment in strict or sloppy code with a new nearer binding",
        numRuns: 16,
        profile: "M5 with strict assignment fallback",
        seed: 0x6000_7e01,
        sizeLimit:
          "two with objects, one global fallback, one integer in 1..8, " +
          "one assignment, four garbage objects, and false-hint/shape misses",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);

/**
 * Class code evaluated inside a sloppy function. ECMA-262 2025 11.2.2
 * makes every part of a ClassDefinition strict code, so each context
 * selects strict PutValue without a directive. The heritage operand and
 * computed key are lowered inline in the enclosing function; the static
 * block, static field initializer, and static method are their own
 * functions.
 */
type WithStrictContext =
  | "class-computed-key"
  | "class-heritage"
  | "class-static-block"
  | "class-static-field"
  | "class-static-method";

/** A retained object-environment reference written from class code. */
interface WithStrictContextCase extends Omit<WithPutValueCase, "strict"> {
  readonly context: WithStrictContext;
}

const withStrictContextArbitrary: fc.Arbitrary<WithStrictContextCase> =
  fc.record({
    base: fc.constantFrom("global", "inner", "outer"),
    change: fc.constantFrom("delete", "keep", "readonly", "replace"),
    context: fc.constantFrom(
      "class-computed-key",
      "class-heritage",
      "class-static-block",
      "class-static-field",
      "class-static-method",
    ),
    operation: fc.constantFrom("=", "+=", "&&=", "??=", "||="),
    value: fc.integer({ max: 8, min: 1 }),
  });

/** Evaluate `assignment` once in class code and yield its value. */
function withStrictContextEvaluation(
  context: WithStrictContext,
  assignment: string,
): string {
  const body = {
    "class-computed-key": `let value;
        class C { [(value = (${assignment}), "m")]() {} }
        return value;`,
    "class-heritage": `let value;
        class C extends ((value = (${assignment})), Object) {}
        return value;`,
    "class-static-block": `let value;
        class C { static { value = (${assignment}); } }
        return value;`,
    "class-static-field": `let value;
        class C { static f = (value = (${assignment})); }
        return value;`,
    "class-static-method": `class C { static m() { return (${assignment}); } }
        return C.m();`,
  }[context];
  return `(() => {
        ${body}
      })()`;
}

test(
  "generated class code keeps with PutValue strict",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "class code rechecks the retained binding object strictly",
      fc.asyncProperty(withStrictContextArbitrary, async (testCase) => {
        // Class code is strict regardless of the sloppy enclosing
        // function, so the strict retained-reference oracle applies.
        const strictCase = { ...testCase, strict: true as const };
        const source = withPutValueSource(strictCase, testCase.context);
        const observation = {
          exitStatus: 0,
          stderr: "",
          stdout: withPutValueExpected(strictCase),
        };
        await assertWithReferenceEvidence(
          source,
          observation.stdout,
          strictCase,
          withPutValueReferenceDiscrepancy(strictCase)
            ? "retained with reference across RHS changes"
            : undefined,
        );
        await assertNative(source, observation);
      }),
      {
        context: [
          `target=${nativeTarget?.name ?? "unsupported"}`,
          `host=${host.executionHost?.operatingSystem ?? "unknown"}/` +
            (host.executionHost?.architecture ?? "unknown"),
        ],
        domain:
          "retained inner, outer, or global object environment with a " +
          "positive integer value; RHS deletion, replacement, read-only " +
          "transition, or no mutation; simple, arithmetic, or logical " +
          "assignment in a class heritage operand, computed key, static " +
          "block, static field initializer, or static method inside " +
          "sloppy code with a new nearer binding",
        numRuns: 16,
        profile: "M5 with strict assignment fallback",
        seed: 0x6000_7e03,
        sizeLimit:
          "two with objects, one global fallback, one integer in 1..8, " +
          "one class, one assignment, four garbage objects, and " +
          "false-hint/shape misses",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);

/** Existing assignment leaves whose lexical fallback must remain distinct. */
interface WithWriteLeafCase {
  readonly hit: boolean;
  readonly kind: "array" | "for-in" | "for-of" | "object";
  readonly strict: boolean;
  readonly value: number;
}

const withWriteLeafArbitrary: fc.Arbitrary<WithWriteLeafCase> = fc.record({
  hit: fc.boolean(),
  kind: fc.constantFrom("array", "for-in", "for-of", "object"),
  strict: fc.boolean(),
  value: fc.integer({ max: 8, min: 1 }),
});

function withWriteLeafSource(testCase: WithWriteLeafCase): string {
  const body = {
    array: `[x] = [${testCase.value}];`,
    "for-in": "for (x in { a: 1 }) {}",
    "for-of": `for (x of [${testCase.value}]) {}`,
    object: `({ value: x } = { value: ${testCase.value} });`,
  }[testCase.kind];
  return `
let x = 0;
let writes = 0;
const target = ${testCase.hit ? "{ x: 1 }" : "{}"};
const environment = new Proxy(target, {
  get(object, key, receiver) {
    if (key === Symbol.unscopables) {
      delete object.x;
      for (let index = 0; index < 4; index++) {
        const garbage = { nested: { index } };
      }
      return undefined;
    }
    return Reflect.get(object, key, receiver);
  },
  set(object, key, value, receiver) {
    writes++;
    return Reflect.set(object, key, value, receiver);
  },
});
let result = "ok";
with (environment) {
  (function () {
    ${testCase.strict ? '"use strict";' : ""}
    try { ${body} }
    catch (error) { result = error.name; }
  })();
}
console.log(result, x, writes, "x" in target, target.x);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 1), hinted("1", 1));
const probe = { value: 0 };
for (let turn = 0; turn < 2; turn++) {
  console.log("guard", probe.value);
  if (turn === 0) probe.marker = 1;
}
`;
}

/**
 * HasBinding first finds x, then Get(@@unscopables) deletes it without
 * blocking it. ECMA-262 2025 9.1.1.2.1 still selects that object record;
 * 9.1.1.2.5 then throws before Set in strict code or writes in sloppy
 * code. An initial HasBinding miss writes the real outer lexical cell.
 * Values, keys, and initializers have no selection-changing effects:
 * this domain does not assess preexisting pattern preparation order.
 */
function withWriteLeafExpected(testCase: WithWriteLeafCase): string {
  const assigned = testCase.kind === "for-in" ? "a" : testCase.value;
  const throws = testCase.hit && testCase.strict;
  const stored = testCase.hit && !throws;
  return [
    `${throws ? "ReferenceError" : "ok"} ` +
      `${testCase.hit ? 0 : assigned} ${stored ? 1 : 0} ` +
      `${stored} ${stored ? assigned : "undefined"}`,
    "hint 2 11",
    "guard 0",
    "guard 0",
    "",
  ].join("\n");
}

/**
 * Both measured reference hosts perform strict property Set after a with
 * lookup deletes its hit through unscopables; 9.1.1.2.5 requires a fresh
 * HasProperty and ReferenceError before Set. Initial misses and sloppy
 * hits remain differential controls in the current positive 1..8 domain.
 */
function withWriteLeafReferenceDiscrepancy(
  testCase: WithWriteLeafCase,
): boolean {
  return (
    Number.isInteger(testCase.value) &&
    testCase.value >= 1 &&
    testCase.value <= 8 &&
    testCase.hit &&
    testCase.strict
  );
}

test(
  "generated existing with write leaves preserve strictness",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "existing with write leaves recheck the selected binding object",
      fc.asyncProperty(withWriteLeafArbitrary, async (testCase) => {
        const source = withWriteLeafSource(testCase);
        const observation = {
          exitStatus: 0,
          stderr: "",
          stdout: withWriteLeafExpected(testCase),
        };
        await assertWithReferenceEvidence(
          source,
          observation.stdout,
          testCase,
          withWriteLeafReferenceDiscrepancy(testCase)
            ? "strict with SetMutableBinding after unscopables deletion"
            : undefined,
        );
        await assertNative(source, observation);
      }),
      {
        context: [
          `target=${nativeTarget?.name ?? "unsupported"}`,
          `host=${host.executionHost?.operatingSystem ?? "unknown"}/` +
            (host.executionHost?.architecture ?? "unknown"),
        ],
        domain:
          "existing array/object assignment or for-in/of identifier " +
          "heads with an outer lexical fallback; an initial object miss " +
          "or an object hit deleted by unscopables; strict/sloppy writes",
        numRuns: 16,
        profile: "M5 with shared write strictness",
        seed: 0x6000_7e02,
        sizeLimit:
          "one lexical cell, one proxy, one assignment leaf, one integer " +
          "in 1..8, four garbage objects, and false-hint/shape misses",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);

/**
 * Exact fixed subjects whose Node/Deno discrepancy was independently
 * observed; source bytes and normative expected logs stay paired here.
 * These private records must not become fixture-module exports: the
 * fragment scanner treats every export of that module as a Fixture[].
 */
interface WithFixedModelCase {
  readonly name: string;
  readonly source: string;
  readonly stdout: string;
}

const withFixedModelCases: readonly WithFixedModelCase[] = [
  {
    name: "leaf-0-true-true",
    source: `
{
  let x = 0;
  let writes = 0;
  const target = { x: 1 };
  const environment = new Proxy(target, {
    get(object, key, receiver) {
      if (key === Symbol.unscopables) {
        delete object.x;
        return undefined;
      }
      return Reflect.get(object, key, receiver);
    },
    set(object, key, value, receiver) {
      writes++;
      return Reflect.set(object, key, value, receiver);
    },
  });
  let result = "ok";
  with (environment) {
    (function () {
      "use strict";
      try { [x] = [2]; }
      catch (error) { result = error.name; }
    })();
  }
  console.log(0, true, true, result, x, writes,
    "x" in target, target.x);
}
`,
    stdout: "0 true true ReferenceError 0 0 false undefined\n",
  },
  {
    name: "leaf-1-true-true",
    source: `
{
  let x = 0;
  let writes = 0;
  const target = { x: 1 };
  const environment = new Proxy(target, {
    get(object, key, receiver) {
      if (key === Symbol.unscopables) {
        delete object.x;
        return undefined;
      }
      return Reflect.get(object, key, receiver);
    },
    set(object, key, value, receiver) {
      writes++;
      return Reflect.set(object, key, value, receiver);
    },
  });
  let result = "ok";
  with (environment) {
    (function () {
      "use strict";
      try { ({ value: x } = { value: 2 }); }
      catch (error) { result = error.name; }
    })();
  }
  console.log(1, true, true, result, x, writes,
    "x" in target, target.x);
}
`,
    stdout: "1 true true ReferenceError 0 0 false undefined\n",
  },
  {
    name: "leaf-2-true-true",
    source: `
{
  let x = 0;
  let writes = 0;
  const target = { x: 1 };
  const environment = new Proxy(target, {
    get(object, key, receiver) {
      if (key === Symbol.unscopables) {
        delete object.x;
        return undefined;
      }
      return Reflect.get(object, key, receiver);
    },
    set(object, key, value, receiver) {
      writes++;
      return Reflect.set(object, key, value, receiver);
    },
  });
  let result = "ok";
  with (environment) {
    (function () {
      "use strict";
      try { for (x of [2]) {} }
      catch (error) { result = error.name; }
    })();
  }
  console.log(2, true, true, result, x, writes,
    "x" in target, target.x);
}
`,
    stdout: "2 true true ReferenceError 0 0 false undefined\n",
  },
  {
    name: "leaf-3-true-true",
    source: `
{
  let x = 0;
  let writes = 0;
  const target = { x: 1 };
  const environment = new Proxy(target, {
    get(object, key, receiver) {
      if (key === Symbol.unscopables) {
        delete object.x;
        return undefined;
      }
      return Reflect.get(object, key, receiver);
    },
    set(object, key, value, receiver) {
      writes++;
      return Reflect.set(object, key, value, receiver);
    },
  });
  let result = "ok";
  with (environment) {
    (function () {
      "use strict";
      try { for (x in { a: 1 }) {} }
      catch (error) { result = error.name; }
    })();
  }
  console.log(3, true, true, result, x, writes,
    "x" in target, target.x);
}
`,
    stdout: "3 true true ReferenceError 0 0 false undefined\n",
  },
  {
    name: "retained-outer-with-proxy-trace",
    source: `
const log = [];
const outer = { x: 1 };
const inner = {};
const scope = new Proxy(outer, {
  has(target, key) {
    if (key === "x") log.push("has");
    return Reflect.has(target, key);
  },
  set(target, key, value, receiver) {
    if (key === "x") log.push("set");
    return Reflect.set(target, key, value, receiver);
  },
});
with (scope) {
  with (inner) {
    (function () {
      "use strict";
      x = (log.push("rhs"), inner.x = 99, 2);
    })();
  }
}
console.log("order", log.join(","), outer.x, inner.x);
`,
    stdout: "order has,rhs,has,set 2 99\n",
  },
  {
    name: "retained-initially-unresolvable",
    source: `with ({}) {
  (function () {
    "use strict";
    try { oseoFreshWithName = (globalThis.oseoFreshWithName = 3); }
    catch (error) { console.log("unresolved", error.name); }
  })();
}
console.log("rhs global", globalThis.oseoFreshWithName);
delete globalThis.oseoFreshWithName;
`,
    stdout: "unresolved ReferenceError\nrhs global 3\n",
  },
];

/** The existing passing guard fixture, appended after each exact subject. */
const withFixedGuardProbe = `
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 1), hinted("1", 1));
const probe = { value: 0 };
for (let turn = 0; turn < 2; turn++) {
  console.log("guard", probe.value);
  if (turn === 0) probe.marker = 1;
}
`;

test(
  "fixed with reference discrepancies follow the ECMA-262 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const fixed of withFixedModelCases) {
      // Each subject was observed in both reference hosts; the fixed
      // normative expectation, not their divergent output, owns this check.
      try {
        await assertNative(fixed.source + withFixedGuardProbe, {
          exitStatus: 0,
          stderr: "",
          stdout: fixed.stdout + "hint 2 11\nguard 0\nguard 0\n",
        });
      } catch (cause) {
        throw new Error(`Fixed with subject '${fixed.name}' failed.`, {
          cause,
        });
      }
    }
  },
);
