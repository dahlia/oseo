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
    name: "async-await-positions",
    source: `
function trace(label, value) {
  console.log(label);
  return value;
}
function hintedAdd(left: number, right: number) {
  return left + right;
}
async function positions(input) {
  const retained = { value: 10 };
  const nested = trace("binary left", 1) +
    await Promise.resolve(trace("binary operand", input));
  const called = trace("call target", function (value) {
    console.log("call body", value);
    return value;
  })(await Promise.resolve(trace("call argument", nested)));
  retained.value += await Promise.resolve(
    trace("assignment operand", called),
  );
  const values = [
    trace("array before", retained),
    await Promise.resolve(trace("array operand", retained.value)),
  ];
  const actual = [];
  const pushed = actual.push(
    trace("push before", "before"),
    "Await:" + await {
      then: function (resolve) {
        trace("push thenable", 0);
        resolve("value");
      },
    },
    trace("push after", "after"),
  );
  console.log(
    "push result",
    pushed,
    actual.length,
    actual[0],
    actual[1],
    actual[2],
  );
  const borrowedPush = [].push;
  const generic = { 0: "kept", length: 1, push: borrowedPush };
  console.log(
    "generic push",
    generic.push("second", "third"),
    generic.length,
    generic[0],
    generic[1],
    generic[2],
  );
  const frozenLength = [];
  Object.defineProperty(frozenLength, "length", { writable: false });
  try {
    frozenLength.push("blocked");
  } catch (error) {
    console.log("push rejected", frozenLength.length);
  }
  let loops = 0;
  for (
    let index = 0;
    await Promise.resolve(index < 2);
    index += await Promise.resolve(1)
  ) {
    loops += index;
  }
  try {
    await Promise.reject("caught");
  } catch (error) {
    console.log("caught", error, retained.value, values[1], loops);
  } finally {
    retained.value += await Promise.resolve(1);
    console.log("inner finally", retained.value);
  }
  try {
    return {
      hinted: hintedAdd({
        valueOf: function () {
          console.log("guard miss fallback");
          return 4;
        },
      }, 1),
      result: retained.value,
    };
  } finally {
    console.log("outer finally before");
    await Promise.resolve(0);
    console.log("outer finally after");
  }
}
const arrow = async (value) =>
  trace("arrow before", value) + await Promise.resolve(2);
positions(2).then(function (value) {
  console.log("positions result", value.result, value.hinted);
});
arrow(3).then(function (value) {
  console.log("arrow result", value);
});
`,
    specialization: {
      genericCallsDisabled: 10,
      genericCallsEnabled: 10,
      hits: 0,
      misses: 12,
      overflowMisses: 0,
    },
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
  {
    name: "async-pattern-await-positions",
    source: `
function trace(label, value) {
  console.log(label);
  return value;
}
function hintedAdd(left: number, right: number) {
  return left + right;
}
async function settle(label, value) {
  console.log("await", label);
  return value;
}
async function positions(input) {
  const box = { first: {}, second: {} };
  // A member target evaluates its object and computed key before the
  // iterator step that selects the value it stores.
  [
    trace("target base", box).first[await settle("target key", "a")],
    box.second[await settle("second key", "b")],
  ] = [trace("value one", 1), trace("value two", 2)];
  console.log("targets", box.first.a, box.second.b);

  // A computed source key suspends before the property read it names.
  const source = { one: 11, two: 22, three: 33 };
  const { [await settle("source key", "one")]: named } = source;
  console.log("named", named);

  // Object and array binding defaults suspend only when the selected
  // value is undefined.
  const { present = await settle("unused default", -1), missing = await settle(
    "object default",
    input,
  ) } = { present: 7 };
  const [kept = await settle("unused element", -1), absent = await settle(
    "array default",
    input + 1,
  )] = [8];
  console.log("defaults", present, missing, kept, absent);

  // Nested patterns keep their own suspension points.
  const {
    outer: { inner = await settle("nested object", 5) } = {},
    list: [head = await settle("nested array", 6)] = [],
  } = { list: [] };
  console.log("nested", inner, head);

  // Rest retains every excluded key computed across a suspension.
  const {
    [await settle("excluded one", "one")]: taken,
    [await settle("excluded two", "two")]: alsoTaken,
    ...others
  } = source;
  console.log("rest", taken, alsoTaken, others.one, others.two, others.three);

  // The binding cell a closure captured before the suspension is the
  // cell the pattern writes after it.
  let cell = 0;
  const read = function () { return cell; };
  ({ cell = await settle("cell", 9) } = {});
  console.log("cell", cell, read());

  // A for-of assignment head reuses the same target preparation.
  for ([box.first[await settle("head key", "h")]] of [[1], [2]]) {
    console.log("head", box.first.h);
  }
  const readers = [];
  for (const { loop = await settle("head default", 3) } of [{}, { loop: 4 }]) {
    console.log("head default", loop);
    readers.push(function () { return loop; });
  }
  console.log("head cells", readers[0](), readers[1]());
  const varReaders = [];
  const records = [{}, { hoisted: 6 }];
  for (var { hoisted = await settle("var default", 5) } of records) {
    varReaders.push(function () { return hoisted; });
  }
  console.log("var cells", varReaders[0](), varReaders[1](), hoisted);

  // A deliberate guard miss reaches the compiled generic fallback with a
  // value the number hint does not describe.
  const [guarded = await settle("guard operand", {
    valueOf: function () {
      console.log("guard miss fallback");
      return input;
    },
  })] = [];
  return hintedAdd(guarded, 1);
}
positions(2).then(function (value) {
  console.log("positions result", value);
});
`,
    specialization: {
      genericCallsDisabled: 2,
      genericCallsEnabled: 2,
      hits: 3,
      misses: 13,
      overflowMisses: 0,
    },
  },
  {
    name: "async-pattern-await-abrupt",
    source: `
function makeIterable(label, values) {
  let index = 0;
  let closes = 0;
  return {
    closeCount: function () { return closes; },
    iterable: {
      [Symbol.iterator]: function () {
        return {
          next: function () {
            const done = index >= values.length;
            const value = values[index];
            index += 1;
            console.log(label, "step", done, value);
            return { done: done, value: value };
          },
          return: function () {
            closes += 1;
            console.log(label, "close");
            return { done: true, value: undefined };
          },
        };
      },
    },
  };
}
async function unfinished() {
  // The iterator is not done, so a rejected default closes it once
  // before the throw completion leaves the pattern.
  const source = makeIterable("unfinished", [undefined, 2]);
  try {
    const [first = await Promise.reject("rejected default")] = source.iterable;
    console.log("unreachable", first);
  } catch (error) {
    console.log("unfinished caught", error, source.closeCount());
  }
}
async function exhausted() {
  // The iterator already reported done, so the same rejection leaves it
  // closed by the protocol rather than by IteratorClose.
  const source = makeIterable("exhausted", []);
  try {
    const [first = await Promise.reject("rejected default")] = source.iterable;
    console.log("unreachable", first);
  } catch (error) {
    console.log("exhausted caught", error, source.closeCount());
  }
}
async function keyRejection() {
  const target = {};
  try {
    ({ [await Promise.reject("rejected key")]: target.slot } = { a: 1 });
    console.log("unreachable");
  } catch (error) {
    console.log("key caught", error, target.slot);
  }
}
async function targetRejection() {
  const source = makeIterable("target", [1, 2]);
  try {
    const holder = {};
    [holder.first, holder[await Promise.reject("rejected target")]] =
      source.iterable;
    console.log("unreachable", holder.first);
  } catch (error) {
    console.log("target caught", error, source.closeCount());
  }
}
async function finallyPrecedence() {
  try {
    try {
      const { value = await Promise.reject("inner") } = {};
      console.log("unreachable", value);
    } finally {
      console.log("finally before");
      await Promise.resolve(0);
      console.log("finally after");
    }
  } catch (error) {
    console.log("precedence", error);
  }
}
async function catchParameter() {
  try {
    throw { reason: "thrown" };
  } catch ({ reason, fallback = await Promise.resolve("filled") }) {
    console.log("catch", reason, fallback);
  }
}
async function main() {
  await unfinished();
  await exhausted();
  await keyRejection();
  await targetRejection();
  await finallyPrecedence();
  await catchParameter();
  console.log("finished");
}
main();
`,
    specialization: {
      genericCallsDisabled: 5,
      genericCallsEnabled: 5,
      hits: 2,
      misses: 8,
      overflowMisses: 0,
    },
  },
  {
    name: "async-declaration-list-await",
    source: `
function settle(label, value, reject) {
  console.log("settle", label);
  return reject ? Promise.reject(label) : Promise.resolve(value);
}
async function ordered() {
  // Each declarator suspends in turn, and a later initializer reads the
  // cell an earlier one filled across the suspension.
  let first = await settle("first", 1, false),
    second = first + (await settle("second", 2, false));
  const [third, fourth = await settle("fourth", 4, false)] =
      await settle("third", [3], false),
    fifth = first + second + third + fourth;
  console.log("ordered", first, second, third, fourth, fifth);
}
async function rejected() {
  let reader;
  try {
    reader = () => trailing;
    let leading = await settle("leading", 1, false),
      stopped = await settle("stopped", 0, true),
      trailing = await settle("trailing", 3, false);
    console.log("unreachable", leading, stopped, trailing);
  } catch (error) {
    console.log("rejected", error);
  }
  try {
    reader();
  } catch (error) {
    console.log("rejected-tdz", error instanceof ReferenceError);
  }
}
async function loops() {
  const captured = [];
  for (let index = 0; index < 2; index = index + 1) {
    let held = await settle("loop", index, false), capture = () => held;
    held = held + 10;
    captured[index] = capture;
  }
  console.log("loops", captured[0](), captured[1]());
}
async function main() {
  await ordered();
  await rejected();
  await loops();
  console.log("finished");
}
main();
`,
  },
];
