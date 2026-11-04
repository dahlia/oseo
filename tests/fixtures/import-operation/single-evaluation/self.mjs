import { bump } from "./counter.mjs";

bump();
console.log("self evaluates");
const again = import("./self.mjs");
console.log("self request is a promise", again instanceof Promise);
export function marker() {}
export const settled = again.then((namespace) => namespace.marker === marker);
