import { touch } from "./helper.mjs";

console.log("dependency before throw");
try {
  throw "dependency failure";
} finally {
  touch();
}
