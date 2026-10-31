import type { Fixture } from "../fixture.ts";

// Observe values before console rendering can erase their types. The negative
// controls exercise the same oracle in the compiled program under forced GC.
const valueOracle = `
function sameValue(actual, expected) {
  if (!Object.is(actual, expected)) throw new Error("DS-18 value mismatch");
}
let rejectedMutations = 0;
for (const pair of [
  [1, "1"], [42, "42"], [10, "10"],
  [undefined, "undefined"], [true, "true"],
]) {
  try { sameValue(pair[0], pair[1]); }
  catch (error) {
    if (!(error instanceof Error)) throw error;
    rejectedMutations += 1;
  }
}
if (rejectedMutations !== 5) throw new Error("DS-18 mutation accepted");
`;

/** Static witnesses for DS-18; no source text is evaluated at runtime. */
export const bindingReferenceEvidenceFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "binding-reference-arrows-and-this",
    nonStrictScript: true,
    source: `
${valueOracle}
function captureThis() { return () => this; }
function nestedCaptureThis() { return () => (() => this)(); }
sameValue(captureThis()(), this);
sameValue(nestedCaptureThis()(), this);
console.log("bare", captureThis()() === this,
  nestedCaptureThis()() === this);
const receiver = { captureThis, nestedCaptureThis };
sameValue(receiver.captureThis()(), receiver);
sameValue(receiver.nestedCaptureThis()(), receiver);
console.log("member", receiver.captureThis()() === receiver,
  receiver.nestedCaptureThis()() === receiver);
var a;
function captureVariable() { a = 10; return () => a; }
const read = captureVariable();
sameValue(read(), 10);
console.log("capture", read());
a = 12;
sameValue(read(), 12);
console.log("update", read());
var b;
function strictCaptureVariable() {
  "use strict";
  b = 10;
  return () => b;
}
const strictRead = strictCaptureVariable();
sameValue(strictRead(), 10);
console.log("strict capture", strictRead());
b = 12;
sameValue(strictRead(), 12);
console.log("strict update", strictRead());
function ReturnThis() { return this; }
function SetThis() { this.THIS = this; }
function StrictSetThis() { "use strict"; this.THIS = this; }
const instance = new SetThis();
const strictInstance = new StrictSetThis();
sameValue(ReturnThis(), this);
sameValue(instance.THIS, instance);
sameValue(instance.THIS.toString(), "[object Object]");
sameValue(strictInstance.THIS, strictInstance);
sameValue(strictInstance.THIS.toString(), "[object Object]");
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
${valueOracle}
let executed = false;
const C = class {
  #x = (executed = true, new.target);
  read() { return this.#x; }
};
const c = new C();
sameValue(executed, true);
sameValue(c.x, undefined);
sameValue(c.read(), undefined);
sameValue(Object.hasOwn(c, "x"), false);
console.log("private", executed, c.x === undefined,
  c.read() === undefined, Object.hasOwn(c, "x"));
const order = [];
const S = class {
  static f = (order.push("f"), "test");
  static g = (order.push("g"), this.f + "262");
  static h = (order.push("h"), this.g + "test");
};
sameValue(S.f, "test");
sameValue(S.g, "test262");
sameValue(S.h, "test262test");
sameValue(order.join(), "f,g,h");
console.log("static", S.f, S.g, S.h, order.join());
`,
  },
  {
    globalScriptReference: true,
    name: "binding-reference-unresolvable-compound",
    nonStrictScript: true,
    source: `
${valueOracle}
let rhsCount = 0;
function rhs() { rhsCount += 1; return 1; }
function check(label, operation) {
  let threw = false;
  try { operation(); }
  catch (error) {
    sameValue(error.constructor, ReferenceError);
    sameValue(rhsCount, 0);
    threw = true;
    console.log(label, error instanceof ReferenceError, rhsCount);
  }
  sameValue(threw, true);
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
sameValue(Object.hasOwn(globalThis, "ds18Missing"), false);
console.log("absent", Object.hasOwn(globalThis, "ds18Missing"));
`,
  },
];
