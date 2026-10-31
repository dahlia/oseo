import type { Fixture } from "../fixture.ts";

/** Static witnesses for DS-22; no program evaluates source text. */
export const ds22BoundaryCoreFixtures: readonly Fixture[] = [
  ...(["block", "case", "default"] as const).map((kind): Fixture => {
    const declaration = "function ds22Local() { return 17; }";
    const statement =
      kind === "block"
        ? `{ ${declaration} console.log("inside", ds22Local()); }`
        : `switch (1) { ${kind === "case" ? "case 1:" : "default:"}
            ${declaration} console.log("inside", ds22Local()); }`;
    return {
      name: `ds22-strict-${kind}-scope`,
      globalScriptReference: true,
      source: `
"use strict";
${statement}
try { ds22Local; console.log("leaked"); }
catch (error) { console.log("outside", error.constructor === ReferenceError); }
console.log("global", Object.hasOwn(globalThis, "ds22Local"));
function strictContainer() {
  ${statement}
  try { ds22Local; console.log("leaked"); }
  catch (error) {
    console.log("function outside", error.constructor === ReferenceError);
  }
}
strictContainer();
`,
    };
  }),
  {
    name: "ds22-strict-caller-read",
    globalScriptReference: true,
    nonStrictScript: true,
    source: `
function strictReader() { "use strict"; return strictReader.caller; }
function wrapper() { return strictReader(); }
function strictWrapper() { "use strict"; return strictReader(); }
for (var read of [strictReader, wrapper, strictWrapper]) {
  try { read(); console.log("exposed"); }
  catch (error) { console.log("strict read", error.constructor === TypeError); }
}
console.log("strict own", Object.hasOwn(strictReader, "caller"));
`,
  },
  {
    name: "ds22-sloppy-caller-read",
    globalScriptReference: true,
    nonStrictScript: true,
    source: `
function sloppyReader() {
  return sloppyReader.caller || sloppyReader.caller.throwTypeError;
}
function strictCaller() { "use strict"; return sloppyReader(); }
function sloppyWrapper() { return strictCaller(); }
for (var call of [strictCaller, sloppyWrapper]) {
  try { call(); console.log("exposed"); }
  catch (error) { console.log("sloppy read", error.constructor === TypeError); }
}
`,
  },
  {
    name: "ds22-caller-accessors",
    globalScriptReference: true,
    source: `
"use strict";
var descriptor = Object.getOwnPropertyDescriptor(Function.prototype, "caller");
console.log("descriptor", typeof descriptor.get, typeof descriptor.set,
  descriptor.enumerable, descriptor.configurable);
function strictFunction() {}
console.log("own", Object.hasOwn(strictFunction, "caller"));
for (var operation of [
  function () { return strictFunction.caller; },
  function () { strictFunction.caller = 3; },
  function () { return descriptor.get.call(strictFunction); },
  function () { return descriptor.set.call(strictFunction, 3); }
]) {
  try { operation(); console.log("exposed"); }
  catch (error) { console.log("restricted", error.constructor === TypeError); }
}
`,
  },
];

/** Fixed observations from lexical scope and restricted-property rules. */
export function ds22BoundaryCoreExpected(name: string): string {
  if (name.startsWith("ds22-strict-") && name.endsWith("-scope")) {
    return (
      "inside 17\noutside true\nglobal false\n" +
      "inside 17\nfunction outside true\n"
    );
  }
  if (name === "ds22-strict-caller-read") {
    return "strict read true\n".repeat(3) + "strict own false\n";
  }
  if (name === "ds22-sloppy-caller-read") {
    return "sloppy read true\nsloppy read true\n";
  }
  if (name === "ds22-caller-accessors") {
    return (
      "descriptor function function false true\nown false\n" +
      "restricted true\n".repeat(4)
    );
  }
  throw new Error(`Unknown DS-22 fixture: ${name}`);
}
