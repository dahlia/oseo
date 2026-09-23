import type { Fixture } from "../fixture.ts";

export const booleanIntrinsicFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "boolean-intrinsic",
    source: `
console.log("metadata", typeof Boolean, Boolean.name, Boolean.length);
const prototypeDescriptor = Object.getOwnPropertyDescriptor(
  Boolean,
  "prototype",
);
const toStringDescriptor = Object.getOwnPropertyDescriptor(
  Boolean.prototype,
  "toString",
);
const valueOfDescriptor = Object.getOwnPropertyDescriptor(
  Boolean.prototype,
  "valueOf",
);
console.log(
  "descriptors",
  prototypeDescriptor.writable,
  prototypeDescriptor.enumerable,
  prototypeDescriptor.configurable,
  toStringDescriptor.writable,
  toStringDescriptor.enumerable,
  toStringDescriptor.configurable,
  valueOfDescriptor.writable,
  valueOfDescriptor.enumerable,
  valueOfDescriptor.configurable,
);
console.log(
  "false conversions",
  Boolean(),
  Boolean(false),
  Boolean(0),
  Boolean(-0),
  Boolean(NaN),
  Boolean(""),
  Boolean(null),
  Boolean(undefined),
);
console.log(
  "true conversions",
  Boolean(true),
  Boolean(1),
  Boolean("0"),
  Boolean({}),
  Boolean(Symbol("flag")),
  Boolean(1n),
);
let objectConversions = 0;
const objectValue = {
  valueOf() {
    objectConversions = objectConversions + 1;
    return false;
  },
};
console.log("object conversion", Boolean(objectValue), objectConversions);
console.log(
  "prototype",
  Boolean.prototype.valueOf(),
  Boolean.prototype.toString(),
  Boolean.prototype.constructor === Boolean,
);
const boxedFalse = new Boolean(false);
const boxedTrue = new Boolean("nonempty");
console.log(
  "wrappers",
  typeof boxedFalse,
  boxedFalse instanceof Boolean,
  Boolean.prototype.isPrototypeOf(boxedFalse),
  boxedFalse.valueOf(),
  boxedFalse.toString(),
  boxedTrue.valueOf(),
  boxedTrue.toString(),
);
console.log(
  "wrapper tags",
  ({}).toString.call(boxedFalse),
  ({}).toString.call(boxedTrue),
);
for (const receiver of [
  {},
  Object.create(Boolean.prototype),
  new Number(0),
  new Proxy(boxedTrue, {}),
]) {
  try { Boolean.prototype.valueOf.call(receiver); } catch (error) {
    console.log("unbranded valueOf", error instanceof TypeError);
  }
  try { Boolean.prototype.toString.call(receiver); } catch (error) {
    console.log("unbranded toString", error instanceof TypeError);
  }
}
class DerivedBoolean extends Boolean {}
const derived = new DerivedBoolean(true);
console.log(
  "derived",
  derived instanceof DerivedBoolean,
  derived instanceof Boolean,
  derived.valueOf(),
);
function Alternate() {}
const alternate = Reflect.construct(Boolean, [false], Alternate);
console.log(
  "alternate prototype",
  Object.getPrototypeOf(alternate) === Alternate.prototype,
  Boolean.prototype.valueOf.call(alternate),
);
for (const method of [
  Boolean.prototype.toString,
  Boolean.prototype.valueOf,
]) {
  try { Reflect.construct(method, []); } catch (error) {
    console.log("method constructor", error instanceof TypeError);
  }
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 2), hinted("1", 2));
const originalValueOf = Boolean.prototype.valueOf;
let turn = 0;
while (turn < 2) {
  console.log(
    "guard",
    Boolean.prototype.valueOf === originalValueOf,
  );
  if (turn === 0) Boolean.marker = 1;
  turn = turn + 1;
}
const originalBoolean = Boolean;
const booleanGlobalObject = this;
({ value: Boolean } = { value: 0 });
console.log("object target", Boolean, this.Boolean === Boolean);
[Boolean] = [1];
console.log("array target", Boolean, this.Boolean === Boolean);
for (Boolean of [2]) {}
console.log("for-of target", Boolean, this.Boolean === Boolean);
Boolean = originalBoolean;
console.log("target restore", Boolean === originalBoolean);
Boolean = 3;
console.log("identifier replace", Boolean, this.Boolean === Boolean);
Boolean = originalBoolean;
console.log("identifier restore", Boolean === originalBoolean);
this.Boolean = 4;
console.log("global write", this.Boolean === Boolean, Boolean);
this.Boolean = originalBoolean;
console.log("global restore", this.Boolean === Boolean);
console.log("global delete", delete this.Boolean, typeof Boolean);
try { Boolean; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
function strictDeletedBooleanSet() { "use strict"; Boolean = 1; }
try { strictDeletedBooleanSet(); } catch (error) {
  console.log("global deleted strict set", error instanceof ReferenceError);
}
({ value: Boolean } = { value: originalBoolean });
console.log("global deleted restore", this.Boolean === Boolean);
function strictDeleteDuringBooleanSet() {
  "use strict";
  Boolean = (delete booleanGlobalObject.Boolean, 5);
}
try { strictDeleteDuringBooleanSet(); } catch (error) {
  console.log("global strict set race", error instanceof ReferenceError);
}
Boolean = originalBoolean;
console.log("global race restore", this.Boolean === Boolean);
`,
  },
];
