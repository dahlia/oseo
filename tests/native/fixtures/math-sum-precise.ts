import type { Es2026Fixture } from "../es2026-fixture.ts";

/*
 * Math.sumPrecise returns the correctly rounded exact sum. The pinned
 * Node.js lacks it, so Deno is the single reference host. Each result is
 * printed through `show`, which keeps -0 distinct from +0.
 */
export const mathSumPreciseFixtures: readonly Es2026Fixture[] = [
  {
    denoOnly: true,
    guardHits: true,
    name: "math-sum-precise",
    source: `
const show = (value) => (Object.is(value, -0) ? "-0" : String(value));
const sum = Math.sumPrecise;
const descriptor = Object.getOwnPropertyDescriptor(Math, "sumPrecise");
console.log(
  "descriptor",
  typeof descriptor.value,
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
  sum.name,
  sum.length,
  Object.hasOwn(sum, "prototype"),
);
try { new Math.sumPrecise([]); } catch (error) {
  console.log("construct", error instanceof TypeError);
}
console.log(
  "zeroes",
  show(sum([])),
  show(sum([-0])),
  show(sum([-0, -0, -0])),
  show(sum([0])),
  show(sum([-0, 0])),
  show(sum([0, -0])),
  show(sum([1, -1])),
  show(sum([-1, 1, -0])),
  show(sum([5e-324, -5e-324])),
);
console.log(
  "specials",
  show(sum([Infinity])),
  show(sum([-Infinity])),
  show(sum([Infinity, Infinity])),
  show(sum([Infinity, -Infinity])),
  show(sum([-Infinity, 1, Infinity])),
  show(sum([NaN])),
  show(sum([1, NaN, 2])),
  show(sum([NaN, Infinity])),
  show(sum([Infinity, 1e308, 1e308])),
  show(sum([-0, -Infinity])),
);
console.log(
  "exact",
  show(sum([0.1, 0.2, 0.3])),
  show(0.1 + 0.2 + 0.3),
  show(sum([1e20, 0.1, -1e20])),
  show(sum([1, 1e100, 1, -1e100])),
  show(sum([2 ** 53, 1, 1])),
  show(sum([2 ** 53, 1])),
  show(sum([2 ** 53, 1, 2 ** -60])),
  show(sum([1e308, 1e308, -1e308])),
  show(sum([-1e308, -1e308, 1e308])),
  show(sum([1e-300, 1e300, -1e300])),
);
console.log(
  "subnormal",
  show(sum([5e-324, 5e-324])),
  show(sum([2.2250738585072014e-308, -5e-324])),
  show(sum([2.225073858507201e-308, 5e-324])),
  show(sum([1e-320, -2e-320])),
);
const max = Number.MAX_VALUE;
console.log(
  "overflow",
  show(sum([max, max])),
  show(sum([-max, -max])),
  show(sum([max, max, -max])),
  show(sum([max, 2 ** 970])),
  show(sum([max, 2 ** 970 - 2 ** 917])),
  show(sum([max, 2 ** 969, 2 ** 969])),
  show(sum([-max, -(2 ** 970)])),
  show(sum([max, max, -Infinity])),
);
console.log(
  "ties",
  show(sum([1, 2 ** -53])),
  show(sum([1, 2 ** -53, 2 ** -60])),
  show(sum([1 + 2 ** -52, 2 ** -53])),
  show(sum([-1, -(2 ** -53)])),
  show(sum([2 ** 54, 3])),
  show(sum([2 ** 54, 2])),
);
function* numbers() {
  yield 0.5;
  yield 0.25;
  yield -0.125;
}
const view = new Float64Array([1.5, 2.25, -0.75]);
console.log(
  "iterables",
  show(sum(numbers())),
  show(sum(new Set([0.1, 0.7, 0.1]))),
  show(sum(view)),
  show(sum(new Map([[1, 2]]).keys())),
  show(sum([1, 2, 3].values())),
);
const rejections = [
  undefined, null, 1, true, {}, { length: 2, 0: 1, 1: 2 }, Symbol.iterator,
];
let rejected = "";
for (const value of rejections) {
  try {
    sum(value);
    rejected = rejected + "?";
  } catch (error) {
    rejected = rejected + (error instanceof TypeError ? "T" : "X");
  }
}
try { sum(); rejected = rejected + "?"; } catch (error) {
  rejected = rejected + (error instanceof TypeError ? "T" : "X");
}
console.log("rejected", rejected);
const values = [
  "1", 1n, new Number(1), null, undefined, true, {}, Symbol("s"),
];
let nonNumbers = "";
for (const value of values) {
  try {
    sum([1, value, 2]);
    nonNumbers = nonNumbers + "?";
  } catch (error) {
    nonNumbers = nonNumbers + (error instanceof TypeError ? "T" : "X");
  }
}
console.log("non-numbers", nonNumbers);
try { sum("12"); } catch (error) {
  console.log("string iterable", error instanceof TypeError);
}
const log = [];
function tracked(items) {
  return {
    get [Symbol.iterator]() {
      log.push("get iterator");
      return () => {
        log.push("open");
        let index = 0;
        return {
          get next() {
            log.push("get next");
            return () => {
              log.push("next " + index);
              const value = items[index];
              index = index + 1;
              return { done: index > items.length, value };
            };
          },
          return() {
            log.push("return");
            return {};
          },
        };
      };
    },
  };
}
console.log("tracked", show(sum(tracked([1, 2]))), log.join(","));
log.length = 0;
try { sum(tracked([1, NaN, "x", 3])); } catch (error) {
  console.log("closed", error instanceof TypeError, log.join(","));
}
log.length = 0;
try { sum(tracked([Infinity, -Infinity, 1n])); } catch (error) {
  console.log("closed after NaN", error instanceof TypeError, log.join(","));
}
const thrower = {
  [Symbol.iterator]() {
    return {
      next() { throw new RangeError("next"); },
      return() { log.push("unexpected return"); return {}; },
    };
  },
};
log.length = 0;
try { sum(thrower); } catch (error) {
  console.log("next throws", error instanceof RangeError, log.length);
}
const badReturn = {
  [Symbol.iterator]() {
    return {
      next() { return { done: false, value: "bad" }; },
      return() { throw new RangeError("return"); },
    };
  },
};
try { sum(badReturn); } catch (error) {
  console.log("return throws", error instanceof TypeError);
}
const doneGetter = {
  [Symbol.iterator]() {
    return {
      next() {
        return {
          get done() { log.push("done"); return true; },
          get value() { log.push("value"); return 1; },
        };
      },
    };
  },
};
log.length = 0;
console.log("done result", show(sum(doneGetter)), log.join(","));
let turn = 0;
while (turn < 2) {
  console.log("guard", show(Math.sumPrecise([turn, 0.5])), show(sum([-0])));
  if (turn === 0) Math.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 2), hinted("1", 2));
Math.sumPrecise = () => "replaced";
console.log("replaced", Math.sumPrecise([1]), show(sum([1, 2])));
delete Math.sumPrecise;
console.log("deleted", typeof Math.sumPrecise, show(sum([4])));
`,
  },
];
