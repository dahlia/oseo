import type { Fixture } from "../fixture.ts";

export const typedArrayStaticsFixtures: readonly Fixture[] = [
  {
    name: "typed-array-statics",
    source: `
const TypedArray = Object.getPrototypeOf(Int8Array);
const log = [];

function show(view) {
  const values = [];
  for (let index = 0; index < view.length; index = index + 1) {
    const value = view[index];
    values.push(
      typeof value === "bigint"
        ? String(value) + "n"
        : Number.isNaN(value)
          ? "NaN"
          : Object.is(value, -0) ? "-0" : String(value),
    );
  }
  return view.constructor.name + "[" + values.join(",") + "]";
}

function report(label, thunk) {
  log.length = 0;
  try {
    const value = thunk();
    console.log(label, typeof value === "string" ? value : show(value),
      log.join(" "));
  } catch (error) {
    console.log(label, "throw", error.constructor.name, log.join(" "));
  }
}

for (const name of ["from", "of"]) {
  const method = TypedArray[name];
  const descriptor = Object.getOwnPropertyDescriptor(TypedArray, name);
  let constructible = true;
  try { new method(); } catch (error) {
    constructible = !(error instanceof TypeError);
  }
  console.log(
    "metadata",
    name,
    method.name,
    method.length,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
    constructible,
    Object.hasOwn(Int8Array, name),
    Int8Array[name] === method,
    BigUint64Array[name] === method,
    Object.getPrototypeOf(method) === Function.prototype,
  );
}
const species = Object.getOwnPropertyDescriptor(TypedArray, Symbol.species);
console.log(
  "species",
  typeof species.get,
  species.set,
  species.enumerable,
  species.configurable,
  species.get.name,
  species.get.length,
  TypedArray[Symbol.species] === TypedArray,
  Float32Array[Symbol.species] === Float32Array,
  species.get.call(1),
  species.get.call(undefined),
);
console.log("own keys", Reflect.ownKeys(TypedArray).map(String).join());
console.log(
  "prototype keys",
  Object.getOwnPropertyNames(TypedArray.prototype).toSorted().join(),
  Object.getOwnPropertySymbols(TypedArray.prototype).length,
);

report("array", () => Uint8Array.from([1, 2, 300, -1]));
report("array like", () => Int16Array.from({
  get length() { log.push("length"); return 3; },
  get 0() { log.push("get0"); return 7; },
  get 2() { log.push("get2"); return "9"; },
}));
report("array like mapped", () => Int16Array.from({
  length: 2,
  get 0() { log.push("get0"); return 1; },
  get 1() { log.push("get1"); return 2; },
}, (value, index) => {
  log.push("map" + index);
  return value * 10;
}));
report("iterable mapped", () => Float64Array.from({
  [Symbol.iterator]() {
    log.push("iterator");
    let index = 0;
    return {
      next() {
        log.push("next" + index);
        index = index + 1;
        return { done: index > 2, value: index / 4 };
      },
    };
  },
}, (value, index) => {
  log.push("map" + index);
  return value + index;
}));
const receiver = {};
report("this arg", () => Uint8Array.from([5], function (value, index) {
  log.push(String(this === receiver), String(arguments.length));
  return value + index;
}, receiver));
report("string", () => Uint8Array.from("1\\u{1F600}2"));
report("number", () => Uint8Array.from(3));
report("set", () => Int32Array.from(new Set([3, -3, 3])));
report("typed", () => Float32Array.from(new Int8Array([-1, 2])));
report("bigint", () => BigInt64Array.from([1n, -2n]));
report("bigint of", () => BigUint64Array.of(1n, -1n));
report("number of", () => Uint8ClampedArray.of(-5, 1.5, 2.5, 300, "7"));
report("empty of", () => Int8Array.of());
report("bigint mismatch", () => BigInt64Array.from([1]));
report("number mismatch", () => Int8Array.of(1n));
report("null iterator", () => Uint8Array.from({
  length: 1, 0: 4, [Symbol.iterator]: null,
}));
report("bad iterator", () => Uint8Array.from({ [Symbol.iterator]: 1 }));
report("iterator not object", () =>
  Uint8Array.from({ [Symbol.iterator]() { return 1; } }));
report("next throws", () => Uint8Array.from({
  [Symbol.iterator]() {
    return { next() { throw new RangeError("next"); } };
  },
}));
report("value throws", () => Uint8Array.from({
  [Symbol.iterator]() {
    return {
      next() {
        return { done: false, get value() { throw new EvalError("value"); } };
      },
    };
  },
}));
report("iterator getter throws", () => Uint8Array.from({
  get [Symbol.iterator]() { throw new URIError("get"); },
}));
report("length throws", () => Uint8Array.from({
  get length() { throw new SyntaxError("length"); },
}));
report("nullish source", () => Uint8Array.from(undefined));
report("null source", () => Uint8Array.from(null));

const loggedSource = {
  get [Symbol.iterator]() { log.push("iterator"); return undefined; },
  length: 0,
};
for (const receiverValue of [undefined, {}, Math.max, () => 1]) {
  report("receiver", () =>
    TypedArray.from.call(receiverValue, loggedSource, 1));
  report("receiver of", () => TypedArray.of.call(receiverValue));
}
report("abstract", () => TypedArray.from.call(TypedArray, []));
report("abstract of", () => TypedArray.of());
report("mapper", () => Uint8Array.from(loggedSource, {}));
report("array receiver", () => TypedArray.from.call(Array, []));
report("array receiver of", () => TypedArray.of.call(Array, 1));

class Derived extends Int16Array {
  constructor(...args) {
    log.push("derived:" + args.join("/"));
    super(...args);
  }
}
report("derived", () => {
  const value = Derived.from([1, 2]);
  return (value instanceof Derived) + ":" + show(value);
});
report("derived of", () => {
  const value = Derived.of(3, 4, 5);
  return (value instanceof Derived) + ":" + show(value);
});
report("longer", () =>
  TypedArray.from.call(function (length) {
    log.push("construct:" + length + ":" + (new.target !== undefined));
    return new Uint8Array(length + 2);
  }, [1, 2]));
report("shorter", () =>
  TypedArray.from.call(function () { return new Uint8Array(1); }, [1, 2]));
report("shorter of", () =>
  TypedArray.of.call(function () { return new Uint8Array(0); }, 1));
report("not typed", () =>
  TypedArray.of.call(function () { return {}; }));
report("detached result", () =>
  TypedArray.of.call(function () {
    const view = new Uint8Array(2);
    view.buffer.transfer();
    return view;
  }));
report("content", () =>
  TypedArray.from.call(function () { return new BigInt64Array(1); }, [1n]));
report("content mismatch", () =>
  TypedArray.of.call(function () { return new BigInt64Array(1); }, 1));
report("bound", () =>
  TypedArray.of.call(Uint16Array.bind(null), 65537));
const proxied = new Proxy(Int8Array, {
  construct(target, args, newTarget) {
    log.push("trap:" + args.join("/") + ":" + (newTarget === proxied));
    return Reflect.construct(target, args, newTarget);
  },
});
report("proxy", () => TypedArray.from.call(proxied, [1, 2]));

let conversions = 0;
const counted = {
  valueOf() {
    conversions = conversions + 1;
    return 8;
  },
};
const detaching = new Uint8Array(3);
report("mapper detaches", () => {
  conversions = 0;
  const result = TypedArray.from.call(function () { return detaching; },
    [1, 2, 3], (value, index) => {
      if (index === 1) detaching.buffer.transfer();
      return index === 2 ? counted : value;
    });
  return (result === detaching) + ":" + result.length + ":" + conversions;
});
const shrinkBuffer = new ArrayBuffer(4, { maxByteLength: 8 });
const shrinking = new Uint8Array(shrinkBuffer);
report("mapper shrinks", () => {
  conversions = 0;
  TypedArray.from.call(function () { return shrinking; },
    [1, 2, 3, 4], (value, index) => {
      if (index === 1) shrinkBuffer.resize(2);
      return index === 3 ? counted : value;
    });
  return show(shrinking) + ":" + conversions;
});
const growBuffer = new ArrayBuffer(2, { maxByteLength: 8 });
const growing = new Uint8Array(growBuffer);
report("value grows", () => {
  TypedArray.of.call(function () { return growing; }, {
    valueOf() {
      growBuffer.resize(4);
      return 6;
    },
  }, 7);
  return show(growing);
});
const ordered = new Int8Array(2);
report("of order", () => TypedArray.of.call(function () { return ordered; },
  { valueOf() { log.push("first"); return 1; } },
  { valueOf() { log.push("second"); return 2; } }));
report("of abrupt", () => Int8Array.of(1,
  { valueOf() { throw new TypeError("value"); } }, 3));

const changed = [1, 2, 3];
report("changed by conversion", () => Int8Array.from(changed, (value) => {
  changed[2] = 30;
  return value;
}));
const changing = { length: 2, 0: 1, 1: 2 };
report("array like changed", () => Int8Array.from(changing, (value) => {
  changing[1] = 20;
  return value;
}));

report("collection", () => {
  const values = [];
  for (let index = 0; index < 64; index = index + 1) values.push(index);
  const result = Float64Array.from(new Set(values), (value) =>
    ({ valueOf() { return String(value * 2); } }));
  return result.length + ":" + result[0] + ":" + result[63];
});

const originalFrom = TypedArray.from;
console.log("delete", delete TypedArray.from, "from" in Uint8Array,
  Uint8Array.from, Object.hasOwn(TypedArray, "from"));
TypedArray.from = originalFrom;
console.log("restored", Uint8Array.from([2])[0],
  Object.getOwnPropertyDescriptor(TypedArray, "from").enumerable);

/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
`,
  },
];
