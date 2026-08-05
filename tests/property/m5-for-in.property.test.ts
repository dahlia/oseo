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
import { zigToolchain } from "../../packages/toolchain-zig/src/index.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/** One own property of one generated prototype-chain level. */
interface KeySpec {
  readonly enumerable: boolean;
  readonly name: string;
}

type HeadKind = "assignment" | "const" | "let" | "member" | "var";

type MutationKind =
  | "add-own"
  | "add-parent"
  | "delete-own"
  | "delete-parent"
  | "none";

type SubjectKind =
  | "null"
  | "number"
  | "object"
  | "string"
  | "symbol"
  | "undefined";

interface ForInCase {
  readonly head: HeadKind;
  /** Own keys per level, innermost first; later entries are prototypes. */
  readonly levels: readonly (readonly KeySpec[])[];
  readonly mutation: MutationKind;
  /** Selects the mutated key from its level without filtering the case. */
  readonly mutationTarget: number;
  readonly subject: SubjectKind;
}

/**
 * The mutable model an oracle run enumerates. It is a direct model of
 * the own-property list and [[Prototype]] link the specified rules
 * consult, not a copy of any compiler structure.
 */
interface ModelLevel {
  keys: KeySpec[];
  parent: ModelLevel | undefined;
}

const keyPool = ["0", "1", "alpha", "beta", "gamma", "delta"] as const;

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const keySpecArbitrary: fc.Arbitrary<KeySpec> = fc.record({
  enumerable: fc.boolean(),
  name: fc.constantFrom(...keyPool),
});

const caseArbitrary: fc.Arbitrary<ForInCase> = fc.record({
  head: fc.constantFrom(
    "assignment" as const,
    "const" as const,
    "let" as const,
    "member" as const,
    "var" as const,
  ),
  levels: fc.array(
    fc
      .uniqueArray(keySpecArbitrary, {
        maxLength: 4,
        selector: (spec) => spec.name,
      })
      .map((specs) => specs as readonly KeySpec[]),
    { maxLength: 3, minLength: 1 },
  ),
  mutation: fc.constantFrom(
    "add-own" as const,
    "add-parent" as const,
    "delete-own" as const,
    "delete-parent" as const,
    "none" as const,
  ),
  mutationTarget: fc.integer({ max: 3, min: 0 }),
  subject: fc.constantFrom(
    "null" as const,
    "number" as const,
    "object" as const,
    "string" as const,
    "symbol" as const,
    "undefined" as const,
  ),
});

function levelName(index: number): string {
  return `level${index}`;
}

/** OrdinaryOwnPropertyKeys: ascending indices, then creation order. */
function ownKeyOrder(keys: readonly KeySpec[]): readonly string[] {
  const indices = keys
    .filter((spec) => /^(?:0|[1-9][0-9]*)$/u.test(spec.name))
    .map((spec) => spec.name)
    .toSorted((left, right) => Number(left) - Number(right));
  const names = keys
    .filter((spec) => !/^(?:0|[1-9][0-9]*)$/u.test(spec.name))
    .map((spec) => spec.name);
  return [...indices, ...names];
}

function buildModel(testCase: ForInCase): ModelLevel | undefined {
  if (testCase.subject === "null" || testCase.subject === "undefined") {
    return undefined;
  }
  if (testCase.subject === "number" || testCase.subject === "symbol") {
    // ToObject of a number owns nothing and inherits nothing this realm
    // creates; ToObject of a symbol owns nothing and inherits
    // %Symbol.prototype%, which no generated program extends.
    return { keys: [], parent: undefined };
  }
  if (testCase.subject === "string") {
    // ToObject of a string owns one enumerable property per code unit
    // index and a non-enumerable `length`; %String.prototype% adds no
    // enumerable property.
    return {
      keys: [
        { enumerable: true, name: "0" },
        { enumerable: true, name: "1" },
        { enumerable: false, name: "length" },
      ],
      parent: undefined,
    };
  }
  let parent: ModelLevel | undefined;
  for (let index = testCase.levels.length - 1; index >= 0; index -= 1) {
    parent = { keys: [...(testCase.levels[index] ?? [])], parent };
  }
  return parent;
}

function mutationSite(
  testCase: ForInCase,
): { readonly key: string; readonly level: number } | undefined {
  if (testCase.mutation === "none") return undefined;
  const parent = testCase.mutation.endsWith("parent");
  const level = parent ? 1 : 0;
  if (testCase.subject !== "object" || level >= testCase.levels.length) {
    return undefined;
  }
  if (testCase.mutation.startsWith("add")) return { key: "epsilon", level };
  const keys = testCase.levels[level] ?? [];
  if (keys.length === 0) return undefined;
  const selected = keys[testCase.mutationTarget % keys.length];
  return selected == null ? undefined : { key: selected.name, level };
}

/**
 * The independent oracle: 14.7.5.9's rules applied to the model, with
 * the collection point both reference hosts choose. The whole chain is
 * walked once: each level's own string keys are taken in
 * OrdinaryOwnPropertyKeys order, a name already recorded at a nearer
 * level is skipped whether or not that nearer property was enumerable,
 * and a surviving name is collected only if its own property was
 * enumerable then. A step reports the next collected name only while the
 * receiver still has a property of that name anywhere on its chain,
 * which is what makes a property deleted before it is processed ignored.
 * The body's mutation runs after the first reported key, which is where
 * the generated program performs it.
 */
function model(testCase: ForInCase): string {
  const root = buildModel(testCase);
  if (root == null) return "\n";
  const site = mutationSite(testCase);
  const levels: ModelLevel[] = [];
  for (
    let cursor: ModelLevel | undefined = root;
    cursor != null;
    cursor = cursor.parent
  ) {
    levels.push(cursor);
  }
  const mutate = (): void => {
    if (site == null) return;
    const level = levels[site.level];
    if (level == null) return;
    if (testCase.mutation.startsWith("add")) {
      level.keys = [...level.keys, { enumerable: true, name: site.key }];
      return;
    }
    level.keys = level.keys.filter((spec) => spec.name !== site.key);
  };
  const seen = new Set<string>();
  const collected: string[] = [];
  for (const level of levels) {
    for (const name of ownKeyOrder(level.keys)) {
      if (seen.has(name)) continue;
      seen.add(name);
      if (level.keys.some((spec) => spec.name === name && spec.enumerable)) {
        collected.push(name);
      }
    }
  }
  const reachable = (name: string): boolean =>
    levels.some((level) => level.keys.some((spec) => spec.name === name));
  const reported: string[] = [];
  for (const name of collected) {
    if (!reachable(name)) continue;
    reported.push(name);
    if (reported.length === 1) mutate();
  }
  return `${reported.map((name) => `${name} `).join("")}\n`;
}

function defineKeys(level: number, keys: readonly KeySpec[]): string {
  return keys
    .map((spec) =>
      spec.enumerable
        ? `${levelName(level)}[${JSON.stringify(spec.name)}] = 1;`
        : `Object.defineProperty(${levelName(level)}, ` +
          `${JSON.stringify(spec.name)}, ` +
          "{ configurable: true, enumerable: false, value: 1, " +
          "writable: true });",
    )
    .join("\n");
}

function subjectSource(testCase: ForInCase): string {
  if (testCase.subject === "null") return "null";
  if (testCase.subject === "undefined") return "undefined";
  if (testCase.subject === "number") return "7";
  if (testCase.subject === "symbol") return 'Symbol("mark")';
  if (testCase.subject === "string") return '"ab"';
  return levelName(0);
}

function headSource(testCase: ForInCase): {
  readonly declaration: string;
  readonly head: string;
  readonly read: string;
} {
  if (testCase.head === "const" || testCase.head === "let") {
    return {
      declaration: "",
      head: `${testCase.head} key`,
      read: "key",
    };
  }
  if (testCase.head === "var") {
    return { declaration: "var key;", head: "var key", read: "key" };
  }
  if (testCase.head === "assignment") {
    return { declaration: "let key;", head: "key", read: "key" };
  }
  return {
    declaration: "const holder = {};",
    head: "holder.key",
    read: "holder.key",
  };
}

function mutationSource(testCase: ForInCase): string {
  const site = mutationSite(testCase);
  if (site == null) return "";
  const target = `${levelName(site.level)}[${JSON.stringify(site.key)}]`;
  return testCase.mutation.startsWith("add")
    ? `${target} = 1;`
    : `delete ${target};`;
}

function printCase(testCase: ForInCase): string {
  const levels = testCase.levels;
  const declarations: string[] = [];
  for (let index = levels.length - 1; index >= 0; index -= 1) {
    const parent = index === levels.length - 1 ? "null" : levelName(index + 1);
    declarations.push(`const ${levelName(index)} = Object.create(${parent});`);
    declarations.push(defineKeys(index, levels[index] ?? []));
  }
  const head = headSource(testCase);
  const mutation = mutationSource(testCase);
  return `
${declarations.join("\n")}
${head.declaration}
let seen = "";
let steps = 0;
for (${head.head} in ${subjectSource(testCase)}) {
  seen = seen + ${head.read} + " ";
  steps = steps + 1;
  if (steps === 1) { ${mutation} }
}
console.log(seen);
`;
}

async function references(source: string): Promise<
  readonly {
    readonly exitStatus: number;
    readonly stderr: string;
    readonly stdout: string;
  }[]
> {
  const directory = await host.makeTemporaryDirectory("oseo-for-in-property-");
  const sourcePath = `${directory}/case.js`;
  try {
    await host.writeTextFile(sourcePath, source);
    return [
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
    ];
  } finally {
    await host.remove(directory);
  }
}

test("for-in model applies the specified enumeration rules", () => {
  assert.equal(
    model({
      head: "const",
      levels: [[{ enumerable: true, name: "alpha" }]],
      mutation: "none",
      mutationTarget: 0,
      subject: "null",
    }),
    "\n",
  );
  assert.equal(
    model({
      head: "const",
      levels: [
        [{ enumerable: false, name: "alpha" }],
        [{ enumerable: true, name: "alpha" }],
      ],
      mutation: "none",
      mutationTarget: 0,
      subject: "object",
    }),
    "\n",
  );
  assert.equal(
    model({
      head: "const",
      levels: [
        [
          { enumerable: true, name: "beta" },
          { enumerable: true, name: "0" },
        ],
      ],
      mutation: "none",
      mutationTarget: 0,
      subject: "object",
    }),
    "0 beta \n",
  );
  assert.equal(
    model({
      head: "const",
      levels: [[{ enumerable: true, name: "alpha" }]],
      mutation: "none",
      mutationTarget: 0,
      subject: "string",
    }),
    "0 1 \n",
  );
});

test(
  "generated for-in enumerations match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "for-in reports every own and inherited enumerable string key once",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: model(testCase),
        };
        const referenceResults = await references(source);
        assertMatchingObservations([expectedObservation, ...referenceResults]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-for-in.js" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          assert.match(mir, /enumerate-get EnumerateObjectProperties/u);
          // An enumerate head is never closed, whatever the head form or
          // the subject.
          assert.doesNotMatch(mir, /iterator-close/u);
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
                toolchain: zigToolchain,
              },
              (native) => {
                assertMatchingObservations([expectedObservation, native]);
                assert.ok(native.counters != null);
                assert.ok(native.counters.collections > 0);
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
          "for-in over a one- to three-level prototype chain of enumerable " +
          "and non-enumerable index and string keys, over a string, a " +
          "number, a symbol, null, and undefined subject, through const, " +
          "let, var, " +
          "identifier assignment, and member head targets, with a key " +
          "added to or deleted from the own or the parent level after the " +
          "first reported key",
        numRuns: 24,
        profile: "M5 for-in enumeration",
        seed: 0x6000_1500,
        sizeLimit: "three prototype levels of at most four own keys each",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
