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
  {
    globalScriptReference: true,
    name: "promise-all-and-race",
    source: `
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint fallback", hinted(1, 2), hinted("x", 2));

function printValues(label, values) {
  let text = label;
  for (let index = 0; index < values.length; index = index + 1) {
    text = text + " " +
      (values[index] === undefined ? "undefined" : values[index]);
  }
  console.log(text);
}

let emptyRaceSettled = false;
Promise.all([]).then(function (values) {
  printValues("empty all", values);
});
Promise.race([]).then(function () { emptyRaceSettled = true; });
Promise.resolve().then(function () {
  console.log("empty race pending", !emptyRaceSettled);
});

const sparse = [];
sparse.length = 3;
sparse[1] = Promise.resolve(2);
Promise.all(sparse).then(function (values) {
  printValues("sparse all", values);
});
Promise.race(sparse).then(function (value) {
  console.log("sparse race", value === undefined);
});

let settleFirst;
let settleSecond;
const ordered = Promise.all([
  new Promise(function (resolve) { settleFirst = resolve; }),
  new Promise(function (resolve) { settleSecond = resolve; }),
]);
settleSecond(20);
settleFirst(10);
ordered.then(function (values) { printValues("ordered all", values); });

let subclassResolveGets = 0;
let subclassResolveCalls = 0;
class CombinedPromise extends Promise {}
Object.defineProperty(CombinedPromise, "resolve", {
  configurable: true,
  get() {
    subclassResolveGets = subclassResolveGets + 1;
    console.log("subclass resolve get", subclassResolveGets);
    return function (value) {
      subclassResolveCalls = subclassResolveCalls + 1;
      console.log(
        "subclass resolve call",
        subclassResolveCalls,
        this === CombinedPromise,
      );
      return Promise.resolve(value);
    };
  },
});
Object.defineProperty(CombinedPromise, Symbol.species, {
  configurable: true,
  get() {
    console.log("subclass species get");
    return Promise;
  },
});
const subclassAll = CombinedPromise.all([3, Promise.resolve(4)]);
console.log("subclass aggregate", subclassAll instanceof CombinedPromise);
const subclassThen = subclassAll.then(function (values) {
  printValues("subclass values", values);
});
console.log(
  "subclass species result",
  subclassThen instanceof Promise,
  subclassThen instanceof CombinedPromise,
);

function VisibleCapability(executor) {
  console.log("visible constructor", arguments.length);
  executor(
    function (value) { console.log("visible resolve", value.length); },
    function (error) { console.log("visible reject", error.message); },
  );
}
Object.defineProperty(VisibleCapability, "resolve", {
  configurable: true,
  get() {
    console.log("visible resolve get");
    return Promise.resolve;
  },
});
Promise.all.call(VisibleCapability, []);

const resolveLookupError = new Error("resolve-get");
class ResolveLookupPromise extends Promise {}
Object.defineProperty(ResolveLookupPromise, "resolve", {
  configurable: true,
  get() {
    console.log("resolve getter abrupt");
    throw resolveLookupError;
  },
});
const untouchedIterable = {};
Object.defineProperty(untouchedIterable, Symbol.iterator, {
  get() {
    console.log("unexpected iterator get");
    throw new Error("iterator");
  },
});
ResolveLookupPromise.all(untouchedIterable).catch(function (error) {
  console.log("resolve getter rejection", error === resolveLookupError);
});

class NonCallableResolvePromise extends Promise {}
NonCallableResolvePromise.resolve = 1;
NonCallableResolvePromise.race(untouchedIterable).catch(function (error) {
  console.log("non-callable resolve", error instanceof TypeError);
});

function oneElementIterable(label) {
  let done = false;
  return {
    [Symbol.iterator]() {
      return {
        next() {
          if (done) return { value: undefined, done: true };
          done = true;
          return { value: label, done: false };
        },
        return() {
          console.log("iterator close", label);
          return {};
        },
      };
    },
  };
}

class ResolveCallPromise extends Promise {
  static resolve() { throw new Error("resolve-call"); }
}
ResolveCallPromise.all(oneElementIterable("resolve-call")).catch(
  function (error) { console.log("abrupt", error.message); },
);

class ThenGetPromise extends Promise {
  static resolve() {
    return Object.defineProperty({}, "then", {
      get() { throw new Error("then-get"); },
    });
  }
}
ThenGetPromise.race(oneElementIterable("then-get")).catch(
  function (error) { console.log("abrupt", error.message); },
);

class ThenCallPromise extends Promise {
  static resolve() {
    return { then() { throw new Error("then-call"); } };
  }
}
ThenCallPromise.all(oneElementIterable("then-call")).catch(
  function (error) { console.log("abrupt", error.message); },
);

const stepError = new Error("step");
const throwingStep = {
  [Symbol.iterator]() {
    return {
      next() { throw stepError; },
      return() { console.log("unexpected step close"); return {}; },
    };
  },
};
Promise.all(throwingStep).catch(function (error) {
  console.log("step rejection", error === stepError);
});

const valueError = new Error("value");
const throwingValue = {
  [Symbol.iterator]() {
    return {
      next() {
        return Object.defineProperty({}, "value", {
          get() { throw valueError; },
        });
      },
      return() { console.log("unexpected value close"); return {}; },
    };
  },
};
Promise.race(throwingValue).catch(function (error) {
  console.log("value rejection", error === valueError);
});

const originalCloseError = new Error("original-close");
class ClosePrecedencePromise extends Promise {
  static resolve() { throw originalCloseError; }
}
const closePrecedenceIterable = {
  [Symbol.iterator]() {
    return {
      next() { return { value: 1, done: false }; },
      get return() {
        console.log("return getter abrupt");
        throw new Error("return-get");
      },
    };
  },
};
ClosePrecedencePromise.all(closePrecedenceIterable).catch(function (error) {
  console.log("close preserves", error === originalCloseError);
});

let raceResolve;
let raceReject;
let allReject;
let firstAllFulfill;
let secondAllFulfill;
let identityResolve;
let identityReject;
function IdentityCapability(executor) {
  identityResolve = function () {};
  identityReject = function () {};
  executor(identityResolve, identityReject);
}
IdentityCapability.resolve = function (value) {
  return {
    then(fulfill, reject) {
      if (value < 3) {
        if (raceResolve === undefined) {
          raceResolve = fulfill;
          raceReject = reject;
        } else {
          console.log(
            "race callback identity",
            raceResolve === fulfill,
            raceReject === reject,
            raceResolve === identityResolve,
            raceReject === identityReject,
          );
        }
      } else if (firstAllFulfill === undefined) {
        firstAllFulfill = fulfill;
        allReject = reject;
      } else {
        secondAllFulfill = fulfill;
        console.log(
          "all callback identity",
          firstAllFulfill !== secondAllFulfill,
          allReject === reject,
          allReject === identityReject,
        );
      }
    },
  };
};
Promise.race.call(IdentityCapability, [1, 2]);
Promise.all.call(IdentityCapability, [3, 4]);

let foreignResolveCalls = 0;
function ForeignRaceCapability(executor) {
  executor(
    function (value) {
      foreignResolveCalls = foreignResolveCalls + 1;
      console.log("foreign race resolve", foreignResolveCalls, value);
    },
    function () {},
  );
}
ForeignRaceCapability.resolve = function (value) {
  return {
    then(resolve) { resolve(value); },
  };
};
Promise.race.call(ForeignRaceCapability, [5, 6]);

function AbruptForeignCapability(executor) {
  executor(
    function () { console.log("unexpected abrupt foreign resolve"); },
    function (error) { console.log("abrupt foreign reject", error.message); },
  );
}
AbruptForeignCapability.resolve = Promise.resolve;
const abruptForeignIterable = {
  [Symbol.iterator]() {
    return {
      next() { throw new Error("foreign-step"); },
      return() { console.log("unexpected foreign close"); return {}; },
    };
  },
};
Promise.all.call(AbruptForeignCapability, abruptForeignIterable);

const rejectCallError = new Error("reject-call");
function ThrowingRejectCapability(executor) {
  let rejectCalls = 0;
  executor(
    function () {},
    function () {
      rejectCalls = rejectCalls + 1;
      if (rejectCalls === 1) throw rejectCallError;
      console.log("unexpected second reject");
    },
  );
}
ThrowingRejectCapability.resolve = Promise.resolve;
try {
  Promise.all.call(ThrowingRejectCapability, abruptForeignIterable);
} catch (error) {
  console.log("reject call propagates", error === rejectCallError);
}

const originalPromiseResolve = Promise.resolve;
const firstRaceThenable = {
  then(resolve) { resolve("first-race"); },
};
Promise.resolve = function () {
  return {
    then(resolve, reject) {
      resolve(firstRaceThenable);
      reject(new Error("late-race"));
    },
  };
};
Promise.race([1]).then(
  function (value) {
    console.log("race first settlement", value === "first-race");
  },
  function () { console.log("unexpected late race rejection"); },
);
Promise.resolve = originalPromiseResolve;

let thenGetRaceResolveCalls = 0;
Promise.resolve = function () {
  const index = thenGetRaceResolveCalls;
  thenGetRaceResolveCalls = thenGetRaceResolveCalls + 1;
  if (index === 0) {
    return {
      then(resolve) {
        resolve({
          then(assimilate) {
            console.log("race then getter assimilated");
            assimilate("then-get-first");
          },
        });
      },
    };
  }
  return Object.defineProperty({}, "then", {
    get() {
      console.log("race then getter abrupt");
      throw new Error("then-get-after-settlement");
    },
  });
};
Promise.race([1, 2]).then(
  function (value) {
    console.log("race then getter first wins", value === "then-get-first");
  },
  function () { console.log("unexpected race then getter rejection"); },
);
Promise.resolve = originalPromiseResolve;

let iteratorRaceStep = 0;
Promise.resolve = function () {
  return {
    then(resolve) {
      resolve({
        then(assimilate) {
          console.log("race iterator abrupt assimilated");
          assimilate("iterator-first");
        },
      });
    },
  };
};
const settledThenAbruptIterator = {
  [Symbol.iterator]() {
    return {
      next() {
        if (iteratorRaceStep === 0) {
          iteratorRaceStep = 1;
          return { value: 1, done: false };
        }
        console.log("race iterator step abrupt");
        throw new Error("iterator-after-settlement");
      },
      return() {
        console.log("unexpected settled iterator close");
        return {};
      },
    };
  },
};
Promise.race(settledThenAbruptIterator).then(
  function (value) {
    console.log("race iterator first wins", value === "iterator-first");
  },
  function () { console.log("unexpected race iterator rejection"); },
);
Promise.resolve = originalPromiseResolve;

let lateAllReject;
const originalArrayThen = Array.prototype.then;
Array.prototype.then = function (resolve) { resolve("all-array"); };
Promise.resolve = function (value) {
  return {
    then(resolve, reject) {
      lateAllReject = reject;
      resolve(value);
    },
  };
};
const thenableArrayAll = Promise.all([1]);
lateAllReject(new Error("late-all"));
thenableArrayAll.then(
  function (value) {
    console.log("all final settlement", value === "all-array");
  },
  function () { console.log("unexpected late all rejection"); },
);
Promise.resolve = originalPromiseResolve;
if (originalArrayThen === undefined) {
  delete Array.prototype.then;
} else {
  Array.prototype.then = originalArrayThen;
}

let anyAssimilationIndex = 0;
Array.prototype.then = function (resolve) { resolve("any-array"); };
Promise.resolve = function () {
  const index = anyAssimilationIndex;
  anyAssimilationIndex = anyAssimilationIndex + 1;
  return {
    then(resolve, reject) {
      if (index === 0) {
        resolve([1]);
        reject("late-any");
      } else {
        reject("other-any");
      }
    },
  };
};
Promise.any([1, 2]).then(
  function (value) {
    console.log("any assimilation first wins", value === "any-array");
  },
  function () { console.log("unexpected any assimilation rejection"); },
);
Promise.resolve = originalPromiseResolve;
if (originalArrayThen === undefined) {
  delete Array.prototype.then;
} else {
  Array.prototype.then = originalArrayThen;
}

let anyIteratorStep = 0;
Array.prototype.then = function (resolve) { resolve("any-iterator-array"); };
Promise.resolve = function () {
  return { then(resolve) { resolve([2]); } };
};
const settledAnyThenAbruptIterator = {
  [Symbol.iterator]() {
    return {
      next() {
        if (anyIteratorStep === 0) {
          anyIteratorStep = 1;
          return { value: 1, done: false };
        }
        console.log("any iterator step abrupt");
        throw new Error("any-iterator-after-settlement");
      },
      return() {
        console.log("unexpected settled any iterator close");
        return {};
      },
    };
  },
};
Promise.any(settledAnyThenAbruptIterator).then(
  function (value) {
    console.log("any iterator first wins", value === "any-iterator-array");
  },
  function () { console.log("unexpected any iterator rejection"); },
);
Promise.resolve = originalPromiseResolve;
if (originalArrayThen === undefined) {
  delete Array.prototype.then;
} else {
  Array.prototype.then = originalArrayThen;
}

const finalResolveError = new Error("final-resolve");
function FinalResolveCapability(executor) {
  executor(
    function () { throw finalResolveError; },
    function (error) {
      console.log("final resolve rejected", error === finalResolveError);
    },
  );
}
FinalResolveCapability.resolve = Promise.resolve;
const emptyIterable = {
  [Symbol.iterator]() {
    return {
      next() {
        console.log("empty iterator done");
        return { value: undefined, done: true };
      },
      return() { console.log("unexpected final close"); return {}; },
    };
  },
};
Promise.all.call(FinalResolveCapability, emptyIterable);

setTimeout(function () {
  const setterInput = [42];
  let inheritedSetterCalls = 0;
  Object.defineProperty(Array.prototype, "0", {
    configurable: true,
    set() { inheritedSetterCalls = inheritedSetterCalls + 1; },
  });
  Promise.all(setterInput).then(
    function (values) {
      const own = Object.prototype.hasOwnProperty.call(values, "0");
      const value = values[0];
      delete Array.prototype[0];
      console.log("all data property", inheritedSetterCalls, own, value);
    },
    function () {
      delete Array.prototype[0];
      console.log("unexpected all setter rejection");
    },
  );
}, 0);

console.log(
  "settled metadata",
  Promise.allSettled.name,
  Promise.allSettled.length,
  Promise.any.name,
  Promise.any.length,
);

function printSettled(label, records) {
  let text = label;
  for (let index = 0; index < records.length; index = index + 1) {
    const record = records[index];
    const keys = Object.keys(record);
    text = text + " " + keys[0] + ":" + record.status +
      "," + keys[1] + ":" +
      (record.status === "fulfilled" ? record.value : record.reason);
  }
  console.log(text);
}

Promise.allSettled([]).then(function (records) {
  printSettled("allSettled empty", records);
});
Promise.allSettled([
  Promise.resolve(21),
  Promise.reject(22),
  23,
]).then(function (records) {
  printSettled("allSettled mixed", records);
});
Promise.any([Promise.reject(31), Promise.resolve(32), 33]).then(
  function (value) { console.log("any first fulfilled", value); },
);
Promise.any([Promise.reject(41), Promise.reject(42)]).catch(
  function (error) {
    console.log(
      "any rejected",
      error instanceof AggregateError,
      error.errors.length,
      error.errors[0],
      error.errors[1],
      Object.prototype.hasOwnProperty.call(error, "message"),
      error.message,
    );
  },
);
Promise.any([]).catch(function (error) {
  console.log(
    "any empty",
    error instanceof AggregateError,
    error.errors.length,
  );
});

class SettledPromise extends Promise {
  static get resolve() {
    console.log("settled resolve get");
    return Promise.resolve;
  }
}
const subclassSettled = SettledPromise.allSettled([51]);
const subclassAny = SettledPromise.any([52]);
console.log(
  "settled subclass",
  subclassSettled instanceof SettledPromise,
  subclassAny instanceof SettledPromise,
);

class DirectSettledPromise extends Promise {
  static resolve(value) {
    return {
      then(resolve, reject) {
        if (value < 0) {
          reject(value);
          resolve(value - 100);
        } else {
          resolve(value);
          reject(value + 100);
        }
      },
    };
  }
}
DirectSettledPromise.allSettled([61, -62]).then(function (records) {
  printSettled("allSettled first call", records);
});
DirectSettledPromise.any([-71, 72, -73]).then(
  function (value) { console.log("any first call", value); },
  function () { console.log("unexpected any rejection"); },
);

const originalArrayIterator = Array.prototype[Symbol.iterator];
let errorsIteratorReads = 0;
Object.defineProperty(Array.prototype, Symbol.iterator, {
  configurable: true,
  get() {
    errorsIteratorReads = errorsIteratorReads + 1;
    return originalArrayIterator;
  },
});
const rejectedIterable = {
  [Symbol.iterator]() {
    let index = 0;
    return {
      next() {
        index = index + 1;
        if (index === 1) {
          return { value: Promise.reject(81), done: false };
        }
        return { value: undefined, done: true };
      },
    };
  },
};
Promise.any(rejectedIterable).catch(function () {
  delete Array.prototype[Symbol.iterator];
  Array.prototype[Symbol.iterator] = originalArrayIterator;
  console.log("any errors list iterator", errorsIteratorReads);
});
`,
  },
];
