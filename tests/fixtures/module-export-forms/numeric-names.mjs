// Integer-like and empty export names, reached through both a local
// export and export * as. The namespace lists them in the code-unit order
// of its [[Exports]] list, not in the ascending index order an ordinary
// object gives array-index keys.
export let value = 1;
export function increment() {
  value += 1;
}
export { value as "2", value as "4294967294", value as "01" };
export * as "10" from "./values.mjs";
export * as "" from "./values.mjs";
export * as "4294967295" from "./values.mjs";
