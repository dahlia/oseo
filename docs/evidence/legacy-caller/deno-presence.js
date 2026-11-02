// Checks whether Deno exposes the legacy `caller` and `arguments` own
// properties: `deno run deno-presence.js`. The output is the checked-in
// deno-presence.txt next to this file.
function plain() {}
function reads() {
  try {
    return String(reads.caller);
  } catch (error) {
    return `throws ${error.constructor.name}`;
  }
}
function calls() {
  return reads();
}
const accessor = Object.getOwnPropertyDescriptor(Function.prototype, "caller");
console.log(`Deno ${Deno.version.deno}, V8 ${Deno.version.v8}`);
console.log(`own keys\t${Reflect.ownKeys(plain).join(",")}`);
console.log(`caller read while active\t${calls()}`);
console.log(`prototype getter is the setter\t${accessor.get === accessor.set}`);
