const IntrinsicPromise = Promise;
const plain = import("./plain.mjs");
console.log(
  "intrinsic promise",
  Object.getPrototypeOf(plain) === IntrinsicPromise.prototype,
  Promise.resolve(plain) === plain,
);
let speciesReads = 0;
globalThis.Promise = function Replacement() {
  throw new Error("replacement constructed");
};
const afterRebinding = import("./plain.mjs");
globalThis.Promise = IntrinsicPromise;
console.log(
  "rebinding ignored",
  Object.getPrototypeOf(afterRebinding) === IntrinsicPromise.prototype,
  afterRebinding !== plain,
);
Object.defineProperty(IntrinsicPromise, Symbol.species, {
  configurable: true,
  get() {
    speciesReads += 1;
    return IntrinsicPromise;
  },
});
const plainNamespace = await plain;
console.log("same namespace", plainNamespace === (await afterRebinding));
console.log("species reads", speciesReads);

const callable = await import("./then-callable.mjs");
console.log("callable then", callable);
const noncallable = await import("./then-noncallable.mjs");
console.log("noncallable then", typeof noncallable, noncallable.then);
const throwing = await import("./then-throwing.mjs").catch((e) => e.message);
console.log("throwing then", throwing);
const rejecting = await import("./then-rejecting.mjs").catch((e) => e);
console.log("rejecting then", rejecting);

/** @param {number} value */
function describe(value) {
  return typeof value;
}
console.log("hints", describe(plainNamespace), describe(1));
