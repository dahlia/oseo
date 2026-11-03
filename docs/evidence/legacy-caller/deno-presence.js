// Checks how Deno exposes the legacy `caller` and `arguments` of
// non-strict functions: `deno run deno-presence.js`. The output is the
// checked-in deno-presence.txt next to this file. `deno run` evaluates
// this file as a module, so the probe builds its functions with
// `new Function` to keep them non-strict.
const probe = new Function(`
function plain() {}
function reads() {
  return [
    reads.caller === calls,
    Array.from(reads.arguments).join(),
    Object.hasOwn(reads, "caller"),
  ].join(",");
}
function calls() {
  return reads(1, 2);
}
function strict() {
  "use strict";
}
function attempt(fn) {
  try {
    return String(fn());
  } catch (error) {
    return "throws " + error.constructor.name;
  }
}
var accessor = Object.getOwnPropertyDescriptor(Function.prototype, "caller");
return [
  ["own keys", Reflect.ownKeys(plain).join(",")],
  ["inactive caller and arguments", plain.caller + "," + plain.arguments],
  ["active caller, arguments, own caller", calls()],
  ["strict function caller", attempt(function () { return strict.caller; })],
  ["prototype getter is the setter", accessor.get === accessor.set],
];
`);
console.log(`Deno ${Deno.version.deno}, V8 ${Deno.version.v8}`);
for (const [label, value] of probe()) console.log(`${label}\t${value}`);
