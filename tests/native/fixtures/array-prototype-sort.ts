import type { Fixture } from "../fixture.ts";

export const arrayPrototypeSortFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "array-prototype-sort",
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

for (const name of ["sort", "toSorted"]) {
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
  for (const comparator of [null, 1, "x", {}]) {
    const observer = {
      get length() { console.log("unreachable length", name); return 0; },
    };
    try { method.call(observer, comparator); } catch (error) {
      console.log("comparator check", name, error instanceof TypeError);
    }
  }
  for (const receiver of [undefined, null]) {
    try { method.call(receiver); } catch (error) {
      console.log("nullish receiver", name, error instanceof TypeError);
    }
  }
  console.log("undefined comparator", name, render(method.call([2, 1])));
}

console.log(
  "default order",
  render([undefined, 10, 9, null, "apple", 1].sort()),
);
console.log("empty", render([].sort()), render([].toSorted()));
console.log("single", render([7].sort()), render([7].toSorted()));

const sparse = [undefined, "c", , "b", undefined, , "a", "d"];
console.log("sparse before", sparse.length, render(sparse));
const sparseResult = sparse.sort();
console.log(
  "sparse after",
  sparseResult === sparse,
  sparse.length,
  render(sparse),
);
const sparseCopy = [undefined, "c", , "b", undefined, , "a", "d"].toSorted();
console.log("sparse copy", sparseCopy.length, render(sparseCopy));

const generic = { 0: "b", 2: "a", 4: "c", length: 5 };
const genericResult = Array.prototype.sort.call(generic);
console.log(
  "generic",
  genericResult === generic,
  generic.length,
  render(generic),
);
const genericCopy = Array.prototype.toSorted.call({
  0: "b",
  2: "a",
  length: 3,
});
console.log(
  "generic copy",
  Array.isArray(genericCopy),
  genericCopy.length,
  render(genericCopy),
);

console.log("primitive copy", render(Array.prototype.toSorted.call("ba")));
const primitiveEmpty = Array.prototype.sort.call("");
console.log(
  "primitive sort",
  typeof primitiveEmpty,
  primitiveEmpty instanceof String,
);
try { Array.prototype.sort.call("ba"); } catch (error) {
  console.log("primitive write", error instanceof TypeError);
}

const lengthy = {
  0: "b",
  1: "a",
  get length() { console.log("length read"); return "2"; },
};
console.log("length coercion", render(Array.prototype.toSorted.call(lengthy)));
console.log(
  "length truncation",
  render(Array.prototype.toSorted.call({ 0: "b", 1: "a", length: 1.9 })),
);
console.log(
  "negative length",
  render(Array.prototype.toSorted.call({ 0: "b", length: -1 })),
);
try {
  Array.prototype.toSorted.call({ length: 4294967296 });
} catch (error) {
  console.log("length limit", error instanceof RangeError);
}

const stable = [
  { key: 1, tag: "a" },
  { key: 0, tag: "b" },
  { key: 1, tag: "c" },
  { key: 0, tag: "d" },
  { key: 1, tag: "e" },
  { key: 0, tag: "f" },
  { key: 1, tag: "g" },
  { key: 0, tag: "h" },
  { key: 1, tag: "i" },
  { key: 0, tag: "j" },
  { key: 1, tag: "k" },
];
console.log(
  "stable",
  stable
    .toSorted((left, right) => left.key - right.key)
    .map((entry) => entry.tag)
    .join(""),
);
console.log(
  "stable equal",
  stable
    .toSorted(() => 0)
    .map((entry) => entry.tag)
    .join(""),
);
console.log(
  "stable nan",
  stable
    .toSorted(() => NaN)
    .map((entry) => entry.tag)
    .join(""),
);

console.log(
  "coerced order",
  render([3, 1, 2].toSorted((left, right) => String(left - right))),
);
console.log(
  "valueOf order",
  render([3, 1, 2].toSorted((left, right) => ({
    valueOf() { return left - right; },
  }))),
);
console.log(
  "infinite order",
  render([3, 1, 2].toSorted((left, right) => (left < right ? -Infinity : 1))),
);
console.log(
  "negative zero",
  render([2, 1].toSorted(() => -0)),
);

const abrupt = [5, 4, 3, 2, 1];
let comparisons = 0;
try {
  abrupt.sort(() => {
    comparisons = comparisons + 1;
    throw new TypeError("comparator");
  });
} catch (error) {
  console.log(
    "abrupt comparator",
    error instanceof TypeError,
    comparisons === 1,
  );
}
try {
  [3, 1, 2].toSorted(() => ({
    valueOf() { throw new TypeError("coercion"); },
  }));
} catch (error) {
  console.log("abrupt coercion", error instanceof TypeError);
}
try {
  [{ toString() { throw new TypeError("element"); } }, 1].sort();
} catch (error) {
  console.log("abrupt default", error instanceof TypeError);
}
try {
  Array.prototype.sort.call({
    get length() { throw new TypeError("length"); },
  });
} catch (error) {
  console.log("abrupt length", error instanceof TypeError);
}
try {
  const abruptRead = [1, 2];
  Object.defineProperty(abruptRead, "1", {
    get() { throw new TypeError("read"); },
  });
  abruptRead.sort();
} catch (error) {
  console.log("abrupt read", error instanceof TypeError);
}
try { Object.freeze([2, 1]).sort(); } catch (error) {
  console.log("frozen sort", error instanceof TypeError);
}
const undeletable = { 0: "b", length: 3 };
Object.defineProperty(undeletable, "2", {
  configurable: false,
  enumerable: true,
  value: "a",
  writable: true,
});
try { Array.prototype.sort.call(undeletable); } catch (error) {
  console.log(
    "abrupt delete",
    error instanceof TypeError,
    undeletable[0],
    undeletable[1],
    undeletable[2],
    undeletable.length,
  );
}
console.log("frozen copy", render(Object.freeze([2, 1]).toSorted()));

function observe(label, target, indices) {
  const parts = [];
  for (const index of indices) {
    parts.push(
      Object.prototype.hasOwnProperty.call(target, index)
        ? String(target[index])
        : "<hole>",
    );
  }
  console.log(label, target.length, parts.join(";"));
}

const appending = [undefined, "c", , "b", undefined, , "a", "d"];
Object.defineProperty(appending, "2", {
  configurable: true,
  get() { appending.push("foo"); appending.push("bar"); return this.stored; },
  set(value) { this.stored = value; },
});
appending.sort();
observe("appending", appending, [0, 1, 3, 4, 5, 6, 7, 8, 9]);
console.log(
  "appending accessor",
  Object.prototype.hasOwnProperty.call(appending, "2"),
  String(appending.stored),
);

const shrinking = [undefined, "c", , "b", undefined, , "a", "d"];
Object.defineProperty(shrinking, "2", {
  configurable: true,
  get() { shrinking.length = shrinking.length - 2; return this.stored; },
  set(value) { this.stored = value; },
});
shrinking.sort();
observe("shrinking", shrinking, [0, 1, 3, 4, 5]);
console.log("shrinking accessor", String(shrinking.stored));

const growing = [undefined, "c", , "b", undefined, , "a", "d"];
Object.defineProperty(growing, "2", {
  configurable: true,
  get() { growing.length = growing.length + 2; return this.stored; },
  set(value) { this.stored = value; },
});
growing.sort();
observe("growing", growing, [0, 1, 3, 4, 5, 6, 7, 8, 9]);
console.log("growing accessor", String(growing.stored));

const deleting = [undefined, "c", , "b", undefined, , "a", "d"];
Object.defineProperty(deleting, "2", {
  configurable: true,
  get() { delete deleting[3]; return this.stored; },
  set(value) { this.stored = value; },
});
deleting.sort();
observe("deleting", deleting, [0, 1, 3, 4, 5, 6, 7]);
console.log("deleting accessor", String(deleting.stored));

const setting = [undefined, "c", , "b", undefined, , "a", "d"];
Object.defineProperty(setting, "2", {
  configurable: true,
  get() { setting[3] = "z"; return this.stored; },
  set(value) { this.stored = value; },
});
setting.sort();
observe("setting", setting, [0, 1, 3, 4, 5, 6, 7]);
console.log("setting accessor", String(setting.stored));

const copied = [undefined, "c", , "b", undefined, , "a", "d"];
Object.defineProperty(copied, "2", {
  configurable: true,
  get() { copied.push("tail"); return "read"; },
});
const copiedResult = copied.toSorted();
observe("copied source", copied, [0, 1, 3, 4, 5, 6, 7, 8]);
observe("copied result", copiedResult, [0, 1, 2, 3, 4, 5, 6, 7]);

const inherited = { length: 3, 1: "b" };
Object.setPrototypeOf(inherited, { 0: "a", 2: "c" });
Array.prototype.sort.call(inherited);
console.log(
  "inherited",
  render(inherited),
  Object.prototype.hasOwnProperty.call(inherited, "0"),
  Object.prototype.hasOwnProperty.call(inherited, "2"),
);

const copySource = [3, 1, 2];
const copyResult = copySource.toSorted();
copyResult[0] = 99;
console.log("copy isolation", render(copySource), render(copyResult));

class Sorted extends Array {
  static get [Symbol.species]() {
    console.log("unreachable species");
    return Sorted;
  }
}
const speciesSource = new Sorted();
speciesSource.push(3, 1, 2);
Object.defineProperty(speciesSource, "constructor", {
  get() { console.log("unreachable constructor"); return Sorted; },
});
const speciesResult = speciesSource.toSorted();
console.log(
  "species",
  speciesResult instanceof Sorted,
  Array.isArray(speciesResult),
  Object.getPrototypeOf(speciesResult) === Array.prototype,
  render(speciesResult),
);

const collected = [{ value: 3 }, { value: 1 }, { value: 2 }];
const collectedSorted = collected.toSorted(
  (left, right) => left.value - right.value,
);
console.log(
  "collected",
  collectedSorted[0].value,
  collectedSorted[1].value,
  collectedSorted[2].value,
);

/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
let turn = 0;
while (turn < 3) {
  console.log("guard", hinted("guard"));
  if (turn === 1) String.prototype.arraySortingMarker = 1;
  turn = turn + 1;
}
`,
  },
];
