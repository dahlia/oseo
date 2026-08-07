import type { Fixture } from "../fixture.ts";

export const numberIntrinsicFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "number-intrinsic",
    source: `
console.log("metadata", typeof Number, Number.name, Number.length);
const prototypeDescriptor = Object.getOwnPropertyDescriptor(
  Number,
  "prototype",
);
const finiteDescriptor = Object.getOwnPropertyDescriptor(Number, "isFinite");
const maximumDescriptor = Object.getOwnPropertyDescriptor(Number, "MAX_VALUE");
console.log(
  "descriptors",
  prototypeDescriptor.writable,
  prototypeDescriptor.enumerable,
  prototypeDescriptor.configurable,
  finiteDescriptor.writable,
  finiteDescriptor.enumerable,
  finiteDescriptor.configurable,
  maximumDescriptor.writable,
  maximumDescriptor.enumerable,
  maximumDescriptor.configurable,
);
console.log(
  "constants",
  Number.EPSILON > 0,
  Number.MAX_SAFE_INTEGER === 9007199254740991,
  Number.MAX_VALUE > 1e308,
  Number.MIN_SAFE_INTEGER === -9007199254740991,
  Number.MIN_VALUE > 0,
  Number.isNaN(Number.NaN),
  Number.NEGATIVE_INFINITY === -Infinity,
  Number.POSITIVE_INFINITY === Infinity,
);
console.log(
  "call",
  Number(),
  Number(" 12.5 "),
  Number(true),
  Number(9007199254740993n),
);
let bigintObjectConversions = 0;
const bigintObject = {
  valueOf() {
    bigintObjectConversions = bigintObjectConversions + 1;
    return 10n;
  },
};
const boxedBigintObject = new Number(bigintObject);
console.log(
  "bigint object",
  Number(bigintObject),
  boxedBigintObject instanceof Number,
  bigintObjectConversions,
);
try { Number(Symbol("x")); } catch (error) {
  console.log("symbol", error instanceof TypeError);
}
const boxed = new Number(42);
console.log(
  "wrapper",
  typeof boxed,
  Number.prototype.isPrototypeOf(boxed),
  boxed instanceof Number,
  boxed.hasOwnProperty("value"),
);
console.log(
  "wrapper conversion",
  new Number(7),
  Number.parseFloat(new Number(12)),
  Number.parseInt(new Number(12), 10),
);
const parsingWrapper = new Number(12);
parsingWrapper.toString = function () { return "13.5tail"; };
console.log("wrapper toString override", Number.parseFloat(parsingWrapper));
const detachedWrapper = new Number(9);
console.log(
  "wrapper object tag",
  ({}).toString.call(detachedWrapper),
);
const valueOfWrapper = new Number(1);
console.log(
  "object valueOf wrapper",
  ({}).valueOf.call(valueOfWrapper) === valueOfWrapper,
);
valueOfWrapper.valueOf = function () { return 5; };
console.log("custom wrapper conversion", valueOfWrapper + 1);
class DerivedNumber extends Number {}
const derived = new DerivedNumber(-7);
console.log(
  "derived",
  derived instanceof DerivedNumber,
  derived instanceof Number,
  Number.prototype.isPrototypeOf(derived),
);
console.log(
  "predicates",
  Number.isFinite(0),
  Number.isFinite(Infinity),
  Number.isFinite("0"),
  Number.isInteger(-0),
  Number.isInteger(1.5),
  Number.isNaN(NaN),
  Number.isNaN("NaN"),
  Number.isSafeInteger(9007199254740991),
  Number.isSafeInteger(9007199254740992),
);
console.log(
  "parse float",
  Number.parseFloat("  -12.5e2tail"),
  Number.parseFloat("+Infinity!"),
  Number.isNaN(Number.parseFloat("word")),
  Number.parseFloat("1e+"),
);
console.log(
  "parse int",
  Number.parseInt("  -0x10tail"),
  Number.parseInt("101", 2),
  Number.parseInt("z", 36),
  Number.parseInt("10000000000000801", 16) ===
    18446744073709553665,
  Number.isNaN(Number.parseInt("1", 1)),
);
/** @param {number} value */
function hinted(value) { return value + 1; }
console.log("hint", hinted(2), hinted("2"));
let turn = 0;
while (turn < 2) {
  console.log("guard", Number.isFinite === Number.isFinite);
  if (turn === 0) Number.marker = 1;
  turn = turn + 1;
}
function strictNumberRead() { "use strict"; return this instanceof Number; }
console.log("strict receiver", strictNumberRead.call(-12));
const originalNumber = Number;
const numberGlobalObject = this;
({ value: Number } = { value: 31 });
console.log("object target", Number, this.Number === Number);
[Number] = [32];
console.log("array target", Number, this.Number === Number);
for (Number of [33]) {}
console.log("for-of target", Number, this.Number === Number);
for ({ value: Number } of [{ value: 34 }]) {}
console.log("for-of object target", Number, this.Number === Number);
for ([Number] of [[35]]) {}
console.log("for-of array target", Number, this.Number === Number);
for (Number in { loopKey: true }) {}
console.log("for-in target", Number, this.Number === Number);
for ({ 0: Number } in { patternKey: true }) {}
console.log("for-in object target", Number, this.Number === Number);
Number = originalNumber;
console.log("target restore", Number === originalNumber);
Number = 40;
console.log("identifier replace", Number, this.Number === Number);
Number += 2;
console.log(
  "identifier update",
  Number++,
  ++Number,
  Number,
  this.Number,
);
Number = originalNumber;
console.log("identifier restore", Number === originalNumber);
this.Number = 123;
console.log("global write", this.Number === Number, Number);
this.Number = originalNumber;
console.log("global restore", this.Number === Number);
console.log(
  "global delete",
  delete this.Number,
  typeof Number,
);
try { Number; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
try { Number += 1; } catch (error) {
  console.log("global deleted update", error instanceof ReferenceError);
}
try { Number++; } catch (error) {
  console.log("global deleted step", error instanceof ReferenceError);
}
function strictDeletedNumberSet() { "use strict"; Number = 1; }
try { strictDeletedNumberSet(); } catch (error) {
  console.log("global deleted strict set", error instanceof ReferenceError);
}
function strictDeletedNumberPattern() {
  "use strict";
  ({ value: Number } = { value: 1 });
}
try { strictDeletedNumberPattern(); } catch (error) {
  console.log(
    "global deleted strict pattern",
    error instanceof ReferenceError,
  );
}
function strictDeletedNumberLoop() {
  "use strict";
  for (Number of [1]) {}
}
try { strictDeletedNumberLoop(); } catch (error) {
  console.log("global deleted strict loop", error instanceof ReferenceError);
}
({ value: Number } = { value: originalNumber });
console.log("global deleted pattern restore", this.Number === Number);
function strictDeleteDuringNumberPattern() {
  "use strict";
  ({ value: Number = (delete numberGlobalObject.Number, 5) } = {});
}
try { strictDeleteDuringNumberPattern(); } catch (error) {
  console.log("global strict pattern race", error instanceof ReferenceError);
}
Number = originalNumber;
console.log("global pattern race restore", this.Number === Number);
function strictDeleteDuringNumberSet() {
  "use strict";
  Number = (delete numberGlobalObject.Number, 5);
}
try { strictDeleteDuringNumberSet(); } catch (error) {
  console.log("global strict set race", error instanceof ReferenceError);
}
Number = {
  valueOf() {
    delete numberGlobalObject.Number;
    return 1;
  },
};
function strictDeleteDuringNumberStep() { "use strict"; Number++; }
try { strictDeleteDuringNumberStep(); } catch (error) {
  console.log("global strict step race", error instanceof ReferenceError);
}
Number = originalNumber;
console.log("global race restore", this.Number === Number);
`,
  },
];
