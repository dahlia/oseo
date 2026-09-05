import type { Fixture } from "../fixture.ts";

export const arrayPrototypeMutationFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "array-prototype-mutation",
    source: `
const mutationNames = [
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "splice",
  "unshift",
];
for (const name of mutationNames) {
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
  try { method.call(null); } catch (error) {
    console.log("null receiver", name, error instanceof TypeError);
  }
}

function printEntries(label, value, count) {
  console.log(label, "length", value.length);
  for (let index = 0; index < count; index = index + 1) {
    const own = Object.prototype.hasOwnProperty.call(value, index);
    console.log(label, index, own, own ? String(value[index]) : "hole");
  }
}

const ends = ["b"];
console.log("push", ends.push("c", "d"));
console.log("pop", ends.pop());
printEntries("ends", ends, 4);

const shifted = [];
shifted[1] = "b";
shifted[3] = "d";
shifted.length = 4;
console.log("shift", String(shifted.shift()));
console.log("unshift", shifted.unshift("x", "y"));
printEntries("shifted", shifted, 6);

const reversed = [];
reversed[0] = "a";
reversed[3] = "d";
reversed.length = 5;
console.log("reverse same", reversed.reverse() === reversed);
printEntries("reversed", reversed, 5);

const copied = [];
copied[0] = "a";
copied[2] = "c";
copied[3] = "d";
copied.length = 5;
console.log("copy same", copied.copyWithin(1, 0, 4) === copied);
printEntries("copied", copied, 5);

const overlap = [0, 1, 2, 3, 4];
overlap.copyWithin(1, 0, 4);
console.log("overlap", overlap.join(","));

const undefinedEnds = [0, 1, 2];
undefinedEnds.copyWithin(0, 1, undefined);
console.log("copy undefined end", undefinedEnds.join(","));
undefinedEnds.fill(9, 1, undefined);
console.log("fill undefined end", undefinedEnds.join(","));

const zeroUnshift = { length: Infinity };
console.log(
  "zero unshift",
  Array.prototype.unshift.call(zeroUnshift),
  zeroUnshift.length,
);

const filled = { 0: "a", 3: "d", length: 5 };
console.log(
  "fill same",
  Array.prototype.fill.call(filled, "x", -4, -1) === filled,
);
printEntries("filled", filled, 5);

const spliced = [];
spliced[0] = "a";
spliced[2] = "c";
spliced[4] = "e";
spliced.length = 5;
const removed = spliced.splice(1, 3, "x", "y");
printEntries("removed", removed, 4);
printEntries("spliced", spliced, 5);

class Result extends Array {}
const species = ["a", "b", "c"];
species.constructor = { [Symbol.species]: Result };
const speciesRemoved = species.splice(1, 1);
console.log(
  "species",
  speciesRemoved instanceof Result,
  speciesRemoved.length,
  species.join(","),
);

const generic = { 0: "a", 2: "c", length: 3 };
console.log("generic push", Array.prototype.push.call(generic, "d"));
console.log("generic pop", Array.prototype.pop.call(generic));
console.log("generic unshift", Array.prototype.unshift.call(generic, "x"));
console.log("generic shift", Array.prototype.shift.call(generic));
printEntries("generic", generic, 4);

const order = [];
const ordered = {
  0: "a",
  1: "b",
  get length() { order.push("length"); return 2; },
  set length(value) { order.push("set-length-" + value); },
};
const start = { valueOf() { order.push("start"); return 0; } };
const count = { valueOf() { order.push("count"); return 1; } };
Array.prototype.splice.call(ordered, start, count, "x");
console.log("order", order.join(","));

const largeReverseOrder = [];
const stopReverse = {};
let lowerValue = "zero";
let upperValue = "2**53-2";
const largeReversed = { length: 2 ** 53 + 2 };
Object.defineProperty(largeReversed, "0", {
  configurable: true,
  get() { largeReverseOrder.push("get-0"); return lowerValue; },
  set(value) {
    largeReverseOrder.push("set-0-" + value);
    lowerValue = value;
  },
});
Object.defineProperty(largeReversed, "9007199254740990", {
  configurable: true,
  get() { largeReverseOrder.push("get-upper-0"); return upperValue; },
  set(value) {
    largeReverseOrder.push("set-upper-0-" + value);
    upperValue = value;
  },
});
Object.defineProperty(largeReversed, "2", {
  configurable: true,
  get() { largeReverseOrder.push("get-2"); return "two"; },
});
Object.defineProperty(largeReversed, "9007199254740987", {
  configurable: true,
  get() { largeReverseOrder.push("get-upper-3"); return "2**53-5"; },
});
Object.defineProperty(largeReversed, "4", {
  configurable: true,
  get() { largeReverseOrder.push("get-4"); throw stopReverse; },
});
try { Array.prototype.reverse.call(largeReversed); } catch (error) {
  console.log("large reverse stop", error === stopReverse);
}
console.log("large reverse order", largeReverseOrder.join(","));
console.log(
  "large reverse ends",
  largeReversed[0],
  largeReversed[9007199254740990],
);
console.log(
  "large reverse sparse",
  Object.prototype.hasOwnProperty.call(largeReversed, 1),
  Object.prototype.hasOwnProperty.call(largeReversed, 2),
  largeReversed[3],
  Object.prototype.hasOwnProperty.call(largeReversed, 9007199254740987),
  largeReversed[9007199254740988],
  Object.prototype.hasOwnProperty.call(largeReversed, 9007199254740989),
);

const largeSpeciesArray = [];
largeSpeciesArray.length = 2 ** 32 - 1;
let largeSpeciesLength = -1;
const stopSplice = {};
function LargeSpecies(length) {
  largeSpeciesLength = length;
  throw stopSplice;
}
largeSpeciesArray.constructor = { [Symbol.species]: LargeSpecies };
try {
  largeSpeciesArray.splice(0, 2 ** 53 + 4);
} catch (error) {
  console.log("large splice stop", error === stopSplice);
}
console.log("large splice species length", largeSpeciesLength);

const inherited = { length: 3 };
Object.setPrototypeOf(inherited, { 0: "a", 2: "c" });
Array.prototype.reverse.call(inherited);
printEntries("inherited", inherited, 3);

const abrupt = ["a"];
Object.defineProperty(abrupt, "0", { configurable: false, writable: false });
try { abrupt.fill("x"); } catch (error) {
  console.log("abrupt fill", error instanceof TypeError, abrupt[0]);
}

const collected = [{ value: 1 }, , { value: 3 }];
const first = collected[0];
const last = collected[2];
collected.reverse();
console.log(
  "collected",
  collected[0] === last,
  !Object.prototype.hasOwnProperty.call(collected, 1),
  collected[2] === first,
);

/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
let turn = 0;
while (turn < 3) {
  console.log("guard", hinted("guard"));
  if (turn === 1) String.prototype.arrayMutationMarker = 1;
  turn = turn + 1;
}
const originalIs = Object.is;
turn = 0;
while (turn < 3) {
  console.log("shape", Object.is === originalIs);
  if (turn === 1) Object.arrayMutationMarker = 1;
  turn = turn + 1;
}
`,
  },
];
