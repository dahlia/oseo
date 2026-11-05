import type { Fixture } from "../fixture.ts";

/*
 * RegExp.prototype.compile of Annex B's Additional Properties of the
 * RegExp.prototype Object, run by tests/annexb-syntax-native.test.ts.
 *
 * The fixture prints rather than asserts, so the reference hosts decide
 * every value: the property descriptor, the receiver and argument checks,
 * conversion order and abrupt completions, in-place reinitialization of a
 * literal, a constructed, and a subclass instance, the `lastIndex` reset
 * and its failure on a non-writable property, recompilation from inside
 * @@split, and the Annex B pattern grammar reached through `compile`.
 */
const compileSource = `
function show(pattern, input) {
  var match = pattern.exec(input);
  return match === null ? "null" : JSON.stringify(match[0]) + "@" + match.index;
}
function state(pattern) {
  var source = JSON.stringify(pattern.source);
  return [source, pattern.flags, pattern.lastIndex].join(" ");
}
var descriptor = Object.getOwnPropertyDescriptor(RegExp.prototype, "compile");
console.log(
  "descriptor",
  typeof descriptor.value,
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
  descriptor.value.name,
  descriptor.value.length,
  Object.getPrototypeOf(descriptor.value) === Function.prototype,
  Object.hasOwn(descriptor.value, "prototype"),
);
try {
  new RegExp.prototype.compile("a");
} catch (error) {
  console.log("construct", error instanceof TypeError);
}
var receivers = [undefined, null, 1, "a", {}, RegExp.prototype, Symbol("s")];
for (var index = 0; index < receivers.length; index += 1) {
  try {
    RegExp.prototype.compile.call(receivers[index], "a");
    console.log("receiver", index, "accepted");
  } catch (error) {
    console.log("receiver", index, error instanceof TypeError);
  }
}

var literal = /a/g;
literal.lastIndex = 3;
console.log("returns", literal.compile("b+", "i") === literal, state(literal));
console.log("exec", show(literal, "xBBb"));
console.log(
  "undefined",
  state(literal.compile()),
  state(literal.compile(undefined, undefined)),
);
literal.compile(/c\\k/y);
console.log(
  "regexp",
  state(literal),
  show(literal, "ck"),
  show(literal, "xck"),
);
try {
  literal.compile(/x/, "g");
} catch (error) {
  console.log("regexp with flags", error instanceof TypeError, state(literal));
}
try {
  literal.compile(/x/, null);
} catch (error) {
  console.log("regexp with null", error instanceof TypeError, state(literal));
}
var sticky = /q/;
sticky.compile(literal);
console.log("copied", state(sticky), sticky !== literal);

var order = [];
var pattern = { toString: function () { order.push("pattern"); return "p+"; } };
var flags = { toString: function () { order.push("flags"); return "g"; } };
var converted = /x/;
converted.compile(pattern, flags);
console.log("order", order.join(","), state(converted));
order = [];
try {
  converted.compile(
    {
      toString: function () {
        order.push("pattern");
        throw new RangeError("p");
      },
    },
    flags,
  );
} catch (error) {
  console.log(
    "pattern abrupt",
    error instanceof RangeError,
    order.join(","),
    state(converted),
  );
}
try {
  converted.compile("y", {
    toString: function () {
      throw new EvalError("f");
    },
  });
} catch (error) {
  console.log("flags abrupt", error instanceof EvalError, state(converted));
}
var invalid = [
  ["(", ""], ["a", "gg"], ["a", "z"], ["a", "uv"], ["\\\\a", "u"], ["{1}", ""],
];
for (var index = 0; index < invalid.length; index += 1) {
  try {
    converted.compile(invalid[index][0], invalid[index][1]);
    console.log("invalid", index, "accepted");
  } catch (error) {
    console.log(
      "invalid",
      index,
      error instanceof SyntaxError,
      state(converted),
    );
  }
}

var frozenIndex = /initial/;
Object.defineProperty(frozenIndex, "lastIndex", { value: 45, writable: false });
try {
  frozenIndex.compile(/updated/gi);
} catch (error) {
  console.log(
    "non-writable",
    error instanceof TypeError,
    String(frozenIndex),
    frozenIndex.lastIndex,
  );
}
var frozen = Object.freeze(/f/);
try {
  frozen.compile("g");
} catch (error) {
  console.log("frozen", error instanceof TypeError, String(frozen));
}

class Sub extends RegExp {}
var sub = new Sub("a", "g");
sub.compile("b", "m");
console.log("subclass", sub instanceof Sub, state(sub), show(sub, "ab"));

function fresh() {
  return /z/;
}
var first = fresh();
first.compile("y");
var second = fresh();
console.log("literal identity", state(first), state(second), show(second, "z"));

var annexB = /x/;
annexB.compile("\\\\c\\\\x{\\\\8");
console.log("annex b", state(annexB), show(annexB, "\\\\cx{8"));

var splitter = /a/;
Object.defineProperty(splitter, Symbol.match, {
  get: function () {
    splitter.compile("b");
  },
});
console.log("split match", JSON.stringify(splitter[Symbol.split]("abba")));
var limited = /a/;
console.log(
  "split limit",
  JSON.stringify(limited[Symbol.split]("abba", {
    valueOf: function () {
      limited.compile("b");
      return -1;
    },
  })),
);
var indexed = /a/g;
indexed.lastIndex = {
  valueOf: function () {
    indexed.compile("b");
    return 0;
  },
};
console.log("exec recompiles", show(indexed, "ab"), state(indexed));
var ordered = /(?:)/;
ordered.compile("(?:)", "imsuyg");
console.log("flags order", ordered.flags);

// One reader sees two shapes: a RegExp first and a plain object last, so
// the specialized read misses its guard and takes the generic path.
function sourceOf(value) {
  return value.source;
}
var readers = [first, sub, { source: "plain" }];
var read = [];
for (var index = 0; index < readers.length; index += 1) {
  read.push(sourceOf(readers[index]));
}
console.log("guard", JSON.stringify(read));
`;

export const annexBRegExpCompileFixtures: readonly Fixture[] = [
  { name: "annexb-regexp-compile", source: compileSource },
];
