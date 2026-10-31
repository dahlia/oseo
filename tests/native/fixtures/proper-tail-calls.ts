import type { Fixture } from "../fixture.ts";

/*
 * Proper tail calls in every tail position and call form ECMA-262 15.10
 * defines. Node.js and Deno have no proper tail calls, so the chains stay
 * at 1,500 steps, which their stacks hold while Oseo's 256-call limit
 * would reject every chain that still nested its frames. The 100,000-step
 * chains of the test262 cases live in tests/proper-tail-calls.test.ts.
 */
export const properTailCallFixtures: readonly Fixture[] = [
  {
    name: "global-eval-tail-calls",
    globalScriptReference: true,
    nonStrictScript: true,
    source: `
const intrinsic = eval;
const marker = { value: "alive" };
function step(n, value) {
  "use strict";
  if (n === 0) return [this === undefined, value];
  return eval(n - 1, value);
}
eval = step;
const result = step(1500, marker);
console.log("tail", result[0], result[1] === marker, result[1].value);
function tail(value) { "use strict"; return eval(value); }
eval = function (value) { "use strict"; return [this === undefined, value]; };
const text = "throw new Error('not source')";
const ordinary = tail(text);
console.log("ordinary", ordinary[0], ordinary[1] === text);
eval = 0;
try { tail(marker); }
catch (error) { console.log("noncallable", error.name); }
eval = intrinsic;
`,
  },
  {
    name: "proper-tail-calls",
    source: `"use strict";
const depth = 1500;

function countBlock(n) {
  if (n === 0) return "block";
  { return countBlock(n - 1); }
}
function countWhile(n) {
  while (true) { if (n === 0) return "while"; return countWhile(n - 1); }
}
function countDo(n) {
  do { if (n === 0) return "do"; return countDo(n - 1); } while (false);
}
function countFor(n) {
  for (let i = 0; i < 1; i++) {
    if (n === 0) return "for";
    return countFor(n - 1);
  }
}
function countForIn(n) {
  for (const key in { k: 1 }) {
    if (n === 0) return "for-in " + key;
    return countForIn(n - 1);
  }
}
function countLabel(n) {
  label: { if (n === 0) return "label"; return countLabel(n - 1); }
}
function countSwitch(n) {
  switch (n % 2) {
    case 0: if (n === 0) return "switch"; return countSwitch(n - 1);
    default: return countSwitch(n - 1);
  }
}
function countCatch(n) {
  try { throw n; } catch (value) {
    if (value === 0) return "catch";
    return countCatch(value - 1);
  }
}
function countFinally(n) {
  try { n += 0; } finally {
    if (n === 0) return "finally";
    return countFinally(n - 1);
  }
}
function countConditional(n) {
  return n === 0 ? "conditional" : countConditional(n - 1);
}
function countAnd(n) { return n === 0 ? "and" : n > 0 && countAnd(n - 1); }
function countOr(n) { return n === 0 ? "or" : n < 0 || countOr(n - 1); }
function countCoalesce(n) {
  return n === 0 ? "coalesce" : null ?? countCoalesce(n - 1);
}
function countComma(n) { return n === 0 ? "comma" : (n, countComma(n - 1)); }
for (const count of [
  countBlock, countWhile, countDo, countFor, countForIn, countLabel,
  countSwitch, countCatch, countFinally, countConditional, countAnd,
  countOr, countCoalesce, countComma,
]) {
  console.log("position", count(depth));
}

const box = {
  count(n) { return n === 0 ? "method" : this.count(n - 1); },
};
const computed = {
  c(n) { return n === 0 ? "computed" : this["c"](n - 1); },
};
function tag(strings, n) {
  return n === 0 ? "tagged " + strings[0] : tag\`member\${n - 1}\`;
}
function getTag() { return callTag; }
function callTag(strings, n) {
  return n === 0 ? "tagged " + strings[0] : getTag()\`call\${n - 1}\`;
}
const holder = {
  count(n) { return n === 0 ? "optional member" : holder?.count(n - 1); },
};
function optionalCall(n) {
  return n === 0 ? "optional call" : optionalCall?.(n - 1);
}
function viaCall(n) { return n === 0 ? "call" : viaCall.call(null, n - 1); }
function viaApply(n) {
  return n === 0 ? "apply" : viaApply.apply(null, [n - 1]);
}
function viaReflect(n) {
  return n === 0 ? "reflect" : Reflect.apply(viaReflect, null, [n - 1]);
}
function viaBound(n) { return n === 0 ? "bound" : bound(n - 1); }
const bound = viaBound.bind(null);
function viaProxy(n) { return n === 0 ? "proxy" : proxy(n - 1); }
const proxy = new Proxy(viaProxy, {});
function viaTrap(n) { return n === 0 ? "trap" : trapped(n - 1); }
const trapped = new Proxy(function () {}, {
  apply(target, thisArgument, values) { return viaTrap(...values); },
});
console.log("form", box.count(depth), computed.c(depth));
console.log("form", tag\`start\${depth}\`, callTag\`start\${depth}\`);
console.log("form", holder.count(depth), optionalCall(depth));
console.log("form", viaCall(depth), viaApply(depth), viaReflect(depth));
console.log("form", viaBound(depth), viaProxy(depth), viaTrap(depth));

function isEven(n) { return n === 0 ? true : isOdd(n - 1); }
const isOdd = (n) => n === 0 ? false : parity.step(n - 1);
const parity = { step(n) { return isEven(n); } };
class Walker {
  static walk(n) { return n === 0 ? "static" : Walker.walk(n - 1); }
  walk(n) { return n === 0 ? "instance" : this.walk(n - 1); }
  #hidden(n) { return n === 0 ? "private" : this.#hidden(n - 1); }
  hidden(n) { return this.#hidden(n); }
}
class Base { m(n) { return n === 0 ? "base" : this.m(n - 1); } }
class Derived extends Base {
  m(n) { return n === 0 ? "super method" : super.m(n); }
}
const lexical = {
  name: "lexical this",
  run(n) {
    const step = (k) => k === 0 ? this.name : step(k - 1);
    return step(n);
  },
};
console.log("mutual", isEven(depth), isEven(depth + 1));
const walker = new Walker();
console.log(
  "class",
  Walker.walk(depth),
  walker.walk(depth),
  walker.hidden(depth),
  new Derived().m(depth),
  lexical.run(depth),
);

function makeObject(n) {
  return n === 0 ? { made: "object" } : makeObject(n - 1);
}
function returnsUndefined(n) {
  return n === 0 ? undefined : returnsUndefined(n - 1);
}
function ObjectResult(n) { this.made = "receiver"; return makeObject(n); }
function PrimitiveResult(n) {
  this.made = "receiver";
  return countConditional(n);
}
class Child extends Base {
  constructor(n, mode) {
    super();
    this.made = "this";
    if (mode === "object") return makeObject(n);
    if (mode === "undefined") return returnsUndefined(n);
    return countConditional(n);
  }
}
function initializeLater(initialize, n) {
  if (n === 0) { initialize(); return undefined; }
  return initializeLater(initialize, n - 1);
}
class Late extends Base {
  constructor(n) {
    const initialize = () => super();
    return initializeLater(initialize, n);
  }
}
class Unbound extends Base {
  constructor(n) { return returnsUndefined(n); }
}
function attempt(construct) {
  try {
    const constructed = construct();
    return constructed.made ?? constructed.constructor.name;
  } catch (error) {
    return error.constructor.name;
  }
}
console.log(
  "construct",
  new ObjectResult(depth).made,
  new PrimitiveResult(depth).made,
  new Child(depth, "object").made,
  new Child(depth, "undefined").made,
  attempt(() => new Child(depth, "primitive")),
  attempt(() => new Late(depth)),
  attempt(() => new Unbound(depth)),
);

async function asyncTarget(value) { return value; }
function toAsync(n) {
  return n === 0 ? asyncTarget("async callee") : toAsync(n - 1);
}
function* generatorTarget() { yield "generator callee"; }
function toGenerator(n) {
  return n === 0 ? generatorTarget() : toGenerator(n - 1);
}
toAsync(depth).then((value) => console.log("callee", value));
console.log("callee", toGenerator(depth).next().value);

function throwAt(n) {
  if (n === 0) throw new RangeError("bottom");
  return throwAt(n - 1);
}
function notCallable(n) {
  const value = n === 0 ? 1 : notCallable;
  return value(n - 1);
}
const revocable = Proxy.revocable(function () {}, {});
revocable.revoke();
function revoked(n) { return n === 0 ? revocable.proxy() : revoked(n - 1); }
for (const failing of [throwAt, notCallable, revoked]) {
  try {
    failing(depth);
    console.log("abrupt", "none");
  } catch (error) {
    console.log("abrupt", error.constructor.name);
  }
}

function collect(n, closures) {
  if (n === 0) return closures;
  const captured = n;
  closures.push(() => captured);
  return collect(n - 1, closures);
}
const closures = collect(depth, []);
console.log("closures", closures.reduce((sum, read) => sum + read(), 0));
function grow(n, ...values) {
  if (n === 0) {
    return values.length + " " + values.reduce((sum, value) => sum + value, 0);
  }
  return grow(n - 1, ...values, n);
}
console.log("arguments", grow(300));

function logTail(n) {
  return n === 0 ? console.log("host", "log tail") : logTail(n - 1);
}
logTail(depth);
const delay = {
  valueOf() { return countConditional(depth) === "conditional" ? 0 : 1; },
};
function timerTail(n) {
  if (n === 0) {
    return setTimeout(() => console.log("host", "timer tail"), delay);
  }
  return timerTail(n - 1);
}
timerTail(depth);
// A finally whose own statements always leave abruptly has no completion
// to resume, so its try statement's after block and break or continue
// targets are never entered.
let finallySteps = 0;
const finallyHop0 = (n) => {
  finallySteps += 1;
  try { finallySteps += 0; } finally {
    try { throw 0; } catch (error0) {
      if (n === 0) { return "done 0"; }
      return (() => {
        try { throw 0; } catch (error) {
          return finallyHop1.apply(null, [n - 1]);
        } finally { finallySteps += 0; }
      })();
    }
  }
};
const finallyHop1 = (n) => {
  finallySteps += 1;
  if (n === 0) { return "done 1"; }
  return (() => {
    try { throw 0; } catch (error) {
      return finallyHop0.apply(null, [n - 1]);
    } finally { finallySteps += 0; }
  })();
};
console.log("finally chain", finallyHop0(0), finallyHop0(5), finallySteps);
function finallyCatch() {
  try { } finally { try { throw 0; } catch (error) { return "catch"; } }
}
function finallyBreak() {
  label: { try { break label; } finally { return "break"; } }
  return "after break";
}
function finallyContinue() {
  for (let i = 0; i < 3; i++) {
    try { continue; } finally { return "continue " + i; }
  }
  return "after loop";
}
function finallyNested() {
  label: {
    try { break label; } finally {
      try { throw 0; } catch (error) { return "nested"; }
    }
  }
  return "after nested";
}
function finallyThrow() {
  try {
    label: { try { break label; } finally { throw new RangeError("thrown"); } }
    return "after throw";
  } catch (error) {
    return error.message;
  }
}
for (const run of [
  finallyCatch, finallyBreak, finallyContinue, finallyNested, finallyThrow,
]) {
  console.log("finally", run.name, run());
}
const finallyLog = [];
function finallyResumes(n) {
  label: {
    try { if (n) break label; return "return"; } finally { finallyLog.push(n); }
  }
  return "break";
}
console.log("resume", finallyResumes(0), finallyResumes(1), finallyLog.join());
function* finallyYields() {
  try { yield 1; } finally { finallyLog.push("yield"); }
  yield 2;
}
console.log("resume generator", [...finallyYields()].join(), finallyLog.join());
function* finallyReturns() {
  try { yield 1; } finally { try { throw 0; } catch (error) { return 3; } }
}
const finallyIterator = finallyReturns();
console.log(
  "generator finally",
  JSON.stringify(finallyIterator.next()),
  JSON.stringify(finallyIterator.next()),
);
// A default parameter runs in a call-time prologue before the generator or
// async body; a return through a finally inside that body must not reach
// the prologue again.
const defaultLog = [];
function* defaultYields(n = 1) {
  label: {
    try { if (n) break label; yield "body"; } finally { defaultLog.push(n); }
  }
  try { return yield n; } finally { defaultLog.push("returned"); }
}
const defaultIterator = defaultYields();
console.log(
  "default generator",
  JSON.stringify(defaultIterator.next()),
  JSON.stringify(defaultIterator.next("resumed")),
  [...defaultYields(0)].join(),
  defaultLog.join(),
);
async function defaultAsync(a = 2) {
  try { return a; } finally { defaultLog.push("async"); }
}
async function* defaultAsyncYields(a = 3) {
  try { yield a; } finally { defaultLog.push("async generator"); }
}
defaultAsync().then((value) => console.log("default async", value));
defaultAsyncYields().next().then((step) => {
  console.log("default async generator", JSON.stringify(step));
});
`,
  },
  {
    // A tail call keeps the realm that made it: a revoked Proxy reached
    // through another realm's Function.prototype.call, apply, or
    // Reflect.apply throws that realm's TypeError, as tco-fn-realm.js
    // asserts, while one called from this realm throws this realm's.
    name: "cross-realm-tail-calls",
    test262Host: true,
    source: `"use strict";
const other = $262.createRealm().global;
const revocable = Proxy.revocable(function () {}, {});
revocable.revoke();
const foreign = other.Proxy.revocable(function () {}, {});
foreign.revoke();
function viaCall() {
  return other.Function.prototype.call.call(revocable.proxy);
}
function viaApply() {
  return other.Function.prototype.apply.call(revocable.proxy, null, []);
}
function viaReflect() { return other.Reflect.apply(revocable.proxy, null, []); }
function direct() { return revocable.proxy(); }
function foreignProxy() { return foreign.proxy(); }
function notCallable() { return other.Function.prototype.call.call(1); }
function chain(n, last) { return n === 0 ? last() : chain(n - 1, last); }
for (const attempt of [
  viaCall, viaApply, viaReflect, direct, foreignProxy, notCallable,
]) {
  try {
    chain(1500, attempt);
    console.log(attempt.name, "none");
  } catch (error) {
    console.log(
      attempt.name,
      error instanceof other.TypeError,
      error instanceof TypeError,
    );
  }
}
`,
  },
];
