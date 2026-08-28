import type { Fixture } from "../fixture.ts";

export const arrayPrototypeReductionFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "array-prototype-reduction",
    source: `
for (const name of ["reduce", "reduceRight"]) {
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
  try { new method(function () {}); } catch (error) {
    console.log("not constructor", name, error instanceof TypeError);
  }
  for (const receiver of [undefined, null]) {
    try { method.call(receiver, function () {}); } catch (error) {
      console.log("nullish receiver", name, error instanceof TypeError);
    }
  }
  for (const callback of [null, 1, "x", {}]) {
    const observer = {
      0: "present",
      get length() { console.log("length first", name); return 1; },
    };
    try { method.call(observer, callback); } catch (error) {
      console.log("callable check", name, error instanceof TypeError);
    }
  }
  try {
    method.call([], function () { console.log("unreachable empty", name); });
  } catch (error) {
    console.log("empty", name, error instanceof TypeError);
  }
  try {
    [, , ,][name](function () { console.log("unreachable holes", name); });
  } catch (error) {
    console.log("all holes", name, error instanceof TypeError);
  }
  try {
    method.call({ 0: "ignored", length: 0 }, function () {});
  } catch (error) {
    console.log("zero length", name, error instanceof TypeError);
  }
  console.log(
    "empty initial",
    name,
    method.call([], function () { console.log("unreachable call", name); }, 42),
  );
  console.log(
    "undefined initial",
    name,
    String(method.call([], function () {}, undefined)),
  );
  console.log(
    "single seed",
    name,
    method.call([7], function () { console.log("unreachable seed", name); }),
  );
}

const trace = [];
const traced = ["a", "b", "c", "d"].reduce(
  (accumulator, value, index, source) => {
    trace.push(accumulator + ">" + value + ":" + index + ":" + source.length);
    return accumulator + value;
  },
  "s",
);
console.log("reduce order", traced, trace.join("|"));

const rightTrace = [];
const rightTraced = ["a", "b", "c", "d"].reduceRight(
  (accumulator, value, index, source) => {
    rightTrace.push(
      accumulator + ">" + value + ":" + index + ":" + source.length,
    );
    return accumulator + value;
  },
);
console.log("reduceRight order", rightTraced, rightTrace.join("|"));

[1].reduce(function (accumulator) {
  console.log("callback this", Array.isArray(this), this === undefined);
  return accumulator;
}, 0);

const sparse = [, , "x", , "y", , ,];
console.log(
  "sparse seed",
  sparse.reduce((accumulator, value, index) => {
    return accumulator + ">" + value + ":" + index;
  }),
);
console.log(
  "sparse seed right",
  sparse.reduceRight((accumulator, value, index) => {
    return accumulator + ">" + value + ":" + index;
  }),
);

const generic = { 0: 1, 2: 3, 4: 5, length: 6 };
console.log(
  "generic",
  Array.prototype.reduce.call(generic, (accumulator, value, index) => {
    return accumulator + value * index;
  }),
);
console.log(
  "generic right",
  Array.prototype.reduceRight.call(generic, (accumulator, value, index) => {
    return accumulator + ":" + value + ":" + index;
  }),
);

const inherited = { 1: "own", length: 3 };
Object.setPrototypeOf(inherited, { 0: "proto0", 2: "proto2" });
console.log(
  "inherited",
  Array.prototype.reduce.call(inherited, (accumulator, value) => {
    return accumulator + ";" + value;
  }, ""),
);

console.log(
  "primitive",
  Array.prototype.reduce.call("abc", (accumulator, value, index) => {
    return accumulator + value + index;
  }, ""),
);

console.log(
  "frozen",
  Object.freeze([1, 2, 3]).reduce(
    (accumulator, value) => accumulator + value,
  ),
);

const lengthy = {
  0: "a",
  1: "b",
  get length() { console.log("length read"); return "1.9"; },
};
console.log(
  "length coercion",
  Array.prototype.reduce.call(lengthy, (accumulator, value) => {
    return accumulator + value;
  }, ""),
);
console.log(
  "negative length",
  Array.prototype.reduce.call({ 0: "a", length: -3 }, function () {
    console.log("unreachable negative");
  }, "initial"),
);
try {
  Array.prototype.reduceRight.call({ 0: "a", length: -3 }, function () {});
} catch (error) {
  console.log("negative empty", error instanceof TypeError);
}

const growing = [1, 2, 3];
const growingResult = growing.reduce((accumulator, value) => {
  growing.push(99);
  return accumulator + value;
});
console.log("growing", growingResult, growing.length);

const shrinking = [1, 2, 3, 4];
console.log(
  "deleting ahead",
  shrinking.reduce((accumulator, value, index) => {
    if (index === 0) delete shrinking[2];
    return accumulator + ":" + value;
  }, "s"),
);
const shrinkingRight = [1, 2, 3, 4];
console.log(
  "deleting behind",
  shrinkingRight.reduceRight((accumulator, value, index) => {
    if (index === 3) delete shrinkingRight[1];
    return accumulator + ":" + value;
  }, "s"),
);
const rewriting = [1, 2, 3];
console.log(
  "rewriting",
  rewriting.reduce((accumulator, value, index) => {
    if (index === 0) rewriting[2] = 30;
    return accumulator + ":" + value;
  }, "s"),
);
const truncating = [1, 2, 3, 4, 5];
console.log(
  "truncating",
  truncating.reduce((accumulator, value, index) => {
    if (index === 1) truncating.length = 2;
    return accumulator + ":" + value;
  }, "s"),
);

const accessed = [];
const accessor = { length: 3 };
Object.defineProperty(accessor, "0", {
  get() { accessed.push("get0"); return "x"; },
});
Object.defineProperty(accessor, "2", {
  get() { accessed.push("get2"); return "y"; },
});
console.log(
  "accessor",
  Array.prototype.reduceRight.call(accessor, (accumulator, value) => {
    return accumulator + value;
  }, ""),
  accessed.join(","),
);

let calls = 0;
try {
  [1, 2, 3].reduce(function () {
    calls = calls + 1;
    throw new TypeError("callback");
  });
} catch (error) {
  console.log("abrupt callback", error instanceof TypeError, calls === 1);
}
try {
  Array.prototype.reduce.call({
    get length() { throw new TypeError("length"); },
  }, function () {});
} catch (error) {
  console.log("abrupt length", error instanceof TypeError);
}
try {
  Array.prototype.reduce.call({
    length: { valueOf() { throw new TypeError("coerce"); } },
  }, function () {});
} catch (error) {
  console.log("abrupt length coercion", error instanceof TypeError);
}
try {
  const abruptRead = [1, 2];
  Object.defineProperty(abruptRead, "1", {
    get() { throw new TypeError("read"); },
  });
  abruptRead.reduce(function () { return 0; });
} catch (error) {
  console.log("abrupt read", error instanceof TypeError);
}
try {
  const abruptSeed = [];
  abruptSeed.length = 2;
  Object.defineProperty(abruptSeed, "1", {
    get() { throw new TypeError("seed"); },
  });
  abruptSeed.reduceRight(function () { return 0; });
} catch (error) {
  console.log("abrupt seed", error instanceof TypeError);
}

const collected = [{ value: 3 }, { value: 1 }, { value: 2 }];
const collectedTotal = collected.reduce(
  (accumulator, entry) => accumulator + entry.value,
  0,
);
console.log("collected", collectedTotal);

/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
let turn = 0;
while (turn < 3) {
  console.log("guard", hinted("guard"));
  if (turn === 1) String.prototype.arrayReductionMarker = 1;
  turn = turn + 1;
}
`,
  },
];
