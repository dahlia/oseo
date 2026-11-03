import { b } from "./b.mjs";
export let a = "a pending";
console.log("a start", b);
await 0;
a = "a ready";
console.log("a done");
