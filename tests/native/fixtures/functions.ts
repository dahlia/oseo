import type { Fixture } from "../fixture.ts";

export const functionFixtures: readonly Fixture[] = [
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
    name: "function-binding-patterns",
    source: `
function arrayPattern([first, second = 2, ...rest]) {
  return [first, second, rest.length, rest[0]];
}
console.log(arrayPattern([1]));
console.log(arrayPattern([3, 4, 5]));
function objectPattern({ value, nested: { item = 6 }, ...rest }) {
  return [value, item, rest.extra, Object.keys(rest).length];
}
console.log(objectPattern({ value: 7, nested: {}, extra: 8 }));
const arrowPattern = ({ value }) => value;
console.log(arrowPattern({ value: 9 }));
const bodyLocal = 12;
function parameterScope([value = bodyLocal]) {
  function bodyLocal() { return 13; }
  return [value, bodyLocal()];
}
console.log(parameterScope([]));
function parameterFunction([value]) {
  function value() { return 14; }
  return value();
}
console.log(parameterFunction([0]));
function laterTdz([value = later], later) {
  return value;
}
try { laterTdz([], 10); }
catch (error) { console.log(error instanceof ReferenceError); }
function closeOnFailure([value = later], later) {
  return value;
}
let closed = 0;
const closingInput = {
  [Symbol.iterator]: function () {
    return {
      next: function () { return { value: undefined, done: false }; },
      return: function () { closed = closed + 1; return {}; },
    };
  },
};
try { closeOnFailure(closingInput); }
catch (error) { console.log(error instanceof ReferenceError, closed); }
function PatternConstructor({ value }) {
  this.value = value;
}
console.log(new PatternConstructor({ value: 11 }).value);
console.log(arrayPattern.length, objectPattern.length);
`,
  },
  {
    name: "function-default-parameters",
    source: `
function defaults(first, second = first + 1, third = second + 1) {
  return [first, second, third];
}
console.log(defaults(1));
console.log(defaults(1, undefined, 9));
console.log(defaults(1, null));
function objectDefault({ value } = { value: 4 }) {
  return value;
}
console.log(objectDefault(), objectDefault({ value: 5 }));
const bodyLocal = 6;
function parameterScope(value = bodyLocal) {
  function bodyLocal() { return 7; }
  return [value, bodyLocal()];
}
console.log(parameterScope());
function laterTdz(value = later, later = 8) {
  return value;
}
try { laterTdz(); }
catch (error) { console.log(error instanceof ReferenceError); }
let entered = false;
function failDefault() { throw "default"; }
function abrupt(value = failDefault()) {
  entered = true;
  return value;
}
try { abrupt(); }
catch (error) { console.log(error instanceof ReferenceError, entered); }
function DefaultConstructor(value = this.seed) {
  this.value = value;
}
DefaultConstructor.prototype.seed = 10;
console.log(new DefaultConstructor().value);
function ArrowFactory() {
  this.seed = 11;
  return (value = this.seed) => value;
}
console.log(new ArrowFactory()());
function lengthOne(first, second = 2, third) {}
function lengthZero(first = 1, second) {}
function lengthTwo(first, second) {}
console.log(lengthOne.length, lengthZero.length, lengthTwo.length);
function inferredDefault(value = function () {}) {
  return value.name;
}
const inferredArrowDefault = (value = () => 1) => value.name;
console.log(inferredDefault(), inferredArrowDefault());
`,
  },
  {
    name: "function-rest-parameters",
    source: `
function collect(first, ...rest) {
  return [first, rest.length, rest[0], rest[rest.length - 1], rest];
}
const empty = collect(1);
const values = collect(2, 3, 4);
console.log(empty[0], empty[1], empty[2], empty[3]);
console.log(values[0], values[1], values[2], values[3]);
console.log(empty[4] !== values[4], collect(3)[4] !== collect(3)[4]);
const heapValues = collect(
  "prefix",
  { marker: "object" },
  "heap string",
  [16],
);
console.log(
  heapValues[4][0].marker,
  heapValues[4][1],
  heapValues[4][2][0],
);
const arrow = (...rest) => [rest.length, rest[0]];
console.log(arrow(), arrow(5, 6));
function RestConstructor(first, ...rest) {
  this.first = first;
  this.rest = rest;
}
const constructed = new RestConstructor(7, 8, 9);
console.log(
  constructed.first,
  constructed.rest.length,
  constructed.rest[0],
  constructed.rest[1],
);
function arrayRest(...[first, ...tail]) {
  return [first, tail.length, tail[0]];
}
console.log(arrayRest(10, 11, 12));
function objectRest(...{ 0: first, ...remaining }) {
  return [first, remaining[1], Object.keys(remaining).length];
}
console.log(objectRest(13, 14, 15));
function lengthTwo(first, second, ...rest) {}
function lengthZero(...rest) {}
console.log(lengthTwo.length, lengthZero.length);
`,
  },
  {
    name: "function-parameter-var-bindings",
    source: `
let readDefault;
function sharedDefault(value = (readDefault = () => value, 1)) {
  var value = 2;
  return [value, readDefault()];
}
console.log(sharedDefault());
let readPattern;
function sharedPattern([value = (readPattern = () => value, 3)]) {
  var value = 4;
  return [value, readPattern()];
}
console.log(sharedPattern([]));
let readPlain;
function sharedPlain(_ = (readPlain = () => value, 0), value = 5) {
  var value = 6;
  return [value, readPlain()];
}
console.log(sharedPlain());
const sharedArrow = (value = 7) => {
  var value = 8;
  return value;
};
console.log(sharedArrow());
function sharedRest(...value) {
  var value;
  return value.length;
}
console.log(sharedRest(9, 10));
function functionOwned(value = 11) {
  function value() { return 12; }
  var value;
  return value();
}
console.log(functionOwned());
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
const sloppyForOf = function self() {
  for (self of [1]) return self === sloppyForOf;
  return false;
};
console.log(sloppyForOf());
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
let internalIndex = 0;
try {
  while (internalIndex < 2) {
    switch (internalIndex) {
      case 0: internalIndex = internalIndex + 1; break;
      default: internalIndex = internalIndex + 1; break;
    }
    console.log("after internal switch", internalIndex);
    continue;
  }
} finally {
  console.log("one internal finally", internalIndex);
}
let layeredIndex = 0;
try {
  while (layeredIndex < 2) {
    layeredIndex = layeredIndex + 1;
    try {
      continue;
    } finally {
      console.log("layered inner finally", layeredIndex);
    }
  }
} finally {
  console.log("layered outer finally", layeredIndex);
}
try {
  layeredLoop: while (true) {
    try {
      break layeredLoop;
    } finally {
      console.log("labeled inner finally");
    }
  }
  console.log("after layered label");
} finally {
  console.log("labeled outer finally");
}
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
function arrayMark(label, value) {
  console.log(label);
  return value;
}
const accumulated = [
  arrayMark("before", 0),
  ...arrayMark("iterable", [arrayMark("inside", "one"), "two"]),
  ,
  ...arrayMark("second iterable", ["three", "four"]),
  arrayMark("after", 3),
];
console.log(
  accumulated.length,
  accumulated[0],
  accumulated[1],
  accumulated[2],
  accumulated[3],
  accumulated[4],
  accumulated[5],
  accumulated[6],
);
let capturedCalls = 0;
const capturedNext = {
  [Symbol.iterator]: function () {
    return {
      next: function () {
        capturedCalls = capturedCalls + 1;
        this.next = function () { return { value: -1, done: false }; };
        return { value: capturedCalls, done: capturedCalls > 2 };
      },
    };
  },
};
const capturedValues = [...capturedNext];
console.log(
  capturedValues.length,
  capturedValues[0],
  capturedValues[1],
  capturedCalls,
);
let spreadCloseCalls = 0;
let spreadStep = 0;
const throwingSpread = {
  [Symbol.iterator]: function () {
    return {
      next: function () {
        spreadStep = spreadStep + 1;
        if (spreadStep === 2) throw new RangeError("spread step");
        return { value: "kept", done: false };
      },
      return: function () {
        spreadCloseCalls = spreadCloseCalls + 1;
        return {};
      },
    };
  },
};
try { [...throwingSpread]; } catch (error) {
  console.log(error instanceof RangeError, spreadCloseCalls);
}
try { [...5]; } catch (error) {
  console.log(error instanceof TypeError);
}
function reportCall(first, second, third, fourth) {
  console.log(first, second, third, fourth);
}
reportCall("call", ...[1, 2], 3);
console.log("intrinsic", ...[4, 5]);
const spreadReceiver = {
  label: "receiver",
  report: function (first, second) {
    console.log(this.label, first, second);
  },
};
spreadReceiver.report(...[6, 7]);
let callOrder = "";
function selectSpreadCall() {
  callOrder = callOrder + "callee";
  return function (value) { console.log(callOrder, value); };
}
const orderedCallSpread = {
  [Symbol.iterator]: function () {
    callOrder = callOrder + "-spread";
    return [8][Symbol.iterator]();
  },
};
selectSpreadCall()(...orderedCallSpread);
let callCloseCalls = 0;
let callInvocations = 0;
const throwingCallSpread = {
  [Symbol.iterator]: function () {
    return {
      next: function () { throw new RangeError("call spread step"); },
      return: function () {
        callCloseCalls = callCloseCalls + 1;
        return {};
      },
    };
  },
};
function shouldNotRun() { callInvocations = callInvocations + 1; }
try { shouldNotRun(...throwingCallSpread); } catch (error) {
  console.log(
    error instanceof RangeError,
    callCloseCalls,
    callInvocations,
  );
}
function SpreadBox(first, second, third) {
  this.first = first;
  this.second = second;
  this.third = third;
}
const spreadBox = new SpreadBox("new", ...[8, 9]);
console.log(spreadBox.first, spreadBox.second, spreadBox.third);
let constructOrder = "";
function OrderedBox(value) {
  this.value = value;
  console.log(constructOrder, this.value);
}
function selectSpreadConstructor() {
  constructOrder = constructOrder + "callee";
  return OrderedBox;
}
const orderedConstructorSpread = {
  [Symbol.iterator]: function () {
    constructOrder = constructOrder + "-spread";
    return [10][Symbol.iterator]();
  },
};
new (selectSpreadConstructor())(...orderedConstructorSpread);
let constructCloseCalls = 0;
let constructInvocations = 0;
const throwingConstructorSpread = {
  [Symbol.iterator]: function () {
    return {
      next: function () { throw new RangeError("constructor spread step"); },
      return: function () {
        constructCloseCalls = constructCloseCalls + 1;
        return {};
      },
    };
  },
};
function ShouldNotConstruct() {
  constructInvocations = constructInvocations + 1;
}
try { new ShouldNotConstruct(...throwingConstructorSpread); } catch (error) {
  console.log(
    error instanceof RangeError,
    constructCloseCalls,
    constructInvocations,
  );
}
`,
  },
];
