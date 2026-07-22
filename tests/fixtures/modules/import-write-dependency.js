// eslint-disable-next-line no-unused-vars -- The assignment is the observation.
import { value } from "./import-write-entry.js";

try {
  // eslint-disable-next-line no-import-assign -- The error kind is observed.
  value = 2;
} catch (error) {
  console.log(error.name);
}
