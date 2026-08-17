import type { Fixture } from "../fixture.ts";

export const numberPrototypeFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "number-prototype",
    source: `
const methods = [
  ["toString", 1],
  ["toFixed", 1],
  ["toExponential", 1],
  ["toPrecision", 1],
  ["toLocaleString", 0],
  ["valueOf", 0],
];
for (const entry of methods) {
  const name = entry[0];
  const length = entry[1];
  const method = Number.prototype[name];
  const descriptor = Object.getOwnPropertyDescriptor(Number.prototype, name);
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
  "toString radix",
  (255).toString(16),
  (8).toString(2),
  (-255).toString(16),
  (0).toString(2),
  (-0).toString(2),
  NaN.toString(2),
  (1 / 0).toString(2),
  (-1 / 0).toString(2),
  (0.5).toString(2),
  (0.25).toString(16),
  (35).toString(36),
  (-35).toString(36),
  (123).toString(10),
  (123).toString(),
  (123.456).toString(),
  (1e21).toString(),
);

console.log(
  "valueOf",
  new Number(42).valueOf(),
  (5).valueOf(),
  Number.prototype.valueOf.call(new Number(-7)),
);

console.log(
  "toFixed",
  (123.456).toFixed(2),
  (0).toFixed(2),
  (1.005).toFixed(2),
  (-1.5).toFixed(0),
  (1.5).toFixed(0),
  (2.5).toFixed(0),
  NaN.toFixed(2),
  (1e21).toFixed(2),
  (123).toFixed(),
  (-0).toFixed(2),
);

console.log(
  "toExponential",
  (123.456).toExponential(),
  (123.456).toExponential(2),
  (0).toExponential(2),
  (0).toExponential(),
  (1234).toExponential(0),
  NaN.toExponential(),
  (1 / 0).toExponential(),
  (-123.456).toExponential(2),
);

console.log(
  "toPrecision",
  (123.456).toPrecision(),
  (123.456).toPrecision(2),
  (123.456).toPrecision(6),
  (0.00001234).toPrecision(2),
  (123).toPrecision(2),
  (0).toPrecision(4),
  NaN.toPrecision(),
  (1 / 0).toPrecision(3),
);

console.log("toLocaleString", (5).toLocaleString(), (0).toLocaleString());

for (const value of [1, -1, 0, "not a number", true, null, undefined]) {
  try { Number.prototype.toString.call(value); } catch (error) {
    console.log("generic call rejection toString", error instanceof TypeError);
  }
}
for (const value of ["x", {}, [], Symbol("s")]) {
  try { Number.prototype.valueOf.call(value); } catch (error) {
    console.log("generic call rejection valueOf", error instanceof TypeError);
  }
}
try { Number.prototype.toFixed.call(null, 2); } catch (error) {
  console.log("generic call rejection toFixed", error instanceof TypeError);
}
console.log(
  "wrapper receiver",
  Number.prototype.toString.call(new Number(9)),
  Number.prototype.toFixed.call(new Number(1.5), 1),
);

for (const radix of [1, 37, 0, -1, NaN, Infinity]) {
  try { (5).toString(radix); } catch (error) {
    console.log("radix range", error instanceof RangeError);
  }
}
for (const digits of [-1, 101, NaN, Infinity, -Infinity]) {
  try { (5).toFixed(digits); } catch (error) {
    console.log("toFixed range", error instanceof RangeError);
  }
  try { (5).toExponential(digits); } catch (error) {
    console.log("toExponential range", error instanceof RangeError);
  }
}
for (const precision of [0, 101, NaN, Infinity, -Infinity]) {
  try { (5).toPrecision(precision); } catch (error) {
    console.log("toPrecision range", error instanceof RangeError);
  }
}

let order = "";
const radixArgument = {
  valueOf() { order = order + "r"; return 16; },
};
console.log(
  "toString conversion order",
  (255).toString(radixArgument),
  order,
);
order = "";
const digitsArgument = {
  valueOf() { order = order + "d"; return 2; },
};
console.log("toFixed conversion order", (1.005).toFixed(digitsArgument), order);
order = "";
console.log(
  "toExponential conversion order",
  (123.456).toExponential(digitsArgument),
  order,
);
order = "";
const precisionArgument = {
  valueOf() { order = order + "p"; return 4; },
};
console.log(
  "toPrecision conversion order",
  (123.456).toPrecision(precisionArgument),
  order,
);

let abruptReached = false;
const abruptArgument = {
  valueOf() {
    abruptReached = true;
    throw new RangeError("argument");
  },
};
try { Number.prototype.toString.call(1, abruptArgument); } catch (error) {
  console.log(
    "toString abrupt argument",
    error instanceof RangeError,
    abruptReached,
  );
}
abruptReached = false;
try { Number.prototype.toFixed.call(1, abruptArgument); } catch (error) {
  console.log(
    "toFixed abrupt argument",
    error instanceof RangeError,
    abruptReached,
  );
}
try { Number.prototype.toFixed.call("not a number", 2); } catch (error) {
  console.log("toFixed brand before argument", error instanceof TypeError);
}

/*
 * A radix whose expansion never terminates cannot be compared against the
 * reference engines digit for digit: V8 advances its remaining fraction in
 * floating point, so its last digit or two can differ from the exact
 * result, and in most such cases its own output does not read back as the
 * original double. What every engine does agree on is that the digits
 * denote the value, so this asserts the reparsed magnitude instead of the
 * spelling. The tolerance is a relative 1e-15, several ULPs wide: it proves
 * the digits denote this value rather than a different one and is stable
 * across engines, not that the expansion is exact. Exactness is a native
 * property that no reference comparison can carry, because V8's own output
 * often fails to read back as its input; the terminating radices pinned
 * digit for digit above are what hold the exact spelling.
 */
function radixReparse(text, radix) {
  let body = text;
  let negative = false;
  if (body.charAt(0) === "-") { negative = true; body = body.slice(1); }
  const dot = body.indexOf(".");
  const whole = dot < 0 ? body : body.slice(0, dot);
  const frac = dot < 0 ? "" : body.slice(dot + 1);
  let value = 0;
  for (let index = 0; index < whole.length; index = index + 1) {
    value = value * radix + Number.parseInt(whole.charAt(index), radix);
  }
  let tail = 0;
  for (let index = frac.length - 1; index >= 0; index = index - 1) {
    tail = (tail + Number.parseInt(frac.charAt(index), radix)) / radix;
  }
  const total = value + tail;
  return negative ? -total : total;
}
function nearlyEqual(actual, expected) {
  const difference = actual > expected ? actual - expected : expected - actual;
  const scale = expected > 0 ? expected : -expected;
  return difference <= scale * 1e-15;
}
for (const entry of [
  [0.2, 3], [0.1, 5], [0.1, 6], [0.7, 36], [123.456, 7], [-0.2, 3],
]) {
  const subject = entry[0];
  const radix = entry[1];
  console.log(
    "radix round-trip",
    radix,
    nearlyEqual(radixReparse(subject.toString(radix), radix), subject),
  );
}
/*
 * A power of two sits twice as far from its upper neighbor as from its
 * lower one. All three reparse exactly on every engine, and the first
 * two did not before the error budget became two-sided, so they pin
 * that asymmetry as a retained regression rather than leaving it to the
 * tolerant comparison above.
 */
for (const entry of [[0.5, 5], [0.25, 3], [0.125, 5]]) {
  const subject = entry[0];
  const radix = entry[1];
  console.log(
    "binade round-trip",
    radix,
    radixReparse(subject.toString(radix), radix) === subject,
  );
}
/*
 * The smallest denormal is where halving the gap to the next double
 * underflows, so its terminating radix-2 expansion pins the exact digit
 * count the fractional loop must reach.
 */
const denormalBits = Number.MIN_VALUE.toString(2);
console.log(
  "denormal radix 2",
  denormalBits.length,
  denormalBits.charAt(denormalBits.length - 1),
  denormalBits.charAt(0),
);

/** @param {number} value */
function hinted(value) { return value.toString(); }
console.log("hint hit", hinted(5));
console.log("false hint", hinted(new Number(5)));
let turn = 0;
while (turn < 2) {
  console.log("guard", hinted(5));
  if (turn === 0) Number.prototype.hintMarker = 1;
  turn = turn + 1;
}
`,
  },
];
