import type { Fixture } from "../fixture.ts";

export const generatorFixtures: readonly Fixture[] = [
  {
    name: "generators",
    source: `
function* single() {
  yield 1;
}
const once = single();
const firstStep = once.next();
console.log(firstStep.value, firstStep.done);
const secondStep = once.next();
console.log(secondStep.value, secondStep.done);
console.log(once.next().value, once.next().done);

function* several() {
  yield "a";
  yield "b";
  yield "c";
}
const many = several();
console.log(many.next().value, many.next().value, many.next().value);
console.log(many.next().done);

function* echoes() {
  const first = yield "ask";
  const second = yield first + "!";
  return first + "/" + second;
}
const echo = echoes();
console.log(echo.next("ignored").value);
console.log(echo.next("one").value);
const echoed = echo.next("two");
console.log(echoed.value, echoed.done);

function* bare() {
  yield;
  const received = yield;
  console.log("bare received", received);
}
const bareIterator = bare();
console.log(bareIterator.next().value, bareIterator.next().value);
console.log(bareIterator.next(7).done);

function* nothing() {}
const emptyIterator = nothing();
const emptyStep = emptyIterator.next();
console.log(emptyStep.value, emptyStep.done);

function* counted(first, second, third) {
  yield first;
  yield second;
  yield third;
}
console.log(counted.length, counted.name, typeof counted);
const inferred = function* () {
  yield 0;
};
console.log(inferred.name, inferred.length);
const namedExpression = function* explicit() {
  yield 0;
};
console.log(namedExpression.name);
function* rested(...values) {
  let total = 0;
  for (const value of values) {
    total += value;
    yield total;
  }
}
console.log(rested.length);
let restedText = "";
for (const value of rested(1, 2, 3)) restedText += value + ";";
console.log(restedText);

function* looped(limit) {
  for (let index = 0; index < limit; index = index + 1) {
    yield index * index;
  }
  let countdown = limit;
  while (countdown > 0) {
    countdown = countdown - 1;
    yield "down" + countdown;
  }
}
let loopedText = "";
for (const value of looped(3)) loopedText += value + ";";
console.log(loopedText);

function* accumulates() {
  let total = 0;
  for (let index = 0; index < 3; index = index + 1) {
    total += yield index;
  }
  return total;
}
const accumulator = accumulates();
let accumulatorStep = accumulator.next();
while (!accumulatorStep.done) {
  accumulatorStep = accumulator.next(10);
}
console.log("accumulated", accumulatorStep.value);

function* captures() {
  const readers = [];
  for (let index = 0; index < 3; index = index + 1) {
    readers[index] = () => index;
    yield index;
  }
  yield readers[0]() + "|" + readers[1]() + "|" + readers[2]();
}
let capturedText = "";
for (const value of captures()) capturedText += value + ";";
console.log(capturedText);

function* guarded() {
  try {
    yield "try";
    throw new TypeError("inner");
  } catch (error) {
    yield "catch " + error.message;
  } finally {
    yield "finally";
  }
  yield "after";
}
let guardedText = "";
for (const value of guarded()) guardedText += value + ";";
console.log(guardedText);

function* fails() {
  yield "before";
  throw new RangeError("generator failure");
}
const failing = fails();
console.log(failing.next().value);
try {
  failing.next();
} catch (error) {
  console.log("threw", error instanceof RangeError, error.message);
}
console.log(failing.next().value, failing.next().done);

let entered = 0;
function* deferred() {
  entered = entered + 1;
  yield entered;
}
const deferredIterator = deferred();
console.log("before first next", entered);
console.log("after first next", deferredIterator.next().value);

function* selfIterable() {
  yield 1;
}
const selfIterator = selfIterable();
console.log(selfIterator[Symbol.iterator]() === selfIterator);
console.log(typeof selfIterable.prototype);
console.log("next" in selfIterable.prototype);
console.log(selfIterator.next.length, selfIterator.next.name);
function* otherIterable() {
  yield 2;
}
console.log(selfIterable.prototype === otherIterable.prototype);
console.log(selfIterator.next === otherIterable().next);
selfIterable.prototype = 1;
const fallbackIterator = selfIterable();
console.log(fallbackIterator.next().value, fallbackIterator.next().done);
otherIterable.prototype = {
  next() {
    return { value: "own", done: true };
  },
};
const overridden = otherIterable();
console.log(overridden.next().value, overridden.next().done);
try {
  new selfIterable();
} catch (error) {
  console.log("construct", error instanceof TypeError);
}
const spread = [...selfIterable()];
console.log(spread.length, spread[0]);

function* usesReceiver() {
  yield this.marker;
}
const receiverHolder = { marker: "held", read: usesReceiver };
console.log(receiverHolder.read().next().value);

function* delegatesByHand() {
  yield "outer";
  for (const inner of several()) yield "inner:" + inner;
  yield "end";
}
let delegatedText = "";
for (const value of delegatesByHand()) delegatedText += value + ";";
console.log(delegatedText);

function* reentrant() {
  yield reenter();
}
const reentrantIterator = reentrant();
function reenter() {
  try {
    reentrantIterator.next();
  } catch (error) {
    return "running " + (error instanceof TypeError);
  }
  return "no error";
}
console.log(reentrantIterator.next().value);

function* independent() {
  yield 1;
  yield 2;
}
const left = independent();
const right = independent();
console.log(left.next().value, right.next().value, left.next().value);
console.log(left === right, left.next().done, right.next().value);

function* growsAcrossSuspension(depth) {
  let accumulated = {};
  for (let index = 0; index < depth; index = index + 1) {
    accumulated = { ...accumulated, ["key" + index]: index };
    yield Object.keys(accumulated).length;
  }
  return accumulated.key0 + "/" + accumulated["key" + (depth - 1)];
}
const grower = growsAcrossSuspension(12);
let growerStep = grower.next();
let growerText = "";
while (!growerStep.done) {
  growerText += growerStep.value + ";";
  growerStep = grower.next();
}
console.log(growerText, growerStep.value);

function* returnsThroughYieldingFinally() {
  try {
    return 1;
  } finally {
    yield 2;
  }
}
const returning = returnsThroughYieldingFinally();
console.log(returning.next().value, returning.next().value);
console.log(returning.next().value, returning.next().done);

function* throwsThroughYieldingFinally() {
  try {
    throw new TypeError("saved");
  } finally {
    yield "cleanup";
  }
}
const throwing = throwsThroughYieldingFinally();
console.log(throwing.next().value);
try {
  throwing.next();
} catch (error) {
  console.log("resumed", error instanceof TypeError, error.message);
}
console.log(throwing.next().done);
`,
  },
];
