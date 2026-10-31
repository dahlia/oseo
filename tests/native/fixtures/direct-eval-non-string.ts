import type { Fixture } from "../fixture.ts";

export const directEvalNonStringFixture: Fixture = {
  name: "direct-eval-non-string",
  source: `
const intrinsic = eval;
let touched = 0;
const object = {
  get toString() { touched = touched + 1; throw new Error("coercion"); },
  get valueOf() { touched = touched + 1; throw new Error("coercion"); },
  get [Symbol.toPrimitive]() {
    touched = touched + 1;
    throw new Error("coercion");
  },
};
const revoked = Proxy.revocable({}, {});
revoked.revoke();
const values = [
  undefined, null, true, false, 0, -0, NaN, Infinity, -Infinity,
  12n, Symbol("identity"), object, [], function () {},
  new String("boxed source"), new Number(3), revoked.proxy,
];
function sloppy(value) { return eval(value); }
function strict(value) { "use strict"; return eval(value); }
for (const value of values) {
  console.log("identity", Object.is(sloppy(value), value),
    Object.is(strict(value), value), Object.is((eval)(value), value),
    Object.is(eval(...[value]), value));
}
console.log("empty", eval() === undefined, eval(...[]) === undefined);
console.log("coercion", touched);
const log = [];
function argument(label, value) { log.push(label); return value; }
console.log("extras", eval(argument("first", object),
  argument("extra", "not source")) === object, log.join());
log.length = 0;
const iterable = {
  [Symbol.iterator]() {
    log.push("iterator");
    let index = 0;
    return { next() {
      index = index + 1;
      log.push(index);
      return index === 1 ? { value: object, done: false }
        : index === 2 ? { value: "ignored source", done: false }
        : { done: true };
    } };
  },
};
console.log("spread", eval(...iterable) === object, log.join());
const sentinel = {};
try { eval(object, (() => { throw sentinel; })()); }
catch (error) { console.log("abrupt", error === sentinel); }
try { eval("console.log(99)", (() => { throw sentinel; })()); }
catch (error) { console.log("before-source", error === sentinel); }
console.log("capture", eval((globalThis.eval = () => "replacement", object))
  === object);
console.log("replacement", eval("arbitrary String"));
globalThis.eval = intrinsic;
/** @param {number} value */
function hinted(value) {
  if (!Object.is(eval(value), value)) throw new Error("identity");
  return value + 1;
}
console.log("hints", hinted(2), hinted(new String("box")));
globalThis.eval = 4;
let argumentsRun = 0;
try { eval((argumentsRun = argumentsRun + 1)); }
catch (error) { console.log("noncallable", error.name, argumentsRun); }
globalThis.eval = intrinsic;
console.log("delete", delete globalThis.eval);
try { eval((argumentsRun = argumentsRun + 1)); }
catch (error) { console.log("missing", error.name, argumentsRun); }
globalThis.eval = intrinsic;
console.log("survivor", eval(object) === object, touched);
`,
};
