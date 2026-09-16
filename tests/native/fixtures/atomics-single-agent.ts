import type { Fixture } from "../fixture.ts";

/*
 * Single-agent SharedArrayBuffer and Atomics observations on which ECMA-262,
 * Node.js, and Deno agree. The waitAsync rows avoid the two places where the
 * references diverge from the specification, which the native-only scenario
 * checks pin instead: every settled outcome is read by a later timer rather
 * than by a reaction ordered against a notification, and every timed waiter
 * is due before a pending timer keeps the event loop running.
 */
export const atomicsSingleAgentFixtures: readonly Fixture[] = [
  {
    name: "shared-array-buffer",
    source: `
function describeData(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return [
    typeof descriptor.value,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
  ].join(":");
}
function describeAccessor(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return [
    descriptor.get.name,
    descriptor.get.length,
    descriptor.set,
    descriptor.enumerable,
    descriptor.configurable,
  ].join(":");
}
function errorName(run) {
  try {
    const value = run();
    return "value " + String(value);
  } catch (error) {
    return error instanceof TypeError
      ? "TypeError"
      : error instanceof RangeError
        ? "RangeError"
        : error instanceof SyntaxError
          ? "SyntaxError"
          : "other " + String(error);
  }
}

const SAB = SharedArrayBuffer;
const SABPrototype = SAB.prototype;
console.log(
  "sab constructor",
  SAB.name,
  SAB.length,
  describeData(SAB, "prototype"),
  Object.getPrototypeOf(SAB) === Function.prototype,
  Object.getPrototypeOf(SABPrototype) === Object.prototype,
  SABPrototype.constructor === SAB,
  SABPrototype[Symbol.toStringTag],
  describeAccessor(SAB, Symbol.species),
  SAB[Symbol.species] === SAB,
);
for (const key of ["byteLength", "growable", "maxByteLength"]) {
  console.log("sab accessor", key, describeAccessor(SABPrototype, key));
}
for (const key of ["grow", "slice"]) {
  console.log(
    "sab method",
    key,
    SABPrototype[key].name,
    SABPrototype[key].length,
    describeData(SABPrototype, key),
    errorName(() => new SABPrototype[key]()),
  );
}
console.log(
  "sab construct errors",
  errorName(() => SAB(1)),
  errorName(() => new SAB(-1)),
  errorName(() => new SAB(2 ** 53)),
  errorName(() => new SAB(4, { maxByteLength: 2 })),
  errorName(() => new SAB(Symbol())),
);
const order = [];
const target = function () {}.bind();
Object.defineProperty(target, "prototype", {
  get() {
    order.push("prototype");
    return null;
  },
});
const traced = Reflect.construct(
  SAB,
  [
    {
      valueOf() {
        order.push("length");
        return 3;
      },
    },
    {
      get maxByteLength() {
        order.push("maxByteLength");
        return 5;
      },
    },
  ],
  target,
);
console.log(
  "sab construct order",
  order.join(),
  Object.getPrototypeOf(traced) === SABPrototype,
  traced.byteLength,
  traced.growable,
  traced.maxByteLength,
);
const fixed = new SAB(6);
console.log(
  "sab fixed",
  fixed.byteLength,
  fixed.growable,
  fixed.maxByteLength,
  Object.prototype.toString.call(fixed),
  errorName(() => fixed.grow(6)),
  new SAB().byteLength,
  new SAB(1.9).byteLength,
);
const growable = new SAB(2, { maxByteLength: 8 });
const tracking = new Uint8Array(growable);
const fixedView = new Uint16Array(growable, 0, 1);
tracking[1] = 7;
console.log(
  "sab grow",
  growable.grow(2),
  growable.byteLength,
  growable.grow(5.5),
  growable.byteLength,
  tracking.length,
  Array.from(tracking).join(),
  fixedView.length,
  errorName(() => growable.grow(4)),
  errorName(() => growable.grow(9)),
  errorName(() => growable.grow(-1)),
  growable.byteLength,
);
const brands = [
  ["ab byteLength", ArrayBuffer.prototype, "byteLength", fixed],
  ["ab maxByteLength", ArrayBuffer.prototype, "maxByteLength", fixed],
  ["ab resizable", ArrayBuffer.prototype, "resizable", fixed],
  ["ab detached", ArrayBuffer.prototype, "detached", fixed],
  ["sab byteLength", SABPrototype, "byteLength", new ArrayBuffer(1)],
  ["sab growable", SABPrototype, "growable", {}],
  ["sab maxByteLength", SABPrototype, "maxByteLength", 1],
];
for (const [label, prototype, key, receiver] of brands) {
  const getter = Object.getOwnPropertyDescriptor(prototype, key).get;
  console.log(
    "brand",
    label,
    errorName(() => getter.call(receiver)),
  );
}
for (const [label, run] of [
  ["ab slice", () => ArrayBuffer.prototype.slice.call(fixed)],
  ["ab resize", () => ArrayBuffer.prototype.resize.call(growable, 1)],
  ["ab transfer", () => ArrayBuffer.prototype.transfer.call(fixed)],
  ["sab slice", () => SABPrototype.slice.call(new ArrayBuffer(2))],
  ["sab grow fixed", () => SABPrototype.grow.call(fixed, 6)],
  [
    "sab grow resizable ab",
    () => SABPrototype.grow.call(new ArrayBuffer(1, { maxByteLength: 2 }), 2),
  ],
]) {
  console.log("brand method", label, errorName(run));
}
let converted = false;
console.log(
  "grow brand before length",
  errorName(() =>
    SABPrototype.grow.call(fixed, {
      valueOf() {
        converted = true;
        return 1;
      },
    }),
  ),
  converted,
);

const source = new SAB(8);
new Uint8Array(source).set([1, 2, 3, 4, 5, 6, 7, 8]);
const sliced = source.slice(2, -2);
console.log(
  "slice",
  sliced instanceof SAB,
  sliced.byteLength,
  Array.from(new Uint8Array(sliced)).join(),
  source.slice(-3).byteLength,
  source.slice(6, 2).byteLength,
  source.slice(-Infinity, Infinity).byteLength,
  Array.from(new Uint8Array(source.slice())).join(),
);
class Shared extends SAB {}
const subclassed = new Shared(4);
const subSlice = subclassed.slice(1);
console.log(
  "subclass",
  subclassed instanceof Shared,
  subSlice instanceof Shared,
  subSlice.byteLength,
  Shared[Symbol.species] === Shared,
);
for (const [label, species] of [
  ["array buffer", ArrayBuffer],
  ["same", undefined],
  ["short", undefined],
  ["not constructor", undefined],
]) {
  const receiver = new SAB(4);
  const constructor = {};
  if (label === "array buffer") {
    constructor[Symbol.species] = species;
  } else if (label === "same") {
    constructor[Symbol.species] = function () {
      return receiver;
    };
  } else if (label === "short") {
    constructor[Symbol.species] = function () {
      return new SAB(1);
    };
  } else {
    constructor[Symbol.species] = 1;
  }
  receiver.constructor = constructor;
  console.log(
    "species",
    label,
    errorName(() => receiver.slice(0, 2)),
  );
}
const plain = new ArrayBuffer(4);
plain.constructor = {
  [Symbol.species]: function () {
    return new SAB(4);
  },
};
console.log(
  "ab species shared",
  errorName(() => plain.slice(0, 2)),
);

const view = new DataView(source, 1, 4);
view.setInt16(0, -2);
console.log(
  "data view",
  view.buffer === source,
  view.byteLength,
  view.getInt16(0),
  new Uint8Array(source)[1],
  ArrayBuffer.isView(view),
  new Int32Array(source, 4).buffer === source,
);
const trackingView = new DataView(growable);
growable.grow(8);
console.log("data view tracking", trackingView.byteLength, tracking.length);

// A false Number hint on a SharedArrayBuffer length must not change
// behavior, so the enabled policy misses its guard and reaches the
// compiled generic fallback.
/** @param {number} left @param {number} right */
function hinted(left, right) {
  return left + right;
}
console.log("hint", hinted(fixed.byteLength, 1), hinted("a", "b"));
`,
  },
  {
    name: "atomics-single-agent",
    source: `
function errorName(run) {
  try {
    const value = run();
    return "value " + String(value);
  } catch (error) {
    return error instanceof TypeError
      ? "TypeError"
      : error instanceof RangeError
        ? "RangeError"
        : error instanceof SyntaxError
          ? "SyntaxError"
          : "other " + String(error);
  }
}

console.log(
  "namespace",
  typeof Atomics,
  Object.getPrototypeOf(Atomics) === Object.prototype,
  Object.prototype.toString.call(Atomics),
  errorName(() => Atomics()),
  errorName(() => new Atomics()),
);
const tag = Object.getOwnPropertyDescriptor(Atomics, Symbol.toStringTag);
console.log("tag", tag.value, tag.writable, tag.enumerable, tag.configurable);
for (const key of [
  "add",
  "and",
  "compareExchange",
  "exchange",
  "isLockFree",
  "load",
  "notify",
  "or",
  "store",
  "sub",
  "wait",
  "waitAsync",
  "xor",
]) {
  const descriptor = Object.getOwnPropertyDescriptor(Atomics, key);
  console.log(
    "function",
    key,
    descriptor.value.name,
    descriptor.value.length,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
    errorName(() => new descriptor.value()),
  );
}

const kinds = [
  Int8Array,
  Uint8Array,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
];
for (const Kind of kinds) {
  for (const buffer of [new SharedArrayBuffer(8), new ArrayBuffer(8)]) {
    const view = new Kind(buffer);
    const results = [
      Atomics.store(view, 0, 300.7),
      Atomics.store(view, 1, -0),
      Object.is(Atomics.store(view, 1, -0), 0),
      Atomics.store(view, 1, Infinity),
      Atomics.load(view, 0),
      Atomics.add(view, 0, 2 ** 40 + 1),
      Atomics.sub(view, 0, 5),
      Atomics.and(view, 0, 0xf0f),
      Atomics.or(view, 0, -256),
      Atomics.xor(view, 0, 0x55),
      Atomics.exchange(view, 0, "-3"),
      Atomics.compareExchange(view, 0, 2 ** 32 - 3, 9),
      Atomics.compareExchange(view, 0, 1, 2),
      Atomics.load(view, 0),
      Atomics.notify(
        view.length === 8 ? new Int32Array(8) : new Int32Array(buffer),
        0,
      ),
    ];
    console.log(Kind.name, buffer.constructor.name, results.join());
  }
}
for (const Kind of [BigInt64Array, BigUint64Array]) {
  const view = new Kind(new SharedArrayBuffer(16));
  const results = [
    Atomics.store(view, 0, 2n ** 64n + 5n),
    Atomics.load(view, 0),
    Atomics.add(view, 0, -9n),
    Atomics.sub(view, 0, 1n),
    Atomics.and(view, 0, 0xffn),
    Atomics.or(view, 1, -(2n ** 63n)),
    Atomics.xor(view, 1, 1n),
    Atomics.exchange(view, 1, true),
    Atomics.compareExchange(view, 1, 2n ** 64n + 1n, 7n),
    Atomics.load(view, 1),
    Atomics.store(view, 0, "12"),
  ];
  console.log(Kind.name, results.join());
  console.log(
    Kind.name,
    "conversions",
    errorName(() => Atomics.store(view, 0, 1)),
    errorName(() => Atomics.add(view, 0, "x")),
    errorName(() => Atomics.compareExchange(view, 0, 1n, Symbol())),
  );
}

const trace = [];
function traced(label, value) {
  return {
    valueOf() {
      trace.push(label);
      return value;
    },
  };
}
const shared = new Int32Array(new SharedArrayBuffer(16));
for (const [label, run] of [
  ["float", () => Atomics.add(new Float64Array(4), traced("index", 0), 1)],
  ["clamped", () => Atomics.load(new Uint8ClampedArray(4), traced("index", 0))],
  ["array", () => Atomics.load([1], traced("index", 0))],
  ["view", () => Atomics.load(new DataView(new ArrayBuffer(4)), 0)],
  ["negative", () => Atomics.load(shared, traced("index", -1))],
  [
    "past end",
    () => Atomics.store(shared, traced("index", 4), traced("value", 1)),
  ],
  ["symbol index", () => Atomics.load(shared, Symbol())],
  [
    "order",
    () =>
      Atomics.compareExchange(
        shared,
        traced("index", 1),
        traced("expected", 0),
        traced("replacement", 5),
      ),
  ],
  [
    "wait float",
    () =>
      Atomics.wait(
        new Float32Array(new SharedArrayBuffer(4)),
        traced("index", 0),
        0,
      ),
  ],
  [
    "wait uint32",
    () => Atomics.wait(new Uint32Array(new SharedArrayBuffer(4)), 0, 0),
  ],
  [
    "wait unshared",
    () => Atomics.wait(new Int32Array(4), traced("index", 0), 0),
  ],
  [
    "wait order",
    () =>
      Atomics.wait(
        shared,
        traced("index", 0),
        traced("value", 1),
        traced("timeout", 0),
      ),
  ],
  [
    "notify uint8",
    () => Atomics.notify(new Uint8Array(new SharedArrayBuffer(4)), 0),
  ],
  [
    "notify unshared",
    () =>
      Atomics.notify(new Int32Array(4), traced("index", 3), traced("count", 1)),
  ],
  [
    "notify range",
    () => Atomics.notify(shared, traced("index", 4), traced("count", 1)),
  ],
]) {
  trace.length = 0;
  const outcome = errorName(run);
  console.log("validate", label, outcome, trace.join());
}

const resizable = new ArrayBuffer(8, { maxByteLength: 16 });
const fixedOverResizable = new Int16Array(resizable, 0, 4);
const trackingOverResizable = new Int16Array(resizable);
console.log(
  "revalidate shrink fixed",
  errorName(() =>
    Atomics.store(fixedOverResizable, 3, {
      valueOf() {
        resizable.resize(4);
        return 1;
      },
    }),
  ),
);
resizable.resize(8);
console.log(
  "revalidate tracking in bounds",
  Atomics.store(trackingOverResizable, 1, {
    valueOf() {
      resizable.resize(4);
      return 6;
    },
  }),
  Atomics.load(trackingOverResizable, 1),
  trackingOverResizable.length,
);
const detachable = new Uint8Array(4);
console.log(
  "revalidate detach",
  errorName(() =>
    Atomics.sub(detachable, 0, {
      valueOf() {
        detachable.buffer.transfer();
        return 1;
      },
    }),
  ),
  errorName(() => Atomics.load(detachable, 0)),
);

console.log(
  "isLockFree",
  [-1, 0, 1, 2, 3, 4, 5, 8, 16, "4", Infinity, NaN]
    .map((size) => Atomics.isLockFree(size))
    .join(),
);

const waiting = new Int32Array(new SharedArrayBuffer(16));
const bigWaiting = new BigInt64Array(new SharedArrayBuffer(16));
Atomics.store(waiting, 1, -1);
Atomics.store(bigWaiting, 1, -1n);
console.log(
  "wait",
  Atomics.wait(waiting, 0, 1),
  Atomics.wait(waiting, 1, 2 ** 32 - 1, 0),
  Atomics.wait(waiting, 0, 0, 0),
  Atomics.wait(waiting, 0, 0.9, -Infinity),
  Atomics.wait(waiting, 0, "0", 1),
  Atomics.wait(bigWaiting, 1, 2n ** 64n - 1n, 0),
  Atomics.wait(bigWaiting, 0, 1n),
  errorName(() => Atomics.wait(bigWaiting, 0, 0)),
  errorName(() => Atomics.wait(waiting, 0, 0n)),
);
const immediate = [
  Atomics.waitAsync(waiting, 0, 1),
  Atomics.waitAsync(waiting, 0, 0, 0),
  Atomics.waitAsync(waiting, 0, 0, -5),
  Atomics.waitAsync(bigWaiting, 1, -1n, 0),
];
console.log(
  "waitAsync immediate",
  immediate
    .map((result) =>
      [
        Object.keys(result).join("+"),
        result.async,
        result.value,
        Object.getPrototypeOf(result) === Object.prototype,
      ].join(":"),
    )
    .join(" "),
);

const outcomes = {};
function watch(label, result) {
  outcomes[label] = "pending";
  console.log(
    "waitAsync",
    label,
    result.async,
    result.value instanceof Promise,
    Object.getPrototypeOf(result.value) === Promise.prototype,
  );
  result.value.then((value) => {
    outcomes[label] = value;
  });
}
watch("first", Atomics.waitAsync(waiting, 2, 0));
watch("second", Atomics.waitAsync(waiting, 2, 0, 100000));
watch("third", Atomics.waitAsync(waiting, 2, 0));
watch("other index", Atomics.waitAsync(waiting, 3, 0));
watch("big", Atomics.waitAsync(bigWaiting, 0, 0n, 100000));
console.log(
  "notify",
  Atomics.notify(waiting, 2, traced("count", 2)),
  Atomics.notify(waiting, 2, -1),
  Atomics.notify(new Int32Array(waiting.buffer, 8), 0, 0),
  Atomics.notify(bigWaiting, 0),
  Atomics.notify(waiting, 2, 1.9),
  Atomics.notify(waiting, 2),
);

// A false Number hint on an Atomics result must not change behavior, so
// the enabled policy misses its guard and reaches the generic fallback.
/** @param {number} left @param {number} right */
function hinted(left, right) {
  return left + right;
}
console.log("hint", hinted(Atomics.load(waiting, 1), 3), hinted("a", 3));

// The timed waiter starts in a short task of its own, so its deadline and
// the later report's deadline are both measured from nearly the same time.
setTimeout(() => {
  watch("timed", Atomics.waitAsync(waiting, 3, 0, 10));
  setTimeout(() => {
    console.log(
      "settled",
      Object.keys(outcomes)
        .sort()
        .map((label) => label + "=" + outcomes[label])
        .join(" "),
    );
    console.log("remaining", Atomics.notify(waiting, 3));
  }, 100);
}, 0);
`,
  },
];
