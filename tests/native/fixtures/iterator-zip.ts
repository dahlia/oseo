import type { Es2026Fixture } from "../es2026-fixture.ts";
import { iteratorZipModel } from "../iterator-zip-model.ts";

/*
 * The constructor shape guard miss and false number hint every fixture
 * ends with, so the enabled policy reaches its compiled generic fallback.
 */
const guardTail = `
let turn = 0;
while (turn < 2) {
  console.log("guard", Iterator.zip([[turn]]).next().value[0]);
  if (turn === 0) Iterator.marker = turn;
  turn = turn + 1;
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 2), hinted("1", 2));
`;

/*
 * Iterator.zip and Iterator.zipKeyed with their three modes and padding.
 * Neither pinned reference host implements them, so both run the
 * specification model in tests/native/iterator-zip-model.ts instead.
 */
export const iteratorZipFixtures: readonly Es2026Fixture[] = [
  {
    guardHits: true,
    name: "iterator-zip-modes",
    referenceModel: iteratorZipModel,
    source: `
for (const name of ["zip", "zipKeyed"]) {
  const descriptor = Object.getOwnPropertyDescriptor(Iterator, name);
  console.log(
    "descriptor",
    name,
    typeof descriptor.value,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
    Iterator[name].name,
    Iterator[name].length,
    Object.hasOwn(Iterator[name], "prototype"),
    Object.getPrototypeOf(Iterator[name]) === Function.prototype,
  );
  try { new Iterator[name]({}); } catch (error) {
    console.log("construct", name, error instanceof TypeError);
  }
}
const helperPrototype = Object.getPrototypeOf(Iterator.from([]).map((x) => x));
const empty = Iterator.zip([]);
console.log(
  "prototype",
  Object.getPrototypeOf(empty) === helperPrototype,
  Object.getPrototypeOf(Iterator.zipKeyed({})) === helperPrototype,
  JSON.stringify(empty.next()),
  JSON.stringify(Iterator.zip([], { mode: "longest" }).next()),
  JSON.stringify(Iterator.zipKeyed({}, { mode: "strict" }).next()),
);
function show(iterator) {
  const rows = [];
  try {
    for (const row of iterator) rows.push(JSON.stringify(row));
  } catch (error) {
    rows.push(error.constructor.name);
  }
  return rows.join(" ");
}
const inputs = () => [[1, 2, 3], ["a", "b"], new Set([true, false, null, 0])];
console.log("default", show(Iterator.zip(inputs())));
console.log("shortest", show(Iterator.zip(inputs(), { mode: "shortest" })));
console.log("longest", show(Iterator.zip(inputs(), { mode: "longest" })));
console.log(
  "padding array",
  show(Iterator.zip(inputs(), { mode: "longest", padding: ["p", "q", "r"] })),
);
console.log(
  "short padding",
  show(Iterator.zip(inputs(), { mode: "longest", padding: ["p"] })),
);
console.log(
  "padding ignored",
  show(Iterator.zip([[1], [2, 3]], { mode: "shortest", padding: 1 })),
);
console.log("strict equal", show(Iterator.zip([[1, 2], "xy".split("")], {
  mode: "strict",
})));
console.log("strict unequal", show(Iterator.zip(inputs(), { mode: "strict" })));
console.log("strict first", show(Iterator.zip([[1], [2, 3]], {
  mode: "strict",
})));
console.log(
  "iterables",
  show(Iterator.zip([
    new Map([[1, 2]]).keys(),
    new String("xyz"),
    (function* () { yield 7; yield 8; })(),
    new Uint8Array([9, 10]),
    { next() { return { done: false, value: "raw" }; } },
  ])),
);
console.log(
  "input iterables",
  show(Iterator.zip(new Set([[1, 2], [3, 4]]))),
  show(Iterator.zip((function* () { yield [5]; yield [6]; })())),
);
const keyedInput = () => ({ b: [1, 2], a: ["x"], 2: [true, false, null] });
console.log("keyed", show(Iterator.zipKeyed(keyedInput())));
console.log(
  "keyed longest",
  show(Iterator.zipKeyed(keyedInput(), {
    mode: "longest",
    padding: { a: "pa", 2: "p2", b: "pb", extra: "unused" },
  })),
);
console.log(
  "keyed default padding",
  show(Iterator.zipKeyed(keyedInput(), { mode: "longest" })),
);
console.log("keyed strict", show(Iterator.zipKeyed(keyedInput(), {
  mode: "strict",
})));
const keyedRow = Iterator.zipKeyed({ x: [1], y: [2] }).next().value;
const keyedDescriptor = Object.getOwnPropertyDescriptor(keyedRow, "x");
console.log(
  "keyed row",
  Object.getPrototypeOf(keyedRow),
  Object.isExtensible(keyedRow),
  Reflect.ownKeys(keyedRow).join(","),
  keyedDescriptor.writable,
  keyedDescriptor.enumerable,
  keyedDescriptor.configurable,
);
const row = Iterator.zip([[1], [2]]).next().value;
const rowDescriptor = Object.getOwnPropertyDescriptor(row, "0");
console.log(
  "row",
  Array.isArray(row),
  Object.getPrototypeOf(row) === Array.prototype,
  row.length,
  rowDescriptor.writable,
  rowDescriptor.enumerable,
  rowDescriptor.configurable,
);
const symbol = Symbol("s");
const symbolRow = Iterator.zipKeyed({ [symbol]: [3], s: [4] }).next().value;
console.log(
  "symbol key",
  Reflect.ownKeys(symbolRow).map(String).join(","),
  symbolRow[symbol],
);
const proto = Iterator.zipKeyed({ ["__proto__"]: [5] }).next().value;
console.log(
  "proto key",
  Object.getPrototypeOf(proto),
  Object.hasOwn(proto, "__proto__"),
);
const freshInput = [[1, 2], [3, 4]];
const fresh = Iterator.zip(freshInput);
const first = fresh.next();
const second = fresh.next();
console.log(
  "fresh",
  first.value !== second.value,
  first.value !== freshInput[0],
  Object.keys(first).join(","),
);
function errorName(make) {
  try {
    make();
    return "none";
  } catch (error) {
    return error.constructor.name;
  }
}
const badModes = [
  null, false, "", "short", "Longest", Symbol(), 1, 1n, {},
  new String("strict"),
];
console.log(
  "bad modes",
  badModes.map((mode) => errorName(() => Iterator.zip([], { mode }))).join(","),
  badModes.map((mode) => errorName(() => Iterator.zipKeyed({}, { mode })))
    .join(","),
);
const badOptions = [null, 1, "longest", true, Symbol()];
console.log(
  "bad options",
  badOptions.map((options) => errorName(() => Iterator.zip([], options)))
    .join(","),
  errorName(() => Iterator.zip([], undefined)),
  errorName(() => Iterator.zip([], () => {})),
);
const badPadding = [null, 1, "ab", true, Symbol()];
console.log(
  "bad padding",
  badPadding.map((padding) =>
    errorName(() => Iterator.zip([], { mode: "longest", padding }))
  ).join(","),
  badPadding.map((padding) =>
    errorName(() => Iterator.zipKeyed({}, { mode: "longest", padding }))
  ).join(","),
  errorName(() => Iterator.zip([], { mode: "longest", padding: {} })),
  errorName(() => Iterator.zipKeyed({}, { mode: "longest", padding: [] })),
);
const badIterables = [undefined, null, true, "", "ab", Symbol(), 0, 0n];
console.log(
  "bad iterables",
  badIterables.map((iterables) => errorName(() => Iterator.zip(iterables)))
    .join(","),
  badIterables.map((iterables) => errorName(() => Iterator.zipKeyed(iterables)))
    .join(","),
  errorName(() => Iterator.zip()),
  errorName(() => Iterator.zip({})),
  errorName(() => Iterator.zip({ [Symbol.iterator]: 1 })),
  errorName(() => Iterator.zip({ [Symbol.iterator]: () => 1 })),
);
console.log(
  "bad items",
  errorName(() => Iterator.zip(["ab"])),
  errorName(() => Iterator.zip([1])),
  errorName(() => Iterator.zip([null])),
  errorName(() => Iterator.zip([{ [Symbol.iterator]: 1 }])),
  errorName(() => Iterator.zip([{ [Symbol.iterator]: () => 2 }])),
  errorName(() => Iterator.zipKeyed({ a: "ab" })),
  errorName(() => Iterator.zipKeyed({ a: null })),
  errorName(() => Iterator.zipKeyed({ a: undefined })),
);
let readOrder = [];
const ordered = {
  get mode() { readOrder.push("mode"); return "longest"; },
  get padding() { readOrder.push("padding"); return undefined; },
};
Iterator.zip({
  [Symbol.iterator]() {
    readOrder.push("iterables");
    return [][Symbol.iterator]();
  },
}, ordered);
console.log("option order", readOrder.join(","));
readOrder = [];
try {
  Iterator.zip({
    [Symbol.iterator]() { readOrder.push("iterables"); return []; },
  }, {
    get mode() { readOrder.push("mode"); return "bad"; },
    get padding() { readOrder.push("padding"); },
  });
} catch (error) {
  console.log("bad mode order", error.constructor.name, readOrder.join(","));
}
readOrder = [];
Iterator.zip([], {
  get mode() { readOrder.push("mode"); return "strict"; },
  get padding() { readOrder.push("padding"); },
});
console.log("strict skips padding", readOrder.join(","));
const many = [];
for (let index = 0; index < 40; index = index + 1) many.push([index, -index]);
let manySum = 0;
for (const values of Iterator.zip(many)) {
  for (const value of values) manySum = manySum + value;
}
console.log("many", manySum);
const kept = Iterator.zipKeyed({ label: [{ text: "kept" }] });
const pressure = [];
for (let index = 0; index < 64; index = index + 1) pressure.push({ index });
console.log("kept", kept.next().value.label.text, pressure.length);
console.log(
  "helpers",
  Iterator.zip([[1, 2, 3], [4, 5, 6]]).map(([a, b]) => a * b)
    .filter((x) => x > 4).toArray().join(","),
);
${guardTail}
const original = Iterator.zip;
Iterator.zip = () => "replaced";
console.log("replaced", Iterator.zip([[1]]), original([[5]]).next().value[0]);
delete Iterator.zip;
console.log("deleted", typeof Iterator.zip, original([[6]]).next().value[0]);
`,
  },
  {
    guardHits: true,
    name: "iterator-zip-closing",
    referenceModel: iteratorZipModel,
    source: `
const log = [];
function flush() {
  const text = log.join(",");
  log.length = 0;
  return text;
}
/*
 * A logged iterator. It yields "name0", "name1", ... for \`length\`
 * steps and can throw from next at step \`throwAt\`, from return, or
 * return a non-object from return.
 */
function logged(name, length, options = {}) {
  let index = 0;
  return {
    [Symbol.iterator]() {
      log.push(name + ":open");
      return this;
    },
    get next() {
      log.push(name + ":get-next");
      return function (...args) {
        log.push(name + ":next:" + args.length);
        if (index === options.throwAt) throw new RangeError(name);
        const done = index >= length;
        const value = name + index;
        index = index + 1;
        return {
          get done() { log.push(name + ":done"); return done; },
          get value() { log.push(name + ":value"); return value; },
        };
      };
    },
    get return() {
      log.push(name + ":get-return");
      if (options.noReturn) return undefined;
      return function (...args) {
        log.push(name + ":return:" + args.length);
        if (options.returnThrows) throw new EvalError(name);
        return options.returnPrimitive ? 1 : {};
      };
    },
  };
}
function result(step) {
  try {
    const value = step();
    return value.done + ":" + JSON.stringify(value.value);
  } catch (error) {
    // A TypeError message is implementation text, so only its type counts.
    return error instanceof TypeError
      ? "TypeError"
      : error.constructor.name + ":" + error.message;
  }
}
function report(label, step) {
  const text = result(step);
  console.log(label, text, flush());
}
const created = Iterator.zip([logged("a", 2), logged("b", 2)]);
console.log("created", flush());
report("step", () => created.next());
report("step", () => created.next());
report("end", () => created.next());
report("after", () => created.next());
const shortest = Iterator.zip([logged("a", 2), logged("b", 1), logged("c", 3)]);
shortest.next();
flush();
report("shortest done", () => shortest.next());
const shortestThrow = Iterator.zip([
  logged("a", 2),
  logged("b", 1),
  logged("c", 3, { returnThrows: true }),
  logged("d", 3, { returnThrows: true }),
]);
shortestThrow.next();
flush();
report("shortest close throws", () => shortestThrow.next());
report("after close throws", () => shortestThrow.next());
const shortestPrimitive = Iterator.zip([
  logged("a", 0),
  logged("b", 1, { returnPrimitive: true }),
]);
flush();
report("shortest close primitive", () => shortestPrimitive.next());
const longest = Iterator.zip([logged("a", 1), logged("b", 3), logged("c", 2)], {
  mode: "longest",
  padding: ["pa", "pb", "pc"],
});
flush();
for (let step = 0; step < 4; step = step + 1) {
  report("longest", () => longest.next());
}
const longestReturn = Iterator.zip([
  logged("a", 1), logged("b", 3), logged("c", 3),
], {
  mode: "longest",
});
longestReturn.next();
longestReturn.next();
flush();
report("longest return", () => longestReturn.return());
const strictTail = Iterator.zip([
  logged("a", 1), logged("b", 1), logged("c", 1),
], {
  mode: "strict",
});
strictTail.next();
flush();
report("strict done", () => strictTail.next());
const strictLater = Iterator.zip([
  logged("a", 2), logged("b", 1), logged("c", 2),
], {
  mode: "strict",
});
strictLater.next();
flush();
report("strict later", () => strictLater.next());
const strictFirst = Iterator.zip([
  logged("a", 1), logged("b", 1), logged("c", 2), logged("d", 2),
], {
  mode: "strict",
});
strictFirst.next();
flush();
report("strict first", () => strictFirst.next());
const strictStepThrow = Iterator.zip([
  logged("a", 1), logged("b", 1, { throwAt: 1 }), logged("c", 2),
], {
  mode: "strict",
});
strictStepThrow.next();
flush();
report("strict step throws", () => strictStepThrow.next());
const strictCloseThrow = Iterator.zip([
  logged("a", 1),
  logged("b", 2, { returnThrows: true }),
  logged("c", 2),
], {
  mode: "strict",
});
strictCloseThrow.next();
flush();
report("strict close throws", () => strictCloseThrow.next());
const stepThrow = Iterator.zip([
  logged("a", 3), logged("b", 3, { throwAt: 1 }), logged("c", 3),
]);
stepThrow.next();
flush();
report("step throws", () => stepThrow.next());
report("after step throws", () => stepThrow.next());
const notObject = Iterator.zip([
  logged("a", 3), { next() { return 1; } }, logged("c", 3),
]);
flush();
report("result not object", () => notObject.next());
const beforeStart = Iterator.zip([
  logged("a", 1), logged("b", 1, { noReturn: true }), logged("c", 1),
]);
flush();
report("return before start", () => beforeStart.return());
report("after return", () => beforeStart.next());
const atYield = Iterator.zip([logged("a", 3), logged("b", 3)]);
atYield.next();
flush();
report("return at yield", () => atYield.return());
report("second return", () => atYield.return());
const returnThrows = Iterator.zip([
  logged("a", 3, { returnThrows: true }),
  logged("b", 3, { returnThrows: true }),
  logged("c", 3),
]);
returnThrows.next();
flush();
report("return throws", () => returnThrows.return());
const startThrows = Iterator.zip([
  logged("a", 3),
  logged("b", 3, { returnPrimitive: true }),
]);
flush();
report("start return primitive", () => startThrows.return());
const setupLog = [];
function input(values) {
  let index = 0;
  return {
    [Symbol.iterator]() {
      return {
        next() {
          setupLog.push("input:next");
          if (values[index] === "throw") throw new RangeError("input");
          index = index + 1;
          return index > values.length
            ? { done: true }
            : { done: false, value: values[index - 1] };
        },
        return() {
          setupLog.push("input:return");
          return {};
        },
      };
    },
  };
}
console.log(
  "setup input throws",
  result(() => Iterator.zip(input([logged("a", 1), logged("b", 1), "throw"]))),
  flush(),
  setupLog.join(","),
);
setupLog.length = 0;
console.log(
  "setup item rejected",
  result(() => Iterator.zip(input([logged("a", 1), logged("b", 1), 5]))),
  flush(),
  setupLog.join(","),
);
setupLog.length = 0;
console.log(
  "setup open throws",
  result(() => Iterator.zip(input([
    logged("a", 1),
    { [Symbol.iterator]() { throw new SyntaxError("open"); } },
  ]))),
  flush(),
  setupLog.join(","),
);
console.log(
  "padding throws",
  result(() => Iterator.zip([logged("a", 1), logged("b", 1)], {
    mode: "longest",
    padding: logged("p", 3, { throwAt: 1 }),
  })),
  flush(),
);
console.log(
  "padding closes",
  result(() => Iterator.zip([logged("a", 1), logged("b", 1)], {
    mode: "longest",
    padding: logged("p", 3),
  })),
  flush(),
);
console.log(
  "padding exhausted",
  result(() => Iterator.zip([logged("a", 1), logged("b", 1)], {
    mode: "longest",
    padding: logged("p", 1),
  })),
  flush(),
);
console.log(
  "padding with no iterators",
  result(() => Iterator.zip([], { mode: "longest", padding: logged("p", 1) })),
  flush(),
);
console.log(
  "padding close throws",
  result(() => Iterator.zip([logged("a", 1), logged("b", 1)], {
    mode: "longest",
    padding: logged("p", 3, { returnThrows: true }),
  })),
  flush(),
);
console.log(
  "padding not iterable",
  result(() => Iterator.zip([logged("a", 1)], {
    mode: "longest",
    padding: {},
  })),
  flush(),
);
let running;
const reentrant = Iterator.zip([{
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
}]);
running = reentrant;
console.log("reentrant", reentrant.next().value[0]);
let closing;
const reentrantClose = Iterator.zip([{
  next() { return { done: false, value: 1 }; },
  return() {
    let state = "none";
    try { state = JSON.stringify(closing.next()); } catch (error) {
      state = error.constructor.name;
    }
    log.push("inner:" + state);
    return {};
  },
}]);
closing = reentrantClose;
report("reentrant start close", () => reentrantClose.return());
${guardTail}
`,
  },
  {
    /*
     * Node.js 24.21.0 marks a helper completed before a `return` at a
     * yield closes, so a re-entrant `next` sees `done` there instead of
     * the running-generator TypeError GeneratorResumeAbrupt specifies.
     * Deno follows the specification, so this probe of the model's
     * helper state runs on Deno alone.
     */
    denoOnly: true,
    guardHits: true,
    name: "iterator-zip-reentrant-close",
    referenceModel: iteratorZipModel,
    source: `
let closing;
function reentrant() {
  return Iterator.zip([{
    next() { return { done: false, value: 1 }; },
    return() {
      let state = "none";
      try { state = JSON.stringify(closing.next()); } catch (error) {
        state = error.constructor.name;
      }
      console.log("inner", state);
      return {};
    },
  }]);
}
closing = reentrant();
closing.next();
console.log("yield close", JSON.stringify(closing.return()));
console.log("after", JSON.stringify(closing.next()));
closing = reentrant();
console.log("start close", JSON.stringify(closing.return()));
${guardTail}
`,
  },
  {
    guardHits: true,
    name: "iterator-zip-keyed",
    referenceModel: iteratorZipModel,
    source: `
const log = [];
function flush() {
  const text = log.join(",");
  log.length = 0;
  return text;
}
function logged(name, length, options = {}) {
  let index = 0;
  return {
    next() {
      log.push(name + ":next");
      const done = index >= length;
      index = index + 1;
      return { done, value: name + (index - 1) };
    },
    return() {
      log.push(name + ":return");
      if (options.returnThrows) throw new EvalError(name);
      return {};
    },
  };
}
function result(step) {
  try {
    const value = step();
    if (value == null || typeof value.next === "function") {
      return "created";
    }
    return value.done + ":" + JSON.stringify(value.value);
  } catch (error) {
    // A TypeError message is implementation text, so only its type counts.
    return error instanceof TypeError
      ? "TypeError"
      : error.constructor.name + ":" + error.message;
  }
}
function report(label, step) {
  const text = result(step);
  console.log(label, text, flush());
}
const symbol = Symbol("sym");
const target = {
  b: logged("b", 2),
  hidden: logged("hidden", 1),
  1: logged("one", 2),
  skip: undefined,
  [symbol]: logged("sym", 2),
};
Object.defineProperty(target, "hidden", { enumerable: false });
const traps = new Proxy(target, {
  ownKeys(object) {
    log.push("ownKeys");
    return [...Reflect.ownKeys(object), "missing"];
  },
  getOwnPropertyDescriptor(object, key) {
    log.push("gopd:" + String(key));
    return Reflect.getOwnPropertyDescriptor(object, key);
  },
  get(object, key, receiver) {
    log.push("get:" + String(key));
    return Reflect.get(object, key, receiver);
  },
});
const proxied = Iterator.zipKeyed(traps);
console.log("proxy setup", flush());
const proxyRow = proxied.next().value;
console.log(
  "proxy row",
  Reflect.ownKeys(proxyRow).map(String).join(","),
  Reflect.ownKeys(proxyRow).map((key) => proxyRow[key]).join(","),
  flush(),
);
const deleting = {
  get a() {
    delete this.b;
    return [1];
  },
  b: [2],
  c: [3],
};
console.log(
  "deleted",
  JSON.stringify(Iterator.zipKeyed(deleting).next().value),
);
const inherited = Object.create({ inherited: [1] });
inherited.own = [2];
console.log(
  "inherited",
  JSON.stringify(Iterator.zipKeyed(inherited).next().value),
);
const array = Iterator.zipKeyed([[1, 2], ["a", "b"]]);
console.log("array keys", JSON.stringify([...array]));
console.log(
  "get throws",
  result(() => Iterator.zipKeyed({
    a: logged("a", 1),
    b: logged("b", 1),
    get c() { throw new RangeError("get"); },
  })),
  flush(),
);
console.log(
  "gopd throws",
  result(() => Iterator.zipKeyed(new Proxy({ a: logged("a", 1), b: [1] }, {
    getOwnPropertyDescriptor(object, key) {
      if (key === "b") throw new SyntaxError("gopd");
      return Reflect.getOwnPropertyDescriptor(object, key);
    },
  }))),
  flush(),
);
console.log(
  "ownKeys throws",
  result(() => Iterator.zipKeyed(new Proxy({}, {
    ownKeys() { throw new URIError("keys"); },
  }))),
  flush(),
);
console.log(
  "item rejected",
  result(() => Iterator.zipKeyed({
    a: logged("a", 1),
    b: logged("b", 1),
    c: 3,
  })),
  flush(),
);
const paddingLog = [];
const padding = new Proxy({ a: "pa", c: "pc" }, {
  get(object, key, receiver) {
    paddingLog.push(String(key));
    return Reflect.get(object, key, receiver);
  },
});
const padded = Iterator.zipKeyed(
  { c: logged("c", 2), a: logged("a", 1), b: logged("b", 1) },
  { mode: "longest", padding },
);
console.log("padding reads", paddingLog.join(","), flush());
for (let step = 0; step < 3; step = step + 1) {
  report("padded", () => padded.next());
}
console.log(
  "padding get throws",
  result(() => Iterator.zipKeyed({ a: logged("a", 1), b: logged("b", 1) }, {
    mode: "longest",
    padding: { get b() { throw new RangeError("padding"); } },
  })),
  flush(),
);
const strict = Iterator.zipKeyed({ a: logged("a", 1), b: logged("b", 2) }, {
  mode: "strict",
});
strict.next();
flush();
report("keyed strict", () => strict.next());
const closed = Iterator.zipKeyed({
  a: logged("a", 3, { returnThrows: true }),
  b: logged("b", 3),
});
closed.next();
flush();
report("keyed return", () => closed.return());
const shortestKeyed = Iterator.zipKeyed({
  a: logged("a", 3), b: logged("b", 1), c: logged("c", 3),
});
shortestKeyed.next();
flush();
report("keyed shortest", () => shortestKeyed.next());
${guardTail}
`,
  },
];
