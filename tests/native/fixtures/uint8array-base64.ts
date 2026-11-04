import type { Fixture } from "../fixture.ts";

/** A fixed native fixture of tests/uint8array-base64-native.test.ts. */
export interface Uint8ArrayBase64Fixture extends Fixture {
  /**
   * Compare with the independent model alone. Deno 2.9.7 keeps decoding
   * after setFromBase64 fills its target, which the edition and the pinned
   * test262 trailing-garbage rows reject, so it cannot be the reference.
   */
  readonly modelOnly?: true;
}

/*
 * The Uint8Array base64 and hex methods. The pinned Node.js lacks them, so
 * the independent model and Deno are the references. Each fixture ends
 * with a constructor shape guard miss and a false number hint, so the
 * enabled policy reaches the compiled generic fallback.
 */
const guardTail = `
let turn = 0;
while (turn < 2) {
  console.log("guard", Uint8Array.fromHex("0" + turn)[0]);
  if (turn === 0) Uint8Array.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 2), hinted("1", 2));
`;

export const base64Fixtures: readonly Uint8ArrayBase64Fixture[] = [
  {
    name: "uint8array-base64-surface",
    source: `
function describe(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  const value = descriptor.value;
  let constructs = false;
  try { new value(""); constructs = true; } catch (error) {
    constructs = !(error instanceof TypeError);
  }
  return [
    key,
    typeof value,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
    value.name,
    value.length,
    Object.hasOwn(value, "prototype"),
    constructs,
  ].join(":");
}
console.log("constructor", Reflect.ownKeys(Uint8Array).join(","));
console.log("prototype", Reflect.ownKeys(Uint8Array.prototype).join(","));
for (const key of ["fromBase64", "fromHex"]) {
  console.log("static", describe(Uint8Array, key));
}
for (const key of ["toBase64", "setFromBase64", "toHex", "setFromHex"]) {
  console.log("method", describe(Uint8Array.prototype, key));
}
console.log(
  "inherited",
  "toBase64" in Uint8ClampedArray.prototype,
  "fromHex" in Int8Array,
  Object.hasOwn(Uint8Array.prototype.toHex, "caller"),
);
function errorName(step) {
  try {
    const value = step();
    return "value:" + (value instanceof Uint8Array
      ? Array.from(value).join(".")
      : JSON.stringify(value));
  } catch (error) {
    return error.constructor.name;
  }
}
const methods = ["toBase64", "toHex", "setFromBase64", "setFromHex"];
const receivers = [
  ["clamped", new Uint8ClampedArray(2)],
  ["int8", new Int8Array(2)],
  ["uint16", new Uint16Array(2)],
  ["bigint", new BigUint64Array(1)],
  ["array", [1, 2]],
  ["object", {}],
  ["undefined", undefined],
  ["string", "AA"],
];
const touched = [];
const touchy = {
  get alphabet() { touched.push("alphabet"); return "base64"; },
  get lastChunkHandling() { touched.push("last"); return "loose"; },
  get omitPadding() { touched.push("omit"); return false; },
};
for (const name of methods) {
  const results = receivers.map(([label, receiver]) =>
    label + "=" + errorName(() =>
      Uint8Array.prototype[name].call(receiver, "AA", touchy)
    )
  );
  console.log("receiver", name, results.join(","), touched.length);
}
const subclass = class extends Uint8Array {};
console.log(
  "subclass",
  new subclass([1, 2]).toHex(),
  Uint8Array.fromHex.call(subclass, "0102") instanceof subclass,
  Object.getPrototypeOf(Uint8Array.fromBase64.call(null, "AQI=")) ===
    Uint8Array.prototype,
);
const bytes = new Uint8Array([0, 16, 131, 16, 81, 135, 32, 146, 139, 48, 211,
  143, 65, 20, 147, 81, 85, 151, 97, 150, 155, 113, 215, 159, 130, 24, 163,
  146, 89, 167, 162, 154, 171, 178, 219, 175, 195, 28, 179, 211, 93, 183, 227,
  158, 187, 243, 223, 191, 251, 255, 254]);
console.log("encode", bytes.toBase64());
console.log("encode-url", bytes.toBase64({ alphabet: "base64url" }));
console.log("hex", bytes.toHex());
for (let length = 0; length < 6; length = length + 1) {
  const slice = bytes.subarray(0, length);
  console.log(
    "pad",
    length,
    slice.toBase64(),
    slice.toBase64({ omitPadding: true }),
    slice.toBase64({ alphabet: "base64url", omitPadding: 1 }),
    slice.toHex(),
  );
}
const optionLog = [];
const logged = new Proxy({}, {
  get(target, key) {
    optionLog.push(String(key));
    if (key === "alphabet") return "base64url";
    if (key === "omitPadding") return "yes";
    return undefined;
  },
});
console.log("options", bytes.subarray(0, 4).toBase64(logged), optionLog.join());
const optionValues = [
  undefined,
  null,
  "base64",
  "base64url",
  "BASE64",
  "base64 ",
  Object("base64"),
  { toString() { return "base64"; } },
  1,
];
console.log(
  "alphabet",
  optionValues.map((alphabet) =>
    errorName(() => bytes.subarray(0, 2).toBase64({ alphabet }))
  ).join(","),
);
console.log(
  "options-type",
  [null, 1, "x", true, Symbol.iterator, 1n].map((options) =>
    errorName(() => bytes.toBase64(options))
  ).join(","),
  errorName(() => bytes.toBase64(function () {})),
  errorName(() => bytes.toBase64([])),
);
const coerced = { toString() { touched.push("toString"); return "AA"; } };
console.log(
  "string",
  [coerced, 1, null, undefined, Object("AA")].map((input) =>
    errorName(() => Uint8Array.fromBase64(input, touchy)) + "/" +
      errorName(() => Uint8Array.fromHex(input)) + "/" +
      errorName(() => new Uint8Array(2).setFromBase64(input, touchy)) + "/" +
      errorName(() => new Uint8Array(2).setFromHex(input))
  ).join(","),
  touched.join(),
);
${guardTail}`,
  },
  {
    name: "uint8array-base64-decode",
    source: `
function show(step) {
  try {
    const value = step();
    return value instanceof Uint8Array
      ? Array.from(value).join(".")
      : JSON.stringify(value);
  } catch (error) {
    return error.constructor.name;
  }
}
const handlings = [undefined, "loose", "strict", "stop-before-partial"];
const inputs = [
  "",
  "  ",
  "Zg",
  "Zg==",
  "Zg=",
  "Zg===",
  "Zh==",
  "Zh",
  "Zm8",
  "Zm8=",
  "Zm9=",
  "Zm9",
  "Zm9v",
  "Zm9vY",
  "Zm9vYm",
  "Zm9vYmE",
  "Zm9vYmFy",
  "Z\\tm\\n9\\fv\\rY m F y",
  " Zg = = ",
  "Zg = ",
  "Zg=\\u00a0=",
  "Zm9v=",
  "=",
  "Z=",
  "Zm9v====",
  "Zm 9v Y",
  "x-_y",
  "x+/y",
  "Zm9v#",
  "Zm9vYmFy\\u0000",
  "\\u00ffZm9v",
  "Zm9v\\ud800",
];
for (const input of inputs) {
  const cells = [];
  for (const lastChunkHandling of handlings) {
    for (const alphabet of ["base64", "base64url"]) {
      cells.push(show(() =>
        Uint8Array.fromBase64(input, { alphabet, lastChunkHandling })
      ));
    }
  }
  console.log("from", JSON.stringify(input), cells.join(" "));
}
console.log(
  "last-chunk-option",
  ["LOOSE", "", "stop", Object("loose"), 0, null].map((value) =>
    show(() => Uint8Array.fromBase64("Zg==", { lastChunkHandling: value }))
  ).join(","),
);
for (const size of [0, 1, 2, 5, 6, 7]) {
  const cells = [];
  for (const input of [
    "Zm9vYmFy",
    "Zm9vYmE=",
    "Zm9vYmE",
    "Zm9vYg==",
    "Zm9vYg",
    "MjYyZm.9v",
    "MjYyZg===",
    "#",
  ]) {
    for (const lastChunkHandling of handlings) {
      const target = new Uint8Array(size).fill(255);
      const result = show(() =>
        target.setFromBase64(input, { lastChunkHandling })
      );
      cells.push(result + "=" + Array.from(target).join("."));
    }
  }
  console.log("set", size, cells.join(" "));
}
const hexInputs = [
  "",
  "0",
  "00",
  "0f1E2d",
  "DEADbeef",
  "aaa",
  "aaa ",
  "aaag",
  " 00",
  "0x",
  "\\uff10\\uff10",
  "abcdef0123456789ABCDEF",
];
for (const input of hexInputs) {
  const cells = [show(() => Uint8Array.fromHex(input))];
  for (const size of [0, 1, 2, 3, 12]) {
    const target = new Uint8Array(size).fill(255);
    const result = show(() => target.setFromHex(input));
    cells.push(result + "=" + Array.from(target).join("."));
  }
  console.log("hex", JSON.stringify(input), cells.join(" "));
}
const long = new Uint8Array(3000);
for (let index = 0; index < long.length; index = index + 1) {
  long[index] = (index * 7 + (index >> 3)) & 255;
}
const longText = long.toBase64();
const longHex = long.toHex();
const roundTrip = Uint8Array.fromBase64(longText);
const roundHex = Uint8Array.fromHex(longHex);
let same = roundTrip.length === long.length && roundHex.length === long.length;
for (let index = 0; same && index < long.length; index = index + 1) {
  same = roundTrip[index] === long[index] && roundHex[index] === long[index];
}
console.log("long", longText.length, longHex.length, same, longText.slice(-12));
${guardTail}`,
  },
  {
    name: "uint8array-base64-buffers",
    source: `
function show(step) {
  try {
    const value = step();
    return value instanceof Uint8Array
      ? Array.from(value).join(".")
      : JSON.stringify(value);
  } catch (error) {
    return error.constructor.name;
  }
}
const detached = new Uint8Array([1, 2, 3]);
detached.buffer.transfer();
console.log(
  "detached",
  show(() => detached.toBase64()),
  show(() => detached.toHex()),
  show(() => detached.setFromBase64("AA==")),
  show(() => detached.setFromHex("00")),
  show(() => detached.setFromBase64("AA==", { alphabet: "nope" })),
  show(() => detached.setFromHex(1)),
);
const calls = [];
function detaching(view, key, value) {
  return {
    get [key]() {
      calls.push(key);
      view.buffer.transfer();
      return value;
    },
  };
}
const late = new Uint8Array([7, 8]);
console.log(
  "late-to",
  show(() => late.toBase64(detaching(late, "alphabet", "base64"))),
  late.length,
);
const lateSet = new Uint8Array(3);
console.log(
  "late-set",
  show(() =>
    lateSet.setFromBase64(
      "AAAA",
      detaching(lateSet, "lastChunkHandling", "loose"),
    )
  ),
  calls.join(),
);
const mutated = new Uint8Array([0]);
console.log(
  "mutate",
  mutated.toBase64({ get alphabet() { mutated[0] = 255; return "base64"; } }),
);
const resizable = new ArrayBuffer(4, { maxByteLength: 8 });
const tracking = new Uint8Array(resizable);
const fixed = new Uint8Array(resizable, 1, 2);
tracking.set([1, 2, 3, 4]);
console.log("resizable", tracking.toHex(), fixed.toHex(), fixed.toBase64());
resizable.resize(8);
console.log(
  "grown",
  tracking.toHex(),
  show(() => tracking.setFromHex("0a0b0c0d0e0f1011ff")),
  tracking.toHex(),
  fixed.toHex(),
);
resizable.resize(2);
console.log(
  "shrunk",
  tracking.toHex(),
  show(() => fixed.toHex()),
  show(() => fixed.toBase64()),
  show(() => fixed.setFromBase64("AAAA")),
  show(() => tracking.setFromBase64("/w==")),
  tracking.toHex(),
);
resizable.resize(0);
console.log(
  "empty",
  JSON.stringify(tracking.toBase64()),
  show(() => tracking.setFromBase64("####")),
  show(() => tracking.setFromHex("zz")),
  show(() => tracking.setFromHex("z")),
);
const shrinking = new ArrayBuffer(6, { maxByteLength: 6 });
const shrinkingView = new Uint8Array(shrinking, 2);
console.log(
  "shrink-in-option",
  show(() => shrinkingView.setFromHex("0102")),
  show(() =>
    shrinkingView.toBase64({
      get omitPadding() { shrinking.resize(1); return true; },
    })
  ),
);
const base = new Uint8Array([9, 9, 9, 9, 9, 9, 9]);
const middle = base.subarray(2, 5);
console.log(
  "subarray",
  show(() => middle.setFromBase64("Zm9vYmFy")),
  base.join("."),
  middle.toBase64(),
  show(() => middle.setFromHex("aabbccdd")),
  base.join("."),
);
const shared = new SharedArrayBuffer(4);
const sharedView = new Uint8Array(shared);
console.log(
  "shared",
  show(() => sharedView.setFromHex("01020304")),
  sharedView.toBase64(),
  Uint8Array.fromBase64(sharedView.toBase64()).buffer instanceof ArrayBuffer,
);
const decoded = Uint8Array.fromBase64("Zm9vYmFy");
console.log(
  "fresh",
  decoded.buffer.byteLength,
  decoded.byteOffset,
  decoded.buffer.resizable,
  Uint8Array.fromHex("").buffer.byteLength,
);
const views = [];
for (let index = 0; index < 64; index = index + 1) {
  views.push(Uint8Array.fromHex((index & 255).toString(16).padStart(2, "0")
    .repeat(index + 1)));
}
let total = 0;
for (const view of views) total = total + view.length + view[0];
console.log("collect", total, views[63].toBase64().length);
${guardTail}`,
  },
  {
    modelOnly: true,
    name: "uint8array-base64-full-target",
    source: `
function show(step) {
  try {
    return JSON.stringify(step());
  } catch (error) {
    return error.constructor.name;
  }
}
const handlings = ["loose", "strict", "stop-before-partial"];
const inputs = [
  "#",
  "a#",
  "aaaa#",
  "aaaaa#",
  "aaaaaa#",
  "aaaaaaa#",
  "aaaaaaaa#",
  "Zm9vYmE",
  "Zm9vYmFy#",
  "MjYyZm.9v",
  "MjYyZg===",
  "Zm9v Zm9v ====",
  "Zm9vYg",
  "Zm9vYg=",
];
for (const size of [0, 1, 2, 3, 4, 6]) {
  for (const input of inputs) {
    const cells = handlings.map((lastChunkHandling) => {
      const target = new Uint8Array(size).fill(255);
      const result = show(() =>
        target.setFromBase64(input, { lastChunkHandling })
      );
      return result + "=" + Array.from(target).join(".");
    });
    console.log("full", size, JSON.stringify(input), cells.join(" "));
  }
}
${guardTail}`,
  },
];
