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
   * its prototype object carries no own constructor. An inherited one
   * would come from %AsyncGenerator%, which this profile does not
   * materialize, so only the own property set is observed here. */
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
];
