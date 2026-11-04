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
 * One input element: a number, a promise or a thenable that settles to
 * the number, or a promise rejected when the element is read.
 */
type Element =
  | { readonly kind: "plain" | "promise" | "thenable"; readonly value: number }
  | { readonly kind: "reject" };

type SourceKind = "array-like" | "async" | "sync";

type MapperKind =
  | "async"
  | "none"
  | "rejects"
  | "returns-thenable"
  | "sync"
  | "throws";

type ReceiverKind = "constructor" | "frozen" | "none";

interface FromAsyncCase {
  readonly elements: readonly Element[];
  /** Index whose async `next` rejects; -1 for none. */
  readonly nextRejectsAt: number;
  readonly mapper: MapperKind;
  /** Index at which a throwing or rejecting mapper fails. */
  readonly mapperFailsAt: number;
  readonly receiver: ReceiverKind;
  readonly source: SourceKind;
  readonly marker: number;
}

const elementArbitrary: fc.Arbitrary<Element> = fc.oneof(
  fc.record({
    kind: fc.constantFrom("plain", "promise", "thenable"),
    value: fc.integer({ max: 99, min: 0 }),
  }),
  fc.constant({ kind: "reject" as const }),
);

const caseArbitrary: fc.Arbitrary<FromAsyncCase> = fc
  .record({
    elements: fc.array(elementArbitrary, { maxLength: 4 }),
    mapper: fc.constantFrom<MapperKind>(
      "none",
      "sync",
      "async",
      "returns-thenable",
      "throws",
      "rejects",
    ),
    mapperFailsAt: fc.integer({ max: 3, min: 0 }),
    marker: fc.integer({ max: 1_000, min: 1 }),
    nextRejectsAt: fc.integer({ max: 4, min: -3 }),
    receiver: fc.constantFrom<ReceiverKind>("none", "constructor", "frozen"),
    source: fc.constantFrom<SourceKind>("async", "sync", "array-like"),
  })
  .map((testCase) =>
    Object.assign(testCase, {
      // An async iterator's values are not awaited, so a rejected promise
      // among them would stay unhandled; it fails through `next` instead.
      elements:
        testCase.source === "async"
          ? testCase.elements.filter((element) => element.kind !== "reject")
          : testCase.elements,
      nextRejectsAt:
        testCase.source === "async" ? Math.max(testCase.nextRejectsAt, -1) : -1,
    }),
  );

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function printElement(element: Element): string {
  switch (element.kind) {
    case "plain":
      return `{ kind: "plain", value: ${element.value} }`;
    case "promise":
      return `{ kind: "promise", value: ${element.value} }`;
    case "thenable":
      return `{ kind: "thenable", value: ${element.value} }`;
    case "reject":
      return `{ kind: "reject" }`;
  }
}

function printCase(testCase: FromAsyncCase): string {
  const elements = testCase.elements.map(printElement).join(",\n  ");
  return `
const log = [];
class Marker extends Error {}
function materialize(element) {
  if (element.kind === "plain") return element.value;
  if (element.kind === "promise") return Promise.resolve(element.value);
  if (element.kind === "reject") return Promise.reject(new Marker("element"));
  return {
    then(resolve) {
      log.push("then " + element.value);
      resolve(element.value);
    },
  };
}
function show(value) {
  if (value instanceof Promise) return "P";
  if (typeof value === "object" && value !== null) return "T";
  return String(value);
}
const elements = [
  ${elements}
];
const sourceKind = "${testCase.source}";
const nextRejectsAt = ${testCase.nextRejectsAt};
const hasReject = elements.some((element) => element.kind === "reject");
function openIterator() {
  log.push("open");
  let index = 0;
  const iterator = {
    next() {
      log.push("next " + index);
      const position = index;
      index = index + 1;
      if (sourceKind === "async") {
        if (position === nextRejectsAt) {
          return Promise.reject(new Marker("next"));
        }
        return Promise.resolve(position >= elements.length
          ? { done: true, value: undefined }
          : { done: false, value: materialize(elements[position]) });
      }
      return position >= elements.length
        ? { done: true, value: undefined }
        : { done: false, value: materialize(elements[position]) };
    },
  };
  // A rejected element closes a synchronous iterator through its
  // wrapper, and V8 closes it a second time, so that iterator has no
  // observable return method.
  if (!(sourceKind === "sync" && hasReject)) {
    iterator.return = function () {
      log.push("return");
      return {};
    };
  }
  return iterator;
}
const items = {
  get [Symbol.asyncIterator]() {
    log.push("get-async");
    return sourceKind === "async" ? openIterator : undefined;
  },
  get [Symbol.iterator]() {
    log.push("get-sync");
    return sourceKind === "sync" ? openIterator : undefined;
  },
};
if (sourceKind === "array-like") {
  Object.defineProperty(items, "length", {
    get() {
      log.push("length");
      return elements.length;
    },
  });
  for (let index = 0; index < elements.length; index = index + 1) {
    Object.defineProperty(items, index, {
      get() {
        log.push("get " + index);
        return materialize(elements[index]);
      },
    });
  }
}
const mapperKind = "${testCase.mapper}";
const mapperFailsAt = ${testCase.mapperFailsAt};
const mapper = function (value, index) {
  "use strict";
  log.push("map " + show(value) + "@" + index + "/" + this.tag);
  if (mapperKind === "throws" && index === mapperFailsAt) {
    throw new Marker("map");
  }
  if (mapperKind === "rejects" && index === mapperFailsAt) {
    return Promise.reject(new Marker("map"));
  }
  if (mapperKind === "async") {
    return (async () => (typeof value === "number" ? value + 1 : value))();
  }
  if (mapperKind === "returns-thenable") {
    return materialize({ kind: "thenable", value: index });
  }
  return typeof value === "number" ? value + 1 : value;
};
function Receiver(...args) {
  log.push("construct " + args.join(","));
}
function Frozen(...args) {
  log.push("construct " + args.join(","));
  return Object.freeze({});
}
const receiverKind = "${testCase.receiver}";
const receiver = receiverKind === "constructor"
  ? Receiver
  : receiverKind === "frozen" ? Frozen : Array;
const start = mapperKind === "none"
  ? () => Array.fromAsync.call(receiver, items)
  : () => Array.fromAsync.call(receiver, items, mapper, { tag: "this" });
start().then(
  (value) => {
    const kind = Array.isArray(value) ? "array" : value.constructor.name;
    console.log(log.join(","));
    console.log(
      "ok",
      kind,
      value.length,
      Array.from(value).map(show).join(","),
    );
  },
  (error) => {
    console.log(log.join(","));
    console.log(
      "error",
      error instanceof Marker ? "marker:" + error.message : error.name,
    );
  },
);
let turn = 0;
while (turn < 2) {
  console.log("guard", Array.fromAsync.length + ${testCase.marker});
  if (turn === 0) Array.marker = turn;
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

/** How an element prints when it reaches the result unawaited. */
function shown(element: Element): string {
  if (element.kind === "plain") return String(element.value);
  return element.kind === "promise" ? "P" : "T";
}

interface ModelResult {
  readonly stdout: string;
  /**
   * The case reaches a step where V8 departs from the edition: it closes
   * an async iterator after its own `next` rejects, and after the final
   * length Set fails.
   */
  readonly v8Divergent: boolean;
}

/**
 * The independent model of the closure. Within one call every observable
 * step runs in the closure's order, whatever the number of turns between
 * them, so the model logs steps in sequence: each Await on a thenable
 * calls its `then` before the closure continues.
 */
function expected(testCase: FromAsyncCase): ModelResult {
  const log: string[] = [];
  const elements = testCase.elements;
  const mapping = testCase.mapper !== "none";
  const closable = !(
    testCase.source === "sync" &&
    elements.some((element) => element.kind === "reject")
  );
  let v8Divergent = false;
  const target: string[] = [];
  const awaitValue = (element: Element): number | "reject" => {
    if (element.kind === "reject") return "reject";
    if (element.kind === "thenable") log.push(`then ${element.value}`);
    return element.value;
  };
  const close = (): void => {
    if (closable) log.push("return");
  };
  /*
   * One mapping and define step. Returns the error label, or null when
   * the value was defined.
   */
  const store = (
    input: string,
    numeric: number | undefined,
    index: number,
    iterating: boolean,
    pending?: Element,
  ): string | null => {
    let stored = input;
    if (mapping) {
      log.push(`map ${input}@${index}/this`);
      const fails = index === testCase.mapperFailsAt;
      if (testCase.mapper === "throws" && fails) {
        if (iterating) close();
        return "marker:map";
      }
      if (testCase.mapper === "rejects" && fails) {
        if (iterating) close();
        return "marker:map";
      }
      if (testCase.mapper === "returns-thenable") {
        log.push(`then ${index}`);
        stored = String(index);
      } else if (numeric !== undefined) {
        stored = String(numeric + 1);
      } else if (pending != null) {
        // An async iterator's promise or thenable reaches the mapper
        // unawaited, comes back unchanged, and is awaited as the mapped
        // value.
        stored = String(awaitValue(pending));
      }
    }
    if (testCase.receiver === "frozen") {
      if (iterating) close();
      return "TypeError";
    }
    target.push(stored);
    return null;
  };
  const finish = (error: string | null): ModelResult => {
    const kind = testCase.receiver === "constructor" ? "Receiver" : "array";
    const tail =
      error == null
        ? `ok ${kind} ${target.length} ${target.join(",")}`
        : `error ${error}`;
    return { stdout: `${log.join(",")}\n${tail}\n`, v8Divergent };
  };
  log.push("get-async");
  if (testCase.source !== "async") log.push("get-sync");
  if (testCase.source === "array-like") {
    log.push("length");
    if (testCase.receiver !== "none") log.push(`construct ${elements.length}`);
    for (let index = 0; index < elements.length; index += 1) {
      log.push(`get ${index}`);
      const settled = awaitValue(elements[index]!);
      if (settled === "reject") return finish("marker:element");
      const error = store(String(settled), settled, index, false);
      if (error != null) return finish(error);
    }
    // Set(A, "length") fails on the frozen receiver only when no element
    // was defined first.
    if (testCase.receiver === "frozen") return finish("TypeError");
    return finish(null);
  }
  log.push("open");
  if (testCase.receiver !== "none") log.push("construct ");
  for (let index = 0; ; index += 1) {
    log.push(`next ${index}`);
    if (testCase.source === "async" && index === testCase.nextRejectsAt) {
      v8Divergent = true;
      return finish("marker:next");
    }
    if (index >= elements.length) {
      if (testCase.receiver === "frozen") {
        v8Divergent = true;
        return finish("TypeError");
      }
      return finish(null);
    }
    const element = elements[index]!;
    if (testCase.source === "async") {
      // The value is not awaited; a number stays a number for the mapper.
      const numeric = element.kind === "plain" ? element.value : undefined;
      const error = store(shown(element), numeric, index, true, element);
      if (error != null) return finish(error);
      continue;
    }
    const settled = awaitValue(element);
    if (settled === "reject") return finish("marker:element");
    const error = store(String(settled), settled, index, true);
    if (error != null) return finish(error);
  }
}

function prefix(testCase: FromAsyncCase): string {
  return [
    `guard ${testCase.marker + 1}`,
    `guard ${testCase.marker + 1}`,
    `hint ${testCase.marker + 1} ${testCase.marker}1`,
    "",
  ].join("\n");
}

async function reference(
  command: string,
  args: readonly string[],
  source: string,
): Promise<{
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-array-from-async-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    // Deno runs a file as a module, so both hosts evaluate the source as
    // a global Script through indirect eval.
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
    );
    const observation = await host.run({
      args: [...args, sourcePath],
      command,
      cwd: directory,
    });
    succeeded = true;
    return observation;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test(
  "generated Array.fromAsync inputs match the closure model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Array.fromAsync settles and orders its steps like the closure",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const model = expected(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: prefix(testCase) + model.stdout,
        };
        // Both reference hosts run V8, which departs from the edition on
        // the steps the model flags; the model alone decides those cases.
        if (!model.v8Divergent) {
          assertMatchingObservations([
            expectedObservation,
            await reference(process.execPath, [], source),
            await reference("deno", ["run", "--quiet"], source),
          ]);
        }
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-es2026-array-from-async.ts" },
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
          "an async iterable, a sync iterable, or an array-like of zero " +
          "to four numbers, promises, thenables, or rejected promises, " +
          "an async next that may reject, six mapper kinds that may fail " +
          "at one index, and the Array, constructor, or frozen receiver, " +
          "plus one constructor shape guard miss and one false number hint",
        numRuns: 12,
        profile: "ES2026 Array.fromAsync",
        seed: 0x6000_a500,
        sizeLimit:
          "at most four elements, five next calls, one mapper failure, " +
          "and one constructor property write",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
