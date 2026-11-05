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

/*
 * One declared resource. `sync` declares `using` over a Symbol.dispose
 * method; `async` declares `await using` over a Symbol.asyncDispose
 * method; `fallback` declares `await using` over a Symbol.dispose
 * method; `null` declares `await using` of null, which disposes nothing
 * but still awaits. A failing method throws, and an asynchronous one
 * rejects.
 */
interface Resource {
  readonly fails: boolean;
  readonly kind: "async" | "fallback" | "null" | "sync";
}

/* One statement of a generated scope. */
type Entry =
  | { readonly kind: "block"; readonly scope: Scope }
  | { readonly kind: "loop"; readonly resources: readonly Resource[] }
  | { readonly kind: "use"; readonly resource: Resource };

/* How a scope ends after its entries, if none of them ended it first. */
type Exit = "break" | "normal" | "return" | "throw";

interface Scope {
  readonly entries: readonly Entry[];
  readonly exit: Exit;
}

interface UsingCase {
  readonly marker: number;
  readonly scope: Scope;
}

const resourceArbitrary: fc.Arbitrary<Resource> = fc.record({
  fails: fc.boolean(),
  kind: fc.constantFrom<Resource["kind"]>("async", "fallback", "null", "sync"),
});

const exitArbitrary = fc.constantFrom<Exit>(
  "normal",
  "normal",
  "break",
  "return",
  "throw",
);

const scopeArbitrary: fc.Arbitrary<Scope> = fc.letrec<{
  entry: Entry;
  scope: Scope;
}>((tie) => ({
  entry: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    fc.record({
      kind: fc.constant("use" as const),
      resource: resourceArbitrary,
    }),
    fc.record({
      kind: fc.constant("loop" as const),
      resources: fc.array(resourceArbitrary, { maxLength: 3, minLength: 1 }),
    }),
    fc.record({ kind: fc.constant("block" as const), scope: tie("scope") }),
  ),
  scope: fc.record({
    entries: fc.array(tie("entry"), { maxLength: 4 }),
    exit: exitArbitrary,
  }),
})).scope;

const caseArbitrary: fc.Arbitrary<UsingCase> = fc.record({
  marker: fc.integer({ max: 1_000, min: 1 }),
  scope: scopeArbitrary,
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/** The source text of one resource value, numbered `id`. */
function printResource(resource: Resource, id: number): string {
  const fail = resource.fails ? ` throw new Error("e${id}");` : "";
  switch (resource.kind) {
    case "async":
      return `{ async [Symbol.asyncDispose]() { log.push("d${id}");${fail} } }`;
    case "fallback":
    case "sync":
      return `{ [Symbol.dispose]() { log.push("d${id}");${fail} } }`;
    case "null":
      return "null";
  }
}

function declaration(resource: Resource): string {
  return resource.kind === "sync" ? "using" : "await using";
}

interface Printer {
  next: number;
}

function printScope(scope: Scope, printer: Printer, depth: number): string {
  const lines: string[] = [];
  for (const entry of scope.entries) {
    if (entry.kind === "use") {
      const id = printer.next;
      printer.next += 1;
      lines.push(
        `${declaration(entry.resource)} r${id} = ` +
          `${printResource(entry.resource, id)};`,
      );
    } else if (entry.kind === "loop") {
      const ids = entry.resources.map(() => {
        const id = printer.next;
        printer.next += 1;
        return id;
      });
      const values = entry.resources
        .map((resource, index) => printResource(resource, ids[index]!))
        .join(", ");
      const asynchronous = entry.resources.some(
        (resource) => resource.kind !== "sync",
      );
      lines.push(
        `for (${asynchronous ? "await using" : "using"} item of [${values}]) ` +
          'log.push("body");',
      );
    } else {
      lines.push(`{\n${printScope(entry.scope, printer, depth + 1)}\n}`);
    }
  }
  if (scope.exit === "break") lines.push("break outer;");
  if (scope.exit === "return") lines.push('return "returned";');
  if (scope.exit === "throw") lines.push(`throw new Error("t${depth}");`);
  return lines.join("\n");
}

function printCase(testCase: UsingCase): string {
  const body = printScope(testCase.scope, { next: 0 }, 0);
  return `
const log = [];
function describe(error) {
  if (error instanceof SuppressedError) {
    return "S(" + describe(error.error) + "," +
      describe(error.suppressed) + ")";
  }
  return error instanceof Error ? error.message : "?" + String(error);
}
async function run() {
  outer: {
${body}
  }
  return "completed";
}
async function main() {
  let outcome;
  try {
    outcome = "value " + (await run());
  } catch (error) {
    outcome = "error " + describe(error);
  }
  console.log(log.join(","), outcome);
  let turn = 0;
  while (turn < 2) {
    const each = new DisposableStack();
    each.defer(() => log.push(${testCase.marker}));
    each.dispose();
    console.log("guard", log.pop(), each.disposed);
    if (turn === 0) DisposableStack.prototype.marker = turn;
    turn = turn + 1;
  }
  /** @param {number} left @param {number} right */
  function hinted(left, right) { return left + right; }
  console.log(
    "hint",
    hinted(${testCase.marker}, 1),
    hinted("${testCase.marker}", 1),
  );
}
main();
`;
}

/* A scope's completion in the model. */
type Completion =
  | { readonly kind: "break" | "normal" | "return" }
  | { readonly kind: "throw"; readonly error: string };

/** DisposeResources over `failures`, innermost first, from `completion`. */
function dispose(
  completion: Completion,
  disposed: readonly { readonly failure?: string; readonly id: number }[],
  log: string[],
): Completion {
  let result = completion;
  for (const resource of disposed.toReversed()) {
    log.push(`d${resource.id}`);
    if (resource.failure == null) continue;
    result =
      result.kind === "throw"
        ? { error: `S(${resource.failure},${result.error})`, kind: "throw" }
        : { error: resource.failure, kind: "throw" };
  }
  return result;
}

/** The disposal record of one non-null resource numbered `id`. */
function disposalRecord(
  resource: Resource,
  id: number,
): readonly { readonly failure?: string; readonly id: number }[] {
  if (resource.kind === "null") return [];
  return [resource.fails ? { failure: `e${id}`, id } : { id }];
}

/**
 * The independent model: entries run in order until one completes
 * abruptly, every declared resource joins its scope's list, a loop gives
 * each iteration its own one-resource scope, and each scope disposes its
 * list in reverse when it completes, folding failures into the
 * completion as SuppressedError chains.
 */
function runScope(
  scope: Scope,
  printer: Printer,
  depth: number,
  log: string[],
): Completion {
  const disposed: { readonly failure?: string; readonly id: number }[] = [];
  let completion: Completion = { kind: "normal" };
  const skipIds = (entries: readonly Entry[]): void => {
    for (const entry of entries) {
      if (entry.kind === "use") printer.next += 1;
      else if (entry.kind === "loop") printer.next += entry.resources.length;
      else skipIds(entry.scope.entries);
    }
  };
  let index = 0;
  for (; index < scope.entries.length; index += 1) {
    const entry = scope.entries[index]!;
    if (entry.kind === "use") {
      const id = printer.next;
      printer.next += 1;
      disposed.push(...disposalRecord(entry.resource, id));
    } else if (entry.kind === "loop") {
      const ids = entry.resources.map(() => {
        const id = printer.next;
        printer.next += 1;
        return id;
      });
      for (let item = 0; item < entry.resources.length; item += 1) {
        log.push("body");
        const result = dispose(
          { kind: "normal" },
          disposalRecord(entry.resources[item]!, ids[item]!),
          log,
        );
        if (result.kind !== "normal") {
          completion = result;
          break;
        }
      }
    } else {
      completion = runScope(entry.scope, printer, depth + 1, log);
    }
    if (completion.kind !== "normal") {
      index += 1;
      break;
    }
  }
  skipIds(scope.entries.slice(index));
  if (completion.kind === "normal") {
    if (scope.exit === "throw") {
      completion = { error: `t${depth}`, kind: "throw" };
    } else if (scope.exit !== "normal") {
      completion = { kind: scope.exit };
    }
  }
  return dispose(completion, disposed, log);
}

function expected(testCase: UsingCase): string {
  const log: string[] = [];
  const completion = runScope(testCase.scope, { next: 0 }, 0, log);
  const outcome =
    completion.kind === "throw"
      ? `error ${completion.error}`
      : completion.kind === "return"
        ? "value returned"
        : "value completed";
  return [
    `${log.join(",")} ${outcome}`,
    `guard ${testCase.marker} true`,
    `guard ${testCase.marker} true`,
    `hint ${testCase.marker + 1} ${testCase.marker}1`,
    "",
  ].join("\n");
}

/* Node.js runs the same program as the differential reference. */
async function reference(source: string): Promise<{
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-using-declarations-property-",
  );
  const sourcePath = `${directory}/case.js`;
  let succeeded = false;
  try {
    await host.writeTextFile(sourcePath, source);
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

test(
  "generated using scopes match the disposal model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "using scopes dispose in reverse order and chain SuppressedError",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          await reference(source),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-using-declarations.js" },
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
          "nested block scopes of up to four entries, each a using or " +
          "await using declaration of a synchronous, asynchronous, " +
          "Symbol.dispose fallback, or null resource whose disposal may " +
          "throw or reject, a for-of loop with a using head over one to " +
          "three resources, or a nested scope, each scope ending normally " +
          "or by break, return, or throw, plus one prototype shape guard " +
          "miss and one false number hint",
        numRuns: 12,
        profile: "explicit resource management using declarations",
        seed: 0x6000_aa00,
        sizeLimit:
          "fast-check small depth, at most four entries per scope, and " +
          "three resources per loop",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
