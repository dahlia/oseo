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
    name: "aggregate-error-and-options",
    source: `
const constructors = [
  Error,
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
];
for (const Constructor of constructors) {
  const cause = { name: Constructor.name };
  const error = new Constructor("message", { cause });
  const descriptor = Object.getOwnPropertyDescriptor(error, "cause");
  console.log(
    Constructor.name,
    error.cause === cause,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
  );
}

let order = "";
const errors = {
  [Symbol.iterator]: function () {
    order = order + "iterator ";
    let index = 0;
    return {
      next: function () {
        order = order + "next ";
        const value = index === 0 ? "first" : { second: true };
        const done = index > 1;
        index = index + 1;
        return {
          done,
          get value() {
            order = order + "value ";
            return value;
          },
        };
      },
    };
  },
};
const message = {
  toString: function () {
    order = order + "message ";
    return "many";
  },
};
const cause = { detail: "root" };
const aggregate = new AggregateError(errors, message, {
  get cause() {
    order = order + "cause ";
    return cause;
  },
});
console.log(
  aggregate instanceof AggregateError,
  aggregate instanceof Error,
  aggregate.name,
  aggregate.message,
  aggregate.cause === cause,
);
console.log(
  aggregate.errors.length,
  aggregate.errors[0],
  aggregate.errors[1].second,
);
console.log(order);
const errorsDescriptor = Object.getOwnPropertyDescriptor(aggregate, "errors");
console.log(
  errorsDescriptor.writable,
  errorsDescriptor.enumerable,
  errorsDescriptor.configurable,
);
console.log(AggregateError.length, AggregateError.name);
console.log(AggregateError.prototype.name);
console.log(AggregateError.prototype.message === "");
console.log(AggregateError.prototype instanceof Error);
console.log(AggregateError.prototype.constructor === AggregateError);
console.log(AggregateError([], "called") instanceof AggregateError);
const empty = new AggregateError([]);
console.log(empty.errors.length, "message" in empty, "cause" in empty);

try {
  new AggregateError([], {
    toString: function () { throw new RangeError("message"); },
  });
} catch (error) {
  console.log("message abrupt", error instanceof RangeError);
}
try {
  new AggregateError({
    [Symbol.iterator]: function () {
      return {
        next: function () { throw new SyntaxError("next"); },
      };
    },
  });
} catch (error) {
  console.log("iterator abrupt", error instanceof SyntaxError);
}
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
const wellKnownNames = [
  "asyncIterator",
  "hasInstance",
  "isConcatSpreadable",
  "iterator",
  "match",
  "matchAll",
  "replace",
  "search",
  "species",
  "split",
  "toPrimitive",
  "toStringTag",
  "unscopables",
];
const wellKnownValues = [];
for (let index = 0; index < wellKnownNames.length; index = index + 1) {
  const name = wellKnownNames[index];
  const value = Symbol[name];
  const descriptor = Object.getOwnPropertyDescriptor(Symbol, name);
  wellKnownValues[index] = value;
  console.log(
    "well-known",
    name,
    typeof value,
    value,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
    value === Symbol[name],
  );
}
let wellKnownDistinct = true;
for (let left = 0; left < wellKnownValues.length; left = left + 1) {
  for (
    let right = left + 1;
    right < wellKnownValues.length;
    right = right + 1
  ) {
    if (wellKnownValues[left] === wellKnownValues[right]) {
      wellKnownDistinct = false;
    }
  }
}
console.log("well-known-distinct", wellKnownDistinct);
function rejectWellKnownMutation() {
  "use strict";
  let assignmentRejected = false;
  let deletionRejected = false;
  try { Symbol.match = Symbol.iterator; } catch (error) {
    assignmentRejected = error instanceof TypeError;
  }
  try { delete Symbol.match; } catch (error) {
    deletionRejected = error instanceof TypeError;
  }
  console.log("well-known-fixed", assignmentRejected, deletionRejected);
}
rejectWellKnownMutation();
const retainedWellKnown = Symbol.hasInstance;
for (let index = 0; index < 32; index = index + 1) {
  Symbol("collection-" + index);
}
console.log("well-known-retained", retainedWellKnown === Symbol.hasInstance);
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
  {
    name: "object-literal-accessors",
    source: `
const getterOnly = { get item() { return 5; } };
console.log(getterOnly.item);

let stored;
const setterOnly = { set item(value) { stored = value; } };
setterOnly.item = 9;
console.log(stored, setterOnly.item);

let backing = 1;
const pair = {
  get item() { return backing; },
  set item(value) { backing = value * 2; },
};
console.log(pair.item);
pair.item = 3;
console.log(pair.item, backing);

const descriptor = Object.getOwnPropertyDescriptor(pair, "item");
console.log(
  typeof descriptor.get,
  typeof descriptor.set,
  descriptor.enumerable,
  descriptor.configurable,
  "value" in descriptor,
  "writable" in descriptor,
);

const getterDescriptor = Object.getOwnPropertyDescriptor(
  getterOnly,
  "item",
);
console.log(typeof getterDescriptor.get, getterDescriptor.set);
const setterDescriptor = Object.getOwnPropertyDescriptor(
  setterOnly,
  "item",
);
console.log(setterDescriptor.get, typeof setterDescriptor.set);

const named = { get item() {}, set other(value) {} };
console.log(
  Object.getOwnPropertyDescriptor(named, "item").get.name,
  Object.getOwnPropertyDescriptor(named, "other").set.name,
  Object.getOwnPropertyDescriptor(named, "item").get.length,
  Object.getOwnPropertyDescriptor(named, "other").set.length,
);
function computeKey() { return "computed"; }
const computedName = {
  get [computeKey()]() {},
  set [computeKey()](value) {},
};
console.log(
  Object.getOwnPropertyDescriptor(computedName, "computed").get.name,
  Object.getOwnPropertyDescriptor(computedName, "computed").set.name,
);

const redefinedToAccessor = { item: 1, get item() { return 2; } };
console.log(redefinedToAccessor.item);
const redefinedToData = { get item() { return 1; }, item: 2 };
console.log(redefinedToData.item);
const redefinedDescriptor = Object.getOwnPropertyDescriptor(
  redefinedToAccessor,
  "item",
);
console.log("value" in redefinedDescriptor, typeof redefinedDescriptor.get);
const dataDescriptor = Object.getOwnPropertyDescriptor(
  redefinedToData,
  "item",
);
console.log("get" in dataDescriptor, dataDescriptor.value);

function strictSetterOnly() {
  "use strict";
  try {
    getterOnly.item = 1;
    console.log("no throw");
  } catch (error) {
    console.log("threw", error instanceof TypeError);
  }
}
strictSetterOnly();
console.log(setterOnly.item);

let getterCalls = 0;
const cachedGetter = { get item() { getterCalls = getterCalls + 1;
  return getterCalls; } };
function readThreeTimes(target) {
  return [target.item, target.item, target.item];
}
const readTimes = readThreeTimes(cachedGetter);
console.log(readTimes[0], readTimes[1], readTimes[2]);

function allocateAccessorChain(depth) {
  let current = { depth: depth, next: null };
  for (let i = 0; i < depth; i = i + 1) {
    const previous = current;
    current = {
      get depth() { return i; },
      get next() { return previous; },
    };
  }
  return current;
}
const accessorChain = allocateAccessorChain(20);
let accessorSteps = 0;
let accessorCursor = accessorChain;
while (accessorCursor !== null) {
  accessorSteps = accessorSteps + 1;
  accessorCursor = accessorCursor.next;
}
console.log(accessorSteps, accessorChain.depth);
`,
  },
  {
    name: "object-literal-prototype-setter",
    source: `
let inheritedStore = 0;
const prototype = {
  inherited: 7,
  set inheritedWrite(value) { inheritedStore = value; },
};
let order = "";
const object = {
  first: (order = order + "F", 1),
  __proto__: (order = order + "P", prototype),
  last: (order = order + "L", 2),
};
console.log(order, object.inherited);
object.inheritedWrite = 9;
console.log(
  inheritedStore,
  Object.getOwnPropertyDescriptor(object, "inheritedWrite"),
);
const objectKeys = Object.keys(object);
console.log(objectKeys[0], objectKeys[1], objectKeys.length);
console.log(Object.getOwnPropertyDescriptor(object, "__proto__"));

const nullPrototype = { __proto__: null };
console.log(
  nullPrototype.missing,
  Object.keys(nullPrototype).length,
  Object.getOwnPropertyDescriptor(nullPrototype, "__proto__"),
);
const primitivePrototypes = [
  { __proto__: undefined },
  { __proto__: 1 },
  { __proto__: false },
  { __proto__: "text" },
  { __proto__: Symbol("value") },
];
for (const primitivePrototype of primitivePrototypes) {
  console.log(
    primitivePrototype.missing,
    Object.keys(primitivePrototype).length,
    Object.getOwnPropertyDescriptor(primitivePrototype, "__proto__"),
  );
}

const anonymousPrototype = { __proto__: function () {} };
console.log(anonymousPrototype.name === "");

const __proto__ = 12;
let ownSetterStore = 0;
const permitted = {
  __proto__: prototype,
  ["__proto__"]: 10,
  __proto__,
  __proto__() { return 13; },
  get __proto__() { return 14; },
  set __proto__(value) { ownSetterStore = value; },
  ...{ ["__proto__"]: 15 },
};
const permittedDescriptor = Object.getOwnPropertyDescriptor(
  permitted,
  "__proto__",
);
console.log(
  permittedDescriptor.value,
  permittedDescriptor.writable,
  permittedDescriptor.enumerable,
  permittedDescriptor.configurable,
  permitted.inherited,
);
const permittedKeys = Object.keys(permitted);
console.log(permittedKeys[0], permittedKeys.length, ownSetterStore);

const methodProperty = { __proto__() { return 16; } };
console.log(
  methodProperty.__proto__(),
  methodProperty.__proto__.name,
  "prototype" in methodProperty.__proto__,
);
let accessorStore = 0;
const accessorProperty = {
  get __proto__() { return accessorStore; },
  set __proto__(value) { accessorStore = value; },
};
accessorProperty.__proto__ = 17;
const accessorDescriptor = Object.getOwnPropertyDescriptor(
  accessorProperty,
  "__proto__",
);
console.log(
  accessorProperty.__proto__,
  accessorDescriptor.get.name,
  accessorDescriptor.set.name,
);

let abruptOrder = "";
function failPrototype() { throw new RangeError("prototype"); }
try {
  const abrupt = {
    before: (abruptOrder = abruptOrder + "B", 1),
    __proto__: (abruptOrder = abruptOrder + "P", failPrototype()),
    after: (abruptOrder = abruptOrder + "A", 2),
  };
  console.log(abrupt);
} catch (error) {
  console.log(error instanceof RangeError, abruptOrder);
}

/**
 * @param {number} left
 * @param {number} right
 */
function hintedAdd(left, right) { return left + right; }
const guardMissPrototype = {
  inherited: hintedAdd("x", 1),
};
const guardMissObject = { __proto__: guardMissPrototype };
console.log(guardMissObject.inherited);

let collected = { inherited: 0 };
for (let index = 0; index < 20; index = index + 1) {
  collected = {
    before: { index },
    __proto__: collected,
    after: { index: index + 1 },
  };
}
console.log(collected.inherited, collected.before.index, collected.after.index);
`,
  },
  {
    name: "object-literal-spread",
    source: `
const empty = { ...{} };
console.log(Object.keys(empty).length);

const base = { first: 1, second: 2 };
const copied = { ...base };
console.log(copied.first, copied.second, copied === base);
console.log(Object.keys(copied).length);

const copiedDescriptor = Object.getOwnPropertyDescriptor(copied, "first");
console.log(
  copiedDescriptor.value,
  copiedDescriptor.writable,
  copiedDescriptor.enumerable,
  copiedDescriptor.configurable,
);

let getterCalls = 0;
const withGetter = {
  get counted() { getterCalls = getterCalls + 1; return getterCalls; },
};
const flattened = { ...withGetter };
console.log(getterCalls, flattened.counted, flattened.counted);
const flattenedDescriptor = Object.getOwnPropertyDescriptor(
  flattened,
  "counted",
);
console.log("value" in flattenedDescriptor, "get" in flattenedDescriptor);

const interleaved = { before: 0, ...base, middle: 3, ...{ last: 4 }, after: 5 };
const interleavedKeys = Object.keys(interleaved);
let interleavedText = "";
for (let index = 0; index < interleavedKeys.length; index = index + 1) {
  const key = interleavedKeys[index];
  interleavedText = interleavedText + key + "=" + interleaved[key] + ";";
}
console.log(interleavedText);

const overwritten = { value: 1, ...{ value: 2 }, ...{ value: 3 } };
console.log(overwritten.value);
const overwrittenLater = { ...{ value: 2 }, value: 1 };
console.log(overwrittenLater.value);

const ordered = { later: 1, ...{ 2: "two", 0: "zero" }, 1: "one" };
const orderedKeys = Object.keys(ordered);
console.log(orderedKeys[0], orderedKeys[1], orderedKeys[2], orderedKeys[3]);

console.log(Object.keys({ ...null, ...undefined }).length);
const nullishWithData = { ...null, kept: 1, ...undefined };
console.log(nullishWithData.kept, Object.keys(nullishWithData).length);

const fromString = { ..."ab" };
console.log(fromString[0], fromString[1], Object.keys(fromString).length);
console.log(Object.keys({ ...5, ...true, ...Symbol("s") }).length);

const fromArray = { ...[7, 8] };
console.log(fromArray[0], fromArray[1], Object.keys(fromArray).length);

function namedFunction(first, second) { return first; }
console.log(Object.keys({ ...namedFunction }).length);

const prototypeSource = Object.create({ inherited: 1 });
prototypeSource.own = 2;
const ownOnly = { ...prototypeSource };
console.log(ownOnly.own, ownOnly.inherited, Object.keys(ownOnly).length);

const partiallyHidden = {};
Object.defineProperty(partiallyHidden, "hidden", {
  value: 1,
  enumerable: false,
});
Object.defineProperty(partiallyHidden, "shown", { value: 2, enumerable: true });
const visibleOnly = { ...partiallyHidden };
console.log(visibleOnly.hidden, visibleOnly.shown);

const marker = Symbol("marker");
const symbolSource = { [marker]: 9, plain: 1 };
const symbolCopy = { ...symbolSource };
console.log(symbolCopy[marker], symbolCopy.plain, Object.keys(symbolCopy)[0]);

let order = "";
function trace(tag, value) { order = order + tag; return value; }
const traced = {
  [trace("k", "computed")]: trace("v", 1),
  ...trace("s", { get read() { return trace("g", 2); } }),
  tail: trace("t", 3),
};
console.log(order, traced.computed, traced.read, traced.tail);

let reachedLater = false;
try {
  const abrupt = {
    kept: 1,
    ...{ get failing() { throw new TypeError("spread source failure"); } },
    later: (reachedLater = true, 2),
  };
  console.log("no throw", abrupt.kept);
} catch (error) {
  console.log("threw", error instanceof TypeError, error.message, reachedLater);
}

function grow(depth) {
  let accumulated = {};
  for (let index = 0; index < depth; index = index + 1) {
    accumulated = { ...accumulated, ["key" + index]: index };
  }
  return accumulated;
}
const grown = grow(24);
console.log(Object.keys(grown).length, grown.key0, grown.key23);
`,
  },
  {
    name: "for-in",
    source: `
function record(label, value) { console.log(label, value); }

let text = "";
for (const key in { a: 1, b: 2 }) { text = text + key; }
record("const-head", text);

text = "";
for (let key in { c: 3, d: 4 }) { text = text + key; }
record("let-head", text);

var reused;
for (reused in { e: 5, f: 6 }) {}
record("assignment-head", reused);

var declared;
for (var declared in { g: 7 }) {}
record("var-head", declared);

const holder = {};
let computedCount = 0;
function nextKey() {
  computedCount = computedCount + 1;
  return "slot" + computedCount;
}
for (holder[nextKey()] in { h: 8, i: 9 }) {}
record("computed-target", computedCount + ":" + holder.slot1 + holder.slot2);
for (holder.direct in { j: 10 }) {}
record("member-target", holder.direct);

class Base {}
class Derived extends Base {
  #slot = "";
  read() { return this.#slot; }
  run(source) {
    for (super.stored in source) {}
    for (this.#slot in source) {}
    return this.stored;
  }
}
const derived = new Derived();
record("super-target", derived.run({ k: 11 }));
record("private-target", derived.read());

let skipped = 0;
for (const key in null) { skipped = skipped + 1; }
for (const key in undefined) { skipped = skipped + 1; }
for (const key in 42) { skipped = skipped + 1; }
for (const key in true) { skipped = skipped + 1; }
for (const key in Symbol("s")) { skipped = skipped + 1; }
record("nullish-and-primitive", skipped);

text = "";
for (const key in "abc") { text = text + key; }
record("string-subject", text);

text = "";
const sparse = [10, 20, 30];
delete sparse[1];
sparse.tag = "extra";
for (const key in sparse) { text = text + key + ","; }
record("array-subject", text);

const readers = [];
let readerCount = 0;
for (let key in { m: 1, n: 2 }) {
  readers[readerCount] = function () { return key; };
  readerCount = readerCount + 1;
}
record("per-iteration-cells", readers[0]() + readers[1]());

text = "";
outer: for (const outerKey in { p: 1, q: 2 }) {
  for (const innerKey in { x: 1, y: 2 }) {
    if (innerKey === "y") continue outer;
    if (outerKey === "q") break outer;
    text = text + outerKey + innerKey + " ";
  }
}
record("labeled-transfers", text);

function earlyReturn(source) {
  try {
    for (const key in source) { return "returned:" + key; }
  } finally {
    console.log("finally-ran");
  }
  return "none";
}
record("abrupt-return", earlyReturn({ r: 1, s: 2 }));

try {
  for (const key in { t: 1 }) { throw new TypeError("thrown:" + key); }
} catch (error) {
  record("abrupt-throw", error.message);
}

try {
  for (const key in { [key]: 1 }) {}
} catch (error) {
  record("head-dead-zone", error instanceof ReferenceError);
}

let empty = 0;
for (const key in {}) { empty = empty + 1; }
record("empty-subject", empty);
`,
  },
  {
    name: "for-in-enumeration",
    source: `
function keysOf(source) {
  let text = "";
  for (const key in source) { text = text + key + " "; }
  return text;
}

const ordered = {};
ordered.zeta = 1;
ordered[2] = 1;
ordered.alpha = 1;
ordered[0] = 1;
ordered[10] = 1;
console.log("canonical-order", keysOf(ordered));

const marker = Symbol("hidden");
const symbolic = { plain: 1 };
symbolic[marker] = 2;
console.log("symbol-excluded", keysOf(symbolic));

const grandparent = { deep: 1, shared: "grandparent" };
const parent = Object.create(grandparent);
parent.middle = 1;
parent.shared = "parent";
const child = Object.create(parent);
child.own = 1;
console.log("prototype-chain", keysOf(child));

const shadowSource = { visible: 1, masked: 2 };
const shadowed = Object.create(shadowSource);
Object.defineProperty(shadowed, "masked", {
  configurable: true,
  enumerable: false,
  value: 3,
  writable: true,
});
console.log("non-enumerable-shadow", keysOf(shadowed));

const nonEnumerableOwn = {};
Object.defineProperty(nonEnumerableOwn, "quiet", {
  configurable: true,
  enumerable: false,
  value: 1,
  writable: true,
});
nonEnumerableOwn.loud = 2;
console.log("non-enumerable-own", keysOf(nonEnumerableOwn));

function afterFirstKey(source, mutate) {
  let text = "";
  let first = true;
  for (const key in source) {
    text = text + key + " ";
    if (first) { first = false; mutate(); }
  }
  return text;
}

const shadowGrand = { delta: 1 };
const shadowParent = Object.create(shadowGrand);
Object.defineProperty(shadowParent, "delta", {
  configurable: true,
  enumerable: false,
  value: 2,
  writable: true,
});
const shadowChild = Object.create(shadowParent);
shadowChild["0"] = 1;
console.log(
  "shadow-deleted-late",
  afterFirstKey(shadowChild, function () { delete shadowParent.delta; }),
);

const lateParent = {};
const lateChild = Object.create(lateParent);
lateChild.a = 1;
console.log(
  "prototype-key-added",
  afterFirstKey(lateChild, function () { lateParent.z = 1; }),
);

const twinParent = { k: "prototype" };
const twinChild = Object.create(twinParent);
twinChild.a = 1;
twinChild.k = "own";
console.log(
  "own-twin-deleted",
  afterFirstKey(twinChild, function () { delete twinChild.k; }),
);

const hiddenParent = { z: 1 };
const hiddenChild = Object.create(hiddenParent);
hiddenChild.a = 1;
console.log(
  "prototype-key-hidden",
  afterFirstKey(hiddenChild, function () {
    Object.defineProperty(hiddenParent, "z", { enumerable: false });
  }),
);

const replaced = Object.create({ first: 1 });
replaced.a = 1;
console.log(
  "prototype-replaced",
  afterFirstKey(replaced, function () {
    Object.setPrototypeOf(replaced, { second: 1 });
  }),
);

const virtualTwin = [1];
virtualTwin.push = 5;
console.log(
  "virtual-intrinsic-uncovered",
  afterFirstKey(virtualTwin, function () { delete virtualTwin.push; }),
);

const deleted = { a: 1, b: 2, c: 3 };
let deletedText = "";
for (const key in deleted) {
  deletedText = deletedText + key;
  delete deleted.b;
  delete deleted.c;
}
console.log("deleted-during", deletedText);

const deletedShadow = Object.create({ moved: "prototype" });
deletedShadow.moved = "own";
deletedShadow.first = 1;
let deletedShadowText = "";
for (const key in deletedShadow) {
  deletedShadowText = deletedShadowText + key + "=" + deletedShadow[key] + " ";
  delete deletedShadow.moved;
}
console.log("deleted-shadow", deletedShadowText);

const grown = { seed: 1 };
let grownCount = 0;
let grownText = "";
for (const key in grown) {
  grownText = grownText + key + " ";
  grownCount = grownCount + 1;
  if (grownCount < 4) { grown["added" + grownCount] = 1; }
}
console.log("added-during", grownText);

const accessors = {
  get computed() { return 1; },
  set computed(value) {},
};
console.log("accessor-keys", keysOf(accessors));

function ordinary() {}
ordinary.attached = 1;
console.log("function-subject", keysOf(ordinary));

class Ancestor {}
Ancestor.inherited = 1;
class Descendant extends Ancestor {}
Descendant.declared = 2;
console.log("class-subject", keysOf(Descendant));
console.log("instance-subject", keysOf(new Descendant()));

const nested = { a: 1, b: 2 };
let nestedText = "";
for (const outerKey in nested) {
  for (const innerKey in nested) {
    nestedText = nestedText + outerKey + innerKey + " ";
  }
}
console.log("independent-records", nestedText);

function* stepper(source) { for (const key in source) { yield key; } }
const iterator = stepper({ u: 1, v: 2 });
console.log(
  "generator-suspension",
  iterator.next().value,
  iterator.next().value,
  iterator.next().done,
);

async function awaited(source) {
  let text = "";
  for (const key in source) { await Promise.resolve(); text = text + key; }
  console.log("async-suspension", text);
}
awaited({ w: 1, x: 2 });

const frozenOrder = Object.create(null);
frozenOrder.only = 1;
console.log("null-prototype", keysOf(frozenOrder));

const bareSymbol = Symbol("mark");
console.log("symbol-clean", keysOf(bareSymbol));
Symbol.prototype.borrowed = 1;
Object.defineProperty(Symbol.prototype, "quiet", {
  configurable: true,
  enumerable: false,
  value: 2,
  writable: true,
});
console.log("symbol-prototype", keysOf(bareSymbol));
console.log("well-known-symbol", keysOf(Symbol.iterator));
console.log("other-primitives", keysOf(1) + keysOf(true) + keysOf(2n));
`,
  },
  {
    // Node.js strips types from a *.ts reference file, and its TypeScript
    // parser rejects a destructuring for-in head that ECMA-262 admits, so
    // this fixture hands both hosts the same source as a global Script
    // instead of writing the head into a typed reference file.
    globalScriptReference: true,
    name: "for-in-object-patterns",
    source: `
function record(label, value) { console.log(label, value); }

const subject = { ab: 1, cd: 2 };

let text = "";
for (const { length: size, 0: head } in subject) {
  text = text + head + size + " ";
}
record("const-head", text);

text = "";
for (let { 1: tail } in subject) { text = text + tail; }
record("let-head", text);

text = "";
for (var { length: varSize } in subject) { text = text + varSize; }
record("var-head", varSize + ":" + text);

let assignedHead = "";
let assignedSize = 0;
text = "";
for ({ 0: assignedHead, length: assignedSize } in subject) {
  text = text + assignedHead + assignedSize + " ";
}
record("assignment-head", text + assignedHead + assignedSize);

let order = "";
function key(name) { order = order + name + ","; return name; }
for (const { [key("0")]: first, [key("length")]: len } in { ef: 1 }) {
  order = order + "body:" + first + len;
}
record("computed-key-order", order);

text = "";
for (
  const { missing: fallback = "D", length: present = "unused" } in { gh: 1 }
) {
  text = text + fallback + present;
}
record("defaults", text);

for (const { 0: skipped, ...rest } in { ij: 1 }) {
  record(
    "rest",
    skipped + " " + Object.keys(rest).length + " " + Object.keys(rest)[0] +
      " " + rest[1] + " " + rest.length,
  );
}

for (const { 0: { length: nestedLength } } in { kl: 1 }) {
  record("nested", nestedLength);
}

const holder = {};
let slotCount = 0;
function nextSlot() { slotCount = slotCount + 1; return "slot" + slotCount; }
for ({ 0: holder.direct, length: holder[nextSlot()] } in { mn: 1, op: 2 }) {}
record(
  "member-targets",
  holder.direct + " " + holder.slot1 + holder.slot2 + " " + slotCount,
);

class Base {}
class Derived extends Base {
  #slot = "";
  read() { return this.#slot; }
  run(source) {
    for ({ 0: super.stored, length: this.#slot } in source) {}
    return this.stored;
  }
}
const derived = new Derived();
record("super-target", derived.run({ qr: 1 }));
record("private-target", derived.read());

let skipped2 = 0;
for (const { length: ignored } in null) { skipped2 = skipped2 + 1; }
for (const { length: ignored } in undefined) { skipped2 = skipped2 + 1; }
for (const { length: ignored } in 7) { skipped2 = skipped2 + 1; }
for (const { length: ignored } in true) { skipped2 = skipped2 + 1; }
record("skipped", skipped2);

text = "";
for (const { length: stringSize } in "ab") { text = text + stringSize; }
record("string-subject", text);

try {
  for (const { missing: { length: unreachable } } in { st: 1 }) {
    record("unreachable", 1);
  }
} catch (error) { record("abrupt-nested", error instanceof TypeError); }

let steps = 0;
function poison() { throw new RangeError("poisoned key"); }
try {
  for (
    const { [(steps = steps + 1, steps === 2 ? poison() : "length")]: n }
    in { uv: 1, wx: 2 }
  ) {}
} catch (error) {
  record("abrupt-key", error instanceof RangeError ? steps : "no");
}

const readers = [];
let count = 0;
for (let { length: captured } in { yz: 1, abc: 2 }) {
  readers[count] = function () { return captured; };
  count = count + 1;
}
record("per-iteration-cells", readers[0]() + "," + readers[1]());

text = "";
outer: for (const { length: outerLength } in { a: 1, bb: 2 }) {
  for (const { length: innerLength } in { c: 1, dd: 2 }) {
    if (innerLength === 2) continue outer;
    text = text + outerLength + innerLength + " ";
  }
  text = text + "|";
}
record("labeled-continue", text);

text = "";
stop: for (const { length: outerLength } in { a: 1, bb: 2 }) {
  for (const { 0: innerHead } in { c: 1, dd: 2 }) {
    if (innerHead === "d") break stop;
    text = text + outerLength + innerHead + " ";
  }
}
record("labeled-break", text);

function earlyReturn(source) {
  try {
    for (const { length: size } in source) { return "returned:" + size; }
  } finally { console.log("finally-ran"); }
  return "none";
}
record("abrupt-return", earlyReturn({ efg: 1 }));

var withProbe = "outer";
with ({ withProbe: "inner" }) {
  for ({ length: withProbe } in { gh: 1 }) {}
  record("with-target", withProbe);
}
record("with-outer", withProbe);

try {
  for (const { length: dead } in { [dead]: 1 }) {}
} catch (error) { record("head-dead-zone", error instanceof ReferenceError); }

function strictTarget() {
  "use strict";
  const frozen = {};
  Object.defineProperty(frozen, "fixed", {
    value: 0,
    writable: false,
    enumerable: true,
    configurable: false,
  });
  try {
    for ({ length: frozen.fixed } in { ij: 1 }) {}
    return "no throw";
  } catch (error) { return "threw:" + (error instanceof TypeError); }
}
record("strict-readonly-target", strictTarget());

function* generate(source) {
  for (const { length: size, 0: head } in source) { yield head + size; }
}
const iterator = generate({ klm: 1, n: 2 });
record(
  "generator",
  iterator.next().value + "," + iterator.next().value + "," +
    iterator.next().done,
);

async function collect(source) {
  let joined = "";
  for (const { length: size } in source) { joined = joined + await size; }
  return joined;
}

async function awaitedHead(source) {
  let joined = "";
  for (const { [await "length"]: size = await "D" } in source) {
    joined = joined + size;
  }
  const box = {};
  for ({ [await "0"]: box[await "slot"] } in source) {}
  return joined + ":" + box.slot;
}

collect({ n: 1, opq: 2 }).then(function (value) { record("async", value); });
awaitedHead({ ab: 1, cde: 2 }).then(function (value) {
  record("awaited-head", value);
});
`,
  },
];
