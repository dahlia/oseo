import * as values from "./values.js";
import defaultFunction from "./cycle-a.js";
import "./default-order.js";
import "./identity.js";
import "./%69dentity.js";

const keys = Object.keys(values);
console.log(keys[0], keys[1], values.answer);
values.increment();
console.log(values.answer);
try {
  // eslint-disable-next-line no-import-assign -- Mutation must fail.
  Object.defineProperty(values, "answer", { value: 0 });
  // eslint-disable-next-line no-unused-vars -- Catch is the observation.
} catch (error) {
  console.log("immutable");
}
try {
  // eslint-disable-next-line no-import-assign -- Mutation must fail.
  values.extra = 2;
  // eslint-disable-next-line no-unused-vars -- Catch is the observation.
} catch (error) {
  console.log("nonextensible");
}
// eslint-disable-next-line no-import-assign -- The namespace stays unchanged.
console.log(Object.setPrototypeOf(values, null) === values);
console.log(defaultFunction.name);
