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
console.log("sync start");
new Promise(settle).then(show);
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
console.log("sync end");
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
async function failEarly() { throw "early"; }
async function failLate() { await 0; throw "late"; }
async function shadow(Promise) { return await Promise; }
function rejected(reason) { console.log("async rejected", reason); }
console.log("sync start");
calculate(40).then(function (value) { console.log("result", value); });
expression(3).then(function (value) { console.log("expression", value); });
arrow(4).then(function (value) { console.log("arrow", value); });
failEarly().catch(rejected);
failLate().catch(rejected);
shadow(5).then(function (value) { console.log("shadow", value); });
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
  setTimeout(task, 0, "nested");
  Promise.resolve("second").then(microtask);
}
const canceled = setTimeout(task, 0, "canceled");
clearTimeout(canceled);
setTimeout(task, 100, "late");
setTimeout(task, 0, "first");
setTimeout(scheduleNested, 0);
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
    fixture.name === "generic-addition" ||
    fixture.name === "guarded-addition"
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
          runtime: cRuntimeProvider,
          target: describeTarget("x86_64-linux-gnu"),
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
              .every((line) => line.includes("x86_64-linux-gnu")),
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
        runtime: cRuntimeProvider,
        target: describeTarget("aarch64-linux-musl"),
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
for (const target of ["x86_64-linux-gnu", "aarch64-linux-musl"] as const) {
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
        target,
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
      /(?:callq?|bl)\s+oseo_add(?:@PLT)?/u,
      `${target}: generic fallback retained`,
    );
    assert.doesNotMatch(
      text,
      /(?:callq?|bl)\s+oseo_(?:value_is_smi|smi_try_add|value_box_smi)/u,
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
    runtime: cRuntimeProvider,
    target: describeTarget("aarch64-linux-musl"),
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
  /^finally-tdz\.ts:3:\d+: error\[OSEO2001\]: Binding is read/u,
);

const objectCoercion = await runNativeCli(
  {
    args: ["object-coercion.ts"],
    source: "console.log([2] * 3);",
    sourceId: "object-coercion.ts",
    version: "0.1.0",
  },
  host,
);
assert.equal(objectCoercion.exitStatus, 1);
assert.equal(objectCoercion.stdout, "");
assert.match(
  objectCoercion.stderr,
  /error\[OSEO2001\].*Object-to-primitive conversion is unsupported/u,
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
    if (!(path instanceof URL) || !path.pathname.endsWith("/runtime.c")) {
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
    if (!(path instanceof URL) || !path.pathname.endsWith("/runtime.c")) {
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
    if (!(path instanceof URL) || !path.pathname.endsWith("/runtime.c")) {
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
assert.equal(nativeModule.stdout, "answer increment 41\n42\nimmutable\n");

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

console.log(
  `native fixtures: ${fixtures.length} Node, Deno, and x86-64 outputs match`,
);
console.log(
  `cross fixtures: ${fixtures.length + 1} aarch64-linux-musl builds passed`,
);
console.log("assembly fixtures: x86-64 and AArch64 guarded paths inspected");
