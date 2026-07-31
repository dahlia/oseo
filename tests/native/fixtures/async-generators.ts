import type { Fixture } from "../fixture.ts";

/*
 * Asynchronous generator fixtures. An asynchronous generator reports
 * every step through a promise, so each fixture observes those steps
 * from inside one asynchronous entry function, or from explicit promise
 * chains whose relative order the specification fixes.
 */
export const asyncGeneratorFixtures: readonly Fixture[] = [
  {
    name: "async-generators",
    source: `
async function* single() {
  yield 1;
}
async function* several() {
  yield "a";
  yield "b";
  yield "c";
}
async function* awaiting(promise) {
  const first = await promise;
  console.log("inside", first);
  yield first;
  const sent = yield "second";
  console.log("sent", sent);
  return "final";
}
async function* empty() {}
async function* returning() {
  return Promise.resolve("unwrapped");
}
async function* yieldingPromise() {
  yield Promise.resolve("settled");
  yield;
}
async function* counted(first, second, third) {
  yield first;
  yield second;
  yield third;
}
let parameterStage = 0;
function parameterFallback() {
  parameterStage += 1;
  return 4;
}
async function* defaultedParameter(value = parameterFallback()) {
  console.log("default body", parameterStage);
  yield value;
}
async function* recursiveParameters(
  [head = 2, { value: nested = 3 } = {}, ...tail] = [],
  { kept = 5, branch: [leaf = 7] = [], ...rest } = {},
) {
  yield head + nested + tail.length + kept + leaf + rest.extra;
}
/** @param {number} hinted */
async function* falselyHinted([hinted]) {
  yield hinted;
}
function throwDuringParameter() {
  parameterStage += 1;
  throw new RangeError("parameter");
}
async function* abruptParameter(value = throwDuringParameter()) {
  yield value;
}
async function* laterParameter(first = second, second = 1) {
  yield first + second;
}
async function main() {
  const once = single();
  const firstStep = await once.next();
  console.log(firstStep.value, firstStep.done);
  const secondStep = await once.next();
  console.log(secondStep.value, secondStep.done);
  const thirdStep = await once.next();
  console.log(thirdStep.value, thirdStep.done);

  for await (const value of several()) console.log("several", value);

  const iterator = awaiting(Promise.resolve("awaited"));
  const step1 = await iterator.next();
  console.log(step1.value, step1.done);
  const step2 = await iterator.next("ignored");
  console.log(step2.value, step2.done);
  const step3 = await iterator.next("delivered");
  console.log(step3.value, step3.done);
  const step4 = await iterator.next();
  console.log(step4.value, step4.done);

  const emptyStep = await empty().next();
  console.log("empty", emptyStep.value, emptyStep.done);

  const returned = await returning().next();
  console.log("returned", returned.value, returned.done);

  for await (const value of yieldingPromise()) console.log("promised", value);

  const defaulted = defaultedParameter();
  console.log("default call", parameterStage);
  const defaultedStep = await defaulted.next();
  console.log(defaultedStep.value);
  const undefinedStep = await defaultedParameter(undefined).next();
  console.log(undefinedStep.value);
  const nullStep = await defaultedParameter(null).next();
  console.log(nullStep.value);
  const recursiveStep = await recursiveParameters(
    [1, { value: 4 }, 8, 9],
    { kept: 6, branch: [10], extra: 11 },
  ).next();
  console.log("recursive", recursiveStep.value);
  const recursiveDefaultStep = await recursiveParameters().next();
  console.log("recursive defaults", recursiveDefaultStep.value);
  const falseHintStep = await falselyHinted(["text"]).next();
  console.log("false hint", falseHintStep.value);
  try {
    abruptParameter();
  } catch (error) {
    console.log(
      "parameter abrupt",
      parameterStage,
      error instanceof RangeError,
    );
  }
  try {
    laterParameter();
  } catch (error) {
    console.log("parameter tdz", error instanceof ReferenceError);
  }

  console.log(counted.length, counted.name, typeof counted);
  console.log(typeof counted.prototype);
  const inferred = async function* () {
    yield 0;
  };
  console.log(inferred.name, inferred.length);
  const namedExpression = async function* explicit() {
    yield 0;
  };
  console.log(namedExpression.name);
  const generatorObject = counted(1, 2, 3);
  console.log(generatorObject[Symbol.asyncIterator]() === generatorObject);
  console.log(generatorObject[Symbol.iterator]);
  console.log(typeof generatorObject.next, typeof generatorObject.return);
  console.log(typeof generatorObject.throw);
  console.log(generatorObject.next === counted(1, 2, 3).next);
  /* MakeConstructor never runs for an asynchronous generator function, so
   * its prototype object carries no own constructor; the inherited one
   * comes from %AsyncGeneratorPrototype% and the prototype fixture below
   * observes it. */
  console.log(
    "own constructor",
    typeof Object.getOwnPropertyDescriptor(counted.prototype, "constructor"),
  );
  console.log(
    "in",
    "next" in generatorObject,
    "return" in generatorObject,
    "throw" in generatorObject,
    Symbol.asyncIterator in generatorObject,
  );
  console.log("iterator in", Symbol.iterator in generatorObject);
  let constructed = "constructible";
  try {
    new counted();
  } catch (error) {
    constructed = error.constructor.name;
  }
  console.log("construct", constructed);
  console.log("finished");
}
main();
`,
  },
  {
    name: "async-generator-prototypes",
    source: `
async function* first() {
  yield 1;
}
async function* second() {
  yield 2;
}
const iterator = first();
const AsyncGenerator = first.prototype.constructor;
const AsyncGeneratorFunction = first.constructor;
console.log(typeof first.prototype, typeof AsyncGenerator);
console.log(typeof AsyncGeneratorFunction, AsyncGeneratorFunction.name);
console.log(AsyncGeneratorFunction.length);
console.log(AsyncGenerator === second.prototype.constructor);
console.log(AsyncGeneratorFunction === second.constructor);
console.log(AsyncGeneratorFunction.prototype === AsyncGenerator);
console.log(AsyncGenerator.constructor === AsyncGeneratorFunction);
console.log(first.prototype === second.prototype);
console.log(first.prototype === AsyncGenerator.prototype);
console.log(AsyncGenerator[Symbol.toStringTag]);
console.log(AsyncGenerator.prototype[Symbol.toStringTag]);
console.log(first.prototype[Symbol.toStringTag], iterator[Symbol.toStringTag]);
console.log(
  "in",
  "next" in first.prototype,
  "return" in first.prototype,
  "throw" in first.prototype,
  "constructor" in first.prototype,
);
console.log(
  "iterator in",
  Symbol.asyncIterator in first.prototype,
  Symbol.iterator in first.prototype,
);
console.log(iterator[Symbol.asyncIterator]() === iterator);
/* The method is generic over its receiver, so an ordinary object that
 * borrows it is reported back unchanged. */
const holder = { [Symbol.asyncIterator]: iterator[Symbol.asyncIterator] };
console.log(holder[Symbol.asyncIterator]() === holder);
console.log(iterator.next === second().next);
console.log(iterator.next.length, iterator.next.name);
console.log(iterator.return.length, iterator.return.name);
console.log(iterator.throw.length, iterator.throw.name);
const self = iterator[Symbol.asyncIterator];
console.log(self.length, self.name);
/* Every method is an own property of the intrinsic the specification
 * places it on, so a descriptor read sees the same set a property read
 * does. */
const nextDescriptor = Object.getOwnPropertyDescriptor(
  AsyncGenerator.prototype,
  "next",
);
console.log(
  "next descriptor",
  nextDescriptor.value === iterator.next,
  nextDescriptor.writable,
  nextDescriptor.enumerable,
  nextDescriptor.configurable,
);
console.log(
  "own methods",
  typeof Object.getOwnPropertyDescriptor(AsyncGenerator.prototype, "return"),
  typeof Object.getOwnPropertyDescriptor(AsyncGenerator.prototype, "throw"),
  typeof Object.getOwnPropertyDescriptor(
    AsyncGenerator.prototype,
    Symbol.asyncIterator,
  ),
);
const constructorDescriptor = Object.getOwnPropertyDescriptor(
  AsyncGenerator.prototype,
  "constructor",
);
console.log(
  "constructor descriptor",
  constructorDescriptor.value === AsyncGenerator,
  constructorDescriptor.writable,
  constructorDescriptor.enumerable,
  constructorDescriptor.configurable,
);
const tagDescriptor = Object.getOwnPropertyDescriptor(
  AsyncGenerator.prototype,
  Symbol.toStringTag,
);
console.log(
  "tag descriptor",
  tagDescriptor.value,
  tagDescriptor.writable,
  tagDescriptor.enumerable,
  tagDescriptor.configurable,
);
const prototypeDescriptor = Object.getOwnPropertyDescriptor(
  AsyncGenerator,
  "prototype",
);
console.log(
  "prototype descriptor",
  prototypeDescriptor.value === AsyncGenerator.prototype,
  prototypeDescriptor.writable,
  prototypeDescriptor.enumerable,
  prototypeDescriptor.configurable,
);
const functionDescriptor = Object.getOwnPropertyDescriptor(
  AsyncGeneratorFunction,
  "prototype",
);
console.log(
  "function descriptor",
  functionDescriptor.value === AsyncGenerator,
  functionDescriptor.writable,
  functionDescriptor.enumerable,
  functionDescriptor.configurable,
);
console.log(
  "enumerable keys",
  Object.keys(AsyncGenerator).length,
  Object.keys(AsyncGenerator.prototype).length,
  Object.keys(AsyncGeneratorFunction).length,
);
/* GetPrototypeFromConstructor falls back to %AsyncGeneratorPrototype%
 * whenever the function's own prototype is not an object, so the
 * generator still reaches the intrinsic chain. */
async function* fallback() {
  yield "fallen";
}
fallback.prototype = 1;
const fallbackIterator = fallback();
console.log(fallbackIterator[Symbol.toStringTag]);
console.log(fallbackIterator[Symbol.asyncIterator]() === fallbackIterator);
/* A replaced prototype object drops the chain with it, so the
 * replacement's own methods are the only ones a generator reaches. */
async function* replaced() {
  yield "unreached";
}
replaced.prototype = {
  next: function () {
    return Promise.resolve({ value: "own", done: true });
  },
};
const replacedIterator = replaced();
console.log(
  "replaced",
  typeof replacedIterator.next,
  typeof replacedIterator.return,
  replacedIterator[Symbol.toStringTag],
);
async function main() {
  const step = await iterator.next();
  console.log(step.value, step.done);
  const fallbackStep = await fallbackIterator.next();
  console.log(fallbackStep.value, fallbackStep.done);
  const replacedStep = await replacedIterator.next();
  console.log(replacedStep.value, replacedStep.done);
  /* Each method rejects rather than throws when its receiver is not an
   * asynchronous generator, which is what IfAbruptRejectPromise gives
   * every one of the three. */
  const borrowed = {
    next: iterator.next,
    return: iterator.return,
    throw: iterator.throw,
  };
  const rejected = await borrowed.next().then(
    function () {
      return "resolved";
    },
    function (error) {
      return error.constructor.name;
    },
  );
  console.log("borrowed next", rejected);
  const borrowedReturn = await borrowed.return().then(
    function () {
      return "resolved";
    },
    function (error) {
      return error.constructor.name;
    },
  );
  console.log("borrowed return", borrowedReturn);
  const borrowedThrow = await borrowed.throw().then(
    function () {
      return "resolved";
    },
    function (error) {
      return error.constructor.name;
    },
  );
  console.log("borrowed throw", borrowedThrow);
  const onPrototype = await first.prototype.next().then(
    function () {
      return "resolved";
    },
    function (error) {
      return error.constructor.name;
    },
  );
  console.log("prototype receiver", onPrototype);
  /* A configurable own property is deletable, and deleting it leaves the
   * generator with nothing to inherit. This runs last because it mutates
   * the shared intrinsic. */
  console.log("delete throw", delete AsyncGenerator.prototype.throw);
  console.log("after delete", iterator.throw, "throw" in first.prototype);
  console.log("finished");
}
main();
`,
  },
  {
    name: "async-generator-resumptions",
    source: `
async function* guarded() {
  try {
    yield 1;
    yield 2;
  } catch (error) {
    console.log("caught", error);
    yield "recovered";
  } finally {
    console.log("finally");
  }
  yield 3;
}
async function* cleaned() {
  try {
    yield "held";
  } finally {
    console.log("cleanup");
    await Promise.resolve("drained");
    console.log("cleanup awaited");
  }
}
async function* yieldingFinally() {
  try {
    yield "first";
  } finally {
    yield "from finally";
  }
}
async function main() {
  const thrown = guarded();
  const a = await thrown.next();
  console.log(a.value, a.done);
  const b = await thrown.throw("boom");
  console.log(b.value, b.done);
  const c = await thrown.next();
  console.log(c.value, c.done);
  const d = await thrown.next();
  console.log(d.value, d.done);

  const returned = guarded();
  const e = await returned.next();
  console.log(e.value, e.done);
  const f = await returned.return("early");
  console.log(f.value, f.done);
  const g = await returned.next();
  console.log(g.value, g.done);

  const unstarted = guarded();
  const h = await unstarted.return(Promise.resolve("never entered"));
  console.log(h.value, h.done);

  const unstartedThrow = guarded();
  const i = await unstartedThrow.throw("never entered throw").then(
    function (step) {
      return "resolved " + step.value;
    },
    function (error) {
      return "rejected " + error;
    },
  );
  console.log(i);

  const closing = cleaned();
  const j = await closing.next();
  console.log(j.value, j.done);
  const k = await closing.return("closed");
  console.log(k.value, k.done);

  const refusing = yieldingFinally();
  const l = await refusing.next();
  console.log(l.value, l.done);
  const m = await refusing.return("refused");
  console.log(m.value, m.done);
  const n = await refusing.next();
  console.log(n.value, n.done);

  for await (const value of guarded()) {
    console.log("loop", value);
    break;
  }
  console.log("finished");
}
main();
`,
  },
  {
    name: "async-generator-delegation",
    source: `
async function* inner() {
  const sent = yield "inner-1";
  console.log("inner received", sent);
  yield "inner-2";
  return "inner-return";
}
async function* delegatingAsync() {
  const result = yield* inner();
  console.log("delegated result", result);
  yield "after";
}
async function* delegatingArray() {
  yield* [1, 2, 3];
}
function* syncInner() {
  yield "sync-1";
  yield Promise.resolve("sync-promised");
}
async function* delegatingSync() {
  yield* syncInner();
}
async function* delegatingManual() {
  yield* {
    [Symbol.asyncIterator]: function () {
      let index = 0;
      return {
        next: function (sent) {
          index = index + 1;
          console.log("manual step", index, sent);
          return Promise.resolve({ value: index, done: index > 2 });
        },
        return: function (value) {
          console.log("manual return", value);
          return Promise.resolve({ value: value, done: true });
        },
        throw: function (reason) {
          console.log("manual throw", reason);
          return Promise.resolve({ value: "handled", done: false });
        },
      };
    },
  };
}
async function* nested() {
  yield* delegatingArray();
  yield* delegatingSync();
}
/* The async-from-sync wrapper owns both missing-method paths: a sync
 * iterator with no throw is closed before the TypeError reaches the
 * delegating body, and one with no return reports the delivered value
 * through the wrapper's own promise. */
const syncNoThrow = {
  [Symbol.iterator]: function () {
    return {
      next: function () {
        return { value: "no-throw", done: false };
      },
      return: function (value) {
        console.log("sync close", value);
        return { value: value, done: true };
      },
    };
  },
};
async function* delegatingNoThrow() {
  yield* syncNoThrow;
}
const syncNoReturn = {
  [Symbol.iterator]: function () {
    return {
      next: function () {
        return { value: "no-return", done: false };
      },
    };
  },
};
async function* delegatingNoReturn() {
  yield* syncNoReturn;
}
/* A native asynchronous iterator with no return method takes the other
 * half of that path: no wrapper stands between the delegation and the
 * iterator, so the delegation awaits the delivered value itself and a
 * thenable resumption value is unwrapped before the delegating body
 * leaves through the return completion. */
const asyncNoReturn = {
  [Symbol.asyncIterator]: function () {
    return {
      next: function () {
        return Promise.resolve({ value: "async-no-return", done: false });
      },
    };
  },
};
async function* delegatingAsyncNoReturn() {
  yield* asyncNoReturn;
}
async function main() {
  const iterator = delegatingAsync();
  const a = await iterator.next();
  console.log(a.value, a.done);
  const b = await iterator.next("outer-sent");
  console.log(b.value, b.done);
  const c = await iterator.next();
  console.log(c.value, c.done);
  const d = await iterator.next();
  console.log(d.value, d.done);

  for await (const value of delegatingArray()) console.log("array", value);
  for await (const value of delegatingSync()) console.log("sync", value);
  for await (const value of nested()) console.log("nested", value);

  const manual = delegatingManual();
  const e = await manual.next();
  console.log(e.value, e.done);
  const f = await manual.throw("delegated throw");
  console.log(f.value, f.done);
  const g = await manual.return("delegated return");
  console.log(g.value, g.done);

  const missing = delegatingArray();
  const h = await missing.next();
  console.log(h.value, h.done);
  const i = await missing.throw(new Error("no throw method")).then(
    function () {
      return "resolved";
    },
    function (error) {
      return error.constructor.name;
    },
  );
  console.log("missing throw", i);

  const closed = delegatingArray();
  const j = await closed.next();
  console.log(j.value, j.done);
  const k = await closed.return("closed");
  console.log(k.value, k.done);

  const noThrow = delegatingNoThrow();
  const l = await noThrow.next();
  console.log(l.value, l.done);
  const m = await noThrow.throw(new Error("no sync throw")).then(
    function () {
      return "resolved";
    },
    function (error) {
      return error.constructor.name;
    },
  );
  console.log("sync missing throw", m);

  const noReturn = delegatingNoReturn();
  const n = await noReturn.next();
  console.log(n.value, n.done);
  const ordered = noReturn.return("sent").then(function (step) {
    console.log("sync missing return", step.value, step.done);
  });
  Promise.resolve()
    .then(function () {
      console.log("t1");
    })
    .then(function () {
      console.log("t2");
    })
    .then(function () {
      console.log("t3");
    })
    .then(function () {
      console.log("t4");
    })
    .then(function () {
      console.log("t5");
    });
  await ordered;

  const asyncNoReturnIterator = delegatingAsyncNoReturn();
  const o = await asyncNoReturnIterator.next();
  console.log(o.value, o.done);
  const asyncOrdered = asyncNoReturnIterator.return("async sent").then(
    function (step) {
      console.log("async missing return", step.value, step.done);
    },
  );
  Promise.resolve()
    .then(function () {
      console.log("u1");
    })
    .then(function () {
      console.log("u2");
    })
    .then(function () {
      console.log("u3");
    })
    .then(function () {
      console.log("u4");
    })
    .then(function () {
      console.log("u5");
    });
  await asyncOrdered;

  const unwrapping = delegatingAsyncNoReturn();
  const p = await unwrapping.next();
  console.log(p.value, p.done);
  const q = await unwrapping.return(Promise.resolve("thenable sent"));
  console.log("unwrapped return", q.value, q.done);
  console.log("finished");
}
main();
`,
  },
  {
    name: "async-generator-scheduling",
    source: `
async function* counter() {
  console.log("body start");
  yield 1;
  console.log("after first yield");
  yield 2;
  console.log("body end");
}
async function* mixed() {
  console.log("A");
  await null;
  console.log("B");
  yield "x";
  console.log("C");
  await Promise.resolve(0);
  console.log("D");
  return "end";
}
const stepped = counter();
console.log("created");
stepped.next().then(function (step) {
  console.log("step1", step.value, step.done);
});
console.log("after first next");
Promise.resolve("tick").then(function (value) {
  console.log(value);
});
stepped.next().then(function (step) {
  console.log("step2", step.value, step.done);
});
Promise.resolve("tick2").then(function (value) {
  console.log(value);
});
stepped.next().then(function (step) {
  console.log("step3", step.value, step.done);
});
const interleaved = mixed();
interleaved.next().then(function (step) {
  console.log("mixed1", step.value, step.done);
});
interleaved.next().then(function (step) {
  console.log("mixed2", step.value, step.done);
});
Promise.resolve()
  .then(function () {
    console.log("t1");
  })
  .then(function () {
    console.log("t2");
  })
  .then(function () {
    console.log("t3");
  })
  .then(function () {
    console.log("t4");
  })
  .then(function () {
    console.log("t5");
  });
console.log("sync end");
`,
  },
  {
    name: "async-generator-errors",
    source: `
async function* rejecting() {
  await Promise.reject(new Error("await rejected"));
  yield "never";
}
async function* caughtRejection() {
  try {
    await Promise.reject("inner rejection");
  } catch (error) {
    console.log("caught", error);
    yield "after catch";
  }
}
async function* throwing() {
  yield "before";
  throw new Error("body throw");
}
async function* timed() {
  await new Promise(function (resolve) {
    setTimeout(resolve, 1);
  });
  yield "after timer";
  await new Promise(function (resolve) {
    setTimeout(resolve, 1);
  });
  yield "after second timer";
}
async function main() {
  const rejected = await rejecting().next().then(
    function () {
      return "resolved";
    },
    function (error) {
      return "rejected " + error.message;
    },
  );
  console.log(rejected);

  for await (const value of caughtRejection()) {
    console.log("caught path", value);
  }

  const failing = throwing();
  const a = await failing.next();
  console.log(a.value, a.done);
  const b = await failing.next().then(
    function () {
      return "resolved";
    },
    function (error) {
      return "rejected " + error.message;
    },
  );
  console.log(b);
  const c = await failing.next();
  console.log("after throw", c.value, c.done);

  for await (const value of timed()) console.log("timed", value);

  const running = counterHolder();
  const first = running.next();
  const second = running.next();
  const third = running.next();
  const steps = await Promise.all([first, second, third]);
  let text = "";
  for (const step of steps) text += step.value + ":" + step.done + " ";
  console.log("queued", text);

  const borrowed = { next: counterHolder().next };
  const misapplied = await borrowed.next().then(
    function () {
      return "resolved";
    },
    function (error) {
      return error.constructor.name;
    },
  );
  console.log("misapplied", misapplied);
  console.log("finished");
}
async function* counterHolder() {
  yield "q1";
  yield "q2";
}
main();
`,
  },
  {
    name: "async-generator-delegation-suspension",
    source: `
function pendingDelegate() {
  let resolveStep;
  let index = 0;
  return {
    iterator: {
      [Symbol.asyncIterator]: function () { return this; },
      next: function () {
        index += 1;
        if (index > 1) return { value: "end", done: true };
        return new Promise(function (resolve) {
          resolveStep = resolve;
        });
      },
    },
    resolve: function () {
      resolveStep({ value: "first", done: false });
    },
  };
}
async function* delegate(source) {
  const result = yield* source;
  console.log("delegation done", result);
}
async function main() {
  const pending = pendingDelegate();
  const iterator = delegate(pending.iterator);
  const first = iterator.next();
  console.log("next caller resumed");
  Promise.resolve().then(function () {
    console.log("resolve delegated next");
    pending.resolve();
  });
  const firstStep = await first;
  console.log("first step", firstStep.value, firstStep.done);
  const finalStep = await iterator.next();
  console.log("final step", finalStep.value, finalStep.done);

  const returning = {
    [Symbol.asyncIterator]: function () { return this; },
    next: function () { return { value: "open", done: false }; },
    return: function () {
      return new Promise(function (resolve) {
        setTimeout(function () {
          console.log("return timer");
          resolve({ value: "closed", done: true });
        }, 1);
      });
    },
  };
  const returnedIterator = delegate(returning);
  console.log("return open", (await returnedIterator.next()).value);
  const returned = returnedIterator.return("requested");
  console.log("return caller resumed");
  const returnedStep = await returned;
  console.log("return step", returnedStep.value, returnedStep.done);

  const throwing = {
    [Symbol.asyncIterator]: function () { return this; },
    next: function () { return { value: "open", done: false }; },
    throw: function () {
      return new Promise(function (resolve) {
        setTimeout(function () {
          console.log("throw timer");
          resolve({ value: "caught", done: true });
        }, 1);
      });
    },
  };
  const thrownIterator = delegate(throwing);
  console.log("throw open", (await thrownIterator.next()).value);
  const thrown = thrownIterator.throw("reason");
  console.log("throw caller resumed");
  const thrownStep = await thrown;
  console.log("throw step", thrownStep.value, thrownStep.done);
}
main();
`,
  },
  {
    name: "async-generator-for-await-suspension",
    source: `
function source() {
  let index = 0;
  return {
    [Symbol.asyncIterator]: function () {
      return {
        next: function () {
          index += 1;
          return new Promise(function (resolve) {
            setTimeout(function () {
              console.log("step timer", index);
              resolve({ value: index, done: false });
            }, 1);
          });
        },
        return: function () {
          console.log("close called");
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}
async function* consume(iterable) {
  for await (const value of iterable) {
    console.log("loop value", value);
    yield value * 2;
  }
}
async function main() {
  const iterator = consume(source());
  const pending = iterator.next();
  console.log("next caller resumed");
  const first = await pending;
  console.log("first yield", first.value, first.done);
  const returned = iterator.return("stopped");
  console.log("return caller resumed");
  const final = await returned;
  console.log("return result", final.value, final.done);
}
main();
`,
  },
  {
    name: "async-generator-missing-throw-close-suspension",
    source: `
function delegate(label, settlement) {
  return {
    [Symbol.asyncIterator]: function () {
      return {
        next: function () {
          return Promise.resolve({ value: "open", done: false });
        },
        return: function () {
          console.log(label, "close called");
          return new Promise(function (resolve, reject) {
            if (settlement === "never") return;
            const settle = function () {
              console.log(label, "close settled");
              if (settlement === "reject") {
                reject(new RangeError("close"));
              } else {
                resolve({ value: undefined, done: true });
              }
            };
            if (settlement === "timer") setTimeout(settle, 1);
            else Promise.resolve().then(settle);
          });
        },
      };
    },
  };
}
function syncDelegate() {
  return {
    [Symbol.iterator]: function () {
      return {
        next: function () {
          return { value: "sync-open", done: false };
        },
        return: function () {
          console.log("sync close called");
          return {
            get done() {
              console.log("unexpected sync done");
              return true;
            },
            get value() {
              console.log("unexpected sync value");
              return Promise.reject(new Error("unexpected sync await"));
            },
          };
        },
      };
    },
  };
}
async function* forward(source) {
  yield* source;
}
async function probe(label, settlement) {
  const iterator = forward(delegate(label, settlement));
  console.log(label, "first", (await iterator.next()).value);
  const task = iterator.throw(new Error("sent"));
  console.log(label, "caller resumed");
  if (settlement === "never") {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    console.log(label, "remains pending");
    return;
  }
  await task.then(
    function () { console.log(label, "resolved"); },
    function (error) {
      console.log(label, "caught", error.name);
    },
  );
  console.log(label, "caller joined");
}
async function probeSync() {
  const iterator = forward(syncDelegate());
  console.log("sync first", (await iterator.next()).value);
  const task = iterator.throw(new Error("sent"));
  console.log("sync caller resumed");
  await task.then(
    function () { console.log("sync resolved"); },
    function (error) { console.log("sync caught", error.name); },
  );
  console.log("sync caller joined");
}
async function main() {
  await probe("reaction", "reaction");
  await probe("timer", "timer");
  await probe("reject", "reject");
  await probe("never", "never");
  await probeSync();
  console.log("finished");
}
main();
`,
  },
];
