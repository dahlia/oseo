import type { Fixture } from "../fixture.ts";

export const objectOwnKeysFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "object-own-keys",
    source: `
for (const name of [
  "assign",
  "entries",
  "fromEntries",
  "getOwnPropertyNames",
  "getOwnPropertySymbols",
  "groupBy",
  "hasOwn",
  "keys",
  "values",
]) {
  const method = Object[name];
  const descriptor = Object.getOwnPropertyDescriptor(Object, name);
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
}

const firstSymbol = Symbol("first");
const secondSymbol = Symbol("second");
function render(values) {
  let text = "";
  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) text = text + ",";
    text = text + values[index];
  }
  return text;
}
const ordered = {};
ordered.z = 30;
ordered[2] = 20;
ordered[firstSymbol] = 40;
Object.defineProperty(ordered, "hidden", { value: 50 });
ordered[1] = 10;
ordered.a = 31;
ordered[secondSymbol] = 41;
console.log("keys", render(Object.keys(ordered)));
console.log("values", render(Object.values(ordered)));
for (const entry of Object.entries(ordered)) {
  console.log("entry", entry[0], entry[1]);
}
console.log("names", render(Object.getOwnPropertyNames(ordered)));
console.log(
  "symbols",
  Object.getOwnPropertySymbols(ordered)[0] === firstSymbol,
  Object.getOwnPropertySymbols(ordered)[1] === secondSymbol,
);

const changing = {};
Object.defineProperty(changing, "first", {
  enumerable: true,
  get() {
    delete changing.second;
    Object.defineProperty(changing, "third", { enumerable: false });
    return 1;
  },
});
changing.second = 2;
changing.third = 3;
console.log("changing values", render(Object.values(changing)));

const assignmentLog = [];
const assignmentSource = {};
Object.defineProperty(assignmentSource, "b", {
  enumerable: true,
  get() { assignmentLog.push("get b"); return 2; },
});
Object.defineProperty(assignmentSource, firstSymbol, {
  enumerable: true,
  get() { assignmentLog.push("get symbol"); return 3; },
});
const assignmentTarget = {
  set b(value) { assignmentLog.push("set b " + value); },
};
const assigned = Object.assign(
  assignmentTarget,
  null,
  undefined,
  { a: 1 },
  assignmentSource,
);
console.log(
  "assign",
  assigned === assignmentTarget,
  assigned.a,
  assigned[firstSymbol],
  render(assignmentLog),
);

let closed = 0;
const entriesIterable = {
  [Symbol.iterator]() {
    let index = 0;
    return {
      next() {
        index = index + 1;
        return index === 1
          ? { done: false, value: ["x", 1] }
          : index === 2
            ? { done: false, value: [firstSymbol, 2] }
            : { done: true };
      },
      return() { closed = closed + 1; return {}; },
    };
  },
};
const fromEntries = Object.fromEntries(entriesIterable);
console.log("from entries", fromEntries.x, fromEntries[firstSymbol], closed);
try {
  Object.fromEntries({
    [Symbol.iterator]() {
      return {
        next() { return { done: false, value: null }; },
        return() { closed = closed + 1; return {}; },
      };
    },
  });
} catch (error) {
  console.log("from entries close", error instanceof TypeError, closed);
}

const inherited = Object.create({ inherited: 1 });
inherited.own = 2;
console.log(
  "has own",
  Object.hasOwn(inherited, "own"),
  Object.hasOwn(inherited, "inherited"),
  Object.hasOwn("ab", 0),
);

const grouped = Object.groupBy([1, 2, 3, 4], (value, index) => {
  console.log("group callback", value, index);
  return value % 2 === 0 ? "even" : firstSymbol;
});
console.log(
  "grouped",
  Object.getPrototypeOf(grouped) === null,
  Object.keys(grouped)[0],
  render(grouped.even),
  render(grouped[firstSymbol]),
);
const groupedString = Object.groupBy("🥰💩🙏😈", (value) =>
  value < "🙏" ? "before" : "after"
);
console.log(
  "grouped string",
  render(groupedString.before),
  render(groupedString.after),
);
const stringPrototype = Object.getPrototypeOf(Object(""));
let stringIteratorReads = 0;
Object.defineProperty(stringPrototype, Symbol.iterator, {
  configurable: true,
  get: function () {
    stringIteratorReads = stringIteratorReads + 1;
    return function () {
      let done = false;
      return {
        next: function () {
          if (done) return { done: true };
          done = true;
          return { done: false, value: "replacement" };
        },
      };
    };
  },
});
const replacedStringGroups = Object.groupBy("ignored", (value) => value);
console.log(
  "grouped replaced string iterator",
  stringIteratorReads,
  render(replacedStringGroups.replacement),
);
console.log(
  "delete string iterator",
  delete stringPrototype[Symbol.iterator],
);
let deletedStringIteratorCalls = 0;
try {
  Object.groupBy("ignored", () => {
    deletedStringIteratorCalls = deletedStringIteratorCalls + 1;
    return "unreachable";
  });
} catch (error) {
  console.log(
    "grouped deleted string iterator",
    error instanceof TypeError,
    deletedStringIteratorCalls,
  );
}
const numberPrototype = Object.getPrototypeOf(Object(0));
let numberIteratorReads = 0;
Object.defineProperty(numberPrototype, Symbol.iterator, {
  configurable: true,
  get: function () {
    numberIteratorReads = numberIteratorReads + 1;
    return function () {
      let index = 0;
      return {
        next: function () {
          index = index + 1;
          if (index === 1) return { done: false, value: 2 };
          if (index === 2) return { done: false, value: 3 };
          return { done: true };
        },
      };
    };
  },
});
const numberGroups = Object.groupBy(7, (value) =>
  value % 2 === 0 ? "even" : "odd"
);
console.log(
  "grouped number iterator",
  numberIteratorReads,
  render(numberGroups.even),
  render(numberGroups.odd),
);
const numberLoopValues = [];
for (const value of 7) numberLoopValues.push(value);
console.log(
  "number for of iterator",
  numberIteratorReads,
  render(numberLoopValues),
);
delete numberPrototype[Symbol.iterator];

const booleanPrototype = Object.getPrototypeOf(Object(false));
let booleanIteratorReads = 0;
Object.defineProperty(booleanPrototype, Symbol.iterator, {
  configurable: true,
  get: function () {
    booleanIteratorReads = booleanIteratorReads + 1;
    return function () {
      let done = false;
      return {
        next: function () {
          if (done) return { done: true };
          done = true;
          return { done: false, value: ["boolean", 9] };
        },
      };
    };
  },
});
const booleanEntries = Object.fromEntries(false);
console.log(
  "from entries boolean iterator",
  booleanIteratorReads,
  booleanEntries.boolean,
);
delete booleanPrototype[Symbol.iterator];

for (const nullish of [null, undefined]) {
  try {
    Object.groupBy(nullish, () => "unreachable");
  } catch (error) {
    console.log("grouped nullish", error instanceof TypeError);
  }
  try {
    Object.fromEntries(nullish);
  } catch (error) {
    console.log("from entries nullish", error instanceof TypeError);
  }
}
for (const invalid of [null, undefined, true]) {
  try {
    for (const value of invalid) console.log("unreachable", value);
  } catch (error) {
    console.log("for of invalid", error instanceof TypeError);
  }
}

/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
const originalCharAt = String.prototype.charAt;
let guardTurn = 0;
while (guardTurn < 2) {
  console.log("guard", hinted("guard"));
  if (guardTurn === 0) String.prototype.objectOwnKeysMarker = 1;
  guardTurn = guardTurn + 1;
}
console.log("method stable", String.prototype.charAt === originalCharAt);
`,
  },
];
