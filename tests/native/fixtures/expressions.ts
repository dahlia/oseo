import type { Fixture } from "../fixture.ts";

export const expressionFixtures: readonly Fixture[] = [
  {
    name: "var-async",
    source: `
async function accumulate(start) {
  var total = start;
  var next = await Promise.resolve(total + 1);
  if (next > 0) { var flag = "set"; }
  var reused = await Promise.resolve(next + 1);
  return reused + " " + flag + " " + typeof trailing;
  var trailing;
}
accumulate(1).then(function (result) { console.log(result); });
`,
  },
  {
    name: "loose-equality",
    source: `
console.log(1 == "1", "" == 0, "0" == false, true == 1, false == "");
console.log(null == undefined, undefined == null, null == null);
console.log(null == 0, undefined == 0, null == false, undefined == "");
console.log(NaN == NaN, NaN == "NaN", -0 == 0, -0 == "0");
console.log("1e2" == 100, "0x10" == 16, "  2  " == 2, "2a" == 2);
console.log(1 != "1", null != undefined, NaN != NaN, "a" != "b");
const box = { value: 1 };
const same = box;
const other = { value: 1 };
console.log(box == same, box == other, box != other);
console.log(box == null, null == box, box == undefined, undefined != box);
console.log(true == "1", false == "0", true == "true", false == "1");
console.log(Infinity == "Infinity", -Infinity == "-Infinity");
`,
  },
  {
    name: "sequence-and-nullish",
    source: `
function logging(label, value) { console.log(label); return value; }
console.log((1, 2), (1, 2, "third"));
console.log((logging("first", 1), logging("second", 2)));
console.log(null ?? "null-fallback", undefined ?? "undefined-fallback");
console.log(0 ?? "kept-zero", "" ?? "kept-empty", false ?? "kept-false");
console.log(NaN ?? "kept-nan", null ?? undefined, undefined ?? null);
console.log(false ?? logging("skipped", 1));
console.log(null ?? logging("taken", "value"));
console.log((null ?? 0) || "or-after", (1 ?? 2) && "and-after");
let effects = 0;
const touch = function () { effects = effects + 1; return null; };
console.log(touch() ?? "was-null", effects);
`,
  },
  {
    name: "optional-chaining",
    source: `
function optionalFunction(value) { return value + 1; }
const optionalObject = {
  nested: { value: 7 },
  value: 10,
  method(value) { return this.value + value; },
};
const optionalNull = null;
let optionalUndefined;
console.log(
  optionalObject?.nested.value,
  optionalNull?.nested.value,
  optionalUndefined?.nested,
);
console.log(
  optionalObject?.["nested"]?.["value"],
  optionalNull?.["nested"],
);
console.log(
  optionalFunction?.(4),
  optionalNull?.(4),
  optionalUndefined?.(4),
);
console.log(optionalObject?.method(2), optionalObject.method?.(3));
console.log(
  (optionalObject?.method)(4),
  (optionalObject.method)?.(5),
  (optionalObject?.method)?.(6),
);
console.log("text"?.length, (0)?.missing, false?.missing);

let optionalOrder = "";
function optionalBase(value) {
  optionalOrder = optionalOrder + "base ";
  return value;
}
function optionalKey() {
  optionalOrder = optionalOrder + "key ";
  return "method";
}
function optionalArgument() {
  optionalOrder = optionalOrder + "argument ";
  return 5;
}
const optionalOrdered = {
  value: 20,
  get method() {
    optionalOrder = optionalOrder + "get ";
    return function (value) {
      optionalOrder = optionalOrder + "call ";
      return this.value + value;
    };
  },
};
const orderedResult =
  optionalBase(optionalOrdered)?.[optionalKey()]?.(optionalArgument());
console.log(orderedResult, optionalOrder);
optionalOrder = "";
const skippedResult =
  optionalBase(null)?.[optionalKey()]?.(optionalArgument()).missing;
console.log(skippedResult, optionalOrder);

let optionalBaseCount = 0;
function optionalOnce() {
  optionalBaseCount = optionalBaseCount + 1;
  return { value: optionalBaseCount };
}
console.log(optionalOnce()?.value, optionalBaseCount);
try {
  const notCallable = 1;
  notCallable?.();
} catch (error) {
  console.log(error instanceof TypeError);
}
try {
  (optionalNull?.method)();
} catch (error) {
  console.log(error instanceof TypeError);
}
`,
  },
  {
    globalScriptReference: true,
    name: "delete-non-strict",
    nonStrictScript: true,
    source: `
let declared = 1;
console.log(
  delete declared,
  declared,
  delete unresolvedDeleteName,
  delete arguments,
);
function deleteOrdinaryArguments() { return delete arguments; }
console.log(deleteOrdinaryArguments());
function tdzDelete() {
  console.log(delete later);
  let later = 2;
}
tdzDelete();

let order = "";
function effect(value) { order = order + value + " "; return value; }
console.log(delete effect("value"), order);
try {
  delete (function () { throw new Error("operand"); })();
} catch (error) {
  console.log(error.message);
}

const ordinary = { static: 1, computed: 2 };
console.log(delete ordinary.static, ordinary.static);
console.log(delete ordinary[effect("computed")], ordinary.computed, order);
Object.defineProperty(ordinary, "fixed", {
  configurable: false,
  value: 3,
});
console.log(delete ordinary.fixed, ordinary.fixed);

let skipped = 0;
function skippedKey() { skipped = skipped + 1; return "item"; }
console.log(delete null?.[skippedKey()], skipped);
console.log(delete undefined?.missing.next, skipped);
const live = { item: 4, nested: { kept: 5 } };
console.log(delete live?.item, live.item);
console.log(delete live?.[skippedKey()], skipped);
console.log(delete live?.nested.kept, live.nested.kept);
let tailOrder = "";
function tailKey() {
  tailOrder = tailOrder + "key ";
  return {
    toString() {
      tailOrder = tailOrder + "convert ";
      throw new Error("tail conversion");
    },
  };
}
try {
  delete ({ nested: null })?.nested[tailKey()];
} catch (error) {
  console.log(error instanceof TypeError, tailOrder);
}
function create() { return { final: 6 }; }
console.log(delete create?.().final);
console.log(delete create?.(), typeof create);

/** @param {number} value */
function hinted(value) {
  return delete value?.nested.item;
}
const first = { nested: { item: 7 } };
const second = { extra: 1, nested: { item: 8 } };
console.log(hinted(first), first.nested.item);
console.log(hinted(second), second.nested.item);

const environment = { selected: 9 };
let fallback = 10;
with (environment) {
  console.log(delete selected, delete fallback, delete missingWithName);
}
console.log(environment.selected, fallback);
`,
  },
  {
    name: "delete-strict",
    source: `
function strictDelete() {
  "use strict";
  const fixed = {};
  Object.defineProperty(fixed, "item", {
    configurable: false,
    value: 1,
  });
  try {
    delete fixed.item;
  } catch (error) {
    console.log(error instanceof TypeError, fixed.item);
  }
  let effects = 0;
  console.log(delete (effects = effects + 1), effects);
  const live = { item: 2 };
  console.log(delete live?.item, live.item);
  console.log(delete null?.[(effects = effects + 1)], effects);
}
strictDelete();
`,
  },
  {
    name: "numeric-bitwise-exponent",
    source: `
console.log(2 ** 10, 2 ** 0.5, (-2) ** 2, 2 ** -2, 9 ** 0.5);
console.log(1 ** Infinity, (-1) ** Infinity, NaN ** 0, 0 ** 0, 2 ** NaN);
console.log((-0) ** -1, 0 ** -1, (-0) ** 3, 2 ** 3 ** 2, 2 ** -1074);
console.log(5 & 3, 5 | 3, 5 ^ 3, ~5, ~-1, ~~3.7);
console.log(-1 & 255, -5 | 0, 4294967295 & 1, 2147483647 & -1);
console.log(1 << 31, 1 << 32, 2 << 33, -8 >> 2, 7 >> 1, -1 >> 31);
console.log(-1 >>> 0, -8 >>> 2, 1 >>> 32, 4294967296 >>> 0, NaN >>> 0);
console.log("8" >> 1, "16" ** "0.5", true | false, null ^ 5, undefined & 1);
console.log(1.9 << 1, -1.9 << 1, Infinity >> 1, -Infinity >>> 0, NaN << 3);
console.log(2147483647 << 1, -2147483648 >> 31, 1073741824 << 1);
console.log(+true, +"42", +"", +null, +undefined, +"nan");
console.log(+"0x10", ~"2", -0 >>> 0, (-0) ** 2, +"1e3");
`,
  },
  {
    name: "short-circuit-and-conditional",
    source: `
function logging(label, value) { console.log(label); return value; }
console.log(true && "right", 0 || "fallback", "left" || "unused");
console.log(false && logging("skipped-and", 1));
console.log("" || logging("or-right", "reached"));
console.log(logging("first", null) && logging("skipped-chain", 2));
console.log(logging("second", 1) && logging("third", "kept"));
console.log(null || undefined, "" && 0, NaN || "nan-fallback");
console.log(1 && 0 || "chain", 0 && 1 || "short");
console.log(1 ? logging("taken", "yes") : logging("skipped-else", "no"));
console.log("" ? logging("skipped-then", 1) : logging("else", "no"));
console.log(1 ? 2 ? "both" : "first-only" : "neither");
console.log((0 ? "a" : "b") + (1 && "c") + (undefined || "d"));
let effects = 0;
const touch = function () { effects = effects + 1; return effects; };
console.log(touch() && touch(), effects);
console.log(false && touch(), effects);
`,
  },
  {
    name: "do-while-loops",
    source: `
let count = 0;
do { count = count + 1; } while (count < 3);
console.log(count);
let once = 0;
do { once = once + 1; } while (false);
console.log(once);
let controlled = 0;
do {
  controlled = controlled + 1;
  if (controlled === 2) continue;
  if (controlled >= 4) break;
  console.log("body", controlled);
} while (true);
console.log("after", controlled);
function returning(limit) {
  let steps = 0;
  do {
    steps = steps + 1;
    if (steps >= limit) return steps;
  } while (true);
}
console.log(returning(5));
function alwaysReturns() {
  do { return "immediate"; } while (true);
}
console.log(alwaysReturns());
let text = "";
do text = text + "x"; while (text !== "xxx");
console.log(text);
`,
  },
  {
    name: "typeof-void-remainder",
    source: `
const numberBinding = 1;
let uninitializedBinding;
const objectBinding = { key: 1 };
const arrayBinding = [1, 2];
const promiseBinding = Promise.resolve(1);
function chosen() { return 2; }
console.log(typeof undefined, typeof null, typeof true, typeof 1.5);
console.log(typeof numberBinding, typeof "text", typeof chosen);
console.log(typeof objectBinding, typeof arrayBinding, typeof promiseBinding);
console.log(typeof uninitializedBinding, typeof NaN, typeof (1 === 1));
function readBeforeInitialization() {
  try {
    return typeof shadowed;
  } catch (caught) {
    return "temporal dead zone";
  }
  let shadowed;
}
console.log(readBeforeInitialization());
console.log(void 0, void "operand", void chosen());
console.log(7 % 3, -7 % 3, 7 % -3, 7.25 % 0.5, -5 % 5);
console.log(0 % 5, 5 % 0, 5 % Infinity, Infinity % 5, NaN % 1);
console.log("10" % "3", true % 2, null % 2, undefined % 2);
`,
  },
  {
    name: "typeof-unresolved",
    nonStrictScript: true,
    source: `
console.log(typeof missingTopLevel, typeof (missingParenthesized));
var declared;
let initialized = 1;
console.log(typeof declared, typeof initialized, typeof missingAgain);
function inFunction() {
  var local = "text";
  return typeof local + " " + typeof missingInFunction;
}
console.log(inFunction());
function strictFunction() {
  "use strict";
  return typeof missingInStrict;
}
console.log(strictFunction());
const arrow = () => typeof missingInArrow;
console.log(arrow());
function temporalDeadZone() {
  try {
    return typeof beforeInitialization;
  } catch (caught) {
    return caught.name;
  }
  let beforeInitialization;
}
console.log(temporalDeadZone());
function shadowedIntrinsic() {
  let Promise = 1;
  return typeof Promise;
}
console.log(shadowedIntrinsic());
const environment = {
  present: 1,
  valueless: undefined,
  get supplied() { return function fromGetter() {}; },
};
with (environment) {
  console.log(typeof present, typeof valueless, typeof supplied);
  console.log(typeof missingInWith);
  console.log(typeof initialized);
}
function withTemporalDeadZone(shadowing) {
  const inner = shadowing ? { beforeWith: 1 } : {};
  try {
    with (inner) { return typeof beforeWith; }
  } catch (caught) {
    return caught.name;
  }
  let beforeWith;
}
console.log(withTemporalDeadZone(true), withTemporalDeadZone(false));
console.log(typeof undefined, typeof NaN, typeof Infinity);
`,
  },
  {
    name: "generic-addition",
    source: `
function show(left, right) { console.log(left + right); }
show(1, 2);
show("left", 2);
show(true, "right");
show(null, false);
show(undefined, 1);
show("", null);
`,
  },
  {
    name: "comparisons",
    source: `
console.log(0 === -0, NaN === NaN, 1 !== "1", null !== undefined);
console.log("a" < "b", "😀" > "z", "10" < 2, null <= false);
console.log(Infinity >= 1, -Infinity < 0, NaN >= 0);
`,
  },
  {
    name: "scope-and-branches",
    source: `
const value = "outer";
const undefined = "undefined binding";
const NaN = "NaN binding";
const Infinity = "Infinity binding";
function scope() {
  if (false) {
    console.log(later);
  }
  const later = "initialized";
  if (true) {
    const value = "inner";
    console.log(value);
  } else {
    console.log("wrong");
  }
  console.log(value);
  console.log(later);
}
function globals() {
  console.log(undefined, NaN, Infinity);
}
scope();
globals();
`,
  },
  {
    name: "calls-and-order",
    source: `
function factorial(value) {
  if (value === 0) return 1;
  return value * factorial(value - 1);
}
function first(value) { return value; }
function pair(left, right) { console.log(left, right); }
console.log(factorial(6));
console.log(first(console.log("argument"), console.log("extra")));
pair("missing");
`,
  },
  {
    name: "duplicate-declarations",
    nonStrictScript: true,
    source: `
function duplicate(value, value) { return value; }
function repeated() { return "first"; }
function repeated() { return "last"; }
console.log(duplicate("first", "last"));
console.log(duplicate("only"));
console.log(repeated());
`,
  },
  {
    name: "hints",
    source: `
/** @param {string} left @returns {boolean} */
function hinted(left: number, right: string): null {
  return left + right;
}
function plain(left, right) { return left + right; }
console.log(hinted(1, 2), plain(1, 2));
`,
  },
  {
    name: "number-edges",
    source: `
console.log(5e-324, 1e308 * 10, 0 / 0, 1 / 0, 1 / -0);
console.log(0.1 + 0.2, 140737488355327 + 1);
`,
  },
  {
    name: "unused-function",
    source: `
function unused() { return 1; }
console.log("unused declaration accepted");
`,
  },
  {
    name: "returning-branches",
    source: `
function choose(value) {
  if (value) return "yes";
  else return "no";
}
console.log(choose(true), choose(false));
`,
  },
  {
    name: "specialization-hit",
    source: `
function add(left: number, right: number) { return left + right; }
add(20, 22);
`,
    specialization: {
      genericCallsDisabled: 1,
      genericCallsEnabled: 0,
      hits: 1,
      misses: 0,
      overflowMisses: 0,
    },
  },
  {
    name: "guarded-addition",
    source: `
function add(left: number, right: number) { return left + right; }
/** @param {number} left @param {number} right */
function addJs(left, right) { return left + right; }
function sum(value) {
  if (value === 0) return add(0, 0);
  return add(value, sum(value - 1));
}
function first() { console.log("left argument"); return 1; }
function second() { console.log("right argument"); return 2; }
console.log(add(1, 2));
console.log(add(140737488355327, 0));
console.log(add(-140737488355328, 0));
console.log(add(140737488355327, 1));
console.log(add(-140737488355328, -1));
console.log(add(-0, 0));
console.log(add(0.5, 1));
console.log(add(5e-324, 0));
console.log(add(NaN, 1));
console.log(add(Infinity, 1));
console.log(add(-Infinity, 1));
console.log(add("left", 1));
console.log(add(1, "right"));
console.log(add(true, 1));
console.log(add(null, 1));
console.log(add(undefined, 1));
console.log(addJs(20, 22));
console.log(sum(3));
console.log(add(first(), second()));
`,
    specialization: {
      genericCallsDisabled: 22,
      genericCallsEnabled: 13,
      hits: 9,
      misses: 11,
      overflowMisses: 2,
    },
  },
  {
    name: "ineligible-and-ordered-addition",
    source: `
function plain(left, right) { return left + right; }
/** @param {string} left @param {number} right */
function conflicting(left: number, right: number) { return left + right; }
function first() { console.log("left"); return 1; }
function second() { console.log("right"); return 2; }
console.log(plain(first(), second()));
console.log(conflicting("value", 1));
`,
    specialization: {
      genericCallsDisabled: 2,
      genericCallsEnabled: 2,
      hits: 0,
      misses: 0,
      overflowMisses: 0,
    },
  },
  {
    name: "promises-and-reactions",
    source: `
function settle(resolve) {
  resolve(41);
  resolve(0);
}
function show(value) { console.log("fulfilled", value); }
function showRejected(reason) { console.log("rejected", reason); }
function showAll(values) { console.log("all", values[0], values[1]); }
function showEmpty(values) { console.log("empty", values.length); }
function cleanup() { console.log("cleanup"); }
function cleanupReject() { return Promise.reject(10); }
function cleanupThrow() { throw 11; }
function invalidInput() { console.log("invalid input"); }
function showConstructible(label, callback) {
  try {
    new callback(31);
  } catch (error) {
    console.log(label, "not constructible");
  }
}
function showObservableAll(values) {
  console.log("observable all", values[0]);
}
function showObservableRace(value) {
  console.log("observable race", value);
}
let settleAdopted;
const adopted = new Promise(function pending(resolve) {
  settleAdopted = resolve;
});
const latched = new Promise(function resolveFirst(resolve, reject) {
  resolve(adopted);
  reject("late rejection");
});
const thrownAfterResolve = new Promise(function resolveThenThrow(resolve) {
  resolve(adopted);
  throw "late executor throw";
});
const thenable = {
  then: function resolveFirst(resolve, reject) {
    resolve(adopted);
    reject("late thenable rejection");
  },
};
console.log("sync start");
new Promise(settle).then(show);
new Promise(...[settle]).then(show);
latched.then(show, showRejected);
thrownAfterResolve.then(show, showRejected);
Promise.resolve(thenable).then(show, showRejected);
Promise.resolve(2).then(show);
Promise.reject(3).catch(showRejected);
Promise.all([Promise.resolve(4), 5]).then(showAll);
Promise.all([]).then(showEmpty);
Promise.all([Promise.reject(14), 15]).catch(showRejected);
Promise.race([Promise.resolve(6), Promise.resolve(7)]).then(show);
Promise.resolve(8).finally(cleanup).then(show);
Promise.reject(9).finally(cleanup).catch(showRejected);
Promise.resolve(12).finally(cleanupReject).catch(showRejected);
Promise.resolve(13).finally(cleanupThrow).catch(showRejected);
Promise.all(1).catch(invalidInput);
Promise.race(null).catch(invalidInput);
let exposedResolve;
let exposedReject;
const exposedPromise = new Promise(function expose(resolve, reject) {
  exposedResolve = resolve;
  exposedReject = reject;
});
showConstructible("resolve", exposedResolve);
showConstructible("reject", exposedReject);
exposedPromise.then(show, showRejected);
exposedResolve(32);
const catchObservable = Promise.resolve(33);
catchObservable.then = function observableCatch(onFulfilled, onRejected) {
  console.log("observable catch then");
  return onRejected(34);
};
catchObservable.catch(showRejected);
const finallyObservable = Promise.resolve(35);
finallyObservable.then = function observableFinally(onFulfilled) {
  console.log("observable finally then");
  return onFulfilled(36);
};
finallyObservable.finally(cleanup).then(show);
function observableCleanup() {
  const result = Promise.resolve(0);
  result.then = function observableCleanupThen(onFulfilled) {
    console.log("observable cleanup then");
    return onFulfilled(0);
  };
  return result;
}
Promise.resolve(37).finally(observableCleanup).then(show);
const observable = Promise.resolve(23);
observable.then = function observableThen(onFulfilled) {
  console.log("observable then");
  onFulfilled(24);
};
Promise.all([observable]).then(showObservableAll);
Promise.race([observable]).then(showObservableRace);
const allCallbacks = Promise.resolve(0);
allCallbacks.then = function inspectAllCallbacks(onFulfilled, onRejected) {
  showConstructible("all resolve", onFulfilled);
  showConstructible("all reject", onRejected);
  onFulfilled(43);
};
Promise.all([allCallbacks]).then(showObservableAll, showRejected);
const raceCallbacks = Promise.resolve(0);
raceCallbacks.then = function inspectRaceCallbacks(onFulfilled, onRejected) {
  showConstructible("race resolve", onFulfilled);
  showConstructible("race reject", onRejected);
  onFulfilled(44);
};
Promise.race([raceCallbacks]).then(showObservableRace, showRejected);
const adversarial = Promise.resolve(27);
adversarial.then = function callBoth(onFulfilled, onRejected) {
  onFulfilled(28);
  onRejected(29);
};
Promise.all([adversarial, Promise.resolve(30)]).catch(showRejected);
const throwingThen = Promise.resolve(25);
throwingThen.then = function throwFromThen() { throw 26; };
Promise.all([throwingThen]).catch(showRejected);
const shrinkingFirst = Promise.resolve(0);
const shrinkingValues = [shrinkingFirst, 2];
shrinkingFirst.then = function shrinkDuringAll(onFulfilled) {
  shrinkingValues.length = 1;
  return onFulfilled(40);
};
Promise.all(shrinkingValues).then(function showShrinkingAll(values) {
  console.log("shrinking all", values.length, values[0]);
});
const growingFirst = Promise.resolve(0);
const growingSecond = Promise.resolve(0);
const growingValues = [growingFirst];
growingFirst.then = function growDuringRace(onFulfilled) {
  growingValues[1] = growingSecond;
  return onFulfilled(41);
};
growingSecond.then = function observeGrowingRace(onFulfilled) {
  console.log("growing race element");
  return onFulfilled(42);
};
Promise.race(growingValues).then(show);
const decorated = Promise.resolve(21);
decorated.value = 22;
console.log("promise property", decorated.value, Object.keys(decorated)[0]);
decorated.then = function ownThen() { console.log("own then"); };
decorated.then();
const methodOwner = Promise.resolve(45);
console.log(
  "promise method prototypes",
  Object.getOwnPropertyDescriptor(methodOwner.then, "prototype") ===
    undefined,
  Object.getOwnPropertyDescriptor(methodOwner.catch, "prototype") ===
    undefined,
  Object.getOwnPropertyDescriptor(methodOwner.finally, "prototype") ===
    undefined,
);
Object.setPrototypeOf(methodOwner, null);
console.log(
  "null promise prototype",
  methodOwner.then === undefined,
  methodOwner.catch === undefined,
  methodOwner.finally === undefined,
);
console.log("sync end");
settleAdopted(16);
`,
  },
];
