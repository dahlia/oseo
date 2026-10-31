import type { Fixture } from "../fixture.ts";

// Fixed, source-free counterparts of DS-15's pinned assertions.
// Each source runs in a fresh global Script. Ordinary eval/Function are
// replaced only as input construction; no dynamic source is emulated.
const check = `
function check(condition) {
  if (!condition) throw new Error("DS-15 assertion");
}
`;

export const staticCore: readonly Fixture[] = [
  {
    name: "ds15-aggregate-newtarget",
    globalScriptReference: true,
    source:
      check +
      `
function NewTarget() {}
for (const value of [undefined, null, 42, false, true, Symbol(),
  "string", AggregateError.prototype]) {
  const proxy = new Proxy(NewTarget, {
    get(target, key) {
      if (key === "prototype") return value;
      return target[key];
    },
  });
  const error = Reflect.construct(AggregateError, [[]], proxy);
  check(Object.getPrototypeOf(error) === AggregateError.prototype);
}
console.log("ok");
`,
  },
  {
    name: "ds15-object-entries",
    globalScriptReference: true,
    source:
      check +
      `
function fakeObject() { throw new Error("called fake Object"); }
fakeObject.entries = Object.entries;
const original = Object;
globalThis.Object = fakeObject;
check(Object === fakeObject);
check(Object.entries(1).length === 0);
globalThis.Object = original;
console.log("ok");
`,
  },
  {
    name: "ds15-object-values",
    globalScriptReference: true,
    source:
      check +
      `
function fakeObject() { throw new Error("called fake Object"); }
fakeObject.values = Object.values;
const original = Object;
globalThis.Object = fakeObject;
check(Object === fakeObject);
check(Object.values(1).length === 0);
globalThis.Object = original;
console.log("ok");
`,
  },
  {
    name: "ds15-string-charAt",
    globalScriptReference: true,
    source:
      check +
      `
function Factory() { this.toString = function () { return "wizard"; }; }
Factory.prototype.charAt = String.prototype.charAt;
const instance = new Factory();
check(instance.charAt(1, true, null, {}) === "i");
console.log("ok");
`,
  },
  {
    name: "ds15-string-charCodeAt",
    globalScriptReference: true,
    source:
      check +
      `
function Factory() { this.toString = function () { return "wizard"; }; }
Factory.prototype.charCodeAt = String.prototype.charCodeAt;
const instance = new Factory();
check(instance.charCodeAt(1, true, null, {}) === 0x69);
console.log("ok");
`,
  },
  {
    name: "ds15-string-indexOf",
    globalScriptReference: true,
    source:
      check +
      `
check("$$abcdabcd".indexOf("ab", "-99") === 2);
console.log("ok");
`,
  },
  {
    name: "ds15-string-match",
    globalScriptReference: true,
    source:
      check +
      `
const original = globalThis.toString;
globalThis.toString = Object.prototype.toString;
check(globalThis.toString === Object.prototype.toString);
const match = String.prototype.match.bind(globalThis);
check(match("bj")[0] === "bj");
globalThis.toString = original;
console.log("ok");
`,
  },
  {
    name: "ds15-string-replace-empty",
    globalScriptReference: true,
    source:
      check +
      `
check((function () { return "gnulluna"; })().replace(null,
  function () {}) === "gundefineduna");
console.log("ok");
`,
  },
  {
    name: "ds15-string-replace-offset",
    globalScriptReference: true,
    source:
      check +
      `
check(new String("undefined").replace(x,
  function () { return arguments[1] + 42; }) === "42");
var x;
console.log("ok");
`,
  },
  {
    name: "ds15-string-slice",
    globalScriptReference: true,
    source:
      check +
      `
function subject() {}
subject.valueOf = function () { return "gnulluna"; };
subject.toString = function () { return subject; };
Function.prototype.slice = String.prototype.slice;
check(subject.slice(null, (function () {}).slice(subject, 5).length)
  === "gnull");
delete Function.prototype.slice;
console.log("ok");
`,
  },
  {
    name: "ds15-string-split-global",
    globalScriptReference: true,
    source:
      check +
      `
const original = globalThis.toString;
globalThis.toString = Object.prototype.toString;
check(globalThis.toString === Object.prototype.toString);
const limit = { valueOf() { return 5; } };
const split = String.prototype.split.bind(globalThis);
const result = split("[", limit);
check(typeof result === "object");
check(result.constructor === Array);
check(result.length === 2);
check(result[1].substring(0, 6) === "object");
globalThis.toString = original;
console.log("ok");
`,
  },
  {
    name: "ds15-string-split-number",
    globalScriptReference: true,
    source:
      check +
      `
const separator = new RegExp("00");
Number.prototype.split = String.prototype.split;
const result = (6776767677.006771122677555).split(separator, "1");
check(typeof result === "object");
check(result.constructor === Array);
check(result.length === 1);
check(result[0] === "6776767677.");
delete Number.prototype.split;
console.log("ok");
`,
  },
  {
    name: "ds15-string-substring",
    globalScriptReference: true,
    source:
      check +
      `
function subject() {}
subject.valueOf = function () { return "gnulluna"; };
Function.prototype.substring = String.prototype.substring;
check(subject.substring(null, function () {}) === "");
delete Function.prototype.substring;
console.log("ok");
`,
  },
  {
    name: "ds15-global-presence-1",
    globalScriptReference: true,
    source:
      check +
      `
check(NaN !== null);
check(Infinity !== null);
check(undefined !== null);
console.log("ok");
`,
  },
  {
    name: "ds15-global-enumeration-1",
    globalScriptReference: true,
    source:
      check +
      `
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "NaN"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "Infinity"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "undefined"));
for (const key in globalThis) {
  check(key !== "NaN");
  check(key !== "Infinity");
  check(key !== "undefined");
}
console.log("ok");
`,
  },
  {
    name: "ds15-global-presence-2",
    globalScriptReference: true,
    source:
      check +
      `
check(eval !== null);
check(parseInt !== null);
check(parseFloat !== null);
check(isNaN !== null);
check(isFinite !== null);
check(decodeURI !== null);
check(decodeURIComponent !== null);
check(encodeURI !== null);
check(encodeURIComponent !== null);
console.log("ok");
`,
  },
  {
    name: "ds15-global-enumeration-2",
    globalScriptReference: true,
    source:
      check +
      `
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "eval"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "parseInt"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "parseFloat"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "isNaN"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "isFinite"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "decodeURI"));
check(!Object.prototype.propertyIsEnumerable.call(
  globalThis, "decodeURIComponent"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "encodeURI"));
check(!Object.prototype.propertyIsEnumerable.call(
  globalThis, "encodeURIComponent"));
for (const key in globalThis) {
  check(key !== "eval");
  check(key !== "parseInt");
  check(key !== "parseFloat");
  check(key !== "isNaN");
  check(key !== "isFinite");
  check(key !== "decodeURI");
  check(key !== "decodeURIComponent");
  check(key !== "encodeURI");
  check(key !== "encodeURIComponent");
}
console.log("ok");
`,
  },
  {
    name: "ds15-global-presence-3",
    globalScriptReference: true,
    source:
      check +
      `
check(Object !== null);
check(Function !== null);
check(String !== null);
check(Number !== null);
check(Array !== null);
check(Boolean !== null);
check(Date !== null);
check(RegExp !== null);
check(Error !== null);
check(EvalError !== null);
check(RangeError !== null);
check(ReferenceError !== null);
check(SyntaxError !== null);
check(TypeError !== null);
check(URIError !== null);
console.log("ok");
`,
  },
  {
    name: "ds15-global-enumeration-3",
    globalScriptReference: true,
    source:
      check +
      `
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "Object"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "Function"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "String"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "Number"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "Array"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "Boolean"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "Date"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "RegExp"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "Error"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "EvalError"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "RangeError"));
check(!Object.prototype.propertyIsEnumerable.call(
  globalThis, "ReferenceError"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "SyntaxError"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "TypeError"));
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "URIError"));
for (const key in globalThis) {
  check(key !== "Object");
  check(key !== "Function");
  check(key !== "String");
  check(key !== "Number");
  check(key !== "Array");
  check(key !== "Boolean");
  check(key !== "Date");
  check(key !== "RegExp");
  check(key !== "Error");
  check(key !== "EvalError");
  check(key !== "RangeError");
  check(key !== "ReferenceError");
  check(key !== "SyntaxError");
  check(key !== "TypeError");
  check(key !== "URIError");
}
console.log("ok");
`,
  },
  {
    name: "ds15-global-presence-4",
    globalScriptReference: true,
    source:
      check +
      `
check(Math !== null);
console.log("ok");
`,
  },
  {
    name: "ds15-global-enumeration-4",
    globalScriptReference: true,
    source:
      check +
      `
check(!Object.prototype.propertyIsEnumerable.call(globalThis, "Math"));
for (const key in globalThis) {
  check(key !== "Math");
}
console.log("ok");
`,
  },
  {
    name: "ds15-delete-global-var",
    globalScriptReference: true,
    source:
      check +
      `
var x = 1;
check((delete x) === false);
check(x === 1);
check(globalThis.x === 1);
console.log("ok");
`,
  },
  {
    name: "ds15-object-truthiness",
    globalScriptReference: true,
    source:
      check +
      `
for (const value of [new Object(), new String(""), new String(),
  new Boolean(true), new Boolean(false), new Boolean(), new Array(),
  new Number(), new Number(-0), new Number(0), new Number(),
  new Number(Number.NaN), new Number(-1), new Number(1),
  new Number(Number.POSITIVE_INFINITY), new Number(Number.NEGATIVE_INFINITY),
  function () {}, new Date(), new Date(0)]) {
  check(!value === false);
}
console.log("ok");
`,
  },
  {
    name: "ds15-with-mutate-1",
    globalScriptReference: true,
    source:
      check +
      `
globalThis.p1 = 1;
var myObj = { p1: "a" };
with (myObj) { p1 = "b"; }
check(myObj.p1 === "b");
check(myObj.p1 !== 1);
check(globalThis.p1 === 1);
delete globalThis.p1;
console.log("ok");
`,
  },
  {
    name: "ds15-with-delete-1",
    globalScriptReference: true,
    source:
      check +
      `
globalThis.p1 = 1;
var myObj = { p1: "a", del: false };
with (myObj) { del = delete p1; }
check(myObj.p1 !== "a");
check(myObj.p1 === undefined);
check(myObj.del === true);
check(myObj.p1 !== 1);
check(globalThis.p1 === 1);
delete globalThis.p1;
console.log("ok");
`,
  },
  {
    name: "ds15-with-mutate-2",
    globalScriptReference: true,
    source:
      check +
      `
globalThis.p1 = "a";
var myObj = { p1: 1 };
with (myObj) { p1 = 2; }
check(myObj.p1 === 2);
check(myObj.p1 !== "a");
check(globalThis.p1 === "a");
delete globalThis.p1;
console.log("ok");
`,
  },
  {
    name: "ds15-with-delete-2",
    globalScriptReference: true,
    source:
      check +
      `
globalThis.p1 = "a";
var myObj = { p1: 1, del: false };
with (myObj) { del = delete p1; }
check(myObj.p1 !== 1);
check(myObj.p1 === undefined);
check(myObj.del === true);
check(myObj.p1 !== "a");
check(globalThis.p1 === "a");
delete globalThis.p1;
console.log("ok");
`,
  },
  {
    name: "ds15-with-mutate-3",
    globalScriptReference: true,
    source:
      check +
      `
globalThis.p1 = "a";
var myObj = { p1: true };
with (myObj) { p1 = false; }
check(myObj.p1 === false);
check(myObj.p1 !== "a");
check(globalThis.p1 === "a");
delete globalThis.p1;
console.log("ok");
`,
  },
  {
    name: "ds15-with-delete-3",
    globalScriptReference: true,
    source:
      check +
      `
globalThis.p1 = "a";
var myObj = { p1: true, del: false };
with (myObj) { del = delete p1; }
check(myObj.p1 !== true);
check(myObj.p1 === undefined);
check(myObj.del === true);
check(myObj.p1 !== "a");
check(globalThis.p1 === "a");
delete globalThis.p1;
console.log("ok");
`,
  },
  {
    name: "ds15-with-mutate-4",
    globalScriptReference: true,
    source:
      check +
      `
globalThis.p1 = "a";
var myObj = { p1: {a:"hello"} };
with (myObj) { p1 = {b:"hi"}; }
check(myObj.p1.a !== "hello");
check(myObj.p1.b === "hi");
check(myObj.p1 !== "a");
check(globalThis.p1 === "a");
delete globalThis.p1;
console.log("ok");
`,
  },
  {
    name: "ds15-with-delete-4",
    globalScriptReference: true,
    source:
      check +
      `
globalThis.p1 = "a";
var myObj = { p1: {a:"hello"}, del: false };
with (myObj) { del = delete p1; }
let caught = false;
try { myObj.p1.a; } catch (error) { caught = error instanceof TypeError; }
check(caught);
check(myObj.p1 === undefined);
check(myObj.del === true);
check(myObj.p1 !== "a");
check(globalThis.p1 === "a");
delete globalThis.p1;
console.log("ok");
`,
  },
  {
    name: "ds15-with-mutate-5",
    globalScriptReference: true,
    source:
      check +
      `
globalThis.p1 = "a";
var myObj = { p1: [1,2,3] };
with (myObj) { p1 = [3,2,1]; }
check(myObj.p1[2] === 1);
check(myObj.p1 !== "a");
check(globalThis.p1 === "a");
delete globalThis.p1;
console.log("ok");
`,
  },
  {
    name: "ds15-with-delete-5",
    globalScriptReference: true,
    source:
      check +
      `
globalThis.p1 = "a";
var myObj = { p1: [1,2,3], del: false };
with (myObj) { del = delete p1; }
let caught = false;
try { myObj.p1[2]; } catch (error) { caught = error instanceof TypeError; }
check(caught);
check(myObj.p1 === undefined);
check(myObj.del === true);
check(myObj.p1 !== "a");
check(globalThis.p1 === "a");
delete globalThis.p1;
console.log("ok");
`,
  },
  {
    name: "ds15-with-mutate-6",
    globalScriptReference: true,
    source:
      check +
      `
globalThis.p1 = "a";
var myObj = { p1: function(){return 0;} };
with (myObj) { p1 = function(){return 1;}; }
check(myObj.p1() === 1);
check(myObj.p1 !== "a");
check(globalThis.p1 === "a");
delete globalThis.p1;
console.log("ok");
`,
  },
  {
    name: "ds15-with-delete-6",
    globalScriptReference: true,
    source:
      check +
      `
globalThis.p1 = "a";
var myObj = { p1: function(){return 0;}, del: false };
with (myObj) { del = delete p1; }
let caught = false;
try { myObj.p1(); } catch (error) { caught = error instanceof TypeError; }
check(caught);
check(myObj.p1 === undefined);
check(myObj.del === true);
check(myObj.p1 !== "a");
check(globalThis.p1 === "a");
delete globalThis.p1;
console.log("ok");
`,
  },
  {
    name: "ds15-completion-do-once",
    globalScriptReference: true,
    test262Host: true,
    source:
      check +
      `
const result = $262.evalScript(
  "var entered; do entered = 1; while (false)");
check(result === 1);
check(globalThis.entered === 1);
console.log("ok");
`,
  },
  {
    name: "ds15-completion-do-break",
    globalScriptReference: true,
    test262Host: true,
    source:
      check +
      `
const result = $262.evalScript(
  "var before, after; do { before = 1; break; after = 2; } while (0)");
check(result === 1);
check(globalThis.before === 1);
check(typeof globalThis.after === "undefined");
console.log("ok");
`,
  },
  {
    name: "ds15-completion-do-postfix",
    globalScriptReference: true,
    test262Host: true,
    source:
      check +
      `
const result = $262.evalScript(
  "var condition = 0; do condition++; while (condition < 5)");
check(result === 4);
check(globalThis.condition === 5);
console.log("ok");
`,
  },
  {
    name: "ds15-completion-do-continue",
    globalScriptReference: true,
    test262Host: true,
    source:
      check +
      `
const result = $262.evalScript(
  "var condition = 0, odds = 0; do { condition++; " +
  "if ((('' + condition / 2).split('.')).length > 1) continue; " +
  "odds++; } while (condition < 10)");
check(result === 4);
check(globalThis.odds === 5);
console.log("ok");
`,
  },
  {
    name: "ds15-completion-expression-equality",
    globalScriptReference: true,
    test262Host: true,
    source:
      check +
      `
check($262.evalScript("var x = 1; x + 1 + x == 1") === false);
check($262.evalScript("1 + 1 + 1 == 1") === false);
console.log("ok");
`,
  },
  {
    name: "ds15-completion-expression-precedence",
    globalScriptReference: true,
    test262Host: true,
    source:
      check +
      `
check($262.evalScript("5 + 1 | 0 === 0") === 7);
check($262.evalScript("2 * 5 + 1 | 0 === 0 > -1") === 11);
console.log("ok");
`,
  },
  {
    name: "ds15-unresolvable-strict-write",
    globalScriptReference: true,
    source:
      check +
      `
function subject() {
  "use strict";
  _8_7_2_1 = 11;
}
let caught = false;
try { subject(); } catch (error) {
  caught = error instanceof ReferenceError;
}
check(caught);
check(!Object.prototype.hasOwnProperty.call(globalThis, "_8_7_2_1"));
console.log("ok");
`,
  },
  {
    name: "ds15-continue-script-boundary",
    globalScriptReference: true,
    test262Host: true,
    source:
      check +
      `
var x = 0, y = 0;
let caught = false;
try {
  LABEL1: do {
    x++;
    $262.evalScript("continue LABEL1");
    y++;
  } while (0);
} catch (error) { caught = error instanceof SyntaxError; }
check(caught);
check(x === 1);
check(y === 0);
console.log("ok");
`,
  },
];
