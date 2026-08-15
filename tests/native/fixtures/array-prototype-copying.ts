import type { Fixture } from "../fixture.ts";

export const arrayPrototypeCopyingFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "array-prototype-copying",
    source: `
const names = [
  "concat",
  "flat",
  "flatMap",
  "join",
  "slice",
  "toLocaleString",
  "toString",
];
for (const name of names) {
  const method = Array.prototype[name];
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, name);
  console.log(
    "metadata",
    name,
    method.name,
    method.length,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
  );
  try { new method(); } catch (error) {
    console.log("not constructor", name, error instanceof TypeError);
  }
}

const sparse = [1, , 3, null, undefined];
const sliced = sparse.slice(-4, 4);
console.log(
  "slice sparse",
  sliced.length,
  Object.prototype.hasOwnProperty.call(sliced, "0"),
  Object.prototype.hasOwnProperty.call(sliced, "1"),
  sliced[1],
  sliced[2],
);
const generic = { 0: "a", 2: "c", length: 3 };
const genericSlice = Array.prototype.slice.call(generic, 0, 3);
console.log(
  "slice generic",
  genericSlice.length,
  genericSlice[0],
  Object.prototype.hasOwnProperty.call(genericSlice, "1"),
  genericSlice[2],
);

let speciesSource;
function Species(length) {
  console.log("species construct", length);
  this.requestedLength = length;
  if (speciesSource) delete speciesSource[1];
}
const speciesHolder = {};
Object.defineProperty(speciesHolder, Symbol.species, {
  get() { console.log("species read"); return Species; },
});
for (const method of ["concat", "flat", "flatMap", "slice"]) {
  speciesSource = [1, 2, [3]];
  Object.defineProperty(speciesSource, "constructor", {
    get() { console.log("constructor read", method); return speciesHolder; },
  });
  const result = method === "concat"
    ? speciesSource.concat([4])
    : method === "flat"
    ? speciesSource.flat()
    : method === "flatMap"
    ? speciesSource.flatMap((value) => [value])
    : speciesSource.slice(0, 3);
  console.log(
    "species result",
    method,
    result instanceof Species,
    result.requestedLength,
    result.length,
    result[0],
    Object.prototype.hasOwnProperty.call(result, "1"),
  );
}
speciesSource = undefined;

for (const speciesKind of ["missing", "undefined", "null"]) {
  const source = [1, , 3];
  const holder = {};
  if (speciesKind !== "missing") {
    Object.defineProperty(holder, Symbol.species, {
      value: speciesKind === "undefined" ? undefined : null,
    });
  }
  source.constructor = holder;
  const result = source.slice();
  console.log(
    "species fallback",
    speciesKind,
    Array.isArray(result),
    result.length,
    Object.prototype.hasOwnProperty.call(result, "1"),
  );
}
const defaultSpecies = [1, 2];
defaultSpecies.constructor = Array;
console.log("species default", Array.isArray(defaultSpecies.flat()));
const undefinedConstructor = [1, 2];
undefinedConstructor.constructor = undefined;
console.log(
  "species undefined constructor",
  Array.isArray(undefinedConstructor.slice()),
);

const genericSpeciesSkip = { 0: "generic", length: 1 };
Object.defineProperty(genericSpeciesSkip, "constructor", {
  get() { throw new TypeError("generic constructor"); },
});
console.log(
  "species generic skip",
  Array.prototype.slice.call(genericSpeciesSkip)[0],
);

const invalidConstructor = [1];
invalidConstructor.constructor = 1;
try { invalidConstructor.slice(); } catch (error) {
  console.log("species invalid constructor", error instanceof TypeError);
}
const invalidSpecies = [1];
invalidSpecies.constructor = { [Symbol.species]: {} };
try { invalidSpecies.slice(); } catch (error) {
  console.log("species invalid species", error instanceof TypeError);
}
function ThrowingSpecies() { throw new TypeError("construct"); }
const abruptSpeciesConstruct = [1];
abruptSpeciesConstruct.constructor = {
  [Symbol.species]: ThrowingSpecies,
};
try { abruptSpeciesConstruct.slice(); } catch (error) {
  console.log("species abrupt construct", error instanceof TypeError);
}
const abruptConstructor = [1];
Object.defineProperty(abruptConstructor, "constructor", {
  get() { throw new TypeError("constructor"); },
});
try { abruptConstructor.slice(); } catch (error) {
  console.log("species abrupt constructor", error instanceof TypeError);
}
const abruptSpecies = [1];
abruptSpecies.constructor = {};
Object.defineProperty(abruptSpecies.constructor, Symbol.species, {
  get() { throw new TypeError("species"); },
});
try { abruptSpecies.slice(); } catch (error) {
  console.log("species abrupt species", error instanceof TypeError);
}

const spreadable = { 0: "x", 2: "z", length: 3 };
Object.defineProperty(spreadable, Symbol.isConcatSpreadable, {
  get() { console.log("spreadable read"); return true; },
});
const notSpread = ["kept"];
notSpread[Symbol.isConcatSpreadable] = false;
const concatenated = ["start"].concat(spreadable, notSpread);
console.log(
  "concat spread",
  concatenated.length,
  concatenated[0],
  concatenated[1],
  Object.prototype.hasOwnProperty.call(concatenated, "2"),
  concatenated[3],
  concatenated[4] === notSpread,
);

const separator = {
  toString() { console.log("separator coercion"); return "|"; },
};
console.log("join", sparse.join(separator));
const unusedSeparator = {
  toString() { console.log("unused separator coercion"); return "unused"; },
};
console.log("empty join", [].join(unusedSeparator));
console.log("nested join", [1, [2, 3], 4].join(";"));
const cyclic = [1];
cyclic.push(cyclic, 2);
console.log("cyclic join", cyclic.join("-"));
const customCyclic = [];
customCyclic[0] = customCyclic;
customCyclic.toString = function () { return "custom cycle"; };
console.log("custom cyclic join", customCyclic.join("-"));
const customJoin = [1, 2];
customJoin.join = function () { console.log("custom join"); return "custom"; };
console.log("toString custom", customJoin.toString());
customJoin.join = 1;
console.log("toString fallback", customJoin.toString());
const intrinsicJoin = Array.prototype.join;
delete Array.prototype.join;
const explicitMissingJoin = [1, 2].toString();
const implicitMissingJoin = String([1, 2]);
const taggedMissingJoin = [1, 2];
taggedMissingJoin[Symbol.toStringTag] = "Tagged";
const explicitTaggedMissingJoin = taggedMissingJoin.toString();
const implicitTaggedMissingJoin = String(taggedMissingJoin);
Array.prototype.join = intrinsicJoin;
console.log("toString missing join", explicitMissingJoin, implicitMissingJoin);
console.log(
  "toString tagged missing join",
  explicitTaggedMissingJoin,
  implicitTaggedMissingJoin,
);
const objectToStringArray = [1, 2];
objectToStringArray.toString = Object.prototype.toString;
console.log(
  "toString shadow",
  objectToStringArray.toString(),
  String(objectToStringArray),
);

const localeElement = {
  toLocaleString(locales, options) {
    console.log("locale call", locales, options && options.style);
    return {
      toString() { console.log("locale coercion"); return "localized"; },
    };
  },
};
console.log("locale", [localeElement, null, localeElement].toLocaleString());

const nested = [1, , [2, , [3]], 4];
console.log("flat zero", nested.flat(0).join("/"));
console.log("flat one", nested.flat().join("/"));
console.log("flat deep", nested.flat(Infinity).join("/"));
const marker = { marker: true };
const mapped = [1, , 3].flatMap(function (value, index, object) {
  console.log("flatMap call", value, index, object.length, this === marker);
  return index === 0 ? [value, value + 1] : { 0: value, length: 1 };
}, marker);
console.log(
  "flatMap result",
  mapped.length,
  mapped[0],
  mapped[1],
  mapped[2][0],
);

const flatCycle = [];
flatCycle[0] = flatCycle;
try { flatCycle.flat(Infinity); } catch (error) {
  console.log("flat cycle", error instanceof RangeError);
}

for (const method of ["concat", "flat", "flatMap", "join", "slice"]) {
  const source = { length: 1 };
  Object.defineProperty(source, "0", {
    get() { throw new TypeError(method); },
  });
  if (method === "concat") source[Symbol.isConcatSpreadable] = true;
  try {
    if (method === "flatMap") {
      Array.prototype.flatMap.call(source, (value) => value);
    } else {
      Array.prototype[method].call(source);
    }
  } catch (error) {
    console.log("abrupt", method, error instanceof TypeError);
  }
}
try { [1].flatMap(null); } catch (error) {
  console.log("abrupt flatMap callback", error instanceof TypeError);
}
try { [1].flatMap(() => { throw new TypeError("callback"); }); } catch (error) {
  console.log("abrupt flatMap call", error instanceof TypeError);
}
const throwingSpreadable = [];
Object.defineProperty(throwingSpreadable, Symbol.isConcatSpreadable, {
  get() { throw new TypeError("spreadable"); },
});
try { [].concat(throwingSpreadable); } catch (error) {
  console.log("abrupt spreadable", error instanceof TypeError);
}
const throwingDepth = {
  valueOf() { throw new TypeError("depth"); },
};
try { [1].flat(throwingDepth); } catch (error) {
  console.log("abrupt depth", error instanceof TypeError);
}
const throwingSeparator = {
  toString() { throw new TypeError("separator"); },
};
try { [1].join(throwingSeparator); } catch (error) {
  console.log("abrupt separator", error instanceof TypeError);
}
const throwingStart = {
  valueOf() { throw new TypeError("start"); },
};
try { [1].slice(throwingStart); } catch (error) {
  console.log("abrupt start", error instanceof TypeError);
}
const throwingLocale = {
  toLocaleString() { throw new TypeError("locale"); },
};
try { [throwingLocale].toLocaleString(); } catch (error) {
  console.log("abrupt locale", error instanceof TypeError);
}
const throwingLocaleCoercion = {
  toLocaleString() {
    return { toString() { throw new TypeError("locale coercion"); } };
  },
};
try { [throwingLocaleCoercion].toLocaleString(); } catch (error) {
  console.log("abrupt locale coercion", error instanceof TypeError);
}
const throwingToString = [];
Object.defineProperty(throwingToString, "join", {
  get() { throw new TypeError("join"); },
});
try { throwingToString.toString(); } catch (error) {
  console.log("abrupt toString", error instanceof TypeError);
}
const throwingJoinCall = [];
throwingJoinCall.join = function () { throw new TypeError("join call"); };
try { throwingJoinCall.toString(); } catch (error) {
  console.log("abrupt toString call", error instanceof TypeError);
}

const collected = [{ value: 1 }, [{ value: 2 }]];
const collectedFlat = collected.flat(Infinity);
const collectedConcat = collectedFlat.concat({ value: 3 });
console.log(
  "collected",
  collectedFlat[0].value,
  collectedFlat[1].value,
  collectedConcat[2].value,
);

/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
let turn = 0;
while (turn < 3) {
  console.log("guard", hinted("guard"));
  if (turn === 1) String.prototype.arrayCopyingMarker = 1;
  turn = turn + 1;
}
`,
  },
];
