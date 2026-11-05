import { count } from "./counter.mjs";

const first = import("./once.mjs");
const second = import("./once.mjs");
console.log("distinct promises", first !== second);
const [a, b] = await Promise.all([first, second]);
console.log("concurrent namespace", a === b, a.value);
const c = await import("./once.mjs");
const d = await import("./once.mjs");
console.log("serialized namespace", c === a && d === a);
console.log("evaluations", count());
const self = await import("./self.mjs");
console.log("self request", await self.settled, count());
