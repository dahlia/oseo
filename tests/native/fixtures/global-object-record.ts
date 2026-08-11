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
];
