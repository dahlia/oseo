import "./var-order.js";
import * as values from "./values.js";
import AnonymousDefault from "./default-class-anonymous.js";
import DefaultNameMethod from "./default-class-name-method.js";
import NamedDefault from "./default-class-named.js";
import defaultFunction from "./cycle-a.js";
import defaultExpression from "./default-expression.js";
import "./default-order.js";
import "./identity.js";
import "./%69dentity.js";

const keys = Object.keys(values);
console.log(keys[0], keys[1], values.answer);
values.increment();
console.log(values.answer);
const answerDescriptor = Object.getOwnPropertyDescriptor(values, "answer");
console.log(
  answerDescriptor.writable,
  answerDescriptor.enumerable,
  answerDescriptor.configurable,
);
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
console.log(defaultExpression.name);
console.log(
  "named default import",
  NamedDefault.name,
  new NamedDefault(43).read(),
  NamedDefault.self(),
);
console.log(
  "anonymous default import",
  AnonymousDefault.name,
  new AnonymousDefault(44).read(),
);
console.log("anonymous name method", DefaultNameMethod.name());
