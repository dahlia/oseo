import { data } from "./publication-async-entry.mjs";
console.log("linked", typeof data);
await Promise.resolve();
console.log("resumed", typeof data, data.answer);
