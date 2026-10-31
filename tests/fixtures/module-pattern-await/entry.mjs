const events = [];
const step = (label, value) => {
  events.push(label);
  return Promise.resolve(value);
};
export var { value: exported = await step("export", { value: 7 }) } = {};
const {
  [await step("key", "item")]: [nested = await step("default", 8)],
} = {
  item: [],
};
console.log("bindings", exported.value, nested, events.join(","));
let skipped = 0;
const { value: kept = await ++skipped } = { value: null };
console.log("lazy", kept, skipped);
const target = {};
const source = [9];
const assigned = ([target[await step("target", "item")]] = source);
console.log("assignment", target.item, assigned === source);
({ ...target[await step("rest", "rest")] } = { x: 10 });
console.log("rest", target.rest.x);
try {
  throw { value: undefined };
} catch ({ value = await step("catch", 11) }) {
  console.log("catch", value);
} finally {
  console.log("finally");
}
try {
  try {
    throw [];
  } catch ([value = await Promise.reject("rejected")]) {
    console.log("unreachable", value);
  } finally {
    console.log("reject finally");
  }
} catch (error) {
  console.log("reject", error);
}
const iterator = {
  [Symbol.iterator]() {
    return this;
  },
  next() {
    console.log("next");
    return { done: false };
  },
  return() {
    console.log("close");
    return {};
  },
};
try {
  const [value = await Promise.reject("iterator rejection")] = iterator;
  console.log("unreachable", value);
} catch (error) {
  console.log("iterator", error);
}
let closure;
for (let [value = await step("for", 12)] = []; value < 13; value++) {
  closure = () => value;
}
console.log("for", closure());
for (const { value = await step("of", 13) } of [{}]) {
  console.log("of", value);
}
for (const { [await step("in", "length")]: size } in { ab: 1 }) {
  console.log("in", size);
}
const objectKey = {
  toString() {
    console.log("coerce");
    return "property";
  },
};
const { [await objectKey]: coerced = await 14 } = {};
console.log("coerced", coerced);
let value;
false && ([value = await 99] = []);
const result = true ? ([value = await 15] = []) : null;
console.log("nested", value, result.length);
