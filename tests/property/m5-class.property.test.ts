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

/** How one generated class binds and names itself. */
type ClassForm = "anonymous" | "declaration" | "named-expression";

/** What one generated prototype method or getter returns. */
type MethodKind = "constant" | "field" | "self";

/**
 * Which prototype element one generated definition installs. A `pair`
 * writes a getter and a setter clause under one key, so a computed key
 * evaluates twice.
 */
type ElementKind = "getter" | "method" | "pair" | "setter";

interface MethodSpec {
  /** A computed key evaluates at class-definition time and is ordered. */
  readonly computed: boolean;
  readonly element: ElementKind;
  /** Selects the body of a method or getter; a lone setter ignores it. */
  readonly kind: MethodKind;
  readonly value: number;
}

interface ClassCase {
  /** Constructor parameters stored as `f0`, `f1`, ... on the instance. */
  readonly fields: readonly number[];
  readonly form: ClassForm;
  readonly methods: readonly MethodSpec[];
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const methodArbitrary: fc.Arbitrary<MethodSpec> = fc.record({
  computed: fc.boolean(),
  element: fc.constantFrom<ElementKind>("getter", "method", "pair", "setter"),
  kind: fc.constantFrom<MethodKind>("constant", "field", "self"),
  value: fc.integer({ max: 20, min: -20 }),
});

/**
 * An anonymous class expression has no class-scope name binding, and a
 * `field` method needs at least one constructor parameter, so both kinds
 * degrade to `constant` instead of generating unrepresentable source.
 */
const caseArbitrary: fc.Arbitrary<ClassCase> = fc
  .record({
    fields: fc.array(fc.integer({ max: 20, min: -20 }), { maxLength: 2 }),
    form: fc.constantFrom<ClassForm>(
      "anonymous",
      "declaration",
      "named-expression",
    ),
    methods: fc.array(methodArbitrary, { maxLength: 3 }),
  })
  .map((testCase) => ({
    fields: testCase.fields,
    form: testCase.form,
    methods: testCase.methods.map((method) => {
      const unrepresentable =
        (method.kind === "self" && testCase.form === "anonymous") ||
        (method.kind === "field" && testCase.fields.length === 0);
      return unrepresentable
        ? {
            computed: method.computed,
            element: method.element,
            kind: "constant" as const,
            value: method.value,
          }
        : method;
    }),
  }));

/** The class-scope binding a `self` method reads, if the form has one. */
function innerName(testCase: ClassCase): string {
  return testCase.form === "declaration" ? "Shape" : "Inner";
}

/** Independent model of one method's observed return value. */
function methodResult(testCase: ClassCase, method: MethodSpec): string {
  if (method.kind === "field") return String(testCase.fields[0]);
  if (method.kind === "self") return "true";
  return String(method.value);
}

/**
 * Independent model of the evaluation order marker string: every computed
 * key evaluates in source order while the class is defined, a getter and
 * setter pair evaluates its key once per clause, and `c` marks the
 * constructor call that follows.
 */
function modelOrder(testCase: ClassCase): string {
  return (
    testCase.methods
      .map((method, index) =>
        method.computed
          ? String(index).repeat(method.element === "pair" ? 2 : 1)
          : "",
      )
      .join("") + "c"
  );
}

function printCase(testCase: ClassCase): string {
  const parameters = testCase.fields.map((_, index) => `p${index}`).join(", ");
  const assignments = testCase.fields
    .map((_, index) => `    this.f${index} = p${index};`)
    .join("\n");
  const bodies = testCase.methods.map((method, index) => {
    const key = method.computed ? `[mark("m${index}", ${index})]` : `m${index}`;
    const returned =
      method.kind === "field"
        ? "this.f0"
        : method.kind === "self"
          ? `${innerName(testCase)} === received`
          : String(method.value);
    // A getter takes no parameter, so a `self` getter compares the
    // class-scope binding with the outer binding instead of an argument.
    const read =
      method.kind === "self" ? `${innerName(testCase)} === Shape` : returned;
    const setter = `  set ${key}(value) {\n    this.s${index} = value;\n  }`;
    if (method.element === "getter" || method.element === "pair") {
      const getter = `  get ${key}() {\n    return ${read};\n  }`;
      return method.element === "pair" ? `${getter}\n${setter}` : getter;
    }
    if (method.element === "setter") return setter;
    const signature = method.kind === "self" ? "received" : "";
    return `  ${key}(${signature}) {\n    return ${returned};\n  }`;
  });
  const body = [
    `  constructor(${parameters}) {`,
    '    order = order + "c";',
    ...(assignments === "" ? [] : [assignments]),
    "  }",
    ...bodies,
  ].join("\n");
  const head =
    testCase.form === "declaration"
      ? "class Shape {"
      : testCase.form === "named-expression"
        ? "const Shape = class Inner {"
        : "const Shape = class {";
  const tail = testCase.form === "declaration" ? "}" : "};";
  const reads = testCase.methods.map((method, index) => {
    const argument = method.kind === "self" ? "Shape" : "";
    const descriptor = `d${index}`;
    const lookup =
      `const ${descriptor} = Object.getOwnPropertyDescriptor(` +
      `Shape.prototype, "m${index}");\n`;
    const attributes = `${descriptor}.enumerable, ${descriptor}.configurable`;
    if (method.element === "getter") {
      return (
        `${lookup}console.log("m${index}", instance.m${index}, ` +
        `typeof ${descriptor}.get, ${descriptor}.set, ${attributes}, ` +
        `${descriptor}.get.name);`
      );
    }
    if (method.element === "setter") {
      return (
        `${lookup}instance.m${index} = ${method.value};\n` +
        `console.log("m${index}", instance.s${index}, ${descriptor}.get, ` +
        `typeof ${descriptor}.set, ${attributes}, ${descriptor}.set.name);`
      );
    }
    if (method.element === "pair") {
      return (
        `${lookup}instance.m${index} = ${method.value};\n` +
        `console.log("m${index}", instance.m${index}, instance.s${index}, ` +
        `typeof ${descriptor}.get, typeof ${descriptor}.set, ${attributes}, ` +
        `${descriptor}.get.name, ${descriptor}.set.name);`
      );
    }
    return (
      `${lookup}console.log("m${index}", instance.m${index}(${argument}), ` +
      `${descriptor}.writable, ${attributes}, ` +
      `Shape.prototype.m${index}.name);`
    );
  });
  const fieldReads = testCase.fields
    .map((_, index) => `instance.f${index}`)
    .join(", ");
  return `
let order = "";
function mark(name, index) {
  order = order + index;
  return name;
}
${head}
${body}
${tail}
console.log("definition", order);
const instance = new Shape(${testCase.fields.join(", ")});
let keyList = "";
for (const key of Object.keys(Shape.prototype)) { keyList = keyList + key; }
console.log("keys", keyList);
console.log("name", Shape.name, Shape.length);
console.log("constructor", Shape.prototype.constructor === Shape);
console.log("instance", instance instanceof Shape${
    fieldReads === "" ? "" : `, ${fieldReads}`
  });
${reads.join("\n")}
try {
  Shape();
} catch (error) {
  console.log("no-new", error instanceof TypeError);
}
console.log("order", order);
`;
}

function expected(testCase: ClassCase): string {
  const order = modelOrder(testCase);
  const definition = order.slice(0, -1);
  const lines: string[] = [];
  lines.push(`definition ${definition}`);
  lines.push("keys ");
  // An anonymous class expression takes the storage binding's name, so
  // only the named expression form reports its own inner name.
  const name = testCase.form === "named-expression" ? "Inner" : "Shape";
  lines.push(`name ${name} ${testCase.fields.length}`);
  lines.push("constructor true");
  lines.push(
    `instance true${
      testCase.fields.length === 0 ? "" : ` ${testCase.fields.join(" ")}`
    }`,
  );
  testCase.methods.forEach((method, index) => {
    const result = methodResult(testCase, method);
    if (method.element === "getter") {
      lines.push(
        `m${index} ${result} function undefined false true get m${index}`,
      );
      return;
    }
    if (method.element === "setter") {
      lines.push(
        `m${index} ${method.value} undefined function false true ` +
          `set m${index}`,
      );
      return;
    }
    if (method.element === "pair") {
      lines.push(
        `m${index} ${result} ${method.value} function function false true ` +
          `get m${index} set m${index}`,
      );
      return;
    }
    lines.push(`m${index} ${result} true false true m${index}`);
  });
  lines.push("no-new true");
  lines.push(`order ${order}`);
  return `${lines.join("\n")}\n`;
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
  const directory = await host.makeTemporaryDirectory("oseo-class-property-");
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

test("class model orders computed keys before construction", () => {
  assert.equal(
    expected({
      fields: [4],
      form: "declaration",
      methods: [
        { computed: false, element: "method", kind: "field", value: 0 },
        { computed: true, element: "method", kind: "self", value: 0 },
      ],
    }),
    "definition 1\n" +
      "keys \n" +
      "name Shape 1\n" +
      "constructor true\n" +
      "instance true 4\n" +
      "m0 4 true false true m0\n" +
      "m1 true true false true m1\n" +
      "no-new true\n" +
      "order 1c\n",
  );
});

test("class model reports the inner name of a named expression", () => {
  const testCase: ClassCase = {
    fields: [],
    form: "named-expression",
    methods: [
      { computed: false, element: "method", kind: "constant", value: 9 },
    ],
  };
  assert.equal(
    expected(testCase),
    "definition \n" +
      "keys \n" +
      "name Inner 0\n" +
      "constructor true\n" +
      "instance true\n" +
      "m0 9 true false true m0\n" +
      "no-new true\n" +
      "order c\n",
  );
  assert.match(printCase(testCase), /const Shape = class Inner \{/u);
});

test("class model names accessors and evaluates a pair key twice", () => {
  const testCase: ClassCase = {
    fields: [],
    form: "declaration",
    methods: [
      { computed: false, element: "getter", kind: "constant", value: 1 },
      { computed: false, element: "setter", kind: "constant", value: 2 },
      { computed: true, element: "pair", kind: "constant", value: 3 },
    ],
  };
  assert.equal(
    expected(testCase),
    "definition 22\n" +
      "keys \n" +
      "name Shape 0\n" +
      "constructor true\n" +
      "instance true\n" +
      "m0 1 function undefined false true get m0\n" +
      "m1 2 undefined function false true set m1\n" +
      "m2 3 3 function function false true get m2 set m2\n" +
      "no-new true\n" +
      "order 22c\n",
  );
  const source = printCase(testCase);
  assert.match(source, /get m0\(\) \{/u);
  assert.match(source, /set m1\(value\) \{/u);
  assert.match(source, /get \[mark\("m2", 2\)\]\(\) \{/u);
  assert.match(source, /set \[mark\("m2", 2\)\]\(value\) \{/u);
});

test(
  "generated classes match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "classes preserve generated names, prototype shape, and definition " +
        "order",
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
            { source, sourceId: "generated-m5-class.ts" },
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
          "class declarations, named class expressions, and anonymous class " +
          "expressions with zero to two constructor-assigned fields and zero " +
          "to three prototype elements over static and computed keys, each " +
          "element a method, a getter, a setter, or a getter and setter " +
          "pair whose reading body returns a constant, an instance field, " +
          "or the class-scope name binding, comparing an independent name, " +
          "prototype descriptor, accessor round-trip, and definition-order " +
          "model with Node.js, Deno, and both native specialization " +
          "policies with forced collection on the enabled path",
        numRuns: 15,
        profile: "M5 class declarations, expressions, and accessors",
        seed: 0x5eed_0017,
        sizeLimit:
          "zero to two constructor fields, zero to three prototype " +
          "elements, and bounded integer values",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
