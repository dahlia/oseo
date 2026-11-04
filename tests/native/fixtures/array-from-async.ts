import type { Es2026Fixture } from "../es2026-fixture.ts";

/** A fixed native fixture of the array-from-async unit. */
export interface ArrayFromAsyncFixture extends Es2026Fixture {
  /**
   * The output the edition's steps produce, for behavior where Node.js and
   * Deno both depart from the edition. Such a fixture has no reference
   * run.
   */
  readonly expected?: string;
}

/*
 * Array.fromAsync runs its closure up to the first Await when called and
 * settles the returned promise from promise jobs. The sources log every
 * observable read and call next to a chain of ticks, so they compare the
 * order of steps and the number of turns each Await takes, not only the
 * settled arrays.
 */
export const arrayFromAsyncFixtures: readonly ArrayFromAsyncFixture[] = [
  /* The descriptor, inputs of every type, the mapper, and thisArg. */
  {
    name: "array-from-async-surface",
    source: `
const descriptor = Object.getOwnPropertyDescriptor(Array, "fromAsync");
console.log(
  "descriptor",
  typeof descriptor.value,
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
  Array.fromAsync.name,
  Array.fromAsync.length,
  Object.hasOwn(Array.fromAsync, "prototype"),
  Object.getPrototypeOf(Array.fromAsync) === Function.prototype,
);
try {
  new Array.fromAsync([]);
} catch (error) {
  console.log("construct", error.constructor.name);
}
const results = [];
function show(value) {
  if (!Array.isArray(value)) return typeof value;
  return (
    "[" +
    value
      .map((item) =>
        typeof item === "object" && item !== null
          ? item instanceof Promise
            ? "promise"
            : "object"
          : String(item),
      )
      .join(",") +
    "]"
  );
}
function report(label, promise) {
  console.log(
    "returns",
    label,
    promise instanceof Promise,
    Object.getPrototypeOf(promise) === Promise.prototype,
  );
  return promise.then(
    (value) => {
      results.push(label + " ok " + show(value));
    },
    (error) => {
      results.push(label + " error " + error.constructor.name);
    },
  );
}
function sloppyThis() {
  return typeof this;
}
function strictThis() {
  "use strict";
  return this === undefined ? "undefined" : typeof this;
}
const pending = [
  report("null", Array.fromAsync(null)),
  report("undefined", Array.fromAsync()),
  report("number", Array.fromAsync(5)),
  report("string", Array.fromAsync("a\\u{1F600}b")),
  report("boolean", Array.fromAsync(true)),
  report("bigint", Array.fromAsync(5n)),
  report("symbol", Array.fromAsync(Symbol("s"))),
  report(
    "function",
    Array.fromAsync(function (a, b) {}),
  ),
  report("mapfn-number", Array.fromAsync([1], 5)),
  report("mapfn-object", Array.fromAsync([1], {})),
  report("mapfn-null", Array.fromAsync([1], null)),
  report("mapfn-undefined", Array.fromAsync([1], undefined)),
  report(
    "async-not-callable",
    Array.fromAsync({ [Symbol.asyncIterator]: 1 }),
  ),
  report(
    "async-null",
    Array.fromAsync({ [Symbol.asyncIterator]: null, length: 1, 0: "n" }),
  ),
  report("sync-not-callable", Array.fromAsync({ [Symbol.iterator]: {} })),
  report(
    "sync-null",
    Array.fromAsync({ [Symbol.iterator]: null, length: 1, 0: "s" }),
  ),
  report(
    "non-object-iterator",
    Array.fromAsync({
      [Symbol.iterator]() {
        return 1;
      },
    }),
  ),
  report(
    "non-object-async-iterator",
    Array.fromAsync({
      [Symbol.asyncIterator]() {
        return 1;
      },
    }),
  ),
  report(
    "next-not-callable",
    Array.fromAsync({
      [Symbol.asyncIterator]() {
        return { next: 1 };
      },
    }),
  ),
  report(
    "array",
    Array.fromAsync([
      1,
      Promise.resolve(2),
      {
        then(resolve) {
          resolve(3);
        },
      },
    ]),
  ),
  report("holes", Array.fromAsync([1, , 3])),
  report(
    "array-like",
    Array.fromAsync({ length: 3, 0: "a", 2: Promise.resolve("c") }),
  ),
  report("length-negative", Array.fromAsync({ length: -1, 0: 1 })),
  report("length-fraction", Array.fromAsync({ length: 1.9, 0: "x", 1: "y" })),
  report("length-string", Array.fromAsync({ length: "2", 0: "x", 1: "y" })),
  report("too-long", Array.fromAsync({ length: 2 ** 32 })),
  report("typed", Array.fromAsync(new Uint8Array([7, 8]))),
  report("buffer", Array.fromAsync(new ArrayBuffer(2))),
  report("set", Array.fromAsync(new Set([1, 2]))),
  report("map", Array.fromAsync(new Map([[1, 2]]))),
  report(
    "async-values-kept",
    Array.fromAsync({
      [Symbol.asyncIterator]() {
        let index = 0;
        return {
          next() {
            index = index + 1;
            return Promise.resolve({
              done: index > 1,
              value: Promise.resolve(9),
            });
          },
        };
      },
    }),
  ),
  report(
    "mapped-index",
    Array.fromAsync([5, 6], (value, index) => value * 10 + index),
  ),
  report(
    "mapped-async",
    Array.fromAsync([5, 6], async (value) => value + 1),
  ),
  report(
    "mapped-arguments",
    Array.fromAsync([5], function () {
      return arguments.length;
    }),
  ),
  report("this-sloppy-omitted", Array.fromAsync([1], sloppyThis)),
  report("this-sloppy-primitive", Array.fromAsync([1], sloppyThis, 4)),
  report("this-strict-omitted", Array.fromAsync([1], strictThis)),
  report("this-strict-primitive", Array.fromAsync([1], strictThis, 4)),
  report(
    "this-object",
    Array.fromAsync(
      [1],
      function () {
        return this.tag;
      },
      { tag: "tagged" },
    ),
  ),
];
Promise.all(pending).then(() => console.log(results.join("\\n")));

let turn = 0;
while (turn < 2) {
  console.log("guard", typeof Array.fromAsync, Array.fromAsync.length);
  if (turn === 0) Array.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) {
  return left + right;
}
console.log("hint", hinted(1, 2), hinted("1", 2));
`,
  },
  /* Step order and Await turns for the three input kinds and receivers. */
  {
    name: "array-from-async-order",
    source: `
const log = [];
let tick = 0;
function ticker(turns) {
  let promise = Promise.resolve();
  for (let turn = 0; turn < turns; turn = turn + 1) {
    promise = promise.then(() => {
      tick = tick + 1;
      log.push("t" + tick);
    });
  }
  return promise;
}
function thenable(value, tag) {
  return {
    get then() {
      log.push("get-then:" + tag);
      return (resolve) => {
        log.push("then:" + tag);
        resolve(value);
      };
    },
  };
}
function stepResult(tag, done, value) {
  return {
    get done() {
      log.push(tag + ":done");
      return done;
    },
    get value() {
      log.push(tag + ":value");
      return value;
    },
  };
}
function asyncSource(tag, values) {
  return {
    get [Symbol.asyncIterator]() {
      log.push(tag + ":get-async");
      return function () {
        log.push(tag + ":open");
        let index = 0;
        return {
          get next() {
            log.push(tag + ":get-next");
            return function (...args) {
              log.push(tag + ":next" + index + "/" + args.length);
              const done = index >= values.length;
              const value = values[index];
              index = index + 1;
              return Promise.resolve(stepResult(tag, done, value));
            };
          },
        };
      };
    },
    get [Symbol.iterator]() {
      log.push(tag + ":get-sync");
      return undefined;
    },
  };
}
// A synchronous source whose \`next\` is a data property: V8 reads it once
// through GetIteratorFromMethod and again for the wrapper.
function syncSource(tag, values) {
  return {
    get [Symbol.asyncIterator]() {
      log.push(tag + ":get-async");
      return undefined;
    },
    get [Symbol.iterator]() {
      log.push(tag + ":get-sync");
      return function () {
        log.push(tag + ":open");
        let index = 0;
        return {
          next(...args) {
            log.push(tag + ":next" + index + "/" + args.length);
            const done = index >= values.length;
            const value = values[index];
            index = index + 1;
            return stepResult(tag, done, value);
          },
        };
      };
    },
  };
}
function arrayLike(tag, values) {
  const object = {
    get [Symbol.asyncIterator]() {
      log.push(tag + ":get-async");
      return undefined;
    },
    get [Symbol.iterator]() {
      log.push(tag + ":get-sync");
      return undefined;
    },
    get length() {
      log.push(tag + ":length");
      return {
        valueOf() {
          log.push(tag + ":valueOf");
          return values.length;
        },
      };
    },
  };
  for (let index = 0; index < values.length; index = index + 1) {
    Object.defineProperty(object, index, {
      get() {
        log.push(tag + ":get" + index);
        return values[index];
      },
    });
  }
  return object;
}
function describe(value) {
  if (Array.isArray(value))
    return "array[" + value.map(String).join(",") + "]";
  if (value instanceof Receiver) {
    return (
      "receiver(" +
      value.args.join(",") +
      ")[" +
      Array.from(value).map(String).join(",") +
      "]"
    );
  }
  return typeof value;
}
function Receiver(...args) {
  log.push("construct/" + args.length);
  this.args = args;
}
async function run(name, start) {
  log.length = 0;
  tick = 0;
  const turns = ticker(14);
  log.push("call");
  const promise = start();
  log.push("returned");
  try {
    log.push("ok " + describe(await promise));
  } catch (error) {
    log.push(
      "error " + error.constructor.name + " " + String(error.message).length,
    );
  }
  await turns;
  console.log(name, log.join(" "));
}
function mapper(tag) {
  return function (value, index) {
    log.push(
      tag +
        ":map" +
        value +
        "@" +
        index +
        "/" +
        arguments.length +
        "/" +
        (this === undefined ? "undefined" : this.label),
    );
    return index === 0 ? thenable(value * 10, tag + "m") : value * 10;
  };
}
async function main() {
  await run("async", () =>
    Array.fromAsync(
      asyncSource("a", [1, Promise.resolve(2), thenable(3, "a3")]),
    ),
  );
  await run("sync", () =>
    Array.fromAsync(
      syncSource("s", [1, Promise.resolve(2), thenable(3, "s3")]),
    ),
  );
  await run("like", () =>
    Array.fromAsync(
      arrayLike("l", [1, Promise.resolve(2), thenable(3, "l3")]),
    ),
  );
  await run("async-mapped", () =>
    Array.fromAsync(asyncSource("am", [1, 2]), mapper("am"), {
      label: "this",
    }),
  );
  await run("sync-mapped", () =>
    Array.fromAsync(syncSource("sm", [1, thenable(2, "sm2")]), mapper("sm")),
  );
  await run("like-mapped", () =>
    Array.fromAsync(arrayLike("lm", [1, 2]), async function (value, index) {
      log.push("lm:map" + value + "@" + index);
      return value + index;
    }),
  );
  await run("async-receiver", () =>
    Array.fromAsync.call(Receiver, asyncSource("ar", [4])),
  );
  await run("sync-receiver", () =>
    Array.fromAsync.call(Receiver, syncSource("sr", [5])),
  );
  await run("like-receiver", () =>
    Array.fromAsync.call(Receiver, arrayLike("lr", [6, 7])),
  );
  await run("async-mapped-async", () =>
    Array.fromAsync(asyncSource("aa", [1, 2]), async (value) => {
      log.push("aa:map" + value);
      await null;
      log.push("aa:mapped" + value);
      return value;
    }),
  );
  await run("empty-like", () => Array.fromAsync(arrayLike("e", [])));
  await run("empty-async", () => Array.fromAsync(asyncSource("ea", [])));
  await run("resolved-thenable", () =>
    Array.fromAsync.call(
      function () {
        return {
          get then() {
            log.push("A:get-then");
            return undefined;
          },
        };
      },
      arrayLike("rt", []),
    ),
  );
}
main();

let turn = 0;
while (turn < 2) {
  console.log("guard", typeof Array.fromAsync, Array.fromAsync.length);
  if (turn === 0) Array.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) {
  return left + right;
}
console.log("hint", hinted(1, 2), hinted("1", 2));
`,
  },
  /* Which failures close the iterator, and the Await on its return. */
  {
    name: "array-from-async-close",
    source: `
const log = [];
let tick = 0;
function ticker(turns) {
  let promise = Promise.resolve();
  for (let turn = 0; turn < turns; turn = turn + 1) {
    promise = promise.then(() => {
      tick = tick + 1;
      log.push("t" + tick);
    });
  }
  return promise;
}
class Marker extends Error {}
// An async iterator whose \`return\` behavior is chosen per case.
function asyncSource(tag, values, closing) {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      const iterator = {
        next() {
          log.push(tag + ":next" + index);
          const done = index >= values.length;
          const value = values[index];
          index = index + 1;
          if (value === "throw-next") throw new Marker("next");
          if (value === "reject-next")
            return Promise.reject(new Marker("next"));
          if (value === "non-object") return Promise.resolve(7);
          if (value === "throw-done") {
            return Promise.resolve({
              get done() {
                throw new Marker("done");
              },
            });
          }
          if (value === "throw-value") {
            return Promise.resolve({
              done: false,
              get value() {
                throw new Marker("value");
              },
            });
          }
          return Promise.resolve({ done, value });
        },
      };
      if (closing === "absent") return iterator;
      Object.defineProperty(iterator, "return", {
        get() {
          log.push(tag + ":get-return");
          if (closing === "getter-throws") throw new RangeError("getter");
          if (closing === "not-callable") return 5;
          if (closing === "null") return null;
          return function (...args) {
            log.push(tag + ":return/" + args.length);
            if (closing === "throws") throw new RangeError("return");
            if (closing === "non-object") return 1;
            if (closing === "rejects")
              return Promise.reject(new RangeError("return"));
            if (closing === "thenable") {
              return {
                then(resolve) {
                  log.push(tag + ":return-then");
                  resolve({});
                },
              };
            }
            return {};
          };
        },
      });
      return iterator;
    },
  };
}
function* generator(tag, values) {
  try {
    for (const value of values) {
      log.push(tag + ":yield");
      yield value;
    }
  } finally {
    log.push(tag + ":finally");
  }
}
async function run(name, start) {
  log.length = 0;
  tick = 0;
  const turns = ticker(12);
  try {
    const value = await start();
    log.push("ok [" + Array.from(value).map(String).join(",") + "]");
  } catch (error) {
    log.push(
      "error " +
        error.constructor.name +
        (error instanceof Marker ? ":" + error.message : ""),
    );
  }
  await turns;
  console.log(name, log.join(" "));
}
const throwingMapper = (value) => {
  log.push("map" + value);
  if (value === 2) throw new Marker("map");
  return value;
};
const rejectingMapper = (value) => {
  log.push("map" + value);
  return value === 2 ? Promise.reject(new Marker("map")) : value;
};
function frozen() {
  return Object.freeze({});
}
function readonlyLength() {
  return Object.defineProperty({}, "length", { value: 0, writable: false });
}
function setterReceiver() {
  return Object.defineProperty({}, "0", {
    set(value) {
      log.push("setter" + value);
    },
    configurable: true,
  });
}
async function main() {
  for (const closing of [
    "plain",
    "absent",
    "null",
    "non-object",
    "thenable",
  ]) {
    await run("map-throw/" + closing, () =>
      Array.fromAsync(asyncSource("a", [1, 2, 3], closing), throwingMapper),
    );
  }
  await run("map-reject", () =>
    Array.fromAsync(asyncSource("a", [1, 2, 3], "plain"), rejectingMapper),
  );
  await run("define-fails", () =>
    Array.fromAsync.call(frozen, asyncSource("a", [1], "plain")),
  );
  await run("define-fails-sync", () =>
    Array.fromAsync.call(frozen, generator("g", [1, 2])),
  );
  await run("define-fails-like", () =>
    Array.fromAsync.call(frozen, { length: 1, 0: 1 }),
  );
  await run("setter-receiver", () =>
    Array.fromAsync.call(setterReceiver, asyncSource("a", [1], "plain")),
  );
  await run("readonly-length-like", () =>
    Array.fromAsync.call(readonlyLength, { length: 0 }),
  );
  await run("sync-map-throw", () =>
    Array.fromAsync(generator("g", [1, 2, 3]), throwingMapper),
  );
  await run("sync-map-reject", () =>
    Array.fromAsync(generator("g", [1, 2, 3]), rejectingMapper),
  );
  await run("like-reject", () =>
    Array.fromAsync({
      length: 2,
      0: Promise.reject(new Marker("element")),
      1: 2,
    }),
  );
  await run("like-map-throw", () =>
    Array.fromAsync({ length: 3, 0: 1, 1: 2, 2: 3 }, throwingMapper),
  );
  await run("like-map-reject", () =>
    Array.fromAsync({ length: 3, 0: 1, 1: 2, 2: 3 }, rejectingMapper),
  );
  await run("like-get-throws", () =>
    Array.fromAsync({
      length: 2,
      get 0() {
        throw new Marker("get");
      },
    }),
  );
  await run("length-throws", () =>
    Array.fromAsync({
      get length() {
        throw new Marker("length");
      },
    }),
  );
  await run("construct-throws", () =>
    Array.fromAsync.call(
      function () {
        throw new Marker("construct");
      },
      asyncSource("a", [1], "plain"),
    ),
  );
  await run("open-throws", () =>
    Array.fromAsync({
      [Symbol.asyncIterator]() {
        throw new Marker("open");
      },
    }),
  );
  await run("get-async-throws", () =>
    Array.fromAsync({
      get [Symbol.asyncIterator]() {
        throw new Marker("get");
      },
    }),
  );
  await run("get-sync-throws", () =>
    Array.fromAsync({
      get [Symbol.iterator]() {
        throw new Marker("get");
      },
    }),
  );
  await run("promise-constructor-throws", () => {
    const element = Promise.resolve(1);
    Object.defineProperty(element, "constructor", {
      get() {
        throw new Marker("constructor");
      },
    });
    return Array.fromAsync({ length: 1, 0: element });
  });
  await run("mapped-constructor-throws", () => {
    const mapped = Promise.resolve(1);
    Object.defineProperty(mapped, "constructor", {
      get() {
        throw new Marker("constructor");
      },
    });
    return Array.fromAsync(asyncSource("a", [1, 2], "plain"), () => mapped);
  });
}
main();

let turn = 0;
while (turn < 2) {
  console.log("guard", typeof Array.fromAsync, Array.fromAsync.length);
  if (turn === 0) Array.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) {
  return left + right;
}
console.log("hint", hinted(1, 2), hinted("1", 2));
`,
  },
  /* Long inputs under collection, receivers, and a replaced property. */
  {
    name: "array-from-async-stress",
    source: `
const pressure = [];
async function* counted(count) {
  for (let index = 0; index < count; index = index + 1) {
    pressure.push({ index });
    yield { index };
  }
}
const done = [];
function finish(label, promise) {
  return promise.then(
    (value) => {
      done.push(label + " " + describe(value));
    },
    (error) => {
      done.push(label + " error " + error.constructor.name);
    },
  );
}
function describe(value) {
  const kind = Array.isArray(value) ? "array" : value.constructor.name;
  return (
    kind +
    ":" +
    value.length +
    ":" +
    Array.from(value).slice(0, 3).map(String).join(",") +
    ":" +
    (value.length > 0 ? String(value[value.length - 1]) : "-")
  );
}
const indexed = new Proxy(
  { length: 250 },
  {
    get(target, key) {
      if (key === "length") return target.length;
      if (typeof key === "string") {
        pressure.push([key]);
        return Number(key) % 3 === 0
          ? Promise.resolve(Number(key))
          : Number(key);
      }
      return undefined;
    },
  },
);
class Tracked extends Array {}
function Plain(length) {
  this.created = arguments.length + ":" + length;
}
const BoundPlain = Plain.bind(null);
const ProxyPlain = new Proxy(Plain, {});
const pending = [
  finish(
    "async-gen",
    Array.fromAsync(counted(300), (item) => item.index * 2),
  ),
  finish(
    "proxy-like",
    Array.fromAsync(indexed, async (value) => value + 1),
  ),
  finish(
    "nested",
    Array.fromAsync([
      Array.fromAsync([1, 2]),
      Array.fromAsync({ length: 1, 0: 3 }),
    ]),
  ),
  finish("subclass", Tracked.fromAsync([1, 2, 3])),
  finish("subclass-like", Tracked.fromAsync({ length: 2, 0: "a", 1: "b" })),
  finish("bound", Array.fromAsync.call(BoundPlain, { length: 1, 0: "x" })),
  finish("proxy-receiver", Array.fromAsync.call(ProxyPlain, [4])),
  finish(
    "arrow-receiver",
    Array.fromAsync.call(() => {}, [5]),
  ),
  finish("object-receiver", Array.fromAsync.call({}, { length: 2, 0: 6 })),
  finish("undefined-receiver", Array.fromAsync.call(undefined, [7])),
];
for (let index = 0; index < 20; index = index + 1) {
  pending.push(
    finish(
      "concurrent" + index,
      Array.fromAsync(
        [index, Promise.resolve(index * 2)],
        (value) => value + index,
      ),
    ),
  );
}
Promise.all(pending).then(() => {
  console.log(done.join("\\n"));
  console.log("pressure", pressure.length > 0);
});
const original = Array.fromAsync;
Array.fromAsync = () => "replaced";
console.log("replaced", Array.fromAsync([1]));
delete Array.fromAsync;
console.log("deleted", typeof Array.fromAsync, "fromAsync" in Array);
original([8]).then((value) => console.log("original", value.join(",")));
Array.fromAsync = original;
let turn = 0;
while (turn < 2) {
  console.log("guard", typeof Array.fromAsync, Array.fromAsync.length);
  if (turn === 0) Array.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) {
  return left + right;
}
console.log("hint", hinted(1, 2), hinted("1", 2));
`,
  },
  /*
   * Behavior where both V8 hosts depart from the edition. V8 reads a
   * synchronous iterator's `next` twice, closes it a second time when an
   * element rejects, closes an async iterator after a failure of the
   * iterator itself or of the final length Set, and leaves the promise
   * pending when AsyncIteratorClose's `return` lookup or call throws or
   * its result rejects. The expected output follows the edition.
   */
  {
    expected:
      "guard function 1\nguard function 1\nhint 3 12\n" +
      "sync-next-read-once get-next next0 t1 t2 next1 t3 t4 next2 t5 t6 " +
      "t7 ok [1,2] t8\nsync-reject-closes-once get-next next0 t1 t2 " +
      "next1 t3 get-return return t4 t5 error Marker:element t6 t7 t8\n" +
      "step/throws next1 t1 next2 t2 error Marker:next t3 t4 t5 t6 t7 " +
      "t8\nstep/rejects next1 t1 next2 t2 t3 error Marker:next t4 t5 t6 " +
      "t7 t8\nstep/non-object next1 t1 next2 t2 t3 error TypeError t4 t5 " +
      "t6 t7 t8\nstep/done-throws next1 t1 next2 t2 t3 error Marker:done " +
      "t4 t5 t6 t7 t8\nstep/value-throws next1 t1 next2 t2 t3 error " +
      "Marker:value t4 t5 t6 t7 t8\nlength-after-done next1 t1 next2 t2 " +
      "t3 error TypeError t4 t5 t6 t7 t8\nlength-after-done-sync t1 t2 " +
      "t3 error TypeError t4 t5 t6 t7 t8\nclose/getter-throws t1 map " +
      "get-return t2 error Marker:map t3 t4 t5 t6 t7 t8\n" +
      "close/not-callable t1 map get-return t2 error Marker:map t3 t4 t5 " +
      "t6 t7 t8\nclose/throws t1 map get-return return t2 error " +
      "Marker:map t3 t4 t5 t6 t7 t8\nclose/rejects t1 map get-return " +
      "return t2 t3 error Marker:map t4 t5 t6 t7 t8\n",
    name: "array-from-async-edition",
    source: `
const log = [];
let tick = 0;
function ticker(turns) {
  let promise = Promise.resolve();
  for (let turn = 0; turn < turns; turn = turn + 1) {
    promise = promise.then(() => {
      tick = tick + 1;
      log.push("t" + tick);
    });
  }
  return promise;
}
class Marker extends Error {}
async function run(name, start) {
  log.length = 0;
  tick = 0;
  const turns = ticker(8);
  try {
    const value = await start();
    log.push("ok [" + Array.from(value).map(String).join(",") + "]");
  } catch (error) {
    log.push(
      "error " +
        error.constructor.name +
        (error instanceof Marker ? ":" + error.message : ""),
    );
  }
  await turns;
  console.log(name, log.join(" "));
}
function syncSource(values) {
  return {
    [Symbol.iterator]() {
      let index = 0;
      return {
        get next() {
          log.push("get-next");
          return function () {
            log.push("next" + index);
            const done = index >= values.length;
            const value = values[index];
            index = index + 1;
            return { done, value };
          };
        },
        get return() {
          log.push("get-return");
          return function () {
            log.push("return");
            return {};
          };
        },
      };
    },
  };
}
function closing(kind) {
  return {
    [Symbol.asyncIterator]() {
      return {
        next() {
          return Promise.resolve({ done: false, value: 1 });
        },
        get return() {
          log.push("get-return");
          if (kind === "getter-throws") throw new RangeError("getter");
          if (kind === "not-callable") return 5;
          return function () {
            log.push("return");
            if (kind === "throws") throw new RangeError("return");
            return Promise.reject(new RangeError("return"));
          };
        },
      };
    },
  };
}
function stepping(kind) {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        next() {
          index = index + 1;
          log.push("next" + index);
          if (index === 1) return Promise.resolve({ done: false, value: 1 });
          if (kind === "throws") throw new Marker("next");
          if (kind === "rejects") return Promise.reject(new Marker("next"));
          if (kind === "non-object") return Promise.resolve(7);
          if (kind === "done-throws") {
            return Promise.resolve({
              get done() {
                throw new Marker("done");
              },
            });
          }
          if (kind === "value-throws") {
            return Promise.resolve({
              done: false,
              get value() {
                throw new Marker("value");
              },
            });
          }
          return Promise.resolve({ done: true });
        },
        return() {
          log.push("return");
          return {};
        },
      };
    },
  };
}
function readonlyLength() {
  return Object.defineProperty({}, "length", { value: 0, writable: false });
}
function throwingMapper() {
  log.push("map");
  throw new Marker("map");
}
async function main() {
  await run("sync-next-read-once", () => Array.fromAsync(syncSource([1, 2])));
  await run("sync-reject-closes-once", () =>
    Array.fromAsync(
      syncSource([1, Promise.reject(new Marker("element")), 3]),
    ),
  );
  for (const kind of [
    "throws",
    "rejects",
    "non-object",
    "done-throws",
    "value-throws",
  ]) {
    await run("step/" + kind, () => Array.fromAsync(stepping(kind)));
  }
  await run("length-after-done", () =>
    Array.fromAsync.call(readonlyLength, stepping("done")),
  );
  await run("length-after-done-sync", () =>
    Array.fromAsync.call(readonlyLength, []),
  );
  for (const kind of ["getter-throws", "not-callable", "throws", "rejects"]) {
    await run("close/" + kind, () =>
      Array.fromAsync(closing(kind), throwingMapper),
    );
  }
}
main();

let turn = 0;
while (turn < 2) {
  console.log("guard", typeof Array.fromAsync, Array.fromAsync.length);
  if (turn === 0) Array.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) {
  return left + right;
}
console.log("hint", hinted(1, 2), hinted("1", 2));
`,
  },
];
