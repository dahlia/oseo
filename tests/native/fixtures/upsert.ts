import type { Es2026Fixture } from "../es2026-fixture.ts";

/*
 * Map and WeakMap getOrInsert and getOrInsertComputed. The pinned
 * Node.js lacks them, so Deno is the single reference host. Callbacks
 * are strict functions, so their receiver reads the same whether the
 * fixture runs as a Script or a module.
 */
export const upsertFixtures: readonly Es2026Fixture[] = [
  {
    denoOnly: true,
    guardHits: true,
    name: "upsert",
    source: `
function describe(owner, name) {
  const descriptor = Object.getOwnPropertyDescriptor(owner, name);
  return [
    typeof descriptor.value,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
    descriptor.value.name,
    descriptor.value.length,
    Object.hasOwn(descriptor.value, "prototype"),
  ].join(" ");
}
for (const owner of [Map.prototype, WeakMap.prototype]) {
  for (const name of ["getOrInsert", "getOrInsertComputed"]) {
    console.log("descriptor", describe(owner, name));
    try {
      new owner[name]();
    } catch (error) {
      console.log("construct", name, error instanceof TypeError);
    }
  }
}
const map = new Map([["a", 1]]);
console.log(
  "map insert",
  map.getOrInsert("a", 2),
  map.getOrInsert("b", 3),
  map.getOrInsert("b", 4),
  map.size,
  [...map].join(";"),
);
const keys = [undefined, null, true, 0, NaN, "", 10n, Symbol.for("map")];
let stored = "";
for (const [index, key] of keys.entries()) {
  stored = stored + String(map.getOrInsert(key, index));
  stored = stored + String(map.getOrInsert(key, -1));
}
console.log("map key kinds", stored, map.size);
const object = {};
const symbol = Symbol("local");
console.log(
  "map identity keys",
  map.getOrInsert(object, "object"),
  map.getOrInsert({}, "other"),
  map.getOrInsert(object, "again"),
  map.getOrInsert(symbol, "symbol"),
  map.get(symbol),
);
const zero = new Map();
console.log(
  "map zero",
  zero.getOrInsert(-0, "negative"),
  zero.getOrInsert(0, "positive"),
  Object.is([...zero.keys()][0], 0),
  zero.size,
);
let seen = [];
const computed = new Map();
console.log(
  "computed",
  computed.getOrInsertComputed(-0, function (key) {
    "use strict";
    seen = [this, Object.is(key, 0), arguments.length];
    return "zero";
  }),
  seen.join(","),
  Object.is([...computed.keys()][0], 0),
);
let calls = 0;
console.log(
  "computed present",
  computed.getOrInsertComputed(0, () => {
    calls = calls + 1;
    return "unused";
  }),
  calls,
);
console.log(
  "computed overwrite",
  computed.getOrInsertComputed("k", (key) => {
    computed.set(key, "inner");
    return "outer";
  }),
  computed.get("k"),
  [...computed.keys()].join(","),
);
console.log(
  "computed after delete",
  computed.getOrInsertComputed("d", (key) => {
    computed.delete(0);
    return key + "!";
  }),
  [...computed.keys()].join(","),
);
console.log(
  "computed after clear",
  computed.getOrInsertComputed("c", () => {
    computed.clear();
    computed.set("x", 1);
    return "cleared";
  }),
  [...computed].join(";"),
);
console.log(
  "computed nested",
  computed.getOrInsertComputed("n", (key) =>
    computed.getOrInsertComputed(key, () => "innermost") + "+outer"),
  computed.get("n"),
);
try {
  computed.getOrInsertComputed("t", () => {
    throw new RangeError("callback");
  });
} catch (error) {
  console.log(
    "computed throws",
    error instanceof RangeError,
    computed.has("t"),
  );
}
let nonCallable = "";
for (const callback of [undefined, null, 1, "f", {}, Symbol("c")]) {
  try {
    computed.getOrInsertComputed("missing", callback);
    nonCallable = nonCallable + "?";
  } catch (error) {
    nonCallable = nonCallable + (error instanceof TypeError ? "T" : "X");
  }
}
try {
  computed.getOrInsertComputed("x", 1);
  nonCallable = nonCallable + "?";
} catch (error) {
  nonCallable = nonCallable + (error instanceof TypeError ? "T" : "X");
}
console.log("non-callable", nonCallable, computed.has("missing"));
let receivers = "";
const receiverValues = [
  undefined, null, 1, "map", {}, new WeakMap(), new Set(), Map.prototype,
];
for (const receiver of receiverValues) {
  for (const name of ["getOrInsert", "getOrInsertComputed"]) {
    try {
      Map.prototype[name].call(receiver, 1, () => 1);
      receivers = receivers + "?";
    } catch (error) {
      receivers = receivers + (error instanceof TypeError ? "T" : "X");
    }
  }
}
console.log("map receivers", receivers);
const weak = new WeakMap();
const first = {};
const unregistered = Symbol("weak");
console.log(
  "weak insert",
  weak.getOrInsert(first, 1),
  weak.getOrInsert(first, 2),
  weak.get(first),
  weak.getOrInsert(unregistered, "symbol"),
  weak.getOrInsert(unregistered, "again"),
  weak.has(unregistered),
);
let weakKeys = "";
const rejectedKeys = [
  undefined, null, true, 1, "key", 1n, Symbol.for("registered"),
];
for (const key of rejectedKeys) {
  for (const name of ["getOrInsert", "getOrInsertComputed"]) {
    try {
      weak[name](key, () => 1);
      weakKeys = weakKeys + "?";
    } catch (error) {
      weakKeys = weakKeys + (error instanceof TypeError ? "T" : "X");
    }
  }
}
console.log("weak keys", weakKeys);
let weakCallables = "";
for (const callback of [undefined, 1, {}]) {
  try {
    weak.getOrInsertComputed({}, callback);
    weakCallables = weakCallables + "?";
  } catch (error) {
    weakCallables = weakCallables + (error instanceof TypeError ? "T" : "X");
  }
}
console.log("weak non-callable", weakCallables);
const second = {};
console.log(
  "weak computed",
  weak.getOrInsertComputed(second, function (key) {
    "use strict";
    return [this, key === second, arguments.length].join(",");
  }),
  weak.getOrInsertComputed(second, () => "unused"),
);
const third = {};
console.log(
  "weak overwrite",
  weak.getOrInsertComputed(third, (key) => {
    weak.set(key, "inner");
    return "outer";
  }),
  weak.get(third),
);
const fourth = {};
console.log(
  "weak after delete",
  weak.getOrInsertComputed(fourth, (key) => {
    weak.set(key, "inner");
    weak.delete(key);
    return "outer";
  }),
  weak.get(fourth),
);
try {
  weak.getOrInsertComputed({}, () => {
    throw new RangeError("callback");
  });
} catch (error) {
  console.log("weak throws", error instanceof RangeError);
}
let weakReceivers = "";
const weakReceiverValues = [
  undefined, 1, {}, new Map(), new WeakSet(), WeakMap.prototype, [],
];
for (const receiver of weakReceiverValues) {
  for (const name of ["getOrInsert", "getOrInsertComputed"]) {
    try {
      WeakMap.prototype[name].call(receiver, {}, () => 1);
      weakReceivers = weakReceivers + "?";
    } catch (error) {
      weakReceivers = weakReceivers + (error instanceof TypeError ? "T" : "X");
    }
  }
}
console.log("weak receivers", weakReceivers);
const retained = new WeakMap();
const holders = [];
for (let index = 0; index < 64; index = index + 1) {
  const key = { index };
  holders.push(key);
  retained.getOrInsertComputed(key, (owner) => ({ owner, index }));
}
let intact = true;
for (const key of holders) {
  const value = retained.get(key);
  if (value.owner !== key || value.index !== key.index) intact = false;
}
console.log("weak retained", intact, retained.getOrInsert(holders[5], 0).index);
let turn = 0;
while (turn < 2) {
  console.log(
    "guard",
    map.getOrInsert("a", turn),
    weak.getOrInsert(first, turn),
  );
  if (turn === 0) {
    Map.prototype.marker = turn;
    WeakMap.prototype.marker = turn;
  }
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 2), hinted("1", 2));
const original = Map.prototype.getOrInsert;
Map.prototype.getOrInsert = function () { return "replaced"; };
console.log("replaced", map.getOrInsert("a", 0), original.call(map, "a", 0));
delete Map.prototype.getOrInsert;
console.log("deleted", typeof map.getOrInsert, original.call(map, "z", 26));
`,
  },
];
