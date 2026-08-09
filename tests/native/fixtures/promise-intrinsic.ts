import type { Fixture } from "../fixture.ts";

export const promiseIntrinsicFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "promise-intrinsic",
    source: `
console.log("metadata", typeof Promise, Promise.name, Promise.length);
const prototypeDescriptor = Object.getOwnPropertyDescriptor(
  Promise,
  "prototype",
);
const resolveDescriptor = Object.getOwnPropertyDescriptor(Promise, "resolve");
const speciesDescriptor = Object.getOwnPropertyDescriptor(
  Promise,
  Symbol.species,
);
const tagDescriptor = Object.getOwnPropertyDescriptor(
  Promise.prototype,
  Symbol.toStringTag,
);
console.log(
  "descriptors",
  prototypeDescriptor.writable,
  prototypeDescriptor.enumerable,
  prototypeDescriptor.configurable,
  resolveDescriptor.writable,
  resolveDescriptor.enumerable,
  resolveDescriptor.configurable,
  typeof speciesDescriptor.get,
  speciesDescriptor.set,
  speciesDescriptor.enumerable,
  speciesDescriptor.configurable,
  tagDescriptor.value,
  tagDescriptor.writable,
  tagDescriptor.enumerable,
  tagDescriptor.configurable,
);
console.log(
  "statics",
  Promise.resolve.name,
  Promise.resolve.length,
  Promise.reject.name,
  Promise.reject.length,
  Promise.withResolvers.name,
  Promise.withResolvers.length,
  Promise.try.name,
  Promise.try.length,
  speciesDescriptor.get.name,
  speciesDescriptor.get.length,
);
console.log(
  "prototype",
  Promise.prototype.constructor === Promise,
  Object.getPrototypeOf(Promise.prototype) === Object.prototype,
  Promise.prototype.then.name,
  Promise.prototype.then.length,
  Promise.prototype.catch.name,
  Promise.prototype.catch.length,
  Promise.prototype.finally.name,
  Promise.prototype.finally.length,
);
console.log("enumerable keys", Object.keys(Promise).length);
console.log("species", Promise[Symbol.species] === Promise);
const executed = new Promise(function (resolve) { resolve(1); });
console.log(
  "instance",
  executed instanceof Promise,
  Object.getPrototypeOf(executed) === Promise.prototype,
  Object.prototype.toString.call(executed),
);
try { Promise(function () {}); } catch (error) {
  console.log("call without new", error instanceof TypeError);
}
try { new Promise(undefined); } catch (error) {
  console.log("executor not callable", error instanceof TypeError);
}
try { new Promise.resolve(1); } catch (error) {
  console.log("static not a constructor", error instanceof TypeError);
}
let executorArguments = 0;
const captured = new Promise(function (resolve, reject) {
  executorArguments = arguments.length;
  console.log(
    "executor",
    typeof resolve,
    typeof reject,
    resolve.length,
    reject.length,
    resolve.name,
    reject.name,
    this === undefined,
  );
  resolve(10);
  resolve(20);
  reject(30);
});
console.log("executor arity", executorArguments);
captured.then(function (value) {
  console.log("first settlement wins", value);
});
const thrown = new Promise(function () { throw new TypeError("boom"); });
thrown.catch(function (error) {
  console.log("executor throw", error instanceof TypeError, error.message);
});
Promise.resolve(2).then(function (value) { console.log("resolve", value); });
const already = Promise.resolve(3);
console.log("resolve identity", Promise.resolve(already) === already);
Promise.reject(new RangeError("no")).catch(function (error) {
  console.log("reject", error instanceof RangeError, error.message);
});
const thenable = {
  then(resolve) { resolve(4); },
};
Promise.resolve(thenable).then(function (value) {
  console.log("thenable", value);
});
const resolvers = Promise.withResolvers();
const resolverKeys = Object.keys(resolvers);
console.log(
  "withResolvers shape",
  resolverKeys.length,
  resolverKeys[0],
  resolverKeys[1],
  resolverKeys[2],
  resolvers.promise instanceof Promise,
  typeof resolvers.resolve,
  typeof resolvers.reject,
);
resolvers.resolve(5);
resolvers.promise.then(function (value) {
  console.log("withResolvers", value);
});
const rejectedResolvers = Promise.withResolvers();
rejectedResolvers.reject(new Error("later"));
rejectedResolvers.promise.catch(function (error) {
  console.log("withResolvers reject", error.message);
});
Promise.try(function (first, second) { return first + second; }, 6, 7).then(
  function (value) { console.log("try", value); },
);
Promise.try(function () { throw new Error("try threw"); }).catch(
  function (error) { console.log("try throw", error.message); },
);
for (const statik of ["resolve", "reject", "try", "withResolvers"]) {
  try { Promise[statik].call(undefined, 1); } catch (error) {
    console.log("non-object receiver", statik, error instanceof TypeError);
  }
  try { Promise[statik].call({}, 1); } catch (error) {
    console.log("non-constructor receiver", statik, error instanceof TypeError);
  }
}
let capabilityCalls = 0;
function Capability(executor) {
  capabilityCalls = capabilityCalls + 1;
  this.settled = executor;
  executor(function () {}, function () {});
}
const capability = Promise.resolve.call(Capability, 8);
console.log(
  "custom capability",
  capabilityCalls,
  capability instanceof Capability,
  typeof capability.settled,
);
function TwiceCapability(executor) {
  executor(function () {}, function () {});
  try { executor(function () {}, function () {}); } catch (error) {
    console.log("second executor call", error instanceof TypeError);
  }
}
Promise.resolve.call(TwiceCapability, 9);
function SilentCapability() {}
try { Promise.resolve.call(SilentCapability, 10); } catch (error) {
  console.log("missing resolving functions", error instanceof TypeError);
}
class Derived extends Promise {}
const derived = new Derived(function (resolve) { resolve(11); });
console.log(
  "subclass",
  derived instanceof Derived,
  derived instanceof Promise,
  Object.getPrototypeOf(derived) === Derived.prototype,
  Derived[Symbol.species] === Derived,
  Derived.resolve(12) instanceof Derived,
);
const derivedThen = derived.then(function (value) { return value + 1; });
console.log("subclass then", derivedThen instanceof Derived);
derivedThen.then(function (value) { console.log("subclass value", value); });
// A subclass capability is the three-slot record, so its resolving
// functions come from the executor rather than the native latch.
const derivedResolvers = Derived.withResolvers();
const derivedResolverKeys = Object.keys(derivedResolvers);
console.log(
  "subclass withResolvers",
  derivedResolverKeys[0],
  derivedResolverKeys[1],
  derivedResolverKeys[2],
  derivedResolvers.promise instanceof Derived,
);
derivedResolvers.resolve(18);
derivedResolvers.promise.then(function (value) {
  console.log("subclass withResolvers value", value);
});
const speciesHost = new Promise(function (resolve) { resolve(13); });
speciesHost.constructor = {
  [Symbol.species]: undefined,
};
console.log(
  "undefined species",
  speciesHost.then(function () {}) instanceof Promise,
);
const throwingHost = new Promise(function (resolve) { resolve(14); });
Object.defineProperty(throwingHost, "constructor", {
  configurable: true,
  get() { throw new EvalError("constructor getter"); },
});
try { throwingHost.then(function () {}); } catch (error) {
  console.log("throwing constructor", error instanceof EvalError);
}
try { throwingHost.finally(function () {}); } catch (error) {
  console.log("throwing constructor finally", error instanceof EvalError);
}
const badSpecies = new Promise(function (resolve) { resolve(15); });
badSpecies.constructor = { [Symbol.species]: 5 };
try { badSpecies.then(function () {}); } catch (error) {
  console.log("non-constructor species", error instanceof TypeError);
}
const nonObjectConstructor = new Promise(function (resolve) { resolve(16); });
nonObjectConstructor.constructor = 5;
try { nonObjectConstructor.then(function () {}); } catch (error) {
  console.log("non-object constructor", error instanceof TypeError);
}
for (const method of ["then", "catch", "finally"]) {
  try { Promise.prototype[method].call({}, function () {}); } catch (error) {
    console.log("brand check", method, error instanceof TypeError);
  }
}
Promise.resolve(17)
  .finally(function () { console.log("finally ran"); })
  .then(function (value) { console.log("finally passthrough", value); });
Promise.reject(new Error("kept"))
  .finally(function () { console.log("finally rejected ran"); })
  .catch(function (error) { console.log("finally rejected", error.message); });
`,
  },
];
