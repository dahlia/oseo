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
import { zigToolchain } from "../../packages/toolchain-zig/src/index.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/** The four function kinds whose [[Prototype]] the realm owns. */
type Kind = "async" | "asyncGenerator" | "generator" | "ordinary";

/** The syntactic form the subject function is written in. */
type Form =
  | "arrow"
  | "classMethod"
  | "classStatic"
  | "declaration"
  | "expression"
  | "method";

/**
 * The one ordinary property or link a case replaces before observing the
 * chain. Every intrinsic link is an ordinary property, so each
 * replacement must be visible through the same reflection routes.
 */
type Mutation = "detach" | "instancePrototype" | "none" | "tag";

interface ChainCase {
  readonly form: Form;
  readonly kind: Kind;
  readonly mutation: Mutation;
}

/** An arrow function has no generator form. */
function formsFor(kind: Kind): readonly Form[] {
  const shared: readonly Form[] = [
    "classMethod",
    "classStatic",
    "declaration",
    "expression",
    "method",
  ];
  return kind === "generator" || kind === "asyncGenerator"
    ? shared
    : [...shared, "arrow"];
}

/** Only the two generator kinds create instances to reprototype. */
function mutationsFor(kind: Kind): readonly Mutation[] {
  const shared: readonly Mutation[] = ["detach", "none", "tag"];
  return kind === "generator" || kind === "asyncGenerator"
    ? [...shared, "instancePrototype"]
    : shared;
}

const caseArbitrary: fc.Arbitrary<ChainCase> = fc
  .constantFrom<Kind[]>("async", "asyncGenerator", "generator", "ordinary")
  .chain((kind) =>
    fc.record({
      form: fc.constantFrom(...formsFor(kind)),
      kind: fc.constant(kind),
      mutation: fc.constantFrom(...mutationsFor(kind)),
    }),
  );

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/** The head of one function definition, without a body. */
function definitionHead(kind: Kind): string {
  if (kind === "generator") return "function*";
  if (kind === "async") return "async function";
  if (kind === "asyncGenerator") return "async function*";
  return "function";
}

/** The prefix a concise method of this kind carries. */
function methodPrefix(kind: Kind): string {
  if (kind === "generator") return "*";
  if (kind === "async") return "async ";
  if (kind === "asyncGenerator") return "async *";
  return "";
}

/** A body that yields once for a generator kind and returns otherwise. */
function body(kind: Kind): string {
  return kind === "generator" || kind === "asyncGenerator"
    ? "{ yield 0; }"
    : "{ return 0; }";
}

function subjectSource(testCase: ChainCase): string {
  const { form, kind } = testCase;
  if (form === "declaration") {
    return (
      `${definitionHead(kind)} subjectDeclaration() ${body(kind)}\n` +
      "const subject = subjectDeclaration;"
    );
  }
  if (form === "expression") {
    return `const subject = ${definitionHead(kind)} () ${body(kind)};`;
  }
  if (form === "arrow") {
    return kind === "async"
      ? "const subject = async () => 0;"
      : "const subject = () => 0;";
  }
  if (form === "method") {
    return (
      `const holder = { ${methodPrefix(kind)}member() ${body(kind)} };\n` +
      "const subject = holder.member;"
    );
  }
  if (form === "classStatic") {
    return (
      `class Holder { static ${methodPrefix(kind)}member() ${body(kind)} }\n` +
      "const subject = Holder.member;"
    );
  }
  return (
    `class Holder { ${methodPrefix(kind)}member() ${body(kind)} }\n` +
    "const subject = Holder.prototype.member;"
  );
}

function referenceName(kind: Kind): string {
  if (kind === "generator") return "referenceGenerator";
  if (kind === "async") return "referenceAsync";
  if (kind === "asyncGenerator") return "referenceAsyncGenerator";
  return "referenceOrdinary";
}

function mutationSource(mutation: Mutation): string {
  if (mutation === "detach") {
    return "Object.setPrototypeOf(subject, Function.prototype);";
  }
  if (mutation === "instancePrototype") {
    return "subject.prototype = { marker: true };";
  }
  if (mutation === "tag") {
    return `Object.defineProperty(kindPrototype, Symbol.toStringTag, {
  configurable: true,
  enumerable: false,
  value: "Marked",
  writable: false,
});`;
  }
  return "";
}

function instanceSource(kind: Kind): string {
  if (kind !== "generator" && kind !== "asyncGenerator") {
    return 'console.log("instance", "none", "none", "none");';
  }
  return `const instance = subject();
console.log(
  "instance",
  Object.prototype.toString.call(instance),
  typeof instance.next,
  Object.getPrototypeOf(instance) === subject.prototype,
);`;
}

/*
 * OrdinaryOwnPropertyKeys reports non-index string keys in creation
 * order, and every key here is one, so the order the realm creates its
 * function-intrinsic properties in is observable through the own
 * descriptor record, and through Object.keys once a program makes the
 * configurable links enumerable. Every case observes it, because the
 * order must survive each replaced link and each specialization policy
 * alike.
 */
function orderSource(kind: Kind): string {
  if (kind === "ordinary") {
    return (
      'console.log("order", "none", "none");\n' +
      'console.log("instance order", "none", "none");'
    );
  }
  const helpers = `const orderCandidates = [
  "length",
  "name",
  "prototype",
  "constructor",
  "next",
  "return",
  "throw",
];
function createdOrder(object) {
  return Object.keys(Object.getOwnPropertyDescriptors(object)).join(",");
}
function enumerableOrder(object) {
  for (const candidate of orderCandidates) {
    const descriptor = Object.getOwnPropertyDescriptor(object, candidate);
    if (descriptor !== undefined && descriptor.configurable) {
      Object.defineProperty(object, candidate, { enumerable: true });
    }
  }
  return Object.keys(object).join(",");
}
console.log(
  "order",
  createdOrder(kindPrototype),
  enumerableOrder(kindPrototype),
);`;
  if (kind === "async") {
    return `${helpers}\nconsole.log("instance order", "none", "none");`;
  }
  return `${helpers}
const kindInstancePrototype = kindPrototype.prototype;
console.log(
  "instance order",
  createdOrder(kindInstancePrototype),
  enumerableOrder(kindInstancePrototype),
);`;
}

function printCase(testCase: ChainCase): string {
  return `
function* referenceGenerator() { yield 0; }
async function referenceAsync() { return 0; }
async function* referenceAsyncGenerator() { yield 0; }
function referenceOrdinary() { return 0; }
${subjectSource(testCase)}
const reference = ${referenceName(testCase.kind)};
const kindPrototype = Object.getPrototypeOf(reference);
${mutationSource(testCase.mutation)}
let depth = 0;
let walk = Object.getPrototypeOf(subject);
while (walk !== null) {
  depth = depth + 1;
  walk = Object.getPrototypeOf(walk);
}
console.log(
  "chain",
  depth,
  Object.getPrototypeOf(subject) === kindPrototype,
  Object.getPrototypeOf(kindPrototype) === Function.prototype,
);
console.log("tag", Object.prototype.toString.call(subject));
console.log(
  "constructor",
  String(Object.getPrototypeOf(subject).constructor.name),
);
console.log("peer", Object.prototype.toString.call(reference));
${instanceSource(testCase.kind)}
${orderSource(testCase.kind)}
`;
}

/** The intrinsic name every function of one kind reports. */
function kindTag(kind: Kind): string {
  if (kind === "generator") return "GeneratorFunction";
  if (kind === "async") return "AsyncFunction";
  if (kind === "asyncGenerator") return "AsyncGeneratorFunction";
  return "Function";
}

function expected(testCase: ChainCase): string {
  const { kind, mutation } = testCase;
  const ordinary = kind === "ordinary";
  const generatorKind = kind === "generator" || kind === "asyncGenerator";
  // An ordinary function already inherits from %Function.prototype%, so
  // detaching one changes nothing; every other kind loses one link.
  const depth = mutation === "detach" || ordinary ? 2 : 3;
  const onKind = String(mutation !== "detach" || ordinary);
  const nested = String(!ordinary);
  const chain = `chain ${depth} ${onKind} ${nested}\n`;
  const subjectTag =
    mutation === "detach"
      ? "Function"
      : mutation === "tag"
        ? "Marked"
        : kindTag(kind);
  const constructorName = mutation === "detach" ? "Function" : kindTag(kind);
  const peerTag = mutation === "tag" ? "Marked" : kindTag(kind);
  const instance = !generatorKind
    ? "instance none none none\n"
    : mutation === "instancePrototype"
      ? "instance [object Object] undefined true\n"
      : `instance [object ${
          kind === "generator" ? "Generator" : "AsyncGenerator"
        }] function true\n`;
  const order = ordinary
    ? "order none none\ninstance order none none\n"
    : kind === "async"
      ? "order constructor constructor\ninstance order none none\n"
      : "order prototype,constructor prototype,constructor\n" +
        "instance order constructor,next,return,throw " +
        "constructor,next,return,throw\n";
  return (
    chain +
    `tag [object ${subjectTag}]\n` +
    `constructor ${constructorName}\n` +
    `peer [object ${peerTag}]\n` +
    instance +
    order
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
    "oseo-function-chain-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(sourcePath, source);
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
  "generated functions expose the realm function intrinsic chains",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "every function kind reaches its own materialized constructor",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
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
            { source, sourceId: "generated-m5-function-intrinsic-chains.ts" },
            { specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
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
          "one ordinary, generator, asynchronous, or asynchronous " +
          "generator function written as a declaration, expression, arrow, " +
          "object method, class method, or static class method, with its " +
          "[[Prototype]] detached, its instance prototype replaced, its " +
          "kind prototype retagged, or unchanged, compared with an " +
          "independent chain-depth, identity, tag, constructor, and " +
          "intrinsic property creation order model under Node.js, Deno, " +
          "and both native specialization policies with forced collection",
        numRuns: 12,
        profile: "M5 generator and asynchronous function intrinsic chains",
        seed: 0x6000_5a00,
        sizeLimit:
          "one subject function, four reference functions, and at most " +
          "one replaced link per case",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);
