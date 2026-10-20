import { entryMeta } from "./entry.mjs";

// The entry module has not evaluated yet, but its hoisted function
// already reads the entry module's import.meta object.
export const earlyEntryMeta = entryMeta();
export const dependencyMeta = import.meta;
export function readDependencyMeta() {
  return import.meta;
}
console.log(
  "dependency",
  typeof earlyEntryMeta,
  Object.getPrototypeOf(earlyEntryMeta) === null,
  dependencyMeta !== earlyEntryMeta,
);
