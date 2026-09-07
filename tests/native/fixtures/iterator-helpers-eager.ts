import type { Fixture } from "../fixture.ts";

export const iteratorHelpersEagerFixtures: readonly Fixture[] = [
  {
    name: "iterator-helpers-eager",
    source: `
function* source() {
  yield 1;
  yield 2;
  yield 3;
  yield 4;
}
function* empty() {}
console.log("toArray", source().toArray().join(","));
console.log("reduce", source().reduce((a, v, i) => a + v * 10 + i, 0));
console.log("reduce no initial", source().reduce((a, v, i) => a + v + i));
console.log(
  "reduce counter",
  source().reduce((a, v, i) => a + "|" + v + ":" + i, ""),
);
console.log(
  "reduce no initial counter",
  source().reduce((a, v, i) => a + "|" + v + ":" + i),
);
console.log(
  "reduce undefined initial",
  source().reduce((a, v) => String(a) + v, undefined),
);
console.log("some", source().some((v) => v === 3), source().some((v) => v > 9));
console.log(
  "every",
  source().every((v) => v > 0),
  source().every((v) => v < 3),
);
console.log("find", source().find((v) => v > 2), source().find((v) => v > 9));
const visited = [];
console.log(
  "forEach",
  source().forEach((v, i) => visited.push(v + ":" + i)),
  visited.join(","),
);
console.log(
  "empty",
  empty().toArray().length,
  empty().every(() => false),
  empty().some(() => true),
  empty().find(() => true),
  empty().forEach(() => 0),
);
try { empty().reduce((a, b) => a); } catch (error) {
  console.log("empty reduce", error.constructor.name);
}

const names = ["reduce", "toArray", "forEach", "some", "every", "find"];
for (const name of names) {
  const descriptor = Object.getOwnPropertyDescriptor(Iterator.prototype, name);
  const method = Iterator.prototype[name];
  console.log(
    "descriptor",
    name,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
    method.length,
    method.name,
    Object.getPrototypeOf(method) === Function.prototype,
    Object.prototype.hasOwnProperty.call(method, "prototype"),
  );
  try { new method(() => 0); } catch (error) {
    console.log("non-constructible", name, error instanceof TypeError);
  }
}

let closed = 0;
function closable() {
  return {
    __proto__: Iterator.prototype,
    get next() { throw new Error("next must not be read"); },
    return() { closed = closed + 1; return {}; },
  };
}
for (const attempt of [
  () => closable().reduce(),
  () => closable().reduce({}),
  () => closable().forEach(1),
  () => closable().some(null),
  () => closable().every("nope"),
  () => closable().find(0),
]) {
  closed = 0;
  try {
    attempt();
    console.log("validation missing");
  } catch (error) {
    console.log("validation", error.constructor.name, closed);
  }
}
for (const receiver of [undefined, null, true, 0, 0n, "text", Symbol()]) {
  for (const name of names) {
    try {
      Iterator.prototype[name].call(receiver, () => true);
      console.log("receiver missing", name);
    } catch (error) {
      console.log("receiver", name, error instanceof TypeError);
    }
  }
}

let returns = 0;
function live(limit) {
  let index = 0;
  return {
    __proto__: Iterator.prototype,
    next() {
      index = index + 1;
      if (index > limit) return { done: true, value: undefined };
      return { done: false, value: index };
    },
    return() { returns = returns + 1; return {}; },
  };
}
returns = 0;
console.log("some early", live(9).some((v) => v === 2), returns);
returns = 0;
console.log("every early", live(9).every((v) => v < 2), returns);
returns = 0;
console.log("find early", live(9).find((v) => v === 3), returns);
returns = 0;
console.log("some exhausted", live(3).some(() => false), returns);
returns = 0;
console.log("every exhausted", live(3).every(() => true), returns);
returns = 0;
console.log("find exhausted", live(3).find(() => false), returns);
returns = 0;
console.log("toArray exhausted", live(3).toArray().join(","), returns);
returns = 0;
console.log("forEach exhausted", live(3).forEach(() => 0), returns);
returns = 0;
try { live(9).forEach(() => { throw new RangeError("procedure"); }); }
catch (error) {
  console.log("callback throw", error.constructor.name, returns);
}
returns = 0;
try { live(9).reduce(() => { throw new RangeError("reducer"); }, 0); }
catch (error) {
  console.log("reduce callback throw", error.constructor.name, returns);
}

class ThrowingNext extends Iterator {
  next() { throw new RangeError("step"); }
  return() { throw new Error("close must not run"); }
}
for (const name of names) {
  try {
    new ThrowingNext()[name](() => true);
    console.log("step throw missing", name);
  } catch (error) {
    console.log("step throw", name, error.constructor.name);
  }
}
class ValueThrows extends Iterator {
  next() {
    return { done: false, get value() { throw new RangeError("value"); } };
  }
  return() { throw new Error("close must not run"); }
}
try { new ValueThrows().toArray(); } catch (error) {
  console.log("value throw", error.constructor.name);
}
class DoneThrows extends Iterator {
  next() { return { get done() { throw new RangeError("done"); } }; }
  return() { throw new Error("close must not run"); }
}
try { new DoneThrows().some(() => true); } catch (error) {
  console.log("done throw", error.constructor.name);
}
class NonObjectResult extends Iterator { next() { return 1; } }
try { new NonObjectResult().every(() => true); } catch (error) {
  console.log("non-object step", error instanceof TypeError);
}
class BadClose extends Iterator {
  next() { return { done: false, value: 1 }; }
  return() { throw new RangeError("close"); }
}
try { new BadClose().some(() => true); } catch (error) {
  console.log("close throw some", error.constructor.name);
}
try { new BadClose().find(() => true); } catch (error) {
  console.log("close throw find", error.constructor.name);
}
class NonObjectClose extends Iterator {
  next() { return { done: false, value: 1 }; }
  return() { return 1; }
}
try { new NonObjectClose().every(() => false); } catch (error) {
  console.log("non-object close", error instanceof TypeError);
}
class SwallowingClose extends Iterator {
  next() { return { done: false, value: 1 }; }
  return() { throw new Error("swallowed"); }
}
try { new SwallowingClose().forEach(() => { throw new RangeError("kept"); }); }
catch (error) {
  console.log("kept completion", error.constructor.name, error.message);
}

let nextGets = 0;
let nextCalls = 0;
const counting = {
  __proto__: Iterator.prototype,
  get next() {
    nextGets = nextGets + 1;
    const inner = source();
    return function () {
      nextCalls = nextCalls + 1;
      return inner.next();
    };
  },
};
console.log("next capture", counting.toArray().join(","), nextGets, nextCalls);
const order = [];
try {
  Iterator.prototype.reduce.call(
    {
      get next() {
        order.push("get next");
        return function () { return { done: true, value: undefined }; };
      },
    },
    {},
  );
} catch (error) {
  console.log("validation order", error instanceof TypeError, order.length);
}

const piped = source().map((v) => v * 2).filter((v) => v > 2);
console.log("pipeline", piped.toArray().join(","));
console.log(
  "pipeline reduce",
  source().map((v) => v * 2).reduce((a, v) => a + v, 0),
);
const collected = source().toArray();
console.log(
  "array shape",
  Object.getPrototypeOf(collected) === Array.prototype,
  collected.length,
  Object.getOwnPropertyDescriptor(collected, "0").writable,
);
const shared = source();
console.log("shared", shared.some((v) => v === 1), shared.next().done);

let traps = [];
function proxied(callback) {
  return new Proxy(callback, {
    apply(target, receiver, args) {
      traps.push("apply:" + args.length + ":" + args[args.length - 1]);
      return Reflect.apply(target, receiver, args);
    },
  });
}
returns = 0;
console.log(
  "proxy callback",
  live(3).every(proxied((v) => v > 0)),
  returns,
  traps.join(","),
);
traps = [];
returns = 0;
console.log(
  "proxy callback early",
  live(9).find(proxied((v) => v === 2)),
  returns,
  traps.join(","),
);
traps = [];
returns = 0;
console.log(
  "proxy callback reduce",
  live(3).reduce(proxied((a, v) => a + v)),
  returns,
  traps.join(","),
);
closed = 0;
try {
  closable().some(new Proxy({}, {}));
  console.log("proxy non-callable missing");
} catch (error) {
  console.log("proxy non-callable", error.constructor.name, closed);
}

let turn = 0;
while (turn < 2) {
  const same = Iterator.prototype.toArray === Iterator.prototype.toArray;
  console.log("guard", same);
  if (turn === 0) Iterator.prototype.marker = 1;
  turn = turn + 1;
}
delete Iterator.prototype.marker;
`,
  },
];
