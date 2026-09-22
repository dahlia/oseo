import type { Fixture } from "../fixture.ts";

export const stringPrototypePadFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "string-prototype-pad",
    source: `
const methods = [
  ["repeat", 1],
  ["padStart", 1],
  ["padEnd", 1],
  ["isWellFormed", 0],
  ["toWellFormed", 0],
];
for (const entry of methods) {
  const name = entry[0];
  const length = entry[1];
  const method = String.prototype[name];
  const descriptor = Object.getOwnPropertyDescriptor(String.prototype, name);
  console.log(
    "metadata",
    name,
    method.name === name,
    method.length === length,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
  );
  try { new method(); } catch (error) {
    console.log("not constructor", name, error instanceof TypeError);
  }
}

console.log(
  "repeat",
  "ab".repeat(3),
  "ab".repeat(2.9),
  "ab".repeat(NaN),
  "".repeat(9007199254740991),
);
for (const count of [-1, -Infinity, Infinity, 268435445]) {
  try { "ab".repeat(count); } catch (error) {
    console.log("repeat range", error instanceof RangeError);
  }
}

console.log(
  "pad",
  "abc".padStart(7, "01"),
  "abc".padEnd(8, "01"),
  "abc".padStart(5),
  "abc".padEnd(2, "x"),
  "abc".padStart(9, ""),
);
let skipped = false;
console.log(
  "skip filler",
  "abc".padStart(3, { toString() { skipped = true; return "x"; } }),
  skipped,
);
for (const name of ["padStart", "padEnd"]) {
  let order = "";
  try {
    String.prototype[name].call(
      { toString() { order = order + "r"; return ""; } },
      { valueOf() { order = order + "l"; return 536870889; } },
      { toString() { order = order + "p"; return "x"; } },
    );
  } catch (error) {
    console.log("pad range", name, error instanceof RangeError, order);
  }
}

const pair = String.fromCharCode(55357, 56832);
const lead = String.fromCharCode(55296);
const trail = String.fromCharCode(56320);
const replacement = String.fromCharCode(65533);
console.log(
  "well formed",
  "plain".isWellFormed(),
  pair.isWellFormed(),
  !lead.isWellFormed(),
  !trail.isWellFormed(),
  (lead + pair + trail).toWellFormed() ===
    replacement + pair + replacement,
  pair.toWellFormed() === pair,
);

let order = "";
const receiver = {
  toString() { order = order + "r"; return "xy"; },
};
console.log(
  "generic repeat",
  String.prototype.repeat.call(receiver, {
    valueOf() { order = order + "c"; return 2; },
  }),
  order,
);
order = "";
console.log(
  "generic pad",
  String.prototype.padEnd.call(
    receiver,
    { valueOf() { order = order + "l"; return 5; } },
    { toString() { order = order + "p"; return "ab"; } },
  ),
  order,
);
order = "";
console.log(
  "generic well formed",
  String.prototype.isWellFormed.call({
    toString() { order = order + "r"; return lead; },
  }),
  order,
);

for (const value of [null, undefined]) {
  try { String.prototype.toWellFormed.call(value); } catch (error) {
    console.log("nullish", error instanceof TypeError);
  }
}
try {
  String.prototype.repeat.call({
    toString() { throw new RangeError("receiver"); },
  }, { valueOf() { throw new TypeError("count"); } });
} catch (error) {
  console.log("receiver abrupt", error instanceof RangeError);
}

/** @param {string} value */
function hinted(value) { return value.padEnd(4, "!"); }
console.log("hint hit", hinted("a"));
console.log("false hint", hinted(new String("a")));
let turn = 0;
while (turn < 2) {
  console.log("guard", hinted("a"));
  if (turn === 0) String.prototype.padMarker = 1;
  turn = turn + 1;
}
`,
  },
];
