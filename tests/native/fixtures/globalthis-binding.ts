import type { Fixture } from "../fixture.ts";

export const globalThisBindingFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "globalthis-binding",
    nonStrictScript: true,
    source: `
const realm = this;
const selfDescriptor = Object.getOwnPropertyDescriptor(realm, "globalThis");
console.log(
  "identity",
  typeof globalThis,
  globalThis === realm,
  globalThis.globalThis === globalThis,
  "globalThis" in globalThis,
  (function () { return this; })() === globalThis,
);
console.log(
  "descriptor",
  selfDescriptor.value === realm,
  selfDescriptor.writable,
  selfDescriptor.enumerable,
  selfDescriptor.configurable,
);
console.log("known global", globalThis.Object === Object, globalThis.NaN);
console.log("typeof absent", typeof lateGlobal, delete lateGlobal);
try { lateGlobal; } catch (error) {
  console.log("absent read", error instanceof ReferenceError);
}
try { lateGlobal += 1; } catch (error) {
  console.log("absent compound", error instanceof ReferenceError);
}
try { lateGlobal++; } catch (error) {
  console.log("absent update", error instanceof ReferenceError);
}
function strictAbsentWrite() { "use strict"; lateGlobal = 1; }
try { strictAbsentWrite(); } catch (error) {
  console.log("absent strict write", error instanceof ReferenceError);
}
console.log("still absent", "lateGlobal" in globalThis);
globalThis.lateGlobal = 1;
console.log("created", lateGlobal, typeof lateGlobal);
lateGlobal += 2;
lateGlobal++;
strictAbsentWrite();
console.log("writes", globalThis.lateGlobal, lateGlobal);
const lateDescriptor = Object.getOwnPropertyDescriptor(realm, "lateGlobal");
console.log(
  "created descriptor",
  lateDescriptor.writable,
  lateDescriptor.enumerable,
  lateDescriptor.configurable,
);
console.log("delete created", delete lateGlobal, typeof lateGlobal);
function sloppyWrite() { implicitGlobal = "implicit"; }
sloppyWrite();
const implicitDescriptor = Object.getOwnPropertyDescriptor(
  realm,
  "implicitGlobal",
);
console.log(
  "implicit",
  implicitGlobal,
  globalThis.implicitGlobal,
  implicitDescriptor.writable,
  implicitDescriptor.enumerable,
  implicitDescriptor.configurable,
);
Object.defineProperty(realm, "fixedGlobal", {
  configurable: false,
  value: 7,
  writable: false,
});
fixedGlobal = 8;
function strictFixedWrite() { "use strict"; fixedGlobal = 9; }
try { strictFixedWrite(); } catch (error) {
  console.log("fixed strict write", error instanceof TypeError);
}
console.log("fixed", fixedGlobal, delete fixedGlobal, typeof fixedGlobal);
let getterReads = 0;
Object.defineProperty(realm, "accessorGlobal", {
  configurable: true,
  get() { getterReads = getterReads + 1; return getterReads; },
});
console.log("accessor", accessorGlobal, accessorGlobal, typeof accessorGlobal);
const inherited = Object.getPrototypeOf(realm);
if (inherited !== null) {
  inherited.inheritedGlobal = "inherited";
  console.log("inherited", inheritedGlobal, typeof inheritedGlobal);
  delete inherited.inheritedGlobal;
}
const scope = { shadowed: "object" };
with (scope) {
  withCreated = "global";
  shadowed = "object write";
}
console.log(
  "with",
  scope.shadowed,
  withCreated,
  Object.prototype.hasOwnProperty.call(scope, "withCreated"),
);
with (scope) {
  withCreated += " compound";
  withCreated;
}
console.log("with compound", withCreated);
globalThis.withCounter = 1;
globalThis.withLogical = "";
with (scope) {
  withCounter++;
  ++withCounter;
  withCounter ??= 10;
  withLogical ||= "logical";
}
console.log("with update", withCounter, withLogical);
with (scope) {
  try { withAbsent; } catch (error) {
    console.log("with absent read", error instanceof ReferenceError);
  }
  try { withAbsent += 1; } catch (error) {
    console.log("with absent compound", error instanceof ReferenceError);
  }
  try { withAbsent++; } catch (error) {
    console.log("with absent update", error instanceof ReferenceError);
  }
  console.log("with absent typeof", typeof withAbsent);
}
console.log("with absent kept", "withAbsent" in globalThis);
const saved = globalThis;
globalThis = "replaced";
console.log("replace", globalThis, realm.globalThis);
delete globalThis;
console.log("delete self", typeof globalThis, "globalThis" in realm);
try { globalThis; } catch (error) {
  console.log("deleted self read", error instanceof ReferenceError);
}
realm.globalThis = saved;
console.log("restore self", globalThis === realm);
const realmPrototype = Object.getPrototypeOf(realm);
const trapLog = [];
Object.setPrototypeOf(realm, new Proxy(realmPrototype, {
  has(target, key) {
    if (key === "ghostGlobal") {
      trapLog.push("has");
      return false;
    }
    return Reflect.has(target, key);
  },
  get(target, key, receiver) {
    if (key === "ghostGlobal") {
      trapLog.push("get");
      return 1;
    }
    return Reflect.get(target, key, receiver);
  },
}));
console.log("proxy typeof", typeof ghostGlobal, trapLog.join(","));
Object.setPrototypeOf(realm, realmPrototype);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 2), hinted("1", 2));
let turn = 0;
const probe = { value: 1 };
while (turn < 2) {
  console.log("guard", probe.value, globalThis.lateGlobal);
  if (turn === 0) probe.marker = 1;
  turn = turn + 1;
}
delete implicitGlobal;
delete withCreated;
delete withCounter;
delete withLogical;
delete accessorGlobal;
`,
  },
];
