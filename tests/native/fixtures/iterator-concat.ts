import type { Es2026Fixture } from "../es2026-fixture.ts";

/*
 * Iterator.concat reads each item's Symbol.iterator method when called,
 * opens each item only when its turn comes, and forwards `return` to the
 * active inner iterator. The pinned Node.js lacks it, so Deno is the
 * single reference host.
 */
export const iteratorConcatFixtures: readonly Es2026Fixture[] = [
  {
    denoOnly: true,
    guardHits: true,
    name: "iterator-concat",
    source: `
const descriptor = Object.getOwnPropertyDescriptor(Iterator, "concat");
console.log(
  "descriptor",
  typeof descriptor.value,
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
  Iterator.concat.name,
  Iterator.concat.length,
  Object.hasOwn(Iterator.concat, "prototype"),
);
try { new Iterator.concat(); } catch (error) {
  console.log("construct", error instanceof TypeError);
}
const helperPrototype = Object.getPrototypeOf(Iterator.from([]).map((x) => x));
const empty = Iterator.concat();
console.log(
  "prototype",
  Object.getPrototypeOf(empty) === helperPrototype,
  empty instanceof Iterator,
  JSON.stringify(empty.next()),
  JSON.stringify(empty.next()),
);
const log = [];
function tracked(name, values) {
  return {
    get [Symbol.iterator]() {
      log.push(name + ":get");
      return function () {
        log.push(name + ":open:" + (this === tracked.items[name]));
        let index = 0;
        return {
          get next() {
            log.push(name + ":get-next");
            return function (...args) {
              log.push(name + ":next:" + args.length);
              const done = index >= values.length;
              const value = values[index];
              index = index + 1;
              return {
                get done() { log.push(name + ":done"); return done; },
                get value() { log.push(name + ":value"); return value; },
              };
            };
          },
          return(...args) {
            log.push(name + ":return:" + args.length);
            return {};
          },
        };
      };
    },
  };
}
tracked.items = {};
tracked.items.a = tracked("a", [1, 2]);
tracked.items.b = tracked("b", []);
tracked.items.c = tracked("c", [3]);
const ordered = Iterator.concat(
  tracked.items.a,
  tracked.items.b,
  tracked.items.c,
);
console.log("created", log.join(","));
log.length = 0;
const results = [];
for (let step = 0; step < 5; step = step + 1) {
  const result = ordered.next();
  results.push(result.done + ":" + result.value);
  console.log("step", step, log.join(","));
  log.length = 0;
}
console.log("results", results.join(","));
const iterables = Iterator.concat(
  [1, 2],
  new Set([3, 4]),
  new Map([[5, 6]]).keys(),
  new String("xy"),
  (function* () { yield 7; })(),
  new Uint8Array([8]),
);
console.log("iterables", [...iterables].join(","));
let rejections = "";
const rejected = [
  [1], ["ab"], [null], [undefined], [{}], [{ [Symbol.iterator]: 1 }],
  [{ [Symbol.iterator]: null }], [[1], 2],
];
for (const items of rejected) {
  try {
    Iterator.concat(...items);
    rejections = rejections + "?";
  } catch (error) {
    rejections = rejections + (error instanceof TypeError ? "T" : "X");
  }
}
console.log("call rejections", rejections);
const order = [];
try {
  Iterator.concat(
    {
      get [Symbol.iterator]() {
        order.push("first");
        return () => [][Symbol.iterator]();
      },
    },
    {
      get [Symbol.iterator]() {
        order.push("second");
        throw new RangeError("get");
      },
    },
    {
      get [Symbol.iterator]() {
        order.push("third");
        return () => [];
      },
    },
  );
} catch (error) {
  console.log("getter throws", error instanceof RangeError, order.join(","));
}
function stepError(make) {
  const iterator = Iterator.concat({ [Symbol.iterator]: make });
  try {
    iterator.next();
    return "?";
  } catch (error) {
    const after = JSON.stringify(iterator.next());
    return (error instanceof TypeError ? "T" : error instanceof RangeError
      ? "R"
      : "X") + after;
  }
}
console.log(
  "step errors",
  stepError(() => 1),
  stepError(() => { throw new RangeError("open"); }),
  stepError(() => ({ next() { return 1; } })),
  stepError(() => ({ next() { throw new RangeError("next"); } })),
  stepError(() => ({ next: 1 })),
  stepError(() => ({
    next() { return { get done() { throw new RangeError("done"); } }; },
  })),
  stepError(() => ({
    next() {
      return { done: false, get value() { throw new RangeError("value"); } };
    },
  })),
);
log.length = 0;
const beforeStart = Iterator.concat(tracked.items.a);
log.length = 0;
console.log(
  "return before start",
  JSON.stringify(beforeStart.return()),
  log.join(","),
  JSON.stringify(beforeStart.next()),
);
const forwarded = Iterator.concat(tracked.items.a, tracked.items.c);
forwarded.next();
log.length = 0;
console.log(
  "return forwarded",
  JSON.stringify(forwarded.return()),
  log.join(","),
  JSON.stringify(forwarded.next()),
);
const exhausted = Iterator.concat(tracked.items.c);
exhausted.next();
exhausted.next();
log.length = 0;
console.log(
  "return after exhaustion",
  JSON.stringify(exhausted.return()),
  log.join(","),
);
let returnCalls = 0;
const throwingReturn = Iterator.concat({
  [Symbol.iterator]() {
    return {
      next() { return { done: false, value: 1 }; },
      return() {
        returnCalls = returnCalls + 1;
        throw new RangeError("return");
      },
    };
  },
});
throwingReturn.next();
try { throwingReturn.return(); } catch (error) {
  console.log(
    "return throws",
    error instanceof RangeError,
    returnCalls,
    JSON.stringify(throwingReturn.next()),
  );
}
const nonObjectReturn = Iterator.concat({
  [Symbol.iterator]() {
    return { next() { return { done: false }; }, return() { return 1; } };
  },
});
nonObjectReturn.next();
try { nonObjectReturn.return(); } catch (error) {
  console.log("return non-object", error instanceof TypeError);
}
let running;
const reentrant = Iterator.concat({
  [Symbol.iterator]() {
    return {
      next() {
        let nextError = "none";
        let returnError = "none";
        try { running.next(); } catch (error) {
          nextError = error.constructor.name;
        }
        try { running.return(); } catch (error) {
          returnError = error.constructor.name;
        }
        return { done: false, value: nextError + "/" + returnError };
      },
    };
  },
});
running = reentrant;
console.log("reentrant", reentrant.next().value);
const shared = { done: false, value: "shared" };
const fresh = Iterator.concat({
  [Symbol.iterator]() { return { next() { return shared; } }; },
});
const first = fresh.next();
const second = fresh.next();
console.log(
  "fresh results",
  first !== shared,
  first !== second,
  Object.keys(first).join(","),
  first.value,
);
const many = [];
for (let index = 0; index < 40; index = index + 1) many.push([index]);
let manySum = 0;
for (const value of Iterator.concat(...many)) manySum = manySum + value;
console.log("many", manySum);
const kept = Iterator.concat(
  { [Symbol.iterator]() { return [{ label: "kept" }][Symbol.iterator](); } },
);
const pressure = [];
for (let index = 0; index < 64; index = index + 1) pressure.push({ index });
console.log("kept", kept.next().value.label, pressure.length);
console.log(
  "helpers",
  Iterator.concat([1, 2, 3], [4]).map((x) => x * 2).filter((x) => x > 2)
    .toArray().join(","),
);
let turn = 0;
while (turn < 2) {
  console.log("guard", Iterator.concat([turn]).next().value);
  if (turn === 0) Iterator.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 2), hinted("1", 2));
const original = Iterator.concat;
Iterator.concat = () => "replaced";
console.log("replaced", Iterator.concat([1]), original([5]).next().value);
delete Iterator.concat;
console.log("deleted", typeof Iterator.concat, original([6]).next().value);
`,
  },
];
