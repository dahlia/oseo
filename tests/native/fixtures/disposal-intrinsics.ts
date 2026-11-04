import type { Es2026Fixture } from "../es2026-fixture.ts";

/** A fixture that may replace the reference hosts with fixed output. */
export interface DisposalFixture extends Es2026Fixture {
  /**
   * The output the edition requires, compared instead of the hosts. The
   * pinned Node.js and Deno both disagree with it.
   */
  readonly expected?: string;
}

// V8 gives every error an own "stack" property and orders some own keys
// differently, so the fixtures print sorted keys without "stack".
const ownKeys = `
function ownKeys(value) {
  return Reflect.ownKeys(value)
    .map(String)
    .filter((key) => key !== "stack")
    .sort()
    .join(",");
}
`;

/*
 * The explicit resource management built-ins: SuppressedError,
 * Symbol.dispose and Symbol.asyncDispose, DisposableStack,
 * AsyncDisposableStack, and the dispose methods of %Iterator.prototype%
 * and %AsyncIteratorPrototype%. Both pinned reference hosts expose them,
 * so every fixture compares with Node.js and Deno.
 */
export const disposalFixtures: readonly DisposalFixture[] = [
  {
    guardHits: true,
    name: "disposal-suppressed-error",
    source: `${ownKeys}
const descriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "SuppressedError",
);
console.log(
  "global",
  typeof descriptor.value,
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
  SuppressedError.name,
  SuppressedError.length,
  Object.getPrototypeOf(SuppressedError) === Error,
  Object.getPrototypeOf(SuppressedError.prototype) === Error.prototype,
  SuppressedError.prototype.constructor === SuppressedError,
  SuppressedError.prototype.name,
  JSON.stringify(SuppressedError.prototype.message),
  ownKeys(SuppressedError.prototype),
);
const plain = new SuppressedError("e", "s", "m");
console.log(
  "instance",
  plain.error,
  plain.suppressed,
  plain.message,
  ownKeys(plain),
  Error.isError(plain),
  plain instanceof Error,
  String(plain),
  Object.prototype.toString.call(plain),
);
for (const key of ["error", "suppressed", "message"]) {
  const own = Object.getOwnPropertyDescriptor(plain, key);
  console.log(
    "descriptor",
    key,
    own.writable,
    own.enumerable,
    own.configurable,
  );
}
const called = SuppressedError(1);
console.log(
  "call",
  called instanceof SuppressedError,
  called.error,
  called.suppressed,
  Object.hasOwn(called, "message"),
  ownKeys(called),
);
const optionless = new SuppressedError(1, 2, "text", { cause: "ignored" });
console.log("no cause", Object.hasOwn(optionless, "cause"));
const order = [];
const message = {
  toString() {
    order.push("message");
    return "converted";
  },
};
const converted = new SuppressedError(order, order, message);
console.log(
  "order",
  order.join(","),
  converted.message,
  converted.error === order,
);
try {
  new SuppressedError(1, 2, Symbol("x"));
} catch (error) {
  console.log("symbol message", error instanceof TypeError);
}
class Derived extends SuppressedError {
  constructor() {
    super("inner", "outer", "derived");
  }
}
const derived = new Derived();
console.log(
  "derived",
  Object.getPrototypeOf(derived) === Derived.prototype,
  derived instanceof SuppressedError,
  derived.error,
  derived.suppressed,
  Error.isError(derived),
);
function Target() {}
Target.prototype = null;
const fallback = Reflect.construct(SuppressedError, [], Target);
console.log(
  "fallback prototype",
  Object.getPrototypeOf(fallback) === SuppressedError.prototype,
);
let turn = 0;
while (turn < 2) {
  const value = new SuppressedError(turn, turn + 1);
  console.log("guard", value.error, value.suppressed, SuppressedError.length);
  if (turn === 0) SuppressedError.marker = turn;
  turn = turn + 1;
}
`,
  },
  {
    guardHits: true,
    name: "disposal-symbols",
    source: `
for (const name of ["dispose", "asyncDispose"]) {
  const descriptor = Object.getOwnPropertyDescriptor(Symbol, name);
  console.log(
    "symbol",
    name,
    typeof descriptor.value,
    descriptor.value.description,
    String(descriptor.value),
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
    Symbol.keyFor(descriptor.value),
    descriptor.value === Symbol[name],
  );
}
console.log("distinct", Symbol.dispose !== Symbol.asyncDispose);
const iteratorPrototype = Object.getPrototypeOf(
  Object.getPrototypeOf([][Symbol.iterator]()),
);
const syncDispose = iteratorPrototype[Symbol.dispose];
const syncDescriptor = Object.getOwnPropertyDescriptor(
  iteratorPrototype,
  Symbol.dispose,
);
console.log(
  "iterator dispose",
  typeof syncDispose,
  syncDispose.name,
  syncDispose.length,
  syncDescriptor.writable,
  syncDescriptor.enumerable,
  syncDescriptor.configurable,
  Object.hasOwn(syncDispose, "prototype"),
);
try {
  new syncDispose();
} catch (error) {
  console.log("construct", error instanceof TypeError);
}
function* generator() {
  try {
    yield 1;
    yield 2;
  } finally {
    console.log("generator finally");
  }
}
const running = generator();
running.next();
console.log(
  "dispose result",
  running[Symbol.dispose](),
  JSON.stringify(running.next()),
);
const counted = {
  calls: 0,
  return(...values) {
    this.calls += 1;
    console.log("return", values.length, this === counted);
    return 42;
  },
};
console.log("custom", syncDispose.call(counted), counted.calls);
console.log("absent", syncDispose.call({}), syncDispose.call({ return: null }));
try {
  syncDispose.call({ return: 1 });
} catch (error) {
  console.log("non-callable", error instanceof TypeError);
}
try {
  syncDispose.call({
    get return() {
      throw new RangeError("getter");
    },
  });
} catch (error) {
  console.log("getter throws", error instanceof RangeError);
}
console.log("primitive receiver", syncDispose.call(5));
async function* asyncGenerator() {}
const asyncIteratorPrototype = Object.getPrototypeOf(
  Object.getPrototypeOf(asyncGenerator.prototype),
);
const asyncDispose = asyncIteratorPrototype[Symbol.asyncDispose];
console.log(
  "async iterator dispose",
  typeof asyncDispose,
  asyncDispose.name,
  asyncDispose.length,
  Object.hasOwn(asyncIteratorPrototype, Symbol.dispose),
);
const order = [];
const awaited = {
  return() {
    order.push("return " + (this === awaited));
    return Promise.resolve("ignored");
  },
};
const settled = asyncDispose.call(awaited);
order.push("after call " + (settled instanceof Promise));
settled.then((value) => order.push("fulfilled " + value));
asyncDispose.call({}).then((value) => order.push("absent " + value));
asyncDispose.call({ return: 3 }).catch((error) => {
  order.push("non-callable " + (error instanceof TypeError));
});
asyncDispose.call({
  return() {
    throw new SyntaxError("thrown");
  },
}).catch((error) => order.push("thrown " + error.name));
asyncDispose.call({
  return() {
    return Promise.reject(new EvalError("rejected"));
  },
}).catch((error) => order.push("rejected " + error.name));
Promise.resolve().then(() => Promise.resolve()).then(() => {
  console.log("async order", order.join(","));
});
let turn = 0;
while (turn < 2) {
  console.log("guard", typeof Symbol.dispose, typeof Symbol.asyncDispose);
  if (turn === 0) Symbol.marker = turn;
  turn = turn + 1;
}
`,
  },
  {
    guardHits: true,
    name: "disposal-disposable-stack",
    source: `${ownKeys}
const prototype = DisposableStack.prototype;
console.log(
  "shape",
  DisposableStack.name,
  DisposableStack.length,
  ownKeys(prototype),
  prototype[Symbol.dispose] === prototype.dispose,
  prototype[Symbol.toStringTag],
  Object.getOwnPropertyDescriptor(DisposableStack, "prototype").writable,
);
for (const key of ["adopt", "defer", "dispose", "move", "use"]) {
  console.log("method", key, prototype[key].name, prototype[key].length);
}
const disposed = Object.getOwnPropertyDescriptor(prototype, "disposed");
console.log(
  "disposed accessor",
  disposed.get.name,
  disposed.set,
  disposed.enumerable,
  disposed.configurable,
);
try {
  DisposableStack();
} catch (error) {
  console.log("call", error instanceof TypeError);
}
const log = [];
const stack = new DisposableStack();
const resource = {
  [Symbol.dispose]() {
    log.push("use " + (this === resource));
    return "ignored";
  },
};
console.log("use returns", stack.use(resource) === resource);
console.log("defer returns", stack.defer((...values) => {
  log.push("defer " + values.length);
}));
console.log("adopt returns", stack.adopt("value", (...values) => {
  log.push("adopt " + values.join("+"));
}));
console.log("nullish", stack.use(null), stack.use(undefined));
console.log("before", stack.disposed, log.length);
console.log("dispose", stack.dispose(), stack.disposed, log.join(","));
console.log("again", stack.dispose(), log.length);
for (const [name, action] of [
  ["use", () => stack.use(resource)],
  ["defer", () => stack.defer(() => {})],
  ["adopt", () => stack.adopt(1, () => {})],
  ["move", () => stack.move()],
]) {
  try {
    action();
  } catch (error) {
    console.log("after dispose", name, error.constructor.name);
  }
}
const checks = new DisposableStack();
for (const [name, action] of [
  ["primitive", () => checks.use(1)],
  ["no method", () => checks.use({})],
  ["non-callable", () => checks.use({ [Symbol.dispose]: 1 })],
  ["defer", () => checks.defer(1)],
  ["adopt", () => checks.adopt(1, {})],
]) {
  try {
    action();
  } catch (error) {
    console.log("rejects", name, error.constructor.name);
  }
}
let reads = 0;
checks.use({
  get [Symbol.dispose]() {
    reads += 1;
    return () => log.push("getter method");
  },
});
console.log("method read once", reads);
checks.dispose();
console.log("method still once", reads);
for (const receiver of [{}, new AsyncDisposableStack(), undefined]) {
  try {
    prototype.dispose.call(receiver);
  } catch (error) {
    console.log("receiver", error.constructor.name);
  }
  try {
    disposed.get.call(receiver);
  } catch (error) {
    console.log("receiver getter", error.constructor.name);
  }
}
const errors = new DisposableStack();
errors.defer(() => {
  throw new Error("first");
});
errors.defer(() => log.push("between"));
errors.defer(() => {
  throw new TypeError("second");
});
errors.defer(() => {
  throw new RangeError("third");
});
try {
  errors.dispose();
} catch (error) {
  console.log(
    "chain",
    error.constructor.name,
    error.error.constructor.name,
    error.suppressed.constructor.name,
    error.suppressed.error.constructor.name,
    error.suppressed.suppressed.constructor.name,
    Error.isError(error),
  );
}
const single = new DisposableStack();
const only = new Error("only");
single.defer(() => {
  throw only;
});
try {
  single.dispose();
} catch (error) {
  console.log("single", error === only);
}
const outer = new DisposableStack();
outer.defer(() => log.push("moved resource"));
const moved = outer.move();
console.log(
  "move",
  outer.disposed,
  moved.disposed,
  Object.getPrototypeOf(moved) === prototype,
);
outer.dispose();
console.log("outer empty", log.at(-1));
moved.dispose();
console.log("moved disposed", log.at(-1));
class Sub extends DisposableStack {}
const sub = new Sub();
const subMoved = sub.move();
console.log(
  "subclass",
  sub instanceof Sub,
  Object.getPrototypeOf(subMoved) === prototype,
);
const nested = new DisposableStack();
nested.defer(() => log.push("nested inner"));
const host = new DisposableStack();
host.use(nested);
host.defer(() => log.push("host defer"));
host.dispose();
console.log("nested", log.slice(-2).join(","), nested.disposed);
const reentrant = new DisposableStack();
reentrant.defer(() => {
  try {
    reentrant.defer(() => {});
  } catch (error) {
    log.push("reentrant " + error.constructor.name);
  }
  log.push("reentrant disposed " + reentrant.disposed);
});
reentrant.dispose();
console.log("reentrant", log.slice(-2).join(","));
const many = new DisposableStack();
const visits = [];
for (let index = 0; index < 40; index += 1) {
  many.defer(() => visits.push(index));
}
many.dispose();
console.log("many", visits.length, visits[0], visits[39]);
let turn = 0;
while (turn < 2) {
  const each = new DisposableStack();
  each.defer(() => log.push("turn " + turn));
  each.dispose();
  console.log("guard", log.at(-1), each.disposed);
  if (turn === 0) DisposableStack.prototype.marker = turn;
  turn = turn + 1;
}
`,
  },
  {
    guardHits: true,
    name: "disposal-async-disposable-stack",
    source: `${ownKeys}
async function main() {
const prototype = AsyncDisposableStack.prototype;
console.log(
  "shape",
  AsyncDisposableStack.name,
  AsyncDisposableStack.length,
  ownKeys(prototype),
  prototype[Symbol.asyncDispose] === prototype.disposeAsync,
  Object.hasOwn(prototype, Symbol.dispose),
  prototype[Symbol.toStringTag],
);
for (const key of ["adopt", "defer", "disposeAsync", "move", "use"]) {
  console.log("method", key, prototype[key].name, prototype[key].length);
}
const log = [];
const ticks = [];
let tick = 0;
function clock(limit) {
  if (tick >= limit) return;
  ticks.push(tick);
  tick += 1;
  Promise.resolve().then(() => clock(limit));
}
async function scenario(name, build) {
  log.length = 0;
  ticks.length = 0;
  tick = 0;
  const stack = new AsyncDisposableStack();
  build(stack);
  clock(12);
  let outcome;
  try {
    const result = await stack.disposeAsync();
    outcome = "fulfilled " + result;
  } catch (error) {
    outcome = "rejected " + describe(error);
  }
  console.log(name, outcome, log.join(","), stack.disposed);
}
function describe(error) {
  if (error instanceof SuppressedError) {
    return "Suppressed(" + describe(error.error) + "," +
      describe(error.suppressed) + ")";
  }
  return error instanceof Error ? error.message : String(error);
}
function at(label) {
  log.push(label + "@" + tick);
}
await scenario("empty", () => {});
await scenario("async methods", (stack) => {
  stack.use({
    async [Symbol.asyncDispose]() {
      at("first");
    },
  });
  stack.defer(async () => at("defer"));
  stack.adopt("value", async (value) => at("adopt " + value));
});
await scenario("sync fallback", (stack) => {
  stack.use({
    [Symbol.dispose]() {
      at("sync");
      // The fallback discards this result, so its then is never read.
      return {
        then() {
          at("then read");
        },
      };
    },
  });
  stack.use({
    async [Symbol.asyncDispose]() {
      at("async");
    },
  });
});
await scenario("null resources", (stack) => {
  stack.defer(() => at("bottom"));
  stack.use(null);
  stack.use(undefined);
  stack.defer(() => at("top"));
});
await scenario("only null", (stack) => {
  stack.use(null);
});
await scenario("rejections", (stack) => {
  stack.defer(() => {
    throw new Error("sync throw");
  });
  stack.defer(async () => {
    throw new Error("async throw");
  });
  stack.use({
    [Symbol.dispose]() {
      throw new Error("fallback throw");
    },
  });
  stack.defer(() => Promise.reject(new Error("rejected")));
});
await scenario("thenable", (stack) => {
  stack.defer(() => ({
    then(resolve) {
      at("then");
      resolve("ignored");
    },
  }));
});
await scenario("non-promise result", (stack) => {
  stack.defer(() => 17);
  stack.defer(() => at("after value"));
});
const reads = [];
const resource = {
  get [Symbol.asyncDispose]() {
    reads.push("asyncDispose");
    return undefined;
  },
  get [Symbol.dispose]() {
    reads.push("dispose");
    return () => {};
  },
};
const lookup = new AsyncDisposableStack();
lookup.use(resource);
console.log("lookup order", reads.join(","));
for (const [name, action] of [
  ["primitive", () => lookup.use(1)],
  ["no method", () => lookup.use({})],
  ["non-callable async", () => lookup.use({ [Symbol.asyncDispose]: 1 })],
  ["defer", () => lookup.defer(1)],
]) {
  try {
    action();
  } catch (error) {
    console.log("rejects", name, error.constructor.name);
  }
}
await lookup.disposeAsync();
const settled = await Promise.allSettled([
  prototype.disposeAsync.call({}),
  prototype.disposeAsync.call(new DisposableStack()),
  lookup.disposeAsync(),
]);
console.log(
  "receivers",
  settled.map((entry) =>
    entry.status + ":" + (entry.reason?.constructor.name ?? entry.value)
  ).join(","),
);
for (const [name, action] of [
  ["use", () => lookup.use(null)],
  ["move", () => lookup.move()],
]) {
  try {
    action();
  } catch (error) {
    console.log("after dispose", name, error.constructor.name);
  }
}
const source = new AsyncDisposableStack();
source.defer(async () => log.push("moved"));
const moved = source.move();
console.log(
  "move",
  source.disposed,
  moved.disposed,
  Object.getPrototypeOf(moved) === prototype,
);
log.length = 0;
await source.disposeAsync();
await moved.disposeAsync();
console.log("moved disposed", log.join(","));
const pending = new AsyncDisposableStack();
pending.defer(() => new Promise((resolve) => setTimeout(resolve, 5)));
const first = pending.disposeAsync();
const second = pending.disposeAsync();
console.log("second before first", pending.disposed, first !== second);
await second;
console.log("second settled");
await first;
console.log("first settled");
let turn = 0;
while (turn < 2) {
  const each = new AsyncDisposableStack();
  each.defer(() => {});
  await each.disposeAsync();
  console.log("guard", each.disposed);
  if (turn === 0) AsyncDisposableStack.prototype.marker = turn;
  turn = turn + 1;
}
}
main();
`,
  },
  {
    name: "disposal-cross-realm",
    source: `
const other = $262.createRealm().global;
const otherStack = new other.DisposableStack();
console.log(
  "other realm",
  other.DisposableStack !== DisposableStack,
  other.SuppressedError !== SuppressedError,
  other.Symbol.dispose === Symbol.dispose,
  other.Symbol.asyncDispose === Symbol.asyncDispose,
  Object.getPrototypeOf(otherStack) === other.DisposableStack.prototype,
);
const boundObject = other.Object.bind();
const fromOther = Reflect.construct(DisposableStack, [], boundObject);
console.log(
  "fallback realm",
  Object.getPrototypeOf(fromOther) === other.DisposableStack.prototype,
);
const asyncFromOther = Reflect.construct(AsyncDisposableStack, [], boundObject);
console.log(
  "async fallback realm",
  Object.getPrototypeOf(asyncFromOther) ===
    other.AsyncDisposableStack.prototype,
);
const errorFromOther = Reflect.construct(SuppressedError, [], boundObject);
console.log(
  "error fallback realm",
  Object.getPrototypeOf(errorFromOther) === other.SuppressedError.prototype,
  Error.isError(errorFromOther),
);
const movedHere = DisposableStack.prototype.move.call(otherStack);
console.log(
  "move realm",
  Object.getPrototypeOf(movedHere) === DisposableStack.prototype,
  otherStack.disposed,
);
const failing = new other.DisposableStack();
failing.defer(() => {
  throw new Error("first");
});
failing.defer(() => {
  throw new Error("second");
});
try {
  failing.dispose();
} catch (error) {
  console.log(
    "suppressed realm",
    error instanceof other.SuppressedError,
    error instanceof SuppressedError,
  );
}
`,
    test262Host: true,
  },
  {
    // AddDisposableResource captures the stack's DisposeCapability before
    // GetDisposeMethod runs the getter, so a `move` inside the getter
    // hands the new stack the record the resource is then added to. The
    // pinned V8 hosts add it to the disposed source instead.
    expected: [
      "sync moved false",
      "sync disposed true",
      "async moved false",
      "async disposed true",
      "",
    ].join("\n"),
    name: "disposal-capability-identity",
    source: `
async function main() {
  let moved;
  const source = new DisposableStack();
  source.use({
    get [Symbol.dispose]() {
      moved = source.move();
      return () => console.log("sync disposed", source.disposed);
    },
  });
  console.log("sync moved", moved.disposed);
  moved.dispose();
  let movedAsync;
  const asyncSource = new AsyncDisposableStack();
  asyncSource.use({
    get [Symbol.asyncDispose]() {
      movedAsync = asyncSource.move();
      return async () => console.log("async disposed", asyncSource.disposed);
    },
  });
  console.log("async moved", movedAsync.disposed);
  await movedAsync.disposeAsync();
}
main();
`,
  },
];
