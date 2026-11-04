import * as staticNamespace from "./exports.mjs";
import * as emptyStatic from "./empty.mjs";

const dynamicNamespace = await import("./exports.mjs");
console.log("static and dynamic", dynamicNamespace === staticNamespace);
const again = await import("./exports.mjs");
console.log("repeated", again === dynamicNamespace);
const empty = await import("./empty.mjs");
console.log("export-free", empty === emptyStatic, Object.keys(empty).length);
const lazy = await import("./lazy-only.mjs");
const lazyAgain = await import("./lazy-only.mjs");
console.log(
  "lazy-only",
  lazy === lazyAgain,
  lazy.reexported === staticNamespace,
);
console.log(
  "shape",
  Object.getPrototypeOf(dynamicNamespace) === null,
  Object.isExtensible(dynamicNamespace),
  dynamicNamespace[Symbol.toStringTag],
  Object.keys(dynamicNamespace).join(","),
);
