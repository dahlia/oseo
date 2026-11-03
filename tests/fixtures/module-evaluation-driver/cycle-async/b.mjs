import "./a.mjs";
import "./c.mjs";
export let b = "b pending";
console.log("b start");
await 0;
b = "b ready";
console.log("b done");
