import type { Fixture } from "../fixture.ts";

export const globalObjectRecordFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "global-object-record",
    nonStrictScript: true,
    source: `
var Object;
function Promise() { return "replacement"; }
const ObjectIntrinsic = Object;
const objectDescriptor = Object.getOwnPropertyDescriptor(this, "Object");
const promiseDescriptor = Object.getOwnPropertyDescriptor(this, "Promise");
console.log(
  "plain-var",
  typeof Object,
  objectDescriptor.value === Object,
  objectDescriptor.writable,
  objectDescriptor.enumerable,
  objectDescriptor.configurable,
);
console.log(
  "plain-function",
  Promise(),
  promiseDescriptor.value === Promise,
  promiseDescriptor.writable,
  promiseDescriptor.enumerable,
);
var Infinity = 1;
var NaN = 2;
var undefined = 3;
for (const name of ["Infinity", "NaN", "undefined"]) {
  const descriptor = Object.getOwnPropertyDescriptor(this, name);
  console.log(
    "descriptor",
    name,
    name === "Infinity"
      ? descriptor.value === 1 / 0
      : name === "NaN"
        ? descriptor.value !== descriptor.value
        : descriptor.value === void 0,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
  );
  let enumerated = false;
  for (const key of Object.keys(this)) {
    if (key === name) enumerated = true;
  }
  console.log("enumerated", name, enumerated);
}
Infinity = 4;
NaN = 5;
undefined = 6;
console.log("assignment", Infinity, NaN !== NaN, undefined === void 0);
console.log("delete", delete Infinity, delete NaN, delete undefined);
const globalObject = this;
function strictAssignments() {
  "use strict";
  for (const name of ["Infinity", "NaN", "undefined"]) {
    try {
      globalObject[name] = 7;
    } catch (error) {
      console.log("strict", name, error.name);
    }
  }
}
strictAssignments();
/** @param {number} value */
function hinted(value) { return value + 1; }
console.log("guard", hinted(4), hinted("miss"));
const survivor = { value: Infinity };
for (let index = 0; index < 32; index = index + 1) {
  Object.defineProperty({}, "item", { value: { index } });
}
console.log("collection", survivor.value === Infinity);
var Symbol;
var Function;
var Iterator;
var Error;
var EvalError;
var RangeError;
var ReferenceError;
var SyntaxError;
var TypeError;
var URIError;
var AggregateError;
console.log(
  "intrinsic-vars",
  Symbol === this.Symbol,
  Function === this.Function,
  Iterator === this.Iterator,
  Error === this.Error,
  EvalError === this.EvalError,
  RangeError === this.RangeError,
  ReferenceError === this.ReferenceError,
  SyntaxError === this.SyntaxError,
  TypeError === this.TypeError,
  URIError === this.URIError,
  AggregateError === this.AggregateError,
);
const constructorGlobals = {
  Function,
  Symbol,
  Iterator,
  Error,
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
  AggregateError,
};
this.Function = 101;
this.Symbol = 102;
this.Iterator = 103;
this.Error = 104;
this.EvalError = 105;
this.RangeError = 106;
this.ReferenceError = 107;
this.SyntaxError = 108;
this.TypeError = 109;
this.URIError = 110;
this.AggregateError = 111;
console.log(
  "constructor-property-writes",
  Function,
  Symbol,
  Iterator,
  Error,
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
  AggregateError,
);
Function = constructorGlobals.Function;
Symbol = constructorGlobals.Symbol;
Iterator = constructorGlobals.Iterator;
Error = constructorGlobals.Error;
EvalError = constructorGlobals.EvalError;
RangeError = constructorGlobals.RangeError;
ReferenceError = constructorGlobals.ReferenceError;
SyntaxError = constructorGlobals.SyntaxError;
TypeError = constructorGlobals.TypeError;
URIError = constructorGlobals.URIError;
AggregateError = constructorGlobals.AggregateError;
console.log(
  "constructor-binding-writes",
  this.Function === constructorGlobals.Function,
  this.Symbol === constructorGlobals.Symbol,
  this.Iterator === constructorGlobals.Iterator,
  this.Error === constructorGlobals.Error,
  this.EvalError === constructorGlobals.EvalError,
  this.RangeError === constructorGlobals.RangeError,
  this.ReferenceError === constructorGlobals.ReferenceError,
  this.SyntaxError === constructorGlobals.SyntaxError,
  this.TypeError === constructorGlobals.TypeError,
  this.URIError === constructorGlobals.URIError,
  this.AggregateError === constructorGlobals.AggregateError,
);
console.log("delete-Symbol", delete Symbol, typeof Symbol);
try {
  Symbol;
} catch (error) {
  console.log("missing-Symbol", error.name);
}
this.Symbol = constructorGlobals.Symbol;
console.log("delete-Function", delete Function, typeof Function);
try {
  Function;
} catch (error) {
  console.log("missing-Function", error.name);
}
this.Function = constructorGlobals.Function;
console.log("delete-Error", delete Error, typeof Error);
try {
  Error;
} catch (error) {
  console.log("missing-Error", error.name);
}
this.Error = constructorGlobals.Error;
Object.defineProperty(this, "Object", {
  configurable: true,
  get() { return Promise; },
});
console.log("accessor-binding", Object === Promise);
console.log("delete-binding", delete Object, typeof Object);
this.Object = ObjectIntrinsic;
with ({}) {
  console.log("with-delete-binding", delete Object, typeof Object);
}
`,
  },
  {
    // The bare `eval` identifier reads, writes, and deletes the global
    // object's %eval% property like any other configurable global, while
    // declarations and `with` objects shadow it. No String reaches %eval%
    // here, so every observation is defined without source evaluation.
    globalScriptReference: true,
    name: "eval-intrinsic-value",
    nonStrictScript: true,
    source: `
const intrinsic = eval;
const descriptor = Object.getOwnPropertyDescriptor(this, "eval");
console.log(
  "descriptor",
  descriptor.value === eval,
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
);
console.log(
  "value",
  typeof eval,
  eval === globalThis.eval,
  eval.length,
  eval.name,
  eval.prototype === undefined,
  Object.getPrototypeOf(eval) === Function.prototype,
  Object.keys(eval).length,
  eval.propertyIsEnumerable("length"),
);
const local = {};
console.log(
  "non-string",
  intrinsic(42),
  intrinsic() === undefined,
  intrinsic.call(null, true),
  (0, eval)(local) === local,
  eval?.(7),
);
try {
  new eval();
} catch (error) {
  console.log("construct", error instanceof TypeError);
}
function constructible(target) {
  try {
    Reflect.construct(function () {}, [], target);
    return true;
  } catch (error) {
    return error.name;
  }
}
console.log("constructible", constructible(eval), constructible(Object));
const proxy = new Proxy(eval, {});
console.log("proxy", proxy(), typeof proxy, constructible(proxy));
try {
  new proxy();
} catch (error) {
  console.log("proxy-construct", error.name);
}
console.log(
  "callback-this",
  [1].map(function () {
    return this === eval;
  }, eval)[0],
  [eval].indexOf(eval),
);
try {
  Promise.resolve.call(eval, 1);
} catch (error) {
  console.log("promise-context", error.name);
}
function parameter(eval) {
  return eval;
}
function declared() {
  var eval = "var";
  return eval;
}
{
  let eval = "lexical";
  console.log("shadow", parameter(3), declared(), eval);
}
with ({ eval: 5 }) {
  console.log("with-hit", eval);
}
with ({}) {
  console.log("with-miss", eval === intrinsic, typeof eval, eval(9));
}
with ({ eval(value) { return value + 1; } }) {
  console.log("with-call", eval(1));
}
// A tagged template is an ordinary call, never a direct eval, so
// %eval% receives the template object and returns it unchanged.
function site() {
  return eval\`a\${1}b\`;
}
const tagged = site();
console.log(
  "tagged",
  (eval\`x\`)[0],
  ((eval)\`y\`)[0],
  tagged.join(),
  tagged.raw.join(),
  Array.isArray(tagged),
  Object.isFrozen(tagged),
  site() === tagged,
);
with ({}) {
  console.log("with-tagged", eval\`w\`[0]);
}
eval = 6;
console.log("write", eval, this.eval, globalThis.eval === 6);
eval = intrinsic;
console.log("restore", eval === intrinsic, this.eval === intrinsic);
console.log("delete", delete eval, typeof eval, "eval" in this);
try {
  eval;
} catch (error) {
  console.log("missing", error.name);
}
console.log(
  "strict-missing",
  (function () {
    "use strict";
    try {
      return eval;
    } catch (error) {
      return error.name;
    }
  })(),
);
with ({}) {
  try {
    eval;
  } catch (error) {
    console.log("with-missing", error.name);
  }
}
eval = intrinsic;
const recreated = Object.getOwnPropertyDescriptor(this, "eval");
console.log("recreated", recreated.value === intrinsic, recreated.enumerable);
Object.defineProperty(this, "eval", { enumerable: false });
/** @param {number} value */
function hinted(value) {
  return value + 1;
}
console.log("guard", hinted(4), hinted("miss"));
const survivor = { value: eval };
for (let index = 0; index < 32; index = index + 1) {
  Object.defineProperty({}, "item", { value: { index } });
}
console.log("collection", survivor.value === intrinsic);
`,
  },
];
