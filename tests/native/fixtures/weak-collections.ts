import type { Fixture } from "../fixture.ts";

/*
 * Every observation here is independent of collection timing. Reference
 * engines decide when to clear a WeakRef or call a cleanup callback, so
 * those schedules are checked by the native-only observation in
 * tests/native.ts instead.
 */
export const weakCollectionFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "weak-collections",
    source: `
const constructors = [
  [WeakMap, ["delete", "get", "has", "set"]],
  [WeakSet, ["add", "delete", "has"]],
  [WeakRef, ["deref"]],
  [FinalizationRegistry, ["register", "unregister"]],
];
for (const [constructor, methodNames] of constructors) {
  const globalDescriptor = Object.getOwnPropertyDescriptor(
    this,
    constructor.name,
  );
  const prototypeDescriptor = Object.getOwnPropertyDescriptor(
    constructor,
    "prototype",
  );
  const tagDescriptor = Object.getOwnPropertyDescriptor(
    constructor.prototype,
    Symbol.toStringTag,
  );
  console.log(
    "metadata",
    constructor.name,
    typeof constructor,
    constructor.length,
    globalDescriptor.value === constructor,
    globalDescriptor.writable,
    globalDescriptor.enumerable,
    globalDescriptor.configurable,
    prototypeDescriptor.writable,
    prototypeDescriptor.enumerable,
    prototypeDescriptor.configurable,
    Object.getPrototypeOf(constructor.prototype) === Object.prototype,
    constructor.prototype.constructor === constructor,
    tagDescriptor.value,
    tagDescriptor.writable,
    tagDescriptor.enumerable,
    tagDescriptor.configurable,
  );
  for (const key of methodNames) {
    const method = constructor.prototype[key];
    const descriptor = Object.getOwnPropertyDescriptor(
      constructor.prototype,
      key,
    );
    console.log(
      "method",
      constructor.name,
      key,
      method.name,
      method.length,
      descriptor.writable,
      descriptor.enumerable,
      descriptor.configurable,
    );
    try {
      new method();
    } catch (error) {
      console.log("method not constructor", key, error instanceof TypeError);
    }
  }
  try {
    constructor();
  } catch (error) {
    console.log(
      "call without new",
      constructor.name,
      error instanceof TypeError,
    );
  }
}

const objectKey = {};
const functionKey = function () {};
const arrayKey = [];
const symbolKey = Symbol("weak");
const wellKnownKey = Symbol.iterator;
const map = new WeakMap();
console.log(
  "map set",
  map.set(objectKey, 1) === map,
  map.set(functionKey, 2) === map,
  map.set(arrayKey, 3) === map,
  map.set(symbolKey, 4) === map,
  map.set(wellKnownKey, 5) === map,
);
console.log(
  "map get",
  map.get(objectKey),
  map.get(functionKey),
  map.get(arrayKey),
  map.get(symbolKey),
  map.get(wellKnownKey),
  map.get({}),
  map.get(Symbol("weak")),
);
map.set(objectKey, "updated");
console.log("map update", map.get(objectKey), map.has(objectKey));
console.log(
  "map delete",
  map.delete(objectKey),
  map.delete(objectKey),
  map.has(objectKey),
  map.get(objectKey),
);
map.set(objectKey, "again");
console.log("map re-add", map.get(objectKey));
for (const invalid of [undefined, null, true, 1, "text", 1n]) {
  let threw = false;
  try {
    map.set(invalid, 0);
  } catch (error) {
    threw = error instanceof TypeError;
  }
  console.log(
    "map invalid",
    typeof invalid,
    threw,
    map.get(invalid),
    map.has(invalid),
    map.delete(invalid),
  );
}

const keys = [];
const table = new WeakMap();
for (let index = 0; index < 96; index = index + 1) {
  const key = { index };
  keys.push(key);
  table.set(key, { key, index });
}
let indexed = true;
for (let index = 0; index < 96; index = index + 1) {
  const entry = table.get(keys[index]);
  if (entry.key !== keys[index] || entry.index !== index) indexed = false;
  if (index % 3 === 0) table.delete(keys[index]);
}
for (let round = 0; round < 4; round = round + 1) {
  for (let index = 0; index < 96; index = index + 3) {
    table.set(keys[index], round);
    table.delete(keys[index]);
  }
}
let present = 0;
for (let index = 0; index < 96; index = index + 1) {
  if (table.has(keys[index])) present = present + 1;
  if (table.has(keys[index]) === (index % 3 === 0)) indexed = false;
}
console.log("map index", indexed, present);

const set = new WeakSet([objectKey, symbolKey]);
console.log(
  "set",
  set.has(objectKey),
  set.has(symbolKey),
  set.add(objectKey) === set,
  set.add(arrayKey) === set,
  set.has(arrayKey),
  set.delete(arrayKey),
  set.delete(arrayKey),
  set.has(arrayKey),
  set.has({}),
);
for (const invalid of [undefined, null, false, 0, "", 0n]) {
  let threw = false;
  try {
    set.add(invalid);
  } catch (error) {
    threw = error instanceof TypeError;
  }
  console.log(
    "set invalid",
    typeof invalid,
    threw,
    set.has(invalid),
    set.delete(invalid),
  );
}

let closeCount = 0;
const events = [];
function trackedIterable(values) {
  return {
    [Symbol.iterator]() {
      events.push("iterator");
      let index = 0;
      return {
        next() {
          events.push("next");
          if (index >= values.length) return { done: true };
          const value = values[index];
          index = index + 1;
          return { done: false, value };
        },
        return() {
          closeCount = closeCount + 1;
          events.push("return");
          return {};
        },
      };
    },
  };
}
const constructed = new WeakMap(
  trackedIterable([
    [objectKey, "first"],
    [symbolKey, "second"],
  ]),
);
console.log(
  "map construct",
  constructed.get(objectKey),
  constructed.get(symbolKey),
  events.join(","),
  closeCount,
);
events.length = 0;
try {
  new WeakMap(trackedIterable([[objectKey, 1], 7]));
} catch (error) {
  console.log("map entry object", error instanceof TypeError, closeCount);
}
try {
  new WeakMap(trackedIterable([[1, 1]]));
} catch (error) {
  console.log("map entry key", error instanceof TypeError, closeCount);
}
const poisonedEntry = {
  get 0() {
    throw new EvalError("entry");
  },
};
try {
  new WeakMap(trackedIterable([poisonedEntry]));
} catch (error) {
  console.log("map entry getter", error instanceof EvalError, closeCount);
}
try {
  new WeakSet(trackedIterable([objectKey, 2]));
} catch (error) {
  console.log("set value", error instanceof TypeError, closeCount);
}
const failingStep = {
  [Symbol.iterator]() {
    return {
      next() {
        throw new EvalError("step");
      },
      return() {
        closeCount = closeCount + 1;
        return {};
      },
    };
  },
};
for (const constructor of [WeakMap, WeakSet]) {
  try {
    new constructor(failingStep);
  } catch (error) {
    console.log(
      "step abrupt",
      constructor.name,
      error instanceof EvalError,
      closeCount,
    );
  }
}

let iteratorRead = 0;
const unreadIterable = {};
Object.defineProperty(unreadIterable, Symbol.iterator, {
  get() {
    iteratorRead = iteratorRead + 1;
    return function () {
      return [][Symbol.iterator]();
    };
  },
});
class BadAdderMap extends WeakMap {}
BadAdderMap.prototype.set = 0;
class BadAdderSet extends WeakSet {}
BadAdderSet.prototype.add = undefined;
for (const constructor of [BadAdderMap, BadAdderSet]) {
  try {
    new constructor(unreadIterable);
  } catch (error) {
    console.log(
      "adder before iterator",
      error instanceof TypeError,
      iteratorRead,
    );
  }
}
console.log(
  "nullish iterable",
  new BadAdderMap(null) instanceof WeakMap,
  new BadAdderSet(undefined) instanceof WeakSet,
);

const observedAdds = [];
class ObservedSet extends WeakSet {
  add(value) {
    observedAdds.push(value === objectKey ? "object" : "other");
    return super.add(value);
  }
}
const observed = new ObservedSet([objectKey, objectKey]);
console.log(
  "derived",
  observedAdds.join(","),
  observed.has(objectKey),
  Object.getPrototypeOf(observed) === ObservedSet.prototype,
);
class DerivedRef extends WeakRef {}
class DerivedRegistry extends FinalizationRegistry {}
const derivedRef = new DerivedRef(objectKey);
const derivedRegistry = new DerivedRegistry(function () {});
console.log(
  "derived instances",
  derivedRef instanceof DerivedRef,
  derivedRef.deref() === objectKey,
  derivedRegistry instanceof FinalizationRegistry,
  Object.getPrototypeOf(derivedRegistry) === DerivedRegistry.prototype,
);
function PrimitivePrototype() {}
PrimitivePrototype.prototype = 1;
const fallbackTarget = new Proxy(PrimitivePrototype, {});
console.log(
  "prototype fallback",
  Object.getPrototypeOf(Reflect.construct(WeakMap, [], fallbackTarget)) ===
    WeakMap.prototype,
  Object.getPrototypeOf(Reflect.construct(WeakSet, [], fallbackTarget)) ===
    WeakSet.prototype,
  Object.getPrototypeOf(
    Reflect.construct(WeakRef, [objectKey], fallbackTarget),
  ) === WeakRef.prototype,
  Object.getPrototypeOf(
    Reflect.construct(FinalizationRegistry, [function () {}], fallbackTarget),
  ) === FinalizationRegistry.prototype,
);
let prototypeReads = 0;
const countingTarget = new Proxy(function () {}, {
  get(target, key) {
    if (key === "prototype") prototypeReads = prototypeReads + 1;
    return target[key];
  },
});
try {
  Reflect.construct(WeakRef, [1], countingTarget);
} catch (error) {
  console.log(
    "weakref target first",
    error instanceof TypeError,
    prototypeReads,
  );
}
try {
  Reflect.construct(FinalizationRegistry, [1], countingTarget);
} catch (error) {
  console.log(
    "registry callback first",
    error instanceof TypeError,
    prototypeReads,
  );
}

const reference = new WeakRef(objectKey);
const symbolReference = new WeakRef(symbolKey);
console.log(
  "weakref",
  reference.deref() === objectKey,
  symbolReference.deref() === symbolKey,
  reference.deref() === reference.deref(),
  Object.prototype.toString.call(reference),
);
for (const invalid of [undefined, null, 1, "text"]) {
  try {
    new WeakRef(invalid);
  } catch (error) {
    console.log("weakref invalid", typeof invalid, error instanceof TypeError);
  }
}

const registry = new FinalizationRegistry(function () {});
const token = {};
const symbolToken = Symbol("token");
console.log(
  "register",
  registry.register(objectKey, "held"),
  registry.register(arrayKey, objectKey, token),
  registry.register(symbolKey, 1, symbolToken),
  registry.register(functionKey, undefined, undefined),
  registry.register(wellKnownKey, token, token),
);
console.log(
  "unregister",
  registry.unregister(token),
  registry.unregister(token),
  registry.unregister(symbolToken),
  registry.unregister({}),
);
const invalidRegistrations = [
  [1, "held"],
  [objectKey, objectKey],
  [symbolKey, symbolKey],
  [objectKey, "held", 1],
  [objectKey, "held", null],
];
for (const argumentsList of invalidRegistrations) {
  try {
    registry.register(...argumentsList);
    console.log("register accepted");
  } catch (error) {
    console.log(
      "register invalid",
      argumentsList.length,
      error instanceof TypeError,
    );
  }
}
for (const invalid of [undefined, 1, "text"]) {
  try {
    registry.unregister(invalid);
  } catch (error) {
    console.log(
      "unregister invalid",
      typeof invalid,
      error instanceof TypeError,
    );
  }
}
for (const callback of [undefined, 1, {}]) {
  try {
    new FinalizationRegistry(callback);
  } catch (error) {
    console.log(
      "registry callback",
      typeof callback,
      error instanceof TypeError,
    );
  }
}

const receivers = [{}, new Map(), new Set(), map, set, reference, registry];
const brands = [
  [WeakMap.prototype, ["delete", "get", "has", "set"], map],
  [WeakSet.prototype, ["add", "delete", "has"], set],
  [WeakRef.prototype, ["deref"], reference],
  [FinalizationRegistry.prototype, ["register", "unregister"], registry],
];
for (const [prototype, methods, own] of brands) {
  for (const methodName of methods) {
    let rejected = 0;
    for (const receiver of receivers) {
      if (receiver === own) continue;
      try {
        prototype[methodName].call(receiver, objectKey, 1);
      } catch (error) {
        if (error instanceof TypeError) rejected = rejected + 1;
      }
    }
    console.log("brand", methodName, rejected);
  }
}
console.log(
  "tags",
  Object.prototype.toString.call(map),
  Object.prototype.toString.call(set),
  Object.prototype.toString.call(registry),
);

let collected = 0;
const survivors = new WeakMap([[objectKey, "kept"]]);
const liveKeys = [];
for (let index = 0; index < 64; index = index + 1) {
  const temporaryKey = { index };
  const temporary = new WeakMap([[temporaryKey, { temporaryKey }]]);
  new WeakRef({ index });
  registry.register({ index }, index, temporaryKey);
  new WeakSet([temporaryKey]).add({ index });
  survivors.set(temporaryKey, { temporaryKey });
  if (index % 8 === 0) {
    liveKeys.push(temporaryKey);
  }
  collected = collected + temporary.get(temporaryKey).temporaryKey.index;
}
let liveEntries = 0;
for (const key of liveKeys) {
  if (survivors.get(key).temporaryKey === key) liveEntries = liveEntries + 1;
}
console.log(
  "collection pressure",
  collected,
  survivors.get(objectKey),
  liveEntries,
  registry.unregister(liveKeys[0]),
);
`,
  },
];
