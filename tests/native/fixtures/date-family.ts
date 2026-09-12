import type { Fixture } from "../fixture.ts";

/*
 * The reference hosts run with `TZ=UTC`, which tests/native.ts sets for
 * every fixture, because Oseo's realm reports UTC as its local time zone
 * until the PLAN-NIO clock and wakeup checkpoint supplies a host one.
 * Every observation below is therefore a real differential comparison of
 * the local-time paths rather than a UTC-only one.
 *
 * Nothing here prints a current time, an ECMA-402 locale text, or an
 * Annex B Date method: the first is not reproducible, and the reference
 * hosts own the other two while this profile admits neither.
 */
export const dateFamilyFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "date-family",
    source: `
console.log("metadata", typeof Date, Date.name, Date.length);
console.log(
  "links",
  Object.getPrototypeOf(Date) === Function.prototype,
  Object.getPrototypeOf(Date.prototype) === Object.prototype,
  Date.prototype.constructor === Date,
  Object.prototype.toString.call(Date.prototype),
);
const prototypeDescriptor = Object.getOwnPropertyDescriptor(
  Date,
  "prototype",
);
console.log(
  "prototype descriptor",
  prototypeDescriptor.value === Date.prototype,
  prototypeDescriptor.writable,
  prototypeDescriptor.enumerable,
  prototypeDescriptor.configurable,
);
const constructorDescriptor = Object.getOwnPropertyDescriptor(
  Date.prototype,
  "constructor",
);
console.log(
  "constructor descriptor",
  constructorDescriptor.value === Date,
  constructorDescriptor.writable,
  constructorDescriptor.enumerable,
  constructorDescriptor.configurable,
);
const methodNames = [
  "getDate", "getDay", "getFullYear", "getHours", "getMilliseconds",
  "getMinutes", "getMonth", "getSeconds", "getTime", "getTimezoneOffset",
  "getUTCDate", "getUTCDay", "getUTCFullYear", "getUTCHours",
  "getUTCMilliseconds", "getUTCMinutes", "getUTCMonth", "getUTCSeconds",
  "setDate", "setFullYear", "setHours", "setMilliseconds", "setMinutes",
  "setMonth", "setSeconds", "setTime", "setUTCDate", "setUTCFullYear",
  "setUTCHours", "setUTCMilliseconds", "setUTCMinutes", "setUTCMonth",
  "setUTCSeconds", "toDateString", "toISOString", "toJSON",
  "toLocaleDateString", "toLocaleString", "toLocaleTimeString", "toString",
  "toTimeString", "toUTCString", "valueOf",
];
const methodLengths = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  1, 3, 4, 1, 3, 2, 2, 1, 1, 3, 4, 1, 3, 2, 2,
  0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
];
let methodReport = "";
for (let index = 0; index < methodNames.length; index = index + 1) {
  const name = methodNames[index];
  const method = Date.prototype[name];
  const descriptor = Object.getOwnPropertyDescriptor(Date.prototype, name);
  if (
    typeof method !== "function" ||
    method.name !== name ||
    method.length !== methodLengths[index] ||
    method.hasOwnProperty("prototype") ||
    Object.getPrototypeOf(method) !== Function.prototype ||
    descriptor.writable !== true ||
    descriptor.enumerable !== false ||
    descriptor.configurable !== true
  ) {
    methodReport = methodReport + " " + name;
  }
}
console.log("methods", methodNames.length, methodReport === "");
const staticNames = ["now", "parse", "UTC"];
const staticLengths = [0, 1, 7];
let staticReport = "";
for (let index = 0; index < staticNames.length; index = index + 1) {
  const name = staticNames[index];
  const method = Date[name];
  const descriptor = Object.getOwnPropertyDescriptor(Date, name);
  if (
    typeof method !== "function" ||
    method.name !== name ||
    method.length !== staticLengths[index] ||
    method.hasOwnProperty("prototype") ||
    descriptor.writable !== true ||
    descriptor.enumerable !== false ||
    descriptor.configurable !== true
  ) {
    staticReport = staticReport + " " + name;
  }
}
console.log("statics", staticNames.length, staticReport === "");
const toPrimitiveDescriptor = Object.getOwnPropertyDescriptor(
  Date.prototype,
  Symbol.toPrimitive,
);
console.log(
  "toPrimitive descriptor",
  typeof toPrimitiveDescriptor.value,
  toPrimitiveDescriptor.value.name,
  toPrimitiveDescriptor.value.length,
  toPrimitiveDescriptor.writable,
  toPrimitiveDescriptor.enumerable,
  toPrimitiveDescriptor.configurable,
);

// Every component of a time value, at the epoch, at both boundaries of
// the reviewed range, and around the day, year, and leap-day edges the
// civil arithmetic has to resolve.
const stamps = [
  0, 1, -1, 86399999, 86400000, -86400000, 946684800000, 951782400000,
  1234567890123, -2208988800000, 4102444799999, 8.64e15, -8.64e15,
];
for (let index = 0; index < stamps.length; index = index + 1) {
  const value = new Date(stamps[index]);
  console.log(
    "fields",
    value.getTime(),
    value.valueOf(),
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    value.getDay(),
    value.getHours(),
    value.getMinutes(),
    value.getSeconds(),
    value.getMilliseconds(),
    value.getTimezoneOffset(),
  );
  console.log(
    "utc fields",
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
    value.getUTCDay(),
    value.getUTCHours(),
    value.getUTCMinutes(),
    value.getUTCSeconds(),
    value.getUTCMilliseconds(),
  );
  console.log("iso", value.toISOString(), value.toJSON());
  console.log("text", value.toString());
  console.log("utc text", value.toUTCString());
  console.log("parts", value.toDateString(), "|", value.toTimeString());
}

// An invalid Date answers NaN everywhere, prints one fixed text from
// every text method, reports null from toJSON, and throws from
// toISOString alone.
const invalid = new Date(NaN);
console.log(
  "invalid",
  invalid.getTime(),
  invalid.getFullYear(),
  invalid.getUTCMonth(),
  invalid.getTimezoneOffset(),
  invalid.toJSON(),
);
console.log(
  "invalid text",
  invalid.toString(),
  invalid.toDateString(),
  invalid.toTimeString(),
  invalid.toUTCString(),
);
try {
  invalid.toISOString();
} catch (error) {
  console.log("invalid iso", error instanceof RangeError);
}

// MakeFullYear, MakeDay, MakeTime, and TimeClip over the constructor and
// over Date.UTC, including the two-digit year window, out-of-range
// components that carry into the next unit, and the first value past
// each end of the reviewed range.
const componentCases = [
  [2020], [2020, 5], [2020, 5, 15], [2020, 5, 15, 10],
  [2020, 5, 15, 10, 30], [2020, 5, 15, 10, 30, 45],
  [2020, 5, 15, 10, 30, 45, 500], [99, 0, 1], [0, 0, 1], [100, 0, 1],
  [1970, 13, 1], [1970, -1, 1], [1970, 0, 0], [1970, 0, 32],
  [1970, 0, 1, 25], [1970, 0, 1, 0, 61], [1970, 0, 1, 0, 0, 0, 1001],
  [275760, 8, 13], [275760, 8, 14], [-271821, 3, 20], [-271821, 3, 19],
];
for (let index = 0; index < componentCases.length; index = index + 1) {
  const args = componentCases[index];
  console.log(
    "components",
    args.join(","),
    new Date(...args).getTime(),
    Date.UTC(...args),
  );
}
console.log("utc defaults", Date.UTC(1970), Date.UTC(NaN));
console.log(
  "nonfinite",
  new Date(NaN).getTime(),
  new Date(Infinity).getTime(),
  new Date(-Infinity).getTime(),
  new Date(8.64e15 + 1).getTime(),
  new Date(-0).getTime(),
  1 / new Date(-0.5).getTime(),
);

// A one-argument construction copies an existing Date's slot, parses a
// String, and otherwise converts through ToPrimitive then ToNumber.
console.log(
  "single argument",
  new Date(new Date(12345)).getTime(),
  new Date("1970-01-02T00:00:00Z").getTime(),
  new Date({ valueOf() { return 777; } }).getTime(),
  new Date({ [Symbol.toPrimitive]() { return "1970-01-02"; } }).getTime(),
  new Date(true).getTime(),
  new Date(null).getTime(),
);
const shadowed = new Date(4);
shadowed.valueOf = function () { return 99; };
console.log("slot copy", new Date(shadowed).getTime());

// Every component setter, over a valid receiver and over an invalid one,
// with the specified conversion order preserved in both.
const setterNames = [
  "setDate", "setFullYear", "setHours", "setMilliseconds", "setMinutes",
  "setMonth", "setSeconds", "setTime", "setUTCDate", "setUTCFullYear",
  "setUTCHours", "setUTCMilliseconds", "setUTCMinutes", "setUTCMonth",
  "setUTCSeconds",
];
const setterArguments = [
  [15], [2020, 5, 15], [10, 30, 45, 500], [999], [10, 20, 30], [11, 25],
  [59, 250], [12345], [15], [2020, 5, 15], [10, 30, 45, 500], [1], [5],
  [3], [7],
];
for (let index = 0; index < setterNames.length; index = index + 1) {
  const name = setterNames[index];
  const args = setterArguments[index];
  const target = new Date(0);
  const returned = target[name](...args);
  const missing = new Date(NaN);
  const missingReturned = missing[name](...args);
  console.log(
    "setter",
    name,
    args.join(","),
    returned,
    target.getTime(),
    missingReturned,
    missing.getTime(),
  );
}
// The first parameter of every setter is converted even when the call
// supplies nothing, so an argumentless setter reports NaN, while an
// absent trailing parameter keeps the receiver's own component.
let absentReport = "";
for (let index = 0; index < setterNames.length; index = index + 1) {
  const name = setterNames[index];
  const target = new Date(1234567890123);
  const returned = target[name]();
  if (returned === returned || target.getTime() === target.getTime()) {
    absentReport = absentReport + " " + name;
  }
}
console.log("absent first argument", setterNames.length, absentReport === "");
const partial = new Date(1234567890123);
console.log(
  "absent trailing",
  partial.setHours(1),
  partial.toISOString(),
  partial.setUTCFullYear(1999),
  partial.toISOString(),
  new Date(1234567890123).setMinutes(7, 8),
);
console.log(
  "setter clip",
  new Date(0).setTime(8.64e15 + 1),
  new Date(0).setDate(NaN),
  new Date(0).setFullYear(275760, 8, 14),
  new Date(0).setUTCMonth("3"),
);
const order = [];
function tracked(label, value) {
  return { valueOf() { order.push(label); return value; } };
}
const orderTarget = new Date(NaN);
console.log(
  "conversion order",
  orderTarget.setHours(tracked("h", 1), tracked("m", 2), tracked("s", 3)),
  order.join(""),
);
const yearOrder = [];
const yearTarget = new Date(NaN);
console.log(
  "year order",
  yearTarget.setFullYear(
    { valueOf() { yearOrder.push("y"); return 2001; } },
    { valueOf() { yearOrder.push("m"); return 1; } },
  ),
  yearOrder.join(""),
  yearTarget.toISOString(),
);

// The Date Time String Format, its expanded years, its offsets, and the
// syntactic and range rejections. Every accepted text is in the format
// 21.4.1.32 defines, so no implementation-defined fallback is compared.
const parseCases = [
  "1970-01-01T00:00:00Z", "1970-01-01", "1970-01", "1970",
  "1970-01-01T00:00", "1970-01-01T00:00:00", "1970-01-01T00:00:00.123Z",
  "1970-01-01T00:00:00+01:00", "1970-01-01T00:00:00-01:30",
  "+002020-06-15T00:00:00Z", "-000001-07-01T00:00Z",
  "-000000-03-31T00:45Z", "+000000-01-01", "2020-13-01", "2020-00-01",
  "2020-01-32", "2020-01-00", "2020-02-30", "1970-01-01T24:00:00Z",
  "1970-01-01T24:00:00.001Z", "1970-01-01T24:30Z", "1970-01-01T00:60Z",
  "1970-01-01T00:00:60Z", "+275760-09-13T00:00:00Z",
  "+275760-09-13T00:00:00.001Z", "-271821-04-20T00:00:00Z",
  "-271821-04-19T23:59:59.999Z", "", "garbage", "1970-01-01T00:00:00ZZ",
];
for (let index = 0; index < parseCases.length; index = index + 1) {
  const text = parseCases[index];
  console.log(
    "parse",
    text,
    Date.parse(text),
    new Date(text).getTime(),
  );
}
const roundTrip = [0, 946684800000, 4102444799000, -2208988800000];
for (let index = 0; index < roundTrip.length; index = index + 1) {
  const value = new Date(roundTrip[index]);
  console.log(
    "round trip",
    value.getTime(),
    Date.parse(value.toString()),
    Date.parse(value.toUTCString()),
    Date.parse(value.toISOString()),
  );
}
console.log("parse coercion", Date.parse(), Date.parse(1970));

// @@toPrimitive selects the hint, and every ordinary coercion reaches it.
const epoch = new Date(0);
console.log(
  "hints",
  epoch[Symbol.toPrimitive]("string"),
  "|",
  epoch[Symbol.toPrimitive]("number"),
  "|",
  epoch[Symbol.toPrimitive]("default"),
);
try {
  epoch[Symbol.toPrimitive]("bogus");
} catch (error) {
  console.log("hint rejection", error instanceof TypeError);
}
try {
  Date.prototype[Symbol.toPrimitive].call(1, "number");
} catch (error) {
  console.log("hint receiver", error instanceof TypeError);
}
console.log("coercion", +epoch, epoch + "", epoch * 1, \`\${epoch}\`);

// toJSON is generic: it converts an arbitrary object and invokes that
// object's own toISOString.
console.log(
  "toJSON generic",
  Date.prototype.toJSON.call({
    valueOf() { return 1; },
    toISOString() { return "custom"; },
  }),
  Date.prototype.toJSON.call({
    valueOf() { return Infinity; },
    toISOString() { return "unused"; },
  }),
);
try {
  Date.prototype.toJSON.call({ valueOf() { return 1; } });
} catch (error) {
  console.log("toJSON callable", error instanceof TypeError);
}

// Every slot-reading method rejects a receiver without [[DateValue]].
const receiverNames = [
  "getTime", "getFullYear", "getUTCDate", "setDate", "setTime", "valueOf",
  "toISOString", "toString", "toDateString", "toTimeString", "toUTCString",
  "toLocaleString",
];
let receiverReport = "";
for (let index = 0; index < receiverNames.length; index = index + 1) {
  const name = receiverNames[index];
  try {
    Date.prototype[name].call({});
    receiverReport = receiverReport + " " + name;
  } catch (error) {
    if (!(error instanceof TypeError)) {
      receiverReport = receiverReport + " " + name;
    }
  }
}
console.log("receivers", receiverNames.length, receiverReport === "");
try {
  Date.prototype[Symbol.toPrimitive].call(new Date(0), "string");
  console.log("prototype receiver", true);
} catch (error) {
  console.log("prototype receiver", false);
}
try {
  Date.prototype.getTime.call(Date.prototype);
} catch (error) {
  console.log("prototype slot", error instanceof TypeError);
}

// Neither the statics nor the prototype methods construct, and Date
// called without new reports a String rather than an object.
let constructReport = "";
const notConstructors = ["now", "parse", "UTC"];
for (let index = 0; index < notConstructors.length; index = index + 1) {
  try {
    new Date[notConstructors[index]]();
    constructReport = constructReport + " " + notConstructors[index];
  } catch (error) {
    if (!(error instanceof TypeError)) {
      constructReport = constructReport + " " + notConstructors[index];
    }
  }
}
try {
  new Date.prototype.getTime();
  constructReport = constructReport + " getTime";
} catch (error) {
  if (!(error instanceof TypeError)) constructReport = constructReport + " x";
}
console.log("not constructors", constructReport === "");

class Subclass extends Date {
  constructor(value) {
    super(value);
    this.marker = "sub";
  }
}
const subclass = new Subclass(1234);
console.log(
  "subclass",
  subclass instanceof Subclass,
  subclass instanceof Date,
  subclass.getTime(),
  subclass.marker,
  Object.getPrototypeOf(subclass) === Subclass.prototype,
  Object.prototype.toString.call(subclass),
  subclass.toISOString(),
);

// A false Number hint on a Date receiver must not change behavior, and
// the repeated intrinsic reads deliberately miss the property shape
// guard once so the generic fallback runs.
/** @param {number} left @param {number} right */
function hinted(left, right) {
  return left + right;
}
console.log(
  "hint",
  hinted(epoch.getTime(), epoch.getUTCMonth()),
  hinted(1, 2),
  hinted("a", "b"),
);
const originalGetTime = Date.prototype.getTime;
let turn = 0;
while (turn < 2) {
  console.log(
    "guard",
    Date.prototype.getTime === originalGetTime,
    epoch.getTime(),
  );
  if (turn === 0) Date.prototype.marker = 1;
  turn = turn + 1;
}
delete Date.prototype.marker;

// A Date's time value survives collection pressure, and a Date is an
// ordinary object whose own properties behave ordinarily.
function survivor() {
  const value = new Date(1234567890123);
  value.tag = "kept";
  return value;
}
const survived = survivor();
for (let index = 0; index < 200; index = index + 1) {
  const garbage = new Date(index * 1000);
  garbage.setUTCMilliseconds(index % 1000);
}
console.log(
  "survived",
  survived.getTime(),
  survived.tag,
  survived.toISOString(),
  Object.keys(survived).join(","),
);

// The global binding is a replaceable property of the global object.
const originalDate = Date;
Date = 1;
console.log("global write", this.Date === Date, typeof Date);
Date = originalDate;
console.log("global restore", this.Date === Date, typeof Date);
console.log("global delete", delete this.Date, typeof originalDate);
this.Date = originalDate;
console.log("global reinstall", this.Date === Date);
`,
  },
];
