import type { Fixture } from "../fixture.ts";

export const proxyExoticObjectFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "proxy-exotic-object",
    source: `
const operations = [];
const target = Object.create({ inherited: 1 });
Object.defineProperty(target, "fixed", {
  value: 3,
  writable: false,
  enumerable: true,
  configurable: false,
});
target.open = 1;
const handler = {
  getPrototypeOf(value) {
    operations.push("getPrototypeOf");
    return Reflect.getPrototypeOf(value);
  },
  setPrototypeOf(value, prototype) {
    operations.push("setPrototypeOf");
    return Reflect.setPrototypeOf(value, prototype);
  },
  isExtensible(value) {
    operations.push("isExtensible");
    return Reflect.isExtensible(value);
  },
  preventExtensions(value) {
    operations.push("preventExtensions");
    return Reflect.preventExtensions(value);
  },
  getOwnPropertyDescriptor(value, key) {
    operations.push("getOwn:" + String(key));
    return Reflect.getOwnPropertyDescriptor(value, key);
  },
  defineProperty(value, key, descriptor) {
    operations.push("define:" + String(key));
    return Reflect.defineProperty(value, key, descriptor);
  },
  has(value, key) {
    operations.push("has:" + String(key));
    return Reflect.has(value, key);
  },
  get(value, key, receiver) {
    operations.push("get:" + String(key));
    return Reflect.get(value, key, receiver);
  },
  set(value, key, next, receiver) {
    operations.push("set:" + String(key));
    return Reflect.set(value, key, next, receiver);
  },
  deleteProperty(value, key) {
    operations.push("delete:" + String(key));
    return Reflect.deleteProperty(value, key);
  },
  ownKeys(value) {
    operations.push("ownKeys");
    return Reflect.ownKeys(value);
  },
};
const proxy = new Proxy(target, handler);
console.log(
  "properties",
  proxy.open,
  "inherited" in proxy,
  Reflect.set(proxy, "open", 2),
  Reflect.defineProperty(proxy, "added", { value: 4, enumerable: true }),
  Reflect.deleteProperty(proxy, "added"),
  Object.keys(proxy).join(","),
);
const replacement = {};
console.log(
  "object",
  Object.getPrototypeOf(proxy) === Object.getPrototypeOf(target),
  Object.setPrototypeOf(proxy, replacement) === proxy,
  Object.getPrototypeOf(target) === replacement,
  Object.isExtensible(proxy),
  Object.preventExtensions(proxy) === proxy,
  Object.isExtensible(proxy),
);
console.log("operations", operations.join("|"));

const enumerationOperations = [];
let enumerationDescriptorCalls = 0;
const secondDescriptorError = new Error("second descriptor read");
const enumerationTarget = Object.create(null);
enumerationTarget.enumerated = 1;
const enumerationProxy = new Proxy(enumerationTarget, {
  ownKeys(value) {
    enumerationOperations.push("ownKeys");
    return Reflect.ownKeys(value);
  },
  getOwnPropertyDescriptor(value, key) {
    enumerationOperations.push("getOwn:" + String(key));
    if (key === "enumerated") {
      enumerationDescriptorCalls = enumerationDescriptorCalls + 1;
      if (enumerationDescriptorCalls === 2) throw secondDescriptorError;
    }
    return Reflect.getOwnPropertyDescriptor(value, key);
  },
  getPrototypeOf(value) {
    enumerationOperations.push("getPrototypeOf");
    return Reflect.getPrototypeOf(value);
  },
});
const enumeratedKeys = [];
let enumerationThrew = false;
try {
  for (const key in enumerationProxy) enumeratedKeys.push(key);
} catch (error) {
  enumerationThrew = error === secondDescriptorError;
}
console.log(
  "for-in descriptor",
  enumeratedKeys.join(","),
  enumerationDescriptorCalls,
  enumerationThrew,
  enumerationOperations.join("|"),
);

const deletionOperations = [];
const deletionTarget = { a: 1, b: 2 };
const deletionProxy = new Proxy(deletionTarget, {
  ownKeys(value) {
    deletionOperations.push("ownKeys");
    return Reflect.ownKeys(value);
  },
  getOwnPropertyDescriptor(value, key) {
    deletionOperations.push("getOwn:" + String(key));
    return Reflect.getOwnPropertyDescriptor(value, key);
  },
  getPrototypeOf(value) {
    deletionOperations.push("getPrototypeOf");
    return Reflect.getPrototypeOf(value);
  },
});
const deletionKeys = [];
for (const key in deletionProxy) {
  deletionKeys.push(key);
  if (key === "a") delete deletionTarget.b;
}
console.log(
  "for-in deletion",
  deletionKeys.join(","),
  deletionOperations.join("|"),
);

function callable(a, b) {
  if (new.target) this.total = a + b;
  return this.base + a + b;
}
const calls = [];
const callableProxy = new Proxy(callable, {
  apply(value, receiver, argumentsList) {
    calls.push("apply:" + argumentsList.join(","));
    return Reflect.apply(value, receiver, argumentsList);
  },
  construct(value, argumentsList, newTarget) {
    calls.push("construct:" + argumentsList.join(","));
    return Reflect.construct(value, argumentsList, newTarget);
  },
});
console.log(
  "callable",
  typeof callableProxy,
  callableProxy.call({ base: 10 }, 1, 2),
  new callableProxy(3, 4).total,
  calls.join("|"),
);

const constructionOperations = [];
function ConstructionTarget(value) { this.value = value; }
const constructionPrototype = {};
const constructionProxy = new Proxy(ConstructionTarget, {
  construct(value, argumentsList, newTarget) {
    constructionOperations.push("construct");
    return Reflect.construct(value, argumentsList, newTarget);
  },
  get(value, key, receiver) {
    constructionOperations.push("get:" + String(key));
    if (key === "prototype") return constructionPrototype;
    return Reflect.get(value, key, receiver);
  },
});
const constructed = new constructionProxy(9);
const speciesOperations = [];
const speciesConstructor = new Proxy(function(length) {
  this.receivedLength = length;
}, {
  construct(value, argumentsList, newTarget) {
    speciesOperations.push("construct:" + argumentsList.join(","));
    return Reflect.construct(value, argumentsList, newTarget);
  },
  get(value, key, receiver) {
    speciesOperations.push("get:" + String(key));
    return Reflect.get(value, key, receiver);
  },
});
const speciesSource = [1, 2];
speciesSource.constructor = { [Symbol.species]: speciesConstructor };
const speciesConstructed = speciesSource.slice(0, 1);
console.log(
  "construction paths",
  constructed.value,
  Object.getPrototypeOf(constructed) === constructionPrototype,
  constructionOperations.join("|"),
  speciesConstructed.receivedLength,
  speciesOperations.join("|"),
);

const reflectConstructionCalls = [];
function ReflectConstructionTarget(a, b, c) {
  this.total = a + b + (c === undefined ? 0 : c);
}
let reflectConstructionProxy;
reflectConstructionProxy = new Proxy(ReflectConstructionTarget, {
  construct(value, argumentsList, newTarget) {
    reflectConstructionCalls.push(
      argumentsList.join(",") + ":" +
        String(newTarget === reflectConstructionProxy),
    );
    return Reflect.construct(value, argumentsList, newTarget);
  },
});
const directReflectConstruction = Reflect.construct(
  reflectConstructionProxy,
  [2, 3],
);
const onceBoundConstruction = Function.prototype.bind.call(
  reflectConstructionProxy,
  null,
  4,
);
const twiceBoundConstruction = onceBoundConstruction.bind(null, 5);
const chainedReflectConstruction = Reflect.construct(
  twiceBoundConstruction,
  [6],
);
console.log(
  "reflect proxy construction",
  directReflectConstruction.total,
  chainedReflectConstruction.total,
  reflectConstructionCalls.join("|"),
);

const bindOperations = [];
let bindState = 0;
const initialBoundPrototype = {};
const changedBoundPrototype = {};
function BindTarget(left, right) { return left + right; }
Object.defineProperty(BindTarget, "length", {
  configurable: true,
  get() {
    bindOperations.push("length getter");
    bindState = 1;
    return 2;
  },
});
const bindProxy = new Proxy(BindTarget, {
  getPrototypeOf() {
    bindOperations.push("prototype:" + String(bindState));
    return bindState === 0 ? initialBoundPrototype : changedBoundPrototype;
  },
  getOwnPropertyDescriptor(value, key) {
    bindOperations.push("descriptor:" + String(key));
    return Reflect.getOwnPropertyDescriptor(value, key);
  },
  get(value, key, receiver) {
    bindOperations.push("get:" + String(key));
    return Reflect.get(value, key, receiver);
  },
});
const orderedBound = Function.prototype.bind.call(bindProxy, null);
console.log(
  "bind order",
  Object.getPrototypeOf(orderedBound) === initialBoundPrototype,
  bindOperations.join("|"),
);

const coercionOperations = [];
const coercionProxy = new Proxy({
  [Symbol.toPrimitive](hint) {
    coercionOperations.push("call:" + hint);
    return 41;
  },
}, {
  get(value, key, receiver) {
    coercionOperations.push(
      key === Symbol.toPrimitive ? "get:toPrimitive" : "get:" + String(key),
    );
    return Reflect.get(value, key, receiver);
  },
});
console.log(
  "proxy to primitive",
  coercionProxy + 1,
  coercionOperations.join("|"),
);

const sealOperations = [];
const sealTarget = { value: 1 };
const sealProxy = new Proxy(sealTarget, {
  preventExtensions(value) {
    sealOperations.push("preventExtensions");
    return Reflect.preventExtensions(value);
  },
  ownKeys(value) {
    sealOperations.push("ownKeys");
    return Reflect.ownKeys(value);
  },
  getOwnPropertyDescriptor(value, key) {
    sealOperations.push("getOwn:" + String(key));
    return Reflect.getOwnPropertyDescriptor(value, key);
  },
  defineProperty(value, key, descriptor) {
    sealOperations.push("define:" + String(key));
    return Reflect.defineProperty(value, key, descriptor);
  },
});
Object.seal(sealProxy);
console.log(
  "proxy seal",
  Object.isSealed(sealTarget),
  sealOperations.join("|"),
);

const ownKeyReads = [];
const invalidOwnKeys = {
  length: 2,
  get 0() {
    ownKeyReads.push("zero");
    return 1;
  },
  get 1() {
    ownKeyReads.push("one");
    return "later";
  },
};
let invalidOwnKeyError = false;
try {
  Reflect.ownKeys(new Proxy({}, { ownKeys() { return invalidOwnKeys; } }));
} catch (error) {
  invalidOwnKeyError = error instanceof TypeError;
}
console.log("ownKeys validation", invalidOwnKeyError, ownKeyReads.join("|"));

const invariantCases = [
  () => new Proxy(target, { get() { return 9; } }).fixed,
  () => "fixed" in new Proxy(target, { has() { return false; } }),
  () => Reflect.deleteProperty(
    new Proxy(target, { deleteProperty() { return true; } }),
    "fixed",
  ),
  () => Reflect.ownKeys(new Proxy(target, { ownKeys() { return []; } })),
  () => Reflect.isExtensible(
    new Proxy(target, { isExtensible() { return true; } }),
  ),
];

let invariantErrors = 0;
for (const check of invariantCases) {
  try {
    check();
  } catch (error) {
    if (error instanceof TypeError) invariantErrors = invariantErrors + 1;
  }
}
console.log("invariants", invariantErrors, invariantCases.length);

const revocable = Proxy.revocable({ value: 1 }, {});
console.log("revocable", revocable.proxy.value, typeof revocable.revoke);
revocable.revoke();
revocable.revoke();
let revokedErrors = 0;
for (const check of [
  () => revocable.proxy.value,
  () => Reflect.ownKeys(revocable.proxy),
  () => Object.getPrototypeOf(revocable.proxy),
]) {
  try {
    check();
  } catch (error) {
    if (error instanceof TypeError) revokedErrors = revokedErrors + 1;
  }
}
console.log("revoked", revokedErrors);

const selfRevoking = Proxy.revocable({ value: 8 }, {
  get(value, key) {
    selfRevoking.revoke();
    return Reflect.get(value, key);
  },
});
console.log("self revoke", selfRevoking.proxy.value);
try {
  selfRevoking.proxy.value;
} catch (error) {
  console.log("self revoked", error instanceof TypeError);
}

const partialTarget = { value: 5 };
const partialProxy = new Proxy(partialTarget, {});
Object.defineProperty(partialProxy, "value", { enumerable: false });
const partialDescriptor = Object.getOwnPropertyDescriptor(
  partialTarget,
  "value",
);
console.log(
  "partial descriptor",
  partialTarget.value,
  partialDescriptor.writable,
  partialDescriptor.enumerable,
  partialDescriptor.configurable,
);

const copyProxy = new Proxy({ first: 1, second: 2 }, {});
const spreadCopy = { ...copyProxy };
const { first: excluded, ...restCopy } = copyProxy;
const assignedCopy = Object.assign({}, copyProxy);
const descriptorCopy = Object.getOwnPropertyDescriptors(copyProxy);
const definedCopy = Object.defineProperties({}, new Proxy({
  copied: { value: 3, enumerable: true },
}, {}));
console.log(
  "copies",
  spreadCopy.first,
  spreadCopy.second,
  excluded,
  restCopy.second,
  assignedCopy.first,
  descriptorCopy.second.value,
  definedCopy.copied,
);

const nestedProxy = new Proxy(new Proxy({ nested: 6 }, {}), {});
console.log("nested", nestedProxy.nested, Reflect.ownKeys(nestedProxy).length);

const arrayTarget = [];
const Species = function() {};
arrayTarget.constructor = { [Symbol.species]: Species };
const arrayProxy = new Proxy(new Proxy(arrayTarget, {}), {});
const speciesResult = Array.prototype.concat.call(arrayProxy);
const lengthProxy = new Proxy([], {
  get(value, key, receiver) {
    return key === "length" ? 2 : Reflect.get(value, key, receiver);
  },
});
console.log(
  "proxy arrays",
  Array.isArray(arrayProxy),
  Object.getPrototypeOf(speciesResult) === Species.prototype,
  [].concat(lengthProxy).length,
  [new Proxy([1, 2], {})].flat().join(","),
);

let realmRevocationError = false;
let realmRevocable;
realmRevocable = Proxy.revocable(function() {}, {
  get() {
    realmRevocable.revoke();
  },
});
try {
  new realmRevocable.proxy();
} catch (error) {
  realmRevocationError = error instanceof TypeError;
}
console.log("realm revocation", realmRevocationError);

function revokedBuiltinRealm(constructor, argumentsList) {
  const inner = Proxy.revocable(constructor, {});
  const bound = inner.proxy.bind(null);
  const outer = new Proxy(bound, {
    get(value, key, receiver) {
      return key === "prototype" ? 5 : Reflect.get(value, key, receiver);
    },
  });
  inner.revoke();
  try {
    Reflect.construct(constructor, argumentsList, outer);
  } catch (error) {
    return error instanceof TypeError;
  }
  return false;
}
console.log(
  "builtin realm revocation",
  revokedBuiltinRealm(Map, []),
  revokedBuiltinRealm(Object, []),
  revokedBuiltinRealm(Number, [1]),
  revokedBuiltinRealm(String, ["x"]),
  revokedBuiltinRealm(Error, ["x"]),
  revokedBuiltinRealm(Iterator, []),
  revokedBuiltinRealm(Array, []),
  revokedBuiltinRealm(Promise, [function() {}]),
  revokedBuiltinRealm(ArrayBuffer, [0]),
  revokedBuiltinRealm(DataView, [new ArrayBuffer(0)]),
  revokedBuiltinRealm(RegExp, []),
);

const callbackProxy = new Proxy((value) => value + 1, {});
const comparatorProxy = new Proxy((left, right) => left - right, {});
const valueOfProxy = new Proxy(() => 4, {});
let iteratorIndex = 0;
const iteratorNextProxy = new Proxy(() => ({
  done: iteratorIndex === 2,
  value: iteratorIndex = iteratorIndex + 1,
}), {});
const callableIterator = {
  [Symbol.iterator]() {
    return { next: iteratorNextProxy };
  },
};
console.log(
  "callable consumers",
  [1, 2].map(callbackProxy).join(","),
  [2, 1].sort(comparatorProxy).join(","),
  { valueOf: valueOfProxy } + 1,
  Array.from(callableIterator).join(","),
);

let iteratorPrototypeReads = 0;
const inheritedIteratorProxy = new Proxy(
  Object.assign(Object.create(Iterator.prototype), {
    next() { return { done: true }; },
  }),
  {
    getPrototypeOf(value) {
      iteratorPrototypeReads = iteratorPrototypeReads + 1;
      return Reflect.getPrototypeOf(value);
    },
  },
);
console.log(
  "iterator proxy prototype",
  Iterator.from(inheritedIteratorProxy) === inheritedIteratorProxy,
  iteratorPrototypeReads,
);
const iteratorPrototypeError = new Error("iterator prototype");
const abruptIteratorProxy = new Proxy(inheritedIteratorProxy, {
  getPrototypeOf() { throw iteratorPrototypeError; },
});
try {
  Iterator.from(abruptIteratorProxy);
} catch (error) {
  console.log("iterator proxy abrupt", error === iteratorPrototypeError);
}
Promise.resolve(3).then(new Proxy((value) => {
  console.log("promise callback", value + 1);
}, {}));

let earlyExtensibleChecks = 0;
const earlyTarget = new Proxy({}, {
  isExtensible() {
    earlyExtensibleChecks = earlyExtensibleChecks + 1;
    throw new Error("unexpected extensibility check");
  },
});
console.log(
  "early returns",
  Object.getOwnPropertyDescriptor(new Proxy({}, {
    getOwnPropertyDescriptor() { return undefined; },
  }), "missing") === undefined,
  "missing" in new Proxy(earlyTarget, { has() { return false; } }),
  Reflect.deleteProperty(new Proxy(earlyTarget, {
    deleteProperty() { return true; },
  }), "missing"),
  earlyExtensibleChecks,
);

let nonCallableError = false;
try {
  const nonCallable = new Proxy({}, { apply() { return 1; } });
  nonCallable();
} catch (error) {
  nonCallableError = error instanceof TypeError;
}
console.log(
  "tags",
  Object.prototype.toString.call(new Proxy([], {})),
  Object.prototype.toString.call(new Proxy(/x/, {})),
  nonCallableError,
);

/** @param {number} value */
function hinted(value) { return value + 1; }
console.log(
  "hints",
  hinted(1),
  hinted(new Proxy({ valueOf() { return 2; } }, {})),
);
const originalProxy = Proxy;
let guardTurn = 0;
while (guardTurn < 2) {
  console.log("guard", Proxy === originalProxy, proxy.open);
  if (guardTurn === 0) this.proxyGuardMarker = 1;
  guardTurn = guardTurn + 1;
}
const shaped = { value: 1 };
let shapeTurn = 0;
while (shapeTurn < 2) {
  console.log("shape guard", shaped.value);
  if (shapeTurn === 0) shaped.extra = 2;
  shapeTurn = shapeTurn + 1;
}
`,
  },
];

export const proxyMissingDescriptorExtensibilitySource = `
const observations = [];

function observe(kind, targetKind, abrupt) {
  const extensibilityError = new Error("nested extensibility");
  const ordinaryTarget = {};
  if (targetKind !== "absent") {
    Object.defineProperty(ordinaryTarget, "key", {
      value: 1,
      configurable: targetKind === "configurable",
    });
  }
  const nestedTarget = new Proxy(ordinaryTarget, {
    getOwnPropertyDescriptor(value, key) {
      observations.push(kind + ":target:getOwn");
      return Reflect.getOwnPropertyDescriptor(value, key);
    },
    isExtensible(value) {
      observations.push(kind + ":target:isExtensible");
      if (abrupt) throw extensibilityError;
      return Reflect.isExtensible(value);
    },
  });
  const proxy = new Proxy(nestedTarget, {
    getOwnPropertyDescriptor() {
      observations.push(kind + ":proxy:getOwn");
      return undefined;
    },
  });
  try {
    const descriptor = Object.getOwnPropertyDescriptor(proxy, "key");
    console.log(kind, "missing", descriptor === undefined);
  } catch (error) {
    console.log(
      kind,
      targetKind === "configurable" && abrupt ? "abrupt" : "invariant",
      targetKind === "configurable" && abrupt
        ? error === extensibilityError
        : error instanceof TypeError,
    );
  }
}

observe("absent", "absent", false);
observe("absent-abrupt", "absent", true);
observe("nonconfigurable", "nonconfigurable", false);
observe("nonconfigurable-abrupt", "nonconfigurable", true);
observe("configurable", "configurable", false);
observe("configurable-abrupt", "configurable", true);
console.log(observations.join("|"));
`;
