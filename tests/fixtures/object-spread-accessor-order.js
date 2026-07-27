// V8, and therefore both the Node.js and Deno references, enumerates an
// accessor defined after an object literal spread property last instead of in
// property-creation order. ECMA-262 OrdinaryOwnPropertyKeys lists non-index
// string keys in ascending order of property creation regardless of whether a
// key holds a data or an accessor property, so this case has no reference
// observation and the native scenario asserts the specified order directly.
const copiedBase = { base: 1 };
const getterAfterSpread = {
  ...copiedBase,
  get shown() {
    return 2;
  },
  tail: 3,
};
let getterKeys = "";
for (const key of Object.keys(getterAfterSpread)) {
  getterKeys = getterKeys + key + ",";
}
console.log(getterKeys);
console.log(
  getterAfterSpread.base,
  getterAfterSpread.shown,
  getterAfterSpread.tail,
);

let stored;
const copiedFirst = { first: 1 };
const setterAfterSpread = {
  ...copiedFirst,
  set later(value) {
    stored = value;
  },
  last: 2,
};
let setterKeys = "";
for (const key of Object.keys(setterAfterSpread)) {
  setterKeys = setterKeys + key + ",";
}
console.log(setterKeys);
setterAfterSpread.later = 9;
console.log(stored, setterAfterSpread.later);

const nullishSource = null;
const afterNullishSpread = {
  ...nullishSource,
  get shown() {
    return 4;
  },
  tail: 5,
};
let nullishKeys = "";
for (const key of Object.keys(afterNullishSpread)) {
  nullishKeys = nullishKeys + key + ",";
}
console.log(nullishKeys);

// An accessor defined before a spread keeps the same creation order, which
// both references do agree with.
const copiedLater = { copied: 7 };
const spreadAfterGetter = {
  get shown() {
    return 6;
  },
  ...copiedLater,
  tail: 8,
};
let orderedKeys = "";
for (const key of Object.keys(spreadAfterGetter)) {
  orderedKeys = orderedKeys + key + ",";
}
console.log(orderedKeys);
