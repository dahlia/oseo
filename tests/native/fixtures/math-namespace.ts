import type { Fixture } from "../fixture.ts";

export const mathNamespaceFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "math-namespace",
    source: `
const mathGlobalObject = this;
const originalMath = Math;
console.log(
  "identity",
  typeof Math,
  ({}).toString.call(Math),
  Object.getPrototypeOf(Math) === Object.prototype,
  Object.keys(Math).length,
);
const globalDescriptor = Object.getOwnPropertyDescriptor(this, "Math");
const constantDescriptor = Object.getOwnPropertyDescriptor(Math, "PI");
const methodDescriptor = Object.getOwnPropertyDescriptor(Math, "abs");
console.log(
  "descriptors",
  globalDescriptor.writable,
  globalDescriptor.enumerable,
  globalDescriptor.configurable,
  constantDescriptor.writable,
  constantDescriptor.enumerable,
  constantDescriptor.configurable,
  methodDescriptor.writable,
  methodDescriptor.enumerable,
  methodDescriptor.configurable,
);
console.log(
  "constants",
  Math.E,
  Math.LN10,
  Math.LN2,
  Math.LOG10E,
  Math.LOG2E,
  Math.PI,
  Math.SQRT1_2,
  Math.SQRT2,
);
const names = [
  "abs", "acos", "acosh", "asin", "asinh", "atan", "atanh", "atan2",
  "cbrt", "ceil", "clz32", "cos", "cosh", "exp", "expm1", "f16round",
  "floor", "fround", "hypot", "imul", "log", "log1p", "log10", "log2",
  "max", "min", "pow", "random", "round", "sign", "sin", "sinh",
  "sqrt", "tan", "tanh", "trunc",
];
const lengths = [
  1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1,
  2, 2, 2, 0, 1, 1, 1, 1, 1, 1, 1, 1,
];
let metadata = "";
for (let index = 0; index < names.length; index = index + 1) {
  const method = Math[names[index]];
  if (
    typeof method !== "function" ||
    method.name !== names[index] ||
    method.length !== lengths[index]
  ) {
    metadata = metadata + " " + names[index];
  }
}
console.log("metadata", names.length, metadata === "");
console.log(
  "integral",
  Math.abs(-3.5),
  Math.ceil(4.1),
  Math.floor(4.9),
  Math.round(2.5),
  Math.round(-2.5),
  Math.round(0.49999999999999994),
  Math.trunc(-4.7),
  Math.sign(-7),
  Math.sign(7),
);
console.log(
  "signed zero",
  1 / Math.abs(-0),
  1 / Math.ceil(-0.5),
  1 / Math.round(-0.2),
  1 / Math.round(-0),
  1 / Math.trunc(-0.9),
  1 / Math.sign(-0),
  1 / Math.sqrt(-0),
  1 / Math.cbrt(-0),
  1 / Math.min(0, -0),
  1 / Math.max(-0, 0),
  1 / Math.fround(-1e-60),
  1 / Math.f16round(-1e-8),
);
console.log(
  "exact",
  Math.sqrt(9),
  Math.log2(1024),
  Math.log10(100000),
  Math.pow(2, 31),
  Math.hypot(3, 4),
  Math.hypot(3, 4, 12),
  Math.fround(0.1),
  Math.f16round(1.337),
  Math.f16round(65519),
  Math.f16round(65520),
  Math.imul(0xffffffff, 5),
  Math.imul(2147483647, 2147483647),
  Math.clz32(1),
  Math.clz32(0),
  Math.clz32(4294967295),
);
console.log(
  "extrema",
  Math.max(),
  Math.min(),
  Math.hypot(),
  Math.max(1, 2, 3),
  Math.min(1, 2, 3),
  Math.max(1, NaN, 3),
  Math.min(1, NaN, 3),
  Math.hypot(NaN, Infinity),
  Math.hypot(Infinity, NaN),
  Math.hypot(-0, -0),
);
console.log(
  "special",
  Math.pow(1, NaN),
  Math.pow(-1, Infinity),
  Math.pow(NaN, 0),
  Math.pow(0, -1),
  Math.exp(-Infinity),
  Math.log(0),
  Math.log(-1),
  Math.acosh(0.5),
  Math.atanh(1),
  Math.expm1(-Infinity),
  Math.atan2(-0, 0) === 0,
  1 / Math.atan2(-0, 0),
);
console.log(
  "approximated",
  Math.abs(Math.exp(1) - Math.E) < 1e-15,
  Math.abs(Math.log(Math.E) - 1) < 1e-15,
  Math.abs(Math.sin(Math.PI / 6) - 0.5) < 1e-15,
  Math.abs(Math.cos(0) - 1) < 1e-15,
  Math.abs(Math.tan(Math.PI / 4) - 1) < 1e-15,
  Math.abs(Math.cbrt(27) - 3) < 1e-14,
  Math.abs(Math.asinh(Math.sinh(1)) - 1) < 1e-14,
  Math.abs(Math.tanh(Infinity) - 1) < 1e-15,
  Math.abs(Math.log1p(0) - 0) < 1e-15,
  Math.abs(Math.atan2(1, 1) - Math.PI / 4) < 1e-15,
);
const draws = [];
let inRange = true;
let distinct = false;
for (let index = 0; index < 64; index = index + 1) {
  const draw = Math.random();
  if (typeof draw !== "number" || draw < 0 || draw >= 1) inRange = false;
  if (index > 0 && draw !== draws[index - 1]) distinct = true;
  draws.push(draw);
}
console.log("random", draws.length, inRange, distinct);
const order = [];
const first = { valueOf() { order.push("first"); return 3; } };
const second = { valueOf() { order.push("second"); return 4; } };
console.log("order", Math.hypot(first, second), order.join(","));
const abruptOrder = [];
const abrupt = { valueOf() { throw new RangeError("abrupt"); } };
const observed = {
  valueOf() { abruptOrder.push("observed"); return 1; },
};
try {
  Math.max(observed, abrupt, {
    valueOf() { abruptOrder.push("unreached"); return 2; },
  });
} catch (error) {
  console.log(
    "abrupt",
    error instanceof RangeError,
    abruptOrder.join(","),
  );
}
try {
  Math.abs(Symbol("x"));
} catch (error) {
  console.log("symbol", error instanceof TypeError);
}
console.log(
  "coercion",
  Math.abs("-5"),
  Math.abs(true),
  Math.abs(null),
  Math.max("2", 1),
  Math.imul("3", "4"),
  Math.clz32("1"),
);
try {
  Math();
} catch (error) {
  console.log("not callable", error instanceof TypeError);
}
try {
  new Math.abs(1);
} catch (error) {
  console.log("not a constructor", error instanceof TypeError);
}
/** @param {number} value */
function hinted(value) { return value + 1; }
console.log("hint", hinted(Math.trunc(2.5)), hinted("2"));
let turn = 0;
while (turn < 2) {
  console.log("guard", Math.abs === Math.abs, Math.PI === Math.PI);
  if (turn === 0) Math.marker = 1;
  turn = turn + 1;
}
console.log("marker", Math.marker, delete Math.marker, "marker" in Math);
({ value: Math } = { value: 31 });
console.log("object target", Math, this.Math === Math);
[Math] = [32];
console.log("array target", Math, this.Math === Math);
for (Math of [33]) {}
console.log("for-of target", Math, this.Math === Math);
for (Math in { loopKey: true }) {}
console.log("for-in target", Math, this.Math === Math);
Math = originalMath;
console.log("target restore", Math === originalMath);
Math = 40;
console.log("identifier replace", Math, this.Math === Math);
Math += 2;
console.log("identifier update", Math++, ++Math, Math, this.Math);
Math = originalMath;
console.log("identifier restore", Math === originalMath);
this.Math = 123;
console.log("global write", this.Math === Math, Math);
this.Math = originalMath;
console.log("global restore", this.Math === Math);
console.log("global delete", delete this.Math, typeof Math);
try { Math; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
try { Math += 1; } catch (error) {
  console.log("global deleted update", error instanceof ReferenceError);
}
function strictDeletedMathSet() { "use strict"; Math = 1; }
try { strictDeletedMathSet(); } catch (error) {
  console.log("global deleted strict set", error instanceof ReferenceError);
}
({ value: Math } = { value: originalMath });
console.log("global deleted pattern restore", this.Math === Math);
function strictDeleteDuringMathSet() {
  "use strict";
  Math = (delete mathGlobalObject.Math, 5);
}
try { strictDeleteDuringMathSet(); } catch (error) {
  console.log("global strict set race", error instanceof ReferenceError);
}
Math = originalMath;
console.log("global race restore", this.Math === Math);
`,
  },
];
