import {
  dependencyMeta,
  earlyEntryMeta,
  readDependencyMeta,
} from "./dependency.mjs";

// Only host-independent observations are printed: the property set of
// import.meta is host-defined, so Node.js and Deno add keys Oseo omits.
export function entryMeta() {
  return import.meta;
}
const meta = import.meta;
console.log("object", typeof meta, meta !== null);
console.log("prototype", Object.getPrototypeOf(meta) === null);
console.log("extensible", Object.isExtensible(meta));
console.log(
  "same",
  meta === import.meta,
  (() => import.meta)() === meta,
  (function read() {
    return import.meta;
  })() === meta,
  entryMeta() === meta,
);
class Reader {
  static field = import.meta;
  read() {
    return import.meta;
  }
}
console.log("class", new Reader().read() === meta, Reader.field === meta);
function* generate() {
  yield import.meta;
}
console.log("generator", generate().next().value === meta);
console.log(
  "modules",
  dependencyMeta !== meta,
  readDependencyMeta() === dependencyMeta,
  earlyEntryMeta === meta,
);
try {
  import.meta();
} catch (error) {
  console.log("call", error instanceof TypeError);
}
try {
  new import.meta();
} catch (error) {
  console.log("construct", error instanceof TypeError);
}
import.meta.added = 1;
console.log(
  "property",
  import.meta.added,
  delete import.meta.added,
  Object.hasOwn(import.meta, "added"),
);
const prototype = { inherited: 2 };
Object.setPrototypeOf(import.meta, prototype);
console.log(
  "set prototype",
  Object.getPrototypeOf(import.meta) === prototype,
  import.meta.inherited,
);
Object.setPrototypeOf(import.meta, null);
console.log("delete", delete import.meta, import.meta === meta);
await Promise.resolve();
console.log("after await", import.meta === meta);
Object.freeze(import.meta);
console.log(
  "frozen",
  Object.isFrozen(import.meta),
  Object.isExtensible(import.meta),
);
