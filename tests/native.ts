/* eslint-disable no-await-in-loop -- Native fixture builds are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { cBackend } from "../packages/backend-c/src/index.ts";
import { runNativeCli } from "../packages/cli/src/index.ts";
import {
  compileSource,
  describeTarget,
  printMir,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../packages/testkit/src/index.ts";
import { zigToolchain } from "../packages/toolchain-zig/src/index.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
assert(nativeTarget != null, "supported native execution host");
const zigNativeTarget =
  nativeTarget.name === "macos-aarch64"
    ? "aarch64-macos"
    : nativeTarget.name === "linux-x86_64-gnu"
      ? "x86_64-linux-gnu"
      : assert.fail(`unsupported execution target: ${nativeTarget.name}`);

const referencePrelude = `
const oseoReferenceConsole = console;
Object.defineProperty(globalThis, "console", {
  value: {
    log(...values: unknown[]) {
      oseoReferenceConsole.log(values.map(String).join(" "));
    },
  },
});
`;

interface Fixture {
  readonly name: string;
  readonly nonStrictScript?: boolean;
  readonly source: string;
  readonly specialization?: {
    readonly genericCallsDisabled: number;
    readonly genericCallsEnabled: number;
    readonly hits: number;
    readonly misses: number;
    readonly overflowMisses: number;
  };
}

const fixtures: readonly Fixture[] = [
  {
    name: "closures-and-methods",
    source: `
function makeCounter(start) {
  let value = start;
  function increment() { value = value + 1; return value; }
  function read() { return value; }
  return { increment: increment, read: read };
}
const first = makeCounter(1);
const second = makeCounter(10);
console.log(first.read(), first.increment(), first.read());
console.log(second.increment(), second.read(), first.read());
const identity = function (value) { return value; };
console.log(identity("function expression"));
function declaredMetadata(first, second) {}
const namedMetadata = function innerMetadata(value) {};
const inferredMetadata = function (first, second, third) {};
const objectMetadata = { method: function (value) {} };
const computedMetadataName = "computedMetadata";
const computedMetadata = {
  [computedMetadataName]: function (first, second) {},
};
console.log(declaredMetadata.name, declaredMetadata.length);
console.log(namedMetadata.name, namedMetadata.length);
console.log(inferredMetadata.name, inferredMetadata.length);
console.log(objectMetadata.method.name, objectMetadata.method.length);
console.log(computedMetadata.computedMetadata.name);
console.log(computedMetadata.computedMetadata.length);
console.log((function (value) {}).name === "", (function (value) {}).length);
const nameDescriptor = Object.getOwnPropertyDescriptor(
  declaredMetadata,
  "name",
);
const lengthDescriptor = Object.getOwnPropertyDescriptor(
  declaredMetadata,
  "length",
);
console.log(
  nameDescriptor.value,
  nameDescriptor.writable,
  nameDescriptor.enumerable,
  nameDescriptor.configurable,
);
console.log(
  lengthDescriptor.value,
  lengthDescriptor.writable,
  lengthDescriptor.enumerable,
  lengthDescriptor.configurable,
);
console.log((function () { return 42; })());
function makeFunction() {
  return function () { return "nested call"; };
}
console.log(makeFunction()());
const factorial = function recur(value) {
  if (value === 0) return 1;
  return value * recur(value - 1);
};
console.log(factorial(5));
const receiver = {
  value: 42,
  read: function () { return this.value; },
};
console.log(receiver.read());
const localObject = {
  marker: "shadowed Object",
  keys: function () { return [this.marker]; },
  create: function (left, right) { return left + right; },
};
function callObject(Object) {
  console.log(Object.keys({})[0], Object.create(1, 2));
}
callObject(localObject);
const localConsole = {
  prefix: "shadowed console",
  log: function (value) { console.log(this.prefix, value); },
};
function callConsole(console) { console.log("message"); }
callConsole(localConsole);
`,
  },
  {
    name: "function-name-assignment",
    nonStrictScript: true,
    source: `
const sloppyNamed = function self() {
  self = 1;
  return self === sloppyNamed;
};
console.log(sloppyNamed());
const strictNamed = function self() {
  "use strict";
  try { self = 1; }
  catch (error) { return "strict function name"; }
  return "missed strict function name";
};
console.log(strictNamed());
`,
  },
  {
    name: "constructors",
    source: `
function Box(value) { this.value = value; }
Box.prototype.read = function () { return this.value; };
console.log(Box.prototype.constructor === Box);
const constructorDescriptor = Object.getOwnPropertyDescriptor(
  Box.prototype,
  "constructor",
);
console.log(
  constructorDescriptor.value === Box,
  constructorDescriptor.writable,
  constructorDescriptor.enumerable,
  constructorDescriptor.configurable,
);
const box = new Box(7);
console.log(box.value, box.read());
function Replace() { return { value: 9 }; }
console.log(new Replace().value);
function KeepReceiver() { this.value = 3; return 1; }
console.log(new KeepReceiver().value);
function ChangedPrototype() {}
function changePrototype() {
  ChangedPrototype.prototype = { changed: true };
  return 0;
}
console.log(new ChangedPrototype(changePrototype()).changed);
function PrimitivePrototype(value) { this.value = value; }
PrimitivePrototype.prototype = 1;
console.log(new PrimitivePrototype(12).value);
`,
  },
  {
    name: "abrupt-completion",
    source: `
function complete(kind) {
  try {
    if (kind === 0) return "try return";
    if (kind === 1) throw "first";
    return "ordinary";
  } catch (error) {
    if (kind === 1) return "caught " + error;
    throw error;
  } finally {
    console.log("finally", kind);
    if (kind === 2) return "finally return";
  }
}
console.log(complete(0));
console.log(complete(1));
console.log(complete(2));
function replaceThrow() {
  try { throw "old"; } finally { throw "new"; }
}
try { replaceThrow(); } catch (error) { console.log(error); }
let index = 0;
while (index < 3) {
  index = index + 1;
  try {
    if (index === 1) continue;
    if (index === 2) break;
  } finally {
    console.log("loop finally", index);
  }
}
console.log(index);
function nestedReturn() {
  try {
    try { return "nested return"; }
    finally { console.log("inner return finally"); }
  } finally {
    console.log("outer return finally");
  }
}
console.log(nestedReturn());
function nestedFinallyDuringReturn() {
  try {
    return "preserved return";
  } finally {
    try {} finally {}
  }
}
console.log(nestedFinallyDuringReturn());
function terminatingReturnFinally() {
  try {} finally { return "return finally"; }
}
console.log(terminatingReturnFinally());
function terminatingThrowFinally() {
  try {} finally { throw "throw finally"; }
}
try { terminatingThrowFinally(); } catch (error) { console.log(error); }
function terminatingBreakFinally() {
  while (true) { try {} finally { break; } }
  return "break finally";
}
console.log(terminatingBreakFinally());
function terminatingContinueFinally() {
  let count = 0;
  while (count < 1) {
    count = count + 1;
    try {} finally { continue; }
  }
  return "continue finally";
}
console.log(terminatingContinueFinally());
function nestedThrow() {
  try {
    try { throw "nested throw"; }
    finally { console.log("inner throw finally"); }
  } finally {
    console.log("outer throw finally");
  }
}
try { nestedThrow(); } catch (error) { console.log(error); }
try {
  try { throw "caught after finally"; } finally {}
} catch (error) {
  console.log(error);
}
try {
  try { throw "caught before outer finally"; } finally {}
} catch (error) {
  console.log(error);
} finally {
  console.log("outer finally after catch");
}
let nestedIndex = 0;
while (nestedIndex < 2) {
  nestedIndex = nestedIndex + 1;
  try {
    try {
      if (nestedIndex === 1) continue;
      break;
    } finally {
      console.log("inner loop finally", nestedIndex);
    }
  } finally {
    console.log("outer loop finally", nestedIndex);
  }
}
console.log(nestedIndex);
`,
  },
  {
    name: "property-specialization",
    source: `
const value = { item: 1 };
let reads = 0;
while (reads < 3) {
  console.log(value.item);
  reads = reads + 1;
}
console.log(delete value.item, value.item);
`,
    specialization: {
      genericCallsDisabled: 3,
      genericCallsEnabled: 3,
      hits: 2,
      misses: 2,
      overflowMisses: 0,
    },
  },
  {
    name: "loops",
    source: `
let value = 0;
let total = 0;
while (value < 6) {
  value = value + 1;
  if (value === 2) continue;
  if (value === 5) break;
  total = total + value;
}
console.log(value, total);
`,
  },
  {
    name: "mutable-bindings",
    source: `
let value = 1;
console.log(value);
value = value + 2;
console.log(value, value = 4, value);
`,
  },
  {
    name: "fresh-block-bindings",
    source: `
let first;
let second;
let index = 0;
while (index < 2) {
  const captured = index;
  const read = function () { return captured; };
  if (index === 0) first = read;
  else second = read;
  index = index + 1;
}
console.log(first(), second());
let firstError;
let secondError;
index = 0;
while (index < 2) {
  try {
    throw index;
  } catch (error) {
    const readError = function () { return error; };
    if (index === 0) firstError = readError;
    else secondError = readError;
  }
  index = index + 1;
}
console.log(firstError(), secondError());
`,
  },
  {
    name: "arrays",
    source: `
const values = [1, , 3];
console.log(values.length, values[0], values[1], values[2]);
values[5] = 6;
console.log(values.length, values[4], values[5]);
console.log(delete values[5], values.length, values[5]);
values.length = 1;
console.log(values.length, values[0], values[2]);
`,
  },
  {
    name: "object-reflection",
    source: `
const firstPrototype = { inherited: 9 };
const value = Object.create(firstPrototype);
console.log(Object.defineProperty(value, "fixed", {
  value: 1,
  writable: false,
  enumerable: true,
  configurable: false,
}) === value);
Object.defineProperty(value, "hidden", { value: 2 });
value.extra = 3;
value["10"] = "ten";
value["2"] = "two";
console.log(value.fixed, value.inherited);
const descriptor = Object.getOwnPropertyDescriptor(value, "fixed");
console.log(
  descriptor.value,
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
);
const inheritedValue = { item: 8 };
const inheritedDescriptor = Object.create({ writable: false });
Object.defineProperty(inheritedValue, "item", inheritedDescriptor);
const inheritedResult = Object.getOwnPropertyDescriptor(
  inheritedValue,
  "item",
);
console.log(
  inheritedResult.value,
  inheritedResult.writable,
  inheritedResult.enumerable,
  inheritedResult.configurable,
);
console.log(Object.getOwnPropertyDescriptor(value, "missing"));
const keys = Object.keys(value);
console.log(keys[0], keys[1], keys[2], keys[3], keys.length);
const secondPrototype = { inherited: 11 };
console.log(Object.setPrototypeOf(value, secondPrototype) === value);
console.log(value.inherited);
try {
  Object.defineProperty(value, "fixed", { value: 4 });
} catch (error) {
  console.log("redefinition rejected");
}
const detached = Object.create(null);
console.log(detached.missing);
function FunctionPrototypeOwner() {}
const functionPrototypeChild = Object.create(FunctionPrototypeOwner);
console.log(
  functionPrototypeChild.prototype === FunctionPrototypeOwner.prototype,
);
Object.defineProperty(FunctionPrototypeOwner, "prototype", {
  writable: false,
});
function strictSyntheticSet() {
  "use strict";
  try { functionPrototypeChild.prototype = {}; } catch (error) {
    console.log("inherited function prototype rejected");
  }
}
strictSyntheticSet();
const arrayPrototype = [];
const arrayPrototypeChild = Object.create(arrayPrototype);
console.log(arrayPrototypeChild.length);
Object.defineProperty(arrayPrototype, "length", { writable: false });
function strictInheritedLengthSet() {
  "use strict";
  try { arrayPrototypeChild.length = 0; } catch (error) {
    console.log("inherited array length rejected");
  }
}
strictInheritedLengthSet();
const stringKeys = Object.keys("ab");
console.log(stringKeys[0], stringKeys[1], stringKeys.length);
console.log(Object.keys(1).length, Object.keys(true).length);
const stringIndexDescriptor = Object.getOwnPropertyDescriptor("ab", "0");
console.log(
  stringIndexDescriptor.value,
  stringIndexDescriptor.writable,
  stringIndexDescriptor.enumerable,
  stringIndexDescriptor.configurable,
);
const stringLengthDescriptor = Object.getOwnPropertyDescriptor(
  "ab",
  "length",
);
console.log(
  stringLengthDescriptor.value,
  stringLengthDescriptor.writable,
  stringLengthDescriptor.enumerable,
  stringLengthDescriptor.configurable,
);
console.log(Object.getOwnPropertyDescriptor(1, "missing"));
console.log(Object.setPrototypeOf(1, null));
try { Object.keys(null); } catch (error) { console.log("null keys"); }
try { Object.getOwnPropertyDescriptor(null, "item"); } catch (error) {
  console.log("null descriptor");
}
try { Object.setPrototypeOf(null, null); } catch (error) {
  console.log("null set prototype");
}
try { Object.setPrototypeOf(1, 1); } catch (error) {
  console.log("invalid primitive prototype");
}
`,
  },
  {
    name: "descriptor-redefinition",
    nonStrictScript: true,
    source: `
const value = { item: 7 };
Object.defineProperty(value, "item", { writable: false });
const descriptor = Object.getOwnPropertyDescriptor(value, "item");
console.log(
  descriptor.value,
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
);
const values = [];
Object.defineProperty(values, "4", {
  value: 4,
  configurable: false,
});
Object.defineProperty(values, "2", {
  value: 2,
  configurable: true,
});
try {
  Object.defineProperty(values, "length", { value: 1, writable: false });
} catch (error) {
  console.log("length rejected");
}
console.log(values.length, values[2], values[4]);
values[5] = 5;
const lengthDescriptor = Object.getOwnPropertyDescriptor(values, "length");
console.log(values.length, values[5], lengthDescriptor.writable);
let coerced = [1, 2, 3];
coerced.length = "1";
console.log(coerced.length, coerced[1]);
coerced = [1, 2];
coerced.length = false;
console.log(coerced.length, coerced[0]);
coerced = [1, 2];
coerced.length = null;
console.log(coerced.length, coerced[0]);
function DescriptorFunction() {}
const originalPrototype = DescriptorFunction.prototype;
Object.defineProperty(DescriptorFunction, "prototype", { writable: false });
const functionDescriptor = Object.getOwnPropertyDescriptor(
  DescriptorFunction,
  "prototype",
);
DescriptorFunction.prototype = { replaced: true };
console.log(
  functionDescriptor.writable,
  DescriptorFunction.prototype === originalPrototype,
);
try {
  Object.defineProperty(DescriptorFunction, "prototype", { value: {} });
} catch (error) {
  console.log("function prototype rejected");
}
const frozenLength = [1];
Object.defineProperty(frozenLength, "length", { writable: false });
function strictSameLengthSet() {
  "use strict";
  try { frozenLength.length = frozenLength.length; } catch (error) {
    console.log("same frozen length rejected");
  }
}
strictSameLengthSet();
const assignedLength = [];
Object.defineProperty(assignedLength, "4", {
  value: 4,
  configurable: false,
});
try {
  assignedLength.length = 1;
  console.log("non-strict length assignment completed");
} catch (error) {
  console.log("non-strict length assignment threw");
}
console.log(assignedLength.length, assignedLength[4]);
`,
  },
  {
    name: "catchable-type-errors",
    source: `
const fixed = {};
Object.defineProperty(fixed, "item", {
  value: 1,
  writable: false,
});
function strictErrors() {
  "use strict";
  try { fixed.item = 2; } catch (error) { console.log("strict set"); }
  try { delete fixed.item; } catch (error) { console.log("strict delete"); }
}
strictErrors();
let firstError;
try { const value = 1; value(); } catch (error) {
  firstError = error;
  console.log("not callable", error === undefined, error === null);
}
try { null.item; } catch (error) {
  console.log("null receiver", error === undefined, error === firstError);
}
try { Object.create(1); } catch (error) { console.log("invalid prototype"); }
console.log((1).missing, true.missing, "abc".length, "abc"[1]);
try { tdzRead; } catch (error) { console.log("tdz read"); }
let tdzRead;
try { tdzWrite = 1; } catch (error) { console.log("tdz write"); }
let tdzWrite;
const immutable = 1;
try { immutable = 2; } catch (error) { console.log("const write"); }
if (false) immutable = 3;
console.log(immutable);
`,
  },
  {
    name: "error-intrinsics",
    source: `
try { const callee = 1; callee(); } catch (error) {
  console.log("call", error instanceof TypeError, error.name);
}
try { null.item; } catch (error) {
  console.log("nullish", error instanceof TypeError,
    error.constructor === TypeError);
}
try { tdz; } catch (error) {
  console.log("tdz", error instanceof ReferenceError, error.name);
}
let tdz;
const frozen = 1;
try { frozen = 2; } catch (error) { console.log("const", error.name); }
const numbers = [1];
try { numbers.length = -1; } catch (error) {
  console.log("length", error instanceof RangeError, error.name);
}
console.log(numbers.length);
try { 1 instanceof 2; } catch (error) { console.log("io", error.name); }
try { "x" in 5; } catch (error) { console.log("in", error.name); }
const plain = new Error("plain message");
console.log(plain.message, plain.name, plain.toString());
console.log(plain instanceof Error, plain instanceof TypeError);
const typed = TypeError("typed message");
console.log(typed instanceof TypeError, typed instanceof Error);
console.log(typed.toString(), typeof typed);
const withCause = new RangeError("ranged", { cause: "why" });
console.log(withCause.cause, withCause.message, withCause.toString());
const causeless = new Error("bare options", {});
console.log(causeless.cause, "cause" in causeless);
const bare = new ReferenceError();
console.log(bare.message === "", bare.name, bare.toString());
const numbered = new SyntaxError(123);
console.log(numbered.message, numbered.toString());
const evalish = new EvalError("e");
const uriish = new URIError("u");
console.log(evalish.name, uriish.name);
console.log(evalish instanceof Error, uriish instanceof Error);
console.log(typeof Error, typeof TypeError, Error.name, TypeError.name);
console.log(Error.length, TypeError.length);
console.log(Error.prototype.name, Error.prototype.message);
console.log(TypeError.prototype.name, TypeError.prototype.message);
console.log(TypeError.prototype instanceof Error);
console.log(Error.prototype.constructor === Error);
console.log(TypeError.prototype.constructor === TypeError);
console.log(new TypeError("t") instanceof RangeError);
function shadowed() { const TypeError = "local"; return typeof TypeError; }
console.log(shadowed());
try { throw new TypeError("rethrown"); } catch (error) {
  console.log(error.message, error.name);
}
const renamed = new Error("custom");
renamed.name = "Custom";
console.log(renamed.toString(), renamed.name, renamed instanceof Error);
`,
  },
  {
    name: "iterators",
    source: `
const nums = [11, 22, 33];
const iter = nums[Symbol.iterator]();
console.log(typeof iter, typeof iter.next);
console.log(iter.next().value, iter.next().value);
console.log(iter.next().value, iter.next().done, iter.next().value);
console.log(nums[Symbol.iterator]() === nums[Symbol.iterator]());
const selfIter = nums[Symbol.iterator]();
console.log(selfIter[Symbol.iterator]() === selfIter);
iter.extra = 5;
console.log(iter.extra, typeof iter);
const overridden = [1, 2];
overridden[Symbol.iterator] = function () {
  return { next: function () { return { value: 9, done: true }; } };
};
const oi = overridden[Symbol.iterator]();
console.log(oi.next().done, oi.next().value);
const ownNext = nums[Symbol.iterator]();
ownNext.next = function () { return { value: 99, done: true }; };
console.log(ownNext.next().value, ownNext.next().done);
const ownIterable = {
  [Symbol.iterator]: function () {
    let calls = 0;
    return {
      next: function () {
        calls = calls + 1;
        this.next = function () { return { value: -1, done: false }; };
        return { value: calls, done: calls > 2 };
      },
    };
  },
};
Promise.all(ownIterable).then(function (values) {
  console.log("captured", values, values.length);
});
console.log("next" in iter, Symbol.iterator in iter, "value" in iter);
console.log(Symbol.iterator in nums, "length" in nums);
console.log("next" in ({}), Symbol.iterator in ({}));
function report(label) {
  return function (value) { console.log(label, value, value.length); };
}
Promise.all([1, 2, 3]).then(report("all"));
Promise.all([]).then(report("empty"));
Promise.race([Promise.resolve("fast"), 2]).then(function (v) {
  console.log("race", v);
});
let step = 0;
const iterable = {
  [Symbol.iterator]: function () {
    return {
      next: function () {
        step = step + 1;
        return { value: step * 10, done: step > 2 };
      },
    };
  },
};
Promise.all(iterable).then(report("iterable"));
Promise.all(5).then(null, function (error) {
  console.log("bad", error instanceof TypeError);
});
const throwingNext = {
  [Symbol.iterator]: function () {
    return { next: function () { throw new RangeError("boom"); } };
  },
};
Promise.all(throwingNext).then(null, function (error) {
  console.log("throw", error instanceof RangeError);
});
let releaseCount = 0;
const badThen = Promise.resolve(1);
badThen.then = function () { throw new RangeError("bad then"); };
const closeIterable = {
  [Symbol.iterator]: function () {
    let step = 0;
    return {
      next: function () {
        step = step + 1;
        return { value: step === 1 ? badThen : step, done: step > 2 };
      },
      return: function () { releaseCount = releaseCount + 1; return {}; },
    };
  },
};
Promise.all(closeIterable).then(null, function (error) {
  console.log("close", error instanceof RangeError, releaseCount);
});
function abruptCloseIterable(makeReturn) {
  return {
    [Symbol.iterator]: function () {
      let step = 0;
      return {
        next: function () {
          step = step + 1;
          return { value: step === 1 ? badThen : step, done: step > 2 };
        },
        return: makeReturn,
      };
    },
  };
}
const throwingReturn = abruptCloseIterable(function () {
  throw new TypeError("return threw");
});
Promise.all(throwingReturn).then(null, function (error) {
  console.log("throw-return", error instanceof RangeError, error.message);
});
const primitiveReturn = abruptCloseIterable(function () { return 5; });
Promise.all(primitiveReturn).then(null, function (error) {
  console.log("primitive-return", error instanceof RangeError, error.message);
});
`,
  },
  {
    name: "symbols",
    source: `
const first = Symbol("mark");
const second = Symbol("mark");
console.log(typeof first, first === second, first === first);
console.log(first, Symbol(), Symbol(42));
console.log(typeof Symbol, typeof Symbol.iterator, typeof Symbol.toPrimitive);
console.log(typeof Symbol.toStringTag, Symbol.iterator === Symbol.iterator);
console.log(typeof Symbol.prototype, Symbol.prototype === Symbol.prototype);
const protoDesc = Object.getOwnPropertyDescriptor(Symbol, "prototype");
console.log(protoDesc.writable, protoDesc.enumerable, protoDesc.configurable);
try {
  new Symbol();
} catch (error) {
  console.log("construct", error instanceof TypeError);
}
try {
  \`\${first}\`;
} catch (error) {
  console.log("template", error instanceof TypeError);
}
try {
  first + 1;
} catch (error) {
  console.log("add", error instanceof TypeError);
}
try {
  first * 2;
} catch (error) {
  console.log("multiply", error instanceof TypeError);
}
const store = {};
store[first] = "symbol keyed";
console.log(store[first], store[second], first in store);
console.log(Object.keys(store).length);
store.visible = 1;
console.log(Object.keys(store).length, Object.keys(store)[0]);
const reported = Object.getOwnPropertyDescriptor(store, first);
console.log(reported.value, reported.enumerable);
console.log(delete store[first], store[first], first in store);
const custom = {};
custom[Symbol.toPrimitive] = function (hint) { return hint; };
console.log(custom + "", \`\${custom}\`, custom * 1, custom == "default");
const poisonedHint = {};
poisonedHint[Symbol.toPrimitive] = 5;
try {
  poisonedHint + 1;
} catch (error) {
  console.log("uncallable", error instanceof TypeError);
}
const objectHint = {};
objectHint[Symbol.toPrimitive] = function () { return {}; };
try {
  objectHint + 1;
} catch (error) {
  console.log("object result", error instanceof TypeError);
}
console.log(first == second, first == first, first == "Symbol(mark)");
console.log(!first, first ? "truthy" : "falsy");
const boxed = { inner: Symbol("inner") };
console.log(boxed.inner === boxed.inner, typeof boxed.inner);
const namedKey = Symbol("named");
const named = { [namedKey]: function () {} };
console.log(named[namedKey].name);
const bareKey = Symbol();
const bare = { [bareKey]: function () {} };
console.log(named[namedKey].name.length, bare[bareKey].name.length);
`,
  },
  {
    name: "to-primitive",
    source: `
const box = { valueOf: function () { return 7; } };
console.log(box * 3, box + 1, box + "", box < 10, box == 7);
const speaker = { toString: function () { return "spoken"; } };
console.log(speaker + "!", speaker == "spoken");
console.log(\`template \${speaker}\`);
const both = {
  toString: function () { return "text"; },
  valueOf: function () { return 5; },
};
console.log(both + 1, both * 2, \`\${both}\`, both < 6, both == 5);
const ordered = [];
const noisy = {
  toString: function () {
    ordered[ordered.length] = "toString";
    return {};
  },
  valueOf: function () {
    ordered[ordered.length] = "valueOf";
    return 2;
  },
};
console.log(noisy + 0);
console.log(\`\${noisy}\`);
console.log(ordered + "");
console.log({} + 1, {} * 1, "" + {});
console.log([1, 2] + "", [] + 1, [[1, [2, 3]], 4] + "");
console.log([null, undefined, 1] + "");
const cycle = [1];
cycle[1] = cycle;
console.log(cycle + "");
console.log(\`\${new TypeError("boom")}\`);
const fallback = {
  toString: function () { return "fb"; },
  valueOf: function () { return {}; },
};
console.log(fallback + 1);
const opaque = {
  toString: function () { return {}; },
  valueOf: function () { return {}; },
};
try {
  opaque + 1;
} catch (error) {
  console.log("opaque", error instanceof TypeError);
}
const bare = Object.create(null);
try {
  bare + 1;
} catch (error) {
  console.log("bare", error instanceof TypeError);
}
const thrower = {
  valueOf: function () { throw new RangeError("inside valueOf"); },
};
try {
  thrower * 2;
} catch (error) {
  console.log(error.name, error.message);
}
console.log([2] == 2, {} == "[object Object]", 2 < [3], [10] >= 9);
const store = {};
store[[1, 2]] = "keyed";
console.log(store["1,2"]);
console.log(-{}, +[], ~[], [2] ** 2, [8] >> [1], [6] % [4]);
const joiner = [1, 2];
joiner.join = function () { return "custom-join"; };
console.log(joiner + "");
function probe() {}
console.log(probe * 2);
const described = function () {};
described.toString = function () { return "described"; };
console.log(described + "!", described * 1);
function poisoned() {}
poisoned.valueOf = function () { return {}; };
console.log(+poisoned, poisoned * 3);
const arrayHeir = Object.create([1, 2]);
arrayHeir.join = 5;
console.log(arrayHeir + "");
const numberJoin = [1, 2];
numberJoin.join = 5;
console.log(numberJoin + "");
const functionHeir = Object.create(probe);
try {
  functionHeir + "";
} catch (error) {
  console.log("function heir", error instanceof TypeError);
}
try {
  +functionHeir;
} catch (error) {
  console.log("numeric function heir", error instanceof TypeError);
}
const plainHeir = Object.create({ answer: 42 });
console.log(plainHeir + "", +plainHeir);
const retagged = [1, 2];
Object.setPrototypeOf(retagged, {});
console.log(retagged + "", +retagged);
const shifted = function () {};
Object.setPrototypeOf(shifted, {});
console.log(shifted + "", +shifted);
const rebased = new Error("x");
Object.setPrototypeOf(rebased, {});
console.log(rebased + "", +rebased);
console.log(Error.prototype + "");
const arrayedFunction = function () {};
Object.setPrototypeOf(arrayedFunction, [1, 2]);
arrayedFunction.join = 5;
console.log(arrayedFunction + "");
const arrayedError = new Error("x");
Object.setPrototypeOf(arrayedError, [7, 8]);
console.log(arrayedError + "");
`,
  },
  {
    name: "ordinary-objects",
    source: `
const value = { first: 1, ["missing"]: undefined };
console.log(value.first);
value.first = 2;
console.log(value.first);
value.self = value;
console.log(value.self === value);
console.log(value.missing);
console.log(delete value.first);
console.log(value.first);
value[1] = "number";
value[true] = "boolean";
value[null] = "null";
value[undefined] = "undefined";
console.log(value["1"], value.true, value.null, value.undefined);
`,
  },
  {
    name: "values",
    source: `
console.log(undefined, null, true, false);
console.log(-0);
console.log("" + -0, "" + NaN, "" + Infinity, "" + -Infinity);
console.log(0.000001, 0.0000123, 1e-7, 1.23e20);
console.log("" + "");
console.log("escaped\\ntext", "한글", "😀");
`,
  },
  {
    name: "truthiness-and-numeric-conversion",
    source: `
console.log(!undefined, !null, !false, !0, !NaN, !"", !"value");
console.log(-true, "" + -null, -"2", -undefined);
console.log("5" * 2, "9" / 3, false - true);
console.log("0b10" * 1, "0o10" * 1, "0x10" * 1, "　2　" * 1);
console.log("nan" * 1, "0x1p2" * 1, "1junk" * 1);
console.log("Infinity" * 1, "+Infinity" * 1, "-Infinity" * 1);
console.log("+inf" * 1, "-infinity" - 0, "+nan" * 1);
console.log("1\\0junk" * 1);
console.log("0x34964e021e30cde" * 1);
console.log("0o15113116004170606336" * 1);
console.log(
  "0b1101001001011001001110000000100001111000110000110011011110" * 1,
);
`,
  },
  {
    name: "labeled-statements",
    source: `
outer: for (let i = 0; i < 3; i = i + 1) {
  for (let j = 0; j < 3; j = j + 1) {
    if (j === 2) continue outer;
    if (i === 2) break outer;
    console.log(i, j);
  }
}
console.log("after nested");
block: {
  console.log("in block");
  if (true) break block;
  console.log("skipped");
}
console.log("after block");
let path = "";
walk: while (true) {
  path = path + "a";
  inner: do {
    path = path + "b";
    if (path.length > 4) break walk;
    continue inner;
  } while (false);
  path = path + "c";
}
console.log(path);
labeledSwitch: switch (1) {
  case 1: break labeledSwitch;
}
console.log("switch label ok");
chain: chained: while (true) { break chain; }
console.log("chained labels");
finallyOrder: for (let i = 0; i < 2; i = i + 1) {
  try {
    if (i === 0) continue finallyOrder;
    break finallyOrder;
  } finally {
    console.log("finally", i);
  }
}
console.log("after finally");
`,
  },
  {
    name: "switch-statements",
    source: `
function pick(value) {
  switch (value) {
    case 1: return "one";
    case 1 + 1: return "two";
    default: return "other";
  }
}
console.log(pick(1), pick(2), pick(3));
function fall(value) {
  let out = "";
  switch (value) {
    case "a": out = out + "a";
    case "b": out = out + "b"; break;
    case "c": out = out + "c";
    default: out = out + "d";
    case "e": out = out + "e";
  }
  return out;
}
console.log(fall("a"), fall("b"), fall("c"), fall("x"), fall("e"));
const logging = (label, value) => { console.log("test", label); return value; };
switch (2) {
  case logging("first", 1): console.log("body1"); break;
  case logging("second", 2): console.log("body2"); break;
  case logging("third", 3): console.log("body3"); break;
}
switch (0) { }
console.log("empty ok");
let shared;
switch (1) {
  case 1: { let scoped = "case1"; shared = scoped; break; }
  case 2: { let scoped = "case2"; shared = scoped; }
}
console.log(shared);
function readClause(value) {
  switch (value) {
    case 2: let later = "set"; return later;
  }
  return "none";
}
console.log(readClause(2), readClause(3));
let collected = "";
for (let i = 0; i < 4; i = i + 1) {
  switch (i) {
    case 1: continue;
    case 3: break;
    default: collected = collected + i;
  }
  collected = collected + "-";
}
console.log(collected);
const nanCase = () => {
  switch (NaN) { case NaN: return "hit"; }
  return "miss";
};
console.log(NaN === NaN, nanCase());
`,
  },
  {
    name: "for-loops",
    source: `
for (let i = 0; i < 3; i = i + 1) console.log("let", i);
const captures = [];
for (let i = 0; i < 3; i = i + 1) { captures[i] = () => i; }
console.log(captures[0](), captures[1](), captures[2]());
for (var counted = 0; counted < 2; counted = counted + 1) {
  console.log("var", counted);
}
console.log("after", counted);
let total = 0;
for (;;) { total = total + 1; if (total >= 4) break; }
console.log(total);
for (let i = 0, j = 10; i < j; i = i + 1, j = j - 1) {
  if (i === 2) continue;
  console.log(i, j);
}
let text = "";
for (let i = 0; i < 3; i = i + 1) {
  if (i === 1) continue;
  text = text + i;
}
console.log(text);
for (total = 0; total < 2; total = total + 1) console.log("expr", total);
for (const fixed = 5; false;) console.log("never");
let shadow = "outer";
for (let shadow = 0; shadow < 1; shadow = shadow + 1) {
  console.log("inner", shadow);
}
console.log(shadow);
function sumTo(limit) {
  let sum = 0;
  for (let i = 1; i <= limit; i = i + 1) sum = sum + i;
  return sum;
}
console.log(sumTo(10));
console.log("done");
`,
  },
  {
    name: "in-and-instanceof",
    source: `
const box = { present: undefined, value: 1 };
console.log("present" in box, "value" in box, "missing" in box);
const parent = { inherited: 1 };
const child = Object.create(parent);
console.log("inherited" in child, "own" in child);
child.own = 2;
console.log("own" in child);
console.log(0 in [10, 20], 1 in [10, 20], 2 in [10, 20]);
console.log("length" in [1], 1 in [1, , 3], 1 in { "1": true });
console.log("prototype" in function named() {});
try {
  console.log("x" in "text");
} catch (caught) {
  console.log("in-requires-object");
}
function Base(value) { this.value = value; }
const base = new Base(1);
console.log(base instanceof Base, ({}) instanceof Base);
function Derived() {}
Derived.prototype = Object.create(Base.prototype);
const derived = new Derived();
console.log(derived instanceof Derived, derived instanceof Base);
console.log(1 instanceof Base, "s" instanceof Base, null instanceof Base);
try {
  console.log(base instanceof 1);
} catch (caught) {
  console.log("callable-required");
}
const arrow = () => 1;
try {
  console.log(base instanceof arrow);
} catch (caught) {
  console.log("prototype-required");
}
`,
  },
  {
    name: "template-literals",
    source: `
const name = "world";
console.log(\`hello \${name}!\`);
console.log(\`\${1}\${2}\`, \`a\${null}b\${undefined}\`);
console.log(\`\${NaN} \${-0} \${1e21} \${0.1 + 0.2}\`);
console.log(\`multi
line\`, \`escaped\\n\\t\${"x"}\`, \`\\u{1F600}\`);
console.log(\`\${1 + 2} and \${\`nested \${name}\`}\`);
const empty = \`\`;
console.log(empty === "", \`\${true}\${false}\`, typeof \`\${1}\`);
const logging = (value) => { console.log("evaluated", value); return value; };
console.log(\`\${logging("first")}-\${logging("second")}\`);
`,
  },
  {
    name: "sync-arrows",
    source: `
const double = (value) => value * 2;
const add = (left, right) => { return left + right; };
console.log(double(21), add(1, 2));
console.log(double.name, double.length, add.length);
const outer = {
  value: "captured",
  read: function () { return (() => this.value)(); },
};
console.log(outer.read());
const chain = (a) => (b) => a + b;
console.log(chain("first-")("second"));
try {
  new double(1);
} catch (caught) {
  console.log("not constructible");
}
const noParen = value => value + "!";
console.log(noParen("bang"));
console.log(typeof double, (() => 7)());
let counter = 0;
const touch = () => { counter = counter + 1; return counter; };
touch();
touch();
console.log(counter);
const picky = (first) => typeof first;
console.log(picky(double), picky(undefined));
`,
  },
  {
    name: "var-declarations",
    source: `
console.log(typeof hoisted, hoisted);
var hoisted = 1;
console.log(hoisted);
var hoisted = 2;
console.log(hoisted);
function scoped() {
  var value = "function";
  if (true) { var value = "block"; }
  while (false) { var loop = 1; }
  console.log(value, typeof loop, loop);
  return value;
}
console.log(scoped());
function paramShadow(a) { var a; console.log(a); var a = 2; return a; }
console.log(paramShadow(1), paramShadow(undefined));
function fnVar() { var g; function g() {} return typeof g; }
console.log(fnVar());
function fnVarAssigned() { var g = 1; function g() {} return typeof g; }
console.log(fnVarAssigned());
function bare() { var missing; return missing; }
console.log(bare());
let outer = "let-outer";
{ var shadowless = outer; }
console.log(shadowless);
var chain = 1, second = chain + 1, third;
console.log(chain, second, third);
console.log(before());
function before() { return "function hoisted"; }
do { var doVar = "do"; } while (false);
console.log(doVar);
function readsLate() { return late; var late; }
console.log(readsLate());
try { console.log("try"); } catch (caught) { var inCatch = 1; }
console.log(typeof inCatch);
`,
  },
  {
    name: "var-async",
    source: `
async function accumulate(start) {
  var total = start;
  var next = await Promise.resolve(total + 1);
  if (next > 0) { var flag = "set"; }
  var reused = await Promise.resolve(next + 1);
  return reused + " " + flag + " " + typeof trailing;
  var trailing;
}
accumulate(1).then(function (result) { console.log(result); });
`,
  },
  {
    name: "loose-equality",
    source: `
console.log(1 == "1", "" == 0, "0" == false, true == 1, false == "");
console.log(null == undefined, undefined == null, null == null);
console.log(null == 0, undefined == 0, null == false, undefined == "");
console.log(NaN == NaN, NaN == "NaN", -0 == 0, -0 == "0");
console.log("1e2" == 100, "0x10" == 16, "  2  " == 2, "2a" == 2);
console.log(1 != "1", null != undefined, NaN != NaN, "a" != "b");
const box = { value: 1 };
const same = box;
const other = { value: 1 };
console.log(box == same, box == other, box != other);
console.log(box == null, null == box, box == undefined, undefined != box);
console.log(true == "1", false == "0", true == "true", false == "1");
console.log(Infinity == "Infinity", -Infinity == "-Infinity");
`,
  },
  {
    name: "sequence-and-nullish",
    source: `
function logging(label, value) { console.log(label); return value; }
console.log((1, 2), (1, 2, "third"));
console.log((logging("first", 1), logging("second", 2)));
console.log(null ?? "null-fallback", undefined ?? "undefined-fallback");
console.log(0 ?? "kept-zero", "" ?? "kept-empty", false ?? "kept-false");
console.log(NaN ?? "kept-nan", null ?? undefined, undefined ?? null);
console.log(false ?? logging("skipped", 1));
console.log(null ?? logging("taken", "value"));
console.log((null ?? 0) || "or-after", (1 ?? 2) && "and-after");
let effects = 0;
const touch = function () { effects = effects + 1; return null; };
console.log(touch() ?? "was-null", effects);
`,
  },
  {
    name: "numeric-bitwise-exponent",
    source: `
console.log(2 ** 10, 2 ** 0.5, (-2) ** 2, 2 ** -2, 9 ** 0.5);
console.log(1 ** Infinity, (-1) ** Infinity, NaN ** 0, 0 ** 0, 2 ** NaN);
console.log((-0) ** -1, 0 ** -1, (-0) ** 3, 2 ** 3 ** 2, 2 ** -1074);
console.log(5 & 3, 5 | 3, 5 ^ 3, ~5, ~-1, ~~3.7);
console.log(-1 & 255, -5 | 0, 4294967295 & 1, 2147483647 & -1);
console.log(1 << 31, 1 << 32, 2 << 33, -8 >> 2, 7 >> 1, -1 >> 31);
console.log(-1 >>> 0, -8 >>> 2, 1 >>> 32, 4294967296 >>> 0, NaN >>> 0);
console.log("8" >> 1, "16" ** "0.5", true | false, null ^ 5, undefined & 1);
console.log(1.9 << 1, -1.9 << 1, Infinity >> 1, -Infinity >>> 0, NaN << 3);
console.log(2147483647 << 1, -2147483648 >> 31, 1073741824 << 1);
console.log(+true, +"42", +"", +null, +undefined, +"nan");
console.log(+"0x10", ~"2", -0 >>> 0, (-0) ** 2, +"1e3");
`,
  },
  {
    name: "short-circuit-and-conditional",
    source: `
function logging(label, value) { console.log(label); return value; }
console.log(true && "right", 0 || "fallback", "left" || "unused");
console.log(false && logging("skipped-and", 1));
console.log("" || logging("or-right", "reached"));
console.log(logging("first", null) && logging("skipped-chain", 2));
console.log(logging("second", 1) && logging("third", "kept"));
console.log(null || undefined, "" && 0, NaN || "nan-fallback");
console.log(1 && 0 || "chain", 0 && 1 || "short");
console.log(1 ? logging("taken", "yes") : logging("skipped-else", "no"));
console.log("" ? logging("skipped-then", 1) : logging("else", "no"));
console.log(1 ? 2 ? "both" : "first-only" : "neither");
console.log((0 ? "a" : "b") + (1 && "c") + (undefined || "d"));
let effects = 0;
const touch = function () { effects = effects + 1; return effects; };
console.log(touch() && touch(), effects);
console.log(false && touch(), effects);
`,
  },
  {
    name: "do-while-loops",
    source: `
let count = 0;
do { count = count + 1; } while (count < 3);
console.log(count);
let once = 0;
do { once = once + 1; } while (false);
console.log(once);
let controlled = 0;
do {
  controlled = controlled + 1;
  if (controlled === 2) continue;
  if (controlled >= 4) break;
  console.log("body", controlled);
} while (true);
console.log("after", controlled);
function returning(limit) {
  let steps = 0;
  do {
    steps = steps + 1;
    if (steps >= limit) return steps;
  } while (true);
}
console.log(returning(5));
function alwaysReturns() {
  do { return "immediate"; } while (true);
}
console.log(alwaysReturns());
let text = "";
do text = text + "x"; while (text !== "xxx");
console.log(text);
`,
  },
  {
    name: "typeof-void-remainder",
    source: `
const numberBinding = 1;
let uninitializedBinding;
const objectBinding = { key: 1 };
const arrayBinding = [1, 2];
const promiseBinding = Promise.resolve(1);
function chosen() { return 2; }
console.log(typeof undefined, typeof null, typeof true, typeof 1.5);
console.log(typeof numberBinding, typeof "text", typeof chosen);
console.log(typeof objectBinding, typeof arrayBinding, typeof promiseBinding);
console.log(typeof uninitializedBinding, typeof NaN, typeof (1 === 1));
function readBeforeInitialization() {
  try {
    return typeof shadowed;
  } catch (caught) {
    return "temporal dead zone";
  }
  let shadowed;
}
console.log(readBeforeInitialization());
console.log(void 0, void "operand", void chosen());
console.log(7 % 3, -7 % 3, 7 % -3, 7.25 % 0.5, -5 % 5);
console.log(0 % 5, 5 % 0, 5 % Infinity, Infinity % 5, NaN % 1);
console.log("10" % "3", true % 2, null % 2, undefined % 2);
`,
  },
  {
    name: "generic-addition",
    source: `
function show(left, right) { console.log(left + right); }
show(1, 2);
show("left", 2);
show(true, "right");
show(null, false);
show(undefined, 1);
show("", null);
`,
  },
  {
    name: "comparisons",
    source: `
console.log(0 === -0, NaN === NaN, 1 !== "1", null !== undefined);
console.log("a" < "b", "😀" > "z", "10" < 2, null <= false);
console.log(Infinity >= 1, -Infinity < 0, NaN >= 0);
`,
  },
  {
    name: "scope-and-branches",
    source: `
const value = "outer";
const undefined = "undefined binding";
const NaN = "NaN binding";
const Infinity = "Infinity binding";
function scope() {
  if (false) {
    console.log(later);
  }
  const later = "initialized";
  if (true) {
    const value = "inner";
    console.log(value);
  } else {
    console.log("wrong");
  }
  console.log(value);
  console.log(later);
}
function globals() {
  console.log(undefined, NaN, Infinity);
}
scope();
globals();
`,
  },
  {
    name: "calls-and-order",
    source: `
function factorial(value) {
  if (value === 0) return 1;
  return value * factorial(value - 1);
}
function first(value) { return value; }
function pair(left, right) { console.log(left, right); }
console.log(factorial(6));
console.log(first(console.log("argument"), console.log("extra")));
pair("missing");
`,
  },
  {
    name: "duplicate-declarations",
    nonStrictScript: true,
    source: `
function duplicate(value, value) { return value; }
function repeated() { return "first"; }
function repeated() { return "last"; }
console.log(duplicate("first", "last"));
console.log(duplicate("only"));
console.log(repeated());
`,
  },
  {
    name: "hints",
    source: `
/** @param {string} left @returns {boolean} */
function hinted(left: number, right: string): null {
  return left + right;
}
function plain(left, right) { return left + right; }
console.log(hinted(1, 2), plain(1, 2));
`,
  },
  {
    name: "number-edges",
    source: `
console.log(5e-324, 1e308 * 10, 0 / 0, 1 / 0, 1 / -0);
console.log(0.1 + 0.2, 140737488355327 + 1);
`,
  },
  {
    name: "unused-function",
    source: `
function unused() { return 1; }
console.log("unused declaration accepted");
`,
  },
  {
    name: "returning-branches",
    source: `
function choose(value) {
  if (value) return "yes";
  else return "no";
}
console.log(choose(true), choose(false));
`,
  },
  {
    name: "specialization-hit",
    source: `
function add(left: number, right: number) { return left + right; }
add(20, 22);
`,
    specialization: {
      genericCallsDisabled: 1,
      genericCallsEnabled: 0,
      hits: 1,
      misses: 0,
      overflowMisses: 0,
    },
  },
  {
    name: "guarded-addition",
    source: `
function add(left: number, right: number) { return left + right; }
/** @param {number} left @param {number} right */
function addJs(left, right) { return left + right; }
function sum(value) {
  if (value === 0) return add(0, 0);
  return add(value, sum(value - 1));
}
function first() { console.log("left argument"); return 1; }
function second() { console.log("right argument"); return 2; }
console.log(add(1, 2));
console.log(add(140737488355327, 0));
console.log(add(-140737488355328, 0));
console.log(add(140737488355327, 1));
console.log(add(-140737488355328, -1));
console.log(add(-0, 0));
console.log(add(0.5, 1));
console.log(add(5e-324, 0));
console.log(add(NaN, 1));
console.log(add(Infinity, 1));
console.log(add(-Infinity, 1));
console.log(add("left", 1));
console.log(add(1, "right"));
console.log(add(true, 1));
console.log(add(null, 1));
console.log(add(undefined, 1));
console.log(addJs(20, 22));
console.log(sum(3));
console.log(add(first(), second()));
`,
    specialization: {
      genericCallsDisabled: 22,
      genericCallsEnabled: 13,
      hits: 9,
      misses: 11,
      overflowMisses: 2,
    },
  },
  {
    name: "ineligible-and-ordered-addition",
    source: `
function plain(left, right) { return left + right; }
/** @param {string} left @param {number} right */
function conflicting(left: number, right: number) { return left + right; }
function first() { console.log("left"); return 1; }
function second() { console.log("right"); return 2; }
console.log(plain(first(), second()));
console.log(conflicting("value", 1));
`,
    specialization: {
      genericCallsDisabled: 2,
      genericCallsEnabled: 2,
      hits: 0,
      misses: 0,
      overflowMisses: 0,
    },
  },
  {
    name: "promises-and-reactions",
    source: `
function settle(resolve) {
  resolve(41);
  resolve(0);
}
function show(value) { console.log("fulfilled", value); }
function showRejected(reason) { console.log("rejected", reason); }
function showAll(values) { console.log("all", values[0], values[1]); }
function showEmpty(values) { console.log("empty", values.length); }
function cleanup() { console.log("cleanup"); }
function cleanupReject() { return Promise.reject(10); }
function cleanupThrow() { throw 11; }
function invalidInput() { console.log("invalid input"); }
function showConstructible(label, callback) {
  try {
    new callback(31);
  } catch (error) {
    console.log(label, "not constructible");
  }
}
function showObservableAll(values) {
  console.log("observable all", values[0]);
}
function showObservableRace(value) {
  console.log("observable race", value);
}
let settleAdopted;
const adopted = new Promise(function pending(resolve) {
  settleAdopted = resolve;
});
const latched = new Promise(function resolveFirst(resolve, reject) {
  resolve(adopted);
  reject("late rejection");
});
const thrownAfterResolve = new Promise(function resolveThenThrow(resolve) {
  resolve(adopted);
  throw "late executor throw";
});
const thenable = {
  then: function resolveFirst(resolve, reject) {
    resolve(adopted);
    reject("late thenable rejection");
  },
};
console.log("sync start");
new Promise(settle).then(show);
latched.then(show, showRejected);
thrownAfterResolve.then(show, showRejected);
Promise.resolve(thenable).then(show, showRejected);
Promise.resolve(2).then(show);
Promise.reject(3).catch(showRejected);
Promise.all([Promise.resolve(4), 5]).then(showAll);
Promise.all([]).then(showEmpty);
Promise.all([Promise.reject(14), 15]).catch(showRejected);
Promise.race([Promise.resolve(6), Promise.resolve(7)]).then(show);
Promise.resolve(8).finally(cleanup).then(show);
Promise.reject(9).finally(cleanup).catch(showRejected);
Promise.resolve(12).finally(cleanupReject).catch(showRejected);
Promise.resolve(13).finally(cleanupThrow).catch(showRejected);
Promise.all(1).catch(invalidInput);
Promise.race(null).catch(invalidInput);
let exposedResolve;
let exposedReject;
const exposedPromise = new Promise(function expose(resolve, reject) {
  exposedResolve = resolve;
  exposedReject = reject;
});
showConstructible("resolve", exposedResolve);
showConstructible("reject", exposedReject);
exposedPromise.then(show, showRejected);
exposedResolve(32);
const catchObservable = Promise.resolve(33);
catchObservable.then = function observableCatch(onFulfilled, onRejected) {
  console.log("observable catch then");
  return onRejected(34);
};
catchObservable.catch(showRejected);
const finallyObservable = Promise.resolve(35);
finallyObservable.then = function observableFinally(onFulfilled) {
  console.log("observable finally then");
  return onFulfilled(36);
};
finallyObservable.finally(cleanup).then(show);
function observableCleanup() {
  const result = Promise.resolve(0);
  result.then = function observableCleanupThen(onFulfilled) {
    console.log("observable cleanup then");
    return onFulfilled(0);
  };
  return result;
}
Promise.resolve(37).finally(observableCleanup).then(show);
const observable = Promise.resolve(23);
observable.then = function observableThen(onFulfilled) {
  console.log("observable then");
  onFulfilled(24);
};
Promise.all([observable]).then(showObservableAll);
Promise.race([observable]).then(showObservableRace);
const allCallbacks = Promise.resolve(0);
allCallbacks.then = function inspectAllCallbacks(onFulfilled, onRejected) {
  showConstructible("all resolve", onFulfilled);
  showConstructible("all reject", onRejected);
  onFulfilled(43);
};
Promise.all([allCallbacks]).then(showObservableAll, showRejected);
const raceCallbacks = Promise.resolve(0);
raceCallbacks.then = function inspectRaceCallbacks(onFulfilled, onRejected) {
  showConstructible("race resolve", onFulfilled);
  showConstructible("race reject", onRejected);
  onFulfilled(44);
};
Promise.race([raceCallbacks]).then(showObservableRace, showRejected);
const adversarial = Promise.resolve(27);
adversarial.then = function callBoth(onFulfilled, onRejected) {
  onFulfilled(28);
  onRejected(29);
};
Promise.all([adversarial, Promise.resolve(30)]).catch(showRejected);
const throwingThen = Promise.resolve(25);
throwingThen.then = function throwFromThen() { throw 26; };
Promise.all([throwingThen]).catch(showRejected);
const shrinkingFirst = Promise.resolve(0);
const shrinkingValues = [shrinkingFirst, 2];
shrinkingFirst.then = function shrinkDuringAll(onFulfilled) {
  shrinkingValues.length = 1;
  return onFulfilled(40);
};
Promise.all(shrinkingValues).then(function showShrinkingAll(values) {
  console.log("shrinking all", values.length, values[0]);
});
const growingFirst = Promise.resolve(0);
const growingSecond = Promise.resolve(0);
const growingValues = [growingFirst];
growingFirst.then = function growDuringRace(onFulfilled) {
  growingValues[1] = growingSecond;
  return onFulfilled(41);
};
growingSecond.then = function observeGrowingRace(onFulfilled) {
  console.log("growing race element");
  return onFulfilled(42);
};
Promise.race(growingValues).then(show);
const decorated = Promise.resolve(21);
decorated.value = 22;
console.log("promise property", decorated.value, Object.keys(decorated)[0]);
decorated.then = function ownThen() { console.log("own then"); };
decorated.then();
const methodOwner = Promise.resolve(45);
console.log(
  "promise method prototypes",
  Object.getOwnPropertyDescriptor(methodOwner.then, "prototype") ===
    undefined,
  Object.getOwnPropertyDescriptor(methodOwner.catch, "prototype") ===
    undefined,
  Object.getOwnPropertyDescriptor(methodOwner.finally, "prototype") ===
    undefined,
);
Object.setPrototypeOf(methodOwner, null);
console.log(
  "null promise prototype",
  methodOwner.then === undefined,
  methodOwner.catch === undefined,
  methodOwner.finally === undefined,
);
console.log("sync end");
settleAdopted(16);
`,
  },
  {
    name: "async-continuations",
    source: `
async function calculate(value) {
  console.log("entered", value);
  const first = await Promise.resolve(value);
  console.log("resumed", first);
  const second = await 2;
  return first + second;
}
const expression = async function (value) { return await value; };
const arrow = async (value) => await value;
async function readThis() { await 0; return this.value; }
function makeArrow() {
  return async () => { await 0; return this.value; };
}
async function failEarly() { throw "early"; }
async function failLate() { await 0; throw "late"; }
async function shadow(Promise) { return await Promise; }
async function choose(value) {
  if (value) return 17;
  return 18;
}
async function returnedDeclaration() {
  return later();
  function later() { return 25; }
}
async function thrownDeclaration() {
  throw later();
  function later() { return "hoisted throw"; }
}
async function hoistedAcrossAwait() {
  const value = later();
  await 0;
  function later() { return 19; }
  return value;
}
async function tdzAcrossAwait() {
  try {
    console.log(later);
  } catch (error) {
    console.log("async tdz");
  }
  await 0;
  let later = 20;
  return later;
}
async function finalReturn() {
  try {
    return 21;
  } finally {
    return 22;
  }
}
async function finalThrow() {
  try {
    return 23;
  } finally {
    throw "final throw";
  }
}
const internallyAwaited = Promise.resolve(24);
internallyAwaited.then = function overriddenAwait() {
  console.log("incorrect await override");
  return Promise.resolve(0);
};
async function awaitInternally() { return await internallyAwaited; }
const orderingReady = Promise.resolve(0);
async function orderedAsync() {
  await orderingReady;
  console.log("async ordering");
}
function rejected(reason) { console.log("async rejected", reason); }
function showThis(value) { console.log("async this", value); }
const owner = { value: 41, read: readThis, make: makeArrow };
const other = { value: 0, read: owner.make() };
console.log("sync start");
calculate(40).then(function (value) { console.log("result", value); });
expression(3).then(function (value) { console.log("expression", value); });
arrow(4).then(function (value) { console.log("arrow", value); });
owner.read().then(showThis);
other.read().then(showThis);
failEarly().catch(rejected);
failLate().catch(rejected);
shadow(5).then(function (value) { console.log("shadow", value); });
choose(true).then(function (value) { console.log("choose", value); });
returnedDeclaration().then(function (value) {
  console.log("returned declaration", value);
});
thrownDeclaration().catch(function (reason) {
  console.log("thrown declaration", reason);
});
hoistedAcrossAwait().then(function (value) {
  console.log("hoisted", value);
});
tdzAcrossAwait().then(function (value) { console.log("tdz", value); });
finalReturn().then(function (value) { console.log("final return", value); });
finalThrow().catch(function (reason) { console.log("final throw", reason); });
awaitInternally().then(function (value) {
  console.log("internal await", value);
});
orderedAsync();
orderingReady.then(function firstPlainStep() {
  return Promise.resolve().then(function secondPlainStep() {
    console.log("plain ordering");
  });
});
console.log(
  "async prototype",
  Object.getOwnPropertyDescriptor(expression, "prototype") === undefined,
);
try {
  new expression(0);
} catch (error) {
  console.log("async not constructible");
}
try {
  new arrow(0);
} catch (error) {
  console.log("async arrow not constructible");
}
console.log("sync end");
`,
  },
  {
    name: "timer-event-loop",
    source: `
function microtask(value) { console.log("microtask", value); }
function task(value) {
  console.log("timer", value);
  Promise.resolve(value).then(microtask);
}
function scheduleNested() {
  console.log("timer second");
  // The nested timer needs a deadline past every other timer: a zero delay
  // here races the positive-delay timers whenever a reference host stalls
  // before its first timer tick.
  setTimeout(task, 200, "nested");
  Promise.resolve("second").then(microtask);
}
const objectDelay = {
  valueOf: function objectDelayValue() {
    console.log("coerce object delay");
    return 30;
  },
};
function functionDelay() {}
functionDelay.valueOf = function functionDelayValue() {
  console.log("coerce function delay");
  return 40;
};
const nestedDelay = [1];
nestedDelay.toString = function nestedDelayString() {
  console.log("coerce nested array delay");
  return "10";
};
const nestedValueDelay = [1];
nestedValueDelay.toString = function nestedValueDelayString() {
  return nestedValueDelay;
};
nestedValueDelay.valueOf = function nestedValueDelayValue() {
  console.log("coerce nested array valueOf");
  return "15";
};
const nullPrototypeDelay = Object.create(null);
nullPrototypeDelay.valueOf = function nullPrototypeDelayValue() {
  console.log("coerce null prototype delay");
  return "20";
};
const inheritedArrayDelay = {};
Object.setPrototypeOf(inheritedArrayDelay, [5]);
const customJoinDelay = [1];
customJoinDelay.join = function customJoinDelayJoin() {
  console.log("coerce custom array join");
  return "7";
};
const inheritedJoinPrototype = [];
inheritedJoinPrototype.join = function inheritedJoinDelayJoin() {
  console.log("coerce inherited array join");
  return "9";
};
const inheritedJoinDelay = [1];
Object.setPrototypeOf(inheritedJoinDelay, inheritedJoinPrototype);
const invalidJoinDelay = [1];
invalidJoinDelay.join = function invalidJoinDelayJoin() {
  return {};
};
try {
  setTimeout(task, { valueOf: 1, toString: 2 }, "invalid delay");
} catch (error) {
  console.log("invalid timer delay");
}
try {
  setTimeout(task, invalidJoinDelay, "invalid join delay");
} catch (error) {
  console.log("invalid array join delay");
}
try {
  setTimeout(task, Object.create(null), "invalid null delay");
} catch (error) {
  console.log("invalid null prototype delay");
}
// Timers must register in ascending effective delay: the reference hosts
// use wall-clock deadlines, so a slow interval between two registrations
// would otherwise reorder timers whose delays differ by a few milliseconds.
const canceled = setTimeout(task, 0, "canceled");
clearTimeout(canceled);
setTimeout(task, 0, "first");
setTimeout(scheduleNested, 0);
setTimeout(task, [5], "array delay");
setTimeout(task, inheritedArrayDelay, "inherited array delay");
setTimeout(task, customJoinDelay, "custom join delay");
setTimeout(task, inheritedJoinDelay, "inherited join delay");
setTimeout(task, [nestedDelay], "nested array delay");
setTimeout(task, [nestedValueDelay], "nested array valueOf");
setTimeout(task, [nullPrototypeDelay], "null prototype delay");
setTimeout(task, objectDelay, "object delay");
setTimeout(task, functionDelay, "function delay");
setTimeout(task, 100, "late");
console.log("scheduled");
`,
  },
];

const descriptorMapCompilation = compileSource(babelFrontend, {
  source: "Object.create(null, { item: { value: 3 } });",
  sourceId: "object-create-descriptor-map.ts",
});
assert.equal(descriptorMapCompilation.mir, undefined);
assert.match(
  descriptorMapCompilation.diagnostics[0]?.message ?? "",
  /descriptor maps are unsupported/u,
);

async function requireSuccess(
  command: string,
  args: readonly string[],
): Promise<{
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const result = await host.run({ args, command, cwd: root });
  if (result.exitStatus !== 0) {
    throw new Error(`${command} reference fixture failed:\n${result.stderr}`);
  }
  return result;
}

async function references(fixture: Fixture): Promise<
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
  const directory = await host.makeTemporaryDirectory("oseo-reference-");
  const path = `${directory}/${fixture.name}.ts`;
  try {
    const source = fixture.nonStrictScript
      ? `new Function(${JSON.stringify(fixture.source)})();\n`
      : fixture.source;
    await host.writeTextFile(path, referencePrelude + source);
    return [
      await requireSuccess(process.execPath, [path]),
      await requireSuccess("deno", ["run", "--quiet", path]),
    ];
  } finally {
    await host.remove(directory);
  }
}

for (const fixture of fixtures) {
  const [nodeReference, denoReference] = await references(fixture);
  assertMatchingObservations([nodeReference, denoReference]);
  const disabledCompilation = compileSource(
    babelFrontend,
    {
      source: fixture.source,
      sourceId: `${fixture.name}.ts`,
    },
    { observeSpecialization: true, specialization: "disabled" },
  );
  const enabledCompilation = compileSource(
    babelFrontend,
    {
      source: fixture.source,
      sourceId: `${fixture.name}.ts`,
    },
    { observeSpecialization: true, specialization: "enabled" },
  );
  assert.deepEqual(disabledCompilation.diagnostics, [], fixture.name);
  assert.deepEqual(enabledCompilation.diagnostics, [], fixture.name);
  const disabledMir = disabledCompilation.mir;
  const enabledMir = enabledCompilation.mir;
  assert(disabledMir != null, `${fixture.name}: disabled MIR`);
  assert(enabledMir != null, `${fixture.name}: enabled MIR`);

  if (fixture.name === "property-specialization") {
    const enabledText = printMir(enabledMir);
    assert.match(enabledText, /guard-object/u);
    assert.match(enabledText, /guard-shape/u);
    assert.match(enabledText, /load-fixed-slot/u);
    assert.match(enabledText, /property-get generic/u);
    assert.match(enabledText, /join property read/u);
    assert.doesNotMatch(enabledText, /property-get-cached/u);
    assert.doesNotMatch(printMir(disabledMir), /guard-(?:object|shape)/u);
  }

  if (
    fixture.name === "closures-and-methods" ||
    fixture.name === "catchable-type-errors" ||
    fixture.name === "async-continuations" ||
    fixture.name === "generic-addition" ||
    fixture.name === "guarded-addition" ||
    fixture.name === "timer-event-loop" ||
    fixture.name === "in-and-instanceof" ||
    fixture.name === "typeof-void-remainder" ||
    fixture.name === "template-literals"
  ) {
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
  }
  try {
    for (const [mode, compilation] of [
      ["disabled", disabledMir],
      ["enabled", enabledMir],
    ] as const) {
      await withNativeFixture(
        {
          backend: cBackend,
          host,
          input: compilation,
          keepArtifacts: process.env.OSEO_KEEP_ARTIFACTS === "1",
          operation: "execute",
          runtime: cRuntimeProvider,
          target: nativeTarget,
          toolchain: zigToolchain,
        },
        (native) => {
          assertMatchingObservations([nodeReference, denoReference, native]);
          assert(native.counters != null, `${fixture.name}: counters`);
          assert(native.emittedC.includes("OseoResult"), "generic call ABI");
          if (mode === "disabled") {
            assert.equal(native.counters.guardHits, 0);
            assert.equal(native.counters.guardMisses, 0);
            assert.equal(native.counters.overflowMisses, 0);
          }
          if (fixture.specialization != null) {
            const expected = fixture.specialization;
            assert.equal(
              native.counters.genericAdditionCalls,
              mode === "enabled"
                ? expected.genericCallsEnabled
                : expected.genericCallsDisabled,
            );
            if (mode === "enabled") {
              assert.equal(native.counters.guardHits, expected.hits);
              assert.equal(native.counters.guardMisses, expected.misses);
              assert.equal(
                native.counters.overflowMisses,
                expected.overflowMisses,
              );
            }
          }
          if (fixture.name === "guarded-addition" && mode === "enabled") {
            assert.match(native.emittedC, /oseo_value_is_smi/u);
            assert.match(native.emittedC, /oseo_smi_try_add/u);
            assert.match(native.emittedC, /oseo_value_box_smi/u);
            assert.ok(native.counters.allocations > 0);
            assert.ok(native.counters.collections > 0);
          }
          if (fixture.name === "specialization-hit" && mode === "enabled") {
            assert.equal(native.counters.allocations, 0);
            assert.equal(native.counters.genericAdditionCalls, 0);
          }
          if (fixture.name === "unused-function") {
            assert.match(native.emittedC, /oseo_function_0/u);
          }
          if (fixture.name === "returning-branches") {
            assert.doesNotMatch(native.emittedC, /bb3:/u);
          }
          assert(
            native.compilerInvocation
              .filter((line) => line.startsWith("zig cc "))
              .every((line) => line.includes(zigNativeTarget)),
            "native compiler invocation records an explicit target",
          );
        },
      );
    }
  } finally {
    delete process.env.OSEO_GC_EVERY_SAFEPOINT;
  }

  const crossCompilations =
    fixture.specialization == null ? [enabledMir] : [disabledMir, enabledMir];
  for (const compilation of crossCompilations) {
    await withNativeFixture(
      {
        backend: cBackend,
        host,
        input: compilation,
        keepArtifacts: process.env.OSEO_KEEP_ARTIFACTS === "1",
        operation: "compile",
        runtime: cRuntimeProvider,
        target: describeTarget("linux-aarch64-musl"),
        toolchain: zigToolchain,
      },
      (cross) => {
        assert(
          cross.compilerInvocation
            .filter((line) => line.startsWith("zig cc "))
            .every((line) => line.includes("aarch64-linux-musl")),
          "cross compiler invocation records an explicit target",
        );
      },
    );
  }
}

// Multi-source runtime build contract: every reviewed runtime
// translation unit plus an extra probe unit compiles, archives in
// input order, and links into an executable whose observation matches
// the reviewed-runtime build. The copied runtime_core.c gains an
// undefined reference to a symbol defined only by the probe unit, so
// a successful link proves the linker extracted the probe archive
// member.
{
  const probeDirectory = await host.makeTemporaryDirectory("oseo-multi-tu-");
  const probeSourcePath = `${probeDirectory}/runtime_probe.c`;
  await host.writeTextFile(
    probeSourcePath,
    "int oseo_probe_second_translation_unit(void);\n" +
      "int oseo_probe_second_translation_unit(void) { return 1; }\n",
  );
  const multiSourceRuntime = {
    getRuntimeInput() {
      const base = cRuntimeProvider.getRuntimeInput();
      return {
        abiVersion: base.abiVersion,
        assets: [
          ...base.assets,
          {
            kind: "source" as const,
            name: "runtime_probe.c",
            url: new URL(`file://${probeSourcePath}`),
          },
        ],
      };
    },
  };
  const probeReferenceHost = {
    ...host,
    async readTextFile(path: string | URL): Promise<string> {
      const source = await host.readTextFile(path);
      if (
        !(path instanceof URL) ||
        !path.pathname.endsWith("/runtime_core.c")
      ) {
        return source;
      }
      return (
        source +
        "\nint oseo_probe_second_translation_unit(void);\n" +
        "int oseo_probe_link_participation(void);\n" +
        "int oseo_probe_link_participation(void) {\n" +
        "    return oseo_probe_second_translation_unit();\n" +
        "}\n"
      );
    },
  };
  const multiSourceCompilation = compileSource(
    babelFrontend,
    { source: 'console.log("multi-source runtime");', sourceId: "multi.ts" },
    { observeSpecialization: false, specialization: "disabled" },
  );
  assert.deepEqual(multiSourceCompilation.diagnostics, []);
  assert(multiSourceCompilation.mir != null, "multi-source MIR");
  await withNativeFixture(
    {
      backend: cBackend,
      host: probeReferenceHost,
      input: multiSourceCompilation.mir,
      keepArtifacts: process.env.OSEO_KEEP_ARTIFACTS === "1",
      operation: "execute",
      runtime: multiSourceRuntime,
      target: nativeTarget,
      toolchain: zigToolchain,
    },
    (native) => {
      assert.equal(native.stdout, "multi-source runtime\n");
      assert.equal(native.exitStatus, 0);
      const reviewedSourceNames = cRuntimeProvider
        .getRuntimeInput()
        .assets.filter((asset) => asset.kind === "source")
        .map((asset) => asset.name);
      const expectedNames = [...reviewedSourceNames, "runtime_probe.c"];
      const compileLines = native.compilerInvocation.filter((line) =>
        line.includes(" -c "),
      );
      assert.equal(compileLines.length, expectedNames.length);
      expectedNames.forEach((name, index) => {
        assert.ok(
          compileLines[index]?.includes(`/${name} `),
          `compile request ${index} covers ${name}`,
        );
      });
      const archiveLine = native.compilerInvocation.find((line) =>
        line.includes("zig ar "),
      );
      assert(archiveLine != null, "archive request recorded");
      let archiveCursor = 0;
      for (const [index, name] of expectedNames.entries()) {
        const member = `${name.replace(/\.c$/u, "")}-${index}-`;
        const at = archiveLine.indexOf(member, archiveCursor);
        assert.ok(at >= 0, `archive member ${member} appears in order`);
        archiveCursor = at + member.length;
      }
    },
  );
  await host.remove(probeDirectory);
}

const assemblyCompilation = compileSource(
  babelFrontend,
  {
    source:
      "function add(left: number, right: number) { " +
      "return left + right; } console.log(add(1, 2));",
    sourceId: "assembly-specialization.ts",
  },
  { specialization: "enabled" },
);
const assemblyMir = assemblyCompilation.mir;
assert(assemblyMir != null, "assembly specialization MIR");
const assemblySource = cBackend.emit(assemblyMir).source;
for (const [target, zigTarget] of [
  ["linux-x86_64-gnu", "x86_64-linux-gnu"],
  ["macos-aarch64", "aarch64-macos"],
  ["linux-aarch64-musl", "aarch64-linux-musl"],
] as const) {
  const directory = await host.makeTemporaryDirectory("oseo-assembly-");
  try {
    const generatedPath = `${directory}/generated.c`;
    const headerPath = `${directory}/oseo_runtime.h`;
    const assemblyPath = `${directory}/generated.s`;
    await host.writeTextFile(generatedPath, assemblySource);
    const runtimeHeader = cRuntimeProvider
      .getRuntimeInput()
      .assets.find((asset) => asset.kind === "header");
    assert(runtimeHeader != null, "runtime header");
    await host.writeTextFile(
      headerPath,
      await host.readTextFile(runtimeHeader.url),
    );
    const assembly = await host.run({
      args: [
        "cc",
        "-target",
        zigTarget,
        "-std=c11",
        "-O2",
        "-S",
        "-I",
        directory,
        generatedPath,
        "-o",
        assemblyPath,
      ],
      command: "zig",
      cwd: directory,
    });
    assert.equal(assembly.exitStatus, 0, assembly.stderr);
    const text = await host.readTextFile(assemblyPath);
    assert.match(
      text,
      /(?:callq?|bl)\s+_?oseo_add(?:@PLT)?/u,
      `${target}: generic fallback retained`,
    );
    assert.doesNotMatch(
      text,
      /(?:callq?|bl)\s+_?oseo_(?:value_is_smi|smi_try_add|value_box_smi)/u,
      `${target}: small-integer primitives inline`,
    );
  } finally {
    await host.remove(directory);
  }
}

const recursiveCompilation = compileSource(babelFrontend, {
  source: "function recurse() { return recurse(); } recurse();",
  sourceId: "recursive-compile-only.ts",
});
assert.deepEqual(recursiveCompilation.diagnostics, []);
assert(recursiveCompilation.mir != null, "recursive compile-only MIR");
await withNativeFixture(
  {
    backend: cBackend,
    host,
    input: recursiveCompilation.mir,
    operation: "compile",
    runtime: cRuntimeProvider,
    target: describeTarget("linux-aarch64-musl"),
    toolchain: zigToolchain,
  },
  (cross) => {
    assert.match(cross.emittedC, /switch \(code_id\)/u);
    assert.match(cross.emittedC, /oseo_call_function\(context/u);
    assert.match(cross.emittedC, /result = oseo_function_0\(/u);
  },
);

const cli = await runNativeCli(
  {
    args: ["cli-fixture.ts"],
    source: 'console.log("cli-native");',
    sourceId: "cli-fixture.ts",
    version: "0.1.0",
  },
  host,
);
assert.deepEqual(cli, {
  exitStatus: 0,
  stderr: "",
  stdout: "cli-native\n",
});

let tdzDirectory: string | undefined;
let tdzCleanupCount = 0;
const tdzHost = {
  ...host,
  async makeTemporaryDirectory(prefix: string): Promise<string> {
    const directory = await host.makeTemporaryDirectory(prefix);
    tdzDirectory = directory;
    return directory;
  },
  async remove(path: string): Promise<void> {
    assert.equal(path, tdzDirectory);
    tdzCleanupCount += 1;
    await host.remove(path);
  },
};
const tdz = await runNativeCli(
  {
    args: ["tdz-runtime.ts"],
    source:
      "function read() { console.log(value); }\n" +
      "read();\n" +
      "const value = 1;\n",
    sourceId: "tdz-runtime.ts",
    version: "0.1.0",
  },
  tdzHost,
);
assert.equal(tdz.exitStatus, 1);
assert.equal(tdz.stdout, "");
assert.match(tdz.stderr, /error\[OSEO2001\].*before initialization/u);
assert.equal(tdzCleanupCount, 1);

const assignmentTdz = await runNativeCli(
  {
    args: ["assignment-tdz.ts"],
    source: "value = 1; let value = 2;",
    sourceId: "assignment-tdz.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(assignmentTdz.exitStatus, 1);
assert.equal(assignmentTdz.stdout, "");
assert.match(
  assignmentTdz.stderr,
  /error\[OSEO2001\].*assigned before initialization/u,
);

const finallyTdz = await runNativeCli(
  {
    args: ["finally-tdz.ts"],
    source: `function fail() {
  try {
    value;
  } finally {
    console.log("cleanup");
  }
  let value;
}
fail();
`,
    sourceId: "finally-tdz.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(finallyTdz.exitStatus, 1);
assert.equal(finallyTdz.stdout, "cleanup\n");
assert.match(
  finallyTdz.stderr,
  /^finally-tdz\.ts:3:\d+: error\[OSEO2001\]: ReferenceError: Binding/u,
);

const functionCoercion = await runNativeCli(
  {
    args: ["function-coercion.ts"],
    source: "function probe() {}\nconsole.log(probe + 1);",
    sourceId: "function-coercion.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(functionCoercion.exitStatus, 1);
assert.equal(functionCoercion.stdout, "");
assert.match(
  functionCoercion.stderr,
  /error\[OSEO2001\].*Function and promise text conversion is unsupported/u,
);

const objectTimerDelay = await runNativeCli(
  {
    args: ["object-timer-delay.ts"],
    source: `
function task(value) { console.log(value); }
setTimeout(task, {}, "object delay");
setTimeout(task, function delay() {}, "function delay");
`,
    sourceId: "object-timer-delay.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(objectTimerDelay.exitStatus, 0);
assert.equal(objectTimerDelay.stderr, "");
assert.equal(objectTimerDelay.stdout, "object delay\nfunction delay\n");

const asyncPromiseIdentity = await runNativeCli(
  {
    args: ["async-promise-identity.ts"],
    source: `
let inner;
async function source() { await 0; }
async function wrapper() { inner = source(); return inner; }
const outer = wrapper();
console.log(outer === inner);
`,
    sourceId: "async-promise-identity.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(asyncPromiseIdentity.exitStatus, 0);
assert.equal(asyncPromiseIdentity.stderr, "");
assert.equal(asyncPromiseIdentity.stdout, "false\n");

const asyncPromiseAssimilation = await runNativeCli(
  {
    args: ["async-promise-assimilation.ts"],
    source: `
const inner = Promise.resolve(1);
inner.then = function customThen(onFulfilled) {
  console.log("custom then");
  return onFulfilled(2);
};
async function wrapper() { return inner; }
wrapper().then(function show(value) { console.log(value); });
`,
    sourceId: "async-promise-assimilation.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(asyncPromiseAssimilation.exitStatus, 0);
assert.equal(asyncPromiseAssimilation.stderr, "");
assert.equal(asyncPromiseAssimilation.stdout, "custom then\n2\n");

const rejectionPassThroughLocation = await runNativeCli(
  {
    args: ["rejection-pass-through.ts"],
    source: `async function fail() { throw "failure"; }
async function wrapper() { return fail(); }
wrapper();
console.log("after");
`,
    sourceId: "rejection-pass-through.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(rejectionPassThroughLocation.exitStatus, 1);
assert.equal(rejectionPassThroughLocation.stdout, "after\n");
assert.match(
  rejectionPassThroughLocation.stderr,
  /^rejection-pass-through\.ts:1:\d+: error\[OSEO2001\]/u,
);

const retargetedArrayTimerDelay = await runNativeCli(
  {
    args: ["retargeted-array-timer-delay.ts"],
    source: `
function task() { console.log("retargeted array delay"); }
const delay = [];
Object.setPrototypeOf(delay, {});
setTimeout(task, delay);
`,
    sourceId: "retargeted-array-timer-delay.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(retargetedArrayTimerDelay.exitStatus, 0);
assert.equal(retargetedArrayTimerDelay.stderr, "");
assert.equal(retargetedArrayTimerDelay.stdout, "retargeted array delay\n");

const inheritedObjectArrayTimerDelay = await runNativeCli(
  {
    args: ["inherited-object-array-timer-delay.ts"],
    source: `
function task() { console.log("inherited object array delay"); }
const delay = Object.create({});
setTimeout(task, [delay]);
`,
    sourceId: "inherited-object-array-timer-delay.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(inheritedObjectArrayTimerDelay.exitStatus, 0);
assert.equal(inheritedObjectArrayTimerDelay.stderr, "");
assert.equal(
  inheritedObjectArrayTimerDelay.stdout,
  "inherited object array delay\n",
);

const objectLengthArrayTimerDelay = await runNativeCli(
  {
    args: ["object-length-array-timer-delay.ts"],
    source: `
function task() { console.log("object length array delay"); }
const delay = {};
Object.setPrototypeOf(delay, [1]);
delay.length = {
  valueOf: function delayLength() {
    console.log("coerce array length");
    return 1;
  },
};
setTimeout(task, delay);
`,
    sourceId: "object-length-array-timer-delay.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(objectLengthArrayTimerDelay.exitStatus, 0);
assert.equal(objectLengthArrayTimerDelay.stderr, "");
assert.equal(
  objectLengthArrayTimerDelay.stdout,
  "coerce array length\nobject length array delay\n",
);

const accessorDescriptor = await runNativeCli(
  {
    args: ["accessor-descriptor.ts"],
    source:
      'Object.defineProperty({}, "item", {' +
      " get: function () { return 42; } });",
    sourceId: "accessor-descriptor.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(accessorDescriptor.exitStatus, 1);
assert.equal(accessorDescriptor.stdout, "");
assert.match(
  accessorDescriptor.stderr,
  /error\[OSEO2001\].*Accessor property descriptors are unsupported/u,
);

const inheritedAccessorDescriptor = await runNativeCli(
  {
    args: ["inherited-accessor-descriptor.ts"],
    source:
      "const descriptor = Object.create({ " +
      "get: function () { return 42; } }); " +
      'Object.defineProperty({}, "item", descriptor);',
    sourceId: "inherited-accessor-descriptor.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(inheritedAccessorDescriptor.exitStatus, 1);
assert.equal(inheritedAccessorDescriptor.stdout, "");
assert.match(
  inheritedAccessorDescriptor.stderr,
  /error\[OSEO2001\].*Accessor property descriptors are unsupported/u,
);

const nulSourceId = "source\0identifier.ts";
const nulSourceDiagnostic = await runNativeCli(
  {
    args: ["nul-source-id.ts"],
    source: "console.log(value); const value = 1;",
    sourceId: nulSourceId,
    version: "0.1.0",
  },
  host,
);
assert.equal(nulSourceDiagnostic.exitStatus, 1);
assert.equal(nulSourceDiagnostic.stdout, "");
assert.ok(nulSourceDiagnostic.stderr.startsWith(`${nulSourceId}:`));
assert.match(nulSourceDiagnostic.stderr, /error\[OSEO2001\]/u);

const recursion = await runNativeCli(
  {
    args: ["recursive-runtime.ts"],
    source: "function recurse() { return recurse(); } recurse();",
    sourceId: "recursive-runtime.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(recursion.exitStatus, 1);
assert.equal(recursion.stdout, "");
assert.match(recursion.stderr, /error\[OSEO2001\].*call depth/u);

const caughtRecursion = await runNativeCli(
  {
    args: ["caught-recursion-runtime.ts"],
    source:
      "function recurse() { return recurse(); } " +
      'try { recurse(); } catch (error) { console.log("caught"); }',
    sourceId: "caught-recursion-runtime.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(caughtRecursion.exitStatus, 1);
assert.equal(caughtRecursion.stdout, "");
assert.match(caughtRecursion.stderr, /error\[OSEO2001\].*call depth/u);

const caughtLanguageError = await runNativeCli(
  {
    args: ["caught-language-error.ts"],
    source: `
try { const value = 1; value = 2; } catch (error) {}
throw 1;
`,
    sourceId: "caught-language-error.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(caughtLanguageError.exitStatus, 1);
assert.equal(caughtLanguageError.stdout, "");
assert.match(
  caughtLanguageError.stderr,
  /error\[OSEO2001\]: Unhandled JavaScript throw\./u,
);
assert.doesNotMatch(caughtLanguageError.stderr, /immutable binding/u);

const thrownTimer = await runNativeCli(
  {
    args: ["thrown-timer-runtime.ts"],
    source: `
function observe(value) { console.log(value); }
function task() {
  Promise.resolve("microtask after throw").then(observe);
  throw "timer failure";
}
setTimeout(task, 0);
`,
    sourceId: "thrown-timer-runtime.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(thrownTimer.exitStatus, 1);
assert.equal(thrownTimer.stdout, "microtask after throw\n");
assert.match(
  thrownTimer.stderr,
  /error\[OSEO2001\]: Unhandled JavaScript throw\./u,
);

const thrownEntry = await runNativeCli(
  {
    args: ["thrown-entry-runtime.ts"],
    source: `
function observe(value) { console.log(value); }
Promise.resolve("microtask after entry throw").then(observe);
throw "entry failure";
`,
    sourceId: "thrown-entry-runtime.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(thrownEntry.exitStatus, 1);
assert.equal(thrownEntry.stdout, "microtask after entry throw\n");
assert.match(
  thrownEntry.stderr,
  /error\[OSEO2001\]: Unhandled JavaScript throw\./u,
);

const thrownTypedEntry = await runNativeCli(
  {
    args: ["thrown-typed-entry.ts"],
    source: 'throw new TypeError("typed unhandled");',
    sourceId: "thrown-typed-entry.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(thrownTypedEntry.exitStatus, 1);
assert.equal(thrownTypedEntry.stdout, "");
assert.match(
  thrownTypedEntry.stderr,
  /^thrown-typed-entry\.ts:1:\d+: error\[OSEO2001\]: TypeError: typed/u,
);
// The stable machine-readable marker records the intrinsic error kind.
assert.match(thrownTypedEntry.stderr, /\nOSEO_THROWN TypeError\n$/u);

const thrownRuntimeTyped = await runNativeCli(
  {
    args: ["thrown-runtime-typed.ts"],
    source: "const target = null; target.item;",
    sourceId: "thrown-runtime-typed.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(thrownRuntimeTyped.exitStatus, 1);
assert.equal(thrownRuntimeTyped.stdout, "");
assert.match(
  thrownRuntimeTyped.stderr,
  /error\[OSEO2001\]: TypeError: Cannot read properties of a nullish value\./u,
);

const thrownRenamedEntry = await runNativeCli(
  {
    args: ["thrown-renamed-entry.ts"],
    source: `
const renamed = new Error("body");
renamed.name = "한글이름";
throw renamed;
`,
    sourceId: "thrown-renamed-entry.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(thrownRenamedEntry.exitStatus, 1);
assert.equal(thrownRenamedEntry.stdout, "");
assert.match(thrownRenamedEntry.stderr, /error\[OSEO2001\]: 한글이름: body/u);
// The marker keeps the intrinsic Error identity even though the human
// diagnostic shows the mutated non-identifier name.
assert.match(thrownRenamedEntry.stderr, /\nOSEO_THROWN Error\n$/u);

const thrownEmptyEntry = await runNativeCli(
  {
    args: ["thrown-empty-entry.ts"],
    source: `
const blank = new TypeError("");
blank.name = "";
throw blank;
`,
    sourceId: "thrown-empty-entry.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(thrownEmptyEntry.exitStatus, 1);
assert.equal(thrownEmptyEntry.stdout, "");
// With no renderable name or message the human diagnostic falls back to the
// generic throw text, yet the marker still exposes the intrinsic identity.
assert.match(
  thrownEmptyEntry.stderr,
  /error\[OSEO2001\]: Unhandled JavaScript throw\./u,
);
assert.match(thrownEmptyEntry.stderr, /\nOSEO_THROWN TypeError\n$/u);

const thrownPrototypeEntry = await runNativeCli(
  {
    args: ["thrown-prototype-entry.ts"],
    source: `
throw TypeError.prototype;
`,
    sourceId: "thrown-prototype-entry.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(thrownPrototypeEntry.exitStatus, 1);
assert.equal(thrownPrototypeEntry.stdout, "");
// Throwing the intrinsic prototype object itself keeps its exact identity,
// because the kind walk starts at the thrown value rather than its prototype.
assert.match(thrownPrototypeEntry.stderr, /\nOSEO_THROWN TypeError\n$/u);

const thrownConvertedMessage = await runNativeCli(
  {
    args: ["thrown-converted-message.ts"],
    source: `
const boom = new Error("original");
boom.message = { toString: function () { return "converted"; } };
throw boom;
`,
    sourceId: "thrown-converted-message.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(thrownConvertedMessage.exitStatus, 1);
assert.equal(thrownConvertedMessage.stdout, "");
// The diagnostic points at the throw site (line 4), not the toString
// method whose conversion moved the context source location.
assert.match(
  thrownConvertedMessage.stderr,
  /^thrown-converted-message\.ts:4:1: error\[OSEO2001\]: Error: converted/u,
);

const wideBindings = Array.from(
  { length: 3_000 },
  (_, index) => `const value${index} = ${index};`,
).join("\n");
const wideRecursion = await runNativeCli(
  {
    args: ["wide-recursion-runtime.ts"],
    source:
      `function recurse(depth) {\n${wideBindings}\n` +
      "  if (depth === 0) return 0;\n" +
      "  return recurse(depth - 1);\n" +
      "}\n" +
      "console.log(recurse(100));\n",
    sourceId: "wide-recursion-runtime.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(wideRecursion.exitStatus, 1);
assert.equal(wideRecursion.stdout, "");
assert.match(wideRecursion.stderr, /error\[OSEO2001\].*frame budget/u);

const rootAllocationFailureHost = {
  ...host,
  async readTextFile(path: string | URL): Promise<string> {
    const source = await host.readTextFile(path);
    if (!(path instanceof URL) || !path.pathname.endsWith("/runtime_core.c")) {
      return source;
    }
    const injected = source.replace(
      "slots = calloc(slot_count, sizeof(OseoValue));",
      "slots = NULL;",
    );
    assert.notEqual(injected, source, "root allocation failure injected");
    return injected;
  },
};
const rootAllocationFailure = await runNativeCli(
  {
    args: ["root-allocation-runtime.ts"],
    source: "console.log(1);",
    sourceId: "root-allocation-runtime.ts",
    version: "0.1.0",
  },
  rootAllocationFailureHost,
);
assert.equal(rootAllocationFailure.exitStatus, 1);
assert.equal(rootAllocationFailure.stdout, "");
assert.match(
  rootAllocationFailure.stderr,
  /error\[OSEO2001\].*Root frame allocation failed/u,
);

const concatenationOverflowHost = {
  ...host,
  async readTextFile(path: string | URL): Promise<string> {
    const source = await host.readTextFile(path);
    if (
      !(path instanceof URL) ||
      !path.pathname.endsWith("/runtime_primitive.c")
    ) {
      return source;
    }
    const injected = source.replace(
      "OseoString *right_object = string_object(slots[1]);",
      "OseoString *right_object = string_object(slots[1]);\n" +
        "    right_object->length = SIZE_MAX;",
    );
    assert.notEqual(injected, source, "concatenation overflow injected");
    return injected;
  },
};
const concatenationOverflow = await runNativeCli(
  {
    args: ["concatenation-overflow-runtime.ts"],
    source: 'console.log("left" + "right");',
    sourceId: "concatenation-overflow-runtime.ts",
    version: "0.1.0",
  },
  concatenationOverflowHost,
);
assert.equal(concatenationOverflow.exitStatus, 1);
assert.equal(concatenationOverflow.stdout, "");
assert.match(
  concatenationOverflow.stderr,
  /error\[OSEO2001\].*String allocation is too large/u,
);

const allocationFailureHost = {
  ...host,
  async readTextFile(path: string | URL): Promise<string> {
    const source = await host.readTextFile(path);
    if (
      !(path instanceof URL) ||
      !path.pathname.endsWith("/runtime_primitive.c")
    ) {
      return source;
    }
    const injected = source.replace(
      "char *text = malloc(length + 1u);",
      "char *text = NULL;",
    );
    assert.notEqual(injected, source, "numeric allocation failure injected");
    return injected;
  },
};
const allocationFailure = await runNativeCli(
  {
    args: ["numeric-conversion-runtime.ts"],
    source: 'console.log(-"1");',
    sourceId: "numeric-conversion-runtime.ts",
    version: "0.1.0",
  },
  allocationFailureHost,
);
assert.equal(allocationFailure.exitStatus, 1);
assert.equal(allocationFailure.stdout, "");
assert.match(allocationFailure.stderr, /error\[OSEO2001\].*allocation/u);

// The switch-tdz fixture explains why this check bypasses the Deno
// reference: Deno's TypeScript transpile loses the case-level TDZ.
const switchTdzEntry = `${root}/tests/fixtures/switch-tdz.js`;
const nativeSwitchTdz = await runNativeCli(
  {
    args: [switchTdzEntry],
    version: "0.1.0",
  },
  host,
);
assert.equal(nativeSwitchTdz.exitStatus, 0, nativeSwitchTdz.stderr);
assert.equal(nativeSwitchTdz.stdout, "case tdz\nset none\n");

const moduleEntry = `${root}/tests/fixtures/modules/entry.js`;
const nativeModule = await runNativeCli(
  {
    args: [moduleEntry],
    version: "0.1.0",
  },
  host,
);
assert.equal(nativeModule.exitStatus, 0, nativeModule.stderr);
assert.equal(nativeModule.stderr, "");
assert.equal(
  nativeModule.stdout,
  "var order 1 2 undefined\n" +
    "cycle b ready default ready\ncycle c ready\ncycle a\n" +
    "default first\ndefault second\nidentity once\n" +
    "answer increment 41\n" +
    "42\ntrue true false\n" +
    "immutable\nnonextensible\ntrue\ndefault\ndefault\n",
);

const asyncModuleEntry = `${root}/tests/fixtures/async-modules/entry.js`;
const nativeAsyncModule = await runNativeCli(
  {
    args: [asyncModuleEntry],
    version: "0.1.0",
  },
  host,
);
assert.equal(nativeAsyncModule.exitStatus, 0, nativeAsyncModule.stderr);
assert.equal(nativeAsyncModule.stderr, "");
assert.equal(
  nativeAsyncModule.stdout,
  "dependency ready\nentry ready\nlate timer\n",
);

const rejectionAfterAwait = [
  root,
  "tests/fixtures/async-modules/rejection-after-await.js",
].join("/");
const nativeRejectionAfterAwait = await runNativeCli(
  {
    args: [rejectionAfterAwait],
    version: "0.1.0",
  },
  host,
);
assert.equal(
  nativeRejectionAfterAwait.exitStatus,
  0,
  nativeRejectionAfterAwait.stderr,
);
assert.equal(nativeRejectionAfterAwait.stderr, "");
assert.equal(nativeRejectionAfterAwait.stdout, "handled after await\n");

const awaitQueueOrder = [
  root,
  "tests/fixtures/async-modules/await-queue-order.js",
].join("/");
const nativeAwaitQueueOrder = await runNativeCli(
  {
    args: [awaitQueueOrder],
    version: "0.1.0",
  },
  host,
);
assert.equal(nativeAwaitQueueOrder.exitStatus, 0, nativeAwaitQueueOrder.stderr);
assert.equal(nativeAwaitQueueOrder.stderr, "");
assert.equal(nativeAwaitQueueOrder.stdout, "after\nnested\n");

const independentModuleEntry = [
  root,
  "tests/fixtures/async-modules/independent-entry.mjs",
].join("/");
const nativeIndependentModule = await runNativeCli(
  {
    args: [independentModuleEntry],
    version: "0.1.0",
  },
  host,
);
assert.equal(nativeIndependentModule.exitStatus, 0);
assert.equal(nativeIndependentModule.stderr, "");
assert.equal(nativeIndependentModule.stdout, "a start\noperand\nb\na done 2\n");

const unhandledBeforeTimer = [
  root,
  "tests/fixtures/async-modules/unhandled-before-timer.js",
].join("/");
const nativeUnhandledBeforeTimer = await runNativeCli(
  {
    args: [unhandledBeforeTimer],
    version: "0.1.0",
  },
  host,
);
assert.equal(nativeUnhandledBeforeTimer.exitStatus, 1);
assert.equal(nativeUnhandledBeforeTimer.stdout, "");
assert.match(
  nativeUnhandledBeforeTimer.stderr,
  /error\[OSEO2001\].*Unhandled promise rejection/u,
);

const blockedModule = `${root}/tests/fixtures/async-modules/blocked.js`;
const nativeBlockedModule = await runNativeCli(
  {
    args: [blockedModule],
    version: "0.1.0",
  },
  host,
);
assert.equal(nativeBlockedModule.exitStatus, 1);
assert.equal(nativeBlockedModule.stdout, "");
assert.match(
  nativeBlockedModule.stderr,
  /error\[OSEO3001\].*Top-level await cannot make progress/u,
);

const diagnosticModule = `${root}/tests/fixtures/module-diagnostics/entry.mjs`;
const nativeDiagnosticModule = await runNativeCli(
  {
    args: [diagnosticModule],
    version: "0.1.0",
  },
  host,
);
assert.equal(nativeDiagnosticModule.exitStatus, 1);
assert.equal(
  nativeDiagnosticModule.stdout,
  "dependency before throw\ndependency cleanup\n",
);
assert.match(
  nativeDiagnosticModule.stderr,
  /module-diagnostics\/dep\.mjs:5:3: error\[OSEO2001\]/u,
);

const rejectionLocation = [
  root,
  "tests/fixtures/rejection-location/entry.mjs",
].join("/");
const nativeRejectionLocation = await runNativeCli(
  {
    args: [rejectionLocation],
    version: "0.1.0",
  },
  host,
);
assert.equal(nativeRejectionLocation.exitStatus, 1);
assert.equal(nativeRejectionLocation.stdout, "entry after rejection\n");
assert.match(
  nativeRejectionLocation.stderr,
  /rejection-location\/dep\.mjs:2:3: error\[OSEO2001\]/u,
);

const topLevelAwaitRejection = await runNativeCli(
  {
    args: ["top-level-await-rejection.mjs"],
    source: `console.log("before rejection");
await Promise.reject("bad");
`,
    sourceId: "top-level-await-rejection.mjs",
    version: "0.1.0",
  },
  host,
);
assert.equal(topLevelAwaitRejection.exitStatus, 1);
assert.equal(topLevelAwaitRejection.stdout, "before rejection\n");
assert.match(
  topLevelAwaitRejection.stderr,
  /top-level-await-rejection\.mjs:2:\d+: error\[OSEO2001\]/u,
);

console.log(
  `native fixtures: ${fixtures.length} Node, Deno, and ` +
    `${nativeTarget.name} outputs match`,
);
console.log(
  `cross fixtures: ${fixtures.length + 1} linux-aarch64-musl builds passed`,
);
console.log("assembly fixtures: all configured target paths inspected");
