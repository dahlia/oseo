import type { Fixture } from "../fixture.ts";

export const asyncFixtures: readonly Fixture[] = [
  {
    name: "async-continuations",
    source: `
async function calculate(value) {
  console.log("entered", value);
  const first = await Promise.resolve(value);
  console.log("resumed", first);
  const second = await 2;
  return first + second;
}
const expression = async function (value) { return await value; };
const arrow = async (value) => await value;
async function readThis() { await 0; return this.value; }
function makeArrow() {
  return async () => { await 0; return this.value; };
}
async function failEarly() { throw "early"; }
async function failLate() { await 0; throw "late"; }
async function shadow(Promise) { return await Promise; }
async function choose(value) {
  if (value) return 17;
  return 18;
}
async function returnedDeclaration() {
  return later();
  function later() { return 25; }
}
async function thrownDeclaration() {
  throw later();
  function later() { return "hoisted throw"; }
}
async function hoistedAcrossAwait() {
  const value = later();
  await 0;
  function later() { return 19; }
  return value;
}
async function tdzAcrossAwait() {
  try {
    console.log(later);
  } catch (error) {
    console.log("async tdz");
  }
  await 0;
  let later = 20;
  return later;
}
async function finalReturn() {
  try {
    return 21;
  } finally {
    return 22;
  }
}
async function finalThrow() {
  try {
    return 23;
  } finally {
    throw "final throw";
  }
}
let readAsyncParameter;
async function asyncDefaults(
  value = (readAsyncParameter = () => value, 26),
) {
  var value = 27;
  console.log("async default", value, readAsyncParameter());
  return value;
}
async function asyncPatterns(
  { value: first = 28 },
  [second = 29],
) {
  console.log("async patterns", first, second);
  return first + second;
}
const asyncRest = async (...values) => {
  console.log("async rest", values.length, values[0], values[1]);
  return values.length;
};
function failAsyncParameter() { throw "async parameter"; }
async function asyncAbrupt(value = failAsyncParameter()) {
  console.log("incorrect async parameter body", value);
}
const internallyAwaited = Promise.resolve(24);
internallyAwaited.then = function overriddenAwait() {
  console.log("incorrect await override");
  return Promise.resolve(0);
};
async function awaitInternally() { return await internallyAwaited; }
const orderingReady = Promise.resolve(0);
async function orderedAsync() {
  await orderingReady;
  console.log("async ordering");
}
function rejected(reason) { console.log("async rejected", reason); }
function showThis(value) { console.log("async this", value); }
const owner = { value: 41, read: readThis, make: makeArrow };
const other = { value: 0, read: owner.make() };
console.log("sync start");
calculate(40).then(function (value) { console.log("result", value); });
expression(3).then(function (value) { console.log("expression", value); });
arrow(4).then(function (value) { console.log("arrow", value); });
owner.read().then(showThis);
other.read().then(showThis);
failEarly().catch(rejected);
failLate().catch(rejected);
shadow(5).then(function (value) { console.log("shadow", value); });
choose(true).then(function (value) { console.log("choose", value); });
returnedDeclaration().then(function (value) {
  console.log("returned declaration", value);
});
thrownDeclaration().catch(function (reason) {
  console.log("thrown declaration", reason);
});
hoistedAcrossAwait().then(function (value) {
  console.log("hoisted", value);
});
tdzAcrossAwait().then(function (value) { console.log("tdz", value); });
finalReturn().then(function (value) { console.log("final return", value); });
finalThrow().catch(function (reason) { console.log("final throw", reason); });
asyncDefaults();
asyncPatterns({ value: 30 }, []);
asyncRest(31, 32);
let returnedAsyncAbruptly = false;
try {
  const failedParameter = asyncAbrupt();
  returnedAsyncAbruptly = true;
  failedParameter.catch(function (reason) {
    console.log("async parameter rejected", reason, returnedAsyncAbruptly);
  });
} catch (error) {
  console.log("incorrect synchronous parameter throw", error);
}
awaitInternally().then(function (value) {
  console.log("internal await", value);
});
orderedAsync();
orderingReady.then(function firstPlainStep() {
  return Promise.resolve().then(function secondPlainStep() {
    console.log("plain ordering");
  });
});
console.log(
  "async prototype",
  Object.getOwnPropertyDescriptor(expression, "prototype") === undefined,
);
try {
  new expression(0);
} catch (error) {
  console.log("async not constructible");
}
try {
  new arrow(0);
} catch (error) {
  console.log("async arrow not constructible");
}
console.log("sync end");
`,
  },
  {
    name: "timer-event-loop",
    source: `
function microtask(value) { console.log("microtask", value); }
function task(value) {
  console.log("timer", value);
  Promise.resolve(value).then(microtask);
}
function scheduleNested() {
  console.log("timer second");
  // The nested timer needs a deadline past every other timer: a zero delay
  // here races the positive-delay timers whenever a reference host stalls
  // before its first timer tick.
  setTimeout(task, 200, "nested");
  Promise.resolve("second").then(microtask);
}
const objectDelay = {
  valueOf: function objectDelayValue() {
    console.log("coerce object delay");
    return 30;
  },
};
function functionDelay() {}
functionDelay.valueOf = function functionDelayValue() {
  console.log("coerce function delay");
  return 40;
};
const nestedDelay = [1];
nestedDelay.toString = function nestedDelayString() {
  console.log("coerce nested array delay");
  return "10";
};
const nestedValueDelay = [1];
nestedValueDelay.toString = function nestedValueDelayString() {
  return nestedValueDelay;
};
nestedValueDelay.valueOf = function nestedValueDelayValue() {
  console.log("coerce nested array valueOf");
  return "15";
};
const nullPrototypeDelay = Object.create(null);
nullPrototypeDelay.valueOf = function nullPrototypeDelayValue() {
  console.log("coerce null prototype delay");
  return "20";
};
const inheritedArrayDelay = {};
Object.setPrototypeOf(inheritedArrayDelay, [5]);
const customJoinDelay = [1];
customJoinDelay.join = function customJoinDelayJoin() {
  console.log("coerce custom array join");
  return "7";
};
const inheritedJoinPrototype = [];
inheritedJoinPrototype.join = function inheritedJoinDelayJoin() {
  console.log("coerce inherited array join");
  return "9";
};
const inheritedJoinDelay = [1];
Object.setPrototypeOf(inheritedJoinDelay, inheritedJoinPrototype);
const invalidJoinDelay = [1];
invalidJoinDelay.join = function invalidJoinDelayJoin() {
  return {};
};
try {
  setTimeout(task, { valueOf: 1, toString: 2 }, "invalid delay");
} catch (error) {
  console.log("invalid timer delay");
}
try {
  setTimeout(task, invalidJoinDelay, "invalid join delay");
} catch (error) {
  console.log("invalid array join delay");
}
try {
  setTimeout(task, Object.create(null), "invalid null delay");
} catch (error) {
  console.log("invalid null prototype delay");
}
// Timers must register in ascending effective delay: the reference hosts
// use wall-clock deadlines, so a slow interval between two registrations
// would otherwise reorder timers whose delays differ by a few milliseconds.
const canceled = setTimeout(task, 0, "canceled");
clearTimeout(canceled);
setTimeout(task, 0, "first");
setTimeout(scheduleNested, 0);
setTimeout(task, [5], "array delay");
setTimeout(task, inheritedArrayDelay, "inherited array delay");
setTimeout(task, customJoinDelay, "custom join delay");
setTimeout(task, inheritedJoinDelay, "inherited join delay");
setTimeout(task, [nestedDelay], "nested array delay");
setTimeout(task, [nestedValueDelay], "nested array valueOf");
setTimeout(task, [nullPrototypeDelay], "null prototype delay");
setTimeout(task, objectDelay, "object delay");
setTimeout(task, functionDelay, "function delay");
setTimeout(task, 100, "late");
console.log("scheduled");
`,
  },
];
