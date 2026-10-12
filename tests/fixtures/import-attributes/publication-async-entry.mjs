import "./publication-async-observer.mjs";
export { default as data } from "./data.json" with { type: "json" };
import data from "./data.json" with { type: "json" };
console.log("evaluated", typeof data, data.answer);
