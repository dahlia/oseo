import "./poison.mjs";
import { data as indirect } from "./cycle.mjs";
import first from "./data.json" with { type: "json" };
import { default as second } from "././data.json" with { type: "json" };
import * as namespace from "./data.json" with { type: "json" };

console.log("identity", first === second, first === indirect);
console.log("namespace", namespace.default === first);
console.log("keys", Object.keys(namespace).join(","));
console.log("values", first.answer, first.values.join("/"));
console.log("data key", Object.hasOwn(first, "__proto__"));
console.log("prototype", Object.getPrototypeOf(first) === Object.prototype);
console.log("negative zero", Object.is(first.zero, -0));
console.log("extensible", Object.isExtensible(first));
console.log("array extensible", Object.isExtensible(first.values));
/** @param {number} left @param {number} right */
function hinted(left, right) {
  return left + right;
}
console.log("hint", hinted(first.answer, 1), hinted("x", 1));
function read(value) {
  return value.answer;
}
console.log("read", read(first));
first.extra = 1;
console.log("shape miss", read(first));
first.values.push(2);
console.log("shared mutation", second.values[4], indirect.extra);
