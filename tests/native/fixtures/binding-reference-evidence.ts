import type { Fixture } from "../fixture.ts";

/** Static witnesses for DS-18; no source text is evaluated at runtime. */
export const bindingReferenceEvidenceFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "binding-reference-arrows-and-this",
    nonStrictScript: true,
    source: `
function captureThis() { return () => this; }
function nestedCaptureThis() { return () => (() => this)(); }
console.log("bare", captureThis()() === this,
  nestedCaptureThis()() === this);
const receiver = { captureThis, nestedCaptureThis };
console.log("member", receiver.captureThis()() === receiver,
  receiver.nestedCaptureThis()() === receiver);
var a;
function captureVariable() { a = 10; return () => a; }
const read = captureVariable();
console.log("capture", read());
a = 12;
console.log("update", read());
var b;
function strictCaptureVariable() {
  "use strict";
  b = 10;
  return () => b;
}
const strictRead = strictCaptureVariable();
console.log("strict capture", strictRead());
b = 12;
console.log("strict update", strictRead());
function ReturnThis() { return this; }
function SetThis() { this.THIS = this; }
function StrictSetThis() { "use strict"; this.THIS = this; }
const instance = new SetThis();
const strictInstance = new StrictSetThis();
console.log("call", ReturnThis() === this);
console.log("construct", instance.THIS === instance,
  instance.THIS.toString());
console.log("strict construct", strictInstance.THIS === strictInstance,
  strictInstance.THIS.toString());
`,
  },
  {
    name: "binding-reference-class-fields",
    source: `
let executed = false;
const C = class {
  #x = (executed = true, new.target);
  read() { return this.#x; }
};
const c = new C();
console.log("private", executed, c.x === undefined,
  c.read() === undefined, Object.hasOwn(c, "x"));
const order = [];
const S = class {
  static f = (order.push("f"), "test");
  static g = (order.push("g"), this.f + "262");
  static h = (order.push("h"), this.g + "test");
};
console.log("static", S.f, S.g, S.h, order.join());
`,
  },
  {
    globalScriptReference: true,
    name: "binding-reference-unresolvable-compound",
    nonStrictScript: true,
    source: `
let rhsCount = 0;
function rhs() { rhsCount += 1; return 1; }
function check(label, operation) {
  try { operation(); console.log(label, "missing-error"); }
  catch (error) {
    console.log(label, error instanceof ReferenceError, rhsCount);
  }
}
// Script references resolve against the global Object Environment Record.
// No declaration creates these names; failure must be catchable at runtime.
check("*=", () => { ds18Missing *= rhs(); });
check("/=", () => { ds18Missing /= rhs(); });
check("+=", () => { ds18Missing += rhs(); });
check("-=", () => { ds18Missing -= rhs(); });
check("<<=", () => { ds18Missing <<= rhs(); });
check(">>>=", () => { ds18Missing >>>= rhs(); });
check("&=", () => { ds18Missing &= rhs(); });
check("^=", () => { ds18Missing ^= rhs(); });
check("|=", () => { ds18Missing |= rhs(); });
function strictChecks() {
  "use strict";
  check("strict *=", () => { ds18Missing *= rhs(); });
  check("strict /=", () => { ds18Missing /= rhs(); });
  check("strict +=", () => { ds18Missing += rhs(); });
  check("strict -=", () => { ds18Missing -= rhs(); });
  check("strict <<=", () => { ds18Missing <<= rhs(); });
  check("strict >>>=", () => { ds18Missing >>>= rhs(); });
  check("strict &=", () => { ds18Missing &= rhs(); });
  check("strict ^=", () => { ds18Missing ^= rhs(); });
  check("strict |=", () => { ds18Missing |= rhs(); });
}
strictChecks();
console.log("absent", Object.hasOwn(globalThis, "ds18Missing"));
`,
  },
];
