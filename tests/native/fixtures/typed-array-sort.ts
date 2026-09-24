import type { Fixture } from "../fixture.ts";

export const typedArraySortFixtures: readonly Fixture[] = [
  {
    name: "typed-array-sort",
    source: `
const TypedArray = Object.getPrototypeOf(Int8Array);
const TypedArrayPrototype = TypedArray.prototype;

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
  return values.join(",");
}

function report(label, thunk) {
  try {
    console.log(label, thunk());
  } catch (error) {
    console.log(label, "throw", error.constructor.name);
  }
}

for (const name of ["sort", "toSorted"]) {
  const method = TypedArrayPrototype[name];
  const descriptor = Object.getOwnPropertyDescriptor(TypedArrayPrototype, name);
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
    Object.hasOwn(Int8Array.prototype, name),
  );
}
console.log(
  "distinct",
  TypedArrayPrototype.sort === Array.prototype.sort,
  TypedArrayPrototype.toSorted === Array.prototype.toSorted,
);

for (const name of ["sort", "toSorted"]) {
  for (const comparator of [null, true, 1, "x", {}]) {
    report("invalid " + name, () =>
      TypedArrayPrototype[name].call(new Int8Array([2, 1]), comparator));
  }
  for (const receiver of [undefined, null, {}, [], Int8Array.prototype]) {
    report("receiver " + name, () =>
      TypedArrayPrototype[name].call(receiver));
  }
}

report("number default", () =>
  show(new Int16Array([20, 100, 3, -4, 0]).sort()));
report("float default", () =>
  show(new Float64Array([NaN, 2, 0, -0, -Infinity, Infinity, NaN]).sort()));
report("bigint default", () =>
  show(new BigInt64Array([20n, -3n, 100n, 0n]).sort()));
report("descending", () =>
  show(new Int16Array([1, 4, 2, 3]).sort((left, right) => right - left)));
report("coerced", () =>
  show(new Int16Array([3, 1, 2]).sort((left, right) => ({
    valueOf() { return String(left - right); },
  }))));
report("nan comparator", () =>
  show(new Int16Array([3, 1, 2]).sort(() => NaN)));
report("bigint comparator", () =>
  show(new BigInt64Array([3n, 1n, 2n]).sort((left, right) =>
    left < right ? 1 : left > right ? -1 : 0)));

const stable = new Int16Array([13, 10, 21, 12, 20, 11]);
report("stable", () =>
  show(stable.toSorted((left, right) =>
    Math.trunc(left / 10) - Math.trunc(right / 10))));

const inPlace = new Int16Array([3, 1, 2]);
const inPlaceResult = inPlace.sort();
console.log("in place", inPlaceResult === inPlace, show(inPlace));
const copied = new Int16Array([3, 1, 2]);
Object.defineProperty(copied, "constructor", {
  get() { throw new Error("constructor"); },
});
const copiedResult = copied.toSorted();
console.log(
  "copy",
  copiedResult === copied,
  copiedResult.constructor.name,
  show(copied),
  show(copiedResult),
);

for (const name of ["sort", "toSorted"]) {
  const view = new Int16Array([4, 3, 2, 1]);
  let calls = 0;
  report("abrupt " + name, () => {
    try {
      view[name](() => {
        calls = calls + 1;
        throw new RangeError("stop");
      });
    } finally {
      console.log("abrupt state", name, calls, show(view));
    }
  });
}
let coercionCalls = 0;
report("abrupt coercion", () =>
  new Int16Array([2, 1]).sort(() => ({
    valueOf() {
      coercionCalls = coercionCalls + 1;
      throw new EvalError("coercion");
    },
  })));
console.log("coercion calls", coercionCalls);

const shrinkBuffer = new ArrayBuffer(8, { maxByteLength: 12 });
const shrinking = new Int16Array(shrinkBuffer);
shrinking.set([4, 3, 2, 1]);
let shrunk = false;
const shrinkResult = shrinking.sort((left, right) => {
  if (!shrunk) {
    shrunk = true;
    shrinkBuffer.resize(4);
  }
  return left - right;
});
console.log("shrink sort", shrinkResult === shrinking, show(shrinking));

const copyBuffer = new ArrayBuffer(8, { maxByteLength: 12 });
const copySource = new Int16Array(copyBuffer);
copySource.set([4, 3, 2, 1]);
let copyShrunk = false;
const shrinkCopy = copySource.toSorted((left, right) => {
  if (!copyShrunk) {
    copyShrunk = true;
    copyBuffer.resize(4);
  }
  return left - right;
});
console.log("shrink copy", show(copySource), show(shrinkCopy));

const growBuffer = new ArrayBuffer(8, { maxByteLength: 12 });
const growing = new Int16Array(growBuffer);
growing.set([4, 3, 2, 1]);
let grown = false;
growing.sort((left, right) => {
  if (!grown) {
    grown = true;
    growBuffer.resize(12);
  }
  return left - right;
});
console.log("grow sort", show(growing));

for (const name of ["sort", "toSorted"]) {
  const buffer = new ArrayBuffer(8);
  const view = new Int16Array(buffer);
  view.set([4, 3, 2, 1]);
  let detached = false;
  report("detach callback " + name, () => {
    const result = view[name]((left, right) => {
      if (!detached) {
        detached = true;
        buffer.transfer();
      }
      return left - right;
    });
    return (result === view) + ":" + show(view) + ":" + show(result);
  });
}
for (const name of ["sort", "toSorted"]) {
  const buffer = new ArrayBuffer(8);
  const view = new Int16Array(buffer);
  buffer.transfer();
  report("detached receiver " + name, () => view[name]());
}
for (const name of ["sort", "toSorted"]) {
  const buffer = new ArrayBuffer(8, { maxByteLength: 8 });
  const view = new Int16Array(buffer, 2, 3);
  buffer.resize(2);
  report("out of bounds " + name, () => view[name]());
}

/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
`,
  },
];
