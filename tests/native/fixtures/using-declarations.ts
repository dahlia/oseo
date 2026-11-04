import type { Es2026Fixture } from "../es2026-fixture.ts";

/** A fixture whose syntax the pinned Deno does not parse. */
export interface UsingFixture extends Es2026Fixture {
  /**
   * Compare with Node.js alone. The pinned Deno rejects `using` in a
   * classic for statement head with a syntax error.
   */
  readonly nodeOnly?: true;
}

/*
 * `using` and `await using` declarations: block, function, loop-head,
 * switch-clause block, static-block, generator, and asynchronous scopes,
 * every transfer that leaves or stays in a scope, the SuppressedError
 * chain, and the Await steps of asynchronous disposal. Both pinned
 * reference hosts implement the syntax, so every fixture compares with
 * Node.js and Deno.
 */
export const usingDeclarationFixtures: readonly UsingFixture[] = [
  {
    guardHits: true,
    name: "using-declarations-scopes",
    source: `
class Probe {
  constructor() { this.label = "probe"; }
  [Symbol.dispose]() { console.log("probe disposed"); }
}
const log = [];
function res(name, fail) {
  return {
    [Symbol.dispose]() {
      log.push("dispose " + name);
      if (fail) throw new Error(name);
    },
  };
}
{
  using a = res("a"), b = res("b");
  using c = null;
  log.push("body");
}
console.log(log.join(","));
log.length = 0;
function f() {
  using x = res("x");
  return "ret";
}
console.log(f(), log.join(","));
log.length = 0;
try {
  using p = res("p", true);
  using q = res("q", true);
  throw new Error("body");
} catch (e) {
  console.log(
    e.constructor.name,
    e.error.message,
    e.suppressed.constructor.name,
    e.suppressed.error.message,
    e.suppressed.suppressed.message,
    log.join(","),
  );
}
log.length = 0;
for (using r of [res("r1"), res("r2")]) {
  log.push("iter");
  if (log.length > 2) continue;
}
console.log(log.join(","));
log.length = 0;
outer: for (let i = 0; i < 3; i++) {
  using s = res("s" + i);
  if (i === 1) break outer;
}
console.log(log.join(","));
try { using bad = 1; } catch (e) { console.log("bad", e.constructor.name); }
try { using bad2 = {}; } catch (e) { console.log("bad2", e.constructor.name); }
log.length = 0;
async function g() {
  {
    await using a = { async [Symbol.asyncDispose]() { log.push("async a"); } };
    await using b = res("sync-b");
    await using n = null;
    log.push("abody");
  }
  log.push("after");
  return 1;
}
g().then((v) => console.log("g", v, log.join(",")));
async function h() {
  await using z = {
    [Symbol.asyncDispose]() {
      return Promise.reject(new Error("rej"));
    },
  };
  throw new Error("thrown");
}
h().catch((e) => {
  console.log("h", e.constructor.name, e.error.message, e.suppressed.message);
});

let turn = 0;
while (turn < 2) {
  {
    using probe = new Probe();
    console.log("guard", probe.label, turn);
  }
  if (turn === 0) Probe.prototype.marker = turn;
  turn = turn + 1;
}
`,
  },
  {
    guardHits: true,
    name: "using-declarations-transfers",
    source: `
class Probe {
  constructor() { this.label = "probe"; }
  [Symbol.dispose]() { console.log("probe disposed"); }
}
const log = [];
function res(name, fail) {
  return {
    [Symbol.dispose]() {
      log.push("d:" + name);
      if (fail) throw new Error(name);
    },
  };
}
function* gen() {
  using a = res("ga");
  try {
    using b = res("gb");
    yield 1;
    yield 2;
  } finally {
    log.push("gfinally");
  }
}
const it = gen();
it.next();
console.log(JSON.stringify(it.return(9)), log.join(","));
log.length = 0;
async function* agen() {
  await using a = { async [Symbol.asyncDispose]() { log.push("agen-a"); } };
  yield 1;
  yield 2;
}
(async () => {
  for await (const v of agen()) { log.push("v" + v); break; }
  console.log("agen", log.join(","));
  log.length = 0;
  label: {
    using x = res("x");
    {
      using y = res("y");
      break label;
    }
  }
  console.log("label", log.join(","));
  log.length = 0;
  let get;
  {
    using z = res("z");
    get = () => z;
  }
  console.log("closure", typeof get()[Symbol.dispose], log.join(","));
  log.length = 0;
  const awaited = { async [Symbol.asyncDispose]() { log.push("w"); } };
  for (await using w of [awaited, null]) log.push("loop");
  for await (using v of [res("v1")]) log.push("loop2");
  console.log("forawait", log.join(","));
  log.length = 0;
  try {
    for (using q of [res("q1", true), res("q2")]) { log.push("q-body"); }
  } catch (e) { log.push("caught " + e.message); }
  console.log("throwdispose", log.join(","));
  log.length = 0;
  function sw(k) {
    switch (k) {
      case 1: { using s = res("s1"); return "one"; }
      default: return "other";
    }
  }
  console.log(sw(1), log.join(","));
  log.length = 0;
  try {
    using e1 = res("e1", true);
    using e2 = { get [Symbol.dispose]() { log.push("getter"); return 5; } };
  } catch (e) {
    console.log("getter-throws", e.constructor.name, log.join(","));
  }
  log.length = 0;
  class C { static { using s = res("static"); log.push("in static"); } }
  console.log("static", log.join(","));
  let order = [];
  async function ticks() {
    order.push("start");
    { await using n = null; order.push("inner"); }
    order.push("after");
  }
  const p = ticks(); order.push("sync-after-call");
  await p;
  console.log("ticks", order.join(","));
  order = [];
  async function noTicks(skip) {
    outer: { if (skip) break outer; await using n = null; }
    order.push("after");
  }
  const p2 = noTicks(true); order.push("sync-after-call");
  await p2;
  console.log("noticks", order.join(","));


  let turn = 0;
  while (turn < 2) {
    {
      using probe = new Probe();
      console.log("guard", probe.label, turn);
    }
    if (turn === 0) Probe.prototype.marker = turn;
    turn = turn + 1;
  }
  })();
`,
  },
  {
    guardHits: true,
    name: "using-declarations-for-head",
    nodeOnly: true,
    source: `
class Probe {
  constructor() { this.label = "probe"; }
  [Symbol.dispose]() { console.log("probe disposed"); }
}
const log = [];
function res(name, fail) {
  return {
    [Symbol.dispose]() {
      log.push("dispose " + name);
      if (fail) throw new Error(name);
    },
  };
}
for (using t = res("t"), u = res("u"); log.length < 2; ) log.push("loop");
console.log("normal", log.join(","));
log.length = 0;
outer: for (;;) {
  for (using v = res("v"); ; ) {
    log.push("inner");
    break outer;
  }
}
console.log("break", log.join(","));
log.length = 0;
try {
  for (using w = res("w", true), x = 1; ; ) log.push("unreached");
} catch (error) {
  console.log("add throws", error.constructor.name, log.join(","));
}
log.length = 0;
function early() {
  for (using y = res("y"); ; ) return "returned";
}
console.log("return", early(), log.join(","));
let turn = 0;
while (turn < 2) {
  for (using probe = new Probe(); ; ) {
    console.log("guard", probe.label, turn);
    break;
  }
  if (turn === 0) Probe.prototype.marker = turn;
  turn = turn + 1;
}
`,
  },
];
