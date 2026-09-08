import type { Fixture } from "../fixture.ts";

export const arrayPrototypeIteratorFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "array-prototype-iterators",
    source: `
const iteratorNames = ["entries", "keys", "values"];
for (const name of iteratorNames) {
  const method = Array.prototype[name];
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, name);
  console.log(
    "metadata",
    name,
    method.name,
    method.length,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
  );
  try { new method(); } catch (error) {
    console.log("not constructor", name, error instanceof TypeError);
  }
  for (const receiver of [undefined, null]) {
    try { method.call(receiver); } catch (error) {
      console.log("nullish receiver", name, error instanceof TypeError);
    }
  }
}
console.log(
  "iterator identity",
  Array.prototype[Symbol.iterator] === Array.prototype.values,
);

const valuesIterator = [][Symbol.iterator]();
const iteratorPrototype = Object.getPrototypeOf(valuesIterator);
const iteratorTag = Object.getOwnPropertyDescriptor(
  iteratorPrototype,
  Symbol.toStringTag,
);
console.log(
  "iterator prototype",
  iteratorPrototype === Object.getPrototypeOf([].keys()),
  iteratorPrototype === Object.getPrototypeOf([].entries()),
  iteratorPrototype.next.name,
  iteratorPrototype.next.length,
  iteratorTag.value,
  iteratorTag.writable,
  iteratorTag.enumerable,
  iteratorTag.configurable,
  Object.prototype.toString.call(valuesIterator),
  valuesIterator[Symbol.iterator]() === valuesIterator,
);
try {
  iteratorPrototype.next.call(Object.create(valuesIterator));
} catch (error) {
  console.log("iterator brand", error instanceof TypeError);
}

function printStep(label, step) {
  const value = Array.isArray(step.value)
    ? step.value[0] + ":" + String(step.value[1]) + ":" + step.value.length
    : String(step.value);
  console.log(label, value, step.done);
}

const sparse = ["a", , "c"];
for (const name of iteratorNames) {
  const iterator = sparse[name]();
  printStep(name, iterator.next());
  printStep(name, iterator.next());
  printStep(name, iterator.next());
  printStep(name, iterator.next());
}

for (const name of iteratorNames) {
  const subject = { 0: "x", 2: "z", length: 3 };
  const iterator = Array.prototype[name].call(subject);
  printStep("generic " + name, iterator.next());
  printStep("generic " + name, iterator.next());
}
const stringIterator = Array.prototype.values.call("ab");
printStep("string", stringIterator.next());
printStep("string", stringIterator.next());

const growing = [];
const growingIterator = growing.entries();
growing.push("first");
printStep("grow", growingIterator.next());
growing.push("second");
printStep("grow", growingIterator.next());
printStep("grow", growingIterator.next());
growing.push("ignored");
printStep("grow", growingIterator.next());

let keyRead = false;
const keysOnly = { length: 1 };
Object.defineProperty(keysOnly, "0", {
  get() { keyRead = true; throw new TypeError("unreachable"); },
});
printStep("key without get", Array.prototype.keys.call(keysOnly).next());
console.log("key read", keyRead);

const abrupt = { length: 2, 1: "after" };
Object.defineProperty(abrupt, "0", {
  get() { throw new TypeError("element"); },
});
const abruptIterator = Array.prototype.values.call(abrupt);
try { abruptIterator.next(); } catch (error) {
  console.log("abrupt element", error instanceof TypeError);
}
printStep("after abrupt", abruptIterator.next());

let reentering = false;
let reentrantIterator;
const reentrant = {
  0: "same",
  1: "later",
  get length() {
    if (!reentering) {
      reentering = true;
      printStep("reentrant inner", reentrantIterator.next());
    }
    return 2;
  },
};
reentrantIterator = Array.prototype.values.call(reentrant);
printStep("reentrant outer", reentrantIterator.next());
printStep("reentrant later", reentrantIterator.next());

const unscopables = Array.prototype[Symbol.unscopables];
const unscopablesDescriptor = Object.getOwnPropertyDescriptor(
  Array.prototype,
  Symbol.unscopables,
);
console.log(
  "unscopables",
  Object.getPrototypeOf(unscopables) === null,
  Object.keys(unscopables).join(","),
  unscopablesDescriptor.writable,
  unscopablesDescriptor.enumerable,
  unscopablesDescriptor.configurable,
);

/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
let turn = 0;
while (turn < 3) {
  console.log("guard", hinted("guard"));
  if (turn === 1) String.prototype.arrayIteratorFixtureMarker = 1;
  turn = turn + 1;
}
const originalIs = Object.is;
turn = 0;
while (turn < 3) {
  console.log("shape", Object.is === originalIs);
  if (turn === 1) Object.arrayIteratorFixtureMarker = 1;
  turn = turn + 1;
}
`,
  },
];
