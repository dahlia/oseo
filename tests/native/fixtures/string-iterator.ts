import type { Fixture } from "../fixture.ts";

export const stringIteratorFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "string-iterator",
    source: `
const method = String.prototype[Symbol.iterator];
const methodDescriptor = Object.getOwnPropertyDescriptor(
  String.prototype,
  Symbol.iterator,
);
console.log(
  "method",
  method.name,
  method.length,
  methodDescriptor.writable,
  methodDescriptor.enumerable,
  methodDescriptor.configurable,
);
try { new method(); } catch (error) {
  console.log("method not constructor", error instanceof TypeError);
}
for (const receiver of [undefined, null]) {
  try { method.call(receiver); } catch (error) {
    console.log("nullish receiver", error instanceof TypeError);
  }
}
try {
  method.call({ toString() { throw new TypeError("coercion"); } });
} catch (error) {
  console.log("abrupt coercion", error instanceof TypeError);
}

const emptyIterator = ""[Symbol.iterator]();
const iteratorPrototype = Object.getPrototypeOf(emptyIterator);
const nextDescriptor = Object.getOwnPropertyDescriptor(
  iteratorPrototype,
  "next",
);
const tagDescriptor = Object.getOwnPropertyDescriptor(
  iteratorPrototype,
  Symbol.toStringTag,
);
console.log(
  "prototype",
  Object.getPrototypeOf(iteratorPrototype) ===
    Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())),
  nextDescriptor.value.name,
  nextDescriptor.value.length,
  nextDescriptor.writable,
  nextDescriptor.enumerable,
  nextDescriptor.configurable,
  tagDescriptor.value,
  tagDescriptor.writable,
  tagDescriptor.enumerable,
  tagDescriptor.configurable,
  Object.prototype.toString.call(emptyIterator),
  emptyIterator[Symbol.iterator]() === emptyIterator,
);
for (const receiver of [{}, Object.create(emptyIterator)]) {
  try { iteratorPrototype.next.call(receiver); } catch (error) {
    console.log("next brand", error instanceof TypeError);
  }
}

function printStep(label, step) {
  const value = step.value;
  console.log(
    label,
    value === undefined ? "undefined" : value.length,
    value === undefined ? -1 : value.charCodeAt(0),
    value === undefined || value.length < 2 ? -1 : value.charCodeAt(1),
    step.done,
  );
}

const sequence = "a\\ud834\\udf06b\\ud834\\ud834\\udf06\\udf06\\ud834";
const sequenceIterator = sequence[Symbol.iterator]();
let sequenceStep;
do {
  sequenceStep = sequenceIterator.next();
  printStep("sequence", sequenceStep);
} while (!sequenceStep.done);
printStep("sequence repeated", sequenceIterator.next());

let coercions = 0;
const coercible = {
  toString() {
    coercions = coercions + 1;
    return "x🥰y";
  },
};
const coercibleIterator = method.call(coercible);
coercible.toString = function () { return "changed"; };
printStep("coercible", coercibleIterator.next());
printStep("coercible", coercibleIterator.next());
printStep("coercible", coercibleIterator.next());
console.log("coercions", coercions);
printStep("wrapper", new String("z")[Symbol.iterator]().next());

const forInObject = { ab: 1 };
for (const [first, second] in forInObject) {
  console.log("for-in destructuring", first, second);
}

const retained = "p🥰q"[Symbol.iterator]();
let allocationTurn = 0;
while (allocationTurn < 16) {
  ({ value: allocationTurn });
  allocationTurn = allocationTurn + 1;
}
printStep("retained", retained.next());
printStep("retained", retained.next());
printStep("retained", retained.next());

/** @param {string} value */
function hinted(value) {
  return value[Symbol.iterator]().next().value;
}
printStep("hint", { value: hinted("hit"), done: false });
printStep("false hint", { value: hinted(new String("miss")), done: false });
let turn = 0;
while (turn < 3) {
  printStep("guard", { value: hinted("guard"), done: false });
  if (turn === 1) String.prototype.stringIteratorFixtureMarker = 1;
  turn = turn + 1;
}
const originalIs = Object.is;
turn = 0;
while (turn < 3) {
  console.log("shape", Object.is === originalIs);
  if (turn === 1) Object.stringIteratorFixtureMarker = 1;
  turn = turn + 1;
}
`,
  },
];
