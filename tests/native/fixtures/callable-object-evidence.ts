import type { Fixture } from "../fixture.ts";

/**
 * Static witnesses for DS-14. Each group retains the selected test262
 * inputs and observations; the node table names its exact members.
 * Source construction is never executed by an Oseo witness.
 */
const prelude = `
function equal(actual, expected) {
  if (!Object.is(actual, expected)) throw new Error("unequal observation");
}
/** @param {number} value */
function hinted(value) { return value + 1; }
equal(hinted(1), 2);
equal(hinted("x"), "x1");
function throwsType(expected, action) {
  let caught = false;
  try { action(); }
  catch (error) { caught = true; equal(error.constructor, expected); }
  equal(caught, true);
}
`;

interface WitnessGroup {
  readonly name: string;
  readonly source: string;
}

const groups: readonly WitnessGroup[] = [
  {
    name: "intrinsic-constructability",
    source: `
async function asyncDeclaration() {}
async function* asyncGeneratorDeclaration() {}
const asyncGeneratorExpression = async function* () {};
const AsyncFunction = Object.getPrototypeOf(asyncDeclaration).constructor;
const GeneratorFunction = Object.getPrototypeOf(function* () {}).constructor;
const AsyncGeneratorFunction =
  Object.getPrototypeOf(asyncGeneratorDeclaration).constructor;
for (const intrinsic of [Function, AsyncFunction, GeneratorFunction,
  AsyncGeneratorFunction]) {
  const result = Reflect.construct(function () {}, [], intrinsic);
  equal(Object.getPrototypeOf(result), intrinsic.prototype);
}
throwsType(TypeError, () => new asyncDeclaration());
equal(asyncGeneratorDeclaration instanceof AsyncGeneratorFunction, true);
equal(asyncGeneratorExpression instanceof AsyncGeneratorFunction, true);
`,
  },
  {
    name: "object-truthiness",
    source: `
for (const value of [new Object(), new String(""), new String(),
  new Boolean(true), new Boolean(false), new Boolean(), new Array(),
  new Number(), new Number(-0), new Number(0), new Number(),
  new Number(Number.NaN), new Number(-1), new Number(1),
  new Number(Number.POSITIVE_INFINITY),
  new Number(Number.NEGATIVE_INFINITY), function () {},
  new Date(), new Date(0)]) equal(Boolean(value), true);
`,
  },
  {
    name: "ordinary-call-and-construction",
    source: `
const empty = function () {};
equal(empty.constructor, Function);
equal(empty === undefined, false);
equal(Object.prototype.toString.call(empty), "[object Function]");
function plain() { var x = 1; this.y = 2; return "OK"; }
function args(arg1, arg2) {
  var x = arg1; this.y = arg2; return arg1 + arg2;
}
delete globalThis.y;
equal(typeof globalThis.y, "undefined");
equal(plain(), "OK");
equal(typeof x, "undefined");
equal(globalThis.y, 2);
delete globalThis.y;
equal(typeof globalThis.y, "undefined");
equal(args("1", 2), "12");
equal(typeof x, "undefined");
equal(globalThis.y, 2);
function Factory() { var x = 1; this.y = 2; return "OK"; }
function ArgsFactory(arg1, arg2) {
  var x = 1; this.y = arg1 + arg2; return "OK";
}
const object = new Factory();
equal(typeof object, "object");
equal(object.constructor, Factory);
equal(object.y, 2);
const withArgs = new ArgsFactory("1", 2);
equal(typeof withArgs, "object");
equal(withArgs.constructor, ArgsFactory);
equal(withArgs.y, "12");
for (const f of [function () {}, Object(function () {})])
  equal(Object.prototype.toString.call(f), "[object Function]");
for (const f of [empty, Object, String, Boolean, Number, Date, Error,
  RegExp]) equal(typeof f, "function");
`,
  },
  {
    name: "strict-restricted-properties",
    source: `
function strict() { "use strict"; }
for (const key of ["caller", "arguments"]) {
  equal(Object.prototype.hasOwnProperty.call(strict, key), false);
  throwsType(TypeError, () => strict[key]);
  throwsType(TypeError, () => { strict[key] = {}; });
}
`,
  },
  {
    name: "static-name-descriptor-partial",
    source: `
const fn = function anonymous() {};
const descriptor = Object.getOwnPropertyDescriptor(fn, "name");
equal(descriptor.value, "anonymous");
equal(descriptor.writable, false);
equal(descriptor.enumerable, false);
equal(descriptor.configurable, true);
`,
  },
  {
    name: "apply-receiver-boxing",
    source: `
function touch() { this.touched = true; return this; }
for (const value of [1, true]) {
  const returned = touch.apply(value);
  equal(typeof value.touched, "undefined");
  equal(returned.touched, true);
}
for (const value of [new Number(1), function () {}]) {
  touch.apply(value);
  equal(value.touched, true);
}
`,
  },
  {
    name: "call-receiver-boxing",
    source: `
function touch() { this.touched = true; return this; }
for (const value of [1, true]) {
  const returned = touch.call(value);
  equal(typeof value.touched, "undefined");
  equal(returned.touched, true);
}
for (const value of [new Number(1), function () {}]) {
  touch.call(value);
  equal(value.touched, true);
}
`,
  },
  {
    name: "apply-arrays",
    source: `
function first(a1, a2, a3) { this.shifted = a1; }
function second(a1, a2, a3) { this.shifted = a2; }
first.apply(null, [1]);
equal(globalThis.shifted, 1);
second.apply(null, [1, 2, 3]);
equal(globalThis.shifted, 2);
delete globalThis.shifted;
const object = {};
first.apply(object, new Array("nine", "inch", "nails"));
equal(object.shifted, "nine");
equal(typeof globalThis.shifted, "undefined");
`,
  },
  {
    name: "apply-arguments",
    source: `
function sum(a1, a2, a3) { this.shifted = a1 + a2 + a3; }
function third(a1, a2, a3) { this.shifted = a3; }
const object = {};
third.apply(object, (function () { return arguments; })("a", "b", "c"));
equal(object.shifted, "c");
equal(typeof globalThis.shifted, "undefined");
function NullFactory() { sum.apply(null, arguments); }
const nullInstance = new NullFactory("", 1, 2);
equal(globalThis.shifted, "12");
equal(typeof nullInstance.shifted, "undefined");
delete globalThis.shifted;
function ThisFactory() { sum.apply(this, arguments); }
const thisInstance = new ThisFactory("", 4, 2);
equal(thisInstance.shifted, "42");
equal(typeof globalThis.shifted, "undefined");
(function () { sum.apply(null, arguments); })("", 1, 2);
equal(globalThis.shifted, "12");
delete globalThis.shifted;
(function () { sum.apply(this, arguments); })("", 4, 2);
equal(globalThis.shifted, "42");
delete globalThis.shifted;
(function () {
  "use strict";
  equal(this, undefined);
  sum.apply(this, arguments);
})("", 4, 2);
equal(globalThis.shifted, "42");
delete globalThis.shifted;
function ObjectFactory() {
  const object = {}; sum.apply(object, arguments); return object;
}
const objectInstance = new ObjectFactory("", 1, 2);
equal(typeof globalThis.shifted, "undefined");
equal(objectInstance.shifted, "12");
const expressionObject = {};
(function () { sum.apply(expressionObject, arguments); })("", 4, 2);
equal(expressionObject.shifted, "42");
equal(typeof globalThis.shifted, "undefined");
`,
  },
  {
    name: "returned-constructor",
    source: `
function factory() { return function f() { this.p1 = 1; }; }
const applied = new (factory.apply());
equal(applied.p1, 1);
const called = new (factory.call());
equal(called.p1, 1);
`,
  },
  {
    name: "call-array-arguments",
    source: `
function first(a1, a2, a3) { this.shifted = a1; }
first.call(null, [1]);
equal(globalThis.shifted.constructor, Array);
equal(globalThis.shifted.length, 1);
equal(globalThis.shifted[0], 1);
first.call(null, [3, 2, 1]);
equal(globalThis.shifted.length, 3);
equal(globalThis.shifted[0], 3);
equal(globalThis.shifted[1], 2);
equal(globalThis.shifted[2], 1);
delete globalThis.shifted;
const object = {};
first.call(object, new Array("nine", "inch", "nails"));
equal(object.shifted.length, 3);
equal(object.shifted[0], "nine");
equal(object.shifted[1], "inch");
equal(object.shifted[2], "nails");
equal(typeof globalThis.shifted, "undefined");
`,
  },
  {
    name: "call-arguments-objects",
    source: `
function sum(a1, a2, a3) { this.shifted = a1.length + a2 + a3; }
function reverse(a1, a2, a3) { this.shifted = a3 + a2 + a1.length; }
const object = {};
reverse.call(object,
  (function () { return arguments; })("a", "b", "c", "d"), "", 2);
equal(object.shifted, "24");
equal(typeof globalThis.shifted, "undefined");
function NullFactory() { sum.call(null, arguments, "", 2); }
const nullInstance = new NullFactory("", 1, 2, "A");
equal(globalThis.shifted, "42");
equal(typeof nullInstance.shifted, "undefined");
delete globalThis.shifted;
function ThisFactory() { sum.call(this, arguments, "", 2); }
const thisInstance = new ThisFactory("", 4, 2, "A");
equal(thisInstance.shifted, "42");
equal(typeof globalThis.shifted, "undefined");
(function () { sum.call(null, arguments, "", 2); })("", 1, 2, true);
equal(globalThis.shifted, "42");
delete globalThis.shifted;
(function () { sum.call(this, arguments, "", 2); })("", 4, 2, null);
equal(globalThis.shifted, "42");
delete globalThis.shifted;
(function () {
  "use strict";
  equal(this, undefined);
  sum.call(this, arguments, "", 2);
})("", 4, 2, null);
equal(globalThis.shifted, "42");
delete globalThis.shifted;
function ObjectFactory() {
  const object = {};
  function middle(a1, a2, a3) { this.shifted = a1 + a2.length + a3; }
  middle.call(object, "", arguments, 2);
  return object;
}
const objectInstance = new ObjectFactory("", 1, 2, void 0);
equal(typeof globalThis.shifted, "undefined");
equal(objectInstance.shifted, "42");
const expressionObject = {};
(function () { sum.call(expressionObject, arguments, "", "2"); })
  ("", 4, 2, "a");
equal(expressionObject.shifted, "42");
equal(typeof globalThis.shifted, "undefined");
`,
  },
  {
    name: "callable-descriptors",
    source: `
const fn = function () { return 42; };
const desc = Object.getOwnPropertyDescriptor(fn, "length");
equal(desc.writable, false);
equal(desc.enumerable, false);
equal(desc.configurable, true);
equal(Object.prototype.hasOwnProperty.call(desc, "get"), false);
equal(Object.prototype.hasOwnProperty.call(desc, "set"), false);
equal(Object.getOwnPropertyDescriptor(fn,
  "functionNameHopefullyDoesNotExist"), undefined);
`,
  },
  {
    name: "seal-callables",
    source: `
for (const fn of [async () => {}, async function () {},
  async function* () {}, function* () {}]) {
  equal(Object.seal(fn), fn);
  equal(Object.isSealed(fn), true);
  equal(Object.isExtensible(fn), false);
  for (const key of Reflect.ownKeys(fn))
    equal(Object.getOwnPropertyDescriptor(fn, key).configurable, false);
}
`,
  },
  {
    name: "reflect-apply-array-like",
    source: `
let count = 0;
function fn(...args) { count++; return args; }
for (const input of [function () {}, new Object(), new Number(),
  new Boolean()]) {
  Object.defineProperty(input, "length", { get() { return 1; } });
  const args = Reflect.apply(fn, null, input);
  equal(args.length, 1);
  equal(args[0], undefined);
}
equal(count, 4);
`,
  },
  {
    name: "instanceof-prototypes",
    source: `
const fn = function () {};
equal(fn instanceof Function, true);
equal(fn.constructor, Function);
function Factory() { this.prop = 1; }
Factory.prototype.name = "fairy";
const instance = new Factory();
Factory.prototype = void 0;
throwsType(TypeError, () => instance instanceof Factory);
equal(instance.constructor, Factory);
equal(instance.name, "fairy");
function FakeFactory() {}
const fake = {};
equal(fake instanceof FakeFactory, false);
FakeFactory.prototype = Object.prototype;
equal(fake instanceof FakeFactory, true);
`,
  },
  {
    name: "object-literal-accessors",
    source: `
let s1 = "In getter", s2 = "In setter", s3 = "Modified by setter";
const first = { get foo() { return s1; }, set foo(arg) { return s2 = s3; } };
equal(first.foo, s1);
first.foo = 10;
equal(s2, s3);
s1 = "First getter"; s2 = "First setter"; s3 = "Second getter";
const second = {
  get foo() { return s1; }, set foo(arg) { return s2 = s3; },
  get bar() { return s3; }, set bar(arg) { s3 = arg; },
};
equal(second.foo, s1);
second.foo = 10;
equal(s2, s3);
equal(second.bar, s3);
second.bar = "Second setter";
equal(second.bar, "Second setter");
equal(({ foo: 0, foo: 1 }).foo, 1);
const overwritten = { foo: 1, get foo() {} };
equal(overwritten.foo, undefined);
`,
  },
  {
    name: "function-subclass-partial",
    source: `
class Fn extends Function { constructor() {} }
throwsType(ReferenceError, () => new Fn());
`,
  },
];

/** Fixed static Script fixtures, shared by focused and ordinary native runs. */
export const callableCases: readonly Fixture[] = groups.map((group) => ({
  name: `callable-object-${group.name}`,
  nonStrictScript: true,
  source: prelude + group.source + `console.log("ok ${group.name}");\n`,
}));
