import type { Fixture } from "../fixture.ts";

export const arrayPrototypeIndexSearchFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "array-prototype-index-search",
    source: `
for (const name of ["at", "includes", "indexOf", "lastIndexOf"]) {
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
  try { new method(0); } catch (error) {
    console.log("not constructor", name, error instanceof TypeError);
  }
  for (const receiver of [undefined, null]) {
    try { method.call(receiver, 0); } catch (error) {
      console.log("nullish receiver", name, error instanceof TypeError);
    }
  }
}

const equality = [NaN, -0];
const shared = { label: "shared" };
equality[2] = shared;
equality.length = 4;
console.log(
  "equality",
  equality.indexOf(NaN),
  equality.includes(NaN),
  equality.indexOf(0),
  equality.includes(0),
  equality.indexOf(shared),
  equality.indexOf({ label: "shared" }),
  equality.indexOf(undefined),
  equality.includes(undefined),
);

const relative = ["a", "b", "a", "c"];
console.log(
  "relative",
  relative.indexOf("a"),
  relative.indexOf("a", 1),
  relative.indexOf("a", -2),
  relative.indexOf("a", Infinity),
  relative.indexOf("a", -Infinity),
  relative.lastIndexOf("a"),
  relative.lastIndexOf("a", 1),
  relative.lastIndexOf("a", -3),
  relative.lastIndexOf("a", Infinity),
  relative.lastIndexOf("a", -Infinity),
  relative.includes("b", -3),
  relative.includes("b", 2),
);
console.log(
  "fractional zero",
  1 / relative.indexOf("a", -0.5),
  1 / relative.lastIndexOf("a", -0.5),
);
console.log(
  "at",
  relative.at(0),
  relative.at(-1),
  relative.at(-4),
  String(relative.at(4)),
  String(relative.at(-5)),
  String(relative.at(Infinity)),
  String(relative.at(-Infinity)),
);

const inherited = { 1: "own", length: 4 };
Object.setPrototypeOf(inherited, { 0: "first", 2: "inherited" });
console.log(
  "generic inherited",
  Array.prototype.indexOf.call(inherited, "first"),
  Array.prototype.lastIndexOf.call(inherited, "inherited"),
  Array.prototype.includes.call(inherited, "inherited"),
  Array.prototype.at.call(inherited, 2),
  String(Array.prototype.at.call(inherited, 3)),
);
console.log(
  "primitive",
  Array.prototype.indexOf.call("aba", "a", 1),
  Array.prototype.lastIndexOf.call("aba", "a"),
  Array.prototype.includes.call("aba", "b"),
  Array.prototype.at.call("aba", -2),
);

for (const name of ["includes", "indexOf", "lastIndexOf"]) {
  let converted = 0;
  const from = {
    valueOf() { converted = converted + 1; return 0; },
  };
  const empty = { length: 0 };
  Array.prototype[name].call(empty, "x", from);
  console.log("empty skips index", name, converted);
}
let atConverted = 0;
Array.prototype.at.call(
  { length: 0 },
  { valueOf() { atConverted = atConverted + 1; return 0; } },
);
console.log("empty at converts index", atConverted);

const order = [];
const ordered = {
  0: "x",
  get length() { order.push("length"); return 1; },
};
const from = {
  valueOf() { order.push("from"); return 0; },
};
console.log(
  "order result",
  Array.prototype.indexOf.call(ordered, "x", from),
  order.join(","),
);

const access = [];
const observed = { length: 4 };
Object.defineProperty(observed, "0", {
  get() { access.push("get0"); return "a"; },
});
observed[2] = "a";
Object.defineProperty(observed, "3", {
  get() { access.push("get3"); delete observed[2]; return "x"; },
});
console.log(
  "live search",
  Array.prototype.lastIndexOf.call(observed, "a"),
  access.join(","),
);

for (const name of ["at", "includes", "indexOf", "lastIndexOf"]) {
  try {
    Array.prototype[name].call(
      { 0: "x", length: 1 },
      name === "at" ? Symbol("index") : "x",
      Symbol("from"),
    );
  } catch (error) {
    console.log("abrupt index", name, error instanceof TypeError);
  }
}

const collected = [{ value: 1 }, { value: 2 }, { value: 3 }];
console.log(
  "collected",
  collected.indexOf(collected[1]),
  collected.includes(collected[2]),
  collected.at(-1).value,
);

/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
let turn = 0;
while (turn < 3) {
  console.log("guard", hinted("guard"));
  if (turn === 1) String.prototype.arrayIndexSearchMarker = 1;
  turn = turn + 1;
}
const originalIs = Object.is;
turn = 0;
while (turn < 3) {
  console.log("shape", Object.is === originalIs);
  if (turn === 1) Object.arrayIndexSearchMarker = 1;
  turn = turn + 1;
}
`,
  },
];
