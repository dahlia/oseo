import type { Fixture } from "../fixture.ts";

/*
 * Atomics.pause validates its optional iteration count without coercing
 * it and returns undefined. Both reference hosts expose it. The fixture
 * ends with a namespace shape guard miss and a false number hint, so the
 * enabled policy reaches the compiled generic fallback.
 */
export const atomicsPauseFixtures: readonly Fixture[] = [
  {
    name: "atomics-pause",
    source: `
const descriptor = Object.getOwnPropertyDescriptor(Atomics, "pause");
console.log(
  "descriptor",
  typeof descriptor.value,
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
  Atomics.pause.name,
  Atomics.pause.length,
  Object.hasOwn(Atomics.pause, "prototype"),
  Object.getPrototypeOf(Atomics.pause) === Function.prototype,
);
const name = Object.getOwnPropertyDescriptor(Atomics.pause, "name");
const length = Object.getOwnPropertyDescriptor(Atomics.pause, "length");
console.log(
  "metadata",
  name.writable,
  name.enumerable,
  name.configurable,
  length.writable,
  length.enumerable,
  length.configurable,
);
try { new Atomics.pause(); } catch (error) {
  console.log("construct", error instanceof TypeError);
}
try { Reflect.construct(function () {}, [], Atomics.pause); } catch (error) {
  console.log("new-target", error instanceof TypeError);
}
const coerced = [];
const values = [
  ["none", []],
  ["undefined", [undefined]],
  ["zero", [0]],
  ["negative-zero", [-0]],
  ["one", [1]],
  ["negative", [-7]],
  ["large", [2 ** 53]],
  ["huge", [1e300]],
  ["negative-huge", [-1e300]],
  ["min", [Number.MIN_SAFE_INTEGER]],
  ["extra", [3, "ignored"]],
  ["nan", [NaN]],
  ["infinity", [Infinity]],
  ["negative-infinity", [-Infinity]],
  ["fraction", [1.5]],
  ["negative-fraction", [-0.5]],
  ["tiny", [Number.MIN_VALUE]],
  ["string", ["1"]],
  ["bigint", [1n]],
  ["null", [null]],
  ["boolean", [true]],
  ["symbol", [Symbol("count")]],
  ["number-object", [new Number(1)]],
  ["value-of", [{ valueOf() { coerced.push("valueOf"); return 1; } }]],
  ["to-primitive", [{
    [Symbol.toPrimitive]() { coerced.push("toPrimitive"); return 1; },
  }]],
];
for (const [label, args] of values) {
  let outcome;
  try {
    outcome = String(Atomics.pause(...args));
  } catch (error) {
    outcome = error.constructor.name;
  }
  console.log("count", label, outcome);
}
console.log("coerced", coerced.length);
console.log(
  "receivers",
  Atomics.pause.call(undefined),
  Atomics.pause.call({}, 2),
  Reflect.apply(Atomics.pause, null, [4]),
);
let spins = 0;
for (let index = 0; index < 1000; index = index + 1) {
  if (Atomics.pause(index) === undefined) spins = spins + 1;
}
console.log("loop", spins);
let turn = 0;
while (turn < 2) {
  console.log("guard", Atomics.pause(turn));
  if (turn === 0) Atomics.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 2), hinted("1", 2));
const original = Atomics.pause;
Atomics.pause = () => "replaced";
console.log("replaced", Atomics.pause(), original(1));
delete Atomics.pause;
console.log("deleted", typeof Atomics.pause, original());
`,
  },
];
