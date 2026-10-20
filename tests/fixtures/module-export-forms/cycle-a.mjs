import { readEarly, records } from "./cycle-b.mjs";

export var early = 1,
  empty,
  { destructured } = { destructured: "pattern" };
export let lexical = 2;
var hidden = 3;
export function peek() {
  return hidden;
}
export function bump() {
  early += 1;
}
records.push(`after ${readEarly()}`);
