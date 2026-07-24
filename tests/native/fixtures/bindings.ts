import type { Fixture } from "../fixture.ts";

export const bindingFixtures: readonly Fixture[] = [
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
];
