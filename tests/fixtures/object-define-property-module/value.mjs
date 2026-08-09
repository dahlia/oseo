export let configurable = false;
export let enumerable = false;
export let value = 1;
export let writable = false;

export function updateDescriptor() {
  configurable = true;
  enumerable = true;
  value = 17;
  writable = true;
}
