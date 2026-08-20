import type { Fixture } from "../fixture.ts";

export const dataViewFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "data-view",
    source: `
console.log("metadata", typeof DataView, DataView.name, DataView.length);
console.log(
  "links",
  Object.getPrototypeOf(DataView) === Function.prototype,
  Object.getPrototypeOf(DataView.prototype) === Object.prototype,
  DataView.prototype.constructor === DataView,
  DataView.hasOwnProperty("BYTES_PER_ELEMENT"),
);
const prototypeDescriptor = Object.getOwnPropertyDescriptor(
  DataView,
  "prototype",
);
console.log(
  "prototype descriptor",
  prototypeDescriptor.value === DataView.prototype,
  prototypeDescriptor.writable,
  prototypeDescriptor.enumerable,
  prototypeDescriptor.configurable,
);
const tagDescriptor = Object.getOwnPropertyDescriptor(
  DataView.prototype,
  Symbol.toStringTag,
);
console.log(
  "tag",
  tagDescriptor.value,
  tagDescriptor.writable,
  tagDescriptor.enumerable,
  tagDescriptor.configurable,
);
for (const name of ["buffer", "byteLength", "byteOffset"]) {
  const descriptor = Object.getOwnPropertyDescriptor(DataView.prototype, name);
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
const elements = [
  "Int8",
  "Uint8",
  "Int16",
  "Uint16",
  "Int32",
  "Uint32",
  "Float16",
  "Float32",
  "Float64",
  "BigInt64",
  "BigUint64",
];
for (const element of elements) {
  const getter = DataView.prototype["get" + element];
  const setter = DataView.prototype["set" + element];
  const descriptor = Object.getOwnPropertyDescriptor(
    DataView.prototype,
    "set" + element,
  );
  console.log(
    "method",
    getter.name,
    getter.length,
    setter.name,
    setter.length,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
  );
}

const buffer = new ArrayBuffer(24);
const whole = new DataView(buffer);
const window = new DataView(buffer, 4, 8);
console.log(
  "shape",
  whole.byteLength,
  whole.byteOffset,
  whole.buffer === buffer,
  window.byteLength,
  window.byteOffset,
  window.buffer === buffer,
  new DataView(buffer, 24).byteLength,
  new DataView(buffer, 8, 0).byteLength,
);
console.log(
  "brand",
  ArrayBuffer.isView(whole),
  ArrayBuffer.isView(buffer),
  ArrayBuffer.isView({}),
  ArrayBuffer.isView(),
  Object.prototype.toString.call(whole),
  whole instanceof DataView,
);

// Zero-initialized Data Block bytes are observable through a view for the
// first time here.
let initial = "";
for (let index = 0; index < 24; index = index + 1) {
  initial = initial + whole.getUint8(index);
}
console.log("zeroed", initial);

const integerCases = [
  0,
  -0,
  1,
  -1,
  127,
  128,
  255,
  256,
  -128,
  -129,
  32767,
  32768,
  65535,
  65536,
  -32768,
  -32769,
  2147483647,
  2147483648,
  4294967295,
  4294967296,
  -2147483648,
  -2147483649,
  1.9,
  -1.9,
  0.5,
  -0.5,
  1e21,
  -1e21,
  NaN,
  Infinity,
  -Infinity,
];
const integerKinds = [
  ["Int8", 1],
  ["Uint8", 1],
  ["Int16", 2],
  ["Uint16", 2],
  ["Int32", 4],
  ["Uint32", 4],
];
for (const kind of integerKinds) {
  for (const value of integerCases) {
    for (const little of [true, false]) {
      whole["set" + kind[0]](3, value, little);
      let bytes = "";
      for (let index = 0; index < kind[1]; index = index + 1) {
        bytes = bytes + "." + whole.getUint8(3 + index);
      }
      const read = whole["get" + kind[0]](3, little);
      console.log("int", kind[0], value, little, read, bytes);
    }
  }
}

// Float encodings, including both zeros, both infinities, NaN, and, for
// each of the three widths, the smallest subnormal, the smallest normal,
// the first normal binade, where the shared subnormal quantum and the
// binade's own quantum coincide, and the largest finite value. Only the
// two narrow widths also carry the rounding tie that overflows to
// infinity, because a binary64 operand is already binary64 and can never
// present setFloat64 with a finite value above its own range.
//
// These rows report the stored byte image and the class of the value
// read back rather than that value's text, because Number-to-String
// conversion still renders a few of these magnitudes as their exact
// decimal instead of the shortest round-tripping one, which is a
// separate gap owned by the Number family. The byte image is the
// contract this node owns.
const floatCases = [
  0,
  -0,
  1,
  -1,
  1.5,
  -1.5,
  0.25,
  1024.5,
  65504,
  65519,
  65520,
  65535,
  -65520,
  0.00006103515625,
  0.000091552734375,
  0.0001,
  0.00012201070785522461,
  0.000030517578125,
  5.960464477539063e-8,
  1.401298464324817e-45,
  5e-324,
  1.1754943508222875e-38,
  1.7625602864128504e-38,
  2.350988701644575e-38,
  2.2250738585072014e-308,
  3.34095865190759e-308,
  4.4501477170144023e-308,
  1.7976931348623157e308,
  1e-7,
  2049,
  2050,
  2051,
  3.4028234663852886e38,
  3.402823669209385e38,
  1e39,
  -1e39,
  1e-40,
  1e300,
  NaN,
  Infinity,
  -Infinity,
];
for (const kind of [["Float16", 2], ["Float32", 4], ["Float64", 8]]) {
  let caseIndex = 0;
  for (const value of floatCases) {
    for (const little of [true, false]) {
      whole["set" + kind[0]](5, value, little);
      let bytes = "";
      for (let index = 0; index < kind[1]; index = index + 1) {
        bytes = bytes + "." + whole.getUint8(5 + index);
      }
      const read = whole["get" + kind[0]](5, little);
      // Storing the value read back must reproduce the same bytes, which
      // is the round trip the specification's two conversions promise.
      whole["set" + kind[0]](13, read, little);
      let again = "";
      for (let index = 0; index < kind[1]; index = index + 1) {
        again = again + "." + whole.getUint8(13 + index);
      }
      console.log(
        "float",
        kind[0],
        caseIndex,
        little,
        bytes,
        again === bytes,
        Object.is(read, -0),
        read !== read,
        read === Infinity,
        read === -Infinity,
      );
    }
    caseIndex = caseIndex + 1;
  }
}

const bigCases = [
  0n,
  1n,
  -1n,
  255n,
  -255n,
  9223372036854775807n,
  -9223372036854775808n,
  9223372036854775808n,
  18446744073709551615n,
  18446744073709551616n,
  -18446744073709551617n,
  123456789012345678901234567890n,
  -99999999999999999999n,
];
for (const kind of ["BigInt64", "BigUint64"]) {
  for (const value of bigCases) {
    for (const little of [true, false]) {
      whole["set" + kind](7, value, little);
      let bytes = "";
      for (let index = 0; index < 8; index = index + 1) {
        bytes = bytes + "." + whole.getUint8(7 + index);
      }
      console.log(
        "big",
        kind,
        String(value),
        little,
        String(whole["get" + kind](7, little)),
        bytes,
      );
    }
  }
}

// Every unaligned start offset of an eight-byte element inside the same
// block, which no cast-based access could perform.
whole.setFloat64(0, 0);
for (let offset = 0; offset < 9; offset = offset + 1) {
  whole.setFloat64(offset, -2.5, offset % 2 === 0);
  console.log(
    "unaligned",
    offset,
    whole.getFloat64(offset, offset % 2 === 0),
    whole.getBigUint64(offset, false) === 0n,
  );
}

function attempt(label, thunk) {
  try {
    console.log(label, "ok", String(thunk()));
  } catch (error) {
    console.log(label, error.constructor.name);
  }
}
attempt("call-without-new", () => DataView(buffer));
attempt("no-buffer", () => new DataView());
attempt("plain-object-buffer", () => new DataView({}));
attempt("null-buffer", () => new DataView(null));
attempt("view-as-buffer", () => new DataView(whole));
attempt("negative-offset", () => new DataView(buffer, -1));
attempt("infinite-offset", () => new DataView(buffer, Infinity));
attempt("past-offset", () => new DataView(buffer, 25));
attempt("negative-length", () => new DataView(buffer, 0, -1));
attempt("past-length", () => new DataView(buffer, 20, 5));
attempt("symbol-offset", () => new DataView(buffer, Symbol("offset")));
attempt("bigint-offset", () => new DataView(buffer, 1n));
attempt("nan-offset", () => new DataView(buffer, NaN).byteOffset);
attempt("fractional-offset", () => new DataView(buffer, 2.9).byteOffset);
attempt("negative-fraction", () => new DataView(buffer, -0.5).byteOffset);
attempt("string-offset", () => new DataView(buffer, "4").byteOffset);
attempt(
  "undefined-length",
  () => new DataView(buffer, 4, undefined).byteLength,
);
attempt("brand-get", () => DataView.prototype.getInt8.call({}, 0));
attempt("brand-set", () => DataView.prototype.setInt8.call(buffer, 0, 0));
attempt("prototype-byte-length", () => DataView.prototype.byteLength);
attempt("prototype-buffer", () => DataView.prototype.buffer);
attempt("index-past-end", () => window.getInt32(5));
attempt("index-at-end", () => window.getInt32(4));
attempt("negative-index", () => window.getInt8(-1));
attempt("huge-index", () => window.getInt8(9007199254740992));
attempt("symbol-index", () => window.getInt8(Symbol("index")));
attempt("symbol-value", () => window.setInt32(0, Symbol("value")));
attempt("bigint-into-number", () => window.setInt32(0, 1n));
attempt("number-into-bigint", () => window.setBigInt64(0, 1));
attempt("null-into-bigint", () => window.setBigInt64(0, null));
attempt("string-into-bigint", () => {
  window.setBigInt64(0, "255");
  return window.getBigInt64(0);
});
attempt("bad-string-into-bigint", () => window.setBigInt64(0, "x"));

// The conversion order the specification fixes: ToIndex on the byte
// offset, then the value, then the bounds.
const order = [];
const offsetProbe = {
  valueOf() {
    order.push("offset");
    return 0;
  },
};
const valueProbe = {
  valueOf() {
    order.push("value");
    return 7;
  },
};
whole.setInt32(offsetProbe, valueProbe, true);
console.log("order", order.join(","), whole.getInt32(0, true));
attempt("order-abrupt-offset", () => {
  const failing = {
    valueOf() {
      order.push("failing-offset");
      throw new TypeError("offset");
    },
  };
  const unreached = {
    valueOf() {
      order.push("unreached-value");
      return 0;
    },
  };
  return whole.setInt32(failing, unreached);
});
console.log("order after abrupt", order.join(","));

// A conversion that detaches the buffer still reaches the specified
// TypeError, and one that shrinks a resizable buffer reaches the
// specified RangeError.
attempt("detach-during-value", () => {
  const target = new ArrayBuffer(8);
  const view = new DataView(target);
  return view.setInt32(0, {
    valueOf() {
      target.transfer();
      return 1;
    },
  });
});
attempt("shrink-during-value", () => {
  const target = new ArrayBuffer(8, { maxByteLength: 16 });
  const view = new DataView(target, 0, 8);
  return view.setInt32(4, {
    valueOf() {
      target.resize(2);
      return 1;
    },
  });
});
attempt("shrink-during-construction-offset", () => {
  const target = new ArrayBuffer(8, { maxByteLength: 16 });
  const shrink = {
    valueOf() {
      target.resize(2);
      return 4;
    },
  };
  return new DataView(target, shrink, 4).byteLength;
});
attempt("shrink-during-construction-length", () => {
  const target = new ArrayBuffer(8, { maxByteLength: 16 });
  const shrink = {
    valueOf() {
      target.resize(2);
      return 8;
    },
  };
  return new DataView(target, 0, shrink).byteLength;
});
// The specified byte-length bound compares against the byte length read
// before the length conversion, so growing the buffer inside that
// conversion does not widen it, while the byte-offset conversion runs
// before that read and does.
attempt("grow-during-construction-length", () => {
  const target = new ArrayBuffer(4, { maxByteLength: 16 });
  const grow = {
    valueOf() {
      target.resize(16);
      return 8;
    },
  };
  return new DataView(target, 0, grow).byteLength;
});
attempt("grow-during-construction-offset", () => {
  const target = new ArrayBuffer(4, { maxByteLength: 16 });
  const grow = {
    valueOf() {
      target.resize(16);
      return 8;
    },
  };
  return new DataView(target, grow).byteLength;
});
attempt("grow-during-construction-tracking", () => {
  const target = new ArrayBuffer(4, { maxByteLength: 16 });
  const grow = {
    valueOf() {
      target.resize(16);
      return 2;
    },
  };
  return new DataView(target, grow).byteLength;
});
attempt("detach-during-construction", () => {
  const target = new ArrayBuffer(8);
  const detacher = {
    valueOf() {
      target.transfer();
      return 0;
    },
  };
  return new DataView(target, detacher).byteLength;
});

// Detachment leaves the buffer reachable but every measurement and
// access rejected.
const detachable = new ArrayBuffer(8);
const detachedView = new DataView(detachable, 2, 4);
detachable.transfer();
console.log(
  "detached",
  detachedView.buffer === detachable,
  detachable.detached,
  ArrayBuffer.isView(detachedView),
);
attempt("detached-byte-length", () => detachedView.byteLength);
attempt("detached-byte-offset", () => detachedView.byteOffset);
attempt("detached-get", () => detachedView.getInt8(0));
attempt("detached-set", () => detachedView.setInt8(0, 1));

// A length-tracking view follows its resizable buffer, and a
// fixed-length view over the same buffer leaves its bounds when the
// buffer shrinks past them.
const resizable = new ArrayBuffer(8, { maxByteLength: 16 });
const tracking = new DataView(resizable, 2);
const fixed = new DataView(resizable, 2, 4);
console.log("tracking", tracking.byteLength, fixed.byteLength);
resizable.resize(16);
console.log("grown", tracking.byteLength, fixed.byteLength);
resizable.resize(6);
console.log("shrunk to the exact end", tracking.byteLength, fixed.byteLength);
resizable.resize(5);
console.log("shrunk past the fixed end", tracking.byteLength);
attempt("fixed-out-of-bounds", () => fixed.byteLength);
attempt("fixed-out-of-bounds-offset", () => fixed.byteOffset);
attempt("fixed-out-of-bounds-get", () => fixed.getInt8(0));
attempt("fixed-out-of-bounds-set", () => fixed.setInt8(0, 1));
resizable.resize(2);
console.log("empty tracking", tracking.byteLength, tracking.byteOffset);
resizable.resize(1);
attempt("tracking-out-of-bounds", () => tracking.byteLength);
attempt("tracking-out-of-bounds-offset", () => tracking.byteOffset);
attempt("tracking-out-of-bounds-get", () => tracking.getInt8(0));
resizable.resize(8);
console.log("restored", tracking.byteLength, fixed.byteLength);

class Subclass extends DataView {
  constructor(target) {
    super(target, 1, 2);
    this.marker = "sub";
  }
}
const subclass = new Subclass(buffer);
console.log(
  "subclass",
  subclass instanceof Subclass,
  subclass instanceof DataView,
  subclass.byteLength,
  subclass.byteOffset,
  subclass.marker,
  Object.getPrototypeOf(subclass) === Subclass.prototype,
);

// A false Number hint on a DataView receiver must not change behavior,
// and the repeated intrinsic reads deliberately miss the property shape
// guard once so the generic fallback runs.
/** @param {number} left @param {number} right */
function hinted(left, right) {
  return left + right;
}
console.log(
  "hint",
  hinted(whole.getInt8(0), whole.getInt8(1)),
  hinted(1, 2),
  hinted("a", "b"),
);
const originalGet = DataView.prototype.getInt8;
let turn = 0;
while (turn < 2) {
  console.log(
    "guard",
    DataView.prototype.getInt8 === originalGet,
    whole.getInt8(0),
  );
  if (turn === 0) DataView.prototype.marker = 1;
  turn = turn + 1;
}
delete DataView.prototype.marker;

// The global binding is a replaceable property of the global object.
const originalDataView = DataView;
DataView = 1;
console.log("global write", this.DataView === DataView, typeof DataView);
DataView = originalDataView;
console.log("global restore", this.DataView === DataView, typeof DataView);

// A view keeps its buffer, and therefore that buffer's Data Block, alive
// across collection pressure.
function survivor() {
  const target = new ArrayBuffer(16);
  const view = new DataView(target, 8, 8);
  view.setFloat64(0, 6.25);
  return view;
}
const survived = survivor();
for (let index = 0; index < 200; index = index + 1) {
  const garbage = new DataView(new ArrayBuffer(64), index % 32);
  garbage.setInt32(0, index, true);
}
console.log(
  "survived",
  survived.getFloat64(0),
  survived.byteLength,
  survived.byteOffset,
  survived.buffer.byteLength,
);
`,
  },
];
