import type { Fixture } from "../fixture.ts";

export const typedArrayMutationFixtures: readonly Fixture[] = [
  {
    name: "typed-array-mutation",
    source: `
const TypedArray = Object.getPrototypeOf(Int8Array);
const TypedArrayPrototype = TypedArray.prototype;
const mutation = ["copyWithin", "fill", "reverse", "slice", "toReversed",
  "with"];
for (const key of mutation) {
  const method = TypedArrayPrototype[key];
  const descriptor = Object.getOwnPropertyDescriptor(TypedArrayPrototype, key);
  let constructible = true;
  try {
    new method(0, 1);
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
  "distinct",
  TypedArrayPrototype.copyWithin === Array.prototype.copyWithin,
  TypedArrayPrototype.fill === Array.prototype.fill,
  TypedArrayPrototype.reverse === Array.prototype.reverse,
  TypedArrayPrototype.slice === Array.prototype.slice,
  TypedArrayPrototype.toReversed === Array.prototype.toReversed,
  TypedArrayPrototype.with === Array.prototype.with,
);

function report(label, thunk) {
  try {
    console.log(label, String(thunk()));
  } catch (error) {
    console.log(label, "throw", error.constructor.name);
  }
}
const base = () => new Int16Array([1, 2, 3, 4, 5]);

report("copyWithin", () => base().copyWithin(0, 3));
report("copyWithin bounded", () => base().copyWithin(1, 3, 4));
report("copyWithin negative", () => base().copyWithin(-2, -3, -1));
report("copyWithin infinite", () =>
  base().copyWithin(0, -Infinity) + "|" + base().copyWithin(Infinity, 0) +
  "|" + base().copyWithin(0, 0, -Infinity) + "|" +
  base().copyWithin(0, 2, 100));
report("copyWithin overlap", () => base().copyWithin(2, 0));
report("copyWithin coerced", () =>
  base().copyWithin(1.9, 0.9) + "|" + base().copyWithin("1", "2") + "|" +
  base().copyWithin(null, undefined) + "|" + base().copyWithin(NaN, 2));
report("copyWithin order", () => {
  const seen = [];
  const hook = (name, value) => ({
    valueOf() {
      seen.push(name);
      return value;
    },
  });
  const result = base().copyWithin(hook("t", 0), hook("s", 1), hook("e", 3));
  return seen.join("|") + ":" + result.join(",");
});
report("copyWithin abrupt", () => {
  const seen = [];
  try {
    base().copyWithin(
      { valueOf() { seen.push("t"); return 0; } },
      { valueOf() { seen.push("s"); throw new RangeError("stop"); } },
      { valueOf() { seen.push("e"); return 3; } },
    );
  } catch (error) {
    return seen.join("|") + ":" + error.constructor.name;
  }
  return "no throw";
});
report("copyWithin identity", () => {
  const view = base();
  return view.copyWithin(0, 0) === view;
});

report("fill", () => base().fill(7));
report("fill bounded", () =>
  base().fill(7, 1, 3) + "|" + base().fill(7, -2) + "|" + base().fill(7, 3, 1));
report("fill coerced", () =>
  base().fill("8") + "|" + base().fill(null) + "|" + base().fill() + "|" +
  base().fill(true));
report("fill kinds", () =>
  new Float32Array(3).fill(1.5) + "|" + new Uint8ClampedArray(3).fill(300) +
  "|" + new Uint8Array(2).fill(-1) + "|" + new Float64Array(2).fill(NaN));
report("fill bigint", () =>
  new BigInt64Array(2).fill(5n) + "|" + new BigUint64Array(2).fill(-1n));
report("fill bigint mismatch", () => new BigInt64Array(2).fill(5));
report("fill number mismatch", () => new Int8Array(2).fill(5n));
report("fill order", () => {
  const seen = [];
  const hook = (name, value) => ({
    valueOf() {
      seen.push(name);
      return value;
    },
  });
  const result = base().fill(hook("v", 9), hook("s", 1), hook("e", 3));
  return seen.join("|") + ":" + result.join(",");
});
report("fill identity", () => {
  const view = base();
  return view.fill(0) === view;
});

report("reverse", () => base().reverse());
report("reverse odd", () => new Int8Array([1, 2, 3]).reverse());
report("reverse empty", () => new Int8Array(0).reverse() + "|" +
  new Int8Array([4]).reverse());
report("reverse identity", () => {
  const view = base();
  return view.reverse() === view;
});

report("slice", () => base().slice());
report("slice bounded", () =>
  base().slice(1, 3) + "|" + base().slice(-2) + "|" + base().slice(3, 1) +
  "|" + base().slice(-Infinity, Infinity) + "|" + base().slice(2, -9));
report("slice coerced", () =>
  base().slice("1", "3") + "|" + base().slice(null, undefined) + "|" +
  base().slice(1.8, 3.9));
report("slice fresh", () => {
  const view = base();
  const copy = view.slice();
  copy[0] = 99;
  return (copy === view) + ":" + view.join(",") + ":" + copy.join(",") +
    ":" + (copy.buffer === view.buffer);
});
report("slice constructor", () => base().slice(0, 2).constructor.name);
report("slice species", () => {
  class Sub extends Int16Array {
    static get [Symbol.species]() {
      return Int32Array;
    }
  }
  const result = new Sub([1, 2, 3, 4]).slice(1, 3);
  return result.constructor.name + ":" + result.join(",");
});
report("slice species short", () => {
  class Sub extends Int16Array {
    static get [Symbol.species]() {
      return function () {
        return new Int16Array(1);
      };
    }
  }
  return new Sub([1, 2, 3]).slice(0);
});
report("slice species content", () => {
  class Sub extends Int16Array {
    static get [Symbol.species]() {
      return BigInt64Array;
    }
  }
  return new Sub([1, 2, 3]).slice(0);
});
report("slice species abrupt", () => {
  class Sub extends Int16Array {
    static get [Symbol.species]() {
      throw new EvalError("species");
    }
  }
  return new Sub([1, 2]).slice(0);
});
report("slice species same buffer", () => {
  const view = new Int16Array([10, 20, 30, 40, 50, 60]);
  view.constructor = {
    [Symbol.species]: function () {
      return new Int16Array(view.buffer, 4);
    },
  };
  return view.slice(1, 4).join(",") + "|" + view.join(",");
});
report("slice species same buffer cross kind", () => {
  const view = new Int16Array([10, 20, 30, 40, 50, 60]);
  view.constructor = {
    [Symbol.species]: function () {
      return new Int8Array(view.buffer, 0, 4);
    },
  };
  return view.slice(1, 4).join(",") + "|" + view.join(",");
});
report("slice species zero count longer", () => {
  class Sub extends Int16Array {
    static get [Symbol.species]() {
      return function () {
        return new Int16Array([7, 8, 9]);
      };
    }
  }
  const result = new Sub([1, 2, 3]).slice(1, 1);
  return result.length + ":" + result.join(",");
});
report("slice species empty", () => {
  let created = 0;
  class Sub extends Int16Array {
    static get [Symbol.species]() {
      created += 1;
      return Int16Array;
    }
  }
  const result = new Sub([1, 2]).slice(1, 1);
  return created + ":" + result.length;
});

report("toReversed", () => base().toReversed());
report("toReversed empty", () => new Int8Array(0).toReversed().length);
report("toReversed fresh", () => {
  const view = base();
  const copy = view.toReversed();
  return (copy === view) + ":" + view.join(",") + ":" + copy.join(",");
});
report("toReversed species", () => {
  class Sub extends Int16Array {
    static get [Symbol.species]() {
      return Int32Array;
    }
  }
  return new Sub([1, 2]).toReversed().constructor.name;
});

report("with", () => base().with(0, 9));
report("with negative", () => base().with(-1, 9));
report("with out of range", () =>
  String(base().with(5, 9)) + "|" + String(base().with(-6, 9)));
report("with coerced", () =>
  base().with(1.7, 9) + "|" + base().with("2", "12") + "|" +
  base().with(null, null) + "|" + base().with(0, undefined));
report("with empty", () => new Int8Array(0).with(0, 1));
report("with bigint", () => new BigInt64Array([1n, 2n]).with(0, 7n));
report("with bigint mismatch", () => new BigInt64Array([1n]).with(0, 2));
report("with species", () => {
  class Sub extends Int16Array {
    static get [Symbol.species]() {
      return Int32Array;
    }
  }
  return new Sub([1, 2]).with(0, 5).constructor.name;
});
report("with order", () => {
  const seen = [];
  const result = base().with(
    { valueOf() { seen.push("i"); return 0; } },
    { valueOf() { seen.push("v"); return 8; } },
  );
  return seen.join("|") + ":" + result.join(",");
});
report("with order invalid", () => {
  const seen = [];
  try {
    base().with(
      { valueOf() { seen.push("i"); return 99; } },
      { valueOf() { seen.push("v"); return 8; } },
    );
  } catch (error) {
    return seen.join("|") + ":" + error.constructor.name;
  }
  return "no throw";
});

for (const key of mutation) {
  report("receiver " + key, () =>
    TypedArrayPrototype[key].call([1, 2, 3], 0, 1));
  report("primitive " + key, () => TypedArrayPrototype[key].call(4, 0, 1));
  report("detached " + key, () => {
    const buffer = new ArrayBuffer(8);
    const view = new Int8Array(buffer);
    buffer.transfer();
    return TypedArrayPrototype[key].call(view, 0, 1);
  });
}

const offsetBuffer = new ArrayBuffer(24);
const offset = new Int32Array(offsetBuffer, 8, 3);
offset.set([7, 8, 9]);
console.log(
  "offset",
  offset.slice(1).join(","),
  offset.toReversed().join(","),
  offset.with(1, 5).join(","),
  offset.copyWithin(0, 1).join(","),
  new Int32Array(offsetBuffer).join(","),
);

const resizable = new ArrayBuffer(10, { maxByteLength: 20 });
const tracking = new Int16Array(resizable);
tracking.set([1, 2, 3, 4, 5]);
report("shrink copyWithin", () => {
  const result = tracking.copyWithin(0, 3, {
    valueOf() {
      resizable.resize(6);
      return 5;
    },
  });
  return result.length + ":" + result.join(",");
});
resizable.resize(10);
tracking.set([1, 2, 3, 4, 5]);
report("shrink copyWithin backward", () => {
  const result = tracking.copyWithin(2, 0, {
    valueOf() {
      resizable.resize(6);
      return 3;
    },
  });
  return result.length + ":" + result.join(",");
});
resizable.resize(10);
tracking.set([1, 2, 3, 4, 5]);
report("grow copyWithin", () => {
  const result = tracking.copyWithin(0, 1, {
    valueOf() {
      resizable.resize(20);
      return 3;
    },
  });
  return result.length + ":" + result.join(",");
});
resizable.resize(10);
tracking.set([1, 2, 3, 4, 5]);
report("shrink fill", () => {
  const result = tracking.fill(7, 0, {
    valueOf() {
      resizable.resize(4);
      return 5;
    },
  });
  return result.length + ":" + result.join(",");
});
resizable.resize(10);
tracking.set([1, 2, 3, 4, 5]);
report("shrink fill value", () => {
  const result = tracking.fill({
    valueOf() {
      resizable.resize(6);
      return 7;
    },
  });
  return result.length + ":" + result.join(",");
});
resizable.resize(10);
tracking.set([1, 2, 3, 4, 5]);
report("shrink slice", () => {
  class Sub extends Int16Array {
    static get [Symbol.species]() {
      return function (length) {
        resizable.resize(4);
        return new Int16Array(length);
      };
    }
  }
  const view = new Sub(resizable);
  const result = view.slice(0);
  return result.length + ":" + result.join(",");
});
resizable.resize(10);
tracking.set([1, 2, 3, 4, 5]);
report("shrink slice tail", () => {
  class Sub extends Int16Array {
    static get [Symbol.species]() {
      return function (length) {
        resizable.resize(4);
        return new Int16Array(length);
      };
    }
  }
  const result = new Sub(resizable).slice(3);
  return result.length + ":" + result.join(",");
});
resizable.resize(10);
tracking.set([1, 2, 3, 4, 5]);
report("shrink with", () => {
  const result = tracking.with(0, {
    valueOf() {
      resizable.resize(4);
      return 9;
    },
  });
  return result.length + ":" + result.join(",");
});
resizable.resize(10);
tracking.set([1, 2, 3, 4, 5]);
report("shrink with invalid", () =>
  tracking.with(4, {
    valueOf() {
      resizable.resize(4);
      return 9;
    },
  }));
resizable.resize(4);
tracking.set([1, 2]);
report("grow with", () => {
  const result = tracking.with(3, {
    valueOf() {
      resizable.resize(20);
      return 9;
    },
  });
  return result.length + ":" + result.join(",");
});
resizable.resize(10);
tracking.set([1, 2, 3, 4, 5]);
report("detach fill", () => {
  const buffer = new ArrayBuffer(8);
  const view = new Int8Array(buffer);
  return view.fill({
    valueOf() {
      buffer.transfer();
      return 1;
    },
  });
});
report("detach slice", () => {
  const buffer = new ArrayBuffer(8);
  const view = new Int8Array(buffer);
  return view.slice({
    valueOf() {
      buffer.transfer();
      return 0;
    },
  });
});
report("detach with", () => {
  const buffer = new ArrayBuffer(8);
  const view = new Int16Array(buffer);
  return view.with(0, {
    valueOf() {
      buffer.transfer();
      return 9;
    },
  });
});
report("shrink with bigint", () => {
  const buffer = new ArrayBuffer(32, { maxByteLength: 32 });
  const view = new BigInt64Array(buffer);
  view.set([1n, 2n, 3n, 4n]);
  return view.with(0, {
    valueOf() {
      buffer.resize(16);
      return 9n;
    },
  });
});

const payload = new Float64Array(2);
const payloadBytes = new Uint8Array(payload.buffer);
payloadBytes.set([1, 2, 3, 4, 5, 6, 0xf8, 0x7f], 0);
payload[1] = 9;
console.log(
  "nan payload",
  new Uint8Array(payload.slice(0).buffer).join(","),
  new Uint8Array(payload.toReversed().buffer).join(","),
  new Uint8Array(payload.with(1, 4).buffer).join(","),
);
payload.reverse();
console.log("nan reverse", payloadBytes.join(","));

const collected = new Int8Array([4, 5, 6, 7]);
let collectedTotal = 0;
const collectedCopy = collected.slice({
  valueOf() {
    for (let index = 0; index < 20; index += 1) {
      collectedTotal = collectedTotal + { index }.index;
    }
    return 1;
  },
});
const collectedWith = collected.with(0, {
  valueOf() {
    const pieces = [];
    for (let index = 0; index < 20; index += 1) pieces.push({ index });
    return pieces.length;
  },
});
console.log(
  "collected",
  collectedTotal,
  collectedCopy.join(","),
  collectedWith.join(","),
);

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
  if (turn === 0) String.prototype.mutationMarker = 1;
  turn = turn + 1;
}
console.log("method stable", String.prototype.charAt === originalCharAt);
`,
  },
];
