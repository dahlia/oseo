import type { Fixture } from "../fixture.ts";

export const typedArraySearchAndJoinFixtures: readonly Fixture[] = [
  {
    name: "typed-array-search-and-join",
    source: `
const TypedArray = Object.getPrototypeOf(Int8Array);
const TypedArrayPrototype = TypedArray.prototype;
const searchAndJoin = [
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "includes",
  "indexOf",
  "join",
  "lastIndexOf",
  "toLocaleString",
  "toString",
];
for (const key of searchAndJoin) {
  const method = TypedArrayPrototype[key];
  const descriptor = Object.getOwnPropertyDescriptor(TypedArrayPrototype, key);
  let constructible = true;
  try {
    new method(() => true);
  } catch (error) {
    constructible = !(error instanceof TypeError);
  }
  console.log(
    "metadata",
    key,
    method.name,
    method.length,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
    constructible,
    Object.hasOwn(Int8Array.prototype, key),
  );
}
console.log(
  "shared",
  TypedArrayPrototype.toString === Array.prototype.toString,
  TypedArrayPrototype.toLocaleString === Array.prototype.toLocaleString,
  TypedArrayPrototype.join === Array.prototype.join,
  TypedArrayPrototype.includes === Array.prototype.includes,
);

const base = new Int16Array([3, 1, 4, 1, 5, -0]);
const visits = [];
const marker = { marker: true };
console.log(
  "find",
  base.find(function (value, index, object) {
    visits.push(value, index, object === base, this === marker);
    return value > 3;
  }, marker),
  visits.join("|"),
);
visits.length = 0;
console.log(
  "findLast",
  base.findLast((value, index) => {
    visits.push(value, index);
    return value === 1;
  }),
  visits.join("|"),
);
console.log(
  "findIndex",
  base.findIndex((value) => value === 1),
  base.findIndex((value) => value === 9),
  base.findLastIndex((value) => value === 1),
  base.findLastIndex((value) => value === 9),
  base.find((value) => value === 9),
  base.findLast((value) => value === 9),
);
console.log(
  "negative zero",
  Object.is(base.find((value, index) => index === 5), 0),
  base.includes(0),
  base.indexOf(0),
  base.lastIndexOf(-0),
);
console.log(
  "includes",
  base.includes(1),
  base.includes(1, 4),
  base.includes(5, -1),
  base.includes(3, -100),
  base.includes(3, Infinity),
  base.includes(3, -Infinity),
  base.includes(4, 2.9),
  base.includes("4"),
  base.includes(),
);
console.log(
  "indexOf",
  base.indexOf(1),
  base.indexOf(1, 2),
  base.indexOf(1, -3),
  base.indexOf(3, Infinity),
  base.indexOf(3, -Infinity),
  base.indexOf("1"),
  base.indexOf(1, null),
);
console.log(
  "lastIndexOf",
  base.lastIndexOf(1),
  base.lastIndexOf(1, 2),
  base.lastIndexOf(1, -3),
  base.lastIndexOf(1, -10),
  base.lastIndexOf(5, Infinity),
  base.lastIndexOf(3, -Infinity),
  base.lastIndexOf(1, undefined),
  base.lastIndexOf(3, undefined),
);
const floats = new Float64Array([NaN, 1.5, -0, Infinity]);
console.log(
  "floats",
  floats.includes(NaN),
  floats.indexOf(NaN),
  floats.lastIndexOf(NaN),
  floats.includes(0),
  floats.indexOf(0),
  floats.findIndex((value) => Number.isNaN(value)),
  floats.join(";"),
);
console.log(
  "join",
  base.join(),
  base.join(undefined),
  base.join(""),
  base.join(null),
  base.join(0),
  base.join({ toString: () => "<>" }),
  new Float32Array([0.5, -1]).join("|"),
);
console.log(
  "toString",
  base.toString(),
  String(new Uint8Array([7, 8])),
  "" + new Uint8ClampedArray([300, -5]),
);
console.log(
  "toLocaleString",
  base.toLocaleString(),
  new Uint8Array([1, 2]).toLocaleString("en", {}),
);

const big = new BigInt64Array([1n, -2n, 3n]);
console.log(
  "big",
  big.includes(1n),
  big.includes(1),
  big.indexOf(-2n),
  big.indexOf(-2),
  big.lastIndexOf(3n),
  String(big.find((value) => value < 0n)),
  big.findLastIndex((value) => value > 0n),
  big.join("|"),
  big.toLocaleString(),
  String(new BigUint64Array([2n ** 64n - 1n])),
);

const originalNumberLocale = Number.prototype.toLocaleString;
const localeCalls = [];
Number.prototype.toLocaleString = function (locales, options) {
  "use strict";
  localeCalls.push(
    Number(this),
    arguments.length,
    String(locales),
    options === marker,
  );
  return "<" + this + ">";
};
console.log(
  "locale forwarded",
  new Uint8Array([1, 2]).toLocaleString("ko", marker),
  localeCalls.join("|"),
);
localeCalls.length = 0;
console.log(
  "locale omitted",
  new Uint8Array([3]).toLocaleString(),
  localeCalls.join("|"),
);
Number.prototype.toLocaleString = function () {
  "use strict";
  return { toString: () => "object" };
};
console.log("locale result", new Int8Array([1, 2]).toLocaleString());
Number.prototype.toLocaleString = 1;
try {
  new Int8Array([1]).toLocaleString();
  console.log("locale callable", "none");
} catch (error) {
  console.log("locale callable", error instanceof TypeError);
}
console.log("locale empty", JSON.stringify(new Int8Array(0).toLocaleString()));
let localeCount = 0;
Number.prototype.toLocaleString = function () {
  "use strict";
  localeCount = localeCount + 1;
  if (localeCount === 2) throw new RangeError("stop");
  return "n";
};
try {
  new Int8Array([1, 2, 3]).toLocaleString();
} catch (error) {
  console.log("locale abrupt", error instanceof RangeError, localeCount);
}
const cyclic = new Uint8Array([1, 2, 3]);
Number.prototype.toLocaleString = function () {
  "use strict";
  return cyclic.toLocaleString();
};
console.log("locale cycle", JSON.stringify(cyclic.toLocaleString()));
Number.prototype.toLocaleString = originalNumberLocale;
const originalBigIntLocale = BigInt.prototype.toLocaleString;
BigInt.prototype.toLocaleString = function () {
  "use strict";
  return "b" + this;
};
console.log("bigint locale", big.toLocaleString());
BigInt.prototype.toLocaleString = originalBigIntLocale;

for (const method of searchAndJoin) {
  for (const receiver of [{}, [], 1, null, undefined]) {
    try {
      TypedArrayPrototype[method].call(receiver, () => true);
      console.log("receiver", method, "none");
    } catch (error) {
      console.log("receiver", method, error instanceof TypeError);
    }
  }
  const detached = new Uint8Array(2);
  detached.buffer.transfer();
  try {
    detached[method](() => true);
    console.log("detached receiver", method, "none");
  } catch (error) {
    console.log("detached receiver", method, error instanceof TypeError);
  }
}
for (const method of ["find", "findIndex", "findLast", "findLastIndex"]) {
  for (const predicate of [undefined, {}, 1]) {
    try {
      new Int8Array(0)[method](predicate);
      console.log("predicate", method, "none");
    } catch (error) {
      console.log("predicate", method, error instanceof TypeError);
    }
  }
}
try {
  new Int8Array([1]).join(Symbol("separator"));
} catch (error) {
  console.log("separator symbol", error instanceof TypeError);
}
try {
  new Int8Array([1]).join({
    toString() {
      throw new SyntaxError("separator");
    },
  });
} catch (error) {
  console.log("separator abrupt", error instanceof SyntaxError);
}
const probes = [];
for (const method of ["includes", "indexOf", "lastIndexOf"]) {
  const result = new Int8Array(0)[method](0, {
    valueOf() {
      probes.push(method);
      return 0;
    },
  });
  console.log("empty", method, result);
}
console.log("empty probes", probes.length, new Int8Array(0).join("-") === "");
try {
  new Int8Array([1]).indexOf(1, {
    valueOf() {
      throw new EvalError("from");
    },
  });
} catch (error) {
  console.log("fromIndex abrupt", error instanceof EvalError);
}
try {
  new Int8Array([1]).includes(1, 1n);
} catch (error) {
  console.log("fromIndex bigint", error instanceof TypeError);
}

const predicateDetach = new Uint8Array([1, 2, 3]);
const predicateSeen = [];
console.log(
  "detach find",
  predicateDetach.findIndex((value, index) => {
    predicateSeen.push(String(value), index);
    if (index === 0) predicateDetach.buffer.transfer();
    return false;
  }),
  predicateSeen.join("|"),
);
const lastDetach = new Uint8Array([1, 2, 3]);
console.log(
  "detach findLast",
  lastDetach.findLast((value, index) => {
    if (index === 2) lastDetach.buffer.transfer();
    return value === undefined;
  }),
);
const includesDetach = new Uint8Array([1, 2, 3]);
console.log(
  "detach includes",
  includesDetach.includes(undefined, {
    valueOf() {
      includesDetach.buffer.transfer();
      return 0;
    },
  }),
);
const indexDetach = new Uint8Array([0, 0, 0]);
console.log(
  "detach indexOf",
  indexDetach.indexOf(0, {
    valueOf() {
      indexDetach.buffer.transfer();
      return 0;
    },
  }),
);
const lastIndexDetach = new Uint8Array([0, 0, 0]);
console.log(
  "detach lastIndexOf",
  lastIndexDetach.lastIndexOf(0, {
    valueOf() {
      lastIndexDetach.buffer.transfer();
      return 2;
    },
  }),
);
const joinDetach = new Uint8Array([1, 2, 3]);
console.log(
  "detach join",
  JSON.stringify(
    joinDetach.join({
      toString() {
        joinDetach.buffer.transfer();
        return "+";
      },
    }),
  ),
);
const resizable = new ArrayBuffer(4, { maxByteLength: 8 });
const shrinking = new Uint8Array(resizable);
shrinking.set([1, 2, 3, 4]);
console.log(
  "shrink includes",
  shrinking.includes(undefined, {
    valueOf() {
      resizable.resize(2);
      return 0;
    },
  }),
  shrinking.length,
);
resizable.resize(4);
shrinking.set([1, 2, 3, 4]);
console.log(
  "shrink lastIndexOf",
  shrinking.lastIndexOf(4, {
    valueOf() {
      resizable.resize(3);
      return 3;
    },
  }),
  shrinking.lastIndexOf(3),
);
resizable.resize(2);
console.log(
  "grow join",
  shrinking.join({
    toString() {
      resizable.resize(8);
      return ".";
    },
  }),
  shrinking.length,
);
resizable.resize(4);
shrinking.set([5, 6, 7, 8]);
Number.prototype.toLocaleString = function () {
  "use strict";
  if (Number(this) === 5) resizable.resize(2);
  return "[" + this + "]";
};
console.log("shrink toLocaleString", shrinking.toLocaleString());
Number.prototype.toLocaleString = originalNumberLocale;
const offset = new Int32Array(new ArrayBuffer(16), 8, 2);
offset[0] = 42;
offset[1] = -7;
console.log(
  "offset",
  offset.indexOf(-7),
  offset.includes(42),
  offset.join("/"),
  offset.findLast((value) => value > 0),
);

const collected = new Int8Array([4, 5, 6, 7]);
let collectedTotal = 0;
const collectedIndex = collected.findIndex((value) => {
  const box = { value };
  collectedTotal = collectedTotal + box.value;
  return box.value === 7;
});
const collectedJoin = collected.join({
  toString() {
    const pieces = [];
    for (let index = 0; index < 20; index += 1) pieces.push({ index });
    return String(pieces.length);
  },
});
console.log("collected", collectedIndex, collectedTotal, collectedJoin);

/** @param {string} value */
function hinted(value) {
  return value.charAt(0);
}
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
const originalCharAt = String.prototype.charAt;
let turn = 0;
while (turn < 2) {
  console.log("guard", hinted("guard"));
  if (turn === 0) String.prototype.searchMarker = 1;
  turn = turn + 1;
}
console.log("method stable", String.prototype.charAt === originalCharAt);
`,
  },
];
