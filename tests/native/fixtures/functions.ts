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
    name: "arguments-object",
    nonStrictScript: true,
    source: `
function inspect() {
  const first = arguments[0];
  console.log(
    arguments.length,
    arguments[0],
    arguments[1],
    arguments[2],
    arguments.callee === inspect,
  );
  arguments[0] = 40;
  console.log(first, arguments[0], arguments.length);
  return arguments;
}
const first = inspect(1, "two");
const second = inspect();
console.log(first === second, first.length, second.length);
const indexDescriptor = Object.getOwnPropertyDescriptor(first, "0");
const lengthDescriptor = Object.getOwnPropertyDescriptor(first, "length");
const calleeDescriptor = Object.getOwnPropertyDescriptor(first, "callee");
console.log(
  indexDescriptor.writable,
  indexDescriptor.enumerable,
  indexDescriptor.configurable,
);
console.log(
  lengthDescriptor.writable,
  lengthDescriptor.enumerable,
  lengthDescriptor.configurable,
);
console.log(
  calleeDescriptor.writable,
  calleeDescriptor.enumerable,
  calleeDescriptor.configurable,
);
const object = {
  method() {
    return arguments.callee === object.method && arguments[0];
  },
};
console.log(object.method(42));
function* generate() {
  yield arguments[0];
  return arguments.callee === generate;
}
const generated = generate("yielded");
console.log(generated.next().value, generated.next().value);
`,
  },
  {
    name: "mapped-arguments-object",
    nonStrictScript: true,
    source: `
function aliasing(a, b) {
  console.log(arguments.length, a, b, arguments[0], arguments[1]);
  arguments[0] = 100;
  console.log(a, arguments[0]);
  a = 200;
  console.log(arguments[0], a);
  arguments["1"] = 300;
  console.log(b, arguments[1]);
  b = 400;
  console.log(arguments[1], b);
  return arguments.callee === aliasing;
}
console.log(aliasing(1, 2));

function excess(a) {
  console.log(arguments.length, a, arguments[0], arguments[1]);
  arguments[1] = 500;
  console.log(a, arguments[1]);
  a = 600;
  console.log(arguments[1]);
  return 0;
}
console.log(excess(10, 20));

function absent(a, b) {
  console.log(arguments.length, a, b, arguments[0], arguments[1]);
  return 0;
}
console.log(absent(1));

function duplicate(a, a) {
  console.log(arguments.length, a, arguments[0], arguments[1]);
  arguments[0] = 700;
  console.log(a, arguments[0], arguments[1]);
  arguments[1] = 800;
  console.log(a, arguments[0], arguments[1]);
  a = 900;
  console.log(arguments[0], arguments[1]);
  return 0;
}
console.log(duplicate(1, 2));

function severDelete(a) {
  arguments[0] = 111;
  delete arguments[0];
  a = 222;
  console.log(arguments[0], a);
  return 0;
}
console.log(severDelete(10));

function severWritableFalse(a) {
  arguments[0] = 333;
  Object.defineProperty(arguments, 0, { writable: false });
  a = 444;
  console.log(arguments[0], a);
  const descriptor = Object.getOwnPropertyDescriptor(arguments, "0");
  console.log(descriptor.value, descriptor.writable, descriptor.configurable);
  return 0;
}
console.log(severWritableFalse(10));

function severAccessor(a) {
  arguments[0] = 555;
  Object.defineProperty(arguments, 0, {
    configurable: true,
    get() { return 666; },
  });
  a = 777;
  console.log(arguments[0], a);
  return 0;
}
console.log(severAccessor(10));

function inspectMapped(a, b) {
  return arguments;
}
const mappedFirst = inspectMapped(1, 2);
const mappedSecond = inspectMapped(1, 2);
console.log(mappedFirst === mappedSecond);
const mappedIndexDescriptor = Object.getOwnPropertyDescriptor(
  mappedFirst,
  "0",
);
console.log(
  mappedIndexDescriptor.value,
  mappedIndexDescriptor.writable,
  mappedIndexDescriptor.enumerable,
  mappedIndexDescriptor.configurable,
);
`,
  },
  {
    name: "mapped-arguments-hoisted-function",
    nonStrictScript: true,
    source: `
function sameName(a) {
  console.log(arguments[0] === a);
  function a() {}
  console.log(arguments[0] === a, typeof arguments[0]);
  a = 5;
  console.log(arguments[0]);
}
sameName(1);

function duplicateFormals(a, a) {
  console.log(arguments[0] === a, arguments[1] === a);
  function a() {}
  console.log(arguments[0] === a, arguments[1] === a);
  a = 9;
  console.log(arguments[0], arguments[1]);
}
duplicateFormals(1, 2);

function repeatedSameName(a) {
  console.log(arguments[0] === a);
  function a() { return "first"; }
  function a() { return "second"; }
  console.log(arguments[0] === a, a());
  a = 5;
  console.log(arguments[0]);
}
repeatedSameName(1);

function argumentsNamedFunction(a) {
  console.log(typeof arguments);
  function arguments() { return "shadowed"; }
  console.log(arguments());
}
argumentsNamedFunction(1);

function nestedBlockShadows(a) {
  console.log(arguments[0] === a);
  { function a() {} console.log(typeof a); }
  console.log(arguments[0] === a);
  a = 7;
  console.log(arguments[0]);
}
nestedBlockShadows(1);

function nonSimpleUnaffected(a = 1) {
  function a() {}
  a = 9;
  console.log(a);
}
nonSimpleUnaffected(2);

function varAndFunctionSameName(a) {
  const before = arguments[0] === a;
  function a() {}
  console.log(before, arguments[0] === a);
}
varAndFunctionSameName(3);
`,
  },
  {
    name: "unmapped-arguments-forms",
    nonStrictScript: true,
    source: `
function strictOrdinary(a, b) {
  "use strict";
  arguments[0] = 100;
  a = 200;
  console.log(arguments.length, a, b, arguments[0], arguments[1], arguments[2]);
  return arguments.length;
}
console.log(strictOrdinary(1, 2), strictOrdinary(1, 2, 3), strictOrdinary());

const holder = {
  sloppyMethod(a) {
    arguments[0] = 10;
    return a === 10;
  },
  strictMethod(a) {
    "use strict";
    arguments[0] = 10;
    return a;
  },
  patternMethod([a], b) {
    arguments[0] = 10;
    return a + ":" + b + ":" + arguments.length;
  },
};
console.log(
  holder.sloppyMethod(1),
  holder.strictMethod(1),
  holder.patternMethod([1], 2),
);

class Base {
  constructor(a) {
    this.seen = arguments.length + ":" + arguments[0] + ":" + arguments[1];
  }
  method(a) {
    arguments[0] = 5;
    return a + ":" + arguments[0];
  }
  static staticMethod() {
    return arguments.length;
  }
  *generatorMethod(a) {
    yield arguments.length;
    yield arguments[1];
  }
}
class Derived extends Base {
  constructor(a) {
    super(a);
    this.own = arguments.length + ":" + arguments[0];
  }
}
console.log(new Base(7, 8).seen, new Base().seen);
console.log(new Derived(9, 10).own, new Derived(9, 10).seen);
console.log(new Base().method(3), Base.staticMethod(1, 2, 3));
const generated = new Base().generatorMethod("g", "h");
console.log(
  generated.next().value,
  generated.next().value,
  generated.next().done,
);

class ImplicitDerived extends Base {}
console.log(new ImplicitDerived(11, 12).seen);

function* strictGenerator(a) {
  "use strict";
  arguments[0] = 20;
  yield a;
  yield arguments[0];
}
const strictGenerated = strictGenerator(1);
console.log(strictGenerated.next().value, strictGenerated.next().value);

function* patternGenerator([a], b) {
  yield arguments.length;
  arguments[0] = 30;
  yield a;
}
const patternGenerated = patternGenerator([1], 2);
console.log(patternGenerated.next().value, patternGenerated.next().value);
`,
  },
  {
    name: "unmapped-arguments-callee",
    nonStrictScript: true,
    source: `
function poison(a, b) {
  "use strict";
  const descriptor = Object.getOwnPropertyDescriptor(arguments, "callee");
  console.log(
    typeof descriptor.get,
    typeof descriptor.set,
    descriptor.get === descriptor.set,
    descriptor.enumerable,
    descriptor.configurable,
  );
  console.log(
    "value" in descriptor,
    "writable" in descriptor,
    "get" in descriptor,
    "set" in descriptor,
  );
  try { arguments.callee; console.log("read missed"); }
  catch (error) { console.log("read", error instanceof TypeError); }
  try { descriptor.set.call(arguments, 1); console.log("set missed"); }
  catch (error) { console.log("set", error instanceof TypeError); }
  try {
    Object.defineProperty(arguments, "callee", { value: 1 });
    console.log("define missed");
  } catch (error) { console.log("define", error instanceof TypeError); }
  try { delete arguments.callee; console.log("delete missed"); }
  catch (error) { console.log("delete", error instanceof TypeError); }
  return descriptor.get;
}
const first = poison(1, 2);
function poisonDefault(a = 1) {
  return Object.getOwnPropertyDescriptor(arguments, "callee").get;
}
console.log(first === poisonDefault(), first === poisonDefault(3));

function sloppyDelete(a = 1) {
  return delete arguments.callee;
}
console.log(sloppyDelete());

function mappedCallee(a) {
  const descriptor = Object.getOwnPropertyDescriptor(arguments, "callee");
  return descriptor.value === mappedCallee &&
    descriptor.writable && !descriptor.enumerable && descriptor.configurable;
}
console.log(mappedCallee(1));

function unmappedDescriptors(a, b = 2) {
  const indexed = Object.getOwnPropertyDescriptor(arguments, "0");
  const length = Object.getOwnPropertyDescriptor(arguments, "length");
  console.log(
    indexed.value, indexed.writable, indexed.enumerable, indexed.configurable,
  );
  console.log(
    length.value, length.writable, length.enumerable, length.configurable,
  );
  console.log(Object.getOwnPropertyDescriptor(arguments, "2") === undefined);
}
unmappedDescriptors(7, 8);

function snapshotIndependence(a, b) {
  "use strict";
  const captured = arguments;
  a = 1;
  console.log(captured[0], captured.length);
  captured[0] = 2;
  console.log(a, captured[0]);
  delete captured[1];
  console.log(b, captured[1], captured.length);
  return captured;
}
const firstSnapshot = snapshotIndependence(10, 20);
const secondSnapshot = snapshotIndependence(10, 20);
console.log(
  firstSnapshot === secondSnapshot,
  firstSnapshot[0],
  secondSnapshot[0],
);
`,
  },
  {
    name: "arguments-lexical-capture",
    nonStrictScript: true,
    source: `
function lexicalHost(a, b) {
  const direct = () => arguments.length + ":" + arguments[0];
  const nested = () => (() => arguments[1])();
  const shadowing = function (c) { return () => arguments[0]; };
  arguments[0] = 50;
  return direct() + " " + nested() + " " + shadowing(9)();
}
console.log(lexicalHost(1, 2));

function strictLexicalHost(a) {
  "use strict";
  const direct = () => { arguments[0] = 60; return a + ":" + arguments[0]; };
  return direct();
}
console.log(strictLexicalHost(1));

const methodHost = {
  method(a) {
    return (() => arguments[0] + ":" + arguments.length)();
  },
};
console.log(methodHost.method(3, 4));

class ArrowClass {
  constructor(a) {
    this.value = (() => arguments.length + ":" + arguments[1])();
  }
}
console.log(new ArrowClass(5, 6).value);

async function asyncOrdinary(a, b) {
  const before = arguments.length;
  await null;
  arguments[0] = 70;
  return before + ":" + a + ":" + arguments[0] + ":" + arguments[1];
}

async function asyncDefault(a = 1) {
  await null;
  return arguments.length + ":" + a + ":" + (arguments[0] === undefined);
}

async function* asyncGenerator(a) {
  yield arguments.length;
  await null;
  arguments[0] = 80;
  yield a + ":" + arguments[0];
}

function asyncArrowHost(a) {
  const arrow = async () => { await null; return arguments[0]; };
  return arrow();
}

async function main() {
  console.log(await asyncOrdinary(1, 2));
  console.log(await asyncDefault());
  const iterator = asyncGenerator(1);
  console.log((await iterator.next()).value);
  console.log((await iterator.next()).value);
  console.log(await asyncArrowHost(90));
}
main();
`,
  },
  {
    name: "arguments-declaration-interaction",
    nonStrictScript: true,
    source: `
function bodyFunctionNamed() {
  console.log(typeof arguments);
  function arguments() { return "shadowed"; }
  console.log(arguments());
}
bodyFunctionNamed(1, 2);

function bodyLexicalNamed() {
  let arguments = 5;
  console.log(arguments);
}
bodyLexicalNamed(1, 2);

function bodyLexicalTdz() {
  try { console.log(arguments); }
  catch (error) { console.log("tdz", error instanceof ReferenceError); }
  let arguments = 5;
}
bodyLexicalTdz(1, 2);

function bodyVarNamed() {
  var arguments;
  console.log(typeof arguments, arguments.length);
}
bodyVarNamed(1, 2);

function bodyVarInitialized() {
  var arguments = 5;
  console.log(arguments);
}
bodyVarInitialized(1, 2);

function bodyVarWithDefault(a = 1) {
  var arguments;
  console.log(typeof arguments, arguments.length, a);
}
bodyVarWithDefault(7, 8);

function bodyVarWithRest(...rest) {
  var arguments;
  console.log(typeof arguments, arguments.length, rest.length);
}
bodyVarWithRest(9, 10);

function explicitParameter(arguments) {
  var arguments;
  console.log(arguments);
}
explicitParameter(3);

function defaultedFormal(arguments = 1) { return arguments; }
console.log(defaultedFormal(), defaultedFormal(7));

function objectFormal({ arguments }) { return arguments; }
console.log(objectFormal({ arguments: 4 }));

function arrayFormal([arguments]) { return arguments; }
console.log(arrayFormal([3]));

function restFormal(...arguments) { return arguments.length; }
console.log(restFormal(5, 6));

function dependentFormal(first, arguments = first) { return arguments; }
console.log(dependentFormal(9));

function parameterClosure(a = () => arguments) {
  var arguments;
  arguments = 1;
  console.log(typeof a(), arguments);
}
parameterClosure();

function restBodyFunctionNamed(...rest) {
  console.log(typeof arguments, rest.length);
  function arguments() { return "rest shadowed"; }
  console.log(arguments());
}
restBodyFunctionNamed(1, 2);

class StaticBlockHost {
  static observed = 0;
  static { StaticBlockHost.observed = 1; }
}
console.log(StaticBlockHost.observed);
`,
  },
  {
    name: "arguments-iteration-and-poison",
    nonStrictScript: true,
    source: `
function fractional(a, b = 1) {
  arguments.length = 1.5;
  let count = 0;
  for (const value of arguments) count = count + 1;
  return count;
}
console.log(fractional(1, 2, 3));

function stringLength(a, b = 1) {
  arguments.length = "2";
  return [...arguments].length;
}
console.log(stringLength(1, 2, 3));

function negativeLength(a, b = 1) {
  arguments.length = -1;
  return [...arguments].length;
}
console.log(negativeLength(1, 2, 3));

function nanLength(a) {
  arguments.length = NaN;
  return [...arguments].length;
}
console.log(nanLength(1, 2));

function grownLength(a) {
  arguments.length = 4;
  const out = [...arguments];
  return out.length + ":" + out[3];
}
console.log(grownLength(1, 2));

function infiniteLength(a, b = 1) {
  arguments.length = Infinity;
  for (const value of arguments) { console.log("first", value); break; }
}
infiniteLength(7, 8);

function inheritedLength(a, b = 1) {
  delete arguments.length;
  Object.setPrototypeOf(arguments, { length: 2 });
  console.log([...arguments].length);
}
inheritedLength(9, 10, 11);

function accessorLength(a, b = 1) {
  Object.defineProperty(arguments, "length", {
    configurable: true,
    get() { throw new TypeError("length"); },
  });
  try { [...arguments]; console.log("no throw"); }
  catch (error) { console.log("abrupt", error instanceof TypeError); }
}
accessorLength(12, 13);

function shrinkingLength(a) {
  let steps = 0;
  for (const value of arguments) {
    steps = steps + 1;
    arguments.length = 1;
  }
  console.log(steps);
}
shrinkingLength(1, 2, 3);

function abruptElement(a, b = 1) {
  const iterator = arguments[Symbol.iterator]();
  Object.defineProperty(arguments, 0, {
    configurable: true,
    get() { throw new TypeError("element"); },
  });
  try { iterator.next(); console.log("no throw"); }
  catch (error) { console.log("throw", error instanceof TypeError); }
  Object.defineProperty(arguments, 0, { configurable: true, value: 42 });
  const next = iterator.next();
  console.log("after", next.done, next.value);
}
abruptElement(1, 2, 3);

function reentrantLength(a, b = 1) {
  const iterator = arguments[Symbol.iterator]();
  let depth = 0;
  Object.defineProperty(arguments, "length", {
    configurable: true,
    get() {
      depth = depth + 1;
      if (depth === 1) {
        const inner = iterator.next();
        console.log("inner", inner.done, inner.value);
      }
      return 3;
    },
  });
  const outer = iterator.next();
  console.log("outer", outer.done, outer.value);
}
reentrantLength(10, 20, 30);

function arrayAbruptElement() {
  const values = [1, 2, 3];
  const iterator = values[Symbol.iterator]();
  Object.defineProperty(values, 0, {
    configurable: true,
    get() { throw new TypeError("element"); },
  });
  try { iterator.next(); console.log("no throw"); }
  catch (error) { console.log("array throw", error instanceof TypeError); }
  Object.defineProperty(values, 0, { configurable: true, value: 9 });
  const next = iterator.next();
  console.log("array after", next.done, next.value);
}
arrayAbruptElement();

function borrowedIteration() {
  const borrowed = { 0: 42, 1: 43, length: 2, values: [][Symbol.iterator] };
  const iterator = borrowed.values();
  const out = [];
  for (let step = iterator.next(); !step.done; step = iterator.next()) {
    out.push(step.value);
  }
  console.log(out.length, out[0], out[1]);
  const empty = { values: [][Symbol.iterator], length: 0 };
  console.log([...empty.values()].length);
  const inherited = Object.create({ length: 1, 0: "proto" });
  inherited.values = [][Symbol.iterator];
  console.log([...inherited.values()][0]);
}
borrowedIteration();

function poisonShape(a, b = 1) {
  const getter = Object.getOwnPropertyDescriptor(arguments, "callee").get;
  const nameDescriptor = Object.getOwnPropertyDescriptor(getter, "name");
  const lengthDescriptor = Object.getOwnPropertyDescriptor(getter, "length");
  console.log(
    nameDescriptor.value === "",
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
  try {
    Object.defineProperty(getter, "x", { value: 1 });
    console.log("extended");
  } catch (error) { console.log("extend", error instanceof TypeError); }
  try { Object.setPrototypeOf(getter, null); console.log("reproto"); }
  catch (error) { console.log("reproto", error instanceof TypeError); }
}
poisonShape(1);

function iteratorIdentity(a, b = 1) {
  const unmapped = Object.getOwnPropertyDescriptor(arguments, Symbol.iterator);
  console.log(
    unmapped.value === [][Symbol.iterator],
    unmapped.writable,
    unmapped.enumerable,
    unmapped.configurable,
  );
}
iteratorIdentity(1);

function mappedIteration(a, b) {
  a = 20;
  console.log([...arguments][0], [...arguments].length);
}
mappedIteration(1, 2);
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
