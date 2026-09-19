import type { Fixture } from "../fixture.ts";

export const symbolIntrinsicFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "symbol-intrinsic",
    source: `
const statics = [["for", 1], ["keyFor", 1]];
for (const entry of statics) {
  const method = Symbol[entry[0]];
  const descriptor = Object.getOwnPropertyDescriptor(Symbol, entry[0]);
  console.log(
    "static metadata",
    entry[0],
    method.name,
    method.length === entry[1],
    method.prototype,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
  );
  try { new method("x"); } catch (error) {
    console.log("static constructor", entry[0], error instanceof TypeError);
  }
}

const methods = [["toString", 0], ["valueOf", 0]];
for (const entry of methods) {
  const method = Symbol.prototype[entry[0]];
  const descriptor = Object.getOwnPropertyDescriptor(
    Symbol.prototype,
    entry[0],
  );
  console.log(
    "prototype metadata",
    entry[0],
    method.name,
    method.length === entry[1],
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
  );
  try { new method(); } catch (error) {
    console.log("prototype constructor", entry[0], error instanceof TypeError);
  }
}

const descriptionDescriptor = Object.getOwnPropertyDescriptor(
  Symbol.prototype,
  "description",
);
console.log(
  "description metadata",
  descriptionDescriptor.get.name,
  descriptionDescriptor.get.length,
  descriptionDescriptor.set,
  descriptionDescriptor.enumerable,
  descriptionDescriptor.configurable,
);
const primitiveDescriptor = Object.getOwnPropertyDescriptor(
  Symbol.prototype,
  Symbol.toPrimitive,
);
console.log(
  "primitive metadata",
  primitiveDescriptor.value.name,
  primitiveDescriptor.value.length,
  primitiveDescriptor.writable,
  primitiveDescriptor.enumerable,
  primitiveDescriptor.configurable,
);
const tagDescriptor = Object.getOwnPropertyDescriptor(
  Symbol.prototype,
  Symbol.toStringTag,
);
console.log(
  "tag metadata",
  tagDescriptor.value,
  tagDescriptor.writable,
  tagDescriptor.enumerable,
  tagDescriptor.configurable,
);

const prototypeDescriptor = Object.getOwnPropertyDescriptor(
  Symbol,
  "prototype",
);
let constructible = true;
try { Reflect.construct(function () {}, [], Symbol); } catch (error) {
  constructible = false;
}
console.log(
  "constructor metadata",
  constructible,
  Object.getPrototypeOf(Symbol) === Function.prototype,
  prototypeDescriptor.value === Symbol.prototype,
  prototypeDescriptor.writable,
  prototypeDescriptor.enumerable,
  prototypeDescriptor.configurable,
  Symbol.prototype.constructor === Symbol,
);
try { new Symbol("x"); } catch (error) {
  console.log("new Symbol", error instanceof TypeError);
}
class DerivedSymbol extends Symbol {
  constructor() { super(); }
}
try { new DerivedSymbol(); } catch (error) {
  console.log("derived Symbol", error instanceof TypeError);
}
const bare = Symbol();
const empty = Symbol("");
const named = Symbol("name");
const boxed = Object(named);
console.log(
  "descriptions",
  bare.description,
  empty.description === "",
  named.description,
  boxed.description,
);
console.log(
  "methods",
  named.toString(),
  Symbol.prototype.toString.call(boxed),
  Symbol.prototype.valueOf.call(boxed) === named,
  Symbol.prototype[Symbol.toPrimitive].call(boxed, "number") === named,
);

const first = Symbol.for("shared");
const second = Symbol.for("shared");
const other = Symbol.for("other");
console.log(
  "registry",
  first === second,
  first !== other,
  Symbol.keyFor(first),
  Symbol.keyFor(Symbol("shared")),
  first.description,
  first.toString(),
);
console.log(
  "registry coercion",
  Symbol.for().description,
  Symbol.for(null).description,
  Symbol.for({ toString() { return "object-key"; } }).description,
);
const keyed = {};
keyed[first] = 1;
keyed[Symbol.for("shared")] = 2;
console.log("registry property", keyed[first], Reflect.ownKeys(keyed).length);
const mapped = new Map();
mapped.set(first, "first");
mapped.set(second, "second");
console.log("registry map", mapped.size, mapped.get(first));
console.log(
  "registry equality",
  first == second,
  Object(first) == second,
  Object.is(first, second),
  [first].includes(second),
  [first].indexOf(second),
  new Set([first, second]).size,
  Symbol.keyFor(Symbol.iterator),
  Symbol.for("").description === "",
);

const registeredKey = Symbol.for("weak");
const uniqueKey = Symbol("weak");
const weakMap = new WeakMap();
const weakSet = new WeakSet();
const registry = new FinalizationRegistry(function () {});
weakMap.set(uniqueKey, 1);
weakSet.add(uniqueKey);
console.log(
  "weak unregistered",
  weakMap.get(uniqueKey),
  weakSet.has(uniqueKey),
  new WeakRef(uniqueKey).deref() === uniqueKey,
);
console.log(
  "weak registered reads",
  weakMap.get(registeredKey),
  weakMap.has(registeredKey),
  weakMap.delete(registeredKey),
  weakSet.has(registeredKey),
  weakSet.delete(registeredKey),
);
for (const attempt of [
  function () { weakMap.set(registeredKey, 1); },
  function () { weakSet.add(registeredKey); },
  function () { new WeakRef(registeredKey); },
  function () { registry.register(registeredKey, "held"); },
  function () { registry.register(uniqueKey, "held", registeredKey); },
  function () { registry.unregister(registeredKey); },
]) {
  try { attempt(); } catch (error) {
    console.log("weak registered", error instanceof TypeError);
  }
}

for (const receiver of [undefined, null, 1, "x", {}, Symbol.prototype]) {
  try { Symbol.prototype.toString.call(receiver); } catch (error) {
    console.log("toString receiver", error instanceof TypeError);
  }
  try { Symbol.prototype.valueOf.call(receiver); } catch (error) {
    console.log("valueOf receiver", error instanceof TypeError);
  }
  try { descriptionDescriptor.get.call(receiver); } catch (error) {
    console.log("description receiver", error instanceof TypeError);
  }
}
try { Symbol.keyFor("not a symbol"); } catch (error) {
  console.log("keyFor receiver", error instanceof TypeError);
}
try { Symbol.for(Symbol("key")); } catch (error) {
  console.log("for abrupt", error instanceof TypeError);
}

const retained = Symbol.for("retained");
for (let index = 0; index < 48; index = index + 1) {
  const generated = Symbol.for("collection-" + index);
  keyed[generated] = index;
}
console.log(
  "collection",
  Symbol.for("retained") === retained,
  Symbol.keyFor(retained),
  keyed[Symbol.for("collection-47")],
);

let turn = 0;
while (turn < 2) {
  console.log("guard", Symbol.for === Symbol.for, Symbol.keyFor(first));
  if (turn === 0) Symbol.guardMarker = true;
  turn = turn + 1;
}
console.log("guard marker", Symbol.guardMarker, delete Symbol.guardMarker);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted(Symbol.keyFor(first), 3));
`,
  },
];
