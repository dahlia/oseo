import type { Fixture } from "../fixture.ts";

export const reflectNamespaceFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "reflect-namespace",
    source: `
const reflectGlobalObject = this;
const originalReflect = Reflect;
const names = [
  "apply",
  "construct",
  "defineProperty",
  "deleteProperty",
  "get",
  "getOwnPropertyDescriptor",
  "getPrototypeOf",
  "has",
  "isExtensible",
  "ownKeys",
  "preventExtensions",
  "set",
  "setPrototypeOf",
];
const lengths = [3, 2, 3, 2, 2, 2, 1, 2, 1, 1, 1, 3, 2];
let metadata = "";
for (let index = 0; index < names.length; index = index + 1) {
  const name = names[index];
  const method = Reflect[name];
  const descriptor = Object.getOwnPropertyDescriptor(Reflect, name);
  if (
    typeof method !== "function" ||
    method.name !== name ||
    method.length !== lengths[index] ||
    Object.getPrototypeOf(method) !== Function.prototype ||
    method.prototype !== undefined ||
    descriptor.writable !== true ||
    descriptor.enumerable !== false ||
    descriptor.configurable !== true
  ) {
    metadata = metadata + " " + name;
  }
  try {
    new method({});
    metadata = metadata + " new:" + name;
  } catch (error) {
    if (!(error instanceof TypeError)) metadata = metadata + " kind:" + name;
  }
}
console.log("metadata", names.length, metadata === "");
const namespaceDescriptor = Object.getOwnPropertyDescriptor(
  reflectGlobalObject,
  "Reflect",
);
console.log(
  "namespace",
  typeof Reflect,
  Object.getPrototypeOf(Reflect) === Object.prototype,
  Object.prototype.toString.call(Reflect),
  Reflect.ownKeys(Reflect).length,
  namespaceDescriptor.writable,
  namespaceDescriptor.enumerable,
  namespaceDescriptor.configurable,
);
const tagDescriptor = Object.getOwnPropertyDescriptor(
  Reflect,
  Symbol.toStringTag,
);
console.log(
  "toStringTag",
  tagDescriptor.value,
  tagDescriptor.writable,
  tagDescriptor.enumerable,
  tagDescriptor.configurable,
);
try {
  Reflect();
} catch (error) {
  console.log("not callable", error instanceof TypeError);
}

function render(values) {
  let text = "";
  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) text = text + ",";
    text = text + String(values[index]);
  }
  return text;
}

/* Every function but apply and construct requires an object target and
 * reports a TypeError for every primitive, including a symbol. */
const primitives = [undefined, null, 1, "s", true, Symbol("target")];
let targetErrors = 0;
let targetCases = 0;
for (let index = 0; index < names.length; index = index + 1) {
  const name = names[index];
  if (name === "apply" || name === "construct") continue;
  for (let inner = 0; inner < primitives.length; inner = inner + 1) {
    targetCases = targetCases + 1;
    try {
      Reflect[name](primitives[inner], "key", {});
    } catch (error) {
      if (error instanceof TypeError) targetErrors = targetErrors + 1;
    }
  }
}
console.log("object target", targetCases, targetErrors);

const accessorSymbol = Symbol("accessor");
const target = { a: 1, 2: "two", 1: "one" };
target[accessorSymbol] = 3;
Object.defineProperty(target, "hidden", { value: 4, enumerable: false });
const inherited = Object.create(target);
inherited.own = 5;
console.log(
  "own keys",
  render(Reflect.ownKeys(target).map(String)),
  render(Reflect.ownKeys(inherited).map(String)),
  render(Reflect.ownKeys([1, 2]).map(String)),
  render(Reflect.ownKeys(Object.create(null)).map(String)),
);
console.log(
  "has",
  Reflect.has(inherited, "own"),
  Reflect.has(inherited, "a"),
  Reflect.has(inherited, accessorSymbol),
  Reflect.has(inherited, "missing"),
);
console.log(
  "get",
  Reflect.get(inherited, "a"),
  Reflect.get(target, accessorSymbol),
  Reflect.get(target, "missing"),
  Reflect.get(target, 1),
);
const receiver = { a: "receiver" };
const accessorHolder = {
  get reader() { return this.a; },
  set writer(value) { this.written = value; },
};
console.log(
  "receiver",
  Reflect.get(accessorHolder, "reader", receiver),
  Reflect.set(accessorHolder, "writer", 9, receiver),
  receiver.written,
  accessorHolder.written,
);
console.log(
  "prototype",
  Reflect.getPrototypeOf(target) === Object.prototype,
  Reflect.getPrototypeOf(Object.create(null)),
  Reflect.getPrototypeOf(inherited) === target,
);

/* Every refusal the matching Object static raises as a TypeError is a
 * false result here, and the two agree on which cases refuse. */
function refusal(label, reflected, thrower) {
  let threw = false;
  try {
    thrower();
  } catch (error) {
    threw = error instanceof TypeError;
  }
  console.log("refusal", label, reflected, threw);
}
const frozen = Object.freeze({ b: 2 });
refusal(
  "define",
  Reflect.defineProperty(frozen, "b", { value: 3 }),
  () => Object.defineProperty(frozen, "b", { value: 3 }),
);
refusal(
  "define new",
  Reflect.defineProperty(frozen, "fresh", { value: 3 }),
  () => Object.defineProperty(frozen, "fresh", { value: 3 }),
);
refusal(
  "set prototype",
  Reflect.setPrototypeOf(frozen, {}),
  () => Object.setPrototypeOf(frozen, { }),
);
refusal(
  "cyclic prototype",
  (() => {
    const base = {};
    const derived = Object.create(base);
    return Reflect.setPrototypeOf(base, derived);
  })(),
  () => {
    const base = {};
    const derived = Object.create(base);
    Object.setPrototypeOf(base, derived);
  },
);
console.log(
  "delete",
  Reflect.deleteProperty(frozen, "b"),
  Reflect.deleteProperty({ c: 1 }, "c"),
  Reflect.deleteProperty({}, "missing"),
  Reflect.deleteProperty([1], "length"),
);
console.log(
  "extensible",
  Reflect.isExtensible(target),
  Reflect.preventExtensions(target),
  Reflect.isExtensible(target),
  Reflect.preventExtensions(target),
);
console.log(
  "set refused",
  Reflect.set(frozen, "b", 3),
  Reflect.set(frozen, "fresh", 3),
  Reflect.set({ get only() { return 1; } }, "only", 2),
  Reflect.set({ a: 1 }, "a", 2, 5),
);
const settable = { a: 1 };
console.log(
  "set applied",
  Reflect.set(settable, "a", 2),
  settable.a,
  Reflect.set(settable, "fresh", 3),
  settable.fresh,
);
/* ArraySetLength coerces the written value before it rechecks
 * [[Writable]], so a coercion that freezes the length still reports the
 * two hint reads and then refuses. */
const lengthArray = [1, 2, 3];
const lengthHints = [];
const lengthValue = {};
lengthValue[Symbol.toPrimitive] = function (hint) {
  lengthHints.push(hint);
  Object.defineProperty(lengthArray, "length", { writable: false });
  return 0;
};
console.log(
  "array length",
  Reflect.set(lengthArray, "length", lengthValue),
  render(lengthHints),
  lengthArray.length,
);
/* The same coercion that leaves the length unchanged reports true,
 * because ArraySetLength re-reads the descriptor it validates against
 * and a value-only descriptor asserts no other attribute. */
const sameArray = [1, 2, 3];
const sameHints = [];
const sameValue = {};
sameValue[Symbol.toPrimitive] = function (hint) {
  sameHints.push(hint);
  Object.defineProperty(sameArray, "length", { writable: false });
  return 3;
};
console.log(
  "array length unchanged",
  Reflect.set(sameArray, "length", sameValue),
  render(sameHints),
  sameArray.length,
);
/* A definition without a writable field takes the same rule; one that
 * asserts writable true against the frozen length refuses. */
function defineLength(result, writable) {
  const array = [1, 2, 3];
  const descriptor = { value: {} };
  descriptor.value[Symbol.toPrimitive] = function () {
    Object.defineProperty(array, "length", { writable: false });
    return result;
  };
  if (writable) descriptor.writable = true;
  return String(Reflect.defineProperty(array, "length", descriptor)) +
    "/" + String(array.length);
}
console.log(
  "define array length",
  defineLength(3, false),
  defineLength(0, false),
  defineLength(3, true),
);

const described = {};
Object.defineProperty(described, "data", {
  value: 1,
  writable: true,
  enumerable: false,
  configurable: true,
});
Object.defineProperty(described, "accessor", {
  get() { return 2; },
  enumerable: true,
  configurable: false,
});
const dataDescriptor = Reflect.getOwnPropertyDescriptor(described, "data");
const accessorDescriptor = Reflect.getOwnPropertyDescriptor(
  described,
  "accessor",
);
console.log(
  "descriptor",
  render(Reflect.ownKeys(dataDescriptor)),
  dataDescriptor.value,
  dataDescriptor.writable,
  render(Reflect.ownKeys(accessorDescriptor)),
  typeof accessorDescriptor.get,
  accessorDescriptor.set,
  Reflect.getOwnPropertyDescriptor(described, "missing"),
);
console.log(
  "define accessor",
  Reflect.defineProperty(described, "fresh", {
    get() { return 7; },
    configurable: true,
  }),
  described.fresh,
);

/* The key and the descriptor are converted in the specified order, and
 * an abrupt conversion is a thrown completion rather than a false one. */
const order = [];
const abruptKey = {
  toString() { order.push("key"); throw new RangeError("k"); },
};
try {
  Reflect.defineProperty(described, abruptKey, {});
} catch (error) {
  console.log("abrupt key", error instanceof RangeError, render(order));
}
try {
  Reflect.defineProperty(described, "fresh", 1);
} catch (error) {
  console.log("descriptor not object", error instanceof TypeError);
}
try {
  Reflect.get(described, { toString() { throw new RangeError("g"); } });
} catch (error) {
  console.log("abrupt get key", error instanceof RangeError);
}
try {
  Reflect.get({ get boom() { throw new RangeError("v"); } }, "boom");
} catch (error) {
  console.log("abrupt get value", error instanceof RangeError);
}
try {
  Reflect.set({ set boom(value) { throw new RangeError("s"); } }, "boom", 1);
} catch (error) {
  console.log("abrupt set value", error instanceof RangeError);
}
try {
  Reflect.setPrototypeOf({}, 1);
} catch (error) {
  console.log("prototype not object", error instanceof TypeError);
}

function collect() { return render(Array.prototype.slice.call(arguments)); }
console.log(
  "apply",
  Reflect.apply(collect, null, [1, 2, 3]),
  Reflect.apply(collect, null, []),
  Reflect.apply(collect, null, { length: 2, 0: "a", 1: "b" }),
  Reflect.apply(function () { return this.tag; }, { tag: "this" }, []),
);
try {
  Reflect.apply({}, null, []);
} catch (error) {
  console.log("apply callable", error instanceof TypeError);
}
try {
  Reflect.apply(collect, null, 1);
} catch (error) {
  console.log("apply list", error instanceof TypeError);
}
try {
  Reflect.apply(collect, null, {
    get length() { throw new RangeError("l"); },
  });
} catch (error) {
  console.log("apply abrupt length", error instanceof RangeError);
}

function Base(value) { this.value = value; this.tag = new.target.name; }
class Derived extends Base {}
const built = Reflect.construct(Base, [4]);
const retargeted = Reflect.construct(Base, [5], Derived);
console.log(
  "construct",
  built.value,
  built.tag,
  Object.getPrototypeOf(built) === Base.prototype,
  retargeted.value,
  retargeted.tag,
  Object.getPrototypeOf(retargeted) === Derived.prototype,
);
const boundBase = Base.bind(null, 6);
console.log(
  "construct bound",
  Reflect.construct(boundBase, []).value,
  Object.getPrototypeOf(Reflect.construct(boundBase, [])) === Base.prototype,
  Object.getPrototypeOf(Reflect.construct(Base, [], boundBase)) ===
    Object.prototype,
);
/* A bound target replaces the new target with its own target at every
 * layer at which the two are the same function, so a two-layer chain
 * reaches the innermost ordinary constructor. */
function Chained() { this.tag = new.target === Chained ? "inner" : "outer"; }
const chainedOnce = Chained.bind(null);
const chainedTwice = chainedOnce.bind(null);
const chained = Reflect.construct(chainedTwice, [], chainedOnce);
console.log(
  "construct bind chain",
  chained.tag,
  Object.getPrototypeOf(chained) === Chained.prototype,
);
/* Object's own [[Construct]] performs GetPrototypeFromConstructor, so a
 * bound new target's accessor prototype property is read there. */
const boundObject = Object.bind(null);
Object.defineProperty(boundObject, "prototype", {
  get() { throw new RangeError("o"); },
});
try {
  Reflect.construct(Object, [], boundObject);
} catch (error) {
  console.log("construct object prototype", error instanceof RangeError);
}
const abruptPrototype = Base.bind(null);
Object.defineProperty(abruptPrototype, "prototype", {
  get() { throw new RangeError("p"); },
});
try {
  Reflect.construct(Base, [], abruptPrototype);
} catch (error) {
  console.log("construct abrupt prototype", error instanceof RangeError);
}
/* A derived class constructor creates no receiver: 10.2.2 skips
 * OrdinaryCreateFromConstructor for [[ConstructorKind]] derived and
 * leaves both the new target's prototype read and the allocation to
 * the super() inside the body. An observable accessor on a bound new
 * target therefore runs at the super() the body reaches, and the
 * receiver carries what that read returned rather than a read taken
 * before the body started. */
const derivedOrder = [];
class DerivedBase { constructor() { derivedOrder.push("base"); } }
class DerivedChild extends DerivedBase {
  constructor() { derivedOrder.push("body"); super(); }
}
const latePrototype = { tag: "late" };
const derivedNewTarget = DerivedChild.bind(null);
Object.defineProperty(derivedNewTarget, "prototype", {
  get() { derivedOrder.push("get"); return latePrototype; },
});
const derivedInstance = Reflect.construct(DerivedChild, [], derivedNewTarget);
console.log(
  "construct derived order",
  render(derivedOrder),
  Object.getPrototypeOf(derivedInstance) === latePrototype,
);
/* Only the innermost super() that reaches a base constructor reads the
 * new target, so a chain of derived constructors reads it once. */
const chainOrder = [];
class ChainA { constructor() { chainOrder.push("a"); } }
class ChainB extends ChainA {
  constructor() { chainOrder.push("b"); super(); }
}
class ChainC extends ChainB {
  constructor() { chainOrder.push("c"); super(); }
}
const chainPrototype = { tag: "chain" };
const chainNewTarget = ChainC.bind(null);
Object.defineProperty(chainNewTarget, "prototype", {
  get() { chainOrder.push("get"); return chainPrototype; },
});
const chainInstance = Reflect.construct(ChainC, [], chainNewTarget);
console.log(
  "construct derived chain",
  render(chainOrder),
  Object.getPrototypeOf(chainInstance) === chainPrototype,
);
/* A built-in super constructor performs GetPrototypeFromConstructor at
 * its own position, so the derived body defers to it and the accessor
 * still runs exactly once. */
const builtinOrder = [];
class DerivedObject extends Object {
  constructor() { builtinOrder.push("body"); super(); }
}
const builtinPrototype = { tag: "builtin" };
const builtinNewTarget = DerivedObject.bind(null);
Object.defineProperty(builtinNewTarget, "prototype", {
  get() { builtinOrder.push("get"); return builtinPrototype; },
});
const builtinInstance = Reflect.construct(
  DerivedObject,
  [],
  builtinNewTarget,
);
console.log(
  "construct derived builtin",
  render(builtinOrder),
  Object.getPrototypeOf(builtinInstance) === builtinPrototype,
);
/* A base class constructor keeps the read before its body, so the same
 * accessor runs first. */
const baseOrder = [];
class BaseOnly { constructor() { baseOrder.push("body"); } }
const basePrototype = { tag: "base" };
const baseNewTarget = BaseOnly.bind(null);
Object.defineProperty(baseNewTarget, "prototype", {
  get() { baseOrder.push("get"); return basePrototype; },
});
const baseInstance = Reflect.construct(BaseOnly, [], baseNewTarget);
console.log(
  "construct base order",
  render(baseOrder),
  Object.getPrototypeOf(baseInstance) === basePrototype,
);
/* extends null makes the constructor derived without giving it a super
 * constructor to reach, so a body that returns an object never reads
 * the new target's prototype at all. */
const nullOrder = [];
class NullHeritage extends null {
  constructor() { nullOrder.push("body"); return { tag: "null" }; }
}
const nullNewTarget = NullHeritage.bind(null);
Object.defineProperty(nullNewTarget, "prototype", {
  get() { nullOrder.push("get"); return { tag: "unread" }; },
});
const nullInstance = Reflect.construct(NullHeritage, [], nullNewTarget);
console.log("construct null heritage", render(nullOrder), nullInstance.tag);
/* A bound derived target still resolves to the derived constructor its
 * innermost bound target names, and the bound [[Construct]] replaces
 * the defaulted new target with that constructor, so super() reads the
 * class rather than the bound function. */
const boundOrder = [];
class BoundBase { constructor() { boundOrder.push("base"); } }
class BoundChild extends BoundBase {
  constructor() { boundOrder.push("body"); super(); }
}
const boundDerived = BoundChild.bind(null);
const boundInstance = Reflect.construct(boundDerived, []);
console.log(
  "construct bound derived",
  render(boundOrder),
  Object.getPrototypeOf(boundInstance) === BoundChild.prototype,
);
/* new on a derived class reaches the same super() path, so the class
 * itself is the new target and its own prototype is what the receiver
 * carries. */
const plainOrder = [];
class PlainBase { constructor() { plainOrder.push("base"); } }
class PlainChild extends PlainBase {
  constructor() { plainOrder.push("body"); super(); }
}
const plainInstance = new PlainChild();
console.log(
  "construct derived new",
  render(plainOrder),
  Object.getPrototypeOf(plainInstance) === PlainChild.prototype,
);
const constructOrder = [];
try {
  Reflect.construct(function () {}, [], () => {});
} catch (error) {
  constructOrder.push("newTarget");
}
try {
  Reflect.construct(() => {}, []);
} catch (error) {
  constructOrder.push("target");
}
try {
  Reflect.construct(Base, 1);
} catch (error) {
  constructOrder.push("list");
}
console.log("construct rejections", render(constructOrder));
console.log(
  "construct returns",
  Reflect.construct(function () { return { replaced: true }; }, []).replaced,
  Reflect.construct(function () { return 1; }, []) instanceof Object,
);

/* %Object.prototype% is an immutable prototype exotic object, so it
 * accepts only the null prototype it already has. */
console.log(
  "immutable prototype",
  Reflect.setPrototypeOf(Object.prototype, null),
  Reflect.setPrototypeOf(Object.prototype, {}),
  Reflect.getPrototypeOf(Object.prototype),
);

/** @param {number} value */
function hinted(value) { return value + 1; }
console.log(
  "hint",
  hinted(Reflect.ownKeys({ a: 1 }).length),
  hinted(String(Reflect.has({ a: 1 }, "a"))),
);
let turn = 0;
while (turn < 2) {
  console.log(
    "guard",
    Reflect.has(target, "a"),
    Reflect.get(target, "a"),
    Reflect.apply === Reflect.apply,
  );
  if (turn === 0) reflectGlobalObject.marker = 1;
  turn = turn + 1;
}
console.log(
  "marker",
  reflectGlobalObject.marker,
  delete reflectGlobalObject.marker,
);
({ value: Reflect } = { value: 31 });
console.log("object target binding", Reflect, this.Reflect === Reflect);
[Reflect] = [32];
console.log("array target binding", Reflect, this.Reflect === Reflect);
for (Reflect of [33]) {}
console.log("for-of target binding", Reflect, this.Reflect === Reflect);
for (Reflect in { loopKey: true }) {}
console.log("for-in target binding", Reflect, this.Reflect === Reflect);
Reflect = originalReflect;
console.log("target restore", Reflect === originalReflect);
Reflect = 40;
console.log("identifier replace", Reflect, this.Reflect === Reflect);
Reflect += 2;
console.log("identifier update", Reflect++, ++Reflect, Reflect);
Reflect = originalReflect;
console.log("identifier restore", Reflect === originalReflect);
this.Reflect = 123;
console.log("global write", this.Reflect === Reflect, Reflect);
this.Reflect = originalReflect;
console.log("global restore", this.Reflect === Reflect);
console.log("global delete", delete this.Reflect, typeof Reflect);
try { Reflect; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
function strictDeletedSet() { "use strict"; Reflect = 1; }
try { strictDeletedSet(); } catch (error) {
  console.log("global deleted strict set", error instanceof ReferenceError);
}
({ value: Reflect } = { value: originalReflect });
console.log("global deleted pattern restore", this.Reflect === Reflect);
function strictDeleteDuringSet() {
  "use strict";
  Reflect = (delete reflectGlobalObject.Reflect, 5);
}
try { strictDeleteDuringSet(); } catch (error) {
  console.log("global strict set race", error instanceof ReferenceError);
}
Reflect = originalReflect;
console.log("global race restore", this.Reflect === Reflect);
`,
  },
];
