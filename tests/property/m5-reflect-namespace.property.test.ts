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

/**
 * Which own key one generated property carries. The three kinds are the
 * three OrdinaryOwnPropertyKeys groups, so a case that mixes them
 * observes the complete ordering rule.
 */
type KeyKind = "index" | "string" | "symbol";

/**
 * One generated own property. A data property's value and an accessor
 * property's getter result are both derived from the property's index,
 * so the oracle names the observed value without consulting the host.
 */
interface GeneratedProperty {
  readonly accessor: boolean;
  readonly configurable: boolean;
  readonly enumerable: boolean;
  readonly hasSetter: boolean;
  readonly keyKind: KeyKind;
  readonly writable: boolean;
}

interface ReflectCase {
  /** Argument values one generated `apply` and `construct` list carries. */
  readonly argumentValues: readonly number[];
  /** Whether the generated target stays extensible. */
  readonly extensible: boolean;
  /** Whether `setPrototypeOf` writes null instead of a fresh object. */
  readonly nullPrototype: boolean;
  readonly properties: readonly GeneratedProperty[];
  /**
   * The key every single-key operation uses: an index into `properties`,
   * or `properties.length` for a key the target does not own.
   */
  readonly probe: number;
  /** Whether `construct` passes a new target distinct from the target. */
  readonly separateNewTarget: boolean;
}

const propertyArbitrary: fc.Arbitrary<GeneratedProperty> = fc.record({
  accessor: fc.boolean(),
  configurable: fc.boolean(),
  enumerable: fc.boolean(),
  hasSetter: fc.boolean(),
  keyKind: fc.constantFrom<KeyKind>("index", "string", "symbol"),
  writable: fc.boolean(),
});

const caseArbitrary: fc.Arbitrary<ReflectCase> = fc
  .record({
    argumentValues: fc.array(fc.integer({ max: 9, min: 0 }), {
      maxLength: 3,
      minLength: 0,
    }),
    extensible: fc.boolean(),
    nullPrototype: fc.boolean(),
    properties: fc.array(propertyArbitrary, { maxLength: 4, minLength: 1 }),
    probe: fc.integer({ max: 4, min: 0 }),
    separateNewTarget: fc.boolean(),
  })
  .map((generated) =>
    Object.assign({}, generated, {
      probe: Math.min(generated.probe, generated.properties.length),
    }),
  );

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/** The property key expression the generated source uses for one index. */
function keyExpression(property: GeneratedProperty, index: number): string {
  if (property.keyKind === "index") return `"${index}"`;
  if (property.keyKind === "string") return `"k${index}"`;
  return `symbols[${index}]`;
}

/** The key text `String(key)` prints for one generated property. */
function keyText(property: GeneratedProperty, index: number): string {
  if (property.keyKind === "index") return `${index}`;
  if (property.keyKind === "string") return `k${index}`;
  return `Symbol(s${index})`;
}

/** The value a generated data property stores. */
function dataValue(index: number): number {
  return 100 + index;
}

/** The value a generated accessor property's getter reports. */
function accessorValue(index: number): number {
  return 200 + index;
}

/** OrdinaryOwnPropertyKeys over the generated properties. */
function ownKeyOrder(testCase: ReflectCase): readonly string[] {
  const groups: readonly KeyKind[] = ["index", "string", "symbol"];
  return groups.flatMap((kind) =>
    testCase.properties.flatMap((property, index) =>
      property.keyKind === kind ? [keyText(property, index)] : [],
    ),
  );
}

/** The generated property the probe names, or undefined for a missing key. */
function probed(testCase: ReflectCase): GeneratedProperty | undefined {
  return testCase.properties[testCase.probe];
}

function descriptorSource(property: GeneratedProperty, index: number): string {
  if (!property.accessor) {
    return (
      `{ value: ${dataValue(index)}, writable: ${property.writable}, ` +
      `enumerable: ${property.enumerable}, ` +
      `configurable: ${property.configurable} }`
    );
  }
  const setter = property.hasSetter
    ? "set(value) { this.written = value; }, "
    : "";
  return (
    `{ get() { return ${accessorValue(index)}; }, ${setter}` +
    `enumerable: ${property.enumerable}, ` +
    `configurable: ${property.configurable} }`
  );
}

function printCase(testCase: ReflectCase): string {
  const symbols = testCase.properties
    .map((_, index) => `Symbol("s${index}")`)
    .join(", ");
  const definitions = testCase.properties
    .map(
      (property, index) =>
        `  Object.defineProperty(target, ${keyExpression(property, index)}, ` +
        `${descriptorSource(property, index)});`,
    )
    .join("\n");
  const prevent = testCase.extensible
    ? ""
    : "\n  Object.preventExtensions(target);";
  const probeProperty = probed(testCase);
  const probeKey =
    probeProperty == null
      ? '"missing"'
      : keyExpression(probeProperty, testCase.probe);
  const argumentList = testCase.argumentValues.join(", ");
  const prototype = testCase.nullPrototype ? "null" : "{}";
  const constructArgument = testCase.argumentValues[0] ?? 0;
  return `
const reflectGlobalObject = this;
const originalReflect = Reflect;
const symbols = [${symbols}];
function makeTarget() {
  const target = {};
${definitions}${prevent}
  return target;
}
function render(values) {
  let text = "";
  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) text = text + ",";
    text = text + String(values[index]);
  }
  return text;
}
const probeKey = ${probeKey};
console.log("own keys", render(Reflect.ownKeys(makeTarget()).map(String)));
console.log(
  "read",
  Reflect.has(makeTarget(), probeKey),
  String(Reflect.get(makeTarget(), probeKey)),
);
const descriptor = Reflect.getOwnPropertyDescriptor(makeTarget(), probeKey);
console.log(
  "descriptor",
  descriptor === undefined ? "none" : render(Reflect.ownKeys(descriptor)),
  descriptor === undefined ? "none" : String(descriptor.enumerable),
  descriptor === undefined ? "none" : String(descriptor.configurable),
);
const defineTarget = makeTarget();
const defined = Reflect.defineProperty(defineTarget, probeKey, {
  value: 7,
  writable: true,
  enumerable: true,
  configurable: true,
});
let defineThrew = false;
try {
  Object.defineProperty(makeTarget(), probeKey, {
    value: 7,
    writable: true,
    enumerable: true,
    configurable: true,
  });
} catch (error) {
  defineThrew = error instanceof TypeError;
}
console.log("define", defined, defineThrew, String(defineTarget[probeKey]));
const setTarget = makeTarget();
const setResult = Reflect.set(setTarget, probeKey, 8);
let setThrew = false;
try {
  (function () { "use strict"; makeTarget()[probeKey] = 8; })();
} catch (error) {
  setThrew = error instanceof TypeError;
}
console.log("set", setResult, setThrew, String(setTarget[probeKey]));
const receiverTarget = makeTarget();
const receiver = {};
const receiverResult = Reflect.set(receiverTarget, probeKey, 9, receiver);
console.log(
  "receiver",
  receiverResult,
  String(receiver[probeKey]),
  String(receiver.written),
  String(receiverTarget[probeKey]),
);
const deleteTarget = makeTarget();
const deleted = Reflect.deleteProperty(deleteTarget, probeKey);
let deleteThrew = false;
try {
  (function () { "use strict"; delete makeTarget()[probeKey]; })();
} catch (error) {
  deleteThrew = error instanceof TypeError;
}
console.log(
  "delete",
  deleted,
  deleteThrew,
  Reflect.has(deleteTarget, probeKey),
);
const extensibleTarget = makeTarget();
console.log(
  "extensible",
  Reflect.isExtensible(extensibleTarget),
  Reflect.preventExtensions(extensibleTarget),
  Reflect.isExtensible(extensibleTarget),
);
const prototypeTarget = makeTarget();
const prototype = ${prototype};
const prototypeResult = Reflect.setPrototypeOf(prototypeTarget, prototype);
let prototypeThrew = false;
try {
  Object.setPrototypeOf(makeTarget(), prototype);
} catch (error) {
  prototypeThrew = error instanceof TypeError;
}
console.log(
  "prototype",
  prototypeResult,
  prototypeThrew,
  Reflect.getPrototypeOf(prototypeTarget) === prototype,
);
function collect() { return render(Array.prototype.slice.call(arguments)); }
const list = [${argumentList}];
console.log(
  "apply",
  Reflect.apply(collect, null, list),
  Reflect.apply(collect, null, { length: list.length, ...list }),
  Reflect.apply(function () { return this.tag; }, { tag: "receiver" }, list),
);
function Built(value) {
  this.value = value;
  this.tag = new.target === Built ? "base" : "other";
}
class Other extends Built {}
const constructed = Reflect.construct(
  Built,
  [${constructArgument}],
  ${testCase.separateNewTarget ? "Other" : "Built"},
);
console.log(
  "construct",
  String(constructed.value),
  constructed.tag,
  Object.getPrototypeOf(constructed) ===
    ${testCase.separateNewTarget ? "Other" : "Built"}.prototype,
);
try {
  Reflect.get(1, probeKey);
} catch (error) {
  console.log("target", error instanceof TypeError);
}
try {
  new Reflect.get({}, "a");
} catch (error) {
  console.log("not a constructor", error instanceof TypeError);
}
/** @param {number} operand @param {number} addend */
function hinted(operand, addend) { return operand + addend; }
console.log(
  "hint",
  hinted(2, 1),
  hinted(Reflect.ownKeys(makeTarget()).length, 1),
  hinted(String(Reflect.has(makeTarget(), probeKey)), 1),
);
let turn = 0;
while (turn < 2) {
  console.log("guard", Reflect.has(makeTarget(), probeKey));
  if (turn === 0) reflectGlobalObject.marker = 1;
  turn = turn + 1;
}
console.log(
  "marker",
  reflectGlobalObject.marker,
  delete reflectGlobalObject.marker,
);
({ value: Reflect } = { value: 7 });
console.log("object target", Reflect, this.Reflect === Reflect);
[Reflect] = [8];
console.log("array target", Reflect, this.Reflect === Reflect);
for (Reflect of [9]) {}
console.log("for-of target", Reflect, this.Reflect === Reflect);
Reflect = originalReflect;
console.log("target restore", Reflect === originalReflect);
this.Reflect = 10;
console.log("global write", this.Reflect === Reflect, Reflect);
this.Reflect = originalReflect;
console.log("global restore", this.Reflect === Reflect);
console.log("global delete", delete this.Reflect, typeof Reflect);
try { Reflect; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
function strictDeletedSet() { "use strict"; Reflect = 1; }
try { strictDeletedSet(); } catch (error) {
  console.log("global deleted strict set", error instanceof ReferenceError);
}
({ value: Reflect } = { value: originalReflect });
console.log("global deleted pattern restore", this.Reflect === Reflect);
function strictDeleteDuringSet() {
  "use strict";
  Reflect = (delete reflectGlobalObject.Reflect, 11);
}
try { strictDeleteDuringSet(); } catch (error) {
  console.log("global strict set race", error instanceof ReferenceError);
}
Reflect = originalReflect;
console.log("global race restore", this.Reflect === Reflect);
`;
}

function expected(testCase: ReflectCase): string {
  const property = probed(testCase);
  const index = testCase.probe;
  const present = property != null;
  const currentValue = !present
    ? "undefined"
    : property.accessor
      ? `${accessorValue(index)}`
      : `${dataValue(index)}`;
  const defined = present ? property.configurable : testCase.extensible;
  const setApplied = present
    ? property.accessor
      ? property.hasSetter
      : property.writable
    : testCase.extensible;
  const setValue = !setApplied
    ? currentValue
    : present && property.accessor
      ? currentValue
      : "8";
  const receiverApplied = present
    ? property.accessor
      ? property.hasSetter
      : property.writable
    : true;
  const receiverOwn =
    receiverApplied && !(present && property.accessor) ? "9" : "undefined";
  const receiverWritten =
    receiverApplied && present && property.accessor ? "9" : "undefined";
  const deleted = present ? property.configurable : true;
  const descriptorFields = !present
    ? "none"
    : property.accessor
      ? "get,set,enumerable,configurable"
      : "value,writable,enumerable,configurable";
  const applied = testCase.argumentValues.join(",");
  const constructTag = testCase.separateNewTarget ? "other" : "base";
  const constructValue = `${testCase.argumentValues[0] ?? 0}`;
  const keyCount = testCase.properties.length;
  return [
    `own keys ${ownKeyOrder(testCase).join(",")}`,
    `read ${present} ${currentValue}`,
    `descriptor ${descriptorFields} ` +
      (present
        ? `${property.enumerable} ${property.configurable}`
        : "none none"),
    `define ${defined} ${!defined} ${defined ? "7" : currentValue}`,
    `set ${setApplied} ${!setApplied} ${setValue}`,
    `receiver ${receiverApplied} ${receiverOwn} ${receiverWritten} ` +
      currentValue,
    `delete ${deleted} ${!deleted} ${!deleted}`,
    `extensible ${testCase.extensible} true false`,
    `prototype ${testCase.extensible} ${!testCase.extensible} ` +
      `${testCase.extensible}`,
    `apply ${applied} ${applied} receiver`,
    `construct ${constructValue} ${constructTag} true`,
    "target true",
    "not a constructor true",
    `hint 3 ${keyCount + 1} ${present}1`,
    `guard ${present}`,
    `guard ${present}`,
    "marker 1 true",
    "object target 7 true",
    "array target 8 true",
    "for-of target 9 true",
    "target restore true",
    "global write true 10",
    "global restore true",
    "global delete true undefined",
    "global deleted read true",
    "global deleted strict set true",
    "global deleted pattern restore true",
    "global strict set race true",
    "global race restore true",
    "",
  ].join("\n");
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
    "oseo-reflect-namespace-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
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

test(
  "generated Reflect reflection matches the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "every Reflect function reports the internal method's own result",
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
            { source, sourceId: "generated-m5-reflect-namespace.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-smi/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /add-smi-checked/u);
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
                toolchain: zigToolchain,
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
          "one target of one to four own properties drawn from integer " +
          "index, string, and symbol keys and from data and accessor " +
          "descriptors with every writable, enumerable, configurable, and " +
          "setter combination, an extensible or non-extensible target, one " +
          "probe key that is own or missing, an argument list of zero to " +
          "three values, an object or null written prototype, a construct " +
          "new target that is or is not the target, a false number hint, " +
          "one global-object shape guard miss, and one global Reflect " +
          "write, restore, delete, assignment-target, and strict " +
          "missing-property sequence",
        numRuns: 12,
        profile: "M5 Reflect namespace",
        seed: 0x6000_6300,
        sizeLimit:
          "one target of at most four own properties, one probe key, at " +
          "most three argument values, two repeated global property " +
          "observations, and one global assignment-target and deletion " +
          "sequence",
        timeLimitMilliseconds: 360_000,
      },
    );
  },
);
