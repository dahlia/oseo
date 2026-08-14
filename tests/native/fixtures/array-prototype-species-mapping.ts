import type { Fixture } from "../fixture.ts";

export const arrayPrototypeSpeciesMappingFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "array-prototype-species-mapping",
    source: `
for (const name of ["filter", "map"]) {
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
  try { new method(() => true); } catch (error) {
    console.log("not constructor", name, error instanceof TypeError);
  }
}

const sparse = [1, , 3];
const mapped = sparse.map((value, index, object) => {
  console.log("map callback", value, index, object === sparse);
  return value * 10;
});
console.log(
  "map sparse",
  mapped.length,
  Object.prototype.hasOwnProperty.call(mapped, "0"),
  Object.prototype.hasOwnProperty.call(mapped, "1"),
  Object.prototype.hasOwnProperty.call(mapped, "2"),
  mapped[0],
  mapped[2],
);
const filtered = sparse.filter((value, index, object) => {
  console.log("filter callback", value, index, object === sparse);
  return value > 1;
});
console.log("filter compact", filtered.length, filtered[0]);

function Species(length) {
  console.log("species construct", length, new.target === Species);
  this.requestedLength = length;
}
const holder = {};
Object.defineProperty(holder, Symbol.species, {
  get() { console.log("species read"); return Species; },
});
const customSource = [2, 4, 6];
Object.defineProperty(customSource, "constructor", {
  get() { console.log("constructor read"); return holder; },
});
const customMap = customSource.map((value) => value + 1);
console.log(
  "custom map",
  customMap instanceof Species,
  customMap.requestedLength,
  customMap[0],
  customMap[1],
  customMap[2],
);
const customFilter = customSource.filter((value) => value > 2);
console.log(
  "custom filter",
  customFilter instanceof Species,
  customFilter.requestedLength,
  customFilter[0],
  customFilter[1],
);

for (const species of [null, undefined]) {
  const source = [5];
  source.constructor = { [Symbol.species]: species };
  const result = source.map((value) => value);
  console.log("default species", String(species), Array.isArray(result));
}

const generic = {
  0: 7,
  2: 9,
  length: 3,
  get constructor() {
    console.log("generic constructor read");
    return holder;
  },
};
const genericMap = Array.prototype.map.call(generic, (value) => value * 2);
console.log(
  "generic map",
  Array.isArray(genericMap),
  genericMap.length,
  genericMap[0],
  Object.prototype.hasOwnProperty.call(genericMap, "1"),
  genericMap[2],
);
const genericFilter = Array.prototype.filter.call(
  generic,
  (value) => value > 7,
);
console.log(
  "generic filter",
  Array.isArray(genericFilter),
  genericFilter.length,
  genericFilter[0],
);

for (const name of ["filter", "map"]) {
  const source = [1];
  let constructorRead = false;
  Object.defineProperty(source, "constructor", {
    get() { constructorRead = true; return holder; },
  });
  try { source[name](null); } catch (error) {
    console.log(
      "callable before species",
      name,
      constructorRead,
      error instanceof TypeError,
    );
  }
  for (const invalid of [1, {}, () => {}]) {
    const invalidSource = [1];
    invalidSource.constructor = { [Symbol.species]: invalid };
    try { invalidSource[name](() => true); } catch (error) {
      console.log("invalid species", name, error instanceof TypeError);
    }
  }
}

for (const property of ["constructor", "species"]) {
  const source = [1];
  if (property === "constructor") {
    Object.defineProperty(source, "constructor", {
      get() { throw new TypeError("constructor"); },
    });
  } else {
    const throwing = {};
    Object.defineProperty(throwing, Symbol.species, {
      get() { throw new TypeError("species"); },
    });
    source.constructor = throwing;
  }
  try { source.map((value) => value); } catch (error) {
    console.log("abrupt species read", property, error instanceof TypeError);
  }
}

const changing = [1, 2, 3];
const changed = changing.map((value, index) => {
  if (index === 0) {
    delete changing[1];
    changing[3] = 4;
  }
  return value;
});
console.log(
  "mutation snapshot",
  changed.length,
  changed[0],
  Object.prototype.hasOwnProperty.call(changed, "1"),
  changed[2],
  Object.prototype.hasOwnProperty.call(changed, "3"),
);

const collected = [{ value: 1 }, { value: 2 }, { value: 3 }];
const collectedMap = collected.map((entry) => ({ value: entry.value + 1 }));
const collectedFilter = collected.filter((entry) => entry.value > 1);
console.log(
  "collected",
  collectedMap[0].value,
  collectedMap[2].value,
  collectedFilter[0].value,
  collectedFilter[1].value,
);

/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
const originalCharAt = String.prototype.charAt;
let turn = 0;
while (turn < 2) {
  console.log("guard", hinted("guard"));
  if (turn === 0) String.prototype.speciesMappingMarker = 1;
  turn = turn + 1;
}
console.log("method stable", String.prototype.charAt === originalCharAt);
`,
  },
];
