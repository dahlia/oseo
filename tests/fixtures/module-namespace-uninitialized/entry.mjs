// A module namespace's [[GetOwnProperty]] reads an export through [[Get]]
// (ECMA-262 10.4.6.5), so every operation that asks for an own descriptor
// throws a ReferenceError while the export's binding is uninitialized.
// [[HasProperty]], [[OwnPropertyKeys]], and [[Delete]] read no binding.
// The same probes run again once every binding is initialized.
import * as self from "./entry.mjs";
import * as other from "./later.mjs";

const probe = (label, operation) => {
  let outcome;
  try {
    const value = operation();
    outcome = `ok ${JSON.stringify(value)}`;
  } catch (error) {
    outcome =
      error instanceof ReferenceError
        ? "ReferenceError"
        : `${error.constructor.name}`;
  }
  console.log(label, outcome);
};

const enumerate = (object) => {
  const keys = [];
  for (const key in object) keys.push(key);
  return keys;
};

const run = (phase) => {
  console.log("phase", phase);
  probe("hasOwnProperty", () =>
    Object.prototype.hasOwnProperty.call(self, "local"),
  );
  probe("hasOwn renamed", () => Object.hasOwn(self, "renamed"));
  probe("hasOwn indirect", () => Object.hasOwn(self, "indirect"));
  probe("hasOwn default", () => Object.hasOwn(self, "default"));
  probe("hasOwn hoisted", () => Object.hasOwn(self, "hoisted"));
  probe("hasOwn missing", () => Object.hasOwn(self, "missing"));
  probe("hasOwn tag", () => Object.hasOwn(self, Symbol.toStringTag));
  probe("propertyIsEnumerable", () =>
    Object.prototype.propertyIsEnumerable.call(self, "default"),
  );
  probe("descriptor", () => Object.getOwnPropertyDescriptor(self, "local"));
  probe("descriptor hoisted", () =>
    Object.getOwnPropertyDescriptor(self, "hoisted"),
  );
  probe("descriptors", () => Object.getOwnPropertyDescriptors(self));
  probe("keys", () => Object.keys(self));
  probe("values", () => Object.values(self));
  probe("entries", () => Object.entries(self));
  probe("for-in", () => enumerate(self));
  probe("for-in inherited", () => enumerate(Object.create(self)));
  probe("assign", () => Object.assign({}, self));
  probe("spread", () => ({ ...self }));
  probe("JSON", () => JSON.stringify(self));
  probe("isSealed", () => Object.isSealed(self));
  probe("isFrozen", () => Object.isFrozen(self));
  probe("defineProperty", () => Reflect.defineProperty(self, "local", {}));
  probe("defineProperties", () => Object.defineProperties({}, self));
  probe("create", () => Object.create(null, self));
  probe("proxy descriptor", () =>
    Reflect.getOwnPropertyDescriptor(new Proxy(self, {}), "local"),
  );
  probe("proxy keys", () => Object.keys(new Proxy(self, {})));
  probe(
    "proxy ownKeys trap",
    () =>
      Reflect.ownKeys(
        new Proxy(self, {
          ownKeys: (target) => Reflect.ownKeys(target),
        }),
      ).length,
  );
  probe("proxy get trap", () => new Proxy(self, { get: () => "trap" }).local);
  probe("iterator constructor setter", () =>
    Object.getOwnPropertyDescriptor(Iterator.prototype, "constructor").set.call(
      self,
      1,
    ),
  );
  probe("in", () => "local" in self);
  probe("ownKeys", () => Reflect.ownKeys(self).length);
  probe("delete", () => Reflect.deleteProperty(self, "local"));
  probe("other keys", () => Object.keys(other));
  console.log("cycle", other.early);
};

run("before");
export let local = 1;
const hidden = 2;
export { hidden as renamed };
export { local as indirect } from "./entry.mjs";
export var hoisted = 3;
let constructorBinding = 4;
export { constructorBinding as constructor };
export default 5;
run("after");
