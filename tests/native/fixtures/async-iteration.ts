import type { Fixture } from "../fixture.ts";

/*
 * Asynchronous iteration fixtures. Every fixture drives its `for await`
 * heads from inside one asynchronous entry function and reports through
 * `console.log` before that function settles, so the observation order is
 * the loop's own and does not depend on when the entry promise resolves.
 */
export const asyncIterationFixtures: readonly Fixture[] = [
  {
    name: "for-await-of-sync-fallback",
    source: `
async function main() {
  for await (const value of [1, 2, 3]) console.log("plain", value);
  for await (const value of []) console.log("never", value);
  for await (const value of [Promise.resolve("a"), "b"]) {
    console.log("settled", value);
  }
  const nested = [[1, 2], [3]];
  for await (const inner of nested) {
    for await (const value of inner) console.log("nested", value);
  }
  function* counted() {
    yield 1;
    yield Promise.resolve(2);
  }
  for await (const value of counted()) console.log("generator", value);
  const manual = {
    [Symbol.iterator]: function () {
      let index = 0;
      return {
        next: function () {
          index = index + 1;
          console.log("sync step", index);
          return { value: index, done: index > 2 };
        },
      };
    },
  };
  for await (const value of manual) console.log("manual", value);
  const both = {
    [Symbol.iterator]: function () {
      console.log("sync ignored");
      return { next: function () { return { done: true }; } };
    },
    [Symbol.asyncIterator]: function () {
      let index = 0;
      return {
        next: function () {
          index = index + 1;
          return Promise.resolve({ value: index, done: index > 1 });
        },
      };
    },
  };
  for await (const value of both) console.log("async preferred", value);
  console.log("finished");
}
main();
`,
  },
  {
    name: "for-await-of-sync-close",
    source: `
function wrapped(returned) {
  return {
    [Symbol.iterator]: function () {
      return {
        next: function () { return { value: 1, done: false }; },
        return: returned,
      };
    },
  };
}
async function main() {
  // The wrapper's own return reads done and value from the synchronous
  // result and awaits the value, so both getters run and a rejecting value
  // reaches the head, while an in-flight body error stays authoritative.
  const observing = wrapped(function () {
    return {
      get done() { console.log("return done getter"); return true; },
      get value() { console.log("return value getter"); return 0; },
    };
  });
  for await (const value of observing) {
    console.log("break", value);
    break;
  }
  try {
    for await (const value of observing) {
      console.log("throw", value);
      throw new RangeError("body");
    }
  } catch (error) {
    console.log("caught", error.name, error.message);
  }
  try {
    for await (const value of wrapped(function () {
      return { done: true, value: Promise.reject(new RangeError("close")) };
    })) {
      console.log("rejecting", value);
      break;
    }
  } catch (error) {
    console.log("close value", error.name, error.message);
  }
  for await (const value of wrapped(undefined)) {
    console.log("absent", value);
    break;
  }
  console.log("finished");
}
main();
`,
  },
  {
    name: "for-await-of-sync-step-order",
    source: `
function wrapped(next) {
  return {
    [Symbol.iterator]: function () { return { next: next }; },
  };
}
// A wrapped synchronous iterator settles the promise its next method
// returned by awaiting the stepped value, and the head awaits that promise
// on top of it. Two chained reactions queued before the loop therefore
// count the turns each step path costs. A path that reaches the wrapper's
// own await, which every fulfilling step and a rejecting stepped value do,
// spends two turns and reports after both reactions. A path that completes
// abruptly before it, which a throwing next method, a non-object result,
// and a throwing done or value getter do, rejects that same promise instead
// of throwing to the head, so it spends one turn and reports between them.
async function probe(label, next) {
  const chain = Promise.resolve(0)
    .then(function () { console.log(label, "one"); })
    .then(function () { console.log(label, "two"); });
  try {
    for await (const value of wrapped(next)) {
      console.log(label, "body", value);
      return chain;
    }
    console.log(label, "exhausted");
  } catch (error) {
    // Only the name is reported, because a runtime's own TypeError text for
    // a non-object step result is not part of the observed contract.
    console.log(label, error.name);
  }
  return chain;
}
async function main() {
  await probe("plain", function () { return { value: 1, done: false }; });
  await probe("promised", function () {
    return { value: Promise.resolve(2), done: false };
  });
  await probe("empty", function () { return { done: true }; });
  await probe("emptyvalue", function () {
    return { done: true, value: Promise.resolve(3) };
  });
  await probe("throwing", function () { throw new RangeError("step"); });
  await probe("nonobject", function () { return 4; });
  await probe("throwdone", function () {
    return { get done() { throw new RangeError("done getter"); } };
  });
  await probe("throwvalue", function () {
    return {
      done: false,
      get value() { throw new RangeError("value getter"); },
    };
  });
  await probe("rejecting", function () {
    return { value: Promise.reject(new RangeError("value")), done: false };
  });
  console.log("finished");
}
main();
`,
  },
  {
    name: "for-await-of-sync-close-order",
    source: `
function wrapped(returned) {
  return {
    [Symbol.iterator]: function () {
      return {
        next: function () { return { value: 1, done: false }; },
        return: returned,
      };
    },
  };
}
// The wrapper always carries its own return method, and the close awaits
// the promise that method produces on top of the wrapper's own await of
// the stepped value. Two chained reactions queued in the body therefore
// both run before the statement after the loop, on every close path.
async function probe(label, returned) {
  try {
    for await (const value of wrapped(returned)) {
      Promise.resolve(0)
        .then(function () { console.log(label, "one"); })
        .then(function () { console.log(label, "two"); });
      break;
    }
  } catch (error) {
    console.log(label, error.name);
  }
  console.log(label, "after loop");
}
async function main() {
  await probe("absent", undefined);
  await probe("normal", function () { return { done: true, value: 0 }; });
  await probe("nonobject", function () { return 5; });
  await probe("noncallable", 7);
  await probe("throwdone", function () {
    return { get done() { throw new RangeError("done getter"); } };
  });
  await probe("throwvalue", function () {
    return {
      done: true,
      get value() { throw new RangeError("value getter"); },
    };
  });
  await probe("throwing", function () { throw new RangeError("threw"); });
  console.log("finished");
}
main();
`,
  },
  {
    name: "for-await-of-async-iterator",
    source: `
function counting(limit, wrap) {
  return {
    [Symbol.asyncIterator]: function () {
      let index = 0;
      return {
        next: function () {
          index = index + 1;
          const result = { value: index * 10, done: index > limit };
          return wrap ? Promise.resolve(result) : result;
        },
      };
    },
  };
}
async function main() {
  for await (const value of counting(2, true)) console.log("promised", value);
  for await (const value of counting(2, false)) console.log("plain", value);
  const accessors = {
    [Symbol.asyncIterator]: function () {
      let index = 0;
      return {
        next: function () {
          index = index + 1;
          const step = index;
          return Promise.resolve({
            get done() {
              console.log("read done", step);
              return step > 2 ? "truthy" : 0;
            },
            get value() {
              console.log("read value", step);
              return step;
            },
          });
        },
      };
    },
  };
  for await (const value of accessors) console.log("accessor", value);
  const delayed = {
    [Symbol.asyncIterator]: function () {
      let index = 0;
      return {
        next: function () {
          return new Promise(function (resolve) {
            setTimeout(function () {
              index = index + 1;
              resolve({ value: index, done: index > 2 });
            }, 1);
          });
        },
      };
    },
  };
  for await (const value of delayed) console.log("delayed", value);
  console.log("finished");
}
main();
`,
  },
  {
    name: "for-await-of-transfers",
    source: `
function source(label, returned) {
  return {
    [Symbol.asyncIterator]: function () {
      let index = 0;
      return {
        next: function () {
          index = index + 1;
          return Promise.resolve({ value: index, done: index > 4 });
        },
        return: returned == null ? undefined : function () {
          console.log("close", label);
          return returned();
        },
      };
    },
  };
}
async function collect(label, returned) {
  let total = 0;
  for await (const value of source(label, returned)) {
    if (value === 2) continue;
    if (value === 3) break;
    total = total + value;
  }
  return total;
}
async function early(label) {
  for await (const value of source(label, function () {
    return Promise.resolve({ done: true });
  })) {
    return "returned:" + value;
  }
  return "exhausted";
}
async function main() {
  const broke = await collect("breaking", function () {
    return Promise.resolve({ done: true });
  });
  console.log("continue and break", broke);
  const absent = await collect("absent", undefined);
  console.log("no return method", absent);
  const returned = await early("returning");
  console.log("early return", returned);
  try {
    for await (const value of source("throwing body", function () {
      console.log("close after throw");
      return Promise.resolve({ done: true });
    })) {
      throw new RangeError("body " + value);
    }
  } catch (error) {
    console.log("caught", error.name, error.message);
  }
  try {
    for await (const value of source("rejecting close", function () {
      return Promise.reject(new TypeError("close"));
    })) {
      console.log("before break", value);
      break;
    }
  } catch (error) {
    console.log("close error", error.name, error.message);
  }
  // A close that rejects while an error is in flight keeps the original
  // completion, so the body error is what the catch clause observes.
  try {
    for await (const value of source("overridden", function () {
      return Promise.reject(new TypeError("ignored"));
    })) {
      throw new RangeError("kept " + value);
    }
  } catch (error) {
    console.log("kept", error.name, error.message);
  }
  outer: for await (const first of [1, 2]) {
    for await (const second of [10, 20]) {
      console.log("pair", first, second);
      if (second === 20) continue outer;
    }
  }
  labeled: for await (const value of source("labeled", function () {
    console.log("labeled close");
    return Promise.resolve({ done: true });
  })) {
    if (value === 2) break labeled;
    console.log("labeled", value);
  }
  let cleanups = 0;
  try {
    for await (const value of [1, 2, 3]) {
      try {
        if (value === 2) break;
      } finally {
        cleanups = cleanups + 1;
      }
    }
  } finally {
    console.log("cleanups", cleanups);
  }
  console.log("finished");
}
main();
`,
  },
  {
    name: "for-await-of-heads",
    source: `
function stream(values) {
  return {
    [Symbol.asyncIterator]: function () {
      let index = 0;
      return {
        next: function () {
          const done = index >= values.length;
          const value = done ? undefined : values[index];
          index = index + 1;
          return Promise.resolve({ value: value, done: done });
        },
      };
    },
  };
}
async function main() {
  const readers = [];
  for await (const captured of stream([1, 2, 3])) {
    readers[readers.length] = function () { return captured; };
  }
  console.log("captured", readers[0](), readers[1](), readers[2]());
  for await (let mutated of stream([4])) {
    mutated = mutated + 1;
    console.log("mutated", mutated);
  }
  for await (var hoisted of stream([5])) console.log("hoisted", hoisted);
  console.log("after loop", hoisted);
  let assigned = 0;
  for await (assigned of stream([6, 7])) console.log("assigned", assigned);
  const holder = { item: 0, nested: {} };
  const key = "item";
  for await (holder[key] of stream([8])) console.log("computed", holder.item);
  for await (holder.nested.deep of stream([9])) {
    console.log("member", holder.nested.deep);
  }
  for await (const [first, ...rest] of stream([[1, 2, 3]])) {
    console.log("array pattern", first, rest.length, rest[1]);
  }
  for await (const { value = 11, ...others } of stream([{ extra: 12 }])) {
    console.log("object pattern", value, Object.keys(others).length);
  }
  for await ([assigned, holder.item] of stream([[13, 14]])) {
    console.log("assignment pattern", assigned, holder.item);
  }
  // The head's lexical binding exists before the iterable evaluates, so a
  // same-name read inside that expression observes the dead zone.
  let observed = "none";
  try {
    for await (const shadowed of stream([shadowed])) console.log(shadowed);
  } catch (error) {
    observed = error.name;
  }
  console.log("dead zone", observed);
  console.log("finished");
}
main();
`,
  },
  {
    name: "for-await-of-errors",
    source: `
async function main() {
  // Each case runs its own head inside a try clause so the thrown value's
  // identity stays observable without an await in a rejected position. A
  // runtime-authored TypeError reports only its name, because Oseo owns
  // its own message text.
  try {
    for await (const value of 5) console.log(value);
  } catch (error) {
    console.log("not iterable", error.name);
  }
  try {
    for await (const value of null) console.log(value);
  } catch (error) {
    console.log("null", error.name);
  }
  try {
    for await (const value of { [Symbol.asyncIterator]: 7 }) console.log(value);
  } catch (error) {
    console.log("method not callable", error.name);
  }
  try {
    for await (const value of {
      [Symbol.asyncIterator]: function () { return 8; },
    }) {
      console.log(value);
    }
  } catch (error) {
    console.log("iterator not object", error.name);
  }
  try {
    for await (const value of {
      [Symbol.asyncIterator]: function () {
        return { next: function () { return Promise.resolve(9); } };
      },
    }) {
      console.log(value);
    }
  } catch (error) {
    console.log("result not object", error.name);
  }
  try {
    for await (const value of {
      [Symbol.iterator]: function () {
        return { next: function () { return 10; } };
      },
    }) {
      console.log(value);
    }
  } catch (error) {
    console.log("sync result not object", error.name);
  }
  try {
    for await (const value of {
      [Symbol.asyncIterator]: function () {
        return {
          next: function () { return Promise.reject(new RangeError("step")); },
        };
      },
    }) {
      console.log(value);
    }
  } catch (error) {
    console.log("rejected step", error.name, error.message);
  }
  try {
    for await (const value of [Promise.reject(new RangeError("value"))]) {
      console.log(value);
    }
  } catch (error) {
    console.log("rejected value", error.name, error.message);
  }
  try {
    for await (const value of {
      [Symbol.asyncIterator]: function () {
        return {
          next: function () {
            return Promise.resolve({
              get done() { throw new RangeError("done"); },
            });
          },
        };
      },
    }) {
      console.log(value);
    }
  } catch (error) {
    console.log("throwing done", error.name, error.message);
  }
  try {
    for await (const value of {
      [Symbol.asyncIterator]: function () {
        return {
          next: function () {
            return Promise.resolve({
              done: false,
              get value() { throw new RangeError("value getter"); },
            });
          },
        };
      },
    }) {
      console.log(value);
    }
  } catch (error) {
    console.log("throwing value", error.name, error.message);
  }
  try {
    for await (const value of {
      [Symbol.asyncIterator]: function () {
        return {
          next: function () {
            return Promise.resolve({ value: 1, done: false });
          },
          return: 11,
        };
      },
    }) {
      console.log("stepped", value);
      break;
    }
  } catch (error) {
    console.log("return not callable", error.name);
  }
  try {
    for await (const value of {
      [Symbol.asyncIterator]: function () {
        return {
          next: function () {
            return Promise.resolve({ value: 1, done: false });
          },
          return: function () { return Promise.resolve(12); },
        };
      },
    }) {
      console.log("stepped", value);
      break;
    }
  } catch (error) {
    console.log("return result not object", error.name);
  }
  console.log("finished");
}
main();
`,
  },
  {
    name: "for-await-of-frame-suspension",
    source: `
function delayedIterator() {
  let index = 0;
  return {
    [Symbol.asyncIterator]: function () {
      return {
        next: function () {
          index += 1;
          if (index > 1) return { done: true };
          return new Promise(function (resolve) {
            setTimeout(function () {
              console.log("step timer");
              resolve({ value: 3, done: false });
            }, 1);
          });
        },
      };
    },
  };
}
function pendingIterator() {
  return {
    [Symbol.asyncIterator]: function () {
      return {
        next: function () {
          return new Promise(function () {});
        },
      };
    },
  };
}
/**
 * @param {number} left
 * @param {number} right
 */
function hintedAdd(left, right) {
  return left + right;
}
async function consume(iterable, hinted) {
  const guarded = hintedAdd(hinted, 1);
  console.log("body start", guarded);
  for await (const value of iterable) {
    console.log("body value", value, guarded);
  }
  console.log("body done");
}
async function main() {
  const task = consume(delayedIterator(), {
    valueOf: function () {
      console.log("guard miss fallback");
      return 4;
    },
  });
  console.log("caller resumed");
  await task;
  console.log("caller joined");
  consume(pendingIterator(), 1);
  console.log("never-settled remains pending");
}
main();
`,
    specialization: {
      genericCallsDisabled: 4,
      genericCallsEnabled: 3,
      hits: 1,
      misses: 5,
      overflowMisses: 0,
    },
  },
  {
    name: "for-await-of-close-suspension",
    source: `
function closingIterator(label, settlement) {
  return {
    [Symbol.asyncIterator]: function () {
      return {
        next: function () {
          return Promise.resolve({ value: 3, done: false });
        },
        return: function () {
          console.log(label, "close called");
          return new Promise(function (resolve, reject) {
            if (settlement === "never") return;
            const settle = function () {
              console.log(label, "close settled");
              if (settlement === "reject") {
                reject(new TypeError("close"));
              } else if (settlement === "nonobject") {
                resolve(7);
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
async function consume(label, settlement, completion) {
  try {
    for await (const value of closingIterator(label, settlement)) {
      console.log(label, "body", value);
      if (completion === "throw") throw new RangeError("body");
      break;
    }
    console.log(label, "completed");
  } catch (error) {
    console.log(label, "caught", error.name);
  }
}
async function probe(label, settlement, completion) {
  const task = consume(label, settlement, completion);
  console.log(label, "caller resumed");
  if (settlement === "never") {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    console.log(label, "remains pending");
    return;
  }
  await task;
  console.log(label, "caller joined");
}
async function main() {
  await probe("reaction", "reaction", "break");
  await probe("timer", "timer", "break");
  await probe("close-error", "reject", "break");
  await probe("nonobject", "nonobject", "break");
  await probe("body-error", "reject", "throw");
  await probe("never", "never", "break");
  console.log("finished");
}
main();
`,
  },
  {
    name: "async-from-sync-rejection-close",
    source: `
function rejectingIterable(label, done, returned) {
  let closes = 0;
  return {
    closes: function () { return closes; },
    [Symbol.iterator]: function () {
      return {
        next: function () {
          return {
            value: Promise.reject(new RangeError(label + " step")),
            done: done,
          };
        },
        return: function () {
          closes += 1;
          console.log(label, "close called");
          if (returned === "throw") throw new TypeError("close");
          if (returned === "nonobject") return 3;
          return { value: undefined, done: true };
        },
      };
    },
  };
}
async function probe(label, done, returned) {
  const iterable = rejectingIterable(label, done, returned);
  try {
    for await (const value of iterable) console.log(label, value);
  } catch (error) {
    console.log(label, "caught", error.name, error.message);
  }
  console.log(label, "closes", iterable.closes());
}
async function main() {
  await probe("normal", false, "normal");
  await probe("throwing", false, "throw");
  await probe("nonobject", false, "nonobject");
  await probe("done", true, "normal");
  console.log("finished");
}
main();
`,
  },
];
