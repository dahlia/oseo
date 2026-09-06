import type { Fixture } from "../fixture.ts";

export const arrayPrototypePredicateSearchFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "array-prototype-predicate-search",
    source: `
const names = ["find", "findIndex", "findLast", "findLastIndex"];
const unscopables = Array.prototype[Symbol.unscopables];
for (const name of names) {
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
    unscopables[name],
  );
  try { new method(function () {}); } catch (error) {
    console.log("not constructor", name, error instanceof TypeError);
  }
  for (const receiver of [undefined, null]) {
    try { method.call(receiver, function () {}); } catch (error) {
      console.log("nullish receiver", name, error instanceof TypeError);
    }
  }
  for (const predicate of [undefined, null, 1, "x", {}]) {
    const observer = {
      0: "present",
      get length() { console.log("length first", name); return 1; },
    };
    try { method.call(observer, predicate); } catch (error) {
      console.log("callable check", name, error instanceof TypeError);
    }
  }
  console.log(
    "empty",
    name,
    String(method.call([], function () { console.log("unreachable", name); })),
  );
  console.log(
    "zero length",
    name,
    String(method.call({ 0: "ignored", length: 0 }, function () {
      console.log("unreachable zero", name);
    })),
  );
  const trace = [];
  const subject = ["a", "b", "c"];
  const traced = subject[name](function (value, index, source) {
    trace.push(value + ":" + index + ":" + (source === subject));
    return false;
  });
  console.log("order", name, String(traced), trace.join("|"));
  let visited = 0;
  const holes = [undefined, , , "foo"];
  const holeResult = holes[name](function (value) {
    visited = visited + 1;
    return value === undefined;
  });
  console.log("holes", name, visited, String(holeResult));
  console.log(
    "found",
    name,
    String(subject[name](function (value) { return value !== "a"; })),
  );
  const truthy = [];
  for (const answer of ["", 0, NaN, null, undefined, false, "x", 1, {}]) {
    truthy.push(String([7][name](function () { return answer; })));
  }
  console.log("truthiness", name, truthy.join(","));
  let calls = 0;
  try {
    ["p", "q", "r"][name](function () {
      calls = calls + 1;
      throw new TypeError("predicate");
    });
  } catch (error) {
    console.log("abrupt predicate", name, error instanceof TypeError, calls);
  }
  const reads = [];
  const accessor = { length: 3 };
  Object.defineProperty(accessor, "0", {
    get() { reads.push("get0"); return "x"; },
  });
  Object.defineProperty(accessor, "2", {
    get() { reads.push("get2"); return "y"; },
  });
  console.log(
    "accessor",
    name,
    String(method.call(accessor, function (value) { return value === "y"; })),
    reads.join(","),
  );
}

[1].find(function () {
  console.log("callback this sloppy", typeof this, this === undefined);
});
[1].findLast(function () {
  "use strict";
  console.log("callback this strict", this === undefined);
});
const thisArgument = { tag: "this" };
[1].findIndex(function () {
  console.log("callback this argument", this === thisArgument);
}, thisArgument);
[1].findLastIndex(function () {
  console.log("callback this arrow", this === thisArgument);
}, thisArgument);

const generic = { 0: 1, 2: 3, 4: 5, length: 6 };
console.log(
  "generic",
  Array.prototype.find.call(generic, (value) => value === 3),
  Array.prototype.findIndex.call(generic, (value) => value === 3),
  Array.prototype.findLast.call(generic, (value) => value === undefined),
  Array.prototype.findLastIndex.call(generic, (value) => value === undefined),
);
const inherited = { 1: "own", length: 3 };
Object.setPrototypeOf(inherited, { 0: "proto0", 2: "proto2" });
console.log(
  "inherited",
  Array.prototype.find.call(inherited, (value) => value === "proto2"),
  Array.prototype.findLastIndex.call(inherited, (value) => value === "proto0"),
);
console.log(
  "primitive",
  Array.prototype.find.call("abc", (value) => value === "b"),
  Array.prototype.findLastIndex.call("abca", (value) => value === "a"),
  String(Array.prototype.find.call(true, () => true)),
);
console.log(
  "frozen",
  Object.freeze([1, 2, 3]).findLast((value) => value < 3),
);

const lengthy = {
  0: "a",
  1: "b",
  get length() { console.log("length read"); return "1.9"; },
};
console.log(
  "length coercion",
  Array.prototype.findLast.call(lengthy, () => true),
  Array.prototype.findLastIndex.call(lengthy, () => true),
);
console.log(
  "negative length",
  String(Array.prototype.find.call({ 0: "a", length: -3 }, function () {
    console.log("unreachable negative");
  })),
  Array.prototype.findLastIndex.call({ 0: "a", length: -3 }, function () {
    console.log("unreachable negative last");
  }),
);
try {
  Array.prototype.find.call({ length: Symbol("length") }, function () {});
} catch (error) {
  console.log("symbol length", error instanceof TypeError);
}
const maximumIndices = [];
console.log(
  "maximum index",
  Array.prototype.findLastIndex.call(
    { length: Number.MAX_VALUE },
    function (value, index) {
      maximumIndices.push(index);
      return true;
    },
  ),
  maximumIndices.length,
);
console.log(
  "huge ascending",
  Array.prototype.findIndex.call(
    { 0: "first", length: Number.MAX_VALUE },
    (value) => value === "first",
  ),
);

const splicing = ["Shoes", "Car", "Bike"];
const splicedTrace = [];
splicing.find(function (value) {
  if (splicedTrace.length === 0) splicing.splice(1, 1);
  splicedTrace.push(String(value));
});
console.log("splice during loop", splicedTrace.join("|"));
const growing = ["Skateboard", "Barefoot"];
const growingTrace = [];
growing.findLast(function (value) {
  if (growingTrace.length === 0) {
    growing.push("Motorcycle");
    growing[0] = "Magic Carpet";
  }
  growingTrace.push(value);
});
console.log("grow during loop", growingTrace.join("|"), growing.length);
const truncating = [1, 2, 3, 4, 5];
const truncatedTrace = [];
truncating.find(function (value, index) {
  if (index === 1) truncating.length = 2;
  truncatedTrace.push(String(value));
});
console.log("truncate during loop", truncatedTrace.join("|"));
const deleting = [1, 2, 3, 4];
console.log(
  "delete ahead",
  deleting.findIndex(function (value, index) {
    if (index === 0) delete deleting[2];
    return value === undefined;
  }),
);

try {
  Array.prototype.findIndex.call({
    get length() { throw new TypeError("length"); },
  }, function () {});
} catch (error) {
  console.log("abrupt length", error instanceof TypeError);
}
try {
  Array.prototype.findLast.call({
    length: { valueOf() { throw new TypeError("coerce"); } },
  }, function () {});
} catch (error) {
  console.log("abrupt length coercion", error instanceof TypeError);
}
let readCalls = 0;
try {
  const abruptRead = [1, 2];
  Object.defineProperty(abruptRead, "1", {
    get() { throw new TypeError("read"); },
  });
  abruptRead.find(function () { readCalls = readCalls + 1; });
} catch (error) {
  console.log("abrupt read", error instanceof TypeError, readCalls);
}
try {
  const abruptLast = [1, 2];
  Object.defineProperty(abruptLast, "1", {
    get() { throw new TypeError("read"); },
  });
  abruptLast.findLastIndex(function () { readCalls = readCalls + 1; });
} catch (error) {
  console.log("abrupt last read", error instanceof TypeError, readCalls);
}

const watched = [1, 2, 3];
Object.defineProperty(watched, "constructor", {
  get() { console.log("unreachable constructor"); return Array; },
});
console.log(
  "no species",
  watched.find((value) => value === 2),
  watched.findLast((value) => value === 2),
);

const collected = [{ value: 3 }, { value: 1 }, { value: 2 }];
const foundEntry = collected.find((entry) => entry.value === 1);
const lastEntry = collected.findLast((entry) => entry.value > 1);
console.log(
  "identity",
  foundEntry === collected[1],
  lastEntry === collected[2],
  collected.findIndex((entry) => entry === lastEntry),
);

/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
let turn = 0;
while (turn < 3) {
  console.log("guard", hinted("guard"));
  if (turn === 1) String.prototype.arrayPredicateSearchMarker = 1;
  turn = turn + 1;
}
const originalIs = Object.is;
turn = 0;
while (turn < 3) {
  console.log("shape", Object.is === originalIs);
  if (turn === 1) Object.arrayPredicateSearchMarker = 1;
  turn = turn + 1;
}
`,
  },
];
