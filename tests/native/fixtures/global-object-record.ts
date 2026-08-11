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
