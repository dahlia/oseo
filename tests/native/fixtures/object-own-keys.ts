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
const laterStringSymbol = Symbol("later string symbol");
/* Every own-property query has to give the same answer about the virtual
 * %String.prototype% iterator, so one helper asks all of them at each
 * stage. None of these queries reads a property value, so a stage that
 * counts accessor reads stays undisturbed. */
function reflectStringIterator(label) {
  const descriptor = Object.getOwnPropertyDescriptor(
    stringPrototype,
    Symbol.iterator,
  );
  console.log(
    "string iterator reflection",
    label,
    Object.hasOwn(stringPrototype, Symbol.iterator),
    Object.prototype.hasOwnProperty.call(stringPrototype, Symbol.iterator),
    Object.prototype.propertyIsEnumerable.call(
      stringPrototype,
      Symbol.iterator,
    ),
    Symbol.iterator in stringPrototype,
    Symbol.iterator in Object(""),
    descriptor === undefined
      ? "absent"
      : "get" in descriptor
        ? "accessor"
        : "data",
    descriptor === undefined ? "absent" : descriptor.enumerable,
    descriptor === undefined ? "absent" : descriptor.configurable,
  );
}
reflectStringIterator("untouched");
const untouchedStringDescriptor = Object.getOwnPropertyDescriptor(
  stringPrototype,
  Symbol.iterator,
);
console.log(
  "untouched string iterator value",
  untouchedStringDescriptor.writable,
  // The value stays unmaterialized until the String iterator node lands,
  // so the descriptor agrees with an ordinary read rather than naming a
  // function this realm cannot yet create.
  untouchedStringDescriptor.value === stringPrototype[Symbol.iterator],
  untouchedStringDescriptor.value === Object("")[Symbol.iterator],
);
const plantedObjectIterator = function () {};
Object.prototype[Symbol.iterator] = plantedObjectIterator;
console.log(
  "untouched string iterator shadowing",
  Object.hasOwn(stringPrototype, Symbol.iterator),
  stringPrototype[Symbol.iterator] === plantedObjectIterator,
  ""[Symbol.iterator] === plantedObjectIterator,
  Object("")[Symbol.iterator] === plantedObjectIterator,
  ({})[Symbol.iterator] === plantedObjectIterator,
);
delete Object.prototype[Symbol.iterator];
let stringSymbolAccessLog = [];
Object.defineProperty(stringPrototype, Symbol.iterator, {
  enumerable: true,
});
Object.defineProperty(stringPrototype, laterStringSymbol, {
  configurable: true,
  enumerable: true,
  get() {
    stringSymbolAccessLog.push("later");
    return 42;
  },
});
const virtualStringSymbols = Object.getOwnPropertySymbols(stringPrototype);
const virtualStringDescriptor = Object.getOwnPropertyDescriptor(
  stringPrototype,
  Symbol.iterator,
);
const virtualStringDescriptors = Object.getOwnPropertyDescriptors(
  stringPrototype,
);
const virtualStringAssigned = Object.assign({}, stringPrototype);
console.log(
  "virtual string iterator reflection",
  virtualStringSymbols.length,
  virtualStringSymbols[0] === Symbol.iterator,
  virtualStringSymbols[1] === laterStringSymbol,
  Object.hasOwn(stringPrototype, Symbol.iterator),
  Object.hasOwn(virtualStringAssigned, Symbol.iterator),
  virtualStringDescriptor !== undefined,
  virtualStringDescriptor.enumerable,
  Object.hasOwn(virtualStringDescriptors, Symbol.iterator),
  virtualStringDescriptors[Symbol.iterator].enumerable,
  // The current node preserves only identity until the virtual value is
  // materialized by the later String iterator node.
  virtualStringAssigned[Symbol.iterator] ===
    stringPrototype[Symbol.iterator],
  render(stringSymbolAccessLog),
);
reflectStringIterator("enumerable");
const spreadStringPrototype = { ...stringPrototype };
console.log(
  "virtual string iterator spread",
  Object.hasOwn(spreadStringPrototype, Symbol.iterator),
  spreadStringPrototype[Symbol.iterator] ===
    stringPrototype[Symbol.iterator],
  Object.hasOwn(spreadStringPrototype, laterStringSymbol),
);
const wrapperCallbacks = [];
const groupedWrapperString = Object.groupBy(
  new String("a🥰b"),
  (value, index) => {
    wrapperCallbacks.push(index + ":" + value);
    return "all";
  },
);
console.log(
  "grouped wrapper string",
  render(wrapperCallbacks),
  render(groupedWrapperString.all),
);
/* The shared code-point step pairs a leading surrogate only with a
 * following trailing one, so a lone half stays its own element. Recording
 * code units instead of the elements themselves keeps the observation
 * independent of how each host encodes an unpaired surrogate. */
const surrogateElements = [];
Object.groupBy("\\ud800\\ud83d\\ude00\\udfff\\ud800", (value) => {
  surrogateElements.push(value.length + ":" + value.charCodeAt(0));
  return "all";
});
console.log("grouped surrogate elements", render(surrogateElements));
/* Object.fromEntries walks the same default String code points. An empty
 * String and an empty wrapper are valid empty iterables, so each must
 * build an empty object rather than report the unmaterialized default as
 * a missing iterator. A non-empty String is consumed and then fails on
 * its first primitive element, which the entry-object message separates
 * from a not-iterable failure. */
function entryObjectFailure(error) {
  return error instanceof TypeError &&
    error.message.indexOf("entry object") >= 0;
}
const emptyStringEntries = Object.fromEntries("");
const emptyWrapperEntries = Object.fromEntries(new String(""));
console.log(
  "from entries default empty string",
  Object.getOwnPropertyNames(emptyStringEntries).length,
  Object.getOwnPropertySymbols(emptyStringEntries).length,
  Object.getPrototypeOf(emptyStringEntries) === Object.prototype,
  Object.getOwnPropertyNames(emptyWrapperEntries).length,
  Object.getPrototypeOf(emptyWrapperEntries) === Object.prototype,
);
for (
  const nonEmpty of [
    "a",
    "🥰b",
    "\\ud800",
    "\\udfff\\ud800",
    new String("ab"),
    new String("🥰"),
    new String("\\ud800"),
  ]
) {
  try {
    Object.fromEntries(nonEmpty);
    console.log("from entries default string element", "no error");
  } catch (error) {
    console.log(
      "from entries default string element",
      entryObjectFailure(error),
    );
  }
}
const entryWrapper = new String("ignored");
let entryWrapperReceiverIsWrapper = false;
entryWrapper[Symbol.iterator] = function () {
  entryWrapperReceiverIsWrapper = this === entryWrapper;
  let done = false;
  return {
    next: function () {
      if (done) return { done: true };
      done = true;
      return { done: false, value: ["own", 7] };
    },
  };
};
const ownIteratorEntries = Object.fromEntries(entryWrapper);
console.log(
  "from entries own string iterator",
  Object.hasOwn(entryWrapper, Symbol.iterator),
  entryWrapperReceiverIsWrapper,
  render(Object.getOwnPropertyNames(ownIteratorEntries)),
  ownIteratorEntries.own,
);
class EntryString extends String {}
EntryString.prototype[Symbol.iterator] = function () {
  let done = false;
  return {
    next: function () {
      if (done) return { done: true };
      done = true;
      return { done: false, value: ["inherited", 9] };
    },
  };
};
const inheritedIteratorEntries = Object.fromEntries(new EntryString("ab"));
const inheritedEmptyEntries = Object.fromEntries(new EntryString(""));
console.log(
  "from entries inherited string iterator",
  render(Object.getOwnPropertyNames(inheritedIteratorEntries)),
  inheritedIteratorEntries.inherited,
  inheritedEmptyEntries.inherited,
  Object.hasOwn(stringPrototype, Symbol.iterator),
);
let stringIteratorReads = 0;
let replacementReceiverIsWrapper = false;
stringSymbolAccessLog = [];
Object.defineProperty(stringPrototype, Symbol.iterator, {
  configurable: true,
  enumerable: true,
  get: function () {
    stringIteratorReads = stringIteratorReads + 1;
    stringSymbolAccessLog.push("iterator");
    return function () {
      replacementReceiverIsWrapper = this instanceof String;
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
const replacedStringSymbols = Object.getOwnPropertySymbols(stringPrototype);
const replacedStringDescriptor = Object.getOwnPropertyDescriptor(
  stringPrototype,
  Symbol.iterator,
);
const replacedStringAssigned = Object.assign({}, stringPrototype);
console.log(
  "replaced string iterator reflection",
  replacedStringSymbols.length,
  replacedStringSymbols[0] === Symbol.iterator,
  replacedStringSymbols[1] === laterStringSymbol,
  Object.hasOwn(stringPrototype, Symbol.iterator),
  Object.hasOwn(replacedStringAssigned, Symbol.iterator),
  replacedStringDescriptor.get !== undefined,
  replacedStringDescriptor.enumerable,
  stringIteratorReads,
  render(stringSymbolAccessLog),
);
reflectStringIterator("replaced");
const replacedStringGroups = Object.groupBy(
  new String("ignored"),
  (value) => value,
);
console.log(
  "grouped replaced string iterator",
  stringIteratorReads,
  replacementReceiverIsWrapper,
  render(replacedStringGroups.replacement),
);
const replacedEntryReads = stringIteratorReads;
try {
  Object.fromEntries(new String("ignored"));
  console.log("from entries replaced string iterator", "no error");
} catch (error) {
  /* The replacement yields a primitive, so acquisition is observable
   * through the accessor read and the failure is the entry-object one. */
  console.log(
    "from entries replaced string iterator",
    entryObjectFailure(error),
    stringIteratorReads - replacedEntryReads,
  );
}
console.log(
  "delete string iterator",
  delete stringPrototype[Symbol.iterator],
);
const deletedStringSymbols = Object.getOwnPropertySymbols(stringPrototype);
const deletedStringDescriptor = Object.getOwnPropertyDescriptor(
  stringPrototype,
  Symbol.iterator,
);
const deletedStringDescriptors = Object.getOwnPropertyDescriptors(
  stringPrototype,
);
const deletedStringAssigned = Object.assign({}, stringPrototype);
console.log(
  "deleted string iterator reflection",
  deletedStringSymbols.length,
  deletedStringSymbols[0] === laterStringSymbol,
  Object.hasOwn(stringPrototype, Symbol.iterator),
  Object.hasOwn(deletedStringAssigned, Symbol.iterator),
  deletedStringDescriptor === undefined,
  Object.hasOwn(deletedStringDescriptors, Symbol.iterator),
);
reflectStringIterator("deleted");
let deletedStringIteratorCalls = 0;
try {
  Object.groupBy(new String("ignored"), () => {
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
for (const deleted of ["", "ab", new String(""), new String("ab")]) {
  try {
    Object.fromEntries(deleted);
    console.log("from entries deleted string iterator", "no error");
  } catch (error) {
    /* Without the default there is no String iteration to fall back on,
     * so even the empty String reports a missing iterator. */
    console.log(
      "from entries deleted string iterator",
      error instanceof TypeError,
      entryObjectFailure(error),
    );
  }
}
Object.defineProperty(stringPrototype, Symbol.iterator, {
  configurable: true,
  enumerable: true,
  value: function () {
    return { next: function () { return { done: true }; } };
  },
});
const redefinedStringSymbols = Object.getOwnPropertySymbols(stringPrototype);
console.log(
  "redefined string iterator order",
  redefinedStringSymbols.length,
  redefinedStringSymbols[0] === laterStringSymbol,
  redefinedStringSymbols[1] === Symbol.iterator,
);
reflectStringIterator("redefined");
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
  {
    globalScriptReference: true,
    name: "object-own-keys-virtual-assignment",
    source: `
/* Ordinary assignment is the one own-property write that never passes
 * through Object.defineProperty, so it needs its own realm: assigning to
 * the virtual %String.prototype% iterator has to replace it in place,
 * keep its attributes and its symbol chronology, and stay reachable to
 * every later read. */
const stringPrototype = Object.getPrototypeOf(Object(""));
const laterStringSymbol = Symbol("later assignment symbol");
Object.defineProperty(stringPrototype, laterStringSymbol, {
  configurable: true,
  enumerable: true,
  value: 1,
  writable: true,
});
const beforeSymbols = Object.getOwnPropertySymbols(stringPrototype);
console.log(
  "before assignment",
  beforeSymbols.length,
  beforeSymbols[0] === Symbol.iterator,
  beforeSymbols[1] === laterStringSymbol,
  Object.hasOwn(stringPrototype, Symbol.iterator),
  Object.prototype.propertyIsEnumerable.call(stringPrototype, Symbol.iterator),
);
/* A writable data property on the prototype makes an assignment through a
 * wrapper create a nearer own property instead of writing through. */
const wrapper = Object("ab");
const wrapperIterator = function () {};
wrapper[Symbol.iterator] = wrapperIterator;
const wrapperDescriptor = Object.getOwnPropertyDescriptor(
  wrapper,
  Symbol.iterator,
);
console.log(
  "wrapper receiver assignment",
  Object.hasOwn(wrapper, Symbol.iterator),
  wrapper[Symbol.iterator] === wrapperIterator,
  wrapperDescriptor.configurable,
  wrapperDescriptor.enumerable,
  wrapperDescriptor.writable,
  Object.hasOwn(stringPrototype, Symbol.iterator),
  stringPrototype[Symbol.iterator] === wrapperIterator,
);
const assignedIterator = function () {
  let done = false;
  return {
    next: function () {
      if (done) return { done: true };
      done = true;
      return { done: false, value: "assigned" };
    },
  };
};
stringPrototype[Symbol.iterator] = assignedIterator;
const assignedDescriptor = Object.getOwnPropertyDescriptor(
  stringPrototype,
  Symbol.iterator,
);
const afterSymbols = Object.getOwnPropertySymbols(stringPrototype);
console.log(
  "prototype assignment",
  stringPrototype[Symbol.iterator] === assignedIterator,
  ""[Symbol.iterator] === assignedIterator,
  Object("")[Symbol.iterator] === assignedIterator,
  assignedDescriptor.configurable,
  assignedDescriptor.enumerable,
  assignedDescriptor.writable,
  afterSymbols.length,
  afterSymbols[0] === Symbol.iterator,
  afterSymbols[1] === laterStringSymbol,
  Object.prototype.hasOwnProperty.call(stringPrototype, Symbol.iterator),
  Object.prototype.propertyIsEnumerable.call(stringPrototype, Symbol.iterator),
  Symbol.iterator in stringPrototype,
);
const iterated = [];
for (const part of "ignored") iterated.push(part);
console.log("assigned iteration", iterated.length, iterated[0]);
const grouped = Object.groupBy(new String("ignored"), (value) => value);
const groupedKeys = Object.keys(grouped);
console.log("assigned grouping", groupedKeys.length, groupedKeys[0]);
`,
  },
  {
    globalScriptReference: true,
    name: "object-own-keys-virtual-read-only",
    source: `
/* A read-only virtual iterator has to refuse an assignment the way an
 * ordinary read-only data property does, and a non-configurable one has
 * to accept a redefinition that repeats the value it already models. */
const stringPrototype = Object.getPrototypeOf(Object(""));
Object.defineProperty(stringPrototype, Symbol.iterator, { writable: false });
const readOnlyDescriptor = Object.getOwnPropertyDescriptor(
  stringPrototype,
  Symbol.iterator,
);
const originalIterator = stringPrototype[Symbol.iterator];
console.log(
  "read-only virtual descriptor",
  readOnlyDescriptor.configurable,
  readOnlyDescriptor.enumerable,
  readOnlyDescriptor.writable,
  readOnlyDescriptor.value === originalIterator,
  Object.hasOwn(stringPrototype, Symbol.iterator),
);
stringPrototype[Symbol.iterator] = function () {};
console.log(
  "read-only sloppy assignment",
  stringPrototype[Symbol.iterator] === originalIterator,
  Object.getOwnPropertyDescriptor(stringPrototype, Symbol.iterator).writable,
);
function strictAssignment() {
  "use strict";
  stringPrototype[Symbol.iterator] = function () {};
}
try {
  strictAssignment();
  console.log("read-only strict assignment", "no throw");
} catch (error) {
  console.log("read-only strict assignment", error instanceof TypeError);
}
const wrapper = Object("ab");
wrapper[Symbol.iterator] = function () {};
console.log(
  "read-only blocks the receiver",
  Object.hasOwn(wrapper, Symbol.iterator),
  wrapper[Symbol.iterator] === originalIterator,
);
Object.defineProperty(stringPrototype, Symbol.iterator, {
  configurable: false,
});
const frozenDescriptor = Object.getOwnPropertyDescriptor(
  stringPrototype,
  Symbol.iterator,
);
try {
  Object.defineProperty(stringPrototype, Symbol.iterator, frozenDescriptor);
  console.log("frozen round trip", "ok");
} catch (error) {
  console.log("frozen round trip", error instanceof TypeError);
}
try {
  Object.defineProperty(stringPrototype, Symbol.iterator, {
    value: frozenDescriptor.value,
  });
  console.log("frozen same value", "ok");
} catch (error) {
  console.log("frozen same value", error instanceof TypeError);
}
try {
  Object.defineProperty(stringPrototype, Symbol.iterator, { value: 1 });
  console.log("frozen other value", "ok");
} catch (error) {
  console.log("frozen other value", error instanceof TypeError);
}
console.log(
  "frozen descriptor",
  frozenDescriptor.configurable,
  frozenDescriptor.enumerable,
  frozenDescriptor.writable,
  Object.hasOwn(stringPrototype, Symbol.iterator),
  stringPrototype[Symbol.iterator] === originalIterator,
);
/* A redefinition that changes nothing must leave the default String
 * iteration alone, so grouping a String wrapper still consumes its code
 * points instead of finding an unmaterialized value. */
const groupedAfterRoundTrip = Object.groupBy(
  new String("ab"),
  (value) => value,
);
console.log(
  "frozen default iteration",
  Object.keys(groupedAfterRoundTrip).join(","),
  Object.hasOwn(stringPrototype, Symbol.iterator),
  Object.getOwnPropertyDescriptor(stringPrototype, Symbol.iterator).writable,
);
`,
  },
];
