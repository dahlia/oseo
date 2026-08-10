import type { Fixture } from "../fixture.ts";

export const arrayBufferFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "array-buffer",
    source: `
console.log(
  "metadata",
  typeof ArrayBuffer,
  ArrayBuffer.name,
  ArrayBuffer.length,
);
const globalDescriptor = Object.getOwnPropertyDescriptor(this, "ArrayBuffer");
const prototypeDescriptor = Object.getOwnPropertyDescriptor(
  ArrayBuffer,
  "prototype",
);
const speciesDescriptor = Object.getOwnPropertyDescriptor(
  ArrayBuffer,
  Symbol.species,
);
const isViewDescriptor = Object.getOwnPropertyDescriptor(
  ArrayBuffer,
  "isView",
);
console.log(
  "constructor descriptors",
  globalDescriptor.writable,
  globalDescriptor.enumerable,
  globalDescriptor.configurable,
  prototypeDescriptor.writable,
  prototypeDescriptor.enumerable,
  prototypeDescriptor.configurable,
  isViewDescriptor.writable,
  isViewDescriptor.enumerable,
  isViewDescriptor.configurable,
  typeof speciesDescriptor.get,
  speciesDescriptor.set,
  speciesDescriptor.enumerable,
  speciesDescriptor.configurable,
  speciesDescriptor.get.name,
  speciesDescriptor.get.length,
);
console.log(
  "statics",
  ArrayBuffer.isView.name,
  ArrayBuffer.isView.length,
  ArrayBuffer[Symbol.species] === ArrayBuffer,
  Object.keys(ArrayBuffer).length,
);
const tagDescriptor = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  Symbol.toStringTag,
);
console.log(
  "prototype",
  ArrayBuffer.prototype.constructor === ArrayBuffer,
  Object.getPrototypeOf(ArrayBuffer.prototype) === Object.prototype,
  Object.keys(ArrayBuffer.prototype).length,
  tagDescriptor.value,
  tagDescriptor.writable,
  tagDescriptor.enumerable,
  tagDescriptor.configurable,
);
for (const name of ["byteLength", "detached", "maxByteLength", "resizable"]) {
  const descriptor = Object.getOwnPropertyDescriptor(
    ArrayBuffer.prototype,
    name,
  );
  console.log(
    "accessor",
    name,
    descriptor.get.name,
    descriptor.get.length,
    descriptor.set,
    descriptor.enumerable,
    descriptor.configurable,
  );
}
for (const name of ["resize", "slice", "transfer", "transferToFixedLength"]) {
  const descriptor = Object.getOwnPropertyDescriptor(
    ArrayBuffer.prototype,
    name,
  );
  console.log(
    "method",
    name,
    descriptor.value.name,
    descriptor.value.length,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
  );
}
const buffer = new ArrayBuffer(8);
console.log(
  "instance",
  buffer instanceof ArrayBuffer,
  Object.getPrototypeOf(buffer) === ArrayBuffer.prototype,
  Object.prototype.toString.call(buffer),
  Object.keys(buffer).length,
  typeof buffer,
);
console.log(
  "state",
  buffer.byteLength,
  buffer.maxByteLength,
  buffer.resizable,
  buffer.detached,
);
console.log(
  "empty",
  new ArrayBuffer().byteLength,
  new ArrayBuffer(0).byteLength,
  new ArrayBuffer(0).detached,
);
// ToIndex over every conversion class the constructor admits.
const conversions = [
  { label: "valueOf", value: { valueOf() { return 42; } } },
  { label: "toString", value: { toString() { return "7"; } } },
  { label: "empty string", value: "" },
  { label: "digit string", value: "3" },
  { label: "true", value: true },
  { label: "false", value: false },
  { label: "NaN", value: NaN },
  { label: "null", value: null },
  { label: "undefined", value: undefined },
  { label: "fraction", value: 1.9 },
  { label: "negative fraction", value: -0.99 },
];
for (const conversion of conversions) {
  console.log(
    "toIndex",
    conversion.label,
    new ArrayBuffer(conversion.value).byteLength,
  );
}
const invalidLengths = [
  { label: "negative", value: -1 },
  { label: "infinite", value: Infinity },
  { label: "negative infinite", value: -Infinity },
  { label: "beyond safe integers", value: 9007199254740992 },
];
for (const invalid of invalidLengths) {
  try {
    new ArrayBuffer(invalid.value);
    console.log("invalid length", invalid.label, "no error");
  } catch (error) {
    console.log("invalid length", invalid.label, error instanceof RangeError);
  }
}
// ToIndex reaches ToNumber, so the two numeric primitives it refuses are
// rejected before any allocation and leave no buffer behind.
try {
  new ArrayBuffer(Symbol("length"));
} catch (error) {
  console.log("symbol length", error instanceof TypeError);
}
try {
  new ArrayBuffer(1n);
} catch (error) {
  console.log("bigint length", error instanceof TypeError);
}
try {
  new ArrayBuffer(0, { maxByteLength: 2n });
} catch (error) {
  console.log("bigint maximum", error instanceof TypeError);
}
try {
  new ArrayBuffer(0, { maxByteLength: Symbol("max") });
} catch (error) {
  console.log("symbol maximum", error instanceof TypeError);
}
try {
  new ArrayBuffer({ valueOf() { throw new EvalError("length"); } });
} catch (error) {
  console.log("abrupt length", error instanceof EvalError);
}
try {
  ArrayBuffer(1);
} catch (error) {
  console.log("call without new", error instanceof TypeError);
}
try {
  new ArrayBuffer.isView(1);
} catch (error) {
  console.log("static not a constructor", error instanceof TypeError);
}
console.log(
  "isView",
  ArrayBuffer.isView(buffer),
  ArrayBuffer.isView(ArrayBuffer),
  ArrayBuffer.isView({}),
  ArrayBuffer.isView(null),
  ArrayBuffer.isView(1),
  ArrayBuffer.isView(),
);
// The options bag is read only when it is an object, and only its
// maxByteLength property is consulted.
const optionCases = [
  { label: "null", options: null },
  { label: "boolean", options: true },
  { label: "number", options: 9 },
  { label: "string", options: "options" },
  { label: "undefined", options: undefined },
  { label: "empty object", options: {} },
  { label: "explicit undefined", options: { maxByteLength: undefined } },
];
for (const optionCase of optionCases) {
  const created = new ArrayBuffer(0, optionCase.options);
  console.log(
    "options",
    optionCase.label,
    created.resizable,
    created.maxByteLength,
  );
}
const optionOrder = [];
try {
  new ArrayBuffer(0, {
    maxByteLength: {
      toString() { optionOrder.push("toString"); return {}; },
      valueOf() { optionOrder.push("valueOf"); return {}; },
    },
  });
} catch (error) {
  console.log(
    "maxByteLength object",
    error instanceof TypeError,
    optionOrder.length,
    optionOrder[0],
    optionOrder[1],
  );
}
try {
  new ArrayBuffer(0, { get maxByteLength() { throw new EvalError("max"); } });
} catch (error) {
  console.log("maxByteLength poisoned", error instanceof EvalError);
}
const invalidMaximums = [
  { label: "negative", length: 0, maximum: -1 },
  { label: "excessive", length: 0, maximum: 9007199254740992 },
  { label: "diminutive", length: 1, maximum: 0 },
];
for (const invalid of invalidMaximums) {
  try {
    new ArrayBuffer(invalid.length, { maxByteLength: invalid.maximum });
    console.log("invalid maximum", invalid.label, "no error");
  } catch (error) {
    console.log("invalid maximum", invalid.label, error instanceof RangeError);
  }
}
// A subclass reaches AllocateArrayBuffer through its own new target, so
// the length comparison still precedes the allocation.
class LengthOrder extends ArrayBuffer {}
try {
  new LengthOrder(4, { maxByteLength: 2 });
} catch (error) {
  console.log("subclass length order", error instanceof RangeError);
}
class Derived extends ArrayBuffer {}
const derived = new Derived(4, { maxByteLength: 8 });
console.log(
  "subclass",
  derived instanceof Derived,
  derived instanceof ArrayBuffer,
  Object.getPrototypeOf(derived) === Derived.prototype,
  derived.byteLength,
  derived.maxByteLength,
  derived.resizable,
  Derived[Symbol.species] === Derived,
);
const resizable = new ArrayBuffer(2, { maxByteLength: 8 });
console.log(
  "resizable state",
  resizable.byteLength,
  resizable.maxByteLength,
  resizable.resizable,
  resizable.detached,
);
resizable.resize(8);
console.log("grow", resizable.byteLength, resizable.maxByteLength);
resizable.resize(1);
console.log("shrink", resizable.byteLength);
resizable.resize(1);
console.log("same size", resizable.byteLength);
resizable.resize(0);
console.log("shrink to zero", resizable.byteLength);
resizable.resize();
console.log("absent length", resizable.byteLength);
resizable.resize({ valueOf() { return 5; } });
console.log("coerced length", resizable.byteLength);
const zeroMaximum = new ArrayBuffer(0, { maxByteLength: 0 });
zeroMaximum.resize(0);
console.log(
  "zero maximum",
  zeroMaximum.byteLength,
  zeroMaximum.maxByteLength,
  zeroMaximum.resizable,
);
try {
  resizable.resize(9);
} catch (error) {
  console.log("resize beyond maximum", error instanceof RangeError);
}
try {
  resizable.resize(-1);
} catch (error) {
  console.log("resize negative", error instanceof RangeError);
}
try {
  buffer.resize(1);
} catch (error) {
  console.log("resize fixed length", error instanceof TypeError);
}
// A length the conversion refuses leaves every operation's receiver
// exactly as it was, so no buffer is resized, detached, or copied.
for (const refused of [Symbol("length"), 3n]) {
  const preserved = new ArrayBuffer(4, { maxByteLength: 8 });
  const outcomes = [];
  for (const name of ["resize", "slice", "transfer", "transferToFixedLength"]) {
    try {
      preserved[name](refused);
      outcomes.push("none");
    } catch (error) {
      outcomes.push(error instanceof TypeError ? "type-error" : "unexpected");
    }
  }
  console.log(
    "refused length",
    typeof refused,
    outcomes[0],
    outcomes[1],
    outcomes[2],
    outcomes[3],
    preserved.byteLength,
    preserved.maxByteLength,
    preserved.detached,
  );
}
for (const name of ["resize", "slice", "transfer", "transferToFixedLength"]) {
  try {
    new ArrayBuffer.prototype[name]();
  } catch (error) {
    console.log("not a constructor", name, error instanceof TypeError);
  }
}
// A receiver without the ArrayBuffer brand is rejected by every
// accessor and prototype method, whether it is an ordinary object, a
// primitive, or the prototype itself.
const brandReceivers = [
  { label: "prototype", value: ArrayBuffer.prototype },
  { label: "object", value: {} },
  { label: "number", value: 1 },
  { label: "undefined", value: undefined },
  { label: "null", value: null },
];
for (const receiver of brandReceivers) {
  for (const name of ["byteLength", "detached", "maxByteLength", "resizable"]) {
    const accessor = Object.getOwnPropertyDescriptor(
      ArrayBuffer.prototype,
      name,
    ).get;
    try {
      accessor.call(receiver.value);
      console.log("accessor brand", receiver.label, name, "no error");
    } catch (error) {
      console.log(
        "accessor brand",
        receiver.label,
        name,
        error instanceof TypeError,
      );
    }
  }
  for (const name of ["resize", "slice", "transfer", "transferToFixedLength"]) {
    try {
      ArrayBuffer.prototype[name].call(receiver.value);
      console.log("method brand", receiver.label, name, "no error");
    } catch (error) {
      console.log(
        "method brand",
        receiver.label,
        name,
        error instanceof TypeError,
      );
    }
  }
}
// transfer keeps resizability, transferToFixedLength drops it, and both
// leave the source detached with a zero length.
const transferCases = [
  { label: "fixed to same", length: undefined, maximum: undefined },
  { label: "fixed to larger", length: 6, maximum: undefined },
  { label: "fixed to smaller", length: 2, maximum: undefined },
  { label: "fixed to zero", length: 0, maximum: undefined },
  { label: "resizable to same", length: undefined, maximum: 8 },
  { label: "resizable to larger", length: 6, maximum: 8 },
  { label: "resizable to smaller", length: 2, maximum: 8 },
  { label: "resizable to zero", length: 0, maximum: 8 },
];
for (const transferCase of transferCases) {
  for (const fixedLength of [false, true]) {
    const source = transferCase.maximum === undefined
      ? new ArrayBuffer(4)
      : new ArrayBuffer(4, { maxByteLength: transferCase.maximum });
    const destination = fixedLength
      ? (transferCase.length === undefined
          ? source.transferToFixedLength()
          : source.transferToFixedLength(transferCase.length))
      : (transferCase.length === undefined
          ? source.transfer()
          : source.transfer(transferCase.length));
    console.log(
      "transfer",
      transferCase.label,
      fixedLength,
      destination.byteLength,
      destination.maxByteLength,
      destination.resizable,
      destination.detached,
      Object.getPrototypeOf(destination) === ArrayBuffer.prototype,
      source.detached,
      source.byteLength,
      source.maxByteLength,
      source.resizable,
    );
  }
}
const detachedSource = new ArrayBuffer(4);
detachedSource.transfer();
for (const name of ["transfer", "transferToFixedLength", "slice"]) {
  try {
    detachedSource[name]();
  } catch (error) {
    console.log("detached source", name, error instanceof TypeError);
  }
}
try {
  new ArrayBuffer(4).transfer(9007199254740992);
} catch (error) {
  console.log("transfer excessive", error instanceof RangeError);
}
try {
  new ArrayBuffer(4, { maxByteLength: 4 }).transfer(5);
} catch (error) {
  console.log("transfer beyond maximum", error instanceof RangeError);
}
console.log(
  "transfer coerced",
  new ArrayBuffer(4).transfer({ valueOf() { return 3; } }).byteLength,
  new ArrayBuffer(4).transferToFixedLength("2").byteLength,
);
// A resizable source transferred to a fixed length reports its own
// length as its maximum, and the resulting buffer refuses resize.
const fixedFromResizable = new ArrayBuffer(4, { maxByteLength: 8 })
  .transferToFixedLength(3);
try {
  fixedFromResizable.resize(2);
} catch (error) {
  console.log(
    "fixed from resizable",
    fixedFromResizable.byteLength,
    fixedFromResizable.maxByteLength,
    fixedFromResizable.resizable,
    error instanceof TypeError,
  );
}
const sliceSource = new ArrayBuffer(8);
const sliceCases = [
  { label: "absent", start: undefined, end: undefined, useEnd: false },
  { label: "start only", start: 2, end: undefined, useEnd: false },
  { label: "undefined start", start: undefined, end: 5, useEnd: true },
  { label: "undefined end", start: 2, end: undefined, useEnd: true },
  { label: "range", start: 2, end: 5, useEnd: true },
  { label: "negative start", start: -3, end: undefined, useEnd: false },
  { label: "negative end", start: 0, end: -3, useEnd: true },
  { label: "start exceeds length", start: 20, end: undefined, useEnd: false },
  { label: "end exceeds length", start: 2, end: 20, useEnd: true },
  { label: "start exceeds end", start: 5, end: 2, useEnd: true },
  { label: "negative beyond length", start: -20, end: -20, useEnd: true },
  { label: "fractional", start: 1.9, end: 5.9, useEnd: true },
  {
    label: "coerced",
    start: "1",
    end: { valueOf() { return 4; } },
    useEnd: true,
  },
  { label: "infinite end", start: 0, end: Infinity, useEnd: true },
  { label: "negative infinite start", start: -Infinity, end: 4, useEnd: true },
];
for (const sliceCase of sliceCases) {
  const sliced = sliceCase.useEnd
    ? sliceSource.slice(sliceCase.start, sliceCase.end)
    : sliceSource.slice(sliceCase.start);
  console.log(
    "slice",
    sliceCase.label,
    sliced.byteLength,
    sliced === sliceSource,
    Object.getPrototypeOf(sliced) === ArrayBuffer.prototype,
    sliceSource.byteLength,
  );
}
try {
  sliceSource.slice({ valueOf() { throw new EvalError("start"); } });
} catch (error) {
  console.log("slice abrupt start", error instanceof EvalError);
}
try {
  sliceSource.slice(0, { valueOf() { throw new EvalError("end"); } });
} catch (error) {
  console.log("slice abrupt end", error instanceof EvalError);
}
// SpeciesConstructor drives the slice allocation, so every constructor
// lookup outcome is observable through it.
const speciesHost = new ArrayBuffer(8);
speciesHost.constructor = undefined;
console.log(
  "species undefined constructor",
  speciesHost.slice(0, 4).byteLength,
);
speciesHost.constructor = { [Symbol.species]: undefined };
console.log("species undefined", speciesHost.slice(0, 4).byteLength);
speciesHost.constructor = { [Symbol.species]: null };
console.log("species null", speciesHost.slice(0, 4).byteLength);
speciesHost.constructor = 5;
try {
  speciesHost.slice(0, 4);
} catch (error) {
  console.log("species non-object constructor", error instanceof TypeError);
}
speciesHost.constructor = { [Symbol.species]: 5 };
try {
  speciesHost.slice(0, 4);
} catch (error) {
  console.log("species non-constructor", error instanceof TypeError);
}
Object.defineProperty(speciesHost, "constructor", {
  configurable: true,
  get() { throw new EvalError("constructor"); },
});
try {
  speciesHost.slice(0, 4);
} catch (error) {
  console.log("species throwing constructor", error instanceof EvalError);
}
const speciesOwner = new ArrayBuffer(8);
function speciesConstructor(observed) {
  return function (length) {
    observed.push(length);
    return new ArrayBuffer(length);
  };
}
const observedLengths = [];
speciesOwner.constructor = {
  [Symbol.species]: speciesConstructor(observedLengths),
};
const speciesResult = speciesOwner.slice(1, 5);
console.log(
  "species constructed",
  speciesResult.byteLength,
  observedLengths.length,
  observedLengths[0],
);
speciesOwner.constructor = {
  [Symbol.species]: function () { return {}; },
};
try {
  speciesOwner.slice(0, 4);
} catch (error) {
  console.log("species not a buffer", error instanceof TypeError);
}
speciesOwner.constructor = {
  [Symbol.species]: function () { return speciesOwner; },
};
try {
  speciesOwner.slice(0, 4);
} catch (error) {
  console.log("species same buffer", error instanceof TypeError);
}
speciesOwner.constructor = {
  [Symbol.species]: function () { return new ArrayBuffer(1); },
};
try {
  speciesOwner.slice(0, 4);
} catch (error) {
  console.log("species too small", error instanceof TypeError);
}
speciesOwner.constructor = {
  [Symbol.species]: function () { return new ArrayBuffer(16); },
};
console.log("species larger", speciesOwner.slice(0, 4).byteLength);
const detachingOwner = new ArrayBuffer(8);
detachingOwner.constructor = {
  [Symbol.species]: function (length) {
    detachingOwner.transfer();
    return new ArrayBuffer(length);
  },
};
try {
  detachingOwner.slice(0, 4);
} catch (error) {
  console.log("species detaches source", error instanceof TypeError);
}
const detachedSpecies = new ArrayBuffer(8);
detachedSpecies.constructor = {
  [Symbol.species]: function (length) {
    const created = new ArrayBuffer(length);
    created.transfer();
    return created;
  },
};
try {
  detachedSpecies.slice(0, 4);
} catch (error) {
  console.log("species returns detached", error instanceof TypeError);
}
// Backing stores are owned by exactly one buffer, so a collection that
// reclaims discarded buffers must not disturb a survivor, a buffer whose
// store a transfer already released, or a store handed to a destination.
const survivor = new ArrayBuffer(64, { maxByteLength: 128 });
const released = new ArrayBuffer(32);
const moved = released.transfer(48);
let discarded = 0;
for (let index = 0; index < 64; index = index + 1) {
  const temporary = new ArrayBuffer(index, { maxByteLength: 128 });
  temporary.resize(index < 32 ? 128 : 0);
  discarded = discarded + temporary.byteLength;
  temporary.transfer(1).transferToFixedLength(0);
}
survivor.resize(96);
console.log(
  "collection pressure",
  discarded,
  survivor.byteLength,
  survivor.maxByteLength,
  released.detached,
  released.byteLength,
  moved.detached,
  moved.byteLength,
  moved.slice(8, 24).byteLength,
);
// Every specialized guard the fixture installs has a truthful and a
// false hint, so the compiled generic fallback runs in both policies.
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
const originalArrayBuffer = ArrayBuffer;
console.log("global read", ArrayBuffer === originalArrayBuffer);
ArrayBuffer = 7;
console.log("global write", ArrayBuffer, this.ArrayBuffer === ArrayBuffer);
ArrayBuffer = originalArrayBuffer;
console.log("global restore", ArrayBuffer === originalArrayBuffer);
console.log("global delete", delete this.ArrayBuffer, "ArrayBuffer" in this);
try {
  ArrayBuffer;
} catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
this.ArrayBuffer = originalArrayBuffer;
console.log("global reinstall", ArrayBuffer === originalArrayBuffer);
`,
  },
];
