import type { Fixture } from "../fixture.ts";

export const arrayPrototypeChangeByCopyFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "array-prototype-change-by-copy",
    source: `
function render(target) {
  let text = "";
  for (let index = 0; index < target.length; index = index + 1) {
    text = text + (
      Object.prototype.hasOwnProperty.call(target, index)
        ? String(target[index])
        : "<hole>"
    ) + ";";
  }
  return text;
}

for (const entry of [
  ["toReversed", 0],
  ["toSpliced", 2],
  ["with", 2],
]) {
  const name = entry[0];
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
  try { new method(); } catch (error) {
    console.log("not constructor", name, error instanceof TypeError);
  }
  for (const receiver of [undefined, null]) {
    try { method.call(receiver, 0, 0); } catch (error) {
      console.log("nullish", name, error instanceof TypeError);
    }
  }
}

const source = [0, 1, 2, 3, 4];
console.log("reversed", render(source.toReversed()), render(source));
console.log("spliced", render(source.toSpliced(1, 2, 8, 9)), render(source));
console.log(
  "spliced omitted",
  render(source.toSpliced()),
  render(source.toSpliced(1)),
  render(source.toSpliced(undefined)),
);
console.log("with", render(source.with(-2, 7)), render(source));
console.log("with negative zero", render(source.with(-0, 7)));
console.log("with fractional", render(source.with(-0.5, 7)));

const sparse = [0, , 2, , 4];
Array.prototype[3] = 30;
console.log("sparse reversed", render(sparse.toReversed()));
console.log("sparse spliced", render(sparse.toSpliced(2, 1, 8)));
console.log("sparse with", render(sparse.with(2, 8)));
delete Array.prototype[3];

const inherited = { 0: "a", 2: "c" };
const generic = Object.create(inherited);
generic[1] = "b";
generic.length = 3;
console.log(
  "generic",
  render(Array.prototype.toReversed.call(generic)),
  render(Array.prototype.toSpliced.call(generic, 1, 1, "x")),
  render(Array.prototype.with.call(generic, 1, "y")),
);
console.log(
  "primitive",
  render(Array.prototype.toReversed.call("abc")),
  render(Array.prototype.toSpliced.call("abc", 1, 1, "x")),
  render(Array.prototype.with.call("abc", 1, "y")),
);

const frozen = Object.freeze([1, 2, 3]);
console.log(
  "frozen",
  render(frozen.toReversed()),
  render(frozen.toSpliced(1, 1, 4)),
  render(frozen.with(1, 4)),
  render(frozen),
);

class Copied extends Array {
  static get [Symbol.species]() {
    console.log("unreachable species");
    return Copied;
  }
}
const speciesSource = new Copied();
speciesSource.push(1, 2, 3);
Object.defineProperty(speciesSource, "constructor", {
  get() { console.log("unreachable constructor"); return Copied; },
});
for (const result of [
  speciesSource.toReversed(),
  speciesSource.toSpliced(1, 1, 4),
  speciesSource.with(1, 4),
]) {
  console.log(
    "plain array",
    result instanceof Copied,
    Array.isArray(result),
    Object.getPrototypeOf(result) === Array.prototype,
    render(result),
  );
}

const order = [];
const observed = {
  get length() { order.push("length"); return 3; },
  get 0() { order.push("get 0"); return "a"; },
  get 1() { order.push("get 1"); return "b"; },
  get 2() { order.push("get 2"); return "c"; },
};
console.log(
  "reverse order",
  render(Array.prototype.toReversed.call(observed)),
  order.join(","),
);
order.length = 0;
console.log(
  "splice order",
  render(Array.prototype.toSpliced.call(observed, 1, 1, "x")),
  order.join(","),
);
order.length = 0;
console.log(
  "with order",
  render(Array.prototype.with.call(observed, 1, "x")),
  order.join(","),
);

const discarded = {
  0: "a",
  get 1() { throw new TypeError("discarded"); },
  2: "c",
  length: 3,
};
console.log(
  "discarded",
  render(Array.prototype.toSpliced.call(discarded, 1, 1)),
);
const replaced = ["a", "b", "c"];
Object.defineProperty(replaced, "1", {
  get() { throw new TypeError("replaced"); },
});
console.log("replaced", render(replaced.with(1, "x")));

const growing = [0, 1, 2];
Object.defineProperty(growing, "0", {
  get() { growing.push(3); return 0; },
});
console.log("growing reverse", render(growing.toReversed()), growing.length);
const shrinking = [0, 1, 2, 3];
Object.defineProperty(shrinking, "0", {
  get() { shrinking.length = 1; return 0; },
});
console.log("shrinking splice", render(shrinking.toSpliced(2, 0)));

for (const index of [3, 10, Infinity, -4, -10, -Infinity]) {
  try { source.with(index, 0); } catch (error) {
    console.log("range", String(index), error instanceof RangeError);
  }
}
try {
  source.with({ valueOf() { throw new TypeError("index"); } }, 0);
} catch (error) {
  console.log("abrupt index", error instanceof TypeError);
}
for (const method of ["toReversed", "toSpliced", "with"]) {
  try {
    Array.prototype[method].call(
      { get 0() { throw new TypeError("unreachable"); }, length: 4294967296 },
      0,
      0,
    );
  } catch (error) {
    console.log("length limit", method, error instanceof RangeError);
  }
}

const collected = [{ value: 1 }, { value: 2 }, { value: 3 }];
console.log(
  "collected",
  collected.toReversed()[0].value,
  collected.toSpliced(1, 1, { value: 4 })[1].value,
  collected.with(1, { value: 5 })[1].value,
);

/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
let turn = 0;
while (turn < 3) {
  console.log("guard", hinted("guard"));
  if (turn === 1) String.prototype.arrayChangeByCopyMarker = 1;
  turn = turn + 1;
}
`,
  },
];
