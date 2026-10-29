// This dependency evaluates before entry.mjs, so it observes the cycle's
// namespace while every entry binding except the hoisted var is
// uninitialized.
import * as entry from "./entry.mjs";

const attempt = (operation) => {
  try {
    return `ok ${JSON.stringify(operation())}`;
  } catch (error) {
    return error.constructor.name;
  }
};

export const early = [
  attempt(() => Object.keys(entry)),
  attempt(() => Object.hasOwn(entry, "hoisted")),
  attempt(() => Object.hasOwn(entry, "local")),
  attempt(() => Reflect.ownKeys(entry).length),
].join(" ");
