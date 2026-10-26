/** Independent source/reference cases for completion storage boundaries. */
interface CompletionStorageCase {
  readonly name: string;
  readonly source: string;
  readonly stdout: string;
}

/** Keep nested abrupt and suspended values intact under both policies. */
export const completionStorageCases: readonly CompletionStorageCase[] = [
  {
    name: "nested-abrupt-finally",
    source: `
const log = [];
function run(mode) {
  outer: {
    try {
      try {
        if (mode === 0) return { tag: "return" };
        if (mode === 1) throw { tag: "throw" };
        break outer;
      } finally {
        log.push("inner");
      }
    } catch (e) {
      log.push(e.tag);
      return { tag: "caught" };
    } finally {
      log.push("outer");
    }
  }
  return { tag: "jump" };
}
console.log(run(0).tag, run(1).tag, run(2).tag, log.join("|"));
`,
    stdout: [
      "return caught jump inner|outer|inner|throw|outer|inner|out",
      "er\n",
    ].join(""),
  },
  {
    name: "iterator-close-priority",
    source: `
const log = [];
function source() {
  return {
    [Symbol.iterator]: function () {
      return this;
    },
    next: function () {
      return { done: false, value: { tag: "value" } };
    },
    return: function () {
      log.push("close");
      throw { tag: "close-error" };
    },
  };
}
function run(mode) {
  try {
    for (const x of source()) {
      try {
        if (mode === 0) return x;
        throw { tag: "body-error" };
      } finally {
        log.push("finally");
      }
    }
  } catch (e) {
    return e;
  }
}
console.log(run(0).tag, run(1).tag, log.join("|"));
`,
    stdout: "close-error body-error finally|close|finally|close\n",
  },
  {
    name: "destructure-generator-close",
    source: `
const log = [];
function* inner() {
  try {
    yield { tag: "kept" };
    yield 2;
  } finally {
    log.push("close");
  }
}
const [value] = inner();
console.log(value.tag, log.join("|"));
`,
    stdout: "kept close\n",
  },
  {
    name: "suspended-finally-return-throw",
    source: `
const log = [];
function* g() {
  try {
    try {
      yield "body";
    } finally {
      log.push("inner");
      yield "cleanup";
    }
  } catch (e) {
    log.push(e.tag);
    return "caught";
  } finally {
    log.push("outer");
  }
}
const a = g();
console.log(
  a.next().value,
  a.return({ tag: "saved" }).value,
  a.next().value.tag,
);
const b = g();
console.log(
  b.next().value,
  b.throw({ tag: "thrown" }).value,
  b.next().value,
  log.join("|"),
);
`,
    stdout: [
      "body cleanup saved\nbody cleanup caught inner|outer|inner|t",
      "hrown|outer\n",
    ].join(""),
  },
  {
    name: "async-close-and-finally",
    source: `
const log = [];
const source = {
  [Symbol.asyncIterator]: function () {
    return this;
  },
  next: async function () {
    return { done: false, value: 7 };
  },
  return: async function () {
    log.push("close");
    return { done: true };
  },
};
async function run() {
  try {
    for await (const value of source) {
      return value;
    }
  } finally {
    log.push("finally");
  }
}
run().then(function (value) {
  console.log(value, log.join("|"));
});
`,
    stdout: "7 close|finally\n",
  },
  {
    name: "async-generator-suspension",
    source: `
const log = [];
async function* g() {
  try {
    yield await 1;
  } finally {
    log.push("finally");
    yield await 2;
  }
}
async function run() {
  const a = g();
  const x = await a.next();
  const y = await a.return({ tag: "saved" });
  const z = await a.next();
  console.log(x.value, y.value, z.value.tag, z.done, log.join("|"));
}
run();
`,
    stdout: "1 2 saved true finally\n",
  },
  {
    name: "tail-call-finally-boundaries",
    source: `
"use strict";
function leaf(value) {
  return value;
}
function tail(value) {
  return leaf(value);
}
function blocked(value) {
  try {
    return leaf(value);
  } finally {
    console.log("finally");
  }
}
function caught(value) {
  try {
    throw value;
  } catch (error) {
    return tail(error);
  }
}
console.log(tail(3), blocked(4), caught(5));
`,
    stdout: "finally\n3 4 5\n",
  },
  {
    name: "finally-overrides-deferred-target",
    source: `
function run() {
  label: {
    try {
      break label;
    } finally {
      try {
        throw { tag: "kept" };
      } catch (e) {
        return e;
      }
    }
  }
  return { tag: "lost" };
}
console.log(run().tag);
`,
    stdout: "kept\n",
  },
  {
    name: "derived-constructor-finally",
    source: `
class Base {}
function value() {
  return { tag: "object" };
}
class Derived extends Base {
  constructor() {
    try {
      return value();
    } finally {
      console.log("finally");
    }
  }
}
console.log(new Derived().tag);
`,
    stdout: "finally\nobject\n",
  },
  {
    name: "generator-default-prologue",
    source: `
const log = [];
function* g(x = (log.push("default"), 1)) {
  label: {
    try {
      if (x) break label;
      yield "body";
    } finally {
      log.push("finally");
    }
  }
  try {
    return yield x;
  } finally {
    log.push("return");
  }
}
const a = g();
console.log(a.next().value, a.next("kept").value, log.join("|"));
`,
    stdout: "1 kept default|finally|return\n",
  },
  {
    name: "generator-delegate-close",
    source: `
const log = [];
function* inner() {
  try {
    yield 1;
  } finally {
    log.push("inner");
  }
}
function* outer() {
  try {
    return yield* inner();
  } finally {
    log.push("outer");
  }
}
const a = outer();
console.log(
  a.next().value,
  a.return({ tag: "saved" }).value.tag,
  log.join("|"),
);
`,
    stdout: "1 saved inner|outer\n",
  },
  {
    name: "nested-continue-cleanup",
    source: `
const log = [];
function run() {
  outer: for (let i = 0; i < 2; i++) {
    try {
      for (const x of [1, 2]) {
        try {
          continue outer;
        } finally {
          log.push("inner" + i);
        }
      }
    } finally {
      log.push("outer" + i);
    }
  }
  return log.join("|");
}
console.log(run());
`,
    stdout: "inner0|outer0|inner1|outer1\n",
  },
];
