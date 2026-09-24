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
