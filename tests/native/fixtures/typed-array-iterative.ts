import type { Fixture } from "../fixture.ts";

export const typedArrayIterativeFixtures: readonly Fixture[] = [
  {
    name: "typed-array-iterative",
    source: `
const TypedArray = Object.getPrototypeOf(Int8Array);
const TypedArrayPrototype = TypedArray.prototype;
const iterative = [
  "every",
  "filter",
  "forEach",
  "map",
  "reduce",
  "reduceRight",
  "some",
];
for (const key of iterative) {
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
  );
}
console.log(
  "shared",
  Int8Array.prototype.every === TypedArrayPrototype.every,
  Int8Array.prototype[Symbol.iterator] === Int8Array.prototype.values,
);

const base = new Int16Array([3, 1, 4, 1, 5]);
console.log(
  "every",
  base.every((value) => value > 0),
  base.every((value) => value > 2),
);
console.log(
  "some",
  base.some((value) => value === 4),
  base.some((value) => value === 9),
);
const calls = [];
const mapped = base.map((value, index, object) => {
  calls.push(value, index, object === base);
  return value * 2;
});
console.log(
  "map",
  calls.join("|"),
  mapped instanceof Int16Array,
  mapped.length,
  [...mapped].join(),
);
let forEachTotal = 0;
const forEachResult = base.forEach((value, index, object) => {
  forEachTotal = forEachTotal + value * (index + 1);
  if (index === 0) console.log("forEach args", value, index, object === base);
});
console.log("forEach", forEachTotal, forEachResult === undefined);
const filtered = base.filter((value) => value > 1);
console.log(
  "filter",
  filtered instanceof Int16Array,
  filtered.length,
  [...filtered].join(),
);
console.log(
  "reduce",
  base.reduce((left, right) => left + right),
  base.reduce((left, right) => left + right, 10),
);
console.log(
  "reduce args",
  base.reduce(
    (accumulator, value, index, object) =>
      accumulator + ":" + value + "," + index + "," + (object === base),
    "",
  ),
);
console.log(
  "reduceRight",
  base.reduceRight((left, right) => left - right, 100),
);
const marker = { marker: true };
const seen = [];
base.forEach(function (value, index, object) {
  seen.push(value, index, object === base, this === marker);
}, marker);
console.log("thisArg", seen.join("|"));

class Derived extends Uint8Array {}
const derived = new Derived([1, 2, 3]);
const derivedMap = derived.map((value) => value + 1);
console.log(
  "derived map",
  derivedMap instanceof Derived,
  derivedMap.length,
  [...derivedMap].join(),
);
const derivedFilter = derived.filter((value) => value > 1);
console.log("derived filter", derivedFilter.length, [...derivedFilter].join());

const reads = [];
const custom = new Uint8Array([1, 2]);
custom.constructor = {
  [Symbol.species]: function (length) {
    reads.push("construct", length);
    return new Uint8Array(length);
  },
};
const customMapped = custom.map((value) => {
  reads.push("callback");
  return value + 1;
});
console.log("species order", reads.join("|"), [...customMapped].join());
const captured = [];
const customFilter = new Uint8Array([1, 2, 3, 4]);
customFilter.constructor = {
  [Symbol.species]: function (length) {
    captured.push(length);
    return new Uint8Array(length);
  },
};
const filteredCustom = customFilter.filter((value) => value % 2 === 0);
console.log("filter captured", captured.join(), [...filteredCustom].join());
for (const species of [null, undefined]) {
  const view = new Uint8Array([5]);
  view.constructor = { [Symbol.species]: species };
  const result = view.map((value) => value);
  console.log(
    "default species",
    String(species),
    result instanceof Uint8Array,
    [...result].join(),
  );
}
for (const [label, constructor] of [
  ["primitive", 1],
  ["non-constructor", { [Symbol.species]: () => {} }],
  ["non-view", { [Symbol.species]: function () { return {}; } }],
  [
    "short",
    {
      [Symbol.species]: function (length) {
        return new Uint8Array(Math.max(length - 1, 0));
      },
    },
  ],
  [
    "wrong type",
    {
      [Symbol.species]: function (length) {
        return new BigInt64Array(length);
      },
    },
  ],
]) {
  const view = new Uint8Array([1, 2]);
  view.constructor = constructor;
  for (const method of ["map", "filter"]) {
    try {
      view[method]((value) => value);
      console.log("species error", method, label, "none");
    } catch (error) {
      console.log("species error", method, label, error instanceof TypeError);
    }
  }
}

const big = new BigInt64Array([1n, -2n, 3n]);
console.log(
  "big",
  [...big.map((value) => value * 2n)].join(),
  [...big.filter((value) => value > 0n)].join(),
  String(big.reduce((left, right) => left + right)),
  String(big.reduceRight((left, right) => left - right, 0n)),
);
try {
  big.map((value) => Number(value));
} catch (error) {
  console.log("big to number", error instanceof TypeError);
}
try {
  new Uint8Array([1]).map(() => 1n);
} catch (error) {
  console.log("number to bigint", error instanceof TypeError);
}

for (const method of iterative) {
  for (const receiver of [{}, 1, null, undefined]) {
    try {
      TypedArrayPrototype[method].call(receiver, () => true);
      console.log("receiver", method, "none");
    } catch (error) {
      console.log("receiver", method, error instanceof TypeError);
    }
  }
  try {
    new Int8Array([1])[method](undefined);
    console.log("callable", method, "none");
  } catch (error) {
    console.log("callable", method, error instanceof TypeError);
  }
}
console.log(
  "empty",
  new Int8Array(0).every(() => false),
  new Int8Array(0).some(() => true),
);
try {
  new Int8Array(0).reduce((left, right) => left + right);
} catch (error) {
  console.log("reduce empty", error instanceof TypeError);
}

const live = new Uint8Array([1, 2, 3, 4]);
const liveSeen = [];
live.forEach((value, index) => {
  liveSeen.push(value, index);
  if (index === 1) live.buffer.transfer();
});
console.log("detach forEach", liveSeen.join("|"));
const liveMap = new Uint8Array([1, 2, 3, 4]);
const liveMapResult = liveMap.map((value, index) => {
  if (index === 1) liveMap.buffer.transfer();
  return value;
});
console.log("detach map", liveMapResult.length, [...liveMapResult].join());
const liveReduce = new Uint8Array([1, 2, 3, 4]);
const liveReduced = liveReduce.reduce((accumulator, value, index) => {
  if (index === 2) liveReduce.buffer.transfer();
  return accumulator + (value === undefined ? 100 : value);
}, 0);
console.log("detach reduce", liveReduced);
const detached = new Uint8Array(3);
detached.buffer.transfer();
for (const method of ["every", "forEach", "map", "reduce"]) {
  try {
    detached[method](() => true);
  } catch (error) {
    console.log("detached receiver", method, error instanceof TypeError);
  }
}

const growable = new Uint8Array(new ArrayBuffer(2, { maxByteLength: 8 }));
const growSeen = [];
growable.forEach((value, index) => {
  growSeen.push(value, index);
  if (index === 0) growable.buffer.resize(8);
});
console.log("grow snapshot", growSeen.join("|"));
const shrinkable = new Uint8Array(new ArrayBuffer(4, { maxByteLength: 4 }));
const shrinkSeen = [];
shrinkable.forEach((value, index) => {
  shrinkSeen.push(value, index);
  if (index === 0) shrinkable.buffer.resize(0);
});
console.log("shrink snapshot", shrinkSeen.join("|"));

const collected = new Int8Array([1, 2, 3, 4]);
let collectedTotal = 0;
collected.forEach((value) => {
  const box = { value };
  collectedTotal = collectedTotal + box.value;
});
console.log("collected", collectedTotal);

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
  if (turn === 0) String.prototype.iterativeMarker = 1;
  turn = turn + 1;
}
console.log("method stable", String.prototype.charAt === originalCharAt);
`,
  },
];
