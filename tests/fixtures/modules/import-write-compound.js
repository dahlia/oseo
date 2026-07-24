// eslint-disable-next-line no-unused-vars -- The assignment is the observation.
import { value } from "./import-write-value.js";

try {
  // eslint-disable-next-line no-import-assign -- Compound writes stay immutable.
  value += 1;
} catch (error) {
  console.log(error.name);
}
