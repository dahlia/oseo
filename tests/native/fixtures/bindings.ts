import type { Fixture } from "../fixture.ts";

export const bindingFixtures: readonly Fixture[] = [
  {
    name: "with-statements",
    nonStrictScript: true,
    source: `
let selected = "lexical";
let fallback = "lexical";
let target = "lexical";
let captured;
let evaluations = 0;
const environment = {
  selected: "object",
  target: "object",
  method() {
    return this === environment && this.selected;
  },
};
with ((evaluations++, environment)) {
  console.log("read", selected, fallback, evaluations);
  target = "written";
  console.log("call", method());
  captured = () => selected;
  {
    let selected = "block";
    console.log("block", selected);
  }
}
console.log(
  "after",
  selected,
  fallback,
  target,
  environment.target,
  captured(),
  evaluations,
);

const outer = { selected: "outer" };
const inner = {};
with (outer) {
  with (inner) {
    console.log("nested", selected);
    selected = "nested-write";
  }
}
console.log("nested-after", outer.selected, selected);

try {
  with (environment) {
    throw new RangeError("abrupt");
  }
} catch (error) {
  console.log("abrupt", error.name, selected);
}

try {
  with (null) {}
} catch (error) {
  console.log("nullish", error.name);
}
`,
  },
  {
    name: "labeled-statements",
    source: `
outer: for (let i = 0; i < 3; i = i + 1) {
  for (let j = 0; j < 3; j = j + 1) {
    if (j === 2) continue outer;
    if (i === 2) break outer;
    console.log(i, j);
  }
}
console.log("after nested");
block: {
  console.log("in block");
  if (true) break block;
  console.log("skipped");
}
console.log("after block");
let path = "";
walk: while (true) {
  path = path + "a";
  inner: do {
    path = path + "b";
    if (path.length > 4) break walk;
    continue inner;
  } while (false);
  path = path + "c";
}
console.log(path);
labeledSwitch: switch (1) {
  case 1: break labeledSwitch;
}
console.log("switch label ok");
chain: chained: while (true) { break chain; }
console.log("chained labels");
finallyOrder: for (let i = 0; i < 2; i = i + 1) {
  try {
    if (i === 0) continue finallyOrder;
    break finallyOrder;
  } finally {
    console.log("finally", i);
  }
}
console.log("after finally");
`,
  },
  {
    name: "switch-statements",
    source: `
function pick(value) {
  switch (value) {
    case 1: return "one";
    case 1 + 1: return "two";
    default: return "other";
  }
}
console.log(pick(1), pick(2), pick(3));
function fall(value) {
  let out = "";
  switch (value) {
    case "a": out = out + "a";
    case "b": out = out + "b"; break;
    case "c": out = out + "c";
    default: out = out + "d";
    case "e": out = out + "e";
  }
  return out;
}
console.log(fall("a"), fall("b"), fall("c"), fall("x"), fall("e"));
const logging = (label, value) => { console.log("test", label); return value; };
switch (2) {
  case logging("first", 1): console.log("body1"); break;
  case logging("second", 2): console.log("body2"); break;
  case logging("third", 3): console.log("body3"); break;
}
switch (0) { }
console.log("empty ok");
let shared;
switch (1) {
  case 1: { let scoped = "case1"; shared = scoped; break; }
  case 2: { let scoped = "case2"; shared = scoped; }
}
console.log(shared);
function readClause(value) {
  switch (value) {
    case 2: let later = "set"; return later;
  }
  return "none";
}
console.log(readClause(2), readClause(3));
let collected = "";
for (let i = 0; i < 4; i = i + 1) {
  switch (i) {
    case 1: continue;
    case 3: break;
    default: collected = collected + i;
  }
  collected = collected + "-";
}
console.log(collected);
const nanCase = () => {
  switch (NaN) { case NaN: return "hit"; }
  return "miss";
};
console.log(NaN === NaN, nanCase());
`,
  },
  {
    name: "for-loops",
    source: `
for (let i = 0; i < 3; i = i + 1) console.log("let", i);
const captures = [];
for (let i = 0; i < 3; i = i + 1) { captures[i] = () => i; }
console.log(captures[0](), captures[1](), captures[2]());
let patternCapture0;
let patternCapture1;
let patternCapture2;
let patternCaptureIndex = 0;
for (let [value] = [0]; value < 3; value++) {
  if (patternCaptureIndex === 0) patternCapture0 = () => value;
  if (patternCaptureIndex === 1) patternCapture1 = () => value;
  if (patternCaptureIndex === 2) patternCapture2 = () => value;
  patternCaptureIndex++;
}
console.log(
  "pattern",
  patternCapture0(),
  patternCapture1(),
  patternCapture2(),
);
try {
  for (let [patternTdz = patternTdz] = []; false; ) {}
} catch (error) {
  console.log("pattern-tdz", error.name);
}
try {
  for (const {} = null; false; ) {}
} catch (error) {
  console.log("pattern-null", error.name);
}
let patternCloseCount = 0;
let patternCloseValue = 0;
const patternCloseIterable = {
  [Symbol.iterator]: function () {
    return {
      next: function () {
        patternCloseValue = 9;
        return { value: patternCloseValue, done: false };
      },
      return: function () {
        patternCloseCount++;
        return {};
      },
    };
  },
};
for (let [patternFirst] = patternCloseIterable; false; ) {}
console.log("pattern-close", patternCloseValue, patternCloseCount);
for (
  const { value: constantValue, ...constantRest } = {
    value: 4,
    extra: 5,
  };
  constantValue < 5;
) {
  console.log("const-pattern", constantValue, constantRest.extra);
  break;
}
for (
  var [retainedHead, ...retainedTail] = [6, 7, 8];
  retainedHead < 7;
  retainedHead++
) {}
console.log(
  "var-pattern",
  retainedHead,
  retainedTail[0],
  retainedTail[1],
);
for (var counted = 0; counted < 2; counted = counted + 1) {
  console.log("var", counted);
}
console.log("after", counted);
let total = 0;
for (;;) { total = total + 1; if (total >= 4) break; }
console.log(total);
for (let i = 0, j = 10; i < j; i = i + 1, j = j - 1) {
  if (i === 2) continue;
  console.log(i, j);
}
let text = "";
for (let i = 0; i < 3; i = i + 1) {
  if (i === 1) continue;
  text = text + i;
}
console.log(text);
for (total = 0; total < 2; total = total + 1) console.log("expr", total);
for (const fixed = 5; false;) console.log("never");
let shadow = "outer";
for (let shadow = 0; shadow < 1; shadow = shadow + 1) {
  console.log("inner", shadow);
}
console.log(shadow);
function sumTo(limit) {
  let sum = 0;
  for (let i = 1; i <= limit; i = i + 1) sum = sum + i;
  return sum;
}
console.log(sumTo(10));
console.log("done");
`,
  },
  {
    name: "array-bindings",
    source: `
const [first, , fallback = 3, [nested] = [4], ...rest] =
  [1, 2, undefined, [5], 6, 7];
let [mutable] = rest;
mutable = mutable + 1;
const [prior = 10, later = prior + 1] = [];
const [hole = 12] = [,];
const [named = function () {}] = [];
const [...[restFirst, restSecond]] = [8, 9];
console.log("var-before", beforeVar, mixedVar, blockVar);
var [beforeVar] = [25], mixedVar = 26, [, laterVar = 27] = [];
if (true) {
  var [blockVar] = [28];
}
console.log(
  "values",
  first,
  fallback,
  nested,
  rest.length,
  mutable,
  prior,
  later,
  hole,
  named.name,
  restFirst,
  restSecond
);
console.log("var-after", beforeVar, mixedVar, laterVar, blockVar);

function overwriteParameter(parameter) {
  var [parameter] = [29];
  return parameter;
}
console.log("var-parameter", overwriteParameter(0));

try {
  const [self = self] = [];
  console.log(self);
} catch (error) {
  console.log("tdz", error instanceof ReferenceError);
}

try {
  const [before = (laterConst = 1), laterConst] = [];
  console.log(before, laterConst);
} catch (error) {
  console.log("default-write-tdz", error instanceof ReferenceError);
}

let earlySteps = 0;
let earlyCloses = 0;
const earlyIterable = {
  [Symbol.iterator]: function () {
    return {
      next: function () {
        earlySteps = earlySteps + 1;
        return { value: earlySteps, done: false };
      },
      return: function () {
        earlyCloses = earlyCloses + 1;
        return {};
      },
    };
  },
};
const [early] = earlyIterable;
console.log("early", early, earlySteps, earlyCloses);

let emptySteps = 0;
let emptyCloses = 0;
const emptyIterable = {
  [Symbol.iterator]: function () {
    return {
      next: function () {
        emptySteps = emptySteps + 1;
        return { value: 1, done: false };
      },
      return: function () {
        emptyCloses = emptyCloses + 1;
        return {};
      },
    };
  },
};
const [] = emptyIterable;
console.log("empty", emptySteps, emptyCloses);

let exhaustedCloses = 0;
const exhaustedIterable = {
  [Symbol.iterator]: function () {
    return {
      next: function () { return { value: 0, done: true }; },
      return: function () {
        exhaustedCloses = exhaustedCloses + 1;
        return {};
      },
    };
  },
};
const [exhausted = 13] = exhaustedIterable;
console.log("exhausted", exhausted, exhaustedCloses);

let abruptCloses = 0;
const abruptIterable = {
  [Symbol.iterator]: function () {
    return {
      next: function () { return { value: undefined, done: false }; },
      return: function () {
        abruptCloses = abruptCloses + 1;
        throw new TypeError("close");
      },
    };
  },
};
try {
  const [value = (function () { throw new RangeError("default"); })()] =
    abruptIterable;
  console.log(value);
} catch (error) {
  console.log(
    "abrupt",
    error instanceof RangeError,
    error.message,
    abruptCloses,
  );
}

let stepCloses = 0;
const stepFailure = {
  [Symbol.iterator]: function () {
    return {
      next: function () { throw new RangeError("step"); },
      return: function () {
        stepCloses = stepCloses + 1;
        return {};
      },
    };
  },
};
try {
  const [value] = stepFailure;
  console.log(value);
} catch (error) {
  console.log("step", error instanceof RangeError, stepCloses);
}

let closeOrder = "";
const innerIterable = {
  [Symbol.iterator]: function () {
    return {
      next: function () { return { value: 21, done: false }; },
      return: function () { closeOrder = closeOrder + "i"; return {}; },
    };
  },
};
const outerIterable = {
  [Symbol.iterator]: function () {
    return {
      next: function () { return { value: innerIterable, done: false }; },
      return: function () { closeOrder = closeOrder + "o"; return {}; },
    };
  },
};
const [[inner]] = outerIterable;
console.log("nested", inner, closeOrder);

async function awaitedBinding() {
  const [awaited, defaulted = 23] = await Promise.resolve([22]);
  console.log("awaited", awaited, defaulted);
}
awaitedBinding();

async function bindingAfterAwait() {
  function read() { return after; }
  await Promise.resolve();
  const [after] = [24];
  console.log("after-await", read());
}
bindingAfterAwait();

async function awaitedVarBinding() {
  var [awaitedVar, defaultedVar = 31] = await Promise.resolve([30]);
  console.log("awaited-var", awaitedVar, defaultedVar);
}
awaitedVarBinding();
`,
  },
  {
    name: "object-bindings",
    source: `
const key = "value";
const symbol = Symbol("picked");
const {
  [key]: first,
  missing: fallback = 2,
  nested: { item },
  array: [head],
  [symbol]: symbolValue,
} = {
  value: 1,
  nested: { item: 3 },
  array: [4],
  [symbol]: 5,
};
let { mutable } = { mutable: 6 };
mutable = mutable + 1;
const { named = function () {} } = {};
const { length: textLength, 0: firstUnit } = "abc";
const {} = 1;
console.log(
  "values",
  first,
  fallback,
  item,
  head,
  symbolValue,
  mutable,
  named.name,
  textLength,
  firstUnit,
);

console.log("var-before", beforeVar, mixedVar, blockVar);
var { value: beforeVar } = { value: 8 }, mixedVar = 9;
if (true) {
  var { value: blockVar } = { value: 10 };
}
console.log("var-after", beforeVar, mixedVar, blockVar);

function overwriteParameter(parameter) {
  var { value: parameter } = { value: 11 };
  return parameter;
}
console.log("var-parameter", overwriteParameter(0));

try {
  const { self = self } = {};
  console.log(self);
} catch (error) {
  console.log("tdz", error instanceof ReferenceError);
}

let keyOrder = "";
const keyObject = {
  [Symbol.toPrimitive]: function () {
    keyOrder = keyOrder + "k";
    return "selected";
  },
};
const {
  [(keyOrder = keyOrder + "e", keyObject)]: selected =
    (keyOrder = keyOrder + "d", 12),
} = {};
console.log("order", selected, keyOrder);

const copiedSymbol = Symbol("copied");
const excludedSymbol = Symbol("excluded");
const restSource = {
  10: "ten",
  2: "two",
  keep: "kept",
  [copiedSymbol]: "symbol",
  [excludedSymbol]: "excluded",
};
Object.defineProperty(restSource, "hidden", {
  value: "hidden",
  enumerable: false,
});
Object.setPrototypeOf(restSource, { inherited: "inherited" });
let excludedEvaluations = 0;
const excludedKey = {
  [Symbol.toPrimitive]: function () {
    excludedEvaluations = excludedEvaluations + 1;
    return excludedSymbol;
  },
};
const {
  2: pickedIndex,
  [excludedKey]: pickedSymbol,
  ...restObject
} = restSource;
const restKeys = Object.keys(restObject);
console.log(
  "rest",
  pickedIndex,
  pickedSymbol,
  excludedEvaluations,
  restKeys.length,
  restKeys[0],
  restKeys[1],
  restObject[copiedSymbol],
  restObject[excludedSymbol],
  restObject.inherited,
  restObject.hidden,
);
const restDescriptor = Object.getOwnPropertyDescriptor(restObject, "10");
console.log(
  "rest-descriptor",
  restDescriptor.value,
  restDescriptor.writable,
  restDescriptor.enumerable,
  restDescriptor.configurable,
);
const { 1: middleUnit, ...textRest } = "abc";
const textRestKeys = Object.keys(textRest);
console.log(
  "string-rest",
  middleUnit,
  textRestKeys.length,
  textRestKeys[0],
  textRestKeys[1],
  textRest[0],
  textRest[2],
);
const { nested: { chosen, ...nestedRest }, ...outerRest } = {
  nested: { chosen: 20, retained: 21 },
  outer: 22,
};
console.log("nested-rest", chosen, nestedRest.retained, outerRest.outer);
let { ...letRest } = { mutableRest: 23 };
var { ...varRest } = { hoistedRest: 24 };
console.log("declaration-rest", letRest.mutableRest, varRest.hoistedRest);
const { ...numberRest } = 1;
console.log("number-rest", Object.keys(numberRest).length);

keyOrder = "";
try {
  const { [(keyOrder = keyOrder + "bad")]: never } = null;
  console.log(never);
} catch (error) {
console.log("nullish", error instanceof TypeError, keyOrder);
}

let outerCloses = 0;
const outerIterable = {
  [Symbol.iterator]: function () {
    return {
      next: function () { return { value: null, done: false }; },
      return: function () {
        outerCloses = outerCloses + 1;
        return {};
      },
    };
  },
};
try {
  const [{ value: nestedValue }] = outerIterable;
  console.log(nestedValue);
} catch (error) {
  console.log("nested-close", error instanceof TypeError, outerCloses);
}

async function awaitedBinding() {
  const { value: awaited, missing: defaulted = 14 } =
    await Promise.resolve({ value: 13 });
  console.log("awaited", awaited, defaulted);
}
awaitedBinding();

async function awaitedVarBinding() {
  var { value: awaitedVar, missing: defaultedVar = 16 } =
    await Promise.resolve({ value: 15 });
  console.log("awaited-var", awaitedVar, defaultedVar);
}
awaitedVarBinding();
`,
  },
  {
    name: "compound-assignments",
    source: `
let numeric = 5;
numeric += 3;
numeric -= 2;
numeric *= 4;
numeric /= 3;
numeric %= 3;
numeric **= 3;
numeric <<= 2;
numeric >>= 1;
numeric >>>= 2;
numeric |= 8;
numeric &= 10;
numeric ^= 3;
console.log("numeric", numeric);

let rightCount = 0;
let andValue = 1;
let orValue = 0;
let nullishValue = null;
andValue &&= (rightCount += 1, 5);
orValue ||= (rightCount += 1, 6);
nullishValue ??= (rightCount += 1, 7);
let falseValue = false;
let truthyValue = 8;
let definedValue = 0;
falseValue &&= (rightCount += 10, true);
truthyValue ||= (rightCount += 10, 9);
definedValue ??= (rightCount += 10, 10);
console.log(
  "logical",
  andValue,
  orValue,
  nullishValue,
  falseValue,
  truthyValue,
  definedValue,
  rightCount,
);

let order = "";
const holder = { value: 2 };
function target() {
  order += "object ";
  return holder;
}
function key() {
  order += "key ";
  return "value";
}
function right() {
  order += "right ";
  return 3;
}
const memberResult = target()[key()] += right();
console.log("member", memberResult, holder.value, order);

order = "";
holder.value = 0;
const shortResult = target()[key()] &&= right();
console.log("short", shortResult, holder.value, order);

let conversionCount = 0;
let conversionOrder = "";
const changingKey = {
  [Symbol.toPrimitive]: function () {
    conversionCount += 1;
    conversionOrder += "key" + conversionCount + " ";
    return conversionCount === 1 ? "read" : "write";
  },
};
const changingHolder = { read: 1, write: 9 };
function conversionRight() {
  conversionOrder += "right ";
  return 2;
}
const conversionResult = changingHolder[changingKey] += conversionRight();
console.log(
  "conversion",
  conversionResult,
  changingHolder.read,
  changingHolder.write,
  conversionCount,
  conversionOrder,
);

let logicalConversionCount = 0;
let logicalConversionOrder = "";
const logicalChangingKey = {
  [Symbol.toPrimitive]: function () {
    logicalConversionCount += 1;
    logicalConversionOrder += "key" + logicalConversionCount + " ";
    return logicalConversionCount === 1 ? "read" : "write";
  },
};
const logicalChangingHolder = { read: 0, write: 9 };
function logicalConversionRight() {
  logicalConversionOrder += "right ";
  return 2;
}
const logicalConversionResult =
  logicalChangingHolder[logicalChangingKey] ||= logicalConversionRight();
console.log(
  "logical-conversion",
  logicalConversionResult,
  logicalChangingHolder.read,
  logicalChangingHolder.write,
  logicalConversionCount,
  logicalConversionOrder,
);

let skippedConversionCount = 0;
const skippedChangingKey = {
  [Symbol.toPrimitive]: function () {
    skippedConversionCount += 1;
    return skippedConversionCount === 1 ? "read" : "write";
  },
};
const skippedChangingHolder = { read: 1, write: 9 };
const skippedConversionResult =
  skippedChangingHolder[skippedChangingKey] ||= 2;
console.log(
  "skipped-conversion",
  skippedConversionResult,
  skippedChangingHolder.read,
  skippedChangingHolder.write,
  skippedConversionCount,
);

let named;
named ||= function () {};
const namedMember = {};
namedMember.item ??= function () {};
const computedName = "computed";
namedMember[computedName] ||= function () {};
console.log(
  "names",
  named.name,
  namedMember.item.name,
  namedMember.computed.name,
);

const immutable = 1;
let immutableRight = 0;
try {
  immutable += (immutableRight += 1, 2);
} catch (error) {
  console.log(
    "immutable",
    error instanceof TypeError,
    immutable,
    immutableRight,
  );
}

let logicalImmutableRight = 0;
const lockedTruthy = 1;
const lockedFalsy = 0;
lockedTruthy ||= (logicalImmutableRight += 10, 2);
try {
  lockedFalsy ||= (logicalImmutableRight += 1, 2);
} catch (error) {
  console.log(
    "logical-immutable",
    error instanceof TypeError,
    lockedTruthy,
    lockedFalsy,
    logicalImmutableRight,
  );
}
`,
  },
  {
    name: "update-expressions",
    source: `
let binding = "1";
console.log(
  "binding",
  binding++,
  binding,
  ++binding,
  binding--,
  binding,
  --binding,
);

let negativeZero = -0;
const previousNegativeZero = negativeZero++;
let positiveInfinity = Infinity;
let notANumber = NaN;
console.log(
  "numeric-edges",
  1 / previousNegativeZero,
  negativeZero,
  positiveInfinity++,
  positiveInfinity,
  notANumber--,
  notANumber,
);

let order = "";
let conversionCount = 0;
const holder = { read: "4", write: 99 };
const changingKey = {
  [Symbol.toPrimitive]: function () {
    conversionCount += 1;
    order += "convert ";
    if (conversionCount % 2 === 1) return "read";
    return "write";
  },
};
function target() {
  order += "object ";
  return holder;
}
function key() {
  order += "key ";
  return changingKey;
}
console.log("member-postfix", target()[key()]--, holder.write, order);
order = "";
console.log("member-prefix", ++target()[key()], holder.write, order);
console.log("conversion-count", conversionCount);

let nullKeyConversionCount = 0;
const nullKey = {
  toString: function () {
    nullKeyConversionCount += 1;
    return "value";
  },
};
try {
  null[nullKey]++;
} catch (error) {
  console.log(
    "nullish-member",
    error instanceof TypeError,
    nullKeyConversionCount,
  );
}

let coercionCount = 0;
const immutable = {
  [Symbol.toPrimitive]: function () {
    coercionCount += 1;
    return "7";
  },
};
try {
  immutable++;
} catch (error) {
  console.log(
    "immutable",
    error instanceof TypeError,
    coercionCount,
    typeof immutable,
  );
}
`,
  },
  {
    name: "destructuring-assignments",
    source: `
let first;
let fallback;
let nested;
let arrayRest;
const arrayInput = [1, undefined, [3], 4, 5];
const arrayResult =
  ([first, fallback = 2, [nested], ...arrayRest] = arrayInput);
console.log(
  "array",
  arrayResult === arrayInput,
  first,
  fallback,
  nested,
  arrayRest[0],
  arrayRest[1],
);

let picked;
let objectFallback;
let objectRest;
const objectInput = { picked: 6, kept: 7 };
const objectResult =
  ({ picked, missing: objectFallback = 8, ...objectRest } = objectInput);
console.log(
  "object",
  objectResult === objectInput,
  picked,
  objectFallback,
  objectRest.kept,
);

let keyOrder = "";
let untouched = 9;
try {
  ({ [(keyOrder = keyOrder + "key")]: untouched } = null);
} catch (error) {
  console.log(
    "nullish",
    error instanceof TypeError,
    keyOrder,
    untouched,
  );
}

let closeCount = 0;
const immutable = 10;
const closingIterable = {
  [Symbol.iterator]: function () {
    return {
      next: function () {
        return { value: 11, done: false };
      },
      return: function () {
        closeCount = closeCount + 1;
        return {};
      },
    };
  },
};
try {
  [immutable] = closingIterable;
} catch (error) {
  console.log(
    "immutable",
    error instanceof TypeError,
    immutable,
    closeCount,
  );
}

let stepCloseCount = 0;
const failingIterable = {
  [Symbol.iterator]: function () {
    return {
      next: function () {
        throw new RangeError("step");
      },
      return: function () {
        stepCloseCount = stepCloseCount + 1;
        return {};
      },
    };
  },
};
try {
  [first] = failingIterable;
} catch (error) {
  console.log(
    "step",
    error instanceof RangeError,
    error.message,
    stepCloseCount,
  );
}

let inferred;
[inferred = function () {}] = [];
console.log("name", inferred.name);

async function awaitedAssignment() {
  let awaited;
  const awaitedInput = [12];
  [awaited] = await Promise.resolve(awaitedInput);
  console.log("awaited", awaited);
  let awaitedObject;
  ({ value: awaitedObject } = await Promise.resolve({ value: 13 }));
  console.log("awaited object", awaitedObject);
  const awaitedMember = {};
  [awaitedMember.value] = await Promise.resolve([14]);
  console.log("awaited member", awaitedMember.value);
}
awaitedAssignment();

let memberOrder = "";
const memberTarget = {};
const memberKey = {
  toString: function () {
    memberOrder = memberOrder + "key ";
    return "value";
  },
};
const memberIterable = {
  [Symbol.iterator]: function () {
    memberOrder = memberOrder + "iterator ";
    return {
      next: function () {
        memberOrder = memberOrder + "next ";
        return { value: 14, done: false };
      },
      return: function () {
        memberOrder = memberOrder + "close ";
        return {};
      },
    };
  },
};
[
  memberTarget[
    (memberOrder = memberOrder + "target ", memberKey)
  ],
] = memberIterable;
console.log("member array", memberOrder, memberTarget.value);

memberOrder = "";
const throwingMemberKey = {
  toString: function () {
    memberOrder = memberOrder + "key ";
    throw new RangeError("key");
  },
};
try {
  [
    memberTarget[
      (memberOrder = memberOrder + "target ", throwingMemberKey)
    ],
  ] = memberIterable;
} catch (error) {
  console.log(
    "member key error",
    error instanceof RangeError,
    error.message,
    memberOrder,
  );
}

memberOrder = "";
function memberTargetFailure() {
  memberOrder = memberOrder + "target ";
  throw new RangeError("target");
}
try {
  [memberTarget[memberTargetFailure()]] = memberIterable;
} catch (error) {
  console.log(
    "member target error",
    error instanceof RangeError,
    error.message,
    memberOrder,
  );
}

memberOrder = "";
const memberSource = { value: undefined };
({
  value: memberTarget[
    (memberOrder = memberOrder + "target ", memberKey)
  ] = (memberOrder = memberOrder + "default ", 15),
} = memberSource);
console.log("member object", memberOrder, memberTarget.value);

memberOrder = "";
[
  ...memberTarget[
    (memberOrder = memberOrder + "target ", memberKey)
  ]
] = [16, 17];
console.log(
  "member array rest",
  memberOrder,
  memberTarget.value[0],
  memberTarget.value[1],
);

memberOrder = "";
const memberRestSource = { kept: 18 };
({
  ...memberTarget[
    (memberOrder = memberOrder + "target ", memberKey)
  ]
} = memberRestSource);
console.log(
  "member object rest",
  memberOrder,
  memberTarget.value.kept,
);
`,
  },
  {
    name: "catch-bindings",
    source: `
const outer = "outer";
try {
  throw { values: [1, undefined, 3], kept: 4 };
} catch ({
  values: [first, fallback = 2, ...rest],
  missing: named = function () {},
  ...other
}) {
  console.log(
    "values",
    first,
    fallback,
    rest[0],
    named.name,
    other.kept,
    outer,
  );
}
console.log("outer", outer);

let firstClosure;
let secondClosure;
let index = 0;
while (index < 2) {
  try {
    throw [index];
  } catch ([caught]) {
    const read = function () { return caught; };
    if (index === 0) firstClosure = read;
    else secondClosure = read;
  }
  index = index + 1;
}
console.log("fresh", firstClosure(), secondClosure());

let closes = 0;
const iterable = {
  [Symbol.iterator]: function () {
    return {
      next: function () {
        return { value: undefined, done: false };
      },
      return: function () {
        closes = closes + 1;
        return {};
      },
    };
  },
};
let finalized = false;
try {
  try {
    throw iterable;
  } catch ([value = (function () { throw new RangeError("default"); })()]) {
    console.log(value);
  } finally {
    finalized = true;
  }
} catch (error) {
  console.log(
    "abrupt",
    error instanceof RangeError,
    error.message,
    closes,
    finalized,
  );
}

let stepCloses = 0;
const stepFailure = {
  [Symbol.iterator]: function () {
    return {
      next: function () { throw new TypeError("step"); },
      return: function () {
        stepCloses = stepCloses + 1;
        return {};
      },
    };
  },
};
try {
  try {
    throw stepFailure;
  } catch ([value]) {
    console.log(value);
  }
} catch (error) {
  console.log("step", error instanceof TypeError, stepCloses);
}

try {
  try {
    throw null;
  } catch ({ value }) {
    console.log(value);
  }
} catch (error) {
  console.log("nullish", error instanceof TypeError);
}
`,
  },
  {
    name: "optional-catch-binding",
    source: `
let entered = 0;
try {
  throw new RangeError("discarded");
} catch {
  entered = entered + 1;
}
console.log("entered", entered);

try {
  throw null;
} catch {
  console.log("null entered");
}

try {
  console.log("normal");
} catch {
  console.log("skipped");
} finally {
  console.log("normal finally");
}

let shadow = "outer";
try {
  shadow = "written";
  throw new Error("shadow");
} catch {
  let shadow = "catch";
  console.log("shadow", shadow);
}
console.log("after", shadow);

const closures = [];
for (let index = 0; index < 2; index = index + 1) {
  try {
    throw index;
  } catch {
    let cell = index * 10;
    closures[index] = function () {
      cell = cell + 1;
      return cell;
    };
  }
}
console.log("cells", closures[0](), closures[1](), closures[0]());

try {
  throw 1;
} catch {
  var hoisted = "from catch";
}
console.log("var", hoisted);

function returned() {
  try {
    throw new Error("inner");
  } catch {
    return "catch";
  } finally {
    console.log("returned finally");
  }
}
console.log("return", returned());

function overridden() {
  try {
    throw new Error("inner");
  } catch {
    return "catch";
  } finally {
    return "finally";
  }
}
console.log("override", overridden());

let outerReached = false;
try {
  try {
    throw new TypeError("first");
  } catch {
    throw new RangeError("second");
  } finally {
    console.log("inner finally");
  }
} catch (error) {
  outerReached = true;
  console.log("outer", error instanceof RangeError, error.message);
}
console.log("reached", outerReached);

const visits = [];
let visitCount = 0;
loop: for (let index = 0; index < 3; index = index + 1) {
  try {
    if (index === 0) throw new Error("continue");
    if (index === 1) throw new Error("break");
    visits[visitCount] = "body " + index;
    visitCount = visitCount + 1;
  } catch {
    if (index === 0) continue loop;
    break loop;
  } finally {
    visits[visitCount] = "finally " + index;
    visitCount = visitCount + 1;
  }
  visits[visitCount] = "after " + index;
  visitCount = visitCount + 1;
}
console.log("loop", visits[0], visits[1], visitCount);

function* caughtYields() {
  try {
    throw new Error("generator");
  } catch {
    yield "first";
    yield "second";
  } finally {
    yield "final";
  }
}
const iterator = caughtYields();
console.log("gen", iterator.next().value, iterator.next().value);
console.log("gen", iterator.next().value, iterator.next().done);

async function recovered() {
  try {
    throw new RangeError("async");
  } catch {
    const value = await "recovered";
    return value;
  } finally {
    console.log("async finally");
  }
}
recovered().then(function (value) {
  console.log("async", value);
});
`,
  },
  {
    name: "in-and-instanceof",
    source: `
const box = { present: undefined, value: 1 };
console.log("present" in box, "value" in box, "missing" in box);
const parent = { inherited: 1 };
const child = Object.create(parent);
console.log("inherited" in child, "own" in child);
child.own = 2;
console.log("own" in child);
console.log(0 in [10, 20], 1 in [10, 20], 2 in [10, 20]);
console.log("length" in [1], 1 in [1, , 3], 1 in { "1": true });
console.log("prototype" in function named() {});
try {
  console.log("x" in "text");
} catch (caught) {
  console.log("in-requires-object");
}
function Base(value) { this.value = value; }
const base = new Base(1);
console.log(base instanceof Base, ({}) instanceof Base);
function Derived() {}
Derived.prototype = Object.create(Base.prototype);
const derived = new Derived();
console.log(derived instanceof Derived, derived instanceof Base);
console.log(1 instanceof Base, "s" instanceof Base, null instanceof Base);
try {
  console.log(base instanceof 1);
} catch (caught) {
  console.log("callable-required");
}
const arrow = () => 1;
try {
  console.log(base instanceof arrow);
} catch (caught) {
  console.log("prototype-required");
}
`,
  },
  {
    name: "template-literals",
    source: `
const name = "world";
console.log(\`hello \${name}!\`);
console.log(\`\${1}\${2}\`, \`a\${null}b\${undefined}\`);
console.log(\`\${NaN} \${-0} \${1e21} \${0.1 + 0.2}\`);
console.log(\`multi
line\`, \`escaped\\n\\t\${"x"}\`, \`\\u{1F600}\`);
console.log(\`\${1 + 2} and \${\`nested \${name}\`}\`);
const empty = \`\`;
console.log(empty === "", \`\${true}\${false}\`, typeof \`\${1}\`);
const logging = (value) => { console.log("evaluated", value); return value; };
console.log(\`\${logging("first")}-\${logging("second")}\`);
`,
  },
  {
    name: "tagged-templates",
    nonStrictScript: true,
    source: `
function basic(strings) {
  console.log("basic", strings[0], strings.length, strings.raw.length);
}
basic\`hello\`;

function identity(strings) { return strings; }
const identityResult = identity\`identity\`;
console.log(
  "identity",
  identityResult[0],
  identityResult.raw[0],
);

function inspect(strings, first, second) {
  console.log(
    "inspect",
    strings[0] === "line\\n",
    strings.raw[0] === "line\\\\n",
    strings[1],
    strings.raw[1],
    first,
    second,
  );
  return "custom-result";
}
console.log("custom", inspect\`line\\n\${1}middle\${2}tail\`);

const descriptor = Object.getOwnPropertyDescriptor(identityResult, "0");
const rawDescriptor =
  Object.getOwnPropertyDescriptor(identityResult, "raw");
console.log(
  "descriptors",
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
  rawDescriptor.writable,
  rawDescriptor.enumerable,
  rawDescriptor.configurable,
);
identityResult.extra = 1;
identityResult.raw.extra = 1;
identityResult[0] = "changed";
console.log(
  "frozen",
  identityResult.extra,
  identityResult.raw.extra,
  identityResult[0],
);

function cached() { return identity\`cache\`; }
console.log("cached", cached() === cached());

function invalidEscape(strings) {
  console.log(
    "invalid escape",
    strings[0],
    strings.raw[0] === "\\\\xg",
  );
}
invalidEscape\`\\xg\`;

const receiver = {
  value: 9,
  tag(strings, value) { return this.value + value; },
};
console.log("receiver", receiver.tag\`value \${3}\`);

let tagOrder = "";
function throwingTag() {
  tagOrder = tagOrder + "tag ";
  throw "tag-error";
}
function substitution() {
  tagOrder = tagOrder + "substitution ";
  return 1;
}
try {
  throwingTag\`value \${substitution()}\`;
} catch (error) {
  console.log(error, tagOrder);
}

let substitutionCalls = 0;
function untouched() {
  substitutionCalls = substitutionCalls + 1;
}
function throwingSubstitution() { throw "substitution-error"; }
try {
  untouched\`value \${throwingSubstitution()}\`;
} catch (error) {
  console.log(error, substitutionCalls);
}
`,
  },
  {
    name: "sync-arrows",
    source: `
const double = (value) => value * 2;
const add = (left, right) => { return left + right; };
console.log(double(21), add(1, 2));
console.log(double.name, double.length, add.length);
const outer = {
  value: "captured",
  read: function () { return (() => this.value)(); },
};
console.log(outer.read());
const chain = (a) => (b) => a + b;
console.log(chain("first-")("second"));
try {
  new double(1);
} catch (caught) {
  console.log("not constructible");
}
const noParen = value => value + "!";
console.log(noParen("bang"));
console.log(typeof double, (() => 7)());
let counter = 0;
const touch = () => { counter = counter + 1; return counter; };
touch();
touch();
console.log(counter);
const picky = (first) => typeof first;
console.log(picky(double), picky(undefined));
`,
  },
  {
    name: "var-declarations",
    source: `
console.log(typeof hoisted, hoisted);
var hoisted = 1;
console.log(hoisted);
var hoisted = 2;
console.log(hoisted);
function scoped() {
  var value = "function";
  if (true) { var value = "block"; }
  while (false) { var loop = 1; }
  console.log(value, typeof loop, loop);
  return value;
}
console.log(scoped());
function paramShadow(a) { var a; console.log(a); var a = 2; return a; }
console.log(paramShadow(1), paramShadow(undefined));
function fnVar() { var g; function g() {} return typeof g; }
console.log(fnVar());
function fnVarAssigned() { var g = 1; function g() {} return typeof g; }
console.log(fnVarAssigned());
function bare() { var missing; return missing; }
console.log(bare());
let outer = "let-outer";
{ var shadowless = outer; }
console.log(shadowless);
var chain = 1, second = chain + 1, third;
console.log(chain, second, third);
console.log(before());
function before() { return "function hoisted"; }
do { var doVar = "do"; } while (false);
console.log(doVar);
function readsLate() { return late; var late; }
console.log(readsLate());
try { console.log("try"); } catch (caught) { var inCatch = 1; }
console.log(typeof inCatch);
`,
  },
  {
    name: "lexical-declaration-lists",
    source: `
function mark(label, value) {
  console.log("eval", label);
  return value;
}
function boom(label) {
  throw new RangeError(label);
}

let first = mark("first", 1), second = mark("second", first + 1);
const third = mark("third", second + 1), fourth = mark("fourth", third + 1);
let bare, paired = 5;
console.log("values", first, second, third, fourth, bare, paired);

// Every name of the list is created before the first initializer runs,
// so a read of a later name is a temporal dead zone error.
let listTdz = "none";
try {
  let early = later, later = 2;
  console.log("unreachable", early, later);
} catch (error) {
  listTdz = error instanceof ReferenceError ? "reference" : error.name;
}
let closureTdz = "none";
try {
  const readLater = () => laterName;
  let early = readLater(), laterName = 2;
  console.log("unreachable", early, laterName);
} catch (error) {
  closureTdz = error instanceof ReferenceError ? "reference" : error.name;
}
console.log("list-tdz", listTdz, closureTdz);

// An abrupt initializer stops the list, and the names that follow it
// stay uninitialized in the scope their closures captured.
let reader;
let abruptOutcome = "none";
try {
  {
    reader = () => trailing;
    let leading = mark("leading", 1), thrown = boom("stop"),
      trailing = mark("trailing", 3);
    console.log("unreachable", leading, thrown, trailing);
  }
} catch (error) {
  abruptOutcome = error.message;
}
console.log("abrupt", abruptOutcome);
try {
  reader();
} catch (error) {
  console.log("abrupt-tdz", error instanceof ReferenceError);
}

// Recursive patterns and plain names mix inside one list.
const [patternFirst, [patternNested] = [7]] = [6],
  { renamed: patternRenamed, missing: patternDefault = 9 } = { renamed: 8 },
  patternPlain = 10;
console.log(
  "patterns",
  patternFirst,
  patternNested,
  patternRenamed,
  patternDefault,
  patternPlain
);

// Each pattern of the list closes its own unexhausted iterator, in
// declarator order, and an abrupt default stops the declarators after it.
let closes = "";
function source(values, label) {
  return {
    [Symbol.iterator]: function () {
      let index = 0;
      return {
        next: function () {
          if (index >= values.length) return { value: undefined, done: true };
          const value = values[index];
          index = index + 1;
          return { value: value, done: false };
        },
        return: function () {
          closes = closes + label;
          return {};
        },
      };
    },
  };
}
const [normalFirst] = source([1, 2], "a"), [normalSecond] = source([3, 4], "b");
console.log("closed", closes, normalFirst, normalSecond);

closes = "";
let cleanupOutcome = "none";
try {
  let [kept, defaulted = boom("default")] = source([11, undefined, 12], "c"),
    [unreached] = source([13, 14], "d");
  console.log("unreachable", kept, defaulted, unreached);
} catch (error) {
  cleanupOutcome = error.message;
}
console.log("cleanup", cleanupOutcome, closes);

// Every iteration gives the whole list fresh cells, so a closure made in
// one iteration never observes another iteration's value.
const captured = [];
for (let index = 0; index < 3; index = index + 1) {
  let doubled = index * 2, capture = () => doubled;
  doubled = doubled + 1;
  captured[index] = capture;
}
console.log("loop", captured[0](), captured[1](), captured[2]());

// A switch shares one case-block scope across its clauses, and a static
// block owns its own.
switch (1) {
  case 1: {
    let inner = 1, sibling = inner + 1;
    console.log("case", inner, sibling);
    break;
  }
  default:
    let fallback = 0, spare = fallback;
    console.log("default", fallback, spare);
}

class Holder {
  static value;
  static {
    let blockFirst = 3, blockSecond = blockFirst + 1;
    Holder.value = blockFirst + blockSecond;
  }
}
console.log("static-block", Holder.value);
`,
  },
  {
    name: "lexical-declaration-list-hints",
    source: `
/** @param {number} left @param {number} right @returns {number} */
function add(left, right) {
  return left + right;
}
let hinted: number = 20, alsoHinted: number = 22;
console.log("hinted", add(hinted, alsoHinted));

// The same list initializes a binding whose hint is false, so the
// specialized path guards, misses, and reaches the compiled generic
// fallback while its truthful sibling keeps hitting.
let truthful: number = 1,
  falsified: number = {
    valueOf: function () {
      console.log("guard miss fallback");
      return 2;
    },
  };
console.log("mixed", add(truthful, 1), add(falsified, 1));
`,
    specialization: {
      genericCallsDisabled: 3,
      genericCallsEnabled: 1,
      hits: 2,
      misses: 1,
      overflowMisses: 0,
    },
  },
];
