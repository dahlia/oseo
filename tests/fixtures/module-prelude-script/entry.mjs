import { bump, seen } from "./dependency.mjs";

const shadowed = "module";
record("entry");
console.log("dependency", JSON.stringify(seen.slice(0, 4)), seen[4]);
console.log("shadowed", shadowed, globalThis.shadowed);
console.log("bump", bump(), globalThis.counter, lexical);
globalThis.counter = 40;
console.log("property write", counter, bump());
console.log("log", log.join(","));
console.log("sloppy", implicitGlobal, sloppyThis, this);
const descriptor = Object.getOwnPropertyDescriptor(globalThis, "record");
console.log("descriptor", descriptor.configurable, descriptor.enumerable);
console.log("lexical property", "lexical" in globalThis, typeof missing);
try {
  fixed = "changed";
} catch (error) {
  console.log("const", error instanceof TypeError, fixed);
}
console.log("retained", retained());
