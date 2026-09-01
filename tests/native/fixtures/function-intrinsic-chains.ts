import type { Fixture } from "../fixture.ts";

/*
 * The generator, asynchronous generator, and asynchronous function
 * intrinsic chains, observed exactly as ECMAScript exposes them: through
 * Object.getPrototypeOf on a function or a generator object, and through
 * the `constructor` and `prototype` links those objects carry. The
 * reference hosts own the expected identities, so the fixture prints
 * relationships rather than object addresses.
 */
export const functionIntrinsicChainFixtures: readonly Fixture[] = [
  {
    name: "function-intrinsic-chains",
    source: `
function* generatorDeclaration(first) { yield first; }
async function asyncDeclaration(first) { return first; }
async function* asyncGeneratorDeclaration(first) { yield first; }

const generatorFunctionPrototype =
  Object.getPrototypeOf(generatorDeclaration);
const generatorFunction = generatorFunctionPrototype.constructor;
const generatorPrototype = generatorFunctionPrototype.prototype;
const asyncFunctionPrototype = Object.getPrototypeOf(asyncDeclaration);
const asyncFunction = asyncFunctionPrototype.constructor;
const asyncGeneratorFunctionPrototype =
  Object.getPrototypeOf(asyncGeneratorDeclaration);
const asyncGeneratorFunction = asyncGeneratorFunctionPrototype.constructor;
const asyncGeneratorPrototype = asyncGeneratorFunctionPrototype.prototype;
const iteratorPrototype = Object.getPrototypeOf(generatorPrototype);
const asyncIteratorPrototype = Object.getPrototypeOf(asyncGeneratorPrototype);

console.log(
  "constructors",
  typeof generatorFunction,
  generatorFunction.name,
  generatorFunction.length,
  typeof asyncFunction,
  asyncFunction.name,
  asyncFunction.length,
  typeof asyncGeneratorFunction,
  asyncGeneratorFunction.name,
  asyncGeneratorFunction.length,
);
console.log(
  "constructor prototypes",
  Object.getPrototypeOf(generatorFunction) === Function,
  Object.getPrototypeOf(asyncFunction) === Function,
  Object.getPrototypeOf(asyncGeneratorFunction) === Function,
  generatorFunction.prototype === generatorFunctionPrototype,
  asyncFunction.prototype === asyncFunctionPrototype,
  asyncGeneratorFunction.prototype === asyncGeneratorFunctionPrototype,
);
console.log(
  "prototype objects",
  typeof generatorFunctionPrototype,
  typeof asyncFunctionPrototype,
  typeof asyncGeneratorFunctionPrototype,
  Object.getPrototypeOf(generatorFunctionPrototype) === Function.prototype,
  Object.getPrototypeOf(asyncFunctionPrototype) === Function.prototype,
  Object.getPrototypeOf(asyncGeneratorFunctionPrototype) ===
    Function.prototype,
);
console.log(
  "instance prototypes",
  Object.getPrototypeOf(generatorDeclaration.prototype) ===
    generatorPrototype,
  Object.getPrototypeOf(asyncGeneratorDeclaration.prototype) ===
    asyncGeneratorPrototype,
  Object.getPrototypeOf(generatorDeclaration(1)) ===
    generatorDeclaration.prototype,
  Object.getPrototypeOf(asyncGeneratorDeclaration(1)) ===
    asyncGeneratorDeclaration.prototype,
);
console.log(
  "chain roots",
  Object.getPrototypeOf(iteratorPrototype) === Object.prototype,
  Object.getPrototypeOf(asyncIteratorPrototype) === Object.prototype,
  iteratorPrototype === Object.getPrototypeOf(
    Object.getPrototypeOf([][Symbol.iterator]()),
  ),
);
console.log(
  "back links",
  generatorPrototype.constructor === generatorFunctionPrototype,
  asyncGeneratorPrototype.constructor === asyncGeneratorFunctionPrototype,
  Object.prototype.hasOwnProperty.call(asyncFunctionPrototype, "prototype"),
  Object.prototype.hasOwnProperty.call(asyncDeclaration, "prototype"),
  Object.prototype.hasOwnProperty.call(generatorDeclaration, "prototype"),
);
console.log(
  "string tags",
  generatorFunctionPrototype[Symbol.toStringTag],
  asyncFunctionPrototype[Symbol.toStringTag],
  asyncGeneratorFunctionPrototype[Symbol.toStringTag],
  generatorPrototype[Symbol.toStringTag],
  asyncGeneratorPrototype[Symbol.toStringTag],
);
console.log(
  "object tags",
  Object.prototype.toString.call(generatorDeclaration),
  Object.prototype.toString.call(asyncDeclaration),
  Object.prototype.toString.call(asyncGeneratorDeclaration),
  Object.prototype.toString.call(generatorDeclaration(1)),
  Object.prototype.toString.call(asyncGeneratorDeclaration(1)),
  Object.prototype.toString.call(generatorFunctionPrototype),
);

function describe(label, object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (descriptor === undefined) {
    console.log(label, "absent");
    return;
  }
  console.log(
    label,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
  );
}
describe("GeneratorFunction.prototype", generatorFunction, "prototype");
describe("GeneratorFunction.length", generatorFunction, "length");
describe("GeneratorFunction.name", generatorFunction, "name");
describe("AsyncFunction.prototype", asyncFunction, "prototype");
describe("AsyncFunction.length", asyncFunction, "length");
describe("AsyncFunction.name", asyncFunction, "name");
describe(
  "AsyncGeneratorFunction.prototype",
  asyncGeneratorFunction,
  "prototype",
);
describe("GFP.constructor", generatorFunctionPrototype, "constructor");
describe("GFP.prototype", generatorFunctionPrototype, "prototype");
describe("GFP.tag", generatorFunctionPrototype, Symbol.toStringTag);
describe("AFP.constructor", asyncFunctionPrototype, "constructor");
describe("AFP.tag", asyncFunctionPrototype, Symbol.toStringTag);
describe("AFP.prototype", asyncFunctionPrototype, "prototype");
describe("AFP.length", asyncFunctionPrototype, "length");
describe("AFP.name", asyncFunctionPrototype, "name");
describe(
  "AGFP.constructor",
  asyncGeneratorFunctionPrototype,
  "constructor",
);
describe("AGFP.prototype", asyncGeneratorFunctionPrototype, "prototype");
describe("AGFP.tag", asyncGeneratorFunctionPrototype, Symbol.toStringTag);
describe("GeneratorPrototype.constructor", generatorPrototype, "constructor");
describe("GeneratorPrototype.next", generatorPrototype, "next");
describe("GeneratorPrototype.tag", generatorPrototype, Symbol.toStringTag);
describe("instance prototype", generatorDeclaration, "prototype");

console.log(
  "own keys",
  Object.keys(generatorFunctionPrototype).length,
  Object.keys(asyncFunctionPrototype).length,
  Object.keys(generatorPrototype).length,
  Object.keys(generatorFunction).length,
);
console.log(
  "extensible",
  Object.isExtensible(generatorFunction),
  Object.isExtensible(generatorFunctionPrototype),
  Object.isExtensible(asyncFunction),
  Object.isExtensible(asyncFunctionPrototype),
  Object.isExtensible(asyncGeneratorFunction),
  Object.isExtensible(asyncGeneratorFunctionPrototype),
);
console.log(
  "instances",
  generatorDeclaration instanceof generatorFunction,
  generatorDeclaration instanceof Function,
  asyncDeclaration instanceof asyncFunction,
  asyncDeclaration instanceof Function,
  asyncGeneratorDeclaration instanceof asyncGeneratorFunction,
  asyncGeneratorDeclaration instanceof Function,
);
console.log(
  "not instances",
  generatorDeclaration instanceof asyncFunction,
  asyncDeclaration instanceof generatorFunction,
  (function ordinary() {}) instanceof generatorFunction,
);

const generatorExpression = function* named(first) { yield first; };
const asyncExpression = async function named(first) { return first; };
const asyncArrow = async (first) => first;
const methods = {
  async asyncMethod() {},
  *generatorMethod() {},
  async *asyncGeneratorMethod() {},
};
class Holder {
  async instanceAsync() {}
  *instanceGenerator() {}
  static async *staticAsyncGenerator() {}
}
console.log(
  "every form",
  Object.getPrototypeOf(generatorExpression) === generatorFunctionPrototype,
  Object.getPrototypeOf(methods.generatorMethod) ===
    generatorFunctionPrototype,
  Object.getPrototypeOf(Holder.prototype.instanceGenerator) ===
    generatorFunctionPrototype,
  Object.getPrototypeOf(asyncExpression) === asyncFunctionPrototype,
  Object.getPrototypeOf(asyncArrow) === asyncFunctionPrototype,
  Object.getPrototypeOf(methods.asyncMethod) === asyncFunctionPrototype,
  Object.getPrototypeOf(Holder.prototype.instanceAsync) ===
    asyncFunctionPrototype,
  Object.getPrototypeOf(methods.asyncGeneratorMethod) ===
    asyncGeneratorFunctionPrototype,
  Object.getPrototypeOf(Holder.staticAsyncGenerator) ===
    asyncGeneratorFunctionPrototype,
);
console.log(
  "ordinary unchanged",
  Object.getPrototypeOf(function ordinary() {}) === Function.prototype,
  Object.getPrototypeOf((first) => first) === Function.prototype,
  Object.getPrototypeOf(Holder) === Function.prototype,
  Object.getPrototypeOf(describe) === Function.prototype,
);

/*
 * A shared read over three receivers whose shapes differ. The first turn
 * warms the inline cache on the generator function prototype, and the
 * later turns miss its shape and reach the compiled generic property
 * read for the asynchronous prototypes and the mutated object.
 */
const chainCarriers = [
  generatorFunctionPrototype,
  asyncFunctionPrototype,
  asyncGeneratorFunctionPrototype,
  generatorPrototype,
];
let constructorNames = "";
let index = 0;
while (index < chainCarriers.length) {
  const carrier = chainCarriers[index];
  constructorNames = constructorNames + carrier.constructor.name + ";";
  index = index + 1;
}
console.log("generic read", constructorNames);

/** @param {string} value */
function hintedName(value) { return value + "!"; }
console.log(
  "hint",
  hintedName(generatorFunction.name),
  hintedName(asyncFunction.name),
);
let falseHint = 0;
while (falseHint < 2) {
  console.log(
    "guard",
    generatorFunctionPrototype.constructor === generatorFunction,
    asyncFunctionPrototype.constructor === asyncFunction,
  );
  if (falseHint === 0) generatorFunctionPrototype.marker = 1;
  falseHint = falseHint + 1;
}
console.log(
  "marker",
  generatorFunctionPrototype.marker,
  delete generatorFunctionPrototype.marker,
  "marker" in generatorFunctionPrototype,
);

/*
 * Every intrinsic link the chains expose is an ordinary property, so a
 * program may replace one and the reflection routes observe the
 * replacement instead of a synthesized brand.
 */
const replaced = function* replaced() { yield 1; };
Object.setPrototypeOf(replaced, Function.prototype);
console.log(
  "replaced function prototype",
  Object.getPrototypeOf(replaced) === Function.prototype,
  Object.prototype.toString.call(replaced),
  replaced.constructor === Function,
);
const restored = function* restored() { yield 1; };
restored.prototype = { own: true };
const restoredGenerator = restored();
console.log(
  "replaced instance prototype",
  Object.getPrototypeOf(restoredGenerator) === restored.prototype,
  Object.getPrototypeOf(restoredGenerator).own,
  Object.prototype.toString.call(restoredGenerator),
  typeof restoredGenerator.next,
);
Object.defineProperty(generatorFunctionPrototype, Symbol.toStringTag, {
  configurable: true,
  enumerable: false,
  value: "Replaced",
  writable: false,
});
console.log(
  "replaced tag",
  Object.prototype.toString.call(generatorDeclaration),
  generatorFunctionPrototype[Symbol.toStringTag],
);
Object.defineProperty(generatorFunctionPrototype, Symbol.toStringTag, {
  configurable: true,
  enumerable: false,
  value: "GeneratorFunction",
  writable: false,
});
console.log(
  "restored tag",
  Object.prototype.toString.call(generatorDeclaration),
);

/*
 * Each prototype object is an ordinary object rather than a callable one,
 * and each constructor's own \`prototype\` is the non-configurable,
 * non-writable data property the specification requires.
 */
const prototypeObjects = [
  generatorFunctionPrototype,
  asyncFunctionPrototype,
  asyncGeneratorFunctionPrototype,
];
let notCallable = "";
let callIndex = 0;
while (callIndex < prototypeObjects.length) {
  try {
    prototypeObjects[callIndex]();
    notCallable = notCallable + "called;";
  } catch (error) {
    notCallable = notCallable + (error instanceof TypeError) + ";";
  }
  callIndex = callIndex + 1;
}
console.log("not callable", notCallable);
function strictConstructorWrite() {
  "use strict";
  generatorFunction.prototype = 1;
}
try {
  strictConstructorWrite();
  console.log("prototype write", "no throw");
} catch (error) {
  console.log("prototype write", error instanceof TypeError);
}
function strictLinkWrite() {
  "use strict";
  generatorFunctionPrototype.constructor = 1;
}
try {
  strictLinkWrite();
  console.log("link write", "no throw");
} catch (error) {
  console.log("link write", error instanceof TypeError);
}
console.log(
  "link delete",
  delete generatorFunctionPrototype.constructor,
  Object.prototype.hasOwnProperty.call(
    generatorFunctionPrototype,
    "constructor",
  ),
  generatorFunctionPrototype.constructor === Function,
);
Object.defineProperty(generatorFunctionPrototype, "constructor", {
  configurable: true,
  enumerable: false,
  value: generatorFunction,
  writable: false,
});
console.log(
  "link restore",
  generatorFunctionPrototype.constructor === generatorFunction,
  Object.getPrototypeOf(generatorDeclaration).constructor === generatorFunction,
);
console.log(
  "bound",
  Object.getPrototypeOf(generatorDeclaration.bind(null)) ===
    Function.prototype,
  typeof generatorFunction.call,
  generatorFunction.bind === Function.prototype.bind,
);

/*
 * A generator function whose \`prototype\` is replaced before the call, and
 * one whose replacement lands after it. The first selects the replacement
 * and the second leaves the object the call already produced alone,
 * because EvaluateBody reads \`prototype\` exactly once.
 */
function* beforeCall() { yield 1; }
beforeCall.prototype = { chosen: true };
const beforeCallGenerator = beforeCall();
function* afterCall() { yield 1; }
const afterCallGenerator = afterCall();
const afterCallPrototype = Object.getPrototypeOf(afterCallGenerator);
afterCall.prototype = { ignored: true };
console.log(
  "creation read",
  Object.getPrototypeOf(beforeCallGenerator) === beforeCall.prototype,
  Object.getPrototypeOf(beforeCallGenerator).chosen,
  Object.getPrototypeOf(afterCallGenerator) === afterCallPrototype,
  Object.getPrototypeOf(afterCallGenerator) === afterCall.prototype,
);

const stepped = generatorDeclaration(7);
console.log(
  "steps",
  stepped.next().value,
  stepped.next().done,
  Object.getPrototypeOf(stepped.next()) === Object.prototype,
);
const closed = generatorDeclaration(8);
console.log("close", closed.return(9).value, closed.next().done);
const thrown = generatorDeclaration(10);
try {
  thrown.throw(new TypeError("thrown"));
} catch (error) {
  console.log("throw", error instanceof TypeError, error.message);
}
asyncDeclaration(11).then((value) => {
  console.log("async value", value);
});
const asyncSteps = asyncGeneratorDeclaration(12);
asyncSteps.next().then((step) => {
  console.log("async generator step", step.value, step.done);
});
`,
  },
];
