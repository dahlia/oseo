import type { Fixture } from "../fixture.ts";

export const objectFixtures: readonly Fixture[] = [
  {
    name: "object-reflection",
    source: `
const firstPrototype = { inherited: 9 };
const value = Object.create(firstPrototype);
console.log(Object.defineProperty(value, "fixed", {
  value: 1,
  writable: false,
  enumerable: true,
  configurable: false,
}) === value);
Object.defineProperty(value, "hidden", { value: 2 });
value.extra = 3;
value["10"] = "ten";
value["2"] = "two";
console.log(value.fixed, value.inherited);
const descriptor = Object.getOwnPropertyDescriptor(value, "fixed");
console.log(
  descriptor.value,
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
);
const inheritedValue = { item: 8 };
const inheritedDescriptor = Object.create({ writable: false });
Object.defineProperty(inheritedValue, "item", inheritedDescriptor);
const inheritedResult = Object.getOwnPropertyDescriptor(
  inheritedValue,
  "item",
);
console.log(
  inheritedResult.value,
  inheritedResult.writable,
  inheritedResult.enumerable,
  inheritedResult.configurable,
);
console.log(Object.getOwnPropertyDescriptor(value, "missing"));
const keys = Object.keys(value);
console.log(keys[0], keys[1], keys[2], keys[3], keys.length);
const secondPrototype = { inherited: 11 };
console.log(Object.setPrototypeOf(value, secondPrototype) === value);
console.log(value.inherited);
try {
  Object.defineProperty(value, "fixed", { value: 4 });
} catch (error) {
  console.log("redefinition rejected");
}
const detached = Object.create(null);
console.log(detached.missing);
function FunctionPrototypeOwner() {}
const functionPrototypeChild = Object.create(FunctionPrototypeOwner);
console.log(
  functionPrototypeChild.prototype === FunctionPrototypeOwner.prototype,
);
Object.defineProperty(FunctionPrototypeOwner, "prototype", {
  writable: false,
});
function strictSyntheticSet() {
  "use strict";
  try { functionPrototypeChild.prototype = {}; } catch (error) {
    console.log("inherited function prototype rejected");
  }
}
strictSyntheticSet();
const arrayPrototype = [];
const arrayPrototypeChild = Object.create(arrayPrototype);
console.log(arrayPrototypeChild.length);
Object.defineProperty(arrayPrototype, "length", { writable: false });
function strictInheritedLengthSet() {
  "use strict";
  try { arrayPrototypeChild.length = 0; } catch (error) {
    console.log("inherited array length rejected");
  }
}
strictInheritedLengthSet();
const stringKeys = Object.keys("ab");
console.log(stringKeys[0], stringKeys[1], stringKeys.length);
console.log(Object.keys(1).length, Object.keys(true).length);
const stringIndexDescriptor = Object.getOwnPropertyDescriptor("ab", "0");
console.log(
  stringIndexDescriptor.value,
  stringIndexDescriptor.writable,
  stringIndexDescriptor.enumerable,
  stringIndexDescriptor.configurable,
);
const stringLengthDescriptor = Object.getOwnPropertyDescriptor(
  "ab",
  "length",
);
console.log(
  stringLengthDescriptor.value,
  stringLengthDescriptor.writable,
  stringLengthDescriptor.enumerable,
  stringLengthDescriptor.configurable,
);
console.log(Object.getOwnPropertyDescriptor(1, "missing"));
console.log(Object.setPrototypeOf(1, null));
try { Object.keys(null); } catch (error) { console.log("null keys"); }
try { Object.getOwnPropertyDescriptor(null, "item"); } catch (error) {
  console.log("null descriptor");
}
try { Object.setPrototypeOf(null, null); } catch (error) {
  console.log("null set prototype");
}
try { Object.setPrototypeOf(1, 1); } catch (error) {
  console.log("invalid primitive prototype");
}
`,
  },
  {
    name: "descriptor-redefinition",
    nonStrictScript: true,
    source: `
const value = { item: 7 };
Object.defineProperty(value, "item", { writable: false });
const descriptor = Object.getOwnPropertyDescriptor(value, "item");
console.log(
  descriptor.value,
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
);
const values = [];
Object.defineProperty(values, "4", {
  value: 4,
  configurable: false,
});
Object.defineProperty(values, "2", {
  value: 2,
  configurable: true,
});
try {
  Object.defineProperty(values, "length", { value: 1, writable: false });
} catch (error) {
  console.log("length rejected");
}
console.log(values.length, values[2], values[4]);
values[5] = 5;
const lengthDescriptor = Object.getOwnPropertyDescriptor(values, "length");
console.log(values.length, values[5], lengthDescriptor.writable);
let coerced = [1, 2, 3];
coerced.length = "1";
console.log(coerced.length, coerced[1]);
coerced = [1, 2];
coerced.length = false;
console.log(coerced.length, coerced[0]);
coerced = [1, 2];
coerced.length = null;
console.log(coerced.length, coerced[0]);
function DescriptorFunction() {}
const originalPrototype = DescriptorFunction.prototype;
Object.defineProperty(DescriptorFunction, "prototype", { writable: false });
const functionDescriptor = Object.getOwnPropertyDescriptor(
  DescriptorFunction,
  "prototype",
);
DescriptorFunction.prototype = { replaced: true };
console.log(
  functionDescriptor.writable,
  DescriptorFunction.prototype === originalPrototype,
);
try {
  Object.defineProperty(DescriptorFunction, "prototype", { value: {} });
} catch (error) {
  console.log("function prototype rejected");
}
const frozenLength = [1];
Object.defineProperty(frozenLength, "length", { writable: false });
function strictSameLengthSet() {
  "use strict";
  try { frozenLength.length = frozenLength.length; } catch (error) {
    console.log("same frozen length rejected");
  }
}
strictSameLengthSet();
const assignedLength = [];
Object.defineProperty(assignedLength, "4", {
  value: 4,
  configurable: false,
});
try {
  assignedLength.length = 1;
  console.log("non-strict length assignment completed");
} catch (error) {
  console.log("non-strict length assignment threw");
}
console.log(assignedLength.length, assignedLength[4]);
`,
  },
  {
    name: "catchable-type-errors",
    source: `
const fixed = {};
Object.defineProperty(fixed, "item", {
  value: 1,
  writable: false,
});
function strictErrors() {
  "use strict";
  try { fixed.item = 2; } catch (error) { console.log("strict set"); }
  try { delete fixed.item; } catch (error) { console.log("strict delete"); }
}
strictErrors();
let firstError;
try { const value = 1; value(); } catch (error) {
  firstError = error;
  console.log("not callable", error === undefined, error === null);
}
try { null.item; } catch (error) {
  console.log("null receiver", error === undefined, error === firstError);
}
try { Object.create(1); } catch (error) { console.log("invalid prototype"); }
console.log((1).missing, true.missing, "abc".length, "abc"[1]);
try { tdzRead; } catch (error) { console.log("tdz read"); }
let tdzRead;
try { tdzWrite = 1; } catch (error) { console.log("tdz write"); }
let tdzWrite;
const immutable = 1;
try { immutable = 2; } catch (error) {
  console.log(
    "const write",
    error instanceof TypeError,
    !(error instanceof ReferenceError),
  );
}
if (false) immutable = 3;
console.log(immutable);
`,
  },
  {
    name: "error-intrinsics",
    source: `
try { const callee = 1; callee(); } catch (error) {
  console.log("call", error instanceof TypeError, error.name);
}
try { null.item; } catch (error) {
  console.log("nullish", error instanceof TypeError,
    error.constructor === TypeError);
}
try { tdz; } catch (error) {
  console.log("tdz", error instanceof ReferenceError, error.name);
}
let tdz;
const frozen = 1;
try { frozen = 2; } catch (error) { console.log("const", error.name); }
const numbers = [1];
try { numbers.length = -1; } catch (error) {
  console.log("length", error instanceof RangeError, error.name);
}
console.log(numbers.length);
try { 1 instanceof 2; } catch (error) { console.log("io", error.name); }
try { "x" in 5; } catch (error) { console.log("in", error.name); }
const plain = new Error("plain message");
console.log(plain.message, plain.name, plain.toString());
console.log(plain instanceof Error, plain instanceof TypeError);
const typed = TypeError("typed message");
console.log(typed instanceof TypeError, typed instanceof Error);
console.log(typed.toString(), typeof typed);
const withCause = new RangeError("ranged", { cause: "why" });
console.log(withCause.cause, withCause.message, withCause.toString());
const causeless = new Error("bare options", {});
console.log(causeless.cause, "cause" in causeless);
const bare = new ReferenceError();
console.log(bare.message === "", bare.name, bare.toString());
const numbered = new SyntaxError(123);
console.log(numbered.message, numbered.toString());
const evalish = new EvalError("e");
const uriish = new URIError("u");
console.log(evalish.name, uriish.name);
console.log(evalish instanceof Error, uriish instanceof Error);
console.log(typeof Error, typeof TypeError, Error.name, TypeError.name);
console.log(Error.length, TypeError.length);
console.log(Error.prototype.name, Error.prototype.message);
console.log(TypeError.prototype.name, TypeError.prototype.message);
console.log(TypeError.prototype instanceof Error);
console.log(Error.prototype.constructor === Error);
console.log(TypeError.prototype.constructor === TypeError);
console.log(new TypeError("t") instanceof RangeError);
function shadowed() { const TypeError = "local"; return typeof TypeError; }
console.log(shadowed());
try { throw new TypeError("rethrown"); } catch (error) {
  console.log(error.message, error.name);
}
const renamed = new Error("custom");
renamed.name = "Custom";
console.log(renamed.toString(), renamed.name, renamed instanceof Error);
`,
  },
  {
    name: "iterators",
    source: `
const nums = [11, 22, 33];
const iter = nums[Symbol.iterator]();
console.log(typeof iter, typeof iter.next);
console.log(iter.next().value, iter.next().value);
console.log(iter.next().value, iter.next().done, iter.next().value);
console.log(nums[Symbol.iterator]() === nums[Symbol.iterator]());
const selfIter = nums[Symbol.iterator]();
console.log(selfIter[Symbol.iterator]() === selfIter);
iter.extra = 5;
console.log(iter.extra, typeof iter);
const overridden = [1, 2];
overridden[Symbol.iterator] = function () {
  return { next: function () { return { value: 9, done: true }; } };
};
const oi = overridden[Symbol.iterator]();
console.log(oi.next().done, oi.next().value);
const ownNext = nums[Symbol.iterator]();
ownNext.next = function () { return { value: 99, done: true }; };
console.log(ownNext.next().value, ownNext.next().done);
const ownIterable = {
  [Symbol.iterator]: function () {
    let calls = 0;
    return {
      next: function () {
        calls = calls + 1;
        this.next = function () { return { value: -1, done: false }; };
        return { value: calls, done: calls > 2 };
      },
    };
  },
};
Promise.all(ownIterable).then(function (values) {
  console.log("captured", values, values.length);
});
console.log("next" in iter, Symbol.iterator in iter, "value" in iter);
console.log(Symbol.iterator in nums, "length" in nums);
console.log("next" in ({}), Symbol.iterator in ({}));
function report(label) {
  return function (value) { console.log(label, value, value.length); };
}
Promise.all([1, 2, 3]).then(report("all"));
Promise.all([]).then(report("empty"));
Promise.race([Promise.resolve("fast"), 2]).then(function (v) {
  console.log("race", v);
});
let step = 0;
const iterable = {
  [Symbol.iterator]: function () {
    return {
      next: function () {
        step = step + 1;
        return { value: step * 10, done: step > 2 };
      },
    };
  },
};
Promise.all(iterable).then(report("iterable"));
Promise.all(5).then(null, function (error) {
  console.log("bad", error instanceof TypeError);
});
const throwingNext = {
  [Symbol.iterator]: function () {
    return { next: function () { throw new RangeError("boom"); } };
  },
};
Promise.all(throwingNext).then(null, function (error) {
  console.log("throw", error instanceof RangeError);
});
let releaseCount = 0;
const badThen = Promise.resolve(1);
badThen.then = function () { throw new RangeError("bad then"); };
const closeIterable = {
  [Symbol.iterator]: function () {
    let step = 0;
    return {
      next: function () {
        step = step + 1;
        return { value: step === 1 ? badThen : step, done: step > 2 };
      },
      return: function () { releaseCount = releaseCount + 1; return {}; },
    };
  },
};
Promise.all(closeIterable).then(null, function (error) {
  console.log("close", error instanceof RangeError, releaseCount);
});
function abruptCloseIterable(makeReturn) {
  return {
    [Symbol.iterator]: function () {
      let step = 0;
      return {
        next: function () {
          step = step + 1;
          return { value: step === 1 ? badThen : step, done: step > 2 };
        },
        return: makeReturn,
      };
    },
  };
}
const throwingReturn = abruptCloseIterable(function () {
  throw new TypeError("return threw");
});
Promise.all(throwingReturn).then(null, function (error) {
  console.log("throw-return", error instanceof RangeError, error.message);
});
const primitiveReturn = abruptCloseIterable(function () { return 5; });
Promise.all(primitiveReturn).then(null, function (error) {
  console.log("primitive-return", error instanceof RangeError, error.message);
});
`,
  },
  {
    name: "for-of",
    source: `
let sum = 0;
for (const value of [1, 2, 3]) { sum = sum + value; }
console.log("sum", sum);

const readers = [];
let readerCount = 0;
for (let value of [4, 5]) {
  readers[readerCount] = function () { return value; };
  readerCount = readerCount + 1;
}
console.log("cells", readers[0](), readers[1]());

var retained = 0;
for (var retained of [7, 8]) {}
let assigned = 0;
const holder = {};
for (assigned of [9]) {}
for (holder.value of [10]) {}
console.log("targets", retained, assigned, holder.value);

const patternReaders = [];
let patternReaderCount = 0;
for (const [head, ...tail] of [[1, 2], [3, 4]]) {
  patternReaders[patternReaderCount] = function () {
    return head + tail[0];
  };
  patternReaderCount = patternReaderCount + 1;
}
for (let { value = 5, ...other } of [{ extra: 6 }]) {
  console.log("object-pattern", value, other.extra);
}
var [retainedPattern] = [0];
for (var [retainedPattern] of [[11]]) {}
console.log(
  "patterns",
  patternReaders[0](),
  patternReaders[1](),
  retainedPattern,
);
for (const [inferred = function () {}] of [[]]) {
  console.log("pattern-name", inferred.name);
}

let assignmentHead = 0;
const assignmentHolder = {};
for ([assignmentHead, assignmentHolder.value] of [[12, 13]]) {}
for (
  { value: assignmentHead, ...assignmentHolder.rest } of
  [{ value: 14, extra: 15 }]
) {}
console.log(
  "assignment-patterns",
  assignmentHead,
  assignmentHolder.value,
  assignmentHolder.rest.extra,
);

let normalSteps = 0;
let normalCloses = 0;
const normalIterable = {
  [Symbol.iterator]: function () {
    return {
      next: function () {
        normalSteps = normalSteps + 1;
        this.next = function () { return { value: -1, done: false }; };
        return { value: normalSteps, done: normalSteps > 2 };
      },
      return: function () { normalCloses = normalCloses + 1; return {}; },
    };
  },
};
for (const value of normalIterable) {
  if (value === 1) continue;
  console.log("normal", value);
}
console.log("normal-state", normalSteps, normalCloses);

function closingIterable(onReturn) {
  return {
    [Symbol.iterator]: function () {
      let step = 0;
      return {
        next: function () {
          step = step + 1;
          return { value: step, done: step > 2 };
        },
        return: onReturn,
      };
    },
  };
}

let breakCloses = 0;
for (const value of closingIterable(function () {
  breakCloses = breakCloses + 1;
  return {};
})) { break; }
console.log("break", breakCloses);

const immutableTarget = 0;
let assignmentCloses = 0;
try {
  for (immutableTarget of closingIterable(function () {
    assignmentCloses = assignmentCloses + 1;
    return {};
  })) {}
} catch (error) {
  console.log("assignment", error instanceof TypeError, assignmentCloses);
}

let patternAssignmentCloses = 0;
try {
  for ([immutableTarget] of closingIterable(function () {
    patternAssignmentCloses = patternAssignmentCloses + 1;
    return {};
  })) {}
} catch (error) {
  console.log(
    "pattern-assignment",
    error instanceof TypeError,
    patternAssignmentCloses,
  );
}

let returnCloses = 0;
function takeFirst(iterable) {
  for (const value of iterable) { return value; }
  return 0;
}
console.log("return", takeFirst(closingIterable(function () {
  returnCloses = returnCloses + 1;
  return {};
})), returnCloses);

let outerCloses = 0;
outer: for (const outerValue of [1, 2]) {
  for (const innerValue of closingIterable(function () {
    outerCloses = outerCloses + 1;
    return {};
  })) {
    if (innerValue === outerValue) continue outer;
  }
}
console.log("outer", outerCloses);

try {
  for (const value of closingIterable(function () {
    throw new TypeError("close throw");
  })) { break; }
} catch (error) {
  console.log("break precedence", error instanceof TypeError, error.message);
}

let throwCloses = 0;
try {
  for (const value of closingIterable(function () {
    throwCloses = throwCloses + 1;
    throw new TypeError("suppressed close");
  })) { throw new RangeError("body throw"); }
} catch (error) {
  console.log(
    "throw precedence",
    error instanceof RangeError,
    error.message,
    throwCloses,
  );
}

let nextCloses = 0;
const throwingNext = {
  [Symbol.iterator]: function () {
    return {
      next: function () { throw new RangeError("next throw"); },
      return: function () { nextCloses = nextCloses + 1; return {}; },
    };
  },
};
try {
  for (const value of throwingNext) {}
} catch (error) {
  console.log("next", error instanceof RangeError, nextCloses);
}

try {
  for (let lexical of lexical) {}
} catch (error) {
  console.log("tdz", error instanceof ReferenceError);
}

let patternTdz = false;
for (const attempt of [1, 2]) {
  try {
    for (
      const [patternLexical] of
      attempt === 1 ? [[12]] : patternLexical
    ) {}
  } catch (error) {
    patternTdz = error instanceof ReferenceError;
  }
}
console.log("pattern-tdz", patternTdz);

let patternFailureCloses = 0;
const nullPatternIterable = {
  [Symbol.iterator]: function () {
    let done = false;
    return {
      next: function () {
        if (done) return { value: undefined, done: true };
        done = true;
        return { value: null, done: false };
      },
      return: function () {
        patternFailureCloses = patternFailureCloses + 1;
        return {};
      },
    };
  },
};
try {
  for (const { value } of nullPatternIterable) {}
} catch (error) {
  console.log(
    "pattern-failure",
    error instanceof TypeError,
    patternFailureCloses,
  );
}

let patternCloseOrder = "";
const nestedPatternIterable = {
  [Symbol.iterator]: function () {
    return {
      next: function () { return { value: 1, done: false }; },
      return: function () {
        patternCloseOrder = patternCloseOrder + "inner";
        return {};
      },
    };
  },
};
const outerPatternIterable = {
  [Symbol.iterator]: function () {
    let done = false;
    return {
      next: function () {
        if (done) return { value: undefined, done: true };
        done = true;
        return { value: [nestedPatternIterable], done: false };
      },
      return: function () {
        patternCloseOrder = patternCloseOrder + "-outer";
        return {};
      },
    };
  },
};
function failPatternDefault() {
  throw new RangeError("pattern default");
}
try {
  for (
    const [[nestedValue], missing = failPatternDefault()] of
    outerPatternIterable
  ) {}
} catch (error) {
  console.log(
    "pattern-close-order",
    error instanceof RangeError,
    error.message,
    patternCloseOrder,
  );
}
patternCloseOrder = "";
try {
  for ([[immutableTarget]] of outerPatternIterable) {}
} catch (error) {
  console.log(
    "assignment-pattern-close-order",
    error instanceof TypeError,
    patternCloseOrder,
  );
}

let nullishMemberOrder = "";
const nullishMemberKey = {
  toString: function () {
    nullishMemberOrder = nullishMemberOrder + "convert ";
    return "value";
  },
};
const nullishMemberInner = {
  [Symbol.iterator]: function () {
    return {
      next: function () {
        nullishMemberOrder = nullishMemberOrder + "inner-next ";
        return { value: 1, done: false };
      },
      return: function () {
        nullishMemberOrder = nullishMemberOrder + "inner-close ";
        return {};
      },
    };
  },
};
const nullishMemberOuter = {
  [Symbol.iterator]: function () {
    let done = false;
    return {
      next: function () {
        if (done) return { value: undefined, done: true };
        done = true;
        nullishMemberOrder = nullishMemberOrder + "outer-next ";
        return { value: nullishMemberInner, done: false };
      },
      return: function () {
        nullishMemberOrder = nullishMemberOrder + "outer-close ";
        return {};
      },
    };
  },
};
try {
  for (
    [
      null[
        (
          nullishMemberOrder = nullishMemberOrder + "key-expr ",
          nullishMemberKey
        )
      ],
    ] of nullishMemberOuter
  ) {}
} catch (error) {
  console.log(
    "nullish-assignment-member",
    error instanceof TypeError,
    nullishMemberOrder,
  );
}
`,
  },
  {
    name: "symbols",
    source: `
const first = Symbol("mark");
const second = Symbol("mark");
console.log(typeof first, first === second, first === first);
console.log(first, Symbol(), Symbol(42));
console.log(typeof Symbol, typeof Symbol.iterator, typeof Symbol.toPrimitive);
console.log(typeof Symbol.toStringTag, Symbol.iterator === Symbol.iterator);
console.log(typeof Symbol.prototype, Symbol.prototype === Symbol.prototype);
const protoDesc = Object.getOwnPropertyDescriptor(Symbol, "prototype");
console.log(protoDesc.writable, protoDesc.enumerable, protoDesc.configurable);
try {
  new Symbol();
} catch (error) {
  console.log("construct", error instanceof TypeError);
}
try {
  \`\${first}\`;
} catch (error) {
  console.log("template", error instanceof TypeError);
}
try {
  first + 1;
} catch (error) {
  console.log("add", error instanceof TypeError);
}
try {
  first * 2;
} catch (error) {
  console.log("multiply", error instanceof TypeError);
}
const store = {};
store[first] = "symbol keyed";
console.log(store[first], store[second], first in store);
console.log(Object.keys(store).length);
store.visible = 1;
console.log(Object.keys(store).length, Object.keys(store)[0]);
const reported = Object.getOwnPropertyDescriptor(store, first);
console.log(reported.value, reported.enumerable);
console.log(delete store[first], store[first], first in store);
const custom = {};
custom[Symbol.toPrimitive] = function (hint) { return hint; };
console.log(custom + "", \`\${custom}\`, custom * 1, custom == "default");
const poisonedHint = {};
poisonedHint[Symbol.toPrimitive] = 5;
try {
  poisonedHint + 1;
} catch (error) {
  console.log("uncallable", error instanceof TypeError);
}
const objectHint = {};
objectHint[Symbol.toPrimitive] = function () { return {}; };
try {
  objectHint + 1;
} catch (error) {
  console.log("object result", error instanceof TypeError);
}
console.log(first == second, first == first, first == "Symbol(mark)");
console.log(!first, first ? "truthy" : "falsy");
const boxed = { inner: Symbol("inner") };
console.log(boxed.inner === boxed.inner, typeof boxed.inner);
const namedKey = Symbol("named");
const named = { [namedKey]: function () {} };
console.log(named[namedKey].name);
const bareKey = Symbol();
const bare = { [bareKey]: function () {} };
console.log(named[namedKey].name.length, bare[bareKey].name.length);
`,
  },
  {
    name: "to-primitive",
    source: `
const box = { valueOf: function () { return 7; } };
console.log(box * 3, box + 1, box + "", box < 10, box == 7);
const speaker = { toString: function () { return "spoken"; } };
console.log(speaker + "!", speaker == "spoken");
console.log(\`template \${speaker}\`);
const both = {
  toString: function () { return "text"; },
  valueOf: function () { return 5; },
};
console.log(both + 1, both * 2, \`\${both}\`, both < 6, both == 5);
const ordered = [];
const noisy = {
  toString: function () {
    ordered[ordered.length] = "toString";
    return {};
  },
  valueOf: function () {
    ordered[ordered.length] = "valueOf";
    return 2;
  },
};
console.log(noisy + 0);
console.log(\`\${noisy}\`);
console.log(ordered + "");
console.log({} + 1, {} * 1, "" + {});
console.log([1, 2] + "", [] + 1, [[1, [2, 3]], 4] + "");
console.log([null, undefined, 1] + "");
const cycle = [1];
cycle[1] = cycle;
console.log(cycle + "");
console.log(\`\${new TypeError("boom")}\`);
const fallback = {
  toString: function () { return "fb"; },
  valueOf: function () { return {}; },
};
console.log(fallback + 1);
const opaque = {
  toString: function () { return {}; },
  valueOf: function () { return {}; },
};
try {
  opaque + 1;
} catch (error) {
  console.log("opaque", error instanceof TypeError);
}
const bare = Object.create(null);
try {
  bare + 1;
} catch (error) {
  console.log("bare", error instanceof TypeError);
}
const thrower = {
  valueOf: function () { throw new RangeError("inside valueOf"); },
};
try {
  thrower * 2;
} catch (error) {
  console.log(error.name, error.message);
}
console.log([2] == 2, {} == "[object Object]", 2 < [3], [10] >= 9);
const store = {};
store[[1, 2]] = "keyed";
console.log(store["1,2"]);
console.log(-{}, +[], ~[], [2] ** 2, [8] >> [1], [6] % [4]);
const joiner = [1, 2];
joiner.join = function () { return "custom-join"; };
console.log(joiner + "");
function probe() {}
console.log(probe * 2);
const described = function () {};
described.toString = function () { return "described"; };
console.log(described + "!", described * 1);
function poisoned() {}
poisoned.valueOf = function () { return {}; };
console.log(+poisoned, poisoned * 3);
const arrayHeir = Object.create([1, 2]);
arrayHeir.join = 5;
console.log(arrayHeir + "");
const numberJoin = [1, 2];
numberJoin.join = 5;
console.log(numberJoin + "");
const functionHeir = Object.create(probe);
try {
  functionHeir + "";
} catch (error) {
  console.log("function heir", error instanceof TypeError);
}
try {
  +functionHeir;
} catch (error) {
  console.log("numeric function heir", error instanceof TypeError);
}
const plainHeir = Object.create({ answer: 42 });
console.log(plainHeir + "", +plainHeir);
const retagged = [1, 2];
Object.setPrototypeOf(retagged, {});
console.log(retagged + "", +retagged);
const shifted = function () {};
Object.setPrototypeOf(shifted, {});
console.log(shifted + "", +shifted);
const rebased = new Error("x");
Object.setPrototypeOf(rebased, {});
console.log(rebased + "", +rebased);
console.log(Error.prototype + "");
const arrayedFunction = function () {};
Object.setPrototypeOf(arrayedFunction, [1, 2]);
arrayedFunction.join = 5;
console.log(arrayedFunction + "");
const arrayedError = new Error("x");
Object.setPrototypeOf(arrayedError, [7, 8]);
console.log(arrayedError + "");
`,
  },
  {
    name: "ordinary-objects",
    source: `
const value = { first: 1, ["missing"]: undefined };
console.log(value.first);
value.first = 2;
console.log(value.first);
value.self = value;
console.log(value.self === value);
console.log(value.missing);
console.log(delete value.first);
console.log(value.first);
value[1] = "number";
value[true] = "boolean";
value[null] = "null";
value[undefined] = "undefined";
console.log(value["1"], value.true, value.null, value.undefined);
`,
  },
  {
    name: "values",
    source: `
console.log(undefined, null, true, false);
console.log(-0);
console.log("" + -0, "" + NaN, "" + Infinity, "" + -Infinity);
console.log(0.000001, 0.0000123, 1e-7, 1.23e20);
console.log("" + "");
console.log("escaped\\ntext", "한글", "😀");
`,
  },
  {
    name: "truthiness-and-numeric-conversion",
    source: `
console.log(!undefined, !null, !false, !0, !NaN, !"", !"value");
console.log(-true, "" + -null, -"2", -undefined);
console.log("5" * 2, "9" / 3, false - true);
console.log("0b10" * 1, "0o10" * 1, "0x10" * 1, "　2　" * 1);
console.log("nan" * 1, "0x1p2" * 1, "1junk" * 1);
console.log("Infinity" * 1, "+Infinity" * 1, "-Infinity" * 1);
console.log("+inf" * 1, "-infinity" - 0, "+nan" * 1);
console.log("1\\0junk" * 1);
console.log("0x34964e021e30cde" * 1);
console.log("0o15113116004170606336" * 1);
console.log(
  "0b1101001001011001001110000000100001111000110000110011011110" * 1,
);
`,
  },
  {
    name: "object-literals",
    source: `
const empty = {};
console.log(Object.keys(empty).length);

const single = { item: 1 };
console.log(single.item);

const multiple = { first: 1, second: 2, third: 3 };
console.log(multiple.first, multiple.second, multiple.third);

const localValue = 5;
const shorthandFromLocal = { localValue };
console.log(shorthandFromLocal.localValue);

function withParameterShorthand(paramValue) {
  return { paramValue };
}
console.log(withParameterShorthand(9).paramValue);

const receiver = {
  base: 10,
  method(extra) { return this.base + extra; },
};
console.log(receiver.method(2));
console.log(receiver.method.name);
console.log("prototype" in receiver.method);
try {
  new receiver.method();
  console.log("constructed");
} catch (error) {
  console.log("construct rejected", error instanceof TypeError);
}

const nested = {
  inner: { deep: { value: 42 } },
  list: [{ item: 1 }, { item: 2 }],
};
console.log(
  nested.inner.deep.value,
  nested.list[0].item,
  nested.list[1].item,
);

let order = "";
function track(label, value) { order = order + label; return value; }
const ordered = {
  a: track("a", 1),
  b: track("b", 2),
  c: track("c", 3),
};
console.log(order, ordered.a, ordered.b, ordered.c);

function boom() { throw new RangeError("boom"); }
let sideEffects = "";
try {
  const abrupt = {
    before: (sideEffects = sideEffects + "before", 1),
    failing: boom(),
    after: (sideEffects = sideEffects + "after", 2),
  };
  console.log("unreachable");
} catch (error) {
  console.log("abrupt", error instanceof RangeError, sideEffects);
}

function allocateChain(depth) {
  let current = { depth: depth, next: null };
  for (let i = 0; i < depth; i = i + 1) {
    current = { depth: i, next: current, extra: { marker: i } };
  }
  return current;
}
const chain = allocateChain(20);
let steps = 0;
let cursor = chain;
while (cursor !== null) {
  steps = steps + 1;
  cursor = cursor.next;
}
console.log(steps, chain.depth, chain.extra.marker);
`,
  },
];
