import { bState } from "./cycle-b.mjs";

export let aState = "a pending";
console.log("cycle a start");
await Promise.resolve();
aState = "a ready";
console.log("cycle a done", bState);
